/**
 * 「会不会别人家乱认了祖先？」——把每一条认定的父子关系按**依据强度**分级。
 *
 * ★ 先把两件事分开，这是全部问题的关键：
 *
 *     「不知道」——候选有好几个，界面上全部摊开显示分叉，一个都不选。
 *                  这不是错。谱上就那两个字，我们不替它决定。
 *     「乱认」  ——只有一条边、依据还很弱，界面上就那么显示了，
 *                  而它可能是错的。**只有这一类才叫乱认。**
 *
 *   前者是设计要的结果（不猜），后者才是真风险。要数的是后者。
 *
 * ★ 分级（只用谱自己写下的东西，不引入任何推断）：
 *
 *   A 三重  父亲名单点名本人 ＋ 本人写了父名 ＋ 儿子印在父亲正下一行
 *   B 双重  上面三条里对上两条
 *   C 单一硬  只对上一条，但那一条是 rank1/2（点名／全谱独一份）
 *   D 单一弱  只对上一条，而且是 rank4/5（去敬称同名／多个同名之一）  ← 真风险
 *   E 分叉  留下不止一条边，界面上摊开显示                        ← 不是错
 *   F 无父  一条边都没有（始祖，或谱上就断了）
 *
 * ★ D 级还要往下追一层：他有多少后代？
 *   一个 D 级如果在第 25 世，错了只影响他自己；
 *   在第 13 世，下面挂着几百口人。**风险要按牵连的人数算，不是按人头算。**
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { roster } from '../src/core/roster.ts';
import { fname } from '../src/core/fname.ts';
import { norm } from '../src/core/norm.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NS = (s) => norm(s ?? '').replace(/[\s　]/g, '');
const bare = (s) => fname(s).replace(/公$/, '');

const G = { A: [], B: [], C: [], D: [], E: [], F: [] };
const gradeOf = new Map();

for (const p of people) {
  if (isFragment(p)) continue;
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  if (!keep.length) { G.F.push(p); gradeOf.set(p.pid, 'F'); continue; }
  // 生父线上留下几条？嗣父是另一条线，双记是对的，不算分叉
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;
  if (line.length > 1) { G.E.push({ p, n: line.length }); gradeOf.set(p.pid, 'E'); continue; }

  const e = line[0].edge, f = idx.get(e.parent);
  let s = 0;
  // ① 父亲的生子名单点了本人的名
  const named = f && roster(f).sons.some(x => bare(x.name || x.raw) === bare(p.name));
  // ② 本人条目写了父名，且对得上
  const wrote = f && !!bare(p.father_name)
    && (bare(f.name) === bare(p.father_name)
        || f.aliases.some(a => bare(a.form) === bare(p.father_name)));
  // ③ 印在父亲的正下一行（五世一图，一行一世）
  const row = f && f.gen != null && p.gen != null && p.gen - f.gen === 1
    && f.src.row === p.src.row - 1;
  s = [named, wrote, row].filter(Boolean).length;

  // ★ 分级不能拿 rank 当强弱。rank3 是「过继」这个**类别**，不是「弱」：
  //   朝纪的边是 rank3（出祠梦楚），可林公那条白纸黑字写着「生子二 朝阳 朝纪」——
  //   父亲的名单点了名，这是全谱最硬的一条依据。按 rank 排，他掉进了 D 级，错的。
  //
  //   真正要问的是：**谱有没有用文字写下这层关系**，还是我们纯靠名字撞上的。
  //     父亲名单点名  → 谱写了（父亲那一侧）
  //     本人写了父名  → 谱写了（儿子那一侧）
  //     两样都没有    → 这条边只剩「同名」，那才是真风险
  const g = s >= 3 ? 'A' : s === 2 ? 'B' : (named || wrote) ? 'C' : 'D';
  G[g].push({ p, f, e, named, wrote, row });
  gradeOf.set(p.pid, g);
}

// 每个人的后代数（沿留下的生父边往下）
const kids = new Map();
for (const p of people) {
  if (isFragment(p)) continue;
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    (kids.get(c.edge.parent) ?? kids.set(c.edge.parent, []).get(c.edge.parent)).push(p.pid);
  }
}
const descCache = new Map();
function desc(pid, seen = new Set()) {
  if (descCache.has(pid)) return descCache.get(pid);
  if (seen.has(pid)) return 0;
  seen.add(pid);
  let n = 0;
  for (const k of kids.get(pid) ?? []) n += 1 + desc(k, seen);
  descCache.set(pid, n);
  return n;
}

const tot = ['A','B','C','D','E','F'].reduce((a, k) => a + G[k].length, 0);
const pc = (a) => (a * 100 / tot).toFixed(2) + '%';
console.log('═'.repeat(70));
console.log(`全谱有效人物 ${tot} 人，按父子关系的依据强度分：`);
console.log(`  A 三重印证（点名＋写父名＋正下一行）  ${String(G.A.length).padStart(4)} 人  ${pc(G.A.length)}`);
console.log(`  B 两重印证                            ${String(G.B.length).padStart(4)} 人  ${pc(G.B.length)}`);
console.log(`  C 谱写了一侧（父点名 或 本人写父名）               ${String(G.C.length).padStart(4)} 人  ${pc(G.C.length)}`);
console.log(`  D 只靠同名撞上，谱两侧都没写 ← 真风险      ${String(G.D.length).padStart(4)} 人  ${pc(G.D.length)}`);
console.log(`  E 分叉，界面摊开（不是错）            ${String(G.E.length).padStart(4)} 人  ${pc(G.E.length)}`);
console.log(`  F 一条边都没有                        ${String(G.F.length).padStart(4)} 人  ${pc(G.F.length)}`);
console.log('═'.repeat(70));

const dd = G.D.map(x => ({ ...x, n: desc(x.p.pid) })).sort((a, b) => b.n - a.n);
const reach = new Set();
for (const x of dd) { reach.add(x.p.pid); for (const k of kids.get(x.p.pid) ?? []) reach.add(k); }
console.log(`\n【D 级 ${G.D.length} 人：只有一条弱边，界面上就那么显示了】`);
console.log(`  其中挂着后代的 ${dd.filter(x => x.n > 0).length} 人，`
  + `牵连 ${dd.reduce((a, x) => a + x.n, 0)} 人次\n`);
for (const x of dd.slice(0, 30))
  console.log(`   第${String(x.p.gen).padStart(2)}世 ${x.p.name.padEnd(4)}`
    + ` 父定为 ${(x.f?.name ?? '?').padEnd(4)} rank${x.e.rank}`
    + `  后代 ${String(x.n).padStart(3)} 人  ${x.p.src_human}`);
if (dd.length > 30) console.log(`   …还有 ${dd.length - 30} 人`);

console.log(`\n【E 级：界面上摊开分叉的，按牵连人数排】`);
const ee = G.E.map(x => ({ ...x, d: desc(x.p.pid) })).sort((a, b) => b.d - a.d);
for (const x of ee.slice(0, 12))
  console.log(`   第${String(x.p.gen).padStart(2)}世 ${x.p.name.padEnd(4)} ${x.n} 个候选`
    + `  后代 ${String(x.d).padStart(3)} 人  ${x.p.src_human}`);
if (ee.length > 12) console.log(`   …还有 ${ee.length - 12} 人`);

console.log(`\n【F 级：一条边都没有，按世次】`);
const ff = {};
for (const p of G.F) ff[p.gen] = (ff[p.gen] ?? 0) + 1;
console.log('   ' + Object.entries(ff).sort((a, b) => a[0] - b[0])
  .map(([g, n]) => `第${g}世 ${n}人`).join('　'));

// ── 按房分：如果判据被人为往某一支调过，那一房的 A 级比例会明显冒头
const H = new Map();
for (const k of ['A','B','C','D','E','F'])
  for (const x of G[k]) {
    const p = x.p ?? x;
    const s = p.src.section;
    const r = H.get(s) ?? H.set(s, { A:0,B:0,C:0,D:0,E:0,F:0, n:0 }).get(s);
    r[k]++; r.n++;
  }
console.log(`\n【按房分——承健自己在「学仁公世系」】`);
console.log(`   ${'房'.padEnd(16)}人数   A+B(谱两处以上)   D(只靠同名)`);
const rows = [...H].filter(([, r]) => r.n >= 20)
  .map(([s, r]) => ({ s, r, ab: (r.A + r.B) * 100 / r.n, d: r.D * 100 / r.n }))
  .sort((a, b) => b.ab - a.ab);
for (const { s, r, ab, d } of rows)
  console.log(`   ${s.padEnd(16)}${String(r.n).padStart(4)}   ${ab.toFixed(1).padStart(6)}%`
    + `           ${d.toFixed(2).padStart(5)}%${s === '学仁公世系' ? '   ← 承健这一房' : ''}`);
const all = rows.reduce((a, x) => a + x.r.A + x.r.B, 0) / rows.reduce((a, x) => a + x.r.n, 0) * 100;
console.log(`   ${'（全谱平均）'.padEnd(15)}        ${all.toFixed(1).padStart(6)}%`);
