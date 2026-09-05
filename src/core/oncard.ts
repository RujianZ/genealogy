/**
 * **原文这一行，卡片上算不算有。**
 *
 * ═══ 为什么要单独一个模块 ═══
 *
 * 这件事一度有两套写法：`tools/cardgap.mjs` 一套、`tools/audit100.mjs` 一套。
 * 两套的「引导词算不算内容」「名单数目行算不算内容」规则不一样，
 * 於是同一份数据，一个报 40 条缺失、另一个报 76 条——**两个答案**。
 *
 * 判断规则只该有一处。两个工具都读这里。
 *
 * ═══ 什么叫「卡片上有」 ═══
 *
 * 谱的一行不一定原样出现在卡片上，卡片会把它拆成标签＋值：
 *
 *     原文「字鸣九」      →  卡片：标签「字」＋值「鸣九」
 *     原文「学大公次子」  →  卡片：「父」那一栏的链接
 *     原文「妣殁于」      →  **引导词**，只说明下一行是谁的、是生还是殁，
 *                            本身不是信息；它带出来的那个日期已经归位
 *     原文「生子二」      →  **名单数目行**，孩子本人都列在子女栏里，
 *                            数目就是行数
 *     原文「女一适赵」    →  数目＋内容，「适赵」要查，「女一」不用
 *
 * 所以判「有没有」得先把这几层剥掉再比。剥完还剩东西、而那东西
 * 在卡片上一个字都找不到——那才是真的丢了。
 */

import { norm } from './norm.ts';

/** 去掉排版空格再归一 */
export const flat = (s: string | null | undefined) =>
  norm((s ?? '').replace(/[\s　]+/g, ''));

/** 行首的字段引导词：「娶」「妣」「生于」「字」… */
const LEAD = /^(原|继|續|续|復|复|又|再|副|侧)?(娶|聘|妣|配|室|生于|生於|殁于|殁於|葬|字|讳|諱|号|號|名)/;
/** 「公殁于民国二十九年…」——引导词写在行首，后面直接跟值 */
const LEAD_HEAD = /^(公妣|公|妣|原妣|继妣|繼妣|续妣|又妣|復妣|复妣|[一-鿿][妣氏])?(生于|生於|殁于|殁於|葬)/;
/** 「…亥时殁于」——引导词写在行尾，值在下一行 */
const LEAD_TAIL = /(生于|生於|殁于|殁於)$/;
/** 「生子二」「女三」——名单数目 */
const COUNT_HEAD = /^(生子|生女|养子|季子|女)[一二三四五六七八九十两]/;
/** 整行就是一个引导词 */
const LEAD_ONLY = /^(公妣|公|妣|原妣|继妣|续妣|又妣|复妣|[一-鿿][妣氏])?(生于|生於|殁于|殁於|葬)$/;
/** 整行就是一个数目 */
const COUNT_ONLY = /^(生子|生女|养子|季子|女)[一二三四五六七八九十两]$/;
/** 「学大公次子」——父名＋行次，卡片做成了「父」那一栏的链接 */
const FILIATION = /^[一-鿿]{1,4}公?(之子|[长次幼元三四五六七八九十]子|嗣子|祧子)$/;

/** 把一张卡片上用户能看见的字全铺平成一串 */
export function cardText(e: any): string {
  return [
    ...(e.facts ?? []).flatMap((f: any) => [
      f.label, f.value, f.raw, (f.label ?? '') + (f.value ?? ''), f.note,
      ...(f.links ?? []).flatMap((l: any) => [l.label, l.note, l.raw]),
    ]),
    ...(e.relations ?? []).flatMap((r: any) => [
      r.heading, ...(r.items ?? []).flatMap((i: any) => [i.label, i.note]),
    ]),
    ...(e.sections ?? []).flatMap((s: any) => [s.heading, s.text]),
    e.title, e.subtitle,
  ].filter(Boolean).map(flat).join(' ');
}

/**
 * 原文这一行，在卡片上找得到吗。
 *
 * @param line     谱上那一行（原样）
 * @param onCard   `cardText()` 铺平后的卡片文字
 * @param elsewhere 别处也算数的文字（配偶那一段在她自己卡上，不算丢）
 */
export function coveredByCard(line: string, onCard: string, elsewhere = ''): boolean {
  const t = flat(line);
  if (t.length < 2) return true;                       // 一个字的行不判
  if (onCard.includes(t) || elsewhere.includes(t)) return true;
  if (LEAD_ONLY.test(t) || COUNT_ONLY.test(t)) return true;   // 引导词、数目，本身不是信息

  // 剥掉引导词／数目／行次，再比一次
  const t2 = t.replace(LEAD, '').replace(FILIATION, '');
  if (!t2 || onCard.includes(t2)) return true;
  const t3 = t.replace(LEAD_HEAD, '').replace(LEAD_TAIL, '').replace(COUNT_HEAD, '');
  if (t3 !== t && (!t3 || onCard.includes(t3) || elsewhere.includes(t3))) return true;

  // 谱把一句印成几行、卡片是接起来摆的：逐字查一遍再判。
  // ★ 「别处」也算——「娶吴氏生年未详」这一行，「吴氏」在丈夫卡片上、
  //   「生年未详」在她自己那一页上，两处合起来一个字都没丢。
  const all = onCard + ' ' + elsewhere;
  return [...t].every(c => all.includes(c));
}

/** 这一行长什么样——报告里按形状归堆用 */
export function lineShape(line: string): string {
  const t = flat(line);
  if (/^(生子|生女|女)[一二三四五六七八九十]/.test(t)) return '名单数目行';
  if (/^(公|妣|原妣|继妣)?(生|殁|歿|葬)/.test(t)) return '生殁葬行';
  if (/^[一二三四五六七八九十零〇0-9]|年|月|日|时/.test(t)) return '日期行';
  if (/[适適]/.test(t)) return '嫁女行';
  return '其他';
}
