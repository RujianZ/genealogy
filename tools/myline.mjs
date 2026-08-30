/**
 * 一条链，逐代摊开：**每一步是靠什么定的，谱上还有哪几处独立的说法印证。**
 *
 *   node --experimental-strip-types tools/myline.mjs 承健 27
 *
 * 「靠什么定的」是一回事，「还有几处别的说法也这么说」是另一回事。
 * 后者才是可靠性——同一件事谱上写了三遍、三遍都一样，那才叫稳。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, canFather } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const ORD = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const ordOf = f => {
  const t = norm(f ?? ''); if (!t) return null;
  return t.startsWith('幼') ? -1 : (ORD[t[0]] ?? null);
};
const coord = pid => {
  const m = /^P-(册\d+)-(\d+)-(\d+)-/.exec(pid);
  return m ? { vol: m[1], page: +m[2], row: +m[3] } : null;
};

const name = process.argv[2] ?? '承健';
const gen = +(process.argv[3] ?? 27);
let cur = people.find(p => p.name === name && p.gen === gen);
if (!cur) { console.log('找不到'); process.exit(1); }

let step = 0, allClean = true;
console.log(`${cur.name}　第 ${cur.gen} 世　${cur.src_human}\n`);
while (cur && cur.gen > 1 && step++ < 40) {
  const cs = candidates(idx, cur, chart, win);
  const ok = cs.filter(c => c.status === 'ok' && c.edge.kind === '生父');
  if (!ok.length) { console.log(`  ✘ ${cur.name} 往上断了`); allClean = false; break; }
  if (ok.length > 1) {
    console.log(`  ✘ ${cur.name}：说不清，${ok.length} 个候选`);
    allClean = false; break;
  }
  const f = ok[0].person;
  const sons = roster(f).sons.map(s => norm(s.name || s.raw));
  const me = [norm(cur.name), ...cur.aliases.map(a => norm(a.form))];
  const i = sons.findIndex(s => me.includes(s));
  const o = ordOf(cur.filiation);
  const a = coord(cur.pid), b = coord(f.pid);

  const ev = [];
  if (i >= 0) ev.push(`父亲名单第 ${i + 1} 位点了他的名`);
  if (cur.father_name) ev.push(`他自己写「${cur.father_name}${cur.filiation ?? ''}」`);
  if (o != null && i >= 0 && i + 1 === (o === -1 ? sons.length : o)) ev.push('排行对得上');
  const ag = canFather(win.get(f.pid), win.get(cur.pid));
  if (ag.ok && (win.get(f.pid)?.born || win.get(cur.pid)?.born)) ev.push('年代对得上');
  if (a && b && a.vol === b.vol && a.row - b.row === 1 && b.page <= a.page) {
    ev.push(a.page === b.page ? '印在同一页的上一格' : `印在第 ${b.page} 页上一格`);
  }
  if (cur.gen - f.gen === 1) ev.push('世次差 1');

  const others = cs.filter(c => c !== ok[0] && c.edge.kind === '生父');
  const clean = ev.length >= 3;
  if (!clean) allClean = false;
  console.log(`  ${clean ? '✔' : '△'} 第 ${cur.gen} 世 ${cur.name} ← 第 ${f.gen} 世 ${f.name}`
    + `（${f.src_human.split('·').slice(1, 4).join('·')}）`);
  console.log(`      ${ev.length} 处独立说法：${ev.join('；')}`);
  if (others.length) {
    console.log(`      另有 ${others.length} 个同名候选被排掉：`
      + others.map(c => `${c.person?.name}（${c.note.slice(0, 30)}…）`).join('；'));
  }
  cur = f;
}
console.log(`\n${allClean ? '这条链每一步都有三处以上独立说法印证。'
  : '有步子印证不足，上面标了 △。'}`);
