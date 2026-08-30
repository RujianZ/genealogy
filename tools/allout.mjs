/**
 * 「所有候选都被排掉」的人——谱上写了父名、也有候选，可一条都没留下。
 *
 * ★ 承健的先验：「几乎没有人是绝对孤点——一个名字，上没父母下没孩子。
 *   既然没有绝对孤点，那大部分人都能做对，这是工程问题。」
 *
 *   查下来他是对的。我原先数出「31 个孤点」，其中大半根本不是孤点：
 *       梁香　父名「泽富四子」　候选 2 条
 *       光燕　父名「梁桂次子」　候选 3 条
 *   有父名、有候选，只是**全被排掉了**。
 *
 *   界面上他们不是空的（kept() 有兜底，全排掉时把全部退回来，各自标明理由），
 *   但「全部候选都不成立」这件事本身就是个信号：
 *   要么谱上真有矛盾，要么是我们的规则排错了。
 *
 * ★ 按排除理由分类。今天已经证明过五次：
 *   **弱规则盖过谱的原话**是最常见的错法。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { roster } from '../src/core/roster.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const all = people.filter(p => !isFragment(p));
const DOC = (p) => {
  const n = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 }[p.src?.juan ?? ''] ?? 0;
  return n >= 8 ? '合三（8、9）' : n >= 5 ? '合二（5、6、7）' : '合一（1.2.3.4）';
};

const out = [];
for (const p of all) {
  const cs = candidates(idx, p, chart, win);
  if (!cs.length) continue;
  if (cs.some(c => c.status === 'ok')) continue;
  out.push({ p, cs });
}
const byWhy = {};
for (const { cs } of out) for (const s of new Set(cs.map(c => c.status)))
  byWhy[s] = (byWhy[s] ?? 0) + 1;

console.log('═'.repeat(72));
console.log(`所有候选都被排掉的人：${out.length} 人`);
console.log('（界面上仍然全部摆出来并标明理由——人没被抹掉，但这是个信号）');
console.log('');
console.log('按排除理由分（一个人可能占好几条）：');
for (const [k, v] of Object.entries(byWhy).sort((a, b) => b[1] - a[1])) {
  const n = { gen: '世次差不为1', age: '年代不可能', named: '父亲名单点的是别人',
    ord: '排行位置对不上', slot: '名额已被别人占', adopt: '谱写明立的是另一位',
    wrote: '本人写的父名不是他', sib: '兄弟都定成了另一位', seealso: '详前条只认自己写的那位' }[k] ?? k;
  console.log(`   ${String(v).padStart(3)} 人  ${k.padEnd(8)}${n}`);
}
console.log('═'.repeat(72));

for (const { p, cs } of out) {
  console.log(`\n── ${p.name}　第${p.gen}世　${p.src_human}　${windowNote(win.get(p.pid)) || '年代?'}`);
  console.log(`   谱写「${(p.father_name ?? '').replace(/[\s　]/g, '') || '空'}${p.filiation ?? ''}」`
    + `　书：source/${DOC(p)}.doc 第 ${p.src.page} 页`);
  for (const c of cs) {
    const f = idx.get(c.edge.parent);
    console.log(`   排[${c.status}] ${f?.name}（${f?.src.section.replace('公世系', '')}${f?.src.page}页${f?.src.row}行）`
      + ` ${c.edge.kind} rank${c.edge.rank}`
      + `　名单[${roster(f).sons.map(s => s.name || s.raw).join('、') || '空'}]`);
    if (c.note) console.log(`        ${c.note}`);
  }
}
