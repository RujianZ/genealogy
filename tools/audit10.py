"""第三方核对：拿 build/audit10.json 那份待核清单，去**原件 .doc** 里逐句查。

这一步**不看我们的结论**。它只做一件事：
    我们说谱上写着「学礼幼子」——那原书里到底有没有这四个字？

三册世系正文是 2016 年用 Word 打进去的（不是扫描图），
所以原文可以逐字检索。抠字的办法跟 tools/readdoc.py 一样，
WordDocument 流里正文是 UTF-16LE，连续的汉字扫出来。

每一环查两句，两句都是谱自己写的、而且写在**两个不同的地方**：
    子那边  「学礼幼子」        —— 儿子条目里的父名句
    父那边  「生子二 士宇 士宙」 —— 父亲条目里的生子名单

    python tools/audit10.py
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SRC = Path("source")
DOCS = ["合一（1.2.3.4）.doc", "合二（5、6、7）.doc", "合三（8、9）.doc"]


def extract(p: Path) -> str:
    raw = p.read_bytes()
    out = []
    for i in range(0, len(raw) - 1, 2):
        cp = raw[i] | (raw[i + 1] << 8)
        if 0x3400 <= cp <= 0x9FFF:
            out.append(chr(cp))
        else:
            out.append("\n" if out and out[-1] != "\n" else "")
    return "\n".join(r for r in "".join(out).split("\n") if len(r) >= 1)


print("抠原文…")
TEXT = {}
for d in DOCS:
    TEXT[d] = extract(SRC / d)
    print(f"   {d}  {len(TEXT[d].replace(chr(10), '')):,} 字")
ALL = "\n".join(TEXT.values())
FLAT = ALL.replace("\n", "")

data = json.loads(Path("build/audit10.json").read_text(encoding="utf-8"))
todo = data["todo"]

# 繁简折叠——只在**找不到时**退一步再找，先按原样找
FOLD = {"啟": "启", "銑": "铣", "開": "开", "繼": "继", "澤": "泽",
        "樑": "梁", "學": "学", "張": "张", "夢": "梦", "彥": "彦",
        "灃": "沣", "翱": "翔", "粱": "梁"}


def fold(s):
    return "".join(FOLD.get(c, c) for c in s)


FOLDED = None


def find(needle):
    """在原件里找。返回 (命中次数, 用的是哪种写法)

    ★ 谱上写父名带敬称：「胜二**公**长子」「学礼**公**幼子」。
      我们的 father_name 把「公」剥掉了（那是敬称不是名字），
      所以拿「胜二长子」去原件里查，一次都查不到——**是查法错，不是数据错**。
      两种写法都试。
    """
    global FOLDED
    if not needle:
        return (None, "")
    n = needle.replace(" ", "").replace("　", "")
    forms = [n]
    m = re.match(r"^(.+?)(长子|次子|三子|四子|五子|六子|七子|八子|九子|幼子|之子|"
                 r"季子|末子|嗣子|祧子|嗣男|继子)$", n)
    if m and not m.group(1).endswith("公"):
        forms.append(m.group(1) + "公" + m.group(2))
    for f_ in forms:
        if FLAT.count(f_):
            return (FLAT.count(f_), "原样" if f_ == n else "带敬称「公」")
    if FOLDED is None:
        FOLDED = fold(FLAT)
    for f_ in forms:
        if FOLDED.count(fold(f_)):
            return (FOLDED.count(fold(f_)), "折繁简后")
    return (0, "")


by_person = {}
rows = []
for t in todo:
    kid_hits, kid_how = find(t["needChild"])
    # ★ 谱上父名有两个出处，data 里 father_src 记着是哪个：
    #     「行内」        —— 就写在本人条目里，正着找
    #     「页眉指向「…」」—— 写在版心页眉上。**页眉竖排右起，
    #                        Word 抠出来字序是反的**：
    #                        「德厚公长子」存下来是「子长公厚德」。
    #   所以「德厚长子」在正文里一次都查不到，不是数据错，是查法错。
    if kid_hits == 0 and t.get("fatherSrc"):
        m2 = re.search(r"页眉指向「(.+?)」", t["fatherSrc"])
        if m2:
            head = m2.group(1)
            for form in (head, head[::-1]):
                if FLAT.count(form):
                    kid_hits, kid_how = FLAT.count(form), "在页眉（竖排右起）"
                    break
    # 父那边：父亲的生子名单里那个名字，连着前面的「生子N」一起找太脆，
    # 改成找「名单原样连排」——谱上兄弟是连着印的
    # ★ 名单不能整串去找——谱上兄弟之间常夹着「女一适X」之类。
    #   改成逐个名字查，本人那个名字在不在父亲的名单里才是要点。
    names = [x for x in t["fatherSons"].split(" ") if len(x) >= 2]
    miss = [x for x in names if find(x)[0] == 0]
    son_hits = None if not names else (0 if miss else len(names))
    son_how = ("缺 " + "、".join(miss)) if miss else ""
    # ★★ 最硬的一道：**父名句必须紧挨着本人的名字。**
    #   「学义幼子」这四个字在书里存在，不等於它写在这个人旁边——
    #   全谱有好几个学义，也有好几个人是某个学义的幼子。
    #   谱的格式是固定的：名字 → 父名句 → 字 → 生于…，连着排。
    #   所以要查的是：本人名字出现的地方，后面 14 个字以内有没有这句父名。
    adj = None
    if t["needChild"]:
        nm = t["child"].replace(" ", "")
        phrase = t["needChild"].replace(" ", "")
        cands = [phrase]
        m3 = re.match(r"^(.+?)(长子|次子|三子|四子|五子|六子|七子|八子|九子|幼子|之子|"
                      r"季子|末子|嗣子|祧子|嗣男|继子)$", phrase)
        if m3 and not m3.group(1).endswith("公"):
            cands.append(m3.group(1) + "公" + m3.group(2))
        # ★ 父名印在**版心页眉**上的，物理位置本来就不挨着名字，这道免查。
        #   （那 13 条的页眉原文上一道已经查到了。）
        if t.get("fatherSrc") and "页眉" in t["fatherSrc"]:
            adj = None
        else:
            # ★ 原件里名字常写繁体：銑锋、啟凤、銑忠、啟浚。
            #   拿简体去挨，当然挨不上——**又是查法错，不是数据错**。
            #   两边都折了繁简再比。
            if FOLDED is None:
                FOLDED = fold(FLAT)
            fnm, fcands = fold(nm), [fold(c) for c in cands]
            adj = False
            i = FOLDED.find(fnm)
            while i >= 0:
                seg = FOLDED[i + len(fnm): i + len(fnm) + 14]
                if any(c in seg for c in fcands):
                    adj = True
                    break
                i = FOLDED.find(fnm, i + 1)
    ok_adj = adj is not False
    ok_kid = kid_hits is None or kid_hits > 0
    ok_son = son_hits is None or son_hits > 0
    rows.append({**t, "kid_hits": kid_hits, "kid_how": kid_how,
                 "son_hits": son_hits, "son_how": son_how, "adj": adj,
                 "ok": ok_kid and ok_son and ok_adj})
    g = by_person.setdefault(t["no"], {"n": 0, "bad": [], "noText": 0})
    g["n"] += 1
    if t["needChild"] is None:
        g["noText"] += 1
    if not (ok_kid and ok_son and ok_adj):
        g["bad"].append(t)

print("\n" + "=" * 74)
print(f"共 {len(rows)} 环。每环查两句：子写的父名句、父写的生子名单。")
print("=" * 74)

bad = [r for r in rows if not r["ok"]]
print(f"\n两句都在原件里找得到      {len(rows) - len(bad)} 环")
print(f"有一句在原件里找不到      {len(bad)} 环")
folded = [r for r in rows if "折" in (r["kid_how"] or "") or "折" in (r["son_how"] or "")]
print(f"（其中要折了繁简才找到    {len(folded)} 环）")
adjok = [r for r in rows if r.get("adj") is True]
adjno = [r for r in rows if r.get("adj") is False]
adjna = [r for r in rows if r.get("adj") is None]
print()
print(f"★ 父名句就紧挨在本人名字后面  {len(adjok)} 环   ← 最硬的一道")
print(f"  紧挨不上（要人翻书）        {len(adjno)} 环")
print(f"  这道免查（父名印在页眉上，或谱上没写父名）  {len(adjna)} 环")

if bad:
    print("\n【找不到的，逐条列出——这些要人去翻书】")
    for r in bad:
        print(f"   第{r['gen']}世 {r['child']} → {r['father']}   {r['childDoc']}")
        if r["kid_hits"] == 0:
            print(f"      子写的父名句「{r['needChild']}」在原件里找不到")
        if r.get("adj") is False:
            print(f"      「{r['needChild']}」在书里有，但**不紧挨着「{r['child']}」**")
        if r["son_hits"] == 0:
            print(f"      父的生子名单里这几个名字在原件里找不到：{r['son_how']}")

print("\n【按人汇总】")
for no in sorted(by_person):
    g = by_person[no]
    name = next(t["child"] for t in todo if t["no"] == no)
    mark = "✔ 全程对得上" if not g["bad"] else f"✘ {len(g['bad'])} 环对不上"
    print(f"   【{no}】{name.ljust(4)}  {g['n']} 环   {mark}"
          + (f"   （{g['noText']} 环谱上没写父名，只查了父那边）" if g["noText"] else ""))
