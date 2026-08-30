/**
 * 155 条对不上的，逐条摊开供人工核。
 *   node --experimental-strip-types tools/conflicts.mjs 名单
 *   node --experimental-strip-types tools/conflicts.mjs 父名
 *   node --experimental-strip-types tools/conflicts.mjs 排行 | 生子数 | 年代
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, canFather } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { isFragment } from '../src/core/fragment.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
const ORD = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const ordOf = f => { const t = norm(f ?? ''); return !t ? null : t.startsWith('幼') ? -1 : (ORD[t[0]] ?? null); };
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const settled = p => {
  const by = new Map();
  for (const c of C.get(p.pid)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  const g = by.get('生父') ?? [];
  return g.length === 1 ? g[0] : null;
};
const heirOf = p => p.is_heir || /嗣|祧|承继/.test(p.filiation ?? '')
  || /嗣|祧/.test((p.raw_text ?? '').split('\n')[1] ?? '');
const short = s => (s ?? '').split('·').slice(1).join('·');

const kind = process.argv[2] ?? '名单';
const rows = [];

for (const p of people) {
  if (isFragment(p)) continue;
  const c = settled(p);
  if (!c?.person) continue;
  const f = c.person;
  const sons = roster(f).sons.map(s => norm(s.name || s.raw));
  const rawSons = roster(f).sons.map(s => s.raw.replace(/[\s　]+/g, ''));
  // ★ 敬称要两边都去。第 15 世页眉称「梦骥公」，本人那条写「骥 公」，
  //   父亲的名单里写的是「梦骥」——只去父亲那边的「公」不够，
  //   孩子这边也得去，还得允许一个是另一个的后缀。
  const strip0 = s => norm(s ?? '').replace(/公$/, '');
  const me = [norm(p.name), ...p.aliases.map(a => norm(a.form))];
  const meS = me.map(strip0).filter(Boolean);
  const i = sons.findIndex(s => me.includes(s)
    || meS.some(x => { const y = strip0(s); return y && (y === x || y.endsWith(x) || x.endsWith(y)); }));

  if (kind === '名单' && sons.length && i < 0 && !heirOf(p)) {
    rows.push({ p, f, why: `名单：${rawSons.join('、')}` });
  }
  if (kind === '父名' && p.father_name && !heirOf(p)) {
    const strip = s => norm(s ?? '').replace(/公$/, '');
    const w = strip(p.father_name);
    const forms = [strip(f.name), ...(f.aliases ?? []).map(a => strip(a.form))];
    if (!forms.some(x => x && w && (x === w || w.endsWith(x) || x.endsWith(w)))) {
      rows.push({ p, f, why: `他写「${p.father_name}」，父亲那条名叫「${f.name}」`
        + `　字${f.zi?.text ?? '—'}` });
    }
  }
  if (kind === '排行') {
    const o = ordOf(p.filiation);
    if (o != null && i >= 0) {
      const want = o === -1 ? sons.length : o;
      if (i + 1 !== want) {
        rows.push({ p, f, why: `谱写「${p.filiation}」该第 ${want}，实际第 ${i + 1}`
          + `　名单：${rawSons.join('、')}` });
      }
    }
  }
  if (kind === '年代') {
    const a = canFather(win.get(f.pid), win.get(p.pid));
    if (!a.ok) rows.push({ p, f, why: a.text });
  }
}
if (kind === '生子数') {
  for (const f of people) {
    if (isFragment(f)) continue;
    const said = [...norm(f.raw_text ?? '').matchAll(/生子([一二三四五六七八九十两])/g)]
      .reduce((a, m) => a + (NUM[m[1]] ?? 0), 0);
    if (!said) continue;
    // ★ 只数**已经定下来的**孩子。说不清的人按「不猜」挂在好几个候选名下，
    //   把他们算进来，等于拿「我们没替谱做决定」当成「多连了一个」。
    const kids = childrenOf(people, f.pid).filter(k => !isFragment(k.child)
      && k.edge.kind === '生父'
      && settled(k.child)?.edge === k.edge);
    if (kids.length > said) {
      rows.push({ p: f, f, why: `谱写生子 ${said}，连上 ${kids.length}：`
        + kids.map(k => k.child.name + (k.child.filiation ? `(${k.child.filiation})` : '')).join('、')
        + `　名单：${roster(f).sons.map(s => s.raw.replace(/[\s　]+/g, '')).join('、') || '（没写）'}` });
    }
  }
}

console.log(`「${kind}」对不上：${rows.length} 条\n`);
for (const r of rows) {
  console.log(`  ${r.p.name}（第${r.p.gen}世 ${short(r.p.src_human)}）`
    + (kind === '生子数' ? '' : ` → ${r.f.name}（${short(r.f.src_human)}）`));
  console.log(`     ${r.why}`);
}
