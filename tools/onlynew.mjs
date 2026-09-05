/**
 * **只准走新系统。**
 *
 * 这道闸盯三件事，任何一件出现就报错：
 *
 *   ① **原始 `parent_edges` 只许在上游出现。**
 *      它是喂给判定层的原料（backlink 修边、facts 收集、activity 算年代窗口），
 *      判定层之后的任何地方读它，就是绕过 `resolve.ts` 自己判一遍——
 *      卡片、树、关系计算曾经各判各的，312 人的上溯链里有 320 步走的是
 *      卡片已经排除掉的那条边。
 *
 *   ② **判定相关的参数不许写成可选。**
 *      `res?`、`manual?` 这种签名，忘传不会报错，只会**静默退回旧路**：
 *        · smoke / verify_all / check_tree 建树时都忘了传 res
 *          → 三个闸门一直在验一条 app 根本不走的路径
 *        · app.js 的 fetch 清单漏了「人工判定」
 *          → 13 条人工核定在 app 里根本没生效
 *      忘传必须当场炸。
 *
 *   ③ **`?? {}` / `|| []` 之类的兜底不许出现在判定链上。**
 *      兜底把「调用方错了」变成「悄悄给个空答案」。
 *
 * 用户的原话：「不做任何兜底原系统的代码，直接全部删掉。」
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// 允许读原始 parent_edges 的上游文件（判定层的原料）
const NL = String.fromCharCode(10), LINEC = '//', BSTART = '/' + '*', BEND = '*' + '/';
const UPSTREAM = new Set(['backlink.ts', 'facts.ts', 'activity.ts', 'types.ts']);
const bad = [];
// ★ 逐行剔注释，**行号不能变**。
//   第一版拿一个跨行正则把块注释整块删掉，行号全错位，
//   报出来的全是注释里提到 parent_edges 的句子。
function codeLines(src) {
  const out = []; let inBlock = false;
  for (const raw of src.split(NL)) {
    let line = raw;
    if (inBlock) {
      const e = line.indexOf(BEND);
      if (e < 0) { out.push(''); continue; }
      line = line.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const b = line.indexOf(BSTART);
      if (b < 0) break;
      const e = line.indexOf(BEND, b + 2);
      if (e < 0) { line = line.slice(0, b); inBlock = true; break; }
      line = line.slice(0, b) + line.slice(e + 2);
    }
    const c = line.indexOf(LINEC);
    out.push(c >= 0 ? line.slice(0, c) : line);
  }
  return out;
}

for (const f of readdirSync(new URL('../src/core', import.meta.url))) {
  if (!f.endsWith('.ts')) continue;
  const raw = readFileSync(new URL(`../src/core/${f}`, import.meta.url), 'utf8');
  const LINES = codeLines(raw);
  LINES.forEach((line, i) => {
    if (!UPSTREAM.has(f) && /[.\[]\s*parent_edges/.test(line))
      bad.push(`src/core/${f}:${i + 1}  判定层之后还在读原始 parent_edges　${line.trim().slice(0, 60)}`);
    // 判定相关的可选参数
    if (/\b(res|parents|manual)\?\s*:/.test(line))
      bad.push(`src/core/${f}:${i + 1}  判定参数写成了可选，忘传就会静默退回旧路　${line.trim().slice(0, 60)}`);
    // 判定链上的兜底
    if (/\b(res|manual|parents)\s*\?\?|\bd0b\.manual\s*\?\?|RES0\.get\([^)]*\)\s*\?\?/.test(line))
      bad.push(`src/core/${f}:${i + 1}  判定链上有兜底　${line.trim().slice(0, 60)}`);
  });
}

// app 必须把判定要用的数据全带上
const app = readFileSync(new URL('../prototype/app.js', import.meta.url), 'utf8');
for (const need of ['人工判定', '同一个人', 'people'])
  if (!app.includes(`'${need}'`)) bad.push(`prototype/app.js  数据清单里少了「${need}」`);

// ★ 字表只有一张：data/字表.json。TS 和 Python 都读它，读的是同一个键。
//   早先是两份：src/core/variants.ts 给 TS、data/variants.json 给 Python。
//   两份一漂就是两个答案——馀→余 Python 折、TS 不折；彥→彦 TS 折、Python 不折。
//   壁馀（册3 p186）因此丢了父边：光表名单里写「壁馀」，TS 折不到「壁余」。
{
  for (const rel of ['../parser/link.py', '../tools/attribute_prose.py',
                     '../tools/extract_entities.py']) {
    const py = readFileSync(new URL(rel, import.meta.url), 'utf8');
    if (!py.includes('字表.json'))
      bad.push(rel.replace('../', '') + ' 没读 data/字表.json，说明又另外攒了一张折叠表');
  }
  // 旧的那份必须不在——只要它还躺着，就总有人会去读它
  if (existsSync(new URL('../data/variants.json', import.meta.url)))
    bad.push('data/variants.json 又出现了——字表只许有 data/字表.json 一张');
}

// ★ 卡片不许现算关系。
//   人际关系（14 类）在 data/people.json 的 relations[]，
//   房支／世次／头衔／标记四张分类表在 data/分类.json，
//   都由 tools/relations.mjs 配一次写进去。渲染路径里再 group() 一次
//   就是两套实现两个答案——2026-09-05 之前正是这样，
//   「被提到」在 json 里有 972 条，而卡片读的是自己现建的索引。
{
  const ent = readFileSync(new URL('../src/core/entries.ts', import.meta.url), 'utf8');
  const banned = [
    ['byPassageHost', '他这一条里的文字'], ['byAuthor', '他写的文字'],
    ['byEntTarget', '别人的条目里提到他'], ['byBranch', '房支'],
    ['byGenN', '世次'], ['byTitle', '头衔'], ['byMark', '标记'],
    ['kidsOf', '子女／兄弟姐妹'], ['kidsIdx', '子女索引'], ['fullRecordOf', '同一个人'],
  ];
  for (const [name, what] of banned)
    if (new RegExp(`\b${name}\b`).test(ent))
      bad.push(`entries.ts 又出现了 ${name}——「${what}」该读 relations[]／分类.json，不许在渲染时算`);
  // 关系表和分类表必须在
  for (const [file, what] of [['../data/分类.json', '分类表']])
    if (!existsSync(new URL(file, import.meta.url)))
      bad.push(`${what} ${file} 不在——跑一遍 node tools/relations.mjs`);
}
const files = readdirSync(new URL('../src/core', import.meta.url)).filter(f => f.endsWith('.ts')).length;
console.log(`扫了 src/core 下 ${files} 个模块；上游豁免 ${[...UPSTREAM].join('、')}`);
if (!bad.length) console.log('\n  ✔ 判定只有一条路：resolve.ts。没有可选、没有兜底、没有旁路；卡片不现算关系');
else { console.log(`\n  ✘ ${bad.length} 处还能绕过新系统：`); bad.forEach(b => console.log('     ' + b)); process.exitCode = 1; }
