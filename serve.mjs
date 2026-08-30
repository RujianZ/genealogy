/**
 * 零依赖开发服务器。用 node 自带的类型擦除把 .ts 直接喂给浏览器，
 * 不装 vite / webpack / esbuild ——第一步不搭框架。
 * 跑法： node serve.mjs   然后开 http://localhost:5174/prototype/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.csv': 'text/csv; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  // 根路径直接送到验证页——不然打开 localhost:5174 是 404
  if (p === '/' || p === '/index.html') { res.writeHead(302, { location: '/prototype/' }); res.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(process.cwd(), p);
  if (!file.startsWith(process.cwd())) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found: ' + p); return; }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (ext === '.ts') {
    // 只擦类型，不转译语法；import 里的 .ts 后缀浏览器照样能取到（本服务器会再擦一次）
    body = stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' });
  }
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream' });
  res.end(body);
}).listen(5174, () => {
  console.log('  验证页  http://localhost:5174/');
  console.log('  （根路径已自动跳到 /prototype/）');
});
