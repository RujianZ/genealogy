/**
 * 关系计算：两个人之间该怎么称呼。
 *
 * **零判断。** 这里只做三件事，每一件都是数出来的，不是判出来的：
 *   ① 两人各自的全部祖先，以及上溯几代 —— 沿 parent_edges 走，一条边不丢
 *   ② 共同祖先 —— 两个祖先集合的交集，**全部列出，不挑最近的那个**
 *   ③ 辈分差 —— 世次相减。世次是原书用「第一世…第五世」列头标死的，不是推算
 *
 * 称谓（堂兄/族叔/从父姪…）另算一层，而且**明确标成「通用叫法」**：
 * 谱里从不写称谓，那是宗法通例，不是这部谱的记载。黄梅本地叫法可能不同。
 * 结构事实（共祖是谁、各上溯几代、差几辈）才是谱能支撑的部分。
 *
 * 血缘与宗法两条路都算：启昌是嗣子，他的后代跟别人的关系，
 * 按血缘算和按宗法算可能完全不同。两个都给，不替谱选。
 */
import type { Person, ParentEdge } from './types.ts';

export interface AncHit {
  pid: string;
  /**
   * 每一条走到他的路：上溯几代、是否经过过继、**沿途最弱的依据等级**。
   * 逐条留，不合并。
   *
   * ★ weakest 是关键。全谱 3,622 条父边里有 1,356 条是 rank5
   *   「谱上只写了两个字，同名的有好几个，没说是哪一个」。
   *   这些边照走（不漏），但走过它们得出的「最近共祖」是靠不住的——
   *   不标出来，界面就会拿一条最弱的路当答案。
   */
  paths: { step: number; adopted: boolean; weakest: number }[];
}

/** 某人的全部祖先，附上溯代数。遇多条父边全部展开，不选。 */
export function ancestors(
  idx: Map<string, Person>, pid: string, maxDepth = 40,
): Map<string, AncHit> {
  const out = new Map<string, AncHit>();
  const walk = (cur: string, step: number, adopted: boolean, weakest: number, seen: Set<string>) => {
    if (step > maxDepth || seen.has(cur)) return;
    const p = idx.get(cur);
    if (!p) return;
    const seen2 = new Set(seen).add(cur);
    for (const e of p.parent_edges) {
      // ★ 过继标记要**跟着这一条路**走，不能标在人身上。
      //   启昌那条嗣父边一用，他上面所有祖先都会被标上「经过过继」——
      //   技术上没错，但等于满屏都是，没用。按路记。
      const a = adopted || e.kind === '嗣父';
      const w = Math.max(weakest, e.rank);
      const hit = out.get(e.parent) ?? { pid: e.parent, paths: [] };
      if (!hit.paths.some(x => x.step === step + 1 && x.adopted === a && x.weakest === w)) {
        hit.paths.push({ step: step + 1, adopted: a, weakest: w });
      }
      out.set(e.parent, hit);
      walk(e.parent, step + 1, a, w, seen2);
    }
  };
  walk(pid, 0, false, 0, new Set());
  return out;
}

/**
 * 挑一条代表路。**先看依据硬不硬，再看近不近**——
 * 反过来的话，一条全是「同名候选之一」的弱边会因为短而胜出，
 * 界面就会拿最靠不住的那条当答案。
 */
const bestPath = (h: AncHit) =>
  h.paths.reduce((m, x) => (x.weakest !== m.weakest ? (x.weakest < m.weakest ? x : m)
                                                   : (x.step < m.step ? x : m)));
const minPath = bestPath;

export interface Common {
  pid: string;
  name: string;
  gen: number;
  /** 甲上溯几代到他 */
  upA: number[];
  /** 乙上溯几代到他 */
  upB: number[];
  /** 最近的一组 */
  minA: number;
  minB: number;
  viaAdoption: boolean;
  /** 两条路上最弱的依据等级，1 最硬 5 最弱 */
  weakest: number;
}

export interface KinResult {
  a: Person; b: Person;
  /** 世次差。正数＝甲比乙低（辈分小） */
  genDiff: number;
  /** 全部共同祖先，**一个不删**，按远近排 */
  commons: Common[];
  /** 有没有一方是另一方的直系祖先 */
  directA?: number;   // 乙是甲的第几代祖先
  directB?: number;
  /** 直系时的叫法（父亲/祖父/曾孙…），非直系为 undefined */
  directTerm?: string;
  note: string;
}

