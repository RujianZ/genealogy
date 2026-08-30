"""哪几段序的原文和卷首对不上，差在哪个字。"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
NS = lambda s: "".join((s or "").split()).replace("　", "")
HAN = lambda s: re.sub(r"[^㐀-鿿〇]", "", s or "")
S = {d["id"]: NS(d["text"]) for d in json.loads(
    Path("data/shou.json").read_text(encoding="utf-8"))}
P = json.loads(Path("data/prefaces.json").read_text(encoding="utf-8"))

for x in P["list"]:
    if not x.get("full"):
        continue
    src = HAN(S[re.sub(r"#\d+$", "", x["doc"])])
    miss = [p for p in x["full"] if HAN(p["src"]) not in src]
    if not miss:
        continue
    print(f"\n═══ {x['doc']}　{x['author']}　{len(miss)}/{len(x['full'])} 段对不上")
    for p in miss:
        s = HAN(p["src"])
        # 找最长能对上的前缀，看它在第几个字断的
        lo, hi = 0, len(s)
        while lo < hi:
            m = (lo + hi + 1) // 2
            if s[:m] in src:
                lo = m
            else:
                hi = m - 1
        j = src.find(s[:lo]) + lo if lo else -1
        print(f"  拼出 …{s[max(0,lo-12):lo]}[{s[lo:lo+1]}]{s[lo+1:lo+9]}…")
        if j >= 0:
            print(f"  原文 …{src[max(0,j-12):j]}[{src[j:j+1]}]{src[j+1:j+9]}…")
        else:
            print(f"  （整段的开头就找不到）")
        print()
