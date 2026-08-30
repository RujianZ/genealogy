/**
 * 「详前」条：**同一个人，谱记了第二遍。**
 *
 *   壁鍙（册3·卷五·第32页）光茹公嗣子　字运鸿　生于咸丰十年…　生子六…
 *   壁鍙（册3·卷五·第38页）光庆公嗣子　字运鸿　**「生庚娶氏俱详前」**
 *
 * 一个人两个嗣父，谱按凡例双记（「不忘所自出」）。第二条只写一句
 * 「详前」，指回前面那条完整的。继盟更是一子三祧，三条。
 * 全谱 25 条这样的记录。
 *
 * ★ 这不是错，是谱的写法。但数据里成了两个人，於是
 *   「同一个父亲名下有两个同名的儿子」这种矛盾就冒出来了。
 *   界面上要直接说清楚：这一条是谁的第二处记录，完整的在哪。
 *
 * ★ 只认**谱自己写了「详前」**的那些。没写的一律不合并——
 *   同名同世的两个人本来就可能真是两个人。
 */
import type { Person } from './types.ts';
import { norm } from './norm.ts';

const NS = (s: string | null | undefined) => (s ?? '').replace(/[\s　]/g, '');
const SEEALSO = /详前|詳前|详上|詳上|俱详|俱詳|同前|见前|見前/;

/** 这一条是不是「详前」条 */
export const isSeeAlso = (p: Person): boolean => SEEALSO.test(NS(p.raw_text));

/**
 * 它指回哪一条：同名、同世、且写得更全的那条（有生年或有生子名单）。
 * 找不到就返回空——**绝不硬凑**。
 */
export function fullRecordOf(people: Person[], p: Person): Person[] {
  if (!isSeeAlso(p)) return [];
  const k = norm(p.name);
  return people.filter(q => q.pid !== p.pid && q.gen === p.gen && norm(q.name) === k
    && !isSeeAlso(q) && (q.birth || (q.sons_claimed ?? []).length));
}
