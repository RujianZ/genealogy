/**
 * 高级搜索：用亲属关系把重名分开。
 *
 * 谱里重名极多——两个士利、两个铣发、两个壁和、三个梁珍。
 * docs/直系世系 那份人工核对表第 2 条就写着：
 *     「全谱重名普遍，按名检索需连父名一起核对」
 * 这个功能就是把那句话变成能点的东西。
 *
 * **每一条筛选都是谱上写死的字，零判断**：
 *   父亲叫什么   —— p.father_name，谱原文
 *   配偶叫什么   —— p.spouses[].name_raw，谱原文
 *   儿子叫什么   —— p.sons_claimed，谱上「生子三：…」列的名字
 *   女儿嫁到哪   —— p.daughters_claimed
 *   兄弟是谁     —— 同一个 father_name 的其他人（谱自己写的父名，不是推断的边）
 *   第几世       —— 原书世代列头标死的
 *   哪一房       —— src.section，页眉写的
 *   葬在哪       —— 归拢后的葬地索引
 *
 * 不做的：不按生卒年份筛（那要换算），不按辈分推断，不按相似度打分。
 */
import { fname } from './fname.ts';
import type { Person } from './types.ts';
import type { PlaceRec } from './places.ts';
import { norm } from './norm.ts';

export interface Criteria {
  name?: string;      // 名、字、讳、号，任一
  father?: string;    // 父亲叫什么
  spouse?: string;    // 配偶叫什么（汪氏、李氏雪梅…）
  son?: string;       // 儿子叫什么
  daughter?: string;  // 女儿（适陈、华荣适商…）
  sibling?: string;   // 兄弟是谁
  gen?: number;       // 第几世
  branch?: string;    // 哪一房
  place?: string;     // 葬在哪
  title?: string;     // 功名身份
  mark?: string;      // 标记（出嗣、迁徙、有碑…）
}

export interface AdvHit {
  person: Person;
  /** 每一条筛选是靠什么命中的——原文照抄，让人自己核 */
  why: { field: string; matched: string }[];
}

const has = (hay: string | null | undefined, needle: string) =>
  !!hay && norm(hay).includes(norm(needle));

