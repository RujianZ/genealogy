"""谱自己承认「这里我们不知道／可能错」的句子，逐条摘出来。

★ 承健问的是：「前人序言里说过他们记不清或者错的，那些呢？」
  这是最硬的一份「已知未知」清单——**编谱人自己写下的**。
  我们的判据查出来的是「我们可能弄错的」；这一份是「谱知道自己不知道的」。
  两份要分开看，也要都交给用谱的人。

摘法：在卷首每一篇里找承认性的字眼，把整句连前后文抠出来。
不做归纳、不改一个字。
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

S = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
NS = lambda s: re.sub(r"[\s　]", "", s or "")

KEY = ("失考|無考|无考|莫考|未详|未詳|不可考|无从|無從|难以|難以"
       "|阙|闕|遗漏|遺漏|残缺|殘缺|讹|訛"
       "|错误|錯誤|赦罪|恕罪|俟考|待考|存疑|疑")

# 断句：文言无标点，按这些字断
SPLIT = r"[。；！？，、]|(?<=也)(?=[^也])"

for d in S:
    t = NS(d.get("text", ""))
    if not re.search(KEY, t):
        continue
    parts = [x for x in re.split(SPLIT, t) if x]
    hits = []
    for i, x in enumerate(parts):
        if not re.search(KEY, x):
            continue
        # 连着前后各一句，读得出上下文
        seg = "".join(parts[max(0, i - 1): i + 2])
        if seg not in hits:
            hits.append(seg)
    if not hits:
        continue
    print("=" * 72)
    print(f"【{d.get('id','')}】{d.get('title','')}")
    for h in hits:
        print(f"   · {h}")
