"""从 .doc 里连**表格结构**一起读出来。

旧版 Word 的正文流是线性的 UTF-16，靠控制字符断开：
    0x0D  段落结束
    0x07  单元格结束（一行的最后一个 0x07 是「行结束」）
    0x0B  软换行
世系表就是 Word 表格排的——把这些控制字符留住，格子结构就还原出来了。
「本人正上方那一格是谁」这件事，本来就印在纸上，不必靠统计。

    python tools/readdoc2.py source/合一（1.2.3.4）.doc 继和
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

path = Path(sys.argv[1])
needle = sys.argv[2] if len(sys.argv) > 2 else None
before = int(sys.argv[3]) if len(sys.argv) > 3 else 3
after = int(sys.argv[4]) if len(sys.argv) > 4 else 3

raw = path.read_bytes()
out = []
for i in range(0, len(raw) - 1, 2):
    cp = raw[i] | (raw[i + 1] << 8)
    if 0x3400 <= cp <= 0x9FFF:
        out.append(chr(cp))
    elif cp == 0x07:
        out.append("\t")          # 格子分隔
    elif cp in (0x0D, 0x0B):
        out.append("\n")          # 段落
    elif cp in (0x20, 0x3000):
        out.append(" ")
    else:
        out.append("\x00")        # 非文本，当断点

text = "".join(out)
# 连续的 \x00 折成一个断点；只留下像正文的片段
text = re.sub(r"\x00+", "\x00", text)
blocks = [b for b in text.split("\x00") if len(re.findall(r"[㐀-鿿]", b)) >= 3]

print(f"{path.name}：{len(blocks)} 个文本块")
if not needle:
    for b in blocks[:6]:
        print("─" * 60)
        print(b.strip()[:400])
    sys.exit()

hits = 0
for bi, b in enumerate(blocks):
    if needle not in b:
        continue
    rows = b.split("\n")
    for ri, r in enumerate(rows):
        if needle not in r:
            continue
        hits += 1
        print(f"\n{'─' * 60}\n块 {bi}　行 {ri}")
        for k in range(max(0, ri - before), min(len(rows), ri + after + 1)):
            mark = "→" if k == ri else " "
            cells = [c.strip() for c in rows[k].split("\t")]
            print(f" {mark} " + " │ ".join(c if c else "·" for c in cells))
        if hits >= 6:
            sys.exit()
if not hits:
    print(f"没找到「{needle}」")
