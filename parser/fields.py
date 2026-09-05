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

# ★ 「公」和「之」都是接续词，都要吃掉，否则会粘进父名。
#   承贵那一条写「开聪公之祠子」：非贪婪的名字组只好一路吞到「开聪公之」，
#   父名就成了「开聪公之」。全谱 30 人中招。
# * 行内的行次句。
#   **“子”和“女”都要认**——招赘（坐婿）的女儿有自己一条，
#   世系从她这里往下传：「承欢／开安之女／坐婿周秀波」。
#   早先只认「子」，于是这几位女性的父亲全丢了，
#   她们在全站成了无父无母的孤立点。
# ★ 父名不得是「生养養季」：「生四子」是名单头，不是「生公的四子」。
RE_FILIATION = re.compile(
    rf"^(?![生养養季])([\u4e00-\u9fa5]{{1,4}}?)公?之?(?:之|([{ORDINALS}])|(嗣)|(祧))([子女])$")
RE_ZI = re.compile(r"^字\s*(.+)$")
RE_HUI = re.compile(r"^讳\s*(.+)$")
RE_HAO = re.compile(r"^号\s*(.+)$")
RE_MING = re.compile(r"^名\s*(.+)$")
RE_AGE = re.compile(r"^(?:年|享年|享寿)[一二三四五六七八九十百]+$")
# 寿数和葬地挤在同一行：「年五十八俱葬蔡山陈埠港壬山丙向」（文道@册2 p1）。
# 整行认不出，寿数和坟地就一起没了——那还是迁梅始祖那一页。
RE_AGE_THEN = re.compile(r"^((?:年|享年|享寿)[一二三四五六七八九十百]+)(.+)$")
# ★ 引导词前面常带着「公」「妣」，说明下一行那个日期是谁的。
#   早先只认光杆的「生于/殁于/葬」，于是「妣殁于」这一行不算引导词，
#   后面那行日期就飘了。全谱 382 行这样的，每一行背后是一个丢掉的日期。
#   梁楙（P-册2-0312）：方氏的殁年因此不见，她的葬地还错记到了继室华氏头上。
# ★ 谱也写光杆的「公殁」「殁」（没有「于」），还写「王妣殁于」——
#   那个姓不是装饰，是**点名了是哪一位**。继洪（册2 p322）的殁年就是
#   因为「公殁」不算引导词而整个丢掉的。
# ★ 前缀不再一个一个列。谱写前缀只有一个意思：**点名这一条是谁的**。
#   「公」＝本人 ｜「妣」＝身边那位 ｜「王妣」「李妣氏」＝姓王/姓李那位
#   「光元公」「承求」＝直接写名字
#   所以前缀一律先当名字收下，再回头认人（`_lead_who`）；
#   认不出人就**不算引导词**——宁可不认，不可乱认。
RE_LEAD = re.compile(
    r"^([一-龥]{1,4})?"
    r"(?:(生|殁|葬)(?:于|於)|(殁|葬))$")
# ★ 光杆的「生」不算引导词——**那是个名字**。
#   光採（册2 p367）「生子四　壁林　海　水　生」，末一个儿子就叫「生」；
#   把它当成引导词，后面那句「公妣殁年未详」就被当成他的生年填进了宛氏名下。
#   「殁」「葬」不会是名字，光杆照收（继洪@册2 p322 写的正是「公殁」）。
# 上面那一串里，不点名的写法（跟着上下文走），点名的另算
LEAD_ANON = {"公妣", "公", "妣", "原妣", "继妣", "繼妣", "续妣", "又妣", "復妣", "复妣"}
# 日期被排版断成两行：上一行末尾停在「…年十」，这一行以「月／日／时」起头。
# 中间可能还夹一个空行（作谋@册2 p7 的於氏就是）。
# 断点落在哪个字都有：「…年十」+「月十四日」、「…己」+「丑九月二十七日酉时」、
# 「…戊」+「寅时」、「…一九九六年」+「十月二十二日午时」。
# 干支的后半个字也算尾巴——上一行末尾停在天干，这一行以地支起头。
RE_DATE_TAIL = re.compile(
    r"^(?:[子丑寅卯辰巳午未申酉戌亥])?"
    r"(?:[月日時时]|初[一二三四五六七八九十]|廿|[一二三四五六七八九十]+[月日]|时|時)")
# 引导词写在**行尾**：「乾隆五十一年丙午八月初三日亥时殁于」——
# 这一行前半截是生年、末尾两个字是下一行的引导词。谱里 167 行这么写，
# 於是那 167 个殁年全都飘着没人认。剥下来当引导词用，跟单起一行完全一样。
RE_LEAD_TAILED = re.compile(r"^(.+?)(生于|生於|殁于|殁於)$")
# 「阙其所未知」——谱自己写下的「这里没有记录」。
# 「生殁缺」「公妣殁葬俱未详」「生年未详」…全谱 500 行左右。
# 这不是缺数据，是**编谱人明确写下的一句话**，凡例里说得清清楚楚。
# 以前它们全落在未归属里，於是卡片上「殁」那一栏是**空白**——
# 那正好把谱说的话抹掉了。现在照原样填进对应的格子。
RE_LACK = re.compile(
    r"^(公妣|公|妣|原妣|继妣|繼妣|续妣|又妣|復妣|复妣|俱"
    r"|[一-龥][妣氏])?"
    r"((?:[生殁歿卒葬](?:年|月|日|时|時|庚|地)*){1,4})"
    r"(?:俱)?"
    r"(?:缺|未详|未祥|不详|不祥|失考|无考|失记|未考)$")
LACK_FIELD = {"生": "生", "殁": "殁", "歿": "殁", "卒": "殁", "葬": "葬"}
# 同一条规矩的「只认开头」版：谱把好几句挤在一行时一条一条往下剥。
RE_LACK_HEAD = re.compile(RE_LACK.pattern.rstrip("$"))
# 不带前缀的引导词——在名字后面找切点时用，带前缀会把姓也吃掉。
RE_SP_LEAD = re.compile(r"^(生于|生於|殁于|殁於)(.+)$")
# 一整行只有年号／干支／数字和年月日时——那就是个日期，没有别的读法。
# 「法名道元」「字春发」——这几个字是给名字加的注，不是在指某个人。
RE_NAME_NOTE = re.compile(r"^(法名|字|讳|諱|号|號|名|乳名|又名)")
RE_PURE_DATE = re.compile(
    r"^[元明清宋洪武永乐宣德正统景泰天顺成化弘治宏治正德嘉靖隆庆万历泰昌天启"
    r"崇祯崇正顺治康熙雍正乾隆干隆嘉庆道光咸丰同治光绪宣统民国"
    r"零〇一二三四五六七八九十廿卅百0-9甲乙丙丁戊己庚辛壬癸"
    r"子丑寅卯辰巳午未申酉戌亥年月日时時初正闰润　 ]+$")

