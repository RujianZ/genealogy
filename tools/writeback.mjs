/**
 * **把判定的答案写回每个人的 JSON。**
 *
 * ═══ 为什么要有这一步 ═══
 *
 * 谱不写 id，只写名字。壁嘉那一条写「长子继定出嗣胞弟**壁松**」，
 * 而全谱有三个壁松——解析层只能把三个全记下来（`parent_candidates`）。
 * 那不是答案，是题面。
 *
 * 答案要走三步才出来：
 *     壁嘉写「光邦公五子」          → 父亲是光邦
 *     光邦生子六：…壁嘉·壁松        → 「胞弟」＝同父、排他后面的那位
 *     → 只能是 P-册3-0026-4-0-L1082
 * 而「壁嘉的父亲是光邦」本身就是要建的那张图。鸡生蛋，所以必须两遍。
 *
 * 第二遍的结果原来**只活在内存里**：系统知道答案，文件里却写着三个候选。
 * 这一步把它写回去，`parent_edges` 每条指向**一个 pid**——外键，不是名字。
 *
 * ═══ 什么不动 ═══
 *
 * 谱写的「壁松」两个字照旧在 `father_name`、`name_raw`、`raw_text` 里，一字不改。
 * `parent_candidates` 也原样留着，谁想复核都能看见当初有几个候选。
 * 变的只有「引用」这一格。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { loadTables } from '../src/core/norm.ts';
import { canonical } from '../src/core/seealso.ts';
import { buildFacts } from '../src/core/facts.ts';
import { sameAs } from '../src/core/seealso.ts';
import { withBacklinks } from '../src/core/backlink.ts';
const U = n => new URL(`../data/${n}.json`, import.meta.url);
const J = n => JSON.parse(readFileSync(U(n), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const FACTS = buildFacts(withBacklinks(D.people), D.generations);

// ── 过继语句：做成**带 id 的一等记录** ─────────────────
//
// 谱写「次子启昌出嗣**朝阳**」——「朝阳」两个字不是身份。
// 以前只把这句话当文本存着（marks），谁要用谁去搜同名。
// 现在每一句都落成三个 pid：写在谁那一条、说的是谁、去处是谁。
// 定不下来的写 null 并说明为什么——**不留名字给下游去猜**。
const NSx = (x) => String(x ?? '').replace(/[\s　]+/g, '');
// ★ 「这一句立嗣语句最后落到谁头上了」——判定层已经定完，这里只查，不判。
//   谱的立嗣语句是按名字扭到每一个同世同名者头上的（facts.ts 的 ADOPT_IN），
//   继营那一句「立弟长子开国为嗣」同时落在八个开国身上。判定层的
//   oneStatementOneHeir 已经把它定给了自己题「继营嗣子」的那一位。
//   於是对其余七位来说，**那句话根本不是说他的**——不该再摆在他的卡片上，
//   更不该配一句「可能是异写，也可能这句说的是同名的另一位」。
const HEIR_TAKEN = new Map();       // 嗣父 pid → 认下他的那些人
for (const q of D.people) {
  for (const c of R.parents(q).heir) {
    const k = c.edge.parent;
    (HEIR_TAKEN.get(k) ?? HEIR_TAKEN.set(k, []).get(k)).push(q);
  }
}

/** 折回完整条——「详前」记载不是另一个人 */
const CANP = (pid) => {
  const q = D.people.find(x => x.pid === pid);
  return q ? canonical(D.people, q).pid : pid;
};
/** 语句里的称谓词——抽去处名字时要剥掉 */
const RELW = /(胞|亲|堂|嫡|从|房)?(长|次|三|四|五|六|七|八|九|十|幼|季|末)?(兄|弟|叔|伯|姪|侄|子)/g;
/** 句里写的去处**原样**是什么——只做展示，不参与判定 */
const destName = (said) => {
  for (const t of said.split(/出[嗣祠]|兼[祧挑]|承[祧挑]/).slice(1)) {
    const nm = NSx(t).replace(RELW, '').slice(0, 3);
    if (nm.length >= 2) return nm;
  }
  return '';
};

