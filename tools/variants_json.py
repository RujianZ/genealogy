# -*- coding: utf-8 -*-
"""把 src/core/variants.ts 里的折叠表抽成 data/variants.json，供所有 py 工具共用。

★ 为什么要这一步
  折叠表的**唯一真相**在 `src/core/variants.ts`（build_variants.py 写的那份，每条带依据）。
  py 工具不读 ts，所以抽一份 json。两边必须同步——
  2026-09-04 加「栢→柏」时就是 ts 更新了、json 没更新，
  `attribute_prose.py` 等五个工具用的还是旧表。

★ 正则不能写 [\\u4e00-\\u9fff]
  目标字里有 6 个在扩展 B 区（澫→𬇕、詝→𬣞、譞→𫍽、軏→𫐄、餗→𫗧、饘→𫗴），
  窄区间会把这几条连同源字一起丢掉。用 . 配单字符，靠引号定界。
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

src = Path("src/core/variants.ts").read_text(encoding="utf-8")
# 只取「单字 → 单字」的映射（VARIANTS 表）；反查表的值是数组，天然不匹配
pairs = dict(re.findall(r"'(.)':\s*'(.)'", src))

# ★ 折叠必须幂等：fold(fold(x)) == fold(x)。
#   一旦出现 A→B 且 B→A 的环，同一个名字的两种写法**永远配不上**——
#   fold(「峰」)=「峯」，fold(「峯」)=「峰」，两边各自变成对方，仍然不等。
cycles = sorted({tuple(sorted((k, v))) for k, v in pairs.items() if pairs.get(v) == k})
if cycles:
    print("⚠ 折叠表里有互相指向的环，必须在 variants.ts 里定死一个方向：")
    for a, b in cycles:
        print(f"     {a} → {pairs[a]}   且   {b} → {pairs[b]}")
    sys.exit(1)

Path("data/variants.json").write_text(
    json.dumps(pairs, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"data/variants.json ← src/core/variants.ts：{len(pairs)} 条")
for c in "栢盆璧煇適銑澫饘":
    print(f"   {c} → {pairs.get(c, '（无）')}")
