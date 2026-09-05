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
import { buildFacts } from '../src/core/facts.ts';
import { sameAs } from '../src/core/seealso.ts';
import { withBacklinks } from '../src/core/backlink.ts';
const U = n => new URL(`../data/${n}.json`, import.meta.url);
const J = n => JSON.parse(readFileSync(U(n), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const FACTS = buildFacts(withBacklinks(D.people), D.generations);

// ── 过继语句：做成**带 id 的一等记录** ─────────────────
//
// 谱写「次子启昌出嗣**朝阳**」——「朝阳」两个字不是身份。
// 以前只把这句话当文本存着（marks），谁要用谁去搜同名。
// 现在每一句都落成三个 pid：写在谁那一条、说的是谁、去处是谁。
// 定不下来的写 null 并说明为什么——**不留名字给下游去猜**。
const NSx = (x) => String(x ?? '').replace(/[\s　]+/g, '');
const adoptOf = (p) => {
  const ps = R.parents(p);
  const f = FACTS.get(p.pid);
  const heirs = ps.heir.map(c => ({ pid: c.edge.parent, name: R.idx.get(c.edge.parent)?.name ?? '', note: c.note }));
  const out = [];
  const seen = new Set();
  for (const m of f?.mentions ?? []) {
    if (m.kind !== '立嗣语句' && m.kind !== '出嗣语句') continue;
    const said = NSx(m.text);
    if (!said || seen.has(m.kind + said)) continue;
    seen.add(m.kind + said);
    // ★ 去处怎么定：**按语句类型**，不靠字符串碰运。
    //   立嗣句写在**嗣父自己**那一条（「立朝相次子启昌为嗣」是朝阳写的），
    //   所以写话人就是去处；
    //   出嗣句写在**生父**那一条（「次子启昌出嗣朝阳」是朝相写的），
    //   去处写在「出嗣」后面，拿它去对已定下的嗣父。
    let to = null;
    if (m.kind === '立嗣语句') to = heirs.find(h => h.pid === m.by) ?? null;
    else {
      const tail = NSx(said.split(/出[嗣祠]|兼[祠挑]|承[祠挑]/)[1] ?? '');
      // 称谓词常挡在名字前面（「出嗣**二弟**铣直」），用包含，不用前缀
      to = heirs.find(h => h.name && tail.includes(NSx(h.name))) ?? null;
      if (!to && heirs.length === 1) to = heirs[0];   // 只有一位嗣父，那句话说的就是他
    }
    out.push({
      原话: m.text,
      写在谁那一条: m.by,
      写话人: m.by_name,
      说的是谁: p.pid,
      去处: to ? to.pid : null,
      去处名: to ? to.name : '',
      // ★ 落不了的理由要**如实**，不能拿一个笼统说法盖住。
      //   壁錒那条：句里写「出嗣亲弟**光茹**」，而已定的嗣父是「光**菇**」
      //   ——那是异写对不上，不是「谱没写」。两种得分开说。
      怎么定的: to ? to.note
        : (heirs.length
            ? `句里的去处跟已定的嗣父对不上（已定：${heirs.map(h => h.name).join('、')}）——可能是异写，也可能这句说的是同名的另一位`
            : (/[出兼承][嗣祠挑]$/.test(NSx(m.text))
                ? '谱只写了「出嗣／兼祠」，**没写给谁**'
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
      说的是谁: p.pid,
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
    // 判到哪一级、凭什么——照抄判定层给的那句话
    level: res?.level ?? '',
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
  const tagged = (p.marks ?? []).filter(m => /立嗣|出嗣|兼祠|承祠/.test(m.tag ?? m[0] ?? ''));
  if (tagged.length && !ad.length) { nLoose++; loose.push({ p, tagged }); }
  nEdge += edges.length;
  if (ps.birth.length === 1) nOne++;
  if (!ps.birth.length && !ps.heir.length) nNone++;
  nHeir += ps.heir.length;
}

writeFileSync(U('people'), JSON.stringify(D.people, null, 1), 'utf8');
console.log(`写回 ${D.people.length} 人的 parent_edges —— 共 ${nEdge} 条边，每条指向一个 pid`);
console.log(`   生父恰好一位　${nOne} 人`);
console.log(`   嗣父边　　　　${nHeir} 条`);
console.log(`   谱没写父亲　　${nNone} 人`);
console.log(`\n候选被收敛掉的（题面几条 → 答案几条）：${shrunk.length} 人`);
for (const s of shrunk.slice(0, 8))
  console.log(`   ${s.p.gen}世 ${s.p.name}　${s.before} 条候选 → ${s.after} 条　${s.p.src_human}`);
if (shrunk.length > 8) console.log(`   …还有 ${shrunk.length - 8} 人`);
