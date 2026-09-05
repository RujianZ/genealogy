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
import { norm, homophoneKey, editDistance, loadTables } from '../src/core/norm.ts';
import { canonical } from '../src/core/seealso.ts';
import { EraChart } from '../src/core/years.ts';

const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'),
  prefaces: J('prefaces'), tables: J('字表'), manual: J('人工判定'), sameone: J('同一个人'), classes: J('分类') };
// ★ 字表先灌——core 里的 norm() 一开始是空表，灌之前折不出东西来。
loadTables(D.tables);
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
  // ★ 头衔也是钥匙，而且常常是最硬的一把。
  //   名目写「**省教研会员**承武　字成祥」，承武@册4 p50 的条目原文写着
  //   「**省教研会员**六一年黄石大学毕业高中高级教师」——全谱只有他一个人
  //   带这个头衔，两处一字不差。
  //   名目早就把头衔解析成 title 了（TITLES 表里就有），只是配人时没用上。
  //   这不是新规则，是把已有的一把钥匙拿起来。
  if (m.title) {
    const t = norm(m.title);
    const byTitle = fold(people.filter(q =>
      norm((q.raw_text ?? '').replace(/[\s　]+/g, '')).includes(t)));
    if (byTitle.length === 1) {
      const q = byTitle[0];
      const nameOK = !m.name || norm(m.name) === norm(q.name)
        || (q.aliases ?? []).some(a => norm(a.form) === norm(m.name));
      if (nameOK) return [q, `头衔「${m.title}」全谱只此一位，谱名也对得上`];
    }
  }
  if (both.length === 1) return [both[0], '谱名和字都对上'];
  if (both.length > 1)   return [null, `谱名和字都对上的有 ${both.length} 位`];
  if (zz.length === 1)   return [zz[0], `字「${m['字']}」全谱只此一位`];
  // ★ 名目给了字，而这一位的字**另有其字**——那是谱在说「不是他」，
  //   不能再拿「谱名全谱只此一位」硬认。
  //   道光五那一届名目里四个「士成」，字分别是登甲、文德、灼桃、上庆
  //   ——四个人。旧规则把后两个也认给了字登甲那一位，
  //   等于说一个人同时字登甲、字文德、字灼桃。
  //   ★ 但**一字之差不算**。谱在卷首和世系里同一个字常写得不一样：
  //     笃生／笃牲 · 默齐／默济 · 怀茂／怀懋 · 连钧／运钧 · 耀宗／宗耀（前后颠倒）
  //     ——那是异写，是同一位。差两个字以上才是谱在说「不是他」。
  const near = (a, b) => {
    if (a === b) return true;
    if (a.length === b.length && [...a].sort().join('') === [...b].sort().join('')) return true;
    return editDistance(a, b) <= 1;
  };
  //   ★ 号/名/讳 里已经有一样**精确**对上时，字对不上不算数。
  //     「国学生　号汝臣　讳文彪　字逵达」→ 光先（讳文彪／号汉臣／字达连）：
  //     讳一字不差，那就是他；号差一字、字写法不同，都是卷首与世系的异写。
  const otherHit = (q) => {
    const his = [q.name, q.zi?.text, q.hui?.text, q.hao?.text, q.ming?.text]
      .filter(Boolean).map(x => norm(String(x)));
    return ['号', '名', '讳'].some(k => m[k] && his.includes(norm(m[k])));
  };
  const ziClash = (q) => {
    if (!zi || otherHit(q)) return false;
    const his = [q.zi, q.hui, q.hao, q.ming].filter(Boolean).map(x => norm(x.text));
    return his.length > 0 && !his.some(h => near(h, zi));
  };
  if (nm.length === 1 && !ziClash(nm[0]))
    return [nm[0], `谱名「${m.name}」全谱只此一位`];
  if (nm.length === 1)
    return [null, `谱名「${m.name}」全谱只此一位，可他字作「${
      [nm[0].zi, nm[0].hui, nm[0].hao, nm[0].ming].filter(Boolean).map(x => x.text).join('／')
    }」，跟名目写的「${m['字']}」不是一个人`];
  const homo = fold(zi ? byZiHomo.get(homophoneKey(zi)) : []);
  const bh = nm.filter(q => homo.some(x => x.pid === q.pid));
  if (bh.length === 1)   return [bh[0], `谱名对上，字同音（名目「${m['字']}」／条目「${bh[0].zi?.text ?? ''}」）`];
  if (homo.length === 1) return [homo[0], `字同音，全谱只此一位（名目「${m['字']}」／条目「${homo[0].zi?.text ?? ''}」）`];
  if (nm.length)         return [null, `谱名对上 ${nm.length} 位，字对不上`];
  if (zz.length)         return [null, `字对上 ${zz.length} 位，谱名对不上`];
  return [null, '谱名和字都对不上'];
}

