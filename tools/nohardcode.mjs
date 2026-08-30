/**
 * 证明规则里**没有一处是针对某个人写死的**。
 *
 * 修谱不能靠一个个手工改。规则必须是函数，对 2,258 个人一视同仁地跑。
 * 这份检查把注释全部剥掉（注释里举例子是可以的），
 * 然后在**能执行的代码**里找：
 *   · 人物 id（P-册…）
 *   · 谱上任何一个人的名字，出现在字符串里
 * 找到一个就算不通过。
 */
import { readFileSync, readdirSync } from 'node:fs';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
// 谱名 + 字号，两个字以上的才算（单字太容易和普通词撞）
const NAMES = new Set();
for (const p of people) {
  for (const a of p.aliases ?? []) {
    const f = (a.form ?? '').replace(/[\s　]/g, '');
    if (f.length >= 2) NAMES.add(f);
  }
}

/** 剥掉块注释、行注释，只留能执行的代码 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
/** 取出所有字符串字面量的内容 */
function literals(src) {
  const out = [];
  for (const re of [/'((?:[^'\\]|\\.)*)'/g, /"((?:[^"\\]|\\.)*)"/g, /`((?:[^`\\]|\\.)*)`/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

let bad = 0, files = 0, checked = 0, exempt = 0;
for (const dir of ['src/core', 'prototype']) {
  for (const f of readdirSync(dir)) {
    if (!/\.(ts|js)$/.test(f)) continue;
    files++;
    const src = code(readFileSync(`${dir}/${f}`, 'utf8'));

    // 唯一放行：起始页停在谁身上（const START = '…'）。那是设置，不是判据。
    for (const line of src.split('\n')) {
      for (const m of line.matchAll(/P-册\d[\w-]*/g)) {
        if (/\bSTART\b/.test(line)) { exempt++; continue; }
        console.log(`  ✘ ${dir}/${f}　代码里写死了人物 id：${m[0]}`);
        bad++;
      }
    }
    for (const s of literals(src)) {
      checked++;
      const t = s.replace(/[\s　]/g, '');
      // 整个字符串就是某个人的名字 → 针对这个人写死了
      if (t.length >= 2 && NAMES.has(t)) {
        console.log(`  ✘ ${dir}/${f}　代码里写死了人名：「${s}」`);
        bad++;
      }
    }
  }
}
console.log(`扫了 ${files} 个文件、${checked} 个字符串，`
  + `比对 ${NAMES.size} 个谱上的名字（谱名／字／讳／号）`);
console.log(`放行 ${exempt} 处（起始页设置）`);
console.log(bad ? `**${bad} 处针对具体某个人写死了**` : '✔ 判据里没有一处针对具体某个人——全是函数');
process.exit(bad ? 1 : 0);
