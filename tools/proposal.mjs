/**
 * 承健的四条主张，逐条拿数据核。**先验事实，再谈取舍。**
 *
 *   ① 我的冲突清单里混着繁简没折的假冲突（启／啟）
 *   ② 冲突的定义该收窄：名单非空 + 点的是别人 + 折叠后仍对不上
 *   ③ 世次差必须为 1，目前还有 74 条违规
 *   ④ 过继语句抽取有误配（梁映22世 → 梁玉22世，同辈）
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
const all = people.filter(p => !isFragment(p));
const bare = (s) => fname(s).replace(/公$/, '');
const forms = (p) => [bare(p.name), ...p.aliases.map(a => bare(a.form))];
const RAW = (s) => (s ?? '').replace(/[\s　]/g, '');   // 只去空格，不折

// ═══ ③ 世次：留下的边里还有没有差不为 1 的
const genBad = [];
let keptTotal = 0;
for (const p of all) {
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    keptTotal++;
    const f = idx.get(c.edge.parent);
    if (!f || f.gen == null || p.gen == null || p.gen - f.gen !== 1)
      genBad.push({ p, f, c });
  }
}
// 原始数据里（含被排掉的）有多少
let rawBad = 0;
for (const p of all) for (const e of p.parent_edges) {
  const f = idx.get(e.parent);
  if (!f || f.gen == null || p.gen == null || p.gen - f.gen !== 1) rawBad++;
}
console.log('═'.repeat(70));
console.log('【③ 世次差 = 1】');
console.log(`   **留下的**边 ${keptTotal} 条，其中世次差不为 1 的：${genBad.length} 条`);
console.log(`   原始 parent_edges 里（含已排掉的）违规：${rawBad} 条`);
console.log('   —— 原始数据里有，是正常的（排除≠删除）；关键看留下的那一栏。');
for (const { p, f, c } of genBad.slice(0, 10))
  console.log(`     ✘ ${p.name}(第${p.gen}世) → ${f?.name}(第${f?.gen}世) ${c.edge.kind} ${c.edge.evidence}`);

// ═══ ① 繁简：拿「不折」和「折」两把尺各量一遍冲突
const noFold = [], folded = [];
for (const p of all) {
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  for (const c of keep) {
    const f = idx.get(c.edge.parent);
    if (!f) continue;
    // ★ 嗣父边不算——**嗣父的「生子」名单里本来就不会有嗣子**（无子才立嗣）。
    //   拿生子名单去卡嗣父，跟今天修的那几个 bug 是同一个毛病。
    if (c.edge.kind !== '生父') continue;
    const sons = roster(f).sons.map(s => s.name || s.raw);
    if (!sons.length) continue;                   // 名单空 —— 不算冲突（承健第②条）
    const meRaw = [RAW(p.name), ...p.aliases.map(a => RAW(a.form))];
    const meNorm = forms(p);
    const hitRaw = sons.some(s => meRaw.includes(RAW(s)));
    const hitNorm = sons.some(s => meNorm.includes(bare(s)));
    if (!hitRaw) noFold.push({ p, f, sons });
    if (!hitNorm) folded.push({ p, f, sons });
  }
}
console.log('');
console.log('【① 繁简折叠的影响】');
console.log(`   **不折**（只去空格）量出来的冲突：${noFold.length} 条`);
console.log(`   **折了**（走 norm）量出来的冲突：${folded.length} 条`);
console.log(`   —— 差 ${noFold.length - folded.length} 条全是繁简造成的假冲突`);
console.log('   举例（不折算冲突、折了就不算的）：');
let n = 0;
for (const x of noFold) {
  if (folded.includes(x)) continue;
  if (n++ >= 5) break;
  console.log(`     ${x.p.name} 写「${x.p.father_name}${x.p.filiation ?? ''}」，`
    + `${x.f.name}的名单 [${x.sons.join('、')}]`);
}

// ═══ ② 按收窄的定义，真冲突有多少
console.log('');
console.log('【② 收窄后的「真冲突」——名单非空、点的是别人、折叠后仍对不上】');
console.log(`   ${folded.length} 条`);
for (const { p, f, sons } of folded.slice(0, 25))
  console.log(`     ${p.name.padEnd(4)}第${String(p.gen).padStart(2)}世 写「${p.father_name ?? '空'}${p.filiation ?? ''}」`
    + `　${f.name}的名单 [${sons.join('、')}]　${p.src_human}`);
if (folded.length > 25) console.log(`     …还有 ${folded.length - 25} 条`);

// ═══ ④ 过继语句误配：留下的边里有没有同辈／隔代
console.log('');
console.log('【④ 过继语句来的边，留下的里面有没有世次不对的】');
const adoptBad = genBad.filter(x => /adopt/.test(x.c.edge.evidence ?? ''));
console.log(`   ${adoptBad.length} 条`);
for (const { p, f } of adoptBad.slice(0, 10))
  console.log(`     ${p.name}(第${p.gen}世) → ${f?.name}(第${f?.gen}世)`);
console.log('═'.repeat(70));
