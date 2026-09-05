/**
 * 自检：源码里不该出现的形近错字。
 *
 * 我用 \uXXXX 写中文时反复写错过：嗣→嵣、妣→妝／妚、祧→祠／祥。
 * 这类错误**不报错、不崩溃**，只是字符串比对静静地永远不成立——
 * page_pointers 整个重写过一遍却毫无效果，就是这么来的。
 *
 * ★ 早先靠一张手工维护的错字表，等于**错过一次才补一条**。
 *   改成自检：源码里出现、而**全谱一次都没出现过**的汉字，
 *   基本就是打错的（谱里没有的字，判据拿它去比什么？）。
 *   注释里的普通白话字当然也不在谱里，所以只查
 *   **字符串字面量和正则**——那才是要跟谱面对得上的地方。
 */
import { readFileSync, readdirSync } from 'node:fs';

// 谱面用过的全部汉字：人名、原文、以及原始 jsonl
const corpus = new Set();
const eat = s => { for (const c of String(s ?? '')) if (c >= '\u3400') corpus.add(c); };
for (const p of JSON.parse(readFileSync(new URL('../data/people.json', import.meta.url), 'utf8'))) {
  eat(p.raw_text); eat(p.name); eat(p.name_raw); eat(p.src_human);
}
for (const f of readdirSync(new URL('../parser/jsonl', import.meta.url)))
  eat(readFileSync(new URL(`../parser/jsonl/${f}`, import.meta.url), 'utf8'));

// 判据里合法却不会出现在谱面上的字（界面措辞、类目名、说明）
// 异体表里的每一个字都是「要折回来的写法」，天生可以不在谱面上。
// 同理解析器故意写的 OCR 容错形（兼[祧挑]、出[嗣祠]）。
for (const c of readFileSync(new URL('../src/core/variants.ts', import.meta.url), 'utf8'))
  if (c >= String.fromCharCode(0x3400)) corpus.add(c);
const OK = new Set([...'；／｜？！：（）【】《》—…·　'
  ,...'龥鿿㐀'                      // 正则里的汉字区间端点
  ,...'挑祠祥'                      // 故意写的 OCR 容错：祠/挑 当 祧，祥 当 祠
  ,...'的了是不在有和与或从到把被就都也还很更最只要不能可以这那哪个们我你他她它'
  ,...'查看点开搜索显示结果人物关系世系树卡片原文出处依据判定级别定式算术推断说不清'
  ,...'谱未写人工核定名单里写了正上一格房支页眉指向称谓词兼祧出嗣立嗣祧子嗣子生父嗣父'
  ,...'配偶妻子女儿儿子兄弟姐妹上溯共同祖先无父边同名候选位第世谱上叫的有其中一另'
  ,...'附记之人条目独立类型身份记载销账原样缺记备注事迹功名职事迁徙旌表碑志过继'
  ,...'年月日时生殁葬寿岁字讳号名行次谱名去敬称别名索引']);

const BS = String.fromCharCode(92), NL = String.fromCharCode(10);
const Q1 = String.fromCharCode(39), Q2 = String.fromCharCode(34), Q3 = String.fromCharCode(96);
const SL = String.fromCharCode(47), STAR = String.fromCharCode(42), HASH = String.fromCharCode(35);
const HAN0 = String.fromCharCode(0x3400);
let n = 0;
// 只看**字符串字面量和正则**里的汉字——注释里的白话不算。
// 手写一个小扫描器，不用正则（正则里的反斜杠在这个环境里会被吞）。
function literals(src) {
  const out = [];
  let i = 0, line = 1;
  const QUOTES = [Q1, Q2, Q3];
  while (i < src.length) {
    const c = src[i];
    if (c === NL) { line++; i++; continue; }
    // 行注释：// 或 #
    if ((c === SL && src[i + 1] === SL) || c === HASH) {
      while (i < src.length && src[i] !== NL) i++;
      continue;
    }
    // 块注释
    if (c === SL && src[i + 1] === STAR) {
      i += 2;
      while (i < src.length && !(src[i] === STAR && src[i + 1] === SL)) { if (src[i] === NL) line++; i++; }
      i += 2; continue;
    }
    // Python 的三引号 docstring：整块跳过。
    // 不处理的话扫描器会失步，把整篇说明文字当成一堆字面量，
    // 于是「怎」「么」「猜」全成了「错字」。
    if ((c === Q2 || c === Q1) && src[i + 1] === c && src[i + 2] === c) {
      const q3 = c + c + c;
      i += 3;
      while (i < src.length && src.slice(i, i + 3) !== q3) { if (src[i] === NL) line++; i++; }
      i += 3; continue;
    }
    if (QUOTES.includes(c)) {
      const q = c; let buf = ''; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === BS) { buf += src[i + 1] ?? ''; i += 2; continue; }
        if (src[i] === NL) line++;
        buf += src[i++];
      }
      i++; out.push({ text: buf, line }); continue;
    }
    i++;
  }
  return out;
}

for (const d of ['src/core', 'parser', 'tools']) {
  for (const f of readdirSync(new URL(`../${d}`, import.meta.url))) {
    if (!/[.](ts|py|mjs)$/.test(f)) continue;
    if (f === 'charcheck.mjs') continue;
    // 繁简折叠表天生就存谱面**没有**的异体形（要把它们折回来），
    // 同理异写表。这两处不适用这条自检。
    if (/^(variants|erachart)[.]/.test(f)) continue;                    // 本文件自带反例
    const s = readFileSync(new URL(`../${d}/${f}`, import.meta.url), 'utf8');
    const bad = new Map();
    // ★ 只看**真会拿去跟谱面比对**的字面量：
    //     · 短的纯汉字常量（「嗣子」「页眉指向」这类标记）
    //     · 正则（带 [ | ^ $ ( 的）
    //   界面文案、注释、docstring 不算——那些本就是说给人听的白话，
    //   谱里没有「窗」「猜」很正常，报出来只会把真信号淡掉。
    const RXISH = c => '[|^$('.includes(c);
    const worth = t => (!/[A-Za-z0-9]/.test(t) && t.length <= 10)
                    || ([...t].some(RXISH) && t.length <= 300);
    for (const lit of literals(s).filter(x => worth(x.text)))
      for (const c of lit.text)
        if (c >= HAN0 && !corpus.has(c) && !OK.has(c))
          bad.set(c, { n: (bad.get(c)?.n ?? 0) + 1, line: bad.get(c)?.line ?? lit.line });
    for (const [c, v] of bad) {
      console.log(`✘ ${d}/${f}:${v.line}  「${c}」（U+${c.codePointAt(0).toString(16).toUpperCase()}）×${v.n}  ——全谱没有这个字`);
      n += v.n;
    }
  }
}
console.log(n ? String.fromCharCode(10) + '上面 ' + n + ' 处是**候选**，不是闸：谱面没有的字，可能是 ' + BS + 'uXXXX 打错，也可能只是注释里的白话。只看字形相近的那几个。' : '✔ 判据里的每个汉字，谱面上都真的有');
