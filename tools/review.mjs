/**
 * 196 人逐个复核用的摊开工具。按疑点类别分组，每个人把「判这件事需要的东西」全列出来：
 * 本人原文、认定的父亲、候选、年代、同名的都有谁、要翻的书和页码。
 *
 * 用法：node --experimental-strip-types tools/review.mjs <类别关键字> [起] [止]
 *   类别关键字：子女栏 父名 生子N 同名 年代 嗣子 配偶
 */
import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { roster } from '../src/core/roster.ts';
import { fname } from '../src/core/fname.ts';

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const bare = (s) => fname(s).replace(/公$/, '');
const forms = (p) => [bare(p.name), ...p.aliases.map(a => bare(a.form))];
const all = people.filter(p => !isFragment(p));
const NUM = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,两:2 };
const RAW = (p) => (p.raw_text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
const DOC = (p) => {
  const n = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 }[p.src?.juan ?? ''] ?? 0;
  return n >= 8 ? '合三（8、9）' : n >= 5 ? '合二（5、6、7）' : '合一（1.2.3.4）';
};
const W = (p) => windowNote(win.get(p.pid)) || '年代不知道';

const KEEP = new Map(), KIDS = new Map(), NDAD = new Map();
for (const p of all) {
  const k = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
  KEEP.set(p.pid, k);
  const bio = k.filter(c => c.edge.kind === '生父');
  NDAD.set(p.pid, (bio.length ? bio : k).length);
  for (const c of k)
    (KIDS.get(c.edge.parent) ?? KIDS.set(c.edge.parent, []).get(c.edge.parent))
      .push({ child: p, edge: c.edge });
}

// ── 分组
const G = { 子女栏: [], 父名: [], 生子N: [], 同名: [], 年代: [], 嗣子: [], 配偶: [] };
for (const f of all) {
  const ks = KIDS.get(f.pid) ?? [], kbio = ks.filter(k => k.edge.kind === '生父');
  const byN = new Map();
  for (const k of kbio) { const n = bare(k.child.name); (byN.get(n) ?? byN.set(n, []).get(n)).push(k.child); }
  let dup = [...byN].filter(([, v]) => v.length > 1);
  const weak = kbio.filter(k => (NDAD.get(k.child.pid) ?? 1) > 1);
  const r = roster(f), dec = r.sons.length + r.daughters.length;
  const over = dec && new Set(kbio.map(k => k.child.pid)).size > dec;
  if (dup.length || weak.length || over) G.子女栏.push({ f, dup, weak, over, dec, kbio });

  const keep = KEEP.get(f.pid) ?? [];
  const bio = keep.filter(c => c.edge.kind === '生父');
  const line = bio.length ? bio : keep;
  if (line.length === 1) {
    const d = idx.get(line[0].edge.parent);
    const named = d && roster(d).sons.some(x => forms(f).includes(bare(x.name || x.raw)));
    const wrote = d && !!bare(f.father_name) && forms(d).includes(bare(f.father_name));
    const stated = d && /[立以][^，。；、]{0,14}?(?:为嗣|為嗣|承嗣|入嗣|为祧|為祧|祧)/.test(
      (d.raw_text || '').replace(/[\s　]/g, ''))
      && forms(f).some(x => (d.raw_text || '').replace(/[\s　]/g, '').includes(x));
    if (!named && !wrote && !stated) G.同名.push({ f, d });
  }
  if (bare(f.father_name) && keep.length
      && !keep.some(c => forms(idx.get(c.edge.parent)).includes(bare(f.father_name))))
    G.父名.push({ f, keep });
  if (/嗣子|祧子|嗣男/.test(f.filiation || '') && !keep.some(c => c.edge.kind.includes('嗣')))
    G.嗣子.push({ f, keep });
  let want = 0, saw = false;
  for (const m of (f.raw_text ?? '').matchAll(/生子([一二三四五六七八九十两])/g)) { want += NUM[m[1]]; saw = true; }
  if (saw && want && roster(f).sons.filter(x=>!x.adopted).length !== want) G.生子N.push({ f, want, got: roster(f).sons });
  if ((KEEP.get(f.pid) ?? []).length && candidates(idx, f, chart, win).some(c => c.conflict)
      || win.get(f.pid)?.conflict) G.年代.push({ f });
  for (const s of f.spouses ?? []) {
    const sb = chart.lookup(s.birth?.text).ad, sd = chart.lookup(s.death?.text).ad;
    if (sb && sd && sd < sb) G.配偶.push({ f, s, sb, sd });
  }
}

const key = process.argv[2] ?? '';
const from = +(process.argv[3] ?? 0), to = +(process.argv[4] ?? 999);
if (!key) {
  for (const [k, v] of Object.entries(G)) console.log(`${k.padEnd(6)} ${v.length} 人`);
  process.exit(0);
}
const L = G[key] ?? [];
console.log(`【${key}】共 ${L.length} 人，显示 ${from}–${Math.min(to, L.length)}\n`);
L.slice(from, to).forEach((x, i) => {
  const f = x.f;
  console.log('─'.repeat(72));
  console.log(`[${from + i}] ${f.name}　第${f.gen}世　${f.src_human}　第${f.src.row}行${f.src.col}列`);
  console.log(`     ${W(f)}　　谱写父名「${f.father_name || '空'}${f.filiation || ''}」`
    + `　father_src=${f.father_src || '空'}`);
  console.log(`     书：source/${DOC(f)}.doc 第 ${f.src.page} 页`);
  console.log(`     原文：${RAW(f).join(' ｜ ')}`);
  const keep = KEEP.get(f.pid) ?? [];
  console.log(`     留下的父：${keep.map(c => {
    const d = idx.get(c.edge.parent);
    return `${d.name}(${d.src.page}页${d.src.row}行,${c.edge.kind},rank${c.edge.rank},${W(d)})`;
  }).join('　') || '无'}`);
  if (x.dup?.length) for (const [n, v] of x.dup)
    console.log(`     ✘同名重挂「${n}」×${v.length}：${v.map(c => `${c.name}(${c.src.page}页${c.src.row}行,${W(c)})`).join('　')}`);
  if (x.weak?.length) console.log(`     ✘弱挂：${x.weak.map(k => `${k.child.name}(自己有${NDAD.get(k.child.pid)}个候选父)`).join('　')}`);
  if (x.over) console.log(`     ✘超额：谱写 ${x.dec} 个，摆出 ${new Set(x.kbio.map(k => k.child.pid)).size} 个`);
  if (x.want) console.log(`     ✘生子${x.want}，读出 ${x.got.length} 个：${x.got.map(s => s.raw.replace(/\s/g, '')).join('、')}`);
  if (x.s) console.log(`     ✘配偶「${x.s.name_raw}」生${x.sb} 殁${x.sd}`);
  if (x.d) console.log(`     ✘父亲「${x.d.name}」两边都没写过这层关系`
    + `　他的生子名单：${roster(x.d).sons.map(s => s.name || s.raw).join('、') || '空'}`);
});
