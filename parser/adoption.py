"""
过继语句抽取。

凡例明文规定过继要双记：嗣父名下写「嗣子某」，
生父名下注「第几子某出承与某为嗣」，理由是「不忘所自出」。
所以这两条边都在原文里写着，不需要推断——照抄即可。

抽出来的每一条都带原句。连边同样只在唯一确定时进行。
"""
from __future__ import annotations

import re

from .link import norm

# 「立朝相次子啟昌为嗣」「立胞弟长子光星为嗣」「立堂弟壁然次子继源为嗣」
# 「立房伯伯铣治五子泽渚为嗣」「立胞姪楚蘭之子希仲承嗣」
RE_ESTABLISH = re.compile(
    r"立(?P<rel>胞|堂|亲|房)?(?P<kin>弟|兄|姪|侄|伯伯|叔)?"
    r"(?P<father>[\u4e00-\u9fa5]{0,3}?)公?"
    r"(?P<ord>[长次三四五六七八九十幼])?子?"
    r"(?P<child>[\u4e00-\u9fa5]{2})"
    r"(?:为|承)(?:嗣|祠)")

# 「长子光星出嗣五兄梁栉」「幼子朝纪出祠梦楚」「次子铣茂出嗣二弟士雄」
RE_OUT = re.compile(
    r"(?P<ord>[长次三四五六七八九十幼])子(?P<child>[\u4e00-\u9fa5]{2})"
    r"出(?:嗣|祠)(?:[一二三四五六七八九十])?(?:兄|弟|叔|伯)?"
    r"(?P<dest>[\u4e00-\u9fa5]{2})?")


def collect(people):
    """扫描全部原文，抽出过继语句。只抽，不判断。"""
    links = []
    for p in people:
        for m in RE_ESTABLISH.finditer(p.raw_text):
            links.append({
                "kind": "立嗣",
                "sentence": m.group(0),
                "heir_father_pid": p.pid,
                "heir_father_name": p.name,
                "birth_father_name": norm(m.group("father") or ""),
                "child_name": norm(m.group("child")),
                "ordinal": m.group("ord") or "",
                "src": p.src_human(),
            })
        for m in RE_OUT.finditer(p.raw_text):
            links.append({
                "kind": "出嗣",
                "sentence": m.group(0),
                "birth_father_pid": p.pid,
                "birth_father_name": p.name,
                "heir_father_name": norm(m.group("dest") or ""),
                "child_name": norm(m.group("child")),
                "ordinal": m.group("ord"),
                "src": p.src_human(),
            })
    return links


def apply(people, links):
    """
    把过继边接上，同样只在唯一确定时接。
    一个孩子若有多个同名候选，全部记进 candidates，不择一。
    """
    by_name = {}
    for p in people:
        by_name.setdefault(p.name, []).append(p)

    applied, deferred = 0, []
    for lk in links:
        cands = by_name.get(lk["child_name"], [])
        if len(cands) != 1:
            lk["resolution"] = f"child_ambiguous({len(cands)})"
            deferred.append(lk)
            continue
        child = cands[0]
        lk["child_pid"] = child.pid

        if lk["kind"] == "立嗣":
            if child.heir_father_pid in (None, lk["heir_father_pid"]):
                child.heir_father_pid = lk["heir_father_pid"]
            bf = lk["birth_father_name"]
            if bf:
                bcands = by_name.get(bf, [])
                if len(bcands) == 1 and not child.father_pid:
                    child.father_pid = bcands[0].pid
                    child.link_status = "adoption_stated"
                    applied += 1
                elif len(bcands) > 1:
                    child.father_candidates = [c.pid for c in bcands]
                    lk["resolution"] = f"birth_father_ambiguous({len(bcands)})"
                    deferred.append(lk)
        else:  # 出嗣
            if not child.father_pid:
                child.father_pid = lk["birth_father_pid"]
                child.link_status = child.link_status or "adoption_stated"
                applied += 1
            hf = lk["heir_father_name"]
            if hf:
                hcands = by_name.get(hf, [])
                if len(hcands) == 1 and not child.heir_father_pid:
                    child.heir_father_pid = hcands[0].pid
        lk.setdefault("resolution", "applied")
    return applied, deferred
