/**
 * 通用条目模型。
 *
 * 这部谱里的每一样东西——人、妻女、地方、房支、世次、功名、姓、年份、
 * 卷首篇目、传赞——都长同一个形状：
 *
 *     标题 + 副题
 *     字段表（字、生、殁、葬…）
 *     正文段落
 *     关系（指向别的条目）
 *     出处与原文
 *
 * 这样加一类条目就是写一个生成器，**不碰界面**。
 * 之前四类各写一套界面函数，再加十类就是十份重复代码——那条路走不通。
 *
 * 三条规矩照旧：
 *   不猜  —— 指向多个候选时给 Link[]，由界面全部列出，不替谱选一个
 *   不漏  —— relations 里的 items 不截断；要省略必须写明省了多少
 *   可追溯 —— 每个条目必须有 sources，点开是原文
 */

export type EntryKind =
  | 'person'    // 谱上单独一条的人
  | 'ref'       // 妻、女、谱上提到但没有单独一条的人
  | 'place'     // 地方
  | 'doc'       // 卷首篇目
  | 'branch'    // 房支世系（梦林公世系…）
  | 'gen'       // 世次（第 24 世）
  | 'title'     // 功名身份（庠生、贡生、律师…）
  | 'mark'      // 标记（出嗣、迁徙、殉难、有碑…）
  | 'surname'   // 姓（娘家姓 / 夫家姓）
  | 'year'      // 年份（甲子録一行）
  | 'passage'   // 传赞、事迹、碑记——谱里唯一带感情的文字
  | 'kind'      // 事迹的类别（节烈、孝行、革命牺牲…）
  | 'revision'  // 修谱届次（1710–2016 共十届）
  | 'image';    // 山图、祠堂、祖墓、协议原件

export interface Link {
  kind: EntryKind;
  id: string;
  label: string;
  note?: string;      // 「第24世」「嗣父」这类附注
  warn?: boolean;     // 需要显眼（多个同名候选之类）
  /** 谱上写了这个名字，但连不到条目上。**照样列出来，只是不能点。** */
  plain?: boolean;
  /** 算术上不成立（如生年差 -42 岁）。**只是淡显，绝不隐藏、绝不移除。** */
  dim?: boolean;
}

export interface Fact {
  label: string;
  /** 正文。原样，不改写。 */
  value?: string;
  /** 谱上更原始的写法，小字附在下面 */
  raw?: string;
  /** 这一项指向的条目，全部列出 */
  links?: Link[];
  /** 需要显眼的说明（rank5、断链之类） */
  warn?: string;
  /** 平静的说明。算术结论走这里——不吓人，但要看得见。`**…**` 加粗。 */
  note?: string;
}

/** 文言原文 + 今译，一段对一段。原文一个字不动。 */
export interface Para { src: string; cn: string }

export interface Section {
  heading?: string;
  /** 正文原文。界面负责自动互链，这里只放纯文本。 */
  text: string;
  note?: string;
}

export interface Relation {
  heading: string;
  items: Link[];
  /** 条目太多时说明总数——**不许静默截断** */
  note?: string;
}

export interface Source {
  label?: string;
  src_human?: string;
  /** 谱上原文，一字不改 */
  raw?: string;
}

export interface Entry {
  kind: EntryKind;
  id: string;
  title: string;
  /** 跟在标题后的小字，如「第 27 世」 */
  titleNote?: string;
  subtitle?: string;
  tags?: { text: string; tone?: 'hot' | 'gold' | 'plain' }[];
  /** 必须一眼看见的（断链、无父边、同名未定） */
  alert?: string;
  facts: Fact[];
  sections: Section[];
  relations: Relation[];
  sources: Source[];
  /** 左栏是否画上溯链，以及从谁开始 */
  chainFrom?: string;
  /** 图片文件名（prototype/img/ 下） */
  image?: string;
  /** 文言原文 + 今译，一段对一段 */
  paras?: Para[];
  /** 原文里标出来的要素，界面据此把词变成可点的 */
  ents?: unknown[];
  /** 译文是谁做的：「谱」= 谱自己带的白话本；「我们」= 这一版做的 */
  transBy?: string;
  transNote?: string;
}

// ── 小工具 ──────────────────────────────────────────────────

export const NS = (s: string | null | undefined): string =>
  (s ?? '').replace(/[\s　]+/g, '');

/** 页眉带是右起横排：「子长公林梦」正着读是「梦林公长子」。原文照留，正读补上。 */
export function srcText(t: string | null | undefined): string {
  return (t ?? '').replace(/^页眉指向/, '').replace(/^「|」$/g, '');
}
export function unreverse(t: string | null | undefined): string {
  const m = /「([^」]+)」/.exec(t ?? '');
  if (!m) return '';
  const r = [...m[1]].reverse().join('');
  return r === m[1] ? '' : '，正着读是「' + r + '」';
}

/** 关系条目排序：世次在前，同世按名字。 */
export function byGen(a: Link, b: Link): number {
  const g = (l: Link) => parseInt(/第(\d+)世/.exec(l.note ?? '')?.[1] ?? '99', 10);
  return g(a) - g(b) || a.label.localeCompare(b.label);
}

/**
 * 关系太多时的处理：**不截断，只是折叠**，而且必须写明总数。
 * CLAUDE.md 第二节：不许 .slice()。这里 slice 的是「默认展开的部分」，
 * 全量始终在 items 里，界面负责给「展开全部」。
 */
export function rel(heading: string, items: Link[], softCap = 60): Relation {
  return {
    heading,
    items,
    note: items.length > softCap ? `共 ${items.length} 条` : undefined,
  };
}
