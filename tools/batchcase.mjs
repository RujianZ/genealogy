/**
 * 一次摊开几个待判的人：本人原文 + 每个候选父亲的名单 + 判定给的答案与理由。
 *   node --experimental-strip-types tools/batchcase.mjs 名字1 名字2 …
 *   node --experimental-strip-types tools/batchcase.mjs --pid P-… P-…
 * 摊的是谱面事实，结论留给人。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm, loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const bare = s => norm(s ?? '').replace(/公$/, '');
const one = s => String(s ?? '').replace(/\n/g, '／').replace(/\s+/g, '');

const args = process.argv.slice(2);
const byPid = args[0] === '--pid';
const keys = byPid ? args.slice(1) : args;
for (const k of keys) {
  const list = byPid ? [R.idx.get(k)].filter(Boolean)
    : D.people.filter(p => p.name === k || p.pid === k);
  for (const p of list) {
    const ps = R.parents(p);
    console.log(`\n${'═'.repeat(74)}\n${p.gen}世 ${p.name}　${p.src_human}　${p.pid}`);
    console.log(`原文：${one(p.raw_text)}`);
    console.log(`判定：生父 ${ps.birth.map(x => x.person?.name).join('、') || '（无）'}`
      + `　嗣父 ${ps.heir.map(x => x.person?.name).join('、') || '（无）'}`);
    for (const c of [...ps.birth, ...ps.heir]) console.log(`   依据：${c.note}`);
    // 谱写的父名，上一世叫这名字的都有谁
    const w = bare(p.father_name);
    if (w) {
      const cands = D.people.filter(q => q.gen === p.gen - 1
        && (bare(q.name) === w || q.aliases.some(a => bare(a.form) === w)));
      console.log(`谱写父名「${p.father_name}」，第 ${p.gen - 1} 世叫这名字的 ${cands.length} 位：`);
      for (const q of cands)
        console.log(`   ${q.pid}　${q.src_human}\n       生子名单 ${JSON.stringify(q.sons_claimed)}　`
          + `${(q.sons_claimed ?? []).some(s => norm(s) === norm(p.name)) ? '★ 名单里有本人' : ''}`);
    }
    // 谁的名单里点了他
    const claimers = D.people.filter(q => q.gen === p.gen - 1
      && (q.sons_claimed ?? []).some(s => norm(s) === norm(p.name)
        || p.aliases.some(a => norm(a.form) === norm(s))));
    if (claimers.length) {
      console.log(`名单里点了他的 ${claimers.length} 位：`);
      for (const q of claimers) console.log(`   ${q.name}　${q.src_human}　${JSON.stringify(q.sons_claimed)}`);
    }
  }
}
