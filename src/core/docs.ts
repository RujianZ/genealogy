/**
 * 卷首文献检索。57 篇、42,413 字——序、凡例、家规、山图题记、各房私山、
 * 合户雜据、三十六户地址、八派图、甲子録。
 *
 * 和人名搜索分开，因为性质不同：
 *   人名是**短串精确比对**（三个字以内，要同音、要繁简、要编辑距离）
 *   文献是**长文里找一段**（要给上下文，要能定位到页）
 *
 * 《甲子録》单独处理：18,969 字的年号对照表，一张查询表而不是文章。
 * 混进全文检索，搜任何年号都会被它淹掉——所以它单独一档，排在最后。
 */
import type { ShouDoc } from './places.ts';
import { norm } from './norm.ts';

export interface DocHit {
  doc: ShouDoc;
  /** 命中处，全部列出，不截断 */
  spots: { pos: number; snippet: string; before: string; hit: string; after: string }[];
  isTable: boolean;    // 甲子録／年代表这类查询表
}

/** 这几篇是查询表，不是文章 */
const TABLES = ['甲子録', '明朝年代表', '清朝年代表'];

export function isTable(d: ShouDoc): boolean {
  return TABLES.some(t => d.title.includes(t)) || d.title.length > 20;
}

/**
 * 全文检索。命中处**全部返回**，一篇里有几处就给几处。
 * 繁简都能搜——查询和正文都过一遍 norm。
 */
export function searchDocs(docs: ShouDoc[], query: string, ctx = 26): DocHit[] {
  const q = norm(query);
  if (!q) return [];
  const out: DocHit[] = [];

  for (const d of docs) {
    // 原文和归一后的文本要一一对应，才能用归一后的下标去原文里取上下文。
    // norm 只做繁简替换和去空白，是逐字映射——先把空白位置记下来。
    const chars = [...d.text];
    const keep: number[] = [];
    let flat = '';
    for (let i = 0; i < chars.length; i++) {
      if (/\s|　/.test(chars[i])) continue;
      flat += norm(chars[i]);
      keep.push(i);
    }
    const spots: DocHit['spots'] = [];
    let from = 0;
    for (;;) {
      const i = flat.indexOf(q, from);
      if (i < 0) break;
      const a = keep[Math.max(0, i - ctx)];
      const s = keep[i];
      const e = keep[Math.min(keep.length - 1, i + q.length - 1)];
      const b = keep[Math.min(keep.length - 1, i + q.length - 1 + ctx)];
      spots.push({
        pos: i,
        before: d.text.slice(a, s).replace(/\s+/g, ''),
        hit: d.text.slice(s, e + 1).replace(/\s+/g, ''),
        after: d.text.slice(e + 1, b + 1).replace(/\s+/g, ''),
        snippet: d.text.slice(a, b + 1).replace(/\s+/g, ''),
      });
      from = i + q.length;
    }
    if (spots.length) out.push({ doc: d, spots, isTable: isTable(d) });
  }

  // 文章在前，查询表在后（甲子録一搜年号就是几百处，不能压住正文）
  out.sort((a, b) => Number(a.isTable) - Number(b.isTable)
    || b.spots.length - a.spots.length
    || (a.doc.page_from ?? 0) - (b.doc.page_from ?? 0));
  return out;
}

/** 《甲子録》按年号查一行——这才是它该有的用法，不是全文检索。 */
export function lookupEra(docs: ShouDoc[], era: string): string[] {
  const t = docs.find(d => d.title.includes('甲子録'));
  if (!t) return [];
  const q = norm(era);
  return t.text.split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l && norm(l).includes(q));
}
