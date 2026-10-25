// glorr 客户端入口:加载屏 → 账号(登录/注册)→ 主菜单 → 选图游玩
import { MAX_SLOTS, PLAYER, WORLD, isPvp, rarityName } from '@shared/constants';
import { MOBS } from '@shared/data/mobs';
import { getPetal, orbitRadius, rotationSpeed } from '@shared/data/petals';
import { TAU } from '@shared/math';
import { DEFAULT_SERVER_ID, SERVERS, getServer } from '@shared/servers';
import { BOULDERS, LAKE, PLAYER_SPAWN, blocked } from '@shared/garden';
import { getGardenCanvas } from '@client/gardenRender';
import { Camera } from '@client/camera';
import { Input } from '@client/input';
import { Net, type GameConn } from '@client/net';
import { LocalSim } from '@client/localSim';
import { Particles } from '@client/particles';
import { Renderer } from '@client/render';
import { Sfx } from '@client/audio';
import { MenuBg } from '@client/menu';
import { Ui } from '@client/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = Math.min(2, window.devicePixelRatio || 1);

const SOLO = !new URLSearchParams(location.search).has('online');
// 默认单机:模拟在浏览器内跑,无需服务器即可 Play;带 ?online 时切回联机模式。
const net: GameConn = SOLO ? new LocalSim() : new Net();
if (SOLO) {
  const g = window as unknown as { __glorr?: GameConn; __map?: unknown; __gardenCanvas?: HTMLCanvasElement | null };
  g.__glorr = net;
  // 测试用地图诊断信息
  g.__map = {
    boulders: BOULDERS.length,
    lake: LAKE,
    spawn: PLAYER_SPAWN,
    blockedLake: blocked(0, 0, 0),
    blockedSpawn: blocked(PLAYER_SPAWN[0], PLAYER_SPAWN[1], 26),
  };
  g.__gardenCanvas = getGardenCanvas();
}
const sfx = new Sfx();
const particles = new Particles();
const camera = new Camera(window.innerWidth, window.innerHeight);
const input = new Input(canvas);
const renderer = new Renderer(canvas);
net.onFloat = (x, y, text, color) => renderer.addFloat(x, y, text, color);
const menuBg = new MenuBg(document.getElementById('menubg') as HTMLCanvasElement);
const accountBg = new MenuBg(document.getElementById('accountbg') as HTMLCanvasElement);

// ---------- 会话状态 ----------

let currentServerId = DEFAULT_SERVER_ID;
let token = '';
let switching = false;
let account = { name: '', level: 1, kills: 0, admin: false };
let inMenu = false;

const tokenKey = (id: string) => `glorr.token.${id}`;

// 本地预测状态(服务端权威,客户端只做表现)
const self = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ang: -Math.PI / 2,
  hpPct: 1,
  invuln: false,
  slotAngles: Array.from({ length: MAX_SLOTS }, () => Math.random() * TAU),
};

let running = false;
let paused = false;
let lastT = performance.now();
let inputAcc = 0;
let minimapAcc = 0;
let listAcc = 0;
let lastHitSfx = 0;
let reconnectAttempts = 0;
let reconnectTimer = 0;
let lastSaveAt = 0;

const ui = new Ui(net, {
  onEquip: (uid, slot) => net.send({ t: 'equip', uid, slot }),
  onUnequip: (slot) => net.send({ t: 'unequip', slot }),
  onDrop: (uid) => net.send({ t: 'drop', uid }),
  onCraft: (id, rarity) => net.send({ t: 'craft', id, rarity }),
  onRespawn: () => net.send({ t: 'respawn' }),
  onToggleSound: () => {
    sfx.enabled = !sfx.enabled;
    ui.setSoundLabel(sfx.enabled);
    if (sfx.enabled) sfx.ensure();
  },
  onSendChat: (text) => net.send({ t: 'chat', text }),
  onLogin: (name, password) => {
    ui.accountMsg('');
    void (async () => {
      if (!(await ensureConnected())) return;
      net.login(name, password);
    })();
  },
  onRegister: (name, password) => {
    ui.accountMsg('');
    void (async () => {
      if (!(await ensureConnected())) return;
      net.register(name, password);
    })();
  },
  onSelectServer: (id) => void switchServer(id),
  onTalents: (t) => {
    if (SOLO) (net as LocalSim).applyTalents(t);
  },
});

