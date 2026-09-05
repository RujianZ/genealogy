/**
 * **档案：把谱上关于一个人的每一句，按「是哪一类事」归档，原文照抄。**
 *
 * ═══ 为什么要有这一层 ═══
 *
 * 卡片一直在自己解析原文——它要判断「这句是不是葬」「这句算不算事迹」，
 * 于是「娶妻」被印成事迹，兼祧被印成重名警告，胜二公的坟丢了。
 * 每修一个显示错误就等于往显示层再加一条规则，规则又和世系那边的规则打架。
 *
 * 这一层把两件事拆开：
 *
 *     归类  ——  只做一次，在这里。写法有一百种无所谓：
 *               「出嗣长兄梁檀兼祧三兄梁槐」「立壁温次子继华为嗣」
 *               「承本身并祧」「归宗」——全部归到 `过继`。
 *     显示  ——  卡片只认 category，不认里面写了什么，直接印原文。
 *
 * 卡片从此零判断，也就零打架。
 *
 * ═══ 唯一的硬指标：零丢失 ═══
 *
 * 谱上写了的，一个字都不能在归类时蒸发。
 * 所以这里不是「挑出认识的句子」，而是**逐字销账**：
 *
 *     把 raw_text 去掉空白连成一条，每归一类就把它占的那段划掉，
 *     最后还没被划掉的连续片段，一律进 `备注`——原样留着。
 *
 * 覆盖率因此可以量：`tools/dossier_test.mjs` 报未销账字数。
 * 归类器认不出的句子会**显眼地留在备注里**，而不是悄悄没了。
 *
 * ★ `people.json` 一个字没动。这里只读、只归、只抄。
 */

import type { Person } from './types.ts';
import type { Facts, Mention } from './facts.ts';
import { agesOf } from './owner.ts';

/** 分类。顺序即卡片上的显示顺序。 */
export const CATS = [
  '名号',   // 字·讳·号·名·别名
  '世系',   // 「光燃公嗣子」「壁林公长子」——谱写的父名与行次原话
  '过继',   // 出嗣·入嗣·立嗣·兼祧·承祧·归宗·承本身，写法不限
  '生',
  '殁',
  '寿',
  '葬',
  '配',     // 娶·继娶·聘·侧室，各按谱写的 rel 分行
  '子',
  '女',
  '功名',   // 庠生·贡生·大学·学位
  '职事',   // 任职·从军·工作
  '迁徙',
  '旌表',   // 节孝·义行·匾额
  '事迹',   // 传赞·行状
  '碑志',
  '缺记',   // 谱自己写的「生殁葬缺」「公妣殁年未详」——CLAUDE.md：原样显示，不许渲染成空白
  '备注',   // 归不进上面的，原样留着——这一格不许为了好看而丢东西
] as const;
export type Cat = typeof CATS[number];

export interface Item {
  /** 谱上的原话，照抄。**永不改写。** */
  text: string;
  /** 这条是谱上哪个字段写的，卡片可以拿去做小标签：「娶」「继娶」「聘」 */
  label?: string;
  /** 出处，可点回原文 */
  src?: string;
}

export interface Dossier {
  pid: string;
  name: string;
  gen: number;
  cat: Record<Cat, Item[]>;
  /** 别人条目里写到他的每一处。不参与 raw_text 销账（那是别人那一条的字）。 */
  mentions: Mention[];
  /** 销账诊断：raw_text 总字数 / 未销账字数 */
  audit: {
    /** 本人条目正文总字数（去空白） */
    total: number;
    /** 一个字都没归到类的（应恒为 0——归不进就该进备注，不许蒸发） */
    unaccounted: number;
    /** 只能进「备注」的字数：归类器认不出的部分，越少越好 */
    noted: number;
  };
}

/* ── 销账 ───────────────────────────────────────────────────────────────── */

/** 去掉空白与换行，一行就成了一段可以逐字销账的账 */
const flat = (s: string) => (s ?? '').replace(/[\s　]/g, '');

/**
 * **按行销账。**
 *
 * 谱是分行印的，「生于」和日期是**两行**：
 *
 *     生于
 *     光绪二十六年月日时缺
 *
 * 早先把 raw_text 拉成一条长串再销账，这个联系就断了——
 * 全谱剩下 1,214 个孤零零的「生于」和一堆无主日期。
 * 保住行，未销账的那一行就还看得见它上一行写的是什么，归类不用猜。
 */
