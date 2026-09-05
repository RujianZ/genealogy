import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { buildFacts } from '../src/core/facts.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const people = withBacklinks(J('people'));
const F = buildFacts(people, J('generations'));
console.log('facts 条数:', F.size);
let disagree = 0, conf = 0, noChar = 0;
for (const f of F.values()) {
  if (!f.gen.agree) disagree++;
  if (f.conflicts.length) conf++;
  if (f.gen.by_char == null) noChar++;
}
console.log(`世次两来源不一致: ${disagree} 人 ／ 辈字认不出: ${noChar} 人 ／ 记下矛盾: ${conf} 人`);
console.log('\n世次不一致的（谱把人印错了格）：');
for (const f of F.values()) if (!f.gen.agree)
  console.log(`   ${f.name}　按行 ${f.gen.by_row} 世／按辈字「${f.gen_char}」${f.gen.by_char} 世　${f.self.father_name}${f.self.filiation}　${f.pid}`);
console.log('\n名单辈字错的：');
let n = 0;
for (const f of F.values()) for (const c of f.conflicts) { if (n++ < 8) console.log(`   ${f.name}(${f.pid})　${c}`); }
console.log(`   共 ${n} 条`);
const t = F.get('P-册2-0230-5-0-0');
console.log('\n铣德(默齐拔萃) 的证据：');
console.log('  自己写的父名:', t.self.father_name, t.self.filiation, '排行数', t.self.ord);
console.log('  世次: 行', t.gen.by_row, '／辈字', t.gen.by_char, '一致', t.gen.agree);
console.log('  别人提到他:', t.mentions.map(m => `${m.by_name}的${m.kind}第${m.pos}/${m.of}位写作「${m.as}」`).join('　') || '（无）');
console.log('  正上一格:', t.layout.above.map(x => people.find(y => y.pid === x)?.name).join('、'));
