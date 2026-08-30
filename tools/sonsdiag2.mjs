/**
 * 重数：一个人可能有**好几段**「生子N」——一位妻子一段。
 *
 *   妣熊氏 … 生子一 啟高
 *   复娶柳氏  生子二 启强 启尚      → 一共 3 个儿子
 *
 * 上一版只匹配第一个「生子N」，把这种正常情况全判成了错（假报 265 条）。
 * 现在把全部「生子N」「女N」加起来再比。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const NUMS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
const sum = (t, re) => [...t.matchAll(re)].reduce((a, m) => a + (NUMS[m[1]] ?? 0), 0);
const RE_SON = /生子([一二三四五六七八九十两])/g;
const RE_DAU = /(?:生?女)([一二三四五六七八九十两])/g;

let sonBad = [], dauBad = [], sonOK = 0, dauOK = 0;
for (const p of people) {
  const t = NS(p.raw_text);
  const sSaid = sum(t, RE_SON), sGot = (p.sons_claimed ?? []).length;
  if (sSaid) { if (sSaid === sGot) sonOK++; else sonBad.push({ p, said: sSaid, got: sGot }); }
  const dSaid = sum(t, RE_DAU), dGot = (p.daughters_claimed ?? []).length;
  if (dSaid) { if (dSaid === dGot) dauOK++; else dauBad.push({ p, said: dSaid, got: dGot }); }
}
const show = (title, ok, bad) => {
  const over = bad.filter(r => r.got > r.said), under = bad.filter(r => r.got < r.said);
  console.log(`\n══ ${title} ══`);
  console.log(`  谱上写了数字的：${ok + bad.length} 人`);
  console.log(`  数目正好对上：${ok}（${(ok / (ok + bad.length) * 100).toFixed(1)}%）`);
  console.log(`  名单比谱写的多：${over.length}　少：${under.length}`);
  // 少的那些，缺的字在不在未归属原文里
  const rec = under.filter(r => (r.p.unparsed ?? []).some(u =>
    /生子[一二三四五六七八九十两]|女[一二三四五六七八九十两]/.test(NS(u.text))));
  console.log(`    少的里面，「生子N／女N」整句掉进未归属原文的：${rec.length}`);
  for (const r of [...over.slice(0, 4), ...under.slice(0, 4)]) {
    console.log(`    ${r.p.name}（${r.p.src_human}）谱 ${r.said} 实 ${r.got}`
      + `　${(r.p === undefined ? '' : (title.includes('儿子') ? r.p.sons_claimed : r.p.daughters_claimed) ?? []).join('、') || '（空）'}`);
  }
};
show('儿子', sonOK, sonBad);
show('女儿', dauOK, dauBad);
