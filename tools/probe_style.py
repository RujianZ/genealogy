"""
「没写父名」的 136 人、「生年查不出」的 169 人——**他们是怎么记录的？**

不要把「没有」当成缺失。谱是一本有体例的书，
一个人没写父名，八成不是漏了，是**这一类人本来就那么写**。

要看的：
  · 他们集中在第几世？集中在哪一段的第几行？
  · 他们的原文长什么样——是完整的一条，还是只有名字？
  · 生年查不出的那些，用的是哪种写法？（我的解析器认哪几种、漏了哪几种）
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, "tools")
from check_homonym_years import year_of  # noqa: E402

NS = lambda s: "".join((s or "").split()).replace("　", "")
PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")


def row_of(pid):
    m = PID.match(pid)
    return int(m.group(3)) if m else None


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    # ══════ 一、没写父名的 136 人 ══════
    C = [idx[x["pid"]] for x in D["C没写父名"]]
    print(f"══ 没写父名的 {len(C)} 人 ══\n")
    print("按世次：")
    for g, n in sorted(Counter(p["gen"] for p in C).items()):
        print(f"   第{g:>2}世 {n}")
    print("\n按段内行号（1 = 一段的头一代）：")
    for r, n in sorted(Counter(row_of(p["pid"]) for p in C).items(),
                       key=lambda x: (x[0] is None, x[0])):
        tot = sum(1 for p in people if row_of(p["pid"]) == r)
        print(f"   第{r}行 {n:>4}　（全谱这一行共 {tot} 人，占 {n/tot*100:.1f}%）")
    print("\n原文有多长：")
    for k, n in Counter(
            "只有名字（<12字）" if len(NS(p["raw_text"])) < 12
            else "很短（12-40字）" if len(NS(p["raw_text"])) < 40
            else "正常一条（40字以上）" for p in C).most_common():
        print(f"   {n:>4}　{k}")
    print("\n有没有生卒／配偶／子女：")
    print(f"   有生 {sum(1 for p in C if p.get('birth'))}"
          f"　有殁 {sum(1 for p in C if p.get('death'))}"
          f"　有配偶 {sum(1 for p in C if p['spouses'])}"
          f"　有生子名单 {sum(1 for p in C if p['sons_claimed'])}")
    print("\n挑 6 个看原文：\n")
    for p in C[:6]:
        print(f"  ── {p['name']}　第{p['gen']}世　{p['src_human']}（第{row_of(p['pid'])}行）")
        print("     " + p["raw_text"].replace("\n", " / ")[:150])

    # ══════ 二、生年查不出的 169 人 ══════
    E = D["D生年查不出"]
    print(f"\n\n══ 生年查不出的 {len(E)} 人：写法长什么样 ══\n")
    kinds = Counter()
    samples: dict[str, list] = {}
    for x in E:
        t = NS(x["birth"])
        if re.search(r"[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]", t):
            k = "有干支，但年号查不到"
        elif re.search(r"[一二三四五六七八九十廿卅元]年", t):
            k = "有「X年」，但年号查不到"
        elif re.search(r"\d", t):
            k = "有阿拉伯数字"
        elif any(w in t for w in ("缺", "未详", "失考", "无考")):
            k = "**谱自己写了「缺」「未详」**"
        elif len(t) < 6:
            k = "极短"
        else:
            k = "其它"
        kinds[k] += 1
        samples.setdefault(k, []).append(x)
    for k, n in kinds.most_common():
        print(f"   {n:>4}　{k}")
        for x in samples[k][:3]:
            print(f"           {x['name']}　{NS(x['birth'])[:34]}")

    # ══════ 三、还有哪些时间信息没用上 ══════
    print("\n\n══ 每个人身上还有多少「时间点」可用 ══\n")
    got = Counter()
    for p in people:
        if year_of((p.get("birth") or {}).get("text"))[0]:
            got["本人生年"] += 1
        if year_of((p.get("death") or {}).get("text"))[0]:
            got["本人殁年"] += 1
        for s in p["spouses"]:
            if year_of((s.get("birth") or {}).get("text"))[0]:
                got["配偶生年"] += 1; break
        for s in p["spouses"]:
            if year_of((s.get("death") or {}).get("text"))[0]:
                got["配偶殁年"] += 1; break
        if p.get("age") and re.search(r"[一二三四五六七八九十百\d]", NS(p["age"]["text"])):
            got["寿数（可倒推生年）"] += 1
    n = len(people)
    for k, v in got.most_common():
        print(f"   {v:>5}／{n} = {v/n*100:>5.1f}%　{k}")

    both = sum(1 for p in people
               if not year_of((p.get("birth") or {}).get("text"))[0]
               and (year_of((p.get("death") or {}).get("text"))[0]
                    or any(year_of((s.get("birth") or {}).get("text"))[0] for s in p["spouses"])))
    print(f"\n   **没生年、但有殁年或配偶生年的：{both} 人** ← 这些人的活动年代其实定得下来")


if __name__ == "__main__":
    main()
