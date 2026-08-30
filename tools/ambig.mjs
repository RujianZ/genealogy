/**
 * 还剩多少「说不清是哪个父亲」，以及你说的那几种交叉检查各能解掉多少。
 *
 * 只统计**同一种关系**（生父／嗣父）里留下多於一个候选的人。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const coord = pid => {
  const m = /^P-(册\d+)-(\d+)-(\d+)-/.exec(pid);
  return m ? { vol: m[1], page: +m[2], row: +m[3] } : null;
};
const branch = p => p.src?.section ?? '';

const amb = [];
for (const p of people) {
  const g = kept(candidates(idx, p, chart, win));
  const by = new Map();
  for (const c of g) {
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length > 1) amb.push({ p, kind, cs });
  }
}
console.log(`══ 还说不清的：${amb.length} 处（涉及 ${new Set(amb.map(a => a.p.pid)).size} 人）══\n`);

// 各种交叉检查，各自能把候选缩到 1 个的有多少处
const tests = {
  '① 同一房支（候选和本人印在同一个世系里）': a => {
    const b = branch(a.p);
    return a.cs.filter(c => c.person && branch(c.person) === b);
  },
  '② 同页上一行（世系表上你正上方那一格）': a => {
    const me = coord(a.p.pid);
    return a.cs.filter(c => {
      const f = coord(c.edge.parent);
      return me && f && f.vol === me.vol && f.page === me.page && f.row === me.row - 1;
    });
  },
  '③ 候选的父亲各不相同（往上再看一代能分开）': a => {
    const ups = a.cs.map(c => {
      const f = c.person;
      if (!f) return null;
      const fg = kept(candidates(idx, f, chart, win)).filter(x => x.edge.kind === '生父');
      return fg.length === 1 ? fg[0].edge.parent : null;
    });
    // 全部都能往上确定、且互不相同 → 这一步「能分开」，但仍需别的依据才知道是哪一个
    return ups.every(Boolean) && new Set(ups).size === ups.length ? a.cs : [];
  },
  '④ 生子名单里只有一个候选点了本人的名': a =>
    a.cs.filter(c => (c.person?.sons_claimed ?? []).map(norm)
      .includes(norm(a.p.name))),
};
for (const [name, fn] of Object.entries(tests)) {
  let one = 0, none = 0;
  for (const a of amb) {
    const r = fn(a);
    if (r.length === 1) one++; else if (r.length === 0) none++;
  }
  console.log(`  ${name}`);
  console.log(`      能缩到 1 个：${one} 处（${(one / amb.length * 100).toFixed(1)}%）`
    + `　一个都不剩：${none} 处`);
}

// ①②合起来
let both = 0;
for (const a of amb) {
  const r1 = tests['① 同一房支（候选和本人印在同一个世系里）'](a);
  const r2 = tests['② 同页上一行（世系表上你正上方那一格）'](a);
  if (r2.length === 1 || r1.length === 1) both++;
}
console.log(`\n  ①或②任一能缩到 1 个：${both} 处（${(both / amb.length * 100).toFixed(1)}%）`);
console.log(`  两个都不行、真说不清：${amb.length - both} 处`);

console.log('\n══ 两个都不行的，长什么样（前 6 处） ══');
let shown = 0;
for (const a of amb) {
  const r1 = tests['① 同一房支（候选和本人印在同一个世系里）'](a);
  const r2 = tests['② 同页上一行（世系表上你正上方那一格）'](a);
  if (r1.length === 1 || r2.length === 1) continue;
  if (shown++ >= 6) break;
  console.log(`\n  ${a.p.name}（第${a.p.gen}世）${a.p.src_human}　父名「${a.p.father_name ?? ''}」`);
  for (const c of a.cs) {
    console.log(`    · ${c.edge.parent_name || '（无名）'}　${c.person?.src_human ?? ''}`
      + `　生子名单：${(c.person?.sons_claimed ?? []).join('、') || '（没写）'}`);
  }
}
