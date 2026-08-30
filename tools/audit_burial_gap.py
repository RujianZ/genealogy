"""
查清剩下的 51.7%：没有葬地记录的 1,167 人，到底是谱没写，还是我没解析出来。

四种可能，必须分开，不能笼统说「缺失」：
  A 解析漏了   —— raw_text 里明明有「葬」，我的提取器没吃到  ← 我的锅，要修
  B 谱明说没有 —— 「葬缺」「殁葬未详」「公妣殁葬缺」，编谱人写下的「这里没有记录」
  C 记在别人条目里 —— 「俱葬…」「合墓」「附父右」，本人葬地写在父/兄/夫那一条
  D 谱真的没写 —— raw_text 里一个「葬」字都没有

每一类都给数字和样例，一条不省。
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

MISSING_DECL = re.compile(r"葬[^，。]{0,4}(缺|未详|未祥|不详|失考|无考)|(殁葬|生殁葬|公妣殁葬)[^，。]{0,3}缺")
JOINT = re.compile(r"俱葬|合墓|同墓|附[父母兄弟夫姑翁祖]|与[夫父母兄弟姑翁妇]合")
YOUNG = re.compile(r"幼殇|幼殁|早殇|早殁|殇$")


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    burials = json.loads(Path("data/burials.json").read_text(encoding="utf-8"))
    have = {r["owner"] for r in burials if "/" not in r["owner"]}
    missing = [p for p in people if p["pid"] not in have]

    print(f"有条目的人 {len(people)}，已有葬地 {len(have)}，无葬地 {len(missing)}"
          f"（{len(missing)/len(people)*100:.1f}%）\n")

    buckets: dict[str, list] = {"A 解析漏了": [], "B 谱明说没有": [],
                                "C 记在别人条目里": [], "D 谱真的没写": [],
                                "E 幼殇幼殁": []}
    for p in missing:
        raw = NS(p["raw_text"])
        if "葬" not in raw:
            buckets["E 幼殇幼殁" if YOUNG.search(raw) else "D 谱真的没写"].append(p)
        elif MISSING_DECL.search(raw):
            buckets["B 谱明说没有"].append(p)
        elif JOINT.search(raw):
            buckets["C 记在别人条目里"].append(p)
        else:
            buckets["A 解析漏了"].append(p)

    for k, v in buckets.items():
        pct = len(v) / len(missing) * 100 if missing else 0
        print(f"{k:<14} {len(v):>5} 人  {pct:5.1f}%")

    print("\n" + "=" * 66)
    for k in ("A 解析漏了", "C 记在别人条目里", "B 谱明说没有", "D 谱真的没写"):
        v = buckets[k]
        print(f"\n【{k}】{len(v)} 人，样例：")
        for p in v[:6]:
            seg = ""
            i = NS(p["raw_text"]).find("葬")
            if i >= 0:
                seg = NS(p["raw_text"])[max(0, i - 6):i + 34]
            print(f"   {p['name']}({p['gen']}世) {p['src_human']}")
            print(f"      …{seg}…" if seg else "      （原文无「葬」字）")

    # A 类是我的锅，把它们含「葬」的片段全导出来，供改提取规则
    a = buckets["A 解析漏了"]
    if a:
        rows = []
        for p in a:
            raw = NS(p["raw_text"])
            for m in re.finditer("葬", raw):
                rows.append({"pid": p["pid"], "name": p["name"], "gen": p["gen"],
                             "src": p["src_human"], "seg": raw[m.start():m.start() + 40]})
        Path("work/report/A_解析漏的葬地.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nA 类的 {len(rows)} 个「葬」片段已导出 work/report/A_解析漏的葬地.json")
        print("A 类片段的开头形态（看看是什么规律挡住了提取）：")
        pat = Counter(r["seg"][:12] for r in rows)
        for s, n in pat.most_common(15):
            print(f"   ×{n:<4} {s}")


if __name__ == "__main__":
    main()
