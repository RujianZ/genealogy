import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { buildFacts } from '../src/core/facts.ts';
import { makeRegistry } from '../src/core/entries.ts';
import { roster } from '../src/core/roster.ts';
import { norm, loadTables } from '../src/core/norm.ts';
// DATA=build/new 可把全部工具指向新解析的产物，旧数据不动
const DIR = process.env.DATA || 'data';
const J = n => { try { return JSON.parse(readFileSync(new URL(`../${DIR}/${n}.json`, import.meta.url), 'utf8')); }
                 catch { return JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8')); } };
// ★ 走注册表同一份判定。早先这里自己搭一条 resolveAll，
//   漏传了 canon（同一个人的几条记载），于是闸上报「说不清 1」、
//   台账和 app 那边却是 0——同一件事两个答案。一套判定。
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'), classes: J('分类') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const people = withBacklinks(D.people);
const idx = R.idx;
const F = buildFacts(people, D.generations);
const bare = s => norm(s ?? '').replace(/公$/, '');
const ALL = R.res;
const RES = p => ALL.get(p.pid);

// 验收闸：拿「谱自己点了名」的确定父子对当标准答案
const byGenName = new Map();
for (const p of people) {
  if (p.gen == null) continue;
  for (const f of new Set([bare(p.name), ...p.aliases.map(a => bare(a.form))]))
    (byGenName.get(`${p.gen}|${f}`) ?? byGenName.set(`${p.gen}|${f}`, []).get(`${p.gen}|${f}`)).push(p);
}
const truth = [];
for (const p of people) {
  if (p.gen == null || !p.father_name) continue;
  const w = bare(p.father_name);
  const cands = byGenName.get(`${p.gen - 1}|${w}`) ?? [];
  if (cands.length < 1) continue;
  const named = cands.filter(f => roster(f).sons.some(s => {
    const t = bare(s.name); const forms = new Set([bare(p.name), ...p.aliases.map(a => bare(a.form))]);
    return forms.has(t);
  }));
  if (named.length === 1) truth.push([p, named[0]]);
}
// ★ **一一对应才算确定。**
//   同名的两个孩子会配到同一个名单槽上：
//     承强（册4 p35，字承强，生1957）写「开先长子」
//     承强（册4 p66，字志强，生1992）写「开先之子」
//   而开先@p66 的名单里只有一个「承强」——这一对本来就不确定，
//   放进标准答案里就是拿一个猜测当尺子。凡是几个孩子抢同一个槽的，全剔。
{
  const slot = new Map();
  for (const [kid, dad] of truth) {
    const k = `${dad.pid}|${bare(kid.name)}`;
    (slot.get(k) ?? slot.set(k, []).get(k)).push(kid.pid);
  }
  const dup = new Set();
  for (const [k, v] of slot) if (v.length > 1) for (const x of v) dup.add(x);
  if (dup.size) console.log(`  （剔掉 ${dup.size} 人：同名的几位抢同一个名单槽，谱本来就没说清）`);
  for (let i = truth.length - 1; i >= 0; i--) if (dup.has(truth[i][0].pid)) truth.splice(i, 1);
}
let hit = 0, miss = 0, none = 0, viaHeir = 0; const bad = [];
for (const [kid, dad] of truth) {
  const r = RES(kid);
  // 谱断言的父子链对嗣子来说是「嗣父」那条，所以两边都算命中
  const inB = r.birth.some(b => b.pid === dad.pid);
  const inH = r.heir.some(b => b.pid === dad.pid);
  if (!r.birth.length && !r.heir.length) { none++; continue; }
  if (inB || inH) { hit++; if (!inB) viaHeir++; }
  else {
    miss++;
    if (bad.length < 8) bad.push(`${kid.gen}世 ${kid.name} 应为 ${dad.name}，判成 ${r.birth.map(b => idx.get(b.pid)?.name).join('、')}（${r.level}）　${kid.pid}`);
  }
}
console.log(`验收闸：谱自己点了名的确定父子对 ${truth.length} 对`);
console.log(`  判对 ${hit}（其中 ${viaHeir} 对是嗣父关系）　判错 ${miss}　判不出 ${none}　→ 准确率 ${(hit / truth.length * 100).toFixed(2)}%`);
for (const s of bad) console.log('   ✘', s);
// 覆盖率
const lv = new Map();
for (const f of F.values()) { const r = ALL.get(f.pid); lv.set(r.level, (lv.get(r.level) ?? 0) + 1); }
console.log('\n全谱按判到哪一级：', [...lv].map(([k, v]) => `${k} ${v}`).join(' · '));
