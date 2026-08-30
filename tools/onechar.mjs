/**
 * 那 44 个「他写的父名，全谱上一世根本没有」——按**跟认定的父亲差几个字**分。
 *
 * 差一个字的，多半是录入误字或页眉倒读时掉字（泽久写「一正」而父亲叫「铣正」）。
 * 差得多的才是真不知道。
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
const all = people.filter(p => !isFragment(p));
const DOC = (p) => {
  const n = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 }[p.src?.juan ?? ''] ?? 0;
  return n >= 8 ? '合三（8、9）' : n >= 5 ? '合二（5、6、7）' : '合一（1.2.3.4）';
};
/** 两串差几个字（同长时逐位比；不同长按长度差算） */
const diff = (a, b) => {
  if (a.length !== b.length) return 9;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

const G = { one: [], namedOk: [], other: [] };
for (const p of all) {
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  if (!keep.length) continue;
  const w = bare(p.father_name);
  if (!w) continue;
  if (keep.some(c => forms(idx.get(c.edge.parent)).includes(w))) continue;
  const bio = keep.filter(c => c.edge.kind === '生父');
  const f = idx.get((bio.length ? bio : keep)[0].edge.parent);
  const mine = bare(f.name);
  // 父亲的生子名单里有没有本人——有的话，父子关系本身是硬的，只是父名写岔了
  const named = roster(f).sons.some(x => forms(p).includes(bare(x.name || x.raw)));
  const d = diff(w, mine);
  const rec = { p, f, w, mine, d, named };
  if (d === 1) G.one.push(rec);
  else if (named) G.namedOk.push(rec);
  else G.other.push(rec);
}
const T = G.one.length + G.namedOk.length + G.other.length;
console.log('═'.repeat(70));
console.log(`「本人写的父名对不上」　共 ${T} 人`);
console.log(`  跟认定的父亲**只差一个字**           ${String(G.one.length).padStart(3)} 人  ← 多半是误字／页眉掉字`);
console.log(`  差得多，但父亲的生子名单里有本人     ${String(G.namedOk.length).padStart(3)} 人  ← 父子关系本身是硬的`);
console.log(`  差得多，名单里也没有                 ${String(G.other.length).padStart(3)} 人  ← 真拿不准`);
console.log('═'.repeat(70));

const show = (t, L, n = 99) => {
  console.log(`\n【${t}】${L.length} 人`);
  for (const { p, f, w, mine, named } of L.slice(0, n))
    console.log(`   ${p.name.padEnd(4)}第${String(p.gen).padStart(2)}世 ${p.src.page}页　写「${w}」　认定「${mine}」`
      + `${named ? '　（父亲名单里有本人）' : ''}　${DOC(p)}.doc`);
};
show('只差一个字', G.one);
show('差得多，但名单里有本人', G.namedOk);
show('差得多，名单里也没有 —— 要人翻书', G.other);
