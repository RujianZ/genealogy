/**
 * **人工判定：看过原书之后写下的结论。全站最高一级。**
 *
 * 自动判定能走到哪一步是有边界的——谱把「濬」印成「济」、把「继曾」写成「继会」、
 * 把儿子的名字漏印只留下一个「字张林」，这些都要人翻开那几页、把前后几格连起来
 * 才看得出来。看出来了，就写进这张表，**它覆盖自动判定**。
 *
 * 规矩三条：
 *   1. 一人一行，键是 pid。
 *   2. **必须写清依据和看了哪几页。** 没有推理链的结论不许进来——
 *      那样后人既不能复核也不能推翻，就成了另一种「我说了算」。
 *   3. `生父: null` 是**一个结论**，意思是「翻过谱面，谱确实没写」，
 *      不是「还没查」。没查的人根本不该出现在这张表里。
 *
 * 这张表就是数据库里的一张人工覆盖表。后人续修时往里加行即可，
 * 不必动任何代码。
 */
import type { Level, Pick, Resolved } from './resolve.ts';

export interface ManualCall {
  名: string;
  生父?: string | null;
  父名?: string;
  嗣父?: string[] | null;
  嗣父说明?: string;
  依据: string;
  核对: string;
  日期: string;
  更正?: string;
}

export type ManualTable = Record<string, ManualCall>;

/** 把人工判定盖到自动判定上。没有人工条目的原样返回。 */
export function applyManual(
  table: ManualTable, pid: string, auto: Resolved,
): Resolved {
  const m = table[pid];
  if (!m || pid.startsWith('_')) return auto;

  const mk = (p: string): Pick => ({ pid: p, level: '人工核定' as Level, why: m.依据 });

  const birth = m.生父 === undefined ? auto.birth : (m.生父 ? [mk(m.生父)] : []);
  const heir = m.嗣父 === undefined ? auto.heir
    : (m.嗣父 ?? []).map(x => ({ pid: x, level: '人工核定' as Level, why: m.依据 }));

  // 人工看过之后，「说不清」就不该再出现：要么定了，要么明说谱没写。
  const level: Level = (birth.length || heir.length) ? '人工核定' : '谱未写';

  return {
    ...auto, birth, heir, level,
    // 被排除的候选照旧留着能点，但不再当成「候选父亲」摆在卡片上
    alsoNamed: auto.alsoNamed,
    conflicts: [...auto.conflicts, `人工核定（${m.日期}，核对 ${m.核对}）`
      + (m.嗣父说明 ? `｜嗣父：${m.嗣父说明}` : '')],
  };
}
