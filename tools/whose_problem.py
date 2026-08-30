"""
把疑点按「**这是谁的问题**」重新分。

之前分成五类，混了两件根本不同的事：

  谱自己没写      —— **不是问题**。那就是谱的记录。
                     历代序：「纪其所可知，**阙其所未知**」。
                     谱没意见，我们也没意见，照样空着。

  谱写了我读不出   —— **我们的问题**，该修。

  谱写了但两个都对得上 —— **真·分不清**。这才是唯一需要人去认的。

这个分法直接决定界面上怎么说话：
第一类不该叫「疑点」，该叫「谱上就是这么记的」。
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, "tools")
from check_homonym_years import year_of  # noqa: E402

NS = lambda s: "".join((s or "").split()).replace("　", "")
# 谱自己写下的「这里没有记录」——这是**编谱人的明确表述**，不是缺失
SAID_NONE = ("缺", "未详", "失考", "无考", "不详", "未考", "无记", "阙")


def main() -> None:
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    # ══════ 一、46 个「没写父名」：谱到底说了没有 ══════
    print("══ 46 个「没写父名」——谱到底说了没有？ ══\n")
    c = Counter()
    ex: dict = {}
    for x in D["C没写父名"]:
        p = idx[x["pid"]]
        fs = NS(p["father_src"])
        raw = NS(p["raw_text"])
        if fs:
            k = "页眉写了，只是没连上　← **我们的问题**"
        elif any(w in raw for w in SAID_NONE):
            k = "谱自己写了「缺／未详」　← **谱的记录，不是问题**"
        elif len(raw) < 14:
            k = "整条就几个字，谱上本来就只留了名字"
        else:
            k = "有正常一条，但通篇没提父亲"
        c[k] += 1
        ex.setdefault(k, []).append(p)
    for k, v in c.most_common():
        print(f"   {v:>4}　{k}")
        for p in ex[k][:2]:
            print(f"          {p['name']} 第{p['gen']}世 {p['src_human']}"
                  f"　father_src={p['father_src']!r}")
            print(f"            原文：{NS(p['raw_text'])[:56]}")

    # ══════ 二、27 个「生年查不出」：谱说了没有 ══════
    print("\n\n══ 27 个「生年查不出」——谱说了没有？ ══\n")
    c2 = Counter()
    ex2: dict = {}
    for x in D["D生年查不出"]:
        t = NS(x["birth"])
        if any(w in t for w in SAID_NONE):
            k = "**谱自己写了「缺／未详」**　← 谱的记录，不是问题"
        elif re.fullmatch(r"[一-鿿]{0,4}年?", t):
            k = "**谱上留了空**（只写「X年」没填）　← 谱的记录"
        else:
            k = "谱写全了，是我查不到　← **我们的问题**"
        c2[k] += 1
        ex2.setdefault(k, []).append(x)
    for k, v in c2.most_common():
        print(f"   {v:>4}　{k}")
        for x in ex2[k][:4]:
            print(f"          {x['name']} 第{x['gen']}世　生「{NS(x['birth'])[:26]}」"
                  + (f"　（{x['window']}）" if x.get("window") else ""))

    # ══════ 三、8 个「往上断了」 ══════
    print("\n\n══ 8 个「往上断了」——谱写了父名，但谱里没这个人 ══\n")
    for x in D["B往上断了"]:
        p = idx[x["pid"]]
        print(f"   {p['name']} 第{p['gen']}世 {p['src_human']}")
        print(f"     谱上写父名「{x['father_name']}」{x['filiation']}"
              f"　依据 {x['father_src'] or '（无）'}")

    # ══════ 四、148 条「分不清」到底有多近 ══════
    print("\n\n══ 148 条「分不清」：两个候选的年代到底差多少 ══\n")
    gaps = []
    for x in D["A同名分不清"]:
        ys = []
        for k in x["cands"]:
            m = re.search(r"生 (\d{3,4})", k.get("window") or "")
            if m:
                ys.append(int(m.group(1)))
        if len(ys) >= 2:
            gaps.append((max(ys) - min(ys), x))
    gaps.sort(key=lambda t: t[0])
    print(f"   {len(gaps)} 条能算出候选之间的生年差：")
    buckets = Counter()
    for g, _ in gaps:
        buckets["差 0–5 年" if g <= 5 else "差 6–15 年" if g <= 15
                else "差 16–30 年" if g <= 30 else "差 30 年以上"] += 1
    for k in ("差 0–5 年", "差 6–15 年", "差 16–30 年", "差 30 年以上"):
        if buckets[k]:
            print(f"      {buckets[k]:>4}　{k}")
    print(f"   另有 {len(D['A同名分不清']) - len(gaps)} 条算不出（候选缺年份）\n")
    print("   最难分的（年代几乎重合）：")
    for g, x in gaps[:5]:
        print(f"\n     {x['name']}（第{x['gen']}世 {x['src_human']}）"
              f"　本人 {x.get('window','')}")
        print(f"       谱上写父名「{x['father_name']}」")
        for k in x["cands"]:
            print(f"         · {k['name']}　{k['window']}　{k['src_human']}")


if __name__ == "__main__":
    main()
