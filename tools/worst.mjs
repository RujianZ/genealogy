/** 改动最大的几张卡，列出来供人工复核。 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf, mentionedBy } from '../src/core/lineage.ts';
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
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));

const rows = [];
for (const p of people) {
  const n = (p.sons_claimed ?? []).length;
  if (!n) continue;
  const before = childrenOf(people, p.pid);
  const e = R.build.person(p.pid);
  const after = (e.relations.find(r => r.heading === '子女')?.items ?? []);
  if (before.length <= n) continue;
  rows.push({ p, n, before, after });
}
rows.sort((a, b) => (b.before.length - b.n) - (a.before.length - a.n));

console.log(`谱写了「生子N」、改前却列得比 N 多的父亲：${rows.length} 人。改动最大的 6 个：\n`);
for (const r of rows.slice(0, 6)) {
  console.log(`── ${r.p.name}（第${r.p.gen}世）${r.p.src_human}`);
  console.log(`   谱上写：生子${r.n}　${r.p.sons_claimed.join('、')}`);
  console.log(`   改前列 ${r.before.length} 个：`
    + r.before.map(k => `${k.child.name}(${k.child.src_human.split('·').slice(1, 2)}·${k.child.src_human.split('·').slice(-2, -1)})`).join('　'));
  console.log(`   改后列 ${r.after.length} 个：`
    + r.after.map(l => l.label + (l.plain ? '(谱写了名字，没连到条目)' : '')).join('　'));
  // 被去掉的是谁、为什么
  const gone = r.before.filter(k => !r.after.some(l => l.id === k.child.pid));
  for (const g of gone) {
    const c = C.get(g.child.pid).find(x => x.edge === g.edge);
    console.log(`     去掉 ${g.child.name}（${g.child.src_human}）`
      + `　本人条目父名「${g.child.father_name ?? '（空）'}」`
      + `　理由：${c?.note || c?.status || ''}`);
  }
  console.log();
}
