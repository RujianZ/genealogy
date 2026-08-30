/**
 * 五世一图的接缝：第 1 行的人，父亲在上一张图的第 5 行。
 * 谱在接缝处有没有自己写「接某页」「系某公」之类的指向？
 * 有的话，那是谱自己说的，能拿来定案；没有就只能摆着。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const coord = pid => {
  const m = /^P-(册\d+)-(\d+)-(\d+)-/.exec(pid);
  return m ? { vol: m[1], page: +m[2], row: +m[3] } : null;
};

const row1 = people.filter(p => coord(p.pid)?.row === 1);
console.log(`第 1 行的人：${row1.length}`);

// 这些人的记录里有没有指向别处的字样
const MARK = /接|系|详|见|前|载|转|承|自/;
const hits = new Map();
for (const p of row1) {
  const txt = (p.raw_text ?? '') + (p.unparsed ?? []).map(u => u.text).join('');
  for (const m of txt.match(/[接系详见载转][^\s，。]{0,8}/g) ?? []) {
    hits.set(m, (hits.get(m) ?? 0) + 1);
  }
}
console.log('\n第 1 行的人记录里出现的「指向」字样（前 25 种）：');
for (const [k, v] of [...hits].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

// 谱的字段里有没有页眉
const sample = row1.find(p => p.name === '泽翔');
if (sample) {
  console.log('\n泽翔（接缝上最典型的一个，往下带 107 人）的完整字段：');
  for (const [k, v] of Object.entries(sample)) {
    if (k === 'raw_text' || k === 'unparsed' || k === 'parent_edges') continue;
    const s = JSON.stringify(v);
    if (s && s !== 'null' && s !== '[]' && s !== '{}') console.log(`  ${k}: ${s.slice(0, 160)}`);
  }
  console.log('  raw_text:');
  for (const l of (sample.raw_text ?? '').split('\n')) if (l.trim()) console.log('    ' + l);
  console.log('  unparsed:');
  for (const u of sample.unparsed ?? []) console.log('    ' + u.text);
}

// 那两条 stated_adopt 的开发
console.log('\n══ 两个「开发」（stated_adopt、parent_name 是空的） ══');
for (const p of people.filter(x => x.name === '开发' && /48页|89页|第48|第89/.test(x.src_human))) {
  console.log(`  ${p.src_human}　父名「${p.father_name ?? ''}」`);
  for (const e of p.parent_edges) {
    const f = idx.get(e.parent);
    console.log(`    ${e.kind} 「${e.parent_name}」→ ${f?.name || '（这个人没有名字）'}`
      + ` 第${f?.gen}世 ${f?.src_human}　${e.evidence}`);
  }
}
