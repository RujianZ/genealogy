"""
附记之人建档：给谱里提到、但没有独立条目的每一个人，一个 id。

谁：
  ① 配偶   1,740  「妣汪氏」「娶李氏雪梅」——附在男性条目下
  ② 女儿     888  「女一 适陈」——只有夫家姓
  ③ 幽灵子   837  父亲的生子名单点了名，但全谱查无条目指回

合计 3,465 人，比有条目的 2,258 还多 1,207。

规矩（CLAUDE.md 第二节）：
  不猜 —— 姓名形式认不出就原样存，标 form_ok=false，不硬解析。
          两个「汪氏」就是两个人，绝不合并。重名不管。
  不漏 —— 每一个 spouses / daughters_claimed / sons_claimed 条目都必须产出
          恰好一个 rid。进出数量用断言卡死，对不上直接中止。
  可追溯 —— rid 从宿主 pid 推出，自带出处；raw_text 指回宿主原文。

传记归属：谱把女性的传记写在丈夫条目里（「氏夫亡年三十岁柏舟自持…」）。
  这里**不搬走、不判定**，只把候选段落双向挂：宿主原文一字不动，
  同时在她的卡片上标出「疑似记述本人，未采信，依据：出现『氏夫亡』」。
  宁可两边都显示，也不替谱做决定。
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# ★ 姓名解析统一走 classify_names.classify()，不要在这里再写一套正则。
#   第一版这里自己写了两条窄正则，结果 461 条配偶、594 条女儿解析不出来
#   （最大的原因是没有「適→适」），而改进版规则只写在 classify_names.py 里，
#   两个脚本各算各的，同一份数据两个答案。这就是重复实现的代价。
sys.path.insert(0, str(Path(__file__).parent))
from classify_names import classify as classify_name  # noqa: E402

# 疑似记述女性本人的段落特征。只用于**标记候选**，不做归属判定。
FEMALE_MARKS = [
    ("氏夫亡", "以「氏夫亡」开头，通篇讲的是未亡人"),
    ("柏舟", "「柏舟」是守节的典故"),
    ("矢志", "「矢志」守节"),
    ("苦节", "「苦节」守节年数"),
    ("完贞", "「完贞」"),
    ("抚孤", "「抚孤」抚养遗孤"),
    ("泣夫无后", "「泣夫无后」"),
    ("事公姑", "「事公姑」侍奉公婆"),
    ("再醮", "改嫁"),
    ("再蘸", "改嫁（异写）"),
    ("旌表", "受旌表"),
]


def spouse_role(rel: str) -> str:
    """妣/娶/继娶/复娶/聘/庶… 原样保留，只做粗分类用于排序"""
    r = NS(rel)
    if "聘" in r:
        return "聘（未过门或幼殇）"
    if "庶" in r or "侧" in r:
        return "侧室"
    if "继" in r or "复" in r or "又" in r:
        return "继配"
    return "元配"


def build(people: list[dict]) -> tuple[list[dict], dict]:
    out: list[dict] = []
    stats: Counter = Counter()
    # 谱中已有条目指回的 (父pid, 子名) —— 用来判定「幽灵子」
    linked: set[tuple[str, str]] = set()
    for p in people:
        for e in p["parent_edges"]:
            linked.add((e["parent"], NS(p["name"])))

    for p in people:
        host, gen, src = p["pid"], p["gen"], p["src_human"]

        # ── ① 配偶 ──────────────────────────────────────────────
        for i, s in enumerate(p["spouses"], 1):
            cls, parsed = classify_name(s["name_raw"], "配偶")
            is_name = cls.startswith("姓名")
            out.append({
                "rid": f"{host}/配{i}", "host": host, "host_name": p["name"],
                "role": "配偶", "rel_raw": s["rel"], "rel_class": spouse_role(s["rel"]),
                "name_raw": s["name_raw"], "gen": gen,
                "surname": parsed.get("surname"),
                "given": parsed.get("given"),
                "form_ok": is_name,
                "content_class": cls,      # 不是姓名时，说明它到底是什么
                "birth": s.get("birth"), "death": s.get("death"), "burial": s.get("burial"),
                "src_human": src, "host_raw_text": p["raw_text"],
                "narrative_candidates": [],
            })
            stats["配偶"] += 1
            stats[f"配偶·{cls}"] += 1

        # ── ② 女儿 ──────────────────────────────────────────────
        for i, d in enumerate(p["daughters_claimed"], 1):
            cls, parsed = classify_name(d, "女")
            is_daughter = cls.startswith("出适")
            out.append({
                "rid": f"{host}/女{i}", "host": host, "host_name": p["name"],
                "role": "女", "rel_raw": "", "rel_class": "女儿",
                "name_raw": d, "gen": gen,
                "surname": None,   # 本姓必是张，谱不写；不臆造
                "given": parsed.get("given"),
                "husband_surname": parsed.get("husband_surname"),
                "place": parsed.get("place"),
                "ordinal": None,
                "form_ok": is_daughter,
                "content_class": cls,
                "birth": None, "death": None, "burial": None,
                "src_human": src, "host_raw_text": p["raw_text"],
                "narrative_candidates": [],
            })
            stats["女"] += 1
            stats[f"女·{cls}"] += 1

        # ── ③ 幽灵子：父亲点了名，谱中查无条目指回 ──────────────
        for i, sname in enumerate(p["sons_claimed"], 1):
            if (host, NS(sname)) in linked:
                stats["生子·谱中有条目指回"] += 1
                continue
            out.append({
                "rid": f"{host}/子{i}", "host": host, "host_name": p["name"],
                "role": "子（谱中无条目）", "rel_raw": "", "rel_class": "幽灵子",
                "name_raw": sname, "gen": (gen + 1) if gen else None,
                "surname": "张", "given": NS(sname), "form_ok": True,
                "birth": None, "death": None, "burial": None,
                "src_human": src, "host_raw_text": p["raw_text"],
                "narrative_candidates": [],
            })
            stats["子（谱中无条目）"] += 1

        # ── 传记候选：只标记，不归属 ─────────────────────────────
        wives = [r for r in out if r["host"] == host and r["role"] == "配偶"]
        if wives:
            for u in p["unparsed"]:
                t = NS(u["text"])
                why = [w for k, w in FEMALE_MARKS if k in t]
                if why and len(t) >= 8:
                    for w in wives:
                        w["narrative_candidates"].append({
                            "text": u["text"], "seq": u["seq"], "page": u["page"],
                            "why": "；".join(why),
                            "note": f"该段写在{p['name']}（{src}）条目内。"
                                    f"配偶有 {len(wives)} 位，未判定属于哪一位。",
                        })
                    stats["传记候选段"] += 1
    return out, dict(stats)


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    refs, stats = build(people)

    # ══════ 守恒断言：进出必须相等 ══════
    n_sp = sum(len(p["spouses"]) for p in people)
    n_da = sum(len(p["daughters_claimed"]) for p in people)
    n_so = sum(len(p["sons_claimed"]) for p in people)
    got_sp = sum(1 for r in refs if r["role"] == "配偶")
    got_da = sum(1 for r in refs if r["role"] == "女")
    got_so = sum(1 for r in refs if r["role"] == "子（谱中无条目）")
    linked_so = stats.get("生子·谱中有条目指回", 0)

    problems = []
    if got_sp != n_sp:
        problems.append(f"配偶 进{n_sp} 出{got_sp}")
    if got_da != n_da:
        problems.append(f"女儿 进{n_da} 出{got_da}")
    if got_so + linked_so != n_so:
        problems.append(f"生子 进{n_so} 出{got_so}+已有条目{linked_so}={got_so+linked_so}")
    rids = [r["rid"] for r in refs]
    if len(set(rids)) != len(rids):
        dup = [k for k, v in Counter(rids).items() if v > 1][:5]
        problems.append(f"rid 重复 {len(rids)-len(set(rids))} 个，例如 {dup}")
    if problems:
        print("✗ 守恒断言失败，中止：")
        for x in problems:
            print("   " + x)
        sys.exit(1)

    Path("data/referenced.json").write_text(
        json.dumps(refs, ensure_ascii=False), encoding="utf-8")

    print("✓ 守恒断言通过")
    print(f"   配偶 {n_sp} → {got_sp}")
    print(f"   女儿 {n_da} → {got_da}")
    print(f"   生子 {n_so} → 谱中有条目 {linked_so} + 幽灵 {got_so}")
    print(f"   rid 无重复，共 {len(refs)} 条\n")
    for k, v in sorted(stats.items()):
        print(f"   {k:<24} {v}")
    print(f"\n   有条目的人 {len(people)} + 附记之人 {len(refs)} = {len(people)+len(refs)} 人")
    print(f"   写入 data/referenced.json")


if __name__ == "__main__":
    main()
