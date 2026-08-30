"""
把切出来的 1,249 段事迹分类。

分类只按**谱自己用的词**，一条规则对一组词，命中就打标。
一段可以有好几个标（既是节烈又是兵祸，那就两个都打）。
一个都不命中就是「未分类」——**不硬塞**。

★ 每个标都要能回答「凭哪几个字打的」，所以 hits 里记下命中的词。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

# 类别 → 谱里实际用的词。**用谱的词，不用现代词。**
TAX: dict[str, list[str]] = {
    "孝行":     ["事亲", "养母", "事母", "事父", "以孝闻", "孝友", "孝行", "至孝",
                "侍疾", "庐墓", "哀慕", "尝药", "怀归", "遗母", "负母"],
    "节烈":     ["柏舟", "苦节", "守节", "闺范", "不字", "殉节", "旌其堂", "旌表",
                "冰清", "冰霜", "贞节", "节孝", "未字守", "全洁", "受污"],
    "兵祸殉难": ["兵燹", "兵毁", "干戈", "寇至", "殉难", "被兵", "遇难", "贼",
                "土匪", "逃避", "招魂", "死难", "遭难", "兵乱", "日军", "日寇",
                "杀害", "避难", "遇害", "被杀", "沦陷", "轰炸", "抓丁"],
    "革命牺牲": ["牺牲", "革命", "烈士", "参军", "抗日", "解放", "剿匪", "志愿军"],
    "才学诗文": ["屡试", "前茅", "前矛", "文章", "业儒", "读书", "命题", "校刊",
                "行世", "赋诗", "诗云", "绝句", "赠序", "邑乘", "游庠", "补廪"],
    "传赞":     ["赞曰", "聊述数语", "谨撰", "谨识", "敬议", "谨述", "以传於",
                "以传于", "予生也晚", "噫", "嗟呼", "嗟吁", "呜呼", "吁嗟"],
    "出嗣立嗣": ["为嗣", "出嗣", "承嗣", "兼祧", "承祧", "立嗣", "抚为", "过继",
                "所自出", "无后"],
    "迁徙":     ["迁居", "迁往", "徙", "远迁", "移居", "落业", "占籍", "俱迁",
                "迁陕", "迁川", "迁江", "外出", "去向不明", "在外", "失联",
                "不知所终", "音信"],
    "持家义行": ["持家", "俭约", "治家", "排难解纷", "赈", "施", "义举", "好善",
                "乐施", "周恤", "恤贫", "里人", "乡里"],
    "职衔":     ["授", "赠", "封", "钦", "例授", "候选", "县丞", "把总", "千总",
                "州同", "布政", "教谕", "训导"],
    "山产讼案": ["山场", "买契", "存禁", "界石", "分关", "合约", "断", "控",
                "审", "讼", "占", "盗伐", "谳"],
    "碑匾":     ["给匾", "匾额", "旌其堂曰", "立碑", "碑记", "碑志", "有碑志"],
    "修谱":     ["修谱", "纂修", "家乘", "谱堂", "续修", "阙疑", "详载首卷", "另详首卷"],
    "悼亡":     ["早亡", "早逝", "早殁", "夭", "殇", "抚孤", "孤儿", "遗腹",
                "悽心", "永逝", "痛", "哀"],
}


def main() -> None:
    src = json.loads(Path("data/prose_raw.json").read_text(encoding="utf-8"))
    people = {p["pid"]: p for p in
              json.loads(Path("data/people.json").read_text(encoding="utf-8"))}

    out = []
    tally = Counter()
    for x in src:
        for i, para in enumerate(x["paras"]):
            t = NS(para)
            kinds, hits = [], []
            for k, words in TAX.items():
                w = [w for w in words if w in t]
                if w:
                    kinds.append(k)
                    hits += [f"{k}：{'、'.join(w)}"]
            if not kinds:
                kinds = ["未分类"]
            for k in kinds:
                tally[k] += 1
            p = people[x["pid"]]
            out.append({
                "id": f"{x['pid']}#{i}",
                "host": x["pid"], "host_name": x["name"], "gen": x["gen"],
                "src_human": x["src_human"], "src": x["src"],
                "text": para, "flat": t, "chars": len(t),
                "kinds": kinds, "why": hits,
                # passages 那套渲染要的字段
                "about": x["name"], "about_why": "在他自己那一条里",
                "seq": i, "page": x["src"]["page"],
            })

    Path("data/prose.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"共切出 **{len(out)} 段**，{sum(x['chars'] for x in out):,} 字\n")
    print("分类（一段可以有好几个标）：")
    for k, v in tally.most_common():
        print(f"   {v:>5}　{k}")

    unc = [x for x in out if x["kinds"] == ["未分类"]]
    print(f"\n未分类 {len(unc)} 段（{sum(x['chars'] for x in unc):,} 字），"
          f"其中 8 字以上的 {sum(1 for x in unc if x['chars'] >= 8)} 段")
    print("\n未分类里最长的 8 段——看看是不是漏了什么类别：\n")
    for x in sorted(unc, key=lambda v: -v["chars"])[:8]:
        print(f"   {x['chars']:>3}字 {x['host_name']}（第{x['gen']}世）{x['flat'][:80]}")

    print("\n\n每一类最长的一段：\n")
    for k in TAX:
        xs = [x for x in out if k in x["kinds"]]
        if not xs:
            continue
        b = max(xs, key=lambda v: v["chars"])
        print(f"── {k}　（共 {len(xs)} 段）")
        print(f"   {b['host_name']}（第{b['gen']}世 {b['src_human']}）{b['chars']} 字")
        print(f"   {b['flat'][:150]}")
        print()


if __name__ == "__main__":
    main()
