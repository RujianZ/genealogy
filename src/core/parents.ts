/**
 * **一个人的父亲们——全谱唯一的入口。**
 *
 * ★ 为什么要有这个文件
 *
 *   在这之前，同一个问题「他父亲是谁」有**三套互不相干的答案**：
 *
 *     人物卡  entries.ts   → candidates()：世次、生年、生子名单、排行、
 *                            兼祧、同一人重复条目，六道排除全走
 *     世系树  lineage.ts   → **原始 parent_edges**，只按「世次差是否为 1」和 rank 排一下
 *     关系计算 kinship.ts  → **原始 parent_edges**，注释写着「一条边不丢」
 *
 *   於是同一个人的父亲，在卡片上、树上、算称呼时可以是三个不同的答案。
 *   量出来：**312 人的上溯链里有 320 步，走的是人物卡已经明确排除掉的那条边**
 *   （排行不对 128 步、同一人重复条目 83 步、名额被占 42 步、年代不可能 14 步…）。
 *   树会沿着 app 自己判定为不可能的路往上走。
 *
 *   一个 id、一套关系，卡片／树／关系计算／疑点清单全走这里。
 *
 * ★ 关系表长什么样（谱自己的结构）
 *
 *       parent_edge(child, parent, kind)      kind ∈ {生父, 嗣父}
 *
 *   两种边的约束**不一样**：
 *       生父  正常恰好 1 位。0 = 谱没写或断链；**>1 = 谱自己前后对不上**
 *       嗣父  0…N 位。0 = 没过继；1 = 出嗣一房；**>1 = 兼祧几房，全都算数**
 *
 *   ——「有两个候选」在生父那边是问题，在嗣父那边是常态。
 *   把两者混成一句「同名的有 2 个，没说是哪一个」，是把谱写清楚了的事说成没写。
 *
 * ★ 过继的花样（全部来自谱的原话，逐条清点过）
 *
 *       出嗣X / 立…为嗣 / 嗣子祧子   128 / 149 / 148 条   基本嗣父边
 *       兼祧、两祧、遵例两祧          13 + 4 条            嗣父 N 位
 *       **承本身兼嗣 / 承本身并祧**    3 条                 **生父同时也是宗法父**
 *           「光作**承本身并祧**亲兄梁珍为嗣」——他既承本家，又兼祧兄长
 *       **承本生父母宗祧（归宗）**     1 条                 宗法线**回到生父**
 *           「后生子五，将次子梁二、幼子梁五**承本生父母宗祧**」
 *       立爱子                        3 条                 嗣父边
 *       招赘 / 坐婿                   5 条                 另一类，不进父边
 *
 * ★ 同名怎么定
 *
 *   欧式五世一图「一幅断为五格、五代横提」，**儿子印在父亲的下一格**。
 *   谱把谁摆在正上一格，那是**表格自己的读法**，不是我们统计出来的规律。
 *   在「同名候选不止一位、而谱自己（生子名单）给出了答案」的 522 例上实测：
 *   **版面指对 517 例 = 99.04%**。所以：同一种关系的几个**同名**候选里，
 *   只有一位被印在正上一格时，就照谱的读法定下来（`settledByLayout`）。
 *   另一位仍旧留在 `alsoNamed` 里，仍旧能点。
 *
 *   注意：这条只管**彼此同名**的候选。名字不同的（壁洲／壁银）是兼祧，不是歧义。
 *
 * ★ people.json 一个字没动。这里只读。
 */
import type { Person, ParentEdge } from './types.ts';
import type { EraChart } from './years.ts';
import type { Window } from './activity.ts';
import { norm } from './norm.ts';

/** 谱上「承本身」的写法：既承本家，又兼祧别房 */
const KEEPS_OWN = /承本身/;
/** 归宗：出嗣之后把香火还回本生父母 */
const BACK_HOME = /承本生父母/;

/**
 * 一位候选父亲。
 *
 * 早先这个类型住在 `candidates.ts` 里，跟那套「十条排除规则赛跑」
 * 绑在一起。那套已经删了，判定全部改走 `resolve.ts::resolveAll()`，
 * 这里只剩下界面要的形状。
 */
export interface Cand {
  edge: ParentEdge;
  person: Person | null;
  /** 永远是 'ok'：判不出来的人根本不会进这个列表（而是进 alsoNamed） */
  status: 'ok';
  /** 凭什么——照抄谱上的话，或说明是哪一条定式 */
  note: string;
  conflict?: string;
  layoutNote: string;
  /** 谱把他印在本人正上方那一格里（五世一图的读法） */
  printedAbove: boolean;
}

export type ParentStatus =
  | 'ok'          // 说得清
  | 'homonym'     // 同名候选，版面也说不出
  | 'twoBirth'    // 记了两位生父 —— 谱这里自己对不上
  | 'none';       // 谱里没有他父亲那一条

