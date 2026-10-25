// 截取 glorr 游玩实机画面,用于人工核对地图/UI 画质
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';

const DOCS = path.resolve('docs');
const PORT_SITE = 8123;
const PORT_CDP = 9341;
const PAGE = `http://127.0.0.1:${PORT_SITE}/`;

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
function findBrowser(): string {
  for (const p of BROWSERS) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Chrome/Edge');
}
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
function startServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = (req.url || '/').split('?')[0];
      let fp = path.join(DOCS, url === '/' ? 'index.html' : url);
      if (!fp.startsWith(DOCS)) fp = path.join(DOCS, 'index.html');
      fs.readFile(fp, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(PORT_SITE, () => resolve(srv));
  });
}
async function connectCdp(): Promise<{ eval: (e: string) => Promise<unknown>; shot: (f: string) => Promise<void>; close: () => void }> {
  const list = (await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
  const target = list.find((t) => t.type === 'page')!;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, (m: unknown) => void>();
  let id = 0;
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as { id?: number };
    if (typeof msg.id === 'number') pending.get(msg.id)?.(msg);
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<unknown>((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await send('Page.enable');
  return {
    async eval(expr: string) {
      const res = (await send('Runtime.evaluate', { expression: `(() => { try { return JSON.stringify(${expr}); } catch(e){ return '[]'; } })()`, returnByValue: true })) as { result?: { result?: { value?: string } } };
      const v = res.result?.result?.value;
      return v === undefined ? undefined : JSON.parse(v);
    },
    async shot(file: string) {
      const res = (await send('Page.captureScreenshot', { format: 'png' })) as { result?: { data?: string } };
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'));
    },
    close() {
      ws.close();
    },
  };
}
async function waitFor(cdp: { eval: (e: string) => Promise<unknown> }, expr: string, ms = 10000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await cdp.eval(expr)) === true) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main(): Promise<void> {
  const chrome: ChildProcess = spawn(
    findBrowser(),
    [`--headless=new`, `--no-sandbox`, `--disable-gpu`, `--window-size=1280,800`, `--remote-debugging-port=${PORT_CDP}`, '--user-data-dir=/tmp/glorr-shot-profile', PAGE],
  );
  const srv = await startServer();
  await new Promise((r) => setTimeout(r, 1500));
  const cdp = await connectCdp();
  await waitFor(cdp, `!document.getElementById('menuscreen').classList.contains('hidden')`, 10000);
  await cdp.eval(`document.getElementById('readybtn').click()`);
  await cdp.eval(`document.getElementById('map-garden').click()`);
  await waitFor(cdp, `!document.getElementById('hud').classList.contains('hidden')`, 12000);
  await new Promise((r) => setTimeout(r, 2500));
  // 完整实机图
  await cdp.shot('/tmp/glorr_full.png');
  // 隐藏 HUD 看纯地图
  await cdp.eval(`document.getElementById('hud').style.display='none'; document.getElementById('minimap').style.display='none';`);
  await new Promise((r) => setTimeout(r, 600));
  await cdp.shot('/tmp/glorr_map.png');
  // 原生分辨率裁剪湖泊区域(轻度缩小,保留泡沫/裂纹细节)
  const lakeUrl = (await cdp.eval(`(() => {
    const src = window.__gardenCanvas; if (!src) return null;
    const c = document.createElement('canvas'); c.width = 900; c.height = 700;
    const x = c.getContext('2d');
    x.drawImage(src, 1200, 1360, 1440, 1120, 0, 0, 900, 700);
    return c.toDataURL('image/png');
  })()`)) as string | null;
  if (typeof lakeUrl === 'string' && lakeUrl.startsWith('data:image')) {
    fs.writeFileSync('/tmp/glorr_lake.png', Buffer.from(lakeUrl.split(',')[1], 'base64'));
  }
  console.log('截图已保存: /tmp/glorr_full.png , /tmp/glorr_map.png , /tmp/glorr_lake.png');
  cdp.close();
  srv.close();
  chrome.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
