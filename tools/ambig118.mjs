/**
 * 谱上说不清是哪个父亲的那些人：**逐条摊开，供人工核对。**
 *
 * 带上后代数——错一步就带着一整支人错，得按影响大小看。
 *   node --experimental-strip-types tools/ambig118.mjs            列表
 *   node --experimental-strip-types tools/ambig118.mjs 详 [起] [止] 逐条连原文
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));

// 直系后代：沿成立的父边往下数（一个人算一次）
const kidsBy = new Map();
for (const p of people) {
  for (const c of C.get(p.pid)) {
    if (c.status !== 'ok') continue;
    if (!kidsBy.has(c.edge.parent)) kidsBy.set(c.edge.parent, new Set());
    kidsBy.get(c.edge.parent).add(p.pid);
  }
}
const descOf = new Map();
function desc(pid, seen = new Set()) {
  if (descOf.has(pid)) return descOf.get(pid);
  if (seen.has(pid)) return new Set();
  seen.add(pid);
  const out = new Set();
  for (const k of kidsBy.get(pid) ?? []) {
    out.add(k);
    for (const g of desc(k, seen)) out.add(g);
  }
  descOf.set(pid, out);
  return out;
}

const rows = [];
for (const p of people) {
  const by = new Map();
  for (const c of C.get(p.pid)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length > 1) { rows.push({ p, kind, cs, n: desc(p.pid).size }); break; }
  }
}
rows.sort((a, b) => b.n - a.n);

const [mode, from = 0, to = 999] = process.argv.slice(2);

if (mode !== '详') {
  console.log(`说不清是哪个父亲：${rows.length} 人\n`);
  const withKids = rows.filter(r => r.n > 0);
  console.log(`  有后代的：${withKids.length} 人，牵连 ${withKids.reduce((a, r) => a + r.n, 0)} 人次`);
  console.log(`  没有后代（这一支到他为止）：${rows.length - withKids.length} 人\n`);
  console.log('  #  后代  本人                     候选');
  rows.forEach((r, i) => {
    console.log(`  ${String(i).padStart(3)} ${String(r.n).padStart(4)}  `
      + `${(r.p.name + '（第' + r.p.gen + '世）').padEnd(14)}`
      + `${r.p.src_human.split('·').slice(1, 2)}·${r.p.src_human.split('·').slice(-2, -1)}  `
      + `${r.kind} ${r.cs.length} 个：`
      + r.cs.map(c => `${c.edge.parent_name || '（无名）'}(${c.person?.src_human.split('·').slice(-2, -1)})`).join('／'));
  });
} else {
  for (const r of rows.slice(+from, +to)) {
    const i = rows.indexOf(r);
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`#${i}　${r.p.name}　第 ${r.p.gen} 世　${r.p.src_human}　后代 ${r.n} 人`);
    console.log(`谱上写的父名：「${r.p.father_name ?? ''}」　${r.p.filiation ?? ''}`
      + `　出处：${r.p.father_src ?? '（没有）'}`);
    console.log('本人原文：');
    for (const l of (r.p.raw_text ?? '').split('\n')) if (l.trim()) console.log('    ' + l);
    console.log(`候选 ${r.cs.length} 个：`);
    for (const c of r.cs) {
      const f = c.person;
      const rr = f ? roster(f) : { sons: [], daughters: [] };
      console.log(`  ── ${c.edge.parent_name || '（无名）'}　${f?.src_human}`);
      console.log(`     字${f?.zi?.text ?? '（无）'}　生${f?.birth?.text ?? '（缺）'}　殁${f?.death?.text ?? '（缺）'}`);
      console.log(`     生子：${rr.sons.map(s => s.raw).join('、') || '（谱上没写）'}`);
      console.log(`     女　：${rr.daughters.map(s => s.raw).join('、') || '（谱上没写）'}`);
      if (c.layoutNote) console.log(`     版面：${c.layoutNote}`);
      if (c.printedAbove) console.log(`     ★ 谱上印在本人正上方那一格`);
    }
  }
}
