/**
 * 翻页断行的复原：「生于X　殁于」写在这一页的末行，日期在**下一页**头一行。
 *
 * ★ 谱上这一条的写法是固定的：`生于 X` `殁于 Y` `葬 Z` `娶 W` `生于 V`。
 *   五世一图，每张图五行；第 5 行到下一张图的第 1 行要翻页。
 *   翻页处解析器丢了线索：「殁于」留在生年那一行的末尾，
 *   日期掉进了「未归属原文」，名片上「殁」这一栏就空着——**而谱上写着**。
 *
 *   全谱 113 处。继均（第 25 世）那一条还多错一层：
 *   下一页的两行里，第二行是**他妻子**的生年，却被并进了他自己的「生」栏，
 *   於是「生」里塞了两个日期，「娶李氏雪梅」整个丢掉了。
 *
 * ★ 这不是猜。用的只有**行号顺序**：
 *   「殁于」在第 8753 行，未归属原文在第 8786 行，两者之间没有别的行。
 *   谱怎么排的，就怎么读回来。原文一个字不改，出处照旧标到页。
 *
 * ★ people.json 一个字没动。复原只活在显示层。
 */
import type { Person } from './types.ts';

const NS = (s: string | null | undefined) => (s ?? '').replace(/[\s　]/g, '');
const MARK = ['殁于', '殁於', '卒于', '卒於'];

export interface Continued {
  /** 「生」栏里真正属於本人的那一行，原样（末尾就挂着「殁于」） */
  birthText: string;
  /** 「殁于」后面接的那一行，原样 */
  tail: { text: string; page: number; seq: number };
  /** 「生」栏里被并进来、其实排在 tail 之后的行——多半是妻子的生年 */
  stray: string[];
}

/**
 * 只在**谱上写了「殁于」而「殁」栏是空的**时候才做。
 * 已经有殁年的人一律不碰。
 */
export function continued(p: Person): Continued | null {
  if (p.death) return null;
  const raw = p.birth?.text;
  if (!raw) return null;
  const parts = raw.split('｜').map(s => s.trim()).filter(Boolean);
  const lines = p.birth?.lines ?? [];
  const i = parts.findIndex(s => MARK.some(m => NS(s).endsWith(m)));
  if (i < 0) return null;

  // 「殁于」那一行的行号。行数和段数对不上时不做——宁可不显示，也不接错。
  const at = lines.length === parts.length ? lines[i] : lines[lines.length - 1];
  if (at == null) return null;

  // 紧接着的那一条未归属原文（seq 最小且大於「殁于」所在行）
  let tail: Continued['tail'] | null = null;
  for (const u of p.unparsed ?? []) {
    if (u.seq == null || u.seq <= at) continue;
    if (!tail || u.seq < tail.seq) tail = { text: u.text, page: u.page, seq: u.seq };
  }
  if (!tail) return null;

  // 「生」栏里排在 tail 之后的那些行，不属於本人
  const stray = parts.filter((_, j) => j !== i
    && lines.length === parts.length && lines[j] > tail!.seq);

  return { birthText: parts[i], tail, stray };
}
