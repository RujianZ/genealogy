"""列出这几篇序里所有的重文号「匕」和刻成「日」的「曰」，一次看全，免得一个个撞。"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
NS = lambda s: "".join((s or "").split()).replace("　", "")
S = {d["id"]: NS(d["text"]) for d in json.loads(
    Path("data/shou.json").read_text(encoding="utf-8"))}
for i in ("04_叙", "05_谱祭序", "06_旧序", "07_续修谱叙"):
    t = S[i]
    for m in re.finditer(r"匕|日", t):
        k = m.start()
        print(f"{i:<10}{k:>4}  …{t[max(0, k - 9):k]}[{t[k]}]{t[k + 1:k + 9]}…")
