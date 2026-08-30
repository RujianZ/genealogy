/** 十届修谱，每一届的页面上都该挂着那一届的序。一届没挂上就是接错了。 */
import { readFileSync } from 'node:fs';
const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const revs = J('revisions'), pf = J('prefaces').list;

let bad = 0;
for (const r of revs) {
  const era = r.era ?? r.id ?? r.name;
  const hit = pf.filter(x => x.round === era);
  const full = hit.filter(x => x.full).length;
  console.log(`  ${hit.length ? '✔' : '✘'} ${String(era).padEnd(8)}` +
    `序 ${hit.length} 篇（全文 ${full}）　` +
    hit.map(x => x.author).join('／'));
  if (!hit.length) bad++;
}
// round 为 null 的是《源流序》——1093 年写的，讲迁梅以前的源流，不属於哪一届
const orphan = pf.filter(x => x.round &&
  !revs.some(r => (r.era ?? r.id ?? r.name) === x.round));
console.log(`\n没挂上任何一届的序：${orphan.length}` +
  (orphan.length ? '　' + orphan.map(x => `${x.title}(round=${x.round})`).join('　') : ''));
process.exit(bad || orphan.length ? 1 : 0);
