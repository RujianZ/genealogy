/**
 * 上溯。翻译自 parser/link.py 的 walk_up / flatten_paths，**但去掉了一处取舍。**
 *
 * 原 Python 版有 kind_pref="生父"：
 *     prefer = [e for e in edges if e["kind"] == kind_pref]
 *     use = prefer or edges
 * 这会在有生父边时把嗣父边丢掉——第 17 世启昌的嗣父朝阳就是这样消失的。
 * 那是查询脚本图省事，界面不能这么干（CLAUDE.md 第二节第 1 条）。
 * 这里 **一条不丢，全部展开成分叉**，由看的人对着原文判。
 */
import type { Person, ParentEdge } from './types.ts';

export interface Branch {
  edge: ParentEdge;
  node: AncNode | null;
  /** 边指向的人不在谱中 / 超深 / 成环时说明原因，不静默丢弃 */
  stop?: string;
}

/** 谱上写了父名、但全谱查无此条目——链在这里断了。断了要说，不许当没有。 */
export interface DeadEnd {
  fatherName: string;
  fatherSrc: string;   // 「页眉指向「子长公林梦」」之类，是谱自己的说法
  filiation: string;
  reason: string;
}

export interface AncNode {
  person: Person;
  /** 每条父边一个分叉。长度可能是 0 / 1 / 多。 */
  branches: Branch[];
  deadEnd: DeadEnd | null;
  depth: number;
}

export const MAX_DEPTH = 40;

/**
 * 把依据等级说成人话。
 *
 * 界面上不出现 rank 数字——那是我们内部的度量，家里人看不懂「rank1」。
 * 原则：**确定的时候安静，不确定的时候才出声。**
 * 前两级什么都不说（本来就是实的），第三级说清是过继，第五级必须警告。
 */
export function edgeNote(e: ParentEdge, sameNameCount = 0): { text: string; loud: boolean } {
  switch (e.evidence) {
    case 'claim_named':
      return { text: '', loud: false };            // 父亲那条点了名，最实，不必啰嗦
    case 'sole_homonym':
      return { text: '', loud: false };            // 全谱独一份，也不必说
    case 'stated_adopt':
      return { text: '谱上写明是过继', loud: false };
    // ★ 过继语句点了名字，可同名的不止一个——写明的是名字，不是人。
    //   跟 homonym_one_of 一样要显眼，但话得说准：
    //   不确定的是**这个孩子是哪一个**，不是父亲是哪一个。
    case 'stated_adopt_homonym':
      return {
        text: `谱上写明是过继；全谱叫这名字的有 ${e.homonyms || '多'} 位`,
        loud: true,
      };
    case 'honorific':
      return { text: '谱上写作「' + e.parent_name + '公」', loud: false };
    case 'homonym_one_of':
      return {
        text: `同名 ${sameNameCount || '多'} 个，谱没说是哪个`,
        loud: true,
      };
    default:
      return { text: e.evidence_cn, loud: false };
  }
}

/** 鼠标悬停时给出完整依据，技术细节留在这里，不占正文。 */
export function edgeDetail(e: ParentEdge): string {
  return `依据等级 ${e.rank}／5（${e.evidence_cn}）\n匹配：${e.matched_as}\n父出处：${e.parent_src}`;
}

/** 同名的人有几个——用来把「同名的有 N 个」说具体。 */
export function countSameName(people: Person[], name: string): number {
  return people.filter(p => p.name === name).length;
}

export function buildIndex(people: Person[]): Map<string, Person> {
  return new Map(people.map(p => [p.pid, p]));
}

/** 向上追溯，遇到多条父边全部展开。返回一棵树，不是一条链。 */
/* walkUp() 已删：它按原始 `parent_edges` 走，是旧判定的最后一条路径；
   全项目零调用者，留着只会让人以为还有第二套算法。 */

export interface FlatPath {
  nodes: AncNode[];
  edges: ParentEdge[];
  /** 沿途最弱的依据等级（1 最硬，5 最弱）。0 表示路上没有边。 */
  weakest: number;
  /** 世次是否逐代差 1。不单调的**照样返回**，只是标出来。 */
  genConsistent: boolean;
  /** 这条路是怎么终止的 */
  end: '迁梅始祖' | '谱上未写父名' | '断链' | '中止';
  /** 是否走到了第 1 世胜二 */
  reachesRoot: boolean;
  endNote: string;
}

