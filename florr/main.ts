// 【装配层】只做组装:sim(唯一权威) + view(只读作画) + ui(只读 + 意图) + input
// 重写契约:本文件不含任何玩法规则;规则一律在 sim/ 与 data/。
import { MAX_SLOTS, PLAYER, rarityName } from '@/data/rules';
import { MOBS } from '@/data/mobs';
import { getPetal, orbitRadius, rotationSpeed } from '@/data/petals';
import { TAU } from '@/sim/math';
import { BOULDERS, LAKE, PLAYER_SPAWN, blocked } from '@/sim/geometry';
import { getGardenCanvas } from '@/view/garden';
import { Camera } from '@/view/camera';
import { Input } from '@/input';
import { LocalSim } from '@/sim/sim';
import { Particles } from '@/view/particles';
import { Renderer } from '@/view/renderer';
import { Sfx } from '@/view/audio';
import { MenuBg } from '@/view/menu';
import { Ui } from '@/ui/ui';

// ---------------------------------------------------------------------------
// 组装
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dpr = Math.min(2, window.devicePixelRatio || 1);

const sim = new LocalSim();          // 唯一模拟核心
const sfx = new Sfx();
const particles = new Particles();
const camera = new Camera(window.innerWidth, window.innerHeight);
const input = new Input(canvas);
const renderer = new Renderer(canvas);
const menuBg = new MenuBg(document.getElementById('menubg') as HTMLCanvasElement);
const accountBg = new MenuBg(document.getElementById('accountbg') as HTMLCanvasElement);

sim.onFloat = (x, y, text, color) => renderer.addFloat(x, y, text, color);

const ui = new Ui(sim, {
  onEquip: (uid, slot) => sim.send({ t: 'equip', uid, slot }),
  onUnequip: (slot) => sim.send({ t: 'unequip', slot }),
  onDrop: (uid) => sim.send({ t: 'drop', uid }),
  onCraft: (id, rarity) => sim.send({ t: 'craft', id, rarity }),
  onRespawn: () => sim.send({ t: 'respawn' }),
  onToggleSound: () => {
    sfx.enabled = !sfx.enabled;
    ui.setSoundLabel(sfx.enabled);
    if (sfx.enabled) sfx.ensure();
  },
  onSendChat: () => { /* 单机无聊天对象 */ },
  // 还原阶段:账号/服务器归零,保留空实现以兼容 UI 接口
  onLogin: () => {},
  onRegister: () => {},
  onSelectServer: () => {},
  onTalents: (t) => sim.applyTalents(t),
});

// ---------------------------------------------------------------------------
// 会话状态(仅表现层)
// ---------------------------------------------------------------------------
const self = {
  x: 0, y: 0, ang: -Math.PI / 2,
  hpPct: 1, invuln: false,
  slotAngles: Array.from({ length: MAX_SLOTS }, () => Math.random() * TAU),
};
let running = false;
let paused = false;
let lastT = performance.now();
let inputAcc = 0;
let minimapAcc = 0;
let listAcc = 0;
let lastHitSfx = 0;
let lastSaveAt = 0;

// ---------------------------------------------------------------------------
// sim 事件 → 表现
// ---------------------------------------------------------------------------
sim.onYou = (s) => {
  const prev = sim.self;
  ui.setSelf(s);
  if (performance.now() - lastSaveAt > 1500) {
    lastSaveAt = performance.now();
    const seen = new Map<string, { id: string; rarity: number }>();
    for (const it of s.inv) {
      const key = `${it.id}:${it.rarity}`;
      if (!seen.has(key)) seen.set(key, { id: it.id, rarity: it.rarity });
    }
    menuBg.setPetals([...seen.values()].slice(0, 24));
  }
  const selfEnt = sim.selfEnt();
  if (selfEnt && (!prev || prev.dead) && !s.dead) {
    self.x = selfEnt.x; self.y = selfEnt.y;
    self.ang = -Math.PI / 2;
    camera.snapTo(self.x, self.y);
    self.slotAngles = s.slotList.map((_, i) => (i / Math.max(1, s.slotList.length)) * TAU);
    particles.clear();
    ui.hideDeath();
  }
  self.hpPct = s.maxHp > 0 ? s.hp / s.maxHp : 0;
  self.invuln = s.invuln > 0;
};

