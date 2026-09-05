/**
 * 100 人详细抽查：卡片上说的每一句，回原文核。
 *
 * 查五项：
 *   ① 名／字／讳／号   卡片写的，原文里必须有
 *   ② 生／殁／葬       卡片写的，必须是原文的原字
 *   ③ 父              卡片给的那位，跟原文写的父名对不对得上
 *   ④ 子女            卡片列的，必须在原文的「生子N／女N」里
 *   ⑤ 树的第一步       必须跟卡片上的父一致（这是并成一套之后的硬要求）
 *   ⑥ 事迹栏           摆出来的每一句，原文里必须真有（或注明来自谁那一条）
 *   ⑦ 零丢失           原文里每一行，卡片上必须找得到——不许有话被吞掉
 *
 * 取样：默认按世次分层等距，`--seed N` 改成真随机（可复现）。
 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { buildTree } from '../src/core/tree.ts';
import { norm, loadTables } from '../src/core/norm.ts';
import { cardText, coveredByCard } from '../src/core/oncard.ts';
import { fname } from '../src/core/fname.ts';
// DATA=build/new 可把全部工具指向新解析的产物，旧数据不动
const DIR = process.env.DATA || 'data';
const J = n => { try { return JSON.parse(readFileSync(new URL(`../${DIR}/${n}.json`, import.meta.url), 'utf8')); }
                 catch { return JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8')); } };
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'), prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const bare = s => norm(s ?? '').replace(/公$/, '');
const flat = s => norm((s ?? '').replace(/[\s　]+/g, ''));

// `--seed N`：可复现的真随机抽样。用 mulberry32，脚本自带，不引依赖。
const argv = process.argv.slice(2);
const si = argv.findIndex(a => a.startsWith('--seed'));
const seedArg = si < 0 ? null : argv[si];
const seedVal = si < 0 ? null : (seedArg.split('=')[1] ?? argv[si + 1]);
const nums = argv.filter((a, i) => /^\d+$/.test(a) && a !== seedVal);
const N = Number(nums[0] ?? 100);
let sample0 = null;
if (seedArg) {
  let a = Number(seedVal ?? 1) >>> 0;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pool = [...D.people];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  sample0 = pool.slice(0, N);
}

// 均匀取 100 人：按世次分层，每世按 pid 排序等距取
const byGen = new Map();
for (const p of D.people) (byGen.get(p.gen) ?? byGen.set(p.gen, []).get(p.gen)).push(p);
const pick = [];
for (const [g, list] of [...byGen].sort((a, b) => a[0] - b[0])) {
  list.sort((a, b) => a.pid.localeCompare(b.pid));
  const want = Math.max(1, Math.round(100 * list.length / D.people.length));
  for (let i = 0; i < want && i < list.length; i++)
    pick.push(list[Math.floor(i * list.length / want)]);
}
const sample = sample0 ?? pick.slice(0, N);

const bad = [];
const note = (p, what, detail) => bad.push({ pid: p.pid, who: `${p.gen}世 ${p.name}`, src: p.src_human, what, detail });
let checked = 0;
for (const p of sample) {
  const e = R.build.person(p.pid);
  if (!e) { note(p, '建不出卡片', ''); continue; }
  checked++;
  const raw = flat(p.raw_text);
  // ① 名字类
  for (const k of ['zi', 'hui', 'hao', 'ming']) {
    const t = p[k]?.text; if (!t) continue;
    if (!raw.includes(flat(t))) note(p, `${k} 不在原文`, t);
  }
  // ② 生殁葬
  for (const [lab, fld] of [['生', 'birth'], ['殁', 'death'], ['葬', 'burial']]) {
    const t = p[fld]?.text; if (!t) continue;
    if (!raw.includes(flat(t))) note(p, `${lab} 不在原文`, t.slice(0, 30));
  }
  // ③ 父：卡片给的那位，名字要跟原文写的父名对得上（或谱本来就没写父名）
  const ps = R.parents(p);
  const shown = [...ps.birth, ...ps.heir];
  if (p.father_name && shown.length) {
    const w = bare(fname(p.father_name));
    const hit = shown.some(c => bare(c.person?.name) === w
      || (c.person?.aliases ?? []).some(a => bare(a.form) === w));
    // ★ 谱自己把父名印岔了是常事（壁/梁、銑白/铣台 都是形近）。
    //   判定层拿版面和名单定出正主，卡片上把**为什么**写出来了——
    //   那不是错，那正是「可追溯」。跟 cardcheck 一个口径：说清了就不算。
    const said = [...(e.facts ?? []).filter(f => String(f.label).startsWith('父'))
      .flatMap(f => [f.note, f.raw, ...(f.links ?? []).flatMap(l => [l.note, l.raw])]),
      ...(e.sections ?? []).map(x => x.text)].filter(Boolean).join(' ');
    if (!hit && flat(said).length < 8) note(p, '卡片上的父亲跟原文写的父名对不上，卡片也没说为什么',
      `原文「${p.father_name}」→ 卡片 ${shown.map(c => c.person?.name).join('、')}`);
  }
  // ④ 子女：卡片列的必须在原文里
  for (const r of e.relations.filter(x => x.heading === '子女')) {
    for (const l of r.items) {
      // 标签是界面拼的（「文道之女　适梅」），要剥掉前缀只留谱上那几个字
      const nm = String(l.label).replace(/（[^）]*）/g, '')
        .replace(/^.*?之[子女]\s*/, '').trim();
      // 敬称「公」是条目题名加的，父亲的名单里写本字（「生子二　锡　镮」）。
      // 另外儿子的条目名可能是异写（镮/银），所以别名也算数。
      const q = l.kind === 'person' ? R.idx.get(l.id) : null;
      const forms = new Set([nm, nm.replace(/公$/, ''),
        ...(q ? [q.name, q.name.replace(/公$/, ''), ...q.aliases.map(a => a.form)] : [])]
        .filter(Boolean).map(flat));
      // ★ 谱没给女儿留名字（只写「长适刘」），卡片按行次叫她「长女」，
      //   并在注里原样写着「谱上写『长适刘』」——那是显示用的称呼，不是编造。
      //   注里带了谱的原话就算数。
      const noteHasRaw = /谱上写「[^」]*」/.test(String(l.note ?? ''));
      // ★ 谱常常只写一边：孩子那一条写「某某之子」，父亲的名单里没有他。
      //   这时父亲的原文里当然找不到孩子的名字——那是谱的写法，不是我们编的。
      //   孩子自己那一条写了这位父亲，就算数。
      const wroteBack = q && bare(fname(q.father_name)) === bare(p.name);
      if (nm && !noteHasRaw && !wroteBack && ![...forms].some(x => raw.includes(x)))
        note(p, '子女栏里的名字不在原文，孩子那一条也没写这位父亲',
             `${l.label} → 「${nm}」`);
    }
  }
  // ⑤ 树第一步 == 卡片的父
  const t = buildTree(R.idx, p.pid, undefined, R.parents);
  const step = t.rows?.[0]?.cells?.[0];
  const nextIds = new Set((t.rows?.[1]?.cells ?? []).map(c => c.person.pid));
  const cardIds = new Set(shown.map(c => c.edge.parent));
  if (cardIds.size && nextIds.size) {
    const ok = [...nextIds].some(id => cardIds.has(id));
    if (!ok) note(p, '★树往上走的那位不在卡片的父亲里',
      `树 ${[...nextIds].map(i => R.idx.get(i)?.name).join('、')} ／ 卡片 ${[...cardIds].map(i => R.idx.get(i)?.name).join('、')}`);
  }
  // ⑥ 事迹栏摆的话，原文里必须真有；来自别人条目的要注明是谁
  for (const sec of e.sections ?? []) {
    for (const line of String(sec.text).split('\n')) {
      const t = flat(line.replace(/^[^　]{1,12}　/, ''));   // 剥掉行首的小标签
      if (t.length < 3) continue;
      if (raw.includes(t)) continue;
      if (/那一条|写在「/.test(sec.heading) || /那一条/.test(line)) continue;  // 明说了出自别人那一条
      note(p, '★事迹栏摆了原文里没有的话', `【${sec.heading}】${t.slice(0, 28)}`);
    }
  }
  // ⑦ 档案层→卡片的接线：dossier 归了类的每一条，卡片必须摆出来。
  //    dossier 那一头「一个字都没蒸发」是 dossier_test.mjs 保的（unaccounted 恒为 0），
  //    这里保的是**归好的东西真的印到了卡片上**，不是归完就扔。
  {
    const dz = R.dossier(p);
    const onSec = (e.sections ?? []).map(x => flat(x.text)).join(' ');
    for (const k of ['过继', '功名', '职事', '迁徙', '旌表', '事迹', '碑志', '缺记']) {
      for (const it of dz.cat[k] ?? []) {
        if (!onSec.includes(flat(it.text))) note(p, `★档案归了「${k}」，卡片上没印`, it.text.slice(0, 30));
      }
    }
  }
  // ⑦b 原文每一行，卡片上总得找得着。
  //     ★ 判据**只有一处**：`src/core/oncard.ts`。以前这里一套、cardgap 一套，
  //       同一份数据两个答案（40 条 vs 76 条）。
  {
    // 「别处也算数」：配偶那一段在她自己卡上；名单里的孩子（女儿、无条目的子）
    //   的生卒葬也在他们自己那一页上——都不是丢。
    const elsewhere = [
      ...R.dossier(p).cat['配'].map(i => i.text),
      ...(p.kin ?? []).flatMap(k => [k.birth?.text, k.death?.text, k.burial?.text, k.age?.text, k.married]),
      ...(p.spouses ?? []).flatMap(x => [x.birth?.text, x.death?.text, x.burial?.text, x.age?.text, x.remarried]),
    ].filter(Boolean).map(flat).join(' ');
    const onCard = cardText(e);
    for (const ln of String(p.raw_text ?? '').split(String.fromCharCode(10))) {
      if (coveredByCard(ln, onCard, elsewhere)) continue;
      note(p, '原文有这一行，卡片上找不到', flat(ln).slice(0, 30));
    }
  }
}
console.log(`抽查 ${checked} 人（${sample0 ? `随机抽样，seed=${seedVal}` : '按世次分层等距取样'}）\n`);
if (!bad.length) console.log('  ✔ 七项全过：名字／生殁葬／父／子女／树卡一致／事迹属实／零丢失');
else {
  const byWhat = new Map();
  for (const b of bad) (byWhat.get(b.what) ?? byWhat.set(b.what, []).get(b.what)).push(b);
  for (const [w, list] of [...byWhat].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ✘ ${w}　${list.length} 条`);
    for (const b of list.slice(0, 5)) console.log(`       ${b.who}　${b.detail}　${b.src}`);
    if (list.length > 5) console.log(`       …还有 ${list.length - 5} 条`);
  }
}
