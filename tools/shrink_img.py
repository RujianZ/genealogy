"""
打包前把图压小。原图是书页照片，1600px 高、每张三四百 KB，
25 张就 9 MB——内嵌成 base64 还要再涨三分之一。

压到长边 1400px、质量 78。**书上的字仍然看得清**，
体积能降一大截。原图不动，压过的放 build/img。
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

SRC = Path("prototype/img")
DST = Path("build/img")
MAX = 1400
Q = 78


def main() -> None:
    if DST.exists():
        shutil.rmtree(DST)
    DST.mkdir(parents=True)
    a = b = 0
    for f in sorted(SRC.iterdir()):
        if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            continue
        a += f.stat().st_size
        im = Image.open(f)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > MAX:
            s = MAX / max(w, h)
            im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
        out = DST / (f.stem + ".jpg")
        im.save(out, "JPEG", quality=Q, optimize=True, progressive=True)
        b += out.stat().st_size
        print(f"   {f.stat().st_size/1024:7.0f} → {out.stat().st_size/1024:6.0f} KB  "
              f"{w}×{h} → {im.size[0]}×{im.size[1]}  {f.name}")
    print(f"\n共 {a/1048576:.1f} MB → **{b/1048576:.1f} MB**")


if __name__ == "__main__":
    main()
