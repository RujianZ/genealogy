"""
命令行查询。第二段（TypeScript）之前，先用这个验数据。

    python -m gpx2.query 搜索 火生
    python -m gpx2.query 上溯 承健
    python -m gpx2.query 上溯 承健 --宗法
    python -m gpx2.query 关系 承健 承武
"""
from __future__ import annotations

import sys
from pathlib import Path

from .segment import segment_all
from .fields import extract_all
from .link import link, add_adoption_edges, walk_up, flatten_paths, rank_paths
from . import adoption
from .search import search, relation


def load(d="jsonl"):
    segs, ptr, _ = segment_all(Path(d))
    people = extract_all(segs, ptr)
    link(people)
    add_adoption_edges(people, adoption.collect(people))
    return people, segs


def cmd_search(people, q):
    hits = search(people, q)
    print(f"「{q}」命中 {len(hits)} 条，全部列出：\n")
    for h in hits:
        sn = f"  …{h.snippet}" if h.snippet else ""
        print(f"  {h.score:.2f}  {h.name}（{h.gen}世，字{h.zi or '-'}）"
              f"  {h.why}\n        {h.src}{sn}")


def cmd_up(people, name, lineage=False):
    cands = [p for p in people if name in {a for a, _ in p.aliases}]
    if not cands:
        print(f"查无「{name}」"); return
    for p in cands:
        kind = "嗣父" if lineage else "生父"
        paths = rank_paths(flatten_paths(walk_up(people, p.pid, kind)))
        ok = [x for x in paths if x["gen_consistent"]]
        print(f"\n=== {p.name}（{p.gen}世，字{p.zi.text if p.zi else '-'}）"
              f"  {p.src_human()}")
        print(f"    上溯路径共 {len(paths)} 条，其中世次单调 {len(ok)} 条。"
              f"全部保留，按依据强弱排序，不择一。\n")
        for i, x in enumerate(ok or paths, 1):
            tag = "" if x["gen_consistent"] else "  ⚠世次不单调"
            print(f"  路径{i}｜{x['length']}环｜最弱依据等级 {x['weakest']}{tag}")
            print(f"      {' ← '.join(x['names'])}")


def cmd_relation(people, a, b):
    pa = next((p for p in people if a in {x for x, _ in p.aliases}), None)
    pb = next((p for p in people if b in {x for x, _ in p.aliases}), None)
    if not (pa and pb):
        print("有一方查不到"); return
    res = relation(people, pa.pid, pb.pid)
    print(f"{pa.name}({pa.gen}世) 与 {pb.name}({pb.gen}世) 的全部共祖路径 "
          f"{len(res)} 条：\n")
    for r in res[:20]:
        print(f"  共祖 {r['common_ancestor']}（{r['gen']}世）"
              f"｜{pa.name}上溯{r['up_from_a']}代，{pb.name}上溯{r['up_from_b']}代"
              f"\n        {r['src']}")


if __name__ == "__main__":
    args = sys.argv[1:]
    people, segs = load()
    if not args:
        print(__doc__); sys.exit(0)
    cmd = args[0]
    if cmd in ("搜索", "search"):
        cmd_search(people, args[1])
    elif cmd in ("上溯", "up"):
        cmd_up(people, args[1], "--宗法" in args or "--lineage" in args)
    elif cmd in ("关系", "rel"):
        cmd_relation(people, args[1], args[2])
    else:
        print(__doc__)
