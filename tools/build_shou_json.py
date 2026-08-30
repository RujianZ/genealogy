"""
把 work/卷首/*.txt 打成 data/shou.json，供界面读取。

每篇带：篇名、页码范围、字数、正文、以及**提到的地名**——
地名是把 build_places.py 认出的一级地名拿来在篇文里比对得到的，
用来做「壁火葬云山 → 跳到山图02 多云山」这类跳转。

右起横排的篇名（「图墓祖公二胜」＝胜二公祖墓图）同时给出正读，原文照留。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")


def unreverse(t: str) -> str:
    r = "".join(reversed(t))
    return r if r != t else ""


def main() -> None:
    places = json.loads(Path("data/places.json").read_text(encoding="utf-8"))
    l1_names = sorted({r["l1"] for r in places if r["l1"] and len(r["l1"]) >= 2},
                      key=len, reverse=True)

    out = []
    for f in sorted(Path("work/卷首").glob("*.txt")):
        lines = f.read_text(encoding="utf-8").split("\n")
        title = lines[0].lstrip("# ").strip()
        meta = lines[1].lstrip("# ").strip()
        body = "\n".join(lines[3:]).rstrip()
        m = re.search(r"第(\d+)–(\d+)页", meta)
        mentions = []
        flat = NS(body)
        for p in l1_names:
            if p in flat and not any(p in x for x in mentions):
                mentions.append(p)
        out.append({
            "id": f.stem,
            "title": title,
            # 只有以「图」字开头的才是右起横排（「图墓祖公二胜」）。
            # 「八派图」本来就是正着写的，不能倒。
            "title_read": unreverse(title) if title.startswith("图") else "",
            "page_from": int(m.group(1)) if m else None,
            "page_to": int(m.group(2)) if m else None,
            "chars": len(flat),
            "text": body,
            "mentions": mentions,
        })

    # ── 山图配对 ──────────────────────────────────────────────
    # 16 幅山图在原书里是「图名一页 + 题记一页」：
    #     图墓祖公二胜（＝胜二公祖墓图，右起横排）
    #     山图（题记正文）
    # 分开存的话 16 篇全叫「山图」，谁也分不清是哪一幅。合并成一篇。
    merged, i = [], 0
    while i < len(out):
        a = out[i]
        b = out[i + 1] if i + 1 < len(out) else None
        if a["title"].startswith("图") and b and b["title"] == "山图":
            merged.append({**b,
                           "id": a["id"],
                           "title": a["title"],
                           "title_read": a["title_read"],
                           "page_from": a["page_from"],
                           "chars": a["chars"] + b["chars"],
                           "text": b["text"]})
            i += 2
        else:
            merged.append(a)
            i += 1
    out = merged

    Path("data/shou.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"卷首 {len(out)} 篇 → data/shou.json  共 {sum(x['chars'] for x in out):,} 字\n")
    print("提到地名最多的几篇：")
    for x in sorted(out, key=lambda x: -len(x["mentions"]))[:8]:
        print(f"   {x['title'][:16]:<18} {x['chars']:>6}字  提到 {len(x['mentions'])} 个地名："
              f"{'、'.join(x['mentions'][:9])}")
    print("\n倒着写的篇名（右起横排）：")
    for x in out:
        if x["title_read"]:
            print(f"   {x['title']}  →  {x['title_read']}")


if __name__ == "__main__":
    main()
