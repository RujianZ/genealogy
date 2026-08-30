/**
 * 「两边互相点名，却没有这条边」——backlink 只补**一条边都没有**的人，
 * 身上已经挂着一条（哪怕是错的）就不再补了。量一下漏了多少。
 *
 *   光云（册3·卷五·第54页第3行）写「梁福之子」
 *   梁福（同页第2行）生子名单：光云、光贵
 *   两边互相点名、同页正上一行——最硬的一种，可这条边不存在，
 *   因为光云身上已经有一条指向梁佐的嗣父边，backlink 就跳过了他。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { isFragment } from '../src/core/fragment.ts';
import { roster } from '../src/core/roster.ts';
import { fname } from '../src/core/fname.ts';

const people = withBacklinks(JSON.parse(readFileSync('data/people.json', 'utf8')));
const idx = buildIndex(people);
const bare = (s) => fname(s).replace(/公$/, '');
const forms = (p) => [bare(p.name), ...p.aliases.map(a => bare(a.form))];
const all = people.filter(p => !isFragment(p));

const miss = [];
for (const p of all) {
  if (p.gen == null || !bare(p.father_name)) continue;
  const w = bare(p.father_name);
  // 已经有边指向这个名字就不算漏
  if (p.parent_edges.some(e => {
    const f = idx.get(e.parent);
    return f && forms(f).includes(w);
  })) continue;
  // 同册同房、上一世、叫这个名字、而且生子名单里点了本人 —— 两边互相点名
  const cand = all.filter(f => f.gen === p.gen - 1
    && f.src.vol === p.src.vol && f.src.section === p.src.section
    && forms(f).includes(w)
    && roster(f).sons.some(s => forms(p).includes(bare(s.name || s.raw))));
  if (cand.length !== 1) continue;
  const f = cand[0];
  miss.push({ p, f, row: f.src.row === p.src.row - 1, page: f.src.page === p.src.page });
}
console.log('═'.repeat(70));
console.log(`两边互相点名、却没有这条边：${miss.length} 人`);
console.log(`  其中父亲就印在本人正上一行：${miss.filter(x => x.row).length} 人`);
console.log(`  而且同一页：${miss.filter(x => x.row && x.page).length} 人`);
console.log('═'.repeat(70));
for (const { p, f, row, page } of miss.slice(0, 40))
  console.log(`   ${p.name.padEnd(4)}第${String(p.gen).padStart(2)}世 ${p.src.page}页${p.src.row}行`
    + `　写「${p.father_name}${p.filiation ?? ''}」　→　${f.name}（${f.src.page}页${f.src.row}行`
    + `${row ? '，正上一行' : ''}${page ? '，同页' : ''}）`
    + `　现有边：${p.parent_edges.map(e => (e.parent_name || '?') + '(' + e.kind + ')').join('、') || '无'}`);
if (miss.length > 40) console.log(`   …还有 ${miss.length - 40} 人`);
