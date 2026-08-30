"""
修谱届次 + 字辈。

一、修谱届次（卷首《历届修谱名目》1,369 字）
   格式很规整：
       国朝康熙四十九年修谱名目
       朝爱  字九成
       国学生  号古岩  名国茂  字苍遂
       儒士    铣荣    讳 荣  字十朋
   每届一个年份头，下面是名单，可带头衔与号/名/讳/字。

   连人按「不猜」：谱名 + 字 都对上才算确定；只有谱名对上、
   而同名有多个，就把候选全列出来，不替谱选一个。

二、字辈
   《新取字派》给了 25–44 世的 20 个字。25 世以前的字辈谱里没有单列，
   但**能从数据里数出来**——每一世名字的首字，绝大多数是同一个。
   这不是猜：是把 2,258 个人的名字按世次统计，出现率写在旁边，人能自己核。

输出 data/revisions.json、data/generations.json
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

NS = lambda s: "".join((s or "").split()).replace("　", "")

TITLES = ["国学生", "太学生", "文学生", "业儒", "儒士", "贡生", "生员", "职员",
          "增生", "廪生", "监生", "庠生", "陆军参谋", "省教研会员"]
# 前七届写「X年修谱名目」，后三届写「X年续修名目」——两种都要认。
HEAD = re.compile(r"^(?P<era>.{2,16}?)(年)?(修谱|续修谱?)名目")
FIELD = re.compile(r"(号|名|讳|字)\s*([一-鿿]{1,3})")
# 后三届把职务单独写一行，人在下面几行。前七届没有职务。
ROLES = ["督修", "主修", "副主修", "编校", "编修", "对阅", "协修",
         "总经理", "总理", "监修", "经理", "房长", "采访", "校正"]
ROLE_RE = re.compile(r"^(" + "|".join(sorted(ROLES, key=len, reverse=True)) + r")")


def parse_person(line: str) -> dict | None:
    s = line.strip()
    if not s:
        return None
    title = next((t for t in TITLES if s.startswith(t)), None)
    if title:
        s = s[len(title):]
    fields = {k: v for k, v in FIELD.findall(s)}
    # 去掉带标签的部分，剩下的第一个词就是谱名
    bare = FIELD.sub(" ", s)
    names = [w for w in re.split(r"\s+", NS(bare).replace("　", " ")) if w]
    pu = None
    m = re.match(r"^([一-鿿]{1,3})", NS(bare))
    if m:
        pu = m.group(1)
    # 「国学生 号古岩 名国茂 字苍遂」——谱名写在「名」字段里，没有裸名。
    # 第一版只找裸名，这类全判成「谱中查无」。
    if not pu:
        pu = fields.get("名") or fields.get("讳")
    if not pu and not fields:
        return None
    return {"title": title, "name": pu, **fields, "raw": line.strip()}


def main() -> None:
    shou = json.loads(Path("data/shou.json").read_text(encoding="utf-8"))
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    doc = next(v for v in shou if "历届修谱名目" in v["title"])

    # ── 一、修谱届次 ──────────────────────────────────────────
    rounds, cur, role = [], None, None
    for line in doc["text"].split("\n"):
        t = line.strip()
        if not t or t == "历届修谱名目":
            continue
        m = HEAD.match(NS(t))
        if m:
            era = m.group("era").replace("国朝", "").replace("中华人民共和国公元", "").replace("共和国", "")
            cur = {"era": era, "members": [], "raw_head": t}
            rounds.append(cur)
            role = None
            tail = re.sub(r"^.*?(修谱|续修谱?)名目", "", t).strip()
            if tail:
                p = parse_person(tail)
                if p:
                    cur["members"].append({**p, "role": role})
            continue
        if not cur:
            continue
        # 职务单独一行，或职务后面直接跟着人
        rm = ROLE_RE.match(NS(t))
        if rm:
            role = rm.group(1)
            tail = t[t.find(role) + len(role):].strip() if role in t else ""
            if tail:
                p = parse_person(tail)
                if p:
                    cur["members"].append({**p, "role": role})
            continue
        p = parse_person(t)
        if p:
            cur["members"].append({**p, "role": role})

    # 连人：按**全部别名**找，不只按谱名。
    # 名目里写「国学生 号古岩 名国茂 字苍遂」——国茂是他的讳，谱名叫士硕。
    # 只按谱名找，这类全判成「谱中查无」。谱自己的索引就是按别名建的，照办。
    by_alias: dict[str, list] = {}
    for p in people:
        for a in p["aliases"]:
            by_alias.setdefault(NS(a["form"]), []).append(p)

    def lookup(m: dict) -> list:
        """名目给的每一种写法都拿去找，取交集；交集空则取并集当候选。"""
        forms = [NS(v) for k, v in m.items()
                 if k in ("name", "字", "讳", "号", "名") and v]
        sets = [{p["pid"] for p in by_alias.get(f, [])} for f in forms if f in by_alias]
        if not sets:
            return []
        inter = set.intersection(*sets) if len(sets) > 1 else sets[0]
        pool = inter if inter else set().union(*sets)
        seen, out = set(), []
        for f in forms:
            for p in by_alias.get(f, []):
                if p["pid"] in pool and p["pid"] not in seen:
                    seen.add(p["pid"]); out.append(p)
        return out

    确定 = 候选 = 查无 = 0
    for r in rounds:
        for m in r["members"]:
            cands = lookup(m)
            zi = m.get("字")
            exact = [p for p in cands if zi and p.get("zi") and NS(p["zi"]["text"]) == NS(zi)]
            if len(exact) == 1:
                m["pid"], m["match"] = exact[0]["pid"], "谱名和字都对上"
                m["gen"] = exact[0]["gen"]
                确定 += 1
            elif len(cands) == 1:
                m["pid"], m["match"] = cands[0]["pid"], "别名唯一对上"
                m["gen"] = cands[0]["gen"]
                确定 += 1
            elif cands:
                m["candidates"] = [{"pid": p["pid"], "gen": p["gen"],
                                    "zi": p["zi"]["text"] if p.get("zi") else "",
                                    "src": p["src_human"]} for p in cands]
                m["match"] = f"同名的有 {len(cands)} 个，谱没说是哪一个"
                候选 += 1
            else:
                m["match"] = "谱中查无此名"
                查无 += 1

    Path("data/revisions.json").write_text(
        json.dumps(rounds, ensure_ascii=False), encoding="utf-8")

    print(f"=== 修谱届次 {len(rounds)} 届 ===")
    for r in rounds:
        got = sum(1 for m in r["members"] if m.get("pid"))
        print(f"   {r['era']:<12} {len(r['members']):>3} 人   连上 {got}")
    print(f"\n连人：确定 {确定}　候选待定 {候选}　谱中查无 {查无}")

    # ── 二、字辈 ──────────────────────────────────────────────
    gens = {}
    for p in people:
        gens.setdefault(p["gen"], []).append(NS(p["name"]))
    rows = []
    for g in sorted(gens):
        names = [n for n in gens[g] if n]
        c = Counter(n[0] for n in names if n)
        top, n = c.most_common(1)[0] if c else ("", 0)
        rows.append({"gen": g, "char": top, "n": n, "total": len(names),
                     "rate": round(n / len(names) * 100, 1) if names else 0,
                     "others": [{"char": k, "n": v} for k, v in c.most_common()[1:6]]})
    # 与《新取字派》对照
    pai = next((v for v in shou if "新取字派" in v["title"]), None)
    pai_chars = NS(pai["text"]).replace("新取字派", "") if pai else ""
    for i, ch in enumerate(pai_chars):
        g = 25 + i
        r = next((x for x in rows if x["gen"] == g), None)
        if r:
            r["pai"] = ch
            r["pai_ok"] = (ch == r["char"])
    Path("data/generations.json").write_text(
        json.dumps(rows, ensure_ascii=False), encoding="utf-8")

    print(f"\n=== 字辈（从 2,258 个名字里数出来的）===")
    print(f"《新取字派》原文 {len(pai_chars)} 字：{pai_chars}")
    print(f"\n{'世':>3} {'字辈':>4} {'占比':>7}  {'人数':>5}   谱上派语   其它写法")
    for r in rows:
        pai_col = r.get("pai", "")
        ok = "✓" if r.get("pai_ok") else ("✗" if pai_col else "")
        oth = "  ".join(f"{o['char']}{o['n']}" for o in r["others"][:3])
        print(f"{r['gen']:>3} {r['char']:>4} {r['rate']:>6}%  {r['total']:>5}   "
              f"{pai_col:<4}{ok:<3}  {oth}")


if __name__ == "__main__":
    main()