/** 确保已连接到当前服务器;失败时在账号页显示可操作的错误 */
async function ensureConnected(): Promise<boolean> {
  if (SOLO) return true;
  if (net.connected) return true;
  const server = getServer(currentServerId) ?? SERVERS[0];
  ui.accountMsg(`正在连接 ${server.name}…`);
  try {
    await net.connect(server.url);
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    let hint = `无法连接 ${server.name}:${reason}`;
    if (location.protocol === 'https:' && server.url.startsWith('ws://')) {
      hint += '。请确认服务器地址已配置为 wss:// 公网域名';
    }
    ui.accountMsg(hint);
    return false;
  }
}

// ---------- 收藏持久化(菜单飘浮花瓣) ----------

const SHOWCASE: { id: string; rarity: number }[] = [
  { id: 'basic', rarity: 0 },
  { id: 'fast', rarity: 0 },
  { id: 'leaf', rarity: 1 },
  { id: 'rose', rarity: 1 },
  { id: 'stinger', rarity: 1 },
  { id: 'rock', rarity: 2 },
  { id: 'missile', rarity: 2 },
  { id: 'web', rarity: 2 },
  { id: 'faster', rarity: 2 },
  { id: 'honey', rarity: 2 },
  { id: 'peas', rarity: 2 },
  { id: 'magnet', rarity: 2 },
  { id: 'wing', rarity: 2 },
];

