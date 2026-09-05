import fs from 'node:fs';
import { buildFacts } from '../src/core/facts.ts';
import { buildDossiers, CATS } from '../src/core/dossier.ts';

const J = n => JSON.parse(fs.readFileSync(`data/${n}.json`, 'utf8'));
const raw = J('people'); const people = Array.isArray(raw) ? raw : raw.people;
const g = J('generations'); const gens = Array.isArray(g) ? g : (g.gens ?? g.generations ?? []);
const F = buildFacts(people, gens);
const D = buildDossiers(people, F);

let tot = 0, un = 0, nt = 0; const worst = [];
const cnt = Object.fromEntries(CATS.map(k => [k, 0]));
const has = Object.fromEntries(CATS.map(k => [k, 0]));
for (const d of D.values()) {
  tot += d.audit.total; un += d.audit.unaccounted; nt += d.audit.noted;
  for (const k of CATS) { cnt[k] += d.cat[k].length; if (d.cat[k].length) has[k]++; }
  if (d.audit.noted > 0) worst.push(d);
}
worst.sort((a, b) => b.audit.noted - a.audit.noted);
console.log(`销账：全谱正文 ${tot} 字`);
console.log(`  蒸发（必须为 0）      ${un} 字`);
console.log(`  只能进「备注」        ${nt} 字 → 认得出的占 ${((1 - nt / tot) * 100).toFixed(2)}%`);
console.log(`  有备注的人：${worst.length} / ${D.size}`);
console.log('\n各类条目数（人数）：');
for (const k of CATS) console.log(`  ${k.padEnd(4, '　')} ${String(cnt[k]).padStart(6)} 条　${String(has[k]).padStart(5)} 人`);
console.log('\n未归类最多的 12 人（这些字全在「备注」里，没丢）：');
for (const d of worst.slice(0, 12))
  console.log(`  ${d.audit.unaccounted}字  ${d.gen}世 ${d.name} ${d.pid}\n      备注: ${d.cat['备注'].map(i => i.text).join(' ▏')}`);