sim.onEv = (k, v) => {
  switch (k) {
    case 'levelup':
      renderer.addFloat(self.x, self.y, `等级提升 ${v ?? ''}`, '#ffe65d');
      sfx.play('levelup');
      particles.ring(self.x, self.y, '#ffe65d', 70);
      ui.toast(`升级到 Lv.${v ?? ''},获得 ${ui.grantTp(v ?? 0)} 天赋点`);
      break;
    case 'death':
      sfx.play('death');
      particles.burst(self.x, self.y, '#ff8fb3', 26, 230, 5);
      // 还原阶段沿用现行规则(死亡不掉落);按 wiki 校准在阶段 B
      ui.showDeath(sim.self?.level ?? 1, sim.self?.kills ?? 0, '');
      break;
    case 'respawn': ui.hideDeath(); break;
    case 'pickup': sfx.play('pickup'); break;
    case 'break': {
      const ang = self.slotAngles[v ?? 0] ?? 0;
      const orbit = orbitRadius(sim.self?.slotList ?? []);
      particles.burst(self.x + Math.cos(ang) * orbit, self.y + Math.sin(ang) * orbit, '#ffffff', 9, 150, 3);
      sfx.play('break');
      break;
    }
    case 'craft_ok': sfx.play('craft'); ui.toast(`合成成功:${rarityName(v ?? 0)}`); break;
    case 'craft_fail': sfx.play('craftfail'); ui.toast('合成失败,损失了部分材料'); break;
  }
};

sim.onEntGone = (e) => {
  if (e.kind === 'm') particles.burst(e.x, e.y, MOBS[e.species ?? 0]?.color ?? '#ffffff', 16, 190, 4);
  else if (e.kind === 'd') particles.burst(e.x, e.y, '#ffffff', 5, 90, 2.5);
};

// ---------------------------------------------------------------------------
// 界面流程(还原阶段:无账号屏,加载直接进主菜单)
// ---------------------------------------------------------------------------
const readyBtn = document.getElementById('readybtn') as HTMLButtonElement;
const gardenBtn = document.getElementById('map-garden') as HTMLButtonElement;
const pauseScreen = document.getElementById('pausescreen')!;

window.setTimeout(() => {
  ui.hideLoading();
  sfx.ensure();
  enterMenu();
}, 500);

window.addEventListener('resize', () => { menuBg.resize(); accountBg.resize(); resize(); });

function enterMenu(): void {
  ui.hideSettings();
  ui.hideAccount();
  ui.setAccountChip('Flower', sim.self?.level ?? 1, sim.self?.kills ?? 0);
  menuBg.setPetals(START_SHOWCASE);
  menuBg.start();
  accountBg.stop();
  document.getElementById('menuscreen')!.classList.remove('hidden');
}

const START_SHOWCASE: { id: string; rarity: number }[] = [
  { id: 'basic', rarity: 0 }, { id: 'fast', rarity: 0 }, { id: 'leaf', rarity: 1 },
  { id: 'rose', rarity: 1 }, { id: 'stinger', rarity: 1 }, { id: 'rock', rarity: 2 },
  { id: 'missile', rarity: 2 }, { id: 'web', rarity: 2 }, { id: 'faster', rarity: 2 },
  { id: 'honey', rarity: 2 }, { id: 'peas', rarity: 2 }, { id: 'magnet', rarity: 2 },
  { id: 'wing', rarity: 2 },
];

readyBtn.addEventListener('click', () => {
  readyBtn.disabled = true;
  readyBtn.textContent = '已就绪 ✓';
  gardenBtn.classList.add('pulse');
});

gardenBtn.addEventListener('click', () => {
  if (!readyBtn.disabled) { ui.toast('先点击「准备就绪」'); return; }
  sfx.ensure();
  running = true;
  ui.hideMenu();
  menuBg.stop();
  ui.loadTalents();
});

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
  pauseScreen.classList.add('hidden');
  ui.openSettings();
});
document.getElementById('pause-quit')?.addEventListener('click', () => quitToMenu());
document.getElementById('settingsclose')?.addEventListener('click', () => {
  if (paused) pauseScreen.classList.remove('hidden');
});

function useTalent(kind: 'speed' | 'magnet' | 'heal'): void {
  sim.talent(kind);
  const names: Record<string, string> = { speed: '加速', magnet: '磁铁', heal: '治疗' };
  ui.toast(`天赋 · ${names[kind]}`);
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-talent]')) {
  b.addEventListener('click', () => useTalent(b.dataset.talent as 'speed' | 'magnet' | 'heal'));
}

