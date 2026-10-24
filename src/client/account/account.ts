// glorr 账号页:本地账号(注册/登录/档案) + 可选 GitHub 存档同步
// 账号与存档默认保存在本机 localStorage;登录后可用自己的 GitHub Token 把存档同步到仓库。
import { RARITY_COLORS, START_KIT, rarityName } from '@shared/constants';
import { getPetal } from '@shared/data/petals';

const USERS_KEY = 'glorr.users';
const CUR_KEY = 'glorr.currentAccount';
const SAVE_KEY = 'glorr.save';
const TOKEN_KEY = 'glorr.ghToken';
const REPO_KEY = 'glorr.ghRepo';
const DEFAULT_REPO = 'apple-PC/glorr';

interface SavedChar {
  level: number;
  xp: number;
  kills: number;
  inv: { id: string; rarity: number }[];
  slotsList: ({ id: string; rarity: number } | null)[];
}
interface UserRecord extends SavedChar {
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------- 存储 ----------

function loadUsers(): Record<string, UserRecord> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, UserRecord>) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
function saveUsers(u: Record<string, UserRecord>): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}
function getCurrent(): string {
  return localStorage.getItem(CUR_KEY) || '';
}
function readSave(): SavedChar | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SavedChar>;
    return {
      level: d.level ?? 1,
      xp: d.xp ?? 0,
      kills: d.kills ?? 0,
      inv: Array.isArray(d.inv) ? d.inv : [],
      slotsList: Array.isArray(d.slotsList) ? d.slotsList : [],
    };
  } catch {
    return null;
  }
}
function writeSave(c: SavedChar): void {
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({ level: c.level, xp: c.xp, kills: c.kills, inv: c.inv, slotsList: c.slotsList }),
  );
}

