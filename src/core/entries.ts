/**
 * 条目生成器：把各份数据变成统一形状的 Entry。
 *
 * 界面只认 Entry，不认 people.json / places.json 的字段。
 * 加一类条目 = 在这里加一个 build 函数 + 注册到 registry，界面一行不用改。
 */
import { fname } from './fname.ts';
import type { Person, ParentEdge } from './types.ts';
import type { Referenced } from './referenced.ts';
import type { PlaceRec, ShouDoc } from './places.ts';
import type { Entry, Link, Fact, Relation } from './entry.ts';
import { NS, srcText, unreverse, rel } from './entry.ts';
import { buildIndex, childrenOf, edgeNote, countSameName } from './lineage.ts';
import { buildRefIndex, householdOf, displayName, relationLine } from './referenced.ts';
import { buildPlaceTree, burialsOf, peopleAt, docsAbout, neighbours, chainOf } from './places.ts';
import type { EraRow } from './years.ts';
import { EraChart } from './years.ts';
import { buildWindows } from './activity.ts';
import { candidates, kept } from './candidates.ts';
import { withBacklinks, backlinkCount } from './backlink.ts';
// ★ entry.ts 里那个 NS 只去空格，**不带 947 条繁简异体折叠**。
//   名字比对一律用这个 norm，别用那个。这个坑前后踩过五次。
import { norm as NSx } from './norm.ts';
import { continued } from './continued.ts';
import { roster } from './roster.ts';
import { ownerAt, burialOwner, trimBleed, agesOf } from './owner.ts';
import { fullRecordOf } from './seealso.ts';
import { isStory } from './story.ts';

/** 原文里标出来的一处要素：谁 / 在哪 / 什么时候 */
export interface Ent {
  kind: 'person' | 'place' | 'year';
  /** 命中的原文片段，一字不动 */
  text: string;
  /** 在原文（去空白后）里的位置 */
  at: number;
  /** 指向谁。同名的**全部列出，不挑** */
  targets: { pid?: string; id?: string; name?: string; gen?: number;
             src_human?: string; matched_as?: string; strong?: boolean; note?: string }[];
  /** 谱名对上且世次挨着 = 强；只对上字号或世次差得远 = 弱 */
  strong?: boolean;
  why: string;
}

export interface Passage {
  id: string; host: string; host_name: string; gen: number;
  text: string; flat: string; chars: number;
  kinds: string[]; about: string; about_why: string;
  seq: number; page: number; src_human: string;
  /** 从原文里抽出来的要素。见 tools/extract_entities.py */
  ents?: Ent[];
  /** 谁写的——谱上的署名（「男寿堂谨撰」）。认不出就是 null */
  author?: {
    rel: string; name: string; verb: string; note: string;
    targets: { pid: string; name: string; gen: number; src_human: string;
               strong: boolean; note: string }[];
  } | null;
  /** 写的是谁——靠「吾父」「妣」「氏夫亡」这类称谓认的 */
  about2?: { who: string; why: string };
  /** 今译。**原文永远在，译文只是搭在旁边** */
  cn?: string;
  /** 译注：讹字怎么读的、哪里读不通 */
  cn_note?: string;
}

export interface RevMember {
  role?: string; title?: string; name?: string;
  号?: string; 名?: string; 讳?: string; 字?: string;
  raw: string; pid?: string; gen?: number; match: string;
  candidates?: { pid: string; gen: number; zi: string; src: string }[];
}
export interface Revision { era: string; raw_head: string; members: RevMember[] }

export interface GenChar {
  gen: number; char: string; n: number; total: number; rate: number;
  others: { char: string; n: number }[]; pai?: string; pai_ok?: boolean;
}

export interface TransPara { src: string; cn: string }
export interface Trans {
  same_as: Record<string, { doc: string; note: string }>;
  docs: Record<string, { by: string; note?: string; paras: TransPara[] }>;
}

/** 一届修谱的序：谁、什么时候、为什么写。全文逐句配今译。 */
export interface Preface {
  doc: string; title: string; era: string; author: string;
  round: string | null; outsider?: boolean;
  /** 为什么修这一届——本站的概括 */
  why: string;
  /** 要紧的几句，逐句配译 */
  key: { src: string; cn: string; note?: string }[];
  /** 全文逐句配译（有的篇还没做完） */
  full?: { src: string; cn: string; note?: string }[];
}
export interface Prefaces { list: Preface[] }

export interface ImageRec {
  id: string; file: string; kind: string; title: string; note: string;
  doc?: string | null; mentions?: string[]; caption?: string; src_human: string;
}

export interface Data {
  people: Person[];
  refs: Referenced[];
  places: PlaceRec[];
  shou: ShouDoc[];
  era: EraRow[];
  passages: Passage[];
  revisions: Revision[];
  images: ImageRec[];
  generations: GenChar[];
  trans: Trans;
  prefaces: Prefaces;
}