/** 配出人来之后，再过一道年代关。过不去就退回，不硬认。 */
// 辈字 → 世次。谱自己排的字辈（data/generations.json 从世次列头数出来），
// 名目写「继祐」，「继」就是第 25 世——这是谱给的第三把钥匙。
const GEN_BY_CHAR = new Map();
for (const g of J('generations')) if (g.char && g.rate >= 90) GEN_BY_CHAR.set(g.char, g.gen);

function decideChecked(m, ad) {
  const [q, why] = decide(m, ad);
  if (!q) return [q, why];
  // ★ 名字头一个字是辈字的，世次就定死了；对不上就不是他。
  // 只有**裸名**（谱名）才能查辈字。名目写的号/名/讳不是谱名，
  // 「号盘山 名文炳 字肇铭」里的文炳是讳，拿去查会得出「文＝第2世」。
  const bz = m.name_is_bare ? GEN_BY_CHAR.get(norm(m.name ?? '').slice(0, 1)) : null;
  if (bz != null && q.gen != null && q.gen !== bz)
    return [null, `${why}，可名目写「${m.name}」——「${norm(m.name).slice(0, 1)}」是第 ${bz} 世的辈字，`
                + `而他是第 ${q.gen} 世`];
  const dead = aliveAt(q, ad);
  if (dead) return [null, `${why}，可${dead}`];
  return [q, why];
}

// ══════════════════════════════════════════════════════════════════════
// 序的作者。**判据比名目还硬：署名带世次。**
//
//   「二十五世孙　继颜」   世次 25 ＋ 谱名继颜
//   「第二十七世孙　成祥」 世次 27 ＋ 字成祥
//
// 世次是原书自己用「第一世…第五世」列头标死的（CLAUDE.md 第四节），
// 拿它当第一把钥匙，剩下的只要名字对上一样就够——不用同音、不用猜。
// 配不上的照样进待核清单：谱在 2016 年署了「成祥」，而全谱字作成祥的
// 那一位殁于 1994——要么谱写的是别人，要么这是谱面误录，**不判**。
const CN2 = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
function genOf(t) {
  const m = /第?([一二三四五六七八九十]+)世/.exec(t ?? '');
  if (!m) return null;
  const cs = [...m[1]].map(c => CN2[c]);
  if (cs.some(v => v == null)) return null;
  const i = cs.indexOf(10);
  if (i < 0) return cs.length === 1 ? cs[0] : null;
  const tens = i === 0 ? 1 : cs[i - 1];
  const ones = i === cs.length - 1 ? 0 : cs[i + 1];
  return tens * 10 + ones;
}
function authorPid(a) {
  const gen = genOf(a.author);
  if (!gen) return [null, '署名里没写世次'];
  const tail = String(a.author).replace(/第?[一二三四五六七八九十]+世孙?/, '');
  const uniq = fold(people.filter(q => q.gen === gen &&
    [q.name, q.zi?.text, q.hui?.text, q.hao?.text, q.ming?.text]
      .filter(Boolean).some(x => String(x).length >= 2 && tail.includes(String(x)))));
  if (uniq.length !== 1)
    return [null, uniq.length ? `第${gen}世里对得上的有 ${uniq.length} 位` : `第${gen}世里没找到`];
  const dead = aliveAt(uniq[0], yearOf((a.round ?? '') + '年'));
  if (dead) return [null, `第${gen}世只此一位，可${dead}`];
  return [uniq[0], `署名写着第${gen}世，名字对得上，全世只此一位`];
}
let nPre = 0; const preMiss = [];
for (const a of (D.prefaces.list ?? [])) {
  const [q, why] = authorPid(a);
  a.author_why = why;
  if (q) { a.author_pid = q.pid; nPre++; } else delete a.author_pid;
  if (!q) preMiss.push({ '届': a.round, '序': a.title, '署名': a.author, '为什么': why });
}
writeFileSync(new URL('../data/prefaces.json', import.meta.url),
  JSON.stringify(D.prefaces, null, 1), 'utf8');

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

console.log(`
卷首十四篇序 → 作者定到唯一 id 的 ${nPre} 篇，交人工的 ${preMiss.length} 篇`);
for (const m of preMiss) console.log(`  ${m['届'] ?? '—'}　${m['序']}　署「${m['署名']}」　—— ${m['为什么']}`);
writeFileSync(new URL('../work/序作者待核.json', import.meta.url),
  JSON.stringify(preMiss, null, 1), 'utf8');
