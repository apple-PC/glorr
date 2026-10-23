// glorr 界面端到端测试:用无头 Chrome(CDP)真实点一遍注册→菜单→进游戏
// 用法:先 npm start,再 npx tsx scripts/ui-check.ts
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = Number(process.env.CDP_PORT || 9333);
const PAGE = process.env.PAGE_URL || 'http://localhost:8080/';

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findBrowser(): string {
  for (const p of BROWSERS) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Chrome/Edge');
}

interface Cdp {
  eval(expr: string): Promise<unknown>;
  exceptions: string[];
  close(): void;
}

async function connectCdp(): Promise<Cdp> {
  const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
    type: string; url: string; webSocketDebuggerUrl: string;
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
      const d = msg.params as {
        exceptionDetails: {
          text: string;
          exception?: { description?: string };
          stackTrace?: { callFrames: { functionName: string; url: string; lineNumber: number }[] };
        };
      };
      const frames = (d.exceptionDetails.stackTrace?.callFrames ?? []).slice(0, 4)
        .map((f) => `${f.functionName || '?'}@${f.url.split('/').pop()}:${f.lineNumber + 1}`).join(' < ');
      exceptions.push(`${d.exceptionDetails.exception?.description ?? d.exceptionDetails.text} | ${frames}`);
    }
    if (typeof msg.id === 'number') {
      const resolveFn = pending.get(msg.id);
      if (resolveFn) {
        pending.delete(msg.id);
        resolveFn(msg);
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
    close(): void {
      ws.close();
    },
  };
}

async function waitFor(cdp: Cdp, expr: string, timeoutMs = 8000, label = ''): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await cdp.eval(expr);
    if (v === true) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (label) console.log(`   (超时:${label})`);
  return false;
}

let chrome: ChildProcess | null = null;

function check(label: string, ok: boolean, detail = ''): boolean {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  return ok;
}

async function main(): Promise<void> {
  const browser = findBrowser();
  const profile = path.join(os.tmpdir(), `glorr-ui-check-${Date.now()}`);
  chrome = spawn(browser, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,860',
    PAGE,
  ], { stdio: 'ignore' });

  // 等 CDP 端口就绪
  let cdp: Cdp | null = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      cdp = await connectCdp();
      break;
    } catch {
      /* 继续等 */
    }
  }
  if (!cdp) throw new Error('无法连接 Chrome 调试端口');

  let allOk = true;
  try {
    console.log(`\n[ui-check] 页面 ${PAGE}`);
    // 1. 加载与账号屏
    const accountVisible = await waitFor(cdp, `!document.getElementById('accountscreen').classList.contains('hidden')`, 8000, '账号屏未出现');
    allOk = check('账号屏正常显示', accountVisible === true) && allOk;
    const loadingHidden = await cdp.eval(`document.getElementById('loadingscreen').classList.contains('hidden')`);
    allOk = check('加载屏已隐藏', loadingHidden === true) && allOk;

    // 2. 注册
    const name = `ui${Date.now() % 100000}`;
    await cdp.eval(`(() => {
      document.getElementById('tab-register').click();
      document.getElementById('acc-name').value = ${JSON.stringify(name)};
      document.getElementById('acc-pass').value = 'test1234';
      document.getElementById('acc-go').click();
      return true;
    })()`);
    const menuVisible = await waitFor(cdp, `!document.getElementById('menuscreen').classList.contains('hidden')`, 10000, '菜单未出现');
    allOk = check('注册成功并进入主菜单', menuVisible === true, `账号 ${name}`) && allOk;
    const chip = await cdp.eval(`document.getElementById('chipname').textContent`);
    allOk = check('菜单显示账号名', chip === name, String(chip)) && allOk;

    // 3. 准备 → 选图 → 进游戏
    await cdp.eval(`document.getElementById('readybtn').click()`);
    await cdp.eval(`document.getElementById('map-garden').click()`);
    const hudVisible = await waitFor(cdp, `!document.getElementById('hud').classList.contains('hidden')`, 12000, 'HUD 未出现');
    allOk = check('进入游戏(HUD 显示)', hudVisible === true) && allOk;
    const slots = await cdp.eval(`document.querySelectorAll('#equiprow .eslot canvas').length`);
    allOk = check('花瓣槽位已渲染', (slots as number) >= 5, `${slots} 个槽位`) && allOk;

    // 4. 无未捕获异常
    const errs = cdp.exceptions.filter((e) => !e.includes('favicon'));
    allOk = check('页面无未捕获异常', errs.length === 0, errs.slice(0, 2).join(' || ')) && allOk;
  } finally {
    cdp.close();
    chrome?.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* 临时 profile 清理失败不影响测试结果 */
    }
  }

  console.log(`\n[ui-check] ${allOk ? '全部通过' : '存在失败项'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  chrome?.kill();
  console.error('[ui-check] 致命错误:', err);
  process.exit(1);
});