# 葬那一行不一定以「葬」起头：「俱葬云山」「合葬云山坐北向南」
# 「与夫合墓」——谱里 110 行。
# 葬那一行谱写过这些花样，全是它自己的原话，不是猜：
#   「妣殁葬胡家林向东」 前面挂着人和「殁」
#   「夫妇合葬」「夫妻俱葬」「同夫合墓」「与原妣葬」「供葬」「后迁坟」
RE_BURIAL = re.compile(
    r"^(公妣|公|妣|原妣|继妣|繼妣|续妣|又妣|復妣|复妣|俱|中殇|中殤"
    r"|夫妇|夫妻|[一-龥][妣氏])?"
    r"[生殁歿卒]{0,2}"
    r"(?:葬|俱葬|合葬|同葬|附葬|迁葬|供葬|后迁坟|迁坟|合墓|同墓"
    r"|[与同][^，。]{0,6}?(?:[合同]墓|葬))")
# 葬地写完了没有：谱记坟一定收在山向、合墓或「有碑」上。
# 没收尾就是被版面截断了，下一行是它的后半截。
# 接上去的那一行得看得出是地名的后半截：山、向、墓、碑、地形字总得有一个。
RE_BUR_TAIL = re.compile(r"[向山墓碑坟地窊塆湾岭冲垅坂坵峰嘴咀]")
# 而立嗣句、名单这些**不是地名**，粘上去就成了假话——
# 学虎@册2 p100 的葬地一度变成「合葬云山立长兄次子士礼为嗣」。
RE_NOT_BUR = re.compile(r"(立|嗣|祧|[生养養]子|女[一二三四五六七八九十]|适|適|娶|聘)")
RE_BUR_END = re.compile(
    r"(向[东南西北]{1,2}|[子丑寅卯辰巳午未申酉戌亥甲乙丙丁庚辛壬癸乾坤艮巽]向"
    r"|[合同]墓|有碑|同向)$")
# 引导词和日期挤在同一行：「殁于嘉靖辛丑年五月初三日亥时」。
# 谱里 281 行这么写，全部落空——德公（册2 p24）自己的殁年、他妻项氏的殁年
# 都是这么丢的。跟两行写法是同一件事，判定也走同一套。
RE_LEAD_INLINE = re.compile(
    r"^([一-龥]{1,4})?(生于|生於|殁于|殁於)(.+)$")
# ★ 谱写「配」「原配」「继配」的地方，以前一律不算配偶，於是这几位太太
#   连人都没有，她们的生卒还全堆到了丈夫头上（光保@册3 p161 三位）。
RE_SPOUSE = re.compile(
    r"^(娶侧室|侧室|側室|继妣|復妣|复妣|又妣|原妣|再妣"
    r"|继娶|復娶|复娶|续娶|續娶|原娶|再娶|又娶"
    r"|原配|元配|继配|繼配|续配|續配|副配|继室|繼室|次室|副室"
    r"|原聘|继聘|元聘|妣|娶|聘|庶|配)"
    r"\s*([\u4e00-\u9fa5]{1,4})(.*)$")   # ※ 「妣　　氏」中间有排版空格，不吃掉她就不是人了
# 名单标记不只「生子N」：铣云@册2p65 写的是「季子二」（后接泽富、泽贵），
# 另有一处「养子一」。同一条规则的字表扩一个字，不是新规则。
# ★ 头一个字要留住：谱写「**生**子一　泽蛟」「**养**子一　泽龙」——
# 泽龙是养子，不是亲生。这个区分是**谱自己写的原话**（第①级），
# 以前被抛掉了，两种子全当亲生。季＝幼子，仍是亲生。
RE_SONS = re.compile(r"^([生季养養])[一二三四五六七八九十两]?子[一二三四五六七八九十]*\s*(.*)$")
SON_KIND = {"生": "生", "季": "生", "养": "养", "養": "养"}
CN_NUM = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _count_char(t: str) -> str:
    """名单头里的数目字：「生子二」→「二」。没有就返回空串。"""
    for ch in t:
        if ch in CN_NUM:
            return ch
    return ""


def _close_block(p, block: list) -> None:
    """
    ★ **辈字只印一次**。谱把一堆儿子写成：

        生子四
                壁林
                  海
                  水
                  生

    后面三个单字共用头一个名字的辈字「壁」——壁林・壁海・壁水・壁生。
    不补就配不上他们自己那一条（梁海写「光採次子」）。

    **只在同一块名单内补**，辈字取本块头一个多字名的首字；
    本块没有多字名就不补。`name_raw` 保留谱上印的原样。
    """
    head = next((k for k in block if len(k.given) >= 2), None)
    if head is None:
        return
    ch = head.given[0]
    for k in block:
        if len(k.given) == 1:
            full = ch + k.given
            # sons_claimed 里那一项也跟着补（两处同序入列）
            for _i, _x in enumerate(p.sons_claimed):
                if _x == k.given:
                    p.sons_claimed[_i] = full
                    break
            k.given = full


def split_run(t: str, want: int) -> list:
    """
    ★ 谱把几个儿子**挤在一行**：「生子二／开怀开心」「生子二／承军幼殁」。

    不切开就丢人：继旺（册3 p303）名下的开怀、开心两位因此一直没有父边，
    而他俩自己那两条写着「继旺长子」「继旺幼子」。

    切的依据是**谱自己写的数目**：声明 N 人、这一行正好 2N 个字，
    才按两字一个切开；切出来的每一块还得各自站得住（是名字，或是「幼殁」这类）。
    差一点都不切——宁可留在 unparsed，不能切错。
    """
    if want < 2 or len(t) != 2 * want:
        return []
    parts = [t[i:i + 2] for i in range(0, len(t), 2)]
    if all(is_son_item(x) or RE_UNNAMED_KID.match(x) for x in parts):
        return parts
    return []
# ★ 数目和头一个女儿常印在同一行：「女四　长适董」。
#   早先要求整行只有「女四」，於是这一行不匹配、mode 停在 sons，
#   恭公的四个女儿「次適吕」「三適洪」「四适李」全掉进了儿子栏。
RE_DAUS = re.compile(r"^(?:生女|女)[一二三四五六七八九十]*\s*(.*)$")
RE_MARRY = re.compile(r"[适適]")
# 过继语句常紧跟在女儿名单后面（谱把它写在同一格里），那不是女儿
RE_ADOPT_WORD = re.compile(r"出[嗣祠]|入嗣|承嗣|为嗣|為嗣|兼[祧挑]|承[祧挑]|归宗|歸宗|承本身")
# 与 segment.py 同一套功能字：整条都由它们组成的，不是人名
FUNC_CHARS = frozenset("年月日时氏妣娶生殁葬公之子女的又初未详祥缺")
RE_BARE_NAME = re.compile(r"^[\u4e00-\u9fa5]{1,3}$")
RE_ONE_CHAR = re.compile(r"^[一-龥]$")
RE_GEN_HDR = re.compile(r"^第?[一二三四五六七八九十廿卅百]+世$")


