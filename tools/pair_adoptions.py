"""
过继两边对账。

谱的凡例第十三则要求双记：
    於**嗣父母**下直书「嗣子某」
    於**本生父母**下必注明「第几子某出承与某为嗣」——**不忘所自出**

所以同一件过继，谱在**两个人的条目里各写一遍**：

    朝相那条：「次子啟昌出嗣朝阳」        ← 生父这边
    朝阳那条：「立朝相次子啟昌为嗣」      ← 嗣父这边

**两边对得上 = 铁证**（两条独立记载互证）。
**只有一边 = 发现**（另一边漏了，或我们没解析出来）。
**两边打架 = 疑点**（谱自己说法不一）。

★ 正则的坑：谱名两三个字，`{2,3}` 贪心会切成「泽昌**兼**」「二弟泽」「梁栋**承**」。
  **2 字和 3 字都要试**，再拿「谱里有没有这个人」去定。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

# ★ 比对一律走繁简/异体折叠（947 条，data/variants.json）。
#   同一个坑栽过三次：谱里「啟昌」和「启昌」是同一个人，
#   只去空格就永远对不上。**凡是拿名字比对，就必须折叠。**
_V = json.loads(Path("data/variants.json").read_text(encoding="utf-8"))
def NS(s):
    t = "".join((s or "").split()).replace("　", "")
    return "".join(_V.get(c, c) for c in t)
O = "长次三四五六七八九幼元"
ORD = {"长": 1, "元": 1, "次": 2, "三": 3, "四": 4, "五": 5,
       "六": 6, "七": 7, "八": 8, "九": 9, "幼": -1}


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    prose = json.loads(Path("data/prose.json").read_text(encoding="utf-8"))
    # 谱里有的名字（含别名），用来把贪心切出来的名字剪对
    known = set()
    for p in people:
        known.add(NS(p["name"]))
        known |= {NS(a["form"]) for a in p["aliases"]}

    def cut(s: str) -> str | None:
        """名字可能是 2 字或 3 字，**拿谱里有没有这个人来定**。"""
        for n in (3, 2):
            if len(s) >= n and s[:n] in known:
                return s[:n]
        return None

    RE_OUT = re.compile(rf"([{O}])子([一-鿿]{{2,4}})出[嗣继]([一-鿿]{{0,3}}?)([一-鿿]{{2,4}})")
    RE_IN = re.compile(rf"立([一-鿿]{{2,4}})公?([{O}])子([一-鿿]{{2,4}})[为承]嗣")

    out_side, in_side = [], []
    for x in prose:
        t = NS(x["text"])
        for m in RE_OUT.finditer(t):
            son, to = cut(m.group(2)), cut(m.group(4))
            if son:
                out_side.append({"speaker": x["host"], "speaker_name": x["host_name"],
                                 "ord": ORD.get(m.group(1)), "son": son, "to": to,
                                 "sent": t[max(0, m.start()-4):m.end()+4],
                                 "src": x["src_human"]})
        for m in RE_IN.finditer(t):
            fa, son = cut(m.group(1)), cut(m.group(3))
            if fa and son:
                in_side.append({"speaker": x["host"], "speaker_name": x["host_name"],
                                "father": fa, "ord": ORD.get(m.group(2)), "son": son,
                                "sent": t[max(0, m.start()-4):m.end()+4],
                                "src": x["src_human"]})

    print(f"生父那边说「我第N子X出嗣给Y」：**{len(out_side)} 条**")
    print(f"嗣父那边说「我立了X的第N子Y」：**{len(in_side)} 条**\n")

    # ── 对账：同一个儿子名 ────────────────────────────
    by_son_out = defaultdict(list)
    by_son_in = defaultdict(list)
    for a in out_side:
        by_son_out[a["son"]].append(a)
    for b in in_side:
        by_son_in[b["son"]].append(b)

    both = sorted(set(by_son_out) & set(by_son_in))
    only_out = sorted(set(by_son_out) - set(by_son_in))
    only_in = sorted(set(by_son_in) - set(by_son_out))

    agree = clash = 0
    clashes = []
    for s in both:
        for a in by_son_out[s]:
            for b in by_son_in[s]:
                # 生父那边的说话人，就该是嗣父那边写的「立某人的儿子」里那个某人
                spk = idx[a["speaker"]]
                same = NS(spk["name"]) == b["father"] or \
                       any(NS(x["form"]) == b["father"] for x in spk["aliases"])
                ordok = a["ord"] is None or b["ord"] is None or a["ord"] == b["ord"]
                if same and ordok:
                    agree += 1
                elif same and not ordok:
                    clash += 1
                    clashes.append((s, a, b))

    print(f"**两边都写了、且对得上的：{agree} 件** ← 两条独立记载互证，铁证")
    print(f"两边都写了、但排行打架：{clash} 件")
    print(f"只有生父那边写了：{len(only_out)} 个儿子名")
    print(f"只有嗣父那边写了：{len(only_in)} 个儿子名\n")

    print("对得上的例子：\n")
    n = 0
    for s in both:
        for a in by_son_out[s]:
            for b in by_son_in[s]:
                spk = idx[a["speaker"]]
                if NS(spk["name"]) != b["father"]:
                    continue
                n += 1
                if n > 5:
                    break
                print(f"   {s}　（第{idx[a['speaker']]['gen']+1}世）")
                print(f"     生父 {a['speaker_name']}（{a['src']}）")
                print(f"          写「{a['sent']}」")
                print(f"     嗣父 {b['speaker_name']}（{b['src']}）")
                print(f"          写「{b['sent']}」")
                print()

    if clashes:
        print("\n排行打架的（谱自己两处说法不一）：\n")
        for s, a, b in clashes[:5]:
            print(f"   {s}：生父说第 {a['ord']} 子，嗣父说第 {b['ord']} 子")
            print(f"     「{a['sent']}」（{a['src']}）")
            print(f"     「{b['sent']}」（{b['src']}）\n")

    Path("data/adoptions.json").write_text(json.dumps(
        {"out": out_side, "in": in_side}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("→ data/adoptions.json")


if __name__ == "__main__":
    main()
