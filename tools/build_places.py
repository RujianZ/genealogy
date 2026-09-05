"""
地点结构：把 1,878 条葬地串拆成四个维度。

    一级地名   云山 / 胡家林 / 牌子山 / 南池寺 …        —— 山、林、寺、镇、村
    二级小地名 私山窊 / 中棚 / 下棚 / 水口 / 望花楼 …    —— 同一座山里的具体处所
    形名       金盘托果 / 鲤鱼形 / 蜘蛛形 / 金盘架 …     —— 风水形，**不是位置**
    方位       东边 / 上 / 下 / 左 / 右 / 头 / 口 / 侧    —— 相对位置

为什么形名要单拎出来：山图03 说细山咀「俗呼金盘托果形」，各房私山又说
多云镇吴家庄「金盘托果形松亭祖在焉」——同一个形名用在不同地方。
把它当二级地名，会把两处不相干的坟归成一处。

二级地名的词表**不是我编的**，是从数据里统计出来的：把一级地名剥掉之后，
剩下的串里出现 ≥3 次的前缀就是候选，再人工核一遍。形名词表来自卷首山图与各房私山原文。
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

# ── 一级地名。来自卷首《合户雜据》《各房私山》《山图》＋葬地高频前缀 ──
L1 = [
    "多云山", "云山", "蔡山陈埠港", "陈埠港", "胡家林", "牌子山", "排子山",
    "南池寺", "蜘蛛地", "细山咀", "将军山", "鸣水山", "团鱼地", "沙岭岗",
    "傅家垏", "姚家垅", "姚家塘", "茅家菴", "安德山", "毛狗冲", "梅家湾",
    "夏家场", "高坟坦", "金狮菴", "吴家庄", "晏家庄", "宋家垅", "大岭山",
    "万宝冲", "余云岭", "盘角湾", "芭茅宕", "学堂咀", "粉壁山", "杨冲口",
    "蔡家坦", "汤家墩", "柳家塘", "商家岭", "白家岭", "赤堂山", "潘家垅",
    "考田", "小溪镇", "多云镇", "什村镇", "垅坪镇", "苦竹口", "芦塘", "蔡山窊",
    # ── 外省。本户第 18–22 世成批入陕，另有江西、河南、安徽的零星葬地。
    #   不把省名立为一级，「陕西省兴安府安康县新建铺余二姐河」这类整串会各自
    #   自成一级——同一个陕西散成六个互不相干的地名，界面上点不到一起，
    #   而这恰恰是全谱最大的一次迁徙。
    "陕西", "江西", "河南", "安徽", "湖北", "四川", "江南",
]

# 省名后面那个「省」字。谱里两种写法都有——「葬陕西省兴安府…」与「葬陕西商州…」。
# 不统一剥掉，同一个陕西会分成「陕西省」和「陕西」两个一级地名，界面上仍是两处。
PROVINCE = {"陕西", "江西", "河南", "安徽", "湖北", "四川"}


def drop_sheng(l1: str | None, rest: str) -> str:
    return rest[1:] if l1 in PROVINCE and rest.startswith("省") else rest

# ── 行政区划：省 → 府／州 → 县 → 镇／乡／铺 → 村，逐层剥。
#   本地地名靠 L2 词表（出现 ≥3 次），外省地名往往只出现一两次，
#   词表法够不着，但**行政区划本身就是分层的**，按字剥即可，不用猜。
ADMIN = re.compile(r"^(?:直棣|直隶)?([一-鿿]{1,4}(?:府|州|县|市|镇|乡|铺|村|区))")

# ── 形名：来自卷首山图题记与各房私山原文，逐条可查 ──
SHAPES = [
    "金绒弔葫芦形", "金绒吊葫芦", "金盘托果", "金盘架", "架上琵琶", "浪花间月",
    "蟒蛇吐剑", "罗汉挺肚", "仙人打纲", "仙人撒网", "众星拱月", "土角流金",
    "美女现羞", "水牛臣卧地", "揽蛇托节", "金盘手链", "双凤林", "海螺形",
    "伏虎地", "鲤鱼形", "蜘蛛形", "团鱼形", "飞雁形", "葫芦形", "金盆托果",
    "金盤托果",
]

# ── 方位词 ──
POS = ["东边", "西边", "南边", "北边", "东头", "西头", "上首", "下首",
       "左边", "右边", "上边", "下边", "背后", "屋后", "路上", "路下",
       "上", "下", "左", "右", "头", "口", "侧", "背", "内", "外", "中"]

L1.sort(key=len, reverse=True)
SHAPES.sort(key=len, reverse=True)
POS.sort(key=len, reverse=True)


def peel(s: str, vocab: list[str]) -> tuple[str | None, str]:
    for v in vocab:
        if s.startswith(v):
            return v, s[len(v):]
    return None, s


def find_any(s: str, vocab: list[str]) -> tuple[str | None, str]:
    """在串中任意位置找一个词，找到就摘掉。

    ★ 形名后面那个「形」字要跟着一起摘。
      词表里存的是「金盘架」「金盘托果」，不带「形」；谱上写的是
      「…地名蔡山凹**金盘架形**亥巳向有碑」。只摘「金盘架」，
      剩下的「形」就粘在地名尾巴上——
          启昌（十七世焕先公）的葬地成了「蕲州大同乡何家铺东北边地名蔡山凹**形**」，
          他妻陈氏那条成了「**蕲州大同乡形**」。
      而这正是 2016 年那一届专程去蕲春找回来的那座坟。
    """
    for v in vocab:
        i = s.find(v)
        if i >= 0:
            j = i + len(v)
            if s[j:j + 1] == "形":      # 形名后面的「形」字一并摘走
                j += 1
            return v, s[:i] + s[j:]
    return None, s


# 这座山自己的成套分区：上棚／中棚／下棚、上庄屋／下庄屋、上铺／下铺。
# 谱里三种前缀都出现，说明「上中下」在这里是地名的一部分，不是方位词。
SET_PLACE = re.compile(r"^[上中下](棚|庄屋|庄层|铺|屋)")

# 二级候选里必须剔掉的：坐向残片、亲属称谓、过继语句碎片——都不是地名
NOT_PLACE = re.compile(
    r"^(与|附|立|同|俱|合|公|妣|父|母|兄|弟|姑|翁|妇|嫂|姪|夫|男|女|子|长|次|幼|三|四|五|六|七|八|九)"
    r"|[壬癸子丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥]{2}$"
    r"|^向|^坐|年|月|日|时|不详|未详|缺")


def build_l2_vocab(tails: list[str], min_n: int = 3) -> list[str]:
    """
    二级地名词表从数据里长出来，不手写：
    剥掉一级地名后的残串，取所有 2–5 字前缀，出现 ≥min_n 次的留下。
    再剔掉明显不是地名的（坐向残片「壬丙」、亲属「与祖」、过继碎片「立长兄」）。
    """
    c: Counter = Counter()
    for t in tails:
        for n in range(2, 6):
            if len(t) >= n:
                c[t[:n]] += 1
    cands = [w for w, n in c.items() if n >= min_n and not NOT_PLACE.search(w)]
    cands.sort(key=len, reverse=True)
    out: list[str] = []
    for w in cands:
        # 不要被更长者包含、且频次相当的短前缀（避免「私山」和「私山窊」并存）
        if any(o.startswith(w) and c[o] >= c[w] * 0.8 for o in out):
            continue
        out.append(w)
    return out


def build_l1_vocab(places: list[str], min_n: int = 4) -> list[str]:
    """
    一级地名也从数据里长：卷首那张表只覆盖本族的公山私山，
    而个人葬地遍布各处（东边门口塘、严家闸五经魁、殷家垅…）。
    把出现 ≥min_n 次的完整 place_raw 也收进一级词表。
    """
    c = Counter(places)
    extra = [p for p, n in c.items() if n >= min_n and 2 <= len(p) <= 6
             and not NOT_PLACE.search(p) and not any(p.startswith(v) for v in L1)]
    return extra


def main() -> None:
    burials = json.loads(Path("data/burials.json").read_text(encoding="utf-8"))
    recs = [r for r in burials if r["kind"] == "葬地" and r["place_raw"]]

    # 第零遍：一级词表补上数据里的高频完整地名
    L1.extend(build_l1_vocab([r["place_raw"] for r in recs]))
    L1.sort(key=len, reverse=True)

    # 第一遍：剥一级地名，收集残串
    tails: list[str] = []
    for r in recs:
        l1, rest = peel(r["place_raw"], L1)
        rest = drop_sheng(l1, rest)
        if l1:
            _, rest = find_any(rest, SHAPES)
            if rest:
                tails.append(rest)
    L2 = build_l2_vocab(tails)
    L2.sort(key=len, reverse=True)

    # 第二遍：正式拆解
    tree: dict[str, dict] = defaultdict(lambda: {"n": 0, "l2": Counter(), "shapes": Counter(),
                                                 "people": []})
    unresolved: list[dict] = []
    out_rows = []
    for r in recs:
        s = r["place_raw"]
        l1, rest = peel(s, L1)
        rest = drop_sheng(l1, rest)
        shape, rest = find_any(rest, SHAPES)
        # 词表里没有的，就让这个串自己当一级——只出现一次的地名也是地名，
        # 「东边门口塘」「严家闸五经魁」「殷家垅」不该因为不在词表上就算「未认出」。
        standalone = False
        if not l1:
            shape2, r2 = find_any(s, SHAPES)
            # 自成一级之前也要过一遍 NOT_PLACE：「与祖母」「附父右」不是地名，
            # 它们是「葬与祖母合墓」被切剩下的亲属称谓。
            cand = r2 or s
            if NOT_PLACE.search(cand):
                l1, shape, rest, standalone = None, shape2, cand, False
            else:
                l1, shape, rest, standalone = cand, shape2, "", True
        # 逐层剥，走出一条路径：云山 → 私山窊 → 横路，而不是压成一个 l2。
        path: list[str] = []
        if not standalone:
            for _ in range(6):
                # 「上庄屋／下庄屋」「上棚／中棚／下棚」是成套的地名，
                # 不能让方位词「下」先把「下庄屋」吃掉一半。谱里三种写法都有，
                # 是这座山自己的分区，不是我编的。
                m = SET_PLACE.match(rest)
                if m:
                    path.append(m.group(0)); rest = rest[m.end():]; continue
                # 行政区划先剥（府／州／县／镇／乡／铺／村），再走 L2 词表
                a = ADMIN.match(rest)
                if a:
                    # 取第 1 组，把「直棣／直隶」这层清代政区前缀去掉——
                    # 谱里「直棣商州」与「商州」并存，不归一就是两个地方。
                    path.append(a.group(1)); rest = rest[a.end():]; continue
                tok, rest2 = peel(rest, L2)
                if not tok:
                    break
                path.append(tok); rest = rest2
        pos, rest = peel(rest, POS) if not standalone else (None, rest)
        # raw 带上——「合葬」的「合」字在 text 里被剥掉了，
        # 而它正是判断夫妻同穴的唯一依据（锡公自己的墓因此从卡片上消失）
        row = {**{k: r[k] for k in ("owner", "owner_name", "gen", "text", "src_human")},
               "raw": r.get("raw") or r["text"],
               "l1": l1, "path": path, "l2": path[0] if path else None,
               "shape": shape, "pos": pos, "rest": rest,
               "standalone": standalone,
               "groups": r["groups"]}
        out_rows.append(row)
        if l1:
            t = tree[l1]
            t["n"] += 1
            if path:
                t["l2"]["·".join(path)] += 1
            if shape:
                t["shapes"][shape] += 1
            t["people"].append(r["owner_name"])
        else:
            unresolved.append(row)

    Path("data/places.json").write_text(
        json.dumps(out_rows, ensure_ascii=False), encoding="utf-8")

    print(f"葬地串 {len(recs)} 条")
    print(f"认出一级地名 {len(recs)-len(unresolved)} 条（{(len(recs)-len(unresolved))/len(recs)*100:.1f}%），"
          f"未认出 {len(unresolved)} 条\n")
    print(f"二级地名词表（从数据统计出来的，{len(L2)} 个）：")
    print("   " + "  ".join(L2[:40]))

    print("\n" + "=" * 64)
    for l1, t in sorted(tree.items(), key=lambda x: -x[1]["n"])[:8]:
        print(f"\n■ {l1}   {t['n']} 条葬地")
        if t["l2"]:
            print("   二级：" + "  ".join(f"{k}×{v}" for k, v in t["l2"].most_common(12)))
        if t["shapes"]:
            print("   形名：" + "  ".join(f"{k}×{v}" for k, v in t["shapes"].most_common(6)))

    print("\n=== 未认出一级地名的（前 12）===")
    for r in unresolved[:12]:
        print(f"   {r['owner_name']}({r['gen']}世)  {r['text'][:34]}")

    print("\n=== 承健直系 ===")
    LINE = {"P-册3-0205-5-1-0": "继均25", "P-册3-0205-4-1-0": "壁火24",
            "P-册3-0205-3-1-1": "光量23", "P-册3-0205-2-1-0": "梁劲22",
            "P-册3-0198-1-0-0": "泽能21", "P-册2-0191-5-1-0": "铣发20"}
    for row in out_rows:
        who = LINE.get(row["owner"]) or LINE.get(row["owner"].split("/")[0])
        if who:
            chain = " → ".join([row["l1"]] + row["path"])
            extra = "  ".join(x for x in [
                f"形:{row['shape']}" if row["shape"] else "",
                f"方位:{row['pos']}" if row["pos"] else "",
                f"余:{row['rest']}" if row["rest"] else ""] if x)
            print(f"   {who:<8} {chain}   {extra}")


if __name__ == "__main__":
    main()
