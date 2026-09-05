/**
 * 原文有、卡片上找不到的行——按形状归堆，看清楚再改。
 *
 * ★ 「这一行卡片上算不算有」的规则**只有一处**：`src/core/oncard.ts`。
 *   以前这里一套、`audit100.mjs` 一套，同一份数据两个答案（40 条 vs 76 条）。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
import { cardText, coveredByCard, lineShape, flat } from '../src/core/oncard.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);

const WHO = new Set();
const kind = new Map();
let n = 0;
for (const p of D.people) {
  const e = R.build.person(p.pid); if (!e) continue;
  // 配偶那一段除外——谱把妻子的生卒写在丈夫条目里，卡片把她做成链接，
  // 日期在她自己那张卡上，不是丢。
  // 「别处也算数」的：配偶那一段在她自己卡上；名单里的孩子（女儿、无条目的子）
  //   的生卒葬也在他们自己那一页上——都不是丢。
  const elsewhere = [
    ...R.dossier(p).cat['配'].map(i => i.text),
    ...(p.kin ?? []).flatMap(k => [k.birth?.text, k.death?.text, k.burial?.text, k.age?.text, k.married]),
    ...(p.spouses ?? []).flatMap(s => [s.birth?.text, s.death?.text, s.burial?.text, s.age?.text, s.remarried]),
  ].filter(Boolean).map(flat).join(' ');
  const onCard = cardText(e);
  for (const ln of String(p.raw_text ?? '').split('\n')) {
    if (coveredByCard(ln, onCard, elsewhere)) continue;
    n++; WHO.add(p.pid);
    const k = lineShape(ln);
    const e2 = kind.get(k) ?? { n: 0, ex: [] };
    e2.n++;
    if (e2.ex.length < 60)
      e2.ex.push(`${p.name}@${p.src.vol}p${p.src.page}　「${flat(ln).slice(0, 30)}」`);
    kind.set(k, e2);
  }
}
console.log(`全谱：原文有、卡片上找不到的行 ${n} 条，涉及 ${WHO.size} 人\n`);
for (const [k, v] of [...kind].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`■ ${k}　${v.n} 条`);
  for (const x of v.ex.slice(0, Number(process.argv[2] ?? 4))) console.log('   ', x);
}
