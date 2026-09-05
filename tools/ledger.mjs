/**
 * 台账：每个人的父子关系判到哪一级、交叉验证过没有、有没有矛盾。
 * 口径按 CLAUDE.md：谱的原话 ＞ 谱的定式 ＞ 说不清。
 *
 * ★ 这里**不判任何事**，只是把 `src/core/doubts.ts` 的分档打印出来。
 *   早先台账自己搭了一条判定管道，跟 app 里那条分了家；后来改成读 R.res，
 *   但「人工核定」那一档整个漏在外面——2233 人只报到 2212。
 *   现在页面、台账、闸走的是同一个函数，加起来必须正好是全谱人数。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { doubtList } from '../src/core/doubts.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const { buckets, tally } = doubtList(R, D.revisions);

const n = (x) => String(x).padStart(5);
console.log('全谱有独立条目的人', tally.合计, '\n');
console.log(`  ① 谱的原话判定，交叉验证没有冲突   ${n(tally.原话无冲突)}  (${(tally.原话无冲突 / tally.合计 * 100).toFixed(1)}%)`);
console.log(`     其中带判定层说明、人工核过无误的 ${n(tally.已核无误)}`);
console.log(`  ② 我逐案翻回谱面核定并写下依据     ${n(tally.人工核定)}`);
console.log(`  ③ 谱的原话判定，但版面/房支对不上  ${n(tally.谱自己对不上)}  ← 谱自己前后不一致，要人看`);
console.log(`  ④ 第一级判不出，靠版面/房支/夹选定  ${n(tally.靠定式)}  ← 不是谱的原话，要人看`);
console.log(`  ⑤ 谱没写父亲                       ${n(tally.谱没写)}`);
console.log(`  ⑥ 说不清                           ${n(tally.说不清)}`);
const sum = tally.原话无冲突 + tally.已核无误 + tally.人工核定 + tally.谱自己对不上
          + tally.靠定式 + tally.谱没写 + tally.说不清;
console.log(`  ${'─'.repeat(40)}`);
console.log(`     分档相加                        ${n(sum)}  ${sum === tally.合计 ? '＝ 全谱人数' : '★ 对不上！'}`);
if (sum !== tally.合计) process.exitCode = 1;
console.log(`\n  真正需要人工判的 = ③ + ④ + ⑥ = ${tally.谱自己对不上 + tally.靠定式 + tally.说不清}\n`);
console.log(`  另外：谱自己写「缺／未详」的 ${buckets.谱上留空.length} 处（不是问题，是谱的实情）`);
console.log(`        历届修谱名目里认不出的人 ${buckets.名目对不上人.length} 个`);

writeFileSync(new URL('../work/台账.json', import.meta.url),
  JSON.stringify({ 汇总: tally, ...buckets }, null, 2), 'utf8');
console.log('\n明细写入 work/台账.json');
