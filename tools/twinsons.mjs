/**
 * 同一个父亲名下**两个同名的儿子**——谱不会给两个儿子取一样的名字。
 *
 *   铣富  谱写「生子一」，名单只有「泽均」，却连上了两个泽均
 *   士兴  连上 铣德(次子)、铣德(幼子)
 *
 * 这两个人各自只有一个候选父亲，所以各自都「定下来了」；
 * 矛盾只有从父亲那边看才发现。**至多有一个是真的。**
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { isFragment } from '../src/core/fragment.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const settled = p => {
  const g = C.get(p.pid).filter(c => c.status === 'ok' && c.edge.kind === '生父');
  return g.length === 1 ? g[0] : null;
};
const short = s => (s ?? '').split('·').slice(1).join('·');

let n = 0, kids = 0;
for (const f of people) {
  if (isFragment(f)) continue;
  const mine = childrenOf(people, f.pid).filter(k => !isFragment(k.child)
    && k.edge.kind === '生父' && settled(k.child)?.edge === k.edge);
  const by = new Map();
  for (const k of mine) {
    const key = norm(k.child.name);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(k.child);
  }
  for (const [name, list] of by) {
    if (list.length < 2) continue;
    n++; kids += list.length;
    console.log(`  ${f.name}（${short(f.src_human)}）名下有 ${list.length} 个「${list[0].name}」`);
    console.log(`     谱上生子名单：${roster(f).sons.map(s => s.raw.replace(/[\s　]+/g, '')).join('、') || '（没写）'}`);
    for (const k of list) {
      console.log(`     · ${k.name}（第${k.gen}世 ${short(k.src_human)}）`
        + `　${k.filiation ?? ''}　生${k.birth?.text ?? '缺'}`);
    }
  }
}
console.log(`\n同一个父亲名下有同名儿子的：${n} 处，牵涉 ${kids} 人`);
