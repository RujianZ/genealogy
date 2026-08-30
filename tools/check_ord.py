"""
排行当分辨器，在**真同名案例**上准不准？

之前测 93.45%，用的是那批有偏样本（1033/1034 父名唯一），**测的不是它要干的活**。
正确的标注集：多个同名候选，谱自己（生子名单）点了其中一个 —— 616 例。

判据：谱上写「幼子」，他就该排在父亲生子名单的**末位**；
      写「次子」就该排第 2。位置对不上，那个候选就不成立。

坑（上一版栽过的）：名单里混着女儿（「次适程」）和杂串（「公殁于」「养子一」），
所以数位置之前**先把非人名的项剔掉**。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")
ORD = {"长": 1, "元": 1, "次": 2, "三": 3, "四": 4, "五": 5,
       "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
# 名单里混进来的杂物：女儿（适X）、被吃进去的句子、量词
JUNK = re.compile(r"(适|公殁|妣|殁于|生于|葬|养子|嗣子|继子|季子|生子|女[一二三四五六七八九]|"
                  r"^[一二三四五六七八九十]$)")


def clean(sons):
    return [NS(s) for s in (sons or []) if NS(s) and not JUNK.search(NS(s))]


def rank_of(fil: str):
    f = NS(fil)
    if not f:
        return None
    if f.startswith("幼"):
        return -1                      # 末位
    return ORD.get(f[0])


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    test = []
    for p in people:
        for kind in {e["kind"] for e in p["parent_edges"]}:
            es = [e for e in p["parent_edges"] if e["kind"] == kind]
            if len(es) < 2:
                continue
            named = [e for e in es if e["evidence"] == "claim_named"]
            if len(named) == 1:
                test.append((p, named[0], es))
    print(f"标注集：{len(test)} 例（多个同名候选，谱自己点了其中一个）\n")

    hit = miss = cannot = 0
    bad = []
    for p, truth, es in test:
        r = rank_of(p["filiation"])
        if r is None:
            cannot += 1; continue
        fits = []
        for e in es:
            f = idx.get(e["parent"])
            sons = clean(f.get("sons_claimed") if f else [])
            if NS(p["name"]) not in sons:
                continue                       # 名单里根本没他，谈不上排行
            pos = sons.index(NS(p["name"])) + 1
            want = len(sons) if r == -1 else r
            if pos == want:
                fits.append(e)
        if len(fits) != 1:
            cannot += 1; continue
        if fits[0]["parent"] == truth["parent"]:
            hit += 1
        else:
            miss += 1
            if len(bad) < 6:
                bad.append((p, truth, fits[0], es))

    tot = hit + miss
    print(f"   排行能指出唯一一个的：{tot} 例（另 {cannot} 例指不出）")
    if tot:
        print(f"   **指对 {hit}／{tot} = {hit/tot*100:.2f}%**\n")
    for p, truth, got, es in bad:
        print(f"   ✘ {p['name']}（{p['src_human']}）谱上写「{p['filiation']}」")
        print(f"       谱点名的：{truth['parent_name']}"
              f"　名单 {clean(idx[truth['parent']]['sons_claimed'])}")
        print(f"       排行指的：{got['parent_name']}"
              f"　名单 {clean(idx[got['parent']]['sons_claimed'])}")

    # 拿去分那 68 条
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    hard = [x for x in D["分不清"] if not x["settled"]]
    r2 = Counter()
    ex = []
    for x in hard:
        p = idx[x["pid"]]
        r = rank_of(p["filiation"])
        if r is None:
            r2["谱上没写排行"] += 1; continue
        fits = []
        for k in x["cands"]:
            f = idx[k["pid"]]
            sons = clean(f.get("sons_claimed"))
            if NS(p["name"]) not in sons:
                continue
            pos = sons.index(NS(p["name"])) + 1
            if pos == (len(sons) if r == -1 else r):
                fits.append(k)
        if len(fits) == 1:
            r2["**排行只对上一个**　← 能定"] += 1
            if len(ex) < 6:
                ex.append((p, fits[0], x["cands"]))
        elif fits:
            r2[f"{len(fits)} 个都对得上"] += 1
        else:
            r2["一个也对不上（名单里没他 / 位置都不符）"] += 1
    print(f"\n\n拿去分那 {len(hard)} 条真说不出的：")
    for k, v in r2.most_common():
        print(f"   {v:>4}　{k}")
    print()
    for p, win, cands in ex:
        print(f"   {p['name']}（第{p['gen']}世 {p['src_human']}）谱上写「{p['filiation']}」")
        for k in cands:
            f = idx[k["pid"]]
            sons = clean(f.get("sons_claimed"))
            pos = sons.index(NS(p["name"])) + 1 if NS(p["name"]) in sons else "—"
            mark = "✔" if k["pid"] == win["pid"] else "✘"
            print(f"     {mark} {k['name']}　名单 {sons}　本人排第 {pos}")
        print()


if __name__ == "__main__":
    main()
