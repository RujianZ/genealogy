// 验证：承健那棵树。过继那一段必须真的分成两列，并且合得回去。
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { buildTree } from '../src/core/tree.ts';
import { EraChart, ageAllEdges } from '../src/core/years.ts';
import { makeRegistry } from '../src/core/entries.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people')), idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
// ★ 建树必须跟人物卡走同一份判定（R.parents）。
//   早先这里没传，于是这个闸验的是旧路径、不是 app 走的那条。
const __D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
const PS = makeRegistry(__D).parents;

const me = people.find(p => p.name === '承健' && p.gen === 27)
        ?? people.filter(p => p.name === '承健')[0];
console.log('本人：', me.name, '第' + me.gen + '世', me.src_human, '\n');

const t = buildTree(idx, me.pid, undefined, PS);
console.log('共', t.rows.length, '代　single =', t.single,
            '　分开于第', t.splitGen, '世　合回于第', t.joinGen, '世');
console.log('\n' + t.summary + '\n');
console.log('─'.repeat(72));

for (const r of t.rows) {
  if (r.mark) console.log(`      ── ${r.mark === 'split' ? '从这一世起两条路分开' : '往上是同一个人'} ──`);
  const line = r.cells.map(c => {
    const lab = r.cells.length > 1 ? (c.lines[0] === '血缘线' ? '[血脉] ' : '[辈分] ') : '';
    const adopt = c.via?.kind === '嗣父' ? ' ←过继' : '';
    const fork = c.alternatives.filter(e => !c.via || e.parent !== c.via.parent).length;
    return lab + c.person.name + (c.focus ? ' ←你' : '') + adopt
         + (fork ? `　（父名还能指向另 ${fork} 人）` : '')
         + (c.deadEnd ? '　【往上断了】' : '');
  }).join('   ||   ');
  console.log(String(r.gen).padStart(4) + '世  ' + line);
}

console.log('─'.repeat(72));
// 抽查：生年算术在多父候选上到底显示成什么样
const multi = people.filter(p => p.parent_candidates.length > 1);
let shown = 0;
for (const p of multi) {
  const res = ageAllEdges(chart, p.birth?.text, p.parent_candidates,
                          e => idx.get(e.parent)?.birth?.text);
  if (!res.ruledOut || res.left !== 1 || shown >= 3) continue;
  shown++;
  console.log(`\n${p.name}（第${p.gen}世）${p.src_human}`);
  console.log(`  谱上写父名「${p.father_name}」，同名 ${p.parent_candidates.length} 个：`);
  for (const r of res.rows) {
    const f = idx.get(r.edge.parent);
    console.log(`   ${r.check.verdict === 'impossible' ? '　划掉' : '  留着'}  `
      + `${r.edge.parent_name}（${f?.src_human}）\n           ${r.check.text}`);
  }
}
