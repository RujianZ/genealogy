"""那 36 条「父名跟候选完全不同名」的，回原文看看到底怎么回事。"""
import json
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
idx = {p["pid"]: p for p in people}
A = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))["A同名分不清"]

bad = [x for x in A
       if not any(NS(k["name"]) == NS(x["father_name"]) for k in x["cands"])]
print(f"「父名跟候选全不同名」共 {len(bad)} 条，看前 8 条的原文：\n")

for x in bad[:8]:
    p = idx[x["pid"]]
    print("═" * 66)
    print(f"第{p['gen']}世 {p['name']}　{p['src_human']}")
    print(f"  谱上写父名「{p['father_name']}」{p['filiation']}　依据 {p['father_src']}")
    print(f"  候选：" + "　".join(
        f"{k['name']}（{k['src_human']}）" for k in x["cands"]))
    print("  ── 本人原文 ──")
    print("  " + p["raw_text"].replace("\n", "\n  ")[:260])
    for k in x["cands"][:1]:
        e = next((e for e in p["parent_edges"] if e["parent"] == k["pid"]), None)
        if e:
            print(f"  ── 这条边是怎么连的 ──")
            print(f"     evidence={e['evidence']}　matched_as={e['matched_as']}")
    print()
