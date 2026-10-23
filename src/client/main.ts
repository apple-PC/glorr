// glorr 客户端入口:网络 / 输入 / 预测 / 渲染 / UI 总装
import { MAX_SLOTS, PLAYER, WORLD } from '@shared/constants';
import { MOBS } from '@shared/data/mobs';
import { getPetal, rotationSpeed } from '@shared/data/petals';
import { rarityName } from '@shared/constants';
import { TAU } from '@shared/math';
import { Camera } from '@client/camera';
import { Input } from '@client/input';
import { Net } from '@client/net';
import { Particles } from '@client/particles';
import { Renderer } from '@client/render';
import { Sfx } from '@client/audio';
import { Ui } from '@client/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = Math.min(2, window.devicePixelRatio || 1);

const net = new Net();
const sfx = new Sfx();
const particles = new Particles();
const camera = new Camera(window.innerWidth, window.innerHeight);
const input = new Input(canvas);
const renderer = new Renderer(canvas);

const ui = new Ui(net, {
  onEquip: (uid, slot) => net.send({ t: 'equip', uid, slot }),
  onUnequip: (slot) => net.send({ t: 'unequip', slot }),
  onMoveInv: (from, to) => net.send({ t: 'moveInv', from, to }),
  onDrop: (uid) => net.send({ t: 'drop', uid }),
  onCraft: (id, rarity) => net.send({ t: 'craft', id, rarity }),
  onRespawn: () => net.send({ t: 'respawn' }),
  onToggleSound: () => {
    sfx.enabled = !sfx.enabled;
    ui.setSoundLabel(sfx.enabled);
  },
});

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
let lastT = performance.now();
let inputAcc = 0;
let minimapAcc = 0;
let lastHitSfx = 0;

// ---------- 服务器地址解析 ----------
function defaultServer(): string {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('server');
  if (fromUrl) return fromUrl;
  const saved = localStorage.getItem('glorr.server');
  if (saved) return saved;
  // 由本机 Node 服务端托管页面时默认同源
  if (location.protocol === 'http:' && ['', '80', '8080'].includes(location.port)) {
    return `ws://${location.host}`;
  }
  return '';
}

const nameInput = document.getElementById('nameinput') as HTMLInputElement;
const serverInput = document.getElementById('serverinput') as HTMLInputElement;
const playBtn = document.getElementById('playbtn') as HTMLButtonElement;
nameInput.value = localStorage.getItem('glorr.name') || '';
serverInput.value = defaultServer();

async function start(): Promise<void> {
  const name = nameInput.value.trim() || '花朵';
  const server = serverInput.value.trim();
  if (!server) {
    ui.toast('请填写服务器地址(本地开发默认 ws://localhost:8080)');
    return;
  }
  localStorage.setItem('glorr.name', name);
  localStorage.setItem('glorr.server', server);
  sfx.ensure();
  playBtn.disabled = true;
  playBtn.textContent = '连接中…';
  try {
    await net.connect(server, name);
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : String(err));
    playBtn.disabled = false;
    playBtn.textContent = '开始游戏';
    return;
  }
  playBtn.disabled = false;
  playBtn.textContent = '开始游戏';
  ui.hideStart();
  running = true;
  ui.toast('已连接,正在进入花园…');
}

playBtn.addEventListener('click', () => void start());
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void start();
});
serverInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void start();
});

// ---------- 网络事件 ----------

net.onYou = (s) => {
  const prev = net.self;
  ui.setSelf(s);
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
  } else if (selfEnt && !s.dead) {
    // 误差修正(大跳变吸附,小误差平滑)
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
    case 'levelup':
      renderer.addFloat(self.x, self.y, `等级提升 ${v ?? ''}`, '#ffe65d');
      sfx.play('levelup');
      particles.ring(self.x, self.y, '#ffe65d', 70);
      ui.toast(`升级到 Lv.${v ?? ''}`);
      break;
    case 'death':
      sfx.play('death');
      particles.burst(self.x, self.y, '#ff8fb3', 26, 230, 5);
      ui.showDeath(net.self?.level ?? 1, net.self?.kills ?? 0);
      break;
    case 'pickup':
      sfx.play('pickup');
      break;
    case 'break': {
      const idx = v ?? 0;
      const ang = self.slotAngles[idx] ?? 0;
      particles.burst(self.x + Math.cos(ang) * PLAYER.petalOrbit, self.y + Math.sin(ang) * PLAYER.petalOrbit, '#ffffff', 9, 150, 3);
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

net.onClose = () => {
  running = false;
  ui.showStart();
  ui.toast('与服务器断开连接');
};

// ---------- 键盘 ----------
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    ui.toggleInv();
  } else if (e.key === 'Escape') {
    ui.closePanels();
  }
});

// ---------- 主循环 ----------
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running) return;

  net.tick(dt);
  const s = net.self;
  const selfEnt = net.selfEnt();

  // 输入上报(20Hz)
  inputAcc += dt;
  if (inputAcc >= 0.05) {
    inputAcc = 0;
    if (s && !s.dead) {
      const [dx, dy] = input.vector(self.x, self.y, camera);
      net.send({ t: 'in', x: dx, y: dy });
    }
  }

  if (s && !s.dead) {
    const [dx, dy] = input.vector(self.x, self.y, camera);
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
    // 花瓣角度推进
    const rot = rotationSpeed(s.slotList);
    for (let i = 0; i < s.slotList.length; i++) {
      if (!s.slotList[i]) continue;
      self.slotAngles[i] = (self.slotAngles[i] + rot * dt) % TAU;
    }
    camera.follow(self.x, self.y, dt);
    hitFx(s, now);
  } else if (selfEnt) {
    camera.follow(selfEnt.x, selfEnt.y, dt);
  }

  particles.update(dt);
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
  }
}

/** 客户端命中反馈:花瓣与怪物重叠时打火花 + 音效(节流) */
function hitFx(s: { slotList: ({ id: string; cdPct: number } | null)[] }, now: number): void {
  if (now - lastHitSfx < 70) return;
  const orbit = PLAYER.petalOrbit;
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