def _func_only(t: str) -> bool:
    return bool(t) and all(c in FUNC_CHARS for c in t)


# 字段标记行，不是人：「公殁于」「公妣殁葬缺」
RE_FIELD_MARK = re.compile(r"^(公妣|公|妣|原妣|继妣)?(生|殁|歿|葬)(于|於|年|葬|缺|俱)")
# 无名而真实存在的孩子：「四殇」「次幼殁」。
# 谱写了他存在，他就是一个人，只是名字没留下来。
RE_UNNAMED_KID = re.compile(r"^[长次幼三四五六七八九十元俱下]{0,2}(幼殁|幼殇|殇|殁|歿)$")
# 「适居陕西…」里的「适」是「往」，不是「嫁」——那是迁徙
# 姓不可能以这些字开头——「妣殁未详」「妣葬牌子山」里的那一段是字段，不是名字
RE_NOT_A_NAME = re.compile(r"^(生|殁|歿|葬|年|未|俱|详|缺)")
RE_MOVE_TO = re.compile(r"[迁遷徙]|适居|居陕|居江|居四川")

ORD_CHARS = "长次幼三四五六七八九十元季末"
RE_DAU_PARTS = re.compile(
    rf"^([{ORD_CHARS}]?)\s*([^适適]*?)\s*[适適]\s*(.*)$")
RE_SPO_PARTS = re.compile(r"^([一-龥])氏\s*(.*)$")


def kin_at(p, seq: int) -> str:
    """没有独立条目的人，id 就是「记到他的那一行」的坐标。
    和有条目的人用同一套格式，全站不用区分两种 id。"""
    return f"P-{p.vol}-{p.page:04d}-{p.row}-{p.col}-L{seq}"


RE_DAU_SPLIT = re.compile(rf"(?=[{ORD_CHARS}][^{ORD_CHARS}]{{0,3}}?[适適])")


def split_daughters(t: str) -> list:
    """「长适吕次適蔡　幼适柴」——谱把三个女儿印在一行。
    不切开就只有一个人拿到 id，另外两个消失。"""
    parts = [x.strip() for x in RE_DAU_SPLIT.split(t) if x.strip()]
    return parts if len(parts) > 1 else [t]


def make_daughter(p, t: str, seq: int) -> KinRec:
    """「长适董」「华荣适商」「四殇」——拆成排行、名、夫家姓。"""
    _at = kin_at(p, seq)
    k = KinRec(at=_at, person=_at, role="女", name_raw=t, line_seq=seq)
    if RE_UNNAMED_KID.match(t):
        k.died_young = True
        k.named = False
        k.ordinal = t[0] if t and t[0] in ORD_CHARS else ""
        return k
    m = RE_DAU_PARTS.match(t)
    if m:
        k.ordinal, k.given, k.surname = m.group(1), m.group(2).strip(), m.group(3).strip()
    else:
        k.given = t
    k.named = bool(k.given)
    return k


# ★ 行内夹着下一块的名单头：「儒健生女一　　儒桦」（开赛@册4 p203）。
#   不切就丢一个儿子——那一位正是承健。
# 切点不能放「聘」——「字席聘」「字待聘」里的聘是名字的一部分。
RE_FIELD_CUT = re.compile(r"(?=生于|生於|娶|妣氏|生[子女][一二三四五六七八九十]|殁于)")
RE_SONS_INLINE = re.compile(r"生([子女])([一二三四五六七八九十])")
RE_INLINE_HDR = re.compile(r"^(.{1,4}?)\s*(生?[子女])([一二三四五六七八九十]?)\s*(.*)$")

RE_DIED_TAIL = re.compile(r"^(.+?)\s*[幼早下]?[殁歿殇殤夭]$")


def strip_died(t: str):
    """
    「光月　殁」「继坤　殁」——谱把「死了」写在名字后面，中间常带排版空格。
    返回（名字, 是不是幼殁）。「俱下殇」「长幼殁」这类整句都是注的，不剔。
    """
    if RE_UNNAMED_KID.match(t):
        return t, False
    m = RE_DIED_TAIL.match(t)
    return (m.group(1).strip(), True) if m else (t, False)


def make_son(p, t: str, seq: int, kind: str = "生") -> KinRec:
    # 儿子的 person 由第②层填（他通常有自己的条目）；
    # 真的没条目的（「四殇」、只在名单里出现过的）才用 at。
    # kind 是名单头那个字：生／养。判定层拿它分生父边和嗣父边。
    # ★ 谱把「死了」写在名字后面：「光月　殁」「壁开　殇」。
    #   不剔掉就配不上他自己那一条，也列不出「幼殁」这件事。
    #   只剔**尾巴**，名字本身带这个字的（如果有）不受影响。
    _died_tail = False
    _raw0 = t          # 谱上印的原样，存进 name_raw，永不改
    t, _died_tail = strip_died(t)
    k = KinRec(at=kin_at(p, seq), person="", role="子", rel_raw=kind, name_raw=_raw0, line_seq=seq)
    if RE_UNNAMED_KID.match(t):
        k.died_young = True
        k.named = False
        k.ordinal = t[0] if t and t[0] in ORD_CHARS else ""
    else:
        k.given = t
    if _died_tail:
        k.died_young = True
    return k


def make_spouse(p, rel: str, name_raw: str, seq: int) -> KinRec:
    """「妣朱氏」「娶刘氏春梅」「妣氏」（姓都没印出来）。"""
    _at = kin_at(p, seq)
    k = KinRec(at=_at, person=_at, role="妻", rel_raw=rel,
               name_raw=name_raw, line_seq=seq)
    m = RE_SPO_PARTS.match(name_raw)
    if m:
        k.surname, k.given = m.group(1), m.group(2).strip()
        # 「聘李氏幼殁」——后面那两个字是她的下场，不是她的名字。
        if RE_UNNAMED_KID.match(k.given) or re.match(r"^(未归殁|未歸殁|早殁|未娶|未过门)", k.given):
            k.died_young = bool(RE_UNNAMED_KID.match(k.given))
            k.given = ""
    elif name_raw.startswith("氏"):
        k.surname = ""          # 「妣　氏」：谱上连姓都没印，人在，名字不在
    else:
        k.given = name_raw
    k.named = bool(k.surname or k.given)
    return k


def is_daughter_item(t: str) -> bool:
    """谱写女儿的定式：〔排行〕〔名〕适〔夫家姓〕。「次适」尾字缺了也算。"""
    if not t or len(t) > 14 or RE_ADOPT_WORD.search(t) or RE_FIELD_MARK.match(t):
        return False
    if RE_MOVE_TO.search(t):
        return False
    if RE_UNNAMED_KID.match(t):
        return True
    if RE_MARRY.search(t):          # 「华荣适商」「长适董」——带名字的四五字也是女儿
        return True
    return bool(RE_BARE_NAME.match(t)) and not _func_only(t)


