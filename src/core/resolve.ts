/**
 * **他父亲是谁——唯一的判断处。**
 *
 * 输入是 `facts.ts` 摆好的证据，输出是结论 ＋ 它引用的那条证据。
 *
 * ═══ 按次第判，不是赛跑 ═══
 *
 * CLAUDE.md 的判断次第，这里第一次真正实现出来：
 *
 *     ① 谱的原话   本人写的父名 · 父亲名单点了他 · 出嗣语句点名 · 排行
 *     ② 谱的定式   辈字→世次 · 世代列头 · 五世一图版面（正上一格）
 *     ③ 年月算术   生卒年代
 *     ④ 推断       兄弟连排、名额占用…
 *
 * **低一级永远不能推翻高一级。** 同一级里两条打架，才叫「说不清」。
 *
 * 旧办法是十条排除规则一串 early return，谁先命中谁说了算。2026-09-04 一天
 * 撞出三个同形状的错（`seealso` `gen` `named` 各拿一条低级证据推翻了原话），
 * 而每修一条就在别处塌一块——往平表上加豁免是错的药。
 *
 * ═══ 排行为什么放在第一级 ═══
 *
 * 「幼子」就是名单末位，「次子」就是第 2 位——这是**读字**，不是推断。
 * 在 396 个「真同名、且谱自己点了名」的案例上重测，**指对 396/396 = 100%**。
 * （早先测得 93.45% 是错的：那时名单没洗，混着女儿和「公殁于」这类串，位置全乱。）
 *
 * 铣德（P-册2-0230-5-0-0，道光五年修谱督修默齐拔萃）那一条写「士彥公**幼子**」：
 *     士飞名单第 1/4 位 ✗　士太第 1/4 位 ✗　士兴第 2/4 位 ✗
 * 三个假候选一句话全排掉，剩下上彥（＝士彥，就印在他正上一格）。
 *
 * ★ `people.json` 一个字没动。
 */
import type { Person } from './types.ts';
import type { Facts, Mention } from './facts.ts';
import { norm } from './norm.ts';
import { canFather, type Window } from './activity.ts';

const NS = norm;
const bare = (s: string | null | undefined) => NS(s ?? '').replace(/公$/, '');

/** 判断用到的证据在哪一级 */
/**
 * 判到哪一级。
 *
 * ★ 「谱未写」和「说不清」是两回事，不允许混。
 *   谱未写 = 编谱人就没记这一条，那是谱的实情，凡例自己写着
 *              「纪其所可知，阙其所未知」。界面就该说「谱上没写」。
 *   说不清 = 谱写了，但同名的不止一位，我们判不出是哪一位。
 *
 *   早先两者都返回「说不清」，于是梅珍那种人——谱白纸黑字写着
 *   「泽昌公嗣子」、全谱只有一个泽昌——卡片上也顶着一句「说不清」。
 *   那不是谨慎，那是胡说。
 */
export type Level = '人工核定' | '原话' | '定式' | '算术' | '推断' | '谱未写' | '说不清';

export interface Pick {
  pid: string;
  /** 凭什么——照抄谱上的话，或说明是哪一条定式 */
  why: string;
  level: Level;
  /**
   * ★★ **这一位是怎么找到的。全站只有这两种。**
   *
   *   `'id'`   —— 谱把话写在**那个人自己的条目里**，或把他印在那个格子里。
   *                 「立胞兄长子继定为嗣」写在壁松@p26 那一条——**坐标就是他**。
   *                 「三弟」「长兄」也是：写话人的父亲名单里第 N 位，精确到一个 pid。
   *   `'name'` —— 我们拿一个**名字**去全谱搜同名的人。名字不是身份。
   *
   * 两者撞上时，**id 那一路味着谱已经把话说到人头上了**，
   * 跟它同名的那几位只是撞名。这不是两条规则，是一条：
   * **坐标压名字。** 所有同名候选的去留都由它一处决定。
   */
  via?: 'id' | 'name';
}

export interface Resolved {
  /** 生他的那一位。正常恰好 1 位 */
  birth: Pick[];
  /** 把他接过去的。兼祧几房就几位 */
  heir: Pick[];
  /** 同名而被排在一边的，**不删**，照样列、照样能点 */
  alsoNamed: { pid: string; why: string }[];
  /** 到哪一级才判出来的 */
  level: Level;
  /** 谱自己前后对不上的地方，原样记着 */
  conflicts: string[];
}

/** 名单里第 pos 位（共 of 位）算不算「排行 ord」那个位置 */
function ordHits(ord: number | null, pos?: number, of?: number): boolean {
  if (ord == null || pos == null || of == null) return false;
  return ord === -1 ? pos === of : pos === ord;
}

/**
 * **只此一处。** 每一步都注明用的是哪一级证据。
 */
