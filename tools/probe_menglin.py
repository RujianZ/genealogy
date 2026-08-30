"""朝阳公的父亲「梦林」到底在不在谱里？"""
import json
from pathlib import Path

P = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
idx = {p["pid"]: p for p in P}


def dump(p, tag=""):
    print(f"\n{'═'*64}\n{tag}{p['name']}　第{p['gen']}世　{p['src_human']}")
    print(f"  pid {p['pid']}")
    print(f"  别名 {[a['form'] + '(' + a['why'] + ')' for a in p['aliases']]}")
    print(f"  父名「{p['father_name']}」{p['filiation']}　father_src={p['father_src']}")
    print(f"  parent_edges {len(p['parent_edges'])} 条")
    for e in p["parent_edges"]:
        f = idx.get(e["parent"])
        print(f"     → {e['parent_name']} [{e['kind']} {e['evidence']}] {f['src_human'] if f else '?'}")
    print(f"  生子名单 {p['sons_claimed']}")
    print(f"{'─'*64}\n{p['raw_text']}")
    if p["unparsed"]:
        print("  ── 未归字段 ──")
        for u in p["unparsed"]:
            print("  " + u["text"].strip())


print("【1】朝阳（第16世，启昌的嗣父）")
for p in P:
    if p["name"] == "朝阳":
        dump(p)

print("\n\n【2】第 14/15 世名字带「林」的人")
for p in P:
    if p["gen"] in (14, 15) and "林" in p["name"]:
        dump(p, "候选：")

print("\n\n【3】第 15 世的人怎么命名的（前 20 个）")
g15 = [p for p in P if p["gen"] == 15]
print(f"  共 {len(g15)} 人")
for p in g15[:20]:
    print(f"   {p['name']:<6} {p['src_human']}")

print("\n\n【4】谁的原文里出现过「梦林」这两个字")
n = 0
for p in P:
    if "梦林" in p["raw_text"]:
        n += 1
        if n <= 6:
            line = [l for l in p["raw_text"].split("\n") if "梦林" in l]
            print(f"   {p['name']} 第{p['gen']}世 {p['src_human']}　{line}")
print(f"   共 {n} 人")

print("\n\n【5】页眉写「梦林公世系」那一段里，第 15 世的是谁")
sec = [p for p in P if "梦林" in p["src"]["section"]]
print(f"  梦林公世系共 {len(sec)} 人，世次分布：")
from collections import Counter
for g, c in sorted(Counter(p["gen"] for p in sec).items()):
    print(f"     第{g}世 {c} 人" + ("　←" + "、".join(x["name"] for x in sec if x["gen"] == g)[:60] if c <= 4 else ""))
