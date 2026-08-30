/**
 * 一个数：**有多少人，从他自己一路上溯到胜二公，每一环都硬。**
 *
 * ★ 承健问的是「A 和 B 的人能不能保证正确」。
 *   问法要改一下才答得了——**一个人是不是可靠，不取决於他自己那一环，
 *   取决於他往上那一整条链里最弱的那一环。**
 *   他自己是 A，可他爷爷那一环是「只靠同名撞上」，那他往上的祖宗照样悬着。
 *
 *   链条的强度 = 最弱一环的强度。就这一句。
 *
 * ★ 分三档，只看链上最弱的那一环：
 *     全程硬   每一环都有谱的两处以上文字印证（A/B）
 *     有软环   中间经过 C（谱只写了一侧）
 *     有断处   中间经过 D（只靠同名）／E（岔路）／F（断了）
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
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

// 每个人自己那一环的等级 + 生父是谁
const grade = new Map(), dad = new Map();
for (const p of people) {
  if (isFragment(p)) continue;
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  if (!keep.length) { grade.set(p.pid, 'F'); continue; }
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;
  if (line.length > 1) { grade.set(p.pid, 'E'); continue; }
  const e = line[0].edge, f = idx.get(e.parent);
  dad.set(p.pid, e.parent);
  const named = f && roster(f).sons.some(x => bare(x.name || x.raw) === bare(p.name));
  const wrote = f && !!bare(p.father_name)
    && (bare(f.name) === bare(p.father_name)
        || f.aliases.some(a => bare(a.form) === bare(p.father_name)));
  const row = f && f.gen != null && p.gen != null && p.gen - f.gen === 1
    && f.src.row === p.src.row - 1;
  const s = [named, wrote, row].filter(Boolean).length;
  grade.set(p.pid, s >= 3 ? 'A' : s === 2 ? 'B' : (named || wrote) ? 'C' : 'D');
}

const RANK = { A: 0, B: 0, C: 1, D: 2, E: 2, F: 2 };
let hard = 0, soft = 0, broken = 0, top = 0;
const weakest = new Map();
for (const p of people) {
  if (isFragment(p) || p.gen == null) continue;
  let cur = p.pid, worst = 'A', worstAt = null, seen = new Set(), steps = 0;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const g = grade.get(cur);
    const me = idx.get(cur);
    if (me && me.gen === 1) break;                 // 走到始祖，完
    if (!g || RANK[g] === undefined) break;
    if (RANK[g] > RANK[worst]) { worst = g; worstAt = me; }
    const nx = dad.get(cur);
    if (!nx) { if (me && me.gen > 1) { worst = 'F'; worstAt = me; } break; }
    cur = nx; steps++;
  }
  weakest.set(p.pid, { worst, worstAt, steps });
  if (RANK[worst] === 0) hard++;
  else if (RANK[worst] === 1) soft++;
  else broken++;
  if (steps === 0) top++;
}

const tot = hard + soft + broken;
const pc = (a) => (a * 100 / tot).toFixed(1) + '%';
console.log('═'.repeat(62));
console.log(`全谱 ${tot} 人，各自从自己一路上溯，看链上最弱的那一环：`);
console.log(`  全程硬   每一环都有谱的两处文字印证   ${String(hard).padStart(4)} 人  ${pc(hard)}`);
console.log(`  有软环   中间某一环谱只写了一侧       ${String(soft).padStart(4)} 人  ${pc(soft)}`);
console.log(`  有断处   中间碰上同名／岔路／断链     ${String(broken).padStart(4)} 人  ${pc(broken)}`);
console.log('═'.repeat(62));

// 承健自己
const me = people.find(p => p.name === '承健' && p.gen === 27);
if (me) {
  const w = weakest.get(me.pid);
  console.log(`\n承健（第27世 ${me.src_human}）：`);
  console.log(`  上溯 ${w.steps} 步，最弱一环 = ${w.worst}`
    + (w.worstAt ? `（${w.worstAt.name} 第${w.worstAt.gen}世）` : '（全程 A/B）'));
}

// 「有断处」的人，都卡在哪几个人身上？
const blame = new Map();
for (const [, w] of weakest)
  if (RANK[w.worst] === 2 && w.worstAt)
    blame.set(w.worstAt.pid, (blame.get(w.worstAt.pid) ?? 0) + 1);
console.log(`\n【${broken} 人的链子，卡在这几位身上】`);
for (const [pid, n] of [...blame].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  const q = idx.get(pid);
  console.log(`   ${String(n).padStart(4)} 人卡在  第${String(q.gen).padStart(2)}世 ${q.name.padEnd(4)}`
    + ` ${grade.get(pid)} 级   ${q.src_human}`);
}
console.log(`   （共 ${blame.size} 个卡点）`);
