"""
主流程：JSONL -> 段 -> 人物 -> 边 -> 三份审计

    python -m gpx2.build jsonl out2/

产出：
  genealogy.db        SQLite，人物 / 配偶 / 子女声明 / 边 / 未归属文本
  people.json         前端数据包
  01_完整性审计.md     字符和行是否守恒（G1/G3）
  02_歧义清单.csv      所有没连边的地方，连同全部候选（不择一）
  03_核对疑点.csv      排行、单向声明、世次跳档
  04_未归属文本.csv    所有认不出的行，一行不少
"""
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from collections import Counter
from dataclasses import asdict
from pathlib import Path

from .segment import segment_all
from .fields import extract_all
from .link import link, cross_check, add_adoption_edges, walk_up, flatten_paths, norm
from . import adoption


def fv(x):
    return {"text": x.text, "lines": x.line_seq} if x else None


def to_dict(p):
    return {
        "pid": p.pid, "name": p.name, "name_raw": p.name_raw, "gen": p.gen,
        "zi": fv(p.zi), "hui": fv(p.hui), "hao": fv(p.hao), "ming": fv(p.ming),
        "father_name": p.father_name, "filiation": p.filiation,
        "father_src": p.father_src, "is_heir": p.is_heir,
        "aliases": [{"form": a, "why": w} for a, w in p.aliases],
        "parent_candidates": p.parent_candidates,
        "birth": fv(p.birth), "death": fv(p.death),
        "burial": fv(p.burial), "age": fv(p.age),
        "titles": p.titles,
        "marks": [{"tag": t, "text": s} for t, s in p.marks],
        # ★ 本条里记到的每一个人，一人一个 id。
        #   妻、女儿、夭折没名字的孩子——全都算人。
        "kin": [{"at": k.at, "person": k.person, "role": k.role, "rel_raw": k.rel_raw,
                 "ordinal": k.ordinal, "name_raw": k.name_raw,
                 "given": k.given, "surname": k.surname,
                 "named": k.named, "died_young": k.died_young,
                 "line_seq": k.line_seq} for k in p.kin],
        "spouses": [{"pid": s.pid, "rel": s.rel, "name_raw": s.name_raw,
                     "birth": fv(s.birth), "death": fv(s.death),
                     "burial": fv(s.burial)} for s in p.spouses],
        "sons_claimed": p.sons_claimed,
        "daughters_claimed": p.daughters_claimed,
        "unparsed": p.unparsed,
        "page_ptrs": p.page_ptrs,
        "src": {"vol": p.vol, "page": p.page, "row": p.row, "col": p.col,
                "juan": p.juan, "section": p.section},
        "src_human": p.src_human(),
        "raw_text": p.raw_text,
    }


