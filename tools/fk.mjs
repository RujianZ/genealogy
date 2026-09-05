/**
 * **外键闸：`parent_edges` 里每一条都得指向一个真实存在的 pid。**
 *
 * 这道闸盯四件事：
 *   ① 每条边的 parent 是 pid，且那个 pid 在名单里
 *   ② 生父最多一位（兼祧含本家、谱写「承本身」的除外）
 *   ③ 同一种关系里不出现两个同名的候选——**那正是要消掉的那句话**
 *   ④ 写回的答案跟判定层当场算的一致（文件没落后于系统）
 *
 * `parent_candidates` 是题面，可以有几条同名的；`parent_edges` 是答案，不许。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { canonical } from '../src/core/seealso.ts';
import { EraChart } from '../src/core/years.ts';
import { norm, loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const NS = s => norm(String(s ?? ''));
const flat = s => String(s ?? '').replace(/[\s　]+/g, '');

const bad = [];
let edges = 0, cand = 0;
for (const p of D.people) {
  const es = p.parent_edges;
  if (!Array.isArray(es)) { bad.push(`${p.name} 没有 parent_edges 这一格`); continue; }
  cand += (p.parent_candidates ?? []).length;
  edges += es.length;
  // ① 外键
  for (const e of es) {
    if (!e.parent) bad.push(`${p.gen}世 ${p.name} 有一条边没有 pid`);
    else if (!R.idx.has(e.parent)) bad.push(`${p.gen}世 ${p.name} 的边指向 ${e.parent}，名单里没有这个 id`);
  }
  // ② 生父最多一位
  const b = es.filter(e => e.kind === '生父');
  if (b.length > 1 && !/承本身/.test(flat(p.raw_text)))
    bad.push(`${p.gen}世 ${p.name} 有 ${b.length} 位生父　${p.src_human}`);
  // ③ 同一种关系里不出现同名
  for (const k of ['生父', '嗣父']) {
    const names = es.filter(e => e.kind === k).map(e => NS(e.parent_name));
    if (new Set(names).size !== names.length)
      bad.push(`${p.gen}世 ${p.name} 的${k}里有两位同名（${names.join('、')}）　${p.src_human}`);
  }
  // ④ 文件里的答案 == 判定层当场算的
  const ps = R.parents(p);
  const live = [...ps.birth.map(c => '生父|' + c.edge.parent), ...ps.heir.map(c => '嗣父|' + c.edge.parent)].sort().join(',');
  const file = es.map(e => e.kind + '|' + e.parent).sort().join(',');
  if (live !== file) bad.push(`${p.gen}世 ${p.name} 文件里的边跟判定层算的不一样\n       文件 ${file}\n       判定 ${live}`);
}
// ── 过继语句：不允许留一个名字给下游去猜 ────────────
//   每一条要么落到 pid，要么**写明为什么落不了**。
//   谱写「次子启昌出嗣**朝阳**」——「朝阳」不是身份，
//   不转成 pid 存起来，每个读它的人都得再搜一遍同名。
let ad = 0, adPid = 0;
for (const p of D.people) for (const a of p.adoptions ?? []) {
  ad++;
  if (a.去处) {
    adPid++;
    if (!R.idx.has(a.去处)) bad.push(`${p.gen}世 ${p.name} 的过继记录指向 ${a.去处}，名单里没这个 id`);
  } else if (!a.怎么定的) {
    bad.push(`${p.gen}世 ${p.name} 的过继记录「${a.原话}」既没 pid 也没说明为什么`);
  }
  if (a.写在谁那一条 && !R.idx.has(a.写在谁那一条))
    bad.push(`${p.gen}世 ${p.name} 的过继记录，写话人 id ${a.写在谁那一条} 不存在`);
}

console.log(`题面 parent_candidates ${cand} 条 → 答案 parent_edges ${edges} 条（收敛 ${cand - edges} 条）`);
console.log(`过继语句 ${ad} 条：落到 pid 的 ${adPid} 条，其余 ${ad - adPid} 条各自写明了为什么落不了`);
// ══ A→B 记了，B→A 也要记，两边一一对应 ══
//
// 父边在 json 里存两遍：孩子身上 parent_edges、父亲身上 children。
// 只存一边，另一边就得在用的时候算；算的地方不止一处，
// 一处算法不一样就出两个答案（重复子女、少列子女都是这么来的）。
// 两边必须严格互为镜像——多一条少一条都算坏。
{
  // 「详前」条是记载不是人，它的边跟完整条上的一样——只按完整条比。
  const CANP = (pid) => { const q = R.idx.get(pid); return q ? canonical(D.people, q).pid : pid; };
  const fwd = new Set(), back = new Set();
  for (const p of D.people) {
    if (CANP(p.pid) !== p.pid) continue;
    for (const e of p.parent_edges ?? []) fwd.add(`${e.parent}→${p.pid}|${e.kind}`);
    for (const c of p.children ?? []) back.add(`${p.pid}→${c.child}|${c.kind}`);
  }
  const onlyF = [...fwd].filter(x => !back.has(x));
  const onlyB = [...back].filter(x => !fwd.has(x));
  if (onlyF.length || onlyB.length) {
    bad.push(`父边正反不对称：只有 parent_edges 的 ${onlyF.length} 条，`
           + `只有 children 的 ${onlyB.length} 条`);
    for (const x of [...onlyF.slice(0, 4), ...onlyB.slice(0, 4)]) bad.push('     ' + x);
  } else {
    console.log(`父边正反两边一一对应　${fwd.size} 条（A→B 记了，B→A 也记）`);
  }
}

// ══ 修谱名目：人死了就不能再修谱 ══
//
// 这不是猜，是谱自己写的两个日期在打架。名目写「承武　字成祥」，
// 全谱只有一位字成祥——可他殁于 1994，而那是 2016 那一届的名目。
// 年号→公元只在这里用来**排除**，界面上一个字都不换。
{
  const chart = new EraChart(J('erachart'));
  const ad = t => chart.lookup(t).ad;
  for (const r of D.revisions) {
    const year = ad(r.era + '年');
    if (year == null) continue;
    for (const m of (r.members ?? [])) {
      const q = m.pid && R.idx.get(m.pid);
      if (!q) continue;
      const d = ad((q.death ?? {}).text), b = ad((q.birth ?? {}).text);
      if (d != null && d < year)
        bad.push(`${r.era}（${year}）名目里的「${m.raw}」指向 ${q.name}，可他殁于 ${d}`);
      if (b != null && b > year)
        bad.push(`${r.era}（${year}）名目里的「${m.raw}」指向 ${q.name}，可他生于 ${b}`);
    }
  }
}

// ══ 过继：三方各记一份，一份都不许少 ══
//
// 一句过继语句牵着三个人：说的是谁（本人）· 写话人 · 去处（嗣父）。
// **认了的事，每个当事人的 json 里都得有它和对方的 id**——不然要用就得
// 在渲染时回头扫全谱找，那又变成「用的时候算」，两处算法两个答案。
{
  const key = a => [a.写在谁那一条, a.说的是谁, a.原话, a.去处 ?? ''].join('|');
  const has = new Map();
  for (const p of D.people)
    for (const a of p.adoptions ?? [])
      (has.get(p.pid) ?? has.set(p.pid, new Set()).get(p.pid)).add(key(a));
  let nAd = 0;
  for (const p of D.people) for (const a of p.adoptions ?? []) {
    nAd++;
    for (const [who, lab] of [[a.说的是谁, '说的是谁'], [a.写在谁那一条, '写在谁那一条'], [a.去处, '去处']]) {
      if (!who) continue;
      if (!R.idx.get(who)) { bad.push(`过继记录的「${lab}」指向不存在的 pid：${who}（${p.name} ${p.src_human}）`); continue; }
      if (!has.get(who)?.has(key(a)))
        bad.push(`过继「${a.原话}」在 ${p.name} 那里记了，${lab} ${R.idx.get(who).name} 那里没记`);
    }
  }
  console.log(`过继三方对账　${nAd} 条记录（本人 · 写话人 · 去处，各存一份）`);
}
if (!bad.length) console.log('\n  ✔ 每条边都指向一个真实 pid；生父不超一位；同一种关系里没有同名；文件与判定层一致；过继三方各记一份');
else { console.log(`\n  ✘ ${bad.length} 处：`); bad.slice(0, 20).forEach(b => console.log('     ' + b));
       if (bad.length > 20) 

console.log(`     …还有 ${bad.length - 20} 处`); process.exitCode = 1; }
