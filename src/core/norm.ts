/** 字形归一 + 同音折叠。翻译自 parser/link.py 的 norm() 与 parser/search.py。 */
import { TRAD2SIMP, VARIANT_SOURCE } from './variants.ts';
// 排版误字，和繁简异体分开放，每条有依据。见 typos.ts。
import { TYPOS, TYPO_SOURCE } from './typos.ts';

/**
 * 繁简 + 异体归一表。94 条，自动生成，见 tools/build_variants.py。
 *
 * 上一版是手写的 18 条，有两个毛病：
 *   1. 漏字 —— 没有「適→适」，导致 300 多条「適陈」「長適孙」的女儿解析不出来。
 *   2. 有一半（壽 遷 驥 錫 鳳 餘 後 楨）在这部谱里根本没出现过，是想当然写的。
 * 现在改成 Windows 内核 LCMapStringEx 生成 + 谱内实证的异体字，每条有依据。
 */
export const VARIANTS = TRAD2SIMP;
export { VARIANT_SOURCE, TYPOS, TYPO_SOURCE };

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

/** 黄梅话里常互换的音。来源：parser/search.py HOMOPHONE_GROUPS */
const HOMOPHONE_GROUPS = ['翠三山', '齐祁', '镕融容', '彦彥', '蘭兰岚', '辉煇晖', '荣榮蓉']
  .map(g => new Set([...g]));

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