export function resolveFather(
  F: Map<string, Facts>, idx: Map<string, Person>, f: Facts,
  /**
   * pid → 同一个人的完整条 pid。
   *
   * ★ **第一遍就得按同一身份看。**
   *   开发在谱上有两条（册4 p48、p50，字/生/妻/子女一字不差，p50 写「兼祠继良」），
   *   两条的生子名单里都有承武（一处写谱名「承武」、一处写字「承祥」）。
   *   不折就看成「两个开发都点了他的名」→「说不清」——
   *   而谱上就是一个人。折完再判，答案当场就出来了。
   */
  canon: (pid: string) => string = (x) => x,
): Resolved {
  const conflicts = [...f.conflicts];
  if (!f.gen.agree) {
    conflicts.push(
      `世代列头把他排在第 ${f.gen.by_row} 世，而辈字「${f.gen_char}」是第 ${f.gen.by_char} 世`);
  }

  // ── 收集候选。两个来源，都是谱的原话 ──────────────────
  //   A. 本人写了父名，上一世有人叫这个名字
  //   B. 有人在生子名单里点了他
  const wantGen = (f.gen.by_char ?? f.gen.by_row ?? NaN) - 1;
  const written = f.self.father_norm;

  // ★ 本人排行写「嗣子／祧子」时，他写的那个父名是**嗣父**，不是生父。
  //   启昌写「朝阳公嗣子」——朝阳是把他接过去的那位；生他的是朝相，
  //   写在朝相那一条：「次子启昌出嗣朝阳」。
  //   不分开的话，生父和嗣父会判成同一个人，凡例十三要的双记就没了。
  // ★★ **已经按 id 定下的嗣父，不再进生父候选池。**
  //
  //   同一个 pid 不可能既是他的生父又是他的嗣父，
  //   除非谱自己写了「承本身」（既承本家、又兼祠别房）。
  //
  //   光孝（册3 p58 行3）就是这么错的：
  //       梁椽（泽洋公三子）那一条写「立长兄次子光孝为嗣」
  //       梁柱（泽洋公长子）名单里第二个正是光孝
  //       光孝自己那一条写「梁椽公嗣子」
  //   三处互相印证：**生父梁柱、嗣父梁椽**。
  //   可候选池里梁柱和梁椽并列，后面那条「正上一格」（第②级定式）
  //   挑中了梁椽——**把已经按原话定下的嗣父又填进了生父那一格**。
  //
  //   只拿**第①级（原话）**定下的嗣父来排除；第②级的不参与，
  //   免得一条定式去排掉另一条定式。比的是 id，不是名字。
  const heirPinned = new Set(
    heirOf(F, f).filter(x => x.level === '原话').map(x => x.pid));
  const keepsOwn = /承本身/.test((idx.get(f.pid)?.raw_text ?? '').replace(/[\s　]+/g, ''));
  const notTheHeirFather = (g: Facts) => keepsOwn || !heirPinned.has(g.pid);

  const byName: Facts[] = [];
  if (written && !f.self.is_heir) {
    for (const g of F.values()) {
      if (g.pid === f.pid) continue;
      const gg = g.gen.by_char ?? g.gen.by_row;
      if (gg !== wantGen) continue;
      if (g.self.aliases.some(a => bare(a) === written) || bare(g.name) === written) byName.push(g);
    }
  }
  // 按同一身份去重：同一个人的几条记载只算一位候选
  {
    const seen = new Set<string>(); const one: Facts[] = [];
    for (const g of byName) {
      const c = canon(g.pid);
      if (seen.has(c)) continue;
      seen.add(c);
      one.push(F.get(c) ?? g);
    }
    byName.length = 0; byName.push(...one);
  }
  const namedBy = f.mentions.filter(m => m.kind === '生子名单');
  // 出嗣语句写在**生父**那一条上：「长子光明出嗣长兄梁檀兼祧三兄梁槐」是梁桂说的。
  const outBy = f.mentions.filter(m => m.kind === '出嗣语句');
  if (f.self.is_heir) {
    // ★ 出嗣句里写明的**去处**要跟本人写的嗣父对上，才算说的是他。
    //   谱里有好几个光明，梁桂写「长子光明出嗣长兄梁檀兼祧三兄梁槐」，
    //   梁构、梁典也各写过「…光明出嗣…」，去处却不是梁檀——那说的是别人。
    // to_father 是剥完称谓的整段（「梁檀兼祧三兄梁槐」），名字在最前面，按前缀比
    const pre = (t: string | undefined, w: string) =>
      !t || !w || t.startsWith(w) || w.startsWith(t.slice(0, w.length));
    const fit = outBy.filter(m => pre(m.to_father, written));
    // ★ **没有兜底。**
    //   出嗣语句是按名字扭到每一个同名者头上的：壁林写「子继华兼祥…」，
    //   全谱四个继华都接到了这句话。其中 p294 那位写的是「壁福公嗣子」、
    //   字金龙、民国九年生——**是另一个人**。
    //   早先写着 `fit.length ? fit : outBy`：去处对不上就把对不上的也用上，
    //   于是四个继华全归了壁林，壁林的子女栏里出现四个儿子。
    //   对不上就是说那句话不是说他，该往下走其他证据，不是硬拉。
    const use = fit;
    const seen = new Set<string>();
    for (const m of [...use, ...namedBy]) {
      if (seen.has(m.by)) continue;
      seen.add(m.by);
      const g = F.get(m.by);
      if (g && notTheHeirFather(g)) byName.push(g);
    }
    // 出嗣句写在**生父**那一条上，比「被列进名单」硬——名单里也可能是嗣父在列嗣子。
    const strong = [...new Set(use.map(m => m.by))];
    if (strong.length === 1 && F.get(strong[0])) {
      const m = use.find(x => x.by === strong[0])!;
      return done(F.get(strong[0])!,
        `${m.by_name}那一条写「${m.text}」——出嗣句写在生父那一条上`, '原话');
    }
    if (byName.length === 1) {
      const m = [...use, ...namedBy].find(x => x.by === byName[0].pid)!;
      return done(byName[0], m.kind === '出嗣语句'
        ? `${m.by_name}那一条写「${m.text}」——出嗣句写在生父那一条上`
        : `${m.by_name}的生子名单里写了「${m.as}」`, '原话');
    }
  }

  // ══ ① 谱的原话 ══════════════════════════════════════
  //
  // A. **两边都写**：他写了父名，那位的生子名单里也有他。最硬。
  const twoWay = byName.filter(g => namedBy.some(m => canon(m.by) === canon(g.pid)));
  if (twoWay.length === 1) {
    return done(twoWay[0], `本人写「${f.self.father_name}${f.self.filiation}」，`
      + `${twoWay[0].name}的生子名单里也有他——两边都写`, '原话');
  }

  // B. **写了父名 ＋ 排行对上名单位次**：同名的几位里，只有一位把他放在那个位置。
  if (f.self.ord != null && byName.length > 1) {
    const fit = byName.filter(g => {
      const m = namedBy.find(x => x.by === g.pid);
      return m && ordHits(f.self.ord, m.pos, m.of);
    });
    if (fit.length === 1) {
      const m = namedBy.find(x => x.by === fit[0].pid)!;
      return done(fit[0], `本人写「${f.self.father_name}${f.self.filiation}」；`
        + `${fit[0].name}的生子名单里他排第 ${m.pos}／共 ${m.of}，正是${f.self.filiation}的位置`,
        '原话', byName.filter(g => g.pid !== fit[0].pid));
    }
  }

  // B'. **没写父名，但排行对上**：谱在几份名单里都有这个名字，只有一份位置对。
  if (f.self.ord != null && !written && namedBy.length > 1) {
    const fit = namedBy.filter(m => ordHits(f.self.ord, m.pos, m.of));
    if (fit.length === 1) {
      const g = F.get(fit[0].by)!;
      return done(g, `本人条目没写父名，但写了「${f.self.filiation}」；`
        + `${g.name}的生子名单里他排第 ${fit[0].pos}／共 ${fit[0].of}，位置正对`, '原话');
    }
  }

  // C. **写了父名，上一世只有这一位叫这个名字**。
  if (byName.length === 1) {
    return done(byName[0], `本人写「${f.self.father_name}${f.self.filiation}」；`
      + `第 ${wantGen} 世叫这个名字的只有他`
      + (bare(byName[0].name) === written ? '' : `（他那一条题作「${byName[0].name}」）`),
      '原话');
  }

  // D. **没写父名，只有一位在名单里点了他**（世系表一格里并排印着几个兄弟，
  //     父名写在页眉上，行内不再重复——这批人自己那一条本来就没有父名）。
  if (!written && namedBy.length === 1) {
    const g = F.get(namedBy[0].by)!;
    return done(g, `本人条目没写父名；${g.name}的生子名单里写了「${namedBy[0].as}」`, '原话');
  }

  // E. **写了父名，但上一世没有叫这个名字的人——而恰好只有一位把他写进了生子名单。**
  //
  //    那就是他。名字对不上是谱这一处字写岔了，不是人对不上：
  //
  //        文端写「腾二幼子」  → 胜二（迁梅始祖，腾／胜 形近）
  //        士校写「士学德三子」 → 学德（「士」是上一行粘进来的）
  //        铣与写「学麟」    → 士麟（辈字写错，学↔士）
  //        梁选写「梁毅」    → 泽毅（把儿子的辈字写成了父亲的）
  //        承毅写「承国」    → 开国（同上；早先误以为是谱漏了一世）
  //
  //    「某人的生子名单里写了他」是谱自己的话，属第①级；
  //    字形对不上不影响这句话的存在。只在**上一世真的没人叫这个名字**
  //    （byName 为空）且**只有一位点名**时才用，推翻不了任何已成立的判断。
  if (written && !byName.length && !f.self.is_heir) {
    const nb = [...new Set(namedBy.map(m => m.by))];
    if (nb.length === 1) {
      const g = F.get(nb[0]);
      const m = namedBy.find(x => x.by === nb[0])!;
      if (g) {
        return done(g, `本人写「${f.self.father_name}${f.self.filiation}」，`
          + `而第 ${wantGen} 世没有叫「${f.self.father_name}」的人；`
          + `${g.name}的生子名单里写了「${m.as}」——`
          + `谱这一处把父名写岔了`, '原话');
      }
    }
  }

  // F0. **写了父名，而正上一格就站着一个叫这名字的人。**
  //
  //     两条证据合在一处：谱写的名字（原话）＋谱摆的位置（定式）。
  //     比「别处有个同名的，他名单里有我」硬得多。
  //
  //     承胜（P-册4-0258-2-0）：册4 p258 竖着读是
  //         行1 开国 → 行2 承胜 → 行3 宏伟（承胜自己的儿子）
  //     谱写「开国长子」，头顶上就是开国。可全谱八个开国的名单里都没有他，
  //     下面的 G 条于是去找「谁的名单里有承胜」，找到了远在 p95 的开富——
  //     **把别人的父亲安到了他头上**。全谱有两个承胜，开富名下那个
  //     在学义公世系 p95，和他的两个弟弟 p96、p97 自成一列。
  if (written && byName.length) {
    const ab = byName.filter(g => f.layout.above.includes(g.pid));
    if (ab.length === 1) {
      return done(ab[0], `本人写「${f.self.father_name}${f.self.filiation}」，`
        + `而谱就把一位叫「${ab[0].name}」的印在他的正上一格`
        + `——名字和位置两处对上`, '原话',
        byName.filter(g => g.pid !== ab[0].pid));
    }
  }

  // G. **父名找到了同名的人，但没一个认他；另有一位把他写进名单，而且排行位置对得上。**
  //
  //    开魁、开茂、开金三兄弟（册4 p211/212/213），页眉各写「继林长子」
  //    「继林次子」「继林幼子」。全谱两个继林，名单里都没有这三个人；
  //    而**继铃@p216 的生子名单正好把他们排在第 1、2、3 位**，共三人。
  //    那就是继铃，页眉把「铃」印成了「林」。
  //
  //    “名单里写了他”和“排行对得上位置”都是谱自己的话，两句一起成立才用；
  //    光有名字撞上不算。排行对不上就不用（开银写「长子」而名单里在第 2 位，不用）。
  if (written && byName.length && f.self.ord != null
      && !byName.some(g => namedBy.some(m => m.by === g.pid))) {
    const fit = namedBy.filter(m => ordHits(f.self.ord!, m.pos, m.of));
    const uniqBy = [...new Set(fit.map(m => m.by))];
    if (uniqBy.length === 1 && F.get(uniqBy[0])) {
      const g = F.get(uniqBy[0])!;
      const m = fit.find(x => x.by === uniqBy[0])!;
      return done(g, `谱写他是「${f.self.father_name}${f.self.filiation}」，`
        + `可叫这名字的 ${byName.length} 位名单里都没有他；`
        + `${g.name}的生子名单里他排第 ${m.pos}／共 ${m.of}，正是${f.self.filiation}的位置`
        + `——谱这一处把父名写岔了`, '原话', byName);
    }
  }

  // E2. **谱写了父名，那个名字全谱只有一位，只是世次对不上。**
  //
  //     溪公、沥公那两条写「碱公次子」「碱公幼子」，而碱公是 12 世、
  //     他俩印在行 4（＝14 世）。他俩的字是「兰階」「兰芳」，
  //     而「兰」是第 13 世的字辈——**谱把这两个人印低了一格。**
  //     梁海「光採」、梁阐「梁桂」、梁娄「光辉」同类：父名的辈字写岔了。
  //
  //     早先只在「上一世」找，找不到就一个候选不剩——
  //     **那是拿定式（世次）把谱的原话抹了**，正是 CLAUDE.md 禁的那件事。
  //     全谱只有一位叫这名字时，就按原话认，把世次矛盾记在 conflicts 里。
  if (written && !byName.length && !namedBy.length) {
    const anyGen: Facts[] = [];
    for (const g of F.values()) {
      if (g.pid === f.pid) continue;
      if (bare(g.name) === written || g.self.aliases.some(a => bare(a) === written)) anyGen.push(g);
    }
    if (anyGen.length > 1) {
      // 同名好几位、世次也对不上——**全摆出来说不清**，
      // 不能一个不剩。一个不剩就是把谱写的话抹了（CLAUDE.md 第二节「不漏」）。
      conflicts.push(`谱写「${f.self.father_name}${f.self.filiation}」，`
        + `叫这名字的有 ${anyGen.length} 位，而且都不在上一世`);
      byName.push(...anyGen);
    }
    if (anyGen.length === 1) {
      const g = anyGen[0];
      const gg = g.gen.by_row ?? g.gen.by_char;
      conflicts.push(`谱写「${f.self.father_name}${f.self.filiation}」，`
        + `而${g.name}标在第 ${gg} 世、本人标在第 ${f.gen.by_row} 世——相差不是一世。`
        + `依「谱的原话 ＞ 谱的定式」，关系照原话算，世次这一处是谱印错了`);
      return done(g, `本人写「${f.self.father_name}${f.self.filiation}」；`
        + `全谱叫这名字的只有他一位`, '原话');
    }
  }

  // F. **页眉指向 ∩ 生子名单**。两句都是谱自己写的，交集只剩一位就是他。
  //
  //    行 1 的人不写父名，父亲在上一页，靠页眉带指回去。
  //    而**一页几栏，页眉带上就有几个指向**：
  //        第 342 页：「子之公禄铣　　　子之公忾铣」
  //    泽广在那一页，名单里点他的有铣禄、铣辕两位，
  //    而页眉写的是铣禄、铣忾——**两边都有的只有铣禄。**
  //    这不是推断，是谱的两句话对上了。
  {
    const ptrs = ((idx.get(f.pid) as any)?.page_ptrs ?? []) as { name: string }[];
    if (ptrs.length > 1 && !byName.length) {
      const want = new Set(ptrs.map(x => bare(x.name)));
      const hit = [...new Set(namedBy.map(m => m.by))]
        .map(id => F.get(id)!).filter(g => g && want.has(bare(g.name)));
      if (hit.length === 1) {
        const m = namedBy.find(x => x.by === hit[0].pid)!;
        const raw = ptrs.map(x => x.name).join('、');
        return done(hit[0],
          `本人那一条没写父名（行 1，父亲在上一页）；`
          + `本页页眉带指向${ptrs.length} 位（${raw}），`
          + `而生子名单里写了他的只有${hit[0].name}——两边对上`, '原话');
      }
    }
  }

  // ══ ② 谱的定式 ══════════════════════════════════════
  //
  // 五世一图横着读：儿子印在父亲的下一格。谱把谁摆在正上一格，就是他。
  const pool = byName.length ? byName : namedBy.map(m => F.get(m.by)!).filter(Boolean);
  // ★ 本人写「X嗣子」时，X 是嗣父，**叫 X 的那几位一律不是生父候选**。
  //   否则它们会从「说不清」那一支漏进生父栏，
  //   变成「他的生父是光被@p176 或光被@p285」——而光被本就是他的嗣父。
  const uniq = [...new Map(pool.map(g => [g.pid, g])).values()]
    .filter(g => !(f.self.is_heir && written && bare(g.name) === written));
  if (uniq.length > 1) {
    // ★ 本人写的是「X嗣子」时，X 是**嗣父**，不能拿来当生父。
    //   光斗（P-册2-0324-4-0）写「梁木嗣子」，而梁木就印在他正上一格；
    //   梁木那一条自己写着「立二兄幼子光斗为嗣」——他是嗣父，
    //   生父是他的二兄。把嗣父填进生父那一格，不仅错，还会让第二遍的
    //   「称谓词指向」以为已经定下来了而不再去找那位二兄。
    const uniqB = uniq;
    const above = uniqB.filter(g => f.layout.above.includes(g.pid));
    if (above.length === 1) {
      return done(above[0], `谱把他印在正上一格——五世一图一幅断为五格、五代横提，`
        + `儿子就印在父亲的下一格`, '定式', uniq.filter(g => g.pid !== above[0].pid));
    }

    // ★ **房支**。谱是按房分卷编的，一个人写在哪一房里是谱自己的安排。
    //   全谱五个「继生」，而开明写在朝寿公世系，五个里只有一个在朝寿公世系——
    //   那就是他爸。这条一直没用上，白白把一批人报成了「说不清」。
    //
    //   只在**恰好剩一位**时才定案；跨房过继是真实存在的，但谱会写明，
    //   而这里是第②级「定式」，压在第①级「原话」之下，推翻不了谱写的话。
    const mySec = idx.get(f.pid)?.src?.section;
    if (mySec) {
      const sameHouse = uniqB.filter(g => idx.get(g.pid)?.src?.section === mySec);
      if (sameHouse.length === 1) {
        return done(sameHouse[0],
          `谱上叫「${sameHouse[0].name}」的有 ${uniq.length} 位，其中只有一位与他同在「${mySec}」`,
          '定式', uniq.filter(g => g.pid !== sameHouse[0].pid));
      }
    }

    // ★ **版面证伪**。五世一图里，一个人只印在一个父亲底下。
    //
    //   壁金（P-册3-0066-4-0）印在光云 p66 那一格底下，谱又写着他是光云的嗣子。
    //   可全谱另外五个人（光覆 p68、光得 p169、光甲 p211、光远 p320、光焕 p339）
    //   的生子名单里也各有一个「壁金」——**那是他们自己那个壁金**，
    //   各自印在他们自己那一格底下。名字撞了，人没撞。
    //
    //   早先把这五个全当候选摆出来，再说「说不清」——那不是谨慎，
    //   是把谱自己的排版证据扔了。候选全都站不住版面时，
    //   就该说「谱没写他的本生父」，而不是「不知道是哪一个」。
    //
    //   只在**候选全靠「名字出现在名单里」这一条**（没有出嗣语句、
    //   没有本人写的父名对得上）时才生效，推翻不了任何第①级的话。
    if (above.length === 0 && f.self.is_heir) {
      // 出嗣语句同样是按名字扭出来的——壁林那句说的是另一个继乾（去处不是壁树）。
      // 只有**去处对得上本人写的嗣父**的那几句才算数。
      const fitOut = outBy.filter(m =>
        !m.to_father || !written
        || m.to_father.startsWith(written) || written.startsWith(m.to_father.slice(0, written.length)));
      const onlyRoster = uniq.every(g =>
        namedBy.some(m => m.by === g.pid) && !fitOut.some(m => m.by === g.pid)
        && bare(g.name) !== written);
      if (onlyRoster) {
        const heir = heirOf(F, f);
        if (heir.length) {
          return { birth: [], heir, alsoNamed: uniq.map(g => ({ pid: g.pid,
            why: `他的生子名单里有一个「${f.name}」，`
               + `但那一位印在他自己那一格底下，不是本人` })),
            level: '原话', conflicts };
        }
      }
    }
  }

  // ══ ③ 没有本生父候选 ══════════════════════════════
  //    这时候要分清楚是哪种情况，不能一律说「说不清」。
  if (!uniq.length) {
    const heir = heirOf(F, f);
    // 嗣子：嗣父已经定下来了，只是谱没写他的本生父。
    // 那是谱的实情，不是我们判不出来。
    if (heir.length) {
      return { birth: [], heir, alsoNamed: [],
               level: heir.every(h => h.level === '原话') ? '原话' : heir[0].level,
               conflicts };
    }
    // 谱就没写父名，也没人在生子名单里点他。
    return { birth: [], heir: [], alsoNamed: [], level: '谱未写', conflicts };
  }

  // ══ ④ 真的说不清：同名不止一位 ════════════════
  return {
    birth: uniq.map(g => ({ pid: g.pid, level: '说不清' as const,
      why: `谱上叫「${g.name}」的有 ${uniq.length} 位` })),
    heir: heirOf(F, f),
    alsoNamed: [],
    level: '说不清',
    conflicts,
  };

  function done(g: Facts, why: string, level: Level, also: Facts[] = []): Resolved {
    const heir = heirOf(F, f);
    // ★★ **同一个 pid 不能既进生父栏又进嗣父栏。**
    //
    //   谱写「壁五祠子」——壁五是把他接过去的那位，不是生他的那位。
    //   可判据条数多了以后总有一条会从旁边把这个名字塞回生父栏
    //   （「全谱叫这名字的只有他一位」就是这么塞的），所以拦在**唯一的出口**上，
    //   比逐条打补丁牢靠。比的是 id，不是名字。
    //
    //   两个例外，都是谱的实情：
    //     · 兼祠本来就含本家——几位嗣父里有一位正是生父（继盟一子三祠）
    //     · 谱写明「承本身」（既承本家，又兼祠别房）
    //
    //   拦下来以后生父栏就空了——那正是谱的原样：它只写了嗣父，
    //   没写本生父。空着比填上一个已知不对的人诚实。
    const clash = !keepsOwn && heir.length === 1 && heir[0].pid === g.pid;
    if (clash) {
      conflicts.push(`谱只写了他是「${f.self.father_name}${f.self.filiation}」，`
        + `没写本生父——${f.self.father_name}是把他接过去的那一位`);
    }
    return {
      birth: clash ? [] : [{ pid: g.pid, why, level }],
      heir,
      alsoNamed: also.map(x => ({ pid: x.pid, why: `同名，在 ${x.layout.section}·第${x.layout.page}页` })),
      level, conflicts,
    };
  }
}

