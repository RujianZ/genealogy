import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
const people = JSON.parse(readFileSync('data/people.json','utf8'));
const before = people.filter(p => !p.parent_edges.length);
const after  = withBacklinks(people);
const map = new Map(after.map(p => [p.pid, p]));
let one=0, many=0, none=0, noName=0, noNameFixed=0;
for (const p of before) {
  const q = map.get(p.pid);
  const n = q.parent_edges.length;
  if (!p.father_name) { noName++; if (n) noNameFixed++; }
  if (n === 1) one++; else if (n > 1) many++; else none++;
}
console.log(`原本没有父边的人　${before.length}`);
console.log(`  **反向匹配定到唯一**　${one}`);
console.log(`  查出多个候选　　　　　${many}`);
console.log(`  还是接不上　　　　　　${none}`);
console.log(`\n其中「谱上连父名都没写」的 ${noName} 人，接上了 ${noNameFixed} 人`);
console.log('\n例子：');
let n=0;
for (const p of before) {
  const q = map.get(p.pid);
  if (p.father_name || q.parent_edges.length !== 1 || n>=6) continue;
  n++;
  const f = map.get(q.parent_edges[0].parent);
  console.log(`  ${p.name}（第${p.gen}世 ${p.src_human}）谱上没写父名`);
  console.log(`    → ${f.name}（${f.src_human}）生子名单 ${JSON.stringify(f.sons_claimed)}`);
}
