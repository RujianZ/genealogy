/**
 * 案卷：判一个人的父亲需要看的东西，一次全摊开。
 *   node --experimental-strip-types tools/case.mjs P-册4-0249-1-1-L10845
 *
 * 摊开的是**谱面上的事实**，不是我们的结论：
 *   · 他自己那一条的原文、页眉、坐标
 *   · 同一行（同一世）前后几页印着谁，各自的页眉写什么
 *   · 每个候选父亲的生子名单，以及**名单上每个名字实际印在册4/册3 哪一页**
 * 最后一项最有用：名单里的兄弟连成一块，缺的那一格就是他。
 */
import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { buildIndex } from '../src/core/lineage.ts';
import { buildFacts } from '../src/core/facts.ts';
import { resolveAll } from '../src/core/resolve.ts';
import { applyManual } from '../src/core/manual.ts';
import { buildWindows } from '../src/core/activity.ts';
import { EraChart } from '../src/core/years.ts';
import { norm } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const F = buildFacts(people, J('generations'));
const ALL = new Map([...resolveAll(F, idx, buildWindows(people, new EraChart(J('erachart'))))].map(([k, v]) => [k, applyManual(J('人工判定'), k, v)]));
const bare = s => norm(s ?? '').replace(/公$/, '');
const one = s => (s ?? '').replace(/\n/g, ' / ');
const loc = p => `${p.src.vol}p${p.src.page}行${p.src.row}`;
const ptr = p => ((p.page_ptrs ?? []).map(x => x.name + x.filiation).join('、') || '无');

const pid = process.argv[2];
const me = idx.get(pid) ?? people.find(p => p.name === pid);
if (!me) { console.log('找不到', pid); process.exit(1); }
const r = ALL.get(me.pid), f = F.get(me.pid);

console.log('█'.repeat(70));
console.log(`  ${me.gen}世 ${me.name}   ${me.pid}`);
console.log(`  ${loc(me)}  ${me.src.section}   页眉：${ptr(me)}`);
console.log(`  谱写父名「${me.father_name || '—'}」${me.filiation || ''}   生：${me.birth?.text ?? '—'}`);
console.log('█'.repeat(70));
console.log('原文：', one(me.raw_text).slice(0, 200));

console.log(`\n── 同一行（第${me.gen}世）前后几页 ──`);
for (const q of people.filter(q => q.src.vol === me.src.vol && q.src.row === me.src.row
    && Math.abs(q.src.page - me.src.page) <= 4).sort((a, b) => a.src.page - b.src.page)) {
  const mark = q.pid === me.pid ? ' ←── 本人' : '';
  console.log(`  p${String(q.src.page).padEnd(4)} ${q.name.padEnd(4)} 「${q.father_name || '—'}${q.filiation || ''}」`
    + ` 页眉:${ptr(q).padEnd(16)} 生:${(q.birth?.text ?? '—').slice(0, 14)}${mark}`);
}

const cands = new Map();
for (const c of [...(r?.birth ?? []), ...(r?.heir ?? []), ...(r?.alsoNamed ?? [])]) {
  const q = idx.get(c.pid); if (q) cands.set(q.pid, q);
}
for (const m of f?.mentions ?? []) { const q = idx.get(m.by); if (q) cands.set(q.pid, q); }
const w = bare(me.father_name);
if (w) for (const q of people) if (q.gen === me.gen - 1 && bare(q.name) === w) cands.set(q.pid, q);

console.log(`\n── 候选父亲 ${cands.size} 位，各自的名单和名单上每个人实际印在哪 ──`);
for (const q of cands.values()) {
  console.log(`\n  ◆ ${q.name} ${q.pid}  ${q.src.section} p${q.src.page}  生:${q.birth?.text ?? '—'}`);
  console.log(`    原文: ${one(q.raw_text).slice(0, 130)}`);
  const sons = q.sons_claimed ?? [];
  if (!sons.length) { console.log('    生子名单：无'); continue; }
  console.log(`    生子名单（${sons.length}）：`);
  for (const s of sons) {
    const hits = people.filter(x => x.gen === q.gen + 1 && bare(x.name) === bare(s));
    console.log(`      ${s.padEnd(5)} → ` + (hits.length
      ? hits.map(h => `${h.src.vol}p${h.src.page}〔${h.father_name || '—'}${h.filiation || ''}〕`).join('  ')
      : '（谱里没有他单独一条）'));
  }
}
console.log(`\n── 目前自动判定：${r?.level} ──`);
console.log('  生父:', (r?.birth ?? []).map(x => idx.get(x.pid)?.name + '@p' + idx.get(x.pid)?.src.page).join('、') || '—');
console.log('  嗣父:', (r?.heir ?? []).map(x => idx.get(x.pid)?.name + '@p' + idx.get(x.pid)?.src.page).join('、') || '—');
