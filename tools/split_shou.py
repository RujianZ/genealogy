"""
卷首分篇：把 250 页拆成一篇一篇，导出成可读文本。

页眉带的文本框里写着篇名（「源流序」「旧序」「凡例二十则」…），是现成的地址。
但有三个坑，上一版都踩了：
  ① 有些页页眉没写篇名（1,222 字），不能丢，归到「承前页」
  ② 有一页的「篇名」被读成了整段朝代年表（292 字），要按长度过滤
  ③ 同一篇名会隔开出现（旧序有好几篇），连续同名才算一篇

正文在 r>=1 的单元格和文本框里，页眉带那一行（r0）单独存，不混进正文。
导出 work/卷首/NN_篇名.txt，每篇带页码范围和字数。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 页眉带里的固定字样，不是篇名
FIXED = ("首", "清河郡", "张氏宗谱", "公元二零一六年", "卷")


def page_title(blk: dict) -> str | None:
    """从 r0 的文本框里取篇名。取不到返回 None（不是空字符串——要区分）。"""
    cands = []
    for c in blk["cells"]:
        if c["r"] != 0:
            continue
        t = NS(c["text"])
        if not t or t in FIXED:
            continue
        if any(f in t for f in ("张氏宗谱", "公元")):
            continue
        # 篇名不会超过 12 字；更长的是正文被读进了页眉格
        if len(t) > 12:
            continue
        cands.append(t)
    if not cands:
        return None
    # 多个候选取最长的（「续修补说」比「说」更像篇名）
    return max(cands, key=len)


def page_body(blk: dict, title: str | None) -> str:
    """
    正文 = 全部单元格，减去页眉带那几样固定字样和篇名本身。

    ★ 第一版按 r>=1 取正文，丢了 25,191 字（超过卷首的一半）——
      甲子録、明清年代表这些整版表格的内容就在 r0 里，被当页眉滤掉了。
      不能按行号猜哪里是页眉，要按**内容**排除。
    """
    keep = []
    for c in sorted(blk["cells"], key=lambda c: (c["r"], c["c"])):
        t = NS(c["text"])
        if not t:
            continue
        if t in FIXED or t == title:
            continue
        if "张氏宗谱" in t or t.startswith("公元二零一六年"):
            continue
        keep.append(c["text"])
    return "\n".join(keep)


def main() -> None:
    blocks = [json.loads(l) for l in
              Path("parser/jsonl/张氏谱首_一_.jsonl").read_text(encoding="utf-8").splitlines()
              if l.strip()]

    # 逐页定篇名；没写的沿用上一页（「承前页」），并记录下来
    titles: list[str] = []
    inherited = 0
    cur = "（卷首·未标篇名）"
    for blk in blocks:
        t = page_title(blk)
        if t:
            cur = t
        else:
            inherited += 1
        titles.append(cur)

    # 连续同名合并成一篇
    sections: list[dict] = []
    for i, (blk, t) in enumerate(zip(blocks, titles), 1):
        if not sections or sections[-1]["title"] != t:
            sections.append({"title": t, "from": i, "to": i, "pages": [], "header": []})
        s = sections[-1]
        s["to"] = i
        s["pages"].append(page_body(blk, t))
        hdr = " ".join(NS(c["text"]) for c in blk["cells"] if c["r"] == 0 and NS(c["text"]))
        s["header"].append(hdr)

    out = Path("work/卷首")
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.txt"):
        f.unlink()

    total = 0
    print(f"{'序':>3} {'页码':>9} {'字数':>7}  篇名")
    for i, s in enumerate(sections, 1):
        body = "\n".join(s["pages"])
        n = len(NS(body))
        total += n
        safe = re.sub(r'[\\/:*?"<>|]', "_", s["title"])[:24]
        (out / f"{i:02d}_{safe}.txt").write_text(
            f"# {s['title']}\n# 卷首 第{s['from']}–{s['to']}页（共{s['to']-s['from']+1}页）  {n} 字\n\n{body}",
            encoding="utf-8")
        print(f"{i:>3} {s['from']:>4}–{s['to']:<4} {n:>7}  {s['title']}")

    src = sum(len(NS(c["text"])) for b in blocks for c in b["cells"])
    print(f"\n共 {len(sections)} 篇，{total} 字")
    print(f"卷首源字数 {src}，归入篇目 {total}，差 {src - total}")
    print("   差额 = 页眉带固定字样（张氏宗谱／首／清河郡／公元二零一六年）+ 篇名，")
    print("   每页重复一次，属版式不属篇目正文；单独记账，不算丢。")
    print(f"页眉未写篇名、沿用上一页的：{inherited} 页")
    print(f"导出到 {out}/")


if __name__ == "__main__":
    main()
