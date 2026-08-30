/**
 * 「生子」和「生女」是并排两栏，谱上一行里可能同时出现。
 * 解析器没拆开，於是这一行整条掉进「未归属原文」——
 * 儿子没进 sons_claimed，女儿没进 daughters_claimed，两个都丢。
 *
 * 开赛那一条：
 *   生子一
 *   儒健      生女一      儒桢
 *   生于二00三年四月五日巳时
 * 结果 sons_claimed=[] daughters_claimed=[]，承健和他妹妹儒桢都不在名单里。
 *
 * 先数：全谱有多少条未归属原文长这样。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');

const NUM = '[一二三四五六七八九十两]';
const RE_BOTH = new RegExp(`生女${NUM}`);          // 行里出现「生女N」
let both = 0, lostSon = 0, lostDau = 0;
const ex = [];
for (const p of people) {
  for (const u of p.unparsed ?? []) {
    const t = NS(u.text);
    if (!RE_BOTH.test(t)) continue;
    both++;
    if (!(p.sons_claimed ?? []).length) lostSon++;
    if (!(p.daughters_claimed ?? []).length) lostDau++;
    if (ex.length < 14) {
      ex.push(`${p.name}（第${p.gen}世 ${p.src_human}）`
        + `　生子名单${(p.sons_claimed ?? []).length} 女名单${(p.daughters_claimed ?? []).length}`
        + `　这一行：「${t.slice(0, 30)}」`);
    }
  }
}
console.log(`未归属原文里含「生女N」的行：${both} 条`);
console.log(`  这些人里生子名单是空的：${lostSon}`);
console.log(`  女儿名单是空的：${lostDau}`);
console.log('\n例子：');
for (const e of ex) console.log('  ' + e);

// 另一头：谱上写了「生子N」但 sons_claimed 数量对不上的
let mismatch = 0;
const NUMS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
const bad = [];
for (const p of people) {
  const m = /生子([一二三四五六七八九十两])/.exec(NS(p.raw_text));
  if (!m) continue;
  const said = NUMS[m[1]];
  const got = (p.sons_claimed ?? []).length;
  if (said !== got) {
    mismatch++;
    if (bad.length < 10) bad.push(`${p.name}（第${p.gen}世 ${p.src_human}）`
      + `　谱写「生子${m[1]}」＝${said}，名单里 ${got} 个`);
  }
}
console.log(`\n谱上写了「生子N」但名单条数对不上的：${mismatch} 人`);
for (const b of bad) console.log('  ' + b);
