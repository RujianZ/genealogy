/**
 * 事迹的触发标准对不对。
 *
 * 你举的例子：
 *   「公妣俱厝云山中棚庄屋东边附曾祖母及祖墓右同向立胞弟光治四子壁铨为嗣
 *     黄妣殁于民国三年甲寅七月初一日辰时」
 * 这不是事迹，这是**这条记录自己的字段**（葬＋立嗣＋妣殁）连排在一起，
 * 只不过解析器没能把它们切开，剩下的就被当成「事迹」收了进去。
 *
 * 所以要分清两种：
 *   结构字段串   葬X向Y／殁于某年／立某为嗣／生子N／娶某氏 —— 谱的固定格式
 *   真事迹       传赞、迁徙、义行、节烈 —— 有叙述、有评价、有人称
 */
import { readFileSync } from 'node:fs';
const prose = JSON.parse(readFileSync('data/prose_ents.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');

/** 结构字段的写法 */
const FIELD = [
  /[葬厝][^，。]{0,20}?向/, /^[葬厝附合俱]/, /殁于|殁於|卒于|卒於|生于|生於/,
  /立[^，。]{0,12}为嗣/, /生子[一二三四五六七八九十两]/, /女[一二三四五六七八九十两]/,
  /[娶配妣聘][^，。]{0,6}氏/, /年[一二三四五六七八九十]+$/, /出嗣|承嗣|入嗣|祧/,
  /有碑|合墓|同向|附父墓|附母墓/,
];
/** 真叙述的痕迹：人称、评语、连词、动词 */
const NARR = [
  /公[性行素少幼晚为其以事居尝甞尤好善]/, /[吾余予]/, /者也|矣|焉|乎|哉/,
  /孝|义|节|烈|贞|捐躯|殉|旌|奖|赞|传|痛|哀|悲|念|忆/,
  /因|故|遂|乃|遇|值|尝|甞|每|虽|然|而|则/,
  /读书|考试|不遇|从军|参军|入伍|毕业|大学|工作|经商|贸易/,
];

const score = t => ({
  field: FIELD.filter(r => r.test(t)).length,
  narr: NARR.filter(r => r.test(t)).length,
});

let structural = 0, narrative = 0, mixed = 0, short = 0;
const ex = { structural: [], mixed: [] };
const byKind = new Map();
for (const x of prose) {
  const t = NS(x.text);
  if (t.length < 6) { short++; continue; }
  const s = score(t);
  const k = s.narr === 0 && s.field >= 1 ? 'structural'
    : s.narr > 0 && s.field >= 2 ? 'mixed'
    : s.narr > 0 ? 'narrative' : 'structural';
  if (k === 'structural') structural++; else if (k === 'mixed') mixed++; else narrative++;
  for (const kk of x.kinds ?? []) {
    if (!byKind.has(kk)) byKind.set(kk, { s: 0, m: 0, n: 0 });
    byKind.get(kk)[k === 'structural' ? 's' : k === 'mixed' ? 'm' : 'n']++;
  }
  if (k !== 'narrative' && ex[k].length < 5) {
    ex[k].push(`${x.host_name}（第${x.gen}世）[${(x.kinds ?? []).join('・')}] ${t.slice(0, 60)}`);
  }
}
const tot = structural + narrative + mixed + short;
console.log(`事迹一共 ${tot} 段\n`);
console.log(`  只有结构字段、没有一点叙述：${structural} 段（${(structural / tot * 100).toFixed(1)}%）　← **不该算事迹**`);
console.log(`  又有叙述又粘着字段：      ${mixed} 段（${(mixed / tot * 100).toFixed(1)}%）　← 该切开`);
console.log(`  是叙述：                  ${narrative} 段（${(narrative / tot * 100).toFixed(1)}%）`);
console.log(`  太短（不到 6 字）：        ${short} 段`);

console.log('\n按「事迹类别」看，哪一类掺得最多：');
const rows = [...byKind].map(([k, v]) => ({ k, ...v, tot: v.s + v.m + v.n }))
  .sort((a, b) => (b.s / b.tot) - (a.s / a.tot));
for (const r of rows) {
  console.log(`  ${r.k.padEnd(10)} 共 ${String(r.tot).padStart(4)}　`
    + `纯字段 ${String(r.s).padStart(4)}（${(r.s / r.tot * 100).toFixed(0).padStart(3)}%）　`
    + `混 ${String(r.m).padStart(3)}　叙述 ${String(r.n).padStart(4)}`);
}
console.log('\n「纯字段」的例子——这些都不该出现在事迹里：');
for (const e of ex.structural) console.log('  · ' + e);
console.log('\n「混」的例子——该把字段切掉，只留叙述：');
for (const e of ex.mixed) console.log('  · ' + e);
