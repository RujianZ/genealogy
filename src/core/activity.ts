/**
 * 活跃时间段：一个人在世的那段年份。
 *
 * 原来只拿「父的生年」比「本人的生年」，太浪费——谱上每个人身上挂着好几个时间点：
 *
 *     本人生年 79.3%   本人殁年 25.1%   寿数（可倒推生年）8.3%
 *     配偶生年 50.0%   配偶殁年 13.1%   子女生年（写在子女那一条上）
 *
 * 合起来 **90.6% 的人能定出年代**。定出来之后，
 * 「谁能当谁的父亲」就变成区间比较：
 *
 *     ★ 父亲必须在孩子出生时还在世（或刚过世——遗腹子，宽 1 年）
 *     ★ 父亲必须比孩子早生 13 到 75 年
 *
 * **最有力的其实是殁年**：「他殁于 1789，本人生于 1826，晚了 37 年」——
 * 这比生年差硬得多，也说得更明白。
 *
 * 全部是谱上写的数字 + 加减法 + 区间比较。**不知道就是不知道，
 * 不拿平均世代间隔去填。**
 */
import type { Person } from './types.ts';
import type { EraChart } from './years.ts';
import { continued } from './continued.ts';
import { MIN_GAP, MAX_GAP } from './years.ts';

/** 夫妻年龄差。只用来给没有本人年份的人框个很宽的窗——宁可框不住，不可框错。 */
const SPOUSE_SPAN = 25;

export interface Window {
  born: number | null;
  died: number | null;
  /** 出生年不早于 / 不晚于。born 已知时三者相同 */
  lo: number | null;
  hi: number | null;
  why: string[];
  /**
   * 几处线索**互相矛盾**（框出来 lo > hi）。
   * 那说明谱上两处数字对不上——**结论是「不知道」，不是「知道了个怪东西」**。
   * 这时 lo/hi 一律清空，绝不拿这个空区间去排除任何候选。
   * 泽广就栽在这：年号说 1796 起，另一处推出 1763 止，
   * 交出来是空的，结果把对的候选排掉了。
   */
  conflict: string | null;
}

const CN: Record<string, number> = {
  元: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 廿: 20, 卅: 30, 百: 100,
};

function cnNum(s: string): number | null {
  const t = (/([一二三四五六七八九十百廿卅\d]+)/.exec((s || '').replace(/[\s　]/g, '')) ?? [])[1];
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t in CN) return CN[t];
  let m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(t);
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
  m = /^(廿|卅)([一二三四五六七八九])?$/.exec(t);
  if (m) return CN[m[1]] + (m[2] ? CN[m[2]] : 0);
  return null;
}

