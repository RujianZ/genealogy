/**
 * **待核清单**——我判不了、或判了但想请人复核的，全部列出来。
 *
 * 由当前数据生成，不是手写：随时重跑，清单跟着系统走，不会漂移。
 * 每条都带：谁、谱上写了什么、我判成什么、凭什么、**怎么回原书核**。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm, loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const T = JSON.parse(readFileSync(new URL('../work/台账.json', import.meta.url), 'utf8'));
const NS = s => norm(String(s ?? ''));
const flat = s => String(s ?? '').replace(/[\s　]+/g, '');
const page = p => `python tools/page.py ${p.src.vol} ${p.src.page}`;
const L = [];
const P = (...x) => L.push(...x);

P('# 待核清单', '',
  '我判不了、或判了但想请人复核的，全在这里。**由数据生成**（`node --experimental-strip-types tools/todo.mjs`），',
  '随时重跑，跟系统状态一致。',
  '',
  '每条都写清楚：谱上写了什么、我判成什么、凭什么、怎么回原书核。',
  '已经核定的在 `work/谱面勘误.md`；核对过程在 `work/人工核对记录.md`。', '');

// ── 一、谱确实没写 ─────────────────────────────────
P('## 一、谱确实没写父亲（' + T.谱没写父亲.length + ' 人）', '',
  '这不是我们判不出，是谱本来就没写。列出来是让你确认「确实没写」。', '');
for (const r of T.谱没写父亲) {
  const p = R.idx.get(r.pid);
  P(`- **${r.gen}世 ${r.name}**　${r.src}`,
    `  - 谱上写的：${p.father_name ? `「${p.father_name}${p.filiation}」` : '（这一条没有行次句）'}`,
    `  - 原文：${flat(p.raw_text).slice(0, 60)}`,
    `  - 核：\`${page(p)}\``);
}
P('');

// ── 二、靠定式定的（不是谱的原话）───────────────────
const L2 = T.靠定式定的.map(r => ({ r, p: R.idx.get(r.pid) })).filter(x => x.p);
const rosterOK = x => {
  const ps = R.parents(x.p);
  return [...ps.birth, ...ps.heir].some(c => {
    const d = R.idx.get(c.edge.parent);
    return d && (d.sons_claimed ?? []).some(s => NS(s) === NS(x.p.name)
      || x.p.aliases.some(a => NS(a.form) === NS(s)));
  });
};
const twoSided = L2.filter(rosterOK), layoutOnly = L2.filter(x => !rosterOK(x));
P('## 二、靠谱的「定式」定的（' + L2.length + ' 人）', '',
  '定式＝谱自己的排版规矩（儿子印在父亲正下一格／同房唯一／行内前后夹选）。',
  '**不是谱的原话**，所以列出来。', '',
  `### 2.1 其中 ${twoSided.length} 人，父亲的生子名单里其实点了他的名`, '',
  '定式只用来「在几位同名者里挑一位」，挑中的那位名单里有他——**两头对上，实际是原话双记**。',
  '风险低，但挑的那一步不是原话。', '');
for (const x of twoSided) {
  const ps = R.parents(x.p);
  P(`- **${x.r.gen}世 ${x.r.name}**　谱写「${x.p.father_name || '（没写父名）'}${x.p.filiation}」→ 判为 ${ps.birth.map(c => c.person?.name).join('、') || '—'}`,
    `  - 依据：${x.r.依据}`,
    `  - 核：\`${page(x.p)}\``);
}
P('', `### 2.2 另 ${layoutOnly.length} 人，名单没点名，**只有版面撑着**`, '',
  '这几位我逐个看过谱面，但只有一处证据。**最该请你复核的就是这几个。**', '');
for (const x of layoutOnly) {
  const ps = R.parents(x.p);
  P(`- **${x.r.gen}世 ${x.r.name}**　谱写「${x.p.father_name || '（没写父名）'}${x.p.filiation}」→ 判为 ${[...ps.birth, ...ps.heir].map(c => c.person?.name).join('、') || '—'}`,
    `  - 依据：${x.r.依据}`,
    `  - 原文：${flat(x.p.raw_text).slice(0, 70)}`,
    `  - 核：\`${page(x.p)}\``);
}
P('');

// ── 三、原话判了但版面/房支对不上 ─────────────────
P('## 三、原话判了，但版面或房支对不上（' + T.谱自己对不上.length + ' 人）', '',
  '本人写的父名与判定一致（多数名单也点了名），但谱的排版或分房与之不合。',
  '我逐条看过：绝大多数是**谱面自己印错了辈字或页眉**，关系无误。列出来供复核。', '');
for (const r of T.谱自己对不上) {
  const p = R.idx.get(r.pid); if (!p) continue;
  P(`- **${r.gen}世 ${r.name}**　谱写「${p.father_name || '（没写父名）'}${p.filiation}」→ 生父 ${r.生父 || '—'}${r.嗣父 ? '／嗣父 ' + r.嗣父 : ''}`,
    `  - 对不上的是：欧式${r.欧式} · 房支${r.房支}${(r.矛盾 ?? []).length ? '　' + r.矛盾.join('；').slice(0, 90) : ''}`,
    `  - 核：\`${page(p)}\``);
}
P('');
writeFileSync(new URL('../work/待核清单.md', import.meta.url), L.join('\n'), 'utf8');
console.log(`写出 work/待核清单.md —— 谱没写 ${T.谱没写父亲.length} · 靠定式 ${L2.length}（其中只有版面撑着 ${layoutOnly.length}）· 有冲突 ${T.谱自己对不上.length}`);
