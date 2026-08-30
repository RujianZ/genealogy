/**
 * 未归属原文**这一行是谁的**——按行号位置判，不按内容猜。
 *
 * ★ 谱上一条记录是顺着往下写的：
 *
 *     开 俊
 *     字界　号肇俊
 *     生于　一九六四年十一月初一日亥时     ← 8815
 *     北师大学生                          ← 8816　这是开俊的
 *     娶冯金枝
 *     生于　一九六五年八月初五日           ← 8844
 *     中南财经大学                        ← 8845　这是冯金枝的（已经翻到第202页）
 *
 *   两行都被丢进了「未归属原文」，然后一起挂在开俊名下——
 *   於是他名片上写着他读过中南财经大学，那是他妻子的学校。
 *
 * ★ 判法只用**行号先后**：
 *   一行属于「在它上面、离它最近的那个已知字段」的主人。
 *   8816 上面最近的已知行是 8815（开俊的生年）→ 开俊。
 *   8845 上面最近的已知行是 8844（冯金枝的生年）→ 冯金枝。
 *
 *   这不是猜。谱是顺着写的，行号就是它自己的顺序。
 *   翻不翻页无所谓——行号连着，页码只是印在哪一张纸上。
 */
import type { Person } from './types.ts';

// 这里比的是**同一份 raw_text 里的两段字**（葬的原文 vs 原文的某一行），
// 同源同写法，所以去空白就够，用不着繁简折叠。
const NS = (s: string | null | undefined): string => (s ?? '').replace(/[\s　]/g, '');

export interface LineOwner {
  seq: number;
  text: string;
  page: number;
  /** null = 本人；否则是第几位配偶 */
  spouse: number | null;
  spouseName?: string;
}

/** 把本人和各位配偶已知的字段行号收齐，标上主人 */
function known(p: Person): { line: number; spouse: number | null }[] {
  const out: { line: number; spouse: number | null }[] = [];
  const take = (f: { lines?: number[] } | null | undefined, spouse: number | null) => {
    for (const l of f?.lines ?? []) if (l != null) out.push({ line: l, spouse });
  };
  take(p.zi, null); take(p.hui, null); take(p.hao, null); take(p.ming, null);
  take(p.birth, null); take(p.death, null); take(p.burial, null); take(p.age, null);
  p.spouses.forEach((s, i) => {
    take(s.birth, i); take(s.death, i); take(s.burial, i);
  });
  return out.sort((a, b) => a.line - b.line);
}

/**
 * 「第 seq 行是谁那一段的」——返回 null（本人）或第几位配偶。
 * 未归属原文、事迹段落都用这一个，判法只有一条：看它上面最近的已知字段属於谁。
 */
export function ownerAt(p: Person): (seq: number) => number | null {
  const ks = known(p);
  return (seq: number) => {
    let owner: number | null = null;
    for (const k of ks) {
      if (k.line >= seq) break;        // 已排序，超过就停
      owner = k.spouse;
    }
    return owner;
  };
}

/**
 * 「葬」是谁的——按**原文里的行位置**判。
 *
 * ★ places.json 里没有行号，只有原文。但一条记录是顺着写的：
 *
 *       壁 火
 *       生于  光绪二十六年月日时缺殁于
 *       初一日葬云山下庄屋东边向东南有碑      ← 壁火的
 *       娶汪氏                              ← 从这里起是汪氏那一段
 *       生于  光绪三十四年九月十九日子时殁于
 *       一九八四年九月初五日午时葬云山下棚上向西南有碑   ← 汪氏的
 *
 *   谱把两处葬都写在壁火这一条里，界面就并排摆了两个「葬」，
 *   看着像他一个人葬了两处。判法只有一条：**这一行在谁那一段里。**
 *
 * 返回：给一段葬的原文，答「本人」（null）或第几位配偶。
 */
// ★ 光杆的「妣李氏」也要认。加「桂妣殁于」那种写法时只写了 NAMED_MATE
//   （要求「妣」前面有个姓），把「妣李氏」这种漏在外面了，
//   於是妻子那一段的寿、葬全归到了本人名下。
const SPOUSE_LINE = /^(娶|配|妣|继娶|復娶|复娶|继配|继妣|側室|侧室|原配|元配|聘)/;
/** 「桂妣殁于…」「王妣殁于…」——抬头点了姓，那一段就是她的 */
const NAMED_MATE = /^(.)妣/;
/** 「公殁于…」——抬头写「公」，那一段是本人的 */
const SELF_LINE = /^(公|夫)/;

