/**
 * attrib.mjs 的第二遍：判据改对，再把异常归类。
 *
 * ★ 上一遍第③层写窄了。我卡的是「同页同列、行号+1」，
 *   可五世一图是**长子占本图往下走，次子幼子另起一图**——
 *   新图的第 2 行接上一代。页变了列变了，**行号照旧 +1**。
 *   行号跟着世次走，不跟着页走。所以只该看行号。
 *
 * ★ 第②层那 165 处父名对不上，要问的是：是 165 件事，还是一件事的 165 次？
 *   看两条：
 *     兄弟连排——两个「父亲」是亲兄弟（同房同世同父名），
 *               谱上并排两格，生子块被切到隔壁去了。一件事。
 *     混进字段——父名里带着「字」「公」「殁」这些结构词，纯解析错。一件事。
 */
import { readFileSync } from 'node:fs';
import { roster } from '../src/core/roster.ts';
import { norm } from '../src/core/norm.ts';
import { isFragment } from '../src/core/fragment.ts';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = (s) => norm(s ?? '').replace(/[\s　]/g, '');
const bare = (s) => NS(s).replace(/公$/, '');

const real = people.filter(p => !isFragment(p));
const bucket = new Map();
for (const p of real) {
  if (p.gen == null) continue;
  const k = `${p.src.vol}|${p.src.section}|${p.gen}|${bare(p.name)}`;
  (bucket.get(k) ?? bucket.set(k, []).get(k)).push(p);
}
/** 同房同世同父名 = 亲兄弟 */
const sibKey = (p) => `${p.src.vol}|${p.src.section}|${p.gen}|${bare(p.father_name)}`;

let claims = 0, twoWay = 0, rowOk = 0, samePage = 0, contra = 0, noRec = 0;
const C = { sib: [], junk: [], other: [] };
const rowBad = [];

for (const f of real) {
  if (f.gen == null) continue;
  for (const s of roster(f).sons) {
    const nm = bare(s.name || s.raw);
    if (!nm || s.died) continue;
    claims++;
    const cands = bucket.get(`${f.src.vol}|${f.src.section}|${f.gen + 1}|${nm}`) ?? [];
    if (!cands.length) { noRec++; continue; }
    const named = cands.filter(c => bare(c.father_name) === bare(f.name));
    if (!named.length) {
      contra++;
      const wrote = cands[0];
      // 父名里混进了结构词 = 纯解析错
      if (/[字号讳名殁卒生葬娶妣配]/.test(NS(wrote.father_name)) || !wrote.father_name)
        C.junk.push({ f, nm, wrote });
      // 儿子写的那个「父亲」跟本人是亲兄弟 = 生子块切到隔壁格了
      else if (real.some(x => bare(x.name) === bare(wrote.father_name)
               && x.gen === f.gen && sibKey(x) === sibKey(f)))
        C.sib.push({ f, nm, wrote });
      else C.other.push({ f, nm, wrote });
      continue;
    }
    twoWay++;
    // ★ 只看行号：儿子在父亲的下一行
    const nx = named.filter(c => c.src.row === f.src.row + 1);
    if (nx.length) {
      rowOk++;
      if (nx.some(c => c.src.page === f.src.page && c.src.col === f.src.col)) samePage++;
    } else rowBad.push({ f, nm, named });
  }
}

const pc = (a, b) => b ? (a * 100 / b).toFixed(2) + '%' : '—';
console.log('═'.repeat(66));
console.log(`父亲点名的儿子（活到立条目）      ${claims} 处`);
console.log(`  ② 儿子那条也写了这个父名         ${twoWay} 处  ${pc(twoWay, claims)}`);
console.log(`  ③ 其中儿子正好在父亲的下一行     ${rowOk} 处  ${pc(rowOk, twoWay)}`);
console.log(`       —— 同一张图里往下走          ${samePage} 处  ${pc(samePage, rowOk)}`);
console.log(`       —— 另起一图，行号照旧接上    ${rowOk - samePage} 处  ${pc(rowOk - samePage, rowOk)}`);
console.log('');
console.log(`★ 名字·父名·世次行号 三处都对上   ${rowOk} 处  ${pc(rowOk, claims)}`);
console.log('');
console.log(`  行号对不上（要看）               ${rowBad.length} 处  ${pc(rowBad.length, twoWay)}`);
console.log(`  父名对不上                       ${contra} 处  ${pc(contra, claims)}`);
console.log(`     · 父名里混进结构词（解析错）  ${C.junk.length} 处`);
console.log(`     · 写的是本人的亲兄弟（切错格）${C.sib.length} 处`);
console.log(`     · 其他                        ${C.other.length} 处  ← 只有这些是真要人看的`);
console.log(`  全谱找不到这个儿子的条目         ${noRec} 处  ${pc(noRec, claims)}`);
console.log('═'.repeat(66));

const show = (t, L, n = 12) => {
  console.log(`\n【${t}　${L.length} 处】`);
  for (const { f, nm, wrote } of L.slice(0, n))
    console.log(`   ${f.name}（${f.src_human}）点名「${nm}」`
      + `　→　${nm} 那条写父名「${wrote.father_name || '空'}」`);
  if (L.length > n) console.log(`   …还有 ${L.length - n} 处`);
};
show('父名里混进结构词', C.junk);
show('写的是本人的亲兄弟', C.sib);
show('其他', C.other, 40);

console.log(`\n【行号对不上　${rowBad.length} 处】`);
for (const { f, nm, named } of rowBad.slice(0, 25))
  console.log(`   ${f.name}(第${f.gen}世 ${f.src.page}页${f.src.row}行) → `
    + `${nm}(第${named[0].gen}世 ${named.map(c => `${c.src.page}页${c.src.row}行`).join('/')})`);
if (rowBad.length > 25) console.log(`   …还有 ${rowBad.length - 25} 处`);