class Ledger {
  readonly s: string;
  private hit: boolean[];
  /** 原始行（去空白后），与 hit 用同一套下标区间对应 */
  readonly lines: { text: string; at: number }[] = [];
  constructor(raw: string) {
    let acc = '';
    for (const ln of (raw ?? '').split(/\r?\n/)) {
      const t = flat(ln);
      if (!t) continue;
      this.lines.push({ text: t, at: acc.length });
      acc += t;
    }
    this.s = acc;
    this.hit = new Array(this.s.length).fill(false);
  }
  /** 某一行还剩下的、没销账的部分 */
  restOf(i: number): string {
    const { text, at } = this.lines[i];
    let out = '';
    for (let k = 0; k < text.length; k++) if (!this.hit[at + k]) out += text[k];
    return out;
  }
  /** 划掉 text 在账本里出现的第一处未划掉的位置；划不到就算了（不报错，交给覆盖率） */
  strike(text: string, minLen = 2): void {
    const t = flat(text);
    if (t.length < minLen) return;
    let from = 0;
    for (;;) {
      const i = this.s.indexOf(t, from);
      if (i < 0) return;
      // 优先找一段还没被划过的
      if (!this.hit.slice(i, i + t.length).every(Boolean)) {
        for (let k = i; k < i + t.length; k++) this.hit[k] = true;
        return;
      }
      from = i + 1;
    }
  }
  /** 未销账的行：文本 + 上一行原样（供归类看上下文） */
  leftoverLines(): { text: string; prev: string; i: number }[] {
    const out: { text: string; prev: string; i: number }[] = [];
    for (let i = 0; i < this.lines.length; i++) {
      const rest = this.restOf(i);
      if (rest.length < 1) continue;
      out.push({ text: rest, prev: this.lines[i - 1]?.text ?? '', i });
    }
    return out;
  }
  strikeLine(i: number) {
    const { text, at } = this.lines[i];
    for (let k = 0; k < text.length; k++) this.hit[at + k] = true;
  }
  get unaccounted(): number { return this.hit.filter(h => !h).length; }
}

/* ── 归类线索 ───────────────────────────────────────────────────────────── */

/**
 * 过继：谱里的写法。这些词只用来**认出这是过继的事**，
 * 不用来解析谁过继给谁——那是 resolve.ts 的活，这里只管归档原文。
 */
const ADOPT = /(出[嗣祠继]|入嗣|承嗣|立嗣|为嗣|為嗣|兼[祧挑]|承[祧挑]|归宗|歸宗|承本身|抚[子養养]|嗣子|祧子)/;
const MOVE  = /(迁|遷|徙|移居|寓居|侨居|僑居|落[籍户戶]|居于|卜居|流寓|往|赴)/;
const HONOR = /(旌表|節孝|节孝|义行|義行|匾|坊|旌|褒)/;
const OFFIC = /(庠生|廪生|廩生|贡生|貢生|监生|監生|太学|太學|生员|生員|秀才|举人|舉人|进士|進士|大学|大學|学士|學士|博士|硕士|碩士|中专|中專|初中|小学|小學|高小|中学|中學|高中|毕业|畢業)/;
const DUTY  = /(任|职|職|officer|从军|從軍|参军|參軍|入伍|工作|退休|厂|廠|公司|支书|支書|队长|隊長|校长|校長|医生|醫生|教师|教師|会长|會長|经理|經理)/;
const STELE = /(有碑|立碑|碑记|碑記|墓碑|碑文)/;

const push = (c: Record<Cat, Item[]>, k: Cat, it: Item) => {
  if (!it.text || !it.text.trim()) return;
  c[k].push(it);
};

/**
 * **剩余行归类表——全文件唯一的一处判断，按全谱实际统计写的，不是猜的。**
 *
 * 返回 `null` = 这一行是纯排版标记（孤零零的「生于」「女二」），
 * 划掉不显示；返回类目 = 原文照抄进那一格。
 *
 * `prev` 是上一行。谱把提示词和内容分两行印：
 *
 *     公妣殁年未详        ← 自成一句
 *     殁于                ← 提示词
 *     光绪二十九年癸卯…    ← 内容，归「殁」靠的就是上一行
 */