const adoptOf = (p) => {
  const ps = R.parents(p);
  const f = FACTS.get(p.pid);
  const heirs = ps.heir.map(c => ({ pid: c.edge.parent, name: R.idx.get(c.edge.parent)?.name ?? '', note: c.note }));
  const out = [];
  const seen = new Set();
  const dads = new Set(ps.birth.map(c => CANP(c.edge.parent)));
  for (const m of f?.mentions ?? []) {
    if (m.kind !== '立嗣语句' && m.kind !== '出嗣语句') continue;
    // ★ 出嗣句**按定义写在生父那一条上**（「长子开发出嗣亲弟继良」是继动说的）。
    //   写话人不是本人已定的生父 → 那句话说的是同名的另一位，整条不摆。
    //   开发（册4 p89，字金苟，生父继垣）身上曾摆着继动那句话——继动是另一个
    //   开发的父亲。生父还没定下来的不动，宁可多摆，不可摆错人。
    if (m.kind === '出嗣语句' && dads.size && !dads.has(CANP(m.by))) continue;
    const said = NSx(m.text);
    if (!said || seen.has(m.kind + said)) continue;
    seen.add(m.kind + said);
    // ★ 去处怎么定：**按语句类型**，不靠字符串碰运。
    //   立嗣句写在**嗣父自己**那一条（「立朝相次子启昌为嗣」是朝阳写的），
    //   所以写话人就是去处；
    //   出嗣句写在**生父**那一条（「次子启昌出嗣朝阳」是朝相写的），
    //   去处写在「出嗣」后面，拿它去对已定下的嗣父。
    let to = null;
    let noName = false;
    if (m.kind === '立嗣语句') {
      to = heirs.find(h => h.pid === m.by) ?? null;
      // ★ 判定层把这一句判给了另一位同名的 → 那就不是说他的，整条不摆。
      //   开发（册4 p48／p50）身上曾摆着继洹那句「立胞兄继垣长子开发为嗣」——
      //   那句说的是继垣的儿子开发（册4 p89，字金苟），跟他毫无关系。
      if (!to && (HEIR_TAKEN.get(m.by) ?? []).some(q => q.pid !== p.pid)) continue;
    } else {
      // ★ 一句话可能写着**好几个去处**：「次子继源出嗣亲弟壁田兼祧堂兄壁江」
      //   ——出嗣一家、兼祧一家。早先只取 split 的第 [1] 段，兼祧那一家整个丢掉，
      //   於是这句话被记成「去处对不上」，而谱明明写着壁江。**每一段都要看。**
      const segs = said.split(/出[嗣祠]|兼[祧挑]|承[祧挑]/).slice(1).map(NSx);
      // 称谓词常挡在名字前面（「出嗣**二弟**铣直」），用包含，不用前缀
      to = heirs.find(h => h.name && segs.some(t => t.includes(NSx(h.name)))) ?? null;
      // 每一段后面都没跟名字（「子承贵兼祧」＋粘上来的殁年）——谱就是没写给谁
      if (!to) noName = segs.every(t => t.replace(RELW, '').length < 2);
      // ★ 「只有一位嗣父，那句话说的就是他」——**只在句里根本没写去处名字时**才成立。
      //   句里写了名字却对不上，那是两个不同的说法，不能硬按到唯一那位头上：
      //   开发（册4 p89）的嗣父只有继洹一位，於是继良那句话被按成了「去处继洹」。
      if (!to && noName && heirs.length === 1) to = heirs[0];
    }
    out.push({
      原话: m.text,
      写在谁那一条: m.by,
      写话人: m.by_name,
      说的是谁: CANP(p.pid),
      去处: to ? to.pid : null,
      去处名: to ? to.name : '',
      // ★ 落不了的理由要**如实**，不能拿一个笼统说法盖住。
      //   壁錒那条：句里写「出嗣亲弟**光茹**」，而已定的嗣父是「光**菇**」
      //   ——那是异写对不上，不是「谱没写」。两种得分开说。
      // ★ 落不了的理由要**如实陈述**，不许拿「可能…也可能」这类话盖住。
      //   判不出来就不判——把谱写的和已定的两边原样摆出来，不加评语。
      怎么定的: to ? to.note
        : (noName || /[出兼承][嗣祠祧挑]$/.test(NSx(m.text))
            ? '谱只写了「出嗣／兼祧／承祧」，**没写给谁**'
            : (heirs.length
                // 立嗣句写在嗣父自己那一条，「去处」就是写话人；出嗣句的去处写在句里。
                ? (m.kind === '立嗣语句'
                    ? `这句话是${m.by_name}（${m.src_human}）那一条写的，`
                      + `而已定的嗣父是${heirs.map(h => `「${h.name}」`).join('、')}——不是同一位`
                    : `句里的去处写作「${destName(said) || '（句里没写名字）'}」，`
                      + `已定的嗣父是${heirs.map(h => `「${h.name}」`).join('、')}——两边对不上，判定层没拿这一句当依据`)
                : '本人没有嗣父；这句话按名字扭到了他头上，判定层核出说的是**同名的另一位**')),
    });
  }
  // 本人写「X嗣子」而上面几句没覆盖到的。
  // ★ 兼祠的人在谱上有好几条，**每条各写一家**：
  //   继盟 p399「壁岳祠子」、p400「壁环祠子」、p401「壁火祠子」。
  //   拿本条的 father_name 套给三条，就把三句不同的话写成了同一句。
  //   该拿**写那句话的那一条**的原文和 pid。
  const mine = [p, ...sameAs(D.people, p)];
  for (const h of heirs) {
    if (out.some(o => o.去处 === h.pid)) continue;
    const rec = mine.find(q => NSx(q.father_name) === NSx(h.name)) ?? p;
    out.push({
      原话: `${rec.father_name}${rec.filiation}`,
      写在谁那一条: rec.pid, 写话人: rec.name,
      说的是谁: CANP(p.pid),
      去处: h.pid, 去处名: h.name, 怎么定的: h.note,
    });
  }
  return out;
};

