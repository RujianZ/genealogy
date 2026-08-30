"""
每一段事迹，认三个人：**写在谁名下、写的是谁、谁写的**。

现在只有第一个（host = 原文物理上写在谁的条目里）。但：

    光猷条「嗟呼吾父…**男寿堂谨撰**」   写的是光猷，作者是他儿子寿堂
    铣贵条「**氏**夫亡年三十岁柏舟自持…」 写的是他妻子，不是他本人
    光远条「…舅愚晚**李林瀚**拜撰」      作者是外姓舅家的人

所以一段文字该挂在**两三个人**的名片上：
    · 被写的人 → 「关于他的记事」
    · 写的人   → 「他写的文字」　← 这个现在完全没有

★ 只认谱上明写的署名和称谓，**认不出就写「谱上没说」**，不猜。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

_V = json.loads(Path("data/variants.json").read_text(encoding="utf-8"))
fold = lambda s: "".join(_V.get(c, c) for c in (s or ""))
NS = lambda s: fold("".join((s or "").split()).replace("　", ""))

# ── 署名：「男寿堂谨撰」「亲姪孙壁鋆谨撰」「后孙开胜」「合族谨识」 ──
#   关系词 + 名字 + 撰述动词。名字 2–3 字，两种长度都试。
# 关系词按**长的优先**排，否则「姪孙」会被「姪」先吃掉。
_REL = ("亲姪孙|亲侄孙|姪孙|侄孙|族孙|后孙|後孙|胞侄|胞姪|胞姓|房侄|房姪|"
        "亲侄|亲姪|舅愚晚|愚晚|合族|全族|男|子|孙|侄|姪")
_VERB = "谨撰|谨识|谨述|谨选|谨志|拜撰|敬笔|敬议|谨试|谨认撰|代书|敬撰|撰|识|志"
SIGN = re.compile(rf"({_REL})([一-鿿]{{0,4}}?)({_VERB})")
# 署名也可能不带撰述动词，直接落在文末：「…以传於　姪孙寿堂」
SIGN_END = re.compile(rf"({_REL})([一-鿿]{{2,3}})$")

# ── 主角：谱怎么称呼被写的人 ──────────────────────────
ABOUT = [
    (r"(吾父|我父|先父|考|庭椿)", "本人（写的是这一条的主人）"),
    (r"(吾母|我母|先母|妣|萱室)", "他的妻子（即作者的母亲）"),
    (r"(叔父|伯父|叔祖|伯祖)",   "本人（作者称他叔伯）"),
    (r"^氏夫亡|氏夫亡",          "他的妻子（谱上以「氏」起头，讲的是寡妻）"),
    (r"([一-鿿]氏)烈性|([一-鿿]氏)夫亡", "他的妻子"),
]


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    prose = json.loads(Path("data/prose_ents.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}

    by_name = defaultdict(list)
    for p in people:
        for f in {NS(p["name"])} | {NS(a["form"]) for a in p["aliases"]}:
            if len(f) >= 2:
                by_name[f].append(p)

    stat = Counter()
    for x in prose:
        t = NS(x["text"])
        host = idx[x["host"]]

        # ── 作者 ──
        author = None
        hits = list(SIGN.finditer(t))
        if not hits:
            # 文末直接署名，没有「谨撰」二字
            m2 = SIGN_END.search(t)
            if m2:
                hits = [type("M", (), {"group": lambda self, i, _m=m2: (
                    _m.group(1) if i == 1 else _m.group(2) if i == 2 else "（文末署名）")})()]
        for m in hits:
            rel, nm, verb = m.group(1), m.group(2), m.group(3)
            cands = []
            for n in (3, 2):
                if len(nm) >= n and nm[:n] in by_name:
                    cands = by_name[nm[:n]]; nm = nm[:n]; break
            if rel in ("合族", "全族") and not nm:
                author = {"rel": rel, "name": "", "verb": verb,
                          "targets": [], "note": "全族公议，没有署个人名"}
                break
            if not cands:
                if nm:
                    author = {"rel": rel, "name": nm, "verb": verb, "targets": [],
                              "note": "谱里找不到这个人，可能是外姓"}
                continue
            # 世次得说得通：儿子比本人晚一代，侄孙晚两代…
            want = {"男": 1, "子": 1, "孙": 2, "侄": 1, "姪": 1, "亲侄": 1, "亲姪": 1,
                    "胞侄": 1, "胞姓": 1, "房侄": 1, "房姪": 1,
                    "姪孙": 2, "侄孙": 2, "亲姪孙": 2, "亲侄孙": 2,
                    "后孙": None, "後孙": None, "族孙": 2}.get(rel)
            tg = []
            for p in cands:
                d = (p["gen"] or 0) - (host["gen"] or 0)
                ok = want is None or d == want
                tg.append({"pid": p["pid"], "name": p["name"], "gen": p["gen"],
                           "src_human": p["src_human"], "strong": ok,
                           "note": (f"署「{rel}{nm}」，他正好比本条主人晚 {d} 代"
                                    if ok else
                                    f"署「{rel}{nm}」，但他比本条主人晚 {d} 代，对不上")})
            author = {"rel": rel, "name": nm, "verb": verb, "targets": tg,
                      "note": f"谱上署「{rel}{nm}{verb}」"}
            break
        if author:
            stat["有署名" if author["targets"] else "有署名但认不出人"] += 1
        x["author"] = author

        # ── 主角 ──
        about = None
        for rx, why in ABOUT:
            if re.search(rx, t):
                about = {"who": why, "why": f"原文里有「{re.search(rx, t).group(0)}」"}
                break
        if not about:
            about = {"who": "本人（谱上没另说是谁）", "why": "原文没有指明别人"}
            stat["主角靠默认"] += 1
        else:
            stat["主角有明证"] += 1
        x["about2"] = about

    Path("data/prose_ents.json").write_text(
        json.dumps(prose, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(prose)} 段事迹\n")
    for k, v in stat.most_common():
        print(f"   {v:>5}　{k}")

    signed = [x for x in prose if x.get("author") and x["author"]["targets"]]
    print(f"\n**认出作者的：{len(signed)} 段**\n")
    who = Counter()
    for x in signed:
        for t in x["author"]["targets"]:
            if t["strong"]:
                who[(t["pid"], t["name"], t["gen"])] += 1
    print("写得最多的几个人：")
    for (pid, nm, gen), n in who.most_common(10):
        print(f"   {n} 篇　{nm}（第{gen}世）")

    print("\n例子：\n")
    for x in signed[:8]:
        a = x["author"]
        tg = a["targets"][0] if a["targets"] else None
        print(f"   {x['host_name']}（第{x['gen']}世）那一条，{x['chars']} 字")
        print(f"     写的是：{x['about2']['who']}　（{x['about2']['why']}）")
        print(f"     作者：　{a['note']}"
              + (f" → {tg['name']}（第{tg['gen']}世）{'' if tg['strong'] else ' ⚠世次对不上'}"
                 if tg else ""))
        print()


if __name__ == "__main__":
    main()
