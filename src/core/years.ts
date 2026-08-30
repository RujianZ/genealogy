/**
 * 生卒年 → 公元，以及「这个人能不能当那个人的父亲」的算术。
 *
 * ★ 这一整个模块只做两件事：**查表**和**减法**。
 *
 *   查表   —— 查的是《甲子録》，谱自己附在卷首的年号对照表（卷首 151–164 页）。
 *             不是我换算的，不是外部万年历。
 *   减法   —— 父亲的生年减儿子的生年。
 *
 *   两样都是客观的，所以能做。
 *
 * ★ 明确不做的（CLAUDE.md 第四节 + 第七节）：
 *
 *   不做年号→公历的**月日**换算。「民国十九年八月」实际是公历 1931 年 1 月，
 *   因为农历腊月还在庚午年里。年份对、月份错——每一次这种换算都是判断。
 *   所以这里只取**年**，原文的月日时一个字不动，界面照原样显示。
 *
 *   不删边、不自动选。算出「这个候选比本人小 42 岁」之后，
 *   界面把这句话摆在候选旁边，**候选照样列出来，照样能点**。
 *   判断是看的人做的，不是这个函数做的。
 *
 * ★ 查不到就说查不到。不估、不推、不「大概是」。
 */

/** 《甲子録》的一行。谱上原样，era/ord 可能是按改元年份数出来的（labeled）。 */
export interface EraRow {
  era: string; ord_cn: string; ord: number | null;
  ganzhi: string; ad: number; label: string;
  raw?: string; labeled?: boolean; note?: string; alias_of?: string;
}

const NS = (s: string) => (s || '').replace(/[\s　]/g, '');

const CN: Record<string, number> = {
  元: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 廿: 20, 卅: 30,
};

function cn2int(s: string): number | null {
  if (s in CN) return CN[s];
  let m = /^(廿|卅)([一二三四五六七八九])?$/.exec(s);
  if (m) return CN[m[1]] + (m[2] ? CN[m[2]] : 0);
  m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
  return null;
}

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
// 己 巳 已 三个字在刻本里几乎分不开。**但纠错不靠猜**：
// 天干位上只能是十个天干，地支位上只能是十二个地支，
// 位置一定，合法值就只剩一个。
const CONFUSE: Record<string, string> = { 己: '巳', 巳: '己', 已: '己' };
const DYN = /^(大清|大明|皇清|皇明|清朝|明朝|元朝|宋朝|清|明|元|宋|唐)/;
// 避讳改字与异体：清代避乾隆讳，「弘」写成「宏」。谱里两种都有。
const VAR: Record<string, string> = {
  宏治: '弘治', 崇正: '崇祯', 天啓: '天启', 啓: '启',
  萬曆: '万历', 万暦: '万历', 康煕: '康熙',
};

/**
 * 写法归一。**这些不是「没记」，是「写法我没认」**——
 * 「同治一年」（=元年）、「二0一0年」（阿拉伯0混进中文数字）、
 * 「明宏治己酉年」（带朝代 + 避讳改字）、「康熙辛己年」（干支形近字）。
 * 每一条都能核，改了什么会一并说出来。
 */
export function normalizeYearText(t: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  let s = t;
  if (/[0Oo]/.test(s) && /[一二三四五六七八九〇零]/.test(s)) {
    const s2 = s.replace(/[0Oo]/g, '〇');
    if (s2 !== s) { notes.push('把混在中文数字里的 0／O 当作〇'); s = s2; }
  }
  for (const [a, b] of Object.entries(VAR)) {
    if (s.includes(a)) { s = s.split(a).join(b); notes.push(`「${a}」按「${b}」查`); }
  }
  const m = DYN.exec(s);
  if (m && s.length > m[1].length + 2) {
    notes.push(`去掉朝代前缀「${m[1]}」`); s = s.slice(m[1].length);
  }
  s = s.replace(/([一-鿿])([一-鿿])年/g, (all, a, b) => {
    if (GAN.includes(a) && ZHI.includes(b)) return all;
    let na = a, nb = b;
    if (!GAN.includes(a) && CONFUSE[a] && GAN.includes(CONFUSE[a])) {
      notes.push(`天干位上的「${a}」只能是「${CONFUSE[a]}」`); na = CONFUSE[a];
    }
    if (!ZHI.includes(b) && CONFUSE[b] && ZHI.includes(CONFUSE[b])) {
      notes.push(`地支位上的「${b}」只能是「${CONFUSE[b]}」`); nb = CONFUSE[b];
    }
    return na + nb + '年';
  });
  const s3 = s.replace(/([一-鿿]{2,4})一年/g, '$1元年');
  if (s3 !== s) { notes.push('「X一年」按「X元年」查'); s = s3; }
  return { text: s, notes };
}

