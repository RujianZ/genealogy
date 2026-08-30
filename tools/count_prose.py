"""
谱里「不是骨架」的文字有多少？

人物条目的骨架是固定的：名 / 字 / 某公某子 / 生于X / 殁于X / 葬X /
娶X / 生子N：… / 女N：适X。这几样是格式，不是文章。

**把骨架剥掉，剩下的就是事迹、口传、闲笔、案卷、争产、迁徙、殉难、节烈……**
那才是这部谱里有温度的部分。数一数到底有多少。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 骨架：这些是格式，不是文章
SKEL = [
    r"生[于於][^生殁葬娶妣聘继庶]{0,26}",
    r"殁[于於][^生殁葬娶妣聘继庶]{0,26}",
    r"[年享]?寿?年[一二三四五六七八九十百廿卅\d]{1,4}岁?",
    r"葬[^生殁娶妣聘继庶子女]{0,24}",
    r"[娶妣聘继庶]{1,2}[一-鿿]{1,4}氏",
    r"生子[一二三四五六七八九十\d]+",
    r"[季嗣继养承抚]子[一二三四五六七八九十\d]+",
    r"女[一二三四五六七八九十\d]+",
    r"[长次三四五六七八九幼元]适[一-鿿]{1,3}",
    r"适[一-鿿]{1,3}",
    r"[一-鿿]{1,3}公[长次三四五六七八九幼元]?子",
    r"字[一-鿿]{1,3}",
    r"[讳号名][一-鿿]{1,3}",
    r"有碑|合墓|同向|向[东南西北]{1,2}|[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥][山向]",
    r"生殁葬?[俱都]?缺|未详|失考|殁葬缺",
]
RE_SKEL = re.compile("|".join(SKEL))


def strip_skeleton(t: str) -> str:
    s = NS(t)
    prev = None
    while prev != s:
        prev = s
        s = RE_SKEL.sub("", s)
    # 剩下的标点、数字、单字残渣不算文章
    s = re.sub(r"[，。、；：？！「」『』（）()0-9０-９]", "", s)
    return s


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    shou = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
    pas = json.loads(Path("data/passages.json").read_text(encoding="utf-8"))

    print("══ 一、卷首篇目 ══\n")
    tbl = {"甲子録", "明朝年代表", "清朝年代表", "历届修谱名目",
           "历届领老谱名目", "黄梅张氏三十六户地址", "新取字派", "八派图"}
    prose = [d for d in shou if (d.get("title_read") or d["title"]) not in tbl]
    table = [d for d in shou if (d.get("title_read") or d["title"]) in tbl]
    pc = sum(len(NS(d["text"])) for d in prose)
    tc = sum(len(NS(d["text"])) for d in table)
    print(f"   文章 {len(prose)} 篇　**{pc:,} 字**")
    print(f"   表册 {len(table)} 篇　{tc:,} 字（年号表、名目、地址、字派——不是文章）")

    print("\n══ 二、人物条目里，剥掉骨架剩下的字 ══\n")
    tot = kept = 0
    rows = []
    for p in people:
        raw = NS(p["raw_text"])
        tot += len(raw)
        left = strip_skeleton(raw)
        kept += len(left)
        if len(left) >= 8:
            rows.append((len(left), p, left))
    rows.sort(key=lambda x: -x[0])
    print(f"   人物条目原文共 {tot:,} 字")
    print(f"   剥掉骨架后剩 **{kept:,} 字**（{kept/tot*100:.1f}%）")
    print(f"   剩 8 字以上的条目：**{len(rows)} 条**\n")

    print("   最长的 12 条：\n")
    for n, p, left in rows[:12]:
        print(f"   {n:>4} 字　{p['name']}（第{p['gen']}世 {p['src_human']}）")
        print(f"          {left[:110]}")

    print("\n\n══ 三、已经切出来的「记事」 ══\n")
    print(f"   {len(pas)} 段，共 {sum(x['chars'] for x in pas):,} 字")
    for k, v in Counter(k for x in pas for k in x["kinds"]).most_common():
        print(f"      {v:>4}　{k}")

    print("\n══ 四、marks（标记里带正文的）══\n")
    mk = [(p, m) for p in people for m in p["marks"] if NS(m.get("text") or "")]
    print(f"   {len(mk)} 条，共 {sum(len(NS(m['text'])) for _, m in mk):,} 字")
    for k, v in Counter(m["tag"] for _, m in mk).most_common(12):
        print(f"      {v:>4}　{k}")

    print("\n══ 五、unparsed（解析器没归入字段的原文行）══\n")
    up = [(p, u) for p in people for u in p["unparsed"]]
    print(f"   {len(up)} 行，共 {sum(len(NS(u['text'])) for _, u in up):,} 字")

    print("\n" + "═" * 60)
    print(f"合计「不是骨架的文字」：**约 {pc + kept:,} 字**")
    print(f"   卷首文章 {pc:,} + 人物条目里的非骨架 {kept:,}")


if __name__ == "__main__":
    main()
