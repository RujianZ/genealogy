/**
 * 第三遍：把两个大桶挖开——「其他 99 处」和「找不到条目 565 处」。
 * 问的都是同一句话：这是 N 件事，还是一件事的 N 次？
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
/** 全谱同世同名的人（不限房），用来查「找不到」是不是其实在别的房 */
const byGenName = new Map();
for (const p of real) {
  if (p.gen == null) continue;
  const k = `${p.gen}|${bare(p.name)}`;
  (byGenName.get(k) ?? byGenName.set(k, []).get(k)).push(p);
}
const sibKey = (p) => `${p.src.vol}|${p.src.section}|${p.gen}|${bare(p.father_name)}`;

const O = { sameGenNear: [], genChar: [], sameGenFar: [], odd: [] };
const N = { otherHouse: [], nowhere: [] };

for (const f of real) {
  if (f.gen == null) continue;
  for (const s of roster(f).sons) {
    const nm = bare(s.name || s.raw);
    if (!nm || s.died) continue;
    const cands = bucket.get(`${f.src.vol}|${f.src.section}|${f.gen + 1}|${nm}`) ?? [];

    // ── 找不到条目
    if (!cands.length) {
      const any = byGenName.get(`${f.gen + 1}|${nm}`) ?? [];
      if (any.length) N.otherHouse.push({ f, nm, any });
      else N.nowhere.push({ f, nm, s });
      continue;
    }

    const named = cands.filter(c => bare(c.father_name) === bare(f.name));
    if (named.length) continue;

    const w = cands[0], wf = bare(w.father_name);
    if (!wf || /[字号讳名殁卒生葬娶妣配]/.test(wf)) continue;   // 已归到「结构词」
    if (real.some(x => bare(x.name) === wf && x.gen === f.gen && sibKey(x) === sibKey(f)))
      continue;                                                 // 已归到「亲兄弟」

    const mine = bare(f.name);
    // 只差辈字：第二个字相同，头一个字不同（梁柱 ↔ 壁柱）
    if (wf.length === mine.length && wf.length >= 2
        && wf.slice(1) === mine.slice(1) && wf[0] !== mine[0]) {
      O.genChar.push({ f, nm, w, wf });
      continue;
    }
    // 儿子写的那个「父亲」也是同一世的人 —— 隔壁格
    const alt = (byGenName.get(`${f.gen}|${wf}`) ?? []);
    if (alt.length) {
      const near = alt.filter(x => x.src.vol === f.src.vol
        && Math.abs(x.src.page - f.src.page) <= 4);
      (near.length ? O.sameGenNear : O.sameGenFar).push({ f, nm, w, wf, alt: near[0] ?? alt[0] });
    } else O.odd.push({ f, nm, w, wf });
  }
}

const T = O.sameGenNear.length + O.genChar.length + O.sameGenFar.length + O.odd.length;
console.log('═'.repeat(66));
console.log(`【「其他」那一桶　共 ${T} 处】`);
console.log(`  儿子写的父亲是同一世、且在附近 4 页内   ${O.sameGenNear.length} 处  ← 隔壁格串了`);
console.log(`  只差一个辈字（梁柱 ↔ 壁柱）             ${O.genChar.length} 处  ← 辈字取错`);
console.log(`  是同一世的人，但隔得远                  ${O.sameGenFar.length} 处`);
console.log(`  全谱这一世根本没这个人                  ${O.odd.length} 处  ← 真要人看`);
console.log('');
const NT = N.otherHouse.length + N.nowhere.length;
console.log(`【「找不到条目」那一桶　共 ${NT} 处】`);
console.log(`  这一世别的房里有同名的人                ${N.otherHouse.length} 处`);
console.log(`  全谱这一世根本没这个名字                ${N.nowhere.length} 处  ← 谱上只点了名，没立条目`);
console.log('═'.repeat(66));

const show = (t, L, fmt, n = 15) => {
  console.log(`\n【${t}　${L.length} 处】`);
  for (const x of L.slice(0, n)) console.log('   ' + fmt(x));
  if (L.length > n) console.log(`   …还有 ${L.length - n} 处`);
};
show('隔壁格串了（举例）', O.sameGenNear,
  ({ f, nm, w, wf, alt }) => `${f.name}(${f.src.page}页${f.src.row}行${f.src.col}列) 点名「${nm}」`
    + `　→　${nm}(${w.src.page}页${w.src.row}行${w.src.col}列) 写父名「${wf}」`
    + `，而${wf}在 ${alt.src.page}页${alt.src.row}行${alt.src.col}列`);
show('辈字取错', O.genChar, ({ f, nm, wf }) => `${f.name} 点名「${nm}」→ ${nm} 写父名「${wf}」`);
show('隔得远', O.sameGenFar,
  ({ f, nm, w, wf, alt }) => `${f.name}(${f.src_human}) 点名「${nm}」→ 写父名「${wf}」`
    + `（${wf} 在 ${alt.src_human}）`);
show('全谱这一世没这个人', O.odd, ({ f, nm, wf }) => `${f.name} 点名「${nm}」→ ${nm} 写父名「${wf}」`, 30);
show('只点了名、没立条目（举例）', N.nowhere,
  ({ f, nm }) => `${f.name}（${f.src_human}）点名「${nm}」，全谱第${f.gen + 1}世无此人`, 20);
show('同名在别的房（举例）', N.otherHouse,
  ({ f, nm, any }) => `${f.name}（${f.src.section}）点名「${nm}」`
    + `　→　${nm} 只在 ${[...new Set(any.map(a => a.src.section))].join('、')}`, 20);