const RE_ERA = /([一-鿿]{2,4}?)(元|[一二三四五六七八九十廿卅]{1,3})年/g;
const RE_GZ = /([一-鿿]{2,4}?)([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
const RE_AD = /(一九|二零|二〇|20|19)([〇零一二三四五六七八九\d]{2,3})年/;
const AD_CN: Record<string, string> = {
  〇: '0', 零: '0', 一: '1', 二: '2', 三: '3', 四: '4',
  五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
};

/** 查年结果。查不到时 ad 为 null，why 说清为什么查不到。 */
export interface YearHit {
  ad: number | null;
  /** 靠什么查到的 / 为什么查不到——原样给用户看 */
  why: string;
  /** 一个写法对应两个年份时，两个都在这里。**不挑。** */
  ambiguous?: number[];
}

export class EraChart {
  private byLabel = new Map<string, number>();
  private byGz = new Map<string, number[]>();
  private byAd = new Map<number, EraRow[]>();
  /** 每个年号覆盖的公元年份区间 */
  private spans = new Map<string, { lo: number; hi: number }>();

  constructor(rows: EraRow[]) {
    for (const r of rows) {
      if (r.label && !this.byLabel.has(NS(r.label))) this.byLabel.set(NS(r.label), r.ad);
      if (r.era && r.ganzhi) {
        const k = NS(r.era) + NS(r.ganzhi);
        const a = this.byGz.get(k) ?? [];
        // 一个年号跨过一轮甲子（康熙 61 年、乾隆 60 年）时，
        // 同一个干支会出现两次。两个都留着。
        if (!a.includes(r.ad)) a.push(r.ad);
        this.byGz.set(k, a);
      }
      const l = this.byAd.get(r.ad) ?? [];
      l.push(r); this.byAd.set(r.ad, l);
      if (r.era) {
        const sp = this.spans.get(r.era);
        if (!sp) this.spans.set(r.era, { lo: r.ad, hi: r.ad });
        else { sp.lo = Math.min(sp.lo, r.ad); sp.hi = Math.max(sp.hi, r.ad); }
      }
    }
  }

  rowsFor(ad: number): EraRow[] { return this.byAd.get(ad) ?? []; }

  /**
   * 年号本身就是一段年份。**哪怕后面的数字是空的**——
   * 谱上写「嘉庆　　年」，年份没填，但「嘉庆」已经把它框在 1796–1820 里了。
   * 泽广就是这么定下来的：他生于嘉庆年间，而候选铣辕殁于 1795。
   */
  eraSpan(text: string | null | undefined): { era: string; lo: number; hi: number } | null {
    if (!text) return null;
    const t = NS(text);
    let best: { era: string; lo: number; hi: number } | null = null;
    for (const [era, sp] of this.spans) {
      if (t.includes(era) && (!best || era.length > best.era.length)) {
        best = { era, lo: sp.lo, hi: sp.hi };
      }
    }
    return best;
  }

  /** 从生卒原文里查出公元**年**。只取年，月日时一个字不碰。 */
  lookup(text: string | null | undefined): YearHit {
    if (!text) return { ad: null, why: '谱上没写' };
    const raw = NS(text);
    // 先按原样查；查不到再归一写法变体重查，并把改了什么一并说出来。
    const first = this.lookup1(raw);
    if (first.ad != null || first.ambiguous) return first;
    const { text: fixed, notes } = normalizeYearText(raw);
    if (fixed === raw) return first;
    const second = this.lookup1(fixed);
    if (second.ad == null && !second.ambiguous) return first;
    return { ...second, why: second.why + '（' + notes.join('；') + '）' };
  }

  private lookup1(t: string): YearHit {

    // ① 现代写法：一九九九年 / 2013年
    const m0 = RE_AD.exec(t);
    if (m0) {
      const head = ({ 一九: '19', 二零: '20', 二〇: '20' } as Record<string, string>)[m0[1]] ?? m0[1];
      const tail = [...m0[2]].map(c => AD_CN[c] ?? c).join('');
      const n = parseInt(head + tail.slice(0, 2), 10);
      if (!isNaN(n)) return { ad: n, why: '原文就是公元纪年' };
    }

    // ② 年号＋第几年：「光绪二十六年」
    RE_ERA.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = RE_ERA.exec(t));) {
      const [, era, ordc] = m;
      if (cn2int(ordc) == null) continue;
      for (const k of [NS(era) + ordc + '年', era.length > 2 ? NS(era.slice(1)) + ordc + '年' : null]) {
        if (k && this.byLabel.has(k)) {
          return { ad: this.byLabel.get(k)!, why: `《甲子録》查得「${k}」` };
        }
      }
    }

    // ③ 年号＋干支，不带「年」字：「乾隆丙辰十一月初一日戌时」——谱里最常见
    RE_GZ.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = RE_GZ.exec(t));) {
      const [, era, gz] = m;
      for (const k of [NS(era) + gz, era.length > 2 ? NS(era.slice(1)) + gz : null]) {
        if (!k || !this.byGz.has(k)) continue;
        const ads = this.byGz.get(k)!;
        if (ads.length === 1) return { ad: ads[0], why: `《甲子録》查得「${k}」` };
        // 同一个年号里这个干支出现了两次。**两个都报，不挑一个。**
        return {
          ad: null, ambiguous: ads.slice().sort((a, b) => a - b),
          why: `「${k}」在《甲子録》里对应 ${ads.join(' 和 ')} 两年——`
             + `这个年号跨了一轮甲子，干支转回来了。谱上没写是哪一年。`,
        };
      }
    }
    return { ad: null, why: '《甲子録》里查不到这个写法' };
  }
}

