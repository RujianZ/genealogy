/**
 * 剩下说不清的人，**逐个归类**：到底卡在哪。
 * 人工核对不能只看排前面的几个，得把每一条都归进一个说得清的类别。
 */
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
const put = (k, row) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); };

for (const p of people) {
  const by = new Map();
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length < 2) continue;
    const row = { p, kind, cs };
    const noName = cs.filter(c => !norm(c.person?.name ?? '')).length;
    const namesMe = cs.filter(c =>
      roster(c.person).sons.some(s => norm(s.name || s.raw) === norm(p.name))).length;
    const noList = cs.every(c => !roster(c.person).sons.length);
    const above = cs.filter(c => c.printedAbove).length;

    if (noName) put(`候选里有 ${noName} 个**谱上没读出名字**的记录`, row);
    else if (namesMe > 1) put('好几个候选的生子名单里都写着本人（真同名）', row);
    else if (!p.father_name && noList) put('本人没写父名，候选也都没写生子名单', row);
    else if (!p.father_name) put('本人没写父名（只靠别人的名单撞上）', row);
    else if (noList) put('本人写了父名，可候选都没写生子名单', row);
    else if (above === 1) put('候选里恰好一个印在本人正上方那一格', row);
    else put('其他', row);
    break;
  }
}

const all = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`还说不清的：${all.reduce((a, [, v]) => a + v.length, 0)} 人\n`);
for (const [k, v] of all) {
  const kids = v.reduce((a, r) => a + 0, 0);
  console.log(`══ ${v.length} 人　${k}`);
  for (const r of v.slice(0, 5)) {
    console.log(`     ${r.p.name}（第${r.p.gen}世 ${r.p.src_human.split('·').slice(1).join('·')}）`
      + `　${r.kind} ${r.cs.length} 个：`
      + r.cs.map(c => (c.person?.name || '（无名）')
        + (c.printedAbove ? '★上一格' : '')).join('／'));
  }
  if (v.length > 5) console.log(`     …还有 ${v.length - 5} 人`);
  console.log('');
}

// 顺带：谱上没读出名字的记录，全谱有多少
const nameless = people.filter(p => !norm(p.name));
console.log(`══ 附：people.json 里名字是空的记录：${nameless.length} 条`);
for (const p of nameless.slice(0, 6)) {
  console.log(`     ${p.src_human}　字${p.zi?.text ?? '—'}　`
    + `原文首行「${(p.raw_text ?? '').split('\n')[0]}」`);
}
