/**
 * 「我们有没有在他身上写错东西」——不问印证几重，只问会不会错。
 *
 * ★ 承健把标准改对了。「谱只写了一遍」和「我们写错了」是两回事：
 *   谱写一遍、我们如实照抄，那不是错，是谱的极限。
 *
 *   **真正的错只有一种：把不确定的东西当成确定的写出去。**
 *
 *   所以界面上明说「不知道」的，一律不算错：
 *     岔路（留了两个候选，两条都画出来）—— 说了不知道
 *     断链（一条父边都没有，显示断了）  —— 说了不知道
 *     「生殁缺」「月日时未详」原样显示   —— 谱自己写的「缺」
 *
 * ★ 会错的地方只有五处，因为只有这五处我们把话说死了：
 *
 *   ① 父亲只剩一条边、而这条边只靠同名撞上   —— 说死了，可能撞错人
 *   ② 谱写「生子N」，跟着的名字不是 N 个       —— 字段可能切到隔壁格
 *   ③ 本人写的父名，跟我们认定的父亲对不上     —— 两边冲突，我们选了一边
 *   ④ 年代兜不拢（父子年份对不上）             —— 至少有一处是错的
 *   ⑤ 本人原文里有整行没归到任何字段           —— 那一行的内容丢了或安错了
 *
 *   一个 flag 都没有 = 据我们所知，没在他身上写错任何东西。
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
const forms = (p) => [bare(p.name), ...p.aliases.map(a => bare(a.form))];
const NUM = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,两:2 };

const flags = new Map();
const add = (p, k) => (flags.get(p.pid) ?? flags.set(p.pid, []).get(p.pid)).push(k);
const all = people.filter(p => !isFragment(p));

for (const p of all) {
  const cs = candidates(idx, p, chart, win);
  const keep = cs.filter(c => c.status === 'ok');
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;

  // ① 父亲被唯一认定，但两边都没写过这层关系，纯靠同名
  if (line.length === 1) {
    const f = idx.get(line[0].edge.parent);
    const named = f && roster(f).sons.some(x => forms(p).includes(bare(x.name || x.raw)));
    const wrote = f && !!bare(p.father_name) && forms(f).includes(bare(p.father_name));
    if (!named && !wrote) add(p, '①父亲只靠同名撞上');
    // ③ 本人写了父名，却跟认定的父亲对不上
    if (bare(p.father_name) && !wrote && !line[0].edge.kind.includes('嗣'))
      add(p, '③本人写的父名跟认定的父亲不符');
  }

  // ② 谱写「生子N」，跟着的名字不是 N 个
  let want = 0, saw = false;
  for (const m of (p.raw_text ?? '').matchAll(/生子([一二三四五六七八九十两])/g)) {
    want += NUM[m[1]]; saw = true;
  }
  if (saw && want && roster(p).sons.length !== want) add(p, '②生子N跟名字数对不上');

  // ④ 年代兜不拢
  if (cs.some(c => c.conflict)) add(p, '④年代兜不拢');
  const w = win.get(p.pid);
  if (w?.conflict) add(p, '④年代兜不拢');

  // ⑤ 有整行原文没归到任何字段
  if ((p.unparsed ?? []).some(u => (u.text ?? '').replace(/[\s　]/g, '').length >= 4))
    add(p, '⑤有原文没归到字段');
}

const clean = all.filter(p => !flags.has(p.pid));
const n = all.length, pc = (a) => (a * 100 / n).toFixed(1) + '%';
const cnt = {};
for (const ks of flags.values()) for (const k of new Set(ks)) cnt[k] = (cnt[k] ?? 0) + 1;

console.log('═'.repeat(70));
console.log(`全谱有独立条目的 ${n} 人`);
console.log('');
console.log(`★ 一个疑点都没有                  ${String(clean.length).padStart(4)} 人  ${pc(clean.length)}`);
console.log(`  有至少一处可能是我们弄错的      ${String(flags.size).padStart(4)} 人  ${pc(flags.size)}`);
console.log('═'.repeat(70));
console.log('\n【疑点分类，一个人可能占好几条】');
for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1]))
  console.log(`   ${String(v).padStart(4)} 人   ${k}`);

console.log('\n【按世次看「一个疑点都没有」的比例】');
const T = {}, C = {};
for (const p of all) T[p.gen] = (T[p.gen] ?? 0) + 1;
for (const p of clean) C[p.gen] = (C[p.gen] ?? 0) + 1;
for (const g of Object.keys(T).map(Number).sort((a, b) => a - b)) {
  const a = C[g] ?? 0, t = T[g];
  console.log(`   第${String(g).padStart(2)}世  ${String(a).padStart(3)}/${String(t).padStart(3)}`
    + `  ${String(Math.round(a * 100 / t)).padStart(3)}%  ${'█'.repeat(Math.round(a * 30 / t))}`);
}
const me = people.find(p => p.name === '承健' && p.gen === 27);
const dadp = idx.get(candidates(idx, me, chart, win).find(c => c.status === 'ok').edge.parent);
for (const [who, q] of [['承健', me], ['开赛（父）', dadp]])
  console.log(`\n${who}：${flags.has(q.pid) ? '疑点 ' + flags.get(q.pid).join('、') : '★ 一个疑点都没有'}`);