/**
 * 父子生年差的算术结论。
 *
 * verdict 只有三档，**没有「大概」「可能」这种档**：
 *   'impossible' —— 差 <13 或 >75 岁，或父亲比儿子晚生。这是算出来的，不是猜的。
 *   'ok'         —— 差在 13–75 之间。**这不等于「就是他」**，只是排不掉。
 *   'unknown'    —— 有一方没生年，算不了。
 */
export type AgeVerdict = 'impossible' | 'ok' | 'unknown';

export interface AgeCheck {
  verdict: AgeVerdict;
  gap: number | null;
  /** 一句白话，直接摆给用户看 */
  text: string;
}

/** 十三岁到七十五岁——写死在这里，谁都能核，不是模型调出来的。 */
export const MIN_GAP = 13;
export const MAX_GAP = 75;

export function checkAge(fatherAd: number | null, childAd: number | null,
                         fatherWhy = '', childWhy = ''): AgeCheck {
  if (fatherAd == null || childAd == null) {
    return { verdict: 'unknown', gap: null, text: '生年不详' };
  }
  const gap = childAd - fatherAd;
  if (gap < MIN_GAP || gap > MAX_GAP) {
    return {
      verdict: 'impossible', gap,
      text: gap <= 0 ? `生 ${fatherAd}，比他还晚 ${-gap} 年`
                     : `生 ${fatherAd}，差 ${gap} 岁`,
    };
  }
  return { verdict: 'ok', gap, text: `生 ${fatherAd}，差 ${gap} 岁` };
}

/**
 * 一个人的多个父候选，逐个算一遍。
 *
 * ★ **返回的是全部候选，一个都不删。** 算术结论挂在每个候选身上，
 *   界面把「差 -42 岁，当不了父亲」写在旁边，人自己看。
 *   这就是 CLAUDE.md 说的「不猜」：我们不替谱做决定，
 *   我们只把谱上已经写着的数字摆到一起，让差别自己显出来。
 */
export interface EdgeAge<T> { edge: T; check: AgeCheck }

export function ageAllEdges<T>(
  chart: EraChart,
  childBirth: string | null | undefined,
  edges: T[],
  birthOf: (e: T) => string | null | undefined,
): { rows: EdgeAge<T>[]; childYear: YearHit; ruledOut: number; left: number } {
  const cy = chart.lookup(childBirth);
  const rows = edges.map(e => {
    const fy = chart.lookup(birthOf(e));
    return { edge: e, check: checkAge(fy.ad, cy.ad, fy.why, cy.why) };
  });
  const ruledOut = rows.filter(r => r.check.verdict === 'impossible').length;
  return { rows, childYear: cy, ruledOut, left: rows.length - ruledOut };
}
