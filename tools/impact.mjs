/**
 * 把说不清的那些「剥离出去」，会影响多少人？
 *
 * 一条说不清的父边，影响的不是一个人——**是他底下所有的后代**。
 * 因为每个后代往上追，都得从那条边上过。
 *
 * 所以真正的数是：**有多少人的上溯链里，至少有一步是说不清的。**
 * 剩下的人，从自己一直到胜二公，每一步都是实的。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const D = J('doubts');

// 每个人身上「这一步说不清吗」
const murky = new Map();   // pid -> 'hard'（真说不出）| 'page'（翻页可见）| null
for (const x of D.分不清) murky.set(x.pid, x.settled ? 'page' : 'hard');
const broken = new Set(D.读不出.filter(x => x.what === '父亲').map(x => x.pid));
const blank = new Set(D.谱上留空.filter(x => x.what === '父亲').map(x => x.pid));

// 往上走，看这一路上碰到什么
const memo = new Map();
function walk(pid, seen = new Set()) {
  if (memo.has(pid)) return memo.get(pid);
  if (seen.has(pid)) return { hard: 0, page: 0, stop: '成环' };
  seen.add(pid);
  const p = idx.get(pid);
  if (!p) return { hard: 0, page: 0, stop: '不在谱中' };

  let hard = murky.get(pid) === 'hard' ? 1 : 0;
  let page = murky.get(pid) === 'page' ? 1 : 0;
  let stop = null;

  if (!p.parent_edges.length) {
    stop = p.gen === 1 ? '到胜二公' : broken.has(pid) ? '谱里没有他父亲那一条' : '谱上没写父亲';
  } else {
    // 沿「留下的候选」往上；多个候选时任取一条走（说不清已经计过数了）
    const good = kept(candidates(idx, p, chart, win));
    const up = good.find(c => c.edge.kind === '生父') ?? good[0];
    if (!up) stop = '候选全被排除';
    else {
      const r = walk(up.edge.parent, seen);
      hard += r.hard; page += r.page; stop = r.stop;
    }
  }
  const out = { hard, page, stop };
  memo.set(pid, out);
  return out;
}

const tally = { clean: 0, pageOnly: 0, hard: 0 };
const stops = {};
const affected = [];
for (const p of people) {
  const r = walk(p.pid);
  stops[r.stop] = (stops[r.stop] ?? 0) + 1;
  if (r.hard) { tally.hard++; affected.push([p, r]); }
  else if (r.page) tally.pageOnly++;
  else tally.clean++;
}

const N = people.length;
const pc = n => `${n}　= ${(n / N * 100).toFixed(1)}%`;
console.log(`全谱 ${N} 人。**往上追到底**，这一路上碰到什么：\n`);
console.log(`  一路都是实的，没有一步说不清　　　　${pc(tally.clean)}`);
console.log(`  路上有「翻开那页就看见」的一步　　　${pc(tally.pageOnly)}`);
console.log(`  **路上有真说不清的一步**　　　　　　${pc(tally.hard)}`);

console.log(`\n上溯最后停在哪：`);
for (const [k, v] of Object.entries(stops).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(5)}　${k}`);
}

// 哪几条边影响最大
const blame = new Map();
for (const [p] of affected) {
  let cur = p.pid, guard = 0;
  const seen = new Set();
  while (cur && guard++ < 40 && !seen.has(cur)) {
    seen.add(cur);
    if (murky.get(cur) === 'hard') blame.set(cur, (blame.get(cur) ?? 0) + 1);
    const q = idx.get(cur);
    if (!q?.parent_edges.length) break;
    const good = kept(candidates(idx, q, chart, win));
    const up = good.find(c => c.edge.kind === '生父') ?? good[0];
    cur = up?.edge.parent;
  }
}
console.log(`\n影响人数最多的几条说不清的边：\n`);
for (const [pid, n] of [...blame].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  const p = idx.get(pid);
  const x = D.分不清.find(v => v.pid === pid);
  console.log(`  ${String(n).padStart(4)} 人受影响　${p.name}（第${p.gen}世 ${p.src_human}）`);
  console.log(`        谱上写父名「${p.father_name}」${p.filiation}，`
    + `同名 ${x?.cands.length ?? '?'} 个：`
    + (x?.cands ?? []).map(c => `${c.name}（${c.src_human.split('·').slice(1, 3).join('·')}）`).join('　'));
}

writeFileSync('data/impact.json', JSON.stringify(
  { tally, stops, blame: [...blame].sort((a, b) => b[1] - a[1]) }, null, 1), 'utf8');
