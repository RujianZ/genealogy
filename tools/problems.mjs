/** 现在还剩哪些问题——一条一条数清楚，每条给一个例子。 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, canFather } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { isFragment } from '../src/core/fragment.ts';
import { isSeeAlso } from '../src/core/seealso.ts';
import { lines } from '../src/core/grammar.ts';
import { agesOf } from '../src/core/owner.ts';
import { continued } from '../src/core/continued.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const refs = J('referenced');
const places = J('places');
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const short = s => (s ?? '').split('·').slice(1).join('·');
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const ok生父 = p => C.get(p.pid).filter(c => c.status === 'ok' && c.edge.kind === '生父');
const real = people.filter(p => !isFragment(p));

const say = (n, title, ex) => {
  console.log(`\n${n}　${title}`);
  for (const e of ex.slice(0, 3)) console.log(`     ${e}`);
};

console.log('══════ 一、谱本身说不清（不可解） ══════');

// 1 说不清是哪个父亲
{
  const bad = [];
  for (const p of real) {
    const by = new Map();
    for (const c of C.get(p.pid)) {
      if (c.status !== 'ok') continue;
      if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
      by.get(c.edge.kind).push(c);
    }
    for (const [k, cs] of by) if (cs.length > 1) { bad.push({ p, k, cs }); break; }
  }
  say(`${bad.length} 人`, '说不清是哪个父亲', bad.slice(0, 3).map(x =>
    `${x.p.name}（第${x.p.gen}世 ${short(x.p.src_human)}）${x.k} ${x.cs.length} 个：`
    + x.cs.map(c => `${c.person?.name}（${short(c.person?.src_human)}）`).join('／')));
}
// 2 年代兜不拢
{
  const bad = real.filter(p => C.get(p.pid).some(c => c.conflict));
  say(`${bad.length} 人`, '谱两边都写明了，年代却兜不拢（保留并标出，不删）', bad.slice(0, 3).map(p => {
    const c = C.get(p.pid).find(x => x.conflict);
    return `${p.name}（第${p.gen}世 ${short(p.src_human)}）← ${c.person?.name}　${c.conflict}`;
  }));
}
// 3 往上走不动
{
  const bad = real.filter(p => p.gen > 1 && !ok生父(p).length);
  const noEdge = bad.filter(p => !p.parent_edges.length);
  const heir = bad.filter(p => p.parent_edges.length && p.parent_edges.every(e => e.kind !== '生父'));
  const ruled = bad.filter(p => p.parent_edges.some(e => e.kind === '生父'));
  say(`${bad.length} 人`, '往上走不动', [
    `谱上根本没写父亲、也没人点他的名：${noEdge.length} 人　例：`
      + noEdge.slice(0, 2).map(p => `${p.name}(第${p.gen}世 ${short(p.src_human)})`).join('、'),
    `只有嗣父没有生父：${heir.length} 人　例：`
      + heir.slice(0, 2).map(p => `${p.name}(第${p.gen}世)`).join('、'),
    `有生父边但全被判据排掉：${ruled.length} 人　例：`
      + ruled.slice(0, 2).map(p => `${p.name}(第${p.gen}世)`).join('、'),
  ]);
}

console.log('\n══════ 二、上游解析的残留（可解，没解） ══════');

// 4 假人还能被搜到
{
  const frag = people.filter(isFragment);
  say(`${frag.length} 条`, '解析残渣当成了人——**判断层挡住了，显示层没挡**',
    [`搜索里还搜得到，世次人数统计还把它们算进去`,
     ...frag.slice(0, 2).map(p => `「${p.name}」${short(p.src_human)}　原文只有：${NS(p.raw_text).slice(0, 26)}`)]);
}
// 5 不是人名的 ref
{
  const bad = refs.filter(r => (r.role === '女' || r.role.startsWith('子'))
    && /[殁卒葬迁徙]|[于於]|^公|^妣|^也$/.test(NS(r.name_raw)));
  say(`${bad.length} 条`, '不是人名，却在 referenced 里登记成了人——子女栏已不显示，但搜索还搜得到',
    bad.slice(0, 3).map(r => `${r.host_name} 之${r.role[0]}「${r.name_raw}」`));
}
// 6 女儿 id 还没发够
{
  const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
  const byHost = new Map();
  for (const r of refs) (byHost.get(r.host) ?? byHost.set(r.host, []).get(r.host)).push(r);
  const bad = [];
  for (const p of real) {
    const said = [...NS(p.raw_text).matchAll(/(?:生?女)([一二三四五六七八九十两])/g)]
      .reduce((a, m) => a + (NUM[m[1]] ?? 0), 0);
    const got = (byHost.get(p.pid) ?? []).filter(r => r.role === '女').length;
    if (said > got) bad.push({ p, said, got });
  }
  say(`${bad.length} 人`, `女儿的 id 还没发够（共少 ${bad.reduce((a, b) => a + b.said - b.got, 0)} 个）`,
    bad.slice(0, 3).map(x => `${x.p.name}（${short(x.p.src_human)}）谱写女 ${x.said}，发了 ${x.got}`));
}
// 7 原文还有行没交代
{
  const byOwner = new Map();
  for (const b of places) (byOwner.get(b.owner) ?? byOwner.set(b.owner, []).get(b.owner)).push(b);
  const stored = p => {
    const out = [];
    const add = s => { const t = NS(s); if (t) out.push(t); };
    add(p.name_raw || p.name);
    add((p.father_name ?? '') + (p.filiation ?? ''));
    add((p.father_name ?? '') + '公' + (p.filiation ?? ''));
    for (const k of ['zi', 'hui', 'hao', 'ming', 'birth', 'death', 'burial', 'age'])
      for (const part of (p[k]?.text ?? '').split('｜')) add(part);
    for (const t of p.titles ?? []) add(t);
    for (const m of p.marks ?? []) { add(m.tag); add(m.text); }
    for (const s of p.spouses ?? []) {
      add((s.rel ?? '') + (s.name_raw ?? '')); add(s.name_raw);
      for (const k of ['birth', 'death', 'burial'])
        for (const part of (s[k]?.text ?? '').split('｜')) add(part);
    }
    for (const s of p.sons_claimed ?? []) add(s);
    for (const s of p.daughters_claimed ?? []) add(s);
    for (const u of p.unparsed ?? []) add(u.text);
    for (const b of byOwner.get(p.pid) ?? []) add(b.text);
    for (const a of agesOf(p)) add(a.text);
    const c = continued(p);
    if (c) { add(c.birthText); add(c.tail.text); for (const s2 of c.stray) add(s2); }
    return out;
  };
  const bad = [];
  for (const p of real) {
    const has = stored(p);
    const lost = lines(p.raw_text)
      .filter(l => !['标签', '页码水印', '空', '名字'].includes(l.kind))
      .filter(l => { const t = NS(l.text); return !has.some(s => s.includes(t) || t.includes(s)); });
    if (lost.length) bad.push({ p, lost });
  }
  say(`${bad.reduce((a, b) => a + b.lost.length, 0)} 行`,
    `原文里还有行没交代（涉及 ${bad.length} 人）`,
    bad.slice(0, 3).map(x => `${x.p.name}（${short(x.p.src_human)}）：`
      + x.lost.map(l => `[${l.kind}]${NS(l.text).slice(0, 20)}`).join('　')));
}

console.log('\n══════ 三、交叉检验对不上（已分类，未逐条查实） ══════');
{
  const heirOf = p => p.is_heir || /嗣|祧|承继/.test(p.filiation ?? '')
    || /嗣|祧/.test((p.raw_text ?? '').split('\n')[1] ?? '');
  const strip = s => norm(s ?? '').replace(/公$/, '');
  const settled = p => { const g = ok生父(p); return g.length === 1 ? g[0] : null; };
  const f列表 = [], f父名 = [], f排行 = [], f年代 = [];
  for (const p of real) {
    const c = settled(p); if (!c?.person) continue;
    const f = c.person;
    const sons = roster(f).sons.map(s => norm(s.name || s.raw));
    const me = [norm(p.name), ...p.aliases.map(a => norm(a.form))];
    const meS = me.map(strip);
    const i = sons.findIndex(s => me.includes(s)
      || meS.some(x => { const y = strip(s); return y && (y === x || y.endsWith(x) || x.endsWith(y)); }));
    if (sons.length && i < 0 && !heirOf(p)) f列表.push(`${p.name}（${short(p.src_human)}）→ ${f.name} 名单：${roster(f).sons.map(s => NS(s.raw)).join('、')}`);
    if (p.father_name && !heirOf(p)) {
      const w = strip(p.father_name);
      const forms = [strip(f.name), ...(f.aliases ?? []).map(a => strip(a.form))];
      if (!forms.some(x => x && w && (x === w || w.endsWith(x) || x.endsWith(w))))
        f父名.push(`${p.name}（${short(p.src_human)}）他写「${p.father_name}」，父亲那条名叫「${f.name}」`);
    }
    const ORD = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const t = norm(p.filiation ?? '');
    const o = !t ? null : t.startsWith('幼') ? -1 : (ORD[t[0]] ?? null);
    if (o != null && i >= 0) {
      const want = o === -1 ? sons.length : o;
      if (i + 1 !== want) f排行.push(`${p.name}（${short(p.src_human)}）谱写「${p.filiation}」该第 ${want}，实际第 ${i + 1}`);
    }
    const a = canFather(win.get(f.pid), win.get(p.pid));
    if (!a.ok) f年代.push(`${p.name}（${short(p.src_human)}）← ${f.name}　${a.text}`);
  }
  say(`${f列表.length} 条`, '父亲的生子名单里没有他（多半是谱上两处名字写法不同）', f列表);
  say(`${f父名.length} 条`, '他写的父名和父亲那条的名字对不上（多半是谱上写错了辈字或形近字）', f父名);
  say(`${f排行.length} 条`, '排行和名单里的位置对不上', f排行);
  say(`${f年代.length} 条`, '年代兜不拢', f年代);
}

console.log('\n══════ 四、结构性缺口 ══════');
{
  const seeAlso = people.filter(isSeeAlso);
  say(`${seeAlso.length} 条`, '一人两条：同一个人谱记了两遍（过继双记）——显示层已标出，数据层仍是两个人',
    seeAlso.slice(0, 3).map(p => `${p.name}（${short(p.src_human)}）「${NS(p.raw_text).slice(0, 24)}」`));
  const twins = [];
  for (const f of real) {
    const mine = childrenOf(people, f.pid).filter(k => !isFragment(k.child)
      && k.edge.kind === '生父' && ok生父(k.child).length === 1
      && ok生父(k.child)[0].edge === k.edge);
    const by = new Map();
    for (const k of mine) (by.get(norm(k.child.name)) ?? by.set(norm(k.child.name), []).get(norm(k.child.name))).push(k.child);
    for (const [, l] of by) if (l.length > 1) twins.push(`${f.name}（${short(f.src_human)}）名下有 ${l.length} 个「${l[0].name}」`);
  }
  say(`${twins.length} 处`, '同一个父亲名下有同名的儿子（多半就是上面那种「一人两条」）', twins);
  let noAge = 0;
  for (const p of real) if (agesOf(p).some(a => a.spouse != null)) noAge++;
  say(`${noAge} 人`, 'spouses 里没有「寿」这一格——显示层从原文读回来了，数据层还是没有', []);
}
