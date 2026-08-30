"""按标题读卷首某一篇的全文。 python tools/read_doc.py 图墓公先焕"""
import json
import sys
from pathlib import Path

shou = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
q = sys.argv[1] if len(sys.argv) > 1 else ""

if not q:
    for d in shou:
        print(f"  {len(''.join(d['text'].split())):>6}  {d.get('title')}")
    sys.exit()

for d in shou:
    t = d.get("title") or ""
    if q in t or q in t[::-1]:
        print("=" * 68)
        print(f"标题（原样）：{t}")
        print(f"标题（倒转）：{t[::-1]}")
        for k, v in d.items():
            if k not in ("text", "title"):
                print(f"  {k} = {v!r}"[:200])
        print("=" * 68)
        print(d["text"])
        print()
