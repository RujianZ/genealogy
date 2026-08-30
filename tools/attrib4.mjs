/**
 * 第四遍：验两个猜测。猜测要么被数字证实，要么作废。
 *
 * 猜测 A ——「同名在别的房」那 412 处不是错，是**房的记法**。
 *   证据线索：朝相（梦庚房）点名启昌，而启昌的条目在梦林房。
 *   这正是 CLAUDE.md 里那个人：生父朝相公（梦庚支），嗣父朝阳公（梦林支）。
 *   **条目归在嗣父的房下**——谱自己的规矩，不是我们记错。
 *   另一条：朝接（梦桂房）→ 启义（楚桂房）、学立（楚桂房）→ 士雄（梦桂房）。
 *   梦X 和 楚X 成对出现，像是同一支的两个卷名。
 *   验法：把「同房」这一条放开，只要同册、下一世、儿子写的父名对得上，就算数。
 *
 * 猜测 B ——「承华之」是「承华之子」被切断了。
 *   验法：数全谱有多少 father_name 以「之」收尾。
 */
import { readFileSync } from 'node:fs';
import { roster } from '../src/core/roster.ts';
import { norm } from '../src/core/norm.ts';
import { isFragment } from '../src/core/fragment.ts';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = (s) => norm(s ?? '').replace(/[\s　]/g, '');
const bare = (s) => NS(s).replace(/公$/, '');
const real = people.filter(p => !isFragment(p));

// ── A：放开「同房」，只留「同册 + 下一世 + 名字对 + 儿子写的父名对」
const loose = new Map();
for (const p of real) {
  if (p.gen == null) continue;
  const k = `${p.src.vol}|${p.gen}|${bare(p.name)}`;
  (loose.get(k) ?? loose.set(k, []).get(k)).push(p);
}
const tight = new Map();
for (const p of real) {
  if (p.gen == null) continue;
  const k = `${p.src.vol}|${p.src.section}|${p.gen}|${bare(p.name)}`;
  (tight.get(k) ?? tight.set(k, []).get(k)).push(p);
}

let claims = 0, tightOk = 0, looseOk = 0, rowOk = 0;
const pairs = new Map();     // 房↔房 的配对次数
for (const f of real) {
  if (f.gen == null) continue;
  for (const s of roster(f).sons) {
    const nm = bare(s.name || s.raw);
    if (!nm || s.died) continue;
    claims++;
    const hitT = (tight.get(`${f.src.vol}|${f.src.section}|${f.gen + 1}|${nm}`) ?? [])
      .filter(c => bare(c.father_name) === bare(f.name));
    if (hitT.length) { tightOk++; continue; }
    const hitL = (loose.get(`${f.src.vol}|${f.gen + 1}|${nm}`) ?? [])
      .filter(c => bare(c.father_name) === bare(f.name));
    if (!hitL.length) continue;
    looseOk++;
    if (hitL.some(c => c.src.row === f.src.row + 1)) rowOk++;
    const k = `${f.src.section} → ${hitL[0].src.section}`;
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  }
}

const pc = (a, b) => b ? (a * 100 / b).toFixed(2) + '%' : '—';
console.log('═'.repeat(66));
console.log('【猜测 A：「别的房」不是错，是谱的记法】');
console.log(`  父亲点名的儿子                     ${claims} 处`);
console.log(`  同房内双向对上                     ${tightOk} 处  ${pc(tightOk, claims)}`);
console.log(`  放开房、同册内双向对上             +${looseOk} 处  ${pc(looseOk, claims)}`);
console.log(`     其中儿子仍在父亲的下一行        ${rowOk} 处  ${pc(rowOk, looseOk)}`);
console.log(`  ──────────────────────────────────────`);
console.log(`  合计双向印证                       ${tightOk + looseOk} 处  ${pc(tightOk + looseOk, claims)}`);
console.log('');
console.log('  房↔房 配对，按次数排（前 20）：');
for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log(`     ${String(n).padStart(3)} 次   ${k}`);

// ── B：「X之」
const zhi = real.filter(p => /之$/.test(NS(p.father_name)));
console.log('\n' + '═'.repeat(66));
console.log(`【猜测 B：「承华之」= 「承华之子」被切断】`);
console.log(`  father_name 以「之」收尾的         ${zhi.length} 人`);
for (const p of zhi.slice(0, 12)) {
  const l = (p.raw_text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
  console.log(`     ${p.name}（${p.src_human}）父名「${p.father_name}」`);
  console.log(`        原文：${l.slice(0, 4).join(' ｜ ')}`);
}
if (zhi.length > 12) console.log(`     …还有 ${zhi.length - 12} 人`);
console.log('═'.repeat(66));
