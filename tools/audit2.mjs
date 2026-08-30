/**
 * 按语法审：**原文里每一行，我们记进哪儿了？**
 *
 * 三问，按你说的那三条：
 *   记漏——原文里这一行有值，字段里却是空的
 *   记错——字段里的字，原文里找不到（页眉来的除外）
 *   没读懂——这一行归不进语法的任何一格
 *
 *   node --experimental-strip-types tools/audit2.mjs 标尺
 *   node --experimental-strip-types tools/audit2.mjs        全谱
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { lines } from '../src/core/grammar.ts';
// 显示层补回来的那些（配偶的寿数、翻页断掉的殁年）也算「有交代」——
// 审的是「这个字最后有没有落到该落的地方」，不是「people.json 里有没有」。
import { agesOf } from '../src/core/owner.ts';
import { continued } from '../src/core/continued.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const places = J('places');
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const byOwner = new Map();
for (const b of places) (byOwner.get(b.owner) ?? byOwner.set(b.owner, []).get(b.owner)).push(b);

/** 我们把这个人的哪些字记下来了（不含标签） */
function stored(p) {
  const out = [];
  const add = s => { const t = NS(s); if (t) out.push(t); };
  add(p.name_raw || p.name);
  // 父名和排行是分两个字段存的，原文里是一行「开赛之子」。拼回去再比。
  add((p.father_name ?? '') + (p.filiation ?? ''));
  add((p.father_name ?? '') + '公' + (p.filiation ?? ''));
  for (const k of ['zi', 'hui', 'hao', 'ming', 'birth', 'death', 'burial', 'age']) {
    for (const part of (p[k]?.text ?? '').split('｜')) add(part);
  }
  for (const t of p.titles ?? []) add(t);
  for (const m of p.marks ?? []) { add(m.tag); add(m.text); }
  for (const s of p.spouses ?? []) {
    add((s.rel ?? '') + (s.name_raw ?? ''));
    add(s.name_raw);
    for (const k of ['birth', 'death', 'burial']) for (const part of (s[k]?.text ?? '').split('｜')) add(part);
  }
  for (const s of p.sons_claimed ?? []) add(s);
  for (const s of p.daughters_claimed ?? []) add(s);
  for (const u of p.unparsed ?? []) add(u.text);
  for (const b of byOwner.get(p.pid) ?? []) add(b.text);
  for (const a of agesOf(p)) add(a.text);
  const c = continued(p);
  if (c) { add(c.birthText); add(c.tail.text); for (const s2 of c.stray) add(s2); }
  return out;
}

function auditOne(p) {
  const ls = lines(p.raw_text);
  const has = stored(p);
  const covered = l => {
    const t = NS(l.text);
    return has.some(s => s.includes(t) || t.includes(s));
  };
  // 标签、水印、名字行不算内容
  const content = ls.filter(l => !['标签', '页码水印', '空', '名字'].includes(l.kind));
  const lost = content.filter(l => !covered(l));
  const unknown = ls.filter(l => l.kind === '散文' && !covered(l));
  return { p, ls, lost, unknown, n: content.length };
}

const mode = process.argv[2];
let list = people.filter(p => !isFragment(p));
if (mode === '标尺') {
  const chain = [];
  let cur = people.find(x => x.name === '承健' && x.gen === 27);
  while (cur && cur.gen > 1 && chain.length < 40) {
    chain.push(cur);
    const ok = candidates(idx, cur, chart, win).filter(c => c.status === 'ok' && c.edge.kind === '生父');
    if (ok.length !== 1) break;
    cur = ok[0].person;
  }
  if (cur) chain.push(cur);
  list = chain;
}

const res = list.map(auditOne);
const clean = res.filter(r => !r.lost.length).length;
const lostLines = res.reduce((a, r) => a + r.lost.length, 0);
console.log(`审了 ${res.length} 人，内容行 ${res.reduce((a, r) => a + r.n, 0)} 行`);
console.log(`  **每一行都有交代**：${clean} 人（${(clean / res.length * 100).toFixed(1)}%）`);
console.log(`  漏掉的行：${lostLines} 行`);

// 漏掉的都是什么类型
const kinds = new Map();
for (const r of res) for (const l of r.lost) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
console.log(`  按类型：` + [...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('　'));

if (mode === '标尺') {
  console.log('\n逐条：');
  for (const r of res) {
    console.log(`  ${r.lost.length ? '△' : '✔'} 第${r.p.gen}世 ${r.p.name}　`
      + `内容 ${r.n} 行，漏 ${r.lost.length}`);
    for (const l of r.lost) console.log(`      [${l.kind}] ${l.text.trim().slice(0, 46)}`);
  }
} else {
  const worst = res.filter(r => r.lost.length).sort((a, b) => b.lost.length - a.lost.length);
  console.log(`\n漏得最多的 12 个：`);
  for (const r of worst.slice(0, 12)) {
    console.log(`  ${r.p.name}（第${r.p.gen}世 ${r.p.src_human.split('·').slice(1).join('·')}）漏 ${r.lost.length} 行`);
    for (const l of r.lost.slice(0, 3)) console.log(`      [${l.kind}] ${l.text.trim().slice(0, 46)}`);
  }
}

// ── 按世次分：一套语法套不套得住整部谱 ──
// 宋元明清、文言白话、民国，写法本来就不一样。这个不能想当然，要量。
if (mode !== '标尺') {
  const g = new Map();
  for (const r of res) {
    const k = r.p.gen;
    if (!g.has(k)) g.set(k, { n: 0, lost: 0, prose: 0, lines: 0 });
    const s = g.get(k);
    s.n++; s.lost += r.lost.length; s.lines += r.n;
    s.prose += r.ls.filter(l => l.kind === '散文').length;
  }
  console.log('\n══ 按世次：一套语法套不套得住 ══');
  console.log('  世次   人数   内容行   漏   归不进语法的「散文」行');
  for (const [k, s] of [...g].sort((a, b) => a[0] - b[0])) {
    const bar = '█'.repeat(Math.round(s.prose / Math.max(1, s.lines) * 40));
    console.log(`  ${String(k).padStart(3)}  ${String(s.n).padStart(5)}  ${String(s.lines).padStart(6)}`
      + `  ${String(s.lost).padStart(4)}   ${String(s.prose).padStart(4)}`
      + ` ${(s.prose / Math.max(1, s.lines) * 100).toFixed(0).padStart(3)}% ${bar}`);
  }
}