function randSalt(): string {
  const a = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPw(salt: string, pw: string): Promise<string> {
  const s = `${salt}:${pw}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `fb${(h >>> 0).toString(16)}`;
}

// ---------- 视图切换 ----------

function showAuth(): void {
  $('authview').classList.remove('hidden');
  $('profileview').classList.add('hidden');
}
function showProfile(): void {
  $('authview').classList.add('hidden');
  $('profileview').classList.remove('hidden');
}

function setMsg(id: string, text: string, kind: 'err' | 'ok' | '' = ''): void {
  const el = $(id);
  el.textContent = text;
  el.className = `msg${kind ? ` ${kind}` : ''}`;
}

// ---------- 档案渲染 ----------

function renderProfile(): void {
  const name = getCurrent();
  const users = loadUsers();
  const u = name ? users[name] : undefined;
  if (!u) {
    showAuth();
    return;
  }
  const char = readSave() ?? u;
  showProfile();
  $('pname').textContent = u.name;
  $('pmeta').textContent = `等级 ${char.level} · 经验 ${char.xp} · 击杀 ${char.kills}`;
  $('gh-token').setAttribute('value', '');
  ($('gh-token') as HTMLInputElement).value = localStorage.getItem(TOKEN_KEY) || '';
  ($('gh-repo') as HTMLInputElement).value = localStorage.getItem(REPO_KEY) || DEFAULT_REPO;

  // 背包/装备聚合
  const inv = $('pinv');
  inv.innerHTML = '';
  const counts = new Map<string, number>();
  for (const it of char.inv) {
    if (!it) continue;
    const k = `${it.id}:${it.rarity}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const s of char.slotsList) {
    if (!s) continue;
    const k = `${s.id}:${s.rarity}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) {
    inv.innerHTML = '<span class="empty">背包空空如也</span>';
    return;
  }
  const entries = [...counts.entries()].sort((a, b) => {
    const ra = Number(a[0].split(':')[1]);
    const rb = Number(b[0].split(':')[1]);
    return rb - ra;
  });
  for (const [key, n] of entries) {
    const [id, rarityS] = key.split(':');
    const rarity = Number(rarityS);
    const def = getPetal(id);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = RARITY_COLORS[rarity] ?? '#ccc';
    chip.innerHTML = `${def?.name ?? id}·${rarityName(rarity)} <small>×${n}</small>`;
    inv.appendChild(chip);
  }
}

// ---------- 注册 / 登录 / 退出 ----------

let mode: 'login' | 'register' = 'login';

function setMode(next: 'login' | 'register'): void {
  mode = next;
  $('tab-login').classList.toggle('active', next === 'login');
  $('tab-register').classList.toggle('active', next === 'register');
  ($('acc-go') as HTMLButtonElement).textContent = next === 'login' ? '登录' : '注册并进入';
  ($('acc-pass') as HTMLInputElement).placeholder = next === 'login' ? '密码(至少 4 位)' : '设置密码(至少 4 位)';
  setMsg('acc-msg', '');
}

async function submit(): Promise<void> {
  const name = ($('acc-name') as HTMLInputElement).value.trim();
  const pw = ($('acc-pass') as HTMLInputElement).value;
  if (name.length < 2 || name.length > 12) {
    setMsg('acc-msg', '名称需 2-12 个字符', 'err');
    return;
  }
  if (/[^\w\u4e00-\u9fa5-]/.test(name)) {
    setMsg('acc-msg', '名称只能包含中文、字母、数字、下划线或短横线', 'err');
    return;
  }
  if (pw.length < 4) {
    setMsg('acc-msg', '密码至少 4 位', 'err');
    return;
  }
  const users = loadUsers();

  if (mode === 'register') {
    if (users[name]) {
      setMsg('acc-msg', '该名称已被注册', 'err');
      return;
    }
    const salt = randSalt();
    const hash = await hashPw(salt, pw);
    const user: UserRecord = {
      name,
      salt,
      hash,
      level: 1,
      xp: 0,
      kills: 0,
      inv: START_KIT.map((id) => ({ id, rarity: 0 })),
      slotsList: [],
      createdAt: Date.now(),
    };
    users[name] = user;
    saveUsers(users);
    localStorage.setItem(CUR_KEY, name);
    writeSave(user);
    setMsg('acc-msg', '注册成功,正在进入…', 'ok');
    window.setTimeout(() => renderProfile(), 350);
    return;
  }

  // 登录
  const user = users[name];
  if (!user) {
    setMsg('acc-msg', '账号不存在,请先注册', 'err');
    return;
  }
  const hash = await hashPw(user.salt, pw);
  if (hash !== user.hash) {
    setMsg('acc-msg', '密码错误', 'err');
    return;
  }
  localStorage.setItem(CUR_KEY, name);
  writeSave(user);
  setMsg('acc-msg', '登录成功,正在进入…', 'ok');
  window.setTimeout(() => renderProfile(), 300);
}

/** 退出前把当前游戏存档写回账号记录,避免进度丢失 */
function persistCurrent(): void {
  const name = getCurrent();
  if (!name) return;
  const users = loadUsers();
  const u = users[name];
  if (!u) return;
  const char = readSave();
  if (char) {
    u.level = char.level;
    u.xp = char.xp;
    u.kills = char.kills;
    u.inv = char.inv;
    u.slotsList = char.slotsList;
    saveUsers(users);
  }
}

function logout(): void {
  persistCurrent();
  localStorage.removeItem(CUR_KEY);
  setMsg('acc-msg', '');
  showAuth();
}

// ---------- GitHub 存档同步 ----------

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(s: string): string {
  const bin = atob(s.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function contentsUrl(repo: string, path: string): string {
  const seg = path.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${repo}/contents/${seg}`;
}

async function ghPush(token: string, repo: string, path: string, obj: unknown): Promise<void> {
  const url = contentsUrl(repo, path);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'content-type': 'application/json',
  };
  let sha: string | undefined;
  const g = await fetch(url, { headers });
  if (g.ok) {
    const j = (await g.json()) as { sha?: string };
    sha = j.sha;
  } else if (g.status !== 404) {
    throw new Error(`读取仓库失败(${g.status})`);
  }
  const body: Record<string, unknown> = {
    message: `glorr save: ${path}`,
    content: b64encode(JSON.stringify(obj, null, 2)),
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`上传失败(${r.status}) ${await r.text()}`);
}

