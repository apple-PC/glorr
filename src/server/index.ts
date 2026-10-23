import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room';

const PORT = Number(process.env.PORT || 8080);
const CLIENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/client',
);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(CLIENT_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 回退;未构建时给出提示
      fs.readFile(path.join(CLIENT_DIR, 'index.html'), (e2, d2) => {
        if (e2) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('glorr 客户端尚未构建:开发请运行 npm run dev,生产请先 npm run build');
          return;
        }
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const room = new Room('garden-1');

wss.on('connection', (ws) => {
  room.addConnection(ws);
});

server.listen(PORT, () => {
  console.log(`[glorr] 服务端已启动: http://localhost:${PORT}`);
  console.log(`[glorr] WebSocket 就绪,房间 "${room.name}",容量 60 人`);
  if (!fs.existsSync(path.join(CLIENT_DIR, 'index.html'))) {
    console.log('[glorr] 提示:未检测到客户端构建产物,页面将提示构建方式(不影响联机)');
  }
});
