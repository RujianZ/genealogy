"""
穷举提取：把一个 .docx 里**每一个带字的节点**都捞出来，一个不漏。

设计原则和 CLAUDE.md 一致——不猜、不漏、可追溯：

* 不挑部件。docx 是个 zip，里面所有 .xml/.rels 部件全部遍历，
  不是只看 word/document.xml。页眉、页脚、脚注、尾注、批注、
  文本框、组合图形、图表、艺术字，只要是个部件就进。
* 不挑标签。凡是承载文字的节点类型全收：
    w:t         正文文字
    w:delText   修订删除的文字（删了也是历史，照收）
    w:instrText 域代码（页码、引用等）
    a:t         DrawingML 文字（组合图形/艺术字——「第一世…第五世」在这里）
    v:*         VML 文字（Word 97 时代的文本框，转换后常残留）
    m:t         公式文字
  遇到没见过的标签会报出来，不静默跳过。
* mc:AlternateContent 只取 w:Choice 分支，忽略 Fallback，
  否则同一段文字会被数两遍。两边的字数都单独记账，能看出差多少。
* 每个字都带地址：部件路径 + 在部件里的节点序号 + 祖先链。

输出 JSON：{parts: [...], nodes: [...], media: [...], totals: {...}}
"""
from __future__ import annotations

import json
import sys
import zipfile
from collections import Counter
from pathlib import Path

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
V = "urn:schemas-microsoft-com:vml"

# 承载文字的节点。key = (namespace, localname)，value = 分类标签
TEXT_NODES = {
    (W, "t"): "正文",
    (W, "delText"): "修订删除",
    (W, "instrText"): "域代码",
    (W, "noBreakHyphen"): "连字符",
    (A, "t"): "图形文字",
    (M, "t"): "公式",
    (V, "textpath"): "VML艺术字",
}
# 这些标签本身不带字，但常被误认为带字——显式忽略，避免"没见过的标签"噪音
KNOWN_EMPTY = {"tab", "br", "cr", "softHyphen"}


def qn(el) -> tuple[str, str]:
    """返回 (namespace, localname)"""
    tag = el.tag
    if not isinstance(tag, str):
        return ("", "")
    if tag.startswith("{"):
        ns, _, ln = tag[1:].partition("}")
        return (ns, ln)
    return ("", tag)


def ancestors(el, root) -> str:
    """祖先链，用来判断这段字在什么容器里（表格/文本框/组合图形…）"""
    chain = []
    cur = el.getparent()
    while cur is not None and cur is not root:
        chain.append(qn(cur)[1])
        cur = cur.getparent()
    return "/".join(reversed(chain))


def harvest_part(name: str, data: bytes) -> tuple[list[dict], Counter, Counter]:
    """遍历一个 XML 部件，返回 (节点列表, 分类计数, 未知标签计数)"""
    nodes: list[dict] = []
    kinds: Counter = Counter()
    unknown: Counter = Counter()
    try:
        root = etree.fromstring(data)
    except etree.XMLSyntaxError as e:
        return nodes, kinds, Counter({f"XML解析失败:{e}": 1})

    # mc:AlternateContent —— 只走 Choice，跳过 Fallback（否则同一段文字数两遍）。
    # ★ 不能用 id(el) 建集合：lxml 的元素是**临时代理对象**，两次遍历同一个底层
    #   节点会拿到不同的 id()，集合根本命中不了。LibreOffice 转出的 docx 会把
    #   每个文本框同时写成 Choice(DrawingML) + Fallback(VML) 两份，用 id() 去重
    #   的结果是卷首 47,841 字被数成 91,971 字。改成沿祖先链实时判断。
    def in_fallback(el) -> bool:
        for anc in el.iterancestors():
            if anc.tag == f"{{{MC}}}Fallback":
                return True
        return False

    seq = 0
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        ns, ln = qn(el)
        key = (ns, ln)
        if key in TEXT_NODES:
            txt = el.text or ""
            if ln == "noBreakHyphen":
                txt = "-"
            if not txt:
                continue
            fb = in_fallback(el)
            kind = TEXT_NODES[key]
            kinds[kind + ("(Fallback未计入)" if fb else "")] += len(txt)
            nodes.append({
                "part": name, "seq": seq, "kind": kind,
                "fallback": fb,
                "path": ancestors(el, root),
                "text": txt,
            })
            seq += 1
        elif el.text and el.text.strip() and ln not in KNOWN_EMPTY:
            # 有字、但不在已知承载列表里 —— 报出来，绝不静默丢弃
            unknown[f"{ln}"] += len(el.text.strip())
    return nodes, kinds, unknown


def harvest(docx: Path) -> dict:
    out: dict = {"file": docx.name, "parts": [], "nodes": [], "media": [], "totals": {}}
    kinds_all: Counter = Counter()
    unknown_all: Counter = Counter()

    with zipfile.ZipFile(docx) as z:
        for info in sorted(z.infolist(), key=lambda i: i.filename):
            name = info.filename
            data = z.read(name)
            if name.lower().endswith((".xml", ".rels")):
                nodes, kinds, unknown = harvest_part(name, data)
                chars = sum(len(n["text"]) for n in nodes if not n["fallback"])
                out["parts"].append({
                    "part": name, "bytes": info.file_size,
                    "nodes": len(nodes), "chars": chars,
                })
                out["nodes"].extend(nodes)
                kinds_all.update(kinds)
                unknown_all.update(unknown)
            else:
                out["media"].append({
                    "part": name, "bytes": info.file_size,
                    "crc": format(info.CRC, "08x"),
                })

    live = [n for n in out["nodes"] if not n["fallback"]]
    out["totals"] = {
        "parts_xml": len(out["parts"]),
        "parts_media": len(out["media"]),
        "nodes": len(live),
        "chars_raw": sum(len(n["text"]) for n in live),
        "chars_nospace": sum(len("".join(n["text"].split())) for n in live),
        "by_kind": dict(kinds_all),
        "unknown_text_tags": dict(unknown_all),
    }
    return out


def main() -> None:
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    grand = 0
    for docx in sorted(src.glob("*.docx")):
        r = harvest(docx)
        (dst / (docx.stem + ".json")).write_text(
            json.dumps(r, ensure_ascii=False), encoding="utf-8")
        t = r["totals"]
        grand += t["chars_nospace"]
        print(f"{docx.name}")
        print(f"   XML部件 {t['parts_xml']}  媒体 {t['parts_media']}  "
              f"文字节点 {t['nodes']}  字符 {t['chars_raw']}  去空白 {t['chars_nospace']}")
        print(f"   分类: {t['by_kind']}")
        if t["unknown_text_tags"]:
            print(f"   ⚠ 未知承载标签: {t['unknown_text_tags']}")
    print(f"\n合计去空白 {grand} 字")


if __name__ == "__main__":
    main()
