/**
 * **同一个人被整条重印**——兼祧双记的另一种写法。
 *
 * `seealso.ts` 只认谱自己写了「详前」的那些。可谱不总这么写：
 *   开发　册4 p48 行1　字开发　生于宣统三年二月初五日　妣徐氏生于民国二年三月二十五日　生子四 承文 承武 承千 承万
 *   开发　册4 p50 行1　字开发　生于宣统三年二月初五日　娶徐氏生于民国二年三月二十五日　生子四 承文 承祥 承千 承万
 *   ——**一个字都不差**（次子一处写谱名、一处写字），p50 那条还写着「兼祧继良」。
 *
 * 判据全是谱自己的字，不掺推测：**同名同世 ＋ 字/讳/号相同 ＋ 生于原文逐字相同**。
 * 生年精确到日，同名同字同生日的两个人在一个家族里不存在。
 */
import { readFileSync } from 'node:fs';
import { norm } from '../src/core/norm.ts';
import { isSeeAlso } from '../src/core/seealso.ts';
const P = JSON.parse(readFileSync(new URL('../data/people.json', import.meta.url), 'utf8'));
const flat = s => norm(String(s ?? '')).replace(/[\s　]+/g, '');
const zi = p => [p.zi?.text, p.hui?.text, p.hao?.text, p.ming?.text].filter(Boolean).map(flat).join('|');

const by = new Map();
for (const p of P) { const k = `${flat(p.name)}|${p.gen}`; (by.get(k) ?? by.set(k, []).get(k)).push(p); }
const pairs = [];
for (const [k, arr] of by) {
  if (arr.length < 2) continue;
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j];
    const za = zi(a), zb = zi(b);
    const ba = flat(a.birth?.text), bb = flat(b.birth?.text);
    if (!za || za !== zb) continue;          // 字号必须都有且相同
    if (!ba || ba !== bb) continue;          // 生于原文必须都有且逐字相同
    pairs.push({ a, b, 详前: isSeeAlso(a) || isSeeAlso(b) });
  }
}
console.log(`同名同世 ＋ 字号相同 ＋ 生于逐字相同的记录对：${pairs.length} 对`);
const noSee = pairs.filter(x => !x.详前);
console.log(`  其中谱写了「详前」、已经在折的：${pairs.length - noSee.length} 对`);
console.log(`  **整条重印、现在没折的：${noSee.length} 对**\n`);
for (const x of noSee)
  console.log(`   ${x.a.gen}世 ${x.a.name}　${x.a.src_human}\n            ${x.b.src_human}`
    + `\n       字「${zi(x.a)}」　生「${x.a.birth.text.slice(0, 24)}」`
    + `\n       生子 ${JSON.stringify(x.a.sons_claimed)} ／ ${JSON.stringify(x.b.sons_claimed)}`);
