"""
活跃时间段：一个人在世的年份区间。

之前只拿「父生年」比「本人生年」，太浪费——谱上每个人身上还挂着好几个时间点：

    本人生年 79.3%      本人殁年 25.1%      寿数（可倒推生年）8.3%
    配偶生年 50.0%      配偶殁年 13.1%      子女生年（子女那条上写着）

把这些合起来，能给绝大多数人框出一个「他活着的那段时间」。
框出来之后，「谁能当谁的父亲」就变成区间比较：

    ★ 父亲必须在孩子出生时还在（或刚过世不久——遗腹子）
    ★ 父亲必须比孩子早生 13 到 75 年

**全是谱上写的数字 + 加减法 + 区间比较。没有一步是判断。**

区间用 [早, 晚] 表示，两端都可能是 None（不知道）。
不知道就是不知道——**不拿平均数、不拿世代间隔去填**。
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, "tools")
from check_homonym_years import year_of  # noqa: E402

NS = lambda s: "".join((s or "").split()).replace("　", "")
MIN_GAP, MAX_GAP = 13, 75
# 夫妻年龄差：谱上常见的范围。只用来给**没有本人年份**的人框个下限，
# 而且框得很宽——宁可框不住，不可框错。
SPOUSE_SPAN = 25

CN = {"元": 1, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
      "八": 8, "九": 9, "十": 10, "廿": 20, "卅": 30, "百": 100}


def cn_num(s: str) -> int | None:
    s = NS(s)
    m = re.search(r"([一二三四五六七八九十百廿卅\d]+)", s)
    if not m:
        return None
    t = m.group(1)
    if t.isdigit():
        return int(t)
    if t in CN:
        return CN[t]
    mm = re.fullmatch(r"([一二三四五六七八九])?十([一二三四五六七八九])?", t)
    if mm:
        return (CN[mm.group(1)] if mm.group(1) else 1) * 10 + (CN[mm.group(2)] if mm.group(2) else 0)
    mm = re.fullmatch(r"(廿|卅)([一二三四五六七八九])?", t)
    if mm:
        return CN[mm.group(1)] + (CN[mm.group(2)] if mm.group(2) else 0)
    return None


@dataclass
class Window:
    """他活着的那段时间。born/died 精确年；lo/hi 是能框住出生年的最宽区间。"""
    born: int | None = None
    died: int | None = None
    lo: int | None = None          # 出生年不早于
    hi: int | None = None          # 出生年不晚于
    why: list[str] = field(default_factory=list)

    def note(self) -> str:
        if self.born:
            return f"生 {self.born}" + (f"，殁 {self.died}" if self.died else "")
        if self.lo or self.hi:
            return f"约生于 {self.lo or '?'}–{self.hi or '?'} 之间"
        return "年代不详"


def build(people) -> dict[str, Window]:
    idx = {p["pid"]: p for p in people}
    W: dict[str, Window] = {}

    for p in people:
        w = Window()
        b = year_of((p.get("birth") or {}).get("text"))[0]
        d = year_of((p.get("death") or {}).get("text"))[0]
        if b:
            w.born, w.lo, w.hi = b, b, b
            w.why.append("谱上写了生年")
        if d:
            w.died = d
            w.why.append("谱上写了殁年")
        # 寿数倒推：殁年 - 寿数 = 生年。谱自己写的两个数，减法。
        if not b and d and p.get("age"):
            a = cn_num(p["age"]["text"])
            if a and 1 <= a <= 110:
                w.born = w.lo = w.hi = d - a
                w.why.append(f"殁 {d} 减寿 {a} 岁")
        # 只有殁年：出生年一定在殁年之前 1–100 年
        if not w.born and d:
            w.lo, w.hi = d - 100, d
            w.why.append(f"由殁年 {d} 倒框")
        W[p["pid"]] = w

    # 配偶的年份：框一个很宽的窗
    for p in people:
        w = W[p["pid"]]
        if w.born:
            continue
        for s in p["spouses"]:
            sb = year_of((s.get("birth") or {}).get("text"))[0]
            sd = year_of((s.get("death") or {}).get("text"))[0]
            if sb:
                lo, hi = sb - SPOUSE_SPAN, sb + SPOUSE_SPAN
                w.lo = max(w.lo, lo) if w.lo else lo
                w.hi = min(w.hi, hi) if w.hi else hi
                w.why.append(f"配偶生 {sb}，夫妻年龄差按 ±{SPOUSE_SPAN} 年框")
                break
            if sd and not w.hi:
                w.lo, w.hi = sd - 100, sd
                w.why.append(f"配偶殁 {sd}，倒框")
                break

    # 子女的生年：父亲一定比子女早生 13–75 年
    kids: dict[str, list[int]] = {}
    for p in people:
        b = W[p["pid"]].born
        if not b:
            continue
        for e in p["parent_edges"]:
            kids.setdefault(e["parent"], []).append(b)
    for pid, ys in kids.items():
        w = W.get(pid)
        if not w or w.born:
            continue
        lo, hi = min(ys) - MAX_GAP, max(ys) - MIN_GAP
        w.lo = max(w.lo, lo) if w.lo else lo
        w.hi = min(w.hi, hi) if w.hi else hi
        w.why.append(f"已知子女生于 {min(ys)}–{max(ys)}，父亲必早 {MIN_GAP}–{MAX_GAP} 年")

    return W


def can_father(f: Window, c: Window) -> tuple[bool, str]:
    """f 能不能当 c 的父亲？返回（可能吗, 一句话）。**不成立才有话说。**"""
    if c.born and f.died is not None and c.born > f.died + 1:
        return False, f"他殁于 {f.died}，本人生于 {c.born}——晚了 {c.born - f.died} 年"
    if c.born and f.born:
        g = c.born - f.born
        if g < MIN_GAP:
            return False, f"生 {f.born}，只比本人早 {g} 年"
        if g > MAX_GAP:
            return False, f"生 {f.born}，比本人早 {g} 年"
        return True, f"生 {f.born}，早 {g} 年"
    # 只有区间：区间完全错开才算排除
    if c.lo and f.hi and f.hi + MIN_GAP > c.hi and c.hi:
        pass
    if c.born and f.lo and f.lo > c.born - MIN_GAP:
        return False, f"最早也生于 {f.lo}，离本人（{c.born}）不够 {MIN_GAP} 年"
    if c.born and f.hi and f.hi < c.born - MAX_GAP:
        return False, f"最晚也生于 {f.hi}，比本人（{c.born}）早了 {c.born - f.hi} 年以上"
    return True, ""
