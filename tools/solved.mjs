/**
 * 「前人说他们解决不了的，我们解决了多少？」——数出来，不空说。
 *
 * ★ 前人在凡例和序里承认的三件事：
 *
 *   ① 「一名前后雜出，族大人众，**止於各小房辨之**」
 *      —— 同名的人前后杂出，谱本身分不了，只能靠各房自己认。
 *
 *   ② 「各房各代亦会有**绳不能贯、丝不能联**，或遗漏错叙者」
 *      —— 有些房、有些代，线穿不起来。
 *
 *   ③ 「沿**帝虎**、误袭**鲁鱼**者，夫岂一力之所能哉」
 *      —— 字形相近必然抄错，一个人的力气避免不了。
 *
 * ★ 我们能做而他们做不到的，只有一件事：**全书同时查**。
 *
 *   他们是人，读谱只能顺着读：翻到一个人，看他自己那条写的父名。
 *   要反过来问「全谱谁的生子名单里写了这个名字」，就得为**每一条链**
 *   把 1,314 页从头翻到尾。一个人一辈子做不完。
 *
 *   所以这里数的不是「我们比他们聪明」，是**「同时看全书」这一件事**
 *   到底换回了多少。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { fname } from '../src/core/fname.ts';
import { TYPOS } from '../src/core/typos.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const all = people.filter(p => !isFragment(p));
const rawById = new Map(raw.map(p => [p.pid, p]));

// ── ① 反向查：本人条目没写父名，靠「谁的生子名单里有他」接上的
let noName = 0, noNameFixed = 0;
// ── ② 顺着读会断、反过来读才通：上游给的边是空的
let wasOrphan = 0, orphanFixed = 0;
// ── ③ 判据解开的同名
let ambigBefore = 0, ambigNow = 0;
for (const p of all) {
  const r = rawById.get(p.pid);
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;

  if (!fname(p.father_name)) { noName++; if (line.length) noNameFixed++; }
  if (r && r.parent_edges.length === 0 && p.gen !== 1) {
    wasOrphan++; if (line.length) orphanFixed++;
  }
  // 上游给了几条候选 vs 判据留下几条
  const before = (r?.parent_edges ?? []).filter(e => e.kind === '生父').length
    || (r?.parent_edges ?? []).length;
  if (before > 1) { ambigBefore++; if (line.length === 1) ambigNow++; }
}

const pc = (a, b) => b ? (a * 100 / b).toFixed(1) + '%' : '—';
console.log('═'.repeat(72));
console.log('【① 本人条目根本没写父名的人】');
console.log(`   谱上这样的人                       ${noName} 人`);
console.log(`   靠「反过来查谁点了他的名」接上的   ${noNameFixed} 人  ${pc(noNameFixed, noName)}`);
console.log('   （世系表一格里并排印几个兄弟，父名只写在版心页眉上，行内不再重复。');
console.log('     顺着读永远读不到父名；要反过来问「全谱谁的生子名单里有他」。）');
console.log('');
console.log('【② 上游解析后一条父边都没有的人（线断在这里）】');
console.log(`   断链的                             ${wasOrphan} 人`);
console.log(`   反向匹配接回去的                   ${orphanFixed} 人  ${pc(orphanFixed, wasOrphan)}`);
console.log('   （凡例：「各房各代亦会有绳不能贯、丝不能联」）');
console.log('');
console.log('【③ 同名分不清的】');
console.log(`   上游给出两个以上候选父亲的         ${ambigBefore} 人`);
console.log(`   判据收敛到唯一一位的               ${ambigNow} 人  ${pc(ambigNow, ambigBefore)}`);
console.log('   （凡例：「一名前后雜出，族大人众，止於各小房辨之」）');
console.log('');
console.log('【④ 字形相近的抄错（「鲁鱼帝虎」）】');
console.log(`   靠全书字频定位出来的误字           ${Object.keys(TYPOS).length} 个`
  + `：${Object.entries(TYPOS).map(([a, b]) => a + '／' + b).join('　')}`);
console.log('   （旧序：「沿帝虎、误袭鲁鱼者，夫岂一力之所能哉」）');
console.log('═'.repeat(72));
