"""把 1992、2016 这三篇的原文打出来。"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
NS = lambda s: "".join((s or "").split()).replace("　", "")
S = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
P = json.loads(Path("data/prefaces.json").read_text(encoding="utf-8"))
want = {x["doc"]: x for x in P["list"] if not x.get("full")}
for d in S:
    if d["id"] in want:
        t = NS(d["text"])
        print(f'=== {d["id"]}　{want[d["id"]]["author"]}　{len(t)}字 ===')
        print(t)
        print()
