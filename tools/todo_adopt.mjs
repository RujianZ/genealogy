/**
 * \u5f85\u6838\u6e05\u5355\u00b7\u516b\uff1a\u8fc7\u7ee7\u8bed\u53e5\u91cc**\u6ca1\u843d\u5230 pid** \u7684\u90a3\u4e9b\u3002
 *
 * \u4e24\u79cd\uff1a
 *   A \u5224\u5b9a\u5c42\u628a\u8fd9\u53e5\u8bdd**\u5426\u6389\u4e86**\uff08\u6838\u51fa\u5b83\u8bf4\u7684\u662f\u540c\u540d\u7684\u53e6\u4e00\u4f4d\uff09\u2014\u2014
 *     \u5426\u9519\u4e86\u5c31\u7b49\u4e8e\u4e22\u6389\u4e00\u6761\u771f\u5173\u7cfb\uff0c**\u8fd9\u662f\u6700\u8be5\u770b\u7684**\u3002
 *   B \u8c31\u53ea\u5199\u4e86\u300c\u51fa\u55e3\uff0f\u517c\u7960\u300d\u3001\u6ca1\u5199\u7ed9\u8c01\u3002
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const page = p => `python tools/page.py ${p.src.vol} ${p.src.page}`;
const A = [], B = [];
for (const p of D.people) for (const a of p.adoptions ?? []) {
  if (a.去处) continue;
  const w = R.idx.get(a.写在谁那一条);
  (/同名的另一位/.test(a.怎么定的) ? A : B).push({ p, a, w });
}
const L = [];
L.push('', '## 八、过继语句里没落到 pid 的（' + (A.length + B.length) + ' 条）', '',
  '每一条都写明了为什么落不了。**没有一条留着名字给下游去猜。**', '',
  '重跑：`node --experimental-strip-types tools/todo_adopt.mjs`', '');

L.push(`### 8.1 判定层**否掉**了这句话（${A.length} 条）`, '',
  '谱上这句话按名字扭到了本人头上，而判定层核出它说的是**同名的另一位**，於是没采信。',
  '**否错了就等于丢掉一条真关系——这是最该复核的一组。**',
  '每条给出：谁被说到、这句话写在谁那一条、我们判他的父亲是谁。', '');
for (const x of A) {
  const ps = R.parents(x.p);
  const dad = [...ps.birth, ...ps.heir].map(c => `${c.edge.kind}${c.person?.name}`).join('／') || '无父边';
  L.push(`- **${x.p.gen}世 ${x.p.name}**（${x.p.src_human}）　我们判：${dad}`,
    `  - 被否掉的话：「${x.a.原话}」　写在 **${x.a.写话人}** 那一条${x.w ? `（${x.w.src_human}）` : ''}`,
    `  - 核：\`${page(x.p)}\`${x.w ? `　和　\`${page(x.w)}\`` : ''}`);
}
L.push('', `### 8.2 谱只写了「出嗣／兼祧」，没写给谁（${B.length} 条）`, '',
  '这是谱本身没写，不是我们判不出。', '');
for (const x of B) {
  L.push(`- **${x.p.gen}世 ${x.p.name}**（${x.p.src_human}）`,
    `  - 原话：「${x.a.原话}」　写在 **${x.a.写话人}** 那一条`,
    `  - 核：\`${page(x.p)}\``);
}
console.log(L.join('\n'));