let nEdge = 0, nOne = 0, nNone = 0, nHeir = 0, nAdopt = 0, nLoose = 0;
const loose = [];
const shrunk = [];
for (const p of D.people) {
  const ps = R.parents(p);
  const res = R.res.get(p.pid);
  const mk = (c, kind) => ({
    child: p.pid, child_name: p.name,
    parent: c.edge.parent,
    parent_name: R.idx.get(c.edge.parent)?.name ?? '',
    parent_src: R.idx.get(c.edge.parent)?.src_human ?? '',
    kind,
    // 判到哪一级、凭什么——照抄判定层给的那句话。
    // ★ level 取**这一条边自己的**，不是这个人的。
    //   生父和嗣父可以来自完全不同的判据：开发（册4 p89）的生父是人工核定的，
    //   嗣父只是别人那句立嗣语句按名字扭过来的。早先两条边都盖这个人的 level，
    //   於是没人看过的那条边也顶着「人工核定」——最高一级的标签盖在
    //   没人核过的边上，页面上跟真核过的长得一模一样。
    level: c.level || res?.level || '',
    why: c.note,
  });
  const edges = [...ps.birth.map(c => mk(c, '生父')), ...ps.heir.map(c => mk(c, '嗣父'))];
  const before = (p.parent_candidates ?? []).length;
  if (before > edges.length) shrunk.push({ p, before, after: edges.length });
  p.parent_edges = edges;
  // 过继语句：每一句带 pid
  const ad = adoptOf(p);
  if (ad.length) { p.adoptions = ad; nAdopt += ad.length; }
  else if (p.adoptions) delete p.adoptions;
  // 谱上写了过继、却没产出嗣边的：列出来，不默不作声
  const tagged = (p.marks ?? []).filter(m => /立嗣|出嗣|兼祧|承祧/.test(m.tag ?? m[0] ?? ''));
  if (tagged.length && !ad.length) { nLoose++; loose.push({ p, tagged }); }
  nEdge += edges.length;
  if (ps.birth.length === 1) nOne++;
  if (!ps.birth.length && !ps.heir.length) nNone++;
  nHeir += ps.heir.length;
}

// ══════════════════════════════════════════════════════════════════════
// 反向边：**A→B 记了，B→A 也要记，两边同等效力。**
//
// 谱只单向写（孩子那一条写「某某之子」），但 json 不能只存一边。
// 只存一边，另一边就得在**用的时候算**——而算的人不止一处
// （卡片的子女栏、兄弟姐妹栏、世系树、关系计算器），
// 一处算法不一样就出两个答案。今天的重复子女、少列子女，根子都在这。
//
// 现在父边写两遍：孩子身上 `parent_edges`，父亲身上 `children`。
// 同一条边、同样的 kind/level/why，只是方向相反。
// `tools/fk.mjs` 有一道闸盯着两边一一对应，谁也别想单方面改。
// ══════════════════════════════════════════════════════════════════════
const byPid = new Map(D.people.map(x => [x.pid, x]));
for (const p of D.people) delete p.children;
// ★ 兼祧的人谱上印了好几条（「生娶俱详前」），那是**同一个人**。
//   孩子这一头也要折——不折，壁淮的子女栏里就有三个继荣（都是同一位）。
//   父那一头判定层已经折过了（resolve.ts::foldSameOne），这里折孩子。
const CAN = (pid) => {
  const q = byPid.get(pid);
  return q ? canonical(D.people, q).pid : pid;
};
let nBack = 0, orphan = 0, folded = 0;
for (const p of D.people) {
  // 「详前」条是**记载**，不是人。它那几条边跟完整条上的一模一样
  //   （判定层已经折过），从它再建一遍反向边，父亲的子女栏里就多出一个同名的人。
  if (CAN(p.pid) !== p.pid) { folded++; continue; }
  for (const e of p.parent_edges ?? []) {
    const f = byPid.get(e.parent);
    if (!f) { orphan++; continue; }   // fk 那道闸会报，这里不吞
    (f.children ??= []).push({
      child: p.pid, child_name: p.name, child_src: p.src_human,
      kind: e.kind, level: e.level, why: e.why,
    });
    nBack++;
  }
}
// 排一下序：按谱面坐标，跟谱上名单的顺序一致
for (const p of D.people) {
  if (!p.children) continue;
  p.children.sort((a, b) => {
    const qa = byPid.get(a.child)?.src, qb = byPid.get(b.child)?.src;
    if (!qa || !qb) return 0;
    return (qa.page - qb.page) || (qa.row - qb.row) || (qa.col - qb.col);
  });
}

