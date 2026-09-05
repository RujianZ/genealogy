/**
 * **每个人一条记录，把谱里关于他的一切摆齐——然后只用一个函数下结论。**
 *
 * ═══ 为什么要重来一次 ═══
 *
 * 在这之前，「他父亲是谁」是**十条排除规则赛跑**出来的：
 *
 *     if (世次不对)        return 排除;
 *     if (年代不可能)      return 排除;
 *     if (别人名单点了他)  return 排除;
 *     if (排行对不上)      return 排除;
 *     …
 *
 * **谁先命中谁说了算，没有优先级。** 一条一条是这些天为具体案子加上去的，
 * 加到第十条时它们开始互相打架。2026-09-04 一天里就撞出三个同形状的错：
 *
 *   `seealso` 拿「兼祧的人在几房各写一条」这条**推断**，
 *             推翻了梁桂那句**原话**「长子光明出嗣长兄梁檀兼祧三兄梁槐」；
 *   `gen`     拿世代列头这个**定式**，
 *             推翻了「碱公次子」「泽洽四子」这些**原话**——而那三处是谱把人印低了一格；
 *   `named`   拿「另一个同名者的名单里有他」这条**推断**，
 *             推翻了「士彥公幼子」这句**原话**。
 *
 * 而 CLAUDE.md 早写着次第：
 *
 *     **谱的原话 ＞ 谱的定式 ＞ 年月算术 ＞ 推断**
 *
 * 代码没实现它。往平表上再加豁免只会按下葫芦浮起瓢——我试过两次，
 * 第二次把「没有任何不确定」从 96.1% 打到 89.5%，靠数数才发现。
 *
 * ═══ 这个文件做什么 ═══
 *
 * 只做一件事：**把证据摆齐，不下结论。**
 * 每个 pid 一条 `Facts`，四个来源分开放，谁也不覆盖谁：
 *
 *     self      他自己那一条写的（父名、排行、字讳号、生卒葬、妻、生子生女…）
 *     mentions  别人条目里提到他的每一处（在谁的生子名单第几位、被哪句过继语点名…）
 *     layout    版面：册·页·行·列·房，以及**正上一格**是谁
 *     gen       世次两个来源：按世代列头（行）／按辈字（名字第一个字）
 *
 * 结论由 `resolve.ts` 按次第推，每个答案都带着它引用的那条证据。
 *
 * ═══ 辈字为什么可信 ═══
 *
 * 第 15–30 世共 2,187 人（全谱 97%），名字第一个字就是辈字：
 *
 *     16–18 世 100% ／ 20 世 100% ／ 30 世 100%
 *     19 世 99.3% ／ 21 世 99.5% ／ 22 世 99.5% ／ 25 世 98.9% ／ 29 世 98.8%
 *     最低的 28 世也有 94.8%
 *
 * 它和世代列头是**两个互相独立的来源**，对不上就说明谱这一处印错了格：
 *
 *     溪公·沥公  「碱公次子／幼子」字兰階·兰芳（兰＝13世字辈），却印在行4＝14世
 *     梁木        「泽洽四子」梁＝22世，却印在行3＝23世
 *     上彥的名单  「生子四 泽荣泽富泽贵泽德」泽＝21世，而他19世，儿子应是20世铣
 *
 * 第 11–14 世没有名字辈，但**字**有辈（悠／怀／兰），名字则按石／水／木偏旁走。
 *
 * ★ `people.json` 一个字没动。这里只读，只摆。
 */
import type { Person, ParentEdge } from './types.ts';
import { norm } from './norm.ts';
import { fname } from './fname.ts';
import { roster } from './roster.ts';
import { continued } from './continued.ts';

const NS = norm;
const bare = (s: string | null | undefined) => NS(s ?? '').replace(/公$/, '');

/**
 * 剥掉称谓，剩下的才是名字。
 * 「出嗣**长兄**梁檀」「立**四弟**长子光明为嗣」「兼祧**三兄**梁槐」——
 * 称谓写法很杂：胞／亲／堂 ＋ 序数 ＋ 兄弟叔伯。剥不干净就会把「四弟」当成人名。
 */
