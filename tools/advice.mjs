/**
 * 承健提的三条建议，逐条量。
 *
 *   ① 「辈分可能不准，但**字**大多数时候是准的——哪怕重名，字也重名的可能性太小」
 *   ② 「**页眉**我觉得也可以解决很多问题，页眉指向没接上」
 *   ③ 「排版拆分的时候可能切漏了」
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { fname } from '../src/core/fname.ts';
import { norm } from '../src/core/norm.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const all = people.filter(p => !isFragment(p));
const W = (s) => norm(s ?? '').replace(/[\s　]/g, '');
const bare = (s) => fname(s).replace(/公$/, '');
const ziOf = (p) => W(p.zi?.text) || '';

// ───────── ① 字有多能分人
const byName = new Map();
for (const p of all) {
  if (p.gen == null) continue;
  const k = `${p.gen}|${bare(p.name)}`;
  (byName.get(k) ?? byName.set(k, []).get(k)).push(p);
}
const groups = [...byName.values()].filter(v => v.length > 1);
let allHaveZi = 0, ziAllDiff = 0, ziSome = 0, ziNone = 0, pairs = 0, pairsDiff = 0;
for (const g of groups) {
  const zis = g.map(ziOf);
  const nZi = zis.filter(Boolean).length;
  if (nZi === 0) ziNone++;
  else if (nZi < g.length) ziSome++;
  else {
    allHaveZi++;
    if (new Set(zis).size === g.length) ziAllDiff++;
  }
  for (let i = 0; i < g.length; i++)
    for (let j = i + 1; j < g.length; j++) {
      if (!zis[i] || !zis[j]) continue;
      pairs++;
      if (zis[i] !== zis[j]) pairsDiff++;
    }
}
const pc = (a, b) => b ? (a * 100 / b).toFixed(1) + '%' : '—';
console.log('═'.repeat(70));
console.log('【① 「字」能不能分开同名的人】');
console.log(`   同世同名的组                        ${groups.length} 组`
  + `（涉及 ${groups.reduce((a, g) => a + g.length, 0)} 人）`);
console.log(`   组里每个人都写了字                  ${allHaveZi} 组`);
console.log(`     其中字**两两不同**                ${ziAllDiff} 组  ${pc(ziAllDiff, allHaveZi)}`);
console.log(`   只有部分人写了字                    ${ziSome} 组`);
console.log(`   一个都没写字                        ${ziNone} 组`);
console.log(`   ── 两两比对：两人都有字的 ${pairs} 对，字不同的 ${pairsDiff} 对  ${pc(pairsDiff, pairs)}`);
console.log('   → 字确实几乎不重。**能用它的地方，它就是最好的判别依据。**');

// ───────── ② 页眉
const head = all.filter(p => /页眉/.test(p.father_src ?? ''));
let headOk = 0, headNo = 0, headAmbig = 0;
const headBad = [];
for (const p of head) {
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;
  if (!line.length) { headNo++; headBad.push({ p, why: '一条边都没有' }); }
  else if (line.length > 1) { headAmbig++; headBad.push({ p, why: `${line.length} 个候选` }); }
  else headOk++;
}
console.log('');
console.log('【② 页眉指向的那批人现在怎么样】');
console.log(`   father_src 写「页眉指向」的         ${head.length} 人`);
console.log(`   已经唯一定下父亲                    ${headOk} 人  ${pc(headOk, head.length)}`);
console.log(`   还有几个候选                        ${headAmbig} 人`);
console.log(`   一条边都没有                        ${headNo} 人`);
// 页眉原文倒读之后，能不能在上一世找到那个人
const RE = /页眉指向「(.+?)」/;
let solvable = 0;
for (const { p, why } of headBad) {
  const m = RE.exec(p.father_src ?? '');
  if (!m) continue;
  const rev = [...m[1]].reverse().join('');
  const nm = W(rev).replace(/^(.+?)(长子|次子|三子|四子|五子|六子|七子|八子|九子|幼子|之子|季子|末子|嗣子|祧子)$/, '$1').replace(/公$/, '');
  const hit = all.filter(q => q.gen === (p.gen ?? 0) - 1 && bare(q.name) === nm);
  if (hit.length === 1) solvable++;
}
console.log(`   ── 把页眉倒读回来（「子长公厚德」→「德厚公长子」），`);
console.log(`      上一世能唯一找到那个人的：${solvable} / ${headBad.length} 人`);

console.log('');
console.log('【③ 排版切漏——现有的几个口子】');
const noRaw = all.filter(p => W(p.raw_text).length < 8);
const unparsed = all.filter(p => (p.unparsed ?? []).some(u => W(u.text).length >= 4));
console.log(`   原文不到 8 个字的（多半被切碎了）    ${noRaw.length} 人`);
console.log(`   有整行原文没归到任何字段              ${unparsed.length} 人`);
console.log('═'.repeat(70));
if (headBad.length) {
  console.log('\n【页眉那批里还没定下来的】');
  for (const { p, why } of headBad.slice(0, 20))
    console.log(`   ${p.name.padEnd(4)}第${String(p.gen).padStart(2)}世 ${p.src_human}`
      + `　${why}　页眉「${(RE.exec(p.father_src ?? '') ?? [])[1] ?? ''}」`);
  if (headBad.length > 20) console.log(`   …还有 ${headBad.length - 20} 人`);
}