export function buildWindows(people: Person[], chart: EraChart): Map<string, Window> {
  const W = new Map<string, Window>();
  const Y = (t: string | null | undefined) => chart.lookup(t).ad;

  for (const p of people) {
    const w: Window = { born: null, died: null, lo: null, hi: null, why: [], conflict: null };
    // ★ 生年殁年要走**和界面同一个来源**。
    //
    //   谱上有两种写法会把生和殁挤在一起：
    //     翻页断行——「生于X　殁于」在这一页末行，日期在下一页头一行
    //     同行连写——「民国十年十一月初五日亥时殁于一九九三年八月」
    //
    //   继喜（第25世）就是后一种：整行被当成生年，於是他「生於 1993」，
    //   而两个儿子生於 1956、1964——父亲比儿子小三十几岁，
    //   两条边因此被判成「年代不可能」。
    //
    //   界面早就用 continued() 把它切开了，判据这边却还在读原字段——
    //   **同一件事有两个来源，迟早对不上。** 这里接上同一个。
    const cont = continued(p);
    // ★ 字段为空时回原文兜底 —— 这是同一个教训的第五次。
    //
    //   葬地（34.7%）、修谱名目、配偶子女、殁年，都栽在「只信上游切好的字段」。
    //   MEMORY 记着一句：**字段划分是上游的判断，永远不能当唯一来源。**
    //
    //   承兵（27世，册4·卷八·学仁公世系·第78页）那一行是连排的：
    //       生于一九七一年五月二十八日**娶**乐氏月琴生于一九七四年八月十五日
    //   「生于」后面直接接「娶」，上游没切开，`birth` 是 null，
    //   他的年代窗口只能靠子女倒推（1909–1987），什么候选都排不掉。
    //   全谱这样的有 13 人。谱明明写了年份，我们不该说不知道。
    const rawBirth = (): string | null => {
      const t = (p.raw_text ?? '').replace(/[\s　]+/g, '');
      const m = /生於?于?([^生殁卒娶聘妣继复庶葬字讳号]{2,18}?年[^生殁卒娶聘妣继复庶葬字讳号]{0,14})/.exec(t);
      return m ? m[1] : null;
    };
    const b = Y(cont ? cont.birthText : p.birth?.text) ?? Y(rawBirth());
    const d = Y(p.death?.text) ?? (cont ? Y(cont.tail.text) : null);
    if (b) { w.born = w.lo = w.hi = b; w.why.push('谱上写了生年'); }
    if (d) { w.died = d; w.why.push('谱上写了殁年'); }
    // 寿数倒推：殁年 − 寿数 = 生年。谱自己写的两个数，减法。
    if (!b && d && p.age) {
      const a = cnNum(p.age.text);
      if (a && a >= 1 && a <= 110) {
        w.born = w.lo = w.hi = d - a;
        w.why.push(`殁 ${d} 减寿 ${a} 岁`);
      }
    }
    if (!w.born && d) { w.lo = d - 100; w.hi = d; w.why.push(`由殁年 ${d} 倒框`); }
    // 年号本身就是区间。谱上写「嘉庆　年」，数字没填，但嘉庆就是 1796–1820。
    if (!w.born && p.birth?.text) {
      const sp = chart.eraSpan(p.birth.text);
      if (sp) {
        w.lo = Math.max(w.lo ?? -9999, sp.lo);
        w.hi = Math.min(w.hi ?? 9999, sp.hi);
        w.why.push(`谱上写「${sp.era}」，那是公元 ${sp.lo}–${sp.hi} 年`);
      }
    }
    W.set(p.pid, w);
  }

  for (const p of people) {
    const w = W.get(p.pid)!;
    if (w.born) continue;
    for (const s of p.spouses) {
      const sb = Y(s.birth?.text), sd = Y(s.death?.text);
      if (sb) {
        w.lo = Math.max(w.lo ?? -9999, sb - SPOUSE_SPAN);
        w.hi = Math.min(w.hi ?? 9999, sb + SPOUSE_SPAN);
        w.why.push(`配偶生 ${sb}，夫妻年龄差按 ±${SPOUSE_SPAN} 年框`);
        break;
      }
      if (sd && w.hi == null) {
        w.lo = sd - 100; w.hi = sd;
        w.why.push(`配偶殁 ${sd}，倒框`);
        break;
      }
    }
  }

  // 子女的生年：父亲一定比子女早生 13–75 年
  //
  // ★ **只数世次差正好 1 的边。**
  //   浒公（第 13 世，明嘉靖年间的人）身上挂着三条指向他的边，
  //   来自第 28 世的宏刚、宏毅、宏军（生 1983–1987）——同名撞出来的 rank5 边，
  //   判据早就按「世次差 15 代」排掉了。可这里数子女时用的是原始 parent_edges，
  //   没过判据，於是浒公的窗口被拖成「1908–1974」，
  //   再拿去比他父亲磨公（生 1529），当然兜不拢。
  //
  //   世次是原书世代列头标死的，全谱 100% 成立——拿它当闸最稳。
  const genOf = new Map(people.map(p => [p.pid, p.gen]));
  const kids = new Map<string, number[]>();
  for (const p of people) {
    const b = W.get(p.pid)!.born;
    if (!b) continue;
    for (const e of p.parent_candidates) {
      const fg = genOf.get(e.parent);
      if (fg == null || p.gen == null || p.gen - fg !== 1) continue;
      (kids.get(e.parent) ?? kids.set(e.parent, []).get(e.parent)!).push(b);
    }
  }
  for (const [pid, ys] of kids) {
    const w = W.get(pid);
    if (!w || w.born) continue;
    const lo = Math.min(...ys) - MAX_GAP, hi = Math.max(...ys) - MIN_GAP;
    w.lo = Math.max(w.lo ?? -9999, lo);
    w.hi = Math.min(w.hi ?? 9999, hi);
    w.why.push(`已知子女生于 ${Math.min(...ys)}–${Math.max(...ys)}，父亲必早 ${MIN_GAP}–${MAX_GAP} 年`);
  }
  // ★ 收尾：区间倒过来了 = 几处线索互相矛盾 = **不知道**。清空，并记下矛盾。
  for (const w of W.values()) {
    if (!w.born && w.lo != null && w.hi != null && w.lo > w.hi) {
      w.conflict = `谱上几处对不上：一处说不早于 ${w.lo}，另一处说不晚于 ${w.hi}。`
                 + `（${w.why.join('；')}）`;
      w.lo = w.hi = null;
    }
    if (w.born != null && w.died != null && w.died < w.born) {
      w.conflict = `谱上写生 ${w.born}、殁 ${w.died}——殁在生之前。`;
    }
  }
  return W;
}

