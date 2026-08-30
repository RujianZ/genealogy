/**
 * 「本人写的父名，跟我们认定的父亲对不上」——140 人，逐个摊开看是哪种。
 *
 * 意思是这样一件事：
 *     他自己那一条写着「泽汉公长子」
 *     可我们给他认定的父亲叫「泽泗」
 *   两个名字不是一个人。**那我们八成接错了。**
 *
 * 分类只用谱上看得见的线索，不做推断：
 *   同世同名  —— 我们认的那位跟他写的那位是同一辈的两个人（隔壁格串了）
 *   只差辈字  —— 「梁柱」对「壁柱」，第二个字一样（录入把辈字打错了）
 *   查无此人  —— 他写的那个父亲，全谱上一世根本没有
 *   父有其人  —— 他写的那位确实存在，我们却接到了别人身上  ← 最可疑
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
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
const RAW = (p) => (p.raw_text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
const docOf = (p) => {
  const n = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 }[p.src?.juan ?? ''] ?? 0;
  return n >= 8 ? '合三（8、9）.doc' : n >= 5 ? '合二（5、6、7）.doc' : '合一（1.2.3.4）.doc';
};

const byGen = new Map();
for (const p of all) {
  if (p.gen == null) continue;
  for (const f of forms(p)) {
    if (!f) continue;
    const k = `${p.gen}|${f}`;
    (byGen.get(k) ?? byGen.set(k, []).get(k)).push(p);
  }
}

const G = { sameGen: [], genChar: [], noSuch: [], exists: [] };
for (const p of all) {
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;
  if (!keep.length) continue;
  const w = bare(p.father_name);
  if (!w) continue;
  // ★ 要跟**留下的任何一条边**比。过继的人自己写的是嗣父的名字，
  //   拿它去比生父，等於把每个过继的人都误报成错——启昌、梁模都栽在这，
  //   140 人里有 65 个是这么来的。
  if (keep.some(c => forms(idx.get(c.edge.parent)).includes(w))) continue;
  const f = idx.get(line[0].edge.parent);

  const said = [...new Set(byGen.get(`${p.gen - 1}|${w}`) ?? [])];
  const rec = { p, f, w, said };
  const mine = bare(f.name);
  if (!said.length) {
    // 他写的那个父亲，上一世没有——看看是不是只差辈字
    if (w.length === mine.length && w.length >= 2
        && w.slice(1) === mine.slice(1) && w[0] !== mine[0]) G.genChar.push(rec);
    else G.noSuch.push(rec);
  } else if (said.some(x => x.gen === f.gen)) {
    // 他写的那位确实在上一世，而且跟我们认的那位同辈
    G.exists.push(rec);
  } else G.sameGen.push(rec);
}

const T = G.sameGen.length + G.genChar.length + G.noSuch.length + G.exists.length;
console.log('═'.repeat(70));
console.log(`「本人写的父名跟认定的父亲不符」　共 ${T} 人`);
console.log(`  他写的那位确实存在，我们接到了别人身上   ${String(G.exists.length).padStart(3)} 人  ← 最可疑`);
console.log(`  只差一个辈字（梁柱／壁柱）               ${String(G.genChar.length).padStart(3)} 人`);
console.log(`  他写的那位，全谱上一世根本没有           ${String(G.noSuch.length).padStart(3)} 人`);
console.log(`  其他                                     ${String(G.sameGen.length).padStart(3)} 人`);
console.log('═'.repeat(70));

const show = (title, L, n) => {
  console.log(`\n${'━'.repeat(70)}\n【${title}】${L.length} 人，举 ${Math.min(n, L.length)} 个\n`);
  for (const { p, f, w, said } of L.slice(0, n)) {
    console.log(`── ${p.name}　第${p.gen}世　${p.src_human}`);
    console.log(`   他自己那一条写：「${p.father_name}${p.filiation ?? ''}」`);
    console.log(`   我们认定的父亲：${f.name}（${f.src_human}）`);
    console.log(`        ${f.name}的生子名单：${roster(f).sons.map(x => x.name || x.raw).join('、') || '空'}`);
    if (said.length) {
      for (const s of said.slice(0, 2)) {
        console.log(`   他写的「${w}」确实有这个人：${s.name}（${s.src_human}）`);
        console.log(`        ${s.name}的生子名单：${roster(s).sons.map(x => x.name || x.raw).join('、') || '空'}`);
        console.log(`        年代：${windowNote(win.get(s.pid)) || '不知道'}`
          + `　　本人：${windowNote(win.get(p.pid)) || '不知道'}`);
      }
    } else {
      console.log(`   他写的「${w}」——全谱第${p.gen - 1}世没有这个人`);
    }
    console.log(`   本人原文：${RAW(p).slice(0, 4).join(' ｜ ')}`);
    console.log(`   要翻的书：source/${docOf(p)}　第 ${p.src.page} 页`);
    console.log('');
  }
};
show('他写的那位确实存在，我们却接到了别人身上', G.exists, 4);
show('只差一个辈字', G.genChar, 3);
show('他写的那位，全谱上一世根本没有', G.noSuch, 3);
if (G.sameGen.length) show('其他', G.sameGen, 2);
