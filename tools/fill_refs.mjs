/**
 * 给谱上写了、却没有 id 的人补上 id。
 *
 * ★ **id 是 id，族谱是族谱。** 谱按它那个年代的规矩，女儿只记「适某」、
 *   不立条目；那是谱的写法，照录。但在数据里，每一个谱上出现的人
 *   都该有一个自己的 id——否则她只能靠名字被提及，一靠名字就会撞上别人。
 *
 * ★ 切分交给 src/core/roster.ts（界面也用同一份，两边不会走样）。
 * ★ 已经有 id 的不动：按名字对上就沿用原来那条（它带着姓、夫家姓、生卒这些
 *   已经解析好的字段），只补缺的。people.json 一个字不改。
 *
 *   跑法： node --experimental-strip-types tools/fill_refs.mjs          只报不写
 *          node --experimental-strip-types tools/fill_refs.mjs --write   写回
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { norm as NS } from '../src/core/norm.ts';
import { roster } from '../src/core/roster.ts';

const WRITE = process.argv.includes('--write');
const people = JSON.parse(readFileSync('data/people.json', 'utf8'));
const refs = JSON.parse(readFileSync('data/referenced.json', 'utf8'));

const byHost = new Map();
for (const r of refs) {
  if (!byHost.has(r.host)) byHost.set(r.host, []);
  byHost.get(r.host).push(r);
}
// 有独立条目、父边指向本人的儿子。**各种叫法都算**——开赛的生子名单写的是
// 「儒健」，那是承健的字；只比谱名就会给一个有条目的人再发一个 id。
const entryKids = new Map();
for (const p of people) for (const e of p.parent_edges) {
  if (!entryKids.has(e.parent)) entryKids.set(e.parent, new Set());
  const s = entryKids.get(e.parent);
  s.add(NS(p.name));
  for (const a of p.aliases ?? []) s.add(NS(a.form));
}

const added = [];
for (const p of people) {
  const { sons, daughters } = roster(p);
  const mine = byHost.get(p.pid) ?? [];

  const haveD = mine.filter(r => r.role === '女');
  const haveDNames = new Set(haveD.map(r => NS(r.name_raw)));
  let nextD = haveD.reduce((a, r) => Math.max(a, +(/女(\d+)$/.exec(r.rid)?.[1] ?? 0)), 0);
  for (const d of daughters) {
    if (haveDNames.has(NS(d.raw))) continue;
    haveDNames.add(NS(d.raw));
    nextD += 1;
    added.push({
      rid: `${p.pid}/女${nextD}`, host: p.pid, host_name: p.name, role: '女',
      rel_raw: '', rel_class: '女儿', name_raw: d.raw, gen: p.gen,
      surname: null, given: d.husband ? null : (d.name || null),
      husband_surname: d.husband, place: null, ordinal: null, form_ok: true,
      content_class: d.husband ? '出适·夫家姓' : d.died ? '夭殇' : '谱上只写了名字',
      birth: null, death: null, burial: null,
      src_human: p.src_human, host_raw_text: p.raw_text, narrative_candidates: [],
      derived: true,
    });
  }

  const haveS = mine.filter(r => r.role.startsWith('子'));
  const haveSNames = new Set([...haveS.map(r => NS(r.name_raw)), ...(entryKids.get(p.pid) ?? [])]);
  let nextS = haveS.reduce((a, r) => Math.max(a, +(/子(\d+)$/.exec(r.rid)?.[1] ?? 0)), 0);
  for (const s of sons) {
    if (!s.name) continue;                       // 「幼殁」没写名字，不单独发 id
    if (haveSNames.has(NS(s.name)) || haveSNames.has(NS(s.raw))) continue;
    haveSNames.add(NS(s.name));
    nextS += 1;
    added.push({
      rid: `${p.pid}/子${nextS}`, host: p.pid, host_name: p.name, role: '子（谱中无条目）',
      rel_raw: '', rel_class: '儿子', name_raw: s.raw, gen: p.gen != null ? p.gen + 1 : null,
      surname: '张', given: s.name, husband_surname: null,
      place: null, ordinal: null, form_ok: true,
      content_class: s.died ? '谱上写他殁了' : '谱上点了名，没有单独一条',
      birth: null, death: null, burial: null,
      src_human: p.src_human, host_raw_text: p.raw_text, narrative_candidates: [],
      derived: true,
    });
  }
}

const nd = added.filter(r => r.role === '女').length;
console.log(`补 ${added.length} 个 id：女儿 ${nd}　儿子 ${added.length - nd}`);
console.log(`referenced.json：${refs.length} → ${refs.length + added.length} 条`);
for (const r of added.slice(0, 12)) {
  console.log(`  ${r.rid}　${r.host_name}之${r.role[0]}「${r.name_raw}」`
    + (r.husband_surname ? `　嫁${r.husband_surname}家` : ''));
}

if (WRITE) {
  writeFileSync('data/referenced.json', JSON.stringify(refs.concat(added), null, 1), 'utf8');
  console.log('✔ 已写回 data/referenced.json（people.json 一个字没动）');
} else {
  console.log('（只报不写。确认无误后加 --write）');
}
