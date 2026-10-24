// glorr 管理后台逻辑
import { SERVER_ORIGIN } from '@shared/servers';
import { START_KIT } from '@shared/constants';
interface RoomStat {
  name: string;
  players: number;
  mobs: number;
  drops: number;
  uptime: number;
  closed: boolean;
}

interface AccountRow {
  name: string;
  admin: boolean;
  banned: boolean;
  banReason: string;
  createdAt: number;
  lastSeen: number;
  level: number;
  xp: number;
  kills: number;
  playtime: number;
  inv: { id: string; rarity: number }[];
  slots: ({ id: string; rarity: number } | null)[];
}

interface Overview {
  uptime: number;
  maintenance: boolean;
  rooms: RoomStat[];
  online: number;
  accounts: { total: number; banned: number; admins: number };
  logs: { time: number; text: string }[];
}

let adminToken = localStorage.getItem('glorr.admin.token') || '';
let pollTimer = 0;

// 公网托管页面带 sharecode 查询参数,API 请求必须原样带上,否则会被网关拦截
const SHARE = location.search.startsWith('?') ? location.search.slice(1) : '';

const $ = (id: string) => document.getElementById(id)!;

function apiPath(path: string): string {
  if (!SHARE) return path;
  return path + (path.includes('?') ? '&' : '?') + SHARE;
}

function api(path: string, options: RequestInit = {}): Promise<Response> {
  // 管理页托管在 GitHub Pages,API 在 Fly,必须走绝对地址 + CORS
  return fetch(SERVER_ORIGIN + apiPath(path), {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminToken}`,
      ...(options.headers ?? {}),
    },
  });
}

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

// ---------- 登录 ----------

async function login(): Promise<void> {
  const name = ($('admin-name') as HTMLInputElement).value.trim();
  const password = ($('admin-pass') as HTMLInputElement).value;
  const msg = $('admin-msg');
  msg.textContent = '';
  try {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    const data = (await res.json()) as { ok: boolean; token?: string; error?: string };
    if (!res.ok || !data.ok) {
      msg.textContent = data.error ?? '登录失败';
      return;
    }
    adminToken = data.token!;
    localStorage.setItem('glorr.admin.token', adminToken);
    enterDash();
  } catch {
    msg.textContent = '无法连接服务器';
  }
}

function enterDash(): void {
  $('loginview').classList.add('hidden');
  $('dashview').classList.remove('hidden');
  void refresh();
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => void refresh(), 3000);
}

$('admin-login').addEventListener('click', () => void login());
for (const id of ['admin-name', 'admin-pass']) {
  $(id).addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e as KeyboardEvent).key === 'Enter') void login();
  });
}

// ---------- 注册(HTTP,首个账号自动成为管理员) ----------

function showRegister(show: boolean): void {
  document.querySelector('.loginbox:not(#registerbox)')!.classList.toggle('hidden', show);
  $('registerbox').classList.toggle('hidden', !show);
  $('reg-msg').textContent = '';
}

$('show-register').addEventListener('click', (e) => {
  e.preventDefault();
  showRegister(true);
});
$('show-login').addEventListener('click', (e) => {
  e.preventDefault();
  showRegister(false);
});

async function register(): Promise<void> {
  const name = ($('reg-name') as HTMLInputElement).value.trim();
  const password = ($('reg-pass') as HTMLInputElement).value;
  const msg = $('reg-msg');
  msg.textContent = '';
  try {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; admin?: boolean };
    if (!res.ok || !data.ok) {
      msg.textContent = data.error ?? '注册失败';
      return;
    }
    // 回填并自动登录
    ($('admin-name') as HTMLInputElement).value = name;
    ($('admin-pass') as HTMLInputElement).value = password;
    showRegister(false);
    msg.textContent = '';
    $('admin-msg').textContent = data.admin ? '注册成功,已自动填充(首个账号即管理员)' : '注册成功,已自动填充';
    void login();
  } catch {
    msg.textContent = '无法连接服务器';
  }
}

$('reg-go').addEventListener('click', () => void register());
for (const id of ['reg-name', 'reg-pass']) {
  $(id).addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e as KeyboardEvent).key === 'Enter') void register();
  });
}
$('dash-logout').addEventListener('click', () => {
  localStorage.removeItem('glorr.admin.token');
  adminToken = '';
  window.clearInterval(pollTimer);
  $('dashview').classList.add('hidden');
  $('loginview').classList.remove('hidden');
});

// ---------- 数据刷新 ----------

async function refresh(): Promise<void> {
  try {
    const res = await api('/api/admin/overview');
    if (res.status === 401) {
      localStorage.removeItem('glorr.admin.token');
      adminToken = '';
      window.clearInterval(pollTimer);
      $('dashview').classList.add('hidden');
      $('loginview').classList.remove('hidden');
      $('admin-msg').textContent = '登录已过期,请重新登录';
      return;
    }
    const data = (await res.json()) as { ok: boolean } & Overview;
    if (!data.ok) return;
    renderOverview(data);
  } catch {
    /* 网络抖动时静默 */
  }
}

function renderOverview(data: Overview): void {
  $('st-online').textContent = String(data.online);
  $('st-rooms').textContent = String(data.rooms.length);
  $('st-accounts').textContent = String(data.accounts.total);
  $('st-banned').textContent = String(data.accounts.banned);
  $('st-uptime').textContent = fmtUptime(data.uptime);

  const mt = $('btn-maintenance');
  mt.textContent = data.maintenance ? '维护中 · 点击关闭' : '已关闭 · 点击开启';
  mt.className = `toggle ${data.maintenance ? 'on' : 'off'}`;

  // 房间表
  const tbody = document.querySelector('#roomtable tbody')!;
  tbody.innerHTML = '';
  for (const room of data.rooms) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${room.name}</td><td>${room.players}</td><td>${room.mobs}</td><td>${room.drops}</td>` +
      `<td><span class="tag ${room.closed ? 'closed' : 'ok'}">${room.closed ? '已关闭' : '运行中'}</span></td>`;
    const tdAct = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'actbtn';
    btn.textContent = room.closed ? '开启' : '关闭';
    btn.addEventListener('click', () => void roomAction(room.name, room.closed ? 'open' : 'close'));
    tdAct.appendChild(btn);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }

  // 日志
  const logs = $('loglist');
  logs.innerHTML = '';
  for (const entry of data.logs) {
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = fmtTime(entry.time);
    li.append(time, document.createTextNode(entry.text));
    logs.appendChild(li);
  }
}

