"""
那 145 条到底长什么样？分类型看，找还有没有客观办法。

想试两条新判据，两条都是谱自己印在纸上的东西：

  ① 排行对不对
     谱上写「次子」，那他就该在父亲「生子三：甲、乙、丙」名单的第 2 位。
     位置对不上 → 那个候选不成立。

  ② 房支对不对
     页眉写着「朝寿公世系」，意思是这一段里的人都是朝寿公的后代。
     候选父亲往上追，如果追不到朝寿公，那他不该是这一段里的人的父亲。

**先在能确定的人身上验，验不过就不用。**
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")
ORD = {"长": 1, "元": 1, "次": 2, "三": 3, "四": 4, "五": 5, "六": 6,
       "七": 7, "八": 8, "九": 9, "十": 10}


def rank_of(fil: str) -> int | None:
    """「长子」→1　「次子」→2　「三子」→3　「幼子」→末位（用 -1 表示）"""
    f = NS(fil)
    if not f:
        return None
    if f.startswith("幼"):
        return -1
    c = f[0]
    return ORD.get(c)


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    doubts = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    A = doubts["A同名分不清"]

    print(f"A 类共 {len(A)} 条\n")
    print("① 谱上写的父名，跟候选的名字对得上吗")
    c = Counter()
    for x in A:
        same = [NS(k["name"]) == NS(x["father_name"]) for k in x["cands"]]
        c["全部同名" if all(same) else ("全不同名" if not any(same) else "部分同名")] += 1
    for k, v in c.most_common():
        print(f"   {v:>4}　{k}")

    print("\n② 父名是空的（谱上根本没写父名，边是靠别的推的）")
    n = sum(1 for x in A if not NS(x["father_name"]))
    print(f"   {n} 条")

    print("\n③ 按关系种类")
    for k, v in Counter(x["kind"] for x in A).most_common():
        print(f"   {v:>4}　{k}")

    print("\n④ 候选是不是都在同一房")
    c2 = Counter()
    for x in A:
        secs = {idx[k["pid"]]["src"]["section"] for k in x["cands"]}
        c2["候选分散在不同房" if len(secs) > 1 else "候选都在同一房"] += 1
    for k, v in c2.most_common():
        print(f"   {v:>4}　{k}")

    # ── 验判据①：排行位置 ────────────────────────────────
    print("\n\n【验判据① 排行位置】拿父边唯一且 claim_named 的人当标准答案")
    gold = [p for p in people
            if len(p["parent_edges"]) == 1
            and p["parent_edges"][0]["evidence"] == "claim_named"]
    hit = miss = skip = 0
    bad = []
    for p in gold:
        f = idx.get(p["parent_edges"][0]["parent"])
        sons = [NS(s) for s in (f.get("sons_claimed") or [])] if f else []
        r = rank_of(p["filiation"])
        if not sons or r is None or NS(p["name"]) not in sons:
            skip += 1; continue
        pos = sons.index(NS(p["name"])) + 1
        want = len(sons) if r == -1 else r
        if pos == want:
            hit += 1
        else:
            miss += 1
            if len(bad) < 5:
                bad.append((p, f, sons, pos, want))
    tot = hit + miss
    print(f"   可验 {tot} 人（另有 {skip} 人排行或名单缺，验不了）")
    print(f"   **排行位置对得上 {hit}／{tot} = {hit/tot*100:.2f}%**")
    for p, f, sons, pos, want in bad:
        print(f"     ✘ {p['name']} 谱上写「{p['filiation']}」，"
              f"但在{f['name']}的名单 {sons} 里排第 {pos}")

    # ── 验判据②：房支血统 ────────────────────────────────
    print("\n【验判据② 房支】页眉「XX公世系」里的人，往上追得到 XX 公吗")

    def up(pid, depth=0, seen=None):
        seen = seen or set()
        if depth > 40 or pid in seen:
            return set()
        seen.add(pid)
        p = idx.get(pid)
        if not p:
            return set()
        out = {NS(p["name"])} | {NS(a["form"]) for a in p["aliases"]}
        for e in p["parent_edges"]:
            out |= up(e["parent"], depth + 1, seen)
        return out

    hit2 = miss2 = skip2 = 0
    bad2 = []
    for p in gold[:600]:                       # 取样，递归较慢
        sec = NS(p["src"]["section"]).replace("世系", "")
        head = sec[:-1] if sec.endswith("公") else sec
        if not head or "迁梅始祖" in sec:
            skip2 += 1; continue
        anc = up(p["pid"])
        if head in anc or head + "公" in anc:
            hit2 += 1
        else:
            miss2 += 1
            if len(bad2) < 5:
                bad2.append((p, head))
    t2 = hit2 + miss2
    print(f"   取样 {t2} 人（另 {skip2} 人是始祖段，跳过）")
    print(f"   **往上追得到页眉那位祖先 {hit2}／{t2} = {hit2/t2*100:.2f}%**")
    for p, head in bad2:
        print(f"     ✘ {p['name']} 在「{p['src']['section']}」，但往上追不到「{head}」")


if __name__ == "__main__":
    main()