export interface Parents {
  /** 生他的那一位。正常恰好 1 位 */
  birth: Cand[];
  /** 把他接过去的。兼祧几房就几位 */
  heir: Cand[];
  /** 走**宗法线**时跟着谁。兼祧则不止一条 */
  clan: Cand[];
  /** 「承本身」——生父同时也是宗法父 */
  keepsOwn: boolean;
  /** 「承本生父母宗祧」——出嗣后宗法线回到生父 */
  backHome: boolean;
  /** 同名候选里，谱把一位印在正上一格，据此定下来的 */
  settledByLayout: boolean;
  /** 定下来之后被搁在一边的同名者。**不删，照样列、照样能点** */
  alsoNamed: Cand[];
  status: ParentStatus;
}

/** 同一种关系里的候选，能定就定。返回 [留下的, 搁一边的, 是否靠版面定的] */
/** 走一步：血缘线跟生父，宗法线跟 clan。**说不清就不往下走，如实断在这里。** */
export function stepUp(
  ps: Parents, mode: '血缘线' | '宗法线',
): { taken: Cand | null; forks: Cand[] } {
  const pool = mode === '宗法线' ? ps.clan : (ps.birth.length ? ps.birth : ps.clan);
  if (pool.length === 1) return { taken: pool[0], forks: [] };
  if (!pool.length) return { taken: null, forks: [] };
  // 兼祧几房 → 宗法线本来就有几条路，全给出去，由界面并排画
  return { taken: pool[0], forks: pool };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 新入口：从 resolve.ts 的判定结果建 Parents
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 旧的 `parentsOf()` 走 `candidates.ts`——十条排除规则赛跑，谁先命中谁说了算，
 * 没有优先级。那套东西在 2026-09-04 一天里撞出三个同形状的错，
 * 而且同一个人在卡片、树、兄弟栏、关系计算四处会得到不同答案。
 *
 * 现在判定只在 `resolve.ts::resolveAll()` 做一次，按 CLAUDE.md 的次第：
 *
 *     ① 谱的原话  ＞  ② 谱的定式  ＞  ③ 算术  ＞  ④ 说不清
 *
 * 这里只做形状转换，**不做任何判断**——一个 if 都不该有。
 */
export function parentsFrom(
  idx: Map<string, Person>, p: Person, r: import('./resolve.ts').Resolved | undefined,
): Parents {
  const mk = (pick: { pid: string; why: string; level: string },
              kind: '生父' | '嗣父'): Cand => {
    const q = idx.get(pick.pid) ?? null;
    return {
      edge: {
        child: p.pid, child_name: p.name,
        parent: pick.pid, parent_name: q?.name ?? '',
        kind,
        // rank 只留给界面排序用；判据本身已经在 why 里说清楚了
        evidence: pick.level === '原话' ? 'claim_named' : 'sole_homonym',
        rank: pick.level === '原话' ? 1 : 2,
        evidence_cn: pick.why,
        matched_as: '',
        child_src: p.src_human, parent_src: q?.src_human ?? '',
      },
      person: q,
      status: 'ok',
      note: pick.why,
      layoutNote: '',
      printedAbove: pick.level === '定式',
    };
  };

  // ★ 附记之人（女儿、无名子）的父亲就是宿主——谱就把他们写在他那一条里，
  //   没有第二种读法。不补这条边，她们就是图上的孤立点：
  //   关系计算器算不出来、世系树只有一行。
  //   妻子没有父边（谱不记娘家），那是谱的实情，不编。
  const at = (p as any).attached as
    { role: '妻' | '女' | '子'; of: string; of_name: string;
      kin?: { rel_raw?: string } } | undefined;
  if (at && at.role !== '妻') {
    const host = idx.get(at.of);
    if (host) {
      // ★ 名单头那个字是谱写的：「**生**子一　泽蛟」「**养**子一　泽龙」。
      //   养子不是亲生，把两种都当生父就是把谱的原话改了。
      const yang = at.kin?.rel_raw === '养';
      const one = mk({ pid: host.pid, level: '原话',
        why: yang
          ? `谱在${host.name}那一条里写「养子」，名单里列的就是他`
          : `谱把他/她写在${host.name}那一条里的生子生女名单里` },
        yang ? '嗣父' : '生父');
      return {
        birth: yang ? [] : [one], heir: yang ? [one] : [], clan: [one],
        keepsOwn: false, backHome: false, settledByLayout: false,
        alsoNamed: [], status: 'ok',
      };
    }
  }

  const birth = (r?.birth ?? []).map(x => mk(x, '生父'));
  const heir = (r?.heir ?? []).map(x => mk(x, '嗣父'));
  const raw = p.raw_text ?? '';
  const keepsOwn = KEEPS_OWN.test(raw);
  const backHome = BACK_HOME.test(raw);

  let clan: Cand[];
  if (backHome) clan = birth;
  else if (heir.length) clan = keepsOwn ? [...heir, ...birth] : heir;
  else clan = birth;

  // status 直接照搬判定级别，不再自己算一遍
  let status: ParentStatus = 'ok';
  if (!birth.length && !heir.length) status = 'none';
  else if (r?.level === '说不清' && birth.length > 1) {
    const names = new Set(birth.map(c => norm(c.person?.name ?? '')));
    status = names.size > 1 ? 'twoBirth' : 'homonym';
  }

  return {
    birth, heir, clan, keepsOwn, backHome,
    settledByLayout: r?.level === '定式',
    alsoNamed: (r?.alsoNamed ?? []).map(x => mk({ ...x, level: '说不清' }, '生父')),
    status,
  };
}
