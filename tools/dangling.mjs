/**
 * 「殁于」挂在行尾、日期掉进「其余原文」的，全谱有多少。
 *
 * 谱上这一条的写法是固定的：生于X　殁于Y　葬Z　娶W　生于V。
 * 排版时「殁于」后面多了个空行，解析器就把 Y 丢进了未归属原文，
 * 名片上「殁」这一栏於是空着——而谱上明明写着。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');

const MARK = ['殁于', '殁於', '卒于', '卒於'];
const rows = [];
for (const p of people) {
  for (const [f, label] of [['birth', '生'], ['death', '殁'], ['burial', '葬'], ['age', '寿']]) {
    const t = NS(p[f]?.text);
    if (!t) continue;
    // ★ 字段可能由**好几行合并**而成（text 用「｜」连），
    //   「殁于」挂在其中一行的末尾，不一定在整段末尾。
    //   第一版只查整段末尾，把继均这种漏掉了——他的「生」栏里
    //   还接着他妻子的生年，末尾根本不是「殁于」。
    const parts = t.split('｜').map(x => x.trim());
    const m = MARK.find(x => parts.some(s => s.endsWith(x)));
    if (!m) continue;
    const merged = parts.length > 1;
    // 「殁于」挂在末尾，说明日期没跟上来。看未归属原文里有没有紧接着的日期
    const u = (p.unparsed ?? []).map(x => NS(x.text)).filter(Boolean);
    const dated = u.filter(x => /^[一二三四五六七八九十百零〇0-9]{2,}[年]/.test(x)
      || /^(民国|光绪|宣统|同治|咸丰|道光|嘉庆|乾隆|雍正|康熙)/.test(x));
    rows.push({ p, field: label, mark: m, merged, tail: t.slice(-16), cands: dated });
  }
}
console.log(`══ 字段末尾挂着「殁于」的：${rows.length} 处 ══`);
const withNext = rows.filter(r => r.cands.length);
console.log(`  未归属原文里能找到接得上的日期：${withNext.length} 处`);
console.log(`  找不到（谱上确实没写殁年）：${rows.length - withNext.length} 处\n`);

const byField = {};
for (const r of rows) byField[r.field] = (byField[r.field] ?? 0) + 1;
console.log('  出现在哪个栏：' + Object.entries(byField).map(([k, v]) => `${k} ${v}`).join('　'));
const merged = rows.filter(r => r.merged);
console.log(`  其中「生」栏被并进了不止一行的（多半把妻子的生年也并进来了）：${merged.length} 处`);
// 这些人里，谱上写了「娶X」却没有 spouses 的
const lostWife = rows.filter(r => !((r.p.spouses ?? []).length)
  && (r.p.unparsed ?? []).some(u => /娶|配|继娶|复娶/.test(NS(u.text))));
console.log(`  谱上写了「娶…」但配偶栏是空的：${lostWife.length} 人`);

console.log('\n══ 前 10 例 ══');
for (const r of withNext.slice(0, 10)) {
  console.log(`\n  ${r.p.name}（第${r.p.gen}世）${r.p.src_human}`);
  console.log(`    ${r.field}栏末尾：…${r.tail}`);
  for (const c of r.cands.slice(0, 2)) console.log(`    未归属原文：${c.slice(0, 46)}`);
}

// 还有一类：整条根本没有 death 字段，但未归属原文里有「殁于」
const noDeath = people.filter(p => !p.death
  && (p.unparsed ?? []).some(u => MARK.some(m => NS(u.text).includes(m))));
console.log(`\n══ 没有「殁」栏、但未归属原文里出现「殁于」的：${noDeath.length} 人 ══`);
for (const p of noDeath.slice(0, 5)) {
  console.log(`  ${p.name}（第${p.gen}世）${p.src_human}`);
  for (const u of p.unparsed ?? []) {
    if (MARK.some(m => NS(u.text).includes(m))) console.log(`    ${NS(u.text).slice(0, 50)}`);
  }
}