export function makeRegistry(d0: Data) {
  // 先把断掉的链接回去（父亲的生子名单点了名，只是名字写法不同）。
  // people.json 不动，补出来的边只活在内存里。见 backlink.ts。
  const d: Data = { ...d0, people: withBacklinks(d0.people) };
  const idx = buildIndex(d.people);
  const { byRid, byHost } = buildRefIndex(d.refs);
  const placeTree = buildPlaceTree(d.places);
  const chart = new EraChart(d.era);
  const win = buildWindows(d.people, chart);

  const P = (p: Person, note = true): Link =>
    ({ kind: 'person', id: p.pid, label: p.name, note: note ? `第${p.gen}世` : undefined });

  // ── 分组索引：房支 / 世次 / 功名 / 标记 / 姓 ──────────────────
  const group = <T>(arr: T[], key: (x: T) => string[]) => {
    const m = new Map<string, T[]>();
    for (const x of arr) for (const k of key(x)) {
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(x);
    }
    return m;
  };
  const byBranch = group(d.people, p => [p.src.section]);
  const byGenN = group(d.people, p => [String(p.gen)]);
  const byTitle = group(d.people, p => p.titles.map(NS));
  const byMark = group(d.people, p => p.marks.map(m => NS(m.tag)));
  // 姓：配偶娘家姓。**幽灵子不算**——build_referenced 给他们填了「张」，
  // 混进来会让「张」以 843 高居外姓第一，那是错的。
  const bySurname = group(d.refs.filter(r => r.role === '配偶' && r.surname),
    r => [r.surname!]);
  const byHusbandSurname = group(d.refs.filter(r => r.role === '女' && r.husband_surname),
    r => [r.husband_surname!]);
  // ★ 「事迹」只留真事迹。
  //
  //   1,667 段里，696 段是**这条记录自己的字段连排在一起**（葬＋立嗣＋妣殁），
  //   864 段是不到 12 字的碎片（「元至正辛巳年七」这种日期尾巴），
  //   真正有叙述的只有 64 段。和「假人」是同一个根因：
  //   解析器切不开字段，剩下的就被当成了一个新东西。
  //
  //   数据一条没删——原文照旧在本人卡片底部的「谱上原文」里，一个字不少；
  //   已经建好的 passage 条目也照样打得开（旧链接不会断）。
  //   这里只决定**摆不摆出来当事迹**。见 story.ts。
  const stories = d.passages.filter(isStory);
  const byPassageHost = group(stories, x => [x.host]);
  // 一段文字**按 id** 指到了谁——抽取要素那一步已经解析成 pid 了。
  // 「别人的条目里提到他」只认这个，不做字符串扫描。
  const byEntTarget = group(stories, x => {
    const pids = new Set<string>();
    for (const e of x.ents ?? []) for (const t of e.targets) if (t.pid) pids.add(t.pid);
    return [...pids];
  });
  const byPassageKind = group(stories, x => x.kinds);
  // 谁写过文字——署名认得出的才算。「男寿堂谨撰」→ 壁万（字寿堂）写的。
  const byAuthor = group(
    stories.filter(x => x.author?.targets?.some(t => t.strong)),
    x => x.author!.targets.filter(t => t.strong).map(t => t.pid));

  /**
   * 某个人的全部子女，男女都在。**一处算好，子女栏和兄弟姐妹栏共用。**
   *
   * ★ **以父亲自己那一条写的「生子N：…」为准**，不是以「谁指向了我」为准。
   *
   *   原先是反过来的：把所有指进来的父边全列出来。於是出了两种错——
   *     · 壁火（字火生，朝阳公世系）名下多出一个继盟。继盟是另一个壁火
   *       （字火记，朝京公世系）的祧子，判据早判成「排除」了，界面没认。
   *     · 继均写「生子六」，名片上却列了 9 个：多出来的三位自己条目里
   *       一个父亲都没写，只是名字撞上了他的名单。
   *
   *   现在按谱写的来：名单上有几个名字就摆几行，一字不动。
   *   连得上条目的做成链接；连不上的照样摆着，只是不能点。
   *   同一个名字有多个人对得上，**全列，不挑**（CLAUDE.md 第二节）。
   */
  function kidsOf(fatherPid: string): Link[] {
    const f = idx.get(fatherPid);
    if (!f) return [];
    const okKids = childrenOf(d.people, fatherPid).filter(k =>
      candidates(idx, k.child, chart, win).some(c => c.edge === k.edge && c.status === 'ok'));
    const mine = householdOf(byHost, f).filter(r => r.role !== '配偶');
    const usedPid = new Set<string>(), usedRid = new Set<string>();
    const rows: Link[] = [];

    // ★ 名单从 roster 来，**不用 sons_claimed／daughters_claimed**。
    //   那两个字段混进了女儿（「次適吕」）、不是人名的字（「公殁于」「迁陕」「也」）
    //   和整段传赞文字，光 referenced 里就有 375 条被登记成了人。
    //   roster 按谱自己的格式（生子N＋N 个名字）重读，那些自然进不来。
    const list = roster(f);
    const rowFor = (r: import('./roster.ts').RosterName, role: '子' | '女') => {
      // ① 有独立条目、且父边成立的
      const hit = okKids.filter(k => NSx(k.child.name) === NSx(r.name || r.raw)
        || k.child.aliases.some(a => NSx(a.form) === NSx(r.name || r.raw)));
      if (hit.length) {
        for (const k of hit) {
          usedPid.add(k.child.pid);
          // 显示谱名；谱上名单里写的若是别的叫法（开赛那条写的是承健的字
          // 「儒健」），把原文写法放在注里，别拿字当名头。
          const asWritten = r.raw.replace(/[\s　]+/g, '');
          // ★ 这个孩子自己有几个候选父亲？
          //
          //   不对称是这么来的：孩子那张卡片上明说了「我有两个候选父亲，
          //   两条都画出来」，可翻到父亲的子女栏，他就变成确定的了。
          //   於是父亲看着像是多了个儿子——继均名下三个开志、
          //   壁火名下多个继盟，都是这个不对称的表现。
          //
          //   孩子那边说了不知道，父亲这边就不能说知道。两边都标。
          const hisDads = candidates(idx, k.child, chart, win)
            .filter(c => c.status === 'ok' && c.edge.kind === '生父');
          const forked = hisDads.length > 1;
          rows.push({ ...P(k.child),
            note: [`第${k.child.gen}世 ${k.edge.kind}`,
                   NSx(asWritten) === NSx(k.child.name) ? '' : `谱上名单写「${asWritten}」`,
                   hit.length > 1 ? `同名对得上的有 ${hit.length} 位，这是其中之一` : '',
                   forked ? `他自己那一条也可能是另外 ${hisDads.length - 1} 位的儿子——`
                          + `谱上只写了名字，没说是哪一个` : '']
              .filter(Boolean).join('　'),
            warn: hit.length > 1 || forked });
        }
        return;
      }
      // ② 没有独立条目，但在 referenced 里发了 id
      const ref = mine.find(x => !usedRid.has(x.rid)
        && NSx(x.name_raw) === NSx(r.raw));
      if (ref) {
        usedRid.add(ref.rid);
        rows.push({ kind: 'ref', id: ref.rid, label: displayName(ref),
          note: [role === '女' ? '女' : '子', r.died ? '谱上写他殁了' : ''].filter(Boolean).join('　') });
        return;
      }
      // ③ 谱上写了，但连不到任何条目——照样摆着，只是不能点
      rows.push({ kind: 'person', id: fatherPid,
        label: r.raw.replace(/[\s　]+/g, '') || (r.died ? '（夭殇，谱上没写名字）' : '（谱上没写名字）'),
        plain: true,
        note: r.died ? '谱上写他殁了' : '谱上写了这个名字，没能连到条目' });
    };
    for (const s of list.sons) rowFor(s, '子');
    for (const dg of list.daughters) rowFor(dg, '女');

    // 名单上没写、但对方自己那一条写明是这位的儿子（多半是嗣子／祧子）
    for (const k of okKids) {
      if (usedPid.has(k.child.pid)) continue;
      rows.push({ ...P(k.child),
        note: `第${k.child.gen}世 ${k.edge.kind}　谱上「生子」名单里没写，是他自己那一条写明的` });
    }
    return rows;
  }

  // ══════════════════ 人 ══════════════════
  function person(pid: string): Entry | null {
    const p = idx.get(pid);
    if (!p) return null;
    const facts: Fact[] = [];
    const f = (label: string, v: { text: string } | null) => {
      if (v) facts.push({ label, value: v.text });
    };
    f('字', p.zi); f('讳', p.hui); f('号', p.hao); f('名', p.ming);
    // 翻页断行：「生于X　殁于」在这一页末行，日期在下一页头一行。
    // 只按行号顺序接回来，原文一字不改，出处标到页。见 continued.ts。
    const cont = continued(p);
    if (cont) {
      facts.push({ label: '生', value: cont.birthText,
                   raw: `第${p.src.page}页` });
      facts.push({ label: '殁', value: cont.tail.text,
                   raw: `第${cont.tail.page}页　接上一行的「殁于」` });
      for (const s of cont.stray) {
        facts.push({ label: '谱上同处还有一行', value: s,
                     raw: `第${cont.tail.page}页　排在上面那一行之后` });
      }
    } else {
      f('生', p.birth);
      f('殁', p.death);
    }
    // ★ 寿数：谱上一条记录里可能有两个「年X」——本人一个、妻子一个。
    //   `spouses` 里没有寿这一格，全谱 123 条配偶的寿数因此一条都没存下。
    //   从原文里按行位置读回来，标明是谁的。
    {
      const ages = agesOf(p);
      const mine = ages.filter(a => a.spouse == null);
      if (mine.length) for (const a of mine) facts.push({ label: '寿', value: a.text });
      else f('寿', p.age);
      for (const a of ages.filter(a => a.spouse != null)) {
        const nm = p.spouses[a.spouse!]?.name_raw?.replace(/[\s　]+/g, '');
        facts.push({ label: nm ? `寿（${nm}）` : '寿（配偶）', value: a.text });
      }
    }

    // 葬：每一层地名都是链接。
    // ★ 谱把配偶的葬也写在本人这一条里，全谱 337 人名下不止一处「葬」。
    //   不判归属就并排摆两个「葬」，看着像一个人葬了两处。按行位置判，见 owner.ts。
    // ★ 只摆**本人自己那几条**。burialsOf 连 `pid/配1` 这类 ref 记录一起给，
    //   那些是同一处葬的另一份切分（文本还常常粘着好几行），摆出来就是重复。
    //   配偶的葬在她自己那张卡上。
    const bs = burialsOf(d.places, pid).filter(b => b.owner === pid);
    const whose = burialOwner(p);
    const clip = trimBleed(p);
    for (const b of bs) {
      const ch = chainOf(b);
      let acc = '';
      const links: Link[] = ch.map((s, i) => {
        acc = i ? acc + '·' + s : s;
        const n = peopleAt(placeTree, acc).length;
        return { kind: 'place', id: acc, label: s, note: n > 1 ? `${n} 人` : undefined };
      });
      const i = whose(b.text);
      const mate = i == null ? null : p.spouses[i]?.name_raw?.replace(/[\s　]+/g, '');
      facts.push({
        label: mate ? `葬（${mate}）` : '葬',
        value: b.pos ?? undefined, raw: clip(b.text), links,
      });
    }
    if (!bs.length) facts.push({ label: '葬', value: '谱上没写' });

    if (p.father_name) {
      // 候选先过一遍谱自己的规矩（世次差必须是 1）和减法（生年）。
      // 对不上的不并排摆，收到下面一行里——不是删，点开照样能看。
      const cs = candidates(idx, p, chart, win);
      const good = kept(cs);
      // 生年、版面位置这些，**只在同一种关系里有好几个候选时才说**——
      // 那是用来分辨同名的。只有一个的时候念这些就是啰嗦。
      const nKind = new Map<string, number>();
      for (const x of good) nKind.set(x.edge.kind, (nKind.get(x.edge.kind) ?? 0) + 1);
      const links: Link[] = good.map(x => {
        const many = (nKind.get(x.edge.kind) ?? 0) > 1;
        const n = edgeNote(x.edge, countSameName(d.people, x.edge.parent_name));
        return {
          kind: 'person', id: x.edge.parent,
          label: x.person?.name || x.edge.parent_name || '？',
          note: [x.edge.kind, many ? n.text : '', many ? x.note : '', many ? x.layoutNote : '']
            .filter(Boolean).join('　'),
          warn: n.loud && many,
        };
      });
      // 「开赛　之子　开赛　生父」——同一个名字写两遍，读着别扭。
      // 只要有一个候选就叫这个名字，谱上写的那个名就不用再重复一遍。
      const sameAsWritten = links.some(l => NS(l.label) === fname(p.father_name));
      const one = good.length === 1;
      facts.push({
        label: '父',
        value: links.length ? (sameAsWritten ? '' : p.father_name) : p.father_name,
        // ruled(cs) 里的候选**不显示**：世次差不为 1、生年不可能、
        // 生子名单点了别人——这三条是谱自己的规矩和减法，是结论不是疑点。
        // 数据里一条没动（people.json 从没改过），只是界面不摆过程。
        // 只有一个父亲、名字又跟谱上写的一样时，注上「长子」「之子」这类排行；
        // 两个父亲（过继双记）时注的是「生父」「嗣父」，那更要紧，别盖掉。
        links: links.map(l => (one && sameAsWritten)
          ? { ...l, note: p.filiation || undefined } : l),
        raw: p.father_src ? srcText(p.father_src) + unreverse(p.father_src) : undefined,
        warn: p.parent_edges.length ? undefined
          : '谱里没有他单独的一条，往上断在这里。',
        // 生父 + 嗣父是**双记**（凡例第十三则要求的），不是「说不清」。
        // 说不清的是**同一种关系里有好几个候选**。
        note: (() => {
          const byKind = new Map<string, Set<string>>();
          for (const x of good) {
            (byKind.get(x.edge.kind) ?? byKind.set(x.edge.kind, new Set()).get(x.edge.kind)!)
              .add(x.edge.parent);
          }
          const worst = Math.max(0, ...[...byKind.values()].map(s => s.size));
          if (worst > 1) {
            const k = [...byKind.entries()].find(([, s]) => s.size === worst)![0];
            return `谱上只写了「${p.father_name}」，同名的有 ${worst} 个，分不出哪个是${k}。`;
          }
          if (byKind.size > 1) {
            return `他是过继的，谱上**两边都记**——生他的一家、把他接过去的一家。`
                 + `凡例第十三则的规矩：「不忘所自出」。`;
          }
          return undefined;
        })(),
      });
    }

    // ★ 「其余原文」只留**上面没显示过的**行。
    //
    //   壁火那张卡上，同样三行原文出现了三遍：
    //     「民国十九年八月」　　　　　　→ 殁 栏（接上一行的「殁于」）
    //     「初一日葬云山下庄屋…有碑」　→ 葬 栏 + 标记「有碑」
    //     「一九八四年…葬云山下棚上…」→ 葬 栏 + 标记「有碑」
    //   然后整整齐齐又在「其余原文」里重排了一遍。
    //   「其余」的意思就是**其余**——已经摆在上面的不算其余。
    const shown = new Set<string>();
    const mark = (s: string | null | undefined) => { const t = NS(s); if (t) shown.add(t); };
    for (const f of facts) { mark(f.value); mark(f.raw); }
    for (const b of bs) mark(b.text);
    for (const m of p.marks) mark(m.text);
    const restRaw = p.unparsed.filter(u => {
      const t = NS(u.text);
      if (!t) return false;
      // 整行原样出现过，或者被某一处**完整包住**（葬的原文常带「有碑」二字）
      for (const s of shown) if (s === t || s.includes(t)) return false;
      return true;
    });

    // ★ 剩下的原文**按段归属**：一行属于本人，还是属于「娶某氏」之后那一段。
    //   开俊那条「中南财经大学」写在他妻子冯金枝那一段里，是她的学校，
    //   原先一股脑挂在他名下。判法只用行号先后，见 owner.ts。全谱 1,492 行。
    const owned = new Map<string, { name: string; lines: string[] }>();
    const mineRaw: string[] = [];
    {
      const at = ownerAt(p);
      for (const u of restRaw) {
        const i = at(u.seq);
        if (i == null) { mineRaw.push(u.text); continue; }
        const key = String(i);
        const name = p.spouses[i]?.name_raw ?? '配偶';
        if (!owned.has(key)) owned.set(key, { name, lines: [] });
        owned.get(key)!.lines.push(u.text);
      }
    }

    const sections = [
      ...p.marks.filter(m => m.text).map(m => ({ heading: m.tag, text: m.text })),
      ...(mineRaw.length
        ? [{ heading: '其余原文', text: mineRaw.join('\n') }]
        : []),
      ...[...owned.values()].map(o => ({
        heading: `谱上写在「${o.name.replace(/[\s　]+/g, '')}」那一段里的`,
        text: o.lines.join('\n'),
      })),
    ];

    const relations: Relation[] = [];
    // ★ 「详前」条：同一个人，谱记了第二遍（一人两祧、三祧时，凡例要求双记）。
    //   谱自己写着「生庚娶氏俱详前」，那就照它说的，把完整那条指出来。
    const same = fullRecordOf(d.people, p);
    if (same.length) relations.push(rel('同一个人的完整记录', same.map(q => ({
      ...P(q), note: `${q.src_human.split('·').slice(1, 4).join('·')}　`
        + `谱上这一条写「${NS(p.raw_text).match(/[^　\s]{0,6}(详前|詳前|俱详|俱詳|同前)/)?.[0] ?? '详前'}」` }))));
    // 配偶单独一栏。女儿、以及谱上写了名字却没有单独一条的儿子，
    // **都是他的孩子，归到「子女」里去**——原先跟配偶混在「这一家的人」里，
    // 於是女儿排在儿子上面，看着像是长辈。
    const hh = householdOf(byHost, p);
    const mates = hh.filter(r => r.role === '配偶');
    const kidRefs = hh.filter(r => r.role !== '配偶');
    if (mates.length) relations.push(rel('妻', mates.map(r => ({
      kind: 'ref' as const, id: r.rid, label: displayName(r), note: r.rel_raw || undefined,
    }))));
    // ══ 子女 ══（怎么算的见上面的 kidsOf）
    const kidRows = kidsOf(pid);
    if (kidRows.length) relations.push(rel('子女', kidRows));

    // ══ 兄弟姐妹 ══
    //
    // 就是一次配对：**父亲的子女，去掉自己**。id 对 id，不碰名字。
    //   继均有 6 子 2 女，共 8 个孩子；开赛是其中一个，所以他有 7 个兄弟姐妹。
    // 父亲说不清是哪一位时，每一位的都列，各自标明是从谁那边论的——不替谱挑。
    // 过继的人有两个父亲，於是有两拨兄弟姐妹（本生／嗣），谱的凡例本来就要求双记。
    {
      const dads = kept(candidates(idx, p, chart, win)).filter(c => c.status === 'ok');
      const seen = new Set<string>([pid]);
      const sibs: Link[] = [];
      for (const c of dads) {
        const dad = idx.get(c.edge.parent);
        if (!dad) continue;
        const two = dads.length > 1;
        for (const k of kidsOf(c.edge.parent)) {
          if (k.plain) continue;                 // 谱写了名字、没连到条目的，不算一位
          if (k.id === pid || seen.has(k.id)) continue;
          seen.add(k.id);
          sibs.push({ ...k, note: [k.note, two ? `从${c.edge.kind}${dad.name}这边论` : '']
            .filter(Boolean).join('　') });
        }
      }
      if (sibs.length) relations.push(rel('兄弟姐妹', sibs));
    }
    const ps = byPassageHost.get(pid);
    if (ps?.length) relations.push(rel('他这一条里的文字', ps.map(x => ({
      kind: 'passage' as const, id: x.id,
      label: x.flat.slice(0, 20) + (x.chars > 20 ? '…' : ''),
      note: [x.kinds.filter(k => k !== '未分类').join('・') || `${x.chars}字`,
             x.about2 && !x.about2.who.startsWith('本人') ? '写的是' + x.about2.who : '',
             x.cn ? '有今译' : ''].filter(Boolean).join('　'),
    }))));
    // ★ 他写的文字——谱上署了他的名。这是名片上从来没有过的一栏。
    const wrote = byAuthor.get(pid);
    if (wrote?.length) relations.push(rel('他写的文字', wrote.map(x => ({
      kind: 'passage' as const, id: x.id,
      label: x.flat.slice(0, 22) + (x.chars > 22 ? '…' : ''),
      note: `写给${x.host_name}（第${x.gen}世）`
          + `　谱上署「${x.author!.rel}${x.author!.name}${x.author!.verb}」`,
    }))));
    const rv = revOf.get(pid);
    if (rv?.length) relations.push(rel('参与修谱', rv.map(x => ({
      kind: 'revision' as const, id: x.era, label: x.era + ' 那一届',
      note: x.role || undefined,
    }))));
    // ══ 别人的条目里提到他 ══
    //
    // ★ **只用带 id 的关系建，不做任何字符串扫描。**
    //
    //   原先是拿这个人的各种叫法去全谱搜原文。补了一轮又一轮：
    //   继盟（同名的另一个壁火的祧子）要排掉、光习（另一个壁火的父亲）要排掉、
    //   单字的「界」会撞上「界址内安厝」……每补一次就多一条例外。
    //
    //   补不完的原因是方向错了：**名字本来就不是身份，id 才是。**
    //   一段文字提到了谁，是抽取要素那一步解析好的，结果就是 targets 里的 pid。
    //   没解析出 pid 的，就是没认出来，不该算成关系。
    //   父、子这些也不必在这里重复——上面「父」「子女」两栏本来就是按边建的。
    const cited = (byEntTarget.get(pid) ?? []).filter(x => x.host !== pid);
    if (cited.length) relations.push(rel('别人的条目里提到他', cited.map(x => {
      // 同一段文字里指到本人的那几处要素，把同名候选数一并说清楚
      const hits = (x.ents ?? []).filter(e => e.targets.some(t => t.pid === pid));
      const many = hits.some(e => e.targets.length > 1);
      return {
        kind: 'passage' as const, id: x.id,
        label: x.flat.slice(0, 22) + (x.chars > 22 ? '…' : ''),
        note: `${x.host_name}（第${x.gen}世）那一条里`
          + (many ? `　这个名字全谱不止一位，都列着` : ''),
        warn: many,
      };
    })));
    // 一个人可能有两条「有碑」（本人一条、配偶一条），归属栏里只算一次
    const uniq = <T>(xs: T[], k: (x: T) => string) => {
      const seen = new Set<string>();
      return xs.filter(x => !seen.has(k(x)) && seen.add(k(x)));
    };
    relations.push({
      heading: '所属', items: [
        { kind: 'branch', id: p.src.section, label: p.src.section,
          note: `${byBranch.get(p.src.section)?.length ?? 0} 人` },
        { kind: 'gen', id: String(p.gen), label: `第 ${p.gen} 世`,
          note: `${byGenN.get(String(p.gen))?.length ?? 0} 人` },
        ...uniq(p.titles.map(NS), t => t).map(t => ({ kind: 'title' as const, id: t, label: t,
          note: `${byTitle.get(t)?.length ?? 0} 人` })),
        ...uniq(p.marks.map(m => NS(m.tag)), t => t).map(t => ({ kind: 'mark' as const, id: t, label: t,
          note: `${byMark.get(t)?.length ?? 0} 人` })),
      ],
    });

    return {
      kind: 'person', id: pid, title: p.name, titleNote: `第 ${p.gen} 世`,
      subtitle: `谱上写作「${p.name_raw}」`,
      tags: [
        ...(p.is_heir ? [{ text: '过继来的', tone: 'hot' as const }] : []),
        ...p.titles.map(t => ({ text: NS(t), tone: 'gold' as const })),
      ],
      alert: p.parent_edges.length ? undefined
        : (p.father_name
          ? `谱里没有「${p.father_name}」单独的一条。`
          : '谱上没写父亲是谁。'),
      facts, sections, relations,
      sources: [{ src_human: p.src_human, raw: p.raw_text }],
      chainFrom: pid,
    };
  }

  // ══════════════════ 妻、女等 ══════════════════
  function ref(rid: string): Entry | null {
    const r = byRid.get(rid);
    if (!r) return null;
    const host = idx.get(r.host);
    const facts: Fact[] = [{ label: '谱上写作', value: r.name_raw || '（谱上没写名字）' }];
    if (r.rel_raw) facts.push({ label: '称谓', value: r.rel_raw + '　' + r.rel_class });
    if (r.surname) facts.push({
      label: '姓', value: r.surname,
      links: [{ kind: 'surname', id: r.surname, label: r.surname + '氏',
        note: `${bySurname.get(r.surname)?.length ?? 0} 位` }],
    });
    if (r.given) facts.push({ label: '名', value: r.given });
    if (r.husband_surname) facts.push({
      label: '嫁到', value: r.husband_surname + '家',
      links: [{ kind: 'surname', id: '适' + r.husband_surname, label: '嫁到' + r.husband_surname + '家',
        note: `${byHusbandSurname.get(r.husband_surname)?.length ?? 0} 位` }],
    });
    if (r.birth) facts.push({ label: '生', value: r.birth.text });
    if (r.death) facts.push({ label: '殁', value: r.death.text });
    for (const b of burialsOf(d.places, rid)) {
      let acc = '';
      facts.push({
        label: '葬', raw: b.text,
        links: chainOf(b).map((s, i) => {
          acc = i ? acc + '·' + s : s;
          return { kind: 'place' as const, id: acc, label: s };
        }),
      });
    }
    facts.push({
      label: '记在', value: `${r.host_name}　第${host?.gen ?? '?'}世　名下`,
      links: [{ kind: 'person', id: r.host, label: r.host_name }],
    });

    const sib = householdOf(byHost, idx.get(r.host)!).filter(x => x.rid !== rid);
    return {
      kind: 'ref', id: rid, title: displayName(r), subtitle: relationLine(r),
      facts,
      sections: r.narrative_candidates.map(n => ({
        heading: '可能是写她的',
        text: n.text.replace(/\n/g, ' '),
        note: `写在${r.host_name}的条目里`,
      })),
      relations: sib.length ? [rel('同一家的人', sib.map(x => ({
        kind: 'ref' as const, id: x.rid, label: displayName(x), note: x.rel_raw || x.role,
      })))] : [],
      sources: [{ src_human: r.src_human, raw: r.host_raw_text }],
      chainFrom: r.host,
    };
  }

  // ══════════════════ 地方 ══════════════════
  function place(full: string): Entry | null {
    const rs = neighbours(peopleAt(placeTree, full));
    if (!rs.length) return null;
    const parts = full.split('·');
    let node = placeTree.get(parts[0]);
    for (const s of parts.slice(1)) node = node?.children.get(s);
    const kids = node ? [...node.children.values()].sort((a, b) => b.count - a.count) : [];
    const grp = rs.find(r => r.groups?.length)?.groups[0];
    const ds = docsAbout(d.shou, parts[parts.length - 1]);

    const relations: Relation[] = [];
    if (kids.length) relations.push(rel('这里面还分', kids.map(k =>
      ({ kind: 'place' as const, id: k.full, label: k.name, note: `${k.count}` }))));
    relations.push(rel('葬在这里的人', rs.map(r => ({
      kind: (r.owner.includes('/') ? 'ref' : 'person') as 'ref' | 'person',
      id: r.owner, label: r.owner_name,
      note: `第${r.gen ?? '?'}世　${r.text}`,
    }))));
    if (ds.length) relations.push(rel('谱前面写到这里', ds.map(x =>
      ({ kind: 'doc' as const, id: x.id, label: x.title_read || x.title,
        note: `卷首第${x.page_from}页 · ${x.chars}字` }))));

    return {
      kind: 'place', id: full,
      title: parts[parts.length - 1],
      titleNote: parts.length > 1 ? parts.slice(0, -1).join(' · ') : undefined,
      subtitle: `${rs.length} 人葬在这里`,
      alert: grp ? `「${grp.via}」和「${grp.group}」是同一座山。${grp.note}` : undefined,
      facts: [], sections: [], relations,
      sources: [],
    };
  }


  /**
   * 把抽出来的要素排成字段。**同名的全部列出，弱证据标出来。**
   * 「力保可信」的意思是：不是不给链接，是**给了就得说清凭什么**。
   */
  function entFact(label: string, ents: Ent[] | undefined, kind: Ent['kind']): Fact[] {
    const es = (ents ?? []).filter(e => e.kind === kind);
    if (!es.length) return [];
    const seen = new Set<string>();
    const links: Link[] = [];
    for (const e of es) {
      for (const t of e.targets) {
        const id = t.pid ?? t.id ?? '';
        const key = kind + id;
        if (!id || seen.has(key)) continue;
        seen.add(key);
        links.push({
          kind: kind === 'person' ? 'person' : kind === 'place' ? 'place' : 'year',
          id,
          label: t.name ?? t.id ?? e.text,
          note: [
            kind === 'person' && t.gen ? `第${t.gen}世` : '',
            e.text !== (t.name ?? '') ? `原文作「${e.text}」` : '',
            t.strong === false ? `⚠ ${t.note ?? '证据较弱'}` : '',
          ].filter(Boolean).join('　') || undefined,
          warn: t.strong === false,
        });
      }
    }
    return links.length ? [{ label, links }] : [];
  }

  // ══════════════════ 卷首篇目 ══════════════════
  function doc(id: string): Entry | null {
    const x = d.shou.find(v => v.id === id);
    if (!x) return null;
    return {
      kind: 'doc', id,
      title: x.title_read || x.title,
      subtitle: `卷首 第 ${x.page_from}–${x.page_to} 页 · ${x.chars} 字`
        + (x.title_read ? `　谱上写作「${x.title}」，右起横排` : ''),
      facts: [], sections: [{ text: x.text }],
      // 今译：原文一段、译文一段，配着排。原文永远在，译文只是搭在旁边。
      paras: d.trans.docs[id]?.paras,
      transBy: d.trans.docs[id]?.by,
      transNote: d.trans.docs[id]?.note,
      relations: [
        ...(d.trans.same_as[id]
          ? [rel('谱自己带的白话本', [{
              kind: 'doc' as const, id: d.trans.same_as[id].doc,
              label: d.shou.find(v => v.id === d.trans.same_as[id].doc)?.title ?? '白话本',
              note: d.trans.same_as[id].note }])]
          : []),
        ...(x.mentions.length
          ? [rel('文中提到的地方', x.mentions.map(m =>
              ({ kind: 'place' as const, id: m, label: m })))] : []),
      ],
      sources: [{ src_human: `卷首 第${x.page_from}–${x.page_to}页` }],
    };
  }

  // ══════════════════ 房支 / 世次 / 功名 / 标记 / 姓 / 年份 ══════════════════
  function listEntry(
    kind: Entry['kind'], id: string, title: string, subtitle: string,
    ps: Person[], extra: Relation[] = [],
  ): Entry {
    const gens = [...new Set(ps.map(p => p.gen))].sort((a, b) => a - b);
    return {
      kind, id, title, subtitle,
      facts: gens.length ? [{
        label: '世次', value: `第 ${gens[0]}–${gens[gens.length - 1]} 世`,
        links: gens.map(g => ({ kind: 'gen' as const, id: String(g), label: `${g}世`,
          note: `${ps.filter(p => p.gen === g).length} 人` })),
      }] : [],
      sections: [],
      relations: [...extra, rel('人', ps
        .slice().sort((a, b) => a.gen - b.gen || a.pid.localeCompare(b.pid))
        .map(p => ({ kind: 'person' as const, id: p.pid, label: p.name,
          note: `第${p.gen}世${p.zi ? ' 字' + p.zi.text : ''}` })))],
      sources: [],
    };
  }

  function branch(sec: string): Entry | null {
    const ps = byBranch.get(sec);
    if (!ps) return null;
    const vols = [...new Set(ps.map(p => `${p.src.vol}·卷${p.src.juan}`))];
    const pages = ps.map(p => p.src.page);
    return listEntry('branch', sec, sec,
      `${ps.length} 人　${vols.join('、')}　第 ${Math.min(...pages)}–${Math.max(...pages)} 页`, ps);
  }

  function gen(n: string): Entry | null {
    const ps = byGenN.get(n);
    if (!ps) return null;
    const gc = d.generations.find(x => String(x.gen) === n);
    const branches = [...new Set(ps.map(p => p.src.section))];
    const paiNote = gc && gc.rate >= 60
      ? `字辈「${gc.char}」——${gc.total} 人里 ${gc.n} 人的名字以它开头（${gc.rate}%）`
        // 对上了就不写，只有对不上才写
        + (gc.pai && !gc.pai_ok
           ? `。卷首《新取字派》这一位排的是「${gc.pai}」，和数出来的不一样` : '')
      : gc ? `这一世没有统一字辈——最常见的首字「${gc.char}」也只占 ${gc.rate}%` : '';
    return listEntry('gen', n, `第 ${n} 世`,
      `${ps.length} 人，分在 ${branches.length} 个房支` + (paiNote ? '　' + paiNote : ''), ps,
      [rel('分布在这些房支', branches.map(b => ({
        kind: 'branch' as const, id: b, label: b,
        note: `${ps.filter(p => p.src.section === b).length} 人` })))]);
  }

  function title(t: string): Entry | null {
    const ps = byTitle.get(t);
    if (!ps) return null;
    return listEntry('title', t, t, `谱上记了 ${ps.length} 人有这个身份`, ps);
  }

  function mark(t: string): Entry | null {
    const ps = byMark.get(t);
    if (!ps) return null;
    return listEntry('mark', t, t, `谱上给 ${ps.length} 人打了这个标记`, ps);
  }

  function surname(id: string): Entry | null {
    if (id.startsWith('适')) {
      const s = id.slice(1);
      const rs = byHusbandSurname.get(s);
      if (!rs) return null;
      return {
        kind: 'surname', id, title: `嫁到${s}家`,
        subtitle: `谱上记了 ${rs.length} 位张家的女儿嫁到${s}家`,
        facts: [], sections: [],
        relations: [rel('她们', rs.map(r => ({
          kind: 'ref' as const, id: r.rid, label: displayName(r),
          note: `第${r.gen}世　${r.host_name}之女` })))],
        sources: [],
      };
    }
    const rs = bySurname.get(id);
    if (!rs) return null;
    return {
      kind: 'surname', id, title: `${id}氏`,
      subtitle: `谱上有 ${rs.length} 位${id}氏嫁进张家。`
        + `同姓不等于同一个人——谱没说是一个，就不合并。`,
      facts: [], sections: [],
      relations: [rel('她们', rs.map(r => ({
        kind: 'ref' as const, id: r.rid, label: displayName(r),
        note: `第${r.gen}世　${r.host_name}之${r.rel_raw}` })))],
      sources: [],
    };
  }

  function year(ad: string): Entry | null {
    const rows = d.era.filter(r => String(r.ad) === ad);
    if (!rows.length) return null;
    return {
      kind: 'year', id: ad, title: `公元 ${ad} 年`,
      subtitle: rows.map(r => `${r.label}　干支 ${r.ganzhi}`).join('　／　'),
      facts: [{ label: '出处', value: '卷首《甲子録》' }],
      sections: [{ text: rows.map(r => r.raw).join('\n'),
        }],
      relations: [], sources: [{ src_human: '卷首《甲子録》' }],
    };
  }

  // ══════════════════ 传赞事迹 ══════════════════
  // 这些是全谱唯一带感情的文字。德懋讨饭养母那段，1710 年程万里
  // 读到县志里的它才找上门作序，才有了第一部谱。它们该有自己的一页。

  function passage(id: string): Entry | null {
    const x = d.passages.find(v => v.id === id);
    if (!x) return null;
    const host = idx.get(x.host);
    return {
      kind: 'passage', id,
      title: x.kinds.filter(k => k !== '未分类').join('・') || '一段记事',
      titleNote: `${x.chars} 字`,
      subtitle: `写在 ${x.host_name}（第${x.gen}世）的条目里`,
      tags: x.kinds.filter(k => k !== '未分类').map(k => ({ text: k, tone: 'gold' as const })),
      // 要素表：谁 / 在哪 / 什么时候。**每一项都从原文里抽的，能回原文核。**
      facts: [
        { label: '写在谁名下',
          links: [{ kind: 'person', id: x.host, label: x.host_name,
            note: `第${host?.gen ?? x.gen}世　${host?.src_human ?? ''}` }] },
        ...(x.about2 ? [{ label: '写的是谁', value: x.about2.who, raw: x.about2.why }] : []),
        ...(x.author ? [{
          label: '谁写的',
          value: x.author.targets.length ? undefined : x.author.name || '谱上没署名',
          links: x.author.targets.map(t => ({
            kind: 'person' as const, id: t.pid, label: t.name,
            note: `第${t.gen}世　${t.note}`, warn: !t.strong,
          })),
          raw: x.author.note,
        }] : []),
        ...entFact('提到的人', x.ents, 'person'),
        ...entFact('提到的地方', x.ents, 'place'),
        ...entFact('提到的年份', x.ents, 'year'),
      ],
      sections: [{ text: x.text }],
      // 原文里可点的位置，界面照这个把词变成链接
      ents: x.ents,
      paras: x.cn ? [{ src: x.text, cn: x.cn }] : undefined,
      transBy: x.cn ? '我们' : undefined,
      transNote: x.cn_note,
      relations: x.kinds.filter(k => k !== '未分类').length
        ? [rel('同类的记事', x.kinds.filter(k => k !== '未分类').map(k =>
            ({ kind: 'kind' as const, id: k, label: k,
              note: `${byPassageKind.get(k)?.length ?? 0} 段` })))]
        : [],
      sources: [{ src_human: x.src_human, raw: host?.raw_text }],
      chainFrom: x.host,
    };
  }

  function kindEntry(k: string): Entry | null {
    const xs = byPassageKind.get(k);
    if (!xs) return null;
    const chars = xs.reduce((a, x) => a + x.chars, 0);
    const cn = xs.filter(x => x.cn).length;
    // 按世次分组——同一类事在哪几代出现，本身就是一件值得看的事。
    // （比如「兵祸殉难」几乎全挤在第 22–23 世，那正是咸丰七年那一代人。）
    const byGen = new Map<number, Passage[]>();
    for (const x of xs) (byGen.get(x.gen) ?? byGen.set(x.gen, []).get(x.gen)!).push(x);
    const gens = [...byGen.keys()].sort((a, b) => a - b);
    const peak = gens.slice().sort((a, b) => byGen.get(b)!.length - byGen.get(a)!.length)[0];

    return {
      kind: 'kind', id: k, title: k,
      subtitle: `谱上有 ${xs.length} 段这一类的文字，合计 ${chars} 字`
        + (cn ? `，其中 ${cn} 段配了今译` : ''),
      facts: [
        { label: '出现在', value: `第 ${gens[0]}–${gens[gens.length - 1]} 世`,
          links: gens.map(g => ({ kind: 'gen' as const, id: String(g),
            label: `${g}世`, note: `${byGen.get(g)!.length} 段` })),
          note: peak != null && byGen.get(peak)!.length > 2
            ? `第 ${peak} 世最多，有 ${byGen.get(peak)!.length} 段。` : undefined },
      ],
      sections: [],
      relations: [
        // 长的排前面——长的才是真有话说的
        rel('这一类的文字（长的在前）', xs
          .slice().sort((a, b) => b.chars - a.chars)
          .map(x => ({ kind: 'passage' as const, id: x.id,
            label: x.flat.slice(0, 24) + (x.chars > 24 ? '…' : ''),
            note: [`${x.host_name}（第${x.gen}世）`, `${x.chars}字`,
                   x.cn ? '有今译' : ''].filter(Boolean).join('　') }))),
      ],
      sources: [],
    };
  }


  // ══════════════════ 修谱届次 ══════════════════
  // 十届，1710–2016，三百零六年。每一届的班子名单谱都留着。
  // 连人按「不猜」：谱名和字都对上才算确定；同名多个就把候选全列出来。
  const revOf = new Map<string, { era: string; role?: string }[]>();
  for (const r of d.revisions) {
    for (const m of r.members) {
      if (m.pid) (revOf.get(m.pid) ?? revOf.set(m.pid, []).get(m.pid)!)
        .push({ era: r.era, role: m.role });
    }
  }

  function revision(era: string): Entry | null {
    const r = d.revisions.find(v => v.era === era);
    if (!r) return null;
    const byRole = new Map<string, RevMember[]>();
    for (const m of r.members) {
      const k = m.role ?? '（谱上未分职务）';
      (byRole.get(k) ?? byRole.set(k, []).get(k)!).push(m);
    }
    const pres = d.prefaces.list.filter(x => x.round === era);
    const linked = r.members.filter(m => m.pid).length;
    const pend = r.members.filter(m => m.candidates).length;
    return {
      kind: 'revision', id: era,
      title: era + '　修谱',
      subtitle: `名单上 ${r.members.length} 人　`
        + `其中 ${linked} 人在谱里找到了对应的条目`
        + (pend ? `，${pend} 人同名不止一个，谱没说是哪一个` : ''),
      facts: [
        { label: '谱上原文', value: r.raw_head },
        ...(pres.length ? [{
          label: '这一届的序',
          links: pres.map(x => ({ kind: 'doc' as const, id: x.doc.split('#')[0],
            label: x.title, note: `${x.era}　${x.author}` })),
        }] : []),
      ],
      // 为什么修这一届 + 序的原文与今译
      sections: pres.map(x => ({ heading: x.title + '　' + x.author, text: x.why })),
      paras: pres.flatMap(x => x.full ?? x.key),
      transBy: pres.length ? '我们' : undefined,
      relations: [...byRole.entries()].map(([role, ms]) => rel(role, ms.flatMap(m => {
        const who = [m.title, m.name, m.字 ? '字' + m.字 : '', m.号 ? '号' + m.号 : '']
          .filter(Boolean).join(' ');
        // 对上了就不写——只有对不上的地方才需要说明
        if (m.pid) return [{ kind: 'person' as const, id: m.pid, label: who,
          note: `第${m.gen}世` }];
        // ★ 同名多个：**候选全列出来**，一条一行。
        //   这里原先写的是 candidates[0]，等於替谱做了决定——正是「不猜」禁的那件事。
        if (m.candidates?.length) return m.candidates.map((c, i) => ({
          kind: 'person' as const, id: c.pid, label: who,
          note: `第${c.gen}世${c.zi ? '　字' + c.zi : ''}　${c.src}`
            + `（${m.match}，这是第 ${i + 1} 个）`,
          warn: true,
        }));
        return [{ kind: 'revision' as const, id: era, label: who, note: m.match }];
      }))),
      sources: [{ src_human: '卷首《历届修谱名目》' }],
    };
  }

  // ══════════════════ 图片 ══════════════════
  // 16 幅手绘山图 + 祠堂堂屋门口塘 + 祖墓碑记 + 2016 那份征地协议原件。
  // 印刷拼版一张纸两个版面，已切开，不然协议和门口塘永远挤在一张图里。
  function image(id: string): Entry | null {
    const x = d.images.find(v => v.id === id);
    if (!x) return null;
    const rel_: Relation[] = [];
    if (x.mentions?.length) rel_.push(rel('图上提到的地方', x.mentions.map(m =>
      ({ kind: 'place' as const, id: m, label: m }))));
    if (x.doc) rel_.push(rel('这幅图的题记', [
      { kind: 'doc', id: x.doc, label: '卷首题记全文' }]));
    const sameKind = d.images.filter(v => v.kind === x.kind && v.id !== id);
    if (sameKind.length) rel_.push(rel('同一类的图', sameKind
      .map(v => ({ kind: 'image' as const, id: v.id, label: v.title }))));
    rel_.push(rel('别的图', d.images.filter(v => v.kind !== x.kind)
      .map(v => ({ kind: 'image' as const, id: v.id, label: v.title, note: v.kind }))));
    return {
      kind: 'image', id, title: x.title, titleNote: x.kind,
      subtitle: x.note || '',
      facts: [],
      sections: x.caption ? [{ heading: '题记', text: x.caption }] : [],
      relations: rel_,
      sources: [{ src_human: x.src_human }],
      image: x.file,
    };
  }

  // ══════════════════ 注册表 ══════════════════
  const build: Record<Entry['kind'], (id: string) => Entry | null> = {
    person, ref, place, doc, branch, gen, title, mark, surname, year,
    passage, kind: kindEntry, revision, image,
  };

  /** 目录：每一类有哪些条目，供「逛」用。 */
  function catalogue() {
    const cnt = (m: Map<string, unknown[]>) =>
      [...m.entries()].map(([k, v]) => ({ id: k, label: k, n: v.length }))
        .sort((a, b) => b.n - a.n);
    return {
      branch: cnt(byBranch),
      gen: [...byGenN.entries()].map(([k, v]) => ({ id: k, label: `第${k}世`, n: v.length }))
        .sort((a, b) => +a.id - +b.id),
      title: cnt(byTitle),
      mark: cnt(byMark),
      surname: cnt(bySurname).map(x => ({ ...x, label: x.label + '氏' })),
      husbandSurname: cnt(byHusbandSurname).map(x => ({ ...x, id: '适' + x.id, label: '嫁到' + x.label + '家' })),
      place: [...placeTree.values()].map(n => ({ id: n.full, label: n.name, n: n.count }))
        .sort((a, b) => b.n - a.n),
      doc: d.shou.map(x => ({ id: x.id, label: x.title_read || x.title, n: x.chars })),
      kind: cnt(byPassageKind).filter(x => x.id !== '未分类'),
      revision: d.revisions.map(r => ({ id: r.era, label: r.era, n: r.members.length })),
      image: d.images.map(x => ({ id: x.id, label: x.title, n: 0, note: x.kind })),
    };
  }

  return { build, catalogue, idx, byRid, placeTree, chart, win };
}
