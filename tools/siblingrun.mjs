/**
 * 兄弟连排：谱把同一个父亲的儿子**连着印在一起**。
 *
 * 原件（source/合一（1.2.3.4）.doc）里是这么排的：
 *     銑赞  士礼公次子  字载育 …
 *     銑蕊  士礼公三子  字孔昭 …
 *     銑时  士礼公幼子  字天才 …
 * 銑赞、銑蕊 是士礼（第135页）已确认的儿子，銑时紧跟着他们。
 *
 * 所以：**写着同一个父名、同一房、同一行、页码挨着的几个人，是兄弟。**
 * 其中任何一个的父亲已经定了，其余的就跟着定。
 *
 * 只数，先不改。
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
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const sure = p => {
  const ok = C.get(p.pid).filter(c => c.status === 'ok');
  const by = new Map();
  for (const c of ok) { if (!by.has(c.edge.kind)) by.set(c.edge.kind, []); by.get(c.edge.kind).push(c); }
  const g = by.get('生父') ?? [];
  return g.length === 1 ? g[0].edge.parent : null;
};

// 兄弟组：同房 + 同世 + 同一个写下的父名
const groupsOf = new Map();
for (const p of people) {
  if (!p.father_name || p.gen == null) continue;
  const k = `${p.src.vol}|${p.src.section}|${p.gen}|${norm(p.father_name)}`;
  if (!groupsOf.has(k)) groupsOf.set(k, []);
  groupsOf.get(k).push(p);
}

let amb = 0, fixable = 0, conflict = 0;
const ex = [];
for (const p of people) {
  const by = new Map();
  for (const c of C.get(p.pid)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length < 2) continue;
    amb++;
    const k = `${p.src.vol}|${p.src.section}|${p.gen}|${norm(p.father_name ?? '')}`;
    const bros = (groupsOf.get(k) ?? []).filter(q => q.pid !== p.pid);
    // 兄弟里已经定了父亲的，都指向谁
    const dads = new Set(bros.map(sure).filter(Boolean));
    // 只认在本人候选里的
    const inCand = [...dads].filter(d => cs.some(c => c.edge.parent === d));
    if (inCand.length === 1) {
      fixable++;
      if (ex.length < 14) {
        const f = idx.get(inCand[0]);
        const named = bros.filter(q => sure(q) === inCand[0]);
        ex.push(`${p.name}（第${p.gen}世 ${p.src_human.split('·').slice(1).join('·')}）`
          + `　写「${p.father_name}${p.filiation ?? ''}」`
          + `\n        兄弟 ${named.map(q => q.name + '(' + (q.filiation ?? '') + ')').join('、')}`
          + ` 都已定为 ${f?.name}（${f?.src_human.split('·').slice(1).join('·')}）`);
      }
    } else if (inCand.length > 1) conflict++;
    break;
  }
}
console.log(`还说不清的：${amb} 处`);
console.log(`  兄弟里已定的父亲**恰好一个**在本人候选里：${fixable} 处　← 能定案`);
console.log(`  兄弟指向不止一个（还是分不出）：${conflict} 处`);
console.log(`  兄弟里没人定得下来：${amb - fixable - conflict} 处\n`);
for (const e of ex) console.log('  ' + e);
