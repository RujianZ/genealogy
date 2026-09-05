/** people.json 的数据契约。字段语义见 CLAUDE.md 第三节。只读，不改写。 */

export interface Field { text: string; lines: number[] }
export interface Alias { form: string; why: string }

/** 父边。**这是数组里的一条，不是唯一的一条。** */
export interface ParentEdge {
  child: string; child_name: string;
  parent: string; parent_name: string;
  kind: '生父' | '嗣父';
  evidence: 'claim_named' | 'sole_homonym' | 'stated_adopt' | 'stated_adopt_homonym'
          | 'honorific' | 'homonym_one_of';
  rank: 1 | 2 | 3 | 4 | 5;
  evidence_cn: string;
  matched_as: string;
  child_src: string; parent_src: string;
  /**
   * ★ 只有 stated_adopt_homonym 才有：这句过继语句点的那个名字，
   *   全谱有几个人叫。people.json 里没有这个字段，是读取时算出来的。
   */
  homonyms?: number;
}

export interface Spouse {
  rel: string; name_raw: string;
  birth: Field | null; death: Field | null; burial: Field | null;
}

export interface Person {
  pid: string; name: string; name_raw: string; gen: number;
  zi: Field | null; hui: Field | null; hao: Field | null; ming: Field | null;
  father_name: string; filiation: string; father_src: string; is_heir: boolean;
  aliases: Alias[];
  /** ★ 可能 0 条、1 条、或多条。任何情况下都不许取第一条当答案。 */
  /**
   * ★ **谱面支持的全部候选——题面，不是答案。**
   *
   *   谱不写 id，只写名字。壁嘉那一条写「长子继定出嗣胞弟**壁松**」，
   *   而全谱有三个壁松——解析层只能把三个全记下来，每条标 evidence。
   *   它回答不了「哪一个」，因为要回答得先知道壁嘉的父亲是谁——
   *   而那本身就是要建的那张图。鸡生蛋，所以必须两遍。
   */
  parent_candidates: ParentEdge[];
  /**
   * ★ **判定后的答案——每一条指向一个 pid。**
   *
   *   由 `tools/writeback.mjs` 写回（建图第二遍的结果）。
   *   继定的嗣父就是 `P-册3-0026-4-0-L1082`，**不是「三个壁松之一」**。
   *
   *   这才是外键。拿到这份 JSON 的任何人——后人、另一个程序、
   *   不跑我们这套 TS 的人——看到的都是答案，不是谜题。
   *
   *   谱写的「壁松」两个字照旧在 `father_name` 和 `raw_text` 里，一字不改；
   *   变的只是「引用」这一格。
   */
  parent_edges: ParentEdge[];
  birth: Field | null; death: Field | null; burial: Field | null; age: Field | null;
  titles: string[];
  marks: { tag: string; text: string }[];
  spouses: Spouse[];
  sons_claimed: string[]; daughters_claimed: string[];
  unparsed: { seq: number; text: string; page: number; tagged: boolean }[];
  src: { vol: string; page: number; row: number; col: number; juan: string; section: string };
  src_human: string;
  raw_text: string;
}
