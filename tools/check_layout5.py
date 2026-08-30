"""
版式当「分辨器」而不是「预测器」，准不准？

第四版发现：版式给你的是**格**，不是**人**——一格里印着几个兄弟时分不出。
所以它不适合用来「预测父亲是谁」。

但**分辨同名候选**是另一回事：候选通常在不同的页，甚至不同的册。
问题不是「父亲是谁」，是「这两个同名的，谱把哪个印在你上面」。

**正经检验**：拿父边确定的人（父亲的生子名单点了名），
只取那些**父亲有同名同辈的人**（也就是真会碰上分不清的情形），
看版式指的是不是那个对的。

这是把判据放在它真正要干的活上测，不是拿全量准确率糊弄。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")
PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")


def co(pid):
    m = PID.match(pid)
    return (m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))) if m else None


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    by_vr = defaultdict(list)
    for p in people:
        c = co(p["pid"])
        if c:
            by_vr[(c[0], c[2])].append((c[1], p))
    for v in by_vr.values():
        v.sort(key=lambda t: t[0])

    def cell_above(p):
        """本人上面那一格里的**所有人**（一格可能并排几个兄弟）。"""
        c = co(p["pid"])
        if not c or c[2] <= 1:
            return []
        row = by_vr.get((c[0], c[2] - 1), [])
        prev = [(pg, q) for pg, q in row if pg <= c[1]]
        if not prev:
            return []
        top = prev[-1][0]                    # 最近的那一页
        return [q for pg, q in prev if pg == top]

    # 同名同辈索引
    same = defaultdict(list)
    for p in people:
        same[(NS(p["name"]), p["gen"])].append(p)

    gold = [p for p in people
            if len(p["parent_edges"]) == 1
            and p["parent_edges"][0]["evidence"] == "claim_named"]

    hit = miss = amb = 0
    bad = []
    for p in gold:
        f = idx.get(p["parent_edges"][0]["parent"])
        if not f:
            continue
        rivals = same[(NS(f["name"]), f["gen"])]
        if len(rivals) < 2:
            continue                         # 没有同名，用不着分辨
        above = cell_above(p)
        if not above:
            continue
        picked = [q for q in rivals if any(q["pid"] == a["pid"] for a in above)]
        if len(picked) == 1:
            if picked[0]["pid"] == f["pid"]:
                hit += 1
            else:
                miss += 1
                if len(bad) < 6:
                    bad.append((p, f, picked[0], rivals))
        elif len(picked) > 1:
            amb += 1                          # 两个同名的都在这一格里——分不出
        else:
            amb += 1                          # 一个都不在这一格——用不上

    tot = hit + miss
    print("检验：只看「父亲有同名同辈的人」这批——也就是真会碰上分不清的情形\n")
    print(f"   版式能指出唯一一个的：{tot} 例")
    print(f"   **指对 {hit}／{tot} = {hit/tot*100:.2f}%**")
    print(f"   另有 {amb} 例版式指不出（候选都在同格 / 都不在同格）\n")
    for p, f, g, rivals in bad:
        print(f"   ✘ {p['name']}（{p['src_human']}）")
        print(f"       谱点名的父亲：{f['name']}（{f['src_human']}）")
        print(f"       版式指的：　　{g['name']}（{g['src_human']}）")
        print(f"       同名同辈共 {len(rivals)} 人")


if __name__ == "__main__":
    main()
