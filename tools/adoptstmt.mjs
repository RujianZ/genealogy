/**
 * 候选父亲自己那条写了「立…为嗣」并点了本人的名——谱自己的话，能定案。
 *
 *   梁木（28页）：立胞弟梁必次子**光远**为嗣
 *   梁茂（42页）：立亲弟梁园长子**光灼**为嗣
 *
 * 这一条一直没用上。先数：118 个说不清的人里，有多少能靠它定下来。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NS = s => norm(s ?? '');

/** 一条原文里，「立…为嗣／承嗣／入嗣」点到的名字 */
const ADOPT = /(?:立|以)([^立以，。]{0,14}?)(?:为嗣|承嗣|入嗣|为祧|祧)/g;
function adopteesIn(text) {
  const out = new Set();
  for (const m of NS(text).matchAll(ADOPT)) {
    const seg = m[1];
    // 「胞弟梁必次子光远」——名字是末尾那两三个字，前面是关系和排行
    for (let n = 2; n <= 3; n++) if (seg.length >= n) out.add(seg.slice(-n));
  }
  return out;
}

let total = 0, solvable = 0, contradict = 0;
const ex = [];
for (const p of people) {
  const by = new Map();
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length < 2) continue;
    total++;
    const forms = new Set([NS(p.name), ...p.aliases.map(a => NS(a.form))]);
    const hits = cs.filter(c => {
      const names = adopteesIn(c.person?.raw_text ?? '');
      return [...forms].some(f => names.has(f));
    });
    if (hits.length === 1) {
      solvable++;
      if (ex.length < 12) {
        ex.push(`${p.name}（第${p.gen}世 ${p.src_human}）　${cs.length} 个候选 → `
          + `${hits[0].person?.name}（${hits[0].person?.src_human}）`
          + `　依据：「${(NS(hits[0].person?.raw_text).match(ADOPT) ?? [])[0] ?? ''}」`);
      }
    } else if (hits.length > 1) contradict++;
    break;
  }
}
console.log(`说不清的：${total} 处`);
console.log(`  候选里**恰好一个**自己写了「立…为嗣」点了本人：${solvable} 处　← 能定案`);
console.log(`  两个都写了（还是分不出）：${contradict} 处`);
console.log(`  没人写：${total - solvable - contradict} 处\n`);
for (const e of ex) console.log('  ' + e);
