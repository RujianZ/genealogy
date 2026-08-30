"""
核一条重名：把本人和每个候选的**原文整段**摆出来，人自己看。

用法： python tools/verify_one.py 继均
       python tools/verify_one.py P-册4-0198-5-1-0

不做任何判断。只是把散在四本书里的几段原文并排放在一起——
这本来就是人工核对最费劲的部分（要翻好几百页）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def show(p: dict, tag: str) -> None:
    print(f"\n{'═' * 66}")
    print(f"{tag}　{p['name']}　第{p['gen']}世　{p['src_human']}")
    print(f"  pid {p['pid']}")
    print(f"  谱上写父名「{p['father_name']}」{p['filiation']}　依据：{p['father_src']}")
    if p.get("sons_claimed"):
        print(f"  他自己那一条列的儿子：{'、'.join(p['sons_claimed'])}")
    if p.get("daughters_claimed"):
        print(f"  女：{'、'.join(p['daughters_claimed'])}")
    if p.get("spouses"):
        print(f"  配偶：{'、'.join(s['rel'] + s['name_raw'] for s in p['spouses'])}")
    print(f"{'─' * 66}")
    print(p["raw_text"])
    if p.get("unparsed"):
        print("  ── 未归入字段的原文行 ──")
        for u in p["unparsed"]:
            print("  " + u["text"].strip())


def main() -> None:
    q = sys.argv[1] if len(sys.argv) > 1 else "继均"
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    hits = [p for p in people if p["pid"] == q or p["name"] == q]
    if not hits:
        print(f"没找到「{q}」"); return
    if len(hits) > 1 and q != hits[0]["pid"]:
        print(f"「{q}」有 {len(hits)} 个，都列出来：")
        for p in hits:
            print(f"   {p['pid']}　第{p['gen']}世　{p['src_human']}")
        print()

    for me in hits:
        show(me, "【本人】")
        print(f"\n  ▼ 父候选 {len(me['parent_edges'])} 个：")
        for e in me["parent_edges"]:
            f = idx.get(e["parent"])
            if not f:
                print(f"\n  候选 {e['parent_name']}：pid {e['parent']} 不在谱中"); continue
            show(f, f"【父候选 · {e['kind']}】")
            named = me["name"] in (f.get("sons_claimed") or [])
            print(f"\n  ↳ 他的生子名单里{'**有**' if named else '没有'}「{me['name']}」")
            print(f"  ↳ 依据等级 {e['rank']}／5　{e['evidence_cn']}")
            print(f"  ↳ 匹配方式 {e['matched_as']}")
        print("\n" + "═" * 66)


if __name__ == "__main__":
    main()
