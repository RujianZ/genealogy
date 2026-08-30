/** people.json 的数据契约。字段语义见 CLAUDE.md 第三节。只读，不改写。 */

export interface Field { text: string; lines: number[] }
export interface Alias { form: string; why: string }

/** 父边。**这是数组里的一条，不是唯一的一条。** */
export interface ParentEdge {
  child: string; child_name: string;
  parent: string; parent_name: string;
  kind: '生父' | '嗣父';
  evidence: 'claim_named' | 'sole_homonym' | 'stated_adopt' | 'honorific' | 'homonym_one_of';
  rank: 1 | 2 | 3 | 4 | 5;
  evidence_cn: string;
  matched_as: string;
  child_src: string; parent_src: string;
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
