/** 打印某人名片上「子女」那一栏，看改后长什么样。 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const R = makeRegistry({
  people: J('people'), refs: J('referenced'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'),
});
for (const pid of process.argv.slice(2)) {
  const e = R.build.person(pid);
  console.log(`\n── ${e.title}　${e.sources?.[0]?.src_human ?? ''}`);
  const p = R.idx.get(pid);
  console.log(`   谱上写：生子${(p.sons_claimed ?? []).length}　${(p.sons_claimed ?? []).join('、') || '（没写生子名单）'}`);
  for (const r of e.relations) {
    if (!/子女|这一家/.test(r.heading)) continue;
    console.log(`   【${r.heading}】${r.items.length}`);
    for (const l of r.items) {
      console.log(`     ${l.plain ? '·' : '→'} ${l.label}　${l.note ?? ''}`);
    }
  }
}