def write_db(people, edges, segs, path: Path):
    path.unlink(missing_ok=True)
    con = sqlite3.connect(path); c = con.cursor()
    c.executescript("""
    CREATE TABLE person(pid TEXT PRIMARY KEY, name TEXT, name_raw TEXT, gen INT,
      zi TEXT, hui TEXT, hao TEXT, ming TEXT, father_name TEXT, filiation TEXT,
      father_src TEXT, is_heir INT, aliases TEXT, parent_edge_count INT,
      birth_raw TEXT, death_raw TEXT, burial_raw TEXT, age_raw TEXT,
      titles TEXT, marks TEXT, vol TEXT, page INT, row INT, col INT,
      juan TEXT, section TEXT, src_human TEXT, raw_text TEXT, unparsed TEXT);
    CREATE TABLE spouse(pid TEXT, seq INT, rel TEXT, name_raw TEXT,
      birth_raw TEXT, death_raw TEXT, burial_raw TEXT);
    CREATE TABLE child_claim(pid TEXT, ord INT, child_name TEXT, kind TEXT);
    CREATE TABLE edge(child TEXT, child_name TEXT, parent TEXT, parent_name TEXT,
      kind TEXT, evidence TEXT, rank INT, evidence_cn TEXT, matched_as TEXT,
      child_src TEXT, parent_src TEXT);
    CREATE TABLE alias(pid TEXT, form TEXT, why TEXT);
    CREATE TABLE residue(seg_id TEXT, vol TEXT, page INT, row INT, text TEXT);
    CREATE INDEX ix_name ON person(name);
    CREATE INDEX ix_gen ON person(gen);
    CREATE INDEX ix_ed ON edge(child); CREATE INDEX ix_al ON alias(form);
    """)
    for p in people:
        c.execute("INSERT INTO person VALUES(" + ",".join("?" * 29) + ")", (
            p.pid, p.name, p.name_raw, p.gen,
            p.zi.text if p.zi else "", p.hui.text if p.hui else "",
            p.hao.text if p.hao else "", p.ming.text if p.ming else "",
            p.father_name, p.filiation, p.father_src, int(p.is_heir),
            json.dumps([{"form": a, "why": w} for a, w in p.aliases],
                       ensure_ascii=False), len(p.parent_candidates),
            p.birth.text if p.birth else "", p.death.text if p.death else "",
            p.burial.text if p.burial else "", p.age.text if p.age else "",
            json.dumps(p.titles, ensure_ascii=False),
            json.dumps([{"tag": t, "text": s} for t, s in p.marks],
                       ensure_ascii=False),
            p.vol, p.page, p.row, p.col, p.juan, p.section, p.src_human(),
            p.raw_text, json.dumps(p.unparsed, ensure_ascii=False)))
        for i, s in enumerate(p.spouses):
            c.execute("INSERT INTO spouse VALUES(?,?,?,?,?,?,?)",
                      (p.pid, i, s.rel, s.name_raw,
                       s.birth.text if s.birth else "",
                       s.death.text if s.death else "",
                       s.burial.text if s.burial else ""))
        for i, nm in enumerate(p.sons_claimed):
            c.execute("INSERT INTO child_claim VALUES(?,?,?,?)", (p.pid, i, nm, "子"))
        for i, nm in enumerate(p.daughters_claimed):
            c.execute("INSERT INTO child_claim VALUES(?,?,?,?)", (p.pid, i, nm, "女"))
    for e in edges:
        c.execute("INSERT INTO edge VALUES(" + ",".join("?" * 11) + ")",
                  (e["child"], e["child_name"], e["parent"], e["parent_name"],
                   e["kind"], e["evidence"], e["rank"], e["evidence_cn"],
                   e["matched_as"], e["child_src"], e["parent_src"]))
    for p in people:
        for a, w in p.aliases:
            c.execute("INSERT INTO alias VALUES(?,?,?)", (p.pid, a, w))
    for s in segs:
        if s.kind == "residue":
            h = s.head
            c.execute("INSERT INTO residue VALUES(?,?,?,?,?)",
                      (s.seg_id, h.vol, h.page, h.row, s.text))
    con.commit(); con.close()


