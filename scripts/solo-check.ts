// glorr 单机模式端到端检查:起静态站(docs/) → 无头 Chrome → 进游戏 → 断言模拟在跑且无异常
// 用法:npm run build:pages && npx tsx scripts/solo-check.ts
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';

const DOCS = path.resolve('docs');
const PORT_SITE = Number(process.env.SITE_PORT || 8099);
const PORT_CDP = Number(process.env.CDP_PORT || 9334);
const PAGE = `http://127.0.0.1:${PORT_SITE}/`;

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
function findBrowser(): string {
  for (const p of BROWSERS) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Chrome/Edge');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function startSite(): Promise<http.Server> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      let fp = path.join(DOCS, p);
      if (!fp.startsWith(DOCS)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      fs.readFile(fp, (err, buf) => {
        if (err) {
          // 目录 → index.html
          fs.readFile(path.join(DOCS, p, 'index.html'), (e2, b2) => {
            if (e2) {
              res.writeHead(404);
              res.end('not found');
            } else {
              res.writeHead(200, { 'content-type': MIME['.html'] });
              res.end(b2);
            }
          });
          return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(PORT_SITE, () => resolve(srv));
  });
}

interface Cdp {
  eval(expr: string): Promise<unknown>;
  exceptions: string[];
  close(): void;
}
async function connectCdp(): Promise<Cdp> {
  const list = (await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json()) as {
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
  }[];
  const target = list.find((t) => t.type === 'page' && t.url.startsWith('http')) ?? list.find((t) => t.type === 'page');
  if (!target) throw new Error('找不到页面 target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const exceptions: string[] = [];
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as Record<string, unknown>;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params as { exceptionDetails: { text: string; exception?: { description?: string } } };
      exceptions.push(d.exceptionDetails.exception?.description ?? d.exceptionDetails.text);
    }
    if (typeof msg.id === 'number') {
      const fn = pending.get(msg.id);
      if (fn) {
        pending.delete(msg.id);
        fn(msg);
      }
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<unknown>((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await send('Runtime.enable');
  return {
    exceptions,
    async eval(expr: string): Promise<unknown> {
      const res = (await send('Runtime.evaluate', {
        expression: `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ __err: String(e) }); } })()`,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { result?: { value?: string } }; exceptionDetails?: { text: string } };
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      const raw = res.result?.result?.value;
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    close() {
      ws.close();
    },
  };
}

async function waitFor(cdp: Cdp, expr: string, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await cdp.eval(expr)) === true) return true;
    } catch {
      /* 页面导航导致执行上下文切换,重试 */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

let chrome: ChildProcess | null = null;
let site: http.Server | null = null;
function check(label: string, ok: boolean, detail = ''): boolean {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  return ok;
}

async function main(): Promise<void> {
  site = await startSite();
  const browser = findBrowser();
  const profile = path.join(os.tmpdir(), `glorr-solo-${Date.now()}`);
  chrome = spawn(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      `--remote-debugging-port=${PORT_CDP}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,860',
      PAGE,
    ],
    { stdio: 'ignore' },
  );

  let cdp: Cdp | null = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      cdp = await connectCdp();
      break;
    } catch {
      /* wait */
    }
  }
  if (!cdp) throw new Error('无法连接 Chrome 调试端口');

  let allOk = true;
  try {
    console.log(`\n[solo-check] 页面 ${PAGE}`);
    // 单机应跳过账号屏,直接进菜单
    allOk = check('单机直接进入主菜单', await waitFor(cdp, `!document.getElementById('menuscreen').classList.contains('hidden')`, 10000)) && allOk;
    const solo = await cdp.eval(`window.__glorr && window.__glorr.solo === true`);
    allOk = check('运行于单机模式(LocalSim)', solo === true) && allOk;

    // 准备 → 花园
    await cdp.eval(`document.getElementById('readybtn').click()`);
    await cdp.eval(`document.getElementById('map-garden').click()`);
    allOk = check('进入游戏(HUD 显示)', await waitFor(cdp, `!document.getElementById('hud').classList.contains('hidden')`, 12000)) && allOk;

    // 模拟在跑:有自身状态、有怪物实体
    const running = await waitFor(
      cdp,
      `!!(window.__glorr && window.__glorr.self && window.__glorr.ents && window.__glorr.ents.size > 1)`,
      8000,
    );
    allOk = check('本地模拟已产生实体(怪物/掉落)', running === true) && allOk;

    const level = await cdp.eval(`window.__glorr && window.__glorr.self ? window.__glorr.self.level : -1`);
    allOk = check('自身状态已就绪', typeof level === 'number' && level >= 1, `Lv.${level}`) && allOk;

    // 让模拟多跑一会儿(覆盖 AI/碰撞/花瓣 tick)
    await new Promise((r) => setTimeout(r, 2500));
    const entsAfter = await cdp.eval(`window.__glorr ? window.__glorr.ents.size : 0`);
    allOk = check('持续模拟中实体仍存在', typeof entsAfter === 'number' && entsAfter > 1, `${entsAfter} 个实体`) && allOk;

    const slots = await cdp.eval(`document.querySelectorAll('#equiprow .eslot canvas').length`);
    allOk = check('花瓣槽位已渲染', typeof slots === 'number' && slots >= 5, `${slots} 个槽位`) && allOk;

    // ESC 暂停 / 冻结 / 设置期间冻结 / 继续
    const mobPosExpr = `(() => { const m=[...window.__glorr.ents.values()].find(e=>e.kind==='m'); return m?[Math.round(m.x*10)/10, Math.round(m.y*10)/10]:null; })()`;
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    const pausedOn = await waitFor(cdp, `!document.getElementById('pausescreen').classList.contains('hidden')`, 3000);
    allOk = check('ESC 可暂停', pausedOn === true) && allOk;

    const posBefore = await cdp.eval(mobPosExpr);
    await new Promise((r) => setTimeout(r, 700));
    const posAfter = await cdp.eval(mobPosExpr);
    allOk = check('暂停时模拟冻结(怪物不动)', JSON.stringify(posBefore) === JSON.stringify(posAfter), JSON.stringify(posBefore)) && allOk;

    await cdp.eval(`document.getElementById('pause-settings').click()`);
    const settingsOpen = await cdp.eval(`!document.getElementById('settingsmodal').classList.contains('hidden')`);
    allOk = check('暂停中可打开设置', settingsOpen === true) && allOk;
    const posB2 = await cdp.eval(mobPosExpr);
    await new Promise((r) => setTimeout(r, 700));
    const posA2 = await cdp.eval(mobPosExpr);
    allOk = check('设置打开时仍冻结', JSON.stringify(posB2) === JSON.stringify(posA2), JSON.stringify(posB2)) && allOk;
    await cdp.eval(`document.getElementById('settingsclose').click()`);
    const backPause = await waitFor(cdp, `!document.getElementById('pausescreen').classList.contains('hidden')`, 2000);
    allOk = check('关闭设置回到暂停', backPause === true) && allOk;

    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    const pausedOff = await waitFor(cdp, `document.getElementById('pausescreen').classList.contains('hidden')`, 3000);
    allOk = check('ESC 可继续游戏', pausedOff === true) && allOk;

    // 账号页可加载(注册/登录表单存在)
    try {
      await cdp.eval(`location.assign('/account/')`);
    } catch {
      /* 导航会销毁上下文,忽略 */
    }
    const accReady = await waitFor(cdp, `!!document.getElementById('authview')`, 8000);
    allOk = check('账号页 /account 可加载', accReady === true) && allOk;
    await new Promise((r) => setTimeout(r, 800));
    const accForm = await cdp.eval(`!!document.getElementById('acc-go') && !!document.getElementById('gh-push')`);
    allOk = check('账号页表单/同步控件存在', accForm === true) && allOk;

    // 管理端:无服务器时进入本地模式(而非卡在"无法连接服务器")
    try {
      await cdp.eval(`location.assign('/admin/')`);
    } catch {
      /* 导航会销毁上下文,忽略 */
    }
    const adminReady = await waitFor(cdp, `!!document.getElementById('dashview') && !document.getElementById('dashview').classList.contains('hidden')`, 10000);
    allOk = check('管理端可加载(本地模式)', adminReady === true) && allOk;
    const offlineNote = await cdp.eval(
      `!!document.getElementById('offline-note') && !document.getElementById('offline-note').classList.contains('hidden')`,
    );
    allOk = check('管理端显示本地模式提示', offlineNote === true) && allOk;

    const errs = cdp.exceptions.filter((e) => !e.includes('favicon'));
    allOk = check('页面无未捕获异常', errs.length === 0, errs.slice(0, 3).join(' || ')) && allOk;
  } finally {
    cdp.close();
    chrome?.kill();
    site?.close();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  console.log(`\n[solo-check] ${allOk ? '全部通过' : '存在失败项'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  chrome?.kill();
  site?.close();
  console.error('[solo-check] 致命错误:', err);
  process.exit(1);
});
