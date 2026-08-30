import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept, ruled } from '../src/core/candidates.ts';
const J = n => JSON.parse(readFileSync(`data/${n}.json`,'utf8'));
const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const why = {gen:0, age:0, named:0};
let multi=0, solved=0, still=0, noFather=0, noEdge=0;
for (const p of people) {
  if (!p.parent_edges.length) { noEdge++; if (!p.father_name) noFather++; continue; }
  if (p.parent_edges.length < 2) continue;
  multi++;
  const cs = candidates(idx, p, chart, win);
  for (const c of ruled(cs)) why[c.status]++;
  const byKind = {};
  for (const c of kept(cs)) (byKind[c.edge.kind] ??= new Set()).add(c.edge.parent);
  const worst = Math.max(0, ...Object.values(byKind).map(s=>s.size));
  if (worst > 1) still++; else solved++;
}
console.log(`全谱 ${people.length} 人`);
console.log(`  一条父边都没有　${noEdge}（原来 ${raw.filter(p=>!p.parent_edges.length).length}）`);
console.log(`  其中谱上连父名都没写　${noFather}`);
console.log(`\n有多个父候选　${multi}`);
console.log(`  筛掉的边：世次不对 ${why.gen}　活跃年代不可能 ${why.age}　生子名单点了别人 ${why.named}`);
console.log(`  **筛完只剩一个（或生父+嗣父一对）**　${solved}`);
console.log(`  **真的还说不清**　　　　　　　　　　${still}`);