export function windowNote(w: Window | undefined): string {
  if (!w) return '';
  if (w.conflict && !w.born) return '年代说不准（谱上几处对不上）';
  if (w.born) return `生 ${w.born}` + (w.died ? `，殁 ${w.died}` : '');
  if (w.lo || w.hi) return `约生于 ${w.lo ?? '?'}–${w.hi ?? '?'} 之间`;
  return '';
}

/**
 * f 能不能当 c 的父亲？
 * **只在算术上不成立时才给出理由。** 成立不等于「就是他」，只是排不掉。
 */
export function canFather(f: Window | undefined, c: Window | undefined):
    { ok: boolean; text: string } {
  if (!f || !c) return { ok: true, text: '' };
  // 任一方的年代自相矛盾，就什么也别排——不知道就是不知道
  if (f.conflict || c.conflict) return { ok: true, text: '' };
  if (c.born && f.died != null && c.born > f.died + 1) {
    return { ok: false, text: `他殁于 ${f.died}，本人生于 ${c.born}——晚了 ${c.born - f.died} 年` };
  }
  // 本人只有区间时，**只有整个区间都不成立才算排除**。
  //
  // ★ 这里错过一次，记下来：曾经拿「本人**最早**可能的生年」去比父亲的生年——
  //   错的。本人生于 1744–1815 之间，父亲生 1753，
  //   只要本人实际生于 1790，父子差 37 岁，完全成立。
  //   要比的是**最晚**可能的生年（c.hi）：父亲连给最晚的那个当爹都嫌年轻，才不成立。
  if (!c.born && c.lo != null && f.died != null && c.lo > f.died + 1) {
    // 这条是对的：连**最早**都在他死后，那怎么都不成立
    return { ok: false, text: `他殁于 ${f.died}，本人最早也生于 ${c.lo}——晚了 ${c.lo - f.died} 年` };
  }
  if (!c.born && c.hi != null && f.lo != null && f.lo > c.hi - MIN_GAP) {
    return { ok: false, text: `他最早生于 ${f.lo}，本人最晚也生于 ${c.hi}，差不到 ${MIN_GAP} 年` };
  }
  if (!c.born && c.lo != null && f.hi != null && f.hi < c.lo - MAX_GAP) {
    return { ok: false, text: `他最晚生于 ${f.hi}，本人最早也生于 ${c.lo}，差了 ${MAX_GAP} 年以上` };
  }
  if (c.born && f.born) {
    const g = c.born - f.born;
    if (g < MIN_GAP) return { ok: false, text: `生 ${f.born}，只比本人早 ${g} 年` };
    if (g > MAX_GAP) return { ok: false, text: `生 ${f.born}，比本人早 ${g} 年` };
    return { ok: true, text: `生 ${f.born}，早 ${g} 年` };
  }
  if (c.born && f.lo && f.lo > c.born - MIN_GAP) {
    return { ok: false, text: `最早也生于 ${f.lo}，离本人（${c.born}）不够 ${MIN_GAP} 年` };
  }
  if (c.born && f.hi && f.hi < c.born - MAX_GAP) {
    return { ok: false, text: `最晚也生于 ${f.hi}，比本人（${c.born}）早了 ${c.born - f.hi} 年以上` };
  }
  return { ok: true, text: '' };
}