# ★ 近世条目把孩子写成「生子一／**名**勋」——这个「名」是「名叫」，
#   不是字段名。不剔掉它，宏驥的儿子勋、宏震的女儿美琳、宏胜的儿子泊志宇
#   就全丢了（三人的子女栏都是空的）。名字后面还可能跟着生日，切掉。
RE_NAMED = re.compile(r"^名\s*([一-龥]{1,4}?)(?=生于|生於|$)")


def strip_named(t: str) -> str:
    """「名勋」→「勋」；「名美琳生于二0一0年…」→「美琳」。不是这个形状就原样返回。"""
    m = RE_NAMED.match(t)
    return m.group(1) if m else t


def is_son_item(t: str) -> bool:
    """儿子就是个名字。带「适」的是女儿，功能字堆出来的不是人。"""
    if not t or RE_MARRY.search(t) or RE_ADOPT_WORD.search(t) or RE_FIELD_MARK.match(t):
        return False
    if RE_MOVE_TO.search(t):
        return False
    if RE_UNNAMED_KID.match(t):
        return True
    return bool(RE_BARE_NAME.match(t)) and not _func_only(t)

TITLES = ["郡庠学生", "国学生", "太学生", "文学生", "候補巡政厅", "例授登仕郎",
          "候选通判", "侯选通判", "候选县丞", "博士研究生", "陆军参谋", "陸军参谋",
          "省教研会员", "庠生", "庠士", "增生", "廪生", "贡生", "监生", "生员",
          "佾生", "儒士", "业儒", "职员", "登仕郎", "北大生", "大学生",
          "研究生", "硕士", "大专", "中专", "高中", "初中", "大学"]

