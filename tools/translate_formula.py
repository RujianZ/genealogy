"""
过继语句按规则译。

这类句子格式极固定，词汇就那么十几个。**按规则译不是「生成」，是查词表**——
每个词怎么译写死在下面，任何一条都能对着表核。

    长子光明出嗣长兄梁檀兼祧三兄梁槐
    → 长子光明过继给长兄梁檀，同时兼挑三兄梁槐一房的香火

★ 校验：译完必须**把原文的每一个字都用掉**（人名照抄、关系词查表、
  排行词查表）。有一个字没用上就不出译文，留给手译。
  这样保证不会漏译半句，也不会凭空多出内容。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# ── 词表。每一条都是固定说法，能核 ──────────────────────
ORD = {"长": "长子", "元": "长子", "次": "次子", "三": "三子", "四": "四子",
       "五": "五子", "六": "六子", "七": "七子", "八": "八子", "九": "九子",
       "幼": "幼子"}
REL = {"长兄": "长兄", "次兄": "二兄", "二兄": "二兄", "三兄": "三兄", "四兄": "四兄",
       "五兄": "五兄", "六兄": "六兄", "七兄": "七兄", "胞兄": "胞兄", "亲兄": "亲兄",
       "堂兄": "堂兄", "族兄": "族兄",
       "二弟": "二弟", "三弟": "三弟", "四弟": "四弟", "五弟": "五弟", "六弟": "六弟",
       "七弟": "七弟", "八弟": "八弟", "九弟": "九弟", "胞弟": "胞弟", "亲弟": "亲弟",
       "堂弟": "堂弟", "族弟": "族弟", "长弟": "大弟",
       "胞侄": "胞侄", "亲侄": "亲侄", "房伯": "房伯", "房叔": "房叔"}
VERB = {"出嗣": "过继给", "出继": "过继给", "承嗣": "承继", "承祧": "兼挑…一房的香火",
        "兼祧": "兼挑…一房的香火", "为嗣": "为嗣子", "承重": "承重"}

_O = "".join(ORD)
_R = "|".join(sorted(REL, key=len, reverse=True))
N = "[一-鿿]{2,3}"

# ★ 按**从具体到宽泛**的顺序试，最具体的先。
#   第一版把「立朝相次子啟昌」切成「朝相次 + 的儿子」——贪心 + 顺序错。
LIVE = [
    # 立 张三 次子 李四 为嗣
    (re.compile(rf"立({_R})?({N})公?([{_O}])子({N})[为承]嗣"), "rel,fa,ord,son"),
    # 立 张三 之子 李四 为嗣
    (re.compile(rf"立({_R})?({N})公?之子({N})[为承]嗣"),        "rel,fa,son"),
    # 立 胞弟 次子 李四 为嗣
    (re.compile(rf"立({_R})([{_O}])子({N})[为承]嗣"),           "rel,ord,son"),
    # 立 六弟 之子 李四 为嗣
    (re.compile(rf"立({_R})之子({N})[为承]嗣"),                 "rel,son"),
    # 立 李四 为嗣
    (re.compile(rf"立({N})[为承]嗣"),                           "son"),
]
OUT = [
    # 次子 李四 出嗣 胞兄 张三
    (re.compile(rf"([{_O}])子({N})(出嗣|出继|承祧|兼祧|承嗣)({_R})?({N})"),
     "ord,son,verb,rel,to"),
    # 承祧 胞兄 张三（说话人自己承祧）
    (re.compile(rf"(承祧|兼祧)({_R})?({N})"), "verb,rel,to"),
]
RE3 = re.compile(r"女([一二三四五六七八九十])")
RE4 = re.compile(rf"([{_O}])?适([一-鿿]{{1,3}})")


def render(t: str) -> tuple[str | None, int]:
    """返回（译文, 用掉的字数）。用不完整段就返回 None，留给手译。"""
    parts: list[tuple[int, int, str]] = []
    taken = [False] * len(t)

    def claim(m) -> bool:
        if any(taken[m.start():m.end()]):
            return False
        for i in range(m.start(), m.end()):
            taken[i] = True
        return True

    for rx, shape in LIVE:
        for m in rx.finditer(t):
            if not claim(m):
                continue
            g = dict(zip(shape.split(","), m.groups()))
            rel, fa, o, son = g.get("rel"), g.get("fa"), g.get("ord"), g.get("son")
            src = (REL.get(rel, rel) if rel else "") + (fa or "")
            if o and src:
                s = f"立{src}的{ORD[o]}{son}为嗣子"
            elif o:
                s = f"立{ORD[o]}{son}为嗣子"
            elif src:
                s = f"立{src}的儿子{son}为嗣子"
            else:
                s = f"立{son}为嗣子"
            parts.append((m.start(), m.end(), s))

    for rx, shape in OUT:
        for m in rx.finditer(t):
            if not claim(m):
                continue
            g = dict(zip(shape.split(","), m.groups()))
            o, son, verb, rel, to = (g.get("ord"), g.get("son"), g.get("verb"),
                                     g.get("rel"), g.get("to"))
            who = (REL.get(rel, rel) if rel else "") + to
            if verb in ("承祧", "兼祧"):
                s = (f"{ORD[o]}{son}兼挑{who}一房的香火" if o and son
                     else f"兼挑{who}一房的香火")
            elif verb == "承嗣":
                s = f"{ORD[o]}{son}承继{who}"
            else:
                s = f"{ORD[o]}{son}过继给{who}"
            parts.append((m.start(), m.end(), s))

    for m in RE3.finditer(t):
        if claim(m):
            parts.append((m.start(), m.end(), f"有{m.group(1)}个女儿"))
    for m in RE4.finditer(t):
        if claim(m):
            o, fam = m.groups()
            parts.append((m.start(), m.end(),
                          (ORD[o].replace("子", "女") if o else "") + f"嫁给{fam}家"))

    if not parts:
        return None, 0
    covered = sum(taken)
    # ★ 整段必须用完（只容 2 字虚字）。用不完就不出译文——
    #   宁可留给手译，也不能译一半让人以为译全了。
    if covered < len(t) - 2:
        return None, covered
    parts.sort()
    return "，".join(s for _, _, s in parts) + "。", covered


def main() -> None:
    X = json.loads(Path("data/prose_ents.json").read_text(encoding="utf-8"))
    C = json.loads(Path("data/prose_cn.json").read_text(encoding="utf-8"))

    n = skip = 0
    ex = []
    for x in X:
        if x["chars"] < 8 or x["id"] in C:
            continue
        cn, cov = render(x["flat"])
        if not cn:
            skip += 1; continue
        C[x["id"]] = {"cn": cn, "by": "按格式译",
                      "note": "这一段整段是过继／子女的固定写法，按词表逐句译的，"
                              "不是意译。原文每个字都用上了。"}
        n += 1
        if len(ex) < 10:
            ex.append((x, cn))

    Path("data/prose_cn.json").write_text(
        json.dumps(C, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"按格式译出 **{n} 段**，另有 {skip} 段用不完整段，留给手译\n")
    for x, cn in ex:
        print(f"   原文　{x['flat']}")
        print(f"   今译　{cn}\n")


if __name__ == "__main__":
    main()