const REL = /^(?:胞|亲|堂|嫡|从|同)?(?:[长次幼元二三四五六七八九十]?)(?:兄|弟|叔|伯|姪|侄|舅)?/;
const stripRel = (s: string) => {
  let t = bare(s);
  for (let i = 0; i < 3; i++) {
    const n = t.replace(REL, '');
    if (n === t) break;
    t = n;
  }
  return t;
};
/**
 * **称谓词里的排行——这本身就是一个 id。**
 *
 * 壁林那一条写「子继华兼祥**长兄**壁洲**二兄**壁银」。
 * 光寅生子三：壁洲・壁银・壁林。长兄＝第一个，二兄＝第二个——
 * **精确到 pid，没有第二种读法。**
 *
 * 泽昌那一条写「立**六弟**之子梅珍为嗣」，同理。
 *
 * 早先 `stripRel` 把这些当噪音剔掉，只留名字，然后拿名字去全谱找同名，
 * 回头说「两个人都叫这个，说不清」——**先扒掉证据，再喊不确定。**
 *
 * 返回：正数＝排行第几；-1＝末位（幼・季・末）；0＝没有称谓词。
 */
const ORD_N: Record<string, number> = {
  长: 1, 元: 1, 伯: 1, 次: 2, 二: 2, 仲: 2, 三: 3, 叔: 3,
  四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  幼: -1, 季: -1, 末: -1,
};
const REL_ORD = /^(?:胞|亲|堂|嫡|从|同)?([长次幼元二三四五六七八九十伯仲叔季末])?(兄|弟)/;
export function relOrd(s: string): number {
  const m = REL_ORD.exec(bare(s));
  if (!m) return 0;
  return m[1] ? (ORD_N[m[1]] ?? 0) : 0;
}

/** 一个称谓词剔完还剩不下名字时的判断：剩下的还是称谓 */
const isRelWord = (s: string) => /^(?:[长次幼元二三四五六七八九十]?)(?:兄|弟|叔|伯|姪|侄|舅|子|女)$/.test(s);

/** 谱上一处提到他的记载 */
export interface Mention {
  /** 谁的条目里 */
  by: string;
  by_name: string;
  by_gen: number | null;
  /** 哪一种记载 */
  kind: '生子名单' | '生女名单' | '立嗣语句' | '出嗣语句' | '正文提及';
  /** 谱在那里**把他写作**什么（可能与他自己条目的题名不同） */
  as: string;
  /** 在名单里的位次（从 1 起）与名单长度——排行判据靠它 */
  pos?: number;
  of?: number;
  /** 原句，一字不动 */
  text?: string;
  /**
   * 立嗣语句里**写明的本生父名**。
   * 「立**壁温**次子继华为嗣」——它说的是壁温家的继华，不是壁林家那个。
   * 不记这个，全谱每一个叫继华的都会被这句话认领。
   */
  of_father?: string;
  /**
   * 立嗣语句里写的不是名字而是称谓词时，它的排行。
   * 「立**六弟**之子梅珍为嗣」→ 6：写这句话的人的父亲的第 6 个儿子。
   * 这比名字硬——名字会重，排行不会。
   */
  of_ord?: number;
  /**
   * 出嗣语句里**写明的去处**（嗣父名）。
   * 「长子光明出嗣**长兄梁檀**兼祧三兄梁槐」——去的是梁檀家。
   * 谱里有好几个光明，不比这个，每一句都会认领所有同名的人。
   */
  to_father?: string;
  /** 同上，出嗣/兼祥去向的那位的排行：「兼祥**长兄**壁洲」→ 1 */
  to_ord?: number;
  src_human: string;
}

export interface Facts {
  pid: string;
  name: string;
  /** 名字第一个字 */
  gen_char: string;

  /** 他自己那一条写的。**谱的原话，最高一级。** */
  self: {
    father_name: string;      // 原样
    father_norm: string;      // 折叠后、去敬称，比对用
    filiation: string;        // 长子／次子／幼子／嗣子／祧子…
    ord: number | null;       // 排行数：长=1 次=2 … 幼=-1（末位）
    is_heir: boolean;         // 排行写的是嗣子／祧子
    aliases: string[];        // 谱名·字·讳·号（折叠后）
    titles: string[];
    birth: string | null;
    death: string | null;
    burial: string[];
    sons: { name: string; raw: string; died: boolean }[];
    daughters: string[];
    spouses: { rel: string; name: string }[];
    marks: { tag: string; text: string }[];
    raw_text: string;
  };

