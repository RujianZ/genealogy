"""
疑点清单：全谱所有「谱上没说清」的地方，一次列全。

**这是这个项目最该有的一页。** 前人修谱的准则写在历代序里：

    不缘情而增，不故意而减
    纪其所可知，阙其所未知

「阙其所未知」——不知道的就空着。那就得有个地方把「空着的」都列出来，
不然「阙」就变成了「看不见」。

分五类，每一类都说清**是什么没说清**：

  A 同名分不清    父名同名多个，用谱自己的规矩（世次、生年、生子名单）都排不掉
  B 往上断了      谱上写了父名，但谱里没有他单独的一条
  C 谱上没写父名  连父名都没有
  D 生卒查不出    有生卒原文，但《甲子録》里查不到那个写法
  E 修谱名目对不上 历届名目里的人，在世系里找不到 / 找到多个

只统计和列出，**不改任何数据、不做任何判断**。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, "tools")
from check_homonym_years import year_of  # noqa: E402

NS = lambda s: "".join((s or "").split()).replace("　", "")
PID = re.compile(r"^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$")


def coord(pid):
    m = PID.match(pid)
    return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None


def layout_note(child, father):
    a, b = coord(child["pid"]), coord(father["pid"])
    if not a or not b:
        return ""
    same = child["src"]["section"] == father["src"]["section"]
    if a[2] - b[2] == 1 and a[0] == b[0] and same and b[1] <= a[1]:
        return "同一页的上一代" if a[1] == b[1] else f"同一房，前面第 {b[1]} 页"
    if a[2] == 1 and b[2] == 5:
        return "接在上一段末代"
    return "同一房，但版面位置对不上" if same else f"在另一房「{father['src']['section']}」"


def main() -> None:
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    idx = {p["pid"]: p for p in people}
    for p in people:
        p["_y"] = year_of((p.get("birth") or {}).get("text"))[0]

    # 反向匹配（跟 src/core/backlink.ts 一样的规矩），先把能接的接上
    claims: dict[str, list] = {}
    for f in people:
        for son in f.get("sons_claimed") or []:
            claims.setdefault(NS(son), []).append(f)
    back: dict[str, list] = {}
    for p in people:
        if p["parent_edges"] or not p["father_name"]:
            continue
        forms = {NS(p["name"])} | {NS(a["form"]) for a in p["aliases"]}
        got = []
        for form in forms:
            for f in claims.get(form, []):
                if f["pid"] != p["pid"] and f["gen"] is not None \
                        and p["gen"] - f["gen"] == 1 and f not in got:
                    got.append(f)
        if got:
            back[p["pid"]] = got

    out = {"A同名分不清": [], "B往上断了": [], "C没写父名": [],
           "D生年查不出": [], "E修谱名目对不上": []}

    for p in people:
        edges = p["parent_edges"]
        if not edges and p["pid"] in back:
            edges = [{"parent": f["pid"], "parent_name": f["name"], "kind": "生父",
                      "evidence": "claim_named"} for f in back[p["pid"]]]

        if edges:
            # 三条客观排除（跟 candidates.ts 一致）
            named = {}
            for e in edges:
                if e["evidence"] == "claim_named":
                    named[e["kind"]] = named.get(e["kind"], 0) + 1
            keep = []
            for e in edges:
                f = idx.get(e["parent"])
                if not f or f["gen"] is None or p["gen"] - f["gen"] != 1:
                    continue
                if named.get(e["kind"]) == 1 and e["evidence"] != "claim_named":
                    continue
                cy, fy = p["_y"], f["_y"]
                if cy and fy and not (13 <= cy - fy <= 75):
                    continue
                keep.append((e, f))
            by_kind: dict[str, set] = {}
            for e, f in keep:
                by_kind.setdefault(e["kind"], set()).add(e["parent"])
            worst = max((len(v) for v in by_kind.values()), default=0)
            if worst > 1:
                kind = next(k for k, v in by_kind.items() if len(v) == worst)
                out["A同名分不清"].append({
                    "pid": p["pid"], "name": p["name"], "gen": p["gen"],
                    "src_human": p["src_human"], "father_name": p["father_name"],
                    "filiation": p["filiation"], "kind": kind,
                    "birth": (p.get("birth") or {}).get("text"),
                    "cands": [{
                        "pid": f["pid"], "name": f["name"], "src_human": f["src_human"],
                        "kind": e["kind"], "birth": (f.get("birth") or {}).get("text"),
                        "year": f["_y"], "layout": layout_note(p, f),
                        "sons": f.get("sons_claimed") or [],
                    } for e, f in keep if e["kind"] == kind],
                })
        elif p["father_name"]:
            out["B往上断了"].append({
                "pid": p["pid"], "name": p["name"], "gen": p["gen"],
                "src_human": p["src_human"], "father_name": p["father_name"],
                "filiation": p["filiation"], "father_src": p["father_src"],
            })
        elif p["gen"] != 1:
            out["C没写父名"].append({
                "pid": p["pid"], "name": p["name"], "gen": p["gen"],
                "src_human": p["src_human"],
            })

        bt = (p.get("birth") or {}).get("text")
        if bt and p["_y"] is None:
            out["D生年查不出"].append({
                "pid": p["pid"], "name": p["name"], "gen": p["gen"],
                "src_human": p["src_human"], "birth": bt,
                "why": year_of(bt)[1],
            })

    rev = json.loads(Path("data/revisions.json").read_text(encoding="utf-8"))
    for r in rev:
        for m in r["members"]:
            if m.get("pid"):
                continue
            out["E修谱名目对不上"].append({
                "era": r["era"], "raw": m["raw"], "name": m.get("name"),
                "why": m.get("match", "没找到"),
                "cands": m.get("candidates") or [],
            })

    Path("data/doubts.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    print("疑点清单　data/doubts.json\n")
    for k, v in out.items():
        print(f"  {len(v):>5}　{k}")
    print(f"\n  合计 {sum(len(v) for v in out.values())} 条")

    print("\n── A 同名分不清，头 5 条 ──")
    for x in out["A同名分不清"][:5]:
        print(f"\n第{x['gen']}世 {x['name']}　{x['src_human']}")
        print(f"   谱上写父名「{x['father_name']}」{x['filiation']}，分不出哪个是{x['kind']}")
        for c in x["cands"]:
            print(f"     · {c['name']}　{c['src_human']}　{c['layout']}"
                  + (f"　生{c['year']}" if c["year"] else "　生年不详"))


if __name__ == "__main__":
    main()
