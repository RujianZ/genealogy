/**
 * **过继形状普查——全谱穷举，逐种点数。**
 *
 * 用户的要求：不是看某一个人，是看**所有人**；而且要把花样穷举出来：
 * 嗣好几家、兼祧、本家也算、嗣父比嗣子年纪小、女儿承嗣、招赘、归宗……
 * 每一种都得确认系统认得，而不是撞上了才发现。
 *
 * 没有嗣父是**常态**（绝大多数人），不是缺陷。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm, loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const flat = s => String(s ?? '').replace(/[\s　]+/g, '');
const NS = s => norm(String(s ?? ''));
const yr = p => R.win?.get(p.pid)?.born ?? null;   // 年代窗口给的生年估计

const box = new Map();
const put = (k, p, extra) => { if (!box.has(k)) box.set(k, []); box.get(k).push({ p, extra }); };

for (const p of D.people) {
  const ps = R.parents(p);
  const raw = flat(p.raw_text);
  const nb = ps.birth.length, nh = ps.heir.length;

  if (nh === 0 && nb === 1) put('① 没有嗣父——常态', p);
  if (nh === 0 && nb === 0) put('② 谱既没写生父也没写嗣父', p);
  if (nh === 1 && nb === 1) put('③ 出嗣一房：生父一位、嗣父一位', p);
  if (nh === 1 && nb === 0) put('④ 谱只写了嗣父，没写本生父', p);
  if (nh >= 2) put(`⑤ 兼祧几房：嗣父 ${nh} 位`, p, ps.heir.map(x => x.person?.name).join('、'));
  // 本家也算：几位嗣父里有一位正是生父
  if (nh >= 1 && nb >= 1 && ps.heir.some(h => ps.birth.some(b => b.edge.parent === h.edge.parent)))
    put('⑥ 兼祧含本家（嗣父里有一位就是生父）', p);
  if (/承本身/.test(raw)) put('⑦ 谱写明「承本身」——既承本家又兼祧别房', p);
  if (/承本生父母|归宗|歸宗/.test(raw)) put('⑧ 归宗：宗法线回到本生父', p);
  // 嗣父比嗣子年纪小
  for (const h of ps.heir) {
    const a = yr(p), b = yr(R.idx.get(h.edge.parent) ?? {});
    if (a && b && b > a) put('⑨ 嗣父比嗣子年纪小（过继是宗法，不是生育）', p,
      `${p.name} 约${a} ← 嗣父 ${h.person?.name} 约${b}`);
  }
  if (/[养養]子/.test(raw)) put('⑩ 养子（名单头写「养子N」或本人条写「养子」）', p);
  if (/招[婿壻]|坐婿|入赘/.test(raw)) put('⑪ 招赘／坐婿——世系从女儿这里往下传', p);
  if (/立[^，。]{0,6}女[^，。]{0,4}(承嗣|为嗣)/.test(raw)) put('⑫ 女儿承嗣', p, raw.match(/立[^，。]{0,10}(承嗣|为嗣)/)?.[0]);
  // 跨房过继
  for (const h of ps.heir) {
    const q = R.idx.get(h.edge.parent);
    if (q && q.src.section !== p.src.section) { put('⑬ 跨房过继（嗣父不在同一世系卷）', p,
      `${p.src.section} ← ${q.src.section}`); break; }
  }
  if (/兼[祧挑]/.test(raw)) put('⑭ 原文出现「兼祧」二字', p);
  if (/出[嗣祠]/.test(raw)) put('⑮ 原文出现「出嗣」二字', p);
  if (/立[^，。]{0,12}为嗣/.test(raw)) put('⑯ 原文出现「立…为嗣」', p);
}
// 一人几条记载（双记）
const byCanon = new Map();
for (const p of D.people) {
  const k = R.build.person(p.pid) ? p.pid : p.pid;
  void k;
}
console.log(`全谱有独立条目 ${D.people.length} 人。过继形状穷举：\n`);
for (const [k, v] of [...box].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(v.length).padStart(5)}  ${k}`);
  for (const x of v.slice(0, 3))
    console.log(`         ${x.p.gen}世 ${x.p.name}${x.extra ? '　' + x.extra : ''}　${x.p.src_human}`);
  if (v.length > 3) console.log(`         …还有 ${v.length - 3} 人`);
}
