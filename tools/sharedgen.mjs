/**
 * 谱的排版惯例：生子名单里**共用的辈字只写一次**。
 *
 *     生子三
 *     继发      ← 头一个写全
 *     和        ← 单字，其实是「继和」
 *     才        ← 单字，其实是「继才」
 *   （见 source/合一（1.2.3.4）.doc，壁生·光採公幼子那一条）
 *
 * 结果：继和、继才 两个人的父亲一直判不出来——父亲的名单里明明有他们，
 * 只是写成了单字，比对时对不上。
 *
 * 先数：全谱有多少份名单是这么写的。
 */
import { readFileSync } from 'node:fs';
import { norm } from '../src/core/norm.ts';

const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => norm(s ?? '');
const byName = new Map();
for (const p of people) {
  const k = `${NS(p.name)}|${p.gen}`;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}

let lists = 0, singles = 0, resolved = 0;
const ex = [];
for (const p of people) {
  const sons = (p.sons_claimed ?? []).map(s => NS(s)).filter(Boolean);
  if (sons.length < 2) continue;
  const head = sons[0];
  if (head.length < 2) continue;
  const gen = head[0];                       // 辈字
  const tail = sons.slice(1);
  const one = tail.filter(s => s.length === 1);
  if (!one.length) continue;
  lists++; singles += one.length;
  // 补上辈字之后，能不能在下一世找到这个人
  const hits = one.map(s => byName.get(`${NS(gen + s)}|${p.gen + 1}`)?.length ?? 0);
  const ok = hits.filter(n => n > 0).length;
  resolved += ok;
  if (ex.length < 12) {
    ex.push(`${p.name}（第${p.gen}世 ${p.src_human}）　名单：${(p.sons_claimed ?? []).join('、')}`
      + `\n        单字 ${one.join('、')} → 补上「${gen}」：`
      + one.map((s, i) => `${gen}${s}(${hits[i] ? hits[i] + ' 人对得上' : '查无此人'})`).join('、'));
  }
}
console.log(`生子名单里出现单字的：${lists} 份，共 ${singles} 个单字`);
console.log(`补上辈字后能在下一世找到对应的人：${resolved} 个（${(resolved / singles * 100).toFixed(1)}%）\n`);
for (const e of ex) console.log('  ' + e);