/** 把上溯树摊成一条条完整路径。**一条都不删。** */
export function flattenPaths(root: AncNode | null): FlatPath[] {
  if (!root) return [];
  const out: FlatPath[] = [];

  function pack(nodes: AncNode[], edges: ParentEdge[], end: FlatPath['end'], endNote: string): FlatPath {
    const gs = nodes.map(n => n.person.gen).filter(g => g != null);
    const genConsistent = gs.length < 2 || gs.every((g, i) => i === 0 || gs[i - 1] - g === 1);
    return {
      nodes, edges,
      weakest: edges.length ? Math.max(...edges.map(e => e.rank)) : 0,
      genConsistent, end, endNote,
      reachesRoot: nodes[nodes.length - 1]?.person.gen === 1,
    };
  }

  function rec(n: AncNode, nodes: AncNode[], edges: ParentEdge[]) {
    const path = [...nodes, n];
    if (n.branches.length === 0) {
      // 第 1 世胜二的父亲千五在江西乐平，本谱自胜二起算，不载千五。
      // 这是谱的编纂范围，不是断链——CLAUDE.md「不漏」要求把两者分开说。
      if (n.person.gen === 1) {
        out.push(pack(path, edges, '迁梅始祖',
          `到了第一世${n.person.name}公，迁到黄梅的头一个人。他父亲在江西乐平，这部谱没有收。`));
      } else if (n.deadEnd) {
        out.push(pack(path, edges, '断链', n.deadEnd.reason));
      } else {
        out.push(pack(path, edges, '谱上未写父名', `${n.person.name}（第${n.person.gen}世）谱上未写父名`));
      }
      return;
    }
    for (const b of n.branches) {
      if (b.node) rec(b.node, path, [...edges, b.edge]);
      else out.push(pack(path, [...edges, b.edge], '中止', b.stop ?? ''));
    }
  }
  rec(root, [], []);
  return out;
}

/**
 * 只排序，不筛。顺序：先走到始祖的，再世次单调的，再依据强的，再长的。
 *
 * ★ 曾经的 bug：把 reachesRoot 漏了，结果一条 12 代就断在朝阳的路径
 *   （最弱 rank2）排在了完整 27 代路径（最弱 rank3）前面，
 *   看起来像「承健的直系断在第 16 世」。完整性必须先于依据强弱。
 */
export function rankPaths(paths: FlatPath[]): FlatPath[] {
  return [...paths].sort((a, b) =>
    Number(b.reachesRoot) - Number(a.reachesRoot)
    || Number(a.genConsistent === false) - Number(b.genConsistent === false)
    || a.weakest - b.weakest
    || b.nodes.length - a.nodes.length);
}

// childrenOf() 已删：它按原始 `parent_edges` 列子女，
// 是旧判定的最后一条路径。子女一律从判定层反建
// （见 `entries.ts` 里的 kidsIdx），只认唯一 id。


// mentionedBy 已删：那是最后一处「按名字建关系」的函数。
// 关系一律走 id——父边、事迹里解析好的 targets[].pid、referenced 挂的 host。
// 血缘线 / 宗法线
//
// 第 17 世启昌（字焕先）有两个父亲：生父朝相（梦庚公支）、嗣父朝阳（梦林公支）。
// 族谱凡例明文要求双记，理由是「不忘所自出」。所以往上有两条真实的链：
//
//   血缘线  27 承健 … 17 启昌 ← 16 朝相 ← 15 梦庚 ← 14 林公 ← … ← 10 有德 ┐
//                                                                        ├ 9 世昂
//   宗法线  27 承健 … 17 启昌 ← 16 朝阳 ← 15 梦林 ← 14 榛公 ← … ← 10 有禄 ┘
//
// 两条在第 17 世分叉、第 9 世世昂公合回。这不是 bug，是这个家族真实的结构。
// docs/直系世系_胜二至承健.md 那份人工核对表记的是**宗法线**。
//
// 注意：这里的「择线」不是 CLAUDE.md 禁止的那种取第一个——
// 它是用户主动选的显示视角，而且每一步的全部候选都照样带出来（alternatives），
// 界面必须把 alternatives 一并显示，采用的那条只是高亮。
// ─────────────────────────────────────────────────────────────────────────

export type LineMode = '血缘线' | '宗法线';

export interface ChainStep {
  person: Person;
  /** 本步沿所选视角采用的边；null = 到顶、断链、或谱上未写父名 */
  taken: ParentEdge | null;
  /** 本步的**全部**父边。界面必须全显示，不许只画 taken。 */
  alternatives: ParentEdge[];
  /** 同一视角下有多个候选（真重名）——必须让用户一眼看见 */
  ambiguous: boolean;
  deadEnd: DeadEnd | null;
  stop?: string;
}

