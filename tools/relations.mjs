/**
 * **人际关系表：一个人的所有关系，全部写进 json，每一条都带对方的 id。**
 *
 * ═══ 为什么要有这一层 ═══
 *
 * 卡片上有 14 类关系，而 `people.json` 里只存了 3 类（父边、子边、过继）。
 * 其余 11 类——兄弟姐妹、妻、夫、同一个人、参与修谱、写序、被提到——
 * 全是**画卡片的时候现 JOIN 出来的**。
 *
 * 用户的原话（2026-09-05）：
 *
 * > 咱不是说过卡片也不现算吗？一个人的所有人际关系都应该在 json 文件里，
 * > **category 的穷举就是应该包含所有可能。而且每个人际关系都有 id。**
 *
 * 现算的坏处不是慢，是**算的人不止一处**：卡片的兄弟姐妹栏算一遍、
 * 关系计算器算一遍、世系树算一遍，一处口径不一样就出两个答案，
 * 而看的人分不出哪个是真的。
 *
 * ═══ 规矩 ═══
 *
 * 1. **穷举**：卡片上出现过的每一类关系，这里都要有一类。
 * 2. **双向**：A 记了，B 也要记（对称的类自反，成对的类各记各的那一头）。
 * 3. **带 id**：`对方` 永远是 pid（人）／届次（修谱）／段 id（文字）。
 * 4. **判定不在这里**：这一步只做外键 JOIN，不做任何名字匹配。
 *    判定已经在 `resolve.ts` 做完并写成 pid 了。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
import { canonical, sameAs } from '../src/core/seealso.ts';

const U = n => new URL(`../data/${n}.json`, import.meta.url);
const J = n => JSON.parse(readFileSync(U(n), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
loadTables(D.tables);
const R = makeRegistry(D);

const byPid = new Map(D.people.map(p => [p.pid, p]));
const CAN = pid => { const q = byPid.get(pid); return q ? canonical(D.people, q).pid : pid; };

// ══ 全部清空，从头建 ══
for (const p of D.people) {
  delete p.relations;
  for (const k of p.kin ?? []) delete k.relations;
}

const add = (pid, row) => {
  const p = byPid.get(pid);
  if (!p) return false;
  (p.relations ??= []).push(row);
  return true;
};
/** 人对人的一条，两头各记各的那一头 */
const pair = (a, b, 类a, 类b, extra = {}) => {
  const A = byPid.get(a), B = byPid.get(b);
  if (!A || !B) return;
  add(a, { 类: 类a, 对方类型: '人', 对方: b, 对方名: B.name, 对方出处: B.src_human, ...extra });
  add(b, { 类: 类b, 对方类型: '人', 对方: a, 对方名: A.name, 对方出处: A.src_human, ...extra });
};

let n = { 父: 0, 子女: 0, 兄弟姐妹: 0, 配偶: 0, 同一个人: 0, 参与修谱: 0, 写序: 0, 被提到: 0 };

// ══ ① 父 ⟷ 子女 ══ 已经是双向的（parent_edges / children），这里只是搬进统一的表
for (const p of D.people) {
  for (const e of p.parent_edges ?? []) {
    const f = byPid.get(e.parent); if (!f) continue;
    add(p.pid, { 类: e.kind, 对方类型: '人', 对方: e.parent, 对方名: f.name,
      对方出处: f.src_human, 判到哪一级: e.level, 凭什么: e.why });
    n.父++;
  }
  for (const c of p.children ?? []) {
    const q = byPid.get(c.child); if (!q) continue;
    add(p.pid, { 类: c.kind === '嗣父' ? '嗣子' : '子', 对方类型: '人', 对方: c.child,
      对方名: q.name, 对方出处: q.src_human, 判到哪一级: c.level, 凭什么: c.why });
    n.子女++;
  }
}

