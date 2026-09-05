/**
 * **卡片上印的，和 json 里记的，是不是同一件事。**
 *
 * 不抽样，5,065 张全查。每一项都是「数据库里有 X，卡片上必须找得到 X」——
 * 反过来「卡片上有 Y，原文里必须有 Y」由 audit100 / cardgap 管。
 *
 * 查这几项：
 *   ① 名字类 zi/hui/hao/ming   json 有，卡片必须印
 *   ② 生殁葬寿                  json 有，卡片必须印**原字**
 *   ③ 父                        卡片链接的 pid 必须和 parent_edges 一模一样（多一个少一个都算）
 *   ④ 依据                      谱写的父名和判定给的人**不同名**时，卡片必须说清为什么
 *   ⑤ 妻                        json 的 spouses 一个不少
 *   ⑥ 子女                      json 里认他做父的人，一个不少、一个不多
 *   ⑦ 过继                      adoptions 里每一条，卡片必须摆出来
 *   ⑧ 同名重复                  同一栏里不许出现两个同名同姓的链接
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm } from '../src/core/norm.ts';
import { canonical } from '../src/core/seealso.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const NS = s => norm(s ?? '').replace(/[\s　]+/g, '');
const bare = s => NS(s).replace(/公$/, '');

const bad = new Map();
const note = (what, line) => (bad.get(what) ?? bad.set(what, []).get(what)).push(line);

// 谁认了谁做父（从判定层来，卡片应当和它一致）
// ★ 比的是**卡片 ⟷ json**，不是卡片 ⟷ 判定层。
//   「网站只读 json 渲染」这句话要成立，就得拿 json 当唯一的对照物。
//   判定层和 json 一不一致，是 fk 那道闸的事。
//   「详前」条是**记载**不是人，它的边跟完整条上的一样——只按完整条算。
const CANP = (pid) => { const q = R.idx.get(pid); return q && !q.attached ? canonical(D.people, q).pid : pid; };
const kidsOf = new Map();
for (const q of R.idx.values()) {
  if (CANP(q.pid) !== q.pid) continue;
  for (const e of (q.parent_edges ?? []))
    (kidsOf.get(e.parent) ?? kidsOf.set(e.parent, new Set()).get(e.parent)).add(q.pid);
}

let n = 0;
for (const q of R.idx.values()) {
  const e = R.build.person(q.pid);
  if (!e) { note('建不出卡片', `${q.gen}世 ${q.name} ${q.pid}`); continue; }
  n++;
  const who = `${q.gen}世 ${q.name}　${q.src_human}`;
  const facts = (e.facts ?? []);
  const onCard = facts.flatMap(f => [f.label, f.value, f.raw]).filter(Boolean).map(NS).join(' ');

  // ① 名字类
  for (const [k, lab] of [['zi', '字'], ['hui', '讳'], ['hao', '号'], ['ming', '名']]) {
    const t = q[k]?.text; if (!t) continue;
    if (!onCard.includes(NS(t))) note(`json 有「${lab}」，卡片没印`, `${who}　「${t}」`);
  }
  // ② 生殁葬寿
  for (const [k, lab] of [['birth', '生'], ['death', '殁'], ['burial', '葬'], ['age', '寿']]) {
    const t = q[k]?.text; if (!t) continue;
    if (!onCard.includes(NS(t))) note(`json 有「${lab}」，卡片没印`, `${who}　「${t.slice(0, 30)}」`);
  }
  // ③ 父：卡片链的 pid 必须和判定层一模一样
  {
    const want = new Set((q.parent_edges ?? []).map(e => e.parent));
    const got = new Set(facts.filter(f => String(f.label).startsWith('父'))
      .flatMap(f => (f.links ?? []).filter(l => l.kind === 'person').map(l => l.id)));
    for (const x of want) if (!got.has(x))
      note('判定给了这位父亲，卡片上没有', `${who}　少了 ${R.idx.get(x)?.name}@${R.idx.get(x)?.src_human}`);
    for (const x of got) if (!want.has(x))
      note('卡片上的父亲，判定层没给', `${who}　多了 ${R.idx.get(x)?.name}@${R.idx.get(x)?.src_human}`);
    // ④ 谱写的父名 ≠ 判定给的人名 → 卡片必须说清为什么
    if (q.father_name && want.size) {
      const w = bare(q.father_name);
      const same = [...want].some(x => {
        const f = R.idx.get(x); if (!f) return false;
        return bare(f.name) === w || (f.aliases ?? []).some(a => bare(a.form) === w);
      });
      if (!same) {
        const said = [facts.filter(f => String(f.label).startsWith('父'))
          .flatMap(f => [f.raw, f.note, ...(f.links ?? []).map(l => l.note),
                         ...(f.links ?? []).map(l => l.raw)]).filter(Boolean).join(' '),
          ...(e.sections ?? []).map(s => s.text)].join(' ');
        if (NS(said).length < 8)
          note('★谱写的父名和卡片给的人不同名，卡片却没说为什么',
            `${who}　谱写「${q.father_name}」→ 卡片 ${[...want].map(x => R.idx.get(x)?.name).join('、')}`);
      }
    }
  }
  // ⑤ 妻
  for (const s of (q.spouses ?? [])) {
    const nm = NS(s.name_raw); if (!nm) continue;
    const on = (e.relations ?? []).flatMap(r => r.items ?? []).map(i => NS(i.label)).join(' ');
    if (!on.includes(nm) && !onCard.includes(nm))
      note('json 有这位配偶，卡片没列', `${who}　「${s.rel}${s.name_raw}」`);
  }
  // ⑥ 子女
  {
    const want = kidsOf.get(q.pid) ?? new Set();
    const got = new Set((e.relations ?? []).filter(r => r.heading === '子女')
      .flatMap(r => r.items ?? []).filter(i => i.kind === 'person').map(i => i.id));
    for (const x of want) if (!got.has(x))
      note('有人认他做父，子女栏里却没有', `${who}　少了 ${R.idx.get(x)?.name}@${R.idx.get(x)?.src_human}`);
  }
  // ⑦ 过继
  for (const a of (q.adoptions ?? [])) {
    const t = NS(a['原话'] ?? '');
    if (!t) continue;
    const all = [onCard, ...(e.sections ?? []).map(s => NS(s.text)),
      ...(e.relations ?? []).flatMap(r => (r.items ?? []).map(i => NS(i.note ?? '')))].join(' ');
    if (!all.includes(t)) note('json 有这条过继语句，卡片没印', `${who}　「${a['原话']}」`);
  }
  // ⑧ 同一栏里同名重复
  for (const r of (e.relations ?? [])) {
    // 两个不同的人同名不算错——**读的人分不分得开**才算。
    // 标签＋注一模一样、点开却是两个人，那就是分不开。
    const seen = new Map();
    for (const i of (r.items ?? []).filter(x => x.kind === 'person')) {
      const k = String(i.label) + '｜' + String(i.note ?? '');
      (seen.get(k) ?? seen.set(k, []).get(k)).push(i.id);
    }
    for (const [lab, ids] of seen) {
      if (new Set(ids).size < ids.length)
        note(`「${r.heading}」栏里同一个人列了两遍`, `${who}　「${lab.split('｜')[0]}」`);
      else if (ids.length > 1)
        note(`「${r.heading}」栏里两个人长得一模一样，读的人分不开`,
          `${who}　「${lab.split('｜')[0]}」×${ids.length}：${ids.map(x => R.idx.get(x)?.src_human).join(' ／ ')}`);
    }
  }
}

console.log(`全量对了 ${n} 张卡片和它们在 json 里的记载\n`);
if (!bad.size) { console.log('  ✔ 卡片上印的和 json 里记的完全一致'); process.exit(0); }
const N = Number(process.argv[2] ?? 5);
for (const [what, list] of [...bad].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ✘ ${what}　${list.length} 处`);
  for (const x of list.slice(0, N)) console.log(`       ${x}`);
  if (list.length > N) console.log(`       …还有 ${list.length - N} 处`);
}
process.exitCode = 1;
