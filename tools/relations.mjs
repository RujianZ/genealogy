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
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'),
  // ★ 这个脚本**就是 data/分类.json 的生产者**，所以它得能在文件还不存在时跑起来。
  //   别处一律必填（Data.classes），不许兜底——只有生产者自己例外，
  //   否则第一次生成就成了鸡生蛋。
  classes: (() => { try { return J('分类'); }
    catch { return { 房支: {}, 世次: {}, 头衔: {}, 标记: {} }; } })() };
loadTables(D.tables);
const R = makeRegistry(D);

const byPid = new Map(D.people.map(p => [p.pid, p]));
/** 每一类关系印在卡片的哪一栏——撞脸要按栏算，不是按类算 */
const COLUMN = { 子: '子女', 女: '子女', 嗣子: '子女', 生父: '父', 嗣父: '父' };
/** pid 末尾的源行号——同页同行印了几条时，用它排出谱面先后 */
const srcSeq = pid => Number(String(pid).match(/L(\d+)/)?.[1] ?? 0);
const CAN = pid => { const q = byPid.get(pid); return q ? canonical(D.people, q).pid : pid; };

// ══ 全部清空，从头建 ══
for (const p of D.people) {
  delete p.relations;
  for (const k of p.kin ?? []) delete k.relations;
}

/** kin 槽的索引：附记之人的 pid → 记到他的那个槽（他在 people.json 里没有自己那一行） */
const KINSLOT = new Map();
for (const p of D.people) for (const k of p.kin ?? []) {
  const id = k.person || k.at;
  if (id && !byPid.has(id)) KINSLOT.set(id, { host: p, k });
}
/**
 * 写一条关系到某个人身上。
 * ★ 有条目的人写在他自己那一行；**附记之人写在「记到他的那个 kin 槽」上**
 *   （他在 people.json 里没有自己那一行，装载时才 materialize）。
 *   两种人一样有 id、一样有关系表，下游一律不必区分。
 */
const add = (pid, row) => {
  const p = byPid.get(pid);
  if (p) { (p.relations ??= []).push(row); return true; }
  const slot = KINSLOT.get(pid);
  if (slot) { (slot.k.relations ??= []).push(row); return true; }
  return false;
};
/** 人对人的一条，两头各记各的那一头 */
const pair = (a, b, 类a, 类b, extra = {}) => {
  const A = byPid.get(a), B = byPid.get(b);
  if (!A || !B) return;
  add(a, { 类: 类a, 对方类型: '人', 对方: b, 对方名: B.name, 对方出处: B.src_human, ...extra });
  add(b, { 类: 类b, 对方类型: '人', 对方: a, 对方名: A.name, 对方出处: A.src_human, ...extra });
};

let n = { 父: 0, 子女: 0, 兄弟姐妹: 0, 配偶: 0, 同一个人: 0, 参与修谱: 0, 写序: 0, 文字: 0, 被提到: 0 };

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
      对方名: (k.given || k.name_raw || '').replace(/[\s　]/g, '')
        || (k.ordinal ? k.ordinal + k.role : k.role),
      对方出处: p.src_human, 谱写的: (k.ordinal ?? '') + (k.name_raw ?? ''),
      注: '附记之人：谱把他/她写在他这一条的名单里，装载时 materialize（persons.ts）' });
    n.子女++;
  }
  KIDS.set(p.pid, list);
}

