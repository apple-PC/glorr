// glorr 管理后台逻辑
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

const $ = (id: string) => document.getElementById(id)!;

function api(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(path, {
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

// ---------- 启动:有 token 直接进控制台 ----------

if (adminToken) enterDash();
