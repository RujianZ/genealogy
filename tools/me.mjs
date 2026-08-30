import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
import { candidates, kept, allRuledOut } from '../src/core/candidates.ts';
const J=n=>JSON.parse(readFileSync(`data/${n}.json`,'utf8'));
const people=withBacklinks(J('people')), idx=buildIndex(people);
const chart=new EraChart(J('erachart')), win=buildWindows(people,chart);
let p = people.find(x=>x.name==='承健'&&x.gen===27);
console.log(`${p.name} 第${p.gen}世　${p.src_human}\n`);
let step=0, bad=0;
while (p && step++<40) {
  const cs = candidates(idx,p,chart,win);
  const good = kept(cs);
  const byKind={};
  for (const c of good) (byKind[c.edge.kind] ??= new Set()).add(c.edge.parent);
  const worst = Math.max(0, ...Object.values(byKind).map(s=>s.size));
  const flag = allRuledOut(cs) ? '【谱上对不上】' : worst>1 ? '【说不清】' : '';
  if (flag) bad++;
  console.log(`  ${String(p.gen).padStart(2)}世 ${p.name}`.padEnd(14)
    + (good.length ? `父 ${good.map(c=>c.person?.name+'('+c.edge.kind+')').join(' / ')}` : '（到顶）')
    + (flag ? '  ' + flag : ''));
  if (!good.length) break;
  const up = good.find(c=>c.edge.kind==='生父') ?? good[0];
  p = idx.get(up.edge.parent);
}
console.log(`\n**这条链上说不清的步数：${bad}**`);
