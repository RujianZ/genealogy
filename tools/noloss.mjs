/**
 * 反向查：**有没有把真的关系弄丢。**
 *
 * 不变量（两个方向都要成立，缺一个就是有人在某张卡上消失了）：
 *
 *   ①  A 的父亲判成了 B  →  翻到 B 的卡片，子女栏里必须有 A
 *   ②  B 的子女栏里列了 A →  A 的父亲栏里必须有 B
 *
 * 只认唯一 id，不比名字——名字比对是判定层的事，到了这一层已经该只剩 pid。
 *
 * 原版（2575ef2）依赖 candidates.ts，那一层重构时删了，脚本跟着没了；
 * 但守的东西没变，所以照新架构重写一份，不是新增检查。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { canonical } from '../src/core/seealso.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
// ★ 兼祠的人在谱上有好几条（继华：p361・p362・p363），
//   卡片上一律折回完整那一条。这一层比对也得先折，
//   否则把「同一个人的另一条」当成了丢人。
const cid = pid => canonical(D.people, R.idx.get(pid) ?? { pid }).pid;

/** 一张卡的子女栏里，链接到的全部 pid */
const kidsOnCard = pid => {
  const e = R.build.person(pid);
  const out = new Set();
  for (const r of e?.relations ?? []) {
    if (!/子女/.test(r.heading)) continue;
    for (const it of r.items) if (it.kind === 'person' && it.id) out.add(it.id);
  }
  return out;
};

const cardKids = new Map();
for (const p of D.people) cardKids.set(p.pid, kidsOnCard(p.pid));

const missA = [], missB = [];
for (const c of D.people) {
  const ps = R.parents(c);
  const fathers = [...ps.birth, ...ps.heir].map(x => x.edge.parent);
  // ① 父边有，父亲卡上却没这个孩子
  for (const f of fathers) {
    if (!cardKids.has(f)) continue;                 // 父亲不是有条目的人，另算
    if (![...cardKids.get(f)].some(x => cid(x) === cid(c.pid)))
      missA.push({ c, f, why: R.idx.get(f)?.name });
  }
  // ② 父亲卡上列了他，他的父边里却没这个人
  for (const k of cardKids.get(c.pid) ?? []) {
    const kp = R.parents(R.idx.get(k) ?? {});
    const fs = [...(kp?.birth ?? []), ...(kp?.heir ?? [])].map(x => x.edge.parent);
    if (!fs.some(x => cid(x) === cid(c.pid))) missB.push({ c, k, kn: R.idx.get(k)?.name });
  }
}

const N = D.people.length;
console.log(`按唯一 id 双向对了 ${N} 个有条目的人\n`);
console.log(`① 判了父亲、父亲卡上却没他：${missA.length} 例`);
for (const m of missA.slice(0, 10))
  console.log(`     ${m.c.gen}世 ${m.c.name} → 父 ${m.why}　${m.c.src_human}`);
if (missA.length > 10) console.log(`     …还有 ${missA.length - 10} 例`);
console.log(`\n② 子女栏列了他、他的父边里却没这位：${missB.length} 例`);
for (const m of missB.slice(0, 10))
  console.log(`     ${m.c.gen}世 ${m.c.name} 的子女栏有 ${m.kn}，但 ${m.kn} 不认他　${m.c.src_human}`);
if (missB.length > 10) console.log(`     …还有 ${missB.length - 10} 例`);

if (!missA.length && !missB.length) console.log('\n  ✔ 两个方向都对得上，没有人在任何一张卡上消失');
else process.exitCode = 1;
