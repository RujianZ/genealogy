/**
 * **谱点了名、我们没接的父子边。**
 *
 * 判据 rank 1「父亲的生子名单点名本人」是全谱最硬的一条。
 * 但它只在**孩子自己那一条写的父名**跟名单主人对得上时才生效；
 * 孩子若写的是嗣父（「壁树嗣子」），名单那一头（生父壁林）就落空了——
 * 而凡例要的正是**双记**：生父在名单里点名，嗣父在他自己条目里写明。
 *
 * 这里只查一件事：某人的名字出现在某位父亲的生子名单里，
 * 且那个名单槽已经按唯一 id 配到了他（sonSlots），
 * 而他的父边里却没有这位——那就是漏了一条谱明写的边。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const hostOfSlot = new Map();     // 名单槽 at → 名单主人
for (const h of D.people) for (const k of (h.kin ?? [])) if (k.role === '子') hostOfSlot.set(k.at, h);

const rows = [];
for (const [at, childPid] of R.sonSlots) {
  const host = hostOfSlot.get(at); if (!host) continue;
  const c = R.idx.get(childPid); if (!c) continue;
  const ps = R.parents(c);
  const has = [...ps.birth, ...ps.heir].some(x => x.edge.parent === host.pid);
  if (has) continue;
  rows.push({ c, host,
    now: [...ps.birth.map(x => '生父' + x.person?.name), ...ps.heir.map(x => '嗣父' + x.person?.name)].join('／') || '无父边',
    wrote: (c.father_name ?? '') + (c.filiation ?? '') });
}
console.log(`名单槽按 id 配上的共 ${R.sonSlots.size} 个；其中 ${rows.length} 个，孩子的父边里没有这位名单主人\n`);
for (const r of rows.slice(0, 40))
  console.log(`   ${r.c.gen}世 ${r.c.name}　名单主人 ${r.host.name}（${r.host.src_human}）\n       他自己写「${r.wrote}」　现有父边：${r.now}\n       ${r.c.src_human}`);
if (rows.length > 40) console.log(`   …还有 ${rows.length - 40} 例`);