export function advancedSearch(
  people: Person[], places: PlaceRec[], c: Criteria,
  /**
   * 全站唯一的那份父母判定（entries.ts 传进来）。
   *
   * ★ 早先这里拿 **father_name 字符串**分组算兄弟，说法是「父名是谱上写的，最硬」。
   *   那句话错在：**谱里 829/2258 人同名**，父名一样完全可能是两个不同的父亲。
   *   全谱五个「继生」，他们的孩子在这里全被算成了一家人。
   *   而且这是全站第二套兄弟算法，跟卡片那套各算各的。
   *   现在一律走 pid：兄弟 ＝ 同一个父亲 pid 的孩子。
   */
  // ★ **必填。** 早先写成可选、不传就 `return []`——
  //   忘传不报错，只是静静地说「他没有兄弟」。
  //   smoke 里那条「高级搜索：按父名」就是这么调的，一直在验一个空结果。
  parents: (p: Person) => { birth: { edge: { parent: string } }[];
                            heir: { edge: { parent: string } }[] },
): AdvHit[] {
  // 兄弟：**id 对 id**。同一位父亲（生父或嗣父）名下的孩子。
  const dadsOf = (p: Person): string[] => {
    const ps = parents(p);
    return [...ps.birth, ...ps.heir].map(x => x.edge.parent);
  };
  const byDad = new Map<string, Person[]>();
  for (const p of people) {
    for (const d of dadsOf(p)) (byDad.get(d) ?? byDad.set(d, []).get(d)!).push(p);
  }
  const burialOf = new Map<string, string[]>();
  for (const r of places) {
    if (r.kind && r.kind !== '葬地') continue;
    const k = r.owner.split('/')[0];
    (burialOf.get(k) ?? burialOf.set(k, []).get(k)!).push(r.text);
  }

  const out: AdvHit[] = [];
  for (const p of people) {
    const why: AdvHit['why'] = [];
    let ok = true;

    if (c.name) {
      const a = p.aliases.find(x => has(x.form, c.name!));
      if (a) why.push({ field: a.why, matched: a.form });
      else ok = false;
    }
    if (ok && c.father) {
      if (has(p.father_name, c.father)) why.push({ field: '父名', matched: p.father_name });
      else ok = false;
    }
    // ★ 三个字段都要兜底到原文。
    //   继均娶的「李氏雪梅」不在 spouses 里，在 unparsed 那一行；
    //   开赛的儿子承健也不在 sons_claimed 里。
    //   葬地那次（burial 只覆盖 34.7%）、修谱名目那次（只按谱名找不到人），
    //   已经是同一个教训的第三遍：**字段划分是上游的判断，不能当唯一来源。**
    const inRaw = (needle: string, label: string) => {
      // 本人的名字当然出现在自己的原文里——那不算「他儿子叫承健」。
      if (p.aliases.some(a => norm(a.form) === norm(needle))) return null;
      const u = p.unparsed.find(x => has(x.text, needle));
      if (u) return { field: label + '（原文，未归入字段）', matched: u.text.trim() };
      if (has(p.raw_text, needle)) return { field: label + '（原文）', matched: needle };
      return null;
    };
    if (ok && c.spouse) {
      const s = p.spouses.find(x => has(x.name_raw, c.spouse!));
      const r = s ? { field: s.rel || '配偶', matched: s.name_raw } : inRaw(c.spouse, '配偶');
      if (r) why.push(r); else ok = false;
    }
    if (ok && c.son) {
      const s = p.sons_claimed.find(x => has(x, c.son!));
      const r = s ? { field: '生子名单', matched: s } : inRaw(c.son, '儿子');
      if (r) why.push(r); else ok = false;
    }
    if (ok && c.daughter) {
      const s = p.daughters_claimed.find(x => has(x, c.daughter!));
      const r = s ? { field: '女', matched: s } : inRaw(c.daughter, '女');
      if (r) why.push(r); else ok = false;
    }
    if (ok && c.sibling) {
      const seen = new Set<string>();
      const sibs: Person[] = [];
      for (const d of dadsOf(p)) {
        for (const x of byDad.get(d) ?? []) {
          if (x.pid === p.pid || seen.has(x.pid)) continue;
          seen.add(x.pid); sibs.push(x);
        }
      }
      const hit = sibs.find(x => x.aliases.some(a => has(a.form, c.sibling!)));
      if (hit) why.push({ field: '兄弟姐妹', matched: `${hit.name}（同一位父亲）` });
      else ok = false;
    }
    if (ok && c.gen != null) {
      if (p.gen === c.gen) why.push({ field: '世次', matched: `第${p.gen}世` });
      else ok = false;
    }
    if (ok && c.branch) {
      if (has(p.src.section, c.branch)) why.push({ field: '房支', matched: p.src.section });
      else ok = false;
    }
    if (ok && c.place) {
      const bs = burialOf.get(p.pid) ?? [];
      const b = bs.find(t => has(t, c.place!));
      if (b) why.push({ field: '葬地', matched: b });
      else ok = false;
    }
    if (ok && c.title) {
      const t = p.titles.find(x => has(x, c.title!));
      if (t) why.push({ field: '功名', matched: t });
      else ok = false;
    }
    if (ok && c.mark) {
      const m = p.marks.find(x => has(x.tag, c.mark!));
      if (m) why.push({ field: '标记', matched: m.tag + (m.text ? '：' + m.text : '') });
      else ok = false;
    }

    if (ok && why.length) out.push({ person: p, why });
  }
  out.sort((a, b) => a.person.gen - b.person.gen || a.person.pid.localeCompare(b.person.pid));
  return out;
}

/** 某个名字在谱里有几个同名的——用来提示「要不要加个条件」。 */
export function ambiguity(people: Person[], name: string): Person[] {
  const q = norm(name);
  return people.filter(p => p.aliases.some(a => norm(a.form) === q));
}