/**
 * **嗣父——把他接过去的那一家（或几家）。**
 *
 * 三个来源，**全部是谱的原话**：
 *   ① 嗣父那一条写「立…为嗣」，点了他的名          （立嗣语句）
 *   ② 生父那一条写「某子某出嗣某某」               （出嗣语句，嗣父名在「出嗣」后面）
 *   ③ 他自己那一条排行写「嗣子／祧子」＋父名        （本人的话）
 *
 * **兼祧不是歧义。** 谱在每一房下各写一次，几位就是几位——
 * 继华那一条：壁林写「子继华兼祧长兄壁洲二兄壁银」，壁洲、壁银都是他的嗣父。
 * 全谱兼祧 13 条、两祧 4 条、承本身并祧 3 条、归宗 1 条。
 */
function heirOf(F: Map<string, Facts>, f: Facts): Pick[] {
  const out = new Map<string, Pick>();

  // ① 立嗣语句：说这话的人就是嗣父
  for (const m of f.mentions) {
    if (m.kind !== '立嗣语句') continue;
    // ★ 语句里写明了本生父名的，必须对得上——否则说的是别人。
    //   壁福那条「立**壁温**次子继华为嗣」说的是壁温家的继华（字金龙，生1920），
    //   不是壁林家的继华（字东华，生1955）。不校验，全谱每个继华都被它认领。
    if (m.of_father) {
      const mine = new Set<string>([f.self.father_norm]);
      for (const x of f.mentions)
        if (x.kind === '生子名单' || x.kind === '出嗣语句') mine.add(bare(x.by_name));
      if (![...mine].some(x => x && m.of_father!.startsWith(x))) continue;
    }
    out.set(m.by, { pid: m.by, level: '原话',
      why: `${m.by_name}那一条写「${m.text}」`, via: 'id' });
  }

  // ② 出嗣语句：「X出嗣Y」，Y 是嗣父。Y 写在「出嗣」后面，可能带关系词（三弟／长兄）。
  for (const m of f.mentions) {
    if (m.kind !== '出嗣语句' || !m.text) continue;
    const tail = m.text.split(/出[嗣祠]/)[1] ?? '';
    const nm = bare(tail.replace(/^(胞|亲|堂|嫡|从)?(长兄|次兄|三兄|四兄|五兄|兄|弟|叔|伯|姪|侄)?[一二三四五六七八九十]?(兄|弟)?/, ''));
    if (nm.length < 2) continue;
    const wantGen = (f.gen.by_char ?? f.gen.by_row ?? NaN) - 1;
    for (const g of F.values()) {
      if ((g.gen.by_char ?? g.gen.by_row) !== wantGen) continue;
      if (!g.self.aliases.some(a => bare(a) === nm) && bare(g.name) !== nm) continue;
      if (!out.has(g.pid)) out.set(g.pid, { pid: g.pid, level: '原话',
        why: `${m.by_name}那一条写「${m.text}」`, via: 'name' });
    }
  }

  // ③ 本人排行写「嗣子／祧子」，父名就是嗣父
  if (f.self.is_heir && f.self.father_norm) {
    const wantGen = (f.gen.by_char ?? f.gen.by_row ?? NaN) - 1;
    const hit: Facts[] = [];
    for (const g of F.values()) {
      if ((g.gen.by_char ?? g.gen.by_row) !== wantGen) continue;
      if (g.self.aliases.some(a => bare(a) === f.self.father_norm)
          || bare(g.name) === f.self.father_norm) hit.push(g);
    }
    if (hit.length === 1 && !out.has(hit[0].pid))
      out.set(hit[0].pid, { pid: hit[0].pid, level: '原话',
        why: `本人写「${f.self.father_name}${f.self.filiation}」`, via: 'name' });
  }
  // ★ 本人写了嗣父名，而谱就把一位叫这名字的印在他正上一格。
  //   名字（原话）加位置（定式）两处对上，就是他。
  //   这一条要在第一遍就给出来，否则后面那条「版面证伪」看不到嗣父，
  //   会把「谱只写了嗣父」误报成「说不清」。
  if (f.self.is_heir && f.self.father_norm) {
    const ab = f.layout.above
      .map(x => F.get(x))
      .filter((g): g is Facts => !!g && bare(g.name) === f.self.father_norm);
    if (ab.length === 1 && !out.has(ab[0].pid)) {
      out.set(ab[0].pid, { pid: ab[0].pid, level: '定式',
        why: `本人写「${f.self.father_name}${f.self.filiation}」，`
           + `而谱把一位叫「${ab[0].name}」的印在他的正上一格`, via: 'id' });
    }
  }

  // ★★ **坐标压名字。全站只此一条。**
  //
  //   via==='id' 的候选，谱把话写到了人头上（写在他自己条目里、
  //   或把他印在那个格子里）；跟他同名的 via==='name' 候选，只是撞名。
  //
  //   继定（册3 p26 行5）：壁松@p26 行4 自己写着「立胞兄长子继定为嗣」（id）；
  //   而壁嘉那句「长子继定出嗣胞弟壁松」按名字扭到了 p303、p339 两个壁松头上（name）。
  //   不剔，卡片上就摆着三位同名嗣父——又回到了「有几个同名，不知道是哪一个」。
  //   另一类是称谓词指向（第二遍那里钉住的），同一个道理，不另写一条。
  const solid = new Set([...out.values()].filter(x => x.via === 'id')
    .map(x => bare(F.get(x.pid)?.name ?? '')).filter(Boolean));
  if (solid.size) {
    for (const [k, v] of [...out])
      if (v.via !== 'id' && solid.has(bare(F.get(k)?.name ?? ''))) out.delete(k);
  }
  return [...out.values()];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 第二遍：称谓词指向
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 谱里的「长兄」「二兄」「六弟」**不是修辞，是坐标**。
 *
 *     壁林那一条：「子继华兼祧长兄壁洲二兄壁银」
 *     光寅生子三：壁洲 · 壁银 · 壁林
 *     → 长兄＝第一个＝壁洲那一位，二兄＝第二个＝壁银那一位。**精确到 pid。**
 *
 *     泽昌那一条：「立六弟之子梁珍为嗣」
 *     → 梁珍的本生父＝泽昌的父亲的第六个儿子。唯一。
 *
 * 早先这些词被 `stripRel()` 当噪音剥掉，只留下名字，再拿名字去全谱找同名，
 * 然后回头说「两个人都叫这个，说不清」——**先扒掉证据，再喊不确定。**
 * 用户的原话：「凭啥不能确认？我们又不是傻子！」他是对的。
 *
 * 要用这条得先知道写话人的父亲是谁，所以分两遍：
 * 第一遍照常判，第二遍拿第一遍的结果去钉排行。
 */
export function resolveAll(
  F: Map<string, Facts>, idx: Map<string, Person>,
  /**
   * 年代窗口（`activity.ts::buildWindows`）。
   *
   * ★ **算术只用来排除，不用来挑。**
   *   CLAUDE.md 的次第是「原话 ＞ 定式 ＞ 算术」：
   *   算术推翻不了谱写的话，但能告诉你哪个候选**根本不可能**。
   *
   *   开银（P-册4-0079-1-1）生于民国三年（1914），谱写「继华长子」，
   *   而第 25 世两位继华分别生于 1955 和 1920——**都比他晚生**。
   *   那不是「两个里挑一个」，是「两个都不是」。
   *   早先这一级根本没实现，Level 里有 '算术' 但没任何代码产生它。
   */
  win?: Map<string, Window>,
  /**
   * 把「详前」那类重复记载折回本条。
   *
   * ★ 这一步必须在**年代排除之前**做。
   *   兼祥的人谱要求双记，多出来的那几条只写「生庚俱详前」、
   *   本身没有生年。不先折，它们就能躲过年代排除，再折回到
   *   那个已经被排除的人身上——开银那一条就是这么漏的。
   */
  canon?: (pid: string) => string,
): Map<string, Resolved> {
  const pass1 = new Map<string, Resolved>();
  for (const f of F.values()) pass1.set(f.pid, resolveFather(F, idx, f, canon));

  const NS2 = (s: string) => norm(s ?? '').replace(/公$/, '');
  /** 某一世叫某个名字的人 */
  const byGenName = new Map<string, string[]>();
  for (const f of F.values()) {
    const g = f.gen.by_row;
    if (g == null) continue;
    for (const nm of new Set([NS2(f.name), ...f.self.aliases.map(NS2)])) {
      const k = `${g}|${nm}`;
      (byGenName.get(k) ?? byGenName.set(k, []).get(k)!).push(f.pid);
    }
  }

  /**
   * 写这句话的人的第 ord 个兄弟是谁。
   * ord 为 -1 表示末位（「幼弟」「季弟」）。
   * 名单按谱印的顺序，那正是排行。
   */
  /**
   * ★ 同一个坐标机制，**key 从行次换成名字**。
   *
   *   「长子继定出嗣**胞弟壁松**」——「胞弟」把范围圈在写话人
   *   自己的兄弟里，「壁松」在这个圈里取唯一一位。全谱另外两个壁松
   *   不在圈里，**根本不是候选**——不需要事后再拿规则去剔。
   *
   *   这不是新规则，是把谱已经给的坐标**当场落成 pid**；
   *   没落成 pid 的引用才会把「同名的有几个」这个问题留给下游。
   */
  const brotherNamed = (writer: string, name: string): string | null => {
    const nm = NS2(name);
    if (!nm) return null;
    const r = pass1.get(writer);
    if (!r || r.birth.length !== 1) return null;      // 写话人的父亲得先定下来
    const dad = r.birth[0].pid;
    const kin: string[] = [];
    for (const g of F.values()) {
      if (NS2(g.name) !== nm && !g.self.aliases.some(a => NS2(a) === nm)) continue;
      const gr = pass1.get(g.pid);
      if (gr?.birth.length === 1 && gr.birth[0].pid === dad) kin.push(g.pid);
    }
    return kin.length === 1 ? kin[0] : null;
  };

  const brotherOf = (writer: string, ord: number): string | null => {
    const wf = F.get(writer);
    const r = pass1.get(writer);
    if (!wf || !r || r.birth.length !== 1) return null;      // 写话人自己的父亲得先定下来
    const df = F.get(r.birth[0].pid);
    if (!df) return null;
    const sons = df.self.sons;
    const i = ord === -1 ? sons.length - 1 : ord - 1;
    const nm = sons[i]?.name;
    if (!nm) return null;
    // ★ 兄弟的世次不能拿「写话人的世次标注」去套——
    //   梁木（P-册2-0324-3-0）辈字是「梁」（第22世），却印在行3（＝第23世），
    //   拿 23 世去找他二兄梁松就找不到，于是「立二兄幼子光斗为嗣」这句原话白写了。
    //   **兄弟就是同一个父亲名下的人**，按 id 找，不靠世次标注。
    const all = [...byGenName.values()].flat()
      .filter(x => NS2(idx.get(x)?.name ?? '') === NS2(nm));
    const kin = [...new Set(all)].filter(x => {
      const xr = pass1.get(x);
      return xr?.birth.length === 1 && xr.birth[0].pid === df.pid;
    });
    if (kin.length === 1) return kin[0];
    const hits = byGenName.get(`${wf.gen.by_row}|${NS2(nm)}`) ?? [];
    if (hits.length === 1) return hits[0];
    // 同名不止一位时，**兄弟必须同父**——这又把范围切到唯一。
    //   全谱两个壁银，而「二兄壁银」说的是壁林的二兄，
    //   那就只能是父亲同为光寅的那一位。
    const same = hits.filter(h => {
      const hr = pass1.get(h);
      if (hr?.birth.length === 1 && hr.birth[0].pid === df.pid) return true;
      const hf = F.get(h);
      return !!hf && !!hf.self.father_norm && hf.self.father_norm === NS2(df.name);
    });
    return same.length === 1 ? same[0] : null;
  };

  /* ── 行 1 的人：用前后邻居的父亲把范围夹出来 ──────────────────
   *
   * 行 1 是一页的头一格，人不写父名，父亲在上一卷。
   * 而这一排人是**按父亲的顺序印下来的**：
   *
   *     开响@册4p114，前后邻居的父亲是 继祯@册3p127 和 继荣@册3p129，
   *     而全谱七个继荣里正好有一个在 p129。
   *
   * 全谱单调率 90.8%，**不够当硬规则**，所以不拿它当结论；
   * 只在谱已经把名字写出来、而同名的有好几位时，拿它做选择。
   * 属第②级定式，推翻不了任何原话。
   */
  const VOLN: Record<string, number> = { 册1: 1, 册2: 2, 册3: 3, 册4: 4 };
  const posOf = (p: Person | undefined) =>
    p ? (VOLN[p.src.vol] ?? 9) * 1e6 + p.src.page * 10 + p.src.col : null;
  const row1 = [...F.keys()].map(k => idx.get(k)!).filter(p => p && p.src.row === 1)
    .sort((a, b) => (posOf(a)! - posOf(b)!));
  const bracket = new Map<string, [number, number]>();
  for (let i = 0; i < row1.length; i++) {
    const rr = pass1.get(row1[i].pid);
    if (rr && rr.level !== '说不清' && rr.birth.length === 1) continue;   // 已定的不用
    let a = i - 1, b = i + 1, pa: number | null = null, pb: number | null = null;
    while (a >= 0 && pa == null) {
      const q = pass1.get(row1[a].pid);
      if (q && q.birth.length === 1) pa = posOf(idx.get(q.birth[0].pid));
      a--;
    }
    while (b < row1.length && pb == null) {
      const q = pass1.get(row1[b].pid);
      if (q && q.birth.length === 1) pb = posOf(idx.get(q.birth[0].pid));
      b++;
    }
    if (pa != null && pb != null && pa <= pb) bracket.set(row1[i].pid, [pa, pb]);
  }

  /** 年代上根本当不了他父亲的，注明原因括出去 */
  const ageOut = (childPid: string, dadPid: string): string | null => {
    if (!win) return null;
    const v = canFather(win.get(dadPid), win.get(childPid));
    return v.ok ? null : v.text;
  };

  const out = new Map<string, Resolved>();
  for (const [pid, r] of pass1) {
    const f = F.get(pid)!;
    let birth = r.birth, heir = r.heir, level = r.level;
    let alsoNamed = r.alsoNamed;
    const notes: string[] = [];

    // ① 生父：立嗣语句写「立N弟之子某为嗣」，那位 N 弟就是本生父
    if (birth.length !== 1) {
      for (const m of f.mentions) {
        if (m.kind !== '立嗣语句' || !m.of_ord) continue;
        const b = brotherOf(m.by, m.of_ord);
        if (!b) continue;
        // 只在他本来就是候选之一时才采纳；不是候选说明别处有矛盾，留着说不清
        if (birth.length && !birth.some(x => x.pid === b)) continue;
        birth = [{ pid: b, level: '原话',
          why: `${m.by_name}那一条写「${m.text ?? m.as}」——`
             + `${m.by_name}的父亲生子名单里第${m.of_ord === -1 ? '末' : m.of_ord}位就是他` }];
        level = '原话';
        notes.push('称谓词指向');
        break;
      }
    }

    // ② 嗣父：出嗣/兼祧写「出嗣长兄某」，那位长兄就是嗣父，且是**确定的那一个同名者**
    const pinned: Pick[] = [];
    // ★ 兼祥的去处，只能采信**他自己生父那一条**写的。
    //   出嗣语句是按名字扭到每个同名者头上的：壁林写的那句话同时落在
    //   四个继华身上，而 p294 那位的生父是壁温——壁林说的不是他。
    const mineBirth = new Set(birth.map(x => x.pid));
    for (const m of f.mentions) {
      if (m.kind !== '出嗣语句') continue;
      if (mineBirth.size && !mineBirth.has(m.by)) continue;
      // 先按行次（「三弟」），再按名字（「胞弟壁松」）——同一个坐标机制
      const b = m.to_ord ? brotherOf(m.by, m.to_ord)
              : (m.to_father ? brotherNamed(m.by, m.to_father.slice(0, 2)) : null);
      if (!b || pinned.some(x => x.pid === b)) continue;
      pinned.push({ pid: b, level: '原话',
        why: m.to_ord
          ? `${m.by_name}那一条写「${m.text ?? m.as}」——`
            + `${m.by_name}的父亲生子名单里第${m.to_ord === -1 ? '末' : m.to_ord}位就是他`
          : `${m.by_name}那一条写「${m.text ?? m.as}」——`
            + `句里的称谓把范围圈在${m.by_name}自己的兄弟里，圈里叫这名字的只有他` });
    }
    // ①c 行 1 的同名候选，用邻居的父亲夹一下
    if (birth.length > 1 && bracket.has(pid)) {
      const [lo, hi] = bracket.get(pid)!;
      const inRange = birth.filter(x => {
        const q = posOf(idx.get(x.pid));
        return q != null && q >= lo && q <= hi;
      });
      if (inRange.length === 1) {
        const q = idx.get(inRange[0].pid)!;
        birth = [{ pid: inRange[0].pid, level: '定式',
          why: `行 1 的人按父亲的顺序印下来；同名的 ${r.birth.length} 位里，`
             + `只有 ${q.name}（${q.src.vol}第${q.src.page}页）落在前后邻居的父亲之间` }];
        level = level === '说不清' ? '定式' : level;
        notes.push('行1邻居夹选');
      }
    }

    // ③a 先把「同一个人的几条记载」合成一位
    if (canon && birth.length > 1) {
      const seen2 = new Set<string>(); const one: typeof birth = [];
      for (const b of birth) {
        const c2 = canon(b.pid);
        if (seen2.has(c2)) continue;
        seen2.add(c2);
        one.push(c2 === b.pid ? b : { ...b, pid: c2 });
      }
      if (one.length !== birth.length) { birth = one; notes.push('兼祥双记折回本条'); }
    }

    // ③ 算术：年代上不可能的候选，括出去。
    //   只在还没定下来时做（birth 不止一位）——已经靠原话定下的不碰，
    //   那是第①级，算术推翻不了（只在 conflicts 里记一笔，由人看）。
    if (birth.length > 1) {
      const kept2: typeof birth = [], dropped: { pid: string; why: string }[] = [];
      for (const b of birth) {
        const bad = ageOut(pid, b.pid);
        if (bad) dropped.push({ pid: b.pid, why: `年代对不上：${bad}` });
        else kept2.push(b);
      }
      if (dropped.length) {
        alsoNamed = [...alsoNamed, ...dropped];
        notes.push('年代排除');
        if (kept2.length === 1) {
          birth = [{ ...kept2[0], level: '算术',
            why: `${kept2[0].why}；另外 ${dropped.length} 位同名的年代上当不了他父亲` }];
          level = level === '说不清' ? '算术' : level;
        } else {
          birth = kept2;
          if (!kept2.length) level = '谱未写';
        }
      }
    }

    // ①d 页眉写着同一个父名、又印在相邻几页的行 1 上——那是亲兄弟。
    //
    //    开魁 p211「继林长子」、开茂 p212「继林次子」、开金 p213「继林幼子」。
    //    前两个已经判给了继铃（名单排行对得上），第三个自然同父。
    //    兄弟同父是谱自己写的（长子/次子/幼子三个字），不是推断。
    if (birth.length !== 1) {
      const me = idx.get(pid);
      const myPtr = ((me as any)?.page_ptrs ?? [])[0]?.name;
      if (me && me.src.row === 1 && myPtr) {
        const sibs = new Set<string>();
        for (const q of row1) {
          if (q.pid === pid || q.src.vol !== me.src.vol) continue;
          if (Math.abs(q.src.page - me.src.page) > 3) continue;
          const qp = ((q as any).page_ptrs ?? [])[0]?.name;
          if (!qp || NS2(qp) !== NS2(myPtr)) continue;
          const qr = pass1.get(q.pid);
          if (qr && qr.birth.length === 1) sibs.add(qr.birth[0].pid);
        }
        if (sibs.size === 1) {
          const dad = [...sibs][0];
          const g = idx.get(dad)!;
          birth = [{ pid: dad, level: '原话',
            why: `页眉写「${myPtr}${f.self.filiation}」；相邻几页的行 1 上、`
               + `页眉同样写「${myPtr}」的兄弟，父亲都是 ${g.name}` }];
          level = '原话';
          notes.push('兄弟同页眉');
        }
      }
    }

    // ②b 立嗣语句里写明的本生父，跟已经定下来的生父对不上，
    //     那句话说的就是**另一个同名的人**，不能算到他头上。
    //     继华的生父是壁林，而壁福那一条写「立**壁温**次子继华为嗣」——
    //     那是壁温的儿子继华，同名而已。
    if (birth.length === 1) {
      const dadName = NS2(idx.get(birth[0].pid)?.name ?? '');
      const wrong = new Set<string>();
      for (const m of f.mentions) {
        if (m.kind !== '立嗣语句' || !m.of_father) continue;
        if (dadName && !m.of_father.startsWith(dadName) && !dadName.startsWith(m.of_father)) {
          wrong.add(m.by);
        }
      }
      if (wrong.size) {
        const before = heir.length;
        // 护栏：**本人自己写的嗣父永远不能被剔掉。**
        //   壁水（P-册3-0022-4-0-L884）那一条开头就是「光馨公嗣子」，
        //   这是第①级的原话；别人那句立嗣语句对不上，只能说那句说的是别人，
        //   不能反过来把他自己写的嗣父抹掉。
        const mineWritten = f.self.father_norm;
        heir = heir.filter(h => !wrong.has(h.pid)
          || (mineWritten && NS2(idx.get(h.pid)?.name ?? '') === mineWritten)
          || f.mentions.some(m => m.by === h.pid && m.kind !== '立嗣语句'));
        if (heir.length !== before) notes.push('立嗣语句说的是同名的另一位');
      }
    }

    // ②c 谱写了嗣父名，但同名的有好几位，于是一个都没进来——
    //     那是**把谱写的话整个丢了**，违反「不漏」。
    //
    //     继艳（P-册3-0383-5-1）那一条写「壁贵公嗣子」，全谱四个壁贵，
    //     而其中一个就印在**同一页的正上一格**（p383 行4）。
    //     五世一图横着读，上一格就是他。全谱 14 人这样丢了嗣父，9 个靠版面就能定。
    if (f.self.is_heir && f.self.father_norm
        && !heir.some(h => NS2(idx.get(h.pid)?.name ?? '') === f.self.father_norm)) {
      const above = f.layout.above
        .map(x => idx.get(x))
        .filter(q => q && NS2(q.name) === f.self.father_norm);
      if (above.length === 1) {
        heir = [...heir, { pid: above[0]!.pid, level: '定式',
          why: `本人写「${f.self.father_name}${f.self.filiation}」；`
             + `叫这名字的不止一位，而谱把其中一位印在他的正上一格` }];
        notes.push('嗣父靠版面定下');
      }
    }

    if (pinned.length) {
      // 钉住的替掉同名含糊的；同名而只靠名字撑的，由 heirOf 里
      // 那一条「坐标压名字」（Pick.via）统一处理，这里不再写一遍。
      pinned.forEach(x => { x.via = 'id'; });
      const keep = heir.filter(h => !pinned.some(p2 => p2.pid === h.pid)
        && !/^谱上叫「.+」的有 \d+ 位$/.test(h.why));
      const solid2 = new Set(pinned.map(x => bare(idx.get(x.pid)?.name ?? '')).filter(Boolean));
      heir = [...pinned, ...keep.filter(h => !solid2.has(bare(idx.get(h.pid)?.name ?? '')))];
    }

    out.set(pid, notes.length || pinned.length
      ? { ...r, birth, heir, level, alsoNamed, conflicts: [...r.conflicts, ...notes] }
      : r);
  }
  return foldSameOne(oneStatementOneHeir(oneSlotOneChild(out, idx, F, canon), idx, F, canon), canon);
}


/**
 * **一句立嗣语句只立一个人。**
 *
 * 谱写「立弟长子开国为嗣」——那是**一个嗣子**。可这句话是按名字扭到
 * 每一个同名者头上的（`facts.ts` 里 `ADOPT_IN` 拿名字去全谱找同世同名），
 * 於是继营那一句同时落在**八个**开国头上，八个人的卡片上都写着「嗣父继营」。
 * 全谱 33 处这样，最多的一句扭到 8 个人。
 *
 * 这不是「说不清」，跟 `oneSlotOneChild` 是同一回事：**槽位有限，认领的人超了**。
 * 判据也还是谱自己的原话次序，一条都不新增：
 *
 *     ② 两边都写   本人那一条题「X嗣子」，或生父那一条的出嗣句去处就是这位
 *     ⓪ 只有一边   只有嗣父那句立嗣语句按名字扭过来
 *
 * ② 严格高於 ⓪ 时槽归他，其余那几条边**去掉**（不是降级，是不成立）——
 * 因为那句话本来就没说他。都在 ⓪ 上打平就谁也不动，那才是真的说不清，
 * 留着进待核清单。
 *
 * 实例（都回谱面核过）：
 *   继良（册3 p28）「立亲兄长子开发为嗣」→ 开发（册4 p48／p50）自己题「继良公嗣子」、
 *     生父继动那一条又写「长子开发出嗣亲弟继良」——两边都写；
 *     而开发（册4 p89，字金苟）题「继垣长子」，是被名字扭过来的。
 *   继营（册3 p229）「立弟长子开国为嗣」→ 开国（册4 p217）自己题「继营嗣子」，
 *     另外七位各有各的父亲。
 *   铣豁（册2 p63）「立四弟长子泽富为嗣」→ 泽富（册2 p334）自己题「铣豁嗣子」；
 *     泽富（册3 p238）题「铣鸣长子」，跟这句话无关。
 */
function oneStatementOneHeir(
  res: Map<string, Resolved>, idx: Map<string, Person>,
  F: Map<string, Facts>, canon?: (pid: string) => string,
): Map<string, Resolved> {
  const CAN = (x: string) => (canon ? canon(x) : x);
  const NS4 = (x: string) => norm(x ?? '').replace(/公$/, '');

  // 嗣父（折过）＋孩子的名字 → 认领的人
  const claim = new Map<string, Map<string, string>>();
  for (const [pid, r] of res)
    for (const h of r.heir) {
      const k = `${CAN(h.pid)}|${NS4(idx.get(pid)?.name ?? '')}`;
      (claim.get(k) ?? claim.set(k, new Map()).get(k)!).set(CAN(pid), pid);
    }

  /** 两边都写：本人自己题「X嗣子」，或生父那一条的出嗣句去处就是 X */
  const twoSided = (childPid: string, heirPid: string): boolean => {
    const q = idx.get(childPid), h = idx.get(heirPid);
    if (!q || !h) return false;
    const hn = NS4(h.name);
    if (q.is_heir && q.father_name && NS4(q.father_name) === hn) return true;
    if (h.aliases.some(a => NS4(a.form) === NS4(q.father_name ?? '')) && q.is_heir) return true;
    // 生父那一条写的出嗣句，去处点名这位嗣父
    const f = F.get(childPid);
    if (!f) return false;
    const dads = new Set((res.get(childPid)?.birth ?? []).map(b => CAN(b.pid)));
    return f.mentions.some(m => m.kind === '出嗣语句' && dads.has(CAN(m.by))
      && (!m.to_father || m.to_father.startsWith(hn) || hn.startsWith(m.to_father)
          || h.aliases.some(a => NS4(a.form) === m.to_father)));
  };

  const drop = new Map<string, Set<string>>();
  for (const [key, kids] of claim) {
    if (kids.size < 2) continue;
    const hp = key.slice(0, key.lastIndexOf('|'));
    const scored = [...kids].map(([c, orig]) => [c, orig, twoSided(c, hp)] as const);
    const won = scored.filter(x => x[2]);
    if (won.length !== 1) continue;              // 打平就谁也不动
    for (const [c] of scored.filter(x => !x[2]))
      for (const orig of [...kids.values()].filter(o => CAN(o) === c))
        (drop.get(orig) ?? drop.set(orig, new Set()).get(orig)!).add(hp);
  }
  if (!drop.size) return res;

  const out2 = new Map(res);
  for (const [c, hs] of drop) {
    const r = res.get(c); if (!r) continue;
    const heir = r.heir.filter(h => !hs.has(CAN(h.pid)) && !hs.has(h.pid));
    if (heir.length === r.heir.length) continue;
    out2.set(c, {
      ...r, heir,
      conflicts: [...r.conflicts,
        `那句立嗣语句说的是同名的另一位（${[...hs].map(x => idx.get(x)?.name).join('、')}那一条）`],
    });
  }
  return out2;
}

/**
 * **兼祧的人谱上印了好几条，指向他一律折回完整那一条——在这里折完，下游不再折。**
 *
 * 凡例第十三则要求双记，双记的是**记载**，人只有一个。
 * 以前卡片、子女栏、搜索各自折一遍，于是同一位父亲在三处是三个 id。
 * 折叠是判定的一部分，判定只有一条路——所以放在判定层的出口。
 */
function foldSameOne(
  res: Map<string, Resolved>, canon?: (pid: string) => string,
): Map<string, Resolved> {
  if (!canon) return res;
  const fix = (xs: Pick[]) => {
    const seen = new Set<string>();
    return xs.map(x => ({ ...x, pid: canon(x.pid) }))
             .filter(x => !seen.has(x.pid) && seen.add(x.pid));
  };
  const out2 = new Map<string, Resolved>();
  for (const [k, r] of res)
    out2.set(k, { ...r, birth: fix(r.birth), heir: fix(r.heir) });

  // ★ 同一个人的几条记载，父边要**并起来**，不能只留完整条上的那几条。
  //   泽久@册2 p331 的儿子梁珍：谱在 p331 那条写着他，完整条 p327 上没有。
  //   折叠时若只保留完整条的边，泽久的子女栏里就没人了——
  //   谱明明写着「生子一　梁珍」。折叠是认人，不是丢话。
  const group = new Map<string, string[]>();
  for (const k of out2.keys()) {
    const c = canon(k);
    (group.get(c) ?? group.set(c, []).get(c)!).push(k);
  }
  for (const [c, members] of group) {
    if (members.length < 2) continue;
    const mergeBy = (pick: (r: Resolved) => Pick[]) => {
      const seen = new Set<string>(); const out: Pick[] = [];
      for (const m of members) for (const x of pick(out2.get(m)!))
        if (!seen.has(x.pid)) { seen.add(x.pid); out.push(x); }
      return out;
    };
    const birth = mergeBy(r => r.birth), heir = mergeBy(r => r.heir);
    for (const m of members) out2.set(m, { ...out2.get(m)!, birth, heir });
    void c;
  }
  return out2;
}

/**
 * **一个名单槽只能被一个人认领。**
 *
 * 谱写「生子六　开雄　开志　开兆　开群　开俊　开赛」——那是**六个槽**，
 * 叫「开雄」的槽只有一个。可全谱有三位开雄，只要哪一位自己那一条没写父名，
 * 反查就会凭名字把他也挂到继均名下——於是继均的子女栏里出现**两个开雄**。
 * 全谱 50 处这样，都是这么来的。
 *
 * 这不是「说不清」，是**外键冲突**：槽位有限，认领的人超了。
 * 判据仍旧是谱自己的：
 *
 *     ③ 本人那一条写了父名，而且就是这位父亲   ——两边都写，最硬
 *     ② 谱把他印在这位父亲的正下一格           ——五世一图横着读
 *     ① 至少同一房
 *     ⓪ 什么都不占
 *
 * 有人分数严格更高，槽就归他，其余的**这条边直接去掉**（不是降级，是不成立）。
 * 分数打平就谁也不动——那才是真的说不清，留给人看。
 */
function oneSlotOneChild(
  res: Map<string, Resolved>, idx: Map<string, Person>,
  F: Map<string, Facts>, canon?: (pid: string) => string,
): Map<string, Resolved> {
  const NS3 = (s: string) => norm(s ?? '').replace(/公$/, '');
  const CAN = (x: string) => (canon ? canon(x) : x);

  // 父 → 这个名字有几个人认他做生父
  const claim = new Map<string, string[]>();
  for (const [pid, r] of res)
    for (const b of r.birth)
      claim.set(`${CAN(b.pid)}|${NS3(idx.get(pid)?.name ?? '')}`,
        [...(claim.get(`${CAN(b.pid)}|${NS3(idx.get(pid)?.name ?? '')}`) ?? []), pid]);

  const drop = new Map<string, Set<string>>();     // 孩子 pid → 要去掉的父 pid
  for (const [key, kids] of claim) {
    if (kids.length < 2) continue;
    const fpid = key.slice(0, key.lastIndexOf('|'));
    const nm = key.slice(key.lastIndexOf('|') + 1);
    const f = idx.get(fpid);
    if (!f) continue;
    const slots = (f.sons_claimed ?? []).filter(x => NS3(x) === nm).length;
    if (slots >= kids.length) continue;            // 槽够用，不是冲突

    const score = (c: string) => {
      const q = idx.get(c)!;
      const wrote = NS3(q.father_name ?? '');
      if (wrote && (wrote === NS3(f.name)
          || f.aliases.some(a => NS3(a.form) === wrote))) return 3;
      if ((F.get(c)?.layout.above ?? []).map(CAN).includes(CAN(fpid))) return 2;
      return q.src.section === f.src.section ? 1 : 0;
    };
    const scored = kids.map(c => [c, score(c)] as const)
      .sort((a, b) => b[1] - a[1]);
    const top = scored[0][1];
    const winners = scored.filter(x => x[1] === top);
    if (winners.length > slots) continue;           // 打平，谁也不动
    for (const [c] of scored.filter(x => x[1] < top))
      (drop.get(c) ?? drop.set(c, new Set()).get(c)!).add(fpid);
  }
  if (!drop.size) return res;

  const out2 = new Map(res);
  for (const [c, fs] of drop) {
    const r = res.get(c)!;
    const birth = r.birth.filter(b => !fs.has(CAN(b.pid)) && !fs.has(b.pid));
    if (birth.length === r.birth.length) continue;
    out2.set(c, {
      ...r, birth,
      level: birth.length ? r.level : (r.heir.length ? r.level : '谱未写'),
      conflicts: [...r.conflicts,
        `名单槽已被同名的另一位占住（${[...fs].map(x => idx.get(x)?.name).join('、')}）`],
    });
  }
  return out2;
}
