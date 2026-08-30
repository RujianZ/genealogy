/**
 * 交叉检验：我们定下来的每一条父子关系，拿**谱上别处独立的说法**去对。
 *
 * 关系网是有冗余的，同一件事谱上写了好几遍：
 *     ① 父亲那条的「生子N：…」名单里有没有他
 *     ② 他自己那条写的父名对不对得上
 *     ③ 排行——写「三子」，就该排在名单第三位
 *     ④ 「生子N」那个数字，和最后连上的儿子数对不对得上
 *     ⑤ 年代——父亲得比他早 13–75 年
 *     ⑥ 版面——谱把父子印在相邻的格子里
 *     ⑦ 兄弟的排行合起来该是 1…N，不重不缺
 *
 * 判对了，这些说法互相印证；判错了，总有一处会对不上。
 * **这份脚本只报不改。哪条红了就是哪条要回去看。**
 */
import { readFileSync } from 'node:fs';
import { buildIndex, childrenOf } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, canFather } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { roster } from '../src/core/roster.ts';
import { isFragment } from '../src/core/fragment.ts';
import { norm } from '../src/core/norm.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };
const ORD = { 长: 1, 元: 1, 次: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const ordOf = f => {
  const t = norm(f ?? '');
  if (!t) return null;
  if (t.startsWith('幼')) return -1;
  return ORD[t[0]] ?? null;
};
const coord = pid => {
  const m = /^P-(册\d+)-(\d+)-(\d+)-/.exec(pid);
  return m ? { vol: m[1], page: +m[2], row: +m[3] } : null;
};

const C = new Map();
for (const p of people) C.set(p.pid, candidates(idx, p, chart, win));
/** 定下来的：同一种关系里只剩一个 ok */
function settled(p) {
  const by = new Map();
  for (const c of C.get(p.pid)) {
    if (c.status !== 'ok') continue;
    if (!by.has(c.edge.kind)) by.set(c.edge.kind, []);
    by.get(c.edge.kind).push(c);
  }
  const out = [];
  for (const [kind, cs] of by) if (cs.length === 1) out.push({ kind, c: cs[0] });
  return out;
}
/** 这条边是被哪条规则定下来的（其余候选的排除理由） */
function decidedBy(p) {
  const s = new Set(C.get(p.pid).filter(c => c.status !== 'ok').map(c => c.status));
  return [...s].join('+') || '本来就只有一个候选';
}

let n = 0;
const fail = { 名单: [], 父名: [], 排行: [], 生子数: [], 年代: [], 世次: [] };
const byRule = new Map();

for (const p of people) {
  if (isFragment(p)) continue;
  for (const { kind, c } of settled(p)) {
    if (kind !== '生父') continue;
    n++;
    const f = c.person;
    if (!f) continue;
    const rule = decidedBy(p);
    if (!byRule.has(rule)) byRule.set(rule, { n: 0, bad: 0 });
    const stat = byRule.get(rule);
    stat.n++;
    let bad = false;

    // ★ **只用跟定案规则无关的检验。**
    //   靠「兄弟连排／立某某为嗣／本人写的父名」定下来的边，本来就是因为
    //   名单里没点他的名才需要用别的办法——再拿「名单里有没有他」去检验它，
    //   等于用「他不在名单里」否定「他不在名单里所以我们换了办法」。
    //   那不是检验，是循环。
    const usedSib = rule.includes('sib');
    const usedAdopt = rule.includes('adopt');
    const usedWrote = rule.includes('wrote');
    const listIsEvidence = !(usedSib || usedAdopt);

    // ① 名单
    const sons = roster(f).sons.map(s => norm(s.name || s.raw));
    const me = [norm(p.name), ...p.aliases.map(a => norm(a.form))];
    const inList = sons.some(s => me.includes(s));
    if (listIsEvidence && sons.length && !inList) { fail.名单.push({ p, f, rule }); bad = true; }

    // ② 父名
    // ★ 谱第 15 世的写法：页眉称「梦林公长子」，父亲自己那条写「林 公」。
    //   去掉敬称「公」之后，一个是另一个的后缀就算对上——
    //   backlink.ts 存在的全部理由就是这个，检验里不带上它，
    //   会假报 100 多条「父名对不上」。
    // ★ 过继的人不能用这一条检验生父边：他自己那条写的是**嗣父**。
    //   光远写「梁木公嗣子」，而生父是梁必——梁木那条写着
    //   「立胞弟梁必次子光远为嗣」。两个名字本来就不该相同。
    const heir = p.is_heir || /嗣|祧|承继/.test(p.filiation ?? '')
      || /嗣|祧/.test((p.raw_text ?? '').split('\n')[1] ?? '');
    if (p.father_name && !usedWrote && !heir) {
      const strip = s => norm(s ?? '').replace(/公$/, '');
      const w = strip(p.father_name);
      const forms = [strip(f.name), ...(f.aliases ?? []).map(a => strip(a.form))];
      const fit = forms.some(x => x && w && (x === w || w.endsWith(x) || x.endsWith(w)));
      if (!fit) { fail.父名.push({ p, f, rule }); bad = true; }
    }

    // ③ 排行
    const o = ordOf(p.filiation);
    if (o != null && inList) {
      const i = sons.findIndex(s => me.includes(s));
      const want = o === -1 ? sons.length : o;
      if (i + 1 !== want) { fail.排行.push({ p, f, rule, at: i + 1, want }); bad = true; }
    }

    // ⑤ 年代
    const a = canFather(win.get(f.pid), win.get(p.pid));
    if (!a.ok) { fail.年代.push({ p, f, rule, why: a.text }); bad = true; }

    // ⑥ 世次
    if (f.gen != null && p.gen != null && p.gen - f.gen !== 1) {
      fail.世次.push({ p, f, rule }); bad = true;
    }
    if (bad) stat.bad++;
  }
}

// ④ 生子N
for (const f of people) {
  if (isFragment(f)) continue;
  const t = norm(f.raw_text ?? '');
  const said = [...t.matchAll(/生子([一二三四五六七八九十两])/g)]
    .reduce((a, m) => a + (NUM[m[1]] ?? 0), 0);
  if (!said) continue;
  const kids = childrenOf(people, f.pid).filter(k =>
    !isFragment(k.child) && C.get(k.child.pid).some(c => c.edge === k.edge && c.status === 'ok')
    && k.edge.kind === '生父');
  if (kids.length > said) fail.生子数.push({ f, said, got: kids.length });
}

const pct = (a, b) => b ? `${(a / b * 100).toFixed(2)}%` : '—';
console.log(`定下来的生父边：${n} 条\n`);
console.log('══ 拿谱上别处的说法去对，对不上的 ══');
for (const [k, v] of Object.entries(fail)) {
  console.log(`  ${k.padEnd(5)}${String(v.length).padStart(5)} 条　${pct(n - v.length, n)} 对得上`);
}
const anyBad = new Set();
for (const v of Object.values(fail)) for (const x of v) if (x.p) anyBad.add(x.p.pid);
console.log(`\n  至少一处对不上的人：${anyBad.size} 人（${pct(n - anyBad.size, n)} 全部对得上）`);

console.log('\n══ 按「这条边是靠哪条规则定的」分 ══');
for (const [k, v] of [...byRule].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(v.n).padStart(5)} 条　对不上 ${String(v.bad).padStart(3)}　`
    + `${pct(v.n - v.bad, v.n)} 干净　${k}`);
}

for (const [k, v] of Object.entries(fail)) {
  if (!v.length) continue;
  console.log(`\n── ${k}对不上的，前 6 例 ──`);
  for (const x of v.slice(0, 6)) {
    if (x.p) {
      console.log(`  ${x.p.name}（第${x.p.gen}世 ${x.p.src_human.split('·').slice(1).join('·')}）`
        + ` → ${x.f.name}　靠「${x.rule}」定的`
        + (x.at ? `　谱写「${x.p.filiation}」该排第 ${x.want}，实际第 ${x.at}` : '')
        + (x.why ? `　${x.why}` : ''));
    } else {
      console.log(`  ${x.f.name}（${x.f.src_human.split('·').slice(1).join('·')}）`
        + `　谱写生子 ${x.said}，连上 ${x.got}`);
    }
  }
}

// ── 按规则逐条列出对不上的，供人工核 ──
const want = process.argv[2];
if (want) {
  console.log(`\n${'═'.repeat(60)}\n靠「${want}」定的边里，对不上的每一条：`);
  for (const [k, v] of Object.entries(fail)) {
    for (const x of v) {
      if (!x.p || !x.rule?.includes(want)) continue;
      console.log(`  [${k}] ${x.p.name}（第${x.p.gen}世 ${x.p.src_human.split('·').slice(1).join('·')}）`
        + ` → ${x.f.name}（${x.f.src_human.split('·').slice(1).join('·')}）`
        + (x.at ? `　谱写「${x.p.filiation}」该第 ${x.want}，实际第 ${x.at}` : '')
        + (x.why ? `　${x.why}` : ''));
    }
  }
}