async function ghPull(token: string, repo: string, path: string): Promise<SavedChar & { name?: string }> {
  const r = await fetch(contentsUrl(repo, path), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`拉取失败(${r.status})`);
  const j = (await r.json()) as { content?: string };
  if (!j.content) throw new Error('远程文件无内容');
  const obj = JSON.parse(b64decode(j.content)) as SavedChar & { name?: string };
  if (!obj || !Array.isArray(obj.inv)) throw new Error('远程存档格式不正确');
  return obj;
}

function withBusy(btn: HTMLButtonElement, busy: boolean, label: string): void {
  btn.disabled = busy;
  btn.textContent = busy ? '请稍候…' : label;
}

// ---------- 绑定 ----------

function bind(): void {
  $('tab-login').addEventListener('click', () => setMode('login'));
  $('tab-register').addEventListener('click', () => setMode('register'));
  $('acc-go').addEventListener('click', () => void submit());
  for (const id of ['acc-name', 'acc-pass']) {
    $(id).addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void submit();
    });
  }
  $('logout').addEventListener('click', () => logout());

  $('gh-push').addEventListener('click', () => {
    const btn = $('gh-push') as HTMLButtonElement;
    const token = ($('gh-token') as HTMLInputElement).value.trim();
    const repo = ($('gh-repo') as HTMLInputElement).value.trim() || DEFAULT_REPO;
    const name = getCurrent();
    if (!token) return setMsg('gh-msg', '请先填写 GitHub Token', 'err');
    if (!name) return setMsg('gh-msg', '请先登录账号', 'err');
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REPO_KEY, repo);
    const char = readSave() ?? loadUsers()[name];
    withBusy(btn, true, '上传存档到 GitHub');
    void ghPush(token, repo, `glorr-saves/${name}.json`, { name, ...char, updatedAt: Date.now() })
      .then(() => setMsg('gh-msg', '已上传 ✓', 'ok'))
      .catch((e: unknown) => setMsg('gh-msg', e instanceof Error ? e.message : String(e), 'err'))
      .finally(() => withBusy(btn, false, '上传存档到 GitHub'));
  });

  $('gh-pull').addEventListener('click', () => {
    const btn = $('gh-pull') as HTMLButtonElement;
    const token = ($('gh-token') as HTMLInputElement).value.trim();
    const repo = ($('gh-repo') as HTMLInputElement).value.trim() || DEFAULT_REPO;
    const name = getCurrent();
    if (!token) return setMsg('gh-msg', '请先填写 GitHub Token', 'err');
    if (!name) return setMsg('gh-msg', '请先登录账号', 'err');
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REPO_KEY, repo);
    withBusy(btn, true, '从 GitHub 拉取');
    void ghPull(token, repo, `glorr-saves/${name}.json`)
      .then((remote) => {
        const users = loadUsers();
        const u = users[name];
        if (u) {
          u.level = remote.level ?? u.level;
          u.xp = remote.xp ?? u.xp;
          u.kills = remote.kills ?? u.kills;
          u.inv = remote.inv ?? u.inv;
          u.slotsList = remote.slotsList ?? u.slotsList;
          saveUsers(users);
          writeSave(u);
        }
        renderProfile();
        setMsg('gh-msg', '已拉取并覆盖本机存档 ✓', 'ok');
      })
      .catch((e: unknown) => setMsg('gh-msg', e instanceof Error ? e.message : String(e), 'err'))
      .finally(() => withBusy(btn, false, '从 GitHub 拉取'));
  });

  $('tab-login').classList.add('active');
}

bind();

// 进入时:有当前账号则显示档案,否则登录页
if (getCurrent() && loadUsers()[getCurrent()]) {
  renderProfile();
} else {
  showAuth();
}
