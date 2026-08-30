"""
核译文：**每篇的 src 拼起来，必须一字不差等于原文。**

翻译是解释，原文不是。所以原文这一侧必须能证明一个字都没改、没漏、没多。
用的还是老办法——字符守恒：拼接后逐字比，不一致就把差在哪印出来。
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")


def main() -> None:
    shou = {d["id"]: d for d in json.loads(Path("data/shou.json").read_text(encoding="utf-8"))}
    T = json.loads(Path("data/translations.json").read_text(encoding="utf-8"))

    ok = bad = 0
    for did, t in T["docs"].items():
        d = shou.get(did)
        if not d:
            print(f"✘ {did}　卷首里没有这个 id"); bad += 1; continue
        src = NS("".join(p["src"] for p in t["paras"]))
        raw = NS(d["text"])
        if src == raw:
            print(f"OK  {did}　{len(raw):>4} 字　{len(t['paras'])} 段　一字不差")
            ok += 1
            continue
        bad += 1
        print(f"\n✘  {did}　对不上")
        print(f"   原文 {len(raw)} 字，译文 src 拼起来 {len(src)} 字")
        ca, cb = Counter(raw), Counter(src)
        miss, extra = ca - cb, cb - ca
        if miss:
            print(f"   译文里少了：{''.join(k * v for k, v in miss.items())}")
        if extra:
            print(f"   译文里多了：{''.join(k * v for k, v in extra.items())}")
        for i, (x, y) in enumerate(zip(raw, src)):
            if x != y:
                print(f"   第 {i} 字起分岔：")
                print(f"     原文 …{raw[max(0,i-24):i+30]}…")
                print(f"     译文 …{src[max(0,i-24):i+30]}…")
                break

    print(f"\n共 {ok} 篇一字不差，{bad} 篇有问题")
    total = sum(len(NS(d['text'])) for d in shou.values())
    done = sum(len(NS(shou[i]['text'])) for i in T["docs"] if i in shou)
    print(f"卷首共 {total:,} 字，已译 {done:,} 字 = {done/total*100:.1f}%")
    print(f"（其中《甲子録》{len(NS(shou.get('30_甲子録', {}).get('text', ''))):,} 字是年号对照表，不需要译）")

    left = [(len(NS(d['text'])), d.get('title_read') or d['title'], i)
            for i, d in shou.items() if i not in T["docs"]]
    print("\n还没译的，按字数排：")
    for n, title, i in sorted(left, reverse=True)[:18]:
        print(f"   {n:>6} 字　{title}　（{i}）")


if __name__ == "__main__":
    main()
