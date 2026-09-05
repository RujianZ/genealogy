/**
 * **没人认领的生子名单槽。**
 *
 * linkSons 的做法是「先有 id 之间的父子边，再回头认名单槽」——
 * 这一步保证了不靠名字乱配。代价是：孩子的父边若指向别处（写的是嗣父），
 * 名单这一头就永远没人来认，於是谱明写的那条生父边落空。
 *
 *   壁林　生子二　继乾　继坤        ← 名单点了名（rank 1，最硬）
 *   继乾　「壁树嗣子」              ← 他自己写的是嗣父
 *   → 继乾的父边只有嗣父壁树，生父壁林不见了
 *
 * 这里把所有没人认的槽摆出来，按「谱里叫这名字、且世次刚好低一世的人有几位」分组：
 *   0 位 → 这个儿子谱里没有独立条目（附记之人，正常）
 *   1 位 → **唯一，谱自己就把话说死了**
 *   >1 位 → 得看谱面
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm, loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'), classes: J('分类') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const bare = s => norm(s ?? '').replace(/公$/, '');

const byName = new Map();
for (const p of D.people) { const k = bare(p.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }

let total = 0; const g0 = [], g1 = [], gN = [];
for (const host of D.people) for (const k of (host.kin ?? [])) {
  if (k.role !== '子') continue;
  total++;
  if (R.sonSlots.has(k.at)) continue;
  const nm = bare(k.given || k.name_raw);
  if (!nm) { g0.push({ host, k, nm: '(无名)' }); continue; }
  const cands = (byName.get(nm) ?? []).filter(q => q.gen === host.gen + 1);
  const row = { host, k, nm, cands };
  (cands.length === 0 ? g0 : cands.length === 1 ? g1 : gN).push(row);
}
console.log(`生子名单槽 ${total} 个，其中 ${R.sonSlots.size} 个已按 id 认领，${total - R.sonSlots.size} 个没人认\n`);
const has = (c, h) => { const ps = R.parents(c); return [...ps.birth, ...ps.heir].some(x => x.edge.parent === h.pid); };
console.log(`【无条目的儿子】${g0.length} 个 —— 附记之人，正常`);
const g1lost = g1.filter(r => !has(r.cands[0], r.host));
console.log(`\n【谱里同名同世下一代只有一位】${g1.length} 个，其中 ${g1lost.length} 个这位的父边里没有名单主人：`);
for (const r of g1lost.slice(0, 30)) {
  const c = r.cands[0], ps = R.parents(c);
  const now = [...ps.birth.map(x => '生父' + x.person?.name), ...ps.heir.map(x => '嗣父' + x.person?.name)].join('／') || '无父边';
  console.log(`   ${r.host.gen}世 ${r.host.name} 名单里的「${r.nm}」→ ${c.pid}\n       他自己写「${c.father_name}${c.filiation}」　现有父边：${now}\n       名单在 ${r.host.src_human}　本人在 ${c.src_human}`);
}
if (g1lost.length > 30) console.log(`   …还有 ${g1lost.length - 30} 例`);
console.log(`\n【同名候选不止一位】${gN.length} 个 —— 要回谱面看`);
for (const r of gN.slice(0, 15)) console.log(`   ${r.host.gen}世 ${r.host.name} 名单里的「${r.nm}」：候选 ${r.cands.length} 位　${r.host.src_human}`);
if (gN.length > 15) console.log(`   …还有 ${gN.length - 15} 例`);
