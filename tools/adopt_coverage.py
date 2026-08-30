"""
谱明写的 94 件过继，解析器接住了几件？

事迹里写着「次子啟昌出嗣朝阳」——**这是谱明写的一件过继**。
那启昌的 parent_edges 里就该有一条指向朝阳的嗣父边。

有没有？没有的话，就是**谱写了、我们没接**——直接补。
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

_V = json.loads(Path("data/variants.json").read_text(encoding="utf-8"))


def NS(s):
    t = "".join((s or "").split()).replace("　", "")
    return "".join(_V.get(c, c) for c in t)


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    A = json.loads(Path("data/adoptions.json").read_text(encoding="utf-8"))

    # 名字 → 人（同名可能多个）
    by_name = {}
    for p in people:
        for f in {NS(p["name"])} | {NS(a["form"]) for a in p["aliases"]}:
            by_name.setdefault(f, []).append(p)

    c = Counter()
    missing = []
    for a in A["out"]:
        spk = idx[a["speaker"]]                       # 生父
        sons = by_name.get(a["son"], [])
        sons = [s for s in sons if s["gen"] == spk["gen"] + 1]
        if not sons:
            c["儿子在谱里找不到（或世次对不上）"] += 1; continue
        if len(sons) > 1:
            c["同名的儿子有好几个，定不了是哪个"] += 1; continue
        son = sons[0]
        if not a["to"]:
            c["谱没写出嗣给谁（只说「出嗣」）"] += 1; continue
        tos = [t for t in by_name.get(a["to"], []) if t["gen"] == spk["gen"]]
        if not tos:
            c["嗣父在谱里找不到"] += 1; continue

        has = [e for e in son["parent_edges"] if e["kind"] == "嗣父"]
        hit = [e for e in has if any(e["parent"] == t["pid"] for t in tos)]
        if hit:
            c["**已经接上了**"] += 1
        elif has:
            c["有嗣父边，但指向别人"] += 1
            missing.append((spk, son, tos, a, has))
        else:
            c["**谱写了、完全没接**"] += 1
            missing.append((spk, son, tos, a, has))

    print(f"谱明写的过继（生父那边）：{len(A['out'])} 件\n")
    for k, v in c.most_common():
        print(f"   {v:>4}　{k}")

    print(f"\n没接上／接错的：{len(missing)} 件，看 10 件：\n")
    for spk, son, tos, a, has in missing[:10]:
        print(f"   {son['name']}（第{son['gen']}世 {son['src_human']}）")
        print(f"     生父 {spk['name']} 那条写：「{a['sent']}」")
        print(f"     应有嗣父：" + "　".join(f"{t['name']}（{t['src_human']}）" for t in tos))
        print(f"     现在的嗣父边：" + (
            "　".join(f"{e['parent_name']}" for e in has) if has else "**一条也没有**"))
        print(f"     现在的全部父边：" + "　".join(
            f"{e['parent_name']}[{e['kind']}]" for e in son["parent_edges"]))
        print()


if __name__ == "__main__":
    main()
