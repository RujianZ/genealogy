/**
 * 在你爷爷、太爷爷卡上发现的那几类错，**全谱各有多少人中招、现在还剩多少**。
 *
 * 每一类都算「改前」和「改后」两个数：
 * 改前 = 旧写法（按名字搜、把所有指进来的边都列、原文重复摆）
 * 改后 = 现在的写法
 *
 * 只报数不解释；数对不上就是没修干净。
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf, mentionedBy } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { continued } from '../src/core/continued.ts';
import { makeRegistry } from '../src/core/entries.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const NS = s => (s ?? '').replace(/[\s　]/g, '');
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const R = makeRegistry({
  people: J('people'), refs: J('referenced'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'),
});
const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
const edgesOf = q => C.get(q.pid).map(c => ({ parent: c.edge.parent, ok: c.status === 'ok' }));

const pct = (a, b) => b ? ` (${(a / b * 100).toFixed(1)}%)` : '';
const N = people.length;

// ── ① 「谁的条目里提到他」：按名字搜 → 按 id 判 ──────────────
{
  let before = 0, after = 0, hurt = 0;
  for (const p of people) {
    const forms = p.aliases.map(a => a.form);
    const old = people.filter(q => q.pid !== p.pid && forms.some(f => q.raw_text.includes(f)));
    const now = mentionedBy(people, p, edgesOf);
    before += old.length; after += now.length;
    if (old.length !== now.length) hurt++;
  }
  console.log('══ ①「谁的条目里提到他」列错人 ══');
  console.log(`  改前一共列 ${before} 条，改后 ${after} 条，去掉 ${before - after} 条`);
  console.log(`  卡片受影响的人：${hurt}${pct(hurt, N)}`);
}

// ── ② 子女栏 ─────────────────────────────────────────────
{
  let before = 0, after = 0, hurt = 0, over = 0;
  for (const p of people) {
    const old = childrenOf(people, p.pid).length;
    const e = R.build.person(p.pid);
    const now = (e.relations.find(r => r.heading === '子女')?.items ?? []).length;
    before += old; after += now;
    if (old !== now) hurt++;
    // 谱写了「生子N」而改前列得比 N 多的
    const n = (p.sons_claimed ?? []).length;
    if (n && old > n) over++;
  }
  console.log('\n══ ② 子女栏 ══');
  console.log(`  改前一共列 ${before} 条，改后 ${after} 条`);
  console.log(`  卡片受影响的人：${hurt}${pct(hurt, N)}`);
  console.log(`  其中「谱写了生子N、改前却列得比 N 多」的父亲：${over} 人（你爷爷继均是其中之一）`);
}

// ── ③ 翻页断行：殁年掉进「其余原文」 ────────────────────────
{
  const fixed = people.filter(p => continued(p));
  console.log('\n══ ③ 翻页断行，「殁」栏空着 ══');
  console.log(`  接回来的人：${fixed.length}${pct(fixed.length, N)}`);
  const withStray = fixed.filter(p => continued(p).stray.length);
  console.log(`  其中「生」栏还被并进了别人的行（多半是妻子生年）：${withStray.length} 人`
    + `　${withStray.map(p => p.name + '(' + p.src_human.split('·').slice(-2).join('·') + ')').join('、')}`);
  const gens = {};
  for (const p of fixed) gens[p.gen] = (gens[p.gen] ?? 0) + 1;
  console.log(`  分布在第几世：` + Object.entries(gens).sort((a, b) => a[0] - b[0])
    .map(([g, n]) => `${g}世${n}人`).join('　'));
}

// ── ④ 「其余原文」重复摆已经显示过的行 ──────────────────────
{
  let hurt = 0, lines = 0;
  for (const p of people) {
    if (!p.unparsed?.length) continue;
    const e = R.build.person(p.pid);
    const sec = e.sections.find(s => s.heading === '其余原文');
    const now = sec ? sec.text.split('\n').filter(Boolean).length : 0;
    if (now < p.unparsed.length) { hurt++; lines += p.unparsed.length - now; }
  }
  console.log('\n══ ④「其余原文」重复摆上面显示过的行 ══');
  console.log(`  卡片受影响的人：${hurt}${pct(hurt, N)}　一共去掉重复 ${lines} 行`);
}

// ── ⑤ 年代规则误排掉谱两边写明的关系 ────────────────────────
{
  const restored = [];
  for (const p of people) {
    for (const c of C.get(p.pid)) if (c.conflict) restored.push({ p, c });
  }
  console.log('\n══ ⑤ 谱两边写明、却被推算年代排掉的父子关系 ══');
  console.log(`  接回来的边：${restored.length} 条`);
  const kids = new Set(restored.map(x => x.p.pid));
  console.log(`  直接受益的人：${kids.size}（梁馥兄弟五人在其中）`);
}

// ── ⑥ 现在还剩多少说不清 ────────────────────────────────
{
  let n = 0;
  for (const p of people) {
    const by = new Map();
    for (const c of C.get(p.pid)) {
      if (c.status !== 'ok') continue;
      by.set(c.edge.kind, (by.get(c.edge.kind) ?? 0) + 1);
    }
    if ([...by.values()].some(v => v > 1)) n++;
  }
  console.log('\n══ ⑥ 现在还剩 ══');
  console.log(`  同一种关系下留着不止一个父候选的人：${n}${pct(n, N)}`);
}
