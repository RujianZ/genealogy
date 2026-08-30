"""
多父候选到底有多少是真的说不清？

界面上「也可能是 X」现在什么都往外摆，结果摆出了
  万善（第7世）也可能是 光豫（第23世）的儿子
  世昂（第9世）也可能是 泽耀（第21世）的儿子
这种谁看了都知道不可能的东西。

先按**谱自己的规矩**筛一遍，看还剩多少是真的要人去核的：

  A 世次不对   —— 父亲必须正好高一世。这是原书「第一世…第五世」
                  世代列头标死的，不是推算的。差不是 1 就不成立。
  B 年纪不对   —— 生年查卷首《甲子録》，父子差 <13 或 >75 岁。
  C 剩下的     —— 这些才是真的「谱上只写了两个字」，要人对着原文核。

A 和 B 都不是判断，是谱自己的硬约束 + 减法。
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, "tools")
from check_homonym_years import year_of  # noqa: E402


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    for p in people:
        p["_y"] = year_of((p.get("birth") or {}).get("text"))[0]

    forks = [p for p in people if len({e["parent"] for e in p["parent_edges"]}) > 1]
    print(f"有多个父候选的人：{len(forks)}\n")

    tally = Counter()
    still: list = []
    gen_bad = 0
    for p in forks:
        keep, drop_gen, drop_age = [], [], []
        for e in p["parent_edges"]:
            f = idx.get(e["parent"])
            if not f:
                continue
            if f["gen"] is None or p["gen"] - f["gen"] != 1:
                drop_gen.append((e, f)); continue
            cy, fy = p["_y"], f["_y"]
            if cy and fy and not (13 <= cy - fy <= 75):
                drop_age.append((e, f)); continue
            keep.append((e, f))
        gen_bad += len(drop_gen)
        # ★ 生父 + 嗣父 = 过继双记，**不是**「说不清」。
        #   谱的凡例本来就要求两个都写（「不忘所自出」）。
        #   真正说不清的是：**同一种关系里有好几个候选**。
        by_kind: dict[str, set] = {}
        for e, f in keep:
            by_kind.setdefault(e["kind"], set()).add(e["parent"])
        worst = max((len(v) for v in by_kind.values()), default=0)
        tally[worst] += 1
        if worst > 1:
            still.append((p, keep, by_kind))

    print(f"A 世次差不为 1，被谱自己的规矩排除的边：{gen_bad} 条")
    print("\n按「筛完还剩几个候选」分：")
    for n in sorted(tally):
        lab = {0: "一个都不剩（全被排除，说明边本身有问题）",
               1: "**只剩一个** —— 不用再问了"}.get(n, f"还剩 {n} 个 —— 要人核")
        print(f"   {tally[n]:>5} 人　{lab}")

    print(f"\nC 同一种关系里仍有多个候选：{len(still)} 人")

    # ★ 再筛一层，用的还是谱自己写的字：
    #   父亲那一条的「生子三：某某、某某」里点了本人的名 —— 那是谱自己指的，
    #   不是我们挑的。只有一个候选点了名，另一个没点，就不用再问了。
    D = []
    solved_named = 0
    for p, keep, by_kind in still:
        named = [(e, f) for e, f in keep
                 if p["name"] in (f.get("sons_claimed") or [])]
        others = [(e, f) for e, f in keep if (e, f) not in named]
        if len(named) == 1 and others:
            solved_named += 1
            continue
        D.append((p, keep, named))
    print(f"   其中 {solved_named} 人：只有一个候选的「生子X：…」名单点了本人的名")
    print(f"\n★ 真正要人对着原文核的：{len(D)} 人")

    Path("data/homonym_todo.json").write_text(json.dumps([{
        "pid": p["pid"], "name": p["name"], "gen": p["gen"],
        "father_name": p["father_name"], "filiation": p["filiation"],
        "src_human": p["src_human"], "raw_text": p["raw_text"],
        "birth": (p.get("birth") or {}).get("text"),
        "cands": [{
            "pid": f["pid"], "name": f["name"], "gen": f["gen"],
            "kind": e["kind"], "evidence": e["evidence"], "evidence_cn": e["evidence_cn"],
            "birth": (f.get("birth") or {}).get("text"), "year": f["_y"],
            "src_human": f["src_human"], "sons_claimed": f.get("sons_claimed") or [],
            "names_me": p["name"] in (f.get("sons_claimed") or []),
        } for e, f in keep],
    } for p, keep, _ in sorted(D, key=lambda x: (x[0]["gen"], x[0]["pid"]))],
        ensure_ascii=False, indent=1), encoding="utf-8")
    print("   清单已写到 data/homonym_todo.json")

    print("\n头 8 条长什么样：\n")
    for p, keep, _ in sorted(D, key=lambda x: (x[0]["gen"], x[0]["pid"]))[:8]:
        print(f"第{p['gen']:>2}世 {p['name']}　{p['src_human']}")
        print(f"        谱上写父名「{p['father_name']}」{p['filiation']}")
        for e, f in keep:
            y = f"生{f['_y']}" if f["_y"] else "生年不详"
            mark = "　←生子名单点了名" if p["name"] in (f.get("sons_claimed") or []) else ""
            print(f"          · {f['name']}　{y}　{f['src_human']}　[{e['kind']}]{mark}")
        print()


if __name__ == "__main__":
    main()
