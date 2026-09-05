/**
 * 批量人工复核：把「定式」级判定的关键证据压成一行一条。
 * 每条显示：谱写的父名 · 判出的人 · 名字对不对得上 · 是不是正上一格 ·
 *           那位的生子名单里有没有他 · 名单上的兄弟都印在哪。
 * 一眼能定的就定，定不了的再开 case.mjs 细看。
 */
import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { buildIndex } from '../src/core/lineage.ts';
import { buildFacts } from '../src/core/facts.ts';
import { resolveAll } from '../src/core/resolve.ts';
import { applyManual } from '../src/core/manual.ts';
import { buildWindows } from '../src/core/activity.ts';
import { EraChart } from '../src/core/years.ts';
import { norm } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const F = buildFacts(people, J('generations'));
const ALL = new Map([...resolveAll(F, idx, buildWindows(people, new EraChart(J('erachart'))))]
  .map(([k, v]) => [k, applyManual(J('人工判定'), k, v)]));
const bare = s => norm(s ?? '').replace(/公$/, '');
const want = process.argv[2] ?? '定式';

for (const [pid, r] of ALL) {
  if (r.level !== want || r.birth.length !== 1) continue;
  const p = idx.get(pid), f = F.get(pid), d = idx.get(r.birth[0].pid);
  const w = bare(p.father_name);
  const sameName = w && bare(d.name) === w;
  const above = f.layout.above.includes(d.pid);
  const inList = (d.sons_claimed ?? []).some(s => bare(s) === bare(p.name)
    || p.aliases.some(a => bare(a.form) === bare(s)));
  console.log(`\n▸ ${p.gen}世 ${p.name}  ${p.src.vol}p${p.src.page}行${p.src.row} ${p.src.section}`
    + `  「${p.father_name || '—'}${p.filiation || ''}」  ${pid}`);
  console.log(`   判 ${d.name}@${d.src.vol}p${d.src.page} ${d.src.section}`
    + `   名字${sameName ? '相同' : (w ? '不同' : '（谱没写父名）')}`
    + ` · ${above ? '正上一格' : '不在正上一格'}`
    + ` · 名单里${inList ? '有他' : '没有他'}`);
  const sons = d.sons_claimed ?? [];
  if (sons.length) {
    console.log('   ' + d.name + '名单：' + sons.map(s => {
      const hit = people.filter(x => x.gen === d.gen + 1 && bare(x.name) === bare(s));
      return s + '→' + (hit.length ? hit.map(h => 'p' + h.src.page).join('/') : '无');
    }).join('  '));
  }
  // 同名的还有谁
  if (w) {
    const same = people.filter(x => x.gen === p.gen - 1 && bare(x.name) === w);
    if (same.length) console.log('   叫「' + p.father_name + '」的：'
      + same.map(x => x.src.vol + 'p' + x.src.page + '(' + x.src.section + ')').join('  '));
  }
}
