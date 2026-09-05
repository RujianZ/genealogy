/**
 * **谱上没说清的，全列在这里。**
 *
 * 历代序里那句准则：「纪其所可知，阙其所未知」。
 * 「阙」不能变成「看不见」——所以要有这么一页，把空着的地方摆出来。
 *
 * ═══ 这一版跟上一版的区别 ═══
 *
 * 上一版是 `tools/build_doubts.py` 算好写进 `data/doubts.json`。
 * 那个脚本自己重写了一遍反向匹配、版面判断、同名排除、年代窗口——
 * **等於全谱有两套判定**，而且它认的还是旧字段（`evidence`／`rank`）。
 * 两边一分家，页面上报「同名分不清 123 人」，判定层这边其实是 0。
 *
 * 现在这里**不判任何事**，只把判定层已经给出的结论按「这是谁的问题」摊开：
 *
 *   靠定式定的      判定层的 level ＝「定式」——不是谱的原话，要人回去看一眼
 *   谱自己对不上    level ＝「原话」，但版面／房支跟原话对不上
 *   说不清          level ＝「说不清」
 *   谱没写父亲      level ＝「谱未写」
 *   谱上留空        谱自己写了「缺」「未详」「失考」——不是问题，是谱的实情
 *   名目对不上人    历届修谱名目里的人，在世系里认不出来
 */

import type { Person } from './types.ts';
import { norm } from './norm.ts';
import { canonical } from './seealso.ts';

export interface DoubtRow {
  pid?: string;
  name?: string;
  gen?: number | null;
  src_human?: string;
  /** 一句人话，说清这一条为什么在这儿 */
  why: string;
  /** 判定层给的依据原话 */
  basis?: string;
  /** 谱上写的父名 */
  father_name?: string;
  /** 判定给出的那位／那几位 */
  chosen?: { pid: string; name: string; kind: string }[];
  /** 交叉验证结果 */
  cross?: string;
  /** 原文片段 */
  raw?: string;
  /** 修谱名目那一类用 */
  era?: string;
  cands?: { pid: string; gen: number | null; src: string }[];
}

/** 判定层的**说明**不是谱的**矛盾**。这几句是人工逐条核过的（work/人工核对记录.md）。 */
const EXPLAIN = /立嗣语句说的是同名的另一位|没写本生父|兄弟同页眉|称谓词指向|人工核定/;

/** 谱自己写下的「这里没有记录」 */
const BLANK = /缺|未详|未祥|不详|失考|无考|失记|未考/;

const bare = (s: string) => norm(s ?? '').replace(/公$/, '');

type Reg = {
  idx: Map<string, any>;
  res: Map<string, any>;
  facts: Map<string, any>;
  people: Person[];
};

