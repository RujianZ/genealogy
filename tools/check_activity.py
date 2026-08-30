"""用活跃时间段再筛一遍那 145 条，看能定下几条。"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, "tools")
from activity import build, can_father  # noqa: E402
from check_homonym_years import year_of  # noqa: E402


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    W = build(people)

    # 覆盖率先看
    n = len(people)
    exact = sum(1 for w in W.values() if w.born)
    rng = sum(1 for w in W.values() if not w.born and (w.lo or w.hi))
    print(f"全谱 {n} 人")
    print(f"  **生年确定**　　{exact}　= {exact/n*100:.1f}%")
    print(f"  只框得出区间　　{rng}　= {rng/n*100:.1f}%")
    print(f"  完全不知道　　　{n-exact-rng}　= {(n-exact-rng)/n*100:.1f}%")
    print(f"  **加起来能定年代的 {(exact+rng)/n*100:.1f}%**（原来只有生年那一项 79.3%）\n")

    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    A = D["A同名分不清"]
    print(f"拿它去筛那 {len(A)} 条同名：")
    r = Counter()
    ex = []
    for x in A:
        cw = W[x["pid"]]
        keep, drop = [], []
        for k in x["cands"]:
            ok, why = can_father(W[k["pid"]], cw)
            (keep if ok else drop).append((k, why))
        if drop and len(keep) == 1:
            r["**排到只剩一个**"] += 1
            if len(ex) < 8:
                ex.append((x, keep, drop))
        elif drop:
            r["排掉一些，仍多于一个"] += 1
        else:
            r["一个也排不掉"] += 1
    for k, v in r.most_common():
        print(f"   {v:>4}　{k}")

    print("\n例子：\n")
    for x, keep, drop in ex:
        p = idx[x["pid"]]
        print(f"  {p['name']}（第{p['gen']}世 {p['src_human']}）"
              f"父名「{x['father_name']}」　{W[p['pid']].note()}")
        for k, why in keep:
            print(f"     ✔ {k['name']}　{k['src_human']}　{W[k['pid']].note()}")
        for k, why in drop:
            print(f"     ✘ {k['name']}　{k['src_human']}　{why}")
        print()


if __name__ == "__main__":
    main()
