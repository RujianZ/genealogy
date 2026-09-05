/**
 * **全站唯一 id 闸。**
 *
 * 规矩只有一条：**凡是指到人的地方，必须是 pid，且 pid 必须在名单里。**
 *
 * 名字不是身份。谱里叫「继生」的 5 位、叫「梁元」的 4 位、叫「泽富」的 2 位；
 * 任何一处拿名字当引用，就是把这几个人搅成一个。这道闸不看措辞、不看排版，
 * 只看每一条关系有没有落到一个真实存在的 id 上。
 *
 * 查的范围（卡片上会「列人」的每一处）：
 *   父边（生父／嗣父／宗法线）· 配偶 · 子女 · 兄弟姐妹 · 反向引用
 *   以及界面上任何 kind==='person' 的链接
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { materialize } from '../src/core/persons.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);

const bad = [];
const say = (p, where, what) => bad.push(`${p.gen}世 ${p.name}　${where}：${what}　${p.src_human}`);

let n = 0, links = 0;
for (const p of R.idx.values()) {
  n++;
  const ps = R.parents(p);
  for (const [lab, arr] of [['生父', ps.birth], ['嗣父', ps.heir], ['宗法线', ps.clan], ['另有同名', ps.alsoNamed]]) {
    for (const c of arr) {
      links++;
      if (!c.edge.parent) say(p, lab, `「${c.edge.parent_name || '?'}」没有 id`);
      else if (!R.idx.has(c.edge.parent)) say(p, lab, `id ${c.edge.parent} 不在名单里`);
    }
  }
  const e = R.build.person(p.pid);
  if (!e) { say(p, '卡片', '建不出来'); continue; }
  for (const r of e.relations ?? []) {
    for (const it of r.items) {
      if (it.kind !== 'person') continue;      // 地名、文献、世次…不是人
      links++;
      if (!it.id) say(p, r.heading, `「${it.label}」是个人，却没给 id`);
      else if (!R.idx.has(it.id)) say(p, r.heading, `「${it.label}」的 id ${it.id} 不在名单里`);
    }
  }
}

// 附记之人（妻、女、无条目的子）也各有唯一 id。
// ★ 用注册表自己那份（R.idx），不另外 materialize 一遍——
//   另算一遍会把「已经有条目的儿子」再造一个，那正是一人两 id。
const own = [...R.idx.values()].filter(q => q.attached).length;
// 谱上每一个名单槽都得能落到一个 id 上：要么是他自己的条目，
// 要么是附记之人的 id。一个都不能悬空。
let slots = 0, lost = 0;
for (const host of D.people) for (const k of (host.kin ?? [])) {
  slots++;
  const pid = k.person || k.at;
  const here = R.idx.has(pid);
  // 有自己条目的儿子：槽位已经配到他本人的 pid（sonSlots），不另造人
  const asOwn = R.sonSlots.has(k.at);
  if (!here && !asOwn) { lost++; if (lost <= 12) bad.push(`名单槽落不到 id：${host.gen}世 ${host.name} 那一条的「${k.name_raw || k.given}」　${host.src_human}`); }
}

// ★ 别的文件里写着的 pid 也得是真的。
//   `data/revisions.json` 曾经整份都是旧格式的 pid——241 个，一个都点不开，
//   而三道闸都只扫人物之间的引用，谁也没发现。存 id 的地方就得查 id。
let ext = 0;
for (const r of D.revisions) for (const m of (r.members ?? [])) {
  if (!m.pid) continue;
  ext++;
  if (!R.idx.has(m.pid)) bad.push(`修谱名目「${r.era}　${m.raw}」写着的 pid 不存在：${m.pid}`);
}

console.log(`全表 ${R.idx.size} 个唯一 id（有条目 ${R.idx.size - own} · 附记之人 ${own}）`);
console.log(`另查了 ${ext} 个写在别处的 pid（历届修谱名目）`);
console.log(`查了 ${n} 张卡片、${links} 处指向人的引用、${slots} 个名单槽（落不到 id 的 ${lost} 个）`);
if (!bad.length) console.log('\n  ✔ 每一处指到人的地方都是唯一 id，没有一处靠名字');
else { console.log(`\n  ✘ ${bad.length} 处没走 id：`); bad.slice(0, 25).forEach(b => console.log('     ' + b));
       if (bad.length > 25) console.log(`     …还有 ${bad.length - 25} 处`); process.exitCode = 1; }
