// 筛完之后，全谱还剩多少人的父亲说不清？
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { EraChart } from '../src/core/years.ts';
import { candidates, kept, ruled } from '../src/core/candidates.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = J('people'), idx = buildIndex(people);
const chart = new EraChart(J('erachart'));

const why = { gen: 0, age: 0, named: 0 };
let multi = 0, solved = 0, still = 0;
const left = [];
for (const p of people) {
  if (p.parent_edges.length < 2) continue;
  multi++;
  const cs = candidates(idx, p, chart);
  for (const c of ruled(cs)) why[c.status]++;
  // 同一种关系里还剩几个（生父+嗣父是过继双记，不算说不清）
  const byKind = {};
  for (const c of kept(cs)) (byKind[c.edge.kind] ??= new Set()).add(c.edge.parent);
  const worst = Math.max(0, ...Object.values(byKind).map(s => s.size));
  if (worst > 1) { still++; left.push([p, kept(cs)]); } else solved++;
}
console.log(`有多个父候选的人　${multi}`);
console.log(`  筛掉的边：世次不对 ${why.gen}　生年不可能 ${why.age}　生子名单没点名 ${why.named}`);
console.log(`  **筛完只剩一个（或只剩生父+嗣父一对）**　${solved}`);
console.log(`  同一种关系里仍有多个，真的说不清　　　　${still}\n`);

const byGen = {};
for (const [p] of left) byGen[p.gen] = (byGen[p.gen] ?? 0) + 1;
console.log('还说不清的按世次分：',
  Object.entries(byGen).sort((a, b) => a[0] - b[0]).map(([g, n]) => `${g}世×${n}`).join(' '));

console.log('\n头 6 条：');
for (const [p, cs] of left.slice(0, 6)) {
  console.log(`\n第${p.gen}世 ${p.name}　${p.src_human}　父名「${p.father_name}」${p.filiation}`);
  for (const c of cs) {
    console.log(`   · ${c.person?.name}　${c.person?.src_human}`
      + `　[${c.edge.kind} ${c.edge.evidence}]　${c.layoutNote}`
      + (c.note ? `　${c.note}` : ''));
  }
}
