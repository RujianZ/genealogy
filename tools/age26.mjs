/**
 * 26 条「谱两边都写明了、年代却兜不拢」——逐条摊开，供三边对照。
 * 打出：本人 / 父亲 的原文、算出来的年份、以及在哪个文件哪一页。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, canFather } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const raw = (p) => (p.raw_text ?? '').split('\n').filter(l => l.trim());
/** 卷几在哪个 .doc 里 */
const docOf = (p) => {
  const j = p.src?.juan ?? '';
  const n = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }[j] ?? 0;
  return n >= 8 ? '合三（8、9）.doc' : n >= 5 ? '合二（5、6、7）.doc' : '合一（1.2.3.4）.doc';
};

const rows = [];
for (const p of people) {
  if (isFragment(p)) continue;
  for (const c of candidates(idx, p, chart, win)) {
    if (c.conflict) rows.push({ p, c });
  }
}
// 按父亲分组——同一个父亲往往一次带好几个孩子
const byDad = new Map();
for (const r of rows) {
  const k = r.c.edge.parent;
  (byDad.get(k) ?? byDad.set(k, []).get(k)).push(r);
}
console.log(`一共 ${rows.length} 条，涉及 ${byDad.size} 位父亲\n`);

let i = 0;
for (const [pid, list] of [...byDad].sort((a, b) => b[1].length - a[1].length)) {
  const f = idx.get(pid);
  const wf = win.get(pid);
  console.log(`${'═'.repeat(72)}`);
  console.log(`【${++i}】父：${f.name}　${f.src_human}`);
  console.log(`     文件：source/${docOf(f)}　第 ${f.src.page} 页`);
  console.log(`     算出来：生 ${wf?.born ?? '?'}　殁 ${wf?.died ?? '?'}`);
  console.log(`     他的原文：`);
  for (const l of raw(f)) console.log(`        ${l}`);
  console.log(`     受影响的 ${list.length} 个孩子：`);
  for (const r of list) {
    const wc = win.get(r.p.pid);
    console.log(`        ${r.p.name}（第${r.p.gen}世 第${r.p.src.page}页）`
      + `生 ${wc?.born ?? '?'}　${r.c.conflict}`);
    console.log(`           ${raw(r.p).slice(0, 6).map(s => s.trim()).join(' ｜ ')}`);
  }
}
