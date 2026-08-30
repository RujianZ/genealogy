/**
 * 终端验证：CLAUDE.md 第八节的三件事 + 与人工核对表逐行比对。
 * 跑法： node verify.mjs
 */
import fs from 'node:fs';
import { search } from './src/core/search.ts';
import { buildIndex, walkUp, flattenPaths, rankPaths } from './src/core/lineage.ts';

const people = JSON.parse(fs.readFileSync('data/people.json', 'utf8'));
const idx = buildIndex(people);
const line = (c = '─') => console.log(c.repeat(78));

// ════════════════════ 第 1 件：搜「火生」，一条不许少 ════════════════════
console.log('\n【1】搜索「火生」— 全部命中，不截断');
line();
const hits = search(people, '火生');
console.log(`返回 ${hits.length} 条（没有 slice、没有阈值、没有 top-N）\n`);
for (const h of hits) {
  console.log(`${h.score.toFixed(2)}  ${h.person.name}（第${h.person.gen}世）`);
  console.log(`      为什么命中：${h.why}`);
  console.log(`      别名全集：${h.person.aliases.map(a => a.form + '·' + a.why).join('  ')}`);
  console.log(`      出处：${h.person.src_human}`);
  if (h.snippet) console.log(`      原文片段：${h.snippet}`);
}
const exact = hits.filter(h => h.score === 1);
const near = hits.filter(h => h.score === 0.6);
console.log(`\n小结：字/谱名完全是「火生」的 ${exact.length} 人 → ${exact.map(h => h.person.name).join('、')}`);
console.log(`      差一字的 ${near.length} 人 → ${near.map(h => h.person.name).join('、')}`);
console.log(`      预期：3 个完全命中（壁火/继生/继火）+ 5 个差一字（时生/鼎生/延生/郁生/玉生）`);

// ════════════════════ 第 2 件：承健上溯，第 17 世必须分叉 ════════════════════
console.log('\n\n【2】「承健」上溯 — parent_edges 是数组，全部展开成分叉');
line();
const me = search(people, '承健').filter(h => h.score === 1);
console.log(`搜到 ${me.length} 个「承健」：${me.map(h => h.person.pid + ' 第' + h.person.gen + '世').join('; ')}`);
const root = walkUp(idx, me[0].person.pid);
const paths = rankPaths(flattenPaths(root));
console.log(`\n上溯树摊平后共 ${paths.length} 条路径（分叉全留，没有选一条）\n`);

paths.forEach((p, i) => {
  console.log(`路径 ${i + 1}／${paths.length}：${p.nodes.length} 代  最弱依据 rank${p.weakest}  世次${p.genConsistent ? '单调 ✓' : '不单调 ✗'}  终止于「${p.end}」`);
  p.nodes.forEach((n, j) => {
    const e = p.edges[j - 1];
    const rel = e ? `  ←${e.kind}·rank${e.rank}·${e.evidence_cn}` : '';
    const zi = n.person.zi ? `（字${n.person.zi.text}）` : '';
    console.log(`   第${String(n.person.gen).padStart(2)}世  ${n.person.name}${zi}${rel}`);
  });
  console.log(`   ⟹ ${p.endNote}\n`);
});

const qc = paths[0].nodes.find(n => n.person.name === '启昌');
console.log('第 17 世启昌（字焕先）的父边，逐条列出：');
qc.branches.forEach(b => console.log(`   ${b.edge.kind}：${b.edge.parent_name || idx.get(b.edge.parent)?.name}（第${idx.get(b.edge.parent)?.gen}世）`
  + `  rank${b.edge.rank}·${b.edge.evidence_cn}\n      依据原文：${b.edge.matched_as}\n      出处：${b.edge.parent_src}`));

// ── 与人工核对表比对 ──
const gt = fs.readFileSync('docs/直系世系_胜二至承健.md', 'utf8');
const gtChain = [...gt.matchAll(/^\| (\d+) \| \*{0,2}([^|*]+?)\*{0,2} \|/gm)].map(m => [+m[1], m[2].trim()]);
console.log('与 docs/直系世系_胜二至承健.md（人工核对）比对：');
const best = paths[0].nodes.map(n => [n.person.gen, n.person.name]);
const bestMap = new Map(best);
let ok = 0, miss = [];
for (const [g, nm] of gtChain) {
  const got = bestMap.get(g);
  const norm = s => s.replace(/公$/, '').replace(/（.*/, '').replace('啟', '启');
  if (got && norm(got) === norm(nm)) ok++;
  else miss.push(`第${g}世 谱载「${nm}」— 程序${got ? '得到「' + got + '」' : '未覆盖'}`);
}
console.log(`   ${gtChain.length} 代中对上 ${ok} 代`);
miss.forEach(m => console.log('   ✗ ' + m));

// ════════════════════ 第 3 件：出处 + 原文 ════════════════════
console.log('\n\n【3】任选一人 — 底部出处与原文全文');
line();
const p3 = idx.get('P-册3-0205-4-1-0');
console.log(`${p3.name}（第${p3.gen}世）`);
console.log(`出处 src_human：${p3.src_human}`);
console.log(`原文 raw_text：`);
p3.raw_text.split('\n').forEach(l => console.log('   │ ' + l));
console.log(`（生卒原样显示，不转公历：生「${p3.birth?.text}」 殁「${p3.death?.text}」）`);
