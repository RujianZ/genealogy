"""
从事迹原文里抽要素：**谁、在哪、什么时候、什么事**。

★ 可信 = 可核。所以每抽一项，都记下：
    · 命中的**原文片段**（一字不动）
    · 在原文里的**位置**（offset）
    · **凭什么**认定的（在谱里对上了哪一条）

  界面上每个可点的词，鼠标停上去就能看见「这是凭什么标出来的」。

★ 只认**谱里已经有的东西**：
    人 —— 对上 people.json 的谱名/字/讳/号/别名，或 referenced.json 的引称
    地 —— 对上 places.json 归拢出来的地名
    年 —— 对上卷首《甲子録》的年号
  **认不出来的一律不标**，宁可少标，不可标错。

★ 同名的照样全列（不猜），界面上让人自己挑。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

# 全站唯一的一张字表（TS 那边 loadTables 读的是同一个键）
_V = json.loads(Path("data/字表.json").read_text(encoding="utf-8"))["繁简异体"]["表"]


def fold(s: str) -> str:
    return "".join(_V.get(c, c) for c in (s or ""))


NS = lambda s: fold("".join((s or "").split()).replace("　", ""))

# 太常见、单独出现没有指认价值的字，不当人名地名
STOP = {"公", "氏", "母", "父", "子", "女", "兄", "弟", "妻", "夫", "man"}


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    prose = json.loads(Path("data/prose.json").read_text(encoding="utf-8"))
    places = json.loads(Path("data/places.json").read_text(encoding="utf-8"))
    era = json.loads(Path("data/erachart.json").read_text(encoding="utf-8"))

    # ── 索引 ────────────────────────────────────────────
    # 人：谱名 / 字 / 讳 / 号 / 别名
    # 记下**是哪种叫法**对上的——谱名最实，字号次之。
    by_name: dict[str, list] = defaultdict(list)
    for p in people:
        forms = {NS(p["name"]): "谱名"}
        for a in p["aliases"]:
            forms.setdefault(NS(a["form"]), a["why"])
        for f, why in forms.items():
            if len(f) >= 2 and f not in STOP:
                by_name[f].append((p, why))

    # 地：**只用归拢好的地名字段 l1/l2**。
    #   `text` 是整句葬地原文（「葬蔡山陈埠港同墓壬丙向有碑」），
    #   拿它当地名会把整句标成一个地方——第一版就是这么错的。
    place_names = set()
    for r in places:
        for f in ("l1", "l2"):
            t = NS(r.get(f) or "")
            if t in ("", "None") or re.search(r"(未详|不详|缺|失考|葬|向|碑|详载)", t):
                continue
            if 2 <= len(t) <= 8:
                place_names.add(t)
    # 年号
    eras = {NS(r["era"]) for r in era if r["era"] and len(NS(r["era"])) >= 2}

    RE_YEAR = re.compile(
        r"([一-鿿]{2,4}?)(元|[一二三四五六七八九十廿卅]{1,3})年"
        r"|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])年?"
        r"|((?:一九|二〇|二零)[〇零一二三四五六七八九]{2}|[12]\d{3})年")

    out = []
    stat = Counter()
    for x in prose:
        t = x["text"]
        # ★ **匹配用折叠过的，显示用原文。**
        #   折叠是一对一换字，长度不变，所以位置通用；
        #   但存进 text 的必须是**原文那几个字**——
        #   谱写「啟昌」就得显示「啟昌」，不能显示成「启昌」。
        #   （CLAUDE.md 第七节：不许改写任何原文字段。）
        keepraw = "".join((t or "").split()).replace("　", "")   # 只去空白，不折叠
        flat = NS(t)                                            # 折叠，用来比对
        assert len(keepraw) == len(flat), "折叠改变了长度，位置对不上了"
        raw_at = lambda i, n: keepraw[i:i + n]
        ents = []

        # 人：最长匹配优先，避免「泽昌」被「昌」之类切碎
        i = 0
        while i < len(flat):
            hit = None
            for n in (4, 3, 2):
                seg = flat[i:i + n]
                if len(seg) == n and seg in by_name:
                    hit = (seg, by_name[seg]); break
            if hit:
                seg, ps = hit
                # ★ 证据分强弱。**力保可信：弱的标成「可能是」，不当定论。**
                #   「业师**有成石**老夫子」——有成石是外姓塾师，
                #   而「有成」碰巧是某人的字。这种必须看得出来是弱的。
                tg = []
                for p2, why in ps:
                    near = abs((p2["gen"] or 0) - (x["gen"] or 0)) <= 2
                    strong = (why == "谱名") and near
                    tg.append({"pid": p2["pid"], "name": p2["name"], "gen": p2["gen"],
                               "src_human": p2["src_human"], "matched_as": why,
                               "strong": strong,
                               "note": ("按谱名对上，世次也挨着" if strong
                                        else f"按{why}对上"
                                             + ("" if near else f"，但他是第{p2['gen']}世，"
                                                f"跟本条（第{x['gen']}世）差 "
                                                f"{abs((p2['gen'] or 0)-(x['gen'] or 0))} 代"))})
                ents.append({
                    "kind": "person", "text": raw_at(i, len(seg)), "matched": seg,
                    "at": i, "targets": tg,
                    "strong": any(t["strong"] for t in tg),
                    "why": f"对上谱里的「{seg}」" + (f"（同名 {len(ps)} 人，都列出来）" if len(ps) > 1 else ""),
                })
                stat["人强" if any(t["strong"] for t in tg) else "人弱"] += 1
                i += len(seg)
            else:
                i += 1

        # 地
        for nm in place_names:
            for m in re.finditer(re.escape(nm), flat):
                ents.append({"kind": "place", "text": raw_at(m.start(), len(nm)),
                             "matched": nm, "at": m.start(),
                             "targets": [{"id": nm}],
                             "why": f"对上葬地索引里的「{nm}」"})
                stat["地"] += 1

        # 年
        for m in RE_YEAR.finditer(flat):
            s = m.group(0)
            e0 = m.group(1)
            if e0 and NS(e0) not in eras and NS(e0[1:]) not in eras:
                continue                    # 年号对不上《甲子録》就不标
            ents.append({"kind": "year", "text": raw_at(m.start(), len(s)),
                         "matched": s, "at": m.start(),
                         "targets": [{"id": s}],
                         "why": "《甲子録》里有这个年号" if e0 else "干支或公元纪年"})
            stat["年"] += 1

        ents.sort(key=lambda e: (e["at"], -len(e["text"])))
        # 去重叠：同一段字只标一次，长的优先
        keep, end = [], -1
        for e in ents:
            if e["at"] >= end:
                keep.append(e); end = e["at"] + len(e["text"])
        out.append({**x, "ents": keep})

    Path("data/prose_ents.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    n_with = sum(1 for x in out if x["ents"])
    print(f"{len(out)} 段事迹，其中 **{n_with} 段**抽出了要素\n")
    for k, v in stat.most_common():
        print(f"   {v:>5}　{k}")
    print(f"\n去重叠后实际标出：{sum(len(x['ents']) for x in out)} 处")

    print("\n\n抽 5 段看看（**每一处都说得出凭什么**）：\n")
    for x in sorted(out, key=lambda v: -len(v["ents"]))[:5]:
        print(f"── {x['host_name']}（第{x['gen']}世 {x['src_human']}）")
        print(f"   原文：{NS(x['text'])[:100]}")
        for e in x["ents"][:8]:
            tg = e["targets"][0]
            who = tg.get("name") or tg.get("id")
            mark = "" if e.get("strong", True) else " ⚠弱"
            print(f"     [{e['kind']}{mark}] 「{e['text']}」→ {who}"
                  + (f"（第{tg['gen']}世）" if tg.get("gen") else "")
                  + f"　{tg.get('note') or e['why']}")
        print()


if __name__ == "__main__":
    main()
