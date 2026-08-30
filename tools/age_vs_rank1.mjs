/**
 * 年代规则把 rank1（两边都写了、对得上）的边排掉了多少？
 *
 * 谱明写的话，和我们从别处推出来的活跃区间，谁说了算？
 * 「他自己写泽富公长子，泽富的生子名单第一个就是他」——这是谱写的。
 * 「泽富的活跃区间是 17xx–17xx」——这是我们从他别的子女生年**推**的。
 * 推出来的东西推翻写下来的东西，方向反了。
 */
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

let n1 = 0, nAll = 0;
const hard = [], soft = [];
for (const p of people) {
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'age') continue;
    nAll++;
    if (c.edge.rank !== 1) continue;
    n1++;
    const wf = win.get(c.edge.parent), wc = win.get(p.pid);
    // 「硬」= 双方的生／殁年都是谱上直接写的；「软」= 至少一边是推出来的
    const isHard = (w) => w && (w.born != null || w.died != null);
    (isHard(wf) && isHard(wc) ? hard : soft).push({ p, c, wf, wc });
  }
}
console.log(`══ 被年代规则排掉的边：${nAll} 条 ══`);
console.log(`  其中 rank 1（两边都写了、对得上）：${n1} 条`);
console.log(`    双方生／殁年都是谱上直接写的（硬冲突，该报疑点）：${hard.length}`);
console.log(`    至少一边是从别处推出来的（软冲突，不该拿来排掉谱写的话）：${soft.length}`);

const show = (list, title) => {
  console.log(`\n── ${title}（前 6） ──`);
  for (const { p, c, wf, wc } of list.slice(0, 6)) {
    console.log(`  ${p.name}（第${p.gen}世）${p.src_human}　父名「${p.father_name}」${p.filiation ?? ''}`);
    console.log(`    → ${c.edge.parent_name} ${c.person?.src_human}`);
    console.log(`    排除理由：${c.note}`);
    console.log(`    父：${wf?.born ?? '?'}生 ${wf?.died ?? '?'}殁 区间${wf?.lo ?? '?'}–${wf?.hi ?? '?'}`
      + `　依据：${(wf?.why ?? []).join('；') || '（无）'}`);
    console.log(`    子：${wc?.born ?? '?'}生 ${wc?.died ?? '?'}殁 区间${wc?.lo ?? '?'}–${wc?.hi ?? '?'}`
      + `　依据：${(wc?.why ?? []).join('；') || '（无）'}`);
  }
};
show(soft, '软冲突');
show(hard, '硬冲突');
