/**
 * 反向查：**有没有把真的关系删掉。**
 *
 * 不变量：一个人认定了父亲（唯一一条 ok 的生父边），
 * 那么翻到那个父亲的卡上，子女栏里必须有他。
 * 少一个就是子女栏那次重写漏了人。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { makeRegistry } from '../src/core/entries.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const R = makeRegistry({
  people: J('people'), refs: J('referenced'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'),
});

const kidRows = new Map();   // 父 pid → 子女栏里链接到的 pid
for (const p of people) {
  const e = R.build.person(p.pid);
  const r = e.relations.find(x => x.heading === '子女');
  kidRows.set(p.pid, new Set((r?.items ?? []).filter(l => !l.plain).map(l => l.id)));
}

let checked = 0;
const lost = [];
for (const p of people) {
  const ok = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  for (const c of ok) {
    checked++;
    if (!kidRows.get(c.edge.parent)?.has(p.pid)) {
      lost.push({ p, kind: c.edge.kind, f: idx.get(c.edge.parent) });
    }
  }
}
console.log(`认定成立的父子边：${checked} 条`);
console.log(`父亲卡上找不到这个孩子的：${lost.length} 条`);
for (const x of lost.slice(0, 12)) {
  console.log(`  ${x.p.name}（第${x.p.gen}世 ${x.p.src_human}）`
    + `　${x.kind} ${x.f?.name}（${x.f?.src_human}）`
    + `　父亲生子名单：${(x.f?.sons_claimed ?? []).join('、') || '（没写）'}`);
}
process.exit(lost.length ? 1 : 0);
