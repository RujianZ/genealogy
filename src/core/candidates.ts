/**
 * 父候选筛选：把「谱自己的规矩就不成立」的挑出来。
 *
 * 起因：树上出现了
 *     第 7 世万善　也可能是　第 23 世光豫　的儿子
 *     第 9 世世昂　也可能是　第 21 世泽耀　的儿子
 * 这种谁看了都知道不可能的东西。原因是父边里混了同名误配，
 * 而界面把所有候选一视同仁地摆了出来。
 *
 * ★ 排除只用三条，都不是判断：
 *
 *   世次　　　父亲必须正好高一世。世次是原书「第一世…第五世」
 *             世代列头标死的，不是推算的（CLAUDE.md 第四节）。
 *
 *   生子名单　父亲那一条的「生子X：…」里点了本人的名——rank1，全表最硬。
 *             继均的两个「壁火」：一个生子写「继均」，一个写「继盟」。
 *             谱自己早写清楚了，只是要反过来读。
 *
 *   活跃年代　生年、殁年、寿数、配偶年份、子女生年，全查《甲子録》（谱自己附的表）。
 *             最有力的是**殁年**：「他殁于 1789，本人生于 1826」——晚了 37 年。
 *             这是减法，不是意见。见 activity.ts。
 *
 * ★ 排除 ≠ 删除。被排除的边**照样在数据里、照样能看**，
 *   只是不再和真候选并排摆着让人误会。界面上收在一句
 *   「另有 N 条同名的对不上」后面，点开就能看，出处照旧。
 *
 * ★ 试过但**明确不用**的三条（在 1034 个确定例子上验过）：
 *     版面位置（父印在同段上一代）　98.16%　—— 1.84% 摊到祖先身上就是错
 *     排行位置（写「次子」就该排第2）93.45%　—— 名单里混着女儿，顺序也不总是排行
 *     房支血统（追得到页眉那位祖先）63.51%　—— 循环论证，追不到往往是链本身断了
 *   版面位置只作为**摆给人看的旁证**（layoutNote），不参与排除。
 */
import { fname } from './fname.ts';
import type { Person, ParentEdge } from './types.ts';
import type { EraChart } from './years.ts';
import type { Window } from './activity.ts';
import { canFather, windowNote } from './activity.ts';
// 比对一律走 norm（带 947 条繁简异体折叠）。「啟发」和「启发」是同一个人。
import { norm as NS } from './norm.ts';
import { roster } from './roster.ts';
import { isFragment } from './fragment.ts';

export type CandStatus = 'ok' | 'gen' | 'age' | 'named' | 'ord' | 'slot' | 'adopt' | 'wrote' | 'sib';

/**
 * 一条原文里，「立…为嗣」点到的名字。
 *
 * ★ 人工核对 118 个说不清的人时翻出来的：**候选父亲自己那一条就写着点名的话。**
 *
 *     梁木（册3·卷五·第28页）：立胞弟梁必次子**光远**为嗣
 *     梁茂（册3·卷五·第42页）：立亲弟梁园长子**光灼**为嗣
 *     铣彩（册2·卷三·第196页）：立二兄次子**泽荣**为嗣
 *
 *   这是谱自己的话，比什么旁证都硬，可判据一直没用上它。
 *   光远一个人往下带 83 口人，光灼 35 口。
 *
 *   写法是「立＋（关系＋排行）＋名字＋为嗣」，名字在「为嗣」前面，
 *   所以从后往前取两三个字去比对——比对用 norm，繁简都认。
 */
const ADOPT_RE = /(?:立|以)([^立以，。；、]{0,14}?)(?:为嗣|為嗣|承嗣|入嗣|为祧|為祧|祧)/g;

/**
 * ★ 语句里的**本生父名**不能扔。
 *
 *   壁福那一条写的是「立**壁温次子**继华为嗣」——它写明了是**壁温的**次子继华。
 *   原来只把最后两三个字（「继华」）抠出来当索引，前面的「壁温次子」全丢了，
 *   於是全谱**每一个**叫继华的人都会被这句话认领。
 *
 *   结果：壁林的儿子继华（字东华，生1955，兼祧长兄壁洲、二兄壁银，
 *   册2·卷四·朝泰公世系）被册3·卷七·朝阳公世系的壁福认了去，
 *   而那边的继华字金龙、生1920，是壁温的次子——两个人差 35 岁、
 *   字不同、房不同。
 *
 *   写法固定：立 ＋〔胞／亲／堂＋兄弟叔伯〕＋〔本生父名〕＋〔排行〕子 ＋ 名 ＋ 为嗣
 *   把本生父名一并记下，比对时要求**本人写的父名也对得上**，才算这句话说的是他。
 *   语句里没写本生父名的（「立长兄次子士礼为嗣」只给了关系不给名），
 *   father 记空，照旧只按名字比——不因为要求变严而漏掉。
 */