// ---------- 操作 ----------

$('btn-maintenance').addEventListener('click', async () => {
  const current = $('btn-maintenance').textContent.includes('维护中');
  await api('/api/admin/maintenance', { method: 'POST', body: JSON.stringify({ on: !current }) });
  void refresh();
});

async function roomAction(name: string, action: 'close' | 'open'): Promise<void> {
  await api('/api/admin/room', { method: 'POST', body: JSON.stringify({ name, action }) });
  void refresh();
}

$('btn-announce').addEventListener('click', async () => {
  const input = $('announce-input') as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  await api('/api/admin/announce', { method: 'POST', body: JSON.stringify({ text }) });
  input.value = '';
  void refresh();
});

// ---------- 账号管理 ----------

async function loadAccounts(): Promise<void> {
  const q = ($('acc-search') as HTMLInputElement).value.trim();
  const res = await api(`/api/admin/accounts?q=${encodeURIComponent(q)}`);
  const data = (await res.json()) as { ok: boolean; accounts: AccountRow[] };
  if (!data.ok) return;
  const tbody = document.querySelector('#acctable tbody')!;
  tbody.innerHTML = '';
  for (const acc of data.accounts) {
    const tr = document.createElement('tr');
    const petalCount = acc.inv.length + acc.slots.filter(Boolean).length;
    tr.innerHTML =
      `<td>${acc.name}</td><td>${acc.level}</td><td>${acc.kills}</td><td>${petalCount}</td>` +
      `<td>${acc.admin ? '<span class="tag admin">管理员</span>' : ''}</td>` +
      `<td>${acc.banned ? `<span class="tag banned">封禁:${acc.banReason || '违规'}</span>` : '<span class="tag ok">正常</span>'}</td>` +
      `<td>${fmtTime(acc.createdAt)}</td><td>${fmtTime(acc.lastSeen)}</td>`;
    const tdAct = document.createElement('td');
    const addBtn = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = `actbtn ${cls}`.trim();
      b.textContent = label;
      b.addEventListener('click', fn);
      tdAct.appendChild(b);
    };
    if (acc.banned) addBtn('解封', '', () => void accountAction(acc.name, 'unban'));
    else addBtn('封禁', 'danger', () => {
      const reason = window.prompt('封禁原因(可留空)') ?? '';
      void accountAction(acc.name, 'ban', reason);
    });
    addBtn('重置密码', '', () => {
      const pwd = window.prompt(`设置 ${acc.name} 的新密码(至少 4 位)`);
      if (pwd) void accountAction(acc.name, 'reset_password', pwd);
    });
    addBtn('改等级', '', () => {
      const lv = window.prompt(`设置 ${acc.name} 的等级(1-200)`, String(acc.level));
      if (lv) void accountAction(acc.name, 'set_level', lv);
    });
    if (acc.admin) addBtn('撤管理权', '', () => void accountAction(acc.name, 'revoke_admin'));
    else addBtn('授管理权', '', () => void accountAction(acc.name, 'grant_admin'));
    addBtn('删除', 'danger', () => {
      if (window.confirm(`确认删除账号 ${acc.name}?此操作不可恢复!`)) {
        void accountAction(acc.name, 'delete');
      }
    });
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }
}

