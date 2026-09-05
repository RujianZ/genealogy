/**
 * 世系树：从最早的一代往下排到你，一世一行，能点。
 *
 * ★ 为什么不是一条链，是一棵树
 *
 *   过继。用户自己家就是这个情况：第 17 世**启昌（字焕先）**
 *     生父　朝相公（梦庚公支）
 *     嗣父　朝阳公（梦林公支）
 *   谱的凡例明文要求双记，理由写着「不忘所自出」。
 *   所以从启昌往上，**血缘一条路、宗法一条路，是两条真路，不是一条加一个注**。
 *   两条在第 9 世世昂公合回去。
 *
 *   全谱 143 个嗣子/祧子，其中 94 个两条边都有。
 *   剩下两千多人两条线走的是同一串人。
 *
 * ★ 所以这里的规矩是：
 *
 *   **两条线走到同一个人 → 这一世画一格。**
 *   **两条线走到不同的人 → 这一世画两格，标上哪格是血缘、哪格是宗法。**
 *
 *   祖上没过继过的人，从头到尾都是一格——他根本看不见「两条线」这回事，
 *   界面上也不该出现这四个字。有过继的人，一打开就看见路在哪一世分开、
 *   在哪一世又合上。**不用切换、不用先懂什么叫宗法。**
 *
 * ★ 分叉不止过继一种。同名候选也是分叉：
 *   谱上只写了父亲叫「铣发」，而谱里有两个铣发。那一世就是两条可能的路。
 *   这种也照样摆出来，**一个都不删**（CLAUDE.md 第二节「不漏」）。
 */
import type { Person, ParentEdge } from './types.ts';
import type { ChainStep, LineMode, DeadEnd } from './lineage.ts';
import { principalChain, MAX_DEPTH } from './lineage.ts';

export interface TreeCell {
  person: Person;
  /** 这个人在哪几条线上。长度 2 = 两条线在这一世是同一个人 */
  lines: LineMode[];
  /**
   * 连到**上面那一格**（父亲）的边。树是从上往下画的，父亲在上面，
   * 所以这条边就是本人的 taken。最顶上一格为 null。
   */
  via: ParentEdge | null;
  /**
   * 本人的**全部**父候选——也就是上面那一格**本来可能是谁**。
   * 这就是分叉：谱上只写了「铣发」，而谱里有两个铣发，路就有两条。
   * 界面要能全部展开，一个都不许丢（CLAUDE.md 第二节）。
   */
  alternatives: ParentEdge[];
  /** 同一视角下不止一个候选（真重名） */
  ambiguous: boolean;
  /** 往上断在这里 */
  deadEnd: DeadEnd | null;
  /** 就是你 */
  focus: boolean;
}

export interface TreeRow {
  gen: number;
  cells: TreeCell[];
  /** 'split' = 两条线从这一世开始分开；'join' = 从这一世起又是同一个人 */
  mark?: 'split' | 'join';
}

export interface Tree {
  rows: TreeRow[];
  /** 全程只有一条路——绝大多数人都是这样。界面这时一个字都别提「两条线」 */
  single: boolean;
  /** 分开的那一世 / 合回的那一世。single 时都是 null */
  splitGen: number | null;
  joinGen: number | null;
  /** 一句给人看的话；single 时为空字符串 */
  summary: string;
}

const stepOf = (c: ChainStep[], pid: string) => c.find(s => s.person.pid === pid) ?? null;

