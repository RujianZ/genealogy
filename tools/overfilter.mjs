/**
 * 「候选全被排除」——筛过头了吗？
 *
 * 某人明明有父边，却被三条判据（世次／年代／排行／生子名单）全排掉，
 * 链就断在那里。**全排掉是个危险信号**：说明判据把对的也排了。
 *
 * 找出这些人，看是哪条判据干的、排得对不对。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
import { candidates, kept, ruled } from '../src/core/candidates.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

const dead = [];
for (const p of people) {
  if (!p.parent_edges.length) continue;
  const cs = candidates(idx, p, chart, win);
  if (kept(cs).length === 0) dead.push([p, cs]);
}
console.log(`有父边、却被全部排除的：**${dead.length} 人**\n`);

const byWhy = {};
for (const [, cs] of dead) {
  const k = [...new Set(cs.map(c => c.status))].sort().join('+');
  byWhy[k] = (byWhy[k] ?? 0) + 1;
}
console.log('是被哪条判据排的：');
for (const [k, v] of Object.entries(byWhy).sort((a, b) => b[1] - a[1])) {
  const name = { gen: '世次差不为1', age: '年代不可能', named: '生子名单点了别人', ord: '排行对不上' };
  console.log(`  ${String(v).padStart(4)}　${k.split('+').map(x => name[x] ?? x).join(' + ')}`);
}

console.log('\n看 10 个：\n');
for (const [p, cs] of dead.slice(0, 10)) {
  console.log(`  ${p.name}（第${p.gen}世 ${p.src_human}）「${p.filiation || '没写排行'}」`
    + `　父名「${p.father_name}」　${windowNote(win.get(p.pid)) || '年代不详'}`);
  for (const c of cs) {
    console.log(`     ✘[${c.status}] ${c.person?.name}　${c.person?.src_human}`);
    console.log(`         ${c.note}`);
  }
  console.log();
}