export function doubtList(R: Reg, revisions: { era: string; members: any[] }[] = []) {
  const people = R.people;
  const idx = R.idx;
  const out: Record<string, DoubtRow[]> = {
    靠定式定的: [], 谱自己对不上: [], 说不清: [],
    谱没写父亲: [], 谱上留空: [], 名目对不上人: [],
  };
  // 每个人**只落一格**，加起来必须正好是有独立条目的总人数。
  // 上一版的台账把「人工核定」那一档整个漏在外面，2233 只报到 2212。
  const tally = { 原话无冲突: 0, 人工核定: 0, 已核无误: 0,
                  谱自己对不上: 0, 靠定式: 0, 谱没写: 0, 说不清: 0, 合计: 0 };

  // 兼祧的人在谱上有好几条，孩子常印在他的**另一条**底下。
  // 不折回同一身份，同一个人会被报成「版面不一致」。
  const CAN = (x: string) => {
    const q = idx.get(x);
    return q ? canonical(people, q).pid : x;
  };

  // 同世同名，用来判「房支有没有分辨力」
  const byGN = new Map<string, Person[]>();
  for (const p of people) {
    const k = `${p.gen}|${bare(p.name)}`;
    (byGN.get(k) ?? byGN.set(k, []).get(k)!).push(p);
  }

  for (const p of people) {
    const r = R.res.get(p.pid);
    const f = R.facts.get(p.pid);
    if (!r) continue;

    const chosen = [...r.birth, ...r.heir].map((x: any) => ({
      pid: x.pid, name: idx.get(x.pid)?.name ?? '', kind: r.heir.includes(x) ? '嗣父' : '生父',
    }));
    const mine = new Set(chosen.map(c => CAN(c.pid)));

    const ab = (f?.layout?.above ?? []).map(CAN);
    const 欧式 = !mine.size ? '—' : !ab.length ? '无上一格'
      : ab.some((x: string) => mine.has(x)) ? '一致' : '不一致';

    const w = bare(p.father_name);
    const c = w ? (byGN.get(`${(p.gen ?? 0) - 1}|${w}`) ?? []) : [];
    let 房支 = '无分辨力';
    if (mine.size && c.length >= 2) {
      const same = c.filter(x => x.src.section === p.src.section);
      if (same.length === 1) 房支 = mine.has(CAN(same[0].pid)) ? '一致' : '不一致';
    }

    const base = {
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      father_name: p.father_name, chosen,
      basis: r.birth[0]?.why ?? r.heir[0]?.why ?? '',
    };

    tally.合计++;
    if (r.level === '定式') {
      tally.靠定式++;
      out.靠定式定的.push({ ...base, why: '谱没把话说死，是按谱自己的版面定式（正上一格／同房／夹在兄弟中间）定的',
        cross: `版面 ${欧式}　房支 ${房支}` });
    } else if (r.level === '说不清') {
      tally.说不清++;
      out.说不清.push({ ...base, why: '判定层没能定案' });
    } else if (r.level === '谱未写') {
      tally.谱没写++;
      out.谱没写父亲.push({ ...base, why: '谱上连父名都没写' });
    } else if (r.level === '人工核定') {
      // 我逐案翻回谱面核定并写下依据的那几位（data/人工判定.json）。
      // 它们带的「矛盾」是核定记录本身，不是谱的矛盾。
      tally.人工核定++;
    } else {
      const cf = (r.conflicts ?? []).filter((x: string) => !EXPLAIN.test(x));
      if (欧式 === '不一致' || 房支 === '不一致' || cf.length) {
        tally.谱自己对不上++;
        out.谱自己对不上.push({
          ...base,
          why: [欧式 === '不一致' ? '谱写的父名，跟印在他正上方那一格的人对不上' : '',
                房支 === '不一致' ? '谱写的父名，跟同房那一位对不上' : '',
                ...cf].filter(Boolean).join('；'),
          cross: `版面 ${欧式}　房支 ${房支}`,
        });
      } else if ((r.conflicts ?? []).length) {
        tally.已核无误++;
      } else {
        tally.原话无冲突++;
      }
    }

    // 谱自己写下的「这里没有记录」——不是问题，摆出来是为了不让它变成空白
    for (const [lab, v] of [['生', p.birth], ['殁', p.death], ['葬', p.burial], ['寿', p.age]] as const) {
      if (v && BLANK.test(v.text)) {
        out.谱上留空.push({ pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
          why: `${lab}：谱自己写的`, raw: v.text });
      }
    }
    for (const u of p.unparsed ?? []) {
      if (BLANK.test(u.text) && u.text.length <= 8) {
        out.谱上留空.push({ pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
          why: '谱自己写的', raw: u.text });
      }
    }
  }

  for (const rev of revisions) {
    for (const m of rev.members ?? []) {
      if (m.pid) continue;
      out.名目对不上人.push({
        era: rev.era, name: m.name ?? m.raw, why: m.match ?? '世系里没找到这个人',
        raw: m.raw, cands: m.candidates ?? [],
      });
    }
  }

  return { buckets: out, tally };
}
