import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const rawIdx = new Map(raw.map(p => [p.pid, p]));

console.log('══ 没写父名、但页眉/别处指了父亲的人 ══');
const noName = people.filter(p => !p.father_name);
const withSrc = noName.filter(p => p.father_src);
console.log(`  没写父名的：${noName.length} 人，其中 ${withSrc.length} 人 father_src 有值`);
const kinds = {};
for (const p of withSrc) kinds[p.father_src] = (kinds[p.father_src] ?? 0) + 1;
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`    ${String(v).padStart(4)}  ${k}`);
}

console.log('\n══ 朝京 ══');
for (const p of people.filter(x => x.name === '朝京')) {
  console.log(`  ${p.name} 第${p.gen}世 ${p.src_human}`);
  console.log(`   父名「${p.father_name ?? ''}」 出处「${p.father_src ?? ''}」 ${p.filiation ?? ''}`);
  console.log(`   原有父边 ${rawIdx.get(p.pid).parent_edges.length}：`
    + rawIdx.get(p.pid).parent_edges.map(e =>
        `${e.parent_name}/${e.evidence}/rank${e.rank}`).join('　'));
  console.log('   原文：' + (p.raw_text ?? '').split('\n').filter(Boolean).slice(0, 4).join(' ｜ '));
}

console.log('\n══ 梁玉（两条 rank1） ══');
for (const p of people.filter(x => x.name === '梁玉')) {
  console.log(`  ${p.name} 第${p.gen}世 ${p.src_human}　父名「${p.father_name ?? ''}」`);
  for (const e of p.parent_edges) {
    const f = idx.get(e.parent);
    console.log(`    ${e.kind} ${e.parent_name} 第${f?.gen}世 ${f?.src_human}`
      + `　${e.evidence}/rank${e.rank}　生子名单：${(f?.sons_claimed ?? []).join('、')}`);
  }
}
