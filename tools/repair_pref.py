"""把序里被我悄悄「改正」过的字，按原书改回去。

犯的是同一类错：
  · 重文号「匕」（表示上一个字再读一遍）被展开成了叠字——原匕本匕 → 原原本本
  · 刻本的字被「订正」了——德茂 → 德懋、翊目 → 翊日

标点是我加的，可以留；**字必须是谱上的字**。
办法：每一段按汉字数在原文里滑窗找差异最小的位置，
然后逐字用原文的字替回去，标点位置不动。差异超过 4 个字就不敢动，报出来人工看。
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
NS = lambda s: "".join((s or "").split()).replace("　", "")
HAN = lambda s: re.sub(r"[^㐀-鿿〇]", "", s or "")
IS_HAN = lambda c: bool(re.match(r"[㐀-鿿〇]", c))

S = {d["id"]: NS(d["text"]) for d in json.loads(
    Path("data/shou.json").read_text(encoding="utf-8"))}
path = Path("data/prefaces.json")
P = json.loads(path.read_text(encoding="utf-8"))

fixed = giveup = 0
for x in P["list"]:
    if not x.get("full"):
        continue
    src = HAN(S[re.sub(r"#\d+$", "", x["doc"])])
    for p in x["full"]:
        h = HAN(p["src"])
        if not h or h in src:
            continue
        n = len(h)
        best, bj = n + 1, -1
        for j in range(len(src) - n + 1):
            d = sum(1 for k in range(n) if src[j + k] != h[k])
            if d < best:
                best, bj = d, j
                if d == 0:
                    break
        if bj < 0 or best > 4:
            print(f"✘ {x['doc']}：差 {best} 个字，不敢自动改　{h[:20]}…")
            giveup += 1
            continue

        # 逐字替回原文的字，标点留在原位
        out, k = [], 0
        diffs = []
        for c in p["src"]:
            if IS_HAN(c):
                o = src[bj + k]
                if o != c:
                    diffs.append((c, o, bj + k))
                out.append(o)
                k += 1
            else:
                out.append(c)
        p["src"] = "".join(out)

        ctx = "、".join(f"「{src[max(0, j - 2):j + 2]}」" for _, _, j in diffs)
        note = f"★ 原文照录：谱上此处作{ctx}。"
        if any(o == "匕" for _, o, _ in diffs):
            note += "「匕」是原书的重文号，表示上一个字再读一遍。"
        p["note"] = (p["note"] + "　" + note) if p.get("note") else note
        fixed += 1

path.write_text(json.dumps(P, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\n改回原文 {fixed} 段" + (f"，{giveup} 段没敢动" if giveup else "，没有漏的"))
