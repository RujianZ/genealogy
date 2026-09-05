/**
 * **人的表。谱里出现过的每一个人，一行，一个 id。**
 *
 * ═══ 为什么要有这一层 ═══
 *
 * 在这之前，只有「谱给了他一条独立记载」的 2,230 个男人算人。
 * 妻子是 `spouses[]` 里的一个字符串，女儿是 `daughters_claimed[]` 里的一个字符串，
 * 夭折没留下名字的儿子连字符串都算不上。於是：
 *
 *     · 她们点不开——界面上没有她们的页
 *     · 搜不到——搜索索引里没有她们
 *     · 关系计算器算不到——那套东西只认 pid
 *     · 「谁是谁的什么」永远缺一半
 *
 * 谱自己不是这么记的。它写「妣朱氏」「长适董」「四殇」，
 * 那都是**写下了一个人**，只是没给他/她单独一格。
 *
 * ═══ 规则：一个人一个 id，男女一样 ═══
 *
 *     有独立条目的  →  id 用他的名字行
 *     没有条目的    →  id 用「记到他/她的那一行」
 *
 * 格式一样：`P-{册}-{页}-{行}-{列}-L{源行号}`，同一行几个人加 `.1` `.2`。
 * 解析阶段（`parser/fields.py` 的 `KinRec`）已经发好了，这里只是把它们
 * 做成和男人同一种 `Person`，塞进同一个 `idx`——**下游一律不必区分**。
 *
 * ═══ 名字没留下来的人，照样有页 ═══
 *
 * 「妣　氏」——谱连她娘家姓都没印出来。「四殇」——第四个儿子，夭折，没名字。
 * 他们的卡片会大片空白，那正是谱的实情，凡例写着「阙其所未知」。
 * 空着不是缺陷，**把人抹掉才是**。
 */

import type { Person } from './types.ts';

/** 谱上记到、但没有独立条目的人（parser 的 KinRec） */
export interface Kin {
  /** 「记到他的那一行」的坐标。这条记载本身的 id，恒有值 */
  at: string;
  /** 这个人的 id。妻／女＝at；儿子留空，由关系层判定后并到他自己的条目 */
  person: string;
  role: '妻' | '女' | '子';
  rel_raw: string;      // 娶·继娶·聘·妣·侧室
  ordinal: string;      // 长·次·幼·三…
  name_raw: string;     // 谱上写的原样
  given: string;        // 她/他自己的名
  surname: string;      // 妻：娘家姓；女：夫家姓
  named: boolean;
  died_young: boolean;
  line_seq: number;
}

/** 附记之人在表里多带的几格 */
export interface Attached {
  role: '妻' | '女' | '子';
  /** 记在谁那一条里 */
  of: string;
  of_name: string;
  kin: Kin;
}

export type AnyPerson = Person & { attached?: Attached };

/** 谱上写的原样，去掉排版空格 */
const flat = (s: string) => (s ?? '').replace(/[\s　]+/g, '');

/**
 * 给一个附记之人取显示名。**不编造**：
 *   有名有姓 →「朱氏」「刘氏春梅」照抄谱上写的
 *   只有姓   →「董氏」（女儿只留夫家姓时，谱的写法是「适董」，这里作「适董」）
 *   什么都没有 → 按谱写的行次称呼：「四殇」「妣氏」
 */
function kinName(k: Kin): string {
  if (k.role === '女') {
    // 「长适刘」是谱的写法：行次「长」＋嫁给「刘」家。
    // 那不是她的名字。有名就用名（第 25 世以后才开始有），
    // 没名就叫「长女」「次女」——谱没写的不替它写。
    if (k.given) return flat(k.given);
    if (k.ordinal) return `${k.ordinal}女`;
    // 连行次都没有时，至少把夫家姓抬出来（谱写「适赵」）
    return k.surname ? `适${k.surname}` : '女';
  }
  if (k.role === '子') {
    if (k.given) return flat(k.given);
    return k.ordinal ? `${k.ordinal}子` : '子';
  }
  const raw = flat(k.name_raw);
  if (raw) return raw;
  return k.surname ? `${k.surname}氏` : '氏';
}

const EMPTY = {
  zi: null, hui: null, hao: null, ming: null,
  birth: null, death: null, burial: null, age: null,
  titles: [] as string[], marks: [] as { tag: string; text: string }[],
  spouses: [] as Person['spouses'],
  sons_claimed: [] as string[], daughters_claimed: [] as string[],
  unparsed: [] as Person['unparsed'],
  parent_candidates: [] as Person['parent_candidates'],
  parent_edges: [] as Person['parent_edges'],
};

