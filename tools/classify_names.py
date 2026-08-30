"""
把 spouses[].name_raw 和 daughters_claimed 里的每一条，归入恰好一个类别。

上游 people.json 把若干非姓名内容放进了这两个字段。不改上游数据，
在这一层做分类——每一条都必须落进一个类，落不进的进「未分类」并报出来，
断言：各类之和 == 输入条数。少一条就中止。

分类不是清洗。原文一字不动，只是给它一个正确的抽屉。
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 谱中实际出现的繁简异体（link.py 的 VARIANTS 少了「適」，导致 300 多条女儿没解析出来）
VARIANTS = {"適": "适", "銑": "铣", "璧": "壁", "啟": "启", "於": "于", "蘭": "兰",
            "彛": "彝", "餘": "余", "馀": "余", "後": "后", "陸": "陆", "復": "复",
            "煇": "辉", "壽": "寿", "遷": "迁", "驥": "骥", "楨": "桢", "錫": "锡",
            "鳳": "凤", "氿": "氏"}


def norm(s: str) -> str:
    return "".join(VARIANTS.get(c, c) for c in NS(s))


ORD = "长次幼三四五六七八九十百千元仲季"

# —— 姓名类 ——
RE_SHI        = re.compile(rf"^[{ORD}]?(?P<x>[一-鿿])氏$")                       # 汪氏 / 长王氏
RE_SHI_MING   = re.compile(rf"^[{ORD}]?(?P<x>[一-鿿])氏(?P<g>[一-鿿]{{1,3}})$")   # 李氏雪梅
RE_FULLNAME   = re.compile(r"^(?P<g>[一-鿿]{2,4})$")                             # 胡婷 / 王平权（现代，无「氏」）
# —— 出适类 ——
RE_SHI_SIMPLE = re.compile(rf"^[{ORD}]{{0,2}}适(?P<h>[一-鿿])$")                  # 适陈 / 长适何
RE_SHI_PLACE  = re.compile(rf"^[{ORD}]{{0,2}}适(?P<p>[一-鿿]{{2,4}})(?P<h>[一-鿿])$")  # 长适蕲州梅
RE_SHI_NAMED  = re.compile(r"^(?P<g>[一-鿿]{1,3})适(?P<h>[一-鿿])$")                # 华荣适商
# —— 缺失声明 ——（编谱人明确写下的「这里没有记录」，不是空值）
RE_MISSING = re.compile(r"(缺|未详|未祥|不详|失考|无考)$")
RE_YOUSHANG = re.compile(r"^[长次幼三四五六七八九十]*(幼殁|幼殇|早殁|早夭)$")
# —— 格式领字 ——
LEADERS = {"殁于", "生于", "公殁于", "公生于", "原妣殁于", "原妣生于", "继妣殁于", "时", "幼", "公", "妣", "娶", "俱未字", "未字"}
# —— 错位内容 ——
RE_ADOPT   = re.compile(r"出嗣|兼祧|承祧|兼嗣|承继|为嗣|立[一-鿿]*子|宗祧")
RE_MIGRATE = re.compile(r"^迁|徙居|^居[一-鿿]{2,}|住[一-鿿]{2,}|殁于[一-鿿]{2,}$")
RE_BURIAL  = re.compile(r"^[殁公合俱]*葬|向东|向南|向西|向北|合墓")
RE_REMARRY = re.compile(r"再醮|再蘸|再樵|改醮|改适")


# —— 一格塞了多个女儿：「长适吕次适蔡幼适柴」——必须拆成 3 个人，不是 1 个 ——
RE_MULTI = re.compile(rf"(?:[{ORD}]{{0,2}}适[一-鿿]{{1,4}}){{2,}}$")
RE_ONE   = re.compile(rf"[{ORD}]{{0,2}}适[一-鿿]{{1,4}}")
# —— 干支纪年整串（生卒被错放进姓名格）——
RE_DATE = re.compile(r"(年|月|日|时)$|^[一-鿿]{0,4}(光绪|同治|咸丰|道光|嘉庆|乾隆|雍正|康熙|顺治|民国|宣统|万历|崇正|崇祯|天启|一九|二零)")
# —— 「某氏」开头但后面跟了一整条记录 ——
RE_SHI_TAIL = re.compile(r"^(?P<x>[一-鿿])氏(?P<tail>.{3,})$")
# —— 「某氏X」里 X 是状态不是名字 ——
STATUS_AFTER_SHI = {"早逝", "早殁", "早夭", "无出", "幼殇", "幼殁", "失考", "未详",
                    "待补", "夭", "殇", "无嗣", "未字", "再醮", "改适",
                    "生于", "殁于", "葬", "生殁", "殁葬"}
# —— 关系词开头（「侧室松邑」的「松邑」是宿松，不是名）——
RE_RELWORD = re.compile(r"^(侧室|继室|元配|副室|next|庶室|如夫人)")


def classify(raw: str, kind: str) -> tuple[str, dict]:
    """返回 (类别, 解析出的结构)。kind = '配偶' | '女'"""
    t = norm(raw)
    if not t:
        return "空", {}

    # 一格多人优先判：它会影响人数，不能当成一条
    if kind == "女" and RE_MULTI.fullmatch(t):
        parts = RE_ONE.findall(t)
        return "出适·一格多人（须拆分）", {"split": parts, "count": len(parts)}

    if t in LEADERS:
        return "格式领字（谱的书写体例，非姓名）", {}
    if RE_YOUSHANG.match(t):
        return "缺失声明·幼殁", {}
    if RE_MISSING.search(t) and len(t) <= 10:
        return "缺失声明（殁葬缺／未详／失考）", {}
    if RE_REMARRY.search(t):
        return "改嫁标记（再醮／再蘸）", {}
    if RE_ADOPT.search(t):
        return "错位·过继语句", {"sentence": raw}
    if RE_MIGRATE.match(t):
        return "错位·迁徙记录", {"sentence": raw}
    if RE_BURIAL.match(t):
        return "错位·葬地山向", {"sentence": raw}
    if len(t) >= 20:
        return "错位·传赞或长句", {"sentence": raw}

    if kind == "配偶":
        if (m := RE_SHI_MING.match(t)):
            g = m["g"]
            # 「杨氏早逝」「周氏无出」——「氏」后面跟的是状态，不是名字。
            # 不改原文，只是不把它当名字；整条归到缺失声明／状态。
            if g in STATUS_AFTER_SHI:
                return f"姓名·某氏＋状态（{g}，非名字）", {"surname": m["x"], "status": g}
            return "姓名·某氏＋名", {"surname": m["x"], "given": g}
        if (m := RE_SHI.match(t)):
            return "姓名·某氏", {"surname": m["x"]}
        if RE_RELWORD.match(t):
            return "关系词＋籍贯（如「侧室松邑」），非姓名", {"sentence": raw}
        if (m := RE_FULLNAME.match(t)):
            return "姓名·全名（现代，不带「氏」）", {"given": m["g"]}
    else:
        # ★ 顺序要紧：先判排行，再判人名。
        #   反过来会把「长适程」读成「名叫长、嫁给程」——「长」是排行不是名字。
        #   我改成 1 字后就踩了这个坑，出适·本人有名 从 120 虚涨到 362。
        if (m := RE_SHI_SIMPLE.match(t)):
            return "出适·夫家姓", {"husband_surname": m["h"]}
        if (m := RE_SHI_PLACE.match(t)):
            return "出适·夫家姓＋籍贯", {"place": m["p"], "husband_surname": m["h"]}
        if (m := RE_SHI_NAMED.match(t)):
            return "出适·本人有名", {"given": m["g"], "husband_surname": m["h"]}
        if re.fullmatch(rf"[{ORD}]{{0,2}}适", t):
            # 「次适」——谱只写了排行和「适」，夫家姓没写。缺是谱的缺，不补。
            return "出适·夫家姓谱上未写", {}

    # 干支/年号整串被错放进姓名格
    if RE_DATE.search(t):
        return "错位·生卒年月（被放进姓名格）", {"sentence": raw}
    # 「某氏」开头后面跟了一整条记录
    if kind == "配偶" and (m := RE_SHI_TAIL.match(t)):
        return "姓名·某氏＋后续记录粘连", {"surname": m["x"], "tail": m["tail"]}
    # 单字：只写了姓，没写「氏」
    if re.fullmatch(r"[一-鿿]", t):
        return ("姓名·仅一姓字" if kind == "配偶" else "错位·单字（非女儿）"), {"surname": t}
    # 男性谱名被放进 daughters_claimed
    if kind == "女" and re.fullmatch(r"[一-鿿]{2}", t):
        return "错位·疑为男性谱名（放进了女儿格）", {"name": t}

    return "未分类", {}


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    rows = []
    for p in people:
        for s in p["spouses"]:
            rows.append(("配偶", s["name_raw"], p))
        for d in p["daughters_claimed"]:
            rows.append(("女", d, p))

    stats: dict[str, Counter] = {"配偶": Counter(), "女": Counter()}
    unclassified: list[tuple] = []
    for kind, raw, p in rows:
        cls, _ = classify(raw, kind)
        stats[kind][cls] += 1
        if cls == "未分类":
            unclassified.append((kind, raw, p["name"], p["src_human"]))

    for kind in ("配偶", "女"):
        total = sum(stats[kind].values())
        print(f"\n=== {kind}  共 {total} 条 ===")
        for cls, n in stats[kind].most_common():
            print(f"   {n:>5}  {n/total*100:5.1f}%  {cls}")

    # 断言：进出相等
    total_in = len(rows)
    total_out = sum(sum(c.values()) for c in stats.values())
    if total_in != total_out:
        print(f"\n✗ 守恒失败：进 {total_in} 出 {total_out}")
        sys.exit(1)
    print(f"\n✓ 守恒通过：{total_in} 条全部归类")

    print(f"\n=== 未分类 {len(unclassified)} 条（全部列出，一条不省）===")
    for kind, raw, host, src in unclassified:
        print(f"   [{kind}] {raw!r:<28} 记在 {host} 名下  {src}")


if __name__ == "__main__":
    main()
