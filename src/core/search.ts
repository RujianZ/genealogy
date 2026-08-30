/**
 * 搜索。翻译自 parser/search.py，并按「甭管是什么信息，全部写下来」扩了字段。
 *
 * 两条规矩：
 *   1. 匹配上的**全部返回**。分数只决定顺序，不决定去留。
 *      没有 slice，没有 limit，没有阈值过滤。
 *   2. 一个人身上**所有命中的地方都列出来**，不是只留最高分那一条。
 *      上一版有个 best 变量只保留最高分、而且别名命中后就 continue，
 *      结果原文、未归属那 3,221 行、配偶名、生子名单全都搜不到。那是藏信息。
 *
 * 覆盖的字段：谱名 / 字 / 讳 / 号 / 名 / 去敬称形式（aliases 已含）、
 * 配偶名、生子名单、女儿（只有夫家姓）、功名、标记、生卒葬原文、
 * 未归属原文（解析器认不出的那些）、以及 raw_text 全文兜底。
 *
 * 不用向量：人名两三个字没有语义可嵌；而且向量只给分数、说不出理由，
 * 违反「可追溯」。这里每条命中都带一句人话解释为什么命中。
 */
import type { Person } from './types.ts';
import { norm, homophoneKey, editDistance } from './norm.ts';
import { isFragment } from './fragment.ts';
import { canonical } from './seealso.ts';

/** 一个人身上的一处命中 */
export interface Match {
  field: string;      // 命中在哪个字段：谱名 / 字 / 配偶 / 生子 / 未归属原文 …
  text: string;       // 命中的那个写法（原样）
  score: number;
  why: string;        // 为什么算命中，一句人话
  snippet?: string;   // 原文上下文
}

export interface Hit {
  person: Person;
  /** 该人身上全部命中处，按分数降序。**不截断。** */
  matches: Match[];
  /** = matches[0].score，只用于排序 */
  score: number;
}

/** 名字类字段的比对阶梯。返回 null 表示没命中。 */
function compareName(q: string, qk: string, form: string, label: string): Omit<Match, 'field' | 'text'> | null {
  const f = norm(form);
  if (!f) return null;
  if (f === q) return { score: 1.00, why: `${label}完全相同` };
  if (homophoneKey(f) === qk) return { score: 0.85, why: `${label}同音（${form}）` };
  if (q.includes(f) || f.includes(q)) {
    // 单字包含多半是巧合（搜「生殁缺」不该让一个字叫「生」的人排在最前面）。
    // 按「不漏」照样返回，但降到 0.20，排在所有实质命中之后。
    const short = Math.min(q.length, f.length);
    return short >= 2
      ? { score: 0.70, why: `${label}互相包含（${form}）` }
      : { score: 0.20, why: `${label}单字包含（${form}）——可能是巧合` };
  }
  if (editDistance(q, f) <= 1 && Math.max(q.length, f.length) >= 2) {
    return { score: 0.60, why: `${label}差一字（${form}）` };
  }
  return null;
}

/** 文本类字段：只判包含，分数低，但一条不漏。 */
function compareText(q: string, text: string, label: string, base: number): Omit<Match, 'field' | 'text'> | null {
  if (!text) return null;
  const n = norm(text);
  if (!n.includes(q)) return null;
  const i = n.indexOf(q);
  return {
    score: base,
    why: `${label}中出现`,
    snippet: text.slice(Math.max(0, i - 14), i + 30).replace(/\n/g, '｜'),
  };
}

export function search(people: Person[], query: string): Hit[] {
  const q = norm(query);
  if (!q) return [];
  const qk = homophoneKey(q);
  const hits: Hit[] = [];

  // ★ 详前条折回完整条：兼祧的人在谱上有好几条，搜出来该是**一个人**。
  //   搜「继华」原来出三个（361／362／363 页），其实是同一位（字东华）。
  const seenCanon = new Set<string>();
  for (const p0 of people) {
    const p = canonical(people, p0);
    if (seenCanon.has(p.pid)) continue;
    seenCanon.add(p.pid);
    // ★ 解析残渣不是人，搜索里不该出现。
    //   谱把不知道的月日时留空（「生于民国二十一年　月　日　时」），
    //   解析器在「…日　时」处断出了一条记录，把这两个字当成了名字。
    //   全谱 26 条。判断层早就不认它们了，搜索这一层之前忘了挡。
    if (isFragment(p)) continue;
    const ms: Match[] = [];
    const push = (field: string, text: string, r: Omit<Match, 'field' | 'text'> | null) => {
      if (r) ms.push({ field, text, ...r });
    };

    // ① 本人的各种叫法（谱名/字/讳/号/名/去敬称）——aliases 已经算好
    for (const { form, why } of p.aliases) push(why, form, compareName(q, qk, form, why));

    // ② 配偶。女性在谱里没有独立条目，只作「妣某氏」附在男性下，
    //    不查这里就等于全谱一半的人搜不到。
    for (const s of p.spouses) {
      push('配偶', s.name_raw, compareName(q, qk, s.name_raw, `${s.rel}${s.name_raw}`));
    }

    // ③ 父名（原文写的字符串，未必连得上条目）
    if (p.father_name) push('父名', p.father_name, compareName(q, qk, p.father_name, '所记父名'));

    // ④ 本人条目里「生子X：…」列的名字，以及只有夫家姓的女儿
    for (const n of p.sons_claimed) push('生子名单', n, compareName(q, qk, n, '生子名单'));
    for (const n of p.daughters_claimed) push('女', n, compareName(q, qk, n, '女（夫家姓）'));

    // ⑤ 功名、标记（出嗣/迁徙/殉难/节烈/传赞…）
    for (const t of p.titles) push('功名', t, compareText(q, t, '功名', 0.50));
    for (const m of p.marks) push('标记', m.tag, compareText(q, m.tag + (m.text ?? ''), `标记「${m.tag}」`, 0.50));

    // ⑥ 生卒葬原文。地名、山向、年号都在这里，照样能搜。
    for (const [label, f] of [['生', p.birth], ['殁', p.death], ['葬', p.burial], ['寿', p.age]] as const) {
      if (f) push(label, f.text, compareText(q, f.text, `${label}的原文`, 0.45));
    }

    // ⑦ 未归属原文——解析器认不出的那 3,221 行。传赞、碑记、旌表、
    //    「生殁缺」这类缺失声明都在里面。一行都要能搜到。
    for (const u of p.unparsed) push('未归属原文', u.text, compareText(q, u.text, '未归属原文', 0.35));

    // ⑧ raw_text 全文兜底：上面七类都没抓到、但原文里确实有的
    if (!ms.length) push('原文', query, compareText(q, p.raw_text, '原文', 0.30));

    if (ms.length) {
      ms.sort((a, b) => b.score - a.score);
      hits.push({ person: p, matches: ms, score: ms[0].score });
    }
  }

  // 只排序，不筛除
  hits.sort((a, b) => b.score - a.score
    || b.matches.length - a.matches.length
    || (a.person.gen ?? 99) - (b.person.gen ?? 99)
    || a.person.pid.localeCompare(b.person.pid));
  return hits;
}
