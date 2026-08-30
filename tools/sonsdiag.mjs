/**
 * 「生子N」和名单对不上的 265 条，到底是怎么对不上的。
 * 先分类再定方案——不看清楚就改，是拿一种猜换另一种猜。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const NUMS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };

const rows = [];
for (const p of people) {
  const m = /生子([一二三四五六七八九十两])/.exec(NS(p.raw_text));
  if (!m) continue;
  const said = NUMS[m[1]], got = (p.sons_claimed ?? []).length;
  if (said !== got) rows.push({ p, said, got });
}
console.log(`对不上的：${rows.length} 人（多列 ${rows.filter(r => r.got > r.said).length}`
  + `　少列 ${rows.filter(r => r.got < r.said).length}）\n`);

// ── 多列的：多出来的那几个是什么 ─────────────────────────
const OVER = rows.filter(r => r.got > r.said);
const overKind = new Map();
for (const r of OVER) {
  // 名单里排在「说好的 N 个」之后的那些
  const extra = (r.p.sons_claimed ?? []).slice(r.said);
  for (const e of extra) {
    const t = NS(e);
    const k = /适|嫁/.test(t) ? '女儿（「适X」）'
      : /殁|卒|夭|幼殁/.test(t) ? '夭殇／殁的记述'
      : /公|妣|氏/.test(t) ? '称谓串（公／妣／某氏）'
      : /生|葬|年|月|日/.test(t) ? '生卒葬的字'
      : t.length > 3 ? '长串（不像名字）'
      : '看着像个名字';
    overKind.set(k, (overKind.get(k) ?? 0) + 1);
  }
}
console.log('══ 多列的，多出来的是什么 ══');
for (const [k, v] of [...overKind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
console.log('  例子：');
for (const r of OVER.slice(0, 6)) {
  console.log(`    ${r.p.name}（${r.p.src_human}）说 ${r.said} 实 ${r.got}`
    + `　名单：${r.p.sons_claimed.join('、')}`);
}

// ── 少列的：缺的那几个在哪 ────────────────────────────────
const UNDER = rows.filter(r => r.got < r.said);
let inUnparsed = 0, nowhere = 0;
console.log(`\n══ 少列的 ${UNDER.length} 人，缺的在哪 ══`);
for (const r of UNDER) {
  const u = (r.p.unparsed ?? []).map(x => NS(x.text)).join('｜');
  if (u.length) inUnparsed++; else nowhere++;
}
console.log(`  本人未归属原文里还有字：${inUnparsed}　完全没有：${nowhere}`);
console.log('  例子：');
for (const r of UNDER.slice(0, 8)) {
  console.log(`    ${r.p.name}（${r.p.src_human}）说 ${r.said} 实 ${r.got}`
    + `　名单：${r.p.sons_claimed.join('、') || '（空）'}`);
  for (const u of (r.p.unparsed ?? []).slice(0, 3)) {
    console.log(`        未归属：${NS(u.text).slice(0, 40)}`);
  }
}
