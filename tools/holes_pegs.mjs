/**
 * 洞与钉子。
 *
 * 谱上有两份互相对应的名单：
 *   **洞**：父亲的「生子X：…」里点了名，但谱里查无此人
 *   **钉子**：谱里有这个人，自称「某某公长子」，却不在任何人的生子名单里
 *
 * 泽翔就是这么找出来的：
 *   铣信（字金箱）名单写「长子泽**翱**」——谱里没有泽翱
 *   泽翔自称「铣信**长子**」——不在任何名单里
 *   两边配上，差 29 岁，位置也对。同一个人，谱的两处写了不同的字。
 *
 * **这不是猜名字，是配账**：一边少一个，一边多一个，位置和年代都对得上。
 * 但仍然**不自动改数据**——列出来，谁认由人认。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote, canFather } from '../src/core/activity.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NS = s => (s || '').replace(/[\s　]/g, '');
const JUNK = /(适|公殁|妣|殁于|生于|葬|养子|嗣子|继子|季子|生子|女[一二三四五六七八九]|^[一二三四五六七八九十]$)/;
const sonsOf = p => (p.sons_claimed ?? []).map(NS).filter(s => s && !JUNK.test(s));

const ORD = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ordOf = f => { const t = NS(f); if (!t) return null; return t[0] === '幼' ? -1 : (ORD[t[0]] ?? null); };

const nameSet = new Set(people.flatMap(p => [NS(p.name), ...p.aliases.map(a => NS(a.form))]));
const claimed = new Set();
for (const p of people) for (const s of sonsOf(p)) claimed.add(s);

// ── 洞：名单里点了名，谱里没这个人 ──
const holes = [];
for (const f of people) {
  const sons = sonsOf(f);
  sons.forEach((s, i) => {
    if (!nameSet.has(s)) holes.push({ father: f, son: s, pos: i + 1, total: sons.length });
  });
}
// ── 钉子：谱里有他，自称某人之子，却不在任何名单里 ──
const pegs = people.filter(p =>
  p.father_name && !claimed.has(NS(p.name)) && p.parent_edges.length);

console.log(`洞（名单点了名、谱里查无此人）：${holes.length}`);
console.log(`钉子（谱里有他、任何名单都没点他）：${pegs.length}\n`);

// ── 配对：同一个父亲、排行位置对得上、年代不冲突 ──
const match = [];
for (const peg of pegs) {
  const myOrd = ordOf(peg.filiation);
  const hits = holes.filter(h => {
    if (h.father.gen !== peg.gen - 1) return false;
    // 这个洞的父亲，必须是钉子的候选父亲之一
    if (!peg.parent_edges.some(e => e.parent === h.father.pid)) return false;
    if (myOrd != null && h.pos !== (myOrd === -1 ? h.total : myOrd)) return false;
    return canFather(win.get(h.father.pid), win.get(peg.pid)).ok;
  });
  if (hits.length === 1) match.push([peg, hits[0]]);
}
console.log(`**配上的（一个洞对一个钉子，位置和年代都对）：${match.length} 对**\n`);

for (const [peg, h] of match) {
  console.log(`  ${peg.name}（第${peg.gen}世 ${peg.src_human}）「${peg.filiation}」`
    + `　${windowNote(win.get(peg.pid))}`);
  console.log(`     ↳ ${h.father.name}（${h.father.src_human}）${windowNote(win.get(h.father.pid))}`);
  console.log(`       名单第 ${h.pos}/${h.total} 位写作「${h.son}」，谱里没有这个人`);
  console.log(`       名单全文：${sonsOf(h.father).join('、')}`);
  console.log();
}
writeFileSync('data/holes_pegs.json', JSON.stringify(
  match.map(([p, h]) => ({
    pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
    filiation: p.filiation, window: windowNote(win.get(p.pid)),
    father_pid: h.father.pid, father_name: h.father.name,
    father_src: h.father.src_human, father_window: windowNote(win.get(h.father.pid)),
    written_as: h.son, pos: h.pos, total: h.total, sons: sonsOf(h.father),
  })), null, 1), 'utf8');
