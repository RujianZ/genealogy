"""
查：同名的人能不能靠生年分开？

用户的想法：如果两个同名的人生年差得远，那「谁能当某人的父亲」就很好判。
这不是猜——生年是谱上写的，公元年是谱**自己附的**《甲子録》查的，
父子年龄差是减法。三样都是客观的。

但要先看数据支不支持：
  ① 有多少人能查出生年
  ② 多父边（同名候选）的人里，有多少能靠生年把候选排掉
  ③ 排掉之后还剩几个——如果还剩两个，那就是真的判不了

**注意**：这里只算，不改数据、不自动选。算完把「候选A比本人大N岁、
候选B比本人小M岁」摆出来，判还是人判。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from yearnorm import normalize
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")


def load_era() -> dict[str, int]:
    """《甲子録》：年号+第几年 → 公元。谱自己附的表，不是我换算的。"""
    rows = json.loads(Path("data/erachart.json").read_text(encoding="utf-8"))
    m: dict[str, int] = {}
    for r in rows:
        if r["label"]:
            m.setdefault(NS(r["label"]), r["ad"])
    return m


def load_era_gz() -> dict[str, list[int]]:
    """年号＋干支 → 公元。

    谱里生卒最常见的写法根本不带「年」字：「乾隆丙辰十一月初一日戌时」。
    《甲子録》本来就是按干支排的，直接对上就行。

    ★ 返回 list 不返回单值：康熙六十一年、乾隆六十年，一轮甲子转完还多一年，
      同一个年号里同一个干支可能出现两次。**那种情况两个都给出来，不挑。**
    """
    rows = json.loads(Path("data/erachart.json").read_text(encoding="utf-8"))
    m: dict[str, list[int]] = {}
    for r in rows:
        if not (r["era"] and r["ganzhi"]):
            continue
        k = NS(r["era"]) + NS(r["ganzhi"])
        if r["ad"] not in m.setdefault(k, []):
            m[k].append(r["ad"])
    return m


ERA = load_era()
ERA_GZ = load_era_gz()
RE_GZ = re.compile(r"([一-鿿]{2,4}?)([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])")
CN = {"元": 1, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
      "八": 8, "九": 9, "十": 10, "廿": 20, "卅": 30}
RE_ERA = re.compile(r"([一-鿿]{2,4}?)(元|[一二三四五六七八九十廿卅]{1,3})年")
RE_AD = re.compile(r"(一九|二零|二〇|20|19)([〇零一二三四五六七八九\d]{2,3})年")
AD_CN = {"〇": "0", "零": "0", "一": "1", "二": "2", "三": "3", "四": "4",
         "五": "5", "六": "6", "七": "7", "八": "8", "九": "9"}


def cn2int(s: str) -> int | None:
    if s in CN:
        return CN[s]
    m = re.fullmatch(r"(廿|卅)([一二三四五六七八九])?", s)
    if m:
        return CN[m.group(1)] + (CN[m.group(2)] if m.group(2) else 0)
    m = re.fullmatch(r"([一二三四五六七八九])?十([一二三四五六七八九])?", s)
    if m:
        return (CN[m.group(1)] if m.group(1) else 1) * 10 + (CN[m.group(2)] if m.group(2) else 0)
    return None


def year_of(text: str | None) -> tuple[int | None, str]:
    """从生卒原文里查出公元年。查不到就说查不到，**不估、不推**。"""
    if not text:
        return None, "谱上没写"
    t = NS(text)
    # 先归一写法变体（阿拉伯0、朝代前缀、避讳改字、干支形近字、一年=元年）。
    # 每一条都能核，见 tools/yearnorm.py。
    t2, _notes = normalize(t)
    if t2 != t:
        y, why = _lookup(t2)
        if y:
            return y, why + "（" + "；".join(_notes) + "）"
    return _lookup(t)


def _lookup(t: str) -> tuple[int | None, str]:
    # 现代写法：一九九九年 / 2013年
    m = RE_AD.search(t)
    if m:
        head = {"一九": "19", "二零": "20", "二〇": "20"}.get(m.group(1), m.group(1))
        tail = "".join(AD_CN.get(c, c) for c in m.group(2))
        try:
            return int(head + tail[:2]), "原文就是公元纪年"
        except ValueError:
            pass
    # 年号写法：乾隆四年 / 光绪二十六年
    for m in RE_ERA.finditer(t):
        era, ordc = m.group(1), m.group(2)
        n = cn2int(ordc)
        if n is None:
            continue
        key = NS(era) + (ordc if ordc == "元" else ordc) + "年"
        if key in ERA:
            return ERA[key], f"《甲子録》查得「{key}」"
        # 「乾隆四年」的年号可能带前缀（「清乾隆四年」），去掉一字再试
        if len(era) > 2 and NS(era[1:]) + ordc + "年" in ERA:
            k2 = NS(era[1:]) + ordc + "年"
            return ERA[k2], f"《甲子録》查得「{k2}」"
    # 年号＋干支，不带「年」字：「乾隆丙辰十一月初一日戌时」——谱里最常见的写法
    for m in RE_GZ.finditer(t):
        era, gz = m.group(1), m.group(2)
        for k in (NS(era) + gz, NS(era[1:]) + gz if len(era) > 2 else None):
            if k and k in ERA_GZ:
                ads = ERA_GZ[k]
                if len(ads) == 1:
                    return ads[0], f"《甲子録》查得「{k}」"
                # 一个年号里同一个干支出现两次（如康熙六十一年），
                # **两个都摆出来，不挑一个。**
                return None, f"「{k}」在《甲子録》里对应 {ads} 两年，谱上没说是哪一个"
    return None, "《甲子録》里查不到这个年号"


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    # ① 覆盖率
    got = 0
    reasons: Counter = Counter()
    for p in people:
        y, why = year_of(p["birth"]["text"] if p.get("birth") else None)
        p["_y"] = y
        if y:
            got += 1
        else:
            reasons[why] += 1
    print(f"① 能查出生年的　{got}/{len(people)} = {got/len(people)*100:.1f}%")
    for k, v in reasons.most_common():
        print(f"     {v:>5}  {k}")

    # ② 多父边的人，靠生年能排掉几个候选
    forks = [p for p in people if len(p["parent_edges"]) > 1]
    print(f"\n② 有多个父候选的人　{len(forks)} 人")
    solved = narrowed = cannot = noyear = 0
    examples = []
    for p in forks:
        cands = {e["parent"] for e in p["parent_edges"]}
        if len(cands) < 2:
            continue
        cy = p["_y"]
        if not cy:
            noyear += 1
            continue
        keep, drop = [], []
        for c in cands:
            f = idx.get(c)
            fy = f["_y"] if f else None
            if fy is None:
                keep.append((c, None, "父候选没有生年，排不掉"))
            else:
                gap = cy - fy
                # 只排掉**生理上不可能**的：父亲比子晚生，或差 <13 / >75 岁。
                # 这不是猜——是算术。边界写死在这里，能核。
                if 13 <= gap <= 75:
                    keep.append((c, gap, f"父生{fy}，子生{cy}，差{gap}岁"))
                else:
                    drop.append((c, gap, f"父生{fy}，子生{cy}，差{gap}岁——生理上不成立"))
        if drop and len(keep) == 1:
            solved += 1
            if len(examples) < 6:
                examples.append((p, keep, drop))
        elif drop:
            narrowed += 1
        else:
            cannot += 1
    print(f"     本人没有生年，算不了　　{noyear}")
    print(f"     **能排到只剩一个**　　　{solved}")
    print(f"     排掉一些但仍多于一个　　{narrowed}")
    print(f"     一个也排不掉　　　　　　{cannot}")

    print("\n③ 能排到唯一的例子：")
    for p, keep, drop in examples:
        print(f"\n   {p['name']}（第{p['gen']}世）{p['src_human']}")
        print(f"     谱上写父名「{p['father_name']}」，同名候选 {len(keep)+len(drop)} 个")
        for c, gap, why in keep:
            print(f"       ✔ 留下 {idx[c]['name']}（{idx[c]['src_human']}）{why}")
        for c, gap, why in drop:
            print(f"       ✘ 排掉 {idx[c]['name']}（{idx[c]['src_human']}）{why}")


if __name__ == "__main__":
    main()