async function accountAction(name: string, action: string, value = ''): Promise<void> {
  const res = await api('/api/admin/account', {
    method: 'POST',
    body: JSON.stringify({ name, action, value }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) window.alert(data.error ?? '操作失败');
  void loadAccounts();
  void refresh();
}

$('acc-refresh').addEventListener('click', () => void loadAccounts());
$('acc-search').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') void loadAccounts();
});

// ---------- 启动:优先连服务器;连不上则进入本机管理模式 ----------

interface LocalUser {
  name: string;
  level?: number;
  xp?: number;
  kills?: number;
  inv?: { id: string; rarity: number }[];
  slotsList?: ({ id: string; rarity: number } | null)[];
  createdAt?: number;
}

function localUsers(): Record<string, LocalUser> {
  try {
    const obj = JSON.parse(localStorage.getItem('glorr.users') || '{}') as Record<string, LocalUser>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
function saveLocalUsers(u: Record<string, LocalUser>): void {
  localStorage.setItem('glorr.users', JSON.stringify(u));
}
function currentLocalSave(): LocalUser | null {
  try {
    return JSON.parse(localStorage.getItem('glorr.save') || 'null') as LocalUser | null;
  } catch {
    return null;
  }
}

/** 探测游戏服务器是否可达(单机部署时不可达 → 本地模式) */
async function probeServer(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${SERVER_ORIGIN}/healthz`, { signal: ctrl.signal });
    window.clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function enterLocal(): void {
  $('loginview').classList.add('hidden');
  $('dashview').classList.remove('hidden');
  document.getElementById('offline-note')?.classList.remove('hidden');
  document.getElementById('server-panel')?.classList.add('hidden');
  const who = document.getElementById('dash-who');
  if (who) who.textContent = '本地模式';
  renderLocal();
}

function renderLocal(): void {
  const users = localUsers();
  const names = Object.keys(users);
  const cur = localStorage.getItem('glorr.currentAccount') || '';
  const save = currentLocalSave();

  $('st-online').textContent = '—';
  $('st-rooms').textContent = '0';
  $('st-accounts').textContent = String(names.length);
  $('st-banned').textContent = '0';
  $('st-uptime').textContent = '本机';

  const rt = document.querySelector('#roomtable tbody');
  if (rt) rt.innerHTML = '<tr><td colspan="6">单机模式:无服务器房间</td></tr>';

  const tb = document.querySelector('#acctable tbody');
  if (!tb) return;
  tb.innerHTML = '';
  if (names.length === 0) {
    tb.innerHTML = '<tr><td colspan="9">本机还没有账号(游玩端 /account 注册后会出现在这里)</td></tr>';
  }
  for (const name of names) {
    const u = users[name];
    const isCur = name === cur;
    const char = isCur && save ? save : u;
    const inv = Array.isArray(char.inv) ? char.inv : [];
    const slots = Array.isArray(char.slotsList) ? char.slotsList : [];
    const petalCount = inv.length + slots.filter(Boolean).length;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${name}</td><td>${char.level ?? 1}</td><td>${char.kills ?? 0}</td><td>${petalCount}</td>` +
      `<td>${isCur ? '<span class="tag admin">当前</span>' : ''}</td>` +
      `<td><span class="tag ok">本机</span></td>` +
      `<td>${fmtTime(u.createdAt ?? 0)}</td><td>—</td>`;
    const td = document.createElement('td');
    const add = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = `actbtn ${cls}`.trim();
      b.textContent = label;
      b.addEventListener('click', fn);
      td.appendChild(b);
    };
    add('设为当前', '', () => {
      localStorage.setItem('glorr.currentAccount', name);
      localStorage.setItem(
        'glorr.save',
        JSON.stringify({
          level: u.level ?? 1,
          xp: u.xp ?? 0,
          kills: u.kills ?? 0,
          inv: u.inv ?? START_KIT.map((id) => ({ id, rarity: 0 })),
          slotsList: u.slotsList ?? [],
        }),
      );
      renderLocal();
    });
    add('清空存档', 'danger', () => {
      if (!window.confirm(`清空 ${name} 的存档?`)) return;
      u.level = 1;
      u.xp = 0;
      u.kills = 0;
      u.inv = START_KIT.map((id) => ({ id, rarity: 0 }));
      u.slotsList = [];
      saveLocalUsers(users);
      if (isCur) localStorage.removeItem('glorr.save');
      renderLocal();
    });
    add('删除', 'danger', () => {
      if (!window.confirm(`删除本机账号 ${name}?此操作不可恢复!`)) return;
      delete users[name];
      saveLocalUsers(users);
      if (isCur) localStorage.removeItem('glorr.currentAccount');
      renderLocal();
    });
    tr.appendChild(td);
    tb.appendChild(tr);
  }

  const logs = $('loglist');
  if (logs) {
    logs.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = '本地模式 · 未连接服务器,仅展示本机 localStorage 数据';
    logs.appendChild(li);
  }
}

