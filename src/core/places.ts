/**
 * 地点：把葬地变成能点、能查、能反查的东西。
 *
 * 数据来自 tools/build_places.py（data/places.json），1,753 条葬地串，
 * 每条拆成 一级地名 → 路径 → 形名 → 方位。
 *
 * 界面上要做到三件事：
 *   ① 人物卡上的葬地，每一层都能点
 *   ② 点一个地方，看到葬在那儿的所有人（按小地名分组）
 *   ③ 从地方跳到卷首《山图》《各房私山》《合户雜据》里写它的那一段
 */

export interface PlaceRec {
  owner: string;          // pid，或 pid/配N（配偶）
  owner_name: string;
  gen: number | null;
  text: string;           // 「葬云山下庄屋东边向东南有碑」原文
  src_human: string;
  l1: string | null;      // 云山
  path: string[];         // ['下庄屋', '东边']
  shape: string | null;   // 金盘托果（风水形名，不是位置）
  pos: string | null;
  rest: string;
  standalone: boolean;    // 词表外的低频地名，自成一级
  groups: { group: string; note: string; via: string }[];  // 云山→多云山 这类谱内自证的归并
}

export interface ShouDoc {
  id: string; title: string; title_read: string;
  page_from: number | null; page_to: number | null;
  chars: number; text: string; mentions: string[];
}

export interface PlaceNode {
  name: string;
  full: string;               // 云山·下庄屋
  count: number;
  children: Map<string, PlaceNode>;
  recs: PlaceRec[];
}

function node(name: string, full: string): PlaceNode {
  return { name, full, count: 0, children: new Map(), recs: [] };
}

/** 建一棵地点树：一级 → 二级 → 三级，每层带人数。 */
export function buildPlaceTree(recs: PlaceRec[]): Map<string, PlaceNode> {
  const roots = new Map<string, PlaceNode>();
  for (const r of recs) {
    if (!r.l1) continue;
    let cur = roots.get(r.l1) ?? roots.set(r.l1, node(r.l1, r.l1)).get(r.l1)!;
    cur.count++; cur.recs.push(r);
    let full = r.l1;
    for (const seg of r.path) {
      full += '·' + seg;
      const next = cur.children.get(seg) ?? cur.children.set(seg, node(seg, full)).get(seg)!;
      next.count++; next.recs.push(r);
      cur = next;
    }
  }
  return roots;
}

/** 某人（含配偶）的全部葬地记录。 */
export function burialsOf(recs: PlaceRec[], id: string): PlaceRec[] {
  return recs.filter(r => r.owner === id || r.owner.startsWith(id + '/'));
}

/** 葬在某地（含其下所有小地名）的人。 */
export function peopleAt(roots: Map<string, PlaceNode>, full: string): PlaceRec[] {
  const parts = full.split('·');
  let cur = roots.get(parts[0]);
  for (const seg of parts.slice(1)) cur = cur?.children.get(seg);
  return cur ? cur.recs : [];
}

/** 卷首里写到这个地方的篇目——山图、各房私山、合户雜据。 */
export function docsAbout(docs: ShouDoc[], place: string): ShouDoc[] {
  return docs.filter(d => d.mentions.includes(place)
    || d.text.replace(/[\s　]+/g, '').includes(place));
}

/** 同一座山上还有谁——按世次排，看得出几代人葬在一处。 */
export function neighbours(recs: PlaceRec[]): PlaceRec[] {
  return [...recs].sort((a, b) => (a.gen ?? 99) - (b.gen ?? 99)
    || a.owner_name.localeCompare(b.owner_name));
}

/** 把一条葬地记录说成一句人话，每一层都可点。 */
export function chainOf(r: PlaceRec): string[] {
  return r.l1 ? [r.l1, ...r.path] : [];
}

/** 地点搜索：地名、形名、原文都查。 */
export function searchPlaces(recs: PlaceRec[], q: string): PlaceRec[] {
  const s = q.replace(/[\s　]+/g, '');
  if (!s) return [];
  return recs.filter(r =>
    (r.l1 && r.l1.includes(s)) || r.path.some(p => p.includes(s))
    || (r.shape && r.shape.includes(s)) || r.text.includes(s));
}
