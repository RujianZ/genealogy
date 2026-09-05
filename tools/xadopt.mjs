/**
 * 过继原话 ←→ 判定结果 交叉验证。
 *
 * 谱记过继是**双记**的：孩子那一条写「壁介嗣子」，父亲那一条写「立…为嗣」。
 * 解析器的 MARKS 只认得其中一部分形状，另一些落进了「认不出」。
 * 这里不去加规则，而是把**两头**都摆出来对一遍：
 *   谱里每一句过继原话，判定层是不是给出了同一条边？
 * 对上 → 这条原话是冗余确认，落在哪个桶里都不影响结论。
 * 对不上 → 才是真漏，要人工看。
 */
import { readFileSync, readdirSync } from 'node:fs';
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

// 谱里所有过继原话（不限于认不出的那些）——从 raw_text 直接扫
const RE = /(立[\u4e00-\u9fff]{1,14}?为[嗣子]|出[继嗣][\u4e00-\u9fff]{0,10}|承祧|兼祧|承嗣|过继[\u4e00-\u9fff]{0,10}|抚[\u4e00-\u9fff]{1,8}为子)/g;
// 句子里出现的人名（两字，且在名单里确实是个人）
const known = new Set(D.people.map(p => bare(p.name)).filter(n => n.length === 2));

// 判定层的全部嗣边，按名字对存一份
const heirPairs = new Set();        // `子|父`
const kidsOf = new Map();           // 父pid → 子名[]
for (const c of D.people) {
  const ps = R.parents(c);
  for (const e of ps.heir) heirPairs.add(bare(c.name) + '|' + bare(e.person?.name));
  for (const e of [...ps.birth, ...ps.heir]) {
    if (!kidsOf.has(e.edge.parent)) kidsOf.set(e.edge.parent, []);
    kidsOf.get(e.edge.parent).push(bare(c.name));
  }
}

let n = 0, ok = 0, none = 0;
const miss = [];
for (const p of D.people) {
  // ★ 谱把一句话拆成几行印（「次子士礼出嗣二／兄学虎」），
  //   逐行读会把句子截断、把对的报成错的。整条接起来再按命中处取窗。
  const whole = norm(String(p.raw_text ?? '').replace(/[\s　]+/g, ''));
  const sents = [];
  for (const m of whole.matchAll(RE))
    sents.push(whole.slice(Math.max(0, m.index - 8), m.index + m[0].length + 14));
  for (const t of sents) {
    const names = [];
    for (let i = 0; i + 2 <= t.length; i++) { const s = t.slice(i, i + 2); if (known.has(s)) names.push(s); }
    if (!names.length) { none++; continue; }
    n++;
    // 这句话的「关系圈」：本人 ＋ 本人的子女 ＋ 句中点到的人
    // 「次子啟昌出嗣朝阳」写在朝相条里，断言的是**启昌**的边，
    // 所以圈里必须带上子女，否则一律误报。
    const circle = new Set([bare(p.name), ...names, ...(kidsOf.get(p.pid) ?? [])]);
    let hit = false;
    for (const pr of heirPairs) {
      const [c, f] = pr.split('|');
      if (circle.has(c) && circle.has(f)) { hit = true; break; }
    }
    if (hit) ok++;
    else miss.push({ who: `${p.gen}世 ${p.name}`, src: p.src_human, t, names: names.join('、'),
                     circle: [...circle].join('、') });
  }
}
console.log(`谱上过继类原话 ${n + none} 句：${none} 句没点到具体人名（如「出嗣」「承祧」单写），${n} 句点了名`);
console.log(`  其中 ${ok} 句与判定的嗣边对得上`);
console.log(`  对不上 ${miss.length} 句：\n`);
for (const m of miss) console.log(`   ${m.who}　「${m.t}」\n      关系圈：${m.circle}\n      ${m.src}`);