// ---------- GitHub 仓库数据(存档) ----------

const GH_TOKEN_KEY = 'glorr.admin.ghToken';
const GH_REPO_KEY = 'glorr.admin.ghRepo';
const GH_DIR = 'glorr-saves';

interface GhEntry {
  name: string;
  path: string;
  sha: string;
}

function ghB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function ghB64d(s: string): string {
  const bin = atob(s.replace(/\s/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}
function ghUrl(repo: string, path: string): string {
  return `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function ghHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  if (json) h['content-type'] = 'application/json';
  return h;
}
async function ghList(token: string, repo: string): Promise<GhEntry[]> {
  const res = await fetch(ghUrl(repo, GH_DIR), { headers: ghHeaders(token) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`列目录失败(${res.status})`);
  const arr = (await res.json()) as { name: string; path: string; sha: string; type: string }[];
  return arr.filter((x) => x.type === 'file' && x.name.endsWith('.json'));
}
async function ghRead(token: string, repo: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(ghUrl(repo, path), { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`读取失败(${res.status})`);
  const j = (await res.json()) as { content?: string };
  if (!j.content) throw new Error('文件无内容');
  return JSON.parse(ghB64d(j.content)) as Record<string, unknown>;
}
async function ghWrite(token: string, repo: string, path: string, obj: unknown, sha?: string): Promise<void> {
  const body: Record<string, unknown> = { message: `glorr admin: ${path}`, content: ghB64(JSON.stringify(obj, null, 2)) };
  if (sha) body.sha = sha;
  const res = await fetch(ghUrl(repo, path), { method: 'PUT', headers: ghHeaders(token, true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`写入失败(${res.status}) ${await res.text()}`);
}
async function ghDelete(token: string, repo: string, path: string, sha: string): Promise<void> {
  const res = await fetch(ghUrl(repo, path), {
    method: 'DELETE',
    headers: ghHeaders(token, true),
    body: JSON.stringify({ message: `glorr admin delete: ${path}`, sha }),
  });
  if (!res.ok) throw new Error(`删除失败(${res.status})`);
}

function setGhMsg(text: string, kind: 'ok' | 'err' | '' = ''): void {
  const el = document.getElementById('gh-msg');
  if (el) {
    el.textContent = text;
    el.className = `msg${kind ? ` ${kind}` : ''}`;
  }
}

async function loadGh(): Promise<void> {
  const token = ($('gh-token') as HTMLInputElement).value.trim();
  const repo = ($('gh-repo') as HTMLInputElement).value.trim() || 'apple-PC/glorr';
  if (!token) {
    setGhMsg('请填写 GitHub Token(需 contents 读写权限)', 'err');
    return;
  }
  localStorage.setItem(GH_TOKEN_KEY, token);
  localStorage.setItem(GH_REPO_KEY, repo);
  setGhMsg('加载中…');
  try {
    const entries = await ghList(token, repo);
    const tbody = document.querySelector('#ghtable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">仓库里还没有存档(游玩端 /account 上传后出现)</td></tr>';
      setGhMsg('无存档文件');
      return;
    }
    for (const entry of entries) {
      const data = await ghRead(token, repo, entry.path);
      const name = String(data.name ?? entry.name.replace(/\.json$/, ''));
      const lv = Number(data.level ?? 1);
      const xp = Number(data.xp ?? 0);
      const kills = Number(data.kills ?? 0);
      const inv = Array.isArray(data.inv) ? (data.inv as unknown[]) : [];
      const slots = Array.isArray(data.slotsList) ? (data.slotsList as unknown[]).filter(Boolean) : [];
      const upd = Number(data.updatedAt ?? 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name}</td><td>${lv}</td><td>${xp}</td><td>${kills}</td><td>${inv.length + slots.length}</td><td>${fmtTime(upd)}</td>`;
      const td = document.createElement('td');
      const add = (label: string, cls: string, fn: () => void) => {
        const b = document.createElement('button');
        b.className = `actbtn ${cls}`.trim();
        b.textContent = label;
        b.addEventListener('click', fn);
        td.appendChild(b);
      };
      add('改等级', '', () => {
        const v = window.prompt(`设置 ${name} 的等级(1-200)`, String(lv));
        if (!v) return;
        const n = Math.max(1, Math.min(200, Math.round(Number(v) || 1)));
        void (async () => {
          try {
            await ghWrite(token, repo, entry.path, { ...data, level: n, updatedAt: Date.now() }, entry.sha);
            setGhMsg(`已修改 ${name} 等级为 ${n}`, 'ok');
            await loadGh();
          } catch (err) {
            setGhMsg(err instanceof Error ? err.message : String(err), 'err');
          }
        })();
      });
      add('重置存档', 'danger', () => {
        if (!window.confirm(`重置 ${name} 的仓库存档?`)) return;
        void (async () => {
          try {
            await ghWrite(
              token,
              repo,
              entry.path,
              {
                name,
                level: 1,
                xp: 0,
                kills: 0,
                inv: START_KIT.map((id) => ({ id, rarity: 0 })),
                slotsList: [],
                updatedAt: Date.now(),
              },
              entry.sha,
            );
            setGhMsg(`已重置 ${name}`, 'ok');
            await loadGh();
          } catch (err) {
            setGhMsg(err instanceof Error ? err.message : String(err), 'err');
          }
        })();
      });
      add('删除', 'danger', () => {
        if (!window.confirm(`删除仓库中的 ${name} 存档?此操作不可恢复!`)) return;
        void (async () => {
          try {
            await ghDelete(token, repo, entry.path, entry.sha);
            setGhMsg(`已删除 ${name}`, 'ok');
            await loadGh();
          } catch (err) {
            setGhMsg(err instanceof Error ? err.message : String(err), 'err');
          }
        })();
      });
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    setGhMsg(`已加载 ${entries.length} 份存档`, 'ok');
  } catch (err) {
    setGhMsg(err instanceof Error ? err.message : String(err), 'err');
  }
}

async function boot(): Promise<void> {
  const online = await probeServer();
  if (!online) {
    enterLocal();
    return;
  }
  if (adminToken) enterDash();
}

const ghTokenEl = document.getElementById('gh-token') as HTMLInputElement | null;
const ghRepoEl = document.getElementById('gh-repo') as HTMLInputElement | null;
if (ghTokenEl) ghTokenEl.value = localStorage.getItem(GH_TOKEN_KEY) || '';
if (ghRepoEl) ghRepoEl.value = localStorage.getItem(GH_REPO_KEY) || 'apple-PC/glorr';
document.getElementById('gh-load')?.addEventListener('click', () => void loadGh());

void boot();
