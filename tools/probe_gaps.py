"""
两个新发现的漏洞有多大？

① 「生子X：…」的写法不止一种。泽贵那条写的是「**季子二** 泽富 泽贵」，
   解析器只认「生子」，所以整份名单丢了。
   全谱还有哪些写法？

② 本人原文里点了**兄弟的名字**（「出嗣**长兄泽昌**」）。
   泽昌在铣正的生子名单里，不在铣意的——那泽久就是铣正的儿子。
   这跟「父亲点名」是同一份证据，只是绕了一道弯：
   **兄弟同父。** 有多少条能这么定？
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 「X子N」的各种写法
RE_SONS = re.compile(r"(生子|季子|嗣子|继子|养子|承子|抚子|子)"
                     r"([一二三四五六七八九十]|\d+)(?![0-9])")
# 兄弟称谓 + 名字：「出嗣长兄泽昌」「承祧胞兄壁环壁岳」「出继三弟铣福」
RE_SIB = re.compile(r"(胞兄|胞弟|亲兄|亲弟|长兄|次兄|[二三四五六七八九]兄|"
                    r"[二三四五六七八九]弟|兄|弟)([一-鿿]{2,3})")


def sib_names(t: str) -> set[str]:
    """兄弟称谓后面的名字。**2 字和 3 字都试**——
    「长兄泽昌兼承己嗣」贪心取 3 字会切成「泽昌兼」，那就永远对不上。"""
    out = set()
    for m in RE_SIB.finditer(t):
        s3 = m.group(2)
        out.add(s3)
        out.add(s3[:2])
    return out


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    # ── ① 「X子N」写法统计 ──────────────────────────────
    print("① 全谱原文里「X子N」的写法：\n")
    c = Counter()
    ex: dict = {}
    for p in people:
        for m in RE_SONS.finditer(NS(p["raw_text"])):
            c[m.group(1)] += 1
            ex.setdefault(m.group(1), []).append(p)
    for k, v in c.most_common():
        got = sum(1 for p in ex[k][:200] if p["sons_claimed"])
        print(f"   {v:>5}　「{k}X」　（抽 200 个看，其中 {got} 个抓到了名单）")
        for p in ex[k][:2]:
            seg = NS(p["raw_text"])
            i = seg.find(k)
            print(f"          {p['name']}　…{seg[max(0,i-6):i+26]}…"
                  f"　sons_claimed={p['sons_claimed']}")

    # ── ② 本人原文点了兄弟名 ────────────────────────────
    print("\n\n② 本人原文里点了兄弟名字的：\n")
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    hard = [x for x in D["分不清"] if not x["settled"]]
    n_sib = solved = 0
    ex2 = []
    for x in hard:
        p = idx[x["pid"]]
        sibs = sib_names(NS(p["raw_text"]))
        if not sibs:
            continue
        n_sib += 1
        keep = []
        for k in x["cands"]:
            f = idx[k["pid"]]
            lst = {NS(s) for s in (f.get("sons_claimed") or [])}
            if sibs & lst:
                keep.append((k, sibs & lst))
        if len(keep) == 1:
            solved += 1
            if len(ex2) < 6:
                ex2.append((p, keep[0], x["cands"], sibs))
    print(f"   68 条里，本人原文点了兄弟名的：{n_sib} 条")
    print(f"   **其中只有一个候选的生子名单里有那个兄弟：{solved} 条** ← 能定\n")
    for p, (k, hit), cands, sibs in ex2:
        print(f"   {p['name']}（第{p['gen']}世 {p['src_human']}）")
        print(f"     原文点了兄弟：{'、'.join(sibs)}")
        for kk in cands:
            f = idx[kk["pid"]]
            mark = "✔" if kk["pid"] == k["pid"] else "✘"
            print(f"       {mark} {kk['name']}　生子名单 {f['sons_claimed']}")
        print()


if __name__ == "__main__":
    main()
