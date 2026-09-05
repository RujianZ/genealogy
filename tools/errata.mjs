/**
 * **谱面勘误清单**——谱自己印错的地方，我们照录不改，只注明。
 *
 * 凡例说「不缘情而增，不故意而减」。谱面上的字一个不动，
 * 但哪一处对不上、我们凭什么判成另一个，得写下来给后人看。
 *
 * 来源：data/人工判定.json 与 data/同一个人.json 里的「依据」。
 * 这两张表本身就是记录，这里只是汇成一份能通读的清单。
 */
import { readFileSync, writeFileSync } from 'node:fs';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const P = J('people'), M = J('人工判定'), S = J('同一个人');
const idx = new Map(P.map(p => [p.pid, p]));
const who = pid => { const p = idx.get(pid); return p ? `${p.gen}世 ${p.name}　${p.src_human}` : pid; };

const lines = ['# 谱面勘误清单', '',
  '谱自己印错的地方。**原文一个字不改**，这里只注明我们凭什么判成另一个。',
  '每条都能一步回到原书：照「怎么核的」那一栏跑一遍就看得见。', '',
  '> 凡例：不缘情而增，不故意而减；纪其所可知，阙其所未知。', ''];

lines.push('## 一、父子关系的人工核定（' + Object.keys(M).filter(k => !k.startsWith('_')).length + ' 条）', '');
for (const [pid, r] of Object.entries(M)) {
  if (pid.startsWith('_')) continue;
  lines.push(`### ${r.名 ?? who(pid)}`, '',
    `- **谁**：${who(pid)}`,
    `- **谱上写的父名**：${r.父名 ? `「${r.父名}」` : '（谱没写）'}`,
    `- **核定的生父**：${r.生父 === null ? '谱确实没写' : (r.生父 ? who(r.生父) : '—')}`,
    ...(r.嗣父 && r.嗣父.length ? [`- **核定的嗣父**：${r.嗣父.map(who).join('；')}`] : []),
    `- **依据**：${r.依据}`,
    `- **怎么核的**：\`${r.核对}\``, '');
}
lines.push('## 二、同一个人被谱记了几遍（' + S.条目.length + ' 条）', '');
for (const r of S.条目) {
  lines.push(`### ${r.名}`, '',
    `- **这一条**：${who(r.详前条)}`,
    `- **就是这一条**：${who(r.完整条)}`,
    `- **依据**：${r.依据}`,
    `- **怎么核的**：\`${r.核对}\``, '');
}
writeFileSync(new URL('../work/谱面勘误.md', import.meta.url), lines.join('\n'), 'utf8');
console.log(`写出 work/谱面勘误.md —— 父子核定 ${Object.keys(M).filter(k => !k.startsWith('_')).length} 条 · 同人 ${S.条目.length} 条`);
