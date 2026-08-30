/**
 * 字段有没有安错人？——不靠感觉，靠谱自己写了两遍的地方对。
 *
 * 承健问的是：「会不会我们大部分人都有这个问题，其实记错了很多」。
 * 那就得量。能量的有三层，一层比一层硬：
 *
 *   ① 数目自洽    谱写「生子三」，后面就该跟三个名字。
 *                 切错格子最先露馅的就是这里——名字多了或少了。
 *
 *   ② 双向点名    父亲那条写「生子一 梦聪」，儿子那条写「父名 榔」。
 *                 谱在**两个不同的地方各写了一次**。对上了，就不是我们拼的。
 *
 *   ③ 行列相邻    五世一图，一行一世。儿子应该在父亲的**正下一行、同页同列**。
 *                 这一层完全独立於名字——它只看排版坐标。
 *
 * 三层都过 = 谱上三处互不相干的写法指向同一件事。
 * 那就不是「我们记的」，是「谱写的」。
 */
import { readFileSync } from 'node:fs';
import { roster } from '../src/core/roster.ts';
import { norm } from '../src/core/norm.ts';
import { isFragment } from '../src/core/fragment.ts';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = (s) => norm(s ?? '').replace(/[\s　]/g, '');
/** 去敬称。谱上父名常写「梦林公」，本人条目里就写「梦林」 */
const bare = (s) => NS(s).replace(/公$/, '');

const real = people.filter(p => !isFragment(p));
const byPid = new Map(people.map(p => [p.pid, p]));

/** 同卷同房、下一世、名字对得上的人 */
const bucket = new Map();
for (const p of real) {
  if (p.gen == null) continue;
  const k = `${p.src.vol}|${p.src.section}|${p.gen}|${bare(p.name)}`;
  (bucket.get(k) ?? bucket.set(k, []).get(k)).push(p);
}

// ───────────────────────────────────────── ① 数目自洽
let decl = 0, declOk = 0;
const declBad = [];
for (const p of real) {
  const r = roster(p);
  // 谱上一个人可能有好几段「生子N」（一位妻子一段），全部相加
  let want = 0, saw = false;
  for (const m of (p.raw_text ?? '').matchAll(/生子([一二三四五六七八九十两])/g)) {
    want += { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,两:2 }[m[1]];
    saw = true;
  }
  if (!saw || !want) continue;
  decl++;
  if (r.sons.length === want) declOk++;
  else declBad.push({ p, want, got: r.sons.length });
}

// ───────────────────────────────────────── ②③ 双向 + 行列
let claims = 0, twoWay = 0, adj = 0, both3 = 0, contra = 0, noRec = 0;
const contraList = [], adjBad = [];

for (const f of real) {
  if (f.gen == null) continue;
  for (const s of roster(f).sons) {
    const nm = bare(s.name || s.raw);
    if (!nm || s.died) continue;          // 「幼殁」谱上本来就不立条目
    claims++;
    const cands = bucket.get(`${f.src.vol}|${f.src.section}|${f.gen + 1}|${nm}`) ?? [];
    if (!cands.length) { noRec++; continue; }
    // 儿子那条自己写的父名，对不对得上父亲的名字
    const named = cands.filter(c => bare(c.father_name) === bare(f.name));
    if (!named.length) { contra++; contraList.push({ f, nm, cands }); continue; }
    twoWay++;
    // 行列：同册同页同列，行号正好 +1
    const near = named.filter(c =>
      c.src.vol === f.src.vol && c.src.page === f.src.page &&
      c.src.col === f.src.col && c.src.row === f.src.row + 1);
    if (near.length) { adj++; both3++; }
    else adjBad.push({ f, nm, named });
  }
}

const pc = (a, b) => b ? (a * 100 / b).toFixed(2) + '%' : '—';
console.log('═'.repeat(64));
console.log(`① 谱写「生子N」的人           ${decl} 位`);
console.log(`   后面正好跟着 N 个名字        ${declOk} 位   ${pc(declOk, decl)}`);
console.log('');
console.log(`② 父亲点名的儿子（活到立条目） ${claims} 处`);
console.log(`   儿子那条也写了这个父名       ${twoWay} 处   ${pc(twoWay, claims)}  ← 谱两处互相印证`);
console.log(`   儿子那条写的是别的父名       ${contra} 处   ${pc(contra, claims)}  ← 要看`);
console.log(`   全谱找不到这个儿子的条目     ${noRec} 处   ${pc(noRec, claims)}`);
console.log('');
console.log(`③ 双向印证的里面，儿子正好在   ${adj} 处   ${pc(adj, twoWay)}`);
console.log(`   父亲的下一行同页同列`);
console.log('');
console.log(`★ 名字·父名·排版坐标 三处都对上  ${both3} 处   ${pc(both3, claims)}`);
console.log('═'.repeat(64));

console.log(`\n【数目对不上的 ${declBad.length} 位】`);
for (const { p, want, got } of declBad.slice(0, 15))
  console.log(`   ${p.name.padEnd(4)} ${p.src_human}  写「生子${want}」跟了 ${got} 个名`);
if (declBad.length > 15) console.log(`   …还有 ${declBad.length - 15} 位`);

console.log(`\n【父名对不上的 ${contraList.length} 处】`);
for (const { f, nm, cands } of contraList.slice(0, 15))
  console.log(`   ${f.name}（${f.src_human}）点名「${nm}」，`
    + `而${nm}那条写父名「${cands.map(c => c.father_name || '空').join('/')}」`);
if (contraList.length > 15) console.log(`   …还有 ${contraList.length - 15} 处`);

console.log(`\n【双向对上、但不在正下一行的 ${adjBad.length} 处】`);
for (const { f, nm, named } of adjBad.slice(0, 20))
  console.log(`   ${f.name}(${f.src.page}页${f.src.row}行${f.src.col}列) → `
    + `${nm}(${named.map(c => `${c.src.page}页${c.src.row}行${c.src.col}列`).join('/')})`);
if (adjBad.length > 20) console.log(`   …还有 ${adjBad.length - 20} 处`);
