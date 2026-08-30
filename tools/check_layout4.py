"""
版式规律，第四版。前三版都把它当「统计规律」，错了。

**世系表就是这么读的：翻开那一页，你上面那一格就是你父亲。**
那不是猜，那就是看原文。

前几版加了「必须同一个页眉房支」这个条件——错。
房支名换段是正常的（一个人的儿子另起一段），不是反例。

真正的读法只有两条：
    ① 同一册
    ② 行号正好减一
    ③ 页码不大于本人——**取最近的那一页**（往回翻，头一个碰到的就是）

测两件事：
    A 这么读，在能确定的人身上准不准
    B 用来分同名候选时，能不能选出唯一
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")


def co(pid):
    m = PID.match(pid)
    return (m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))) if m else None


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    # 按（册, 行）建索引，页码排序——「往回翻」就是在这上面找
    by_vr = defaultdict(list)
    for p in people:
        c = co(p["pid"])
        if c:
            by_vr[(c[0], c[2])].append((c[1], p))
    for v in by_vr.values():
        v.sort(key=lambda t: t[0])

    def read_father(p):
        """按版式读：同册、行号减一、往回翻头一个。"""
        c = co(p["pid"])
        if not c or c[2] <= 1:
            return None
        row = by_vr.get((c[0], c[2] - 1), [])
        prev = [q for pg, q in row if pg <= c[1]]
        return prev[-1] if prev else None

    gold = [p for p in people
            if len(p["parent_edges"]) == 1
            and p["parent_edges"][0]["evidence"] == "claim_named"]
    hit = miss = skip = 0
    bad = []
    for p in gold:
        f = idx.get(p["parent_edges"][0]["parent"])
        g = read_father(p)
        if not f:
            skip += 1; continue
        if g is None:
            skip += 1; continue
        if g["pid"] == f["pid"]:
            hit += 1
        else:
            miss += 1
            if len(bad) < 8:
                bad.append((p, f, g))
    tot = hit + miss
    print("A　这么读准不准（标准答案：父边唯一且父亲的生子名单点了名）")
    print(f"   可测 {tot} 人（另 {skip} 人在第 1 行或数据缺，测不了）")
    print(f"   **读对 {hit}／{tot} = {hit/tot*100:.2f}%**\n")
    for p, f, g in bad:
        print(f"   ✘ {p['name']}（{p['src_human']}）")
        print(f"       谱上点名的父亲：{f['name']}（{f['src_human']}）")
        print(f"       按版式读出来的：{g['name']}（{g['src_human']}）")

    # B 用来分同名
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    A = D["A同名分不清"]
    r = Counter()
    ex = []
    for x in A:
        p = idx[x["pid"]]
        g = read_father(p)
        if g is None:
            r["本人在第 1 行，读不出"] += 1; continue
        hits = [k for k in x["cands"] if k["pid"] == g["pid"]]
        if len(hits) == 1:
            r["**版式读出来的正是候选之一**　← 能定"] += 1
            if len(ex) < 6:
                ex.append((p, g, x["cands"]))
        else:
            r["版式读出来的人不在候选里"] += 1
    print(f"\n\nB　拿它去分那 {len(A)} 条同名：")
    for k, v in r.most_common():
        print(f"   {v:>4}　{k}")

    print("\n例子：\n")
    for p, g, cands in ex:
        c = co(p["pid"])
        print(f"  {p['name']}（第{p['gen']}世 {p['src_human']}）父名「{p['father_name']}」")
        for k in cands:
            kc = co(k["pid"])
            mark = "  ✔ 就印在他上面那一格" if k["pid"] == g["pid"] else "  ✘"
            print(f"     {mark}　{k['name']}　{k['src_human']}")
        print()


if __name__ == "__main__":
    main()
