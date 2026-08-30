/**
 * places.json 里葬的原文，末尾多带了下一行头一个字的有多少。
 * 「葬云山私山窊向东南有碑桂」——那个「桂」是下一行「桂妣殁于」的头一个字。
 * 只数，不改。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const idx = new Map(people.map(p => [p.pid, p]));

let bleed = 0, total = 0;
const ex = [];
for (const b of places) {
  const p = idx.get(b.owner);
  if (!p) continue;
  total++;
  const lines = (p.raw_text ?? '').split('\n').map(NS).filter(Boolean);
  const t = NS(b.text);
  for (let i = 0; i < lines.length - 1; i++) {
    // 这一行 + 下一行的头一个字 == 葬的原文 → 多带了一个字
    if (lines[i] + lines[i + 1][0] === t) {
      bleed++;
      if (ex.length < 8) ex.push(`${p.name}（${p.src_human}）「${t}」→ 应是「${lines[i]}」，`
        + `多出的「${lines[i + 1][0]}」是下一行「${lines[i + 1].slice(0, 6)}…」的头一个字`);
      break;
    }
  }
}
console.log(`葬的记录 ${total} 条，末尾多带一个字的 ${bleed} 条`);
for (const e of ex) console.log('  ' + e);