# 注记标签：命中即打标，原文照留
MARKS = {
    "出嗣": r"出嗣|出祠",
    # 「承嗣」跟「为嗣」是同一件事，只是谱换了个字：
    #   开金（册4 p213）写「立**次女承嗣**」——女儿承宗祠，全谱两例。
    #   不收就连标签都没有，这件事在卡片上就只剩一行原文。
    #   （他那位次女承宏自己有条目：「开金次女…坐婿严新志…生子一彥林」，
    #     世系确实从她往下传了。）
    "立嗣": r"立.{0,8}?(?:为|承)(?:嗣|祠)|立爱子|爱立",
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


# ★ 谱里记到的人，不是个个都有自己那一条。
#   妻、女儿、夭折没留下名字的孩子，谱都只写在别人的条目里。
#   以前他们只是字符串，于是全站没法指向他们、没法给他们卡片、
#   关系计算也算不到女性。
#
#   现在一律发 id，规则和男性完全一样：
#       有独立条目的 -> id 用他的名字行
#       没有条目的 -> id 用「记到他/她的那一行」
#   名字没留下来不等于不是人：「四殇」也有 id，卡片上大片空白，
#   那正是谱的实情。
@dataclass
class KinRec:
    # ★ at：「记到他的那一行」的坐标。这条记载本身的 id，永远有值。
    #   person：这个人的 id。
    #       妻、女儿——谱里从来没有他们自己的条目，person 就等于 at。
    #       儿子——大多数有自己的条目，那就用条目的 id；由第②层判定。
    #       这条区分是为了**一人只能有一个 id**：
    #       「继华」在壁林名单里占一个槽，但他本人的 id 是他自己那一条。
    at: str
    person: str
    role: str                 # 妻 / 女 / 子
    rel_raw: str = ""         # 谱上写的关系词：娶·继娶·聘·妣·侧室
    ordinal: str = ""         # 排行：长·次·幼·三…
    name_raw: str = ""        # 谱上写的原样
    given: str = ""           # 她/他自己的名（第 25 世后女性才开始有）
    surname: str = ""         # 妻：娘家姓；女：夫家姓
    named: bool = True        # 名字是否留下来了
    died_young: bool = False  # 谱写「幼殁」「殇」
    line_seq: int = 0


@dataclass
class SpouseRec:
    rel: str
    name_raw: str
    pid: str = ""
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

    # ★ is_heir **不存字段，由 filiation 推出来**。
    #   早先是个普通字段，行内那条路径会填它，
    #   页眉指向那条路径（「子嗣京朝」倒着读＝「朝京嗣子」）只填 filiation、
    #   忘了填它——于是同一件事有了两套答案：
    #   people.json 说 144 人是嗣子，TS 那边拿 filiation 现算是 173 人。
    #   推出来就不会再分家。
    @property
    def is_heir(self) -> bool:
        return bool(re.match(r"^(嗣|祧)[子女]$", (self.filiation or "").strip()))

    birth: FieldVal | None = None
    death: FieldVal | None = None
    burial: FieldVal | None = None
    age: FieldVal | None = None

    # ★ **谱面支持的全部候选**（按名字比对得来）。
    #   谱不写 id，只写名字；同名不止一人时这里就有几条。
    #   **这不是答案，是题面。** 答案在 parent_edges，由判定层写回。
    parent_candidates: list = field(default_factory=list)

    titles: list = field(default_factory=list)
    marks: list = field(default_factory=list)      # (标签, 原文行)
    spouses: list = field(default_factory=list)
    sons_claimed: list = field(default_factory=list)
    daughters_claimed: list = field(default_factory=list)
    kin: list = field(default_factory=list)        # KinRec：本条里记到的每一个人
    unparsed: list = field(default_factory=list)   # 认不出的行，原样保留
    page_ptrs: list = field(default_factory=list)  # 本页页眉里的全部父名指向

    raw_text: str = ""
    line_count: int = 0

    def src_human(self) -> str:
        j = f"卷{self.juan}·" if self.juan else ""
        s = f"{self.section}·" if self.section else ""
        return f"{self.vol}·{j}{s}第{self.page}页·第{self.row}行"


def extract(seg: Segment, pointers: dict, seq_in_slot: int) -> PersonRec:
    head = seg.head
    p = PersonRec(
        pid=f"P-{head.vol}-{head.page:04d}-{head.row}-{head.col}-L{head.seq}",
        seg_id=seg.seg_id,
        name_raw=head.text.strip(),
        gen=gen_of(head.vol, head.page, head.row),
        vol=head.vol, page=head.page, row=head.row, col=head.col,
        juan=head.juan, section=head.section,
        raw_text=seg.text, line_count=len(seg.lines),
    )

    used = {head.seq}          # 名字行本身已归属
    lead = None                # 上一行是「生于」「殁于」「葬」
    in_head = True             # 还在条目的「头」里（名字行之后、生殁葬之前）
    lead_who = None            # 引导词前缀说的是谁（本人／配偶）
    lead_sur = None            # 引导词点了名的那位配偶的姓（「王妣殁于」）
    cont = None                # 上一行刚归到哪个字段——日期跨行时接着往下写
    sp_just = False            # 上一行刚立了一位配偶
    cur_sp: SpouseRec | None = None
    mode = None                # sons / daughters
    sons_kind = "生"           # 当前名单头那个字：生／养
    sons_want = 0              # 名单头声明的人数（「生子二」则为 2）
    sons_got = 0               # 已经收到几个
    sons_block: list = []      # 本块收的 kin（用于按辈字补全单字名）

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

        # 跨行日期只接在**紧挨着的**上一次归属后面（中间只许空行、列头）。
        # 一走到别的行，这条线就断——不然会把后文的话粘到日期上。
        prev_cont, cont = cont, None
        prev_sp_just, sp_just = sp_just, False

        # 「殁」在行尾、「于」自己占一行——排版把引导词劈成了两半。
        # 泽悠@册3 p261 的吕氏：她的殁年因此整个飘着。
        if prev_cont and t in ("于", "於"):
            _v = getattr(prev_cont[0], prev_cont[1], None)
            if _v and _v.text and _v.text[-1] in "生殁":
                lead = _v.text[-1]
                _v.text = _v.text[:-1]
                lead_who = lead_sur = None
                take(l)
                continue
        if prev_cont and RE_DATE_TAIL.match(t):
            _tgt, _attr = prev_cont
            _cur = getattr(_tgt, _attr)
            _cur.text += t                 # 谱把一句断成两行，接回去，不加分隔号
            _cur.line_seq.append(l.seq)
            cont = prev_cont               # 「…年」「月　日」「时」可以断三行
            take(l)
            continue

        # ★ 光杆的「殁」「葬」，谱只写过「殁」「公殁」「妣殁」这三种。
        #   前面挂着别的字就不是引导词了——「字毛伢幼殁」说的是**幼殁**
        #   （梁阐@册3 p107），不是「下一行是他的殁年」。
        m_lead = RE_LEAD.match(t)
        if m_lead and m_lead.group(3) and (m_lead.group(1) or "") not in LEAD_ANON | {""}:
            m_lead = None
        if m_lead and _lead_who(p, m_lead.group(1) or "")[2]:
            in_head = False        # 生于／殁于／葬一出现，条目的「头」就完了
            lead = (m_lead.group(2) or m_lead.group(3))[0]
            lead_who, lead_sur, _ = _lead_who(p, m_lead.group(1) or "")
            take(l)
            continue

        m_in = RE_LEAD_INLINE.match(t)
        if m_in and m_in.group(3).strip() and _lead_who(p, m_in.group(1) or "", True)[2]:
            in_head = False
            _k = m_in.group(2)[0]
            _who, _sur, _ = _lead_who(p, m_in.group(1) or "", True)
            cont = _assign(_whose(p, cur_sp, _k, _who, _sur), _k,
                           m_in.group(3).strip(), l.seq)
            lead = lead_who = lead_sur = None
            take(l)
            continue

        # 行尾常带一个顿号或句号（「壁累公嗣子、」），剥掉再匹配，
        # 否则整条父名都读不出来——继香（P-册3-0113-5-1）就是这么丢的。
        m = RE_FILIATION.match(t.rstrip("、。，；,;"))
        if m and not p.father_name:
            p.father_name = m.group(1)
            _k = m.group(5)                      # 子 或 女
            p.filiation = (m.group(2) + _k) if m.group(2) else (
                "嗣" + _k if m.group(3) else "祧" + _k if m.group(4) else "之" + _k)
            p.father_src = "行内"
            take(l)
            continue

        # ★ **行尾夹着名单头**。近世条目常把整段挤在一行：
        #     开荣（册4 p78）「字宝荣生生于…卵时**生子一用兵**」
        #   不切就没人知道承兵（字用兵）是他儿子——而承兵自己那一条没写父名，
        #   全谱四位同名的「承兵」各有一个父亲，于是变成了「说不清」。
        #   前缀照旧进 unparsed，一个字不丢。全谱只有四行是这个形状。
        _im = None if mode in ("sons", "daughters") else RE_SONS_INLINE.search(t)
        if _im and _im.start() > 0:
            mode = "sons" if _im.group(1) == "子" else "daughters"
            sons_kind = "生"
            _close_block(p, sons_block); sons_block = []
            sons_want = CN_NUM.get(_im.group(2), 0)
            sons_got = 0
            _rest = t[_im.end():].strip()
            if _rest:
                if mode == "sons" and is_son_item(strip_died(_rest)[0]):
                    _k3 = make_son(p, strip_died(_rest)[0], l.seq, sons_kind)
                    p.kin.append(_k3); sons_block.append(_k3)
                    p.sons_claimed.append(_k3.given or _k3.name_raw)
                    sons_got += 1
                elif mode == "daughters" and is_daughter_item(_rest):
                    for _d in split_daughters(_rest):
                        p.daughters_claimed.append(_d)
                        p.kin.append(make_daughter(p, _d, l.seq))

        # ★ 字／讳／号／名 **只在条目的头部算数**。
        #   谱把它们写在名字行之后、生于之前。到了条目尾巴的散文里，
        #   「名」是「名叫」不是字段名：
        #     「公艰苦创业／严于教子／礼义待人／**名传乡里**」——传赞，
        #      却被读成了开发的「名＝传乡里」，凭空造了个名。
        #     「生子一／**名勋**」——那是他儿子叫勋。
        #   实测：头部 2,276 个全对，尾部 5 个全错。
        hit = False
        for rx, attr in (() if not in_head else
                         ((RE_ZI, "zi"), (RE_HUI, "hui"),
                          (RE_HAO, "hao"), (RE_MING, "ming"))):
            mm = rx.match(t)
            if mm and getattr(p, attr) is None:
                # ★ 整条挤在一行时（「字宝荣生生于…生子一用兵」），
                #   字只取到下一个字段词为止，不能把整段都当成他的字。
                _v = RE_FIELD_CUT.split(mm.group(1).strip())[0].strip()
                setattr(p, attr, FieldVal(_v or mm.group(1).strip(), [l.seq]))
                take(l); hit = True
                break
        if hit:
            continue

        if RE_AGE.match(t):
            p.age = p.age or FieldVal(t, [l.seq])
            take(l)
            continue
        m_at = RE_AGE_THEN.match(t)
        if m_at and RE_BURIAL.match(m_at.group(2)):
            p.age = p.age or FieldVal(m_at.group(1), [l.seq])
            cont = _assign(_whose(p, cur_sp, "葬", None, None), "葬",
                           m_at.group(2), l.seq)
            take(l)
            continue

        if t in TITLES:
            p.titles.append(t)
            take(l)
            continue

        # 妻子那一行末尾也带引导词：「聘徐氏生于」（光营@册3 p240）。
        # 不剥掉，「徐氏生于」整个被当成名字（还被当成不是名字而丢掉），
        # 下一行她的生年就落到丈夫头上去了。跟别处的行尾引导词是同一件事。
        _sp_line, _sp_next = t, None
        _m_sptl = RE_LEAD_TAILED.match(t)
        if _m_sptl and _m_sptl.group(1):
            _sp_line, _sp_next = _m_sptl.group(1), _m_sptl.group(2)[0]
        ms = RE_SPOUSE.match(_sp_line)
        if ms:
            in_head = False
        # 「妣殁于」「妣葬…」：「妣」后面跟的是字段词，不是姓。
        # 不拦住就会凭空多出一位叫「殁于」的太太。
        if ms and RE_NOT_A_NAME.match(ms.group(2)):
            ms = None
        if ms:
            _nm = ms.group(2) + ms.group(3).strip()
            # 「娶洪氏生年未详」「妣程氏生殁葬缺」——名字后面直接跟着缺记声明。
            # 不切开，那一整串都成了她的名字（全谱 30 位太太是这么记的），
            # 而谱说的那句「生年未详」也没进她的格子。
            _sp_tail = ""
            for _i in range(2, len(_nm)):
                _r = _nm[_i:]
                if RE_LACK_HEAD.match(_r) or RE_SP_LEAD.match(_r) or RE_BURIAL.match(_r):
                    _nm, _sp_tail = _nm[:_i], _r
                    break
            _k = make_spouse(p, ms.group(1), _nm, l.seq)
            p.kin.append(_k)
            cur_sp = SpouseRec(rel=ms.group(1), name_raw=_nm,
                               pid=_k.person, line_seq=[l.seq])
            p.spouses.append(cur_sp)
            if _sp_tail:
                _acts, _sp_tail = _peel_plan(_sp_tail)
                _peel_do([cur_sp], _acts, l.seq)
            mode = None
            sp_just = True
            lead = _sp_next                      # 「聘徐氏生于」→ 下一行是她的生年
            lead_who = "配偶" if _sp_next else None
            lead_sur = None
            take(l)
            continue

        # 「生子三」「女四　长适董」——数目行。尾巴上若带着头一个名字，一并收下。
        m_s = RE_SONS.match(t)
        if m_s:
            in_head = False
            mode = "sons"
            sons_kind = SON_KIND.get(m_s.group(1), "生")
            _close_block(p, sons_block)
            sons_want = CN_NUM.get(_count_char(t), 0)
            sons_got = 0
            sons_block = []
            rest = m_s.group(2).strip()
            if rest:
                # ★ 名单头没写数目时，同行跟着的**单字**不收。
                #   士梅那一条印的是「生子了」——那是「生子一」的误识，
                #   「了」不是人（他名下只有铣立一人）。写了数目的不受影响。
                _skip1 = sons_want == 0 and len(rest) == 1
                if is_son_item(rest) and not _skip1:
                    _k0 = make_son(p, rest, l.seq, sons_kind)
                    p.sons_claimed.append(_k0.given or _k0.name_raw)
                    p.kin.append(_k0); sons_block.append(_k0)
                    sons_got += 1
                elif is_daughter_item(rest) and not _skip1:
                    mode = "daughters"
                    for _d in split_daughters(rest):
                        p.daughters_claimed.append(_d)
                        p.kin.append(make_daughter(p, _d, l.seq))
            take(l); continue
        m_d = RE_DAUS.match(t)
        if m_d:
            in_head = False
            mode = "daughters"
            rest = m_d.group(1).strip()
            if rest and is_daughter_item(rest):
                for _d in split_daughters(rest):
                    p.daughters_claimed.append(_d)
                    p.kin.append(make_daughter(p, _d, l.seq))
            take(l); continue

        # 引导词之后的一行 = 日期 / 葬地
        if lead in ("生", "殁", "葬"):
            # 引导词写明了是谁的，就听谱的；没写才用位置推。
            tgt = _whose(p, cur_sp, lead, lead_who, lead_sur)
            val, nxt = t, None
            m_tl = RE_LEAD_TAILED.match(t)
            if m_tl:                       # 「…亥时殁于」：前半截是值，末尾是下一行的引导词
                val, nxt = m_tl.group(1), m_tl.group(2)[0]
            cont = _assign(tgt, lead, val, l.seq)
            lead = nxt
            lead_who = None
            lead_sur = None
            take(l)
            continue

        # 「殁缺葬胡家林向东」「公妣殁未详合葬云山金盘托果向南」——
        # 缺记和葬地挤在同一行。跟妻子名字后面那一串是同一件事，用同一个 _peel。
        # ★ 整行就是一句缺记（「公妣殁葬缺」）的，不走这里——
        #   那句话说的是夫妻两人，归属另有规矩，见下面的缺记分支。
        if RE_LACK_HEAD.match(t) and not RE_LACK.match(t):
            _acts, _left = _peel_plan(t)
            if _acts and not _left:       # 整句都认下来了才动手，认不全就整句退回
                _peel_do([cur_sp if cur_sp is not None else p], _acts, l.seq)
                cont = None
                take(l)
                continue

        # 「妣汪氏」下一行直接写日期，谱把「生于」省掉了（学光@册2 p135）。
        # 谱的次序恒是先生后殁，而且殁一定写「殁于」——所以这一条只能是她的生年。
        if (prev_sp_just and cur_sp is not None and cur_sp.birth is None
                and RE_PURE_DATE.match(t) and re.search(r"[年月日时時]", t)):
            cont = _assign(cur_sp, "生", t, l.seq)
            take(l)
            continue

        m_lack = RE_LACK.match(t)
        if m_lack:
            _pre = m_lack.group(1) or ""
            # 只有「公妣」才是**夫妻两人都**。光杆的「俱」说的是刚点过名的那几位：
            # 壁洁（册3 p74）连写「配翟氏／配杨氏／娶石氏／俱殁无考」——
            # 那是三位太太都无考，他自己的殁年下一行就写着。
            _both = _pre == "公妣"
            if _both:
                _tgts = [p] + ([cur_sp] if cur_sp is not None else [])
            elif _pre == "公":
                _tgts = [p]
            elif _pre:
                _sur = _pre[0] if _pre not in LEAD_ANON else None
                _tgts = [_whose(p, cur_sp, "殁", "配偶", _sur)]
            else:
                # 没写是谁的，就是**这一段正在写的那个人**：
                # 进了配偶那一段（「娶翟氏／生殁失考」）就是她的，
                # 还没进就是本人的。
                # ★ 一整句只认一个人，不能按字段拆开分别推——
                #   梁佐（册3 p66）那句「生殁失考」写在翟氏名下，
                #   按字段拆就成了「生」算她的、「殁」算他的。
                _tgts = [cur_sp if cur_sp is not None else p]
            _fill_lack(m_lack, _tgts, t, l.seq)
            cont = None
            take(l)
            continue

        m_b = RE_BURIAL.match(t)
        if m_b:
            _pre = m_b.group(1) or ""
            if _pre == "公":
                _bt = [p]
            elif _pre == "公妣":
                _bt = [p] + ([cur_sp] if cur_sp is not None else [])
            elif _pre and _pre != "俱":
                _bt = [_whose(p, cur_sp, "葬", "配偶",
                              _pre[0] if _pre not in LEAD_ANON else None)]
            else:
                _bt = [_whose(p, cur_sp, "葬", None, None)]
            for _tg in _bt:
                cont = _assign(_tg, "葬", t, l.seq)
            take(l)
            continue

        # ★ 名单里的行，两边走**同一套判断**。
        #
        #   早先 daughters 那一支一个判断都没有——进了模式就无条件往里塞，
        #   於是壁林的女儿栏里躺着「子继华兼祧长兄壁洲二兄壁银」（那是过继语句）、
        #   士硕的女儿栏里躺着一整段传赞、士宇的躺着「三子铣高出嗣士彥」。
        #   全谱这样收错 256 条；儿子那边判据太松，又收错 259 条。
        #
        #   认不出来的行**不硬塞，退回下面正常处理**——过继语句因此能进 MARKS
        #   拿到「兼祧」「出嗣」标签，传赞进 unparsed，两边都不丢，也都不错位。
        if mode in ("sons", "daughters"):
            # ★ 名单里的「名X」是「名叫X」：「生子一／名勋」。
            #   只在名单模式里剔，散文里的「名传乡里」（传赞）沉不到这儿。
            tn, _dt = strip_died(strip_named(t))
            # ★ 块里还有空位时，**单字也收**。
            #   谱写「生子四／壁林／海／水／生」，最后那个「生」是功能字，
            #   按平常的判据会被剔掉——可谱自己写了「四」，数目就是围栏。
            single = (mode == "sons" and sons_want and sons_got < sons_want
                      and RE_ONE_CHAR.match(tn) and tn not in "公氏女子妣娶"
                      #   两道闸：块里已有一个多字名（辈字才知道），且不是敬称。
                      #   枝公那一条后面紧跟着另一个人「公／漂公幼子」，
                      #   收了它名单就关不上，后面几行会一块儿串进来。
                      and any(len(k.given) >= 2 for k in sons_block))
            if (is_son_item(tn) or single) and mode == "sons":
                _k = make_son(p, tn, l.seq, sons_kind)
                p.sons_claimed.append(_k.given or _k.name_raw)
                p.kin.append(_k); sons_block.append(_k)
                sons_got += 1
                take(l); continue
            # ★ 行内夹着下一块的名单头：「儒健生女一　儒桦」。
            #   **只在名单模式里切**，且两头都得站得住；
            #   散文里的「壁进后生子承继生父宗祠」不在名单模式，碰不到这里。
            if mode == "sons":
                _mi = RE_INLINE_HDR.match(tn)
                if _mi and _mi.group(2).startswith("生"):
                    _head = strip_died(_mi.group(1))[0]
                    _tail = _mi.group(4).strip()
                    _to_dau = _mi.group(2).endswith("女")
                    _ok_tail = (not _tail) or (is_daughter_item(_tail) if _to_dau
                                               else is_son_item(_tail))
                    if is_son_item(_head) and _ok_tail:
                        _k = make_son(p, _head, l.seq, sons_kind)
                        p.kin.append(_k); sons_block.append(_k)
                        p.sons_claimed.append(_k.given or _k.name_raw)
                        sons_got += 1
                        _close_block(p, sons_block); sons_block = []
                        mode = "daughters" if _to_dau else "sons"
                        sons_want = CN_NUM.get(_mi.group(3), 0)
                        sons_got = 0
                        if _tail:
                            if _to_dau:
                                for _d in split_daughters(_tail):
                                    p.daughters_claimed.append(_d)
                                    p.kin.append(make_daughter(p, _d, l.seq))
                            else:
                                _k2 = make_son(p, _tail, l.seq, sons_kind)
                                p.kin.append(_k2); sons_block.append(_k2)
                                p.sons_claimed.append(_k2.given or _k2.name_raw)
                                sons_got += 1
                        take(l); continue
            # ★ 几个儿子挤在一行（「生子二／开怀开心」）：按谱写的数目切开。
            if mode == "sons" and sons_want - sons_got >= 2:
                run = split_run(tn, sons_want - sons_got)
                if run:
                    for _x in run:
                        _k = make_son(p, _x, l.seq, sons_kind)
                        p.sons_claimed.append(_k.given or _k.name_raw)
                        p.kin.append(_k); sons_block.append(_k)
                        sons_got += 1
                    take(l); continue
            if is_daughter_item(tn) or is_daughter_item(t):
                if is_daughter_item(tn) and not is_daughter_item(t):
                    t = tn
                # 儿子名单读到「次適吕」，说明谱已经转到女儿了
                mode = "daughters"
                for _d in split_daughters(t):
                    p.daughters_claimed.append(_d)
                    p.kin.append(make_daughter(p, _d, l.seq))
                take(l); continue
            mode = None   # 名单到此为止，这一行交给后面的规则

        # ★ 葬地跨行——放在**最后**，别的读法全试过了才轮到它。
        #   判据是谱自己的收尾习惯：坟一定收在山向、合墓或「有碑」上
        #   （「葬古角镇小坪村」停在村名上，那就是被版面截断了）。
        #   收过尾的不接——壁晶@册3 p396「葬细金园向西南」下一行是
        #   「后迁排子山向南」，那是**另一座坟**，接上去就成了假话。
        # ★ 谱常把「殁于X年X月X日葬某地某向」写成一句，落在「殁」那一格里；
        #   版面截断时后半截是坟地。所以看的不是它落在哪一格，而是
        #   **它写到一半的是不是一座坟**。
        if prev_cont:
            _bv = getattr(prev_cont[0], prev_cont[1], None)
            if (_bv and re.search(r"[葬墓]", _bv.text)
                    and not RE_BUR_END.search(_bv.text) and len(t) <= 30
                    and RE_BUR_TAIL.search(t) and not RE_NOT_BUR.search(t)):
                _bv.text += t
                _bv.line_seq.append(l.seq)
                cont = prev_cont
                take(l)
                continue

        # 到这里还没归类：打注记标签，原文进 unparsed，两边都不丢
        tagged = False
        for tag, pat in MARKS.items():
            if re.search(pat, t):
                p.marks.append((tag, t))
                tagged = True
        p.unparsed.append({"seq": l.seq, "text": l.text,
                           "page": l.page, "tagged": tagged})
        take(l)

    _close_block(p, sons_block)      # 最后一块也要收尾

    # ---- 行数守恒 ----
    if len(used) != len(seg.lines):
        missing = [l.seq for l in seg.lines if l.seq not in used]
        raise AssertionError(
            f"{p.pid} 行数不守恒：段内 {len(seg.lines)} 行，"
            f"已归属 {len(used)} 行，漏 {missing[:5]}")

    # 页眉指向：第 1 行没写父名时，父亲在上一页（或上一册）
    if not p.father_name and p.row == 1:
        # ★ 一页可能有好几个页眉（一页几栏，每栏各有父亲）。
        #   只有一个时直接用；不止一个就**全部留着**，交给上层去对（不猜）。
        #   早先整页只取一个，一页多栏就全部区配不上，37 人因此没了父名。
        ptrs = pointers.get(p.vol, {}).get(p.page) or []
        if len(ptrs) == 1:
            fn, fil, raw = ptrs[0]
            p.father_name, p.filiation = fn, fil
            p.father_src = f"页眉指向「{raw.strip()}」"
        elif len(ptrs) > 1:
            p.father_src = "页眉有 %d 个指向" % len(ptrs)
        p.page_ptrs = [{"name": a, "filiation": b, "raw": c.strip()} for a, b, c in ptrs]

    # ---- id 唯一性 ----
    # 谱把几个人印在同一行时（「长适吕次適蔡　幼适柴」），
    # 行号不够分辨。加一个行内序号，而不是让两个人挤一个 id。
    seen = {}
    for k in p.kin:
        n = seen.get(k.at, 0)
        seen[k.at] = n + 1
        if n:
            k.at = f"{k.at}.{n}"
        if k.person and k.role in ("妻", "女"):
            k.person = k.at
    # SpouseRec 的 pid 跟着改回来
    _wives = [k for k in p.kin if k.role == "妻"]
    for sp, k in zip(p.spouses, _wives):
        sp.pid = k.person
    return p


def _own_filled(p: PersonRec, lead: str) -> bool:
    return {"生": p.birth, "殁": p.death, "葬": p.burial}[lead] is not None


def _fill_lack(m_lack, tgts, text: str, seq: int):
    """把谱的缺记声明照原样填进它说到的每一格。已经有值的格子不动。"""
    for ch in dict.fromkeys(m_lack.group(2)):
        k = LACK_FIELD.get(ch)
        if not k:
            continue
        attr = {"生": "birth", "殁": "death", "葬": "burial"}[k]
        for tg in tgts:
            if getattr(tg, attr) is None:
                _assign(tg, k, text, seq)      # 原样填，一个字不改


def _peel_plan(tail: str):
    """把挤在一行里的几句字段声明拆成一条条动作。

    谱把一整段写成一行是常事：「娶李氏生年未详殁年未详葬牌子山」
    「妣殁年月日时未详与夫合墓」。返回（动作表, 剩下没认出来的那截）。

    ★ 只算不写。认不全的时候调用方可以整句退回去，不至於剥了一半就动了数据。
    """
    acts = []
    while tail:
        m = RE_LACK_HEAD.match(tail)              # 生年未详 · 殁葬缺
        if m:
            acts.append(("lack", m, m.group(0)))
            tail = tail[m.end():]
            continue
        m = RE_SP_LEAD.match(tail)                # 生于一九六九年五月七日
        if m and m.group(2).strip():
            acts.append(("val", m.group(1)[0], m.group(2).strip()))
            return acts, ""
        if RE_BURIAL.match(tail):                 # 葬牌子山 · 与夫合墓
            acts.append(("val", "葬", tail))
            return acts, ""
        break
    return acts, tail


def _peel_do(tgts, acts, seq):
    for a in acts:
        if a[0] == "lack":
            _fill_lack(a[1], tgts, a[2], seq)
        else:
            for tg in tgts:
                _assign(tg, a[1], a[2], seq)


def _ns(x: str) -> str:
    """去掉排版空格。谱把名字印成「继 洪」，中间那格是版面，不是字。"""
    return "".join((x or "").split()).replace("　", "")


def _lead_who(p, pre: str, inline: bool = False):
    """引导词前面那几个字说的是谁。返回（谁, 按什么名字找, 认不认）。

    谱写前缀只有一个意思：**点名这一条是谁的**。
        「公」                      本人
        「妣」「继妣」              身边那位
        「王妣」「李妣氏」「桂氏」  姓王/姓李/姓桂那位
        「光元公」「承求」          直接写名字

    ★ 认不出这几个字是谁，就**不当引导词**。宁可这一行落到未归属里
      让人看见，也不能随手安给某个人——那就成了猜。
    """
    if not pre:
        return None, None, True
    if pre in LEAD_ANON:
        return ("本人" if pre == "公" else "配偶"), None, True
    if pre in TITLES:                          # 「儒士生于」「业儒生于」
        return "本人", None, True
    # 「法名道元生于」——给名字加的注，不指人；谁的按位置定（姚氏@册3 p174）。
    # ★ 只认**整行就是引导词**的写法。谱把一整条挤成一行时
    #   （开荣@册4 p78「字宝荣生生于…生子一用兵」），前面那几个字
    #   不是注，是条目的头；当成引导词就会把整行吞掉，儿子也没了。
    if not inline and RE_NAME_NOTE.match(pre):
        return None, None, True
    if pre[-1] in "妣氏":                      # 王妣 · 李妣氏 · 桂氏
        return "配偶", pre[0], True
    nm = _ns(pre[:-1] if pre.endswith("公") else pre)
    if not nm:
        return "本人", None, True
    mine = {_ns(p.name_raw)}
    for f in (p.zi, p.hui, p.hao, p.ming):
        if f:
            mine.add(_ns(f.text))
    if nm in mine:
        return "本人", None, True
    for sp in p.spouses:
        if _ns(sp.name_raw).startswith(nm):
            return "配偶", nm, True
    return None, None, False


def _whose(p, cur_sp, lead: str, who: str | None, sur: str | None):
    """这一条生／殁／葬该记到谁头上。

    顺序就是谱自己的顺序：**它点了名的**最硬（「王妣殁于」），
    其次是它写的前缀（「公」＝本人、「妣」＝当前那位配偶），
    都没写才按位置推（本人那一格已经填了，就该是身边这位配偶的）。
    """
    if sur:
        named = next((s for s in p.spouses
                      if s.name_raw.strip().startswith(sur)), None)
        if named is not None:
            return named
    if who == "本人":
        return p
    if who == "配偶" and cur_sp is not None:
        return cur_sp
    return cur_sp if (cur_sp is not None and _own_filled(p, lead)) else p


def _assign(tgt, lead: str, text: str, seq: int):
    attr = {"生": "birth", "殁": "death", "葬": "burial"}[lead]
    if getattr(tgt, attr) is None:
        setattr(tgt, attr, FieldVal(text, [seq]))
    else:
        cur = getattr(tgt, attr)
        cur.text += " ｜ " + text          # 追加，不覆盖
        cur.line_seq.append(seq)
    return (tgt, attr)


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
