"""
段落还原 + 字符守恒切分。

三条硬保证，每一条都由代码断言，不由人保证：

  G1 字符守恒
      源文件里每一个字符，必须落进唯一一条输出记录。
      切分完成后断言：Σ(记录字符) == Σ(源字符)。
      对不上就抛异常，整个流程停下——绝不静默丢字。

  G2 只读不猜
      切分只做一件事：按「名字独占一行」把连续文本流断开。
      认不出来的行不丢弃、不归类，原样进 unparsed，
      并且照样计入字符总数。

  G3 全覆盖
      四册全进，卷首也进（作为文献条目，不是人物条目）。
      页眉、文本框、空白页，一样有去处。

版式规律（在 1064 页上逐页验证）：
  · 一页一表，6 行 2-3 列
  · 第 0 行是页眉带：卷次 / 世系名 / 清河郡 / 跨页父名指向（右起左读）
  · 奇数页正文在第 1 列，偶数页正文在第 0 列
  · 第 1-5 行各是一代，同一行跨页连成一条连续文字流
  · 一个人的记载常被切在相邻两页
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

VOLUMES = [
    ("册1", "张氏谱首_一_.jsonl", "卷首"),
    ("册2", "合一_1_2_3_4_.jsonl", "世系"),
    ("册3", "合二_5_6_7_.jsonl", "世系"),
    ("册4", "合三_8_9_.jsonl", "世系"),
]

# 世代基数：卷首「第一世…第五世」等世代列头在原书中的实际位置
GEN_BASE = {
    "册2": [(1, 6, 1), (7, 16, 6), (17, 44, 11), (45, 300, 16), (301, 372, 21)],
    "册3": [(1, 410, 21)],
    "册4": [(1, 282, 26)],
}

ORDINALS = "长次三四五六七八九十幼"

# 名字独占一行：两个汉字，中间是排版空格
RE_NAME_LINE = re.compile(r"^[\u4e00-\u9fa5]\s+[\u4e00-\u9fa5]$")
# 只排真正的字段行：「讳  通」「字  某」。
# 绝不能把「继」「复」「幼」「长」这类放进来——
# 「继」是第 25 世的字辈，放进去整整一代人（含张关女）会凭空消失。
FIELD_LEAD = frozenset("讳字号名")


def is_name_line(s: str) -> bool:
    s = s.strip()
    return bool(RE_NAME_LINE.match(s)) and s[0] not in FIELD_LEAD


@dataclass
class Line:
    """最小单位。每一行都带完整坐标，任何结论都能一步回到原文。"""
    vol: str
    page: int
    row: int
    col: int
    juan: str
    section: str
    seq: int          # 该行在本册内的全局序号
    text: str
    kind: str         # body / header / textbox / pointer

    @property
    def n(self) -> int:
        return len(self.text)


@dataclass
class Segment:
    """一段连续文本。人物条目、残片、文献段落，都是它。"""
    seg_id: str
    kind: str                    # person / residue / document / header
    lines: list = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(l.text for l in self.lines)

    @property
    def chars(self) -> int:
        return sum(l.n for l in self.lines)

    @property
    def head(self):
        return self.lines[0] if self.lines else None


# ---------------------------------------------------------------- 读入

def body_col(page: int) -> int:
    """奇数页正文在 c1，偶数页在 c0。册4第281页是唯一例外（空白页）。"""
    return 1 if page % 2 == 1 else 0


def page_meta(block: dict) -> tuple[str, str]:
    tb = [c["text"].strip() for c in block["cells"] if c["source"] == "textbox"]
    juan = next((t for t in tb if len(t) <= 2 and t != "清河郡"), "")
    sec = next((t for t in tb if "世系" in t), "")
    return juan, sec


RE_HDR_PTR = re.compile(rf"^([\u4e00-\u9fa5]{{1,4}}?)公?(?:之|([{ORDINALS}]))子$")


def page_pointer(block: dict) -> tuple[str, str, str]:
    """
    页眉带里的跨页父名指向，右起左读。
    「子幼均继」倒过来是「继均幼子」。
    第 1 行的人往往不写父名，因为父亲在上一页——没有这条，
    册与册之间、支系与支系之间的链全断。
    返回 (父名, 排行, 原文)；认不出就全空，不猜。
    """
    for c in block["cells"]:
        if c["r"] != 0 or c["source"] != "cell":
            continue
        t = c["text"].strip()
        if not t or "张 氏" in t or "支下世系" in t:
            continue
        m = RE_HDR_PTR.match(t[::-1].strip())
        if m:
            return m.group(1), (m.group(2) + "子" if m.group(2) else "之子"), t
    return "", "", ""


def gen_of(vol: str, page: int, row: int):
    for lo, hi, base in GEN_BASE.get(vol, []):
        if lo <= page <= hi:
            return base + (row - 1)
    return None


def load_lines(path: Path, vol: str):
    """
    把一册拆成带坐标的行。每个字符都有归属，一个不落。
    返回 (lines, 源字符总数)。
    """
    blocks = [json.loads(l) for l in path.open(encoding="utf-8")]
    lines: list[Line] = []
    total = 0
    seq = 0
    pointers: dict[int, tuple[str, str, str]] = {}

    for blk in blocks:
        page = blk["block_index"]
        juan, sec = page_meta(blk)
        pointers[page] = page_pointer(blk)
        bcol = body_col(page)
        for c in blk["cells"]:
            total += len(c["text"])
            if c["source"] == "textbox":
                kind = "textbox"
            elif c["r"] == 0:
                kind = "pointer" if c is not None and "张 氏" not in c["text"] else "header"
                kind = "header" if "张 氏" in c["text"] else "pointer"
            elif c["c"] == bcol:
                kind = "body"
            else:
                kind = "other"      # 非正文列的残留，照样收，不丢
            for t in c["text"].split("\n"):
                lines.append(Line(vol, page, c["r"], c["c"], juan, sec,
                                  seq, t, kind))
                seq += 1

    # split("\n") 会把 n 个换行变成 n+1 段，字符数少掉换行本身，
    # 这里把换行数补回来，守恒公式才成立
    newline_count = sum(c["text"].count("\n")
                        for blk in blocks for c in blk["cells"])
    return lines, total, newline_count, pointers


# ---------------------------------------------------------------- 切分

def segment_volume(path: Path, vol: str, kind: str):
    """
    切成 Segment，并断言字符守恒。
    正文行按 (册, 行号) 连成流，跨页、跨支系一律不断——
    断流会让被切在两页上的记录丢掉后半段，那是漏记。
    """
    lines, total, nl, pointers = load_lines(path, vol)

    segs: list[Segment] = []
    assigned: list[Line] = []

    if kind == "世系":
        # 正文：按行号分五条流，流内按册内页序
        for r in range(1, 6):
            stream = [l for l in lines if l.kind == "body" and l.row == r]
            stream.sort(key=lambda l: (l.page, l.seq))
            cur: Segment | None = None
            for l in stream:
                if is_name_line(l.text):
                    if cur:
                        segs.append(cur)
                    cur = Segment(f"S-{vol}-{r}-{len(segs):05d}", "person", [l])
                elif cur is not None:
                    cur.lines.append(l)
                elif segs and segs[-1].kind == "residue":
                    # 名字出现之前的碎片：不丢，连续的并成一段
                    segs[-1].lines.append(l)
                else:
                    segs.append(Segment(f"R-{vol}-{r}-{len(segs):05d}",
                                        "residue", [l]))
            if cur:
                segs.append(cur)
            assigned += stream
        # 页眉、文本框、非正文列：按页归成 header 段，一样计入
        rest = [l for l in lines if l.kind != "body"]
        rest.sort(key=lambda l: l.seq)
        by_page: dict[int, list] = {}
        for l in rest:
            by_page.setdefault(l.page, []).append(l)
        for page, ls in by_page.items():
            segs.append(Segment(f"H-{vol}-{page:04d}", "header", ls))
        assigned += rest
    else:
        # 卷首：不切人物，按页归成文献段
        by_page = {}
        for l in lines:
            by_page.setdefault(l.page, []).append(l)
        for page, ls in sorted(by_page.items()):
            segs.append(Segment(f"D-{vol}-{page:04d}", "document", ls))
        assigned = lines

    # ---- G1 断言：字符守恒 ----
    out_chars = sum(s.chars for s in segs) + sum(
        1 for _ in range(0))  # 段内换行已在 text 里，不重复计
    src_chars = total - nl     # 源字符减去被 split 吃掉的换行
    if out_chars != src_chars:
        raise AssertionError(
            f"{vol} 字符不守恒：源 {src_chars} vs 段 {out_chars}，"
            f"差 {src_chars - out_chars}。流程中止，绝不带着丢字往下走。")
    if len(assigned) != len(lines):
        raise AssertionError(
            f"{vol} 行数不守恒：源 {len(lines)} vs 已归属 {len(assigned)}")

    return segs, pointers, {"src_chars": src_chars, "lines": len(lines)}


def segment_all(jsonl_dir: Path):
    all_segs, all_ptr, stats = [], {}, {}
    for vol, fn, kind in VOLUMES:
        segs, ptr, st = segment_volume(jsonl_dir / fn, vol, kind)
        all_segs += segs
        all_ptr[vol] = ptr
        stats[vol] = st | {
            "segments": len(segs),
            "person": sum(1 for s in segs if s.kind == "person"),
            "residue": sum(1 for s in segs if s.kind == "residue"),
        }
    return all_segs, all_ptr, stats


if __name__ == "__main__":
    import sys
    segs, ptr, st = segment_all(Path(sys.argv[1] if len(sys.argv) > 1 else "jsonl"))
    for v, s in st.items():
        print(v, s)
    print("总段数", len(segs),
          "人物段", sum(1 for x in segs if x.kind == "person"),
          "残片段", sum(1 for x in segs if x.kind == "residue"))
