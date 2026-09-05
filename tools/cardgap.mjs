/** 原文有、卡片上找不到的行——按形状归堆，看清楚再改。 */
import { readFileSync } from 'node:fs';
import { makeRegistry } from '../src/core/entries.ts';
import { norm } from '../src/core/norm.ts';
const J = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const D = { people: J('people'), places: J('places'), shou: J('shou'),
  era: J('erachart'), passages: J('prose_ents'), revisions: J('revisions'),
  generations: J('generations'), images: J('images'), trans: J('translations'), prefaces: J('prefaces'), manual: J('人工判定'), sameone: J('同一个人') };
const R = makeRegistry(D);
const flat = s => norm((s ?? '').replace(/[\s　]+/g, ''));
const LEAD = /^(原|继|續|续|復|复|又|再|副|侧)?(娶|聘|妣|配|室|生于|生於|殁于|殁於|葬|字|讳|諱|号|號|名)/;
// 引导词只负责指明这一段是谁的、是生还是殁，本身不是信息——
// 谱把它写成单独一行（「妣殁于」）、写在行首（「公殁于民国二十九年…」）、
// 写在行尾（「…亥时殁于」）三种都有，卡片上一律只印它带出来的那个值。
const LEAD_HEAD = /^(公妣|公|妣|原妣|继妣|繼妣|续妣|又妣|復妣|复妣|[一-鿿][妣氏])?(生于|生於|殁于|殁於|葬)/;
const LEAD_TAIL = /(生于|生於|殁于|殁於)$/;
// 名单头「女一」「生子二」也只是数目——孩子本人都列在子女栏里，数目就是行数。
// 谱有时把它和第一个名字挤在一行（「女一适赵」），那一行的信息是「适赵」。
const COUNT_HEAD = /^(生子|生女|养子|季子|女)[一二三四五六七八九十两]/;
const WHO = new Set();
const kind = new Map();
let n = 0;
for (const p of D.people) {
  const e = R.build.person(p.pid); if (!e) continue;
  const dz = R.dossier(p);
  const spouseText = dz.cat['配'].map(i => flat(i.text)).join(' ');
  const onCard = [
    ...e.facts.flatMap(f => [f.label, f.value, f.raw, (f.label ?? '') + (f.value ?? '')]),
    ...(e.relations ?? []).map(r => r.heading),
    ...(e.sections ?? []).map(x => x.text),
    ...(e.relations ?? []).flatMap(r => r.items.flatMap(i => [i.label, i.note])),
    e.title, e.subtitle,
  ].filter(Boolean).map(flat).join(' ');
  for (const ln of String(p.raw_text ?? '').split('\n')) {
    const t = flat(ln); if (t.length < 2) continue;
    if (onCard.includes(t) || spouseText.includes(t)) continue;
    const t2 = t.replace(LEAD, '').replace(/^[一-鿿]{1,4}公?(之子|[长次幼元三四五六七八九十]子|嗣子|祧子)$/, '');
    if (!t2 || onCard.includes(t2)) continue;
    const t3 = t.replace(LEAD_HEAD, '').replace(LEAD_TAIL, '').replace(COUNT_HEAD, '');
    if (t3 !== t && (!t3 || onCard.includes(t3) || spouseText.includes(t3))) continue;
    if ([...t].every(c => onCard.includes(c))) continue;
    // 「生子一」「女三」这类纯数目行不算信息：孩子本人都列在子女栏里，
    // 数目就是行数。带了内容的（「女一适赵」）照旧要查。
    if (/^(生子|生女|女)[一二三四五六七八九十两]$/.test(t)) continue;
    // 「妣殁于」「公生于」这类引导词行：它只负责指明下一行日期是谁的，
    // 日期已经归位到本人或她自己那张卡上了，标记本身不是信息。
    if (/^(公妣|公|妣|原妣|继妣|续妣|又妣|复妣)?(生于|生於|殁于|殁於|葬)$/.test(t)) continue;
    n++; WHO.add(p.pid);
    const k = /^(生子|生女|女)[一二三四五六七八九十]/.test(t) ? '名单数目行'
      : /^(公|妣|原妣|继妣)?(生|殁|歿|葬)/.test(t) ? '生殁葬行'
      : /^[一二三四五六七八九十零〇0-9]|年|月|日|时/.test(t) ? '日期行'
      : /[适適]/.test(t) ? '嫁女行' : '其他';
    const e2 = kind.get(k) ?? { n: 0, ex: [] };
    e2.n++; if (e2.ex.length < 60) e2.ex.push(`${p.name}@${p.src.vol}p${p.src.page}　「${t.slice(0, 30)}」`);
    kind.set(k, e2);
  }
}
console.log(`全谱：原文有、卡片上找不到的行 ${n} 条，涉及 ${WHO.size} 人\n`);
for (const [k, v] of [...kind].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`■ ${k}　${v.n} 条`);
  for (const x of v.ex) console.log('   ', x);
}