const REL = /^(?:胞|亲|堂|嫡|从)?(?:兄|弟|叔|伯|姪|侄|长兄|次兄|三兄|四兄|五兄)?/;
const ORDSON = /(长|次|三|四|五|六|七|八|九|十|幼|季|末)子$/;
export interface Adoptee { names: Set<string>; father: string }
const ADOPTEES = new WeakMap<Person, Adoptee[]>();
function adoptees(p: Person): Adoptee[] {
  let s = ADOPTEES.get(p);
  if (s) return s;
  s = [];
  for (const m of NS(p.raw_text ?? '').matchAll(ADOPT_RE)) {
    const seg = m[1];
    const names = new Set<string>();
    for (let n = 2; n <= 3; n++) if (seg.length >= n) names.add(seg.slice(-n));
    // 名字前面若是「…X排行子」，X 就是本生父名
    let father = '';
    for (const nm of names) {
      const head = seg.slice(0, seg.length - nm.length);
      const om = ORDSON.exec(head);
      if (!om) continue;
      const cand = head.slice(0, head.length - om[0].length).replace(REL, '');
      if (cand.length >= 2 && cand.length <= 3) { father = cand; break; }
    }
    s.push({ names, father });
  }
  ADOPTEES.set(p, s);
  return s;
}

/**
 * 「谁在自己条目里写明了父亲是谁」的索引：`折叠父名|世次` → 那些人。
 *
 * 用来判一件**可数**的事：父亲名单里的某个名字，位置是不是已经有人自报了。
 * 按 idx 缓存，candidates() 会被调很多次，不能每次重建。
 */
/** 谱上写的排行，用来在说明里照抄原文（「之子」「长子」「幼子」…） */
const q0 = (q: Person) => q.filiation ?? '之子';

