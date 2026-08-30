import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
const J=n=>JSON.parse(readFileSync(`data/${n}.json`,'utf8'));
const people=withBacklinks(J('people')), idx=buildIndex(people);
const chart=new EraChart(J('erachart')), win=buildWindows(people,chart);
for (const nm of ['泽久','泽广','泽贵']) {
  for (const p of people.filter(x=>x.name===nm && x.parent_edges.length>1)) {
    console.log(`\n${p.name}（第${p.gen}世 ${p.src_human}）「${p.filiation||'没写排行'}」　${windowNote(win.get(p.pid))}`);
    for (const c of candidates(idx,p,chart,win)) {
      const tag = c.status==='ok' ? '✔ 留着' : `✘ 排掉[${c.status}]`;
      console.log(`   ${tag}  ${c.person?.name}　${c.person?.src_human}`);
      if (c.note) console.log(`          ${c.note}`);
    }
  }
}