// ══ ①c 附记之人那一头：父 ／ 夫 ══
//    谱把他们写在谁那一条里，谁就是——**那是外键，不是判断**。
//    这几条写在 kin 槽上（他们没有自己那一行），装载时随人搬过去。
for (const p of D.people) {
  for (const k of p.kin ?? []) {
    const id = k.person || k.at;
    if (!id || byPid.has(id) || !R.idx.has(id)) continue;
    if (k.role === '妻') {
      add(id, { 类: '夫', 对方类型: '人', 对方: p.pid, 对方名: p.name,
        对方出处: p.src_human, 谱写的: k.rel_raw, 凭什么: '谱把她写在他那一条里' });
      n.配偶++;
    } else {
      add(id, { 类: '生父', 对方类型: '人', 对方: p.pid, 对方名: p.name,
        对方出处: p.src_human, 判到哪一级: '原话',
        凭什么: `谱把他/她写在${p.name}那一条的名单里` });
      n.父++;
    }
  }
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
        : ((kb?.given || kb?.name_raw || '').replace(/[\s　]/g, '')
           || ((kb?.ordinal ?? '') + (kb?.role ?? '')) || '?');
      const kind = (f.children ?? []).find(c => CAN(c.child) === a)?.kind ?? '生父';
      const row = { 类: '兄弟姐妹', 对方类型: '人', 对方: b, 对方名: nameB,
        对方出处: B ? B.src_human : f.src_human,
        从谁那边论: f.pid, 那位是: f.name, 那边是: kind };
      // add() 自己会挑：有条目的写在他那一行，附记之人写在他的 kin 槽上
      add(a, row);
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

// ══ ⑦ 人 ⟷ 文字：他这一条里的 · 他写的 · 别人的文字里提到他 ══
//    这三类的对方不是人，是**段**（prose_ents 的 id）。一样要写进 json——
//    卡片里 byPassageHost／byAuthor／byEntTarget 三个现建的索引就是为它们，
//    留着就是「画卡片时算」。
for (const seg of D.passages ?? []) {
  const host = seg.host && CAN(seg.host);
  const label = (seg.flat ?? seg.text ?? '').replace(/[s　]/g, '');
  const base = { 对方类型: '段', 对方: seg.id, 对方名: label.slice(0, 24),
    字数: seg.chars ?? label.length,
    分类: (seg.kinds ?? []).filter(k => k !== '未分类').join('・'),
    有今译: !!seg.cn };
  // 他这一条里的文字
  if (host && add(host, { ...base, 类: '他这一条里的文字',
    写的是: seg.about2 && !String(seg.about2.who).startsWith('本人') ? seg.about2.who : '' }))
    n.文字++;
  // 他写的文字——谱上署了他的名。**只认强命中**（抽取那一步定死的）
  for (const t of (seg.author?.targets ?? []).filter(t => t.strong && t.pid)) {
    if (add(CAN(t.pid), { ...base, 类: '他写的文字',
      写给谁: seg.host_name ?? '', 写给谁的id: host ?? '',
      署名: `${seg.author.rel ?? ''}${seg.author.name ?? ''}${seg.author.verb ?? ''}`,
      写给谁的世次: seg.gen ?? null })) n.文字++;
  }
}

// ══ ⑧ 别人的文字里提到他 ══
for (const seg of D.passages ?? []) {
  const host = seg.host && CAN(seg.host);
  for (const e of seg.ents ?? []) for (const t of e.targets ?? []) {
    if (!t.pid) continue;
    const who = CAN(t.pid);
    if (who === host) continue;
    if (add(who, { 类: '被提到', 对方类型: '段', 对方: seg.id,
      对方名: (seg.text ?? '').replace(/[\s　]/g, '').slice(0, 20),
      写在谁那一条: host ?? '', 写在谁那一条的名: seg.host_name ?? '',
      谱写作: e.text ?? '', 怎么对上的: t.note ?? '',
      // 这个名字在谱里不止一位时，抽取那一步就把候选都留着了——照实说
      同名候选几位: (e.targets ?? []).length })) n.被提到++;
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

// ══ 同一个对方、两种关系 → 合成一条 ══
//    光灼的壁银既是亲生子、又（兼祧）是嗣子，children 里本来就是两条边——
//    那是对的数据（samepid 闸专门允许「承本身」）。但**子女栏不该列两遍**。
//    合在数据层做，卡片只照着印。
for (const p of D.people) {
  if (!p.relations) continue;
  const KID = new Set(['子', '女', '嗣子']);
  const first = new Map();
  p.relations = p.relations.filter(r => {
    if (!KID.has(r['类'])) return true;
    const k = r['对方'];
    const had = first.get(k);
    if (!had) { first.set(k, r); return true; }
    // 「子」压「嗣子」：谱名那一档在前，另一档写进「又是」
    if (had['类'] === '嗣子' && r['类'] !== '嗣子') { had['又是'] = '嗣子'; had['类'] = r['类']; }
    else had['又是'] = r['类'];
    return false;
  });
}

// ══ 同一栏里会显示成一样的，写明怎么分辨 ══
//    谱写「女二　適商　适商」——**真的是两个女儿**，都嫁商家，一个繁一个简。
//    卡片上她们长得一模一样是谱的实情，不是 bug；可读的人得分得开。
//    分辨用什么，**在这里定死写进 json**，卡片不许自己想办法。
for (const p of D.people) {
  const fix = xs => {
    if (!xs) return;
    const grp = new Map();
    for (const r of xs) {
      // ★ 按**卡片实际会显示的那个名字**分组，不是按谱写的原样。
      //   谱写「女二　適商　适商」，一繁一简，原样是两个不同的字符串；
      //   可卡片显示的是归一化后的名字，两个都是「适商」——读的人分不开。
      //   分辨要不要写，得看显示出来一不一样。
      const shown = R.idx.get(r['对方'])?.name ?? r['对方名'] ?? '';
      // ★ 按**卡片上会落进哪一栏**分组，不是按 `类`——
      //   子／女／嗣子三类都印在「子女」那一栏里，分开算就漏掉了跨类的撞脸。
      const k = COLUMN[r['类']] ?? r['类'];
      const key = k + '|' + String(shown);
      (grp.get(key) ?? grp.set(key, []).get(key)).push(r);
    }
    for (const [, rows] of grp) {
      if (rows.length < 2) continue;
      // ① 出处不同就用出处
      if (new Set(rows.map(r => r['对方出处'])).size === rows.length) {
        for (const r of rows) r['分辨'] = String(r['对方出处'] ?? '');
        continue;
      }
      // ② 出处也一样（同页同行印了几条）→ 按谱面源行号排，说清是第几条
      rows.sort((a, b) => srcSeq(a['对方']) - srcSeq(b['对方']));
      rows.forEach((r, i) => {
        r['分辨'] = `${r['对方出处']}　谱上这一行的第 ${i + 1} 条`;
      });
    }
  };
  fix(p.relations);
  for (const k of p.kin ?? []) fix(k.relations);
}

// ══════════════════════════════════════════════════════════════════
// 分类表：房支 · 世次 · 头衔 · 标记
//
// 卡片的「所属」栏要写「学义公世系（267 人）」，房支页／世次页要列出成员——
// 原先这四样是 `entries.ts` 在建注册表时 `group()` 现分出来的。
// **那也是画卡片时算。** 搬进 data/分类.json，卡片按 key 查表。
//
// 成员名单覆盖全部 5,050 人（含附记之人）——和原先 group(d.people) 同一个口径。
// ══════════════════════════════════════════════════════════════════
{
  const ALL = [...R.idx.values()];
  const mk = (keyOf) => {
    const m = new Map();
    for (const q of ALL) for (const k of keyOf(q)) {
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)).push(q);
    }
    return m;
  };
  const NSk = x => String(x ?? '').replace(/[s　]/g, '');
  const 房支 = mk(q => [q.src?.section]);
  const 世次 = mk(q => [String(q.gen)]);
  const 头衔 = mk(q => (q.titles ?? []).map(NSk));
  const 标记 = mk(q => (q.marks ?? []).map(x => NSk(x.tag)));
  const 成员 = ps => ps.map(q => q.pid);
  const out = {
    说明: '房支 / 世次 / 头衔 / 标记四张分类表。由 tools/relations.mjs 生成，勿手改。'
      + '卡片的「所属」栏和这四类的列表页一律**按 key 查这里**，不在渲染时 group()。'
      + '成员覆盖全部 5,050 人（含附记之人），跟原先 entries.ts 里 group(d.people) 同口径。',
    房支: {}, 世次: {}, 头衔: {}, 标记: {},
  };
  for (const [k, ps] of 房支) {
    const pages = ps.map(q => q.src?.page).filter(x => x != null);
    out.房支[k] = { 名: k, 人数: ps.length, 成员: 成员(ps),
      册卷: [...new Set(ps.map(q => `${q.src?.vol}·卷${q.src?.juan}`))],
      页码: pages.length ? [Math.min(...pages), Math.max(...pages)] : null };
  }
  for (const [k, ps] of 世次) {
    const bs = [...new Set(ps.map(q => q.src?.section).filter(Boolean))];
    out.世次[k] = { 名: `第 ${k} 世`, 人数: ps.length, 成员: 成员(ps),
      分布: bs.map(b => ({ 房支: b, 人数: ps.filter(q => q.src?.section === b).length })) };
  }
  for (const [k, ps] of 头衔) out.头衔[k] = { 名: k, 人数: ps.length, 成员: 成员(ps) };
  for (const [k, ps] of 标记) out.标记[k] = { 名: k, 人数: ps.length, 成员: 成员(ps) };
  writeFileSync(U('分类'), JSON.stringify(out, null, 1), 'utf8');
  console.log(`分类表写出 data/分类.json —— 房支 ${房支.size} · 世次 ${世次.size}`
    + ` · 头衔 ${头衔.size} · 标记 ${标记.size}（成员覆盖 ${ALL.length} 人）`);
}

// 排一下序：按类、再按谱面坐标
const ORD = ['生父', '嗣父', '子', '女', '嗣子', '兄弟姐妹', '妻', '侧室', '聘', '夫',
             '同一个人', '他这一条里的文字', '他写的文字', '参与修谱', '写序', '被提到'];
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
const tot = D.people.reduce((s, p) => s + (p.relations?.length ?? 0)
  + (p.kin ?? []).reduce((t, k) => t + (k.relations?.length ?? 0), 0), 0);
const nkin = D.people.reduce((s, p) =>
  s + (p.kin ?? []).filter(k => k.relations?.length).length, 0);
console.log(`人际关系表写回 ${D.people.length} 人 ＋ ${nkin} 位附记之人`
  + ` —— 共 ${tot} 条，每一条都带对方的 id`);
for (const [k, v] of Object.entries(n)) console.log(`   ${k.padEnd(6)} ${v}`);