  /** 别人条目里提到他的每一处 */
  mentions: Mention[];

  /** 版面。五世一图是横着读的：儿子印在父亲的下一格。 */
  layout: {
    vol: string; page: number; row: number; col: number; section: string;
    /** 正上一格里的人（同册、行减一、页码不大于本人、取最近那一页） */
    above: string[];
  };

  /** 世次的两个独立来源 */
  gen: {
    by_row: number | null;    // 原书世代列头（people.json 的 gen）
    by_char: number | null;   // 辈字
    agree: boolean;
  };

  /** people.json 里原有的父边，原样带着（不当结论用，只当一条线索） */
  edges: ParentEdge[];

  /** 两条同级的原话打架时记在这里。**不做取舍。** */
  conflicts: string[];
}

const ORD: Record<string, number> = {
  长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
function ordOf(fil: string): number | null {
  const f = NS(fil ?? '');
  if (!f) return null;
  if (f.startsWith('幼') || f.startsWith('季') || f.startsWith('末')) return -1;
  return ORD[f[0]] ?? null;
}

/**
 * 版面坐标。**直接读 `p.src`，不从 pid 里拆。**
 *
 * 早先是拿正则去解 pid，结果 pid 格式一改（末位从「同格第几个」
 * 换成源行号 `L15940`）正则就匹配不上，**欧式版面这条证据被静默禁用**，
 * 全谱靠版面定下来的 48 人一下子全变成「说不清」，而且不报错。
 * 坐标本来就在 `p.src` 里，拿它就是了。
 */
const coord = (p: Person) =>
  p.src ? { vol: p.src.vol, page: p.src.page, row: p.src.row } : null;

/** 辈字 → 世次。从 generations.json 来，那是从全谱名字统计出来的，不是我编的。 */
/**
 * 把出嗣/兼祥语句的尾巴切成若干个去处。
 *
 *     「长兄壁洲二兄壁银」 → [{长兄, 壁洲}, {二兄, 壁银}]
 *
 * 称谓词本身就是分隔符，因为谱写多房时一定逐房写称谓。
 * 一个称谓词都没有时，整段当一个去处。
 */
const REL_SPLIT = /([胞亲堂嫡从同]?[长次幼元二三四五六七八九十伯仲叔季末]?[兄弟])/;
function destinations(tail: string): { name: string; ord: number }[] {
  const t = bare(tail);
  const parts = t.split(REL_SPLIT).filter(x => x !== '');
  const out: { name: string; ord: number }[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (!REL_SPLIT.test(parts[i]) || i + 1 >= parts.length) continue;
    const nm = stripRel(parts[i + 1]).slice(0, 3);
    if (nm.length >= 2 && !isRelWord(nm)) out.push({ name: nm, ord: relOrd(parts[i]) });
    i++;
  }
  if (out.length) return out;
  const one = stripRel(t);
  return isRelWord(one) || one.length < 2 ? [{ name: '', ord: relOrd(t) }]
                                          : [{ name: one, ord: relOrd(t) }];
}

export function genCharMap(gens: { gen: number; char: string; rate: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of gens) {
    // 只收**站得住**的：占比 ≥ 85%，且这一世人数不能太少（1–10 世每世才一两个人，
    // 「胜」「文」「烱」这种 100% 是因为只有一个人，拿它当判据没意义）。
    if (!g.char || g.rate < 0.85) continue;
    // 同一个字不能指向两世；真撞上了就两边都不要（不猜）
    if (m.has(g.char)) { m.set(g.char, -1); continue; }
    m.set(g.char, g.gen);
  }
  for (const [k, v] of m) if (v < 0) m.delete(k);
  return m;
}

export function buildFacts(
  people: Person[],
  gens: { gen: number; char: string; rate: number; total: number }[],
): Map<string, Facts> {
  const charGen = genCharMap(gens.filter(g => g.total >= 12));   // 人数太少的世不作数
  const byId = new Map(people.map(p => [p.pid, p]));

  // 正上一格
  //
  // ★ 父亲的条目会**跨页**：啓光的名字行在 p271，条目续到 p272 的行2，
  //   儿子学才就印在 p272 的行3。只取本页行上一格的话，本页行2 里
  //   只有啓源（啓光后面那位），于是「谱写的父亲不在正上一格」——
  //   而谱面上他就在那里，只是名字行落在上一页。
  //   全谱 48 人被这个缺口报成了「版面不一致」。
  //   补上上一页同一行带的**末位**那一位——他的条目正是续到本页的那个。
  //   这不是新规则，是同一条规则把跨页那种情形盖上。
  const aboveOf = (p: Person): string[] => {
    const c = coord(p);
    if (!c || c.row <= 1) return [];
    let best = -1;
    const bucket = new Map<number, string[]>();
    for (const q of people) {
      const b = coord(q);
      if (!b || b.vol !== c.vol || b.row !== c.row - 1 || b.page > c.page) continue;
      (bucket.get(b.page) ?? bucket.set(b.page, []).get(b.page)!).push(q.pid);
      if (b.page > best) best = b.page;
    }
    const here = bucket.get(best) ?? [];
    if (best === c.page) {
      // 本页行上一格有人：再把上一页那一行的末位带上（他续到了本页）
      let prevPage = -1;
      for (const k of bucket.keys()) if (k < best && k > prevPage) prevPage = k;
      if (prevPage >= 0) {
        const tail = (bucket.get(prevPage) ?? [])
          .map(id => byId.get(id)!).filter(Boolean)
          .sort((a, b) => a.src.col - b.src.col || a.pid.localeCompare(b.pid)).slice(-1)
          .map(x => x.pid);
        return [...tail, ...here];
      }
    }
    return here;
  };

  const out = new Map<string, Facts>();
  for (const p of people) {
    const r = roster(p);
    const cont = continued(p);
    const ch = (p.name ?? '')[0] ?? '';
    out.set(p.pid, {
      pid: p.pid,
      name: p.name,
      gen_char: ch,
      self: {
        father_name: p.father_name ?? '',
        father_norm: bare(fname(p.father_name)),
        filiation: p.filiation ?? '',
        ord: ordOf(p.filiation ?? ''),
        // ★ 直接用 people.json 里的值，**不在这里再算一遍**。
        //   早先这里拿 filiation 现算，而解析器那边另有一套，
        //   两边差 29 人（页眉指向那条路径只填 filiation、没填 is_heir）。
        //   同一件事只该有一个答案；parser 那边已改成由 filiation 推出。
        is_heir: !!p.is_heir,
        aliases: [...new Set([NS(p.name), ...p.aliases.map(a => NS(a.form))])].filter(Boolean),
        titles: p.titles ?? [],
        birth: (cont ? cont.birthText : p.birth?.text) ?? null,
        death: p.death?.text ?? null,
        burial: p.burial?.text ? [p.burial.text] : [],
        sons: r.sons.map(s => ({ name: s.name ?? '', raw: (s as any).raw ?? '', died: !!s.died })),
        daughters: (r as any).daughters?.map((d: any) => d.name ?? d.raw ?? String(d)) ?? [],
        spouses: (p.spouses ?? []).map(s => ({ rel: s.rel, name: s.name_raw })),
        marks: p.marks ?? [],
        raw_text: p.raw_text ?? '',
      },
      mentions: [],
      layout: {
        vol: p.src.vol, page: p.src.page, row: p.src.row, col: p.src.col,
        section: p.src.section, above: aboveOf(p),
      },
      gen: {
        by_row: p.gen ?? null,
        by_char: charGen.get(ch) ?? null,
        agree: p.gen != null && charGen.has(ch) ? charGen.get(ch) === p.gen : true,
      },
      edges: p.parent_candidates ?? [],
      conflicts: [],
    });
  }

  // ── 别人条目里提到他 ──────────────────────────────
  // 索引：折叠名 → 那些人（按世次分桶，比对时才不会跨世乱撞）
  const byGenName = new Map<string, Person[]>();
  for (const p of people) {
    if (p.gen == null) continue;
    for (const f of new Set([bare(p.name), ...p.aliases.map(a => bare(a.form))])) {
      if (!f) continue;
      const k = `${p.gen}|${f}`;
      (byGenName.get(k) ?? byGenName.set(k, []).get(k)!).push(p);
    }
  }

  for (const f of people) {
    if (f.gen == null) continue;
    const sons = roster(f).sons;
    sons.forEach((s, i) => {
      const nm = bare(s.name || (s as any).raw);
      if (!nm) return;
      // 名单里写的辈字若与「父亲世次+1」对不上，先记下来，别拿它去配
      const listGen = charGen.get(nm[0]);
      const wantGen = f.gen! + 1;
      const badChar = listGen != null && listGen !== wantGen;
      for (const q of byGenName.get(`${wantGen}|${nm}`) ?? []) {
        out.get(q.pid)!.mentions.push({
          by: f.pid, by_name: f.name, by_gen: f.gen,
          kind: '生子名单', as: s.name || (s as any).raw,
          pos: i + 1, of: sons.length, src_human: f.src_human,
        });
      }
      if (badChar) {
        out.get(f.pid)!.conflicts.push(
          `生子名单第 ${i + 1} 位写「${s.name}」，辈字「${nm[0]}」是第 ${listGen} 世，`
          + `而他是第 ${f.gen} 世，儿子应是第 ${wantGen} 世`);
      }
    });
  }

  // ── 过继语句：写在**别人**条目里，点名说到他 ──────────────
  //   立嗣句写在嗣父那一条：「立铣华四子泽霖为嗣」「立爱子朝纪为祠」
  //   出嗣句写在生父那一条：「幼子光林出嗣三弟梁柏」「次子啟昌出嗣朝阳」
  //   两种都是**谱的原话**，级别最高。
  const ADOPT_IN = /(?:立|爱立|以)([^立以，。；、]{0,14}?)(?:为嗣|為嗣|承嗣|入嗣|为祧|為祧|承祧)/g;
  //   兼祧、两祧、承祧也是同一件事，一并认
  const ADOPT_OUT = /([长次幼三四五六七八九十季末]?子)?([一-鿿]{2,3})(?:出[嗣祠]|兼[祧挑]|承[祧挑])([^，。；、]{0,10})/g;
  for (const f of people) {
    if (f.gen == null) continue;
    const t = NS(f.raw_text ?? '');
    for (const m of t.matchAll(ADOPT_IN)) {
      const seg = m[1];
      for (let n = 3; n >= 2; n--) {
        if (seg.length < n) continue;
        const nm = bare(seg.slice(-n));
        const hit = byGenName.get(`${f.gen + 1}|${nm}`) ?? [];
        if (!hit.length) continue;
        // 语句里「立 X 某子 Y 为嗣」的 X 就是本生父名
        const head = seg.slice(0, seg.length - n);
        // ★ 「之子」也算。泽醇那一条写「立三兄**泽雅之子**梁元为嗣」，
        //   只认「X某子」不认「X之子」时，本生父名抽不出来，
        //   那句话就按名字扭到了全谱四个梁元头上——而谱已经把话说清了。
        const om = /([长次幼三四五六七八九十季末之])子$/.exec(head);
        const ofHead = om ? head.slice(0, head.length - om[0].length) : '';
        const ofRaw = ofHead ? stripRel(ofHead) : '';
        const ofF = ofRaw && !isRelWord(ofRaw) ? ofRaw : '';
        const ofO = ofHead ? relOrd(ofHead) : 0;
        for (const q of hit) out.get(q.pid)!.mentions.push({
          by: f.pid, by_name: f.name, by_gen: f.gen,
          kind: '立嗣语句', as: seg.slice(-n), text: m[0], src_human: f.src_human,
          of_father: ofF.length >= 2 ? ofF : undefined,
          of_ord: ofO || undefined,
        });
        break;
      }
    }
    for (const m of t.matchAll(ADOPT_OUT)) {
      const nm = bare(m[2]);
      // ★ 兼祥常常是**好几房**：
      //     「子继华兼祥长兄壁洲二兄壁银」
      //     「长子光明出嗣长兄梁檀兼祥三兄梁槐」
      //   早先只拿第一个去处，后面那几房直接丢掉——
      //   而兼祥本来就是一人承几房，丢一房就是丢一条宗法线。
      for (const d of destinations(m[3] ?? '')) {
        for (const q of byGenName.get(`${f.gen + 1}|${nm}`) ?? []) {
          out.get(q.pid)!.mentions.push({
            by: f.pid, by_name: f.name, by_gen: f.gen,
            kind: '出嗣语句', as: m[2], text: m[0], src_human: f.src_human,
            to_father: d.name.length >= 2 ? d.name : undefined,
            to_ord: d.ord || undefined,
          });
        }
      }
    }
  }

  return out;
}
