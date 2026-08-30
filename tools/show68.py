"""真说不出的那 68 条，把原文整段摆出来。"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")
FLAT = lambda s: " / ".join(x.strip() for x in (s or "").split("\n") if x.strip())


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    hard = [x for x in D["分不清"] if not x["settled"]]
    print(f"真说不出的 {len(hard)} 条\n")

    # 先看形状
    c = Counter()
    for x in hard:
        p = idx[x["pid"]]
        row = int(p["pid"].split("-")[3])
        c[f"本人在段内第 {row} 行"] += 1
        c["父名是空的" if not NS(x["father_name"]) else "谱上写了父名"] += 1
        c[f"候选 {len(x['cands'])} 个"] += 1
        c[x["kind"]] += 1
    for k, v in sorted(c.items()):
        print(f"   {v:>4}　{k}")

    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    print(f"\n\n前 {n} 条的原文：\n")
    for x in hard[:n]:
        p = idx[x["pid"]]
        print("═" * 70)
        print(f"【本人】{p['name']}　第{p['gen']}世　{p['src_human']}")
        print(f"   谱上写父名「{p['father_name']}」{p['filiation']}"
              f"　依据：{p['father_src'] or '（行内没写）'}")
        print(f"   原文：{FLAT(p['raw_text'])}")
        if p["unparsed"]:
            print(f"   未归字段：{' / '.join(u['text'].strip() for u in p['unparsed'])}")
        print(f"\n   谱上同名的 {len(x['cands'])} 个，都当得了他的{x['kind']}：")
        for k in x["cands"]:
            f = idx[k["pid"]]
            print(f"\n   ── {f['name']}　{f['src_human']}　{k['window']}")
            print(f"      生子名单：{f['sons_claimed'] or '（谱上没列）'}")
            print(f"      原文：{FLAT(f['raw_text'])[:230]}")
        print()


if __name__ == "__main__":
    main()
