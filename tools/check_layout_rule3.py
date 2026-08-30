"""
版式规律（第三版，前两版都猜错了结构）。

第一版以为「父在同页上一行」——只对 54%。
第二版以为「每页 5 行，排满换页」——错，页码跟行号无关。

**真正的结构**：pid 里的「行」不是纸上的第几行，是**这一段世系里的第几代**。
每个世系段（页眉写的那个「XX公世系」）排 5 代，行号 1–5；
排到第 5 代，就另起一段，从行号 1 接着排。页码只是往后翻。

    父的行号 = 子的行号 − 1        （在同一段里）
    子在第 1 行时，父是上一段的第 5 行

所以判据是：**同一册 + 同一个页眉房支 + 行号减 1 + 父的页码不大于子的页码**。
这全是谱自己印在纸上的坐标，不是我们推的关系。
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


def relation(child, father) -> str:
    a, b = coord(child["pid"]), coord(father["pid"])
    if not a or not b:
        return "坐标读不出"
    sa, sb = child["src"]["section"], father["src"]["section"]
    if a[2] - b[2] == 1:
        if a[0] == b[0] and sa == sb and b[1] <= a[1]:
            return "同段上一代"
        return "行号对但不同段/册"
    if a[2] == 1 and b[2] == 5:
        return "接上一段第5代"
    return f"行号差{a[2] - b[2]}"


GOOD = ("同段上一代", "接上一段第5代")


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    gold = [p for p in people
            if len(p["parent_edges"]) == 1
            and p["parent_edges"][0]["evidence"] == "claim_named"]
    c, bad = Counter(), {}
    for p in gold:
        f = idx.get(p["parent_edges"][0]["parent"])
        if not f:
            continue
        k = relation(p, f)
        c[k] += 1
        bad.setdefault(k, []).append((p, f))

    tot = sum(c.values())
    ok = sum(v for k, v in c.items() if k in GOOD)
    print(f"标准答案 {tot} 人（父边唯一 + 父亲的生子名单点了本人的名）\n")
    for k, v in c.most_common():
        print(f"   {'✔' if k in GOOD else '✘'} {v:>5}　{v/tot*100:>5.1f}%　{k}")
    print(f"\n   规律命中 {ok}/{tot} = {ok/tot*100:.2f}%")

    for k, v in c.items():
        if k in GOOD:
            continue
        print(f"\n反例「{k}」{v} 个，看 5 个：")
        for p, f in bad[k][:5]:
            print(f"   {p['name']}（{p['src_human']}）")
            print(f"     父 {f['name']}（{f['src_human']}）")

    # ── 用规律分那 157 条 ────────────────────────────────
    todo = json.loads(Path("data/homonym_todo.json").read_text(encoding="utf-8"))
    res, left = Counter(), []
    resolved = []
    for t in todo:
        me = idx[t["pid"]]
        hits = [x for x in t["cands"] if relation(me, idx[x["pid"]]) in GOOD]
        if len(hits) == 1:
            res["版面只指向一个"] += 1
            resolved.append({"pid": t["pid"], "name": t["name"], "gen": t["gen"],
                             "parent": hits[0]["pid"], "parent_name": hits[0]["name"],
                             "why": relation(me, idx[hits[0]["pid"]]),
                             "src_human": t["src_human"],
                             "parent_src": hits[0]["src_human"]})
        elif not hits:
            res["一个都不合"] += 1; left.append(t)
        else:
            res[f"{len(hits)} 个都合"] += 1; left.append(t)
    print(f"\n拿规律去分那 {len(todo)} 条：")
    for k, v in res.most_common():
        print(f"   {v:>4}　{k}")
    Path("data/homonym_layout.json").write_text(
        json.dumps(resolved, ensure_ascii=False, indent=1), encoding="utf-8")
    Path("data/homonym_todo.json").write_text(
        json.dumps(left, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n   版面能定的 {len(resolved)} 条 → data/homonym_layout.json")
    print(f"   还要人核的 {len(left)} 条 → data/homonym_todo.json")

    if left:
        print(f"\n剩下这 {len(left)} 条，头 8 条：\n")
        for t in left[:8]:
            me = idx[t["pid"]]
            print(f"第{t['gen']:>2}世 {t['name']}　{t['src_human']}　父名「{t['father_name']}」{t['filiation']}")
            for x in t["cands"]:
                print(f"     · {x['name']}　{x['src_human']}　[{relation(me, idx[x['pid']])}]"
                      + ("　←生子名单点了名" if x["names_me"] else ""))
            print()


if __name__ == "__main__":
    main()