// ══ ①b 附记之人（女儿、无条目的子）也是他的孩子 ══
//    他们没有自己那一行（装载时由 kin materialize，见 persons.ts），
//    但**有自己的 id**。不算进来，兄弟姐妹就会漏人——
//    开发的兄弟只列出开响，而谱写着「开发　开启（幼殁）」。
const KIDS = new Map();          // 父 pid → [孩子 pid]（含附记之人）
for (const p of D.people) {
  const list = [...new Set((p.children ?? []).map(c => CAN(c.child)))].filter(x => byPid.has(x));
  for (const k of p.kin ?? []) {
    if (k.role === '妻') continue;
    const kid = k.person || k.at;
    // ★ 名单槽已经认到本人条目的儿子，**不再造一个附记之人**——
    //   造了就成了一人两 id，兄弟姐妹里会出现他自己。
    //   判定层（persons.ts::materialize）认了哪些槽，R.idx 就是答案：
    //   materialize 跳过的槽，它的 pid 根本不在 idx 里。
    if (!R.idx.has(kid) || byPid.has(kid) || list.includes(kid)) continue;
    list.push(kid);
    add(p.pid, { 类: k.role === '女' ? '女' : '子', 对方类型: '人', 对方: kid,
      对方名: (k.given || k.name_raw || '').replace(/[s　]/g, '')
        || (k.ordinal ? k.ordinal + k.role : k.role),
      对方出处: p.src_human, 谱写的: (k.ordinal ?? '') + (k.name_raw ?? ''),
      注: '附记之人：谱把他/她写在他这一条的名单里，装载时 materialize（persons.ts）' });
    n.子女++;
  }
  KIDS.set(p.pid, list);
}

// ══ ② 兄弟姐妹 ══ 父亲的孩子，去掉自己。纯 id 配对，不碰名字。
//    过继的人有两个父亲，就有两拨兄弟姐妹，各自标明从谁那边论——凡例本来就要求双记。
{
  const seen = new Set();
  for (const f of D.people) {
    const kids = KIDS.get(f.pid) ?? [];
    for (const a of kids) for (const b of kids) {
      if (a === b) continue;
      const k = a + '|' + b + '|' + f.pid;
      if (seen.has(k)) continue; seen.add(k);
      const B = byPid.get(b);
      const kb = B ? null : (f.kin ?? []).find(k => (k.person || k.at) === b);
      const nameB = B ? B.name
        : ((kb?.given || kb?.name_raw || '').replace(/[s　]/g, '')
           || ((kb?.ordinal ?? '') + (kb?.role ?? '')) || '?');
      const kind = (f.children ?? []).find(c => CAN(c.child) === a)?.kind ?? '生父';
      const row = { 类: '兄弟姐妹', 对方类型: '人', 对方: b, 对方名: nameB,
        对方出处: B ? B.src_human : f.src_human,
        从谁那边论: f.pid, 那位是: f.name, 那边是: kind };
      // a 有自己那一行就记在他行上；没有（附记之人）就记在他所在的 kin 槽上
      if (!add(a, row)) {
        const ka = (f.kin ?? []).find(k => (k.person || k.at) === a);
        if (ka) ((ka.relations ??= []).push(row));
      }
      n.兄弟姐妹++;
    }
  }
}

// ══ ③ 妻 ⟷ 夫 ══ 附记之人没有自己那一行，她的 id 在丈夫的 kin 里
for (const p of D.people) {
  for (const k of p.kin ?? []) {
    if (k.role !== '妻') continue;
    const 类 = (k.rel_raw ?? '').includes('侧室') ? '侧室' : k.rel_raw === '聘' ? '聘' : '妻';
    add(p.pid, { 类, 对方类型: '人', 对方: k.person || k.at,
      对方名: (k.name_raw || '').replace(/[\s　]/g, '') || (k.surname ? k.surname + '氏' : '氏'),
      对方出处: p.src_human, 谱写的: k.rel_raw,
      注: '附记之人：谱把她写在他这一条里，装载时 materialize（persons.ts）' });
    n.配偶++;
  }
}

