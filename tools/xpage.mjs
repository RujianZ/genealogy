/** 44 个「正上一格是别人」：是不是父亲的条目跨了页？ */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const T = JSON.parse(readFileSync(new URL('../work/台账.json', import.meta.url), 'utf8'));
const key = p => `${p.src.vol}|${p.src.row}`;
// 每一「册·行」上，按 页→列→行内序 排好的人
const lane = new Map();
for (const p of D.people) (lane.get(key(p)) ?? lane.set(key(p), []).get(key(p))).push(p);
for (const arr of lane.values())
  arr.sort((a, b) => a.src.page - b.src.page || a.src.col - b.src.col || a.pid.localeCompare(b.pid));

/** 行上一格那条带上，紧挨在本人**之前**的那些人（含上一页续下来的那位） */
const runAbove = p => {
  const up = lane.get(`${p.src.vol}|${p.src.row - 1}`) ?? [];
  const samePage = up.filter(q => q.src.page === p.src.page);
  const prev = up.filter(q => q.src.page < p.src.page).slice(-1);   // 上一页最后一位：他的条目续到本页
  return [...prev, ...samePage];
};

let fixed = 0, still = 0; const rest = [];
for (const r of T.有冲突) {
  const p = R.idx.get(r.pid); if (!p || p.src.row <= 1) continue;
  const ps = R.parents(p);
  const dads = new Set([...ps.birth, ...ps.heir].map(x => x.edge.parent));
  const up = runAbove(p);
  const hitSame = up.some(q => q.src.page === p.src.page && dads.has(q.pid));
  const hitPrev = up.some(q => q.src.page < p.src.page && dads.has(q.pid));
  if (hitSame) continue;                       // 本页就对上，台账那条「不一致」是错报
  if (hitPrev) { fixed++; continue; }          // 父亲条目跨页
  still++; rest.push({ r, up: up.map(x => `${x.name}@p${x.src.page}`).join(' ') });
}
console.log(`「有冲突」里行>1 的人中：`);
console.log(`  父亲条目跨页，算上一页末位就对上　${fixed} 人`);
console.log(`  仍然对不上　${still} 人：\n`);
for (const x of rest) console.log(`   ${x.r.gen}世 ${x.r.name}　谱写父${x.r.生父}${x.r.嗣父 ? '／嗣' + x.r.嗣父 : ''}\n       行上一格那条带：${x.up}\n       ${x.r.src}`);
