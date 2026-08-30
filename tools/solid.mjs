/**
 * 「能打保票的有多少人」——按最严的标准数一遍。
 *
 * ★ 之前量的是「往上那条链硬不硬」。承健要的比那严：
 *   **打开他的卡片，上面显示的每一条关系都得有谱的两处文字印证。**
 *
 *   卡片上显示的关系有四种，一种一种查：
 *     ① 往上的整条链   —— 每一环都 A/B，一路到胜二公。中间碰上
 *                        C（谱只写了一侧）、D（只靠同名）、E（岔路）、
 *                        F（断了）都不算。
 *     ② 他自己那一环   —— 也得 A/B
 *     ③ 子女栏         —— 每一个孩子都得双向：父亲名单点了他，
 *                        他自己那条也写了这个父名
 *     ④ 兄弟姐妹       —— 靠父亲的子女推出来，所以父亲一定、
 *                        且父亲的子女全都双向，兄弟姐妹才靠得住
 *
 *   ③ 和 ④ 其实是同一件事：**他自己和他父亲的子女栏，全都得双向。**
 *
 * ★ 「双向」的定义一步不放宽：
 *     父亲那一条的生子名单里有他（谱名或字讳号任一）
 *     且 他自己那一条写的父名对得上父亲
 *   两处写在书上不同的地方。要错，得两处同时错。
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
import { norm } from '../src/core/norm.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const bare = (s) => fname(s).replace(/公$/, '');
const forms = (p) => [bare(p.name), ...p.aliases.map(a => bare(a.form))];

// ── 每个人自己那一环
const grade = new Map(), dad = new Map();
for (const p of people) {
  if (isFragment(p)) continue;
  const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  if (!keep.length) { grade.set(p.pid, p.gen === 1 ? 'S' : 'F'); continue; }
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;
  if (line.length > 1) { grade.set(p.pid, 'E'); continue; }
  const f = idx.get(line[0].edge.parent);
  dad.set(p.pid, f.pid);
  const named = f && roster(f).sons.some(x => forms(p).includes(bare(x.name || x.raw)));
  const wrote = f && !!bare(p.father_name) && forms(f).includes(bare(p.father_name));
  const row = f && f.gen != null && p.gen != null && p.gen - f.gen === 1
    && f.src.row === p.src.row - 1;
  const s = [named, wrote, row].filter(Boolean).length;
  grade.set(p.pid, s >= 3 ? 'A' : s === 2 ? 'B' : (named || wrote) ? 'C' : 'D');
}
const AB = (pid) => 'AB'.includes(grade.get(pid) ?? 'F');

// ── 一个人的子女栏是不是**每一个都双向**
const kidsSolid = new Map();
for (const f of people) {
  if (isFragment(f)) continue;
  const names = roster(f).sons.filter(x => !x.died);
  if (!names.length) { kidsSolid.set(f.pid, true); continue; }   // 没子女，无从错
  let ok = true;
  for (const s of names) {
    const nm = bare(s.name || s.raw);
    if (!nm) continue;
    // ★ 不能按「同册同房」去找孩子。**五世一图正好跨册**：
    //   第21世（泽字辈）从册2 跨到册3，第26世（开字辈）从册3 跨到册4，
    //   第16世从卷一跨到卷二、卷三。按册房卡，这三代会整代归零——
    //   一量出「第21世 0/188」这种数就该知道是尺子坏了，不是数据坏了。
    //
    //   改成直接用**认定成立的父子边**：谁的父亲是他，谁就是他的孩子。
    const hit = (KIDS.get(f.pid) ?? []).filter(c => forms(c).includes(nm));
    if (hit.length !== 1) { ok = false; break; }               // 连不上或同名多个
    if (!AB(hit[0].pid)) { ok = false; break; }
  }
  kidsSolid.set(f.pid, ok);
}

// ── 往上整条链全程 A/B
const chainAB = new Map();
function upOk(pid, seen = new Set()) {
  if (chainAB.has(pid)) return chainAB.get(pid);
  if (seen.has(pid)) return false;
  seen.add(pid);
  const p = idx.get(pid);
  let r;
  if (!p) r = false;
  else if (p.gen === 1) r = true;                              // 走到始祖
  else if (!AB(pid)) r = false;
  else r = upOk(dad.get(pid), seen);
  chainAB.set(pid, r);
  return r;
}

const all = people.filter(p => !isFragment(p));
const R = { full: [], upOnly: [], kidOnly: [], neither: [] };
for (const p of all) {
  const up = p.gen === 1 ? true : upOk(p.pid);
  const kid = (kidsSolid.get(p.pid) ?? false)
    && (p.gen === 1 || (dad.has(p.pid) && (kidsSolid.get(dad.get(p.pid)) ?? false)));
  if (up && kid) R.full.push(p);
  else if (up) R.upOnly.push(p);
  else if (kid) R.kidOnly.push(p);
  else R.neither.push(p);
}
const n = all.length, pc = (a) => (a * 100 / n).toFixed(1) + '%';
console.log('═'.repeat(70));
console.log(`全谱有独立条目的 ${n} 人（另有 3,969 位配偶／女儿／夭折子有 id，不在此列）`);
console.log('');
console.log(`★ 一切都硬                          ${String(R.full.length).padStart(4)} 人  ${pc(R.full.length)}`);
console.log(`   （上溯到始祖每一环双向印证，`);
console.log(`     且他和他父亲的子女栏全部双向）`);
console.log('');
console.log(`  只有上溯硬，子女栏有软的          ${String(R.upOnly.length).padStart(4)} 人  ${pc(R.upOnly.length)}`);
console.log(`  只有子女硬，上溯中间有软环        ${String(R.kidOnly.length).padStart(4)} 人  ${pc(R.kidOnly.length)}`);
console.log(`  两头都有软的                      ${String(R.neither.length).padStart(4)} 人  ${pc(R.neither.length)}`);
console.log('═'.repeat(70));

const byGen = {};
for (const p of R.full) byGen[p.gen] = (byGen[p.gen] ?? 0) + 1;
const totGen = {};
for (const p of all) totGen[p.gen] = (totGen[p.gen] ?? 0) + 1;
console.log('\n【「一切都硬」按世次分布】');
for (const g of Object.keys(totGen).map(Number).sort((a, b) => a - b)) {
  const a = byGen[g] ?? 0, t = totGen[g];
  const bar = '█'.repeat(Math.round(a * 30 / t));
  console.log(`   第${String(g).padStart(2)}世  ${String(a).padStart(3)}/${String(t).padStart(3)}`
    + `  ${(a * 100 / t).toFixed(0).padStart(3)}%  ${bar}`);
}
const me = people.find(p => p.name === '承健' && p.gen === 27);
console.log(`\n承健本人：${R.full.includes(me) ? '★ 一切都硬' :
  R.upOnly.includes(me) ? '上溯硬，子女栏有软的' : '有软环'}`);
