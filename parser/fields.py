"""
字段抽取。

规矩只有两条：

  1. 每一行只能有一个去处——某个字段，或者 unparsed。
     抽完断言：Σ(各字段行数) + Σ(unparsed 行数) == 段内总行数。
     对不上就抛异常。

  2. 只记文本里写着的东西。
     「光量公长子」记 father_name="光量"、filiation="长子"，
     至于谱里有几个光量、是哪一个，这里一概不管——那是 link 的事，
     而且 link 也不猜。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .segment import Segment, Line, ORDINALS, gen_of

# ---------------------------------------------------------------- 模式

RE_FILIATION = re.compile(
    rf"^([\u4e00-\u9fa5]{{1,4}}?)公?(?:之子|([{ORDINALS}])子|(嗣)子|(祧)子)$")
RE_ZI = re.compile(r"^字\s*(.+)$")
RE_HUI = re.compile(r"^讳\s*(.+)$")
RE_HAO = re.compile(r"^号\s*(.+)$")
RE_MING = re.compile(r"^名\s*(.+)$")
RE_AGE = re.compile(r"^(?:年|享年|享寿)[一二三四五六七八九十百]+$")
RE_LEAD = re.compile(r"^(生于|生於|殁于|殁於|葬)$")
RE_SPOUSE = re.compile(
    r"^(娶侧室|继妣|復妣|复妣|又妣|继娶|復娶|复娶|妣|娶|聘|庶)"
    r"([\u4e00-\u9fa5]{1,4})(.*)$")
RE_SONS = re.compile(r"^生子[一二三四五六七八九十]*$")
RE_DAUS = re.compile(r"^(?:生女|女)[一二三四五六七八九十]*$")
RE_BARE_NAME = re.compile(r"^[\u4e00-\u9fa5]{1,3}$")
RE_GEN_HDR = re.compile(r"^第?[一二三四五六七八九十廿卅百]+世$")

TITLES = ["郡庠学生", "国学生", "太学生", "文学生", "候補巡政厅", "例授登仕郎",
          "候选通判", "侯选通判", "候选县丞", "博士研究生", "陆军参谋", "陸军参谋",
          "省教研会员", "庠生", "庠士", "增生", "廪生", "贡生", "监生", "生员",
          "佾生", "儒士", "业儒", "职员", "登仕郎", "北大生", "大学生",
          "研究生", "硕士", "大专", "中专", "高中", "初中", "大学"]

# 注记标签：命中即打标，原文照留
MARKS = {
    "出嗣": r"出嗣|出祠",
    "立嗣": r"立.{0,8}?为(?:嗣|祠)|立爱子|爱立",
    "兼祧": r"兼祧|承祧|祧子",
    "迁徙": r"迁居|迁陕|迁四川|迁江西|迁圻州|迁江南|居陕西|迁葬",
    "殉难": r"捐躯|烈士|殉|阵亡|牺牲",
    "有碑": r"有碑",
    "无后": r"无出|未付后|幼殁|幼殇|殇",
    "改嫁": r"再醮|再樵|再蘸",
    "招赘": r"坐婿|招婿|招[\u4e00-\u9fa5]氏?",
    "旌表": r"给匾|旌其堂|旌表",
    "节烈": r"柏舟|矢志|完节|苦节|守节",
    "传赞": r"赞曰|讚曰|嗟|呜呼|嗚呼|惟我|谨识|谨撰|拜撰",
}


@dataclass
class FieldVal:
    """一个字段值，连同它出自哪几行。任何一条都能回到原文。"""
    text: str
    line_seq: list = field(default_factory=list)


@dataclass
class SpouseRec:
    rel: str
    name_raw: str
    birth: FieldVal | None = None
    death: FieldVal | None = None
    burial: FieldVal | None = None
    line_seq: list = field(default_factory=list)


@dataclass
class PersonRec:
    pid: str
    seg_id: str
    name_raw: str
    gen: int | None
    vol: str
    page: int
    row: int
    col: int
    juan: str
    section: str

    zi: FieldVal | None = None
    hui: FieldVal | None = None
    hao: FieldVal | None = None
    ming: FieldVal | None = None
    father_name: str = ""
    filiation: str = ""
    father_src: str = ""          # "行内" / "页眉指向"
    is_heir: bool = False

    birth: FieldVal | None = None
    death: FieldVal | None = None
    burial: FieldVal | None = None
    age: FieldVal | None = None

    titles: list = field(default_factory=list)
    marks: list = field(default_factory=list)      # (标签, 原文行)
    spouses: list = field(default_factory=list)
    sons_claimed: list = field(default_factory=list)
    daughters_claimed: list = field(default_factory=list)
    unparsed: list = field(default_factory=list)   # 认不出的行，原样保留

    raw_text: str = ""
    line_count: int = 0

    def src_human(self) -> str:
        j = f"卷{self.juan}·" if self.juan else ""
        s = f"{self.section}·" if self.section else ""
        return f"{self.vol}·{j}{s}第{self.page}页·第{self.row}行"


def extract(seg: Segment, pointers: dict, seq_in_slot: int) -> PersonRec:
    head = seg.head
    p = PersonRec(
        pid=f"P-{head.vol}-{head.page:04d}-{head.row}-{head.col}-{seq_in_slot}",
        seg_id=seg.seg_id,
        name_raw=head.text.strip(),
        gen=gen_of(head.vol, head.page, head.row),
        vol=head.vol, page=head.page, row=head.row, col=head.col,
        juan=head.juan, section=head.section,
        raw_text=seg.text, line_count=len(seg.lines),
    )

    used = {head.seq}          # 名字行本身已归属
    lead = None                # 上一行是「生于」「殁于」「葬」
    cur_sp: SpouseRec | None = None
    mode = None                # sons / daughters

    def take(l: Line):
        used.add(l.seq)

    for l in seg.lines[1:]:
        t = l.text.strip()
        if not t:
            take(l)            # 空行：有归属，不算 unparsed
            continue

        if RE_GEN_HDR.match(t):        # 世代列头，版面噪声
            take(l)
            continue

        if RE_LEAD.match(t):
            lead = t[0]
            take(l)
            continue

        m = RE_FILIATION.match(t)
        if m and not p.father_name:
            p.father_name = m.group(1)
            p.filiation = (m.group(2) + "子") if m.group(2) else (
                "嗣子" if m.group(3) else "祧子" if m.group(4) else "之子")
            p.is_heir = bool(m.group(3) or m.group(4))
            p.father_src = "行内"
            take(l)
            continue

        hit = False
        for rx, attr in ((RE_ZI, "zi"), (RE_HUI, "hui"),
                         (RE_HAO, "hao"), (RE_MING, "ming")):
            mm = rx.match(t)
            if mm and getattr(p, attr) is None:
                setattr(p, attr, FieldVal(mm.group(1).strip(), [l.seq]))
                take(l); hit = True
                break
        if hit:
            continue

        if RE_AGE.match(t):
            p.age = p.age or FieldVal(t, [l.seq])
            take(l)
            continue

        if t in TITLES:
            p.titles.append(t)
            take(l)
            continue

        ms = RE_SPOUSE.match(t)
        if ms:
            cur_sp = SpouseRec(rel=ms.group(1),
                               name_raw=ms.group(2) + ms.group(3).strip(),
                               line_seq=[l.seq])
            p.spouses.append(cur_sp)
            mode = None
            lead = None
            take(l)
            continue

        if RE_SONS.match(t):
            mode = "sons"; take(l); continue
        if RE_DAUS.match(t):
            mode = "daughters"; take(l); continue

        # 引导词之后的一行 = 日期 / 葬地
        if lead in ("生", "殁", "葬"):
            tgt = cur_sp if (cur_sp is not None and _own_filled(p, lead)) else p
            _assign(tgt, lead, t, l.seq)
            lead = None
            take(l)
            continue

        if t.startswith("葬"):
            tgt = cur_sp if (cur_sp is not None and _own_filled(p, "葬")) else p
            _assign(tgt, "葬", t, l.seq)
            take(l)
            continue

        if mode == "sons" and RE_BARE_NAME.match(t):
            p.sons_claimed.append(t); take(l); continue
        if mode == "daughters":
            p.daughters_claimed.append(t); take(l); continue

        # 到这里还没归类：打注记标签，原文进 unparsed，两边都不丢
        tagged = False
        for tag, pat in MARKS.items():
            if re.search(pat, t):
                p.marks.append((tag, t))
                tagged = True
        p.unparsed.append({"seq": l.seq, "text": l.text,
                           "page": l.page, "tagged": tagged})
        take(l)

    # ---- 行数守恒 ----
    if len(used) != len(seg.lines):
        missing = [l.seq for l in seg.lines if l.seq not in used]
        raise AssertionError(
            f"{p.pid} 行数不守恒：段内 {len(seg.lines)} 行，"
            f"已归属 {len(used)} 行，漏 {missing[:5]}")

    # 页眉指向：第 1 行没写父名时，父亲在上一页（或上一册）
    if not p.father_name and p.row == 1:
        fn, fil, raw = pointers.get(p.vol, {}).get(p.page, ("", "", ""))
        if fn:
            p.father_name, p.filiation = fn, fil
            p.father_src = f"页眉指向「{raw.strip()}」"
    return p


def _own_filled(p: PersonRec, lead: str) -> bool:
    return {"生": p.birth, "殁": p.death, "葬": p.burial}[lead] is not None


def _assign(tgt, lead: str, text: str, seq: int):
    attr = {"生": "birth", "殁": "death", "葬": "burial"}[lead]
    if getattr(tgt, attr) is None:
        setattr(tgt, attr, FieldVal(text, [seq]))
    else:
        cur = getattr(tgt, attr)
        cur.text += " ｜ " + text          # 追加，不覆盖
        cur.line_seq.append(seq)


def extract_all(segments, pointers):
    people, slot = [], {}
    for seg in segments:
        if seg.kind != "person":
            continue
        h = seg.head
        k = (h.vol, h.page, h.row, h.col)
        people.append(extract(seg, pointers, slot.get(k, 0)))
        slot[k] = slot.get(k, 0) + 1
    return people
