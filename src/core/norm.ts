/**
 * 字形归一 + 同音折叠。翻译自 parser/link.py 的 norm() 与 parser/search.py。
 *
 * ★ 三张字表**全部来自 `data/字表.json`，代码里一条都不写死。**
 *   以前繁简表在 `src/core/variants.ts` 和 `data/variants.json` 各存一份、
 *   误字表和同音表只写在代码里——改一处另一处不动，同一个名字两边能折出
 *   不同的结果（馀/彥 就这么漂过一次）。表是**关於这部谱的事实**，
 *   事实归数据，代码只管怎么用它。
 *
 *   `makeRegistry()` 装载时调 `loadTables()` 灌进来。没灌之前三张表都是空的，
 *   `norm()` 就只去空格——**不会悄悄用一份过期的内置表**。
 */

type Tables = {
  繁简异体: { 表: Record<string, string>; 依据: Record<string, string> };
  排版误字: { 表: Record<string, string>; 依据: Record<string, string> };
  同音: { 组: { 字: string }[] };
};

export let VARIANTS: Record<string, string> = {};
export let VARIANT_SOURCE: Record<string, string> = {};
export let TYPOS: Record<string, string> = {};
export let TYPO_SOURCE: Record<string, string> = {};
let HOMOPHONE_GROUPS: Set<string>[] = [];

/** 装载三张字表。全站只调一次，在 `makeRegistry()` 里。 */
export function loadTables(t: Tables): void {
  VARIANTS = t.繁简异体?.表 ?? {};
  VARIANT_SOURCE = t.繁简异体?.依据 ?? {};
  TYPOS = t.排版误字?.表 ?? {};
  TYPO_SOURCE = t.排版误字?.依据 ?? {};
  HOMOPHONE_GROUPS = (t.同音?.组 ?? []).map(g => new Set([...g.字]));
}

/**
 * 去掉排版空格 + 繁简异体归一 + 已查实的排版误字。
 * **原文字段永远不经过这里，只用于比对。**
 */
export function norm(s: string): string {
  const t = (s ?? '').trim().replace(/[\s　]+/g, '');
  return [...t].map(c => TYPOS[c] ?? VARIANTS[c] ?? c).join('');
}

/** 这次匹配用到了哪些繁简折叠——界面上解释「为什么这两个写法算同一个」。 */
export function foldingsUsed(a: string, b: string): string[] {
  const out: string[] = [];
  for (const c of new Set([...a, ...b])) {
    if (TYPOS[c]) out.push(`${c}→${TYPOS[c]}（${TYPO_SOURCE[c]}）`);
    else if (VARIANTS[c]) out.push(`${c}→${VARIANTS[c]}（${VARIANT_SOURCE[c]}）`);
  }
  return out;
}

export function homophoneKey(s: string): string {
  return [...norm(s)].map(ch => {
    const g = HOMOPHONE_GROUPS.find(g => g.has(ch));
    return g ? [...g].sort()[0] : ch;
  }).join('');
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    }
    prev = cur;
  }
  return prev[b.length];
}