const SELF_DECLARED = new WeakMap<Map<string, Person>, Map<string, Person[]>>();
function selfDeclared(idx: Map<string, Person>): Map<string, Person[]> {
  let m = SELF_DECLARED.get(idx);
  if (m) return m;
  m = new Map();
  for (const q of idx.values()) {
    if (!q.father_name || q.gen == null) continue;
    // ★ 折叠后是空串的不进索引。否则「空名字」会跟「空名字」匹配上，
    //   把两条过继（stated_adopt，parent_name 本来就是空的）边误排掉。
    if (!fname(q.father_name)) continue;
    const k = `${fname(q.father_name)}|${q.gen}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push(q);
  }
  SELF_DECLARED.set(idx, m);
  return m;
}

export interface Cand {
  edge: ParentEdge;
  person: Person | null;
  status: CandStatus;
  /** 为什么排除；status==='ok' 时是年纪核对的结果或空 */
  note: string;
  /**
   * 谱自己前后对不上：父子关系两边都写明了，年代却兜不拢。
   * **保留这条边**（谱写的话优先），但把矛盾摆出来，并进疑点清单。
   */
  conflict?: string;
  /** 版面位置：谱把父子印在相邻的格子里。**摆出来给人看，不替人定案。** */
  layoutNote: string;
  /**
   * 谱把他印在本人**正上方那一格**里。
   *
   * 这不是统计规律，是**世系表的读法**——翻开那一页，你上面那一格就是你父亲。
   * 在 522 个「谱自己点了名」的真同名案例上，这么读**指对 99.04%**。
   * （早先测出的 98%／96% 是错的：那批样本里 1033/1034 个父名在那一辈本来就唯一，
   *   恰好把「同名」这个情形全排除了。）
   *
   * **仍然不拿它自动定案**——它读出的是「格」，一格里可能并排着几个兄弟。
   * 但也绝不藏起来：翻开那一页本来就看得见。
   */
  printedAbove: boolean;
}


const ORD: Record<string, number> = {
  长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
/** 「长子」→1　「次子」→2　「幼子」→末位（-1） */
function ordOf(fil: string): number | null {
  const f = NS(fil);
  if (!f) return null;
  if (f.startsWith('幼')) return -1;
  return ORD[f[0]] ?? null;
}
// 生子名单里混着女儿（「次适程」）和被吃进去的句子（「公殁于」「养子一」）。
// **数位置之前必须先洗**，否则位置全错——第一版就栽在这。
const JUNK = /(适|公殁|妣|殁于|生于|葬|养子|嗣子|继子|季子|生子|女[一二三四五六七八九]|^[一二三四五六七八九十]$)/;
/**
 * 父亲那一条点了名的儿子。
 *
 * ★ 走 roster（按谱自己的格式重读原文），**不用 sons_claimed**。
 *   那个字段混着女儿和不是人名的字，而且**丢了谱的辈字惯例**——
 *   「生子三　继发　和　才」里的「和」「才」共用头一个的辈字，
 *   roster 会补成继和、继才，sons_claimed 里就是光秃秃两个单字，
 *   比对时永远对不上，继和、继才的父亲因此一直判不出来。
 */
const cleanSons = (f: Person | null | undefined): string[] =>
  !f ? [] : roster(f).sons.map(s => NS(s.name || s.raw)).filter(s => s && !JUNK.test(s));

const PID = /^P-(册\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/;
const coord = (pid: string) => {
  const m = PID.exec(pid);
  return m ? { vol: m[1], page: +m[2], row: +m[3] } : null;
};

/** 版面位置：谱把父子印在相邻的格子里。只作旁证。 */
function layoutOf(child: Person, father: Person | null): string {
  if (!father) return '';
  const a = coord(child.pid), b = coord(father.pid);
  if (!a || !b) return '';
  const sameSec = child.src.section === father.src.section;
  if (a.row - b.row === 1 && a.vol === b.vol && sameSec && b.page <= a.page) {
    return a.page === b.page ? '就印在同一页的上一代' : `印在前面第 ${b.page} 页，上一代`;
  }
  if (a.row === 1 && b.row === 5) return '接在上一段的末代';
  return sameSec ? '同一房，但版面位置对不上' : `在另一房「${father.src.section}」`;
}

/**
 * 本人正上方那一格里有谁——就是世系表上「你上面那一行」。
 * 同册、行号减一、页码不大于本人、取最近的那一页。
 */
function cellAbove(idx: Map<string, Person>, p: Person): Set<string> {
  const c = coord(p.pid);
  if (!c || c.row <= 1) return new Set();
  let best = -1;
  const out = new Map<number, string[]>();
  for (const q of idx.values()) {
    const b = coord(q.pid);
    if (!b || b.vol !== c.vol || b.row !== c.row - 1 || b.page > c.page) continue;
    (out.get(b.page) ?? out.set(b.page, []).get(b.page)!).push(q.pid);
    if (b.page > best) best = b.page;
  }
  return new Set(out.get(best) ?? []);
}

/**
 * 兄弟连排：谱把同一个父亲的儿子**连着印在一起**。
 *
 *   原件（source/合一（1.2.3.4）.doc）：
 *       銑赞  士礼公次子  字载育 …
 *       銑蕊  士礼公三子  字孔昭 …
 *       銑时  士礼公幼子  字天才 …
 *   銑赞、銑蕊 是士礼（第135页）已确认的儿子，銑时紧跟着他们印在同一段。
 *
 * 所以：**同一册、同一房、同一世、写着同一个父名的几个人，是兄弟。**
 * 其中已经定了父亲的若**恰好都指向同一位**，其余的就跟着定。
 *
 * 两道闸：
 *   · 解析残渣（名字是「日时」那种）不算兄弟——他们本来就不是人
 *   · 排行撞车不定案：谱写「长子」，而已定的兄弟里已经有个长子，那就不动
 */
const SIBS = new WeakMap<Map<string, Person>, Map<string, Person[]>>();
function siblingGroups(idx: Map<string, Person>): Map<string, Person[]> {
  let m = SIBS.get(idx);
  if (m) return m;
  m = new Map();
  for (const q of idx.values()) {
    if (!q.father_name || q.gen == null || isFragment(q)) continue;
    const k = `${q.src.vol}|${q.src.section}|${q.gen}|${fname(q.father_name)}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push(q);
  }
  SIBS.set(idx, m);
  return m;
}

/** 不用兄弟那一条时的结果，缓存起来——兄弟规则要拿它当底，不能来回递归。 */
const BASE = new WeakMap<Map<string, Person>, Map<string, Cand[]>>();