/**
 * 把附记之人做成 `Person`，和有条目的人放进同一份名单。
 *
 * ★ 儿子只在**谱里没有他自己那一条**时才materialize。
 *   有条目的儿子已经是人了，再造一个就成了一人两 id——那正是要避免的事。
 *   哪些儿子有条目，由关系层（`resolve.ts`）判定，这里用它给的映射。
 *
 * @param sonResolved  儿子名单槽 at → 他自己条目的 pid（判定得出来的才有）
 */
export function materialize(
  people: Person[],
  sonResolved: Map<string, string> = new Map(),
): AnyPerson[] {
  const out: AnyPerson[] = [...people];
  const taken = new Set(people.map(p => p.pid));

  for (const host of people) {
    const kins = ((host as any).kin ?? []) as Kin[];
    for (const k of kins) {
      // 有自己条目的儿子：不另造，指回他本人
      if (k.role === '子' && sonResolved.has(k.at)) continue;
      const pid = k.person || k.at;
      if (taken.has(pid)) continue;
      taken.add(pid);

      const gen = k.role === '妻' ? host.gen : host.gen + 1;
      const name = kinName(k);
      // ★ 她的生卒葬写在丈夫那一条里（`spouses[]`）——跟着她走。
      //   不搬过来的话，她的卡片上什么都没有，而谱其实写了。
      const sp = k.role === '妻'
        ? (host.spouses ?? []).find(x => (x as any).pid === k.person)
        : undefined;
      const marks: { tag: string; text: string }[] = [];
      if (k.died_young) marks.push({ tag: '无后', text: flat(k.name_raw) || '幼殁' });
      out.push({
        ...EMPTY,
        birth: sp?.birth ?? null, death: sp?.death ?? null, burial: sp?.burial ?? null,
        marks,
        pid,
        name,
        name_raw: k.name_raw || name,
        gen,
        father_name: k.role === '妻' ? '' : host.name,
        filiation: k.role === '妻' ? '' : (k.ordinal ? `${k.ordinal}${k.role}` : ''),
        father_src: k.role === '妻' ? '' : `记在${host.name}那一条里`,
        is_heir: false,
        aliases: [{ form: name, why: k.role === '妻' ? '谱写的称呼' : '谱写的行次' }]
          .filter(a => a.form),
        src: host.src,
        src_human: host.src_human,
        // 原文只留她/他那一行——不要把丈夫整条都算成她的
        // 原文只留她/他那几行——不要把丈夫整条都算成她的
        raw_text: [k.rel_raw + (k.name_raw || name),
                   sp?.birth ? '生于' + String.fromCharCode(10) + sp.birth.text : '',
                   sp?.death ? '殁于' + String.fromCharCode(10) + sp.death.text : '',
                   sp?.burial ? sp.burial.text : ''].filter(Boolean).join(String.fromCharCode(10)),
        attached: { role: k.role, of: host.pid, of_name: host.name, kin: k },
      } as AnyPerson);
    }
  }
  return out;
}

/** 是不是附记之人（没有独立条目的） */
export const isAttached = (p: AnyPerson): boolean => !!p.attached;

/* ═══════════════════════════════════════════════════════════════════════════
 * 名字 → pid：**全站只在这里配一次**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 谱本身没有 id，它靠名字串把人连起来（「生子三　继赐　继坤　继春」）。
 * 这一步躲不掉，但**只该做一次**，配完就固化成 pid，后面全站不再碰字符串。
 *
 * 早先是每建一张卡片就重配一遍（`entries.ts::kidsOf` 里那个
 * `NSx(k.child.name) === NSx(r.name)`），既慢，又意味着同一个名字在不同
 * 地方可能配到不同的人。
 *
 * 配的依据不是「名字一样」，而是**关系层已经判定的父子边**：
 * 儿子 C 判定的父亲是 F，那 C 就去认领 F 名单里叫这个名字的那个槽。
 * 换句话说：**先有 id 之间的边，再回头认名单槽**，不是反过来。
 */
export function linkSons(
  people: Person[],
  fatherOf: (pid: string) => string[],
  norm: (s: string) => string,
): Map<string, string> {
  const byPid = new Map(people.map(p => [p.pid, p]));
  const out = new Map<string, string>();      // 名单槽 at → 儿子自己的 pid
  const used = new Set<string>();

  for (const c of people) {
    const forms = new Set([norm(c.name), ...c.aliases.map(a => norm(a.form))]);
    for (const fpid of fatherOf(c.pid)) {
      const f = byPid.get(fpid);
      if (!f) continue;
      const slots = ((f as any).kin ?? []) as Kin[];
      const hit = slots.find(k => k.role === '子' && !used.has(k.at)
        && (forms.has(norm(k.given)) || forms.has(norm(k.name_raw))));
      if (hit) { out.set(hit.at, c.pid); used.add(hit.at); break; }
    }
  }
  return out;
}
