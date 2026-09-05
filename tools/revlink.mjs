/**
 * 历届修谱名目 → 唯一 id。**配一次，写进文件；卡片只读 pid。**
 *
 * ═══ 为什么要有这一步 ═══
 *
 * `data/revisions.json` 里存的是名目上的**名字**（谱名＋字），不是 id。
 * 只要存的是名字，每画一次卡片就得拿字符串重配一次人——於是页面上
 * 长出「认出没认出」「同名的有 N 位」这类话。那是把判定摊到了渲染里。
 *
 * 唯一 id 的规矩是：**题面和答案分两格**。
 *     题面 = 名目原话（name / 字 / raw），谱写的，一个字不改
 *     答案 = pid，判一次，写回文件
 * 跟 `parent_candidates` → `parent_edges`（tools/writeback.mjs）是同一套。
 *
 * ═══ 判据（都是谱自己给的，不是猜） ═══
 *
 *   谱名和字都对上                     → 就是他
 *   只有一样对得上，而那一样全谱唯一   → 就是他
 *       名目写「继荒　字细荒」，条目题作「继珍」——字对上了，全谱只此一位
 *   字同音（「字冬华」↔「字东华」）    → 这一谱同音换字是常事，同样只在唯一时采用
 *   兼祧的人谱上印了好几条             → 先折回同一条再数，那是一个人不是几个候选
 *   剩下的                             → **不判**，写进待核清单交给人
 *
 * ═══ 一道硬闸：年代 ═══
 *
 * **人死了就不能再修谱。** 这不是猜，是谱自己写的两个日期在打架。
 *
 * 名目写「省教研会员承武　字成祥」，全谱只有一位字成祥——可他**殁于 1994 年**，
 * 而这是 2016 那一届的名目。上一版只凭「字全谱唯一」就认了他，
 * 而谱名明明写着「承武」、跟「承祥」对不上。
 *
 * 所以配完还要过这一关：那一届的年份，得落在这个人**活着**的时候。
 * 谱没写生卒的不判（不知道 ≠ 不可能）；写了的就按谱写的算。
 * 年号→公元只在这里用来**排除**，界面上一个字都不换（CLAUDE.md 第四节）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm, homophoneKey } from '../src/core/norm.ts';
import { canonical } from '../src/core/seealso.ts';
import { EraChart } from '../src/core/years.ts';

const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const people = D.people;

const byName = new Map(), byZi = new Map(), byZiHomo = new Map();
const put = (m, k, v) => { if (k) (m.get(k) ?? m.set(k, []).get(k)).push(v); };
for (const q of people) {
  for (const f of new Set([norm(q.name), ...q.aliases.map(a => norm(a.form))])) put(byName, f, q);
  for (const x of [q.zi, q.hui, q.hao, q.ming]) {
    const f = norm(x?.text ?? '');
    put(byZi, f, q);
    if (f) put(byZiHomo, homophoneKey(f), q);
  }
}
const fold = list => {
  const seen = new Map();
  for (const q of list ?? []) { const w = canonical(people, q); if (!seen.has(w.pid)) seen.set(w.pid, w); }
  return [...seen.values()];
};

const CHART = new EraChart(J('erachart'));
const yearOf = (t) => CHART.lookup(t).ad;

/** 这一届修谱的时候，他还活着吗。返回 null＝谱没写，判不了 */
function aliveAt(q, ad) {
  if (ad == null) return null;
  const d = yearOf((q.death ?? {}).text);
  const b = yearOf((q.birth ?? {}).text);
  if (d != null && d < ad) return `殁于 ${d}，修谱在 ${ad}——人已不在`;
  if (b != null && b > ad) return `生于 ${b}，修谱在 ${ad}——尚未出生`;
  return null;
}

function decide(m, ad) {
  const zi = norm(m['字'] ?? '');
  const nm = fold(byName.get(norm(m.name ?? '')));
  const zz = fold(zi ? byZi.get(zi) : []);
  const both = nm.filter(q => zz.some(x => x.pid === q.pid));
  if (both.length === 1) return [both[0], '谱名和字都对上'];
  if (both.length > 1)   return [null, `谱名和字都对上的有 ${both.length} 位`];
  if (zz.length === 1)   return [zz[0], `字「${m['字']}」全谱只此一位`];
  if (nm.length === 1)   return [nm[0], `谱名「${m.name}」全谱只此一位`];
  const homo = fold(zi ? byZiHomo.get(homophoneKey(zi)) : []);
  const bh = nm.filter(q => homo.some(x => x.pid === q.pid));
  if (bh.length === 1)   return [bh[0], `谱名对上，字同音（名目「${m['字']}」／条目「${bh[0].zi?.text ?? ''}」）`];
  if (homo.length === 1) return [homo[0], `字同音，全谱只此一位（名目「${m['字']}」／条目「${homo[0].zi?.text ?? ''}」）`];
  if (nm.length)         return [null, `谱名对上 ${nm.length} 位，字对不上`];
  if (zz.length)         return [null, `字对上 ${zz.length} 位，谱名对不上`];
  return [null, '谱名和字都对不上'];
}

/** 配出人来之后，再过一道年代关。过不去就退回，不硬认。 */
function decideChecked(m, ad) {
  const [q, why] = decide(m, ad);
  if (!q) return [q, why];
  const dead = aliveAt(q, ad);
  if (dead) return [null, `${why}，可${dead}`];
  return [q, why];
}

let hit = 0, miss = [];
for (const r of D.revisions) {
  for (const m of r.members) {
    const [q, why] = decideChecked(m, yearOf(r.era + '年'));
    delete m.candidates;                 // 旧文件里的候选表，不再有
    delete m.gen;
    if (q) { m.pid = q.pid; m.match = why; m.gen = q.gen; hit++; }
    else { delete m.pid; m.match = why; miss.push({ era: r.era, ...m }); }
  }
}
writeFileSync(new URL('../data/revisions.json', import.meta.url),
  JSON.stringify(D.revisions, null, 1), 'utf8');

const tot = D.revisions.reduce((s, r) => s + r.members.length, 0);
console.log(`历届修谱名目 ${tot} 人 → 定到唯一 id 的 ${hit} 人，交人工的 ${miss.length} 人\n`);
for (const m of miss) console.log(`  ${m.era}　${m.raw}　—— ${m.match}`);
writeFileSync(new URL('../work/名目待核.json', import.meta.url),
  JSON.stringify(miss, null, 1), 'utf8');
console.log(`\n待核清单写入 work/名目待核.json`);
