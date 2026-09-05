/**
 * 打成一个 HTML 文件。双击就能看，不用装任何东西、不用联网。
 *
 * 塞进去的：17 个 .ts 模块（Node 自带类型擦除，不装打包器）、app.js、
 * 11 份数据、CSS、25 张图（base64 内嵌）。
 *
 * ★ 模块**各自一个作用域**，不能拼进同一个作用域。
 *   第一版直接拼，`CN`（数字对照表）在 years.ts 和 activity.ts 都有，
 *   浏览器报「Identifier 'CN' has already been declared」。
 *   现在每个模块包成一个 IIFE，只把 export 的名字交出来，
 *   import 改写成从那个盒子里取。
 *
 * ★ 拼完必须验：每个 import 的名字，在对应模块的导出里必须真的有。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const SRC = 'src/core';
const DATA = ['people', 'places', 'shou', 'erachart', 'prose_ents',
              'revisions', 'generations', 'images', 'translations', 'prefaces',
              '字表', '人工判定', '同一个人', '分类'];
// ★ 字表＝繁简/误字/同音，人工判定＝核定表。漏了就等于折叠和核定都没生效。
const AS = { prose_ents: 'passages' };   // app.js 里这份数据叫 passages

// ── 一、读模块，排依赖顺序 ──────────────────────────────
const src = new Map();
for (const f of readdirSync(SRC).filter(f => f.endsWith('.ts'))) {
  src.set(f.replace(/\.ts$/, ''), readFileSync(`${SRC}/${f}`, 'utf8'));
}
const depsOf = t => [...t.matchAll(/from\s+'\.\/(\w+)\.ts'/g)].map(m => m[1]);
const order = [], seen = new Set(), busy = new Set();
function visit(n) {
  if (seen.has(n)) return;
  if (busy.has(n)) throw new Error(`循环依赖：${n}`);
  busy.add(n);
  for (const d of depsOf(src.get(n) ?? '')) if (src.has(d)) visit(d);
  busy.delete(n); seen.add(n); order.push(n);
}
for (const n of src.keys()) visit(n);

// ── 二、每个模块：擦类型 → 收导出名 → 改写 import → 包成 IIFE ──
const EXPORTS = new Map();
const IMPORT_RE = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'\.\/([\w.]+?)(?:\.ts)?'\s*;?/g;

function pack(name) {
  let js = stripTypeScriptTypes(src.get(name), { mode: 'strip' });

  // 导出的名字（类型在擦除阶段已经没了，剩下的都是值）
  const outs = new Set();
  for (const m of js.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)) outs.add(m[1]);
  for (const m of js.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const p of m[1].split(',')) {
      const t = p.trim(); if (!t) continue;
      outs.add(t.split(/\s+as\s+/).pop().trim());
    }
  }
  EXPORTS.set(name, outs);

  // import 改写成从盒子里取
  js = js.replace(IMPORT_RE, (all, list, mod) => {
    if (!src.has(mod)) return '';
    const picks = list.split(',').map(p => p.trim()).filter(Boolean).map(p => {
      const [orig, alias] = p.split(/\s+as\s+/).map(s => s.trim());
      const have = EXPORTS.get(mod);
      if (have && !have.has(orig)) return null;      // 纯类型导入，擦除后不存在
      return alias ? `${orig}: ${alias}` : orig;
    }).filter(Boolean);
    return picks.length ? `const { ${picks.join(', ')} } = M[${JSON.stringify(mod)}];` : '';
  });
  js = js
    .replace(/^\s*import[^;\n]*;?\s*$/gm, '')
    .replace(/^export\s+(?=(async\s+)?(function|const|let|var|class)\s)/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');

  return `M[${JSON.stringify(name)}] = (() => {\n${js}\nreturn { ${[...outs].join(', ')} };\n})();`;
}
const modules = order.map(pack).join('\n\n');

// ── 三、app.js ──────────────────────────────────────────
let app = readFileSync('prototype/app.js', 'utf8');
// ★ app.js 在 prototype/ 下，import 写的是 '../src/core/xxx.ts'，
//   不是模块之间用的 './xxx.ts'。第一版只认 './'，结果 app.js 的
//   import 一条没换掉，浏览器报 makeRegistry is not defined。
const APP_IMPORT_RE =
  /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(?:\.\.\/src\/core|\.)\/([\w.]+?)(?:\.ts)?'\s*;?/g;
app = app.replace(APP_IMPORT_RE, (all, list, mod) => {
  if (!src.has(mod)) return '';
  const picks = list.split(',').map(p => p.trim()).filter(Boolean)
    .filter(p => EXPORTS.get(mod)?.has(p.split(/\s+as\s+/)[0].trim()));
  return picks.length ? `const { ${picks.join(', ')} } = M[${JSON.stringify(mod)}];` : '';
});
// fetch 换成内嵌数据。
// ★ **变量名从原文里抠**，不要另写一张映射表——
//   第一版手写 AS（referenced→refs、erachart→era…），漏了两个，
//   浏览器直接报 refs is not defined。名字只能有一个来源。
{
  const m = app.match(
    /const \[([^\]]+)\] = await Promise\.all\(\s*\n?\s*\[([^\]]+)\]\.map/m);
  if (!m) throw new Error('找不到 app.js 顶部那段 fetch，打包器要跟着改');
  const vars = m[1].split(',').map(s => s.trim());
  const keys = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  if (vars.length !== keys.length) {
    throw new Error(`变量 ${vars.length} 个、数据 ${keys.length} 份，对不上`);
  }
  const missing = keys.filter(k => !DATA.includes(k));
  if (missing.length) throw new Error('打包器少带了这几份数据：' + missing.join('、'));
  app = app.replace(/const \[[\s\S]*?\] = await Promise\.all\([\s\S]*?\);/m,
    () => vars.map((v, i) => `const ${v} = DATA[${JSON.stringify(keys[i])}];`).join('\n'));
}
app = app.replace(/^\s*import[^;\n]*;?\s*$/gm, '');

// ── 四、验：每个 import 的名字都真的导出了吗 ─────────────
{
  const bad = [];
  for (const [name, text] of src) {
    for (const m of stripTypeScriptTypes(text, { mode: 'strip' }).matchAll(IMPORT_RE)) {
      const mod = m[2];
      if (!src.has(mod)) continue;
      for (const p of m[1].split(',')) {
        const id = p.trim().split(/\s+as\s+/)[0].trim();
        if (id && !EXPORTS.get(mod).has(id) && !/^[A-Z]/.test(id)) {
          bad.push(`${name}.ts 要 ${mod}.${id}`);
        }
      }
    }
  }
  if (bad.length) { console.error('✘ 导出对不上：\n   ' + bad.join('\n   ')); process.exit(1); }
}

// ── 五、数据与图 ────────────────────────────────────────
const data = {};
let bytes = 0;
for (const n of DATA) {
  data[n] = JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
  bytes += JSON.stringify(data[n]).length;
}
// 图：**按原文件名做键**（页面里引用的是原名），字节取压过的那份。
// 一张图只存一次——第一版给每张存了「带扩展名」和「不带」两个键，体积直接翻倍。
const small = existsSync('build/img');
const imgs = {};
let ibytes = 0;
for (const orig of readdirSync('prototype/img')) {
  const file = small ? `build/img/${orig.replace(/\.\w+$/, '.jpg')}` : `prototype/img/${orig}`;
  if (!existsSync(file)) continue;
  const b = readFileSync(file);
  imgs[orig] = 'data:image/jpeg;base64,' + b.toString('base64');
  ibytes += b.length;
}

// ── 六、拼 HTML ─────────────────────────────────────────
mkdirSync('build', { recursive: true });
// ★★ 替换内容里含 `$` 时**必须传函数**，绝不能传字符串。
//    字符串里的 $& $` $' $1 会被当成「刚匹配到的那段」展开。
//    模块代码里有 `.replace(/…/g, '\\$&')`，第一版把整个 bundle 当替换串，
//    那个 $& 展开成了 `<script src="app.js">`，整个文件语法当场坏掉。
//    数据里也必然有 $，同理。
const TAG = '<' + 'script';
const ETAG = '</' + 'script>';
const script = `${TAG} type="module">\nconst M = {};\n${modules}\n\n${app}\n${ETAG}`;
const inject = `${TAG}>window.DATA=${JSON.stringify(data)};`
             + `window.IMG=${JSON.stringify(imgs)};${ETAG}\n`;

let html = readFileSync('prototype/index.html', 'utf8')
  .replace(/<script type="module" src="app\.js"><\/script>/, () => script);

// 图片：**动态取图一律走 app.js 里的 PIC()**，这里一个字都不改。
// 只把 index.html 里写死的那两张封面换成内嵌——文件名必须是干净的文件名，
// 不能含引号、$、反引号，否则说明它其实是段表达式，那就不该在这里替。
//
// ★ 这里踩过坑：原来的 `[^"]+` 会把 `src="img/' + esc(x.file) + '"` 整段
//   当成文件名吃掉，替出来是 src=""，**包里所有动态图片全空**，
//   而脚本还照样报「图片 36 张」。所以下面加了一条硬断言。
html = html.replace(/src="img\/([^"'`$\{}]+?)"/g, (m, f) => {
  if (!imgs[f]) throw new Error(`打包中止：index.html 里引用了 img/${f}，但图片目录里没有`);
  return `src="${imgs[f]}"`;
});
{
  // PIC() 里那句 ('img/' + f) 是**开发时的回退**，成品里走不到，留着不算问题。
  const left = (html.match(/["'`]img\//g) ?? [])
    .filter(() => true);
  const devFallback = (html.match(/\('img\/' \+ f\)/g) ?? []).length;
  if (left.length - devFallback > 0)
    throw new Error(`打包中止：还有 ${left.length - devFallback} 处 img/ 路径没换成内嵌`);
  const empty = html.match(/src=""/g) ?? [];
  if (empty.length) throw new Error(`打包中止：出现 ${empty.length} 个空的 src=""——多半是替换吃过界了`);
  if (!/window\.IMG\[/.test(html) && !/window\.IMG&&window\.IMG\[/.test(html))
    throw new Error('打包中止：成品里没有一处读 window.IMG——图全是死的');
}

html = html.includes('</head>')
  ? html.replace('</head>', () => inject + '</head>')
  : html.replace('<style>', () => inject + '<style>');

writeFileSync('build/张氏宗谱.html', html, 'utf8');
const MB = n => (n / 1048576).toFixed(1) + ' MB';
console.log('✔ build/张氏宗谱.html');
console.log(`   模块 ${order.length} 个，按依赖排：${order.join(' → ')}`);
console.log(`   数据 ${DATA.length} 份　${MB(bytes)}`);
console.log(`   图片 ${Object.keys(imgs).length} 张　${MB(ibytes)}` + (small ? '（已压缩）' : ''));
console.log(`   **成品 ${MB(Buffer.byteLength(html))}**`);
