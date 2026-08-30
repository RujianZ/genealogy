"""
反向匹配能补回多少条断链？

现在的链接只往一个方向走：拿儿子写的父名，去谱里找同名的人。
名字对不上就断——朝阳就是这么断的：
    朝阳自己那一条写「梦林公长子」
    他父亲自己那一条写「林 公」（第15世本人条目省排行字、加敬称）
两个字符串对不上，边就没接上。

但**父亲那一条的「生子二：朝阳、朝纪」里点了朝阳的名**。
那是全表最硬的依据（rank1 claim_named）——只是没人反过来查。

所以补一条反向匹配：
    某人 parent_edges 是空的，但上一世有个人的生子名单里写了他的名
    → 接上，依据 claim_named

**这不是猜。** 是谱自己写的「生子X：…」名单，跟正向匹配用的是同一份东西，
只是查的方向反过来。命中多个同名时，**全部列出，不挑**。
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")


def main() -> None:
    P = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in P}

    # 谁在别人的生子名单里被点了名
    claims: dict[str, list] = defaultdict(list)
    for f in P:
        for son in f.get("sons_claimed") or []:
            claims[NS(son)].append(f)

    broken = [p for p in P if not p["parent_edges"] and p["father_name"]]
    print(f"断链的人（写了父名但没接上）：{len(broken)}\n")

    hit1 = hitn = miss = 0
    ex: list = []
    for p in broken:
        # 本人的任何一个叫法，被上一世的某人点了名
        forms = {NS(a["form"]) for a in p["aliases"]} | {NS(p["name"])}
        cands = []
        for form in forms:
            for f in claims.get(form, []):
                if f["pid"] == p["pid"]:
                    continue
                if f["gen"] is None or p["gen"] is None or p["gen"] - f["gen"] != 1:
                    continue          # 世次必须正好差 1（谱自己的硬规矩）
                if f not in cands:
                    cands.append(f)
        if len(cands) == 1:
            hit1 += 1
            if len(ex) < 8:
                ex.append((p, cands))
        elif cands:
            hitn += 1
        else:
            miss += 1

    print(f"  **上一世恰好有一个人点了他的名**　{hit1}　← 能接上")
    print(f"  多个人点了同一个名字　　　　　　{hitn}　← 分叉，全列不挑")
    print(f"  没人点名，接不上　　　　　　　　{miss}")

    print("\n能接上的例子：\n")
    for p, cands in ex:
        f = cands[0]
        print(f"  {p['name']}（第{p['gen']}世 {p['src_human']}）写父名「{p['father_name']}」")
        print(f"    ↳ {f['name']}（第{f['gen']}世 {f['src_human']}）"
              f"生子名单 {f['sons_claimed']}")
        print(f"    ↳ 他自己的叫法：{[a['form'] for a in f['aliases']]}\n")

    # 断链集中在哪几世
    print("断链按世次分：")
    for g, c in sorted(Counter(p["gen"] for p in broken).items()):
        print(f"   第{g:>2}世 {c}")


if __name__ == "__main__":
    main()