function route(t: string, prev: string): Cat | null {
  // ① 纯提示词行，本身不含信息
  if (/^(生于|生於|殁于|殁於|歿於|葬|娶|聘|字|讳|諱|号|號|时|時|公|氏)$/.test(t)) return null;
  if (/^(生子|生女)[一二三四五六七八九十两]?$/.test(t)) return null;
  if (/^女[一二三四五六七八九十两]?$/.test(t)) return null;
  // 「生子三」被印成两行时，第二行只剩个数目字；还有孤零零的「妣」「公」
  if (/^[一二三四五六七八九十两\d]$/.test(t)) return null;
  if (/^(妣|公妣|原妣|继妣|續妣|续妣|副室|侧室|側室)$/.test(t)) return null;

  // ② 谱自己写下的「此处无记录」。CLAUDE.md：原样显示，不许渲染成空白。
  if (/^(公妣|公|妣)?(生|殁|歿|葬|生殁|殁葬|生殁葬)(缺|俱缺|未详|未祥|不祥|不详|年未详|年不祥)$/.test(t)) return '缺记';
  if (/(未详|未祥|不祥|不详|俱缺|缺)$/.test(t) && t.length <= 8) return '缺记';

  // ③ 有实义的行，先看它自己写了什么
  if (ADOPT.test(t)) return '过继';
  if (/^(享年|享寿|享壽|年)[一二三四五六七八九十百零\d]+$/.test(t)) return '寿';   // 「年六十四」「享寿七十四」
  if (STELE.test(t)) return '碑志';
  if (HONOR.test(t)) return '旌表';
  if (OFFIC.test(t)) return '功名';                                      // 「初中生」
  if (/^(葬|俱葬|同葬|合葬|附葬|祔葬|归葬|歸葬)/.test(t)) return '葬';
  if (/^女[一二三四五六七八九十两]/.test(t) || /^生女/.test(t)) return '女';
  if (/^生[一二三四五六七八九十两]?子/.test(t)) return '子';
  if (/^(公殁|公妣殁|[一-鿿]妣殁|原妣殁|续妣殁|繼妣殁|妣殁)/.test(t)) return '殁';
  if (/^(原|继|續|续|再|又|副|侧|側)?(娶|聘|配|室)/.test(t)) return '配';
  if (MOVE.test(t)) return '迁徙';
  if (DUTY.test(t)) return '职事';

  // ④ 自己看不出，就看上一行的提示词——谱是分行印的
  const c = cue(prev);
  if (c === '生') return '生';
  if (c === '殁') return '殁';
  if (c === '葬') return '葬';
  if (c === '配') return '配';

  // ⑤ 「适X」是嫁女的记法，不管前面写没写「女几」
  if (/[适適]/.test(t)) return '女';

  // ⑥ 成篇的字。传、赞、行状、诗，谱是按版心宽度断行的，
  //    所以一句话会被切成一串四言五言。判据是「没有生卒葬的记号」——
  //    生卒葬都带年号或干支或「年月日时」，传赞不带。
  if (/谨[志試试撰题題選选]$/.test(t)) return '事迹';
  if (/详载|詳載|详见|詳見|县志|縣志|邑乘/.test(t)) return '事迹';
  if (!isDateLine(t) && t.length >= 4) return '事迹';

  return '备注';
}

/**
 * 这一行是不是「日期行」。
 *
 * 光看有没有「年」不行——「不惑之年」「乾隆戊午年春过江搜辑乐谱」都带年，
 * 却是传赞。判据是**整行有多大比例是纪年用字**：日期行几乎全由
 * 年号·干支·数目·年月日时构成，文章不会。
 */
const DATE_CHARS = new Set(
  ('一二三四五六七八九十百零廿卅0123456789〇○' +
   '年月日时時初又闰閏日' +
   '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥' +
   '生殁歿于於葬缺详祥未' +
   '康熙雍正乾隆嘉庆慶道光咸丰豐同治宣统統民国國' +
   '明景泰成化弘治德万历曆天启啟崇祯禎顺順'
  ).split(''));
