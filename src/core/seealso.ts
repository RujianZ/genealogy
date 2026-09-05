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

/* ═══════════════════════════════════════════════════════════════════════════
 * 人工核定的同人表（data/同一个人.json）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 谱写了「详前」、可名字印得不一样，算法指不回去：
 *     继振　册3 p396　壁晶公之子　字妹汶　（完整条）
 *     壁振　册3 p397　壁五公祧子　字妹汶　「详前」
 *     壁振　册3 p398　壁六公祧子　字妹汶　「详前」
 * 名字头一字印成了「壁」。**这种事不该让算法猜**，
 * 人回谱面看完再写进表里。效力最高，和 data/人工判定.json 一个意思。
 */
export interface SameOne { 详前条: string; 完整条: string; 名?: string; 依据: string; 核对: string }
let MANUAL_SAME = new Map<string, string>();
/** 装入人工同人表。全站只在建注册表时装一次。 */
export function loadSameOne(rows: SameOne[]): void {
  MANUAL_SAME = new Map(rows.map(r => [r.详前条, r.完整条]));
}

const NS = (s: string | null | undefined) => (s ?? '').replace(/[\s　]/g, '');
// ★ 谱也往**后**指：「承先／开銮公祧子／字先良／**生娶详后**」——
//   一子三祧，前两条只写题名和字，生庚娶氏写在第三条上。全谱 3 处（详后 3 次），
//   跟「详前」是同一个词，只是方向相反。早先漏了这个词，三条各成一人，
//   於是开荣名下挂着三个「承先」，其实是同一个人承了三房。
const SEEALSO = /详前|詳前|详上|詳上|详后|詳后|詳後|详後|俱详|俱詳|同前|见前|見前/;

/** 这一条是不是「详前」条 */
export const isSeeAlso = (p: Person): boolean => SEEALSO.test(NS(p.raw_text));

/**
 * 它指回哪一条：同名、同世、且写得更全的那条（有生年或有生子名单）。
 * 找不到就返回空——**绝不硬凑**。
 */
export function fullRecordOf(people: Person[], p: Person): Person[] {
  // ★ 人工核定优先：表里写了就照写的算，不再比名字。
  const fixed = MANUAL_SAME.get(p.pid);
  if (fixed) { const q = people.find(x => x.pid === fixed); return q ? [q] : []; }
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
  // 同名同世的，加上人工表里指到同一条的（名字印得不一样也算）
  const manual = new Set<string>();
  for (const [see, full] of MANUAL_SAME) {
    if (see === p.pid) { manual.add(full); for (const [s2, f2] of MANUAL_SAME) if (f2 === full) manual.add(s2); }
    if (full === p.pid) manual.add(see);
  }
  manual.delete(p.pid);
  const same = people.filter(q => q.pid !== p.pid
    && (manual.has(q.pid) || (q.gen === p.gen && norm(q.name) === k)));
  if (manual.size) return people.filter(q => manual.has(q.pid));
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

/**
 * 这一条**该折回到谁身上**。
 *
 * 兼祧的人在谱上有好几条，只有一条写全（完整条），其余写「生庚俱详前」。
 * 父边已经在 backlink 里并到完整条上了，可**列人的地方**还各列各的：
 *     搜「继华」出来三个（其实是同一个人）
 *     他自己那一页，兄弟姐妹里有两个「继华」——那是他自己
 *     三个父亲的子女栏里各摆一个，看着像三个儿子
 *
 * ★ 承健定的规矩：**同一个人只该有一个 id、一张卡片，可以跟多人有关系。**
 *   所以凡是「列人」的地方（搜索、兄弟姐妹、子女栏）都走这个函数折一次，
 *   折完再按 id 去重。三个父亲那边照样各自看得见他——那是三条关系，
 *   不是三个人。
 *
 * ★ 详前条本身仍然可以点开（界面上「同一个人的完整记录」指得回去），
 *   只是不再作为独立的一个人出现在名单里。
 */
export function canonical(people: Person[], p: Person): Person {
  // 人工表里写了就照写的折（哪怕那一条没写「详前」两个字）
  const fixed = MANUAL_SAME.get(p.pid);
  if (fixed) return people.find(x => x.pid === fixed) ?? p;
  if (!isSeeAlso(p)) return p;
  const full = fullRecordOf(people, p);
  return full.length === 1 ? full[0] : p;   // 指不明白的（好几条或没有）就不折
}
