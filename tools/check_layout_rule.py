"""
验一条版式规律：父亲是不是就印在同一页的上一行？

族谱世系表是按格子排的，pid 自带坐标：P-册3-0205-4-1-0 = 册3·第205页·第4行·第1列。
如果「父亲 = 同册同页、行号减 1」在**已经能确定的人**身上普遍成立，
那它就是这本书的版式，不是我们的猜测——那 157 条重名就能靠它分开。

**先验证，再使用。** 拿 rank1（父亲的生子名单点了本人的名）当标准答案：
那批人的父子关系是谱自己写死的，不掺任何推断。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")


def coord(pid: str):
    m = PID.match(pid)
    return (m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))) if m else None


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    # 标准答案：只有一条父边，且是 claim_named（父亲的生子名单点了名）
    gold = [p for p in people
            if len(p["parent_edges"]) == 1
            and p["parent_edges"][0]["evidence"] == "claim_named"]
    print(f"标准答案（父边唯一且父亲点了名）：{len(gold)} 人\n")

    c = Counter()
    examples: dict[str, list] = {}
    for p in gold:
        f = idx.get(p["parent_edges"][0]["parent"])
        a, b = coord(p["pid"]), coord(f["pid"]) if f else None
        if not a or not b:
            c["pid 格式对不上"] += 1; continue
        if a[0] != b[0] or a[1] != b[1]:
            k = "父亲不在同一页"
        elif a[2] - b[2] == 1:
            k = "**父亲在同页上一行**"
        elif a[2] == b[2]:
            k = "同页同一行"
        else:
            k = f"同页但差 {a[2] - b[2]} 行"
        c[k] += 1
        examples.setdefault(k, []).append((p, f))

    tot = sum(c.values())
    for k, v in c.most_common():
        print(f"   {v:>5}　{v/tot*100:>5.1f}%　{k}")

    for k in ("父亲不在同一页", "同页同一行"):
        if k in examples:
            print(f"\n「{k}」抽 3 个看看：")
            for p, f in examples[k][:3]:
                print(f"   {p['name']}（{p['src_human']}）")
                print(f"     父 {f['name']}（{f['src_human']}）")

    # 反过来验：157 条待核里，「同页上一行」的候选是不是唯一的？
    todo = json.loads(Path("data/homonym_todo.json").read_text(encoding="utf-8"))
    hit1 = hit0 = hitn = 0
    for t in todo:
        a = coord(t["pid"])
        same = [x for x in t["cands"]
                if (b := coord(x["pid"])) and b[0] == a[0] and b[1] == a[1] and a[2] - b[2] == 1]
        if len(same) == 1:
            hit1 += 1
        elif not same:
            hit0 += 1
        else:
            hitn += 1
    print(f"\n拿这条规律去看那 {len(todo)} 条待核：")
    print(f"   **只有一个候选在同页上一行**　{hit1}")
    print(f"   一个都不在同页上一行　　　　{hit0}")
    print(f"   多个都在同页上一行　　　　　{hitn}")


if __name__ == "__main__":
    main()
