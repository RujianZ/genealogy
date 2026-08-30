/**
 * 疑点清单，按「**这是谁的问题**」分。
 *
 * 之前混了两件根本不同的事，用户指出来了：
 *
 *   谱自己留空　　—— **不是问题**。「纪其所可知，阙其所未知」。
 *                     谱没意见，我们也没意见，照样空着。修史本来就不能尽善尽美。
 *   我们读不出来　—— **我们的问题**，该修。
 *   谱写了但两个人都对得上 —— **真分不清**，唯一需要人去认的。
 *
 * 所以第一类根本不该叫「疑点」。它叫「谱上就是这么记的」。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows, windowNote } from '../src/core/activity.ts';
import { candidates, kept } from '../src/core/candidates.ts';

const J = n => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);
const NS = s => (s || '').replace(/[\s　]/g, '');

// 谱自己写下的「这里没有记录」——那是编谱人的明确表述，不是缺失
const SAID_NONE = ['缺', '未详', '失考', '无考', '不详', '未考', '无记', '阙'];
const saidNone = t => SAID_NONE.some(w => NS(t).includes(w));
// 谱上留了空：「嘉庆　年」「年」——格子在，字没填
const leftBlank = t => /^[一-鿿]{0,4}年?$/.test(NS(t));

const out = {
  分不清: [],        // 谱写了，但两个人都对得上 —— 真要人认的
  读不出: [],        // 谱写全了，是我们没读出来 —— 我们的问题
  谱上留空: [],      // 谱自己没写 / 写了「缺」「未详」—— 不是问题
  谱上对不上: [],    // 谱自己两处数字打架（殁在生之前、年代框成空区间）
  超出范围: [],      // 谱的编纂范围之外（胜二的父亲千五在江西）
  名目对不上: [],
};

for (const p of people) {
  // ── 父亲 ──────────────────────────────────────────
  if (p.parent_edges.length) {
    const cs = candidates(idx, p, chart, win);
    const good = kept(cs);
    const byKind = {};
    for (const c of good) (byKind[c.edge.kind] ??= []).push(c);
    let worst = null;
    for (const [k, v] of Object.entries(byKind)) {
      const uniq = new Set(v.map(c => c.edge.parent));
      if (uniq.size > 1 && (!worst || uniq.size > new Set(worst[1].map(c => c.edge.parent)).size)) {
        worst = [k, v];
      }
    }
    if (worst) {
      const cands = worst[1].map(c => ({
        pid: c.edge.parent, name: c.person?.name ?? c.edge.parent_name,
        src_human: c.person?.src_human ?? '', layout: c.layoutNote,
        printedAbove: c.printedAbove,
        window: windowNote(win.get(c.edge.parent)),
      }));
      const nAbove = cands.filter(c => c.printedAbove).length;
      out.分不清.push({
        pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
        father_name: p.father_name, filiation: p.filiation, kind: worst[0],
        window: windowNote(win.get(p.pid)),
        // 谱把其中一个印在他正上方那一格——翻开那页就看见了
        settled: nAbove === 1,
        cands,
      });
    }
  } else if (p.gen === 1) {
    out.超出范围.push({
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      note: `谱上写父名「${p.father_name}」。他在江西乐平——`
          + '这部谱从迁梅始祖胜二公算起，本来就不收他。这不是断链，是谱的编纂范围。',
    });
  } else if (p.father_name) {
    out.读不出.push({
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      what: '父亲', detail: `谱上写父名「${p.father_name}」${p.filiation}`,
      why: '谱里找不到他单独的一条', src: p.father_src,
    });
  } else if (saidNone(p.raw_text) || NS(p.raw_text).length < 14) {
    out.谱上留空.push({
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      what: '父亲', why: saidNone(p.raw_text) ? '谱自己写了「缺」「未详」' : '谱上这一条本来就只留了名字',
      window: windowNote(win.get(p.pid)),
    });
  } else {
    out.谱上留空.push({
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      what: '父亲', why: '这一条写得挺全，但通篇没提父亲',
      window: windowNote(win.get(p.pid)),
    });
  }

  // ── 谱自己两处对不上 ──────────────────────────────
  const w0 = win.get(p.pid);
  if (w0?.conflict) {
    out.谱上对不上.push({
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      what: '年代', why: w0.conflict,
      birth: p.birth?.text ?? null, death: p.death?.text ?? null,
      age: p.age?.text ?? null,
    });
  }

  // ── 生年 ──────────────────────────────────────────
  const bt = p.birth?.text;
  if (bt && chart.lookup(bt).ad == null) {
    const w = windowNote(win.get(p.pid));
    const rec = {
      pid: p.pid, name: p.name, gen: p.gen, src_human: p.src_human,
      what: '生年', detail: `生「${NS(bt)}」`, why: chart.lookup(bt).why, window: w,
    };
    if (saidNone(bt)) { rec.why = '谱自己写了「缺」'; out.谱上留空.push(rec); }
    else if (leftBlank(bt)) { rec.why = '谱上留了空，没填'; out.谱上留空.push(rec); }
    else out.读不出.push(rec);
  }
}

for (const r of J('revisions')) {
  for (const m of r.members) {
    if (m.pid) continue;
    out.名目对不上.push({
      era: r.era, raw: m.raw, name: m.name ?? null,
      why: m.match ?? '没找到', cands: m.candidates ?? [],
    });
  }
}

writeFileSync('data/doubts.json', JSON.stringify(out, null, 1), 'utf8');
for (const [k, v] of Object.entries(out)) console.log(`  ${String(v.length).padStart(5)}　${k}`);
const s = out.分不清.filter(x => x.settled).length;
console.log(`\n  分不清的 ${out.分不清.length} 条里，**${s} 条谱把其中一个印在本人正上方那一格**`
  + `（翻开那页就看见），剩 ${out.分不清.length - s} 条版式也说不出。`);
