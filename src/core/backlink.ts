/**
 * 反向匹配：从父亲的「生子X：…」名单把断掉的链接回去。
 *
 * ★ 为什么需要
 *
 *   原来的链接只往一个方向走：拿儿子写的父名，去谱里找同名的人。
 *   名字对不上就断。朝阳公就是这么断的：
 *
 *       朝阳自己那一条　页眉写「梦林公长子」
 *       他父亲自己那一条　写「林 公」（字安儒）
 *
 *   第 15 世这一辈，**页眉称「梦X公」，本人条目却写「X 公」**——
 *   排行字省掉、加个敬称，字符串就对不上了。
 *
 *   可是**父亲那一条明明白白写着「生子二：朝阳、朝纪」**。
 *   那是全表最硬的依据（CLAUDE.md 依据等级表 rank1 claim_named），
 *   只是没人反过来查。
 *
 *   全谱 75 条断链，这么一查能接回 45 条，另有 22 条查出多个候选。
 *   启昌的嗣父那条宗法线就是靠这个接上去的——接上之后
 *   两条路一直走到第 9 世世昂公才合回，跟谱的凡例说的一样。
 *
 * ★ 这不是猜
 *
 *   用的就是正向匹配用的同一份东西（谱写的「生子X：…」），只是查的方向反过来。
 *   加了两道闸：
 *     · 世次必须正好差 1（原书世代列头标死的）
 *     · 有多个人点了同一个名字时，**全部列出，一个不挑**
 *
 * ★ people.json 一个字没动。补出来的边只活在内存里，标着 derived:true。
 */
import { roster } from './roster.ts';
import { isSeeAlso, sameAs } from './seealso.ts';
import { fname } from './fname.ts';
import type { Person, ParentEdge } from './types.ts';
import { norm } from './norm.ts';

// ★ 比对必须用 norm（带 947 条繁简异体折叠），不能只去空格。
//   谱里同一个人两处写法不同是常事：
//     生子名单写「**啟**发」，他自己那一条写「**启**发」——啟就是启的繁体。
//   曾经这里只去空格，128 个人因此接不上父亲。
const NS = norm;

export interface Augmented extends ParentEdge {
  /** 这条边是反向匹配补出来的，不是 people.json 里原有的 */
  derived: true;
}

/**
 * 给断链的人补父边。返回一份**新的** people 数组，原数组不动。
 * 只补 `parent_edges` 为空、但谱上写了父名的人。
 */
