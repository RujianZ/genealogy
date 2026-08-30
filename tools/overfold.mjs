/**
 * 折叠表把**两个不同的人**折成同名了吗？
 *
 * ★ 折叠是为了让「啟发」和「启发」认出是同一个人。但折过头就反过来：
 *   泽**浬**（第21世 317页）和泽**裏**（第21世 348页）被折成同一个「泽里」，
 *   於是铣光名下出现两个「泽里」，看着像我们多摆了一个人。
 *
 *   裏→里 是正当繁简；**浬→里 不是**——浬是独立的字。
 *   自动生成的表（Windows 繁简映射）管不到这种分寸。
 *
 * ★ 判法：同一世里，两个人**折叠后同名、折叠前不同名**，
 *   而且各自都有独立条目——那这次折叠就把两个人合并了。
 *   （只报告，不自动改。每一条都要人看过才动表。）
 */
import { readFileSync } from 'node:fs';
import { withBacklinks } from '../src/core/backlink.ts';
import { isFragment } from '../src/core/fragment.ts';
import { norm } from '../src/core/norm.ts';

const people = withBacklinks(JSON.parse(readFileSync('data/people.json', 'utf8')));
const all = people.filter(p => !isFragment(p));
const raw = (s) => (s ?? '').replace(/[\s　]/g, '');

const byFold = new Map();
for (const p of all) {
  if (p.gen == null) continue;
  const k = `${p.gen}|${norm(raw(p.name))}`;
  (byFold.get(k) ?? byFold.set(k, []).get(k)).push(p);
}

const hits = [];
for (const [k, list] of byFold) {
  if (list.length < 2) continue;
  const forms = new Set(list.map(p => raw(p.name)));
  if (forms.size < 2) continue;                 // 折叠前本来就同名 —— 那是真同名，不是折出来的
  // 找出是哪一个字被折的
  const arr = [...forms];
  const chars = new Set();
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (a.length !== b.length) continue;
      for (let x = 0; x < a.length; x++) if (a[x] !== b[x]) chars.add(`${a[x]}／${b[x]}`);
    }
  hits.push({ k, list, forms: arr, chars: [...chars] });
}

console.log('═'.repeat(70));
console.log(`同一世里「折叠后同名、折叠前不同名」的组：${hits.length} 组`);
console.log('（每一组都要人看：是同一个人的两种写法，还是两个人被折到了一起）');
console.log('═'.repeat(70));
for (const { list, forms, chars } of hits) {
  console.log(`\n第${list[0].gen}世　${forms.join('　vs　')}　差在 ${chars.join('、')}`);
  for (const p of list)
    console.log(`   ${raw(p.name)}　${p.src_human}　父名「${raw(p.father_name) || '空'}${p.filiation || ''}」`
      + `　原文 ${raw(p.raw_text).length} 字`);
}
