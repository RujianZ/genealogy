"""谱里有多少文章？哪些是文言？启昌（焕先）说过的话在哪？"""
import json
import re
from pathlib import Path

J = lambda n: json.loads(Path(f"data/{n}.json").read_text(encoding="utf-8"))
NS = lambda s: "".join((s or "").split())

shou = J("shou")
pas = J("passages")
rev = J("revisions")

print(f"【卷首文章】{len(shou)} 篇，共 {sum(len(NS(d['text'])) for d in shou):,} 字\n")
for d in sorted(shou, key=lambda x: -len(NS(x["text"]))):
    t = NS(d["text"])
    print(f"  {len(t):>6} 字　{d.get('title') or '（无题）'}"
          f"　{d.get('kind','')}　{d.get('src_human','')}")

print(f"\n【人物条目里的记事】{len(pas)} 段，共 {sum(p['chars'] for p in pas):,} 字")
from collections import Counter
kinds = Counter(k for p in pas for k in p["kinds"])
for k, n in kinds.most_common():
    print(f"   {n:>4}　{k}")

print(f"\n【修谱】{len(rev)} 届")
for r in rev:
    print(f"   {r['era']:<14} 名目 {len(r['members'])} 人")

print("\n\n【找启昌／焕先说的话】")
q = ["启昌", "啟昌", "焕先", "煥先"]
for d in shou:
    hit = [x for x in q if x in d["text"]]
    if hit:
        print(f"\n  ── {d.get('title')}　{d.get('src_human')} ──")
        for m in re.finditer("|".join(q), d["text"]):
            a = max(0, m.start() - 60)
            print("    …" + NS(d["text"][a:m.end() + 90]) + "…")
for p in pas:
    if any(x in p["text"] for x in q):
        print(f"\n  ── 记事 {p['id']}　{p['src_human']} ──\n    {NS(p['text'])[:200]}")

print("\n\n【谱里提到「修史」「作史」的地方】")
for d in shou:
    for kw in ("修史", "作史", "史也", "史之"):
        for m in re.finditer(kw, d["text"]):
            a = max(0, m.start() - 70)
            print(f"  [{d.get('title')}] …{NS(d['text'][a:m.end()+80])}…")
