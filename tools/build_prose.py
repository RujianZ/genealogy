"""
把世系正文里的事迹切出来。

★★ **事迹 ＝ 解析器没接住的行。全谱只有这一个定义。**

  这个文件原来有三十条正则，自己判每一行是「骨架」还是「话」——
  那是全站**第三套**行判定（`parser/fields.py` 抽字段判一遍，
  `src/core/dossier.ts` 归类又判一遍）。三套各判各的，於是：

      锡公「女一适赵」   解析器早已存成 daughters_claimed:["适赵"]，
                        事迹层又判成「话」，抄了一遍
      朝相「生子三啟蒙」 已经是生子名单，又抄了一遍
      朝聘「复娶柳氏」   已经是配偶，又抄了一遍

  全谱 1,792 段事迹里，**833 段是这么来的**——解析器抽走了，这里又捡回来。

  现在只认一件事：**解析器把哪些行留在了 `unparsed` 里**。
  抽走的不再碰；留下的才是话。

  好处不只是少了 833 段噪音：以后解析器每进步一点，事迹层**自动**跟着变干净，
  不用两边同步。事迹层的大小，从此如实反映结构化的欠账。

★ 不「剥」，要「分」。

  谱是窄栏排的，一句话会断成好几行：
      │ 礼有之先祖 / 有善而弗知 / 不明也知而 / 弗传不仁也
  连着的话行并成一段，**只是把换行去掉，一个字不动、不加标点**。

★ 校验：**每一行必须且只能归一处**。
  骨架字数 + 事迹字数 == 原文总字数。差一个字就报错。
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    out = []
    total = skel = prose = 0
    tally = Counter()

    for p in people:
        # 解析器留下的行。同一段里可能有重复的文本，用计数消耗，保持顺序
        left = Counter(NS(u["text"]) for u in p.get("unparsed", []) if NS(u["text"]))
        tagged = {NS(u["text"]): u.get("tagged", False) for u in p.get("unparsed", [])}

        paras, cur = [], []
        for ln in p["raw_text"].split("\n"):
            t = NS(ln)
            if not t:
                continue
            total += len(t)
            if left[t] > 0:
                left[t] -= 1
                prose += len(t)
                tally["解析器没接住（＝事迹）"] += 1
                cur.append(ln.strip())
            else:
                skel += len(t)
                tally["解析器已抽成字段"] += 1
                if cur:
                    paras.append("".join(cur))
                    cur = []
        if cur:
            paras.append("".join(cur))
        paras = [x for x in paras if NS(x)]

        if paras:
            out.append({
                "pid": p["pid"], "name": p["name"], "gen": p["gen"],
                "src_human": p["src_human"], "src": p["src"],
                "paras": paras,
                "chars": sum(len(NS(x)) for x in paras),
                # 解析器给这些行打过注记标签没有（立嗣/出嗣/迁徙/传赞…）
                "tagged": any(tagged.get(NS(x), False) for x in paras),
            })

    if skel + prose != total:
        print(f"✘ 字符对不上！骨架 {skel} + 事迹 {prose} != 总数 {total}")
        raise SystemExit(1)
    print(f"✔ 字符守恒：骨架 {skel:,} + 事迹 {prose:,} = 原文 {total:,}\n")

    for k, v in tally.most_common():
        print(f"   {v:>6}　{k}")

    print(f"\n有话的条目：**{len(out)} 条**，共 **{prose:,} 字**"
          f"（占原文 {prose / total * 100:.1f}%）")
    b = Counter()
    for x in out:
        b["1–7 字（多半是零碎）" if x["chars"] < 8
          else "8–30 字" if x["chars"] < 31
          else "31–80 字" if x["chars"] < 81 else "80 字以上（成段的）"] += 1
    for k in ("1–7 字（多半是零碎）", "8–30 字", "31–80 字", "80 字以上（成段的）"):
        if b[k]:
            print(f"   {b[k]:>5}　{k}")

    Path("data/prose_raw.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n→ data/prose_raw.json")

    print("\n抽 5 条看切得对不对（**按原文的行，没有从中间剪断**）：\n")
    for x in sorted(out, key=lambda v: -v["chars"])[:5]:
        print(f"  {x['name']}（第{x['gen']}世 {x['src_human']}）{x['chars']} 字")
        for g in x["paras"]:
            print(f"      │ {g[:70]}")
        print()


if __name__ == "__main__":
    main()
