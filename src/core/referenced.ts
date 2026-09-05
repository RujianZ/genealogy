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


/** 同姓的其他配偶——不是"同一个人"，是"同姓"。措辞上必须分清。 */

// ── 搜索：她们必须能被搜到本人，而不是搜出她们的丈夫 ──────────────
import { norm, homophoneKey, editDistance } from './norm.ts';
import { isNotAPerson } from './fragment.ts';

export interface RefMatch { field: string; text: string; score: number; why: string; snippet?: string }
export interface RefHit { ref: Referenced; matches: RefMatch[]; score: number }

/**
 * 搜「汪氏」应该出 971 位汪氏本人，不是 971 个丈夫。
 * 和 search.ts 一样：命中处全列，不只留最高分那条；分数只排序不筛除。
 */

/** 宿主的全部附记之人，按角色排。 */

/* ═══════════════════════════════════════════════════════════════════════════
 * ★★ **不再读 referenced.json——从人自己的 `kin` 派生。**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * referenced.json 那 3,192 行，是同一批人的**第四套包装**：
 *     配偶 1,559 ≡ people.kin 妻 1,559
 *     女    1,040 ≡ people.kin 女 1,040
 *     子（谱中无条目）593 ⊂ kin 子
 * 一个不差。它多出来的只有 rel_class（元配／继配）和 content_class（姓名形态），
 * 而那两个都是 `kin` 里已有数据的**函数**——不该存，算就行了。
 *
 * 多一张表就多一套要同步的实现。删。
 */
export function householdFromKin(p: Person & { kin?: KinLike[] }): Referenced[] {
  const kin = p.kin ?? [];
  return kin.map((k, i) => ({
    rid: k.at || `${p.pid}#${i}`,
    host: p.pid, host_name: p.name,
    role: k.role === '妻' ? '配偶' : k.role === '女' ? '女' : '子（谱中无条目）',
    rel_raw: k.rel_raw ?? '',
    // 元配／继配／侧室／聘——用谱自己写的那个字算，不存
    rel_class: k.role !== '妻' ? (k.role === '女' ? '女儿' : '幽灵子')
      : /继|續|复|復|又|再/.test(k.rel_raw ?? '') ? '继配'
      : /侧室|庭|庶/.test(k.rel_raw ?? '') ? '侧室'
      : /聘/.test(k.rel_raw ?? '') ? '聘（未过门或幼殇）' : '元配',
    name_raw: k.name_raw ?? '',
    gen: k.role === '妻' ? p.gen : (p.gen ?? 0) + 1,
    surname: k.role === '妻' ? (k.surname || null) : null,
    given: k.given || null,
    husband_surname: k.role === '女' ? (k.surname || null) : null,
    form_ok: !!k.named,
    content_class: k.named ? (k.given ? '姓名·有名' : '姓名·某氏') : '谱没写名字',
    birth: null, death: null, burial: null,
    src_human: p.src_human, host_raw_text: p.raw_text,
    narrative_candidates: [],
  })) as unknown as Referenced[];
}

interface KinLike {
  at: string; role: string; rel_raw?: string; name_raw?: string;
  given?: string; surname?: string; named?: boolean;
}
