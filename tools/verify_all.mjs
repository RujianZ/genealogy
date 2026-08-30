/**
 * 总校验。**每一条都是「必须成立」的不变量，不成立就是 bug。**
 *
 * 力保可靠的意思不是「小心一点」，是**把该成立的写成断言，每次都跑一遍**。
 * 这份脚本任何一条红了，就说明前面某处坏了。
 */
import { readFileSync } from 'node:fs';
import { fname } from '../src/core/fname.ts';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept, allRuledOut } from '../src/core/candidates.ts';
import { buildTree } from '../src/core/tree.ts';
import { makeRegistry } from '../src/core/entries.ts';
import { roster as rosterOf } from '../src/core/roster.ts';
// ★ 名字比对一律用 norm（947 条繁简异体折叠）。
//   下面的 NS 只去空格，用来查「原文一字不动」——那种地方要的正是不折叠。
//   两者绝不能混用：断言自己用错，就会假报一堆「启鹍 ≠ 啟鵾」。
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const NS = s => (s || '').replace(/[\s　]/g, '');
// 谱写下的儿子名，**两份取并集**：roster 按格式重读（会补辈字），
// sons_claimed 是上游原样存的（会漏辈字，但另有 roster 读不到的）。
// backlink 用的就是这把尺，断言必须用同一把——否则量出来的是尺子的差。
const sonNames = f => new Set([
  ...rosterOf(f).sons.filter(x => !x.died).map(x => norm(x.name || x.raw)),
  ...(f.sons_claimed ?? []).map(norm),
].filter(Boolean));
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? '\n      ' + detail : ''}`); }
};

const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const prose = J('prose_ents');
const trans = J('translations');
const shou = J('shou');
const doubts = J('doubts');

console.log('══ 一、原文完整性 ══\n');

// 事迹切分：字符守恒（骨架 + 事迹 == 原文）
{
  const proseChars = prose.reduce((a, x) => a + NS(x.text).length, 0);
  const inHost = new Map();
  for (const x of prose) inHost.set(x.host, (inHost.get(x.host) ?? 0) + NS(x.text).length);
  let bad = 0;
  for (const [pid, n] of inHost) {
    if (n > NS(idx.get(pid)?.raw_text ?? '').length) bad++;
  }
  ok(bad === 0, `事迹字数不超过本人原文（${prose.length} 段，${proseChars.toLocaleString()} 字）`,
     bad ? `${bad} 人的事迹字数超过了原文` : '');
}

// 事迹原文必须是本人 raw_text 的子串（一字不动的证明）
{
  const bad = prose.filter(x => !NS(idx.get(x.host)?.raw_text ?? '').includes(NS(x.text)));
  ok(bad.length === 0, '每段事迹都能在本人原文里逐字找到',
     bad.slice(0, 3).map(x => `${x.host_name} ${x.id}`).join('　'));
}

// 卷首译文：src 拼起来 == 原文
{
  let bad = [];
  for (const [id, t] of Object.entries(trans.docs)) {
    const d = shou.find(v => v.id === id);
    if (!d) { bad.push(`${id} 不在卷首`); continue; }
    const j = NS(t.paras.map(p => p.src).join(''));
    if (j !== NS(d.text)) bad.push(`${id} 差 ${j.length - NS(d.text).length} 字`);
  }
  ok(bad.length === 0, `卷首译文的原文一字不差（${Object.keys(trans.docs).length} 篇）`, bad.join('　'));
}

// 各届序的原文：每一段都必须能在卷首原书里逐字找到。
// 序是手敲进去加标点的，最容易在这一步把字改掉——比如把重文号「匕」写成叠字、
// 把刻成「日」的「曰」改回去。改一个字，这篇就不是原文了。
{
  const pf = J('prefaces');
  const docOf = d => shou.find(v => v.id === d.replace(/#\d+$/, ''));
  const bad = [];
  let paras = 0, full = 0;
  for (const x of pf.list) {
    if (!x.full) continue;
    full++;
    const src = NS(docOf(x.doc)?.text ?? '');
    for (const p of x.full) {
      paras++;
      const s = NS(p.src).replace(/[，。：；、？！「」『』《》（）—…]/g, '');
      if (!src.includes(s)) bad.push(`${x.doc}：${s.slice(0, 14)}…`);
    }
  }
  ok(bad.length === 0, `各届序的原文一字不动（${full} 篇全文，${paras} 段）`,
     bad.slice(0, 3).join('　'));
  // 十届修谱，每一届的页面上都得挂着那一届的序，且是全文不是摘句
  const revs = J('revisions');
  const dry = revs.filter(r => !pf.list.some(x => x.round === r.era && x.full));
  ok(dry.length === 0, `十届修谱每一届都有全文（共 ${full} 篇）`,
     dry.map(r => r.era).join('　'));
  // round 为 null 的只有《源流序》（1093，讲迁梅以前），其余都必须挂得上
  const orphan = pf.list.filter(x => x.round && !revs.some(r => r.era === x.round));
  ok(orphan.length === 0, '每篇序都挂在某一届上', orphan.map(x => x.title).join('　'));
}

// 事迹译文的 id 必须真的存在——手打 id 打错过一次（4-0-0 写成了 4-1-0）
{
  const cn = JSON.parse(readFileSync('data/prose_cn.json', 'utf8'));
  const keys = Object.keys(cn).filter(k => !k.startsWith('_'));
  const ids = new Set(prose.map(x => x.id));
  const bad = keys.filter(k => !ids.has(k));
  ok(bad.length === 0, `事迹译文的 id 都对得上（${keys.length} 条）`, bad.join('　'));
  const empty = keys.filter(k => !cn[k].cn || !cn[k].cn.trim());
  ok(empty.length === 0, '没有空译文', empty.join('　'));
}

// 折叠表必须**收敛**：折一次和折两次结果一样。
// 曾经有两对字是互相映射的——才→纔 而 纔→才，峰→峯 而 峯→峰。
// 那不是合并，是对调：写「继才」的和写「继纔」的永远匹配不上。
{
  const { TRAD2SIMP } = await import('../src/core/variants.ts');
  const bad = Object.entries(TRAD2SIMP)
    .filter(([, v]) => TRAD2SIMP[v] && TRAD2SIMP[v] !== v)
    .map(([k, v]) => `${k}→${v}→${TRAD2SIMP[v]}`);
  ok(bad.length === 0, `繁简折叠表收敛，没有互相映射（${Object.keys(TRAD2SIMP).length} 条）`,
     bad.slice(0, 4).join('　'));
  const notIdem = [];
  for (const k of Object.keys(TRAD2SIMP)) {
    if (norm(norm(k)) !== norm(k)) notIdem.push(k);
  }
  ok(notIdem.length === 0, '折一次和折两次结果一样', notIdem.slice(0, 6).join(''));
}

console.log('\n══ 二、指向的东西都存在 ══\n');

{
  const bad = [];
  for (const p of people) {
    for (const e of p.parent_edges) if (!idx.has(e.parent)) bad.push(`${p.name}→${e.parent}`);
  }
  ok(bad.length === 0, '所有父边指向的人都在谱里', bad.slice(0, 3).join('　'));
}
{
  const bad = [];
  for (const x of prose) {
    if (!idx.has(x.host)) bad.push(x.id);
    for (const e of x.ents ?? []) {
      for (const t of e.targets) if (t.pid && !idx.has(t.pid)) bad.push(`${x.id}:${t.pid}`);
    }
    for (const t of x.author?.targets ?? []) if (!idx.has(t.pid)) bad.push(`${x.id}:作者${t.pid}`);
  }
  ok(bad.length === 0, '事迹里标出的人都在谱里', bad.slice(0, 3).join('　'));
}
// 要素的位置必须落在原文里，且那几个字确实是标出来的字
{
  const bad = [];
  for (const x of prose) {
    const f = NS(x.text);
    for (const e of x.ents ?? []) {
      if (f.slice(e.at, e.at + e.text.length) !== e.text) bad.push(`${x.id}@${e.at}`);
    }
  }
  ok(bad.length === 0, '每处要素的位置和字都对得上原文', bad.slice(0, 3).join('　'));
}

console.log('\n══ 三、三条原则 ══\n');

// 不猜：绝不能有人被排空候选
{
  const bad = people.filter(p => p.parent_edges.length &&
    kept(candidates(idx, p, chart, win)).length === 0);
  ok(bad.length === 0, '**没有人被判据排空候选**（宁可说不清，不可把人抹掉）',
     bad.slice(0, 3).map(p => p.name).join('　'));
}
// rank 1 的定义就是「父亲那一条的生子名单里点了本人的名」。
// 标了 rank 1 却在名单里找不到，就是标错了——反查补边时正是这么错的：
// 本人条目根本没写父亲，只是名字撞进了别人的名单，也标成了 rank 1。
//
// 注意**不能**反过来断言「一个人不许有两条 rank 1」：
// 谱里真有两个泽贵，各自的生子名单里都写着「梁玉」；也真有两个梁玉，
// 各自写父名「泽贵」。那时候两条 rank 1 是诚实的，正是「不猜」要留的情形。
{
  const bad = [];
  for (const p of people) {
    for (const e of p.parent_edges) {
      if (e.rank !== 1) continue;
      const f = idx.get(e.parent);
      // ★ 断言要跟判据用**同一把尺**。
      //   sons_claimed 是上游原样存的，谱上兄弟连排时辈字只写一次
      //   （「生子三　梁枸　架　柴」），所以里面躺着「架」「柴」这种半截名字。
      //   roster() 才是按谱的格式读出来的那份。用旧字段量新判据，量出来的是尺子的差。
      const sons = f ? sonNames(f) : new Set();
      const me = [norm(p.name), ...p.aliases.map(a => norm(a.form))];
      if (!me.some(x => sons.has(x))) {
        bad.push(`${p.name}（${p.src_human}）→ ${e.parent_name}`);
      }
    }
  }
  ok(bad.length === 0, 'rank 1 的边，父亲的生子名单里真的有本人', bad.slice(0, 3).join('　'));
}
// 反查补出来的边，标 rank 1 必须**儿子自己也写了父名且对得上**
{
  const bad = [];
  for (const p of people) {
    for (const e of p.parent_edges) {
      if (!e.derived || e.rank !== 1) continue;
      const f = idx.get(e.parent);
      // 册4 写「承华之长子」，前三册写「光量长子」——句末那个「之」是虚词，
      // 比对时要去掉（src/core/fname.ts）。断言跟判据必须用同一把尺，
      // 不然改对了代码，反倒是检验先报错。
      const w = fname(p.father_name);
      if (!w || !f || (norm(f.name) !== w && !f.aliases.some(a => norm(a.form) === w))) {
        bad.push(`${p.name}（${p.src_human}）→ ${e.parent_name}`);
      }
    }
  }
  ok(bad.length === 0, '反查补的边，rank 1 只给两边对得上的', bad.slice(0, 3).join('　'));
}
// 子女栏不得超出谱自己写的「生子N」——继均写「生子六」却列了 9 个，就是这么来的
{
  const bad = [];
  for (const f of people) {
    const n = sonNames(f).size;
    if (!n) continue;
    const okKids = childrenOf(people, f.pid).filter(k =>
      candidates(idx, k.child, chart, win).some(c => c.edge === k.edge && c.status === 'ok'));
    // 同名多人对得上时会多出行来，那是「不猜」要求的全列；
    // 这里查的是**不同名字的人数**不得超过名单长度。
    const listed = sonNames(f);
    // 名单外还挂着的，只有一种情况不允许：
    // **这条边是反查靠名字撞出来的，而本人条目里一个父亲都没写。**
    // （父边来自过继语句 stated_adopt、或本人写了父名的，都算谱明说过，照留。）
    // ★ 比对要连**字、讳、号**一起比，不能只比谱名。
    //   谱上父亲写儿子，未必写谱名：开荣（册4·卷八·第78页第1行）那条
    //   整行挤成一句「…娶章白枝…生子一**用兵**」，而第2行的承兵
    //   **字就是用兵**。父子同页、正下一行，这是真关系，不是多出来的。
    const nameForms = c => [norm(c.name), ...c.aliases.map(a => norm(a.form))];
    const strays = okKids.filter(k => !nameForms(k.child).some(x => listed.has(x))
      && k.edge.derived && !k.child.father_name);
    if (strays.length) {
      bad.push(`${f.name}（${f.src_human}）多出 ${strays.map(k => k.child.name).join('、')}`);
    }
  }
  ok(bad.length === 0, '子女栏里没有「谱没写、对方也没写」的人', bad.slice(0, 3).join('　'));
}

// 承健那条链：**每一步都要有三处以上独立说法**。
// 「靠什么定的」和「还有几处别的说法也这么说」是两回事，后者才是可靠性。
{
  const me = people.find(p => p.name === '承健' && p.gen === 27);
  const ORD2 = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const ordN = f => { const t = norm(f ?? ''); return !t ? null : t.startsWith('幼') ? -1 : (ORD2[t[0]] ?? null); };
  let cur = me, steps = 0, thin = [];
  while (cur && cur.gen > 1 && steps < 40) {
    const ok = candidates(idx, cur, chart, win)
      .filter(c => c.status === 'ok' && c.edge.kind === '生父');
    if (ok.length !== 1) { thin.push(`${cur.name} 候选 ${ok.length} 个`); break; }
    const f = ok[0].person;
    const sons = rosterOf(f).sons.map(s => norm(s.name || s.raw));
    const mine = [norm(cur.name), ...cur.aliases.map(a => norm(a.form))];
    const i = sons.findIndex(s => mine.includes(s));
    const o = ordN(cur.filiation);
    let ev = 0;
    if (i >= 0) ev++;                                    // 父亲名单点了名
    if (cur.father_name) ev++;                           // 他自己写了父名
    if (o != null && i >= 0 && i + 1 === (o === -1 ? sons.length : o)) ev++;  // 排行
    if (cur.gen - f.gen === 1) ev++;                     // 世次
    if (ev < 3) thin.push(`第${cur.gen}世 ${cur.name} 只有 ${ev} 处`);
    cur = f; steps++;
  }
  ok(steps === 26 && thin.length === 0,
     `承健到胜二公 ${steps} 步，每步都有三处以上独立说法印证`, thin.slice(0, 3).join('　'));
}

// 不漏：doubts 里的每条都指向真人
{
  const all = Object.values(doubts).flat();
  const bad = all.filter(x => x.pid && !idx.has(x.pid));
  ok(bad.length === 0, `疑点清单里的人都在谱里（共 ${all.length} 条）`, bad.slice(0, 3).join('　'));
}
// 可追溯：每个人都有出处
{
  const bad = people.filter(p => !p.src_human || !p.raw_text);
  ok(bad.length === 0, '每个人都有出处和原文', bad.slice(0, 3).map(p => p.name).join('　'));
}

console.log('\n══ 四、世系走得通 ══\n');

{
  let root = 0, stop = 0, cyc = 0;
  for (const p of people) {
    let cur = p.pid, n = 0; const seen = new Set();
    while (cur && n++ < 45) {
      if (seen.has(cur)) { cyc++; break; }
      seen.add(cur);
      const q = idx.get(cur);
      if (!q) break;
      if (q.gen === 1) { root++; break; }
      const g = kept(candidates(idx, q, chart, win));
      if (!g.length) { stop++; break; }
      cur = (g.find(c => c.edge.kind === '生父') ?? g[0]).edge.parent;
    }
  }
  ok(cyc === 0, '上溯没有成环', cyc ? `${cyc} 人成环` : '');
  console.log(`      （能追到胜二公 ${root} 人 = ${(root / people.length * 100).toFixed(1)}%，`
    + `断在中途 ${stop} 人）`);
}
// 承健的链必须干净
{
  const me = people.find(p => p.name === '承健' && p.gen === 27);
  const t = buildTree(idx, me.pid);
  const murky = t.rows.filter(r => r.cells.some(c => {
    const cs = candidates(idx, c.person, chart, win);
    const bk = {};
    for (const k of kept(cs)) (bk[k.edge.kind] ??= new Set()).add(k.edge.parent);
    return Math.max(0, ...Object.values(bk).map(s => s.size)) > 1;
  }));
  ok(t.rows.length === 27 && murky.length === 0,
     '承健 27 代一步不含糊', `${t.rows.length} 代，说不清 ${murky.length} 步`);
  ok(t.splitGen === 16 && t.joinGen === 9,
     '过继两条线：第 16 世分开、第 9 世合回',
     `split=${t.splitGen} join=${t.joinGen}`);
}

console.log('\n══ 五、界面能建出所有条目 ══\n');
{
  const R = makeRegistry({
    people: raw, refs: J('referenced'), places: J('places'), shou,
    era: J('erachart'), passages: prose, revisions: J('revisions'),
    generations: J('generations'), images: J('images'), trans, prefaces: J('prefaces'),
  });
  const kinds = Object.keys(R.build);
  const bad = [];
  const cat = R.catalogue();
  for (const k of kinds) {
    const list = cat[k];
    if (!list?.length) continue;
    for (const item of list.slice(0, 40)) {
      try { if (!R.build[k](item.id)) bad.push(`${k}:${item.id}`); }
      catch (e) { bad.push(`${k}:${item.id} ${e.message}`); }
    }
  }
  ok(bad.length === 0, `每类条目都建得出来（${kinds.length} 类，各抽 40 条）`,
     bad.slice(0, 3).join('　'));
}

console.log(`\n${'═'.repeat(50)}`);
console.log(fail === 0 ? `全部通过（${pass} 项）` : `**${fail} 项没通过**，通过 ${pass} 项`);
process.exit(fail ? 1 : 0);
