/**
 * 「子女栏里有没有塞进别人」——承健说的那种真错，只数这一种。
 *
 * ★ 他举的两个例子，是这个项目里最该防住的错法：
 *     爷爷继均的卡片上出现**三个开志**   —— 全谱有好几个开志，都被挂了上来
 *     太爷爷壁火多出一个过继来的孩子     —— 别人家的嗣子被算到他名下
 *
 *   这不是「印证不够硬」，是**明确的错**：卡片上摆着一个不是他的人。
 *
 * ★ 只查三样，都是「多出来的人」：
 *     ① 同名重挂 —— 子女栏里两个人同名（全谱好几个开志，一起挂上来了）
 *     ② 弱挂     —— 某个孩子自己都不知道父亲是谁（他有好几个候选父亲），
 *                   却被列在这个人的子女栏里
 *     ③ 超额     —— 子女人数超过谱自己写的「生子N ＋ 女N」
 *
 *   三样都没有 = 他的子女栏里没有多出来的人。
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

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const bare = (s) => fname(s).replace(/公$/, '');
const all = people.filter(p => !isFragment(p));

// 认定成立的父 → 子
const KIDS = new Map();
const nDads = new Map();
for (const p of all) {
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  const bio = keep.filter(c => c.edge.kind === '生父');
  nDads.set(p.pid, (bio.length ? bio : keep).length);
  for (const c of keep)
    (KIDS.get(c.edge.parent) ?? KIDS.set(c.edge.parent, []).get(c.edge.parent))
      .push({ child: p, edge: c.edge });
}

const bad = new Map();
const mark = (p, k, d) => (bad.get(p.pid) ?? bad.set(p.pid, []).get(p.pid)).push({ k, d });

for (const f of all) {
  const ks = KIDS.get(f.pid) ?? [];
  if (!ks.length) continue;
  // ① 同名重挂
  const byName = new Map();
  for (const k of ks) {
    const n = bare(k.child.name);
    (byName.get(n) ?? byName.set(n, []).get(n)).push(k);
  }
  for (const [n, v] of byName)
    if (v.length > 1)
      mark(f, '①同名重挂', `${v.length} 个都叫「${n}」`
        + `（${v.map(x => x.child.src.page + '页').join('、')}）`);
  // ② 弱挂：这个孩子自己都有好几个候选父亲
  for (const k of ks)
    if ((nDads.get(k.child.pid) ?? 1) > 1 && k.edge.kind === '生父')
      mark(f, '②弱挂', `${k.child.name}自己有 ${nDads.get(k.child.pid)} 个候选父亲`);
  // ③ 超额
  const r = roster(f);
  const declared = r.sons.length + r.daughters.length;
  const shown = new Set(ks.map(k => k.child.pid)).size;
  if (declared && shown > declared)
    mark(f, '③超额', `谱写 ${declared} 个，摆出 ${shown} 个`);
}

const withKids = all.filter(p => (KIDS.get(p.pid) ?? []).length);
const clean = withKids.filter(p => !bad.has(p.pid));
const pc = (a, b) => (a * 100 / b).toFixed(1) + '%';
console.log('═'.repeat(70));
console.log(`全谱 ${all.length} 人，其中有子女的 ${withKids.length} 人`);
console.log('');
console.log(`★ 子女栏干净（没有多出来的人）  ${String(clean.length).padStart(4)} 人  ${pc(clean.length, withKids.length)}`);
console.log(`  子女栏里有多出来的人          ${String(bad.size).padStart(4)} 人  ${pc(bad.size, withKids.length)}`);
console.log('');
const cnt = {};
for (const v of bad.values()) for (const k of new Set(v.map(x => x.k))) cnt[k] = (cnt[k] ?? 0) + 1;
for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1]))
  console.log(`     ${String(v).padStart(4)} 人  ${k}`);
console.log('═'.repeat(70));

console.log('\n【承健举的那两个】');
for (const [nm, pg] of [['继均', 205], ['壁火', 205]]) {
  for (const p of all.filter(x => x.name === nm && x.src.page === pg)) {
    const ks = KIDS.get(p.pid) ?? [];
    const r = roster(p);
    console.log(`── ${nm}　${p.src_human}`);
    console.log(`   谱上写：生子${r.sons.length}「${r.sons.map(x => x.name || x.raw).join('、')}」`
      + (r.daughters.length ? `　女${r.daughters.length}` : ''));
    console.log(`   我们摆出来的子女：`);
    for (const k of ks)
      console.log(`      ${k.child.name}（第${k.child.gen}世 ${k.child.src.page}页）`
        + ` ${k.edge.kind} rank${k.edge.rank}`);
    console.log(`   ${bad.has(p.pid) ? '✘ ' + bad.get(p.pid).map(x => x.k + '：' + x.d).join('；')
      : '✔ 没有多出来的人'}`);
  }
}

console.log(`\n【子女栏有问题的，按牵连排（前 20）】`);
const rows = [...bad].map(([pid, v]) => ({ p: idx.get(pid), v }))
  .sort((a, b) => b.v.length - a.v.length);
for (const { p, v } of rows.slice(0, 20))
  console.log(`   第${String(p.gen).padStart(2)}世 ${p.name.padEnd(4)} ${p.src_human}`
    + `\n        ${v.map(x => x.k + '：' + x.d).join('；')}`);
if (rows.length > 20) console.log(`   …还有 ${rows.length - 20} 人`);