function isDateLine(t: string): boolean {
  let n = 0;
  for (const c of t) if (DATE_CHARS.has(c)) n++;
  return n / t.length >= 0.75;
}

/**
 * 谱上写行次的那一行，原样取回来。
 * 优先找同时含父名与行次的整行；找不到就退回只含行次的那一行。
 */
function lineOf(L: Ledger, fil: string | null | undefined, father: string | null | undefined): string | null {
  const f = flat(fil ?? ''); const d = flat(father ?? '');
  if (!f && !d) return null;
  let loose: string | null = null;
  for (const { text } of L.lines) {
    if (f && d && text.includes(f) && text.includes(d)) return text;
    if (f && text.includes(f) && loose == null) loose = text;
  }
  return loose;
}

/** 上一行是哪种提示词 */
function cue(prev: string): '生' | '殁' | '葬' | '配' | undefined {
  if (!prev) return undefined;
  if (/(生于|生於)$/.test(prev)) return '生';
  if (/(殁于|殁於|歿於|殁)$/.test(prev)) return '殁';
  if (/葬$/.test(prev)) return '葬';
  if (/(娶|聘|配|室|妣)$/.test(prev)) return '配';
  return undefined;
}

/* ── 主函数 ─────────────────────────────────────────────────────────────── */

export function buildDossier(p: Person, f: Facts | undefined): Dossier {
  const cat = Object.fromEntries(CATS.map(k => [k, [] as Item[]])) as Record<Cat, Item[]>;
  const L = new Ledger(p.raw_text ?? '');
  const src = p.src_human;

  /** 归一类，同时销账 */
  const take = (k: Cat, text: string | null | undefined, label?: string) => {
    if (!text) return;
    push(cat, k, { text, label, src });
    L.strike(text);
  };

  // 名字本身也占账本开头的几个字（「壁 协」）——先销掉，否则永远是备注
  L.strike(p.name_raw ?? p.name);
  L.strike(p.name);

  /* 名号 */
  for (const [k, cn] of [['zi', '字'], ['hui', '讳'], ['hao', '号'], ['ming', '名']] as const) {
    const v = (p as any)[k];
    if (v?.text) { take('名号', v.text, cn); L.strike(cn + v.text); }
  }

  /* 世系——**取原文那一行，不拼。**
     拼会造出谱上没有的句子：承贵（P-册4-0137-2-1-0）那一条
     father_name 被解析成「开聪公之」、filiation 是「祧子」，
     再补一个「公」就成了「开聪公之公祧子」——谱上写的是「开聪公之祧子」。
     卡片不许印谱没写过的字，所以直接去原文里找那一行。 */
  const lineage = lineOf(L, p.filiation, p.father_name);
  if (lineage) take('世系', lineage, p.father_src ?? undefined);

  /* 生殁寿葬 */
  take('生', p.birth?.text, '生于');
  L.strike('生于'); L.strike('生於');
  take('殁', p.death?.text, '殁于');
  L.strike('殁于'); L.strike('歿於'); L.strike('殁於');
  // ★ 一条记载里常有两个「年 X」——本人一个、妻子一个。
  //   不标明是谁的，启昌那张卡片上就会并排站着「年五十三」和「年八十四」，
  //   看着像同一个人活了两次。按行位置判归谁（owner.ts，和葬用同一套）。
  {
    const ages = agesOf(p);
    if (ages.length) {
      for (const a of ages) {
        const nm = a.spouse == null ? null
          : (p.spouses?.[a.spouse]?.name_raw ?? '').replace(/[\s　]+/g, '');
        take('寿', a.text, nm ? `${nm}的` : '本人');
      }
    } else {
      take('寿', (p as any).age?.text ?? null, '享年');
    }
  }
  if (p.burial?.text) take('葬', p.burial.text, '葬');

  /* 配偶——rel 是谱自己写的字：娶·继娶·聘·侧室 */
  for (const s of p.spouses ?? []) {
    const bits = [s.name_raw];
    if (s.birth?.text) bits.push(`生于${s.birth.text}`);
    if (s.death?.text) bits.push(`殁于${s.death.text}`);
    if (s.burial?.text) bits.push(s.burial.text);
    push(cat, '配', { text: bits.filter(Boolean).join('　'), label: s.rel, src });
    L.strike(s.rel); L.strike(s.name_raw);
    for (const b of [s.birth, s.death, s.burial]) if (b?.text) L.strike(b.text);
  }

  /* 子女——原文列的名字，一个不改 */
  // 单字名（澐公的儿子「梓 棎 楼 榛」）也要销账，否则会掉进备注
  for (const s of p.sons_claimed ?? []) { push(cat, '子', { text: s, src }); L.strike(s, 1); }
  for (const d of p.daughters_claimed ?? []) { push(cat, '女', { text: d, src }); L.strike(d, 1); }
  L.strike('生子'); L.strike('生女'); L.strike('女');

  /* marks：谱自己打的标签，按 tag 分流。认不出的 tag 进备注，不丢。 */
  for (const m of p.marks ?? []) {
    const t = `${m.tag}${m.text ?? ''}`;
    const k: Cat =
      ADOPT.test(t) ? '过继' :
      STELE.test(t) ? '碑志' :
      HONOR.test(t) ? '旌表' :
      MOVE.test(t)  ? '迁徙' :
      OFFIC.test(t) ? '功名' :
      DUTY.test(t)  ? '职事' : '事迹';
    push(cat, k, { text: m.text || m.tag, label: m.tag, src });
    L.strike(m.text ?? ''); L.strike(m.tag);
  }

  /* titles */
  for (const t of p.titles ?? []) { push(cat, '功名', { text: t, src }); L.strike(t); }

  /* 过继：本人条目的行次就写着「嗣子」「祧子」时，也是一条过继记载 */
  if (p.is_heir && !cat['过继'].length && lineage) {
    push(cat, '过继', { text: lineage, label: '行次', src });
  }

  /* 别人写他的过继语句——归到他自己的过继格，注明是谁那一条写的 */
  for (const m of f?.mentions ?? []) {
    if (m.kind !== '立嗣语句' && m.kind !== '出嗣语句') continue;
    push(cat, '过继', { text: m.text ?? m.as, label: `${m.by_name}那一条`, src: m.src_human });
  }

  /* unparsed：解析阶段没吃下的行。**必须收，否则就是丢字。**
     归类走的是下面同一张 route 表——不另立一套，免得两张表打架。 */
  for (const u of (p as any).unparsed ?? []) {
    const t: string = flat(u.text ?? '');
    // 绝大多数 unparsed 行本来就在 raw_text 里，交给下面的剩余行循环去归——
    // 那里看得见上一行，归得准。只有正文里没有的才在这里补收。
    if (!t || L.s.includes(t)) continue;
    const k = route(t, '');
    if (k) push(cat, k, { text: t, src });
  }

  /* 剩下的行，按一张表归。**这是全文件唯一的一处归类规则。** */
  for (const { text, prev, i } of L.leftoverLines()) {
    const k = route(text, prev);
    if (k) push(cat, k, { text, label: cue(prev), src });
    L.strikeLine(i);   // 归了类（或判定为纯排版标记），账就销了
  }

  /* 去重：unparsed 与结构字段常写同一句；已归进别的格的，备注里就不再留一份 */
  const elsewhere = new Set<string>();
  for (const k of CATS) {
    if (k === '备注') continue;
    for (const it of cat[k]) elsewhere.add(it.text);
  }
  for (const k of CATS) {
    const seen = new Set<string>();
    cat[k] = cat[k].filter(it => {
      const key = `${it.label ?? ''} ${it.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !(k === '备注' && elsewhere.has(it.text));
    });
  }

  return {
    pid: p.pid,
    name: p.name,
    gen: p.gen,
    cat,
    mentions: f?.mentions ?? [],
    audit: {
      total: L.s.length,
      unaccounted: L.unaccounted,
      noted: cat['备注'].reduce((n, i) => n + i.text.length, 0),
    },
  };
}

export function buildDossiers(people: Person[], F: Map<string, Facts>): Map<string, Dossier> {
  const out = new Map<string, Dossier>();
  for (const p of people) out.set(p.pid, buildDossier(p, F.get(p.pid)));
  return out;
}
