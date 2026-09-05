/**
 * **界面上不许出现「有两个同名，不知道是哪一个」这类话。**
 *
 * 用户的原话：「我不允许错误或者恶心的什么有两个同名，不确定是哪一个，
 * 这就是可以确定的。」——谱上绝大多数重名是判得出来的；判不出的极少，
 * 那时也要**说清楚情况是怎么样的**，而不是甩一句「不知道」。
 *
 * 这道闸把**用户真能看见的每一段文字**渲染出来再查：
 *   人物卡的每一栏、每条依据、每个链接的注、事迹栏
 *   世系树的每一步、分叉说明
 *   关系计算器的结论
 *   搜索命中的理由
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
import { buildTree } from '../src/core/tree.ts';
import { kinship, describe } from '../src/core/kinship.ts';
import { search } from '../src/core/search.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);

// 要抓的措辞。分两类：
//   ✘ 绝对不许——把「判得出」说成「判不出」
//   ⚠ 要看一眼——含糊词，可能是在如实描述谱面，也可能是在推卸
const BAN = [
  /没说是哪一?一?个/, /不知道是哪一?一?个/, /不确定是哪一?一?个/,
  /说不清/, /无法确定/, /不能确定/, /哪一位都有可能/, /都有可能/,
  /叫这名字的有\s*\d+\s*位[，,、]?\s*(没说|不知)/,
];
// 「**不**可能」是斩钉截铁的话，不是含糊——别把它也报了。
const WARN = [/(?<!不)可能是/, /也许/, /大概/, /存疑/, /待考/, /或许/];

const texts = [];   // {who, where, text}
const add = (who, where, t) => { if (t) texts.push({ who, where, text: String(t) }); };

for (const p of D.people) {
  const e = R.build.person(p.pid);
  if (!e) continue;
  const who = `${p.gen}世 ${p.name}　${p.src_human}`;
  add(who, '卡片标题', e.title); add(who, '卡片副题', e.subtitle);
  for (const f of e.facts ?? []) { add(who, `字段「${f.label}」`, f.value); add(who, `字段「${f.label}」注`, f.note);
    for (const l of f.links ?? []) { add(who, `字段「${f.label}」链接`, l.label); add(who, `字段「${f.label}」链接注`, l.note); }
    add(who, `字段「${f.label}」提示`, f.warn); }
  for (const r of e.relations ?? []) { add(who, `关系「${r.heading}」`, r.note);
    for (const it of r.items) { add(who, `关系「${r.heading}」`, it.label); add(who, `关系「${r.heading}」注`, it.note); } }
  for (const s of e.sections ?? []) { add(who, `事迹「${s.heading}」`, s.text); }
  add(who, '卡片警示', e.alert);
  // 判定依据（卡片上「为什么是他」那一句）
  const ps = R.parents(p);
  for (const c of [...ps.birth, ...ps.heir, ...ps.alsoNamed]) add(who, '父亲依据', c.note);
}

// 世系树：随机 120 人（全跑太慢），加上用户直系
const me = D.people.find(p => p.name === '承健' && p.gen === 27);
const pick = [me, ...D.people.filter((_, i) => i % 19 === 0)].filter(Boolean);
for (const p of pick) {
  const t = buildTree(R.idx, p.pid, undefined, R.parents);
  add(`${p.gen}世 ${p.name}`, '世系树小结', t.summary);
  for (const row of t.rows ?? []) for (const c of row.cells ?? []) {
    add(`${p.gen}世 ${p.name}`, '树·步骤', c.note); add(`${p.gen}世 ${p.name}`, '树·分叉', c.alt);
  }
}
// 关系计算器：随机 60 对
for (let i = 0; i + 37 < D.people.length; i += 37) {
  const k = kinship(R.idx, D.people[i].pid, D.people[i + 37].pid, R.parents);
  if (k) {
    add('关系计算器', '结论', k.note);
    add('关系计算器', '称呼', k.directTerm);
    for (const c of k.commons ?? []) {
      const d = describe(k, c);
      add('关系计算器', '共祖说明', d.fact);
      add('关系计算器', '叫法', d.call);
    }
  }
}
// 搜索理由：几个高频重名
for (const q of ['继生', '梁元', '承强', '开发', '泽富', '继华', '火生']) {
  for (const h of search(D.people, q)) for (const m of h.matches)
    add(`搜「${q}」→ ${h.person.name}`, '命中理由', m.why);
}

const bad = [], warn = [];
for (const t of texts) {
  if (BAN.some(re => re.test(t.text))) bad.push(t);
  else if (WARN.some(re => re.test(t.text))) warn.push(t);
}
console.log(`渲染了 ${texts.length} 段用户能看见的文字（卡片 ${D.people.length} 张 · 树 ${pick.length} 棵 · 关系 60 对 · 搜索 7 个词）\n`);
if (!bad.length) console.log('  ✔ 没有一处说「有两个同名，不知道是哪一个」');
else {
  console.log(`  ✘ ${bad.length} 处还在说含糊话：`);
  for (const b of bad.slice(0, 20)) console.log(`     ${b.who}\n         【${b.where}】${b.text.slice(0, 100)}`);
  if (bad.length > 20) console.log(`     …还有 ${bad.length - 20} 处`);
  process.exitCode = 1;
}
if (warn.length) {
  console.log(`\n  ⚠ ${warn.length} 处带「可能／也许」这类词，看一眼是不是在如实描述谱面：`);
  const seen = new Set();
  for (const w of warn) { const k = w.text.slice(0, 40); if (seen.has(k)) continue; seen.add(k);
    if (seen.size <= 12) console.log(`     ${w.who}\n         【${w.where}】${w.text.slice(0, 96)}`); }
  if (seen.size > 12) console.log(`     …共 ${seen.size} 种说法`);
}
