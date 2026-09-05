/**
 * 「有冲突」那 95 人：把冲突的**成因**说清楚，别只报一个「不一致」。
 *
 * 欧式五世一图里，儿子印在父亲正下一格。但**过继的人印在嗣父格下**——
 * 生父在别的房、别的页。这时「欧式不一致」不是矛盾，是谱的双记（凡例十三）。
 * 先把这类分出来，剩下的才是真要人看的。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const T = JSON.parse(readFileSync(new URL('../work/台账.json', import.meta.url), 'utf8'));

// 正上一格是谁：同册同页、行少一、同列
const aboveOf = p => D.people.filter(q => q.src.vol === p.src.vol && q.src.page === p.src.page
  && q.src.row === p.src.row - 1 && q.src.col === p.src.col);

const bucket = new Map();
const put = (k, r) => (bucket.get(k) ?? bucket.set(k, []).get(k)).push(r);

for (const r of T.有冲突) {
  const p = R.idx.get(r.pid); if (!p) { put('查无此人', r); continue; }
  const ps = R.parents(p);
  const ab = aboveOf(p);
  const birth = new Set(ps.birth.map(x => x.edge.parent));
  const heir = new Set(ps.heir.map(x => x.edge.parent));
  const row = { ...r, above: ab.map(x => x.name).join('、') || '（空）' };

  if (p.src.row === 1) put('行1：父亲在上一页，本页没有正上一格', row);
  else if (!ab.length) put('正上一格是空的（谱这一格没印人）', row);
  else if (ab.some(x => heir.has(x.pid))) put('正上一格是嗣父——过继的人印在嗣父格下，生父在别处（谱的双记）', row);
  else if (ab.some(x => birth.has(x.pid))) put('正上一格就是生父（其实一致，台账判错了）', row);
  else if (heir.size) put('有嗣父，但正上一格既不是生父也不是嗣父', row);
  else put('★ 正上一格是另一个人，而谱写的父亲在别处', row);
}
console.log(`「有冲突」共 ${T.有冲突.length} 人，按成因：\n`);
for (const [k, v] of [...bucket].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`■ ${v.length} 人　${k}`);
  for (const r of v.slice(0, 6))
    console.log(`     ${r.gen}世 ${r.name}　生父${r.生父}${r.嗣父 ? '／嗣父' + r.嗣父 : ''}　正上一格「${r.above}」　${r.src}`);
  if (v.length > 6) console.log(`     …还有 ${v.length - 6} 人`);
  console.log('');
}
