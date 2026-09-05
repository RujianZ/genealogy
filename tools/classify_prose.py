"""
把切出来的事迹按段落编号，每段一条记录。

★★ **不分类。**

  这个文件原来有一张十五类的词表（孝行·节烈·传赞·悼亡·兵祸殉难·才学诗文…），
  按谱里用的词给每段打标。三个理由不再打：

    1. **分类是判断，判断就可能错。** 谱写「事亲至孝」是事实，
       我们说它属于「孝行」是我们的归纳——那一步不是谱的话。
    2. 真事迹本来就少。全谱 2,233 人，能称得上事迹的一百多段，
       分成十五类之后每类只剩几段，分类不解决任何查找问题。
    3. 承健定的规矩：**能不判断就不判断**。原话摆在那儿，人自己看。

  段落照原文摆，谁写的、说的是谁、提到了谁——那些是**关系**，用 pid 记，
  见 `extract_entities.py` 与 `tools/writeback.mjs` 写进人的 JSON。
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")


def main() -> None:
    src = json.loads(Path("data/prose_raw.json").read_text(encoding="utf-8"))
    people = {p["pid"]: p for p in
              json.loads(Path("data/people.json").read_text(encoding="utf-8"))}

    out = []
    for x in src:
        for i, para in enumerate(x["paras"]):
            t = NS(para)
            if x["pid"] not in people:
                continue
            out.append({
                "id": f"{x['pid']}#{i}",
                "host": x["pid"], "host_name": x["name"], "gen": x["gen"],
                "src_human": x["src_human"], "src": x["src"],
                "text": para, "flat": t, "chars": len(t),
                # ★ kinds 留一个空数组：下游还在读这个字段，给空的比给假的强。
                #   等下游都改完就删掉。
                "kinds": [], "why": [],
                "about": x["name"], "about_why": "在他自己那一条里",
                "seq": i, "page": x["src"]["page"],
            })

    Path("data/prose.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"共切出 **{len(out)} 段**，{sum(x['chars'] for x in out):,} 字（不分类）\n")
    b = Counter()
    for x in out:
        b["1–7 字" if x["chars"] < 8 else "8–30 字" if x["chars"] < 31
          else "31–80 字" if x["chars"] < 81 else "80 字以上"] += 1
    for k in ("1–7 字", "8–30 字", "31–80 字", "80 字以上"):
        if b[k]:
            print(f"   {b[k]:>5}　{k}")
    print("\n最长的 5 段：\n")
    for x in sorted(out, key=lambda v: -v["chars"])[:5]:
        print(f"  {x['host_name']}（第{x['gen']}世 {x['src_human']}）{x['chars']} 字")
        print(f"      {x['flat'][:76]}")
    print("\n→ data/prose.json")


if __name__ == "__main__":
    main()
