"""
生成繁简对照表——只覆盖本谱实际出现过的字。

来源：Windows 内核的 LCMapStringEx（LCMAP_SIMPLIFIED_CHINESE）。
理由：零依赖、确定性、可逐条审计。不装 opencc，不联网。

**只用于比对，绝不用于显示。**
繁简是多对一（後/后→后、餘/余→余、乾/干→干），折叠之后信息就少了。
CLAUDE.md 第七节：不许改写任何原文字段。所以这张表只进搜索索引和建边比对，
界面上永远显示 name_raw 原样。

输出 src/core/variants.ts，附来源注释与全表，人能一条条看。
"""
from __future__ import annotations

import ctypes
import json
from ctypes import wintypes
from pathlib import Path

LOCALE_NAME = "zh-CN"
LCMAP_SIMPLIFIED_CHINESE = 0x02000000
LCMAP_TRADITIONAL_CHINESE = 0x04000000

_k32 = ctypes.WinDLL("kernel32", use_last_error=True)
_k32.LCMapStringEx.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPCWSTR, ctypes.c_int,
    wintypes.LPWSTR, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, wintypes.LPARAM,
]
_k32.LCMapStringEx.restype = ctypes.c_int


def lcmap(s: str, flags: int) -> str:
    buf = ctypes.create_unicode_buffer(len(s) * 4 + 8)
    n = _k32.LCMapStringEx(LOCALE_NAME, flags, s, len(s), buf, len(buf), None, None, 0)
    if n <= 0:
        raise ctypes.WinError(ctypes.get_last_error())
    return buf[:n]


def corpus_chars() -> set[str]:
    """全谱实际出现过的汉字：people.json 的原文字段 + 四册 JSONL"""
    chars: set[str] = set()
    people = json.loads(Path("data/people.json").read_text(encoding="utf-8"))
    for p in people:
        chars |= set(p["raw_text"])
        chars |= set(p["name_raw"]) | set(p["name"]) | set(p.get("father_name") or "")
        for a in p["aliases"]:
            chars |= set(a["form"])
    for f in Path("parser/jsonl").glob("*.jsonl"):
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                for c in json.loads(line)["cells"]:
                    chars |= set(c["text"])
    return {c for c in chars if "㐀" <= c <= "鿿"}


# ── 第二源：异体字与谱内混用 ──────────────────────────────────────
# Windows 的繁简表管不到这些：它们不是繁简关系，是异体字，或者是这部谱
# 自己把两个字当同一个字用。每一条都注明依据，不写没依据的。
NON_SC_VARIANTS = {
    "璧": ("壁", "谱内混用：第24世字辈「璧火／壁火」同一人两种写法"),
    "煇": ("辉", "异体字"),
    # 馀是餘的异体（正字），系统表不收：光表（册3 p178）名单写「壁馀」，
    # 而他本人那一条题作「壁馀」、归一后是「壁余」——不收就配不上。
    "餘": ("余", "繁简"),
    "馀": ("余", "异体：餘的正字，谱中混用"),
    "彛": ("彝", "异体字"),
    "於": ("于", "异体：谱中「於」多作介词或姓，与「于」通用"),
    "氿": ("氏", "字形讹写：「某氿」实为「某氏」"),
    "栢": ("柏", "异体字，且谱内混用：光林（23世）的过继两边各写一种——"
                 "生父梁森条作「幼子光林出嗣三弟梁**柏**」，"
                 "嗣父自己那条（册2·卷四·第322页）作「梁**栢**」「立胞长兄次子光林为嗣」。"
                 "不折叠则搜「梁柏」找不到梁栢"),
    "盆": ("盘", "谱内异写：形名「金盘托果 66／金盆托果 16／金盤托果 2」三种写法并存"),
    "匕": ("匕", "占位：谱中「匕」是重文号（同上），不是字，另行处理"),
}
# 「匕」不做映射，只登记；重文号要在解析层展开，不是折叠


