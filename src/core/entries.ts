/**
 * 条目生成器：把各份数据变成统一形状的 Entry。
 *
 * 界面只认 Entry，不认 people.json / places.json 的字段。
 * 加一类条目 = 在这里加一个 build 函数 + 注册到 registry，界面一行不用改。
 */
import { fname } from './fname.ts';
import type { Person, ParentEdge } from './types.ts';
import type { PlaceRec, ShouDoc } from './places.ts';
import type { Entry, Link, Fact, Relation } from './entry.ts';
import { NS, srcText, unreverse, rel } from './entry.ts';
import { buildIndex, edgeNote, countSameName } from './lineage.ts';
import { householdFromKin, displayName, relationLine } from './referenced.ts';
import { buildPlaceTree, burialsOf, peopleAt, docsAbout, neighbours, chainOf } from './places.ts';
import type { EraRow } from './years.ts';
import { EraChart } from './years.ts';
import { buildWindows } from './activity.ts';
import { withBacklinks, backlinkCount } from './backlink.ts';
import { parentsFrom, type Parents } from './parents.ts';
// ★ entry.ts 里那个 NS 只去空格，**不带 947 条繁简异体折叠**。
//   名字比对一律用这个 norm，别用那个。这个坑前后踩过五次。
import { norm as NSx } from './norm.ts';
import { continued } from './continued.ts';
import { roster } from './roster.ts';
import { ownerAt, burialOwner, trimBleed, agesOf } from './owner.ts';
import { fullRecordOf, canonical, sameAs, loadSameOne, type SameOne } from './seealso.ts';
import { isStory } from './story.ts';
import { buildFacts } from './facts.ts';
import { resolveAll } from './resolve.ts';
import { materialize, linkSons, type AnyPerson } from './persons.ts';
import { applyManual, type ManualTable } from './manual.ts';
import { buildDossier, CATS, type Dossier } from './dossier.ts';

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
  /** 人工判定表（data/人工判定.json）。看过原书的结论，盖在自动判定之上。 */
  /**
   * 人工核定表（data/人工判定.json）——**必填**。
   *
   * 早先写成可选、不传就当空表，而 prototype/app.js 的 fetch 清单里正好漏了它——
   * 于是 **13 条人工核定在 app 里根本没生效**，工具里一个答案、app 里另一个。
   * 看谱的人看到的和我们核过的不是同一件事。改成必填。
   */
  manual: ManualTable;
  /** 人工核定的同人表（data/同一个人.json）——**必填**，理由同上 */
  sameone: { 条目: SameOne[] };
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
  // ★ 人工核定的同人表先装上——它比任何算法都先。
  loadSameOne(d0.sameone.条目);
  const d0b: Data = { ...d0, people: withBacklinks(d0.people) };
  const idx0 = buildIndex(d0b.people);
  const placeTree = buildPlaceTree(d0b.places);
  const chart = new EraChart(d0b.era);
  const win = buildWindows(d0b.people, chart);

  // ★ **他父亲是谁——全站唯一入口。**
  //   人物卡、世系树、关系计算、疑点清单，全部走这一个函数。
  //   在这之前树和关系计算各算各的，312 人的上溯链里有 320 步
  //   走的是人物卡已经排除掉的那条边。见 parents.ts 抬头。
  // ★ **谱上关于他的每一句，按类目归好档——全站唯一入口。**
  //   卡片、事迹栏、导出，都读这一份；归类只在 dossier.ts 做一次。
  // 判定只在有独立条目的人上做（附记之人的父亲就是宿主，不需要判）
  const facts0 = buildFacts(d0b.people, d0b.generations ?? []);
  const RES0raw = resolveAll(facts0, idx0, win,
    (x: string) => { const q = idx0.get(x); return q ? canonical(d0b.people, q).pid : x; });
  // ★ 人工判定盖在最上面。看过原书的结论比任何自动规则都硬。
  //   见 manual.ts；表在 data/人工判定.json，后人续修往里加行即可。
  const RES0 = new Map(
    [...RES0raw].map(([k, v]) => [k, applyManual(d0b.manual, k, v)]));

  // ★ **谱里出现过的每一个人，一行，一个 id。**
  //   妻、女儿、夭折没留下名字的孩子，以前只是别人卡片里的字符串，
  //   点不开、搜不到、关系计算器算不到。现在和男人同一种 Person、同一个 idx，
  //   下游一律不必区分。见 persons.ts 抬头。
  //   名字串→pid 的配对就在这一步做完（linkSons），**全站只此一处**。
  const __dads = (pid: string) => {
    const r = RES0.get(pid);
    return r ? [...r.birth, ...r.heir].map(x => x.pid) : [];
  };
  const sonSlots = linkSons(d0b.people, __dads, NSx);
  const allPeople = materialize(d0b.people, sonSlots);
  const d: Data = { ...d0b, people: allPeople };
  const idx = buildIndex(allPeople);
  const dcache = new Map<string, Dossier>();
  const dossier = (q: Person): Dossier => {
    let v = dcache.get(q.pid);
    if (!v) { v = buildDossier(q, facts0.get(q.pid)); dcache.set(q.pid, v); }
    return v;
  };

  // ★ 判定只在 resolveAll 做一次，全站读同一份结果。
  //   candidates.ts 那套「十条排除规则赛跑」已退休。
  const pcache = new Map<string, Parents>();
  const parents = (q: Person): Parents => {
    let v = pcache.get(q.pid);
    if (!v) {
      v = parentsFrom(idx, q, RES0.get(q.pid));
      // ★ 兼祠：同一个人在谱上有好几条，**每条只写一家的父亲**。
      //   继盟一子三祠：p399「壁岳公祠子」、p400「壁环公祠子」、
      //   p401「壁火公祠子」。卡片折成一张，父亲就必须把几条**合起来**；
      //   只取被折到的那一条，等于把另外几家抹掉——那正是「不漏」要防的事。
      //   旧架构是 backlink 层并的，那一层换成 resolve 以后没人并了。
      //   合并只看唯一 id，不比名字；重复的父亲在下面 fold 里按 pid 去重。
      for (const o of sameAs(d0b.people, q)) {
        const w = parentsFrom(idx, o, RES0.get(o.pid));
        v = { ...v, birth: [...v.birth, ...w.birth], heir: [...v.heir, ...w.heir],
              clan: [...v.clan, ...w.clan], alsoNamed: [...v.alsoNamed, ...w.alsoNamed] };
      }
      // ★ 候选也要折回本条。
      //   兼祥的人谱会印好几遍（凡例第十三则要求双记），
      //   不折就会对看谱的人说「叫这名字的有 4 位」——
      //   而其中三位是同一个人。那句话本身就是错的。
      const fold = (cs: typeof v.birth) => {
        const out: typeof cs = [];
        for (const c of cs) {
          const q2 = c.person ? canonical(d0b.people, c.person) : null;
          const pid2 = q2?.pid ?? c.edge.parent;
          if (out.some(x => x.edge.parent === pid2)) continue;
          out.push(pid2 === c.edge.parent ? c
            : { ...c, person: q2, edge: { ...c.edge, parent: pid2, parent_name: q2?.name ?? c.edge.parent_name } });
        }
        return out;
      };
      v = { ...v, birth: fold(v.birth), heir: fold(v.heir), clan: fold(v.clan), alsoNamed: fold(v.alsoNamed) };
      pcache.set(q.pid, v);
    }
    return v;
  };

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
  // ★ 从**附记之人自己**建，不再读 referenced.json。
  //   她们现在各有 pid、各有一页（persons.ts::materialize），
  //   referenced.json 那 3,192 行是同一批人的**第四套包装**：
  //   配偶 1,559 ≡ kin 妻 1,559、女 1,040 ≡ kin 女 1,040，一个不差。
  const attached = allPeople.filter(q => (q as AnyPerson).attached) as AnyPerson[];
  const bySurname = group(
    attached.filter(q => q.attached!.role === '妻' && q.attached!.kin.surname),
    q => [q.attached!.kin.surname]);
  const byHusbandSurname = group(
    attached.filter(q => q.attached!.role === '女' && q.attached!.kin.surname),
    q => [q.attached!.kin.surname]);
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
  /**
   * **子女：谁的父边指向我，谁就是我的孩子。id 反查，一次都不碰名字。**
   *
   * 早先这里走 `roster()` ＋ `referenced.json`，拿名单上的字去配孩子的条目
   * （`NSx(k.child.name) === NSx(r.name)`）。三个后果：
   *
   *   · 每建一张卡片就重配一遍，同一个名字在不同地方可能配到不同的人；
   *   · 配不上的就不显示——壁林那两个有名字的女儿（华荣、华枝）因此
   *     从他的子女栏里消失，而锡公、梁楙那些只有夫家姓的反而在；
   *   · 女儿、无名子本来就没有条目，永远配不上。
   *
   * 现在他们全都是人、全都有 pid、全都有指向父亲的边（见 persons.ts），
   * 反查就够了。顺序按谱印的先后：有条目的按册·页·行，附记的按源行号。
   */
  // 孩子 pid → 他在父亲名单里占的那个槽（谱写的字）
  const slotOf = new Map<string, string>();
  {
    const byAt = new Map<string, string>();
    for (const f of d0b.people) for (const k of ((f as any).kin ?? []) as any[]) byAt.set(k.at, k.name_raw);
    for (const [at, childPid] of sonSlots) {
      const w = byAt.get(at);
      if (w) slotOf.set(childPid, w);
    }
  }
  // ══ 子女：**读 json 里的 `children`，不在这里算。** ══
  //
  //   父边在库里存了两遍——孩子身上 `parent_edges`、父亲身上 `children`
  //   （tools/writeback.mjs 写，tools/fk.mjs 有闸盯着两边一一对应）。
  //   以前这里自己遍历全谱、反过来建一次索引：那就是同一件事算第二遍，
  //   跟库里那份一旦不一致，卡片的子女栏就会多一个人或少一个人。
  //
  //   附记之人（妻／女／无条目的子）没写进 json 的 children——
  //   他们本来就只存在于父亲那一条的 `kin` 里，`persons.ts` 装载时才成人。
  //   那也是**读**：读 kin，不是猜。
  const kidsIdx = new Map<string, AnyPerson[]>();
  {
    const ord = (q: AnyPerson) => {
      const at = (q as any).attached;
      if (at) return at.kin.line_seq;
      return q.src.page * 1000 + q.src.row * 10 + q.src.col;
    };
    // ★ 兼祧的人，谱把他印在好几房底下——那是**同一个人的几条记载**，不是几个人。
    //   凡例第十三则要求双记（「不忘所自出」），双记的是记载，人只有一个。
    const canonOf = (q: AnyPerson): AnyPerson => q;   // 折叠在判定层做完了
    const put = (fpid: string, q: AnyPerson) => {
      const arr = kidsIdx.get(fpid) ?? kidsIdx.set(fpid, []).get(fpid)!;
      if (!arr.some(x => x.pid === q.pid)) arr.push(q);
    };
    for (const f of d0b.people)
      for (const c of ((f as any).children ?? []) as { child: string }[]) {
        const q = idx.get(c.child) as AnyPerson | undefined;
        if (q) put(f.pid, canonOf(q));
      }
    // 附记之人：他们的父边是 persons.ts 按 kin 发的，同样只读不判
    for (const q of allPeople) {
      if (!(q as any).attached) continue;
      for (const e of (q.parent_edges ?? [])) put(e.parent, q);
    }
    for (const arr of kidsIdx.values()) arr.sort((a, b) => ord(a) - ord(b));
  }

  /**
   * 同一栏里两条**长得一模一样**时，把出处挂上去。
   *
   * 谱里同名的人很多：铣豁的两个儿子都叫「泽富」，学虎的两个「士礼」，
   * 壁福在兄弟栏里出现三次——三个不同的人，卡片上三行字一字不差，
   * 读的人只能挨个点开试。**不是判断问题，是显示问题**：
   * 他们是不同的 id，把 id 自带的出处坐标印出来就分得开了。
   */
  function distinct(list: Link[]): Link[] {
    const cnt = new Map<string, number>();
    for (const l of list) {
      const k = `${l.label}｜${l.note ?? ''}`;
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
    return list.map(l => {
      const k = `${l.label}｜${l.note ?? ''}`;
      if ((cnt.get(k) ?? 0) < 2) return l;
      const q = l.kind === 'person' ? idx.get(String(l.id)) : null;
      if (!q) return l;
      const at = `${q.src.vol}第${q.src.page}页`;
      return { ...l, note: [l.note, at].filter(Boolean).join('　') };
    });
  }

  function kidsOf(fatherPid: string): Link[] {
    return (kidsIdx.get(fatherPid) ?? []).map(q => {
      const at = (q as any).attached;
      const ps = parents(q);
      const kind = ps.heir.some(c => c.edge.parent === fatherPid) && !ps.birth.some(c => c.edge.parent === fatherPid)
        ? '嗣子' : (at ? at.role : '子');
      // 孩子那边说了不知道，父亲这边就不能说知道。两边都标。
      const forked = ps.birth.length > 1;
      return {
        kind: 'person' as const, id: q.pid, label: q.name,
        // ★ 谱在名单里写的字，和他自己条目的题名常常不一样
        //   （朝寿的名单写「啓徒」，他那一条题作「启從」）。
        //   人是同一个，但**谱写的那两个字不能不见**。
        note: [`第${q.gen}世 ${kind}`,
               NSx(slotOf.get(q.pid) ?? '') && NSx(slotOf.get(q.pid)!) !== NSx(q.name)
                 ? `谱的名单里写「${slotOf.get(q.pid)}」` : '',
               at && at.kin.name_raw && at.kin.name_raw !== q.name ? `谱上写「${at.kin.name_raw}」` : '',
               at && !at.kin.named ? '谱没写名字' : '',
               at && at.kin.died_young ? '谱写「幼殁」' : '']
          .filter(Boolean).join('　'),
        // ★ 分叉的完整情形在**他自己那张卡片**上，各带出处。
        //   这一栏只标一下，不在这里替他说一遍——
        //   「也可能是另外几位的儿子」那种话，判不出来就不该写。
        warn: forked || undefined,
      };
    });
  }

  // ══════════════════ 人 ══════════════════
  const flatName = (x: string) => (x ?? '').replace(/[\s　]+/g, '');

  function person(pid: string): Entry | null {
    const p = idx.get(pid);
    if (!p) return null;
    // 全站唯一的那份父母判定，本卡片从头到尾只读它。
    const ps0 = parents(p);
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
    // 寿。**读 json，不回原文捞。**
    //   谱在一条记录里可能写两个「年X」——本人一个、配偶一个。
    //   以前配偶没有这一格，卡片只好按行位置去原文里认（owner.ts::agesOf）——
    //   那是渲染时判断。现在解析层给每个人各自一格，这里照着印。
    f('寿', p.age);
    // 配偶的寿数也读 json（解析层给她们各自开了一格）。
    // 以前没这一格，卡片回原文按行位置捞；现在照读，谁的就是谁的。
    for (const sp of (p.spouses ?? [])) {
      if (!(sp as any).age) continue;
      const nm = flatName(sp.name_raw);
      facts.push({ label: nm ? `寿（${nm}）` : '寿（配偶）', value: (sp as any).age.text });
    }

    // 葬。**读 json，不在这里判「这坟是谁的」。**
    //
    //   归属早就定完了：解析层把它填进本人／配偶／名单里那个孩子各自的格子，
    //   `tools/build_burials.py` 再按 pid 建成地名索引（每条带 owner）。
    //   这里以前又拿正则把「合墓／同墓／俱葬」拆一遍、再按行位置猜一遍——
    //   **同一件事判两遍，就会有两个答案**。删掉了。
    //
    //   地名链接仍旧来自地名索引：那是 pid → 地名的外键，不是判断。
    {
      const mine = burialsOf(d.places, pid).filter(b => b.owner === pid);
      const seen = new Set<string>();
      const chain = (b: any): Link[] => {
        const ch = chainOf(b);
        let acc = '';
        return ch.map((sname, i) => {
          acc = i ? acc + '·' + sname : sname;
          const n = peopleAt(placeTree, acc).length;
          return { kind: 'place' as const, id: acc, label: sname,
                   note: n > 1 ? `${n} 人` : undefined };
        });
      };
      // ★ 印 `b.text`——那是**切出来的那一段葬地**。
      //   `b.raw` 是它出自的那一整段原文（兜底那一路直接是整条 raw_text），
      //   印它就等於把整条原文塞进葬那一栏——启昌的卡片上出过一次。
      if (p.burial) {
        const t = NSx(p.burial.text);
        seen.add(t);
        const b0 = mine.find(b => NSx(b.text ?? '') === t)
                ?? mine.find(b => t.includes(NSx(b.text ?? '')));
        facts.push({ label: '葬', value: p.burial.text,
                     links: b0 ? chain(b0) : undefined });
      }
      // 谱把葬地写在标记或未归属那几行里的，索引也收着——一条不漏，标明出处
      for (const b of mine) {
        const t = NSx(b.text ?? '');
        if (!t || seen.has(t) || [...seen].some(x => x.includes(t) || t.includes(x))) continue;
        seen.add(t);
        facts.push({ label: '葬', value: b.text,
                     raw: (b.sources ?? []).join('·'), links: chain(b) });
      }
      if (!seen.size) facts.push({ label: '葬', value: '谱上没写' });
    }

    // 女儿：谱只留下夫家姓。那也是谱写下的一件事，该显示。
    {
      const at1 = (p as any).attached;
      if (at1?.role === '女' && at1.kin?.surname) {
        facts.push({ label: '适', value: `${at1.kin.surname}家`,
                     raw: `谱上写「${at1.kin.name_raw}」` });
      }
    }

    // ══ 父。**读 json 里写好的答案，不在这里判、不在这里编话。** ══
    //
    //   `parent_edges` 是判定层写回的答案（tools/writeback.mjs），每条自带：
    //       parent       一个 pid          ← 指谁
    //       kind         生父 / 嗣父
    //       level        原话/人工核定/定式/谱未写
    //       why          一句人话，说清凭什么
    //   卡片要做的就是把它们印出来，**一条一条，原样**。
    //
    //   这里以前有一百八十行：自己数同名候选、自己看版面、自己按情形
    //   拼出好几种句子（「他是哪一位名下的，要回谱面看那几格才能定」之类）。
    //   那是判定跑进了渲染——同一个人在卡片、树、兄弟栏可以得到不同答案。
    //   全删了。判不出来的，判定层根本不会写进 parent_edges。
    if (p.parent_edges?.length || p.father_name) {
      const edges = p.parent_edges ?? [];
      const kinds = new Set(edges.map(e => e.kind));
      const links: Link[] = edges.map(e => {
        // 折叠已经在判定层出口做完了（resolve.ts::foldSameOne），这里只读
        const q = idx.get(e.parent);
        return {
          kind: 'person' as const, id: e.parent,
          label: q?.name ?? e.parent_name ?? '？',
          // 一格里最多一条注：过继双记时注「生父／嗣父」，别的不注
          note: kinds.size > 1 ? e.kind : undefined,
          // 依据挂在悬停里：判到哪一级、凭什么、出处
          raw: [(e as any).level, (e as any).why, e.parent_src].filter(Boolean).join('　'),
        };
      });
      // ★ 谱写的父名和答案不同名时，**必须说出来**。
      //   继洪那一条谱写「壁娄」，判定给的是梁娄（壁/梁 形近，谱印岔了）。
      //   两个名字并排摆着却一个字不解释，就是把依据藏了——违「可追溯」。
      //   这句话不是我编的，是 json 里 why 那一栏的原话。
      const wrote = fname(p.father_name);
      const said = wrote && edges.length && !edges.some(e => {
        const q = idx.get(e.parent);
        return NS(q?.name ?? e.parent_name ?? '') === wrote
          || (q?.aliases ?? []).some(x => NS(x.form) === wrote);
      });
      // 「壁火　壁火 之子」——谱写的父名和链接上的名字一样时印了两遍。
      // 一样就只印链接，不一样才要把谱写的那个摆出来（那是可追溯的要点）。
      facts.push({
        label: '父',
        value: said ? p.father_name : undefined,
        links: links.map(l => (edges.length === 1 && !said)
          ? { ...l, note: p.filiation || undefined } : l),
        raw: p.father_src ? srcText(p.father_src) + unreverse(p.father_src) : undefined,
        warn: edges.length ? undefined : '谱里没有他单独的一条，往上断在这里。',
        note: said
          ? `谱上写的是「${p.father_name}」，跟这一位对不上——`
            + (edges.map(e => (e as any).why).filter(Boolean).join('；') || '判定层未记依据')
          : undefined,
      });
    }

    // ══ 过继。**读 json 里的 adoptions，一条不落。** ══
    //   谱的每一句立嗣／出嗣语句都在库里，各自带着：原话、写在谁那一条里、
    //   说的是谁、去处（一个 pid）、怎么定的。以前卡片根本不读这一栏，
    //   全谱 50 条过继语句在页面上是看不见的。
    for (const ad of ((p as any).adoptions ?? [])) {
      const to = idx.get(ad['去处']);
      facts.push({
        label: '过继',
        value: ad['原话'],
        links: to ? [{ kind: 'person' as const, id: to.pid, label: to.name,
                       note: ad['去处名'] && NS(ad['去处名']) !== NS(to.name)
                         ? `谱上写「${ad['去处名']}」` : undefined }] : undefined,
        raw: [ad['怎么定的'], idx.get(ad['写在谁那一条'])?.src_human].filter(Boolean).join('　'),
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
    for (const b of burialsOf(d.places, pid)) mark(b.text);
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

    // ★ **事迹这一栏从档案层读，卡片自己不再判断。**
    //   以前它就是 `p.marks` 原样倒出来，於是「娶陈氏」「女适柯」也顶着
    //   一个 tag 站在事迹栏里，而德懋公那篇进了县志的孝行、学光公
    //   乾隆戊午年过江搜辑谱料、梁一公五祖山两首诗，反倒一个字都不见。
    //   归类只在 dossier.ts 做一次，这里照类目摆，摆的是原文。见 dossier.ts 抬头。
    const dz = dossier(p);
    // 备注也印——那也是谱写的字。归类器认不出不等于它不存在，
    //   胜二公那句「由选举」（他由科举出仕）只有三个字，归不进事迹，
    //   於是整句从卡片上消失了。宁可标题土一点，不许谱写了的话不见。
    const deed = (['过继', '功名', '职事', '迁徙', '旌表', '事迹', '碑志', '缺记', '备注'] as const)
      .flatMap(k => dz.cat[k].length
        ? [{ heading: k, text: dz.cat[k].map(i => (i.label ? `${i.label}　` : '') + i.text).join('\n') }]
        : []);

    const sections = [
      ...deed,
      // 「其余原文」只留档案层没归到类的那几行——归过类的上面已经摆了一遍。
      ...(() => {
        const shown = new Set<string>();
        for (const k of CATS) for (const it of dz.cat[k]) shown.add(it.text.replace(/[\s　]/g, ''));
        const rest = mineRaw.filter(t => !shown.has(t.replace(/[\s　]/g, '')));
        return rest.length ? [{ heading: '其余原文', text: rest.join('\n') }] : [];
      })(),
      // 同样：档案层已经摆过的句子，这里不再抄一遍，只留归属信息还没说过的
      ...[...owned.values()].flatMap(o => {
        const shown = new Set<string>();
        for (const k of CATS) for (const it of dz.cat[k]) shown.add(it.text.replace(/[\s　]/g, ''));
        const lines = o.lines.filter(t => !shown.has(t.replace(/[\s　]/g, '')));
        return lines.length
          ? [{ heading: `谱上写在「${o.name.replace(/[\s　]+/g, '')}」那一段里的`, text: lines.join('\n') }]
          : [];
      }),
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
    // ★ 从他自己的 kin 派生，不再查 referenced.json
    const hh = householdFromKin(p as never);
    const mates = hh.filter(r => r.role === '配偶');
    const kidRefs = hh.filter(r => r.role !== '配偶');
    // ★ 「聘」不是妻。凡例第十则：
    //     「妇人**已入吾门者书「娶」某氏，未入吾门者书「聘」某氏**，
    //      继娶者书「继」某氏，有妾者书「庶」某氏，
    //      一以别先后之序并嫡庶之分，**不可混载**。」
    //   全谱 38 位「聘某氏」是**订婚而未过门**的（`referenced.json` 里
    //   rel_class 早已标作「聘（未过门或幼殇）」），原先和 874 位「娶」、
    //   709 位「妣」一起摆在「妻」这一栏下，只在小字里写一个「聘」。
    //   谱自己用不同的字把她们分开，界面不该再合起来——「不可混载」。
    // ★ 指向**她自己的 pid**，不再指 referenced.json 的 ref id。
    //   那套 ref 是女性的第二套身份：同一个人，卡片上一个 id、
    //   关系计算器里又一个，于是她在全站永远是半个人。
    //   现在她和丈夫用同一种 id，点开就是她的页。
    const mateP = new Map<string, string>();      // 谱上的写法 → 她的 pid
    for (const sp of (p as any).spouses ?? []) {
      if (sp.pid) mateP.set(NSx(sp.name_raw ?? ''), sp.pid);
    }
    const mateRow = (r: typeof mates[number]) => {
      const her = mateP.get(NSx(r.name_raw ?? '')) ?? mateP.get(NSx(displayName(r)));
      // ★ 没有兑底。妻子现在各有 pid；谱真没给名字的那几位，
      //   摆原文、不给链接——总好过再给她一个只在那里用的第二个 id。
      return her && idx.has(her)
        ? { kind: 'person' as const, id: her, label: displayName(r), note: r.rel_raw || undefined }
        : { kind: 'text' as const, id: '', label: displayName(r), note: r.rel_raw || undefined };
    };
    // ★ 附记之人（妻・女・无名子）的反向一栏。
    //   她们没有自己那一格，但**有自己的 id 和自己的页**；
    //   页上得看得见她是谁的妻、谁的女，以及谱把她写在哪一条里。
    {
      const at = (p as any).attached;
      // ★ 只有妻才在这里列「夫」。子女的父亲已经在上面「父」那一格里
      //   （persons.ts 给他们发了 parent_edges，跟有条目的人同一格），
      //   再列一遍就是同一件事印两处——儒桢的卡片上「父」出现过两回。
      if (at && at.role === '妻' && idx.has(at.of)) {
        const host = idx.get(at.of)!;
        relations.push(rel('夫',
          [{ kind: 'person', id: host.pid, label: host.name,
             note: `第${host.gen}世・谱把她写在他那一条里` }]));
      }
    }

    const pin = mates.filter(r => r.rel_raw === '聘');
    const side = mates.filter(r => (r.rel_raw ?? '').includes('侧室'));
    const wives = mates.filter(r => !pin.includes(r) && !side.includes(r));
    if (wives.length) relations.push(rel('妻', wives.map(mateRow)));
    if (side.length) relations.push(rel('侧室', side.map(mateRow)));
    if (pin.length) relations.push(rel('聘（谱上写「聘」，未过门）', pin.map(mateRow)));
    // ══ 子女 ══（怎么算的见上面的 kidsOf）
    const kidRows = kidsOf(pid);
    if (kidRows.length) relations.push(rel('子女', distinct(kidRows)));

    // ══ 兄弟姐妹 ══
    //
    // 就是一次配对：**父亲的子女，去掉自己**。id 对 id，不碰名字。
    //   继均有 6 子 2 女，共 8 个孩子；开赛是其中一个，所以他有 7 个兄弟姐妹。
    // 父亲说不清是哪一位时，每一位的都列，各自标明是从谁那边论的——不替谱挑。
    // 过继的人有两个父亲，於是有两拨兄弟姐妹（本生／嗣），谱的凡例本来就要求双记。
    {
      const dads = [...ps0.birth, ...ps0.heir];
      const seen = new Set<string>([pid]);
      const sibs: Link[] = [];
      for (const c of dads) {
        const dad = idx.get(c.edge.parent);
        if (!dad) continue;
        const two = dads.length > 1;
        for (const k0 of kidsOf(c.edge.parent)) {
          // ★ 详前条折回完整条，再按 id 去重。
          //   不折的话，兼祧的人在自己那一页会看到两个同名的「兄弟姐妹」——
          //   那是他自己在别房下的另外两条记录。
          const canonPid = k0.kind === 'person'
            ? canonical(d.people, idx.get(k0.id) ?? ({} as any))?.pid ?? k0.id
            : k0.id;
          const k = canonPid === k0.id ? k0 : { ...k0, id: canonPid };
          if (k.plain) continue;                 // 谱写了名字、没连到条目的，不算一位
          if (k.id === pid || seen.has(k.id)) continue;
          seen.add(k.id);
          sibs.push({ ...k, note: [k.note, two ? `从${c.edge.kind}${dad.name}这边论` : '']
            .filter(Boolean).join('　') });
        }
      }
      if (sibs.length) relations.push(rel('兄弟姐妹', distinct(sibs)));
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
      alert: (parents(p).birth.length + parents(p).heir.length) ? undefined
        : (p.father_name
          ? `谱里没有「${p.father_name}」单独的一条。`
          : '谱上没写父亲是谁。'),
      facts, sections, relations,
      sources: [{ src_human: p.src_human, raw: p.raw_text }],
      chainFrom: pid,
    };
  }

  // ══════════════════ 妻、女等 ══════════════════

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
      kind: 'person' as const,
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
        relations: [rel('她们', rs.map(q => ({
          kind: 'person' as const, id: q.pid, label: q.name,
          note: `第${q.gen}世　${q.attached!.of_name}之女` })))],
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
      relations: [rel('她们', rs.map(q => ({
        kind: 'person' as const, id: q.pid, label: q.name,
        note: `第${q.gen}世　${q.attached!.of_name}之${q.attached!.kin.rel_raw}` })))],
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
  //
  // ★ 名目上的人，**按唯一 id 现认**，不读文件里预先算好的 pid。
  //   `data/revisions.json` 是旧系统的产物，那 241 个 pid 全是旧格式，
  //   一个都点不开；里面「同名的有 N 个，谱没说是哪一个」那句话也是
  //   那个旧脚本写死的字符串——判定层从头到尾没看过它。
  //
  //   现在的判据就是谱自己在名目上写的两样：**谱名 ＋ 字**。
  //   两样都对上、并且折回兼祧的同一条之后只剩一位，那就是他。
  //   剩不下一位就**不判**——不判就把人平摆出来，一个字也不多说。
  // ★ 名目上的每一位，**pid 已经写在 data/revisions.json 里**
  //   （tools/revlink.mjs 配一次，配不出来的交人工，见 work/名目待核.json）。
  //   这里只读，不配。判定不进渲染路径——所见即所得。
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

    return {
      kind: 'revision', id: era,
      title: era + '　修谱',
      subtitle: `名单上 ${r.members.length} 人`,
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
        // 定到人了就是链接；没定到就把名目原话摆着，一个字也不多说。
        if (m.pid) return [{ kind: 'person' as const, id: m.pid, label: who,
                             note: `第${m.gen}世` }];
        return [{ kind: 'revision' as const, id: era, label: who }];
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
    person, place, doc, branch, gen, title, mark, surname, year,
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

  // ★ sonSlots 是全站唯一一处「名字串 → 唯一 id」的配对结果（名单槽 at → 儿子的 pid）。
  //   它是地基，就得能被查——idcheck 靠它验「每个名单槽都落到了一个 id」。
  // ★ 判定的原始结果（级别、矛盾、依据）。台账等工具读它，
  //   不要自己再搭一条 resolveAll 管道——那样又是两套答案（台账那边就漏传了 canon）。
  return { build, catalogue, idx, placeTree, chart, win, parents, dossier, sonSlots,
           res: RES0, facts: facts0, people: d0b.people };
}