export function kinship(idx: Map<string, Person>, aPid: string, bPid: string): KinResult | null {
  const a = idx.get(aPid), b = idx.get(bPid);
  if (!a || !b) return null;
  const A = ancestors(idx, aPid), B = ancestors(idx, bPid);

  const commons: Common[] = [];
  for (const [pid, ha] of A) {
    const hb = B.get(pid);
    if (!hb) continue;
    const p = idx.get(pid)!;
    const ma = minPath(ha), mb = minPath(hb);
    commons.push({
      pid, name: p.name, gen: p.gen,
      upA: [...new Set(ha.paths.map(x => x.step))].sort((x, y) => x - y),
      upB: [...new Set(hb.paths.map(x => x.step))].sort((x, y) => x - y),
      minA: ma.step, minB: mb.step,
      viaAdoption: ma.adopted || mb.adopted,
      weakest: Math.max(ma.weakest, mb.weakest),
    });
  }
  // 先按依据硬不硬排，再按远近。**一条不删**，只是把靠得住的放前面。
  commons.sort((x, y) => x.weakest - y.weakest
    || (x.minA + x.minB) - (y.minA + y.minB) || y.gen - x.gen);

  const res: KinResult = {
    a, b, genDiff: a.gen - b.gen, commons,
    directA: B.has(aPid) ? minPath(B.get(aPid)!).step : undefined,
    directB: A.has(bPid) ? minPath(A.get(bPid)!).step : undefined,
    note: '',
  };
  // 直系在先：一方是另一方的祖先时，共祖那一套不适用
  if (res.directB !== undefined) {
    res.note = `${b.name}是${a.name}的第 ${res.directB} 代祖先。`;
    res.directTerm = ancestorTerm(res.directB);
  } else if (res.directA !== undefined) {
    res.note = `${a.name}是${b.name}的第 ${res.directA} 代祖先。`;
    res.directTerm = descendantTerm(res.directA);
  } else if (!commons.length) {
    res.note = '谱里连不出共同祖先——两条上溯链没有交点。';
  }
  return res;
}

/** 直系长辈的叫法：往上 n 代。 */
export function ancestorTerm(n: number): string {
  return ['', '父亲', '祖父', '曾祖父', '高祖父', '天祖父', '烈祖父', '太祖父', '远祖父'][n]
    ?? `第 ${n} 代祖先`;
}
/** 直系晚辈的叫法：往下 n 代。 */
export function descendantTerm(n: number): string {
  return ['', '儿子', '孙', '曾孙', '玄孙', '来孙', '晜孙', '仍孙', '云孙'][n]
    ?? `第 ${n} 代孙`;
}

// ── 称谓：通用叫法，不是谱上的记载 ────────────────────────────
// 谱里从不写称谓。这一层是宗法通例，黄梅本地叫法可能不同，
// 所以界面上必须标明「通用叫法」，和上面的结构事实分开。

const 长幼 = (d: number) => (d < 0 ? '兄' : d > 0 ? '弟' : '');

/**
 * @param up 双方到共祖各上溯几代（取较大的那个，表示血缘远近）
 * @param diff 甲的世次 − 乙的世次
 */
export function term(up: number, diff: number, elderFirst = 0): string {
  // 同辈
  if (diff === 0) {
    if (up === 1) return '亲兄弟';
    if (up === 2) return '堂兄弟';
    if (up === 3) return '再从兄弟（三代内）';
    if (up === 4) return '族兄弟（四代内）';
    return `族兄弟（共祖上溯 ${up} 代）`;
  }
  // 甲辈分低（diff > 0）：乙是长辈
  if (diff > 0) {
    if (diff === 1) return up <= 2 ? '伯父／叔父' : up === 3 ? '堂伯／堂叔' : '族伯／族叔';
    if (diff === 2) return up <= 2 ? '伯祖／叔祖' : '族祖';
    if (diff === 3) return '曾祖辈';
    if (diff === 4) return '高祖辈';
    return `高${diff}辈的长辈`;
  }
  // 甲辈分高：乙是晚辈
  const d = -diff;
  if (d === 1) return up <= 2 ? '姪' : up === 3 ? '堂姪' : '族姪';
  if (d === 2) return up <= 2 ? '姪孙' : '族孙';
  if (d === 3) return '曾姪孙辈';
  return `低${d}辈的晚辈`;
}

/** 把一组共祖变成一句人话。**结构事实在前，通用叫法在后并标明。** */
export function describe(r: KinResult, c: Common): { fact: string; call: string } {
  const fact = `共同的祖先是${c.name}（第${c.gen}世）。`
    + `${r.a.name}往上 ${c.minA} 代，${r.b.name}往上 ${c.minB} 代。`
    + (r.genDiff === 0 ? '两人同辈。'
      : r.genDiff > 0 ? `${r.b.name}比${r.a.name}高 ${r.genDiff} 辈。`
        : `${r.a.name}比${r.b.name}高 ${-r.genDiff} 辈。`)
    + (c.viaAdoption ? '（这条路上经过一次过继）' : '')
    + (c.weakest >= 5
      ? '　⚠ 中间有一步是同名候选，不确定。'
      : c.weakest >= 3 ? '　（这条路最弱的一步是过继语句或去敬称）' : '');
  const call = term(Math.max(c.minA, c.minB), r.genDiff);
  return { fact, call };
}
