"""从 .doc（旧版 Word 复合文档）里把中文文字抠出来。

不用第三方库：WordDocument 流里正文是 UTF-16LE，
连续的中日韩汉字扫出来就够查证一个词是怎么写的。

    python tools/readdoc.py source/合二（5、6、7）.doc 粱四
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

path = Path(sys.argv[1])
needle = sys.argv[2] if len(sys.argv) > 2 else None
span = int(sys.argv[3]) if len(sys.argv) > 3 else 40

raw = path.read_bytes()
# UTF-16LE：汉字是 “低位 高位”，高位在 0x4E–0x9F 之间
chars = []
for i in range(0, len(raw) - 1, 2):
    cp = raw[i] | (raw[i + 1] << 8)
    if 0x3400 <= cp <= 0x9FFF or cp in (0x3001, 0x3002, 0x300C, 0x300D):
        chars.append(chr(cp))
    else:
        chars.append("\n" if chars and chars[-1] != "\n" else "")
text = "".join(chars)
runs = [r for r in text.split("\n") if len(r) >= 2]
print(f"{path.name}：抠出 {sum(len(r) for r in runs):,} 个汉字，{len(runs)} 段")

if needle:
    flat = "\n".join(runs)
    hits = [m.start() for m in re.finditer(re.escape(needle), flat)]
    print(f"「{needle}」出现 {len(hits)} 次")
    for h in hits[:12]:
        print("   …" + flat[max(0, h - span):h + span].replace("\n", "｜") + "…")
