"""
把事迹里**明写的亲属关系**抽成一份数据，喂回建边。

    立**铣华**四子**泽霖**为嗣      → 泽霖 是 铣华 的第 4 子
    **长子光覆**出嗣亲兄**梁成**    → 光覆 是说话人的第 1 子；嗣父是梁成
    次子**泽翼**出嗣长兄**铣宽**    → 泽翼 是说话人的第 2 子；嗣父是铣宽

这些跟「生子三：…」是同一份东西——**谱自己写的亲属关系**，
只是写在句子里，上游建边时没读句子。

★ 每条都记下：**原句、出处、说话人**。可信 = 可核。
★ 名字 2/3 字都试，且必须在谱里对得上（含繁简折叠）。
★ 世次必须差 1。对不上就不出这条。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

_V = json.loads(Path("data/variants.json").read_text(encoding="utf-8"))
fold = lambda s: "".join(_V.get(c, c) for c in (s or ""))
NS = lambda s: fold("".join((s or "").split()).replace("　", ""))

O = "长次三四五六七八九幼元"
ORD = {"长": 1, "元": 1, "次": 2, "三": 3, "四": 4, "五": 5,
       "六": 6, "七": 7, "八": 8, "九": 9, "幼": -1}


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    prose = json.loads(Path("data/prose_ents.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    by_name = defaultdict(list)
    for p in people:
        for f in {NS(p["name"])} | {NS(a["form"]) for a in p["aliases"]}:
            if len(f) >= 2:
                by_name[f].append(p)

    def find(raw: str, gen: int | None):
        """名字 2/3 字都试，限定世次。返回谱里对得上的人。"""
        for n in (3, 2):
            if len(raw) >= n:
                got = [q for q in by_name.get(raw[:n], [])
                       if gen is None or q["gen"] == gen]
                if got:
                    return raw[:n], got
        return None, []

    # 「立X（公）N子Y为嗣」——X 是 Y 的生父，Y 排行 N，嗣父是说话人
    RE_IN = re.compile(rf"立([一-鿿]{{2,4}})公?([{O}])子([一-鿿]{{2,4}})[为承]嗣")
    # 「N子Y出嗣[称谓]Z」——说话人是 Y 的生父，Y 排行 N，嗣父是 Z
    RE_OUT = re.compile(rf"([{O}])子([一-鿿]{{2,4}})出[嗣继]"
                        rf"([一-鿿]{{0,3}}?)([一-鿿]{{2,4}})")

    out, stat = [], Counter()
    for x in prose:
        t = NS(x["text"])
        spk = idx[x["host"]]

        for m in RE_IN.finditer(t):
            fa_raw, ordc, son_raw = m.group(1), m.group(2), m.group(3)
            son_n, sons = find(son_raw, spk["gen"] + 1)
            fa_n, fas = find(fa_raw, spk["gen"])
            if not sons or not fas:
                stat["立X某子Y为嗣：人对不上"] += 1; continue
            out.append({
                "son_name": son_n, "sons": [q["pid"] for q in sons],
                "ord": ORD.get(ordc), "ord_cn": ordc,
                "birth_father": fa_n, "birth_fathers": [q["pid"] for q in fas],
                "heir_father": spk["name"], "heir_father_pid": spk["pid"],
                "sentence": t[max(0, m.start() - 4):m.end() + 4],
                "src_human": x["src_human"], "passage": x["id"],
                "form": "嗣父那边写的",
            })
            stat["**立X某子Y为嗣：抽出**"] += 1

        for m in RE_OUT.finditer(t):
            ordc, son_raw, rel, to_raw = m.groups()
            son_n, sons = find(son_raw, spk["gen"] + 1)
            to_n, tos = find(to_raw, spk["gen"])
            if not sons:
                stat["某子Y出嗣Z：儿子对不上"] += 1; continue
            out.append({
                "son_name": son_n, "sons": [q["pid"] for q in sons],
                "ord": ORD.get(ordc), "ord_cn": ordc,
                "birth_father": spk["name"], "birth_fathers": [spk["pid"]],
                "heir_father": to_n, "heir_father_pid": None,
                "heir_fathers": [q["pid"] for q in tos],
                "heir_rel": rel,
                "sentence": t[max(0, m.start() - 4):m.end() + 4],
                "src_human": x["src_human"], "passage": x["id"],
                "form": "生父那边写的",
            })
            stat["**某子Y出嗣Z：抽出**"] += 1

    Path("data/stated.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"抽出 **{len(out)} 条**谱明写的亲属关系 → data/stated.json\n")
    for k, v in stat.most_common():
        print(f"   {v:>4}　{k}")

    # 这些说法里，有多少是**唯一**指认（儿子和父亲在谱里都只有一个人对得上）
    sure = [r for r in out if len(r["sons"]) == 1 and len(r["birth_fathers"]) == 1]
    print(f"\n其中儿子和生父在谱里都唯一的：**{len(sure)} 条** ← 能直接当依据用")

    # 看它跟现有的边一致不一致
    ok = miss = clash = 0
    bad = []
    for r in sure:
        son = idx[r["sons"][0]]
        fa = r["birth_fathers"][0]
        has = {e["parent"] for e in son["parent_edges"]}
        if fa in has:
            ok += 1
        elif has:
            clash += 1
            if len(bad) < 6:
                bad.append((son, fa, r))
        else:
            miss += 1
            if len(bad) < 6:
                bad.append((son, fa, r))
    print(f"\n拿去跟现有的父边比：")
    print(f"   一致　　　　　　　　{ok}")
    print(f"   谱说了、边里没有　　{miss}")
    print(f"   边指向别人　　　　　{clash}")
    for son, fa, r in bad:
        print(f"\n   {son['name']}（第{son['gen']}世 {son['src_human']}）")
        print(f"     谱上另一处写：「{r['sentence']}」（{r['src_human']}）")
        print(f"     该指向：{idx[fa]['name']}（{idx[fa]['src_human']}）")
        print(f"     现有的边：" + ("　".join(
            f"{e['parent_name']}[{e['kind']}]" for e in son["parent_edges"]) or "（一条也没有）"))


if __name__ == "__main__":
    main()
