/**
 * referenced.json 已经在给女儿、无条目的儿子发 id 了（888 + 837）。
 * 缺口有多大：谱上写了「女N」「生子N」，refs 里却没发够。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const refs = JSON.parse(readFileSync('data/referenced.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const NUMS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
const sum = (t, re) => [...t.matchAll(re)].reduce((a, m) => a + (NUMS[m[1]] ?? 0), 0);

const byHost = new Map();
for (const r of refs) {
  if (!byHost.has(r.host)) byHost.set(r.host, []);
  byHost.get(r.host).push(r);
}
const idx = new Map(people.map(p => [p.pid, p]));
// 有独立条目、且父边指向本人的儿子，也算「已经有 id」
const kidsWithEntry = new Map();
for (const p of people) for (const e of p.parent_edges) {
  if (!kidsWithEntry.has(e.parent)) kidsWithEntry.set(e.parent, new Set());
  kidsWithEntry.get(e.parent).add(NS(p.name));
}

let dGap = 0, dMiss = 0, sGap = 0, sMiss = 0;
const exD = [], exS = [];
for (const p of people) {
  const t = NS(p.raw_text);
  const mine = byHost.get(p.pid) ?? [];
  const dSaid = sum(t, /(?:生?女)([一二三四五六七八九十两])/g);
  const dGot = mine.filter(r => r.role === '女').length;
  if (dSaid > dGot) { dGap++; dMiss += dSaid - dGot;
    if (exD.length < 8) exD.push(`${p.name}（${p.src_human}）谱写女 ${dSaid}，发了 ${dGot} 个 id`); }

  const sSaid = sum(t, /生子([一二三四五六七八九十两])/g);
  const sGot = mine.filter(r => r.role.startsWith('子')).length
    + (kidsWithEntry.get(p.pid)?.size ?? 0);
  if (sSaid > sGot) { sGap++; sMiss += sSaid - sGot;
    if (exS.length < 8) exS.push(`${p.name}（${p.src_human}）谱写子 ${sSaid}，有 id 的 ${sGot}`); }
}
console.log(`══ 女儿 ══\n  谱上写了、id 没发够的人：${dGap}　一共少发 ${dMiss} 个 id`);
for (const e of exD) console.log('    ' + e);
console.log(`\n══ 儿子 ══\n  谱上写了、id 没发够的人：${sGap}　一共少发 ${sMiss} 个 id`);
for (const e of exS) console.log('    ' + e);

// 承健他爸
const ks = byHost.get([...idx.values()].find(x => x.name === '开赛' && x.gen === 26)?.pid) ?? [];
console.log(`\n开赛名下现有的 ref：${ks.map(r => r.role + ':' + r.name_raw).join('　') || '（只有配偶）'}`);
