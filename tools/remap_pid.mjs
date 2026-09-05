/**
 * 旧 pid → 新 pid 重映射。
 *
 * pid 的末位从「同格第几个」换成了源行号（见 parser/fields.py），
 * 於是所有手写内容里引用的 pid 都要跟着改。**手写的东西一个字都不能丢。**
 *
 * 对照办法：〔册·页·行·列·姓名〕唯一即认；撞了再比 raw_text。
 * 只改对得上的；对不上的原样留着并报出来，绝不猜。
 */
import { readFileSync, writeFileSync } from 'node:fs';
const J = p => JSON.parse(readFileSync(p, 'utf8'));
const O = J('build/old-data/people.json'), N = J('data/people.json');
const key = p => [p.src.vol, p.src.page, p.src.row, p.src.col, p.name].join('|');
const nb = new Map();
for (const p of N) (nb.get(key(p)) ?? nb.set(key(p), []).get(key(p))).push(p);
const map = new Map();
for (const p of O) {
  const c = nb.get(key(p)) ?? [];
  if (c.length === 1) map.set(p.pid, c[0].pid);
  else if (c.length > 1) {
    const e = c.filter(x => x.raw_text === p.raw_text);
    if (e.length === 1) map.set(p.pid, e[0].pid);
  }
}
console.log(`对照表：${map.size} / ${O.length}`);

const prose = J('data/prose.json');
const ids = new Set(prose.map(x => x.id));
const byHost = new Map();
for (const x of prose) (byHost.get(x.host) ?? byHost.set(x.host, []).get(x.host)).push(x);

const cn = J('data/prose_cn.json');
const out = {}; let same = 0, moved = 0; const bad = [];
for (const [k, v] of Object.entries(cn)) {
  if (k.startsWith('_')) { out[k] = v; continue; }
  const m = /^(P-[^#]+)(#\d+)$/.exec(k);
  if (!m) { out[k] = v; bad.push(k); continue; }
  const np = map.get(m[1]);
  if (np && ids.has(np + m[2])) { out[np + m[2]] = v; same++; continue; }
  // 段序变了（名单行归类修正后段落重切）：本人只剩一段成文的，就是它
  const longs = (byHost.get(np) ?? []).filter(x => x.chars >= 20);
  if (np && longs.length === 1) { out[longs[0].id] = v; moved++; continue; }
  out[k] = v; bad.push(k);
}
writeFileSync('data/prose_cn.json', JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`译文：按段序对上 ${same} ｜段序变了但唯一可辨 ${moved} ｜没动 ${bad.length}`);
bad.forEach(k => console.log('   ', k));