export function candidates(
  idx: Map<string, Person>, p: Person, chart: EraChart,
  win?: Map<string, Window>,
  /** 内部用：算兄弟时走这一路，跳过兄弟规则本身 */
  noSib = false,
): Cand[] {
  if (noSib) {
    let c = BASE.get(idx);
    if (!c) { c = new Map(); BASE.set(idx, c); }
    const hit = c.get(p.pid);
    if (hit) return hit;
  }
  const above = p.parent_edges.length > 1 ? cellAbove(idx, p) : new Set<string>();
  // ★ 排行：谱上写「幼子」，他就该排在父亲生子名单的**末位**；写「次子」就排第 2。
  //   在 396 个「谱自己点了名」的真同名案例上，**指对 396／396 = 100%**。
  //   （早先测得 93.45% 是错的：样本有偏，而且名单没洗——
  //     女儿「次适程」和杂串「公殁于」混在里面，位置全算错。）
  //
  // ★ **排行只管生父那条线。**
  //   朝纪（第16世）栽在这：林公原文末句写着「幼子朝纪出祠梦楚」——
  //   他是林公的幼子（生父），同时是梦楚的嗣子（嗣父）。
  //   「幼子」说的是本生家的位置，跟嗣父家没关系。
  //   拿它去卡嗣父边，等於用生父家的排行否掉谱明写的过继，
  //   把 CLAUDE.md 里启昌那种「双记」的第二条线抹掉。全谱 51 条。
  const myOrd = ordOf(p.filiation);
  const ordFits = myOrd == null ? null : p.parent_edges.filter(e => {
    if (e.kind !== '生父') return false;
    const sons = cleanSons(idx.get(e.parent));
    const i = sons.indexOf(NS(p.name));
    return i >= 0 && i + 1 === (myOrd === -1 ? sons.length : myOrd);
  });

  // ★ 最硬的一条：**父亲那一条的「生子X：…」名单里点了本人的名。**
  //   继均的父亲有两个「壁火」：
  //     册3·卷六·第205页　字火生　生子一：**继均**
  //     册3·卷七·第401页　字火记　生子一：继盟
  //   谱自己已经写明是哪一个了。这不是我们挑的，是读出来的。
  //   （CLAUDE.md 依据等级表：rank 1 claim_named 最硬，rank 5 homonym_one_of 最弱。）
  //   只有当**同一种关系**里恰好一个是 claim_named 时才用；
  //   两个都点了名就还是分不出，照样并排摆着。
  //
  // ★ **当场自己查名单，不信上游那个 evidence 标签。**
  //   上游建边时比对没带繁简折叠，「生子名单写『啟发』、他自己那条写『启发』」
  //   就对不上，标成了 homonym_one_of。这里用 norm（947 条折叠）重查一遍。
  const namesMe = (e: ParentEdge) =>
    cleanSons(idx.get(e.parent)).includes(NS(p.name))
    || cleanSons(idx.get(e.parent)).some(s => p.aliases.some(a => NS(a.form) === s));
  const namedBy = new Map<string, number>();
  for (const e of p.parent_edges) {
    if (namesMe(e)) namedBy.set(e.kind, (namedBy.get(e.kind) ?? 0) + 1);
  }

  // ★ 候选父亲自己那一条写了「立…为嗣」并点了本人的名。谱自己的话，最硬。
  //   同一种关系里**恰好一个**这么写了，其余的就排掉；
  //   两个都写了就还是分不出，照样并排摆着（不猜）。
  const myForms = new Set([NS(p.name), ...p.aliases.map(a => NS(a.form))]);
  const statesMe = (e: ParentEdge) => {
    const f = idx.get(e.parent);
    if (!f) return false;
    for (const a of adoptees(f)) {
      let nameHit = false;
      for (const x of myForms) if (a.names.has(x)) { nameHit = true; break; }
      if (!nameHit) continue;
      // 语句里写明了本生父（「立**壁温**次子继华为嗣」）：
      // 那本人写的父名也得是他，才算说的是这个人。
      if (a.father) {
        const w = fname(p.father_name);
        const bareF = a.father.replace(/公$/, '');
        if (w && w.replace(/公$/, '') !== bareF) continue;
      }
      return true;
    }
    return false;
  };
  // ★ 统计「谁写明过继了本人」时，**必须先过世次这道闸**。
  //
  //   梁一（第22世）栽在这：铣贵（第20世）那一条里也写着一句「立…为嗣」，
  //   比本人早两代，世次早就把这条边排掉了。可这里统计时没过闸，
  //   于是一个**不可能的候选**独占了「写明过继」这个名额，
  //   反过来把真正的泽霖（第21世，就印在梁一正上一行）顶掉了——
  //   最后梁一一条父边都没有，成了 23 个人的卡点。
  //
  //   世次是原书列头标死的，是全谱最硬的一条，任何统计都该先过它。
  const genOk = (e: ParentEdge) => {
    const f = idx.get(e.parent);
    return !!f && f.gen != null && p.gen != null && p.gen - f.gen === 1;
  };
  const statedBy = new Map<string, number>();
  for (const e of p.parent_edges) {
    if (genOk(e) && statesMe(e)) statedBy.set(e.kind, (statedBy.get(e.kind) ?? 0) + 1);
  }

  // 谱上写的父名，和这个候选的名字（含字号、含「X公」敬称）对不对得上
  const wrote = fname(p.father_name);
  const fitsWritten = (e: ParentEdge) => {
    const f = idx.get(e.parent);
    if (!f || !wrote) return false;
    const forms = [NS(f.name), ...(f.aliases ?? []).map(a => NS(a.form))];
    return forms.some(x => x === wrote || x + '公' === wrote || x === wrote.replace(/公$/, ''));
  };
  // ★ 数「名字对得上几个」时，**只数还活着的候选**。
  //   壁贵写「光灼长子」。谱里除了光灼本人，还有一位光玉——他的**字就叫光灼**，
  //   所以名字对得上的有两个，规则就不敢动手了。
  //   可光玉早已被「生子名单点了别人」那条排掉。已经出局的不该再participate。
  const outByNamed = (e: ParentEdge) =>
    (namedBy.get(e.kind) ?? 0) >= 1 && !namesMe(e);
  // 同一种关系里，年代算得通的有哪几条——只在**有好几个候选**时才用来分辨。
  // ★ 必须**按关系分开数，而且只数世次差 1 的**。
  //   第一版一股脑全数，把嗣父边、还有世次差不为 1 的（梁映和本人同辈）
  //   也算了进去，於是「只有一个算得通」永远凑不齐，规则等於没写。
  const ageFitsBy = new Map<string, ParentEdge[]>();
  for (const e of p.parent_edges) {
    const f0 = idx.get(e.parent);
    if (!f0 || f0.gen == null || p.gen == null || p.gen - f0.gen !== 1) continue;
    // 同上：嗣父不受年代约束，别拿它去做「只有一个年代对得上」的判断
    if (e.kind === '生父' && !canFather(win?.get(e.parent), win?.get(p.pid)).ok) continue;
    (ageFitsBy.get(e.kind) ?? ageFitsBy.set(e.kind, []).get(e.kind)!).push(e);
  }

  const nameFits = new Map<string, number>();
  for (const e of p.parent_edges) {
    if (outByNamed(e)) continue;
    if (fitsWritten(e)) nameFits.set(e.kind, (nameFits.get(e.kind) ?? 0) + 1);
  }

  // ★ 兄弟连排：同册同房同世、写着同一个父名的是兄弟；
  //   他们里面已经定了的若都指向同一位，本人跟着定。
  const sibPick = new Map<string, string>();
  if (!noSib && p.father_name && !isFragment(p)) {
    const k = `${p.src.vol}|${p.src.section}|${p.gen}|${fname(p.father_name)}`;
    const bros = (siblingGroups(idx).get(k) ?? []).filter(q => q.pid !== p.pid);
    const dads = new Map<string, Set<string>>();
    let ordClash = false;
    for (const b of bros) {
      const byk = new Map<string, Cand[]>();
      for (const c of candidates(idx, b, chart, win, true)) {
        if (c.status !== 'ok') continue;
        (byk.get(c.edge.kind) ?? byk.set(c.edge.kind, []).get(c.edge.kind)!).push(c);
      }
      for (const [kk, list] of byk) {
        if (list.length !== 1) continue;
        (dads.get(kk) ?? dads.set(kk, new Set()).get(kk)!).add(list[0].edge.parent);
        // 排行撞车不定案：谱写「长子」，而已定的兄弟里已经有个长子
        if (myOrd != null && ordOf(b.filiation) === myOrd) ordClash = true;
      }
    }
    if (!ordClash) {
      for (const [kk, set] of dads) {
        if (set.size !== 1) continue;
        const only = [...set][0];
        if (p.parent_edges.some(e => e.kind === kk && e.parent === only)) sibPick.set(kk, only);
      }
    }
  }

  const out = p.parent_edges.map(edge => {
    const f = idx.get(edge.parent) ?? null;
    const layoutNote = layoutOf(p, f);
    if (f && f.gen != null && p.gen != null && p.gen - f.gen !== 1) {
      const d = p.gen - f.gen;
      return {
        edge, person: f, status: 'gen' as const, layoutNote,
        printedAbove: above.has(edge.parent),
        note: d === 0 ? `他也是第 ${f.gen} 世，同辈`
            : d < 0 ? `他是第 ${f.gen} 世，比本人晚 ${-d} 代`
            : `他是第 ${f.gen} 世，比本人早 ${d} 代`,
      };
    }
    // 排行只对上一个候选时，其余的排掉——位置是谱自己写的，数出来的。
    // 只排生父：嗣父那条线跟本生家的排行无关（见上面 ordFits 处）。
    if (edge.kind === '生父' && ordFits && ordFits.length === 1 && !ordFits.includes(edge)) {
      const w = idx.get(ordFits[0].parent);
      const sons = cleanSons(w);
      return {
        edge, person: f, status: 'ord' as const, layoutNote,
        printedAbove: above.has(edge.parent),
        note: `谱上写本人是「${p.filiation}」，他的生子名单里本人不在那个位置`
            + (w ? `；${w.name}（${w.src_human.split('·').slice(1, 3).join('·')}）`
                 + `名单 ${sons.join('、')} 里正好对上` : ''),
      };
    }
    // ★ 本人自己写了父名，那么**同一种关系里，名字对不上的排掉**。
    //
    //   壁贵（册3·卷五·第44页）自己写「光灼长子」，光灼那条的生子名单里也有他，
    //   两边对得上。可候选里还挂着一个「光满」——那条边来自别人那句
    //   「立胞弟光满长子壁贵为嗣」，说的是**另一个**壁贵。
    //   光满不叫光灼；谱也没说这个壁贵还有第二个生父。
    //
    //   比对带上字、号（谱上写父名，写的可能是字），也认「X公」这种敬称写法。
    //   只管同一种关系——嗣父那条本来就该是另一个名字，不受这条影响。
    // ★ 但**对方写明「立本人为嗣」的那一条，不能用这条规则排掉**。
    //   两处都是谱自己写的，写在不同的地方，说法不一致：
    //       继华那一条写「壁洲公嗣子」
    //       壁福那一条写「立壁温次子继华为嗣」
    //   下面这条规则会因为「本人写的是壁洲」排掉壁福，
    //   再下面那条会因为「壁福写明立本人为嗣」排掉壁洲——
    //   **两条规则互相消，最后一个嗣父都不剩**，而谱明明写了两次。
    //   谱自相矛盾时，两条都留、并排摆着，让人自己看。这就是不猜。
    if (p.father_name && nameFits.get(edge.kind) === 1 && !fitsWritten(edge)
        && !statesMe(edge)) {
      const w = idx.get(p.parent_edges.find(e => e.kind === edge.kind && !outByNamed(e) && fitsWritten(e))!.parent);
      return {
        edge, person: f, status: 'wrote' as const, layoutNote,
        printedAbove: above.has(edge.parent),
        note: `谱上写本人是「${p.father_name}${p.filiation ?? '之子'}」，他不叫这个名字`
            + (w ? `；${w.name}（${w.src_human.split('·').slice(1, 4).join('·')}）才是` : ''),
      };
    }
    // ★ 谱自己写明「立某某为嗣」的那一位——别的候选排掉。
    // 同上：**本人自己写了这个名字的那一条，不能用这条规则排掉。**
    if (statedBy.get(edge.kind) === 1 && !statesMe(edge) && !fitsWritten(edge)) {
      const winner = p.parent_edges.find(e => e.kind === edge.kind && statesMe(e))!;
      const w = idx.get(winner.parent);
      const stmt = (NS(w?.raw_text ?? "").match(ADOPT_RE) ?? [])[0] ?? "";
      return {
        edge, person: f, status: 'adopt' as const, layoutNote,
        printedAbove: above.has(edge.parent),
        note: `谱上写明是另一位：${w?.name}（${w?.src_human.split('·').slice(1, 4).join('·')}）`
            + `那一条写着「${stmt}」`,
      };
    }
    // ★ 名额已经有人自报了——**数出来的，不是判断的。**
    //
    //   继均那一条写「生子六：开雄、开志、开兆、开群、开俊、开赛」，
    //   而这六个人**各自在自己条目里写明「继均之子」**，还带着
    //   长子／次子／三子／四子／五子／幼子。六个位置全被自报家门的人填满了。
    //
    //   另有三个人（开志两位、开雄一位，在卷八和朝京公世系）**自己那一条
    //   一个父亲都没写**，只是名字撞上了继均的名单，就被反查挂了进来，
    //   于是名片上出现了「子女 9」。
    //
    //   这一条只在**本人条目没写父亲**时才用：谱上写了父名的人，
    //   他自己的话永远优先，绝不会被这条排掉。
    //   ★ 只用来排**反查自己造出来的边**（derived）。谱上写了过继语句的
    //     （stated_adopt）一律不碰——那是谱明说过的话，轮不到我们数名额。
    if (!p.father_name && (edge as any).derived) {
      const fname = f ? NS(f.name) : '';
      const mine = NS(p.name);
      const taken = (selfDeclared(idx).get(`${fname}|${p.gen}`) ?? [])
        .filter(q => q.pid !== p.pid && NS(q.name) === mine);
      if (f && fname && taken.length) {
        return {
          edge, person: f, status: 'slot' as const, layoutNote,
          printedAbove: above.has(edge.parent),
          note: `本人条目没写父亲；${f.name}的生子名单里「${p.name}」这个位置，`
              + `${taken.map(q => q.src_human.split('·').slice(1, 4).join('·')).join('、')} `
              + `那一位在自己条目里写明是「${f.name}${q0(taken[0])}」`,
        };
      }
    }
    // ★ 只要**有人**点了名，没点名的就排掉——不必「恰好一个」。
    //
    //   原先写的是 `=== 1`，本意是「两个都点了名就分不出，照样摆着」。
    //   可那句话只该管**那两个**，不该放过其余的。
    //   第 26 世有七个开国，各写「生子二」。承志被其中两个点了名，
    //   於是 namedBy = 2，另外五个一条都没排掉——他们的名单里
    //   根本没有承志，却照样把他列在了子女栏里。
    //   点了名的那几个仍然并排摆着，一个不挑。
    if ((namedBy.get(edge.kind) ?? 0) >= 1 && !namesMe(edge)) {
      const winner = p.parent_edges.find(e => e.kind === edge.kind && namesMe(e))!;
      const w = idx.get(winner.parent);
      return {
        edge, person: f, status: 'named' as const, layoutNote,
        printedAbove: above.has(edge.parent),
        note: `他那一条的生子名单里没有「${p.name}」`
            + (w ? `，${w.src_human.split('·').slice(1, 3).join('·')} 那个有` : ''),
      };
    }
    // ★ 兄弟已经定了，本人跟着定——谱把兄弟连着印在一起。
    // ★ 兄弟连排是**推断**（「你兄弟都定了，你跟着定」），
    //   绝不能盖过谱自己两处白纸黑字的互相点名。
    //
    //   光云（册3·卷五·第54页第3行）写「梁福之子」，
    //   梁福（同页**第2行**）生子名单写「光云、光贵」——两边互相点名、
    //   同页正上一行，rank1，全谱最硬的一种。可他被兄弟连排排掉了，
    //   理由是「同写梁福的兄弟都定成了另一个梁福（卷六·第241页）」。
    //   壁进（第198页）也是同一回事。
    //
    //   这跟今天修掉的几条同一个毛病：**弱规则盖过强规则**。
    //   两边都写了的边，任何推断都不许动它。
    const pick = sibPick.get(edge.kind);
    if (pick && pick !== edge.parent && !(edge.rank === 1 && namesMe(edge) && fitsWritten(edge))) {
      const w = idx.get(pick);
      return {
        edge, person: f, status: 'sib' as const, layoutNote,
        printedAbove: above.has(edge.parent),
        note: `同写「${p.father_name}」的兄弟都已定为 ${w?.name}`
            + `（${w?.src_human.split('·').slice(1, 4).join('·')}），谱把他们连着印在一起`,
      };
    }
    // 活跃时间段：生年、殁年、寿数、配偶年份、子女生年，全用上。
    // **最有力的是殁年**——「他殁于 1789，本人生于 1826」，那是硬的。
    //
    // ★ **但年代只管生父那条线。**
    //
    //   立嗣的定义就是「这个人死了、没有儿子，所以过继一个来承祧」。
    //   嗣子生在嗣父身后是**常态，不是矛盾**：
    //       梁柯　生1821 殁1835   十四岁殁，生子名单空
    //       光耀　生1838          「梁柯嗣子」——比嗣父去世还晚三年
    //   拿生育年龄去卡宗法关系，等於把「立嗣」这件事本身判成不可能。
    //   全谱 83 条嗣父边栽在这，跟上午那条「拿排行卡嗣父」是同一类错：
    //   **生父的判据套到了嗣父头上。**
    //
    //   嗣父那条线只剩一道闸：世次必须差 1（原书列头标死的，上面已经卡过）。
    const a = edge.kind === '生父'
      ? canFather(win?.get(edge.parent), win?.get(p.pid))
      : { ok: true, text: '' };
    if (!a.ok) {
      // ★ 分清两件事：
      //
      //   一、**只有这一个候选**，年代却兜不拢 → 是谱自己前后矛盾。
      //       保留，并把矛盾摆出来（泽富八岁生子那种，见下）。
      //
      //   二、**好几个同名候选，只有一个算得通** → 年代不是在推翻谱，
      //       是在**补上谱没说的那一句**。谱只写「泽贵之子梁玉」，
      //       没说哪个泽贵；减法说了：
      //
      //         梁玉(338页 生1822)  泽贵(338页 生1783) 早39年 ✓　泽贵(366页 生1825) 早-3年 ✗
      //         梁玉(366页 生1871)  泽贵(338页 殁1833) 晚38年 ✗　泽贵(366页 生1825) 早46年 ✓
      //
      //       两个梁玉各自只有一个算得通的泽贵，而且正好是同页那个。
      //       这是减法，不是意见。
      const fits = ageFitsBy.get(edge.kind) ?? [];
      if (fits.length === 1 && !fits.includes(edge)) {
        const w = idx.get(fits[0].parent);
        return {
          edge, person: f, status: 'age' as const, layoutNote,
          printedAbove: above.has(edge.parent),
          note: `${a.text}；同名的${w?.name}（${w?.src_human.split('·').slice(1, 4).join('·')}）年代对得上`,
        };
      }
      // ★ **谱两边都写明的话，不许被年代推翻。**
      //
      //   梁馥那一条写「泽富公长子」，泽富那一条的生子名单第一个就是梁馥——
      //   两边对得上，rank 1。可年代规则把它排掉了：泽富生於乾隆四十二年
      //   (1777)、殁於乾隆五十年 (1785)，八岁。
      //
      //   翻开原文就知道为什么：
      //       殁于　乾隆五十年八月初七日亥时
      //       娶王氏
      //       生于　乾隆五十年八月初七日亥时
      //   **同一个日期抄了两遍**——王氏的生年落进了泽富的殁年位置。
      //   泽富有五个 1804–1813 年生的儿子，还迁居陕西商州。
      //
      //   矛盾是谱自己的。这种时候该做的是**把矛盾说出来**，
      //   不是拿一个可疑的日期去推翻谱明明白白写下的父子关系。
      //   年代规则继续管 rank 2–5 的弱边——那里它是有效的。
      if (edge.rank === 1 && namesMe(edge)) {
        return {
          edge, person: f, status: 'ok' as const, layoutNote,
          printedAbove: above.has(edge.parent),
          note: `谱上前后对不上：${a.text}`,
          conflict: a.text,
        };
      }
      return { edge, person: f, status: 'age' as const, layoutNote,
               printedAbove: above.has(edge.parent), note: a.text };
    }
    return {
      edge, person: f, status: 'ok' as const, layoutNote,
      printedAbove: above.has(edge.parent),
      note: a.text || windowNote(win?.get(edge.parent)),
    };
  });
  if (noSib) BASE.get(idx)!.set(p.pid, out);
  return out;
}

/**
 * 留下的候选。
 *
 * ★ **绝不返回空。**
 *
 *   如果三条判据把所有候选都排掉了，那不是「他没有父亲」——
 *   那是**我们的规则错了，或者谱上自己两处对不上**。
 *   泽治、泽滺、泽纯三兄弟生于 1766/1769/1772，而谱上写他们父亲铣质殁于 1764。
 *   三个儿子全生在父亲死后——这时候该说的是「谱上这里对不上」，
 *   不是悄悄把链掐断，让三个人从此没有祖先。
 *
 *   所以全排掉时，**原样全部返回**，由界面报「谱上这里对不上」。
 *   宁可摆着一堆说不清的，也不能凭我们的规则把人从世系里抹掉。
 */
export function kept(cs: Cand[]): Cand[] {
  const ok = cs.filter(c => c.status === 'ok');
  return ok.length ? ok : cs;
}

export const ruled = (cs: Cand[]) => cs.filter(c => c.status !== 'ok');

/** 全被排掉了——谱上这里对不上，或我们的规则错了。界面要报出来。 */
export const allRuledOut = (cs: Cand[]) =>
  cs.length > 0 && cs.every(c => c.status !== 'ok');
