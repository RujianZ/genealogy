/**
 * **id 级不变量：同一个 pid 不能既是他的生父又是他的嗣父。**
 *
 * 这条不看名字、不看措辞，只看 id 撞没撞。撞了只有两种可能：
 *   ① 谱真写了「承本身」——既承本家，又兼祧别房。那是实情，放行。
 *   ② 判定层把已经定下的嗣父又填进了生父那一格。那是 bug。
 *
 * 光孝就是②：谱三处互证「生父梁柱、嗣父梁椽」，而我们两栏都填了梁椽。
 * 这类错用名字是看不出来的（名字一样嘛），用 id 一眼就看见。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const flat = s => String(s ?? '').replace(/[\s　]+/g, '');
const ok = [], bad = [];
for (const p of R.idx.values()) {
  const ps = R.parents(p);
  if (!ps.heir.length || !ps.birth.length) continue;
  const b = new Set(ps.birth.map(x => x.edge.parent));
  const hit = ps.heir.filter(x => b.has(x.edge.parent));
  if (!hit.length) continue;
  const raw = flat(p.raw_text);
  // ★ 兼祠**本来就包含本家**：一人承几房，其中一房就是他自己生父那一房。
  //   继盟一子三祠（壁岳・壁环・壁火），而壁火名单里写着他——
  //   壁火既是生父又是祠父，那是谱的实情，不是撞车。
  const keeps = /承本身/.test(raw) || ps.heir.length > 1;
  (keeps ? ok : bad).push({ p, hit, raw });
}
console.log(`两栏撞上同一个 id 的共 ${ok.length + bad.length} 人`);
console.log(`  兼祠到本家，或谱写了「承本身」——撞是实情：${ok.length} 条`);
for (const r of ok) console.log(`     ${r.p.gen}世 ${r.p.name}　${r.p.src_human}`);
console.log(`\n  谱没写「承本身」，撞就是判错：${bad.length} 人`);
for (const r of bad) console.log(`     ${r.p.gen}世 ${r.p.name}　撞在「${r.hit.map(x => x.person?.name).join('、')}」`
  + `\n         本人写「${r.p.father_name}${r.p.filiation}」　${r.p.src_human}`);
if (bad.length) process.exitCode = 1;
