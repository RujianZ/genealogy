/**
 * 本人自己写了父名，那么**同一种关系里，名字对不上的候选就该排掉**。
 *
 *   壁贵（册3·卷五·第44页）自己写「光灼长子」。
 *   可候选里有个「光满」——那条边来自另一个人的过继语句
 *   「立胞弟光满长子壁贵为嗣」，说的是**另一个**壁贵。
 *   光满不叫光灼，谱也没说壁贵还有第二个生父。
 *
 * 比对要带上候选的字、号（谱上写父名，写的可能是字）。
 * 只管同一种关系：嗣父那条本来就会是另一个名字，不受这条影响。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

let amb = 0, solved = 0, none = 0;
const ex = [];
for (const p of people) {
  if (!p.father_name) continue;
  const by = new Map();
  for (const c of candidates(idx, p, chart, win)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  for (const [kind, cs] of by) {
    if (cs.length < 2) continue;
    amb++;
    const want = norm(p.father_name);
    const fits = cs.filter(c => {
      const f = c.person;
      if (!f) return false;
      return norm(f.name) === want || (f.aliases ?? []).some(a => norm(a.form) === want);
    });
    if (fits.length === 1) {
      solved++;
      if (ex.length < 14) {
        ex.push(`${p.name}（第${p.gen}世 ${p.src_human}）写「${p.father_name}」`
          + `　${cs.length} 个 → ${fits[0].person.name}`
          + `　排掉：${cs.filter(c => c !== fits[0]).map(c => c.person?.name || '（无名）').join('、')}`);
      }
    } else if (fits.length === 0) none++;
    break;
  }
}
console.log(`本人写了父名、却还说不清的：${amb} 处`);
console.log(`  候选里**恰好一个**名字对得上：${solved} 处　← 能定案`);
console.log(`  一个都对不上（谱写的那个名字全谱查无此人）：${none} 处`);
console.log(`  好几个都对得上（真同名，仍分不出）：${amb - solved - none} 处\n`);
for (const e of ex) console.log('  ' + e);
