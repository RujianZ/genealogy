"""
版式当分辨器，在**真正的同名案例**上准不准？

前几版全测错了：拿来当标准答案的 1034 人里，1033 个的父名在那一辈是唯一的。
父名唯一，解析器才敢标 claim_named；一有同名就变成 homonym_one_of 掉进疑点堆。
**所以那批样本恰好把要验证的情形全排除了。** 98%／96% 测的是它不用干的活。

真正的标注数据在这里：
    某人有**好几个同名的父候选**，而其中**恰好一个**的生子名单点了他的名。
    —— 谱自己给出了答案，而情形正是「同名分不清」。

拿这批测：版式指的，是不是谱点名的那个。
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
        c = co(p["pid"])
        if not c or c[2] <= 1:
            return []
        row = by_vr.get((c[0], c[2] - 1), [])
        prev = [(pg, q) for pg, q in row if pg <= c[1]]
        if not prev:
            return []
        top = prev[-1][0]
        return [q for pg, q in prev if pg == top]

    # 标注数据：多个同种关系的候选，其中恰好一个 claim_named
    test = []
    for p in people:
        for kind in {e["kind"] for e in p["parent_edges"]}:
            es = [e for e in p["parent_edges"] if e["kind"] == kind]
            if len(es) < 2:
                continue
            named = [e for e in es if e["evidence"] == "claim_named"]
            if len(named) == 1:
                test.append((p, named[0], es))
    print(f"标注数据：{len(test)} 例（多个同名候选，谱自己点名了其中一个）\n")

    hit = miss = cannot = 0
    bad = []
    ok_ex = []
    for p, truth, es in test:
        above = {q["pid"] for q in cell_above(p)}
        picked = [e for e in es if e["parent"] in above]
        if len(picked) != 1:
            cannot += 1
            continue
        # ★ 闸：若**另一个同名的也在同册同行上、且在本人页码之前**，
        #   那「往回翻最近的」就可能翻错——这种情形版式分不了，弃权。
        c = co(p["pid"])
        rivals_same_run = [e for e in es
                           if e["parent"] != picked[0]["parent"]
                           and (r := co(e["parent"]))
                           and r[0] == c[0] and r[2] == c[2] - 1 and r[1] <= c[1]]
        if rivals_same_run:
            cannot += 1
            continue
        if picked[0]["parent"] == truth["parent"]:
            hit += 1
            if len(ok_ex) < 3:
                ok_ex.append((p, truth, es))
        else:
            miss += 1
            if len(bad) < 8:
                bad.append((p, truth, picked[0], es))

    tot = hit + miss
    print(f"   版式能指出唯一一个的：{tot} 例（另 {cannot} 例指不出）")
    if tot:
        print(f"   **指对 {hit}／{tot} = {hit/tot*100:.2f}%**\n")
    for p, truth, got, es in bad:
        print(f"   ✘ {p['name']}（{p['src_human']}）父名「{p['father_name']}」")
        print(f"       谱点名的：{truth['parent_name']}（{idx[truth['parent']]['src_human']}）")
        print(f"       版式指的：{got['parent_name']}（{idx[got['parent']]['src_human']}）")
    print("\n   指对的例子：")
    for p, truth, es in ok_ex:
        print(f"\n     {p['name']}（{p['src_human']}）父名「{p['father_name']}」")
        for e in es:
            f = idx[e["parent"]]
            mark = "✔ 就印在他上面那一格" if e["parent"] == truth["parent"] else "✘"
            print(f"       {mark}　{e['parent_name']}　{f['src_human']}")


if __name__ == "__main__":
    main()