def opencc_map(chars: list[str]) -> dict[str, str]:
    """第二源：OpenCC。t2s 是标准繁→简，覆盖异体字，比系统表宽。"""
    try:
        from opencc import OpenCC
    except ImportError:
        print("   （未安装 opencc-python-reimplemented，跳过第二源）")
        return {}
    out: dict[str, str] = {}
    for cfg in ("t2s", "tw2s", "hk2s"):
        try:
            cc = OpenCC(cfg)
        except Exception:
            continue
        for ch in chars:
            s = cc.convert(ch)
            if len(s) == 1 and s != ch:
                out.setdefault(ch, s)
    return out


def main() -> None:
    chars = sorted(corpus_chars())
    table: dict[str, str] = {}
    source: dict[str, str] = {}

    win: dict[str, str] = {}
    for ch in chars:
        try:
            simp = lcmap(ch, LCMAP_SIMPLIFIED_CHINESE)
        except OSError:
            continue
        if len(simp) == 1 and simp != ch:
            win[ch] = simp

    occ = opencc_map(chars)

    # ── 反向覆盖：用户会打繁体，而谱里写的可能是简体 ──────────────
    # 只对「谱里出现过的字」建表是不够的：谱写「华荣」，用户打「華榮」，
    # 「華」「榮」根本不在谱里，也就不在表里，于是搜不到。
    # 所以把谱中每个字的**繁体形式**也算出来，反向登记 繁→简。
    rev: dict[str, str] = {}
    # ★ 转换器必须在循环外建好。第一版写在循环里，2784 字 × 3 个配置
    #   = 8352 次实例化，直接把脚本跑超时了。
    s2t_cc = []
    try:
        from opencc import OpenCC
        for cfg in ("s2t", "s2tw", "s2hk"):
            try:
                s2t_cc.append(OpenCC(cfg))
            except Exception:
                pass
    except ImportError:
        pass
    for ch in chars:
        forms: set[str] = set()
        try:
            t = lcmap(ch, LCMAP_TRADITIONAL_CHINESE)
            if len(t) == 1:
                forms.add(t)
        except OSError:
            pass
        for cc in s2t_cc:
            t = cc.convert(ch)
            if len(t) == 1:
                forms.add(t)
        for t in forms:
            if t != ch and t not in win and t not in occ:
                rev[t] = ch
    print(f"=== 反向覆盖（谱中简体字的繁体写法）新增 {len(rev)} 条 ===")
    sample = list(sorted(rev.items()))[:12]
    print("   例：" + "  ".join(f"{t}→{s}" for t, s in sample))
    print()

    print("=== 两源交叉验证 ===")
    print(f"   Windows LCMapStringEx  {len(win)} 条")
    print(f"   OpenCC (t2s/tw2s/hk2s) {len(occ)} 条")
    only_win = set(win) - set(occ)
    only_occ = set(occ) - set(win)
    disagree = {c for c in set(win) & set(occ) if win[c] != occ[c]}
    print(f"   仅 Windows 有 {len(only_win)}: {''.join(sorted(only_win)) or '—'}")
    print(f"   仅 OpenCC  有 {len(only_occ)}: {''.join(sorted(only_occ)) or '—'}")
    if disagree:
        print(f"   ⚠ 两源结论不同 {len(disagree)} 条（下面逐条列出，需人工定）：")
        for c in sorted(disagree):
            print(f"      {c}：Windows→{win[c]}   OpenCC→{occ[c]}")
    else:
        print("   ✓ 交集部分两源结论完全一致")
    print()

    # 合并：两源都有且一致 → 双源确认；只有一源 → 标明单源
    for ch in sorted(set(win) | set(occ)):
        if ch in win and ch in occ and win[ch] == occ[ch]:
            table[ch] = win[ch]
            source[ch] = "双源确认（Windows + OpenCC）"
        elif ch in occ and ch not in win:
            table[ch] = occ[ch]
            source[ch] = "仅 OpenCC（异体字，系统表未收）"
        elif ch in win and ch not in occ:
            table[ch] = win[ch]
            source[ch] = "仅 Windows LCMapStringEx"
        else:
            # 两源冲突：暂取 OpenCC（专业词库），并在依据里写明冲突
            table[ch] = occ[ch]
            source[ch] = f"两源冲突，取 OpenCC（Windows 主张 {win[ch]}），待人工核"

    for t, s in rev.items():
        # ★ 反向覆盖不能造出环。
        #
        #   折叠表的用法是 fold(x)，比对两个名字要 fold(a)==fold(b)。
        #   一旦出现 A→B 且 B→A，fold 就不收敛：
        #       fold(「峰」)=「峯」，fold(「峯」)=「峰」——两边各自变成对方，仍然不等，
        #   同一个名字的两种写法**永远配不上**，正是这张表要解决的问题。
        #
        #   环是这么来的：正向源（Windows／OpenCC）已有 峯→峰；
        #   而反向覆盖对谱中的「峯」求繁体形式，某些转换器给回「峰」，
        #   於是又登记 峰→峯。正向那条是对的（繁→简），反向这条要丢掉。
        #
        #   2026-09-04 重跑本脚本时正是这样多出了 峰→峯、才→纔 两条，
        #   被 verify_all 的「折叠表收敛」「折一次和折两次结果一样」两条断言拦下。
        if table.get(s) == t or rev.get(s) == t:
            continue
        table.setdefault(t, s)
        source.setdefault(t, "反向覆盖：谱中写简体，用户可能打繁体")

    # 合并第二源，并核对该字是否真的在谱中出现
    print("=== 第二源：异体字／谱内混用 ===")
    for t, (s, why) in NON_SC_VARIANTS.items():
        if t == s:
            print(f"   {t}  跳过（{why}）")
            continue
        seen = "在谱中" if t in chars else "谱中未出现，仍收录以防后续版本"
        if t in table and table[t] != s:
            print(f"   ⚠ {t} 冲突：Windows 给 {table[t]}，本表给 {s} —— 以本表为准（{why}）")
        table[t] = s
        source[t] = why
        print(f"   {t} → {s}   {seen}   依据：{why}")
    print()

    # 反向核对：折叠是多对一，把撞在一起的组列出来，供人工审
    collide: dict[str, list[str]] = {}
    for trad, simp in table.items():
        collide.setdefault(simp, []).append(trad)
    for simp in list(collide):
        if simp in chars:
            collide[simp].append(simp + "（本身即简体）")
    merged = {k: v for k, v in collide.items() if len(v) > 1}

    # ═══ 全站唯一的一张字表：data/字表.json ═══
    #   以前这里写两份（src/core/variants.ts 给 TS，data/variants.json 给 Python），
    #   两份一漂就是两个答案——馀→余 Python 折、TS 不折；彥→彦 TS 折、Python 不折。
    #   壁馀（册3 p186）就是这么丢掉父边的。**现在只有一份，两边都读它。**
    #   排版误字和同音组是人写下的判断，不在这里生成，原样留着。
    zb = Path("data/字表.json")
    doc = json.loads(zb.read_text(encoding="utf-8"))
    doc["繁简异体"]["表"] = {t: table[t] for t in sorted(table)}
    doc["繁简异体"]["依据"] = {t: source[t] for t in sorted(table)}
    doc["繁简异体"]["撞组"] = {k: v for k, v in sorted(merged.items())}


    print(f"谱中出现的汉字 {len(chars)} 个")
    print(f"有繁简差异的 {len(table)} 个")
    print(f"折叠后撞组 {len(merged)} 组\n")

    print("=== 已知案例复验 ===")
    known = {"適": "适", "銑": "铣", "璧": "壁", "啟": "启", "蘭": "兰", "壽": "寿",
             "遷": "迁", "驥": "骥", "錫": "锡", "鳳": "凤", "餘": "余", "後": "后",
             "陸": "陆", "復": "复", "煇": "辉", "楨": "桢", "彛": "彝", "於": "于"}
    for t, want in known.items():
        got = table.get(t)
        mark = "✓" if got == want else ("✗ 得到 " + repr(got))
        print(f"   {t} → {want}   {mark}   {'（此字未在谱中出现）' if t not in chars else ''}")

    print("\n=== 折叠撞组（全部列出，人工审）===")
    for s, group in sorted(merged.items()):
        print(f"   {s} ← {' '.join(group)}")


    print(f"\n写入 {zb}　繁简异体 {len(table)} 条（排版误字、同音组原样保留）")
    zb.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