def csv_dump(path: Path, rows, cols):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main(src="jsonl", out="out2"):
    src, out = Path(src), Path(out)
    out.mkdir(parents=True, exist_ok=True)

    segs, ptr, seg_stats = segment_all(src)
    print("[1/5] 切分完成，字符守恒断言通过")
    for v, s in seg_stats.items():
        print(f"      {v}: 源字符 {s['src_chars']:>6}  段 {s['segments']:>5}"
              f"  人物 {s['person']:>4}  残片 {s['residue']}")

    people = extract_all(segs, ptr)
    print(f"[2/5] 字段抽取完成，行数守恒断言通过 —— 人物 {len(people)}")

    edges, unmatched = link(people)
    ad_links = adoption.collect(people)
    ad_edges = add_adoption_edges(people, ad_links)
    edges = edges + ad_edges
    st = Counter(e["evidence_cn"] for e in edges)
    multi = sum(1 for p in people if len(p.parent_candidates) > 1)
    print(f"[3/5] 建边完成 —— 全部父边 {len(edges)}（过继语句 {len(ad_links)}）")
    for k, v in st.most_common():
        print(f"      {k}: {v}")
    print(f"      有多条父边（分叉）的人: {multi}")
    print(f"      查无父名条目: {len(unmatched)}")

    checks = cross_check(people)
    print(f"[4/5] 核对疑点 {len(checks)}")
    for k, v in Counter(c["type"] for c in checks).most_common():
        print(f"      {k}: {v}")

    write_db(people, edges, segs, out / "genealogy.db")
    (out / "people.json").write_text(
        json.dumps([to_dict(p) for p in people], ensure_ascii=False),
        encoding="utf-8")
    (out / "adoption.json").write_text(
        json.dumps(ad_links, ensure_ascii=False, indent=1), encoding="utf-8")

    csv_dump(out / "02_全部父边.csv", edges,
             ["child_name", "parent_name", "kind", "evidence_cn", "rank",
              "matched_as", "child_src", "parent_src", "child", "parent"])
    csv_dump(out / "02b_查无父名条目.csv", unmatched,
             ["name", "gen", "father_name", "filiation", "father_src",
              "reason", "src", "pid"])
    csv_dump(out / "02c_多条父边的人.csv",
             [{"name": p.name, "gen": p.gen, "father_name": p.father_name,
               "n": len(p.parent_candidates), "src": p.src_human(),
               "candidates": " ; ".join(
                   f"{e['parent_name']}({e['evidence_cn']}·{e['parent_src']})"
                   for e in p.parent_candidates)}
              for p in people if len(p.parent_candidates) > 1],
             ["name", "gen", "father_name", "n", "candidates", "src"])
    csv_dump(out / "03_核对疑点.csv", checks, ["type", "name", "src", "detail"])
    csv_dump(out / "05_别名索引.csv",
             [{"pid": p.pid, "name": p.name, "form": a, "why": w,
               "src": p.src_human()} for p in people for a, w in p.aliases],
             ["form", "why", "name", "src", "pid"])
    csv_dump(out / "04_未归属文本.csv",
             [{"pid": p.pid, "name": p.name, "src": p.src_human(),
               "page": u["page"], "tagged": u["tagged"], "text": u["text"]}
              for p in people for u in p.unparsed if u["text"].strip()],
             ["pid", "name", "src", "page", "tagged", "text"])

    total_src = sum(s["src_chars"] for s in seg_stats.values())
    lines = [
        "# 完整性审计", "",
        "## G1 字符守恒", "",
        f"源字符总数 **{total_src}**，切分后各段字符之和与之相等，",
        "否则 `segment.py` 会抛异常并中止流程。本次通过。", "",
        "## G3 行数守恒", "",
        "每个人物段内的每一行，都被指派给某个字段或 `unparsed`；",
        "`fields.py` 逐段断言，不等即中止。本次通过。", "",
        "## 分册", "",
        "| 册 | 源字符 | 行 | 段 | 人物 | 残片 |", "|---|---|---|---|---|---|",
    ]
    for v, s in seg_stats.items():
        lines.append(f"| {v} | {s['src_chars']} | {s['lines']} | "
                     f"{s['segments']} | {s['person']} | {s['residue']} |")
    lines += ["", "## 建边依据分布", "", "| 依据 | 数量 |", "|---|---|"]
    for k, v in st.most_common():
        lines.append(f"| {k} | {v} |")
    lines += ["", f"有多条父边（分叉）的人：**{multi}**",
              f"父名在谱中查无此条目：**{len(unmatched)}**", "",
              "所有边一律保留，各带依据等级。不择一。", ""]
    (out / "01_完整性审计.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"[5/5] 已写出 {out}/")
    return people, edges, unmatched, checks


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "jsonl",
         sys.argv[2] if len(sys.argv) > 2 else "out2")
