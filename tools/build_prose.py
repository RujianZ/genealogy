"""
把世系正文里的事迹切出来。**准确第一。**

★ 不「剥」，要「分」。

  上一版拿正则去 sub 掉骨架，剥出来的是碎的：
      「梁善庆士屡试前矛法于嘉庆元年丙辰正月初八日亥时光覆光载…」
  读不通，因为它把一行从中间剪断了。

  正确做法：**按谱的排版行走**。raw_text 里保留着原书的换行，
  一行就是一行。每一行只判一件事：**这一行是骨架，还是话？**

★ 判定只看这一行本身，规则写死、能核：

  骨架行 —— 名、字、讳、号、某公某子、生于、殁于、葬、娶妣、
            生子N、女N、适X、年X岁、向X、有碑、合墓、缺/未详
  话　　 —— 其余全部

★ 校验：**每一行必须且只能归一处**。
  骨架行字数 + 事迹行字数 == 原文总字数。差一个字就报错。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# ── 骨架行的样子。每条都能对着谱核 ──────────────────────
SKEL_PATTERNS: list[tuple[str, str]] = [
    ("生卒",   r"^(生|殁|卒)[于於]?$"),
    # 现代写法：整句挤成一行——「公殁于二0一三年二月二十五日（农历正月十六）丑时」
    ("生卒",   r"^[公妣氏]?[生殁卒][于於]"),
    ("生卒",   r"^[公妣]殁"),
    ("生卒",   r"^(生|殁|卒)[于於]"),
    ("生卒",   r"^[一-鿿\d]{1,6}年[一-鿿\d]{0,12}[月日时][一-鿿\d]{0,10}$"),
    ("生卒",   r"^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]"),
    ("生卒",   r"^(月|日|时)[一-鿿\d]{0,14}$"),
    ("生卒",   r"^[一二三四五六七八九十廿卅初\d]{1,4}[月日]"),
    ("寿",     r"^[年享寿]?[年寿][一二三四五六七八九十百廿卅\d]{1,4}(岁|余|有奇)?$"),
    # 葬地写法很多：葬 / 俱葬 / 合葬 / 迁葬 / 改葬 / 附葬 / 厝 / 殡
    ("葬",     r"^[俱合迁改附另重]?[葬厝殡]"),
    ("葬",     r"^[一-鿿\d]{0,12}[日时]葬"),          # 「咸丰七年五月十四日巳时葬…」
    ("葬",     r"^葬[于於]"),
    ("住址",   r"^(居|住|寓|住址)[一-鿿\d]{2,}"),
    ("法名",   r"^法名[一-鿿]{1,4}$"),
    ("功名",   r"^(儒士|庠生|贡生|监生|生员|太学生|国学生|附生|增生|廪生|例贡|武生)"),
    ("葬",     r"^(向|坐|同向|合墓|有碑|无碑)"),
    ("配偶",   r"^(妣|娶|聘|继|庶|副室|侧室|室)[一-鿿]{0,6}氏?$"),
    ("配偶",   r"^(妣|娶|聘|继|庶)[一-鿿]{1,4}氏"),
    ("子女",   r"^(生|季|嗣|继|养|承|抚)?子[一二三四五六七八九十\d]+$"),
    ("子女",   r"^女[一二三四五六七八九十\d]+$"),
    ("子女",   r"^[长次三四五六七八九幼元]?适[一-鿿]{1,3}$"),
    # 单独一行的短名字**只在名单里才算名字**——不能见短就当名字，
    # 「节劲松高」「有善而弗知」这种会被吃掉。见 classify() 的 own_names。
    ("父",     r"^[一-鿿]{1,4}公?[长次三四五六七八九幼元]?[子女]$"),
    ("名字",   r"^字[一-鿿]{1,4}$"),
    ("名字",   r"^[讳号名][一-鿿]{1,4}$"),
    ("缺",     r"^(生殁葬?[俱都]?缺|未详|失考|缺|无考|殁葬缺|公妣[殁葬缺]+)$"),
]
SKEL = [(k, re.compile(v)) for k, v in SKEL_PATTERNS]


def classify(line: str, own_names: set[str], in_list: bool) -> str:
    """这一行是骨架还是话。

    in_list = 上一行是「生子三」这类，正在列名单——这时短行才当名字。
    """
    t = NS(line)
    if not t:
        return "空"
    if t in own_names:
        return "名字"
    # ★ 只有**名单里点过的名字**，或正在列名单时的短行，才算名字。
    #   否则「节劲松高」「弗传不仁也」这种四五个字的话会被当成名字吃掉。
    if in_list and 2 <= len(t) <= 3:
        return "子女"
    for k, rx in SKEL:
        if rx.match(t):
            return k
    return "话"


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    out = []
    tally = Counter()
    total = skel = prose = 0
    bad = []

    for p in people:
        own = {NS(p["name"]), NS(p["name_raw"])}
        for f in ("zi", "hui", "hao", "ming"):
            if p.get(f):
                own.add(NS(p[f]["text"]))
        own |= {NS(s) for s in p["sons_claimed"]}
        own |= {NS(s) for s in p["daughters_claimed"]}
        own |= {NS(s["name_raw"]) for s in p["spouses"]}

        marks = []
        in_list = False
        for ln in p["raw_text"].split("\n"):
            t = NS(ln)
            total += len(t)
            k = classify(ln, own, in_list)
            # 「生子三」之后跟着的是名单，遇到别的骨架行就结束
            if re.match(r"^(生|季|嗣|继|养|承|抚)?子[一二三四五六七八九十\d]+$", t):
                in_list = True
            elif k not in ("子女", "空", "名字"):
                in_list = False
            tally[k] += 1
            marks.append((k, ln))
            if k == "话":
                prose += len(t)
            else:
                skel += len(t)

        # ★ 连着的「话」行并成一段。谱是窄栏排的，一句话会断成好几行：
        #     │ 礼有之先祖 / 有善而弗知 / 不明也知而 / 弗传不仁也
        #   合并只是把换行去掉，**一个字都不动、不加标点**。
        paras, cur = [], []
        for k, ln in marks:
            if k == "话":
                cur.append(ln.strip())
            elif k != "空" and cur:
                paras.append("".join(cur)); cur = []
        if cur:
            paras.append("".join(cur))
        paras = [x for x in paras if NS(x)]

        if paras:
            out.append({
                "pid": p["pid"], "name": p["name"], "gen": p["gen"],
                "src_human": p["src_human"], "src": p["src"],
                "paras": paras,
                "chars": sum(len(NS(x)) for x in paras),
            })

    # ★ 字符守恒：每一行只能归一处
    if skel + prose != total:
        print(f"✘ 字符对不上！骨架 {skel} + 事迹 {prose} != 总数 {total}")
        return
    print(f"✔ 字符守恒：骨架 {skel:,} + 事迹 {prose:,} = 原文 {total:,}\n")

    print("每一行归到哪：")
    for k, v in tally.most_common():
        print(f"   {v:>6}　{k}")

    print(f"\n有话的条目：**{len(out)} 条**，共 **{prose:,} 字**")
    b = Counter()
    for x in out:
        b["1–7 字（多半是零碎）" if x["chars"] < 8
          else "8–30 字" if x["chars"] < 31
          else "31–80 字" if x["chars"] < 81 else "80 字以上（成段的）"] += 1
    for k in ("1–7 字（多半是零碎）", "8–30 字", "31–80 字", "80 字以上（成段的）"):
        if b[k]:
            print(f"   {b[k]:>5}　{k}")

    Path("data/prose_raw.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n→ data/prose_raw.json")

    print("\n抽 6 条看切得对不对（**按原文的行，没有从中间剪断**）：\n")
    for x in sorted(out, key=lambda v: -v["chars"])[:6]:
        print(f"  {x['name']}（第{x['gen']}世 {x['src_human']}）{x['chars']} 字")
        for g in x["paras"]:
            print(f"      │ {g}")
        print()


if __name__ == "__main__":
    main()
