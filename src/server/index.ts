import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room } from './room';
import { AccountStore, type PublicAccount } from './accounts';

const PORT = Number(process.env.PORT || 8080);
const ADMIN_PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : null;
const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/client');
const ADMIN_DIR = path.join(CLIENT_DIR, 'admin');
const MAX_ROOMS = 12;

const accounts = new AccountStore();
const rooms = new Map<string, Room>();

let maintenance = false;

interface LogEntry {
  time: number;
  text: string;
}
const adminLog: LogEntry[] = [];
function log(text: string): void {
  adminLog.unshift({ time: Date.now(), text });
  if (adminLog.length > 60) adminLog.pop();
  console.log(`[admin-log] ${text}`);
}

function getRoom(name: string): Room | null {
  const clean = name.replace(/[^\w-]/g, '').slice(0, 24) || 'garden-1';
  let room = rooms.get(clean);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) return null;
    room = new Room(clean, accounts);
    rooms.set(clean, room);
    log(`房间创建:${clean}`);
  }
  return room;
}

// ---------- 静态文件 ----------

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
};

function sendJson(res: http.ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendFile(res: http.ServerResponse, filePath: string, notFoundFallback?: string): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (notFoundFallback) {
        fs.readFile(notFoundFallback, (e2, d2) => {
          if (e2) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
          }
          res.writeHead(200, { 'content-type': MIME['.html'] });
          res.end(d2);
        });
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

function safeJoin(root: string, urlPath: string): string | null {
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

// ---------- 管理端 API ----------

const adminTokens = new Map<string, { name: string; expires: number }>();

function adminName(req: http.IncomingMessage): string | null {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const entry = adminTokens.get(token);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.name;
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function handleAdminApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const route = url.pathname;

  // 登录(不需要 token)
  if (route === '/api/admin/login' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name ?? '').trim();
    const password = String(body.password ?? '');
    const result = accounts.login(name, password);
    if (!result.ok) return sendJson(res, 401, { ok: false, error: result.error });
    if (!result.account.admin) return sendJson(res, 403, { ok: false, error: '该账号不是管理员' });
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    adminTokens.set(token, { name, expires: Date.now() + 12 * 3600 * 1000 });
    log(`管理员登录:${name}`);
    return sendJson(res, 200, { ok: true, token, name });
  }

  // 以下都需要管理员 token
  const who = adminName(req);
  if (!who) return sendJson(res, 401, { ok: false, error: '未授权' });

  if (route === '/api/admin/overview' && req.method === 'GET') {
    const online = [...rooms.values()].reduce((sum, r) => sum + r.players.size, 0);
    return sendJson(res, 200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      maintenance,
      rooms: [...rooms.values()].map((r) => r.stats()),
      online,
      accounts: accounts.count(),
      logs: adminLog.slice(0, 20),
    });
  }

  if (route === '/api/admin/maintenance' && req.method === 'POST') {
    const body = await readBody(req);
    maintenance = Boolean(body.on);
    log(`${who} ${maintenance ? '开启' : '关闭'}维护模式`);
    return sendJson(res, 200, { ok: true, maintenance });
  }

  if (route === '/api/admin/room' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name ?? '');
    const action = String(body.action ?? '');
    const room = rooms.get(name);
    if (!room) return sendJson(res, 404, { ok: false, error: '房间不存在' });
    if (action === 'close') {
      room.closed = true;
      room.announce('本服务器即将关闭,请保存好随身物品');
      log(`${who} 关闭房间 ${name}`);
    } else if (action === 'open') {
      room.closed = false;
      log(`${who} 开启房间 ${name}`);
    } else {
      return sendJson(res, 400, { ok: false, error: '未知操作' });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (route === '/api/admin/announce' && req.method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text ?? '').replace(/[<>]/g, '').trim().slice(0, 120);
    if (!text) return sendJson(res, 400, { ok: false, error: '内容为空' });
    for (const room of rooms.values()) room.announce(`【公告】${text}`);
    log(`${who} 全服广播:${text}`);
    return sendJson(res, 200, { ok: true });
  }

  if (route === '/api/admin/accounts' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const list: PublicAccount[] = accounts
      .all()
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 200)
      .map(({ salt: _s, hash: _h, ...rest }) => rest);
    return sendJson(res, 200, { ok: true, accounts: list });
  }

  if (route === '/api/admin/account' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name ?? '').trim();
    const action = String(body.action ?? '');
    const value = String(body.value ?? '');
    const target = accounts.get(name);
    if (!target) return sendJson(res, 404, { ok: false, error: '账号不存在' });
    switch (action) {
      case 'ban':
        accounts.setBanned(name, true, value || '违规');
        log(`${who} 封禁 ${name}(${value || '违规'})`);
        break;
      case 'unban':
        accounts.setBanned(name, false);
        log(`${who} 解封 ${name}`);
        break;
      case 'reset_password': {
        const r = accounts.resetPassword(name, value);
        if (!r.ok) return sendJson(res, 400, { ok: false, error: r.error });
        log(`${who} 重置 ${name} 的密码`);
        break;
      }
      case 'delete':
        accounts.deleteAccount(name);
        log(`${who} 删除账号 ${name}`);
        break;
      case 'grant_admin':
        accounts.setAdmin(name, true);
        log(`${who} 授予 ${name} 管理员`);
        break;
      case 'revoke_admin':
        if (name === who) return sendJson(res, 400, { ok: false, error: '不能撤销自己的管理权' });
        accounts.setAdmin(name, false);
        log(`${who} 撤销 ${name} 管理员`);
        break;
      case 'set_level': {
        const lv = Number(value);
        if (!Number.isFinite(lv)) return sendJson(res, 400, { ok: false, error: '等级无效' });
        accounts.setLevel(name, lv);
        log(`${who} 将 ${name} 等级设为 ${lv}`);
        break;
      }
      default:
        return sendJson(res, 400, { ok: false, error: '未知操作' });
    }
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
}

