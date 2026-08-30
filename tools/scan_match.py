"""历届修谱名单里，match 这个说明一共有几种写法，各多少条。"""
import json
import sys
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
R = json.loads(Path("data/revisions.json").read_text(encoding="utf-8"))
c = Counter()
cand = 0
for r in R:
    for m in r["members"]:
        c[m.get("match")] += 1
        if m.get("candidates"):
            cand += 1
for k, v in c.most_common():
    print(f"{v:>5}  {k}")
print(f"\n有多个候选的：{cand} 条")
for r in R:
    for m in r["members"]:
        if m.get("candidates"):
            print("   例：", r["era"], m.get("name"), m.get("match"),
                  "候选", [x.get("pid") for x in m["candidates"]])
            break
    else:
        continue
    break
