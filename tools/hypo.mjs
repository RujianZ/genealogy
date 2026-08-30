/**
 * 承健提的四条，逐条拿数据测。
 *
 *   ① 有些人父母没写、孩子也没写 —— 就是孤点，那是**正常**，不是错。
 *   ② 有些人同时过继给好几位（兼祧）。
 *   ③ 生父可能完全没写，但**嗣父一定写了**——不然凭什么叫过继。
 *      所以「只有嗣父、没有生父」是**正常形态**，不该当缺陷。
 *   ④ 嗣子可能比嗣父年长——宗法只要求世次相当，不要求年龄。
 *      而这一条如果成立，又叠上「生父没写」，就可能有一批我们没测出来的情形。
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
const NS = (s) => (s ?? '').replace(/[\s　]/g, '');
const W = (p) => windowNote(win.get(p.pid)) || '年代不知道';

const KEEP = new Map(), KIDS = new Map();
for (const p of all) {
  const k = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  KEEP.set(p.pid, k);
  for (const c of k)
    (KIDS.get(c.edge.parent) ?? KIDS.set(c.edge.parent, []).get(c.edge.parent)).push({ child: p, edge: c.edge });
}
const kidsOf = (p) => KIDS.get(p.pid) ?? [];
const kind = (p, k) => (KEEP.get(p.pid) ?? []).filter(c => c.edge.kind === k);

// ① 孤点
const isolate = all.filter(p => p.gen !== 1
  && !(KEEP.get(p.pid) ?? []).length && !kidsOf(p).length && !roster(p).sons.length);
const noDadHasKid = all.filter(p => p.gen !== 1
  && !(KEEP.get(p.pid) ?? []).length && (kidsOf(p).length || roster(p).sons.length));

// ② 兼祧 / 多嗣父
const jian = all.filter(p => /兼祧/.test(NS(p.raw_text)));
const multiHeir = all.filter(p => kind(p, '嗣父').length > 1);

// ③ 只有嗣父、没有生父
const heirOnly = all.filter(p => kind(p, '嗣父').length && !kind(p, '生父').length);
const heirOnlyNoName = heirOnly.filter(p => !NS(p.father_name)
  || /嗣子|祧子|嗣男/.test(p.filiation ?? ''));

// ④ 嗣子比嗣父年长／同龄／年幼
const older = [], younger = [], unknown = [];
for (const p of all) {
  for (const c of kind(p, '嗣父')) {
    const f = idx.get(c.edge.parent);
    const a = win.get(p.pid)?.born, b = win.get(f?.pid)?.born;
    if (!a || !b) { unknown.push({ p, f }); continue; }
    (a <= b ? older : younger).push({ p, f, a, b });
  }
}

console.log('═'.repeat(72));
console.log('【① 孤点：父母没写、孩子也没写】');
console.log(`   完全孤立（无父、无子、名单也空）      ${isolate.length} 人`);
console.log(`   无父但有子（线只断在上面）            ${noDadHasKid.length} 人`);
console.log('   —— 这两种都不是错，是谱上就这么记的。');
console.log('');
console.log('【② 兼祧 / 挂着不止一位嗣父】');
console.log(`   原文写「兼祧」的                      ${jian.length} 人`);
console.log(`   我们认定的嗣父不止一位                ${multiHeir.length} 人`);
console.log('');
console.log('【③ 只有嗣父、没有生父】');
console.log(`   这样的人                              ${heirOnly.length} 人`);
console.log(`   其中本人条目自己写明是嗣子／祧子      ${heirOnlyNoName.length} 人`);
console.log('   —— 「生父没写、嗣父一定写」，正是承健说的那种形态。');
console.log('');
console.log('【④ 嗣子跟嗣父的年龄关系】');
const tot = older.length + younger.length;
console.log(`   嗣子**比嗣父年长或同龄**              ${older.length} 处`
  + (tot ? `  ${(older.length * 100 / tot).toFixed(1)}%` : ''));
console.log(`   嗣子比嗣父年幼                        ${younger.length} 处`);
console.log(`   有一方年代不知道                      ${unknown.length} 处`);
console.log('═'.repeat(72));

if (older.length) {
  console.log('\n【嗣子比嗣父年长／同龄的实例】');
  for (const { p, f, a, b } of older.sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, 15))
    console.log(`   ${p.name.padEnd(4)}生${a}　嗣父 ${f.name.padEnd(4)}生${b}`
      + `　嗣子大 ${b - a} 岁　${p.src_human}`);
}
console.log('\n【完全孤立的举例】');
for (const p of isolate.slice(0, 10))
  console.log(`   ${p.name.padEnd(4)}第${String(p.gen).padStart(2)}世 ${p.src_human}`
    + `　${W(p)}　原文 ${NS(p.raw_text).length} 字`);
console.log('\n【只有嗣父没有生父的举例】');
for (const p of heirOnly.slice(0, 10))
  console.log(`   ${p.name.padEnd(4)}第${String(p.gen).padStart(2)}世　写「${p.father_name || '空'}${p.filiation || ''}」`
    + `　嗣父 ${kind(p, '嗣父').map(c => idx.get(c.edge.parent).name).join('、')}　${p.src_human}`);
