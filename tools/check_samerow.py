"""
同一册、同一页、同一行的人，是不是兄弟（同一个父亲）？

世系表一格里可以并排印好几个人。看原文：
    朝祖　册2·卷二·梦骥公世系·第160页·第1行
    朝纲　册2·卷二·梦骥公世系·第160页·第1行     ← 同页同行，不同列
两个人都没有行内父名——**父名写在页眉上，一格共用一个**。

如果「同页同行 = 同父」成立，那 94 个段首没父名的人，
可以从同格的兄弟那里把父亲取回来。**这是读版式，不是推关系。**

**先验证**：拿父边唯一且 claim_named 的人当标准答案，
看同格的人是不是真的都同一个父亲。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")


def cell(pid):
    m = PID.match(pid)
    return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    by_cell = defaultdict(list)
    for p in people:
        c = cell(p["pid"])
        if c:
            by_cell[c].append(p)

    sizes = Counter(len(v) for v in by_cell.values())
    print("一格（同册同页同行）里有几个人：")
    for k in sorted(sizes):
        print(f"   {k} 人一格　×{sizes[k]}")

    # 验证：同格里父边确定的人，父亲是不是同一个
    print("\n验证「同格 = 同父」——只看格里有 ≥2 个人、且至少 2 个父边确定的")
    ok = bad = 0
    ex = []
    for c, ps in by_cell.items():
        known = [(p, p["parent_edges"][0]["parent"]) for p in ps
                 if len(p["parent_edges"]) == 1
                 and p["parent_edges"][0]["evidence"] == "claim_named"]
        if len(known) < 2:
            continue
        fathers = {f for _, f in known}
        if len(fathers) == 1:
            ok += 1
        else:
            bad += 1
            if len(ex) < 5:
                ex.append((c, known))
    tot = ok + bad
    print(f"   可验的格 {tot} 个")
    print(f"   **格里所有人同一个父亲：{ok}／{tot} = {ok/tot*100:.2f}%**")
    for c, known in ex:
        print(f"     ✘ {c}")
        for p, f in known:
            print(f"        {p['name']} 第{p['gen']}世 → 父 {idx[f]['name']}（{idx[f]['src_human']}）")

    # 能救回多少
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    noda = [idx[x["pid"]] for x in D["C没写父名"]]
    print(f"\n拿这条去救那 {len(noda)} 个没写父名的人：")
    r = Counter()
    saved = []
    for p in noda:
        mates = [q for q in by_cell[cell(p["pid"])]
                 if q["pid"] != p["pid"] and q["parent_edges"]]
        fs = {e["parent"] for q in mates for e in q["parent_edges"]}
        if len(fs) == 1:
            r["**同格兄弟指向同一个父亲**"] += 1
            saved.append((p, mates[0], idx[list(fs)[0]]))
        elif fs:
            r[f"同格兄弟指向 {len(fs)} 个不同的父亲"] += 1
        elif mates:
            r["同格有人，但他也没父边"] += 1
        else:
            r["这一格只有他一个人"] += 1
    for k, v in r.most_common():
        print(f"   {v:>4}　{k}")

    print("\n救回来的例子：\n")
    for p, mate, f in saved[:6]:
        print(f"  {p['name']}（第{p['gen']}世 {p['src_human']}）谱上没写父名")
        print(f"    同格的 {mate['name']} 写着父亲是 {f['name']}"
              f"（{f['src_human']}）")
        print(f"    {f['name']} 的生子名单：{f['sons_claimed']}"
              + ("　←里面有本人" if p["name"] in (f["sons_claimed"] or []) else ""))
        print()


if __name__ == "__main__":
    main()
