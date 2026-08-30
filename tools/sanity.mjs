/**
 * 常识与数学检查。**不问印证几重，只问有没有违反基本逻辑。**
 *
 * ★ 承健定的标准：「我爷爷不会有三个同样叫开志的儿子，
 *   儿子不会比父亲出生早——这些是常识和数学问题。」
 *
 *   所以这里一条判断都不做，全是比大小、数世次、查环。
 *   任何一条红了，就是**确凿的错**，跟「谱写得清不清楚」无关。
 *
 * ★ 十条：
 *     ① 子女栏里两个人同名
 *     ② 儿子比生父先出生
 *     ③ 父子年龄差 < 13 或 > 75（生父线）
 *     ④ 儿子生在生父去世一年以上之后（遗腹子容差 1 年）
 *     ⑤ 世次差不是 1
 *     ⑥ 自己是自己的祖先（成环）
 *     ⑦ 留下两条以上生父边，却没在界面上标成分叉
 *     ⑧ 本人殁年早于生年
 *     ⑨ 配偶殁年早于生年
 *     ⑩ 自己出现在自己的子女栏或父亲栏
 *
 *   ②③④ 只对生父线做。嗣父不受生育年龄约束——立嗣的前提往往正是
 *   嗣父已经不在了（梁柯殁1835，嗣子光耀生1838）。那是宗法，不是生育。
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { fname } from '../src/core/fname.ts';
import { MIN_GAP, MAX_GAP } from '../src/core/years.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const bare = (s) => fname(s).replace(/公$/, '');
const all = people.filter(p => !isFragment(p));
const Y = (t) => chart.lookup(t).ad;

const KEEP = new Map(), KIDS = new Map();
for (const p of all) {
  const k = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  KEEP.set(p.pid, k);
  for (const c of k)
    (KIDS.get(c.edge.parent) ?? KIDS.set(c.edge.parent, []).get(c.edge.parent))
      .push({ child: p, edge: c.edge });
}

const FORK = [];
const V = new Map();                     // pid → 违反了哪几条
const hit = (p, code, detail) =>
  (V.get(p.pid) ?? V.set(p.pid, []).get(p.pid)).push({ code, detail });

for (const p of all) {
  const wp = win.get(p.pid);
  const ks = KIDS.get(p.pid) ?? [];
  const kbio = ks.filter(k => k.edge.kind === '生父');

  // ① 子女栏两个人同名（生父线）
  const byN = new Map();
  for (const k of kbio) {
    const n = bare(k.child.name);
    (byN.get(n) ?? byN.set(n, []).get(n)).push(k.child);
  }
  for (const [n, v] of byN)
    if (v.length > 1)
      hit(p, '①子女同名', `${v.length} 个都叫「${n}」：`
        + v.map(c => `${c.src.page}页${c.src.row}行`).join('、'));

  // ⑧ 本人殁早于生
  const b = wp?.born, d = wp?.died;
  if (b && d && d < b) hit(p, '⑧殁早于生', `生 ${b}，殁 ${d}`);

  // ⑨ 配偶殁早于生
  for (const s of p.spouses ?? []) {
    const sb = Y(s.birth?.text), sd = Y(s.death?.text);
    if (sb && sd && sd < sb) hit(p, '⑨配偶殁早于生', `${s.name_raw ?? ''} 生 ${sb}，殁 ${sd}`);
  }

  for (const c of KEEP.get(p.pid) ?? []) {
    const f = idx.get(c.edge.parent);
    if (!f) continue;
    // ⑩ 自己是自己的父亲
    if (f.pid === p.pid) hit(p, '⑩自己是自己的父亲', '');
    // ⑤ 世次差
    if (f.gen != null && p.gen != null && p.gen - f.gen !== 1)
      hit(p, '⑤世次差不是1', `${f.name} 第${f.gen}世，本人第${p.gen}世`);
    if (c.edge.kind !== '生父') continue;
    const wf = win.get(f.pid);
    // ★ 父亲自己的年代就自相矛盾时（铣治：生1750、殁1741），
    //   一律不拿他的年份去比。判据就是这么规定的——
    //   「不知道就是不知道，不拿矛盾的数字去排除任何人」。
    //   不跟着这条走，铣治一个人的矛盾会变成他五个儿子的「错」，
    //   一个错报成六个。矛盾本身记在 ⑧ 上，那才是它该待的地方。
    if (wf?.conflict) continue;
    // ② ③ 生年比较
    if (b && wf?.born) {
      const g = b - wf.born;
      if (g <= 0) hit(p, '②比生父先出生', `${f.name} 生 ${wf.born}，本人生 ${b}`);
      else if (g < MIN_GAP) hit(p, '③父子年龄差不合常理', `${f.name} 生 ${wf.born}，只早 ${g} 年`);
      else if (g > MAX_GAP) hit(p, '③父子年龄差不合常理', `${f.name} 生 ${wf.born}，早了 ${g} 年`);
    }
    // ④ 生在生父殁后
    if (b && wf?.died != null && b > wf.died + 1)
      hit(p, '④生在生父去世之后', `${f.name} 殁 ${wf.died}，本人生 ${b}`);
  }

  // ⑦ 两条以上生父边都留着
  const bio = (KEEP.get(p.pid) ?? []).filter(c => c.edge.kind === '生父');
  // ⑦ 留了多条生父边——**这不是错**，是「不猜」要的结果：
  //   谱上只写了两个字，同名的有好几个，界面上两条都画出来。
  //   单独统计，不计入违反。
  if (bio.length > 1) FORK.push({ p, who: bio.map(c => idx.get(c.edge.parent).name) });
}

// ⑥ 环
for (const p of all) {
  const seen = new Set();
  const walk = (pid) => {
    if (pid === p.pid && seen.size) return true;
    if (seen.has(pid)) return false;
    seen.add(pid);
    for (const c of KEEP.get(pid) ?? []) if (walk(c.edge.parent)) return true;
    return false;
  };
  for (const c of KEEP.get(p.pid) ?? []) if (walk(c.edge.parent)) { hit(p, '⑥成环', ''); break; }
}

const cnt = {};
for (const v of V.values()) for (const k of new Set(v.map(x => x.code))) cnt[k] = (cnt[k] ?? 0) + 1;
console.log('═'.repeat(70));
console.log(`全谱 ${all.length} 人，十条常识／数学检查`);
console.log('');
if (!V.size) console.log('  ✔ 一条都没有违反');
else for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1]))
  console.log(`  ✘ ${String(v).padStart(4)} 人  ${k}`);
console.log(`  · 另有 ${FORK.length} 人留了多条生父边——**这不是错**，`);
console.log('    是「不猜」要的结果，界面上两条都画出来');
console.log('═'.repeat(70));

// 跟「疑点清单」交叉：违反常识的人，是不是都已经在 194 人里？
const flagged = new Set(JSON.parse(
  readFileSync('build/flagged.json', 'utf8').toString() || '[]'));
if (flagged.size) {
  const out = [...V.keys()].filter(pid => !flagged.has(pid));
  console.log(`\n违反常识的人里，**不在疑点清单**上的：${out.length} 人`);
  for (const pid of out.slice(0, 25)) {
    const p = idx.get(pid);
    console.log(`   ${p.name}（第${p.gen}世 ${p.src_human}）`);
    for (const x of V.get(pid)) console.log(`        ${x.code}　${x.detail}`);
  }
}

console.log('\n【逐条举例】');
const byCode = new Map();
for (const [pid, v] of V) for (const x of v)
  (byCode.get(x.code) ?? byCode.set(x.code, []).get(x.code)).push({ p: idx.get(pid), x });
for (const [code, L] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n── ${code}　${L.length} 处`);
  for (const { p, x } of L.slice(0, 4))
    console.log(`   ${p.name}（第${p.gen}世 ${p.src_human}）　${x.detail}`);
  if (L.length > 4) console.log(`   …还有 ${L.length - 4} 处`);
}
