"""
全谱文字分类清点：208,730 字到底分成哪几类，每类多少字。

数据源：
  parser/jsonl/*.jsonl   —— 带 r/c 坐标和 source(cell/textbox)，用于结构分类
  data/people.json       —— 已解析的字段，用于人物条目内部的细分
  work/report/lo/*.json  —— LibreOffice 穷举提取，用于补上 JSONL 漏的页脚

不做任何取舍：每一类都报字数，加起来必须等于总数，对不上就报警。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

XI = ["合一_1_2_3_4_.jsonl", "合二_5_6_7_.jsonl", "合三_8_9_.jsonl"]
SHOU = "张氏谱首_一_.jsonl"

# 页眉带里的固定成分
HEADER_FIXED = ["张氏宗谱", "清河郡", "公元二零一六年", "卷"]
GEN_HEAD = re.compile(r"(第[一二三四五六七八九十]+世|[廿卅][一二三四五六七八九]?世|[一二三四五六七八九十]+世)")


def load(name: str) -> list[dict]:
    p = Path("parser/jsonl") / name
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def report(title: str, counter: Counter, total: int) -> None:
    print(f"\n{title}  合计 {total:,} 字")
    for k, v in counter.most_common():
        pct = v / total * 100 if total else 0
        print(f"   {v:>7,} 字  {pct:5.1f}%   {k}")


# ══════════════════ 一、世系三册的结构分类 ══════════════════
def xi_structure() -> None:
    c: Counter = Counter()
    samples: dict[str, list[str]] = defaultdict(list)
    total = 0
    for f in XI:
        for blk in load(f):
            for cell in blk["cells"]:
                t = NS(cell["text"])
                if not t:
                    continue
                total += len(t)
                r, src = cell["r"], cell["source"]
                if r == 0:
                    if any(h in t for h in HEADER_FIXED):
                        key = "页眉带·固定成分（张氏宗谱/卷次/清河郡/公元二零一六年）"
                    elif GEN_HEAD.fullmatch(t):
                        key = "世代列头（第一世…三十世，组合图形里）"
                    elif "子" in t and len(t) <= 8:
                        key = "页眉带·跨页父名指向（「子长公林梦」这类倒写）"
                    else:
                        key = "页眉带·世系名（梦林公世系 等）"
                else:
                    key = f"人物条目（第{r}行 = 第 n 代）· {'文本框' if src == 'textbox' else '单元格'}"
                c[key] += len(t)
                if len(samples[key]) < 3:
                    samples[key].append(cell["text"].replace("\n", "｜")[:38])
    report("【一】世系三册（合一/合二/合三）结构分类", c, total)
    print("\n   样例：")
    for k in c:
        print(f"     {k}")
        for s in samples[k]:
            print(f"        {s!r}")


# ══════════════════ 二、人物条目内部的字段细分 ══════════════════
def person_fields() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    c: Counter = Counter()
    for p in people:
        c["① 谱名（含原文排版空格）"] += len(NS(p["name_raw"]))
        for k, label in [("zi", "② 字"), ("hui", "② 讳"), ("hao", "② 号"), ("ming", "② 名")]:
            if p.get(k):
                c[label] += len(NS(p[k]["text"]))
        if p["father_name"]:
            c["③ 父名 + 排行（「光量公长子」）"] += len(NS(p["father_name"] + p["filiation"]))
        for k, label in [("birth", "④ 生"), ("death", "④ 殁"), ("burial", "⑤ 葬（含山向、有碑）"), ("age", "④ 寿")]:
            if p.get(k):
                c[label] += len(NS(p[k]["text"]))
        for s in p["spouses"]:
            n = len(NS(s["rel"] + s["name_raw"]))
            for kk in ("birth", "death", "burial"):
                if s.get(kk):
                    n += len(NS(s[kk]["text"]))
            c["⑥ 配偶（妣/娶/继/复/庶 + 生卒葬）"] += n
        c["⑦ 生子名单"] += sum(len(NS(x)) for x in p["sons_claimed"])
        c["⑧ 女（只有夫家姓：适陈/适柳）"] += sum(len(NS(x)) for x in p["daughters_claimed"])
        c["⑨ 功名（庠生/贡生/太学生…）"] += sum(len(NS(x)) for x in p["titles"])
        c["⑩ 标记（出嗣/迁徙/殉难/节烈/有碑）"] += sum(len(NS(m["tag"] + (m.get("text") or ""))) for m in p["marks"])
        c["⑪ 未归属原文（解析器认不出，一行没丢）"] += sum(len(NS(u["text"])) for u in p["unparsed"])
    report("【二】人物条目内部字段细分（2,258 人）", c, sum(c.values()))


# ══════════════════ 三、卷首按篇目分类 ══════════════════
def shou_documents() -> None:
    blocks = load(SHOU)
    per_doc: Counter = Counter()
    order: list[str] = []
    for blk in blocks:
        # 页眉带的文本框里写着篇名，排除「首」「清河郡」这些固定字样
        title = ""
        for cell in blk["cells"]:
            if cell["r"] == 0 and cell["source"] == "textbox":
                t = NS(cell["text"])
                if t and t not in ("首", "清河郡") and "张氏宗谱" not in t and "公元" not in t:
                    title = t
                    break
        title = title or "（页眉无篇名）"
        body = sum(len(NS(c["text"])) for c in blk["cells"])
        if title not in per_doc:
            order.append(title)
        per_doc[title] += body
    total = sum(per_doc.values())
    print(f"\n【三】卷首按篇目分类  合计 {total:,} 字，共 {len(per_doc)} 个篇名")
    print("   （按在书中出现的先后排）")
    for t in order:
        v = per_doc[t]
        print(f"   {v:>7,} 字  {v/total*100:5.1f}%   {t}")


# ══════════════════ 四、总账 ══════════════════
def grand() -> None:
    xi = sum(len(NS(c["text"])) for f in XI for b in load(f) for c in b["cells"])
    shou = sum(len(NS(c["text"])) for b in load(SHOU) for c in b["cells"])
    print(f"\n【四】总账")
    print(f"   世系三册 {xi:,} 字")
    print(f"   卷首     {shou:,} 字")
    print(f"   JSONL 合计 {xi + shou:,} 字")
    print(f"   + 页脚页码域（JSONL 漏、LibreOffice 有）36 字")
    print(f"   + Word 独有的第二页脚 PAGE 域 24 字")
    print(f"   = 完整并集 {xi + shou + 36 + 24:,} 字")


if __name__ == "__main__":
    xi_structure()
    person_fields()
    shou_documents()
    grand()
