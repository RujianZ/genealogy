/**
 * 「出嗣」语句：**写在生父那一条上**，一句话给出三样东西。
 *
 *     朝相（第16世 63页）：啟蒙　啟昌　啟训　**次子啟昌出嗣朝阳**
 *     梁樟（第22世 315页）：光耀 光煌 光炳　**长子光耀出嗣胞弟梁柯**
 *     泽泗（第21世 306页）：梁模　**次子梁模出嗣二弟泽汉**
 *
 *   一句话里有：
 *     ① 这孩子是**写者的**第几子     —— 生父这一边，谱的原话
 *     ② 他出嗣给了谁                 —— 嗣父这一边，谱的原话
 *     ③ 那位跟写者什么关系（胞弟／二弟／长兄…）—— **定人的钥匙**
 *
 * ★ 承健指出来的：兼祧和出嗣不是一回事。
 *     兼祧　一个儿子承两房，生父这边照样算他（继华：生父壁林＋兼祧壁洲、壁银）
 *     出嗣　人整个过去了，生父的香火他不管（启昌字焕先：生父朝相→嗣父朝阳）
 *   谱用的是两个词，我们也该分开记——**这是谱的记法，不是我们的分类**。
 *
 * ★ 之前判据只认「立X为嗣」（160 条），**完全没用上「出嗣」（127 条）**。
 *   两者是同一种证据的两个方向：
 *       立X为嗣　写在**嗣父**那一条上
 *       X出嗣Y　 写在**生父**那一条上
 *   一个不用，等於把谱说过的话丢掉一半。
 *
 * ★ 关系词那把钥匙跟兼祧那条一样好使：「出嗣**二弟**泽汉」——
 *   泽汉是写者泽泗的二弟，也就是跟泽泗**同一个父亲**。
 *   全谱好几个泽汉，这一句就定死了是哪个。
 */
import type { Person } from './types.ts';
import { norm } from './norm.ts';
import { fname } from './fname.ts';

const W = (s: string | null | undefined) => norm(s ?? '').replace(/[\s　]/g, '');
const bare = (s: string | null | undefined) => fname(s).replace(/公$/, '');

/** 兄弟关系词——说的是「写者的」兄弟，也就是跟写者同父 */
// ★ 关系词要收全，收不全名字就会被截错：
//   「出嗣**房弟**梁园」漏了「房弟」，抓出来的名字就成了「房弟」；
//   「出嗣**大兄**梁元」「出嗣**胞弟**光X」同理。
//   谱里这类词的写法：〔长次二三四五六幼／胞亲堂房嫡从大小〕＋〔兄弟叔伯〕
const SIBW = '(?:长|次|二|三|四|五|六|七|八|九|幼|季|末|胞|亲|堂|房|族|嫡|从|大|小)?'
           + '(?:兄|弟|叔|伯|姪|侄)';

/**
 * 哪些关系词意味着**同一个父亲**。
 *
 * ★ 这里错过一次：把「堂弟」「房弟」也当成了同父。
 *     胞弟／亲弟／二弟／长兄　→　亲兄弟，**同父**
 *     堂弟／房弟／族弟／从弟　→　**堂兄弟，父亲不是同一个**（是叔伯的儿子）
 *     叔／伯／姪　　　　　　　→　差着辈，更不是同父
 *   拿同父去卡堂兄弟，21 个人的嗣父边被无故排掉。
 */
export const sameFatherRel = (rel: string): boolean =>
  !!rel && !/[堂房族从從]/.test(rel) && /[兄弟]$/.test(rel);
/** 排行＋子 */
const ORD = '长|次|二|三|四|五|六|七|八|九|十|幼|季|末';

/**
 * 「X子Y出嗣〔关系词〕Z」。名字取整两个字——这谱的人名一律是「辈字＋名」。
 * （踩过坑：想用「到下一个词为止」的前瞻，可原文后面常跟着「妣殁于…」，前瞻就断了。）
 */
const RE = new RegExp(
  `(${ORD})子((?!出嗣)[^\\s，。；、]{2})(出嗣|出继|出繼|出祠)((?:${SIBW})?)([^\\s，。；、]{2})`, 'g');

export interface OutHeir {
  /** 写这句话的人 —— 孩子的生父 */
  bornFather: Person;
  /** 谱写的排行（长／次／幼…） */
  ord: string;
  /** 孩子的名字，谱上原样那两个字 */
  child: string;
  /** 用的哪个词：出嗣／出继／出祠 */
  verb: string;
  /** 关系词（「胞弟」「二弟」…），没写就是空 */
  rel: string;
  /** 嗣父的名字 */
  heirFather: string;
}

const CACHE = new WeakMap<Person, OutHeir[]>();

/** 一个人的原文里，所有「X子Y出嗣Z」语句 */
export function outHeirs(p: Person): OutHeir[] {
  let hit = CACHE.get(p);
  if (hit) return hit;
  hit = [];
  for (const m of W(p.raw_text).matchAll(RE))
    hit.push({ bornFather: p, ord: m[1], child: m[2], verb: m[3], rel: m[4], heirFather: m[5] });
  CACHE.set(p, hit);
  return hit;
}

export interface HeirFact {
  /** 谁出嗣了 */
  child: string;
  /** 生父 */
  bornFather: Person;
  /** 嗣父的名字（还没定到具体是哪一位同名的） */
  heirFatherName: string;
  /** 嗣父跟生父的关系（同父兄弟时，可以拿来在同名里定人） */
  rel: string;
  ord: string;
  verb: string;
}

/**
 * 全谱的出嗣事实，按**孩子的名字**索引。
 *
 * 只索引名字，不索引 pid——因为同名的人可能有好几个，
 * 定到具体哪一位是判据的事，这里只把谱说过的话摆出来。
 */
export function buildOutHeirIndex(people: Person[]): Map<string, HeirFact[]> {
  const m = new Map<string, HeirFact[]>();
  for (const p of people)
    for (const o of outHeirs(p)) {
      const k = bare(o.child);
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push({
        child: o.child, bornFather: p, heirFatherName: bare(o.heirFather),
        rel: o.rel, ord: o.ord, verb: o.verb,
      });
    }
  return m;
}

/**
 * 这个人是**出嗣**还是**兼祧**？——只看谱用的词，不推断。
 *
 *   出嗣／出继／出祠　人整个过去了，生父的香火他不管
 *   兼祧　　　　　　　一人承两房，生父这边照样算
 *   都没写　　　　　　不知道
 */
export function heirKind(people: Person[], p: Person): '出嗣' | '兼祧' | null {
  const me = [bare(p.name), ...p.aliases.map(a => bare(a.form))];
  for (const q of people) {
    const t = W(q.raw_text);
    if (!me.some(x => x && t.includes(x))) continue;
    for (const o of outHeirs(q)) if (me.includes(bare(o.child))) return '出嗣';
    if (/兼祧/.test(t) && me.some(x => x && t.includes(x))) return '兼祧';
  }
  // 本人自己那一条写「兼祧」的
  if (/兼祧/.test(W(p.raw_text))) return '兼祧';
  return null;
}