/** 姿态:右键/Shift 收拢防御(-1),左键/空格 张开攻击(+1),否则常态 */
function currentStance(): -1 | 0 | 1 {
  if (input.mouseRight || input.isDown('shift')) return -1;
  if (input.mouseLeft || input.isDown(' ')) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// 键盘
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const craftOpen = !document.getElementById('craftmodal')!.classList.contains('hidden');
    const settingsOpen = !document.getElementById('settingsmodal')!.classList.contains('hidden');
    const panelOpen =
      !document.getElementById('invmodal')!.classList.contains('hidden') ||
      !document.getElementById('talentmodal')!.classList.contains('hidden') ||
      !document.getElementById('bestmodal')!.classList.contains('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    if (craftOpen) { ui.closeCraft(); return; }
    if (settingsOpen) { ui.hideSettings(); if (paused) pauseScreen.classList.remove('hidden'); return; }
    if (panelOpen) { ui.closePanels(); return; }
    if (running) setPaused(!paused);
    return;
  }
  if (ui.isChatFocused()) return;
  if (running && (e.key === 'b' || e.key === 'B')) { ui.toggleInventory(); return; }
  if (running && (e.key === 't' || e.key === 'T')) { ui.toggleTalents(); return; }
  if (running && (e.key === 'f' || e.key === 'F')) { ui.toggleCraft(); return; }
  if (running && (e.key === 'v' || e.key === 'V')) { ui.toggleBestiary(); return; }
  if (e.key === 'z' || e.key === 'Z') { useTalent('speed'); return; }
  if (e.key === 'x' || e.key === 'X') { useTalent('magnet'); return; }
  if (e.key === 'c' || e.key === 'C') { useTalent('heal'); return; }
  if (e.key === 'Enter') { e.preventDefault(); ui.focusChat(); return; }
  if (/^[0-9]$/.test(e.key)) {
    ui.equipEntry(e.key === '0' ? 9 : Number(e.key) - 1);
  }
});

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running) return;

  if (!paused) sim.tick(dt);
  const s = sim.self;
  const selfEnt = sim.selfEnt();
  const chatFocused = ui.isChatFocused();

  if (!paused) {
    inputAcc += dt;
    if (inputAcc >= 0.05 && s && !s.dead && !chatFocused) {
      inputAcc = 0;
      const [dx, dy] = input.vector(self.x, self.y, camera);
      sim.send({ t: 'in', x: dx, y: dy, expand: currentStance() });
    }
    if (selfEnt) {
      self.x = selfEnt.x;
      self.y = selfEnt.y;
      self.ang = selfEnt.ang ?? self.ang;
      camera.follow(self.x, self.y, dt);
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
  }

  particles.update(paused ? 0 : dt);
  renderer.draw(ctx, dpr, camera, sim, {
    x: self.x, y: self.y, ang: self.ang,
    hpPct: self.hpPct, invuln: self.invuln, slotAngles: self.slotAngles,
  }, now / 1000, particles);
  ui.tickSlots();

  minimapAcc += dt;
  if (minimapAcc >= 0.25) {
    minimapAcc = 0;
    ui.drawMinimapFrame();
    ui.setLatency(0);
    ui.setZoneText('Garden');
  }
  listAcc += dt;
  if (listAcc >= 0.5) { listAcc = 0; ui.updatePlayerList(); }
}

/** 命中反馈:花瓣与怪物重叠时火花 + 音效(节流) */
function hitFx(s: { slotList: ({ id: string; cdPct: number } | null)[] }, now: number): void {
  if (now - lastHitSfx < 70) return;
  const orbit = orbitRadius(s.slotList);
  for (let i = 0; i < s.slotList.length; i++) {
    const slot = s.slotList[i];
    if (!slot) continue;
    if (getPetal(slot.id).kind === 'ranged' && slot.cdPct > 0) continue;
    const ang = self.slotAngles[i] ?? 0;
    const px = self.x + Math.cos(ang) * orbit;
    const py = self.y + Math.sin(ang) * orbit;
    for (const e of sim.ents.values()) {
      if (e.kind !== 'm' || e.species === undefined) continue;
      const def2 = MOBS[e.species];
      if (!def2) continue;
      const dx = e.x - px, dy = e.y - py;
      if (dx * dx + dy * dy < (def2.radius + 13) ** 2) {
        lastHitSfx = now;
        sfx.play('hit');
        particles.spark(px, py, '#fff8d6', ang + Math.PI, 3);
        return;
      }
    }
  }
}

function resize(): void {
  renderer.resize(dpr);
  camera.resize(window.innerWidth, window.innerHeight);
}
resize();

// ---------------------------------------------------------------------------
// 调试钩子(仅供 solo-check / shot 端到端验证,不是玩法接口)
// ---------------------------------------------------------------------------
type DebugWindow = {
  __glorr?: LocalSim;
  __map?: unknown;
  __gardenCanvas?: HTMLCanvasElement | null;
  __content?: unknown;
};
const g = window as unknown as DebugWindow;
g.__glorr = sim;
g.__map = {
  boulders: BOULDERS.length,
  lake: LAKE,
  spawn: PLAYER_SPAWN,
  blockedLake: blocked(0, 0, 0),
  blockedSpawn: blocked(PLAYER_SPAWN[0], PLAYER_SPAWN[1], 26),
};
g.__gardenCanvas = getGardenCanvas();
import { CONTENT_STATS } from '@/data/areas';
g.__content = CONTENT_STATS;

void PLAYER;

requestAnimationFrame(frame);