function loadCollection(): { id: string; rarity: number }[] {
  try {
    const raw = localStorage.getItem('glorr.collection');
    if (raw) {
      const arr = JSON.parse(raw) as { id: string; rarity: number }[];
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch {
    /* ignore */
  }
  return SHOWCASE;
}

function saveCollection(inv: { id: string; rarity: number }[]): void {
  const seen = new Map<string, { id: string; rarity: number }>();
  for (const it of inv) {
    const key = `${it.id}:${it.rarity}`;
    if (!seen.has(key)) seen.set(key, { id: it.id, rarity: it.rarity });
  }
  const arr = [...seen.values()].slice(0, 24);
  try {
    localStorage.setItem('glorr.collection', JSON.stringify(arr));
  } catch {
    /* ignore */
  }
  menuBg.setPetals(arr);
}

// ---------- 网络事件 ----------

/** 统一入口:显示账号屏(附带当前服务器名与背景) */
function showAccountScreen(): void {
  const server = getServer(currentServerId) ?? SERVERS[0];
  ui.setAccountServerName(server.name);
  ui.setAccountServerNote(serverNote(server));
  ui.showAccount();
  accountBg.setPetals(loadCollection());
  accountBg.start();
}

/** 服务器可用性提示(提前说明,避免点了才知道连不上) */
function serverNote(server: { name: string; url: string }): string {
  if (location.protocol === 'https:' && server.url.startsWith('ws://')) {
    return '';
  }
  return '';
}

net.onAuthOk = (info) => {
  account = { name: info.name, level: info.level, kills: info.kills, admin: info.admin };
  token = info.token;
  localStorage.setItem(tokenKey(currentServerId), info.token);
  ui.showAdminLink(info.admin);
  if (!inMenu) enterMenu();
};

net.onAuthErr = (reason) => {
  localStorage.removeItem(tokenKey(currentServerId));
  if (switching) {
    switching = false;
    ui.hideSettings();
    showAccountScreen();
    return;
  }
  if (inMenu) {
    ui.toast(reason);
    return;
  }
  ui.accountMsg(reason);
};

net.onYou = (s) => {
  const prev = net.self;
  reconnectAttempts = 0; // 成功拿到状态即视为重连完成
  ui.setSelf(s);
  if (performance.now() - lastSaveAt > 1500) {
    lastSaveAt = performance.now();
    saveCollection(s.inv);
  }
  const selfEnt = net.selfEnt();
  const justSpawned = selfEnt && (!prev || prev.dead) && !s.dead;
  if (justSpawned && selfEnt) {
    self.x = selfEnt.x;
    self.y = selfEnt.y;
    self.vx = 0;
    self.vy = 0;
    self.ang = -Math.PI / 2;
    camera.snapTo(self.x, self.y);
    self.slotAngles = s.slotList.map((_, i) => (i / Math.max(1, s.slotList.length)) * TAU);
    particles.clear();
    ui.hideDeath();
  } else if (selfEnt && !s.dead) {
    const err = Math.hypot(selfEnt.x - self.x, selfEnt.y - self.y);
    if (err > 260) {
      self.x = selfEnt.x;
      self.y = selfEnt.y;
    } else {
      self.x += (selfEnt.x - self.x) * 0.22;
      self.y += (selfEnt.y - self.y) * 0.22;
    }
  }
  self.hpPct = s.maxHp > 0 ? s.hp / s.maxHp : 0;
  self.invuln = s.invuln > 0;
};

net.onEv = (k, v) => {
  switch (k) {
    case 'levelup': {
      renderer.addFloat(self.x, self.y, `等级提升 ${v ?? ''}`, '#ffe65d');
      sfx.play('levelup');
      particles.ring(self.x, self.y, '#ffe65d', 70);
      const gain = ui.grantTp(v ?? 0);
      ui.toast(`升级到 Lv.${v ?? ''},获得 ${gain} 天赋点`);
      break;
    }
    case 'death': {
      sfx.play('death');
      particles.burst(self.x, self.y, '#ff8fb3', 26, 230, 5);
      // 死亡不掉落任何花瓣
      ui.showDeath(net.self?.level ?? 1, net.self?.kills ?? 0, '');
      break;
    }
    case 'respawn':
      ui.hideDeath();
      break;
    case 'pickup':
      sfx.play('pickup');
      break;
    case 'break': {
      const idx = v ?? 0;
      const ang = self.slotAngles[idx] ?? 0;
      const orbit = orbitRadius(net.self?.slotList ?? []);
      particles.burst(self.x + Math.cos(ang) * orbit, self.y + Math.sin(ang) * orbit, '#ffffff', 9, 150, 3);
      sfx.play('break');
      break;
    }
    case 'craft_ok':
      sfx.play('craft');
      ui.toast(`合成成功:${rarityName(v ?? 0)}`);
      break;
    case 'craft_fail':
      sfx.play('craftfail');
      ui.toast('合成失败,损失了部分材料');
      break;
  }
};

net.onEntGone = (e) => {
  if (e.kind === 'm') {
    const def = MOBS[e.species ?? 0];
    particles.burst(e.x, e.y, def?.color ?? '#ffffff', 16, 190, 4);
  } else if (e.kind === 'd') {
    particles.burst(e.x, e.y, '#ffffff', 5, 90, 2.5);
  }
};

net.onChat = (from, text) => ui.addChat(from, text);

net.onClose = () => {
  if (switching) return;
  const wasPlaying = running;
  running = false;
  inMenu = false;
  if (wasPlaying && account.name && reconnectAttempts < 5) {
    // 游玩中断线:指数退避自动重连(账号进度已保存在服务端)
    reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 8000);
    ui.addSysChat(`连接断开,${(delay / 1000).toFixed(0)}s 后第 ${reconnectAttempts} 次重连…`);
    reconnectTimer = window.setTimeout(() => void tryReconnect(), delay);
    return;
  }
  reconnectAttempts = 0;
  ui.addSysChat('与服务器断开连接');
  ui.toast('与服务器断开连接');
  showAccountScreen();
};

async function tryReconnect(): Promise<void> {
  const server = getServer(currentServerId) ?? SERVERS[0];
  try {
    await net.connect(server.url);
    net.join(token);
    // 重连成功:welcome + you 会重置预测态并恢复游戏
  } catch {
    // 失败:onClose 会安排下一次重连
  }
}

// ---------- 界面流程 ----------

const readyBtn = document.getElementById('readybtn') as HTMLButtonElement;
const gardenBtn = document.getElementById('map-garden') as HTMLButtonElement;
const menuScreen = document.getElementById('menuscreen')!;

window.setTimeout(() => {
  ui.hideLoading();
  ui.bindAccount();
  void bootstrap();
}, 900);

window.addEventListener('resize', () => {
  menuBg.resize();
  accountBg.resize();
});

async function bootstrap(): Promise<void> {
  if (SOLO) {
    const nm = localStorage.getItem('glorr.currentAccount');
    account = { name: nm || '游客', level: 1, kills: 0, admin: false };
    try {
      const d = JSON.parse(localStorage.getItem('glorr.save') || '{}') as { level?: number; kills?: number };
      account.level = d.level ?? 1;
      account.kills = d.kills ?? 0;
    } catch {
      /* ignore */
    }
    sfx.ensure();
    enterMenu();
    return;
  }
  const saved = localStorage.getItem('glorr.server');
  if (saved && SERVERS.some((s) => s.id === saved)) currentServerId = saved;
  const server = getServer(currentServerId) ?? SERVERS[0];
  currentServerId = server.id;
  token = localStorage.getItem(tokenKey(server.id)) || '';
  sfx.ensure();

  if (token) {
    // 有 token:静默恢复会话
    try {
      await net.connect(server.url);
      net.whoami(token);
      window.setTimeout(() => {
        if (!inMenu) {
          showAccountScreen();
        }
      }, 2500);
      return;
    } catch {
      /* 落到账号屏 */
    }
  }
  showAccountScreen();
}

function enterMenu(): void {
  inMenu = true;
  ui.hideSettings();
  ui.hideAccount();
  ui.setAccountChip(account.name, account.level, account.kills);
  menuBg.setPetals(loadCollection());
  menuBg.start();
  accountBg.stop();
  menuScreen.classList.remove('hidden');
}

function onReady(): void {
  if (!account.name) {
    ui.toast('请先登录或注册账号');
    showAccountScreen();
    return;
  }
  readyBtn.disabled = true;
  readyBtn.textContent = '已就绪 ✓';
  gardenBtn.classList.add('pulse');
  ui.toast('选择地图开始游戏');
}

readyBtn.addEventListener('click', onReady);

// ---------- 暂停 ----------

const pauseScreen = document.getElementById('pausescreen')!;

function setPaused(on: boolean): void {
  if (on && !running) return;
  paused = on;
  pauseScreen.classList.toggle('hidden', !on);
  if (!on) lastT = performance.now();
}

function quitToMenu(): void {
  paused = false;
  running = false;
  pauseScreen.classList.add('hidden');
  document.getElementById('hud')!.classList.add('hidden');
  ui.hideSettings();
  enterMenu();
}

document.getElementById('pause-resume')?.addEventListener('click', () => setPaused(false));
document.getElementById('pause-settings')?.addEventListener('click', () => {
  // 从暂停进设置:保持冻结,隐藏暂停面板避免遮挡;关闭设置后再回到暂停
  pauseScreen.classList.add('hidden');
  ui.openSettings();
});
document.getElementById('pause-quit')?.addEventListener('click', () => quitToMenu());
document.getElementById('settingsclose')?.addEventListener('click', () => {
  if (paused) pauseScreen.classList.remove('hidden');
});

// ---------- 天赋(左下角按钮) ----------

function useTalent(kind: 'speed' | 'magnet' | 'heal'): void {
  net.talent?.(kind);
  const names: Record<string, string> = { speed: '加速', magnet: '磁铁', heal: '治疗' };
  ui.toast(`天赋 · ${names[kind]}`);
  const btn = document.querySelector<HTMLButtonElement>(`[data-talent="${kind}"]`);
  if (btn) {
    btn.classList.add('cooling');
    window.setTimeout(() => btn.classList.remove('cooling'), 20000);
  }
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-talent]')) {
  b.addEventListener('click', () => useTalent(b.dataset.talent as 'speed' | 'magnet' | 'heal'));
}

