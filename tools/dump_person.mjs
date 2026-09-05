/**
 * 一个人的完整 JSON：身份 + 关系 + 按类目归好的谱上记载。
 *
 * ★ **凡是指人的位置，一律带唯一 id。**
 *   名字只是给人看的；谱里同名太多（叫「继生」的 5 位、
 *   叫「梁元」的 4 位），拿名字当引用就是把几个人搅到一块。
 *   下面最后那道自检会把任何「指了人却没给 id」的位置报出来。
 *
 * 谱上的记载（名号、生殁葬…）保持**原文原字**，不换成 id——
 * 那是谱写的话，不是引用。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
import { CATS } from '../src/core/dossier.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'), prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'), classes: J('分类') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const key = process.argv[2] ?? '承健';
const p = R.idx.get(key) ?? [...R.idx.values()].find(x => x.name === key);
if (!p) { console.log('找不到', key); process.exit(1); }
const dz = R.dossier(p);
const ps = R.parents(p);
const e = R.build.person(p.pid);
const link = c => ({ pid: c.edge.parent, name: R.idx.get(c.edge.parent)?.name, 依据: c.note });
const out = {
  id: p.pid,
  身份: { 名: p.name, 谱上写作: p.name_raw, 世次: p.gen,
          类型: p.attached ? `${p.attached.role}（记在${p.attached.of_name}那一条里）` : '有独立条目',
          出处: p.src_human },
  关系: {
    生父: ps.birth.map(link),
    嗣父: ps.heir.map(link),
    宗法线跟谁: ps.clan.map(link),
    配偶: (e.relations.find(r => /^(妻|侧室|聘)/.test(r.heading))?.items ?? []).map(i => ({ pid: i.id, name: i.label, 类: i.kind })),
    子女: (e.relations.find(r => r.heading === '子女')?.items ?? []).map(i => ({ pid: i.id, name: i.label, 类: i.kind, 注: i.note })),
    兄弟姐妹: (e.relations.find(r => r.heading === '兄弟姐妹')?.items ?? []).map(i => ({ pid: i.id, name: i.label, 类: i.kind })),
  },
  谱上的记载: Object.fromEntries(CATS
    .filter(k => dz.cat[k].length)
    .map(k => [k, dz.cat[k].map(i => i.label ? `${i.label}：${i.text}` : i.text)])),
  别人条目里提到他: dz.mentions.map(m => ({
    写在谁那一条: m.by, name: m.by_name, 世次: m.by_gen,
    哪一类: m.kind, 原文: m.text ?? m.as })),
  销账: dz.audit,
  原文: p.raw_text,
};
console.log(JSON.stringify(out, null, 2));

// ── 自检：关系里每一项都得有 pid，且 pid 得真在名单里 ──
const bad = [];
for (const [k, v] of Object.entries(out.关系)) {
  for (const it of v) {
    if (!it || typeof it !== 'object') { bad.push(`${k}: 「${it}」没带 id`); continue; }
    if (!it.pid) bad.push(`${k}: 「${it.name}」没带 id`);
    else if (!R.idx.has(it.pid)) bad.push(`${k}: id ${it.pid} 不在名单里`);
  }
}
for (const m of out.别人条目里提到他)
  if (!m.写在谁那一条) bad.push(`提到他：「${m.name}」没带 id`);
if (bad.length) { console.error('\n✘ 指了人却没给 id：'); bad.forEach(b => console.error('   ' + b)); process.exitCode = 1; }
