/**
 * 找和「粱四／梁四」同一类的排版误字。
 *
 * 线索：一个人说不清父亲，可某个候选的生子名单里**有个名字和他只差一个字**。
 * 差的那个字多半是排版打错的。每条都要回 source/*.doc 原件查证才算数。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

/** 差一个字：长度相同，只有一处不一样 */
function offByOne(a, b) {
  if (a.length !== b.length || a === b) return null;
  let at = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (at >= 0) return null;
    at = i;
  }
  return at < 0 ? null : [a[at], b[at]];
}

// ★ 光看「差一个字」没用：族谱里同辈共用一个字，开雄／开志、承千／承文
//   本来就差一个字，243 处几乎全是这种。
//   真正的信号是：**名单上那个写法，全谱找不到对应的人**——
//   「粱四」谁也不是，而「开志」是活生生一个人。
const everyName = new Set();
for (const q of people) {
  everyName.add(norm(q.name));
  for (const a of q.aliases ?? []) everyName.add(norm(a.form));
}
for (const r of J('referenced')) everyName.add(norm(r.name_raw));

const found = [];
for (const p of people) {
  const by = new Map();
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length < 2) continue;
    const me = norm(p.name);
    for (const c of cs) {
      if (!c.person) continue;
      for (const s of roster(c.person).sons) {
        const d = offByOne(norm(s.raw), me);
        if (!d) continue;
        if (everyName.has(norm(s.raw))) continue;   // 名单上这个写法是真有其人，不是打错
        found.push({ p, c, wrote: s.raw, pair: d });
      }
    }
    break;
  }
}
console.log(`说不清的人里，候选名单上「只差一个字」的：${found.length} 处\n`);
const pairs = new Map();
for (const f of found) {
  const k = `${f.pair[0]} ↔ ${f.pair[1]}`;
  pairs.set(k, (pairs.get(k) ?? 0) + 1);
}
console.log('差的是哪两个字：');
for (const [k, v] of [...pairs].sort((a, b) => b[1] - a[1])) console.log(`  ${v} 次  ${k}`);
console.log('\n逐条：');
for (const f of found) {
  console.log(`  ${f.p.name}（第${f.p.gen}世 ${f.p.src_human}）`);
  console.log(`     候选 ${f.c.person.name}（${f.c.person.src_human}）名单里写作「${f.wrote}」`
    + `　差在「${f.pair[0]}」↔「${f.pair[1]}」`);
}
