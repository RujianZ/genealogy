"""
传赞事迹建档：把埋在 unparsed 里的成段文字挑出来，每段一个条目。

为什么值得单列：这些段落是全谱唯一带感情的文字。
德懋讨饭养母那一段，1710 年程万里读到县志里的它才找上门作序，才有了第一部谱；
壁松那句「间断一百廿余年…如有错误，谨请先祖赦罪」，是这部谱最重的一句话。
现在它们只是某个人 unparsed 数组里的一行，搜不到、点不开。

筛法（宁可多留，不许漏）：
  排除 —— 以年号／干支／数字／生于／殁于／合葬／迁葬／次子 开头的，那是日期和葬地
  保留 —— 其余 ≥15 字的整段

归属（**只标依据，不替谱断定**）：
  「氏夫亡」「氏夫」开头        → 写的是宿主的妻子
  「吾父」「惟考」「先考」      → 写的是宿主本人（由他儿子写）
  其余                         → 未标明

输出 data/passages.json
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 这些不是传记，是日期／葬地／山界碎片。
# ★ 只看开头不够：「俱葬…」「复迁葬…」「夫妻俱葬…」也得排掉，
#   第一版漏了它们，30 段葬地细节混进了「传赞」。
NOT_PASSAGE = re.compile(
    r"^(生于|殁于|公殁|公生|妣殁|合葬|同葬|迁葬|先厝|附葬|葬|次子|长子|幼子|三子|四子|五子"
    r"|公妣|年[一二三四五六七八九十]|月|日|时"
    r"|[一二三四五六七八九十百廿卅]+年|[〇零一二三四五六七八九]{4}"
    r"|光绪|同治|咸丰|道光|嘉庆|乾隆|雍正|康熙|顺治|民国|宣统|万历|崇正|崇祯|天启|一九|二零|二0)")
# 整段就是葬地／山界／日期的，一律不当传记（但它们已在葬地索引里，不算丢）
IS_BURIAL = re.compile(r"^([^，。]{0,6})?(俱葬|复迁|迁葬|供葬|合墓|附夫|附葬|与父同葬|夫妻俱葬)")
IS_BOUNDARY = re.compile(r"为界$|以.{1,6}为界|界石|分水|山脚|山顶")
IS_DATEONLY = re.compile(r"^[^，。]{0,10}(日|时)[^，。]{0,8}(向|碑|墓)?$")

# 分类。一段可以命中多类，全部记下，不强行归一类。
KINDS = [
    ("孝行", r"孝|养母|遗母|庐墓|哀墓|侑慰|自馁|事公姑"),
    ("节烈", r"氏夫亡|柏舟|苦节|矢志|完贞|守志|闺范|不轻身|受污|抚孤|泣夫无后"),
    ("兵祸殉难", r"寇至|禦贼|御贼|干戈|伍卒|兵[答殴击]|逃避|捐躯|殉难|阵亡|招魂|冒认"),
    ("修谱阙疑", r"旧谱|无法记忆|赦罪|间断|社会变更"),
    ("诗文", r"绝句|七言|县试|命题|考取|校刊|试看|其一|其二"),
    ("义行", r"排解|倾囊|公事|身先|慷慨|宽恕|助人|乡里"),
    ("悼亡", r"嗟呼|嗟吁|噫嚱|噫哕|吾父|吾母|早亡|永逝|西归|英年"),
    ("过继", r"出嗣|为嗣|立房|兼祧|承祧"),
    ("迁徙", r"迁陕|迁居|徙居|迁四川|迁江西|现居|居陕西|出生地"),
    ("修谱", r"过江|搜辑|宗谱告成|谱源流|修谱|辑谱"),
    ("才学", r"文章|业师|夫子|乡试|学业|天姿|不寿|释卷"),
    ("职衔", r"太学|商会|知事|品官|将给|督军|代表|会员|教师|工程师|校长|局长|馆长"),
    ("革命牺牲", r"为革命|牺牲|日军|杀害|捐躯|志愿军|新四军|红军|烈士"),
    ("山产", r"私业|不得藉坟|添棺|禁蓄|管绍"),
    ("持家", r"克勤|克俭|贞操|教子|待人|众口"),
]

# 归属线索
ABOUT = [
    (r"^氏夫亡|^氏[^，。]{0,3}夫[亡卒殁]", "配偶", "开头「氏夫亡」——通篇讲的是未亡人"),
    (r"吾父|惟考|先考|亡父", "本人", "文中称「吾父」「惟考」，是儿子写父亲"),
    (r"吾母|先妣|亡母|萱龄", "配偶", "文中称「吾母」「先妣」，写的是母亲"),
]


def classify(t: str) -> list[str]:
    return [k for k, pat in KINDS if re.search(pat, t)]


def about(t: str) -> tuple[str, str]:
    for pat, who, why in ABOUT:
        if re.search(pat, t):
            return who, why
    return "未标明", "文中没有称谓线索，谱也没说，不替它断定"


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    out, skipped = [], Counter()
    for p in people:
        for i, u in enumerate(p["unparsed"], 1):
            t = NS(u["text"])
            if len(t) < 15:
                skipped["太短（<15字）"] += 1
                continue
            if NOT_PASSAGE.match(t):
                skipped["日期／葬地／名单碎片"] += 1
                continue
            if IS_BURIAL.match(t):
                skipped["葬地细节（已在葬地索引里）"] += 1
                continue
            if IS_BOUNDARY.search(t) and not re.search(r"孝|节|嗟|吾|公[正天系]", t):
                skipped["山界四至（已在地点索引里）"] += 1
                continue
            if IS_DATEONLY.match(t) and len(t) < 30:
                skipped["只是日期"] += 1
                continue
            who, why = about(t)
            out.append({
                "id": f"{p['pid']}/文{i}",
                "host": p["pid"], "host_name": p["name"], "gen": p["gen"],
                "text": u["text"], "flat": t, "chars": len(t),
                "kinds": classify(t) or ["未分类"],
                "about": who, "about_why": why,
                "seq": u["seq"], "page": u["page"],
                "src_human": p["src_human"],
            })
    out.sort(key=lambda x: -x["chars"])
    Path("data/passages.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    print(f"成段文字 {len(out)} 段，合计 {sum(x['chars'] for x in out):,} 字")
    print("剔除：" + "　".join(f"{k} {v}" for k, v in skipped.items()))
    print("\n按类（一段可属多类）：")
    c = Counter(k for x in out for k in x["kinds"])
    for k, v in c.most_common():
        print(f"   {v:>4}  {k}")
    print("\n写的是谁：")
    for k, v in Counter(x["about"] for x in out).most_common():
        print(f"   {v:>4}  {k}")
    print(f"\n长度分布：≥100字 {sum(1 for x in out if x['chars']>=100)}　"
          f"50–99 {sum(1 for x in out if 50<=x['chars']<100)}　"
          f"15–49 {sum(1 for x in out if x['chars']<50)}")
    print("\n=== 最长的 8 段 ===")
    for x in out[:8]:
        print(f"   {x['chars']:>3}字 [{'/'.join(x['kinds'])}] 写{x['about']} "
              f"— {x['host_name']}({x['gen']}世) {x['flat'][:38]}…")


if __name__ == "__main__":
    main()
