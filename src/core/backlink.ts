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
    for (const son of f.sons_claimed ?? []) {
      const k = NS(son);
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
    const wrote = NS(p.father_name ?? '');
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
  return out;
}

/** 补了几个人——给启动日志用。 */
export const backlinkCount = (augmented: Person[]): number =>
  (augmented as any).__backlinked ?? 0;
