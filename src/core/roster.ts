/**
 * 从一个人的原文里，按**谱自己的格式**读出他点了名的儿子和女儿。
 *
 * ★ 为什么要单独做这一步
 *
 *   people.json 里的 sons_claimed 是上游扫出来的，混进了三类东西：
 *     · 女儿——「次適吕」「三適洪」被当成儿子（referenced.json 里有 97 条）
 *     · 根本不是人名——「公殁于」「迁陕」「也」（368 条）
 *     · 传赞文字整段——「次女于归一载病来张门身故葬…」占掉了女儿的名额
 *   而 daughters_claimed 又漏了一大半：谱上写了「女N」的 663 人里，只有 200 人对得上。
 *
 *   所以子女不能信那两个字段，要回原文按谱的格式重读。
 *
 * ★ 谱的格式（只用这几条，不做别的推断）
 *
 *       生子N        开一个儿子块，等 N 个名字。N 可以没有（学信那条就是光杆「生子」）
 *       女N / 生女N   开一个女儿块
 *       名字很短，「长适柳」「次適吕」这种连排行带夫家姓也就三四个字
 *       碰上「生于／殁于／葬／娶／妣…」这些结构词，块就关了
 *
 *   一行里可能两样都有，中间**未必有空格**：开赛那条写的是「儒健生女一　　儒桢」。
 *   所以要在词里边找记号，找到就把前半截当名字收掉、后半截接着走。
 *
 *   一个人可能有**好几段**「生子N」——一位妻子一段。全部累加。
 *
 * ★ 一律不动 people.json。这里只读。
 */
import type { Person } from './types.ts';
import { norm } from './norm.ts';

const NS = norm;
const NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2,
};

/** 结构词：碰到就关块。谱上一段记完了，下一段总是从这些字起头。 */
const STOP = /^(生于|生於|殁于|殁於|卒于|卒於|葬|娶|配|妣|继娶|復娶|复娶|继配|字|号|讳|名|年[一二三四五六七八九十百]|迁|徙|出嗣|承嗣|入嗣|祧|附|例赠|敕)/;

/** 「长适柳」「次適吕」「适月」——排行字可有可无，适／適／嫁三种写法都认 */
export const HUSBAND = /^(?:长|次|三|四|五|六|七|八|九|十|幼|季|末)?[适適嫁](.)/;

/** 记号：生子N／生女N（N 可省）、子N／女N（光杆的必须带数字，不然会撞进人名） */
const MARK = /(生[子女])([一二三四五六七八九十两])?|([子女])([一二三四五六七八九十两])/;

export interface RosterName {
  /** 谱上原样的那几个字 */
  raw: string;
  /** 去掉「殁」之后的名字；谱上没写名字的（「幼殁」）就是空 */
  name: string;
  /** 谱上在名字后面写了「殁」——夭折 */
  died: boolean;
  /** 嫁到哪一家（女儿） */
  husband: string | null;
}

export interface Roster { sons: RosterName[]; daughters: RosterName[] }

/**
 * 这几个字能不能算一个名字。**占名额的只能是名字。**
 *
 * ★ 两个踩过的坑，都是「拿单个字当排除依据」：
 *     · 把带「生」的一律踢掉 → 「继生」「火生」这种真名字被误杀，109 个儿子只剩 20
 *     · 把带「于／於」「年月日」的一律踢掉 → 「长适**於**」（嫁於家）、
 *       「适**月**」（嫁月家）被当成句子踢掉，女儿丢了
 *   所以先认「适X」这个形态——认出来就是女儿，别的规则都不用管。
 */
function structural(t: string): boolean {
  return /^(公|妣|氏|弟|兄|男|女婿|迁|徙)/.test(t) || /氏/.test(t);
}

/**
 * 一个词可能是**好几个女儿挤在一起**：「长适吕次適蔡」。按适／適 切开。
 * 带年月日时的不切——那是「生辰＋适某」的记述行，不是一串名字。
 */
function splitBrides(tok: string): string[] {
  if (/[年月日时〇零一二三四五六七八九十]{4,}/.test(tok)) return [tok];
  const parts = tok.match(/(?:长|次|三|四|五|六|七|八|九|十|幼|季|末)?[适適嫁][^长次三四五六七八九十幼季末]*/g);
  return parts && parts.length > 1 ? parts : [tok];
}

