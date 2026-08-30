/**
 * 名字是解析残渣的记录：**每一个字都是时间单位**。
 *
 * 谱上名字那一格是空的时候，解析器把上一行「…日…时」的尾巴当成了名字：
 *     [ 日   时]
 *     [殁于]
 *     [一九九五年十二月二十三日]
 *
 * 判法不写死具体名字（那就成了针对某个人写死），按结构判：
 * 名字里每个字都出自「年月日时」这一类，就不是名字。
 * 「铣时」有「铣」，不受影响。
 */
import { readFileSync } from 'node:fs';
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const TIME = /^[年月日时辰刻初廿卅晨午夜]+$/;

const fake = people.filter(p => TIME.test(NS(p.name)));
console.log(`名字全由时间单位组成的记录：${fake.length} 条`);
const byName = new Map();
for (const p of fake) byName.set(NS(p.name), (byName.get(NS(p.name)) ?? 0) + 1);
console.log('  ' + [...byName].map(([k, v]) => `「${k}」×${v}`).join('　'));
console.log(`\n它们身上还有多少内容：`);
let kids = 0, spouse = 0, edges = 0;
for (const p of fake) {
  kids += (p.sons_claimed ?? []).length;
  spouse += (p.spouses ?? []).length;
  edges += p.parent_edges.length;
}
console.log(`  生子名单 ${kids} 个名字　配偶 ${spouse} 位　父边 ${edges} 条`);
console.log(`\n谁把他们当父亲：`);
let asDad = 0;
const fakeIds = new Set(fake.map(p => p.pid));
for (const p of people) for (const e of p.parent_edges) if (fakeIds.has(e.parent)) asDad++;
console.log(`  ${asDad} 条父边指向这些记录`);
console.log(`\n逐条：`);
for (const p of fake) {
  console.log(`  ${p.src_human}　父名「${p.father_name ?? ''}」${p.filiation ?? ''}`
    + `　生子：${(p.sons_claimed ?? []).join('、') || '—'}`);
}