/** 攻击/防御姿态:右键或 Shift = 收拢(-1),左键或空格 = 张开(+1),否则 0 */
function currentStance(): -1 | 0 | 1 {
  if (input.mouseRight || input.isDown('shift')) return -1;
  if (input.mouseLeft || input.isDown(' ')) return 1;
  return 0;
}

gardenBtn.addEventListener('click', () => {
  if (!readyBtn.disabled) {
    ui.toast('先点击「准备就绪」');
    return;
  }
  void play();
});

async function play(): Promise<void> {
  sfx.ensure();
  if (SOLO) {
    running = true;
    ui.hideMenu();
    menuBg.stop();
    ui.loadTalents(); // 恢复天赋点与已点天赋并应用到本地模拟
    return;
  }
  const server = getServer(currentServerId) ?? SERVERS[0];
  gardenBtn.disabled = true;
  gardenBtn.textContent = '连接中…';
  try {
    if (!net.connected) await net.connect(server.url);
    net.join(token);
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : String(err));
    gardenBtn.disabled = false;
    gardenBtn.textContent = '花园';
    return;
  }
  gardenBtn.disabled = false;
  gardenBtn.textContent = '花园';
  running = true;
  ui.hideMenu();
  menuBg.stop();
}

async function switchServer(id: string): Promise<void> {
  if (SOLO) return;
  const server = getServer(id);
  if (!server || id === currentServerId) return;
  switching = true;
  running = false;
  net.close();
  currentServerId = id;
  localStorage.setItem('glorr.server', id);
  token = localStorage.getItem(tokenKey(id)) || '';
  account = { name: '', level: 1, kills: 0, admin: false };
  try {
    await net.connect(server.url);
    if (token) {
      net.whoami(token);
      // whoami 成功 → onAuthOk → enterMenu;失败 → onAuthErr → 账号屏
    } else {
      switching = false;
      ui.hideSettings();
      showAccountScreen();
    }
  } catch {
    switching = false;
    ui.hideSettings();
    showAccountScreen();
    ui.accountMsg(`无法连接 ${server.name}`);
  }
}

