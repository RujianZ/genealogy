/**
 * 一条命令跑完所有检查。
 *   node --experimental-strip-types tools/check.mjs
 *
 * verify_all —— 数据对不对（不变量、字符守恒、指向、三条原则）
 * smoke      —— 界面走不走得通（搜索、点开、树、关系、译文、疑点）
 * noloss     —— 有没有把真的关系删掉（子女栏那次重写的反向查）
 * nohardcode —— 判据里有没有针对某个人写死（有就不算函数了）
 */
import { spawnSync } from 'node:child_process';
let bad = 0;
for (const f of ['verify_all', 'smoke', 'noloss', 'nohardcode']) {
  console.log(`\n${'█'.repeat(52)}\n█ ${f}\n${'█'.repeat(52)}`);
  const r = spawnSync(process.execPath,
    ['--experimental-strip-types', `tools/${f}.mjs`],
    { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n**${bad} 组没过**` : '\n四组全过。');
process.exit(bad ? 1 : 0);
