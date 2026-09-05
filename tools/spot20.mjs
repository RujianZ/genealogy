/**
 * 随机抽 N 个人，三方对照：**卡片 ⟷ json ⟷ 谱的原文**。
 *
 * 抽样是真随机（seed 从命令行给，可复现）。
 * 每个人打三段：json 里记了什么、卡片上印了什么、谱那一页原文是什么。
 * 人看着三段对，不靠工具替人下结论。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);

const seed = Number(process.argv[2] ?? 1) >>> 0;
const N = Number(process.argv[3] ?? 20);
let a = seed;
const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// 全表抽（有条目的人 ＋ 妻女等附记之人，一视同仁）
const pool = [...R.idx.values()];
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }

const V = v => v?.text ?? '—';
for (const q of pool.slice(0, N)) {
  const e = R.build.person(q.pid);
  console.log('\n' + '═'.repeat(78));
  console.log(`${q.gen}世 ${q.name}　${q.pid}`);
  console.log(`出处 ${q.src_human}${q.attached ? `　（附记之人：${q.attached.role}，记在 ${q.attached.of_name} 那一条里）` : ''}`);

  console.log('\n── json 里记的 ──');
  console.log(`  字/讳/号/名 ${[q.zi, q.hui, q.hao, q.ming].map(V).join(' / ')}`);
  console.log(`  生 ${V(q.birth)}\n  殁 ${V(q.death)}\n  葬 ${V(q.burial)}\n  寿 ${V(q.age)}`);
  console.log(`  谱写父名「${q.father_name || '—'}」${q.filiation || ''}　出处 ${q.father_src || '—'}`);
  console.log(`  parent_edges ${(q.parent_edges ?? []).map(x => `${x.kind}:${x.parent_name}[${x.level}]`).join('　') || '—'}`);
  console.log(`  children ${(q.children ?? []).map(x => `${x.kind}:${x.child_name}`).join('　') || '—'}`);
  console.log(`  spouses ${(q.spouses ?? []).map(s => `${s.rel}${s.name_raw}(生${V(s.birth)}/殁${V(s.death)}/葬${V(s.burial)}/寿${V(s.age)})`).join('　') || '—'}`);
  console.log(`  kin ${(q.kin ?? []).map(k => `${k.role}:${k.name_raw}${k.died_young ? '[幼殁]' : ''}${k.married ? '[' + k.married + ']' : ''}${k.birth ? '(生' + k.birth.text + ')' : ''}`).join('　') || '—'}`);
  console.log(`  adoptions ${(q.adoptions ?? []).map(x => x['原话']).join('　') || '—'}`);
  console.log(`  marks ${(q.marks ?? []).map(m => `${m.tag}:${m.text}`).join('　') || '—'}`);
  console.log(`  titles ${(q.titles ?? []).join('　') || '—'}`);
  console.log(`  unparsed ${(q.unparsed ?? []).map(u => u.text.trim()).filter(Boolean).join(' ▏') || '—'}`);

  console.log('\n── 卡片上印的 ──');
  for (const f of e?.facts ?? []) {
    console.log(`  ${f.label}　${f.value ?? ''}${f.raw ? '　〔' + f.raw + '〕' : ''}`);
    if (f.note) console.log(`      注：${f.note}`);
    for (const l of f.links ?? []) console.log(`      → ${l.label}${l.note ? '（' + l.note + '）' : ''}`);
  }
  for (const r of e?.relations ?? [])
    console.log(`  【${r.heading}】${r.items.map(i => i.label + (i.note ? '（' + i.note + '）' : '')).join('、')}`);
  for (const s of e?.sections ?? [])
    console.log(`  〖${s.heading}〗${String(s.text).replace(/\n/g, ' ▏')}`);

  console.log('\n── 谱上原文 ──');
  for (const ln of String(q.raw_text ?? '').split('\n')) if (ln.trim()) console.log('  │' + ln);
}