// ---------- HTTP 服务 ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    void handleAdminApi(req, res, url);
    return;
  }
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    const sub = url.pathname.replace(/^\/admin/, '') || '/';
    const file = safeJoin(ADMIN_DIR, sub === '/' ? 'index.html' : sub);
    if (!file) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    sendFile(res, file, path.join(ADMIN_DIR, 'index.html'));
    return;
  }
  const file = safeJoin(CLIENT_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  sendFile(res, file, path.join(CLIENT_DIR, 'index.html'));
});

// ---------- 管理端独立端口(可选,与游玩端完全分离) ----------

if (ADMIN_PORT) {
  const adminServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      void handleAdminApi(req, res, url);
      return;
    }
    const file = safeJoin(ADMIN_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    sendFile(res, file, path.join(ADMIN_DIR, 'index.html'));
  });
  adminServer.listen(ADMIN_PORT, () => {
    console.log(`[glorr] 管理端(独立地址)已启动: http://localhost:${ADMIN_PORT}`);
  });
}

// ---------- WebSocket 网关:鉴权 → 分房 ----------

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const roomName = url.searchParams.get('room') || 'garden-1';

  if (maintenance) {
    send(ws, { t: 'auth_err', reason: '服务器维护中,请稍后再试' });
    ws.close();
    return;
  }
  const room = getRoom(roomName);
  if (!room || room.closed) {
    send(ws, { t: 'auth_err', reason: '该服务器不存在或已关闭' });
    ws.close();
    return;
  }

  let attached = false;
  const onMessage = (raw: unknown): void => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.t === 'register') {
      const result = accounts.register(String(msg.name ?? '').trim(), String(msg.password ?? ''));
      if (!result.ok) {
        send(ws, { t: 'auth_err', reason: result.error });
        return;
      }
      const token = accounts.issueToken(result.account.name);
      log(`新账号注册:${result.account.name}`);
      send(ws, {
        t: 'auth_ok',
        token,
        name: result.account.name,
        level: result.account.level,
        kills: result.account.kills,
        admin: result.account.admin,
      });
      return;
    }
    if (msg.t === 'login') {
      const result = accounts.login(String(msg.name ?? '').trim(), String(msg.password ?? ''));
      if (!result.ok) {
        send(ws, { t: 'auth_err', reason: result.error });
        return;
      }
      const token = accounts.issueToken(result.account.name);
      log(`账号登录:${result.account.name}`);
      send(ws, {
        t: 'auth_ok',
        token,
        name: result.account.name,
        level: result.account.level,
        kills: result.account.kills,
        admin: result.account.admin,
      });
      return;
    }
    if (msg.t === 'whoami') {
      const account = accounts.tokenName(String(msg.token ?? ''));
      if (!account) {
        send(ws, { t: 'auth_err', reason: '登录已过期,请重新登录' });
        return;
      }
      send(ws, {
        t: 'auth_ok',
        token: String(msg.token ?? ''),
        name: account.name,
        level: account.level,
        kills: account.kills,
        admin: account.admin,
      });
      return;
    }
    if (msg.t === 'join') {
      const account = accounts.tokenName(String(msg.token ?? ''));
      if (!account) {
        send(ws, { t: 'auth_err', reason: '登录已过期,请重新登录' });
        return;
      }
      attached = true;
      ws.off('message', onMessage);
      room.addPlayer(ws, account);
      log(`${account.name} 加入 ${roomName}(在线 ${room.players.size})`);
    }
  };
  ws.on('message', onMessage);
  ws.on('error', () => ws.close());
});

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

server.listen(PORT, () => {
  console.log(`[glorr] 服务端已启动: http://localhost:${PORT}`);
  console.log(`[glorr] 管理端: http://localhost:${PORT}/admin${ADMIN_PORT ? ` 或独立端口 ${ADMIN_PORT}` : ''}`);
  if (!fs.existsSync(path.join(CLIENT_DIR, 'index.html'))) {
    console.log('[glorr] 提示:未检测到客户端构建产物(开发请 npm run dev,生产请 npm run build)');
  }
});