// ---------- 键盘 ----------

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const craftOpen = !document.getElementById('craftmodal')!.classList.contains('hidden');
    const settingsOpen = !document.getElementById('settingsmodal')!.classList.contains('hidden');
    const panelOpen =
      !document.getElementById('invmodal')!.classList.contains('hidden') ||
      !document.getElementById('talentmodal')!.classList.contains('hidden') ||
      !document.getElementById('bestmodal')!.classList.contains('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    if (craftOpen) {
      ui.closeCraft();
      return;
    }
    if (settingsOpen) {
      // 关闭设置:若处于暂停则回到暂停面板(保持冻结)
      ui.hideSettings();
      if (paused) pauseScreen.classList.remove('hidden');
      return;
    }
    if (panelOpen) {
      ui.closePanels();
      return;
    }
    if (running) setPaused(!paused);
    return;
  }
  if (ui.isChatFocused()) return;
  // 左下功能键:背包 / 天赋 / 合成 / 图鉴(对齐 florr)
  if (running && (e.key === 'b' || e.key === 'B')) {
    ui.toggleInventory();
    return;
  }
  if (running && (e.key === 't' || e.key === 'T')) {
    ui.toggleTalents();
    return;
  }
  if (running && (e.key === 'f' || e.key === 'F')) {
    ui.toggleCraft();
    return;
  }
  if (running && (e.key === 'v' || e.key === 'V')) {
    ui.toggleBestiary();
    return;
  }
  if (e.key === 'z' || e.key === 'Z') {
    useTalent('speed');
    return;
  }
  if (e.key === 'x' || e.key === 'X') {
    useTalent('magnet');
    return;
  }
  if (e.key === 'c' || e.key === 'C') {
    useTalent('heal');
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    ui.focusChat();
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    ui.equipEntry(idx);
  }
});

