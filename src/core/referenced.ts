/**
 * 附记之人：谱里提到、但没有独立条目的人。
 *
 *   配偶 1,740  「妣汪氏」「娶李氏雪梅」
 *   女儿   888  「女一 适陈」——只有夫家姓
 *   幽灵子 837  父亲的生子名单点了名，全谱却查无条目指回
 *   合计 3,465，比有条目的 2,258 还多 1,207。
 *
 * 他们不是某个男人的属性，是人。每人一个 rid，从宿主 pid 推出，自带出处。
 * 重名不合并——两个「汪氏」就是两个人，除非谱自己说是一个。合并才是猜。
 *
 * 数据由 tools/build_referenced.py 生成（带守恒断言），见 data/referenced.json。
 */
import type { Field, Person } from './types.ts';

export interface Referenced {
  rid: string;            // P-册3-0205-4-1-0/配1
  host: string;           // 宿主 pid
  host_name: string;
  role: '配偶' | '女' | '子（谱中无条目）';
  rel_raw: string;        // 妣 / 娶 / 继娶 / 复娶 / 聘 / 庶
  rel_class: string;      // 元配 / 继配 / 侧室 / 聘 / 女儿 / 幽灵子
  name_raw: string;       // 原文，永不改写
  gen: number | null;
  surname: string | null;
  given: string | null;
  husband_surname?: string | null;   // 女儿：夫家姓
  ordinal?: string | null;           // 长 / 次 / 幼
  form_ok: boolean;       // 姓名形式认不认得出；false 的原样存，不硬解析
  birth: Field | null;
  death: Field | null;
  burial: Field | null;
  src_human: string;
  host_raw_text: string;
  /** 疑似记述本人、但写在宿主条目里的段落。**只标候选，不判定归属。** */
  narrative_candidates: {
    text: string; seq: number; page: number; why: string; note: string;
  }[];
}

/** 该怎么称呼她/他——只用谱上写了的，写不出就说写不出。 */
export function displayName(r: Referenced): string {
  const n = (r.name_raw ?? '').replace(/[\s　]+/g, '');
  if (r.role === '女') {
    // ★ 谱没写名字时，**照抄谱上那几个字**，别一律写成「（谱未书名）」。
    //   继均「女二：长适柳、幼适柳」——两个女儿都嫁柳家，谱是靠「长／幼」
    //   分开的。原先只取 given（空）和夫家姓，两行渲染成一模一样，
    //   看上去像同一个人重复了两遍。长、幼是谱自己写的字，不能丢。
    const who = r.given
      ? `${r.given}${r.husband_surname ? '·适' + r.husband_surname : ''}`
      : n;
    return `${r.host_name}之女 ${who || '（谱未书名）'}`;
  }
  if (r.role === '子（谱中无条目）') return n || '（谱未书名）';
  return n || '（谱未书名）';
}

/** 一句话说清她/他和谱的关系，界面上顶在卡片最上面。 */
export function relationLine(r: Referenced): string {
  if (r.role === '配偶') return `${r.host_name}（第${r.gen}世）之${r.rel_raw || '配'}　${r.rel_class}`;
  if (r.role === '女') return `${r.host_name}（第${r.gen}世）之女`;
  return `${r.host_name}声明的儿子——谱中查无条目指回`;
}

export function buildRefIndex(refs: Referenced[]) {
  const byRid = new Map<string, Referenced>();
  const byHost = new Map<string, Referenced[]>();
  for (const r of refs) {
    byRid.set(r.rid, r);
    (byHost.get(r.host) ?? byHost.set(r.host, []).get(r.host)!).push(r);
  }
  return { byRid, byHost };
}

/** 同姓的其他配偶——不是"同一个人"，是"同姓"。措辞上必须分清。 */
export function sameSurname(refs: Referenced[], r: Referenced): Referenced[] {
  if (!r.surname) return [];
  return refs.filter(x => x.rid !== r.rid && x.role === '配偶' && x.surname === r.surname);
}

// ── 搜索：她们必须能被搜到本人，而不是搜出她们的丈夫 ──────────────
import { norm, homophoneKey, editDistance } from './norm.ts';

export interface RefMatch { field: string; text: string; score: number; why: string; snippet?: string }
export interface RefHit { ref: Referenced; matches: RefMatch[]; score: number }

/**
 * 搜「汪氏」应该出 971 位汪氏本人，不是 971 个丈夫。
 * 和 search.ts 一样：命中处全列，不只留最高分那条；分数只排序不筛除。
 */
export function searchReferenced(refs: Referenced[], query: string): RefHit[] {
  const q = norm(query);
  if (!q) return [];
  const qk = homophoneKey(q);
  const hits: RefHit[] = [];

  const cmp = (form: string, label: string): RefMatch | null => {
    const f = norm(form);
    if (!f) return null;
    if (f === q) return { field: label, text: form, score: 1.0, why: `${label}完全相同` };
    if (homophoneKey(f) === qk) return { field: label, text: form, score: 0.85, why: `${label}同音（${form}）` };
    const short = Math.min(q.length, f.length);
    if (q.includes(f) || f.includes(q)) {
      return short >= 2
        ? { field: label, text: form, score: 0.7, why: `${label}互相包含（${form}）` }
        : { field: label, text: form, score: 0.2, why: `${label}单字包含（${form}）——可能是巧合` };
    }
    if (editDistance(q, f) <= 1 && Math.max(q.length, f.length) >= 2) {
      return { field: label, text: form, score: 0.6, why: `${label}差一字（${form}）` };
    }
    return null;
  };

  const txt = (s: string, label: string, base: number): RefMatch | null => {
    if (!s) return null;
    const n = norm(s);
    if (!n.includes(q)) return null;
    const i = n.indexOf(q);
    return { field: label, text: s, score: base, why: `${label}中出现`,
             snippet: s.slice(Math.max(0, i - 12), i + 28).replace(/\n/g, '｜') };
  };

  for (const r of refs) {
    const ms: RefMatch[] = [];
    const push = (m: RefMatch | null) => { if (m) ms.push(m); };

    push(cmp(r.name_raw, r.role === '女' ? '女·原文写法' : '姓名'));
    if (r.surname) push(cmp(r.surname, '姓'));
    if (r.given) push(cmp(r.given, '名'));
    if (r.husband_surname) push(cmp(r.husband_surname, '夫家姓'));
    if (r.rel_raw) push(cmp(r.rel_raw, '关系词'));
    push(cmp(r.host_name, '所系之人（丈夫／父亲）'));
    for (const [lab, f] of [['生', r.birth], ['殁', r.death], ['葬', r.burial]] as const) {
      if (f) push(txt(f.text, `${lab}的原文`, 0.45));
    }
    for (const n of r.narrative_candidates) push(txt(n.text, '疑似记述本人的段落', 0.4));

    if (ms.length) {
      ms.sort((a, b) => b.score - a.score);
      hits.push({ ref: r, matches: ms, score: ms[0].score });
    }
  }
  hits.sort((a, b) => b.score - a.score
    || b.matches.length - a.matches.length
    || (a.ref.gen ?? 99) - (b.ref.gen ?? 99)
    || a.ref.rid.localeCompare(b.ref.rid));
  return hits;
}

/** 宿主的全部附记之人，按角色排。 */
export function householdOf(byHost: Map<string, Referenced[]>, p: Person): Referenced[] {
  const order = { 配偶: 0, 女: 1, '子（谱中无条目）': 2 } as Record<string, number>;
  return [...(byHost.get(p.pid) ?? [])].sort(
    (a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.rid.localeCompare(b.rid));
}
