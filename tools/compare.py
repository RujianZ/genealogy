"""
三方对账：我从原件 .doc 提取的 vs 现有 JSONL。

不比总数——总数相等也可能是这边多一个那边少一个。
按**字符多重集**逐字比，差在哪个字、差几个，一目了然。
然后把差异字定位回原文上下文。
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

# 原件文件名 → 现有 JSONL 文件名
PAIRS = {
    "合一（1.2.3.4）": "合一_1_2_3_4_.jsonl",
    "合二（5、6、7）": "合二_5_6_7_.jsonl",
    "合三（8、9）": "合三_8_9_.jsonl",
    "张氏谱首（一）": "张氏谱首_一_.jsonl",
}


def nospace(s: str) -> str:
    return "".join(s.split()).replace("　", "")


def load_harvest(p: Path) -> str:
    r = json.loads(p.read_text(encoding="utf-8"))
    return "".join(n["text"] for n in r["nodes"] if not n["fallback"])


def load_jsonl(p: Path) -> str:
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        for c in json.loads(line)["cells"]:
            out.append(c["text"])
    return "".join(out)


def main() -> None:
    hdir, jdir = Path(sys.argv[1]), Path(sys.argv[2])
    grand_only_src: Counter = Counter()
    grand_only_jsonl: Counter = Counter()

    for stem, jname in PAIRS.items():
        h = nospace(load_harvest(hdir / (stem + ".json")))
        j = nospace(load_jsonl(jdir / jname))
        ch, cj = Counter(h), Counter(j)
        only_src = ch - cj      # 原件有、JSONL 没有 → JSONL 漏了
        only_jsonl = cj - ch    # JSONL 有、原件没有 → 我漏了，或 JSONL 多算了
        grand_only_src.update(only_src)
        grand_only_jsonl.update(only_jsonl)

        print(f"=== {stem} ===")
        print(f"   原件提取 {len(h)}   现有JSONL {len(j)}   差 {len(h) - len(j):+d}")
        if not only_src and not only_jsonl:
            print("   ✓ 字符多重集完全一致")
            continue
        if only_src:
            print(f"   原件有而 JSONL 无（JSONL 漏）共 {sum(only_src.values())} 字：")
            for c, n in only_src.most_common(30):
                print(f"      {c!r} ×{n}")
        if only_jsonl:
            print(f"   JSONL 有而原件无（我漏 或 JSONL 多）共 {sum(only_jsonl.values())} 字：")
            for c, n in only_jsonl.most_common(30):
                print(f"      {c!r} ×{n}")

    print("\n=== 四册合计 ===")
    print(f"   JSONL 漏的字: {sum(grand_only_src.values())}  {dict(grand_only_src.most_common(20))}")
    print(f"   我漏/JSONL多: {sum(grand_only_jsonl.values())}  {dict(grand_only_jsonl.most_common(20))}")


if __name__ == "__main__":
    main()
