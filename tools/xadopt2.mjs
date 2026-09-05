/** 对不上的那些，逐条摊开：句里点名的那个孩子，现在判给了谁。 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const bare = s => norm(s ?? '').replace(/公$/, '');
const RE = /(立[\u4e00-\u9fff]{1,14}?为[嗣子]|出[继嗣][\u4e00-\u9fff]{0,10}|承祧|兼祧|承嗣|过继[\u4e00-\u9fff]{0,10}|抚[\u4e00-\u9fff]{1,8}为子)/g;
const known = new Set(D.people.map(p => bare(p.name)).filter(n => n.length === 2));
const byName = new Map();
for (const p of D.people) { const k = bare(p.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }

const heirPairs = new Set(); const kidsOf = new Map();
for (const c of D.people) { const ps = R.parents(c);
  for (const e of ps.heir) heirPairs.add(bare(c.name) + '|' + bare(e.person?.name));
  for (const e of [...ps.birth, ...ps.heir]) { if (!kidsOf.has(e.edge.parent)) kidsOf.set(e.edge.parent, []); kidsOf.get(e.edge.parent).push(bare(c.name)); } }

const show = p => { const ps = R.parents(p);
  const f = ps.birth.map(e => `生父${e.person?.name}`).concat(ps.heir.map(e => `嗣父${e.person?.name}`));
  return `${p.gen}世 ${p.name}（${p.src_human}）→ ${f.join('／') || '无父边'}`; };

let i = 0;
  // ★ 谱把一句话拆成几行印（「次子士礼出嗣二／兄学虎」），
  //   逐行读会把句子截断、把对的报成错的。整条接起来再按命中处取窗。
  const whole = norm(String(p.raw_text ?? '').replace(/[\s　]+/g, ''));
  const sents = [];
  for (const m of whole.matchAll(RE))
    sents.push(whole.slice(Math.max(0, m.index - 8), m.index + m[0].length + 14));
  for (const t of sents) {
  const t = norm(ln.replace(/[\s　]+/g, ''));
  if (!RE.test(t)) { RE.lastIndex = 0; continue; } RE.lastIndex = 0;
  const names = []; for (let j = 0; j + 2 <= t.length; j++) { const s = t.slice(j, j + 2); if (known.has(s)) names.push(s); }
  if (!names.length) continue;
  const circle = new Set([bare(p.name), ...names, ...(kidsOf.get(p.pid) ?? [])]);
  let hit = false; for (const pr of heirPairs) { const [c, f] = pr.split('|'); if (circle.has(c) && circle.has(f)) { hit = true; break; } }
  if (hit) continue;
  console.log(`\n【${++i}】${p.gen}世 ${p.name}　${p.src_human}\n     原话「${t}」`);
  console.log(`     写这话的人自己：${show(p)}`);
  console.log(`     他的生子名单：${(p.sons_claimed ?? []).join('、') || '（无）'}`);
  for (const nm of [...new Set(names)]) {
    const cands = byName.get(nm) ?? [];
    console.log(`     句中「${nm}」：${cands.length} 位` + (cands.length ? '' : '（谱里没有独立条目）'));
    for (const c of cands) console.log(`        ${show(c)}`);
  }
}
