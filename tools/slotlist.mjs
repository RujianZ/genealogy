/** 「名额已满」排掉的每一条，逐条列出来人工过一遍。 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
let n = 0, adopt = 0;
for (const p of people) {
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'slot') continue;
    n++;
    const isAdopt = p.is_heir || c.edge.evidence === 'stated_adopt' || c.edge.kind !== '生父';
    if (isAdopt) adopt++;
    console.log(`${isAdopt ? '⚠' : ' '} ${p.name}（${p.src_human}）`
      + `　父名「${p.father_name ?? ''}」${p.is_heir ? ' 嗣子' : ''}`
      + `　→ 排掉 ${c.edge.parent_name} ${c.edge.kind}/${c.edge.evidence}`);
  }
}
console.log(`\n共 ${n} 条；其中涉及过继/嗣子的 ${adopt} 条`);
