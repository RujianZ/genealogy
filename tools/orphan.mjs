/**
 * 谱上明明写了父名，却一条边都接不上的人 —— 有多少？
 *
 * 承贵那条暴露的：他自己写「开聪公之祧子」，开聪就在他正上一行，
 * 可 parent_edges 是空的——上游把父名切成「开聪公之」，配不上任何人。
 *
 * 这类叫「写了父名的孤儿」。分三种，处理办法不一样：
 *   ① 父名对得上、且此人就在下一行     —— 谱写死了，接上就是，不算猜
 *   ② 父名对得上，但有好几个同名的     —— 全列出来，让人选（不猜）
 *   ③ 全谱这一世没这个名字             —— 谱写了个我们找不到的人，只能存疑
 */
import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { fname } from '../src/core/fname.ts';
import { norm } from '../src/core/norm.ts';
import { isFragment } from '../src/core/fragment.ts';

const people = withBacklinks(JSON.parse(readFileSync('data/people.json', 'utf8')));
const NS = (s) => norm(s ?? '').replace(/[\s　]/g, '');
const bare = (s) => fname(s).replace(/公$/, '');

const byGen = new Map();
for (const p of people) {
  if (p.gen == null || isFragment(p)) continue;
  for (const f of [bare(p.name), ...p.aliases.map(a => bare(a.form))]) {
    if (!f) continue;
    const k = `${p.gen}|${f}`;
    (byGen.get(k) ?? byGen.set(k, []).get(k)).push(p);
  }
}

const A = [], B = [], C = [];
for (const p of people) {
  if (isFragment(p) || p.gen == null) continue;
  const w = bare(p.father_name);
  if (!w) continue;
  // 已经有边指向这个名字的，跳过
  const has = p.parent_edges.some(e => {
    const f = people.find(x => x.pid === e.parent);
    return f && (bare(f.name) === w || f.aliases.some(a => bare(a.form) === w));
  });
  if (has) continue;
  const cand = [...new Set(byGen.get(`${p.gen - 1}|${w}`) ?? [])];
  if (!cand.length) { C.push({ p, w }); continue; }
  const row = cand.filter(f => f.src.vol === p.src.vol && f.src.section === p.src.section
    && f.src.row === p.src.row - 1);
  if (row.length === 1) A.push({ p, w, f: row[0] });
  else B.push({ p, w, cand, row });
}

console.log('═'.repeat(66));
console.log(`谱上写了父名、却一条边也接不上的人`);
console.log(`  ① 同房、正上一行，唯一一个        ${A.length} 人  ← 谱写死了`);
console.log(`  ② 有同名候选，但不止一个／不在上一行 ${B.length} 人  ← 要全列出来`);
console.log(`  ③ 全谱上一世没这个名字             ${C.length} 人  ← 存疑`);
console.log('═'.repeat(66));

console.log(`\n【① 同房正上一行，唯一】`);
for (const { p, w, f } of A.slice(0, 40))
  console.log(`   ${p.name}（第${p.gen}世 ${p.src.page}页${p.src.row}行）写「${p.father_name}${p.filiation ?? ''}」`
    + `　→　${f.name}（${f.src.page}页${f.src.row}行）生子${JSON.stringify(f.sons_claimed)}`);
if (A.length > 40) console.log(`   …还有 ${A.length - 40} 人`);

console.log(`\n【② 候选不止一个】`);
for (const { p, w, cand, row } of B.slice(0, 20))
  console.log(`   ${p.name}（第${p.gen}世 ${p.src_human}）写「${p.father_name}」`
    + `　→　同名 ${cand.length} 个，正上一行的 ${row.length} 个`);
if (B.length > 20) console.log(`   …还有 ${B.length - 20} 人`);

console.log(`\n【③ 找不到这个父亲】`);
for (const { p, w } of C.slice(0, 25))
  console.log(`   ${p.name}（第${p.gen}世 ${p.src_human}）写「${p.father_name}」，第${p.gen - 1}世无此名`);
if (C.length > 25) console.log(`   …还有 ${C.length - 25} 人`);
