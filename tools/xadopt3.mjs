/** 27 句里，孩子到底有没有嗣父——分「异写假警报」和「真没有」。 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm, loadTables } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'), classes: J('分类') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
const R = makeRegistry(D);
const bare = s => norm(s ?? '').replace(/公$/, '');
const RE = /(立[\u4e00-\u9fff]{1,14}?为[嗣子]|出[继嗣][\u4e00-\u9fff]{0,10}|承祧|兼祧|承嗣|过继[\u4e00-\u9fff]{0,10}|抚[\u4e00-\u9fff]{1,8}为子)/g;
const known = new Set(D.people.map(p => bare(p.name)).filter(n => n.length === 2));
const heirPairs = new Set(); const kidsOf = new Map();
for (const c of D.people) { const ps = R.parents(c);
  for (const e of ps.heir) heirPairs.add(bare(c.name) + '|' + bare(e.person?.name));
  for (const e of [...ps.birth, ...ps.heir]) { if (!kidsOf.has(e.edge.parent)) kidsOf.set(e.edge.parent, []); kidsOf.get(e.edge.parent).push(c); } }

// 「出嗣」句里被点名的那个孩子：先在句中找，找不到就按行次去父亲的名单里数
const ORD = '长次三四五六七八九十幼元';
const A = [], B = [], C = [];
for (const p of D.people) {
  const whole = norm(String(p.raw_text ?? '').replace(/[\s　]+/g, ''));
  for (const m of whole.matchAll(RE)) {
    const t = whole.slice(Math.max(0, m.index - 8), m.index + m[0].length + 14);
    const names = []; for (let j = 0; j + 2 <= t.length; j++) { const s = t.slice(j, j + 2); if (known.has(s)) names.push(s); }
    if (!names.length) continue;
    const circle = new Set([bare(p.name), ...names, ...(kidsOf.get(p.pid) ?? []).map(x => bare(x.name))]);
    let hit = false; for (const pr of heirPairs) { const [c, f] = pr.split('|'); if (circle.has(c) && circle.has(f)) { hit = true; break; } }
    if (hit) continue;
    // 句中提到的、且是本人子女的那位 —— 就是被过继出去的孩子
    const mine = (kidsOf.get(p.pid) ?? []).filter(k => names.includes(bare(k.name)));
    const ordCh = new RegExp(`([${ORD}])子出[\u7ee7\u55e3]`).exec(t);
    const row = { p, t, mine, ord: ordCh?.[1] ?? '' };
    if (!mine.length) C.push(row);                       // 句里没点到本人的孩子
    else if (mine.some(k => R.parents(k).heir.length)) A.push(row);   // 孩子已有嗣父
    else B.push(row);                                     // 孩子确实没有嗣父
  }
}
const show = (t, rows) => { console.log(`\n【${t}】${rows.length} 句`);
  for (const r of rows) { console.log(`   ${r.p.gen}世 ${r.p.name}　「${r.t}」　${r.p.src_human}`);
    for (const k of r.mine) { const h = R.parents(k).heir.map(x => x.person?.name).join('、');
      console.log(`       孩子 ${k.name}（${k.pid}）嗣父：${h || '（无）'}`); }
    if (!r.mine.length) console.log(`       句里没点到他名下的孩子${r.ord ? `，只写了行次「${r.ord}子」` : ''}`); } };
show('A 孩子已经有嗣父 —— 多半是父名异写，句子说的是同一件事', A);
show('B 孩子没有任何嗣父 —— 真漏', B);
show('C 句里没点到他名下的孩子 —— 要回谱面看', C);