export function withBacklinks(people: Person[]): Person[] {
  // 谁被谁点了名
  const claims = new Map<string, Person[]>();
  for (const f of people) {
    // ★ 走 roster，不用原始的 sons_claimed。
    //
    //   谱上兄弟连排时**辈字只写一次**：「生子三　梁枸　架　柴」。
    //   上游原样存成 ["梁枸","架","柴"]，於是「梁柴」永远配不上「柴」——
    //   梁柴（第22世 册3·卷六·第157页）因此一条父边都没有，
    //   而他父亲泽翔那一条明明白白把他列在名单里。
    //
    //   roster() 早就按谱的格式把辈字补回去了（shareGenChar），
    //   而且顺手把混进名单的女儿（「次適吕」）和杂串（「公殁于」）洗掉。
    //   这里接上同一个，两处别再各读各的。
    // ★ 两份名单**取并集**，因为两边各有各的漏，而两边都是谱写的。
    //
    //   sons_claimed（上游原样存的）漏在**辈字共用**：
    //     谱写「生子三　梁枸　架　柴」，辈字只写一次，存下来就是
    //     ["梁枸","架","柴"]，於是「梁柴」永远配不上「柴」——
    //     梁柴（第22世 册3·卷六·第157页）因此一条父边都没有，
    //     而他父亲泽翔那一条明明白白把他列在名单里。
    //
    //   roster（按谱格式重读的）漏在**另一头**：
    //     启俊（册2·卷三·第280页）谱写「生子3」，roster 只读出 1 个，
    //     学日、学月两条 rank1 的边就没了。
    //
    //   取并集不会多造人——两边的名字都是谱上白纸黑字写着的。
    //   只有一处例外，见下面的 died。
    const names = new Set<string>();
    for (const s of roster(f).sons) {
      // ★ 谱上标了「殁」的（夭折）不收。
      //   开萌那条写「生子三　承达**幼殁**　承光**幼殁**　承荣」——
      //   夭折的孩子谱上不另立条目，所以全谱叫这个名字的**一定是别人**。
      //   拿它去配，只会把无关的人接过来：学信公世系第238页那个承光
      //   自己写着「开田长子」，却被接到了开萌名下。
      if (s.died) continue;
      names.add(NS(s.name || s.raw));
    }
    for (const son of f.sons_claimed ?? []) names.add(NS(son));
    for (const k of names) {
      if (!k) continue;
      (claims.get(k) ?? claims.set(k, []).get(k)!).push(f);
    }
  }

  let n = 0;
  const out = people.map(p => {
    // ★ 曾经这里写的是 `|| !p.father_name`，把**谱上没写父名的 136 人**
    //   全挡在外面了——而他们正是最需要反向匹配的一批：
    //   世系表一格里并排印着好几个兄弟，父名写在页眉上，行内不再重复，
    //   所以他们自己那一条根本没有父名。可是**父亲那一条的生子名单里有他们**。
    //   有没有写父名，跟「父亲点没点他的名」是两件事。
    if (p.parent_edges.length) return p;

    const forms = new Set([NS(p.name), ...p.aliases.map(a => NS(a.form))]);
    const found: Person[] = [];
    for (const form of forms) {
      for (const f of claims.get(form) ?? []) {
        if (f.pid === p.pid) continue;
        // 世次必须正好差 1。谱自己的硬规矩，不是我们加的。
        if (f.gen == null || p.gen == null || p.gen - f.gen !== 1) continue;
        if (!found.includes(f)) found.push(f);
      }
    }
    if (!found.length) return p;
    n += 1;

    // ★ 依据分级：**「父亲点了名」和「两边对得上」不是一回事。**
    //
    //   rank 1 claim_named 的意思是**两边都写了、且对得上**：
    //   儿子那一条写「某某之子」，父亲那一条的生子名单里也有他。
    //
    //   可这里有一批人**自己那一条根本没写父亲**（世系表一格里并排印着
    //   几个兄弟，父名只写在页眉上）。他们唯一的依据是「名字出现在某人的
    //   生子名单里」——这是单边的。开志、开雄这种名字，全谱不止一个人用，
    //   两个不同的「继X」名单里都能撞上。
    //
    //   起初这里一律标 rank 1，结果第 26 世的开志同时挂上了继路和继均
    //   **两个 rank 1 的父亲**——两个最硬的依据互相打架，本身就证明标错了。
    //   现在按谱能给到的强度如实标：
    //     · 儿子写了父名且对得上　→ rank 1 claim_named
    //     · 没写父名、全谱只有一位点了这个名字 → rank 2 sole_homonym
    //     · 没写父名、好几位都点了这个名字　　→ rank 5 homonym_one_of（最弱，界面上要显眼）
    const wrote = fname(p.father_name);
    const twoWay = (f: Person) =>
      !!wrote && (NS(f.name) === wrote || f.aliases.some(a => NS(a.form) === wrote));

    const edges: ParentEdge[] = found.map(f => {
      const both = twoWay(f);
      const only = found.length === 1;
      return {
        parent: f.pid,
        parent_name: f.name,
        kind: '生父',
        evidence: both ? 'claim_named' : only ? 'sole_homonym' : 'homonym_one_of',
        rank: both ? 1 : only ? 2 : 5,
        evidence_cn: both
          ? '父亲的生子列表点名本人'
          : only
            ? '本人条目没写父名；全谱只有这一位的生子名单里有这个名字'
            : `本人条目没写父名；有 ${found.length} 位的生子名单里都有这个名字`,
        matched_as: (p.father_name ? `谱上写父名「${p.father_name}」；` : '本人条目没写父名；')
          + `${f.name}那一条的「生子${(f.sons_claimed ?? []).length}」里写了「${p.name}」`,
        parent_src: f.src_human,
        derived: true,
      } as ParentEdge;
    });
    return { ...p, parent_edges: edges };
  });
  (out as any).__backlinked = n;
  return mergeSeeAlso(withWrittenAdoption(out));
}

/**
 * 本人写了「X嗣子／X祧子」，可谁也没接上——补这一条。
 *
 * ★ 上面那一遍是**从父亲那边过来**的：父亲的生子名单点了本人的名。
 *   过继的人接不上，正因为嗣父的名单里**本来就不会有他**——
 *   嗣父那条常写「生子一 幼殁」，立祧子的理由恰恰是亲生的没了。
 *
 * ★ 承贵（第27世 册4·卷八·学义公世系·第137页第2行）：
 *       他自己那条  「开聪公之祧子」
 *       开聪        第137页**第1行**  生子「幼殁」
 *   同页、正上一行、亲子夭折——谱把话说全了，我们一条边都没给他。
 *   （接不上的直接原因是册4 写「开聪公**之**祧子」，
 *     上游按前三册的「X祧子」切，把「之」留在了名字里。见 fname.ts）
 *
 * ★ 四个条件全部来自谱，缺一不补：
 *     ① 本人条目写了父名
 *     ② 排行写的是「嗣子／祧子／嗣男」——谱明说这是过继
 *     ③ 同册同房、上一世，叫这个名字的**只有一位**
 *     ④ 那一位就印在本人的正上一行
 *   四条都满足才算「谱写死了」，不是我们挑的。全谱 2 人。
 */