function nameOf(tok: string): RosterName | null {
  const t = NS(tok);
  if (!t) return null;

  // ★ 夫家姓要取**原文那个字**，不能取折叠后的。
  //   谱上写「适於」，折叠后是「于」；拿折叠的去当姓，卡上就成了「嫁于家」——
  //   原文一字不动这条就破了。所以比对用折叠的，取字用原来的。
  const h = HUSBAND.exec(t);
  if (h) {
    // 干净的写法就三个字：排行＋适＋夫家姓（「长适柳」「次適吕」「适月」）。
    // 再长的是「生辰＋适某」那种记述行——承华那条女六，六个女儿本来都有名字
    // （杜娟、小娟、玉兰…），每个名字后面跟一行生辰。把记述行当成名字，
    // 名额就被占光，真名字反而进不来。
    if (t.length > 3) return null;
    const ho = HUSBAND.exec(tok.replace(/[\s　]/g, ''));
    return { raw: tok, name: t, died: false, husband: (ho ?? h)[1] };
  }

  // 谱上把「殁」缀在名字后面：「光月殁」是儿子光月殁了；「幼殁」是夭折没留名
  // 谱上写夭折有两个字：殁、殇（「四殇」＝第四个孩子夭折，没留名字）
  const m = /^(.*?)(幼殁|幼殇|殁|殇)$/.exec(t);
  if (m && m[1].length <= 3 && !structural(m[1])) {
    const base = m[1].replace(/^(长|次|三|四|五|六|七|八|九|十|幼|季|末)$/, '');
    return { raw: tok, name: base, died: true, husband: null };
  }

  if (t.length > 4) return null;
  if (/[于於]/.test(t)) return null;
  if (/[年月日时葬]/.test(t)) return null;
  if (structural(t)) return null;
  return { raw: tok, name: t, died: false, husband: null };
}

/**
 * 谱的排版惯例：一份名单里**共用的辈字只写一次**。
 *
 *     生子三
 *     继发      ← 头一个写全
 *     和        ← 单字，其实是「继和」
 *     才        ← 单字，其实是「继才」
 *   （原件：source/合一（1.2.3.4）.doc，壁生·光採公幼子那一条）
 *
 * 於是继和、继才两个人的父亲一直判不出来——父亲名单里明明有他们，
 * 只是写成了单字，比对时对不上。
 *
 * ★ 只在**头一个是两个字、后面是单字**时补，而且 raw 仍是谱上那一个字。
 *   补出来的只进 name（比对用），显示照旧。
 */
function shareGenChar(list: RosterName[]): void {
  const head = list.find(x => NS(x.name).length >= 2);
  if (!head) return;
  const g = NS(head.name)[0];
  for (const x of list) {
    if (NS(x.name).length === 1) x.name = g + NS(x.name);
  }
}

export function roster(p: Person): Roster {
  const sons: RosterName[] = [], daughters: RosterName[] = [];
  let want = 0, into: RosterName[] | null = null;

  const take = (tok: string): boolean => {
    if (!into || want <= 0) return false;
    // ★ 谱写了数字的时候，**数字本身就是围栏**，结构词只跳过、不关块。
    //   承华那条「女六」，六个女儿各有名字，可每个名字后面跟着一行
    //   「生于…适某」。把「生于」当成关块，后三个女儿（红晶、张兰、张果）
    //   就全丢了。没写数字的块（光杆「生子」）才靠结构词收尾。
    if (STOP.test(NS(tok))) {
      if (!Number.isFinite(want)) { into = null; want = 0; }
      return false;
    }
    let got = false;
    for (const piece of splitBrides(tok)) {
      if (!into || want <= 0) break;
      const n = nameOf(piece);
      if (!n) continue;                   // 不像名字的**跳过、不占名额**
      into.push(n);
      want -= 1;
      got = true;
      if (want === 0) into = null;
    }
    return got;
  };

  for (const lineText of (p.raw_text ?? '').split('\n')) {
    for (let tok of lineText.split(/[\s　]+/)) {
      tok = tok.trim();
      while (tok) {
        const m = MARK.exec(tok);
        if (m) {
          const head = tok.slice(0, m.index);
          if (head) take(head);
          into = /女/.test(m[1] ?? m[3] ?? '') ? daughters : sons;
          want = NUM[m[2] ?? m[4]] ?? Infinity;   // 没写数字 → 开着收
          tok = tok.slice(m.index + m[0].length);
          continue;
        }
        take(tok);
        break;
      }
    }
  }
  shareGenChar(sons);
  shareGenChar(daughters);
  return { sons, daughters };
}
