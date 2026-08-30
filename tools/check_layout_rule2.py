"""
把版式规律补全，再拿去分那 157 条重名。

第一版只验了「同页上一行」，559 例零反例。剩下 475 例是跨页——
族谱世系表每页 5 行（5 代），排到第 5 行就换页，下一页从第 1 行接着排。
所以完整的规律是：

    父在同页上一行           （子的行号 ≥ 2）
    父在某一页的第 5 行       （子在第 1 行，跨页接上）

第二条要加一个闸：**跨页接的那一页必须是同一册**，
而且页眉写的房支（src.section）要能对上——页眉是谱自己印的，不是我们分的。

**这不是推断亲子关系，是读版式。** 谱把父子印在相邻的格子里，
我们只是把格子的坐标读出来。读错了能一眼核对：出处就在旁边。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")
ROWS_PER_PAGE = 5


def coord(pid: str):
    m = PID.match(pid)
    return (m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))) if m else None


def relation(child, father) -> str:
    """子和父在版面上是什么位置关系。"""
    a, b = coord(child["pid"]), coord(father["pid"])
    if not a or not b:
        return "坐标读不出"
    if a[0] != b[0]:
        return "不同册"
    if a[1] == b[1]:
        return "同页上一行" if a[2] - b[2] == 1 else f"同页但差{a[2]-b[2]}行"
    if a[2] == 1 and b[2] == ROWS_PER_PAGE and b[1] < a[1]:
        return "跨页接第5行"
    if a[2] == 1 and b[1] < a[1]:
        return f"跨页但父在第{b[2]}行"
    return "别的"


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    gold = [p for p in people
            if len(p["parent_edges"]) == 1
            and p["parent_edges"][0]["evidence"] == "claim_named"]
    c = Counter()
    bad: dict[str, list] = {}
    for p in gold:
        f = idx.get(p["parent_edges"][0]["parent"])
        if not f:
            continue
        k = relation(p, f)
        c[k] += 1
        bad.setdefault(k, []).append((p, f))

    tot = sum(c.values())
    print(f"标准答案 {tot} 人，版面位置关系：\n")
    for k, v in c.most_common():
        star = "✔" if k in ("同页上一行", "跨页接第5行") else "✘"
        print(f"   {star} {v:>5}　{v/tot*100:>5.1f}%　{k}")

    for k, v in c.items():
        if k in ("同页上一行", "跨页接第5行"):
            continue
        print(f"\n反例「{k}」共 {v} 个，看 4 个：")
        for p, f in bad[k][:4]:
            print(f"   {p['name']}（{p['src_human']}）")
            print(f"     父 {f['name']}（{f['src_human']}）")

    # 同一房支的比例——页眉是谱自己印的
    same_sec = sum(1 for p in gold
                   if (f := idx.get(p["parent_edges"][0]["parent"]))
                   and p["src"]["section"] == f["src"]["section"])
    print(f"\n父子在同一个页眉房支下的：{same_sec}/{tot} = {same_sec/tot*100:.1f}%")

    # ── 拿规律去分那 157 条 ──────────────────────────────
    todo = json.loads(Path("data/homonym_todo.json").read_text(encoding="utf-8"))
    res = Counter()
    left = []
    for t in todo:
        me = idx[t["pid"]]
        ok = [x for x in t["cands"]
              if relation(me, idx[x["pid"]]) in ("同页上一行", "跨页接第5行")]
        if len(ok) == 1:
            res["版面位置只指向一个"] += 1
        elif not ok:
            res["一个都不合版面"] += 1
            left.append((t, "none"))
        else:
            res[f"{len(ok)} 个都合版面"] += 1
            left.append((t, ok))
    print(f"\n拿这条规律去分那 {len(todo)} 条：")
    for k, v in res.most_common():
        print(f"   {v:>4}　{k}")

    print(f"\n还剩 {len(left)} 条，头 6 条：\n")
    for t, ok in left[:6]:
        me = idx[t["pid"]]
        print(f"第{t['gen']:>2}世 {t['name']}　{t['src_human']}　父名「{t['father_name']}」{t['filiation']}")
        for x in t["cands"]:
            print(f"     · {x['name']}　{x['src_human']}　[{relation(me, idx[x['pid']])}]"
                  + ("　←生子名单点了名" if x["names_me"] else ""))
        print()


if __name__ == "__main__":
    main()
