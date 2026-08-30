"""把各届序的全文打出来，供逐句翻译。 python tools/show_prefaces.py [起] [止]"""
import json
import sys
from pathlib import Path

a = int(sys.argv[1]) if len(sys.argv) > 1 else 0
b = int(sys.argv[2]) if len(sys.argv) > 2 else 99

O = json.loads(Path("data/oldprefaces.json").read_text(encoding="utf-8"))
for p in O[a:b]:
    print(f"=== 03_旧序#{O.index(p)}　{p['ad']} {p['era']}　{p['author']}　{p['chars']}字 ===")
    print(p["text"])
    print()

if b > 90:
    NS = lambda s: "".join((s or "").split()).replace("　", "")
    S = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
    for i in ("04_叙", "05_谱祭序", "06_旧序", "07_续修谱叙"):
        d = next(x for x in S if x["id"] == i)
        t = NS(d["text"])
        print(f"=== {i}　{len(t)}字 ===")
        print(t)
        print()
