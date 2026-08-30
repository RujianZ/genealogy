/**
 * 「详前」条：**同一个人，谱记了第二遍。**
 *
 *   壁鍙（32页）光茹公嗣子  字运鸿  生于咸丰十年…  生子六…
 *   壁鍙（38页）光庆公嗣子  字运鸿  「生庚娶氏俱详前」
 *
 * 一个人两个嗣父，谱按凡例双记（「不忘所自出」）。
 * 第二条只写一句「详前」，指回前面那条完整的。
 * 继盟更是一子三祧，三条。
 *
 * 这不是错，是谱的写法。但数据里就成了两个人，
 * 於是「同一个父亲名下两个同名儿子」这种矛盾就冒出来了。
 */
import { readFileSync } from 'node:fs';
import { norm } from '../src/core/norm.ts';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const SEEALSO = /详前|詳前|详上|詳上|俱详|俱詳|同前|见前|見前/;

const stub = people.filter(p => SEEALSO.test(NS(p.raw_text ?? '')));
console.log(`写着「详前」的条目：${stub.length} 条\n`);

// 它们指回哪一条：同名、同世、有完整记录的
const byKey = new Map();
for (const p of people) {
  const k = `${norm(p.name)}|${p.gen}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(p);
}
let paired = 0, lone = 0;
const kinds = new Map();
for (const p of stub) {
  const sibs = (byKey.get(`${norm(p.name)}|${p.gen}`) ?? []).filter(q => q.pid !== p.pid);
  const full = sibs.filter(q => !SEEALSO.test(NS(q.raw_text ?? '')) && (q.birth || q.sons_claimed?.length));
  if (full.length) paired++; else lone++;
  const k = p.filiation || '（没写排行）';
  kinds.set(k, (kinds.get(k) ?? 0) + 1);
}
console.log(`  能找到同名同世的完整那一条：${paired} 条`);
console.log(`  找不到（那条可能也没写全）：${lone} 条`);
console.log(`\n  这些条目的排行：` + [...kinds].sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join('　'));

console.log('\n前 10 条：');
for (const p of stub.slice(0, 10)) {
  const sibs = (byKey.get(`${norm(p.name)}|${p.gen}`) ?? []).filter(q => q.pid !== p.pid);
  console.log(`  ${p.name}（第${p.gen}世 ${p.src_human.split('·').slice(1).join('·')}）`
    + `　父名「${p.father_name ?? ''}」${p.filiation ?? ''}`);
  console.log(`     原文：${NS(p.raw_text).slice(0, 40)}`);
  console.log(`     同名同世另有 ${sibs.length} 条：`
    + sibs.map(q => q.src_human.split('·').slice(-2).join('·')
      + (q.birth ? '（有生年）' : '')).join('、'));
}