// ---------- 主循环 ----------

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running) return;

  if (!paused) net.tick(dt);
  const s = net.self;
  const selfEnt = net.selfEnt();
  const chatFocused = ui.isChatFocused();

  if (!paused) {
    inputAcc += dt;
    if (inputAcc >= 0.05 && s && !s.dead && !chatFocused) {
      inputAcc = 0;
      const [dx, dy] = input.vector(self.x, self.y, camera);
      net.send({ t: 'in', x: dx, y: dy, expand: currentStance() });
    }
  }

  if (!paused && SOLO) {
    // 单机:位置以 LocalSim 权威为准,渲染直接跟随
    const se = selfEnt;
    if (se) {
      self.x = se.x;
      self.y = se.y;
      self.ang = se.ang ?? self.ang;
      camera.follow(se.x, se.y, dt);
    }
    if (s && !s.dead) {
      const rot = rotationSpeed(s.slotList);
      for (let i = 0; i < s.slotList.length; i++) {
        if (!s.slotList[i]) continue;
        self.slotAngles[i] = (self.slotAngles[i] + rot * dt) % TAU;
      }
      self.hpPct = s.maxHp > 0 ? s.hp / s.maxHp : 0;
      self.invuln = s.invuln > 0;
      hitFx(s, now);
    }
  } else if (!paused && s && !s.dead) {
    const [dx, dy] = chatFocused ? [0, 0] : input.vector(self.x, self.y, camera);
    if (dx !== 0 || dy !== 0) {
      self.ang = Math.atan2(dy, dx);
      const k = Math.min(1, PLAYER.accel * dt);
      self.vx += (dx * PLAYER.speed - self.vx) * k;
      self.vy += (dy * PLAYER.speed - self.vy) * k;
    } else {
      const fk = Math.min(1, PLAYER.accel * 1.6 * dt);
      self.vx -= self.vx * fk;
      self.vy -= self.vy * fk;
    }
    self.x += self.vx * dt;
    self.y += self.vy * dt;
    const r = Math.hypot(self.x, self.y);
    const maxR = WORLD.radius - 40;
    if (r > maxR) {
      self.x = (self.x / r) * maxR;
      self.y = (self.y / r) * maxR;
      self.vx *= 0.4;
      self.vy *= 0.4;
    }
    const rot = rotationSpeed(s.slotList);
    for (let i = 0; i < s.slotList.length; i++) {
      if (!s.slotList[i]) continue;
      self.slotAngles[i] = (self.slotAngles[i] + rot * dt) % TAU;
    }
    camera.follow(self.x, self.y, dt);
    hitFx(s, now);
  } else if (!paused && selfEnt) {
    camera.follow(selfEnt.x, selfEnt.y, dt);
  }

  particles.update(paused ? 0 : dt);
  renderer.draw(
    ctx,
    dpr,
    camera,
    net,
    {
      x: self.x,
      y: self.y,
      ang: self.ang,
      hpPct: self.hpPct,
      invuln: self.invuln,
      slotAngles: self.slotAngles,
    },
    now / 1000,
    particles,
  );
  ui.tickSlots();

  minimapAcc += dt;
  if (minimapAcc >= 0.25) {
    minimapAcc = 0;
    ui.drawMinimapFrame();
    ui.setLatency(net.latency);
    const se = net.selfEnt();
    ui.setZoneText(se && isPvp(se.x, se.y) ? '花园 · PvP 区' : '花园');
  }
  listAcc += dt;
  if (listAcc >= 0.5) {
    listAcc = 0;
    ui.updatePlayerList();
  }
}

/** 客户端命中反馈:花瓣与怪物重叠时打火花 + 音效(节流) */
function hitFx(s: { slotList: ({ id: string; cdPct: number } | null)[] }, now: number): void {
  if (now - lastHitSfx < 70) return;
  const orbit = orbitRadius(s.slotList);
  for (let i = 0; i < s.slotList.length; i++) {
    const slot = s.slotList[i];
    if (!slot) continue;
    const def = getPetal(slot.id);
    if (def.kind === 'ranged' && slot.cdPct > 0) continue;
    const ang = self.slotAngles[i] ?? 0;
    const px = self.x + Math.cos(ang) * orbit;
    const py = self.y + Math.sin(ang) * orbit;
    for (const e of net.ents.values()) {
      if (e.kind !== 'm' || e.species === undefined) continue;
      const def2 = MOBS[e.species];
      if (!def2) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      if (dx * dx + dy * dy < (def2.radius + 13) ** 2) {
        lastHitSfx = now;
        sfx.play('hit');
        particles.spark(px, py, '#fff8d6', ang + Math.PI, 3);
        return;
      }
    }
  }
}

// ---------- 尺寸 ----------

function resize(): void {
  renderer.resize(dpr);
  camera.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