export function buildTree(
  idx: Map<string, Person>, pid: string, maxDepth = MAX_DEPTH,
  // ★ 跟人物卡走同一个答案，**必填**。
  //   早先写成可选、不传就退回老办法（直接排原始 parent_edges）——
  //   结果是 smoke / verify_all / check_tree 建树时都忘了传，
  //   **闸门一直在验一条 app 根本不走的路径**。兑底比报错更危险。
  res: (p: Person) => import('./parents.ts').Parents,
): Tree {
  const blood = principalChain(idx, pid, '血缘线', maxDepth, res);
  const clan = principalChain(idx, pid, '宗法线', maxDepth, res);
  if (!blood.length) return { rows: [], single: true, splitGen: null, joinGen: null, summary: '' };

  const same = blood.length === clan.length
    && blood.every((s, i) => s.person.pid === clan[i].person.pid);

  // 两条链长度可能不同（宗法线可能先断），要对齐才能并排画。
  //
  // ★ 行号按**离焦点几步**算，不按世次。
  //   早先拿 `person.gen` 当行号，谱哪里漏了一世，两个人就抢同一行，
  //   后放进去的把先放的顶掉——那个人从他自己的世系树里消失了。
  //   实例：承毅（P-册4-0150-2-0-0）那一条写「承国公幼子」，
  //   而「承」是第 27 世的辈字，父子同标 27 世。承毅被顶没了。
  //   判据次第是**谱的原话 ＞ 谱的定式**：父子关系照原话算数，
  //   世代列头对不上是谱这一处印错，不该拿它当行号。
  //   谱记得对的地方，步数和世次差恰好相等，画法与从前一模一样。
  const step0 = blood[0].person.gen;
  const byGen = new Map<number, { blood?: ChainStep; clan?: ChainStep }>();
  const slot = (k: number) => byGen.get(k) ?? byGen.set(k, {}).get(k)!;
  blood.forEach((s, i) => { slot(step0 - i).blood = s; });
  if (!same) clan.forEach((s, i) => { slot(step0 - i).clan = s; });

  const cell = (s: ChainStep, lines: LineMode[]): TreeCell => ({
    person: s.person, lines,
    via: s.taken,                 // 本人的父边 = 连到上面那一格的线
    alternatives: s.alternatives, // 上面那一格本来可能是谁——全部
    ambiguous: s.ambiguous,
    deadEnd: s.deadEnd,
    focus: s.person.pid === pid,
  });

  // ★ 你在最上面，往下走 = 往回追祖先。
  //   这样过继那一处才读得顺：走到启昌，路**分成两条**往下（往上追），
  //   两条各走各的，一直走到第 9 世世昂公才碰到同一个人。
  //   反过来排（始祖在上）会画成「两个人合成一个孩子」，那是家族树的读法，
  //   不是「我往上有两条路」的读法。
  const gens = [...byGen.keys()].sort((a, b) => b - a);
  const rows: TreeRow[] = gens.map(g => {
    const { blood: b, clan: c } = byGen.get(g)!;
    if (b && c && b.person.pid !== c.person.pid) {
      // 世次标谱自己写的那个，行号才是步数——两者只在谱印错的地方不同
      return { gen: b.person.gen, cells: [cell(b, ['血缘线']), cell(c, ['宗法线'])] };
    }
    const s = (b ?? c)!;
    const lines: LineMode[] = same || (b && c) ? ['血缘线', '宗法线'] : b ? ['血缘线'] : ['宗法线'];
    return { gen: s.person.gen, cells: [cell(s, lines)] };
  });

  // 往下 = 往回追。所以「分开」的世次数字**大**（离你近），「合回」的**小**（更早）。
  const splits = rows.filter(r => r.cells.length === 2).map(r => r.gen);
  const splitGen: number | null = splits.length ? Math.max(...splits) : null;

  // ★ 「合回去」必须是**两条线真的都走到了这个人**，不能只是上面那条断了。
  //   承健这一支就是后者：宗法线走到第 16 世朝阳公就断了——
  //   谱里没有朝阳公接到他父亲的那一条。所以第 15 世往上只有血脉一条路，
  //   **那不叫合回，那叫另一条走不下去了**。写成「合回」就是替谱说了它没说的话。
  const joinRow = splitGen == null ? null
    : rows.find(r => r.gen < splitGen && r.cells.length === 1
                     && r.cells[0].lines.length === 2) ?? null;
  const joinGen = joinRow?.gen ?? null;
  // 两条线分开之后，某一条自己断了（不是合回）——把断的那条记下来，界面要说清楚。
  const brokeRow = splitGen == null ? null
    : rows.filter(r => r.cells.length === 2).flatMap(r => r.cells).find(c => c.deadEnd) ?? null;
  if (splitGen != null) {
    for (const r of rows) {
      if (r.gen === splitGen) r.mark = 'split';
      if (joinGen != null && r.gen === joinGen) r.mark = 'join';
    }
  }

  // 过继的那个人，是分开的那几世**再往下一世**的人：
  // 他自己一个人同时在两条线上，他的两个父亲才是分开的第一对。
  const kid = splitGen == null ? null
    : rows.find(r => r.gen === splitGen + 1 && r.cells.length === 1)?.cells[0].person ?? null;
  const j = joinGen == null ? null : rows.find(r => r.gen === joinGen)?.cells[0].person ?? null;

  // 用词全部照谱自己的：凡例第十三则写「於**嗣父母**下直书嗣子某，
  // 而於**本生父母**下必注明第几子某出承与某为嗣，**不忘所自出也**」。
  const summary = splitGen == null ? '' :
    (kid ? `第 ${kid.gen} 世**${kid.name}**是过继的。` : '这一支有过继。')
    + `往回追祖先有两条路：一条走**本生**（生他的那一家），一条走**嗣**（把他接过去的那一家）。`
    + (j ? `两条路走到第 ${j.gen} 世**${j.name}**，是同一个人。`
         : brokeRow ? `**嗣**那条到第 ${brokeRow.person.gen} 世${brokeRow.person.name}就没了下文，谱里没有他父亲单独的一条。` : '')
    + `凡例第十三则要求两边都写，理由是「不忘所自出」。`

  return { rows, single: same, splitGen, joinGen, summary };
}
