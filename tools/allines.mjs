/**
 * 不是只看承健那一条：**把每一条能走到胜二公的链，每一步都数独立说法。**
 *
 * 「靠什么定的」是一回事，「谱上还有几处别的说法也这么说」是另一回事。
 * 后者才是可靠性。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
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
const ORD = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const ordOf = f => { const t = norm(f ?? ''); return !t ? null : t.startsWith('幼') ? -1 : (ORD[t[0]] ?? null); };
const coord = pid => { const m = /^P-(册\d+)-(\d+)-(\d+)-/.exec(pid); return m ? { vol: m[1], page: +m[2], row: +m[3] } : null; };
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));

/** 这一步有几处独立说法 */
function evidence(child, f) {
  const sons = roster(f).sons.map(s => norm(s.name || s.raw));
  const me = [norm(child.name), ...child.aliases.map(a => norm(a.form))];
  const i = sons.findIndex(s => me.includes(s));
  const o = ordOf(child.filiation);
  const a = coord(child.pid), b = coord(f.pid);
  let n = 0;
  if (i >= 0) n++;                                                  // 父亲名单点了名
  if (child.father_name) n++;                                       // 他自己写了父名
  if (o != null && i >= 0 && i + 1 === (o === -1 ? sons.length : o)) n++;   // 排行对得上
  if (canFather(win.get(f.pid), win.get(child.pid)).ok
      && (win.get(f.pid)?.born || win.get(child.pid)?.born)) n++;    // 年代对得上
  if (a && b && a.vol === b.vol && a.row - b.row === 1 && b.page <= a.page) n++;  // 印在上一格
  if (child.gen - f.gen === 1) n++;                                 // 世次差 1
  return n;
}

const dad = p => {
  const g = C.get(p.pid).filter(c => c.status === 'ok' && c.edge.kind === '生父');
  return g.length === 1 ? g[0].person : null;
};

// 每个人往上走，逐步记独立说法数
const hist = new Map();          // 说法数 → 步数
const weakByGen = new Map();     // 世次 → 弱步（<3）数
let steps = 0, weak = 0, reach = 0;
const weakSteps = [];
const starts = people.filter(p => !isFragment(p));
for (const p0 of starts) {
  let cur = p0, n = 0;
  while (cur && cur.gen > 1 && n++ < 40) {
    const f = dad(cur);
    if (!f) break;
    const e = evidence(cur, f);
    steps++;
    hist.set(e, (hist.get(e) ?? 0) + 1);
    if (e < 3) {
      weak++;
      weakByGen.set(cur.gen, (weakByGen.get(cur.gen) ?? 0) + 1);
      if (weakSteps.length < 10000) weakSteps.push({ c: cur, f, e });
    }
    cur = f;
  }
  if (cur?.gen === 1) reach++;
}
console.log(`走到胜二公的人：${reach} / ${starts.length}`);
console.log(`一共走了 ${steps} 步（同一条边被不同的人走过会重复计）\n`);
console.log('每一步有几处独立说法：');
for (const k of [...hist.keys()].sort((a, b) => b - a)) {
  const v = hist.get(k);
  console.log(`  ${k} 处　${String(v).padStart(6)} 步　${(v / steps * 100).toFixed(1).padStart(5)}%`
    + ' ' + '█'.repeat(Math.round(v / steps * 50)));
}
console.log(`\n**少于 3 处的步：${weak} 步（${(weak / steps * 100).toFixed(2)}%）**`);
if (weak) {
  console.log('  分布在第几世：' + [...weakByGen].sort((a, b) => a[0] - b[0])
    .map(([g, n]) => `${g}世 ${n}`).join('　'));
  const uniq = new Map();
  for (const w of weakSteps) uniq.set(w.c.pid, w);
  console.log(`  涉及 ${uniq.size} 条不同的边，例：`);
  for (const w of [...uniq.values()].slice(0, 6)) {
    console.log(`    第${w.c.gen}世 ${w.c.name} ← ${w.f.name}　只有 ${w.e} 处`
      + `　${w.c.src_human.split('·').slice(1, 4).join('·')}`);
  }
}
