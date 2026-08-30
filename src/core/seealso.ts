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
    && !isSeeAlso(q) && (q.birth || (q.sons_claimed ?? []).length)
    && sameZi(p, q));
}

/**
 * 两条记录的**字／讳／号**对不对得上。
 *
 * ★ 只按「同名同世」找同一个人是不够的：
 *     继华　册2·卷四·朝泰公世系·第361页　**字东华**　生1955
 *     继华　册3·卷七·朝阳公世系·第294页　**字金龙**　生1920
 *   两个都是第25世、都叫继华，可字不同、生年差 35 年，**是两个人**。
 *   不加这道闸，362 页那条详前会把 294 页也认成「自己的完整条」，
 *   於是另一个人的父亲（壁温、壁福）混进来。
 *
 * ★ 兼祧会跨房（承贵的四条横跨朝寿房和学义房），所以**不能用房去分**，
 *   只能用谱自己写在人身上的字号。两边都没写字号的，不判——放过。
 */
function sameZi(a: Person, b: Person): boolean {
  const forms = (x: Person) => new Set(
    [x.zi?.text, x.hui?.text, x.hao?.text, x.ming?.text]
      .filter(Boolean).map(t => norm(String(t)).replace(/[\s　]/g, '')));
  const A = forms(a), B = forms(b);
  if (!A.size || !B.size) return true;          // 有一边没写字号 → 不拿它排除
  for (const x of A) if (B.has(x)) return true;
  return false;
}

/**
 * 同一个人的**全部记录**（不含自己）。
 *
 * 兼祧的人，谱在他承的每一房下各立一条：
 *     继华　册2·卷四·朝泰公世系·第361页　「壁洲公嗣子」　生庚写全
 *     继华　同房·第362页　「壁银公嗣子」　「生庚俱详前」
 *     继华　同房·第363页　「壁林公之子」　「生庚俱详前」
 * 而壁林那一条末句写着「子继华兼祧长兄壁洲　二兄壁银」——三条对得上。
 *
 * ★ 这三条**写的父亲加起来，就是他父亲的全部**。
 *   谱为每一房各写了一次，不会漏；没写到的那位（比如册3 朝阳房的壁温，
 *   那是**另一个**继华的生父，字金龙、生1920，本位字东华、生1955）
 *   一定是同名撞进来的。
 *
 * ★ 只认谱自己写了「详前」的那些，一条都不多认。
 */
export function sameAs(people: Person[], p: Person): Person[] {
  const k = norm(p.name);
  const same = people.filter(q => q.pid !== p.pid && q.gen === p.gen && norm(q.name) === k);
  if (isSeeAlso(p)) {
    // 本人是详前条：完整条 + 其余详前条，都得指得回同一条完整的
    const full = fullRecordOf(people, p);
    if (!full.length) return [];
    return same.filter(q => full.includes(q)
      || (isSeeAlso(q) && fullRecordOf(people, q).some(x => full.includes(x))));
  }
  // 本人是完整条：谁的「详前」指回我
  return same.filter(q => isSeeAlso(q) && fullRecordOf(people, q).includes(p));
}
