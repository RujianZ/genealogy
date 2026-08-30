/**
 * 多出来的子女边是怎么进来的：查那三个人自己的条目怎么写的父亲。
 *   node --experimental-strip-types tools/extra_kids.mjs P-...
 */
import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { buildIndex } from '../src/core/lineage.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const rawPeople = J('people');
const people = withBacklinks(rawPeople);
const idx = buildIndex(people);
const rawIdx = new Map(rawPeople.map(p => [p.pid, p]));

for (const pid of process.argv.slice(2)) {
  const p = idx.get(pid), r = rawIdx.get(pid);
  if (!p) { console.log(`找不到 ${pid}`); continue; }
  console.log(`\n┌─ ${p.name}　第 ${p.gen} 世　${p.src_human}`);
  console.log(`│  谱上写的父名：${p.father_name ?? '（没写）'}　${p.filiation ?? '（没写排行）'}`
    + `　出处：${p.father_src ?? '（没有）'}`);
  console.log(`│  people.json 里原有的父边：${r.parent_edges.length} 条`);
  for (const e of r.parent_edges) {
    const f = idx.get(e.parent);
    console.log(`│    ${e.kind} ${e.parent_name}（${f?.src_human}）`
      + `　${e.evidence}／rank ${e.rank}　${e.matched_as ?? ''}`);
  }
  const added = p.parent_edges.filter(e => !r.parent_edges.some(x => x.parent === e.parent));
  console.log(`│  反查（backlink）补上的：${added.length} 条`);
  for (const e of added) {
    const f = idx.get(e.parent);
    console.log(`│    ${e.kind} ${e.parent_name}（${f?.src_human}）　${e.evidence}／rank ${e.rank}`);
  }
  console.log('│  ── 原文 ──');
  for (const l of (p.raw_text ?? '').split('\n')) if (l.trim()) console.log('│  ' + l);
  console.log('└─');
}
