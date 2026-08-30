/**
 * 未归属原文里，有多少行其实是**配偶那一段**的，被挂到了本人名下。
 * 开俊名片上那句「中南财经大学」是他妻子冯金枝的学校。
 */
import { readFileSync } from 'node:fs';
import { lineOwners } from '../src/core/owner.ts';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
let lines = 0, toSpouse = 0;
const hurt = new Set();
const kinds = new Map();
const examples = [];
for (const p of people) {
  if (!p.unparsed?.length) continue;
  for (const o of lineOwners(p)) {
    lines++;
    if (o.spouse == null) continue;
    toSpouse++;
    hurt.add(p.pid);
    // 顺便看看被挂错的都是些什么内容
    const t = o.text.replace(/[\s　]/g, '');
    const k = /大学|学生|中专|高中|师范|学院/.test(t) ? '学历'
      : /殁|卒/.test(t) ? '殁'
      : /葬|墓|山|向/.test(t) ? '葬'
      : /生于|年.*月/.test(t) ? '年月'
      : '其他';
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    if (examples.length < 12) {
      examples.push(`${p.name}（第${p.gen}世 ${p.src_human}）　`
        + `第${o.page}页「${t.slice(0, 22)}」→ ${o.spouseName}`);
    }
  }
}
console.log(`未归属原文一共 ${lines} 行`);
console.log(`其中该归配偶、却挂在本人名下的：**${toSpouse} 行**，涉及 ${hurt.size} 个人`);
console.log('\n挂错的都是什么内容：');
for (const [k, v] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\n例子：');
for (const e of examples) console.log('  ' + e);
