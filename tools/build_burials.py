"""
葬地归拢：把散在四个字段里的葬地记录，收成一份带出处的索引。

为什么要做：people.json 的 burial 字段只有 784/2258 有值（34.7%）。
用户直系的壁火、继均、光量三代人，葬地全都不在 burial 里，而在 unparsed。
按 burial 建地点索引，他自己的祖先一个都不会出现。

四个来源，每条都标明出自哪里：
  ① p.burial                本人葬地字段
  ② p.marks[]               标记（「有碑：…葬云山下庄屋东边向东南有碑」）
  ③ p.unparsed[]            未归属原文里含「葬」的行
  ④ p.spouses[].burial      配偶葬地字段

不改 people.json。原文一字不动，只是给它一个能查的索引。

地名不做合并——「云山／多云山／云山下／云山水口」是不是一处，
谱里能自证的（见 CLAUDE 记录）才标同组，其余只列候选。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 「葬」之后到哪里为止——碰到这些就说明葬地写完了，后面是别的内容
STOP = re.compile(r"(娶|聘|妣|继娶|复娶|庶|生子|女[一二三四五六七八九十]|生于|殁于|字|讳|号)")

# 卷首《各房私山》《合户雜据》《山图》里出现的山名地名。
# 这是本谱自己的地名表，不是我编的——用来认出葬地串里的地名。
PLACES_FROM_SHOU = [
    "多云山", "云山", "蔡山陈埠港", "陈埠港", "蔡山窊", "金盘架", "蔡山",
    "牌子山", "南池寺", "蜘蛛地", "细山咀", "胡家林", "将军山", "鸣水山",
    "团鱼地", "沙岭岗", "傅家垏", "姚家垅", "姚家塘", "茅家菴", "安德山",
    "毛狗冲", "梅家湾", "夏家场", "高坟坦", "塔坡尖", "官山涧", "响水涧",
    "葫芦顶", "望花楼", "金狮菴", "吴家庄", "晏家庄", "宋家垅", "大岭山",
    "万宝冲", "余云岭", "盘角湾", "芭茅宕", "学堂咀", "粉壁山", "杨冲口",
    "考田", "小溪镇", "多云镇", "什村镇", "垅坪镇", "苦竹口", "芦塘",
]
PLACES_FROM_SHOU.sort(key=len, reverse=True)   # 长的优先，免得「云山」吃掉「多云山」

# 谱内自证同指一处的组。依据写在 note 里，能一条条核。
PLACE_GROUPS = {
    "多云山": {
        "aliases": ["多云山", "云山"],
        "note": "合户雜据给多云山划界「北齐塔坡尖，东以官山涧，西以响水涧」，"
                "山图02 称其「金绒弔葫芦形，合族祖山」；世系葬地中"
                "「云山塔坡尖」7 条、「云山官山涧」2 条、「云山响水涧」1 条、"
                "「云山葫芦」9 条——界址与形名皆同，故判为一处。",
    },
    "蔡山陈埠港": {
        "aliases": ["蔡山陈埠港", "陈埠港", "蔡山"],
        "note": "合户雜据「始祖葬蔡山镇陈埠港，二世三世祖附焉」；"
                "山图01「蔡山镇陈零卖港鲤鱼形，乃厝始祖胜二公也」。"
                "注意「蔡山窊／金盘架」在蕲州何家铺，是另一处，不并入。",
    },
}


def cut_burial(text: str) -> list[str]:
    """从一段话里切出「葬…」的部分。一段里可能有多处葬。"""
    out = []
    for m in re.finditer(r"葬", text):
        rest = text[m.start():]
        stop = STOP.search(rest, 1)
        seg = rest[: stop.start()] if stop else rest
        seg = NS(seg)
        if len(seg) > 2:
            out.append(seg)
    return out


# 山向／坐向术语——地名到这里为止。
# ★ 不能写成「[地支][山向]」：那会把「牌**子山**」「排**子山**」从中间截断，
#   57 条「牌子山」变成「牌」。坐向必须成对出现才算，单个地支不作数。
G = "壬癸子丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥"
DIRECTION = re.compile(
    rf"([{G}]山[{G}]向"          # 壬山丙向
    rf"|[{G}][{G}]向"            # 子午向、艮坤向
    # 不要「[地支]山向」这一条：「牌子山向东南」里的「子山向」会先命中，
    # 地名被截成「牌」。成对的「壬山丙向」和单独的「向东南」已经够用。
    rf"|向[东南西北]|坐[北南东西]|[东南西北]向"
    rf"|兼[{G}]"
    rf"|合墓|同墓|同向|附|与[夫父母兄弟姑翁妇嫂姪祖伯叔婶姊妹侄孙])|^与")

# 缺失声明——编谱人写下的「这里没有记录」，不是地名。
MISSING_DECL = re.compile(r"(生殁葬|公妣殁葬|殁葬|生卒葬|生殁|葬)[^，。]{0,3}(缺|未详|未祥|不详|失考|无考)")
MISSING_PLACE = re.compile(r"^(俱)?(未详|未祥|不详|缺|失考|无考|待补)$")


def place_raw(seg: str) -> str:
    """
    通用地名提取：「葬」之后、山向术语之前的那一段，就是地名。
    不靠词表——「商家岭」「潘家垅托盘地」这些不在卷首山名表上，
    但它们同样是地名，不能因为表里没有就算「认不出」。
    """
    s = seg[1:] if seg.startswith("葬") else seg
    m = DIRECTION.search(s)
    out = (s[: m.start()] if m else s).strip()
    # 「葬未详」「葬俱缺」——谱明说没记，不是地名。原样返回但标成缺失声明。
    return "" if MISSING_PLACE.match(out) else out


def find_places(seg: str) -> list[str]:
    """比对卷首《各房私山》《合户雜据》《山图》的山名表——用于**连到卷首文献**，
    不是用来判断「是不是地名」。表里没有不等于不是地名。"""
    hits = []
    for p in PLACES_FROM_SHOU:
        if p in seg and not any(p in h for h in hits):
            hits.append(p)
    return hits


def group_of(place: str) -> tuple[str | None, str]:
    for g, cfg in PLACE_GROUPS.items():
        if place in cfg["aliases"]:
            return g, cfg["note"]
    return None, ""


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    records: list[dict] = []
    seen: set[tuple] = set()

    def add(owner_id, owner_name, gen, seg, source, src_human, raw):
        key = (owner_id, seg)
        if key in seen:
            # 同一段文字来自多个字段（marks 和 unparsed 常重复）——合并来源，不重复记
            for r in records:
                if r["owner"] == owner_id and r["text"] == seg and source not in r["sources"]:
                    r["sources"].append(source)
            return
        seen.add(key)
        is_decl = source.startswith("缺失声明")
        places = [] if is_decl else find_places(seg)
        groups = []
        for p in places:
            g, note = group_of(p)
            if g and g not in [x["group"] for x in groups]:
                groups.append({"group": g, "note": note, "via": p})
        records.append({
            "owner": owner_id, "owner_name": owner_name, "gen": gen,
            "text": seg, "sources": [source],
            # 缺失声明不是地点。「殁葬缺」是编谱人写下的「这里没有记录」，
            # 界面上要原样显示这四个字，但它不能进地名统计。
            "kind": "缺失声明" if is_decl else "葬地",
            "place_raw": "" if is_decl else place_raw(seg), "places": places,
            "groups": groups, "src_human": src_human, "raw": raw,
        })

    for p in people:
        pid, nm, gen, src = p["pid"], p["name"], p["gen"], p["src_human"]
        if p.get("burial"):
            for seg in cut_burial(p["burial"]["text"]) or [NS(p["burial"]["text"])]:
                add(pid, nm, gen, seg, "burial 字段", src, p["burial"]["text"])
        for m in p["marks"]:
            t = m.get("text") or ""
            for seg in cut_burial(t):
                add(pid, nm, gen, seg, f"marks·{m['tag']}", src, t)
        for u in p["unparsed"]:
            for seg in cut_burial(u["text"]):
                add(pid, nm, gen, seg, "未归属原文", src, u["text"])
        for i, s in enumerate(p["spouses"], 1):
            rid = f"{pid}/配{i}"
            who = f"{nm}之{s['rel']}{s['name_raw']}"
            if s.get("burial"):
                for seg in cut_burial(s["burial"]["text"]) or [NS(s["burial"]["text"])]:
                    add(rid, who, gen, seg, "配偶 burial 字段", src, s["burial"]["text"])
            # 配偶的葬地常粘在她的生／殁字段里（「殁于…幼妣殁葬胡家林向东」）
            for k, lab in (("birth", "配偶 birth 字段"), ("death", "配偶 death 字段")):
                if s.get(k) and "葬" in s[k]["text"]:
                    for seg in cut_burial(s[k]["text"]):
                        add(rid, who, gen, seg, lab, src, s[k]["text"])

        # 本人的生／殁／寿字段里也可能粘着葬地
        for k, lab in (("birth", "birth 字段"), ("death", "death 字段"), ("age", "age 字段")):
            if p.get(k) and "葬" in p[k]["text"]:
                for seg in cut_burial(p[k]["text"]):
                    add(pid, nm, gen, seg, lab, src, p[k]["text"])

        # ★ raw_text 兜底：前面按字段扫完之后，原文里若还有没被收走的「葬」段，
        #   一律收进来。字段划分是上游的判断，兜底才能保证「谱里写了的葬地一条不漏」。
        raw = NS(p["raw_text"])
        for seg in cut_burial(raw):
            add(pid, nm, gen, seg, "raw_text 兜底", src, p["raw_text"])

        # ★ 缺失声明也是记载。CLAUDE.md 第四节：「缺」是编谱人明确写下的
        #   「这里没有记录」，不是数据缺失，界面上要原样显示，不能渲染成空白。
        #   所以「生殁葬缺」「殁葬未详」也建一条记录，标明它是声明不是地点。
        for m in MISSING_DECL.finditer(raw):
            add(pid, nm, gen, m.group(0), "缺失声明（谱明写）", src, p["raw_text"])

    # ── 前缀合并 ──────────────────────────────────────────────────
    # 同一人的两条记录，若一条是另一条的前缀（「葬胡家林向东」vs「葬胡家林向东生」），
    # 那是同一处记载被字段版和 raw_text 版切成了长短两条。保留长的，来源合并——
    # 长的包含短的全部内容，合并不丢字。
    by_owner: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_owner[r["owner"]].append(r)
    drop: set[int] = set()
    for rs in by_owner.values():
        rs.sort(key=lambda r: -len(r["text"]))
        for i, long in enumerate(rs):
            if id(long) in drop:
                continue
            for short in rs[i + 1:]:
                if id(short) in drop:
                    continue
                if long["text"].startswith(short["text"]):
                    for s in short["sources"]:
                        if s not in long["sources"]:
                            long["sources"].append(s)
                    drop.add(id(short))
    merged = len(drop)
    records = [r for r in records if id(r) not in drop]
    print(f"（前缀合并：{merged} 条被并入更长的同源记录，来源已合并，无内容丢失）\n")

    Path("data/burials.json").write_text(
        json.dumps(records, ensure_ascii=False), encoding="utf-8")

    # ── 报表 ──
    owners = {r["owner"] for r in records}
    men = {r["owner"] for r in records if "/" not in r["owner"]}
    old = sum(1 for p in people if p.get("burial"))
    print(f"葬地记录 {len(records)} 条，涉及 {len(owners)} 人")
    print(f"   其中有条目的人 {len(men)}/{len(people)} = {len(men)/len(people)*100:.1f}%"
          f"（原 burial 字段 {old} = {old/len(people)*100:.1f}%）")
    print(f"   净增 {len(men) - old} 人的葬地被找回来\n")

    bysrc = Counter(s for r in records for s in r["sources"])
    print("按来源：")
    for k, v in bysrc.most_common():
        print(f"   {v:>5}  {k}")

    print("\n地名频次（前 24）：")
    pc = Counter(p for r in records for p in r["places"])
    for k, v in pc.most_common(24):
        g, _ = group_of(k)
        print(f"   {v:>5}  {k}{'   → 归组「' + g + '」' if g else ''}")

    print("\n通用提取的地名（前 20，不依赖词表）：")
    prc = Counter(r["place_raw"] for r in records if r["place_raw"])
    for k, v in prc.most_common(20):
        print(f"   {v:>5}  {k}")
    empty = [r for r in records if not r["place_raw"]]
    print(f"\n连地名都提不出的 {len(empty)} 条（{len(empty)/len(records)*100:.1f}%）")
    for r in empty[:5]:
        print(f"   {r['owner_name']}：{r['text'][:36]}")

    print("\n=== 复核：用户直系（按 pid，不按名字——谱里有两个士利）===")
    # pid 从实际上溯链取，不靠猜（上一版 光量 写成 …-3-1-0，实为 …-3-1-1，结果他没出现）
    LINE = ["P-册4-0202-2-0-0", "P-册4-0202-1-0-0", "P-册3-0205-5-1-0",
            "P-册3-0205-4-1-0", "P-册3-0205-3-1-1", "P-册3-0205-2-1-0",
            "P-册3-0198-1-0-0", "P-册2-0191-5-1-0"]
    for pid in LINE:
        rs = [r for r in records if r["owner"] == pid or r["owner"].startswith(pid + "/")]
        for r in rs:
            g = "／".join(x["group"] for x in r["groups"]) or "—"
            print(f"   {r['owner_name']}({r['gen']}世) [{'+'.join(r['sources'])}] {r['text'][:34]}  组：{g}")


if __name__ == "__main__":
    main()
