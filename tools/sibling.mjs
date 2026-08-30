/**
 * 你说的办法，量准它。
 *
 * 原话：「两个父亲名字一样，两个儿子的名字一样，再看他们的父母就行了。」
 *
 * 拆成两种读法，分别量：
 *   甲　看候选父亲各自的父亲（往上再看一代）
 *   乙　看候选父亲**已经确认的其他儿子**印在哪一卷——
 *       五世一图，一个父亲的儿子们接到同一张图上去。
 *
 * 先在**谱自己已经说清楚的**那批人身上验准确率（父亲唯一、rank1 两边对得上），
 * 准确率够高才敢拿去分同名。不验就用，等於换一种猜法。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const sure = p => {                       // 父亲已经确定的
  const g = kept(C.get(p.pid)).filter(c => c.edge.kind === '生父');
  return g.length === 1 ? g[0].edge.parent : null;
};
const juan = p => `${p.src?.vol}·卷${p.src?.juan}`;

// ── 一、准确率：父亲确定的人，跟父亲的其他确定儿子是不是同一卷 ──
let same = 0, diff = 0, alone = 0;
const kidsOf = new Map();
for (const p of people) {
  const f = sure(p);
  if (f) (kidsOf.get(f) ?? kidsOf.set(f, []).get(f)).push(p);
}
for (const [f, ks] of kidsOf) {
  if (ks.length < 2) { alone += ks.length; continue; }
  for (const k of ks) {
    const others = ks.filter(x => x !== k);
    if (others.some(x => juan(x) === juan(k))) same++; else diff++;
  }
}
const acc = same / (same + diff) * 100;
console.log('══ 乙：兄弟同卷　准确率 ══');
console.log(`  父亲确定、且有兄弟的：${same + diff} 人`);
console.log(`  跟至少一个兄弟同卷：${same}（${acc.toFixed(2)}%）`);
console.log(`  跟所有兄弟都不同卷：${diff}`);
console.log(`  （独子，验不了：${alone} 人）`);

// ── 二、拿它去分同名，能分开几处 ──
const amb = [];
for (const p of people) {
  const g = kept(C.get(p.pid));
  const by = new Map();
  for (const c of g) { if (!by.has(c.edge.kind)) by.set(c.edge.kind, []); by.get(c.edge.kind).push(c); }
  for (const [kind, cs] of by) if (cs.length > 1) amb.push({ p, kind, cs });
}
let solved = 0, nothing = 0, still = [];
for (const a of amb) {
  const hit = a.cs.filter(c => {
    const ks = (kidsOf.get(c.edge.parent) ?? []).filter(x => x.pid !== a.p.pid);
    return ks.some(x => juan(x) === juan(a.p));
  });
  if (hit.length === 1) solved++;
  else if (hit.length === 0) { nothing++; still.push(a); }
  else still.push(a);
}
console.log(`\n══ 拿去分同名（还说不清的 ${amb.length} 处） ══`);
console.log(`  能定到 1 个：${solved} 处（${(solved / amb.length * 100).toFixed(1)}%）`);
console.log(`  一个候选都没有确定的兄弟可比：${nothing} 处`);
console.log(`  还是分不开：${still.length - nothing} 处`);

// ── 三、甲：往上再看一代 ──
let up = 0;
for (const a of amb) {
  const ups = a.cs.map(c => { const f = idx.get(c.edge.parent); return f ? sure(f) : null; });
  if (ups.every(Boolean) && new Set(ups).size === ups.length) up++;
}
console.log(`\n══ 甲：往上再看一代 ══`);
console.log(`  两个候选的父亲各不相同（於是能区分「这两个人不是同一个」）：${up} 处`);
console.log(`  但这只证明候选彼此不同，**不告诉你哪个是本人的父亲**——能定案 0 处`);

console.log('\n══ 用乙也分不开的，前 8 处长什么样 ══');
for (const a of still.slice(0, 8)) {
  console.log(`\n  ${a.p.name}（第${a.p.gen}世）${a.p.src_human}　父名「${a.p.father_name ?? ''}」${a.p.filiation ?? ''}`);
  for (const c of a.cs) {
    const ks = (kidsOf.get(c.edge.parent) ?? []).filter(x => x.pid !== a.p.pid);
    console.log(`    · ${c.edge.parent_name || '（无名）'}　${c.person?.src_human ?? ''}`);
    console.log(`      生子名单：${(c.person?.sons_claimed ?? []).join('、') || '（没写）'}`);
    console.log(`      已确定的儿子：${ks.map(x => `${x.name}(${juan(x)})`).join('、') || '（一个都没确定）'}`);
  }
  console.log(`      本人在：${juan(a.p)}`);
}
