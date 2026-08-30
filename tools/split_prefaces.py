"""
「旧序」不是一篇，是五篇拼在一起——拆开。

用户记得「更早还修过，程万里帮忙修过，焕先当时也在」。查下去果然：
卷首那篇 2583 字的「旧序」里，落款有五个：

    康熙四十九年（1710）　同里姻弟 **程万里** 素怀氏 拜撰　← 外姓
    乾隆四年　 （1739）　十八世 **学光** 谨序
    乾隆四十一年（1776）　十九世 **古岩国茂** 谨序
    道光五年　 （1825）　二十世 **默齐拔萃** 谨序
    道光十九年 （1839）　二十二世孙 **穿杨必端** 谨叙

加上另外几篇，十届的序正好齐了。

★ 校验：拆出来的五段拼回去，必须一字不差等于原文。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 每篇的落款——**照抄原文**，用来切
SIGNS = [
    ("大清康熙四十九年岁次庚寅蒲月同里姻弟程万里素怀氏拜撰",
     "康熙四十九", "1710", "同里姻弟 程万里（字素怀）", True),
    ("大清乾隆四年岁次己未仲春月十八世系学光谨序",
     "乾隆四", "1739", "十八世 学光", False),
    ("大清乾隆四十一年丙申仲春月谷旦十九世古岩国茂谨序",
     "乾隆四十一", "1776", "十九世 古岩国茂", False),
    ("大清道光五年岁次乙酉仲夏月谷旦二十世默齐拔萃谨序",
     "道光五", "1825", "二十世 默齐拔萃", False),
    ("大清道光十九年岁次己亥仲冬月谷旦二十二世孙穿杨必端谨叙",
     "道光十九", "1839", "二十二世孙 穿杨必端", False),
]


def main() -> None:
    S = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
    d = next(x for x in S if x["id"] == "03_旧序")
    t = NS(d["text"])

    parts, at = [], 0
    for sign, era, ad, who, outsider in SIGNS:
        i = t.find(sign, at)
        if i < 0:
            print(f"✘ 找不到落款：{sign[:20]}…")
            return
        end = i + len(sign)
        body = t[at:end]
        # 每篇开头那两个「旧序」字样是标题，不是正文
        title = "旧序"
        if body.startswith("旧序"):
            body = body[2:]
        parts.append({
            "era": era, "ad": ad, "author": who, "outsider": outsider,
            "sign": sign, "text": body, "chars": len(body),
            "at": at, "end": end,
        })
        at = end

    used = "".join(("旧序" if p["at"] == 0 or True else "") + p["text"] for p in parts)
    # 精确校验：把切出来的（含被剥掉的标题）拼回去
    rebuilt = ""
    at = 0
    for p in parts:
        rebuilt += t[p["at"]:p["end"]]
        at = p["end"]
    rebuilt += t[at:]
    if rebuilt != t:
        print(f"✘ 拼不回去：{len(rebuilt)} vs {len(t)}")
        return
    print(f"✔ 字符守恒：五段拼回去 {len(rebuilt)} 字 = 原文 {len(t)} 字\n")

    for p in parts:
        print(f"  {p['ad']}　{p['era']:<8} {p['author']:<22} {p['chars']:>5} 字"
              + ("　← 外姓" if p["outsider"] else ""))
        print(f"      开头：{p['text'][:44]}…")

    Path("data/oldprefaces.json").write_text(
        json.dumps(parts, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n→ data/oldprefaces.json")

    # 「不缘情而增，不故意而减」最早出现在哪一篇
    print("\n「不缘情而增不故意而减」出现在：")
    for p in parts:
        if "不缘情而增" in p["text"]:
            i = p["text"].find("不缘情而增")
            print(f"  **{p['ad']} {p['era']}　{p['author']}**")
            print(f"      …{p['text'][max(0,i-60):i+40]}…")
    for x in S:
        if x["id"] != "03_旧序" and "不缘情而增" in NS(x["text"]):
            tt = NS(x["text"]); i = tt.find("不缘情而增")
            print(f"  {x.get('title_read') or x['title']}　…{tt[max(0,i-40):i+30]}…")


if __name__ == "__main__":
    main()
