/**
 * 冒烟测试：**界面上每条路都走一遍**。
 *
 * verify_all.mjs 管数据对不对；这一份管**点得动吗、走得通吗**。
 * 在 node 里跑，不开浏览器——所有渲染逻辑都是纯函数，能直接调。
 *
 * 每条都是「用户会做的一件事」，做不成就是坏的。
 */
import { readFileSync } from 'node:fs';
import { doubtList } from '../src/core/doubts.ts';
import { makeRegistry } from '../src/core/entries.ts';
import { buildTree } from '../src/core/tree.ts';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { search } from '../src/core/search.ts';
import { searchDocs } from '../src/core/docs.ts';
import { advancedSearch } from '../src/core/advanced.ts';
import { kinship, describe } from '../src/core/kinship.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
let pass = 0, fail = 0;
const t = (name, fn) => {
  try {
    const msg = fn();
    pass++; console.log(`  ✔ ${name}${msg ? '　' + msg : ''}`);
  } catch (e) { fail++; console.log(`  ✘ ${name}\n      ${e.message}`); }
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}：得到 ${a}，应为 ${b}`); };
const gt = (a, b, what) => { if (!(a > b)) throw new Error(`${what}：${a} 不大于 ${b}`); };

const D = {
  people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'), prefaces: J('prefaces'),
  manual: J('人工判定'), sameone: J('同一个人'),   // ★ 忘了带就等于在验「没有人工核定」的结果
};
const R = makeRegistry(D);
// ★ 建树跟人物卡同一份判定；不传就是在验旧路径。
const PS = R.parents;
const idx = buildIndex(withBacklinks(D.people));
const cat = R.catalogue();
const me = D.people.find(p => p.name === '承健' && p.gen === 27);

console.log('══ 搜索 ══\n');

// CLAUDE.md 第八节原话：「搜『火生』…应该有 3 个字火生的 + 5 个差一字的」
// 这条就是把那句话写成断言。
t('搜「火生」——CLAUDE.md 第八节点名要的头一件事', () => {
  const r = search(D.people, '火生');
  const exact = r.filter(x => x.matches.some(m => m.field === '字' && m.text === '火生'));
  eq(exact.length, 3, '字正好是「火生」的人数');
  gt(r.length, 8, '连差一字的一起，总命中数');
  const names = exact.map(x => `${x.person.name}(第${x.person.gen}世)`).join('、');
  return `${r.length} 人命中；字火生的正好 3 个：${names}`;
});

t('每条命中都说得出为什么命中', () => {
  const r = search(D.people, '火生');
  const bad = r.filter(x => !x.matches?.length || x.matches.some(m => !m.why || !m.field));
  eq(bad.length, 0, '说不出理由的命中数');
  return `${r.length} 条全部带理由（如「${r[0].matches[0].why}」）`;
});

t('搜索不截断（谱上有多少给多少）', () => {
  const r = search(D.people, '开');
  gt(r.length, 100, '命中数');
  return `搜「开」得 ${r.length} 人，一条没截`;
});

t('繁简都能搜到同一个人', () => {
  const a = search(D.people, '启昌'), b = search(D.people, '啟昌');
  gt(a.length, 0, '简体命中'); gt(b.length, 0, '繁体命中');
  return `启昌 ${a.length} 人 · 啟昌 ${b.length} 人`;
});

t('搜妻女——跟男人走**同一个搜索**', () => {
  // ★ 早先她们得用 searchReferenced 另搜一路（referenced.json）。
  //   那张表删了：她们现在各有 pid、在同一个索引里。
  const everyone = [...R.idx.values()];
  const r = search(everyone, '李氏雪梅');
  gt(r.length, 0, '命中数');
  const her = r.find(x => x.person.attached);
  if (!her) throw new Error('命中里没有附记之人');
  return `${r.length} 条；头一个附记之人：${her.person.name}（${her.person.pid}）`;
});

t('搜卷首全文', () => {
  const r = searchDocs(D.shou, '不忘所自出');
  gt(r.length, 0, '命中数');
  return `「不忘所自出」在 ${r.length} 篇里`;
});

t('高级搜索：按父名', () => {
  const r = advancedSearch(D.people, D.places, { father: '开赛' }, R.parents);
  gt(r.length, 0, '命中数');
  return `父名开赛的 ${r.length} 人`;
});

console.log('\n══ 点开每一类条目 ══\n');

for (const k of Object.keys(R.build)) {
  t(`点开一条「${k}」`, () => {
    const list = cat[k];
    if (!list?.length) return '（这一类是空的）';
    const e = R.build[k](list[0].id);
    if (!e) throw new Error('建不出条目');
    if (!e.title) throw new Error('没有标题');
    if (!Array.isArray(e.facts)) throw new Error('facts 不是数组');
    if (!Array.isArray(e.relations)) throw new Error('relations 不是数组');
    return `${list.length} 条，头一条「${e.title}」`;
  });
}

console.log('\n══ 从人物页能点到的地方 ══\n');

t('人物页每个链接都点得开', () => {
  const e = R.build.person(me.pid);
  const links = [...e.facts.flatMap(f => f.links ?? []),
                 ...e.relations.flatMap(r => r.items)];
  gt(links.length, 0, '链接数');
  const dead = links.filter(l => !R.build[l.kind]?.(l.id));
  if (dead.length) throw new Error(`${dead.length} 个点不开：`
    + dead.slice(0, 3).map(l => `${l.kind}:${l.id}`).join('　'));
  return `${links.length} 个链接全部点得开`;
});

t('随机 40 个人，所有链接都点得开', () => {
  let n = 0, dead = 0;
  for (let i = 0; i < D.people.length; i += Math.floor(D.people.length / 40)) {
    const e = R.build.person(D.people[i].pid);
    if (!e) { dead++; continue; }
    for (const l of [...e.facts.flatMap(f => f.links ?? []),
                     ...e.relations.flatMap(r => r.items)]) {
      n++;
      if (!R.build[l.kind]?.(l.id)) dead++;
    }
  }
  eq(dead, 0, '点不开的链接数');
  return `${n} 个链接全部点得开`;
});

console.log('\n══ 世系树 ══\n');

t('承健的树：27 代、两条线', () => {
  const tr = buildTree(idx, me.pid, undefined, PS);
  eq(tr.rows.length, 27, '代数');
  eq(tr.single, false, '是否单线');
  eq(tr.rows[0].gen, 27, '第一行世次（你在最上面）');
  eq(tr.rows[26].gen, 1, '最后一行世次（始祖在最下面）');
  const two = tr.rows.filter(r => r.cells.length === 2);
  eq(two.length, 7, '并排两列的代数');
  return `第 ${tr.splitGen} 世分开，第 ${tr.joinGen} 世合回，并排 ${two.length} 代`;
});

t('没过继的人只有一条线', () => {
  const p = D.people.find(q => q.gen === 20 && q.parent_edges.length === 1);
  const tr = buildTree(idx, p.pid, undefined, PS);
  eq(tr.single, true, '是否单线');
  eq(tr.rows.every(r => r.cells.length === 1), true, '每行只有一格');
  return `${p.name} ${tr.rows.length} 代，一条线`;
});

t('随机 30 个人都能建出树', () => {
  let bad = 0;
  for (let i = 0; i < D.people.length; i += Math.floor(D.people.length / 30)) {
    const tr = buildTree(idx, D.people[i].pid, undefined, PS);
    if (!tr.rows.length) bad++;
    if (tr.rows.some(r => !r.cells.length)) bad++;
  }
  eq(bad, 0, '建不出树的人数');
  return '30 个都行';
});

console.log('\n══ 关系计算器 ══\n');

t('算「我和我父亲」——直系，该直接给称呼', () => {
  const dad = idx.get(me.parent_edges[0].parent);
  const k = kinship(idx, me.pid, dad.pid, R.parents);
  if (!k) throw new Error('算不出');
  if (!k.directTerm) throw new Error('直系没给称呼');
  eq(k.genDiff, 1, '辈分差');
  return `${me.name} 叫 ${dad.name} ——「${k.directTerm}」`;
});

t('算「我和我爷爷」', () => {
  const dad = idx.get(me.parent_edges[0].parent);
  const gp = idx.get(dad.parent_edges[0].parent);
  const k = kinship(idx, me.pid, gp.pid, R.parents);
  if (!k?.directTerm) throw new Error('算不出');
  return `${me.name} 叫 ${gp.name} ——「${k.directTerm}」`;
});

t('算两个远房——该找出共同祖先', () => {
  const a = D.people.find(p => p.gen === 25 && p.src.section.includes('朝阳'));
  const b = D.people.find(p => p.gen === 25 && p.src.section.includes('朝寿'));
  const k = kinship(idx, a.pid, b.pid, R.parents);
  if (!k) throw new Error('算不出');
  if (!k.commons?.length) throw new Error('找不到共同祖先');
  const s = describe(k, k.commons[0]);
  if (!s.fact || !s.call) throw new Error('描述不完整');
  return `${a.name} ↔ ${b.name}：${s.call}（共祖 ${k.commons[0].name}）`;
});

t('随机 20 对都能算', () => {
  let bad = 0;
  const step = Math.floor(D.people.length / 20);
  for (let i = 0; i + step < D.people.length; i += step) {
    const k = kinship(idx, D.people[i].pid, D.people[i + step].pid, R.parents);
    if (!k) { bad++; continue; }
    if (!k.directTerm && !k.commons?.length && !k.note) bad++;
  }
  eq(bad, 0, '算不出的对数');
  return '20 对都有结果';
});

console.log('\n══ 事迹与今译 ══\n');

t('有今译的事迹能点开、原文一字不动', () => {
  const withCn = D.passages.filter(x => x.cn);
  gt(withCn.length, 30, '有译文的段数');
  for (const x of withCn) {
    const e = R.build.passage(x.id);
    if (!e) throw new Error(`${x.id} 建不出`);
    if (!e.paras?.length) throw new Error(`${x.id} 没有对照段`);
    if (e.paras[0].src !== x.text) throw new Error(`${x.id} 原文被改了`);
  }
  return `${withCn.length} 段，原文全部一字不动`;
});

t('事迹里标出的人都点得开', () => {
  let n = 0;
  for (const x of D.passages) {
    for (const en of x.ents ?? []) {
      for (const tg of en.targets) {
        if (!tg.pid) continue;
        n++;
        if (!R.build.person(tg.pid)) throw new Error(`${x.id} 的 ${tg.pid} 点不开`);
      }
    }
  }
  return `${n} 处全部点得开`;
});

t('作者认得出的，他名片上有「他写的文字」', () => {
  const signed = D.passages.filter(x => x.author?.targets?.some(v => v.strong));
  gt(signed.length, 5, '有作者的段数');
  const pid = signed[0].author.targets.find(v => v.strong).pid;
  const e = R.build.person(pid);
  const r = e.relations.find(v => v.heading === '他写的文字');
  if (!r) throw new Error(`${e.title} 名片上没有「他写的文字」`);
  return `${e.title} 写了 ${r.items.length} 篇`;
});

console.log('\n══ 疑点清单 ══\n');

t('疑点清单每条都点得回原文', () => {
  // 清单是判定层现算的，不再有 data/doubts.json 这份预生成文件
  const doubts = doubtList(R, J('revisions')).buckets;
  let n = 0;
  for (const [k, list] of Object.entries(doubts)) {
    for (const x of list) {
      if (!x.pid) continue;
      n++;
      if (!R.build.person(x.pid)) throw new Error(`${k} 的 ${x.pid} 点不开`);
      for (const c of x.cands ?? []) {
        if (!R.build.person(c.pid)) throw new Error(`${k} 的候选 ${c.pid} 点不开`);
      }
    }
  }
  return `${n} 条`;
});

console.log(`\n${'═'.repeat(50)}`);
console.log(fail === 0 ? `冒烟测试全过（${pass} 项）` : `**${fail} 项没过**，通过 ${pass} 项`);
process.exit(fail ? 1 : 0);