// ══ ④ 同一个人（兼祧双记）══ 对称
for (const p of D.people) {
  for (const q of sameAs(D.people, p)) {
    add(p.pid, { 类: '同一个人', 对方类型: '人', 对方: q.pid, 对方名: q.name,
      对方出处: q.src_human, 完整条: CAN(p.pid),
      凭什么: '谱把同一个人印了几条（兼祧／详前／详后），凡例第十三则要求双记' });
    n.同一个人++;
  }
}

// ══ ⑤ 参与修谱 ══ 名目 → 人（revisions.json 已带 pid，这里挂到人身上）
for (const r of D.revisions) {
  for (const m of r.members ?? []) {
    if (!m.pid) continue;
    if (add(CAN(m.pid), { 类: '参与修谱', 对方类型: '届', 对方: r.era, 对方名: r.era + ' 那一届',
      名目原话: m.raw, 担的是: m.role || '' })) n.参与修谱++;
  }
}

// ══ ⑥ 写序 ══
{
  const pres = Array.isArray(D.prefaces) ? D.prefaces
    : (D.prefaces.篇 ?? Object.values(D.prefaces).find(Array.isArray) ?? []);
  for (const x of pres) {
    if (!x.author_pid) continue;
    if (add(CAN(x.author_pid), { 类: '写序', 对方类型: '篇', 对方: x.id ?? x.title ?? x.era,
      对方名: x.title ?? x.era, 署名: x.author })) n.写序++;
  }
}

// ══ ⑦ 别人的文字里提到他 ⟷ 他这一条里的文字 ══
for (const seg of D.passages ?? []) {
  const host = seg.host && CAN(seg.host);
  for (const e of seg.ents ?? []) for (const t of e.targets ?? []) {
    if (!t.pid) continue;
    const who = CAN(t.pid);
    if (who === host) continue;
    if (add(who, { 类: '被提到', 对方类型: '段', 对方: seg.id,
      对方名: (seg.text ?? '').replace(/[\s　]/g, '').slice(0, 20),
      写在谁那一条: host ?? '', 谱写作: e.text ?? '', 怎么对上的: t.note ?? '' })) n.被提到++;
  }
}

// 同一类、同一个对方、同一处出处只留一条
for (const p of D.people) {
  const dedup = xs => { const seen = new Set();
    return (xs ?? []).filter(r => { const k = [r.类, r.对方, r.从谁那边论 ?? ''].join('|');
      return !seen.has(k) && seen.add(k); }); };
  if (p.relations) p.relations = dedup(p.relations);
  for (const k of p.kin ?? []) if (k.relations) k.relations = dedup(k.relations);
}

// 排一下序：按类、再按谱面坐标
const ORD = ['生父', '嗣父', '子', '嗣子', '兄弟姐妹', '妻', '侧室', '聘',
             '同一个人', '参与修谱', '写序', '被提到'];
for (const p of D.people) {
  if (!p.relations) continue;
  p.relations.sort((a, b) => {
    const d = ORD.indexOf(a.类) - ORD.indexOf(b.类); if (d) return d;
    const qa = byPid.get(a.对方)?.src, qb = byPid.get(b.对方)?.src;
    if (!qa || !qb) return 0;
    return (qa.page - qb.page) || (qa.row - qb.row) || (qa.col - qb.col);
  });
}

writeFileSync(U('people'), JSON.stringify(D.people, null, 1), 'utf8');
const tot = D.people.reduce((s, p) => s + (p.relations?.length ?? 0), 0);
console.log(`人际关系表写回 ${D.people.length} 人 —— 共 ${tot} 条，每一条都带对方的 id`);
for (const [k, v] of Object.entries(n)) console.log(`   ${k.padEnd(6)} ${v}`);
