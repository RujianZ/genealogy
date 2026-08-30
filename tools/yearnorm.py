"""
生卒年写法的变体。谱是手写付刻的，同一件事有好几种写法。

**这些不是「没记」，是「写法我没认」。** 一条条列清楚，每条都能核：

  ① 同治**一**年      = 同治元年。改元那年谱上有时写「元」有时写「一」。
  ② 二**0**一0年      阿拉伯 0 混进中文数字。0 / O / o 都当〇。
  ③ **明**宏治己酉年  年号前面带朝代。去掉朝代再查。
     **元**顺帝庚辰年  还带皇帝号。
  ④ 宏治 = 弘治       避讳改字（清代避乾隆讳「弘」→「宏」）。谱里两种都有。
  ⑤ 康熙辛**己**年    干支写错。**但这不是猜**：
     康熙**巳**丑年    地支位上不可能出现「己」（那是天干），
                       天干位上不可能出现「巳」（那是地支）。
                       己/巳/已 三个字形近，位置一定就只有一个合法值。

  ✘ **喜庆九年** —— 没有这个年号。像是「嘉庆」的错字，但那是判断，
                    **不改**，留在疑点清单里。
"""
from __future__ import annotations

import re

GAN = "甲乙丙丁戊己庚辛壬癸"
ZHI = "子丑寅卯辰巳午未申酉戌亥"
# 形近字：己 巳 已 三个字在刻本里几乎分不开
CONFUSE = {"己": "巳", "巳": "己", "已": "己"}
# 朝代／皇帝前缀。去掉之后再查年号。
DYN = re.compile(r"^(大清|大明|皇清|皇明|清朝|明朝|元朝|宋朝|"
                 r"清|明|元|宋|唐|元顺帝|明太祖)")
# 避讳改字与异体
VAR = {"宏治": "弘治", "元顺帝": "顺帝", "崇正": "崇祯", "天啓": "天启",
       "啓": "启", "萬曆": "万历", "万暦": "万历", "康煕": "康熙"}


def fix_ganzhi(s: str) -> tuple[str, str]:
    """干支两个字，按位置纠形近字。返回（改好的, 说明）。"""
    if len(s) != 2:
        return s, ""
    a, b = s[0], s[1]
    note = []
    # 注意：`"" in GAN` 在 Python 里是 True（空串是任何串的子串），
    # 所以必须先判 CONFUSE 里有没有，不能用 .get(a, "")。第一版就栽在这。
    if a not in GAN and a in CONFUSE and CONFUSE[a] in GAN:
        note.append(f"天干位上的「{a}」只能是「{CONFUSE[a]}」")
        a = CONFUSE[a]
    if b not in ZHI and b in CONFUSE and CONFUSE[b] in ZHI:
        note.append(f"地支位上的「{b}」只能是「{CONFUSE[b]}」")
        b = CONFUSE[b]
    return a + b, "；".join(note)


def normalize(t: str) -> tuple[str, list[str]]:
    """把一段生卒原文里的写法变体归一。返回（归一后, 都改了什么）。"""
    notes: list[str] = []
    s = t

    # ② 阿拉伯 0 / 字母 O 当〇
    if re.search(r"[0Oo]", s) and re.search(r"[一二三四五六七八九〇零]", s):
        s2 = re.sub(r"[0Oo]", "〇", s)
        if s2 != s:
            notes.append("把混在中文数字里的 0／O 当作〇")
            s = s2

    # ④ 避讳改字与异体
    for a, b in VAR.items():
        if a in s:
            s = s.replace(a, b)
            notes.append(f"「{a}」按「{b}」查（避讳改字／异体）")

    # ③ 去朝代前缀
    m = DYN.match(s)
    if m and len(s) > len(m.group(1)) + 2:
        notes.append(f"去掉朝代前缀「{m.group(1)}」")
        s = s[m.end():]

    # ⑤ 干支形近字
    for m in re.finditer(r"([一-鿿])([一-鿿])年", s):
        pair = m.group(1) + m.group(2)
        if pair[0] in GAN and pair[1] in ZHI:
            continue                      # 本来就对
        fixed, why = fix_ganzhi(pair)
        if why:
            s = s.replace(pair + "年", fixed + "年", 1)
            notes.append(why)

    # ① 「一年」当「元年」
    s2 = re.sub(r"([一-鿿]{2,4})一年", r"\1元年", s)
    if s2 != s:
        notes.append("「X一年」按「X元年」查（改元那年两种写法都有）")
        s = s2

    return s, notes
