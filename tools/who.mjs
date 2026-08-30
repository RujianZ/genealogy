/**
 * 把一个名字在谱里的所有痕迹一次挖干净。
 *   node --experimental-strip-types tools/who.mjs 继盟
 *
 * 打出来的每一条都要能回到原文，不做任何推断。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

const q = norm(process.argv[2] ?? '');
if (!q) { console.log('用法：node --experimental-strip-types tools/who.mjs 名字'); process.exit(1); }

const W = w => !w ? '（算不出）'
  : w.conflict ? `线索互相矛盾（${w.conflict}），结论是不知道`
  : [w.born ? `生 ${w.born}` : '', w.died ? `殁 ${w.died}` : '',
     (w.lo || w.hi) ? `活跃 ${w.lo ?? '?'}–${w.hi ?? '?'}` : ''].filter(Boolean).join('　')
    + (w.why?.length ? `　依据：${w.why.join('；')}` : '');

const card = p => {
  console.log(`\n┌─ ${p.name}　第 ${p.gen} 世　${p.pid}`);
  console.log(`│  ${p.src_human}`);
  if (p.zi) console.log(`│  字 ${p.zi.text}`);
  console.log(`│  生 ${p.birth?.text ?? '（谱上没写）'}`);
  console.log(`│  殁 ${p.death?.text ?? '（谱上没写）'}`);
  console.log(`│  年代 ${W(win.get(p.pid))}`);
  console.log(`│  谱上写的父名：${p.father_name ?? '（没写）'}`
    + `　${p.filiation ?? ''}　出处：${p.father_src ?? ''}`
    + (p.is_heir ? '　★ 嗣子' : ''));
  console.log(`│  生子名单：${p.sons_claimed.join('、') || '（无）'}`);
  console.log(`│  女：${p.daughters_claimed.join('、') || '（无）'}`);
  console.log(`│  配偶：${p.spouses.map(s => s.rel + s.name_raw).join('、') || '（无）'}`);
  const cs = candidates(idx, p, chart, win);
  console.log(`│  父边候选 ${cs.length} 条，留下 ${kept(cs).length} 条：`);
  for (const c of cs) {
    const f = idx.get(c.edge.parent);
    console.log(`│    ${c.status === 'ok' ? '●' : '○'} ${c.edge.kind}　`
      + `${f?.name}（第${f?.gen}世）${f?.src_human ?? ''}`
      + `　${c.edge.evidence_cn ?? c.edge.evidence}`
      + (c.status !== 'ok' ? `　← 排除：${c.why ?? c.status}` : ''));
  }
  console.log('│  ── 原文 ──');
  for (const l of (p.raw_text ?? '').split('\n')) console.log('│  ' + l);
  console.log('└─');
};

// ① 本人条目
const self = people.filter(p => norm(p.name) === q || norm(p.name_raw) === q
  || p.aliases.some(a => norm(a.form) === q));
console.log(`══ 谱上单独立条、叫「${process.argv[2]}」的：${self.length} 人 ══`);
self.forEach(card);

// ② 谁的原文里提到过这个名字
console.log(`\n══ 谁把「${process.argv[2]}」写进了自己的条目 ══`);
for (const p of people) {
  const hits = [];
  if (p.sons_claimed.some(n => norm(n) === q)) hits.push('生子名单');
  if (p.daughters_claimed.some(n => norm(n) === q)) hits.push('女');
  if (p.father_name && norm(p.father_name) === q) hits.push('父名');
  if (p.spouses.some(s => norm(s.name_raw) === q)) hits.push('配偶');
  if (hits.length) {
    console.log(`  ${p.name}（第${p.gen}世）${p.src_human}　→ ${hits.join('、')}`
      + (hits.includes('父名') ? `　${p.filiation ?? ''}${p.is_heir ? ' ★嗣子' : ''}` : ''));
  }
}

// ③ 谁的父边指向了他 / 他的父边指向了谁
console.log(`\n══ 父边（含反查补上的） ══`);
for (const p of self) {
  const kids = people.filter(x => x.parent_edges.some(e => e.parent === p.pid));
  console.log(`  ${p.name} ${p.pid} 的子女边：${kids.length} 条`);
  for (const k of kids) {
    for (const e of k.parent_edges.filter(e => e.parent === p.pid)) {
      const cs = candidates(idx, k, chart, win);
      const c = cs.find(c => c.edge === e) ?? cs.find(c => c.edge.parent === p.pid);
      console.log(`    ${e.kind}　${k.name}（第${k.gen}世）${k.src_human}`
        + `　依据：${e.evidence_cn ?? e.evidence}（rank ${e.rank}）`
        + `　${c && c.status !== 'ok' ? '← 已排除：' + (c.why ?? c.status) : ''}`);
    }
  }
}
