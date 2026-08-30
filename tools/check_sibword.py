"""
过继语句里的**称谓**能不能把嗣父定下来？

谱上写过继，常常写成：
    次子泽刚出嗣**三弟**铣福
    承祧**胞兄**壁环壁岳
    立朝相次子啟昌为嗣

「三弟」「胞兄」是**写这句话的人**跟嗣父的关系。
写这句话的人是本人的生父，所以：

    嗣父是生父的兄弟  →  **嗣父跟生父同一个父亲**

三个同名的铣福里，跟生父同父的那一个才是。
**这不是猜，是读「三弟」两个字。** 称谓是谱自己写的，兄弟关系也是谱自己写的。

先数一数这条判据够得着多少，再看它在能确定的例子上准不准。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 「兄弟」类称谓——说明嗣父跟说话人是同辈手足
SIB = re.compile(r"(胞兄|胞弟|亲兄|亲弟|长兄|次兄|"
                 r"[二三四五六七八九]兄|[二三四五六七八九]弟|兄|弟)")
# 「侄」类——说明嗣父是说话人的下一辈，那不是同父
OTHER = re.compile(r"(胞侄|侄|从子|族弟|族兄|堂弟|堂兄)")


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    doubts = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    A = [x for x in doubts["A同名分不清"] if x["kind"] == "嗣父"]
    print(f"A 类里关系是「嗣父」的：{len(A)} 条\n")

    # matched_as 里带称谓的有多少
    c = Counter()
    usable = []
    for x in A:
        p = idx[x["pid"]]
        ms = [e["matched_as"] for e in p["parent_edges"] if e["evidence"] == "stated_adopt"]
        blob = " ".join(ms)
        if OTHER.search(blob):
            c["带称谓，但不是同父的兄弟（侄/族/堂）"] += 1
        elif SIB.search(blob):
            c["**带兄弟称谓**"] += 1
            usable.append((x, blob, SIB.search(blob).group(1)))
        elif blob:
            c["有过继语句，但没写称谓"] += 1
        else:
            c["没有过继语句"] += 1
    for k, v in c.most_common():
        print(f"   {v:>4}　{k}")

    # 说这句话的人是谁？——他的原文里含这句
    print(f"\n拿「嗣父与生父同父」去筛，看能定下几条：")
    solved = partial = none = 0
    ex = []
    for x, blob, word in usable:
        p = idx[x["pid"]]
        # 找说话人：原文里含这句过继语的人（通常是生父）
        speakers = [q for q in people
                    if q["pid"] != p["pid"] and NS(blob[:12]) and NS(blob[:12]) in NS(q["raw_text"])]
        if not speakers:
            none += 1; continue
        sp = speakers[0]
        spf = {e["parent"] for e in sp["parent_edges"]}
        if not spf:
            none += 1; continue
        keep = [k for k in x["cands"]
                if spf & {e["parent"] for e in idx[k["pid"]]["parent_edges"]}]
        if len(keep) == 1:
            solved += 1
            if len(ex) < 5:
                ex.append((p, sp, word, keep[0], x["cands"]))
        elif keep:
            partial += 1
        else:
            none += 1
    print(f"   **定到唯一**　　{solved}")
    print(f"   缩小但仍多个　　{partial}")
    print(f"   定不了　　　　　{none}")

    print("\n例子：\n")
    for p, sp, word, win, cands in ex:
        print(f"  {p['name']}（第{p['gen']}世 {p['src_human']}）")
        print(f"    生父 {sp['name']}（{sp['src_human']}）原文写「…{word}…」")
        print(f"    {len(cands)} 个同名候选里，跟生父同父的只有：")
        print(f"      ✔ {win['name']}　{win['src_human']}")
        for k in cands:
            if k["pid"] != win["pid"]:
                print(f"      ✘ {k['name']}　{k['src_human']}")
        print()


if __name__ == "__main__":
    main()
