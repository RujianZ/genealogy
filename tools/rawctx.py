"""看原件某处前后的**逐段原样**，单字也不丢。

    python tools/rawctx.py "source/合一（1.2.3.4）.doc" 继发 25
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
path = Path(sys.argv[1])
needle = sys.argv[2]
span = int(sys.argv[3]) if len(sys.argv) > 3 else 25

raw = path.read_bytes()
runs, cur = [], []
for i in range(0, len(raw) - 1, 2):
    cp = raw[i] | (raw[i + 1] << 8)
    if 0x3400 <= cp <= 0x9FFF:
        cur.append(chr(cp))
    else:
        if cur:
            runs.append("".join(cur))
            cur = []
if cur:
    runs.append("".join(cur))

for i, r in enumerate(runs):
    if needle not in r:
        continue
    lo, hi = max(0, i - span), min(len(runs), i + span + 1)
    print(f"\n── 第 {i} 段命中 ──")
    for k in range(lo, hi):
        print(f"   {'→' if k == i else ' '} [{runs[k]}]")
    break
