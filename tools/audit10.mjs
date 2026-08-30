/**
 * 随机抽 N 个人，把他们从自己到始祖的整条链摊开，**逐环列出要去原件核对的字**。
 *
 * ★ 这份只负责「代码 + 数据」两方，产出一份待核清单；
 *   第三方（原件 .doc）由 tools/audit10.py 拿这份清单去查。
 *   两边分开跑，是为了让 doc 那一方**完全不知道我们的结论**——
 *   它只做一件事：在原文里找这串字在不在、前后是什么。
 *
 * ★ 抽样规则，写死在这里好让人复跑：
 *     · 固定种子的线性同余，种子打印出来
 *     · **排除承健自己那 26 代直系**——要测的正是「跟他无关的人」
 *     · 每一房最多抽 2 个，摊开一点
 *     · 只抽第 18 世以下（链子够长才有得测）
 *
 * ★ 每一环要核的两句话，都是谱自己写的：
 *     子那边  「梓公长子」        —— 本人条目里的父名句
 *     父那边  「生子三 … 梦骥 …」 —— 父亲条目里的生子名单
 *   两句都在原件里、且指向同一对人，这一环才算过。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildIndex } from '../src/core/lineage.ts';
import { withBacklinks } from '../src/core/backlink.ts';
import { EraChart } from '../src/core/years.ts';
import { buildWindows } from '../src/core/activity.ts';
import { candidates } from '../src/core/candidates.ts';
import { isFragment } from '../src/core/fragment.ts';
import { roster } from '../src/core/roster.ts';

const SEED = 20260830;
const N = 10;

const J = (n) => JSON.parse(readFileSync(`data/${n}.json`, 'utf8'));
const people = withBacklinks(J('people'));
const idx = buildIndex(people);
const chart = new EraChart(J('erachart'));
const win = buildWindows(people, chart);

let seed = SEED;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** 卷几在哪个 .doc 里 */
const docOf = (p) => {
  const n = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 }[p.src?.juan ?? ''] ?? 0;
  return n >= 8 ? '合三（8、9）.doc' : n >= 5 ? '合二（5、6、7）.doc' : '合一（1.2.3.4）.doc';
};
const RAW = (p) => (p.raw_text ?? '').split('\n').map(s => s.trim()).filter(Boolean);

/** 走一条链：每步只走「留下的」生父边；分叉就停下并记明 */
function chainOf(pid) {
  const out = [];
  let cur = pid, seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = idx.get(cur);
    if (!p || p.gen === 1) { out.push({ p, stop: p?.gen === 1 ? '始祖' : '找不到' }); break; }
    const keep = candidates(idx, p, chart, win).filter(c => c.status === 'ok');
    const bio = keep.filter(c => c.edge.kind === '生父');
    const line = bio.length ? bio : keep;
    if (!line.length) { out.push({ p, stop: '谱上断了' }); break; }
    if (line.length > 1) {
      out.push({ p, stop: `岔路 ${line.length} 条：`
        + line.map(c => idx.get(c.edge.parent).name + '(' + idx.get(c.edge.parent).src.page + '页)').join('／') });
      break;
    }
    const c = line[0], f = idx.get(c.edge.parent);
    out.push({ p, f, edge: c.edge, kind: c.edge.kind });
    cur = c.edge.parent;
  }
  return out;
}

// ── 排除承健自己那一条
const me = people.find(p => p.name === '承健' && p.gen === 27);
const mine = new Set(chainOf(me.pid).map(s => s.p?.pid).filter(Boolean));

const pool = people.filter(p => !isFragment(p) && p.gen != null && p.gen >= 18
  && !mine.has(p.pid) && p.name && p.name.length >= 2);
const byHouse = new Map();
const picked = [];
let guard = 0;
while (picked.length < N && guard++ < 100000) {
  const p = pool[Math.floor(rnd() * pool.length)];
  if (!p || picked.includes(p)) continue;
  const h = p.src.section;
  if ((byHouse.get(h) ?? 0) >= 2) continue;
  byHouse.set(h, (byHouse.get(h) ?? 0) + 1);
  picked.push(p);
}

const todo = [];
console.log(`种子 ${SEED}　候选池 ${pool.length} 人（已排除承健那 26 代直系 ${mine.size} 人）\n`);
picked.forEach((p, i) => {
  const ch = chainOf(p.pid);
  console.log('═'.repeat(74));
  console.log(`【${i + 1}】${p.name}　第${p.gen}世　${p.src_human}`);
  console.log(`     链长 ${ch.filter(s => s.f).length} 步，`
    + (ch.at(-1)?.stop ?? '走到底'));
  for (const s of ch) {
    if (!s.f) { console.log(`     └ ${s.p?.name ?? '?'}（第${s.p?.gen}世）—— ${s.stop}`); break; }
    const filPhrase = s.p.father_name ? `${s.p.father_name}${s.p.filiation ?? ''}` : null;
    const sons = roster(s.f).sons.map(x => x.raw.replace(/[\s　]/g, '')).join(' ');
    console.log(`     ${String(s.p.gen).padStart(2)}世 ${s.p.name.padEnd(4)}→ ${s.f.name.padEnd(4)}`
      + `（${s.kind} rank${s.edge.rank}）`
      + `  子写「${filPhrase ?? '没写父名'}」  父名单「${sons || '空'}」`);
    todo.push({
      no: i + 1, child: s.p.name, childPage: s.p.src.page, childDoc: docOf(s.p),
      father: s.f.name, fatherPage: s.f.src.page, fatherDoc: docOf(s.f),
      gen: s.p.gen, kind: s.kind, rank: s.edge.rank,
      // 要去原件里找的两串字
      needChild: filPhrase,
      fatherSrc: s.p.father_src ?? null,
      needFather: sons ? roster(s.f).sons.map(x => x.name || x.raw)
        .find(x => x.replace(/[\s　]/g, '') === s.p.name.replace(/[\s　]/g, ''))
        ?? null : null,
      childRaw: RAW(s.p).slice(0, 3).join('｜'),
      fatherSons: sons,
    });
  }
});
writeFileSync('build/audit10.json', JSON.stringify({ seed: SEED, todo }, null, 1), 'utf8');
console.log('\n' + '═'.repeat(74));
console.log(`待核清单 ${todo.length} 环 → build/audit10.json`);
console.log('下一步：python tools/audit10.py');
