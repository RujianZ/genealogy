/**
 * 逐条审：**每一个字都要有交代。**
 *
 * 三条，按你说的：
 *   不能记漏——原文里的字，必须在某个字段或未归属原文里出现
 *   不能记错——字段里的字，必须能在本人原文里逐字找到（不能是别人的）
 *   不确定的可以不记——留在「未归属原文」里是合格的，不算错
 *
 * 拿承健那条 26 代当标尺：那批是逐条核过的，它们的形状就是「记得对」的样子。
 *
 *   node --experimental-strip-types tools/audit.mjs        全谱
 *   node --experimental-strip-types tools/audit.mjs 标尺    只看承健那一条链
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const places = J('places');
const refs = J('referenced');
const NS = s => (s ?? '').replace(/[\s　]/g, '');

const byOwner = new Map();
for (const b of places) (byOwner.get(b.owner) ?? byOwner.set(b.owner, []).get(b.owner)).push(b);
const byHost = new Map();
for (const r of refs) (byHost.get(r.host) ?? byHost.set(r.host, []).get(r.host)).push(r);

/** 这个人身上，我们记下来的所有字（按来源分类） */
function recorded(p) {
  const bits = [];
  const add = (where, s) => { const t = NS(s); if (t) bits.push({ where, t }); };
  add('谱名', p.name_raw || p.name);
  add('父名', p.father_name); add('排行', p.filiation);
  for (const k of ['zi', 'hui', 'hao', 'ming']) add(k, p[k]?.text);
  for (const k of ['birth', 'death', 'burial', 'age']) add(k, p[k]?.text);
  for (const t of p.titles ?? []) add('功名', t);
  for (const m of p.marks ?? []) { add('标记', m.tag); add('标记文', m.text); }
  for (const s of p.spouses ?? []) {
    add('配偶', s.rel); add('配偶', s.name_raw);
    for (const k of ['birth', 'death', 'burial']) add('配偶' + k, s[k]?.text);
  }
  for (const s of p.sons_claimed ?? []) add('生子名单', s);
  for (const s of p.daughters_claimed ?? []) add('女名单', s);
  for (const u of p.unparsed ?? []) add('未归属', u.text);
  for (const b of byOwner.get(p.pid) ?? []) add('葬', b.text);
  return bits;
}

/** 审一个人 */
function auditOne(p) {
  const raw = NS(p.raw_text);
  const bits = recorded(p);
  // ① 记错：字段里的字，在本人原文里找不到
  const wrong = bits.filter(b => !raw.includes(b.t)
    // 谱名在原文里是分开写的（「承　健」），去空白后才连上——已经去过了
    && !(b.where === '谱名' && raw.startsWith(b.t)));
  // ② 记漏：原文里的字，一个字段都没覆盖到
  const covered = new Array(raw.length).fill(false);
  for (const b of bits) {
    let at = 0;
    while (true) {
      const i = raw.indexOf(b.t, at);
      if (i < 0) break;
      for (let k = i; k < i + b.t.length; k++) covered[k] = true;
      at = i + 1;
    }
  }
  const missN = covered.filter(x => !x).length;
  const missText = raw.split('').map((c, i) => covered[i] ? '　' : c).join('').replace(/　+/g, '…');
  return { p, raw, wrong, missN, missText, rate: raw.length ? (raw.length - missN) / raw.length : 1 };
}

const mode = process.argv[2];
let list = people.filter(p => !isFragment(p));
if (mode === '标尺') {
  const chain = [];
  let cur = people.find(p => p.name === '承健' && p.gen === 27);
  while (cur && cur.gen > 1 && chain.length < 40) {
    chain.push(cur);
    const ok = candidates(idx, cur, chart, win).filter(c => c.status === 'ok' && c.edge.kind === '生父');
    if (ok.length !== 1) break;
    cur = ok[0].person;
  }
  if (cur) chain.push(cur);
  list = chain;
  console.log(`标尺：承健那一条链 ${list.length} 人\n`);
}

const res = list.map(auditOne);
const wrongN = res.filter(r => r.wrong.length).length;
const full = res.filter(r => r.missN === 0).length;
const avg = res.reduce((a, r) => a + r.rate, 0) / res.length;

console.log(`审了 ${res.length} 人`);
console.log(`  **记错**（字段里有本人原文里没有的字）：${wrongN} 人`);
console.log(`  **一个字不漏**：${full} 人（${(full / res.length * 100).toFixed(1)}%）`);
console.log(`  平均覆盖率：${(avg * 100).toFixed(2)}%`);

if (mode === '标尺') {
  console.log('\n逐条：');
  for (const r of res) {
    console.log(`  ${r.missN === 0 && !r.wrong.length ? '✔' : '△'} 第${r.p.gen}世 ${r.p.name}`
      + `　原文 ${r.raw.length} 字，没交代 ${r.missN} 字`
      + (r.wrong.length ? `，记错 ${r.wrong.length} 处` : ''));
    if (r.missN) console.log(`      漏掉的：${r.missText.slice(0, 70)}`);
    for (const w of r.wrong.slice(0, 3)) console.log(`      记错：[${w.where}]「${w.t.slice(0, 30)}」`);
  }
} else {
  const worst = res.filter(r => r.missN > 0).sort((a, b) => b.missN - a.missN);
  console.log(`\n漏得最多的 10 个：`);
  for (const r of worst.slice(0, 10)) {
    console.log(`  ${r.p.name}（第${r.p.gen}世 ${r.p.src_human.split('·').slice(1).join('·')}）`
      + `　原文 ${r.raw.length} 字，没交代 ${r.missN} 字`);
    console.log(`      ${r.missText.slice(0, 80)}`);
  }
  const bad = res.filter(r => r.wrong.length);
  if (bad.length) {
    console.log(`\n记错的前 10 个：`);
    for (const r of bad.slice(0, 10)) {
      console.log(`  ${r.p.name}（${r.p.src_human.split('·').slice(1).join('·')}）`);
      for (const w of r.wrong.slice(0, 2)) console.log(`      [${w.where}]「${w.t.slice(0, 36)}」`);
    }
  }
}
