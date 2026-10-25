// glorr 单机本地模拟:在浏览器内跑完整权威模拟(怪物 AI / 花瓣轨道 / 碰撞 / 掉落 / 合成 / 升级 / 背包)
// 实现与 Net 相同的 GameConn 公共接口,渲染层与 UI 无需感知是单机还是联机。
import * as C from '@shared/constants';
import { getMob, SPECIES_INDEX } from '@shared/data/mobs';
import {
  getPetal,
  petalMaxHp,
  petalDmg,
  petalHealPerSec,
  petalOnHitHeal,
  rotationSpeed,
  orbitRadius,
  pickupRadius,
} from '@shared/data/petals';
import type { ClientMsg } from '@shared/protocol';
import type { PetalDef, PetalInst, SlotWire } from '@shared/types';
import type { EntState, EvKind, GameConn, OtherInfo, SelfState } from '@client/net';

const TAU = Math.PI * 2;
const SAVE_KEY = 'glorr.save';
const ACCOUNT_KEY = 'glorr.currentAccount';

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function weightedPick(w: number[]): number {
  let sum = 0;
  for (const x of w) sum += x;
  if (sum <= 0) return 0;
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

/** 花瓣破碎后的再生冷却(秒);远程按装填时间,近战/治疗/增益给固定冷却 */
function reloadFor(def: PetalDef): number {
  // florr:花瓣破碎后按冷却再生,基础花瓣约 2.5s
  if (def.reload > 0) return def.reload;
  return 2.5;
}

interface SlotState {
  id: string;
  rarity: number;
  hp: number;
  maxHp: number;
  hitCd: number;
  reloadT: number;
  /** 破碎待再生 */
  broken: boolean;
  /** 再生剩余冷却(秒) */
  regenT: number;
}
interface MobEnt {
  id: number;
  defId: string;
  species: number;
  rarity: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  ang: number;
  target: number;
  retaliateUntil: number;
  attackCd: number;
  shotCd: number;
  wanderAng: number;
  wanderT: number;
}
interface DropEnt {
  id: number;
  petalId: string;
  rarity: number;
  x: number;
  y: number;
  bornAt: number;
  /** 掉落物出现后约 0.5s 才可拾取(florr 机制) */
  pickableAt: number;
}
interface ProjEnt {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: string;
  dmg: number;
  range: number;
  traveled: number;
  fromMob: boolean;
}
interface WebEnt {
  id: number;
  x: number;
  y: number;
  r: number;
  until: number;
}

export class LocalSim implements GameConn {
  readonly solo = true;
  connected = true;
  selfId = 1;
  self: SelfState | null = null;
  ents = new Map<number, EntState>();
  othersLoadout = new Map<number, [string, number][]>();
  othersInfo = new Map<number, OtherInfo>();
  latency = 0;

  onWelcome: (() => void) | null = null;
  onYou: ((s: SelfState) => void) | null = null;
  onEv: ((k: EvKind, v?: number) => void) | null = null;
  onEntGone: ((e: EntState) => void) | null = null;
  onClose: (() => void) | null = null;
  onChat: ((from: string, text: string) => void) | null = null;
  onAuthOk: ((info: { token: string; name: string; level: number; kills: number; admin: boolean }) => void) | null = null;
  onAuthErr: ((reason: string) => void) | null = null;

  private name = '你';
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private ang = -Math.PI / 2;
  private hp = C.PLAYER.baseHp;
  private maxHp = C.PLAYER.baseHp;
  private level = 1;
  private xp = 0;
  private kills = 0;
  private slotList: (SlotState | null)[] = new Array(C.MAX_SLOTS).fill(null);
  private slots = 5;
  private inv: PetalInst[] = [];
  private dead = false;
  private invulnUntil = 0;
  private respawnAt = 0;
  private slowUntil = 0;
  private inputX = 0;
  private inputY = 0;
  private time = 0;
  private nextId = 2;
  private nextUid = 1;
  private mobs = new Map<number, MobEnt>();
  private drops = new Map<number, DropEnt>();
  private projs = new Map<number, ProjEnt>();
  private webs = new Map<number, WebEnt>();
  private saveT = 0;

  constructor() {
    this.load();
    this.updateSlots();
    this.autoEquip();
    this.maintainMobs();
    this.syncEnts();
    this.emitYou();
  }

  // ---------- GameConn 接口 ----------

  connect(): Promise<void> {
    return Promise.resolve();
  }
  register(): void {
    /* 单机无账号服务器 */
  }
  login(): void {
    /* 单机无账号服务器 */
  }
  whoami(): void {
    /* 单机无账号服务器 */
  }
  join(): void {
    /* 单机无需加入房间 */
  }

  send(msg: ClientMsg): void {
    switch (msg.t) {
      case 'in':
        this.inputX = msg.x;
        this.inputY = msg.y;
        break;
      case 'equip':
        this.equip(msg.uid, msg.slot);
        break;
      case 'unequip':
        this.unequip(msg.slot);
        break;
      case 'drop':
        this.dropItem(msg.uid);
        break;
      case 'craft':
        this.craft(msg.id, msg.rarity);
        break;
      case 'respawn':
        if (this.dead) {
          this.respawnAt = 0;
          this.doRespawn();
        }
        break;
      default:
        break;
    }
  }

  close(): void {
    /* 单机无连接 */
  }

  renderPos(e: EntState): [number, number] {
    return [e.x, e.y];
  }

  selfEnt(): EntState | undefined {
    return this.ents.get(this.selfId);
  }

  // ---------- 主循环 ----------

  tick(dt: number): void {
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.time += dt;
    if (!this.dead) this.updatePlayer(dt);
    this.updateMobs(dt);
    this.updatePetals(dt);
    this.updateBroken(dt);
    this.updateProjectiles(dt);
    this.updateWebs();
    this.updateDrops();
    this.maintainMobs();
    this.syncEnts();
    this.emitYou();
    if (this.dead && this.respawnAt > 0 && this.time >= this.respawnAt) this.doRespawn();
    this.saveT += dt;
    if (this.saveT > 3) {
      this.saveT = 0;
      this.save();
    }
  }

  // ---------- 玩家 ----------

  private updatePlayer(dt: number): void {
    const spd = C.PLAYER.speed * (this.time < this.slowUntil ? 0.62 : 1);
    const len = Math.hypot(this.inputX, this.inputY);
    if (len > 0) {
      const nx = this.inputX / len;
      const ny = this.inputY / len;
      this.ang = Math.atan2(ny, nx);
      const k = Math.min(1, C.PLAYER.accel * dt);
      this.vx += (nx * spd - this.vx) * k;
      this.vy += (ny * spd - this.vy) * k;
    } else {
      const fk = Math.min(1, C.PLAYER.accel * 1.6 * dt);
      this.vx -= this.vx * fk;
      this.vy -= this.vy * fk;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const r = Math.hypot(this.x, this.y);
    const maxR = C.WORLD.radius - 40;
    if (r > maxR) {
      this.x = (this.x / r) * maxR;
      this.y = (this.y / r) * maxR;
      this.vx *= 0.4;
      this.vy *= 0.4;
    }
    // 治疗类花瓣持续回血
    let heal = 0;
    for (const s of this.slotList) {
      if (!s) continue;
      const def = getPetal(s.id);
      if (def.healPerSec) heal += petalHealPerSec(def, s.rarity);
    }
    if (heal > 0) this.hp = Math.min(this.maxHp, this.hp + heal * dt);
  }

  private damagePlayer(dmg: number, fromX: number, fromY: number): void {
    if (this.dead || this.time < this.invulnUntil) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.killPlayer();
    } else {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.vx += Math.cos(a) * 150;
      this.vy += Math.sin(a) * 150;
    }
  }

  /** 死亡:先通知(便于 UI 统计损失,此时仍未清空),再掉落全部携带物并清空 */
  private killPlayer(): void {
    this.dead = true;
    this.hp = 0;
    this.respawnAt = this.time + C.PLAYER.respawnDelay;
    this.onEv?.('death');
    this.dropAll();
    this.save();
  }

  /** 死亡掉落:装备槽 + 背包全部变为地面掉落物(修复"掉落并非预期") */
  private dropAll(): void {
    for (const s of this.slotList) {
      if (s && !s.broken) this.spawnDrop(s.id, s.rarity, this.x + rand(-26, 26), this.y + rand(-26, 26));
    }
    for (const it of this.inv) {
      this.spawnDrop(it.id, it.rarity, this.x + rand(-30, 30), this.y + rand(-30, 30));
    }
    this.slotList = new Array(C.MAX_SLOTS).fill(null);
    this.inv = [];
  }

  private doRespawn(): void {
    const a = Math.random() * TAU;
    const r = Math.random() * C.WORLD.safeRadius * 0.5;
    this.x = Math.cos(a) * r;
    this.y = Math.sin(a) * r;
    this.vx = 0;
    this.vy = 0;
    this.ang = -Math.PI / 2;
    this.dead = false;
    this.hp = this.maxHp;
    this.invulnUntil = this.time + C.PLAYER.spawnInvuln;
    this.respawnAt = 0;
    this.slowUntil = 0;
    // 重生回到新手套装(等级/经验/击杀保留)
    this.inv = C.START_KIT.map((id) => ({ uid: this.nextUid++, id, rarity: 0 }));
    this.slotList = new Array(C.MAX_SLOTS).fill(null);
    this.autoEquip();
    this.onEv?.('respawn');
    this.emitYou();
    this.save();
  }

  // ---------- 怪物 ----------

  private updateMobs(dt: number): void {
    const now = this.time;
    for (const m of this.mobs.values()) {
      const def = getMob(m.defId);
      const dmgMult = C.MOB_DMG_MULT[m.rarity] ?? 1;
      let hasTarget = false;
      if (def.behavior === 'aggressive') {
        if (!this.dead && dist(m.x, m.y, this.x, this.y) <= def.aggro) hasTarget = true;
      } else if (def.behavior === 'neutral') {
        if (now < m.retaliateUntil && !this.dead) hasTarget = true;
      }
      m.target = hasTarget ? this.selfId : 0;

      if (def.behavior !== 'static' && def.speed > 0) {
        if (m.target) {
          const a = Math.atan2(this.y - m.y, this.x - m.x);
          m.ang = a;
          m.x += Math.cos(a) * def.speed * dt;
          m.y += Math.sin(a) * def.speed * dt;
        } else {
          m.wanderT -= dt;
          if (m.wanderT <= 0) {
            m.wanderT = rand(1.5, 3.5);
            m.wanderAng = Math.random() * TAU;
          }
          m.ang = m.wanderAng;
          m.x += Math.cos(m.wanderAng) * def.speed * 0.35 * dt;
          m.y += Math.sin(m.wanderAng) * def.speed * 0.35 * dt;
        }
        const rr = Math.hypot(m.x, m.y);
        const maxR = C.WORLD.radius - 30;
        if (rr > maxR) {
          m.x = (m.x / rr) * maxR;
          m.y = (m.y / rr) * maxR;
        }
      }

      // 接触:花瓣挡在中间时只消耗花瓣,不直接咬到花心
      m.attackCd -= dt;
      if (!this.dead && dist(m.x, m.y, this.x, this.y) < def.radius + C.PLAYER.radius * 0.8) {
        if (this.petalAt(m.x, m.y, def.radius)) {
          const a = Math.atan2(m.y - this.y, m.x - this.x);
          m.x += Math.cos(a) * 8;
          m.y += Math.sin(a) * 8;
        } else if (m.attackCd <= 0) {
          m.attackCd = 0.9;
          this.damagePlayer(def.dmg * dmgMult, m.x, m.y);
        }
      }

      // 远程怪
      if (def.ranged) {
        m.shotCd -= dt;
        if (!this.dead && m.shotCd <= 0 && dist(m.x, m.y, this.x, this.y) < def.ranged.range) {
          m.shotCd = def.ranged.cd;
          const a = Math.atan2(this.y - m.y, this.x - m.x);
          this.spawnProj(
            m.x,
            m.y,
            Math.cos(a) * def.ranged.speed,
            Math.sin(a) * def.ranged.speed,
            'sting',
            def.ranged.dmg * dmgMult,
            def.ranged.range,
            true,
          );
        }
      }
    }
  }

  private maintainMobs(): void {
    let total = this.mobs.size;
    const target = Math.min(140, C.RINGS.reduce((a, r) => a + r.density, 0));
    if (total >= target) return;
    for (let i = 0; i < 3 && this.mobs.size < target; i++) {
      const ring = C.RINGS[1 + Math.floor(Math.random() * (C.RINGS.length - 1))];
      if (!ring || !ring.species.length) continue;
      const a = Math.random() * TAU;
      const r = rand(ring.r0 + 20, ring.r1 - 20);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const speciesId = ring.species[Math.floor(Math.random() * ring.species.length)];
      const rarity = weightedPick(ring.rarityW);
      const hpMult = C.MOB_HP_MULT[rarity] ?? 1;
      const def = getMob(speciesId);
      const id = this.nextId++;
      this.mobs.set(id, {
        id,
        defId: speciesId,
        species: SPECIES_INDEX.get(speciesId) ?? 0,
        rarity,
        hp: def.hp * hpMult,
        maxHp: def.hp * hpMult,
        x,
        y,
        ang: Math.random() * TAU,
        target: 0,
        retaliateUntil: 0,
        attackCd: rand(0, 1),
        shotCd: rand(0, 2),
        wanderAng: Math.random() * TAU,
        wanderT: rand(1, 3),
      });
    }
  }

  private damageMob(m: MobEnt, dmg: number): void {
    const def = getMob(m.defId);
    const armor = (def.armor ?? 0) * (C.MOB_ARMOR_MULT[m.rarity] ?? 1);
    const real = Math.max(1, dmg - armor);
    m.hp -= real;
    if (def.behavior === 'neutral') {
      m.retaliateUntil = this.time + 6;
      m.target = this.selfId;
    }
    if (m.hp <= 0) this.killMob(m);
  }

  private killMob(m: MobEnt): void {
    const def = getMob(m.defId);
    this.xp += def.xp * (C.MOB_XP_MULT[m.rarity] ?? 1);
    while (this.xp >= C.xpForLevel(this.level)) {
      this.xp -= C.xpForLevel(this.level);
      this.level++;
      this.updateSlots();
      this.onEv?.('levelup', this.level);
    }
    this.kills++;
    const n = 1 + (m.rarity >= 2 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
    for (let i = 0; i < n; i++) this.rollDrop(m);
    this.mobs.delete(m.id);
    const e = this.ents.get(m.id);
    if (e) {
      this.onEntGone?.(e);
      this.ents.delete(m.id);
    }
  }

  private rollDrop(m: MobEnt): void {
    const def = getMob(m.defId);
    const cap = Math.min(m.rarity, C.MOB_MAX_DROP_RARITY);
    for (let attempt = 0; attempt < 2; attempt++) {
      const wi = weightedPick(def.drops.map((d) => d[1]));
      const petalId = def.drops[wi][0];
      const pdef = getPetal(petalId);
      if (pdef.minRarity > cap) continue;
      const w: number[] = [];
      for (let r = 0; r <= cap; r++) w.push(cap - r + 1);
      let rar = weightedPick(w);
      rar = Math.max(rar, pdef.minRarity);
      this.spawnDrop(petalId, rar, m.x + rand(-24, 24), m.y + rand(-24, 24));
      return;
    }
  }

  private spawnDrop(petalId: string, rarity: number, x: number, y: number): void {
    const id = this.nextId++;
    this.drops.set(id, { id, petalId, rarity, x, y, bornAt: this.time, pickableAt: this.time + 0.5 });
  }

  // ---------- 花瓣 / 弹丸 / 蛛网 ----------

  private updatePetals(dt: number): void {
    const loadout = this.slotList;
    const R = orbitRadius(loadout);
    const rot = rotationSpeed(loadout);
    const count = Math.max(1, loadout.length);

    for (let i = 0; i < C.MAX_SLOTS; i++) {
      const s = loadout[i];
      if (!s || s.broken) continue;
      const def = getPetal(s.id);
      s.hitCd = Math.max(0, s.hitCd - dt);
      const angle = (i / count) * TAU + rot * this.time;
      const px = this.x + Math.cos(angle) * R;
      const py = this.y + Math.sin(angle) * R;

      if (def.kind === 'ranged') {
        s.reloadT -= dt;
        if (!this.dead && s.reloadT <= 0) {
          s.reloadT = def.reload;
          const n = def.projCount ?? 1;
          for (let k = 0; k < n; k++) {
            const a = angle + (n > 1 ? (k / n) * TAU : 0);
            const kind = def.id === 'web' ? 'web' : def.id === 'peas' ? 'pea' : 'missile';
            this.spawnProj(
              px,
              py,
              Math.cos(a) * (def.projSpeed ?? 380),
              Math.sin(a) * (def.projSpeed ?? 380),
              kind,
              petalDmg(def, s.rarity),
              def.projRange ?? 500,
              false,
            );
          }
        }
      } else if (def.kind === 'melee' || (def.kind === 'heal' && (def.onHitHeal ?? 0) > 0)) {
        if (this.dead || s.hitCd > 0) continue;
        for (const m of this.mobs.values()) {
          const md = getMob(m.defId);
          const rr = md.radius + 13;
          if (dist2(m.x, m.y, px, py) < rr * rr) {
            s.hitCd = 0.35;
            this.damageMob(m, petalDmg(def, s.rarity));
            // 碰撞击退:怪物被花瓣顶开一点
            const kb = Math.atan2(m.y - py, m.x - px);
            m.x += Math.cos(kb) * 6;
            m.y += Math.sin(kb) * 6;
            if (def.onHitHeal) this.hp = Math.min(this.maxHp, this.hp + petalOnHitHeal(def, s.rarity));
            s.hp -= md.dmg * C.PLAYER.petalWear;
            if (s.hp <= 0) {
              s.broken = true;
              s.regenT = reloadFor(def);
              this.onEv?.('break', i);
            }
            break;
          }
        }
      }
    }
  }

  /** 破碎花瓣的冷却再生:冷却结束恢复满耐久 */
  private updateBroken(dt: number): void {
    for (const s of this.slotList) {
      if (!s || !s.broken) continue;
      s.regenT -= dt;
      if (s.regenT <= 0) {
        s.broken = false;
        s.regenT = 0;
        s.hp = s.maxHp;
      }
    }
  }

  /** 查询某点是否落在某个装备花瓣的命中范围内(用于拦截怪物/弹幕) */
  private petalAt(x: number, y: number, pad: number): { s: SlotState; i: number } | null {
    const loadout = this.slotList;
    const R = orbitRadius(loadout);
    const rot = rotationSpeed(loadout);
    const count = Math.max(1, loadout.length);
    for (let i = 0; i < C.MAX_SLOTS; i++) {
      const s = loadout[i];
      if (!s || s.broken) continue;
      const a = (i / count) * TAU + rot * this.time;
      const px = this.x + Math.cos(a) * R;
      const py = this.y + Math.sin(a) * R;
      const rr = pad + 12;
      if (dist2(x, y, px, py) < rr * rr) return { s, i };
    }
    return null;
  }

  private spawnProj(
    x: number,
    y: number,
    vx: number,
    vy: number,
    kind: string,
    dmg: number,
    range: number,
    fromMob: boolean,
  ): void {
    const id = this.nextId++;
    this.projs.set(id, { id, x, y, vx, vy, kind, dmg, range, traveled: 0, fromMob });
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projs.values()) {
      const dx = p.vx * dt;
      const dy = p.vy * dt;
      p.x += dx;
      p.y += dy;
      p.traveled += Math.hypot(dx, dy);
      if (p.traveled > p.range) {
        this.projs.delete(p.id);
        continue;
      }
      if (p.fromMob) {
        // 花瓣可拦截敌方弹幕(防御)
        const blocked = this.petalAt(p.x, p.y, 8);
        if (blocked) {
          blocked.s.hp -= p.dmg * C.PLAYER.petalWear;
          if (blocked.s.hp <= 0) {
            blocked.s.broken = true;
            blocked.s.regenT = reloadFor(getPetal(blocked.s.id));
            this.onEv?.('break', blocked.i);
          }
          this.projs.delete(p.id);
          continue;
        }
        if (!this.dead && dist(p.x, p.y, this.x, this.y) < C.PLAYER.radius + 5) {
          this.damagePlayer(p.dmg, p.x, p.y);
          this.projs.delete(p.id);
        }
        continue;
      }
      let hit = false;
      for (const m of this.mobs.values()) {
        const md = getMob(m.defId);
        const rr = md.radius + 6;
        if (dist2(p.x, p.y, m.x, m.y) < rr * rr) {
          this.damageMob(m, p.dmg);
          hit = true;
          break;
        }
      }
      if (hit) {
        this.projs.delete(p.id);
        continue;
      }
      if (p.kind === 'web') {
        this.webs.set(p.id, { id: p.id, x: p.x, y: p.y, r: 70, until: this.time + 3 });
        this.projs.delete(p.id);
      }
    }
  }

  private updateWebs(): void {
    for (const w of this.webs.values()) {
      if (this.time >= w.until) {
        this.webs.delete(w.id);
        continue;
      }
      if (!this.dead && dist2(w.x, w.y, this.x, this.y) < w.r * w.r) this.slowUntil = this.time + 0.4;
    }
  }

  private updateDrops(): void {
    const pr = pickupRadius(this.slotList);
    for (const d of this.drops.values()) {
      const limit = C.DROP_DESPAWN[d.rarity] ?? 30;
      if (Number.isFinite(limit) && this.time - d.bornAt > limit) {
        this.drops.delete(d.id);
        this.ents.delete(d.id);
        continue;
      }
      if (this.dead) continue;
      if (this.time < d.pickableAt) continue;
      if (this.inv.length >= C.PLAYER.invCap) continue;
      if (dist2(d.x, d.y, this.x, this.y) <= pr * pr) {
        this.inv.push({ uid: this.nextUid++, id: d.petalId, rarity: d.rarity });
        this.drops.delete(d.id);
        this.ents.delete(d.id);
        this.onEv?.('pickup', d.rarity);
        this.updateSlots();
      }
    }
  }

  // ---------- 背包 / 装备 / 合成 ----------

  private equip(uid: number, slot: number): void {
    if (slot < 0 || slot >= C.MAX_SLOTS || slot >= this.slots) return;
    const idx = this.inv.findIndex((it) => it.uid === uid);
    if (idx < 0) return;
    const item = this.inv.splice(idx, 1)[0];
    const prev = this.slotList[slot];
    const def = getPetal(item.id);
    const hp = petalMaxHp(def, item.rarity);
    this.slotList[slot] = { id: item.id, rarity: item.rarity, hp, maxHp: hp, hitCd: 0, reloadT: 0, broken: false, regenT: 0 };
    if (prev) this.inv.push({ uid: this.nextUid++, id: prev.id, rarity: prev.rarity });
    this.updateSlots();
  }

  private unequip(slot: number): void {
    if (slot < 0 || slot >= C.MAX_SLOTS) return;
    const s = this.slotList[slot];
    if (!s) return;
    this.inv.push({ uid: this.nextUid++, id: s.id, rarity: s.rarity });
    this.slotList[slot] = null;
  }

  private dropItem(uid: number): void {
    const idx = this.inv.findIndex((it) => it.uid === uid);
    if (idx < 0) return;
    const item = this.inv.splice(idx, 1)[0];
    this.spawnDrop(item.id, item.rarity, this.x + rand(-24, 24), this.y + rand(-24, 24));
  }

  private craft(id: string, rarity: number): void {
    const matching = this.inv.filter((it) => it.id === id && it.rarity === rarity);
    if (matching.length < C.CRAFT_INPUT) return;
    const take = new Set(matching.slice(0, C.CRAFT_INPUT).map((it) => it.uid));
    this.inv = this.inv.filter((it) => !take.has(it.uid));
    const chance = C.CRAFT_SUCCESS[rarity] ?? 0;
    if (Math.random() < chance) {
      this.inv.push({ uid: this.nextUid++, id, rarity: rarity + 1 });
      this.onEv?.('craft_ok', rarity + 1);
    } else {
      const lost = 1 + Math.floor(Math.random() * 4);
      const keep = Math.max(0, C.CRAFT_INPUT - lost);
      for (let i = 0; i < keep; i++) this.inv.push({ uid: this.nextUid++, id, rarity });
      this.onEv?.('craft_fail');
    }
    this.updateSlots();
    this.save();
  }

  private autoEquip(): void {
    for (let i = 0; i < this.slots && i < C.MAX_SLOTS; i++) {
      if (this.slotList[i]) continue;
      if (this.inv.length === 0) break;
      const item = this.inv.shift()!;
      const def = getPetal(item.id);
      const hp = petalMaxHp(def, item.rarity);
      this.slotList[i] = { id: item.id, rarity: item.rarity, hp, maxHp: hp, hitCd: 0, reloadT: 0, broken: false, regenT: 0 };
    }
  }

  private updateSlots(): void {
    // 槽位随等级解锁(5 起,每 3 级 +1,上限 10),与 florr 一致
    this.slots = Math.min(C.MAX_SLOTS, 5 + Math.floor((this.level - 1) / 3));
  }

  // ---------- 状态输出 ----------

  private emitYou(): void {
    const slotList: (SlotWire | null)[] = this.slotList.map((s) => {
      if (!s || s.broken) return null;
      const def = getPetal(s.id);
      const cdPct = def.reload > 0 ? Math.max(0, Math.min(1, s.reloadT / def.reload)) : 0;
      return { id: s.id, rarity: s.rarity, hpPct: s.maxHp > 0 ? s.hp / s.maxHp : 0, cdPct } as SlotWire;
    });
    const s: SelfState = {
      id: this.selfId,
      name: this.name,
      level: this.level,
      xp: this.xp,
      xpNeed: C.xpForLevel(this.level),
      hp: this.hp,
      maxHp: this.maxHp,
      slots: this.slots,
      slotList,
      inv: this.inv.map((it) => ({ uid: it.uid, id: it.id, rarity: it.rarity })),
      dead: this.dead,
      kills: this.kills,
      invuln: Math.max(0, this.invulnUntil - this.time),
    };
    this.self = s;
    this.onYou?.(s);
  }

  private syncEnts(): void {
    const now = performance.now();
    // 自己
    let me = this.ents.get(this.selfId);
    if (!me) {
      me = { kind: 'p', x: this.x, y: this.y, px: this.x, py: this.y, stamp: now, bornAt: now };
      this.ents.set(this.selfId, me);
    } else {
      me.px = me.x;
      me.py = me.y;
      me.x = this.x;
      me.y = this.y;
      me.stamp = now;
    }
    me.ang = this.ang;
    me.hpPct = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    me.name = this.name;

    for (const m of this.mobs.values()) {
      let e = this.ents.get(m.id);
      if (!e) {
        e = { kind: 'm', x: m.x, y: m.y, px: m.x, py: m.y, stamp: now, bornAt: now };
        this.ents.set(m.id, e);
      } else {
        e.px = e.x;
        e.py = e.y;
        e.x = m.x;
        e.y = m.y;
        e.stamp = now;
      }
      e.species = m.species;
      e.rarity = m.rarity;
      e.hpPct = m.maxHp > 0 ? m.hp / m.maxHp : 0;
    }

    for (const d of this.drops.values()) {
      let e = this.ents.get(d.id);
      if (!e) {
        e = { kind: 'd', x: d.x, y: d.y, px: d.x, py: d.y, stamp: now, bornAt: now };
        this.ents.set(d.id, e);
      }
      e.petalId = d.petalId;
      e.rarity = d.rarity;
    }

    for (const p of this.projs.values()) {
      let e = this.ents.get(p.id);
      if (!e) {
        e = { kind: 'b', x: p.x, y: p.y, px: p.x, py: p.y, stamp: now, bornAt: now };
        this.ents.set(p.id, e);
      } else {
        e.px = e.x;
        e.py = e.y;
        e.x = p.x;
        e.y = p.y;
        e.stamp = now;
      }
      e.vx = p.vx;
      e.vy = p.vy;
      e.projKind = p.kind;
    }

    for (const w of this.webs.values()) {
      let e = this.ents.get(w.id);
      if (!e) {
        e = { kind: 'w', x: w.x, y: w.y, px: w.x, py: w.y, stamp: now, bornAt: now };
        this.ents.set(w.id, e);
      }
      e.r = w.r;
    }

    // 清理已消失实体
    for (const id of this.ents.keys()) {
      if (id === this.selfId) continue;
      if (this.mobs.has(id) || this.drops.has(id) || this.projs.has(id) || this.webs.has(id)) continue;
      this.ents.delete(id);
    }
  }

  // ---------- 存档 ----------

  private load(): void {
    try {
      const acc = localStorage.getItem(ACCOUNT_KEY);
      if (acc) this.name = acc;
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          level?: number;
          xp?: number;
          kills?: number;
          inv?: { id: string; rarity: number }[];
          slotsList?: ({ id: string; rarity: number } | null)[];
        };
        this.level = Math.max(1, d.level ?? 1);
        this.xp = Math.max(0, d.xp ?? 0);
        this.kills = Math.max(0, d.kills ?? 0);
        this.inv = (d.inv ?? [])
          .filter((it) => it && typeof it.id === 'string')
          .map((it) => ({ uid: this.nextUid++, id: it.id, rarity: it.rarity | 0 }));
        if (Array.isArray(d.slotsList)) {
          for (let i = 0; i < d.slotsList.length && i < C.MAX_SLOTS; i++) {
            const s = d.slotsList[i];
            if (!s) continue;
            const def = getPetal(s.id);
            const hp = petalMaxHp(def, s.rarity);
            this.slotList[i] = { id: s.id, rarity: s.rarity, hp, maxHp: hp, hitCd: 0, reloadT: 0, broken: false, regenT: 0 };
          }
        }
      }
    } catch {
      /* 存档损坏则从空白开始 */
    }
    const empty = this.inv.length === 0 && this.slotList.every((s) => !s);
    if (empty) {
      this.inv = C.START_KIT.map((id) => ({ uid: this.nextUid++, id, rarity: 0 }));
    }
  }

  private save(): void {
    try {
      const data = {
        level: this.level,
        xp: this.xp,
        kills: this.kills,
        inv: this.inv.map((it) => ({ id: it.id, rarity: it.rarity })),
        slotsList: this.slotList.map((s) => (s ? { id: s.id, rarity: s.rarity } : null)),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
}
