/** 五类各举一例，连原文摊开。 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

const groups = new Map();
for (const p of people) {
  const by = new Map();
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length < 2) continue;
    const namesMe = cs.filter(c =>
      roster(c.person).sons.some(s => norm(s.name || s.raw) === norm(p.name))).length;
    const noList = cs.every(c => !roster(c.person).sons.length);
    const above = cs.filter(c => c.printedAbove).length;
    const k = namesMe > 1 ? 'A 好几个都写着本人'
      : !p.father_name && noList ? 'E 本人没写父名，候选也都没写名单'
      : !p.father_name ? 'E 本人没写父名'
      : noList ? 'D 写了父名，候选都没写名单'
      : above === 1 ? 'B 恰好一个印在正上方那一格'
      : 'C 一个都没认他';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ p, kind, cs });
    break;
  }
}

for (const [k, v] of [...groups].sort()) {
  const r = v[0];
  console.log(`\n${'█'.repeat(66)}`);
  console.log(`█ ${k}　共 ${v.length} 人`);
  console.log(`${'█'.repeat(66)}`);
  console.log(`\n例：${r.p.name}　第 ${r.p.gen} 世　${r.p.src_human}`);
  console.log(`谱上写的父名：「${r.p.father_name || '（空的）'}」${r.p.filiation ?? ''}`
    + `　出处：${r.p.father_src || '（没有）'}`);
  console.log('他自己那一条：');
  for (const l of (r.p.raw_text ?? '').split('\n')) if (l.trim()) console.log('    ' + l);
  console.log(`候选 ${r.cs.length} 个：`);
  for (const c of r.cs) {
    const f = c.person;
    console.log(`  ── ${f?.name || '（谱上没读出名字）'}　${f?.src_human}`);
    console.log(`     字${f?.zi?.text ?? '—'}　生${f?.birth?.text ?? '缺'}`);
    console.log(`     他的生子名单：${roster(f).sons.map(s => s.raw).join('、') || '（谱上没写）'}`);
    console.log(`     版面：${c.layoutNote}${c.printedAbove ? '　★正上方那一格' : ''}`);
  }
  console.log(`\n同类还有：` + v.slice(1, 5).map(x => `${x.p.name}(第${x.p.gen}世)`).join('、')
    + (v.length > 5 ? ` 等 ${v.length - 1} 人` : ''));
}