// ══════════════════════════════════════════════════════════════════════
// 过继也要三方都记：**认了的事，每一个当事人的 json 里都有它和对方的 id。**
//
// 一句过继语句牵着三个人：
//     说的是谁（本人）· 写话人（谱把这句话印在谁那一条里）· 去处（嗣父）
// 早先 418 条过继全部只记在**本人**身上，写话人和嗣父那两边一个字没有。
// 於是继良自己写的「立亲兄长子开发为嗣」，在继良的 json 里查不到——
// 要用就得在渲染时回头扫全谱找，那又变成「用的时候算」，两处算法两个答案。
//
// 现在同一条记录三方各存一份，多一栏 `我的角色` 说明这一份是谁的视角。
// 内容一字不差，只是视角不同——`tools/fk.mjs` 有闸盯着三方对得上。
// ══════════════════════════════════════════════════════════════════════
{
  const own = new Map();               // pid → 他自己那几条（当事人视角）
  for (const p of D.people) if (p.adoptions?.length) own.set(p.pid, p.adoptions);
  for (const p of D.people) delete p.adoptions;
  let nAd3 = 0;
  for (const [pid, list] of own) {
    for (const a of list) {
      const put = (who, role) => {
        if (!who) return;
        const q = byPid.get(who);
        if (!q) return;                // fk 那道闸会报，这里不吞
        (q.adoptions ??= []).push({ ...a, 我的角色: role });
        nAd3++;
      };
      // ★ 「本人」那一份记到**折过的那条**上——详前条不是另一个人。
      //   壁鍙在谱上有两条（册3 p32、p38），两条各生成一遍，
      //   「说的是谁」都写着完整条 p32，「本人」那一份却落在 p38 上，三方对不上。
      const self = a.说的是谁;
      put(self, '本人');
      if (a.写在谁那一条 !== self) put(a.写在谁那一条, '写话人');
      if (a.去处 && a.去处 !== self && a.去处 !== a.写在谁那一条) put(a.去处, '去处（嗣父）');
    }
  }
  for (const p of D.people) {
    if (!p.adoptions) continue;
    // 同一条记录别存两遍（一个人可能既是写话人又是去处，上面已经排掉）
    const seen = new Set();
    p.adoptions = p.adoptions.filter(a => {
      // ★ 去处也得进 key：壁鍙兼祧两房（光菇、光庆），两条记录的原话同是
      //   「光庆嗣子」、写话人也同是他自己，只有去处不同。去处不进 key，
      //   两条被去成一条，另一房整个消失——而闸那边是带去处比的，当场对不上。
      const k = [a.写在谁那一条, a.说的是谁, a.原话, a.去处 ?? '', a.我的角色].join('|');
      return !seen.has(k) && seen.add(k);
    });
  }
  console.log(`   过继三方各记一份　${nAd3} 条（本人 · 写话人 · 去处，同一条记录三个视角）`);
}

writeFileSync(U('people'), JSON.stringify(D.people, null, 1), 'utf8');
console.log(`写回 ${D.people.length} 人的 parent_edges —— 共 ${nEdge} 条边，每条指向一个 pid`);
console.log(`   反向边 children　${nBack} 条（A→B 记了，B→A 也记，两边同等效力）`);
if (folded) console.log(`   跳过 ${folded} 条「详前」记载——它们不是另一个人，边跟完整条一样`);
console.log(`   生父恰好一位　${nOne} 人`);
console.log(`   嗣父边　　　　${nHeir} 条`);
console.log(`   谱没写父亲　　${nNone} 人`);
console.log(`\n候选被收敛掉的（题面几条 → 答案几条）：${shrunk.length} 人`);
for (const s of shrunk.slice(0, 8))
  console.log(`   ${s.p.gen}世 ${s.p.name}　${s.before} 条候选 → ${s.after} 条　${s.p.src_human}`);
if (shrunk.length > 8) console.log(`   …还有 ${shrunk.length - 8} 人`);
