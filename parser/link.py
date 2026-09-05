"""
建边。**全边模型。**

上一版还留着一个隐含的取舍：只有「确定」的才连边，不确定的干脆不连。
那等于把不确定的部分从图里抹掉，还是一种删。

这一版改成：**凡是文本支持的边，全部记下来，每条边附上它的依据。**
两个同名候选就记两条边，三个就记三条。哪条是真的不由程序说了算，
由看的人对着原文判。

依据分五级，只排序，不筛除：

  E1 claim_named     父亲的「生子」列表点名了本人
  E2 sole_homonym    全谱同名只有这一个
  E3 stated_adopt    过继语句原句写明（立…为嗣 / …出嗣…）
  E4 honorific       去掉敬称「公」后同名
  E5 homonym_one_of  多个同名候选之一

E4 说明：谱里有 45 个人的条目标题写作「锡 公」「懋 公」「林 公」，
父亲的生子名单里却只写「锡」「懋」「林」。这是同一个人的两种写法。
两种写法都进索引，搜哪个都找得到，边也照建，只是标明依据是去敬称。
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from collections import defaultdict

# ★ 繁简／异体折叠表——**全站只有这一张**：data/字表.json。
#   由 tools/build_variants.py 生成（Windows LCMapStringEx + 谱内实测异写）。
#   TS 那边（src/core/norm.ts 的 loadTables）读的是同一个文件同一个键。
#
#   早先这里手写了 19 条，与 TS 那张不一致：
#     馀→余  Python 折、TS 不折　　彥→彦  TS 折、Python 不折
#   壁馀（册3 p186）因此丢了父边：光表名单里写「壁馀」，
#   TS 折不到「壁余」，两个字符串永远对不上。
_VP = Path(__file__).resolve().parent.parent / "data" / "字表.json"
VARIANTS: dict = (json.loads(_VP.read_text(encoding="utf-8"))["繁简异体"]["表"]
                  if _VP.exists() else {})

EVIDENCE_RANK = {"claim_named": 1, "sole_homonym": 2, "stated_adopt": 3,
                 "honorific": 4, "homonym_one_of": 5}
EVIDENCE_CN = {"claim_named": "父亲的生子列表点名本人",
               "sole_homonym": "全谱同名唯一",
               "stated_adopt": "过继语句原文写明",
               "honorific": "去敬称「公」后同名",
               "homonym_one_of": "多个同名候选之一"}


def norm(s: str) -> str:
    s = re.sub(r"[\s　]+", "", (s or "").strip())
    return "".join(VARIANTS.get(c, c) for c in s)


def alias_forms(p):
    """一个人可以被叫的所有名字，连同这个叫法的来源。全部进索引。"""
    out = [(norm(p.name_raw), "谱名")]
    n = out[0][0]
    if n.endswith("公") and len(n) > 1:
        out.append((n[:-1], "谱名去敬称"))
    for attr, label in (("zi", "字"), ("hui", "讳"), ("hao", "号"), ("ming", "名")):
        v = getattr(p, attr, None)
        if v and v.text:
            out.append((norm(v.text), label))
    seen, uniq = set(), []
    for form, why in out:
        if form and form not in seen:
            seen.add(form)
            uniq.append((form, why))
    return uniq


def build_index(people):
    idx = defaultdict(list)
    for p in people:
        p.name = norm(p.name_raw)
        p.aliases = alias_forms(p)
        for form, why in p.aliases:
            idx[form].append((p, why))
    return idx


def link(people):
    """产出全部父边。返回 (edges, unmatched)。一个人可有多条，不合并。"""
    idx = build_index(people)
    claim = defaultdict(list)
    for f in people:
        for nm in f.sons_claimed:
            claim[norm(nm)].append(f)

    edges, unmatched = [], []
    for p in people:
        p.parent_candidates = []
        if not p.father_name:
            unmatched.append({"pid": p.pid, "name": p.name, "gen": p.gen,
                              "father_name": "", "filiation": "",
                              "father_src": "", "reason": "谱上未写父名",
                              "src": p.src_human()})
            continue

        fname = norm(p.father_name)
        hits = list(idx.get(fname, []))
        if not hits and fname.endswith("公"):
            hits = list(idx.get(fname[:-1], []))

        claimers = set()
        for form, _ in p.aliases:
            for f in claim.get(form, []):
                if fname in {a for a, _ in f.aliases}:
                    claimers.add(f.pid)

        for f, alias_why in hits:
            if f.pid == p.pid:
                continue
            if f.pid in claimers:
                ev = "claim_named"
            elif alias_why == "谱名去敬称":
                ev = "honorific"
            elif len(hits) == 1:
                ev = "sole_homonym"
            else:
                ev = "homonym_one_of"
            e = {"child": p.pid, "child_name": p.name,
                 "parent": f.pid, "parent_name": f.name,
                 "kind": "嗣父" if p.is_heir else "生父",
                 "evidence": ev, "rank": EVIDENCE_RANK[ev],
                 "evidence_cn": EVIDENCE_CN[ev],
                 "matched_as": f"{p.father_name} ≈ {f.name_raw}（{alias_why}）",
                 "child_src": p.src_human(), "parent_src": f.src_human()}
            edges.append(e)
            p.parent_candidates.append(e)

        if not hits:
            unmatched.append({
                "pid": p.pid, "name": p.name, "gen": p.gen,
                "father_name": p.father_name, "filiation": p.filiation,
                "father_src": p.father_src,
                "reason": f"「{p.father_name}」在谱中查无此名",
                "src": p.src_human()})

    for p in people:
        p.parent_candidates.sort(key=lambda e: e["rank"])
    return edges, unmatched


def add_adoption_edges(people, links):
    """过继语句给出的边，同样全记，标 stated_adopt。"""
    idx = build_index(people)
    out = []
    for lk in links:
        for child, _ in idx.get(lk["child_name"], []):
            pairs = []
            if lk["kind"] == "立嗣":
                if lk.get("birth_father_name"):
                    pairs += [(n, "生父") for n, _ in
                              idx.get(lk["birth_father_name"], [])]
                pairs.append((lk.get("heir_father_pid"), "嗣父"))
            else:
                pairs.append((lk.get("birth_father_pid"), "生父"))
                if lk.get("heir_father_name"):
                    pairs += [(n, "嗣父") for n, _ in
                              idx.get(lk["heir_father_name"], [])]
            for par, kind in pairs:
                if par is None:
                    continue
                pid = par if isinstance(par, str) else par.pid
                pname = "" if isinstance(par, str) else par.name
                out.append({
                    "child": child.pid, "child_name": child.name,
                    "parent": pid, "parent_name": pname,
                    "kind": kind, "evidence": "stated_adopt",
                    "rank": EVIDENCE_RANK["stated_adopt"],
                    "evidence_cn": EVIDENCE_CN["stated_adopt"],
                    "matched_as": lk["sentence"],
                    "child_src": child.src_human(), "parent_src": lk["src"]})

    by_child = defaultdict(list)
    for e in out:
        by_child[e["child"]].append(e)
    for p in people:
        for e in by_child.get(p.pid, []):
            if not any(x["parent"] == e["parent"] and x["kind"] == e["kind"]
                       for x in p.parent_candidates):
                p.parent_candidates.append(e)
        p.parent_candidates.sort(key=lambda e: e["rank"])
    return out


# ---------------------------------------------------------------- 上溯

def walk_up(people, pid, kind_pref="生父", max_depth=40):
    """向上追溯。**遇到多条父边全部展开，不选。** 返回一棵树。"""
    idx = {p.pid: p for p in people}

    def node(cur, depth, seen):
        p = idx.get(cur)
        if not p or depth > max_depth or cur in seen:
            return None
        seen2 = seen | {cur}
        prefer = [e for e in p.parent_candidates if e["kind"] == kind_pref]
        use = prefer or p.parent_candidates
        return {"pid": p.pid, "name": p.name, "gen": p.gen,
                "zi": p.zi.text if p.zi else "",
                "father_name": p.father_name, "filiation": p.filiation,
                "src": p.src_human(),
                "parents": [{"evidence": e["evidence_cn"], "rank": e["rank"],
                             "kind": e["kind"], "matched_as": e["matched_as"],
                             "node": node(e["parent"], depth + 1, seen2)}
                            for e in use]}
    return node(pid, 0, frozenset())


def _gen_ok(path):
    """
    世次单调：父亲必须正好高一世。
    这不是猜测——世次是原书自己用「第一世…第五世」这类世代列头标死的，
    不满足的路径在结构上就不可能成立。标出来，但不删。
    """
    gs = [n["gen"] for n in path if n and n.get("gen") is not None]
    return all(a - b == 1 for a, b in zip(gs, gs[1:])) if len(gs) > 1 else True


def flatten_paths(tree, path=None, evid=None):
    """
    把上溯树摊成一条条完整路径。**一条都不删。**
    每条带三个标：沿途最弱依据等级、是否世次单调、长度。
    """
    path = (path or []) + [tree]
    evid = evid or []

    def pack(pth, ev):
        return {"path": pth, "names": [n["name"] for n in pth if n],
                "weakest": max(ev) if ev else 0, "evidence": ev,
                "gen_consistent": _gen_ok(pth), "length": len(pth)}

    if not tree or not tree.get("parents"):
        return [pack(path, evid)]
    out = []
    for pe in tree["parents"]:
        if pe["node"]:
            out += flatten_paths(pe["node"], path, evid + [pe["rank"]])
        else:
            out.append(pack(path, evid))
    return out


def rank_paths(paths):
    """
    排序：先世次单调的，再依据强的，再长的。**只排序，不筛。**
    """
    return sorted(paths, key=lambda x: (not x["gen_consistent"],
                                        x["weakest"], -x["length"]))


# ---------------------------------------------------------------- 核对

def cross_check(people):
    """只记录，不修改，不筛。"""
    idx = {p.pid: p for p in people}
    out = []
    linked = defaultdict(set)
    for p in people:
        for e in p.parent_candidates:
            for a, _ in p.aliases:
                linked[e["parent"]].add(a)

    for f in people:
        for nm in f.sons_claimed:
            if norm(nm) not in linked.get(f.pid, set()):
                out.append({"type": "父亲声明的儿子，谱中无条目指回",
                            "name": norm(nm), "src": f.src_human(),
                            "detail": f"{f.name}声明生子「{nm}」"})
    for p in people:
        for e in p.parent_candidates:
            f = idx.get(e["parent"])
            if f and p.gen and f.gen and p.gen - f.gen != 1:
                out.append({"type": "世次差不等于 1", "name": p.name,
                            "src": p.src_human(),
                            "detail": f"{f.name}({f.gen}世) → {p.name}({p.gen}世)"
                                      f"，依据：{e['evidence_cn']}"})
    return out