/**
 * 沿指定视角走一条链。遇到多个同类候选时，按「世次差正好 1」→「rank 小」排序取首，
 * **但把 ambiguous 标为 true，并把全部候选放在 alternatives 里**。
 * 界面有责任把分叉画出来；这个函数只负责给一条可读的主线。
 */
export function principalChain(
  idx: Map<string, Person>, pid: string, mode: LineMode, maxDepth = MAX_DEPTH,
  res: (p: Person) => import('./parents.ts').Parents,
): ChainStep[] {
  const preferKind = mode === '宗法线' ? '嗣父' : '生父';
  const out: ChainStep[] = [];
  const seen = new Set<string>();
  let cur = idx.get(pid) ?? null;

  while (cur && out.length < maxDepth) {
    if (seen.has(cur.pid)) {
      out.push({ person: cur, taken: null, alternatives: [], ambiguous: false,
        deadEnd: null, stop: '成环，停止' });
      break;
    }
    seen.add(cur.pid);

    // ★ **全部候选也走判定层**，不再读原始 parent_edges。
    //   早先这里拿原始边当「其它可能的父亲」摆在界面上，
    //   里头包括判定层已经排掉的那些——卡片说不可能、树却列出来。

    // ★ 走哪一条，跟人物卡用**同一个答案**。
    //
    //   在这之前树是自己算的：拿原始 parent_edges，只按「世次差是否为 1」和 rank 排。
    //   人物卡那边却做了六道排除（世次、生年、生子名单点了别人、排行、
    //   兄弟称谓、同一人重复条目）。两套并行的结果是——
    //   **312 人的上溯链里有 320 步，走的是人物卡已经排除掉的那条边。**
    //   树会沿着 app 自己判定为不可能的路往上走。
    //
    //   现在只有一个入口：`resolve.ts::resolveAll()`，`parents.ts::parentsFrom()` 只做形状转换。
    //   调用方把它传进来（res），没传就退回老办法，保证旧调用点不炸。
    // ★ **没有兑底。** 早先这里有一条 else：不传 res 就直接排原始
    //   parent_edges（只看世次差和 rank）。可建树的几个闸都忘了传，
    //   **于是它们一直在验一条 app 根本不走的路径**。
    //   全站只有一份判定，忘传就是调用方错了，该当场报错。
    const ps = res(cur);
    const all: ParentEdge[] = [...ps.birth, ...ps.heir, ...ps.alsoNamed].map(c => c.edge);
    const pool = mode === '宗法线'
      ? ps.clan                                   // 兼祠几房就有几条，全在这里
      : (ps.birth.length ? ps.birth : ps.clan);
    const ranked: ParentEdge[] = pool.map(c => c.edge);

    let deadEnd: DeadEnd | null = null;
    if (all.length === 0 && cur.father_name) {
      deadEnd = {
        fatherName: cur.father_name, fatherSrc: cur.father_src, filiation: cur.filiation,
        reason: cur.gen === 1
          ? `父亲「${cur.father_name}」在江西乐平，这部谱从胜二公算起，没收他`
          : `谱里没有「${cur.father_name}」单独的一条，往上断在这里`,
      };
    }

    const taken = ranked[0] ?? null;
    out.push({
      person: cur, taken, alternatives: all,
      ambiguous: ranked.length > 1, deadEnd,
      // 不写「此人没有嗣父边，本步退回其它父边」这种话。
      // 绝大多数人本来就没过继，两条线在这一步是同一个人——正常情况不该出声。
      // 读这个的是七八十岁的长辈，界面上每一句都得是他们平时会说的话。
      stop: undefined,
    });

    if (!taken) break;
    cur = idx.get(taken.parent) ?? null;
  }
  return out;
}

/** 两条线在哪一世分叉、哪一世合回。用于界面上直接标出来。 */
export function compareLines(a: ChainStep[], b: ChainStep[]) {
  const pa = a.map(s => s.person.pid), pb = new Set(b.map(s => s.person.pid));
  const shared = pa.filter(p => pb.has(p));
  const divergeAt = a.find((s, i) => a[i].person.pid !== b[i]?.person.pid)?.person.gen ?? null;
  const rejoin = shared.length
    ? Math.max(...shared.map(p => a.find(s => s.person.pid === p)!.person.gen)
        .filter(g => divergeAt == null || g < divergeAt))
    : null;
  return { divergeAt, rejoinAt: Number.isFinite(rejoin!) ? rejoin : null };
}
