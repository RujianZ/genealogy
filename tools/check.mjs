/**
 * 一条命令跑完所有检查。
 *   node --experimental-strip-types tools/check.mjs
 *
 * verify_all —— 数据对不对（不变量、字符守恒、指向、三条原则）
 * smoke      —— 界面走不走得通（搜索、点开、树、关系、译文、疑点）
 * noloss     —— 有没有把真的关系弄丢（父↔子双向对，只认 id）
 * idcheck    —— 指到人的地方是不是全走了唯一 id（一处靠名字都不行）
 * samepid    —— 同一个 id 有没有既占生父栏、又占嗣父栏
 * onlynew    —— 有没有地方能绕过新系统（可选参数、兑底、旧路）
 * nowaffle   —— 界面上有没有「有两个同名，不知道是哪一个」这类含糊话
 * fk         —— parent_edges 里每一条是不是都指向一个真实 pid（外键）
 * nohardcode —— 判据里有没有针对某个人写死（有就不算函数了）
 */
import { spawnSync } from 'node:child_process';
let bad = 0;
const GROUPS = ['verify_all', 'smoke', 'noloss', 'idcheck', 'samepid', 'onlynew', 'nowaffle', 'fk', 'nohardcode'];
for (const f of GROUPS) {
  console.log(`\n${'█'.repeat(52)}\n█ ${f}\n${'█'.repeat(52)}`);
  const r = spawnSync(process.execPath,
    ['--experimental-strip-types', `tools/${f}.mjs`],
    { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n**${bad} 组没过**` : `\n${GROUPS.length} 组全过。`);
process.exit(bad ? 1 : 0);
