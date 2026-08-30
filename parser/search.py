"""
搜索。规矩只有一条：**匹配上的全部返回，不截断、不排除、不只给最像的。**

打分是确定性的、可解释的——每条结果都能说清「为什么它被匹配上」。
不用向量：人名两三个字没有语义可嵌，向量只能给个分数，说不出理由；
而且才两千多人，暴力比对是毫秒级。

匹配层级（分数只用于排序，低分照样返回）：

  1.00  某个称呼形式完全相同（谱名 / 字 / 讳 / 号 / 名 / 去敬称）
  0.90  字形归一后相同（銑=铣、璧=壁、啟=启）
  0.85  同音折叠后相同（翠/三/山、齐/祁）
  0.70  一方包含另一方
  0.60  编辑距离 1
  0.40  出现在原文任何位置（含配偶名、子女名、注记、传赞）
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .link import norm

# 黄梅话里常互换的音，全部从谱里实际的异写查出来
HOMOPHONE_GROUPS = [set("翠三山"), set("齐祁"), set("镕融容"), set("彦彥"),
                    set("蘭兰岚"), set("辉煇晖"), set("荣榮蓉")]


def homophone_key(s: str) -> str:
    out = []
    for ch in norm(s):
        for g in HOMOPHONE_GROUPS:
            if ch in g:
                out.append(sorted(g)[0]); break
        else:
            out.append(ch)
    return "".join(out)


def edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a or not b:
        return max(len(a), len(b))
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


@dataclass
class Hit:
    pid: str
    name: str
    gen: int | None
    zi: str
    score: float
    matched_on: str      # 命中的字段
    matched_text: str    # 命中的那个写法
    why: str             # 为什么算命中——一句人话
    src: str
    snippet: str = ""    # 原文里命中的那一小段


def search(people, query: str, include_fulltext: bool = True):
    """
    返回全部命中，按分数降序。**一条都不丢。**
    include_fulltext=True 时，连原文里出现过这个名字的人也返回
    （配偶、子女名单、传赞、注记里提到的都算），标成 0.40。
    """
    q = norm(query)
    if not q:
        return []
    qk = homophone_key(q)
    hits: list[Hit] = []

    for p in people:
        best: Hit | None = None
        for form, why in p.aliases:
            score, reason = 0.0, ""
            if form == q:
                score, reason = 1.00, f"{why}完全相同"
            elif homophone_key(form) == qk:
                score, reason = 0.85, f"{why}同音（{form}）"
            elif q and (q in form or form in q):
                score, reason = 0.70, f"{why}互相包含（{form}）"
            elif edit_distance(q, form) <= 1 and max(len(q), len(form)) >= 2:
                score, reason = 0.60, f"{why}差一字（{form}）"
            if score and (best is None or score > best.score):
                best = Hit(p.pid, p.name, p.gen, p.zi.text if p.zi else "",
                           score, why, form, reason, p.src_human())
        if best:
            hits.append(best)
            continue

        if include_fulltext and q in norm(p.raw_text):
            i = p.raw_text.find(query if query in p.raw_text else q[0])
            hits.append(Hit(
                p.pid, p.name, p.gen, p.zi.text if p.zi else "",
                0.40, "原文", q, "原文中出现（可能是配偶、子女或注记里提到）",
                p.src_human(),
                p.raw_text[max(0, i - 12):i + 28].replace("\n", "｜")))

    hits.sort(key=lambda h: (-h.score, h.gen or 99, h.pid))
    return hits


def search_documents(segments, query: str):
    """卷首那四万字散文的全文检索：序、凡例、家规、山图题记、私山、杂据。"""
    q = norm(query)
    out = []
    for s in segments:
        if s.kind != "document":
            continue
        t = s.text
        if q and q in norm(t):
            i = norm(t).find(q)
            out.append({"seg_id": s.seg_id, "vol": s.head.vol,
                        "page": s.head.page,
                        "snippet": t[max(0, i - 40):i + 80].replace("\n", " ")})
    return out


def relation(people, pid_a: str, pid_b: str):
    """
    两个人之间怎么称呼。全部可能的路径都算，不选一条。
    返回每条路径的共祖、双方各隔几代。
    """
    from .link import walk_up, flatten_paths
    idx = {p.pid: p for p in people}

    def ancestors(pid):
        out = {}
        for pth in flatten_paths(walk_up(people, pid)):
            for i, n in enumerate(pth["path"]):
                if n:
                    out.setdefault(n["pid"], set()).add(i)
        return out

    A, B = ancestors(pid_a), ancestors(pid_b)
    common = set(A) & set(B)
    res = []
    for c in common:
        for da in A[c]:
            for db in B[c]:
                res.append({"common_ancestor": idx[c].name,
                            "ancestor_pid": c,
                            "gen": idx[c].gen,
                            "up_from_a": da, "up_from_b": db,
                            "src": idx[c].src_human()})
    res.sort(key=lambda r: (r["up_from_a"] + r["up_from_b"]))
    return res
