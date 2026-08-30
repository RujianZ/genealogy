"""
交叉检查：拿刚切出来的事迹文字，去核那些说不清的父边。

事迹句子里写满了**带名字带排行的硬关系**，从来没被解析过：

    立**铣华**四子**泽霖**为嗣      → 泽霖是铣华的第四子
    爱立**三弟**次子**壁介**为嗣    → 壁介是说话人三弟的次子
    **长子光覆**出嗣**亲兄梁成**    → 光覆是说话人的长子
    出嗣**长兄泽昌**兼承己嗣        → 说话人的长兄叫泽昌

**这些跟「生子三：…」是同一份东西**——谱自己写的亲属关系，
只是写在句子里而不是名单里，所以上游建边时没读。

★ 只抽**谱明写的**，不推。抽出来的每一条都记下原句，能核。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")
ORD = {"长": 1, "元": 1, "次": 2, "三": 3, "四": 4, "五": 5,
       "六": 6, "七": 7, "八": 8, "九": 9, "幼": -1}
O = "长次三四五六七八九幼元"
N = "[一-鿿]{2,3}"   # 谱名一般两三个字

# ── 关系句式。每条都写明抽出来的是什么 ────────────────────
RULES: list[tuple[str, str, str]] = [
    # 「立铣华四子泽霖为嗣」→ 泽霖 是 铣华 的第4子
    ("立X某子Y为嗣", rf"立({N})公?([{O}])子({N})[为承]嗣",       "father,ord,son"),
    # 「立三弟次子壁介为嗣」→ 壁介 是「三弟」的次子（父名要另找）
    ("立某弟某子Y为嗣", rf"立([{O}][兄弟])([{O}])子({N})[为承]嗣", "sib,ord,son"),
    # 「长子光覆出嗣亲兄梁成」→ 光覆 是说话人的第1子，嗣父 梁成
    ("某子Y出嗣Z",  rf"([{O}])子({N})出[嗣继]([一-鿿]{{0,3}}?)({N})",  "ord,son,to"),
    # 「出嗣长兄泽昌」→ 说话人的长兄叫泽昌
    ("出嗣某兄Y",   rf"出[嗣继]([{O}]?[兄弟])({N})",                  "sibname"),
    # 「承祧胞兄壁环壁岳」→ 说话人承祧的是胞兄壁环、壁岳
    ("承祧某兄Y",   rf"[承兼]祧([一-鿿]{{0,2}}[兄弟])({N})({N})?",     "tiao"),
]
COMPILED = [(a, re.compile(b), c) for a, b, c in RULES]


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    prose = json.loads(Path("data/prose.json").read_text(encoding="utf-8"))

    # 从事迹里抽关系
    facts = []
    tally = Counter()
    for x in prose:
        t = NS(x["text"])
        for name, rx, kind in COMPILED:
            for m in rx.finditer(t):
                tally[name] += 1
                facts.append({
                    "speaker": x["host"], "speaker_name": x["host_name"],
                    "rule": name, "kind": kind, "groups": list(m.groups()),
                    "sentence": t[max(0, m.start() - 6):m.end() + 6],
                    "src_human": x["src_human"],
                })
    print(f"从 {len(prose)} 段事迹里抽出 **{len(facts)} 条关系句**：\n")
    for k, v in tally.most_common():
        print(f"   {v:>4}　{k}")

    # ── 建立「谁是谁的第几子」索引 ────────────────────────
    # 「立铣华四子泽霖为嗣」：泽霖 的生父是 铣华，排行 4
    said = defaultdict(list)      # 子名 -> [(父名, 排行, 出处, 原句)]
    for f in facts:
        g = f["groups"]
        if f["kind"] == "father,ord,son":
            said[NS(g[2])].append((NS(g[0]), ORD.get(g[1]), f["src_human"], f["sentence"]))
    print(f"\n其中「某人是某某的第几子」的明确说法：**{sum(len(v) for v in said.values())} 条**")

    # ── 拿去核疑点 ────────────────────────────────────
    D = json.loads(Path("data/doubts.json").read_text(encoding="utf-8"))
    hit = []
    for x in D["分不清"]:
        me = NS(x["name"])
        for (fname, ordn, src, sent) in said.get(me, []):
            for c in x["cands"]:
                if NS(c["name"]) == fname:
                    hit.append((x, c, fname, ordn, src, sent))
    print(f"\n**能对上疑点的：{len(hit)} 条**\n")
    for x, c, fname, ordn, src, sent in hit[:10]:
        print(f"   {x['name']}（第{x['gen']}世 {x['src_human']}）父名「{x['father_name']}」")
        print(f"     谱上另一处写着：「{sent}」")
        print(f"     出处 {src}")
        print(f"     → 指向候选 {c['name']}（{c['src_human']}）")
        print()

    Path("data/relfacts.json").write_text(
        json.dumps(facts, ensure_ascii=False, indent=1), encoding="utf-8")
    print("→ data/relfacts.json")

    print("\n\n抽出来的关系句，每一类看 3 条：\n")
    seen = Counter()
    for f in facts:
        if seen[f["rule"]] >= 3:
            continue
        seen[f["rule"]] += 1
        print(f"   [{f['rule']}] {f['speaker_name']}（{f['src_human']}）")
        print(f"        「{f['sentence']}」→ {f['groups']}")


if __name__ == "__main__":
    main()
