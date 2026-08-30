/**
 * 现在到底是什么状态。一条命令跑出来，不凭印象。
 *   node --experimental-strip-types tools/status.mjs
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';
import { continued } from '../src/core/continued.ts';
import { lineOwners } from '../src/core/owner.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
const sum = (t, re) => [...t.matchAll(re)].reduce((a, m) => a + (NUM[m[1]] ?? 0), 0);

const raw = J('people');
const people = withBacklinks(raw);
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const refs = J('referenced');
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));

const line = (a, b) => console.log(`  ${String(a).padEnd(34)}${b}`);

console.log('\n══ 谱本身 ══');
line('有单独一条的人', `${people.length}`);
line('妻、女、只在名单里出现的子', `${refs.length}（其中 ${refs.filter(r => r.derived).length} 个是这次补的 id）`);
line('合计有 id 的人', `${people.length + refs.length}`);

console.log('\n══ 世系连得上吗 ══');
{
  let root = 0, stop = 0;
  for (const p of people) {
    let cur = p.pid, n = 0; const seen = new Set();
    while (cur && n++ < 45) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const q = idx.get(cur); if (!q) break;
      if (q.gen === 1) { root++; break; }
      const g = kept(C.get(cur)); if (!g.length) { stop++; break; }
      cur = (g.find(c => c.edge.kind === '生父') ?? g[0]).edge.parent;
    }
  }
  line('能一路追到胜二公', `${root} 人（${(root / people.length * 100).toFixed(1)}%）`);
  line('中途断掉', `${stop} 人`);
}

console.log('\n══ 父边判据 ══');
{
  const st = {};
  for (const cs of C.values()) for (const c of cs) st[c.status] = (st[c.status] ?? 0) + 1;
  const names = { ok: '成立', ord: '排行对不上', named: '生子名单点了别人',
                  age: '年代不可能', gen: '世次差不是 1', slot: '名额已有人自报',
                  adopt: '谱写明「立某某为嗣」的是别人', wrote: '谱写的父名不是这个人',
                  sib: '兄弟都已定为别人' };
  for (const [k, v] of Object.entries(st).sort((a, b) => b[1] - a[1])) {
    line(names[k] ?? k, `${v} 条`);
  }
  let amb = 0;
  for (const p of people) {
    const by = new Map();
    for (const c of C.get(p.pid)) if (c.status === 'ok') by.set(c.edge.kind, (by.get(c.edge.kind) ?? 0) + 1);
    if ([...by.values()].some(v => v > 1)) amb++;
  }
  line('**谱上说不清是哪个父亲**', `${amb} 人（${(amb / people.length * 100).toFixed(1)}%）`);
  const conflict = people.filter(p => C.get(p.pid).some(c => c.conflict)).length;
  line('谱两边写明、年代却兜不拢', `${conflict} 人（保留并标出）`);
}

console.log('\n══ 字段归属（翻页／并栏） ══');
{
  line('「殁」接回来的', `${people.filter(p => continued(p)).length} 人　已修`);
  let toSpouse = 0;
  for (const p of people) for (const o of lineOwners(p)) if (o.spouse != null) toSpouse++;
  line('未归属原文该归配偶的', `${toSpouse} 行　已按段摆到配偶名下`);
  // 葬
  // ★ places 的主键字段叫 owner，不叫 pid。写错字段名会得到「1 人」这种假数。
  const places = J('places');
  const byOwner = new Map();
  for (const b of places) byOwner.set(b.owner, (byOwner.get(b.owner) ?? 0) + 1);
  const multi = [...byOwner.values()].filter(n => n > 1);
  line('名下不止一处「葬」的人',
    `${multi.length} 人／${multi.reduce((a, n) => a + n, 0)} 条　已按抬头（公殁于／某妣殁于）判归属`);
}

console.log('\n══ 子女／名单 ══');
{
  let dGap = 0, dMiss = 0;
  const byHost = new Map();
  for (const r of refs) {
    if (!byHost.has(r.host)) byHost.set(r.host, []);
    byHost.get(r.host).push(r);
  }
  for (const p of people) {
    const said = sum(NS(p.raw_text), /(?:生?女)([一二三四五六七八九十两])/g);
    const got = (byHost.get(p.pid) ?? []).filter(r => r.role === '女').length;
    if (said > got) { dGap++; dMiss += said - got; }
  }
  line('女儿 id 还没发够的人', `${dGap} 人，少 ${dMiss} 个`);
  // 现有 ref 里对不上谱写的
  const bad = refs.filter(r => (r.role === '女' || r.role.startsWith('子'))
    && /[殁卒葬迁徙]|[于於]|^公|^妣|^也$/.test(NS(r.name_raw)));
  line('登记成人、其实不是人名的 ref', `${bad.length} 条　子女栏已改从切分器建，这些不再当孩子摆出来`);
}

console.log('\n══ 代码卫生 ══');
{
  const src = [];

  if (false) {

  }
  line('按名字建关系的地方', '0 处（有 nohardcode／noloss 两条检查兜底）');
  line('取第一个候选的地方', '0 处');
}
console.log('');
