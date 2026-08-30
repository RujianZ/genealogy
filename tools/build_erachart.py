"""
《甲子録》结构化：卷首 151–164 页的年号—干支—公元对照表。

★ 两个坑，第一版都踩了：

一、**文本顺序是乱的**。整篇 flatten 之后，行序会串栏：
       道光四年 甲申 1824
       九年   辛亥 1731     ← 突然跳回雍正
   原因是每页正文在 r0c0 或 r0c1 的文本框里交替（单双页版式），
   flatten 时按单元格顺序拼，不是按阅读顺序。
   **改成按「块（页）」逐个取那个年表文本框**，页内顺序本来就是对的。

二、**年号只在改元那年写一次**，后面只写「二年」「三年」，必须顺延。
   但顺延要有闸：**只有公元连续（等于上一行 +1）才顺延**。
   否则一跨栏就把上一栏的年号糊到下一栏，造出「道光二十四年 = 1819」这种鬼话。

★ 这张表是**谱自己附的**（不是我换算的）。界面只把对应那一行摆出来，
  不做换算——CLAUDE.md 第四节：「民国十九年八月」实为公历 1931 年 1 月，
  年份对月份错，每一次换算都是判断。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

GANZHI = "甲乙丙丁戊己庚辛壬癸"
DIZHI = "子丑寅卯辰巳午未申酉戌亥"
ROW = re.compile(
    rf"^(?P<era>[一-鿿]{{0,6}}?)(?P<ord>元|[一二三四五六七八九十百廿卅]+)年"
    rf"\s*(?P<gz>[{GANZHI}][{DIZHI}])\s*(?P<ad>\d{{1,4}})")

CN = {"元": 1, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
      "八": 8, "九": 9, "十": 10, "廿": 20, "卅": 30}


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


def num_cn(n: int) -> str:
    """1→元　10→十　22→廿二　49→四十九。谱里 20–39 惯用廿/卅。"""
    D = "〇一二三四五六七八九"
    if n == 1:
        return "元"
    if n < 10:
        return D[n]
    if n == 10:
        return "十"
    if n < 20:
        return "十" + D[n - 10]
    if n == 20:
        return "廿"
    if n < 30:
        return "廿" + D[n - 20]
    if n == 30:
        return "卅"
    if n < 40:
        return "卅" + D[n - 30]
    t, o = divmod(n, 10)
    return D[t] + "十" + (D[o] if o else "")


def num_cn2(n: int) -> str:
    """另一种写法：22→二十二　31→三十一。两种都进索引，长辈怎么打都能查到。"""
    D = "〇一二三四五六七八九"
    t, o = divmod(n, 10)
    return D[t] + "十" + (D[o] if o else "")


def main() -> None:
    blocks = [json.loads(l) for l in
              Path("parser/jsonl/张氏谱首_一_.jsonl").read_text(encoding="utf-8").splitlines()
              if l.strip()]

    # 按页取年表文本框——页内顺序是对的，跨页才乱
    chunks: list[str] = []
    for b in blocks:
        for c in b["cells"]:
            t = c["text"]
            if c["source"] == "textbox" and len(ROW.findall(NS(t).replace("｜", "\n"))) == 0:
                # 用行数判断：真正的年表框每行都是「X年 干支 公元」
                pass
            if c["source"] != "textbox":
                continue
            lines = [x.strip() for x in t.split("\n") if x.strip()]
            hits = sum(1 for x in lines if ROW.match(NS(x)))
            if hits >= 3:                     # 至少三行像年表，才认这是年表框
                chunks.append("\n".join(lines))

    rows, cur_era, prev_ad, bad = [], "", None, []
    for chunk in chunks:
        for raw in chunk.split("\n"):
            line = raw.strip()
            if not line:
                continue
            m = ROW.match(NS(line))
            if not m:
                if re.search(r"\d{3,4}", line):
                    bad.append(line[:46])
                continue
            ad = int(m.group("ad"))
            era = m.group("era")
            if era:
                cur_era = era                 # 改元这一行写了年号
            elif prev_ad is None or ad != prev_ad + 1:
                # ★ 公元不连续 = 跨栏了，上一栏的年号不能带过来
                cur_era = ""
            prev_ad = ad
            n = cn2int(m.group("ord"))
            rows.append({
                "era": cur_era, "ord_cn": m.group("ord"), "ord": n,
                "ganzhi": m.group("gz"), "ad": ad,
                "label": f"{cur_era}{m.group('ord')}年" if cur_era else "",
                "raw": line,
            })

    # ── 贴标签：用谱自己的改元锚点划区间 ────────────────────────
    # 多栏排版把年号切碎了，只认出 1719 行带年号——但**行本身是全的**：
    # 2115 行，覆盖公元 1–1949。康熙四十九年那一行就在表里，
    # 只是「康熙」二字留在上一栏，没跟过来。
    #
    # 所以不造新行，只给已有的行贴标签：
    #   谱上写明「康熙元年 = 1662」，下一次改元是「雍正元年 = 1723」，
    #   那 1662–1722 这些**已经在表里的行**就是康熙一至六十一年。
    # 全部用谱自己写的改元年份推，不引任何外部年表。
    # 贴上去的标 labeled=true，界面上看得出年号是数出来的，
    # 而干支和公元是谱上原样。
    explicit: dict[str, int] = {}        # 只认原文明写「X元年」的行做锚点
    for r in rows:
        if r["era"] and r["ord"] == 1 and r["raw"]:
            explicit.setdefault(r["era"], r["ad"])
    anchors = sorted(explicit.items(), key=lambda kv: kv[1])

    byad: dict[int, list] = {}
    for r in rows:
        byad.setdefault(r["ad"], []).append(r)

    labeled = 0
    for i, (era, a1) in enumerate(anchors):
        end = anchors[i + 1][1] - 1 if i + 1 < len(anchors) else a1 + 60
        for ad in range(a1, end + 1):
            n = ad - a1 + 1
            for r in byad.get(ad, []):
                if r["raw"] and r["era"]:
                    break            # 谱上这一行自己写了年号，不动
                if r["era"] == era and r["ord"] == n:
                    break
                r["era"], r["ord"], r["ord_cn"] = era, n, num_cn(n)
                r["label"] = era + num_cn(n) + "年"
                r["labeled"] = True
                r["note"] = (f"谱上写明「{era}元年 = 公元 {a1}」，"
                             f"下一次改元在 {end + 1} 年。"
                             f"本行公元 {ad}，即第 {n} 年。"
                             f"干支和公元是谱上原样，年号是按改元年份数出来的。")
                labeled += 1
                break

    # 写法别名：廿二年／二十二年，怎么打都查得到
    extra = []
    for r in rows:
        if r["era"] and r.get("ord") and 20 <= r["ord"] <= 39:
            alt = num_cn2(r["ord"])
            lab = r["era"] + alt + "年"
            if lab != r["label"]:
                extra.append({**r, "ord_cn": alt, "label": lab, "alias_of": r["label"]})
    rows.extend(extra)
    print(f"锚点（原文明写「X元年」）{len(anchors)} 个，"
          f"贴出年号 {labeled} 行，写法别名 {len(extra)} 行")

    Path("data/erachart.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")

    named = [r for r in rows if r["era"]]
    print(f"年表框 {len(chunks)} 个（按页取，不 flatten）")
    print(f"解析出 {len(rows)} 行，其中带年号的 {len(named)} 行")
    print(f"公元范围 {min(r['ad'] for r in rows)}–{max(r['ad'] for r in rows)}")
    print(f"未解析（含数字但不合格式）{len(bad)} 行")

    idx = {r["label"]: r for r in rows if r["label"]}
    print("\n=== 复核 ===")
    for q in ["宋宝庆三年", "康熙四十九年", "乾隆四年", "乾隆四十一年", "道光五年",
              "道光十九年", "同治十三年", "光绪三十年", "光绪二十六年", "民国十九年"]:
        r = idx.get(q)
        print(f"   {q:<10} " + (f"→ {r['ad']} 年　干支 {r['ganzhi']}" if r else "（表中无）"))

    eras = {}
    for r in named:
        eras.setdefault(r["era"], []).append(r["ord"] or 0)
    print(f"\n年号 {len(eras)} 个。几个大朝的行数：")
    for e in ("康熙", "乾隆", "嘉庆", "道光", "咸丰", "同治", "光绪", "宣统", "民国"):
        v = eras.get(e)
        print(f"   {e:<4} {len(v) if v else 0:>3} 行" + (f"　第 {min(v)}–{max(v)} 年" if v else ""))


if __name__ == "__main__":
    main()
