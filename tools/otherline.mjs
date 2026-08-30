/**
 * 另一支准不准：从胜二公**另一个儿子**下来的人，用和承健那条链同一套标准跑。
 *
 *   node --experimental-strip-types tools/otherline.mjs
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const dadOf = p => {
  const g = C.get(p.pid).filter(c => c.status === 'ok' && c.edge.kind === '生父');
  return g.length === 1 ? g[0].person : null;
};
/** 从他往上到第 1 世，经过的第 2 世是谁 */
function rootBranch(p) {
  let cur = p, n = 0;
  while (cur && cur.gen > 2 && n++ < 40) cur = dadOf(cur);
  return cur && cur.gen === 2 ? cur : null;
}

const g1 = people.find(p => p.gen === 1);
console.log(`第 1 世：${g1.name}　${g1.src_human}`);
const g2 = childrenOf(people, g1.pid).map(k => k.child);
console.log(`他的儿子（第 2 世）：${g2.map(p => p.name + '（' + p.src_human.split('·').slice(-2).join('·') + '）').join('、')}\n`);

// 每一支各有多少后代
for (const s of g2) {
  const mine = people.filter(p => !isFragment(p) && rootBranch(p)?.pid === s.pid);
  const deep = mine.filter(p => p.gen >= 26).sort((a, b) => b.gen - a.gen);
  console.log(`── ${s.name} 这一支：往下 ${mine.length} 人，最深到第 ${Math.max(0, ...mine.map(p => p.gen))} 世`);
  if (deep.length) console.log(`   第 26 世以后的：${deep.slice(0, 6).map(p => p.name + '(第' + p.gen + '世)').join('、')}`);
}
