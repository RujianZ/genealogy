/**
 * **到底有多少人是「一定没错」的。**
 *
 * 分层报，每一层写清楚**凭什么**。不合并、不四舍五入。
 * 「没错」只就**父子关系**说；卡片上别的字段另有闸（dossier_test 的蒸发为 0）。
 *
 * ★ 分档跟 `src/core/doubts.ts` 是同一个函数算的——台账、疑点页、这里
 *   三处报出来的数必须一模一样，而且加起来正好是全谱人数。
 *   早先这里自己又数了一遍第一层，跟台账差 21 人（「人工核定」那一档）。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
import { doubtList } from '../src/core/doubts.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'), classes: J('分类') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const { tally } = doubtList(R, D.revisions);

const attached = [...R.idx.values()].filter(q => q.attached);
const wives = attached.filter(q => q.attached.role === '妻');
const kids = attached.filter(q => q.attached.role !== '妻');
const own = D.people.length;

const n = x => String(x).padStart(5);
console.log(`全表 ${R.idx.size} 个唯一 id ＝ 有独立条目 ${own} ＋ 附记之人 ${attached.length}\n`);
console.log(`══ 有独立条目的 ${own} 人，按「凭什么说没错」分层 ══\n`);
console.log(`  ① 谱的原话判定，版面／房支交叉验证无冲突   ${n(tally.原话无冲突)}`);
console.log(`  ② 原话判定，判定层留了说明，人工逐条核过   ${n(tally.已核无误)}`);
console.log(`  ③ 我逐案翻回谱面核定并写下依据             ${n(tally.人工核定)}`);
console.log(`  ${'─'.repeat(44)}`);
const sure = tally.原话无冲突 + tally.已核无误 + tally.人工核定;
console.log(`     小计（关系可断定）                     ${n(sure)}  = ${(sure / own * 100).toFixed(1)}%\n`);
console.log(`  ④ 靠谱的定式（正上一格／房支／夹选）定的   ${n(tally.靠定式)}  ← 不是谱的原话`);
console.log(`  ⑤ 原话判了、但版面或房支对不上             ${n(tally.谱自己对不上)}  ← 谱自己前后不一致`);
console.log(`  ⑥ 谱确实没写父亲                           ${n(tally.谱没写)}`);
console.log(`  ⑦ 说不清                                   ${n(tally.说不清)}\n`);
const all = sure + tally.靠定式 + tally.谱自己对不上 + tally.谱没写 + tally.说不清;
console.log(`     ①–⑦ 相加 ${all} ${all === own ? '＝ 全谱人数' : '★ 对不上！'}\n`);
if (all !== own) process.exitCode = 1;
console.log(`══ 附记之人 ${attached.length} 人 ══\n`);
console.log(`  子女 ${kids.length} 人：父亲就是把他们写进名单的那一条，**结构上没有第二种读法**`);
console.log(`  妻   ${wives.length} 人：谱不记娘家，她们没有父边——那是谱的实情，不是我们判不出`);
