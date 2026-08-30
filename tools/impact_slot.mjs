/**
 * 新加的两条改动（反查降级 + 名额已满）影响多大。
 *
 * 判据排掉东西一定要先量：**排空了、排掉真的，都是规则错了的信号。**
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));

// ① 反查补出来的边，现在各是什么强度
const derived = people.flatMap(p => p.parent_edges.filter(e => e.derived));
const byRank = {};
for (const e of derived) byRank[`rank ${e.rank} ${e.evidence}`] =
  (byRank[`rank ${e.rank} ${e.evidence}`] ?? 0) + 1;
console.log(`══ 反查补出来的父边　共 ${derived.length} 条 ══`);
for (const [k, v] of Object.entries(byRank).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);

// ② 排除理由分布
const st = {};
for (const cs of C.values()) for (const c of cs) st[c.status] = (st[c.status] ?? 0) + 1;
console.log(`\n══ 所有父边候选的判定　共 ${[...C.values()].flat().length} 条 ══`);
for (const [k, v] of Object.entries(st).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(5)}  ${k}`);
}

// ③ 「名额已满」排掉了多少，全谱一共影响几个人
const slotHit = people.filter(p => C.get(p.pid).some(c => c.status === 'slot'));
const slotAll = slotHit.filter(p => C.get(p.pid).every(c => c.status !== 'ok'));
console.log(`\n══ 名额已满 ══`);
console.log(`  被排掉至少一条边的人：${slotHit.length}`);
console.log(`  被排到一条 ok 都不剩的人：${slotAll.length}`
  + `（这些人 kept() 会把候选全还回去，并标「谱上对不上」，不会凭空消失）`);

// ④ 子女栏：新口径 = 以父亲自己写的「生子N：…」名单为准
const NSx = (await import('../src/core/norm.ts')).norm;
let before = 0, rows = 0, linked = 0, plain = 0, extra = 0, multi = 0;
let noList = 0;   // 谱上没写生子名单、也没有 ok 的子女
for (const f of people) {
  const kids = childrenOf(people, f.pid);
  before += kids.length;
  const ok = kids.filter(k => C.get(k.child.pid).some(c => c.edge === k.edge && c.status === 'ok'));
  const used = new Set();
  for (const nm of f.sons_claimed ?? []) {
    const hit = ok.filter(k => NSx(k.child.name) === NSx(nm)
      || k.child.aliases.some(a => NSx(a.form) === NSx(nm)));
    rows += Math.max(1, hit.length);
    if (!hit.length) plain++; else { linked += hit.length; if (hit.length > 1) multi++; }
    hit.forEach(k => used.add(k.child.pid));
  }
  const ex = ok.filter(k => !used.has(k.child.pid));
  rows += ex.length; extra += ex.length;
  if (!(f.sons_claimed ?? []).length && !ok.length && kids.length) noList++;
}
console.log(`\n══ 名片上的「子女」（新口径：以父亲自己写的名单为准） ══`);
console.log(`  改前列 ${before} 条（所有指进来的边，含判据已排除的）`);
console.log(`  改后列 ${rows} 条 = 名单里连上条目的 ${linked}`
  + ` + 名单里连不上、照原样摆着的 ${plain}`
  + ` + 名单没写但对方自己写明的 ${extra}`);
console.log(`  同一个名字有多人对得上、全列不挑的：${multi} 处`);
console.log(`  谱上没写生子名单、指进来的边又全被排除的父亲：${noList}`);

// ⑤ 「生子N」这个数字对不对得上——谱自己写的数
let fit = 0, over = 0, under = 0;
for (const f of people) {
  const n = (f.sons_claimed ?? []).length;
  if (!n) continue;
  const okKids = childrenOf(people, f.pid)
    .filter(k => C.get(k.child.pid).some(c => c.edge === k.edge && c.status === 'ok')).length;
  if (okKids === n) fit++; else if (okKids > n) over++; else under++;
}
console.log(`\n══ 「生子N」对得上吗（只看谱上写了生子名单的父亲） ══`);
console.log(`  正好对上 ${fit}　连上的比名单多 ${over}　比名单少 ${under}（少的那些照原样摆名字）`);

// ⑥ 承健那条链不能动
const me = people.find(p => p.name === '承健' && p.gen === 27);
let cur = me.pid, n = 0;
while (cur && n < 40) {
  const q = idx.get(cur); if (!q || q.gen === 1) break;
  const g = kept(C.get(cur));
  cur = (g.find(c => c.edge.kind === '生父') ?? g[0]).edge.parent; n++;
}
console.log(`\n══ 承健 ══\n  往上走 ${n + 1} 代，走到第 ${idx.get(cur)?.gen} 世 ${idx.get(cur)?.name}`);