export function burialOwner(p: Person): (text: string) => number | null {
  const surnames = p.spouses.map(s => NS(s.name_raw).replace(/氏.*$/, '').slice(0, 1));
  const own: { line: string; owner: number | null }[] = [];
  let cur: number | null = null;
  let seen = -1;
  for (const line of (p.raw_text ?? '').split('\n')) {
    const t = NS(line);
    if (!t) continue;
    // ① 抬头明说是谁的，优先——光豫那条三位妻子，
    //    「公殁于…」「桂妣殁于…」「王妣殁于…」「汪妣殁于…」写得清清楚楚，
    //    比按「娶某氏」出现的先后去推可靠得多。
    if (SELF_LINE.test(t)) cur = null;
    else {
      const m = NAMED_MATE.exec(t);
      if (m) {
        const i = surnames.indexOf(m[1]);
        cur = i >= 0 ? i : (p.spouses.length ? 0 : null);
      } else if (SPOUSE_LINE.test(t)) { seen += 1; cur = Math.min(seen, p.spouses.length - 1); }
    }
    own.push({ line: t, owner: cur });
  }
  return (text: string) => {
    const t = NS(text);
    if (!t) return null;
    let best: { owner: number | null; n: number } | null = null;
    for (const o of own) {
      // 葬的原文可能是整行的一截，也可能**多带了下一行的头一个字**
      //（places.json 里「葬云山壬山丙向王」那个「王」就是下一行「王妣」漏进来的）。
      // 两个方向都试，取重合最长的那一行。
      const n = o.line.includes(t) ? t.length : t.includes(o.line) ? o.line.length : 0;
      if (n && (!best || n > best.n)) best = { owner: o.owner, n };
    }
    return best ? best.owner : null;
  };
}

/**
 * 葬的原文末尾多带了下一行头一个字的，去掉那个字。
 *
 *   「葬云山私山窊向东南有碑**桂**」  下一行是「桂妣殁于…」
 *   「葬葫芦顶西角南向**公**」        下一行是「公殁于…」
 *
 * ★ **只在下一行确实是结构行时才去**（公殁于／某妣／继妣／又妣／复娶／生子N／生女N…）。
 *   光看「末尾那个字等于下一行头一个字」会误伤：
 *   「葬赤堂山癸山丁**向**」的「向」是山向的一部分，下一行恰好也以「向」起头。
 *
 * ★ 去掉的只是**这一处摆出来的那行字**；本人的 raw_text 一个字没动，
 *   底下「谱上原文」照旧是完整的。
 */
const STRUCT_HEAD = /^(公殁|公卒|夫殁|.妣|妣|继娶|又妣|又娶|復娶|复娶|复妣|继妣|娶|配|生子|生女|女[一二三四五六七八九十两]|子[一二三四五六七八九十两]|迁|徙|出嗣|承嗣)/;

export function trimBleed(p: Person): (text: string) => string {
  const lines = (p.raw_text ?? '').split('\n').map(NS).filter(Boolean);
  return (text: string) => {
    const t = NS(text);
    for (let i = 0; i < lines.length - 1; i++) {
      const next = lines[i + 1];
      if (lines[i] + next[0] === t && STRUCT_HEAD.test(next)) return lines[i];
    }
    return text;
  };
}

/**
 * 寿数——**谱上写了，数据里没地方放的那些。**
 *
 *   学义   age = 年七十二（他的）
 *          原文里还有一行「年八十二」——**是他妻子的**
 *
 * `spouses` 只有生、殁、葬三格，没有寿。所以全谱 123 条配偶的寿数
 * 一条都存不下，连「未归属原文」都没进——直接不见了。
 *
 * 这里从原文里按行位置读回来（和「殁」「葬」同一套判法），
 * 只读、不改 people.json。
 */
const AGE_LINE = /^(年|享寿|寿|享年)[一二三四五六七八九十百]/;

export function agesOf(p: Person): { text: string; spouse: number | null }[] {
  const whose = burialOwner(p);          // 同一套：看这一行落在谁那一段里
  const out: { text: string; spouse: number | null }[] = [];
  for (const line of (p.raw_text ?? '').split('\n')) {
    const t = NS(line);
    if (!AGE_LINE.test(t)) continue;
    out.push({ text: t, spouse: whose(t) });
  }
  return out;
}

/** 谱上第几位配偶叫什么（原样） */
export const spouseName = (p: Person, i: number | null): string | undefined =>
  i == null ? undefined : p.spouses[i]?.name_raw;

/** 每一条未归属原文归给谁 */
export function lineOwners(p: Person): LineOwner[] {
  const at = ownerAt(p);
  return (p.unparsed ?? []).map(u => {
    const owner = at(u.seq);
    return {
      seq: u.seq, text: u.text, page: u.page,
      spouse: owner,
      spouseName: spouseName(p, owner),
    };
  });
}
