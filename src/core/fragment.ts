/**
 * 名字是解析残渣的记录——**不是人。**
 *
 * ★ 谱把不知道的月日时留空：
 *
 *       开 田
 *       字木松
 *       生于  民国二十一年　月　日　时      ← 月、日、时 后面是空的
 *       公殁于 一九七八年三月　日　时
 *       葬云山金盘托果上向西南
 *
 *   （原件 source/合三（8、9）.doc，「月」「日」「时」在文件里就是各自独立的一段。）
 *
 *   解析器在「…日　时」这里断出了一条新记录，把这两个字当成了名字。
 *   全谱 26 条：日时 14、月日 6、年月 6。
 *
 * ★ 判法按**结构**，不写死具体名字——写死名字就成了针对某个人写代码
 *   （tools/nohardcode.mjs 会红）。名字里每个字都出自年月日时这一类，
 *   那就不是名字。「铣时」有个「铣」，不受影响。
 *
 * ★ 不删数据。这些记录里的原文是真的（葬、妣殁于…），
 *   只是它不该当一个人去参与「谁是谁的父亲」这类判断。
 */
import type { Person } from './types.ts';

const TIME_ONLY = /^[年月日时辰刻初廿卅晨午夜]+$/;

export function isFragment(p: Person): boolean {
  return TIME_ONLY.test((p.name ?? '').replace(/[\s　]/g, ''));
}

/**
 * referenced 里登记成了人、其实不是人名的那些——**同一个毛病的另一半。**
 *
 *   朝爱 之子「也」
 *   泽渭 之子「迁陕」
 *   梁松 之子「光月殁」
 *   壁贵 之子「公殁于」
 *
 * 上游从「生子N：…」名单里扫名字时，把混在名单里的句子一起扫了进来。
 * 子女栏已经改成按谱自己的格式重读（roster），这些进不来了；
 * 但它们还留在 referenced 里，**搜索照样能把它们当人搜出来**。
 *
 * 判法按结构，不写死具体的字：带「殁卒葬迁徙」、带「于／於」、
 * 以「公／妣」起头，或者长得不像名字。
 * 「幼殁」「次幼殁」是例外——那是谱记一个夭折的孩子，人是真的，只是没留名。
 */
export function isNotAPerson(nameRaw: string | null | undefined): boolean {
  const t = (nameRaw ?? '').replace(/[\s　]/g, '');
  if (!t) return true;
  if (/^(幼殁|次幼殁|长幼殁|三幼殁|四幼殁|幼殇)$/.test(t)) return false;
  if (t.length > 6) return true;
  if (/[于於]/.test(t)) return true;
  if (/[殁卒葬迁徙]/.test(t) && !/[适適嫁]/.test(t)) return true;
  if (/^(公|妣|氏|也|弟|兄|男)$/.test(t) || /^(公殁|妣殁|生于|生子|女[一二三四五六七八九十])/.test(t)) return true;
  return false;
}
