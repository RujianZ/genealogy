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
import { readFileSync, readdirSync } from 'node:fs';

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

// ★ 两边的繁简折叠表必须同源。
//   早先 parser/link.py 手写了一份小表，与 src/core/variants.ts 不一致（馀、彥），
//   壁馀（册3 p186）因此在 TS 那边永远配不上父亲名单里的「壁馀」。
{
  const py = readFileSync(new URL('../parser/link.py', import.meta.url), 'utf8');
  if (!py.includes('data/variants.json') && !py.includes('"variants.json"'))
    bad.push('parser/link.py 没读 data/variants.json，说明又另外手写了一张折叠表');
}

const files = readdirSync(new URL('../src/core', import.meta.url)).filter(f => f.endsWith('.ts')).length;
console.log(`扫了 src/core 下 ${files} 个模块；上游豁免 ${[...UPSTREAM].join('、')}`);
if (!bad.length) console.log('\n  ✔ 判定只有一条路：resolve.ts。没有可选、没有兜底、没有旁路');
else { console.log(`\n  ✘ ${bad.length} 处还能绕过新系统：`); bad.forEach(b => console.log('     ' + b)); process.exitCode = 1; }