function withWrittenAdoption(people: Person[]): Person[] {
  const ADOPT = /^(嗣子|祧子|嗣男|继子|承嗣子)$/;
  const byKey = new Map<string, Person[]>();
  for (const p of people) {
    if (p.gen == null) continue;
    for (const f of new Set([NS(p.name), ...p.aliases.map(a => NS(a.form))])) {
      if (!f) continue;
      const k = `${p.src.vol}|${p.src.section}|${p.gen}|${f}`;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(p);
    }
  }
  return people.map(p => {
    if (p.gen == null || !p.father_name) return p;
    if (!ADOPT.test((p.filiation ?? '').trim())) return p;
    const w = fname(p.father_name).replace(/公$/, '');
    if (!w) return p;
    // 已经有边指向这个名字，就不重复补
    const hit = (k: string) => {
      const set = byKey.get(k);
      return set ? [...new Set(set)] : [];
    };
    const cand = hit(`${p.src.vol}|${p.src.section}|${p.gen - 1}|${w}`);
    if (cand.length !== 1) return p;
    const f = cand[0];
    if (p.parent_edges.some(e => e.parent === f.pid)) return p;
    if (f.src.row !== p.src.row - 1) return p;       // 必须印在正上一行
    const edge: ParentEdge = {
      parent: f.pid,
      parent_name: f.name,
      kind: '嗣父',
      evidence: 'stated_adopt',
      rank: 3,
      evidence_cn: '本人条目原文写明是他的' + p.filiation,
      matched_as: `本人条目写「${p.father_name}${p.filiation}」；`
        + `${f.name}在同房上一世且仅此一位，就印在本人的正上一行`
        + `（第${f.src.page}页第${f.src.row}行 → 第${p.src.page}页第${p.src.row}行）`,
      parent_src: f.src_human,
      derived: true,
    } as ParentEdge;
    return { ...p, parent_edges: [...p.parent_edges, edge] };
  });
}

/** 补了几个人——给启动日志用。 */
export const backlinkCount = (augmented: Person[]): number =>
  (augmented as any).__backlinked ?? 0;

/**
 * 兼祧的人在谱上有好几条——**他是一个人，一个 id，一张卡片，父亲有几位。**
 *
 *   继华（字东华，生1955，册2·卷四·朝泰公世系）：
 *       第361页　「壁洲公嗣子」　生庚写全      ← 完整条
 *       第362页　「壁银公嗣子」　「生庚俱详前」
 *       第363页　「壁林公之子」　「生庚俱详前」
 *   而壁林那一条末句写着「子继华兼祧长兄壁洲　二兄壁银」，三条对得上。
 *
 *   谱在他承的每一房下各写一条，每条只写那一房的父亲。当成三个人，
 *   卡片上就永远只看得见一位——可他有三位：生父壁林，兼祧壁洲、壁银。
 *
 * ★ 合并只做一次，做在这一层。
 *   放到判据里做过，结果「算父亲」和「算子女」两处各算各的，
 *   父亲卡上摆不出这个孩子（18 条）。**同一件事只能有一个来源。**
 *
 * ★ 只并到**完整条**上（那张正式的卡片）；详前条保持自己那一位，
 *   界面上指回完整条。这样父亲的子女栏里同一个孩子只出现一次。
 *
 * ★ 认「同一个人」靠三样，全是谱写的：同名、同世、**字号对得上**。
 *   字号是关键：继华（字东华，生1955）和另一个继华（字金龙，生1920）
 *   同名同世，字不同——两个人。见 seealso.ts 的 sameZi。
 */
function mergeSeeAlso(people: Person[]): Person[] {
  return people.map(p => {
    if (isSeeAlso(p)) return p;
    const kin = sameAs(people, p);
    if (!kin.length) return p;
    const seen = new Set(p.parent_edges.map(e => `${e.kind}|${e.parent}`));
    const add: ParentEdge[] = [];
    for (const q of kin)
      for (const e of q.parent_edges) {
        const k = `${e.kind}|${e.parent}`;
        if (seen.has(k)) continue;
        seen.add(k);
        add.push(e);
      }
    return add.length ? { ...p, parent_edges: [...p.parent_edges, ...add] } : p;
  });
}
