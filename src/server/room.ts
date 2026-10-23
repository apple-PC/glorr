import type { WebSocket } from 'ws';
import * as C from '@shared/constants';
import { getPetal, petalDmg, petalHealPerSec, petalMaxHp, petalOnHitHeal } from '@shared/data/petals';
import { getMob, SPECIES_INDEX } from '@shared/data/mobs';
import type { PetalInst, SlotState, SlotWire } from '@shared/types';
import type { ClientMsg, Ent, ServerMsg } from '@shared/protocol';
import { clamp, dist, dist2, randRange, TAU, weightedPick } from '@shared/math';

interface Slot extends SlotState {
  angle: number;
}

interface Drop {
  id: number;
  petalId: string;
  rarity: number;
  x: number;
  y: number;
  bornAt: number;
}

interface Bullet {
  id: number;
  owner: number; // 玩家 id; -1 = 怪物
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  kind: string;
  traveled: number;
  range: number;
  slow?: number;
  slowDur?: number;
}

interface WebZone {
  id: number;
  x: number;
  y: number;
  r: number;
  until: number;
}

class Player {
  slots: (Slot | null)[] = Array.from({ length: C.MAX_SLOTS }, () => null);
  inv: PetalInst[] = [];
  slowResist = 0;

  constructor(
    public id: number,
    public ws: WebSocket,
    public name: string,
  ) {}

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  ang = 0;
  hp = C.PLAYER.baseHp;
  maxHp = C.PLAYER.baseHp;
  level = 1;
  xp = 0;
  dead = true;
  respawnAt = 0;
  invulnUntil = 0;
  kills = 0;
  inputX = 0;
  inputY = 0;
  rotSpeed = C.PLAYER.baseRotation;
  slowUntil = 0;
  slowFac = 0;
  joined = false;
  dirty = true; // 'you' 需要立即重发
  lastChatAt = 0;
}

class Mob {
  damagers = new Map<number, number>();
  hitFlash = 0;
  atkCd = 0;
  fireCd = 0;
  wanderUntil = 0;
  wx = 0;
  wy = 0;
  retaliateUntil = 0;
  target?: number;
  vx = 0;
  vy = 0;

  constructor(
    public id: number,
    public defId: string,
    public x: number,
    public y: number,
    public rarity: number,
  ) {
    const def = getMob(defId);
    this.radius = def.radius;
    this.maxHp = Math.round(def.hp * C.MOB_STAT_MULT[rarity]);
    this.hp = this.maxHp;
    this.dmg = def.dmg * Math.pow(C.MOB_STAT_MULT[rarity], 0.55);
    this.speed = def.speed;
  }

  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  radius: number;
  slowUntil = 0;
}

/**
 * glorr 花园房间:权威服务器模拟
 * - 30Hz 定步长
 * - 玩家/怪物/掉落/弹丸/蛛网全部服务端裁决
 * - PvE 掉落资格:伤害占比 ≥15% 且前 4 名(超级怪 1%/前 25)
 */
export class Room {
  players = new Map<number, Player>();
  mobs = new Map<number, Mob>();
  drops = new Map<number, Drop>();
  bullets = new Map<number, Bullet>();
  webs = new Map<number, WebZone>();

  private nextId = 1;
  private nextUid = 1;
  private tick = 0;
  private now = 0;
  private startMs = Date.now();
  private gone: number[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(public name = 'garden-1') {
    this.prefill();
    this.timer = setInterval(() => {
      try {
        this.step();
      } catch (err) {
        console.error('[room] step 异常:', err);
      }
    }, C.TICK_MS);
  }

  // ---------- 连接管理 ----------

  addConnection(ws: WebSocket): void {
    let player: Player | null = null;
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === 'join') {
        if (player) return;
        const name = (msg.name || '').trim().slice(0, 12) || '花朵';
        player = new Player(this.nextId++, ws, name);
        this.players.set(player.id, player);
        this.send(player, {
          t: 'welcome',
          id: player.id,
          tickHz: C.TICK_HZ,
          mapRadius: C.WORLD.radius,
          safeRadius: C.WORLD.safeRadius,
          serverTime: this.now,
        });
        this.respawn(player);
        return;
      }
      if (!player) return;
      this.handle(player, msg);
    });
    ws.on('close', () => {
      if (!player) return;
      // 掉线:携带花瓣掉落在原地
      if (!player.dead) this.dropAll(player);
      this.players.delete(player.id);
    });
    ws.on('error', () => ws.close());
  }

  private handle(p: Player, msg: ClientMsg): void {
    switch (msg.t) {
      case 'in': {
        const len = Math.hypot(msg.x, msg.y);
        if (len > 1) {
          p.inputX = msg.x / len;
          p.inputY = msg.y / len;
        } else {
          p.inputX = msg.x;
          p.inputY = msg.y;
        }
        break;
      }
      case 'equip': {
        const idx = p.inv.findIndex((it) => it.uid === msg.uid);
        if (idx < 0 || msg.slot < 0 || msg.slot >= C.MAX_SLOTS) return;
        if (msg.slot >= this.unlockedSlots(p)) return;
        const inst = p.inv[idx];
        const old = p.slots[msg.slot];
        if (old) {
          p.inv[idx] = { uid: this.nextUid++, id: old.id, rarity: old.rarity };
        } else {
          p.inv.splice(idx, 1);
        }
        const def = getPetal(inst.id);
        p.slots[msg.slot] = {
          id: inst.id,
          rarity: inst.rarity,
          hp: petalMaxHp(def, inst.rarity),
          maxHp: petalMaxHp(def, inst.rarity),
          cd: 0,
          angle: (msg.slot / C.MAX_SLOTS) * TAU,
        };
        p.dirty = true;
        break;
      }
      case 'unequip': {
        const s = p.slots[msg.slot];
        if (!s) return;
        if (p.inv.length >= C.PLAYER.invCap) return;
        p.inv.push({ uid: this.nextUid++, id: s.id, rarity: s.rarity });
        p.slots[msg.slot] = null;
        p.dirty = true;
        break;
      }
      case 'moveInv': {
        const a = clamp(msg.from | 0, 0, p.inv.length - 1);
        const b = clamp(msg.to | 0, 0, p.inv.length - 1);
        if (a === b || a < 0 || b < 0) return;
        const tmp = p.inv[a];
        p.inv[a] = p.inv[b];
        p.inv[b] = tmp;
        p.dirty = true;
        break;
      }
      case 'craft':
        this.craft(p, msg.id, msg.rarity);
        break;
      case 'drop': {
        const idx = p.inv.findIndex((it) => it.uid === msg.uid);
        if (idx < 0 || p.dead) return;
        const inst = p.inv[idx];
        p.inv.splice(idx, 1);
        this.spawnDrop(inst.id, inst.rarity, p.x + randRange(-20, 20), p.y + randRange(-20, 20));
        p.dirty = true;
        break;
      }
      case 'chat': {
        const text = String(msg.text ?? '').replace(/[<>]/g, '').trim().slice(0, 80);
        if (!text) return;
        if (this.now - p.lastChatAt < 1) return; // 1 秒发言间隔
        p.lastChatAt = this.now;
        const out: ServerMsg = { t: 'chat', from: p.name, text };
        for (const q of this.players.values()) this.send(q, out);
        break;
      }
      case 'respawn':
        if (p.dead && this.now >= p.respawnAt) this.respawn(p);
        break;
      case 'ping':
        this.send(p, { t: 'pong', ts: msg.ts, srv: Math.round(this.now * 1000) });
        break;
    }
  }

  // ---------- 主循环 ----------

  private step(): void {
    this.tick++;
    this.now = (Date.now() - this.startMs) / 1000;
    const now = this.now;

    for (const p of this.players.values()) {
      if (p.dead) {
        if (p.respawnAt > 0 && now >= p.respawnAt) {
          // 自动重生(也可由客户端主动确认)
          this.respawn(p);
        }
        continue;
      }
      this.updatePlayer(p, now);
    }

    for (const m of this.mobs.values()) this.updateMob(m, now);

    this.updateBullets(now);
    this.updateWebs(now);
    this.updateDrops(now);
    if (this.tick % 5 === 0) this.separateMobs();
    this.spawnMobs(now);

    this.broadcast();
  }

  // ---------- 玩家 ----------

  private updatePlayer(p: Player, now: number): void {
    // 旋转速度 / 减速抗性
    let rot = C.PLAYER.baseRotation;
    let resist = 0;
    for (const s of p.slots) {
      if (!s) continue;
      const def = getPetal(s.id);
      if (def.rotBonus) rot += def.rotBonus;
      if (def.rotMul) rot *= def.rotMul;
      if (def.slowResist) resist += def.slowResist;
    }
    p.rotSpeed = rot;
    p.slowResist = Math.min(0.7, resist);

    // 移动
    const slow = now < p.slowUntil ? p.slowFac * (1 - p.slowResist) : 0;
    const sp = C.PLAYER.speed * (1 - clamp(slow, 0, 0.9));
    const k = Math.min(1, C.PLAYER.accel * C.DT);
    if (p.inputX !== 0 || p.inputY !== 0) {
      p.ang = Math.atan2(p.inputY, p.inputX);
      p.vx += (p.inputX * sp - p.vx) * k;
      p.vy += (p.inputY * sp - p.vy) * k;
    } else {
      const fk = Math.min(1, C.PLAYER.accel * 1.6 * C.DT);
      p.vx -= p.vx * fk;
      p.vy -= p.vy * fk;
    }
    p.x += p.vx * C.DT;
    p.y += p.vy * C.DT;

    // 世界边界
    const r = Math.hypot(p.x, p.y);
    const maxR = C.WORLD.radius - 40;
    if (r > maxR) {
      p.x = (p.x / r) * maxR;
      p.y = (p.y / r) * maxR;
      p.vx *= 0.4;
      p.vy *= 0.4;
    }

    // 玩家之间的软推挤
    for (const q of this.players.values()) {
      if (q === p || q.dead) continue;
      const d = dist(p.x, p.y, q.x, q.y);
      const min = C.PLAYER.radius * 2;
      if (d > 0.01 && d < min) {
        const push = ((min - d) / min) * 120 * C.DT;
        const nx = (p.x - q.x) / d;
        const ny = (p.y - q.y) / d;
        p.x += nx * push;
        p.y += ny * push;
        q.x -= nx * push;
        q.y -= ny * push;
      }
    }

    this.updatePetals(p, now);
  }

  private updatePetals(p: Player, now: number): void {
    const orbit = C.PLAYER.petalOrbit;
    // 治疗(持续类)
    for (const s of p.slots) {
      if (!s) continue;
      const def = getPetal(s.id);
      if (def.healPerSec && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + petalHealPerSec(def, s.rarity) * C.DT);
      }
    }

    // 近战碰撞(先收集附近怪物,避免全量扫描)
    const near: Mob[] = [];
    for (const m of this.mobs.values()) {
      if (dist2(m.x, m.y, p.x, p.y) < 360 * 360) near.push(m);
    }

    for (let i = 0; i < p.slots.length; i++) {
      const s = p.slots[i];
      if (!s) continue;
      const def = getPetal(s.id);
      s.angle += p.rotSpeed * C.DT;
      if (s.angle > TAU) s.angle -= TAU;

      // 远程装填与发射
      if (def.kind === 'ranged' && def.reload > 0) {
        if (s.cd > 0) {
          s.cd = Math.max(0, s.cd - C.DT);
        } else {
          const px = p.x + Math.cos(s.angle) * orbit;
          const py = p.y + Math.sin(s.angle) * orbit;
          this.bullets.set(this.nextId, {
            id: this.nextId++,
            owner: p.id,
            x: px,
            y: py,
            vx: Math.cos(s.angle) * (def.projSpeed ?? 400),
            vy: Math.sin(s.angle) * (def.projSpeed ?? 400),
            dmg: petalDmg(def, s.rarity),
            kind: def.id === 'web' ? 'web' : 'missile',
            traveled: 0,
            range: def.projRange ?? 500,
            slow: def.slow,
            slowDur: def.slowDur,
          });
          s.cd = def.reload;
        }
        continue; // 装填中不参与接触判定
      }

      // 近战/持续类:接触判定
      const px = p.x + Math.cos(s.angle) * orbit;
      const py = p.y + Math.sin(s.angle) * orbit;
      const pr = 11 + s.rarity * 0.6;

      for (const m of near) {
        if (m.hp <= 0) continue;
        const rr = pr + m.radius;
        if (dist2(px, py, m.x, m.y) > rr * rr) continue;
        const dmg = Math.max(1, petalDmg(def, s.rarity) - getMob(m.defId).armor);
        this.damageMob(m, dmg, p.id, now);
        // 花瓣耐久损耗
        s.hp -= m.dmg * 0.6;
        // 玫瑰命中回血
        if (def.onHitHeal && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + petalOnHitHeal(def, s.rarity));
        }
        if (s.hp <= 0) {
          p.slots[i] = null;
          this.ev(p, 'break', i);
          break;
        }
      }
      if (!p.slots[i]) continue;

      // PvP:花瓣攻击其他玩家
      if (C.isPvp(p.x, p.y)) {
        for (const q of this.players.values()) {
          if (q === p || q.dead || now < q.invulnUntil) continue;
          const rr = pr + C.PLAYER.radius;
          if (dist2(px, py, q.x, q.y) > rr * rr) continue;
          const dmg = petalDmg(def, s.rarity);
          this.damagePlayer(q, dmg, p.id);
          s.hp -= dmg * 0.5;
          if (s.hp <= 0) {
            p.slots[i] = null;
            this.ev(p, 'break', i);
            break;
          }
        }
      }
    }
  }

  // ---------- 怪物 ----------

  private updateMob(m: Mob, now: number): void {
    const def = getMob(m.defId);
    m.hitFlash = Math.max(0, m.hitFlash - C.DT);
    m.atkCd = Math.max(0, m.atkCd - C.DT);
    if (m.fireCd > 0) m.fireCd -= C.DT;

    const slowMul = now < m.slowUntil ? 0.55 : 1;
    if (def.behavior !== 'static') {

    // 目标获取
    if (def.behavior === 'aggressive') {
      let best: Player | null = null;
      let bd = def.aggro;
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const d = dist(m.x, m.y, p.x, p.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      m.target = best ? best.id : undefined;
    } else if (def.behavior === 'neutral') {
      if (m.retaliateUntil > now && m.target !== undefined) {
        const p = this.players.get(m.target);
        if (!p || p.dead || dist(m.x, m.y, p.x, p.y) > def.aggro * 1.8) m.target = undefined;
      } else {
        m.target = undefined;
      }
    }

    let desiredX = 0;
    let desiredY = 0;
    let speed = def.speed * slowMul;

    if (m.target !== undefined) {
      const p = this.players.get(m.target);
      if (p && !p.dead) {
        const d = dist(m.x, m.y, p.x, p.y);
        const nx = (p.x - m.x) / (d || 1);
        const ny = (p.y - m.y) / (d || 1);
        if (def.ranged) {
          if (d > def.ranged.range * 0.7) {
            desiredX = nx;
            desiredY = ny;
          } else if (d < def.ranged.range * 0.45) {
            desiredX = -nx * 0.7;
            desiredY = -ny * 0.7;
            speed *= 0.7;
          } else {
            // 横向游走
            desiredX = -ny * 0.6;
            desiredY = nx * 0.6;
          }
          if (m.fireCd <= 0 && d <= def.ranged.range) {
            m.fireCd = def.ranged.cd;
            this.bullets.set(this.nextId, {
              id: this.nextId++,
              owner: -1,
              x: m.x,
              y: m.y,
              vx: nx * def.ranged.speed,
              vy: ny * def.ranged.speed,
              dmg: def.ranged.dmg * Math.pow(C.MOB_STAT_MULT[m.rarity], 0.5),
              kind: 'sting',
              traveled: 0,
              range: def.ranged.range,
            });
          }
        } else {
          desiredX = nx;
          desiredY = ny;
        }
      } else {
        m.target = undefined;
      }
    }

    if (m.target === undefined) {
      // 游走
      if (now > m.wanderUntil) {
        m.wx = m.x + randRange(-320, 320);
        m.wy = m.y + randRange(-320, 320);
        m.wanderUntil = now + randRange(1.5, 4);
      }
      const d = dist(m.x, m.y, m.wx, m.wy);
      if (d > 20) {
        desiredX = (m.wx - m.x) / d;
        desiredY = (m.wy - m.y) / d;
        speed *= 0.55;
      }
    }

    const k = Math.min(1, 6 * C.DT);
    m.vx += (desiredX * speed - m.vx) * k;
    m.vy += (desiredY * speed - m.vy) * k;
    m.x += m.vx * C.DT;
    m.y += m.vy * C.DT;

    // 不进入中心安全区
    const r = Math.hypot(m.x, m.y);
    if (r < C.WORLD.safeRadius + 40) {
      m.x = (m.x / (r || 1)) * (C.WORLD.safeRadius + 40);
      m.y = (m.y / (r || 1)) * (C.WORLD.safeRadius + 40);
    }
    const maxR = C.WORLD.radius - 30;
    if (r > maxR) {
      m.x = (m.x / r) * maxR;
      m.y = (m.y / r) * maxR;
    }

    }

    // 接触伤害(静态障碍如石头也保留)
    if (m.atkCd <= 0) {
      const canAttack =
        def.behavior === 'aggressive' ||
        def.behavior === 'static' ||
        (def.behavior === 'neutral' && m.target !== undefined);
      if (canAttack) {
        for (const p of this.players.values()) {
          if (p.dead) continue;
          const rr = m.radius + C.PLAYER.radius;
          if (dist2(m.x, m.y, p.x, p.y) > rr * rr) continue;
          m.atkCd = 0.7;
          this.damagePlayer(p, m.dmg, undefined, m.x, m.y);
          break;
        }
      }
    }
  }

  private separateMobs(): void {
    const list = [...this.mobs.values()];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const min = a.radius + b.radius;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > min * min || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / min) * 60 * C.DT * 5;
        const nx = (a.x - b.x) / d;
        const ny = (a.y - b.y) / d;
        a.x += nx * push;
        a.y += ny * push;
        b.x -= nx * push;
        b.y -= ny * push;
      }
    }
  }

  // ---------- 弹丸 / 蛛网 ----------

  private updateBullets(now: number): void {
    for (const b of this.bullets.values()) {
      b.x += b.vx * C.DT;
      b.y += b.vy * C.DT;
      b.traveled += Math.hypot(b.vx, b.vy) * C.DT;
      if (b.traveled > b.range) {
        this.bullets.delete(b.id);
        this.gone.push(b.id);
        continue;
      }
      const r = Math.hypot(b.x, b.y);
      if (r > C.WORLD.radius) {
        this.bullets.delete(b.id);
        this.gone.push(b.id);
        continue;
      }

      let dead = false;
      if (b.owner >= 0) {
        // 玩家弹丸 → 怪物
        for (const m of this.mobs.values()) {
          const rr = m.radius + 9;
          if (dist2(b.x, b.y, m.x, m.y) > rr * rr) continue;
          this.damageMob(m, Math.max(1, b.dmg - getMob(m.defId).armor), b.owner, now);
          if (b.kind === 'web' && b.slow) {
            this.webs.set(this.nextId, {
              id: this.nextId++,
              x: b.x,
              y: b.y,
              r: 74,
              until: now + (b.slowDur ?? 3),
            });
          }
          dead = true;
          break;
        }
        // 玩家弹丸 → 其他玩家(PvP 区)
        if (!dead && C.isPvp(b.x, b.y)) {
          for (const q of this.players.values()) {
            if (q.id === b.owner || q.dead || now < q.invulnUntil) continue;
            const rr = C.PLAYER.radius + 9;
            if (dist2(b.x, b.y, q.x, q.y) > rr * rr) continue;
            this.damagePlayer(q, b.dmg, b.owner);
            dead = true;
            break;
          }
        }
      } else {
        // 怪物弹丸 → 玩家
        for (const q of this.players.values()) {
          if (q.dead || now < q.invulnUntil) continue;
          const rr = C.PLAYER.radius + 9;
          if (dist2(b.x, b.y, q.x, q.y) > rr * rr) continue;
          this.damagePlayer(q, b.dmg, undefined, b.x, b.y);
          dead = true;
          break;
        }
      }

      if (dead) {
        this.bullets.delete(b.id);
        this.gone.push(b.id);
      }
    }
  }

  private updateWebs(now: number): void {
    for (const w of this.webs.values()) {
      if (now > w.until) {
        this.webs.delete(w.id);
        this.gone.push(w.id);
        continue;
      }
      for (const p of this.players.values()) {
        if (p.dead) continue;
        if (dist2(w.x, w.y, p.x, p.y) < w.r * w.r) {
          p.slowUntil = now + 0.25;
          p.slowFac = 0.45;
        }
      }
      for (const m of this.mobs.values()) {
        if (dist2(w.x, w.y, m.x, m.y) < w.r * w.r) {
          m.slowUntil = now + 0.25;
        }
      }
    }
  }

  // ---------- 掉落 ----------

  private updateDrops(now: number): void {
    for (const d of this.drops.values()) {
      const age = now - d.bornAt;
      const limit = C.DROP_DESPAWN[d.rarity];
      if (age > limit) {
        this.drops.delete(d.id);
        this.gone.push(d.id);
        continue;
      }
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const rr = C.PLAYER.pickupRadius;
        if (dist2(d.x, d.y, p.x, p.y) > rr * rr) continue;
        if (p.inv.length >= C.PLAYER.invCap) continue;
        p.inv.push({ uid: this.nextUid++, id: d.petalId, rarity: d.rarity });
        this.drops.delete(d.id);
        this.gone.push(d.id);
        this.ev(p, 'pickup', d.rarity);
        p.dirty = true;
        break;
      }
    }
  }

  private spawnDrop(petalId: string, rarity: number, x: number, y: number): void {
    this.drops.set(this.nextId, { id: this.nextId++, petalId, rarity, x, y, bornAt: this.now });
  }

  private dropAll(p: Player): void {
    for (const s of p.slots) {
      if (s) this.spawnDrop(s.id, s.rarity, p.x + randRange(-26, 26), p.y + randRange(-26, 26));
    }
    for (const it of p.inv) {
      this.spawnDrop(it.id, it.rarity, p.x + randRange(-30, 30), p.y + randRange(-30, 30));
    }
    p.slots = Array.from({ length: C.MAX_SLOTS }, () => null);
    p.inv = [];
  }

  // ---------- 伤害 / 死亡 / 掉落资格 ----------

  private damageMob(m: Mob, dmg: number, byPlayer: number, now: number): void {
    m.hp -= dmg;
    m.hitFlash = 0.12;
    m.damagers.set(byPlayer, (m.damagers.get(byPlayer) ?? 0) + dmg);
    if (getMob(m.defId).behavior === 'neutral') {
      m.retaliateUntil = now + 6;
      m.target = byPlayer;
    }
    if (m.hp <= 0) this.killMob(m);
  }

  private killMob(m: Mob): void {
    const def = getMob(m.defId);
    const total = [...m.damagers.values()].reduce((a, b) => a + b, 0);
    if (total > 0) {
      const superMob = m.rarity >= 7;
      const shareMin = superMob ? C.DROP_SUPER_CONTRIB : C.DROP_MIN_CONTRIB;
      const topN = superMob ? C.DROP_SUPER_TOP_N : C.DROP_TOP_N;
      const qualified = [...m.damagers.entries()]
        .map(([pid, dmg]) => ({ pid, share: dmg / total }))
        .filter((e) => e.share >= shareMin)
        .sort((a, b) => b.share - a.share)
        .slice(0, topN);

      for (const { pid } of qualified) {
        const p = this.players.get(pid);
        if (!p || p.dead) continue;
        // 经验
        p.xp += def.xp * C.MOB_XP_MULT[m.rarity];
        while (p.xp >= C.xpForLevel(p.level)) {
          p.xp -= C.xpForLevel(p.level);
          p.level++;
          this.ev(p, 'levelup', p.level);
        }
        p.kills++;
        p.dirty = true;
        // 掉落
        const n = 1 + (m.rarity >= 2 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
        for (let i = 0; i < n; i++) this.rollDrop(m, def.id);
      }
    }
    this.mobs.delete(m.id);
    this.gone.push(m.id);
  }

  private rollDrop(m: Mob, defId: string): void {
    const def = getMob(defId);
    const cap = Math.min(m.rarity, C.MOB_MAX_DROP_RARITY);
    for (let attempt = 0; attempt < 2; attempt++) {
      const wi = weightedPick(def.drops.map((d) => d[1]));
      const petalId = def.drops[wi][0];
      const pdef = getPetal(petalId);
      if (pdef.minRarity > cap) continue;
      // 稀有度 ≤ 怪物稀有度,越接近怪物稀有度权重越高
      const w: number[] = [];
      for (let r = 0; r <= cap; r++) w.push(cap - r + 1);
      let rar = weightedPick(w);
      rar = Math.max(rar, pdef.minRarity);
      this.spawnDrop(petalId, rar, m.x + randRange(-24, 24), m.y + randRange(-24, 24));
      return;
    }
  }

  private damagePlayer(p: Player, dmg: number, byPlayer?: number, fromX?: number, fromY?: number): void {
    if (p.dead || this.now < p.invulnUntil) return;
    p.hp -= dmg;
    if (p.hp <= 0) {
      this.killPlayer(p, byPlayer);
    } else if (fromX !== undefined && fromY !== undefined) {
      // 击退
      const a = Math.atan2(p.y - fromY, p.x - fromX);
      p.vx += Math.cos(a) * 150;
      p.vy += Math.sin(a) * 150;
    }
  }

  private killPlayer(p: Player, killer?: number): void {
    p.dead = true;
    p.hp = 0;
    p.respawnAt = this.now + C.PLAYER.respawnDelay;
    if (killer !== undefined) {
      const k = this.players.get(killer);
      if (k) k.kills++;
    }
    if (C.PLAYER.deathDropAll) this.dropAll(p);
    this.ev(p, 'death');
    p.dirty = true;
  }

  private respawn(p: Player): void {
    const a = Math.random() * TAU;
    const r = Math.random() * C.WORLD.safeRadius * 0.6;
    p.x = Math.cos(a) * r;
    p.y = Math.sin(a) * r;
    p.vx = 0;
    p.vy = 0;
    p.ang = -Math.PI / 2;
    p.dead = false;
    p.hp = C.PLAYER.baseHp;
    p.maxHp = C.PLAYER.baseHp;
    p.invulnUntil = this.now + C.PLAYER.spawnInvuln;
    p.respawnAt = 0;
    p.slowUntil = 0;
    // 新手套装:5 个普通基础花瓣
    for (const id of C.START_KIT) {
      p.inv.push({ uid: this.nextUid++, id, rarity: 0 });
    }
    for (let i = 0; i < p.inv.length && i < C.START_KIT.length; i++) {
      const inst = p.inv[i];
      const def = getPetal(inst.id);
      p.slots[i] = {
        id: inst.id,
        rarity: inst.rarity,
        hp: petalMaxHp(def, inst.rarity),
        maxHp: petalMaxHp(def, inst.rarity),
        cd: 0,
        angle: (i / C.START_KIT.length) * TAU,
      };
    }
    p.inv = [];
    this.ev(p, 'respawn');
    p.dirty = true;
    this.sendYou(p);
  }

  // ---------- 合成 ----------

  private craft(p: Player, id: string, rarity: number): void {
    if (rarity >= C.ETERNAL || rarity >= C.UNIQUE) {
      this.ev(p, 'craft_fail', 2); // 已达可合成上限
      return;
    }
    const matches = p.inv.filter((it) => it.id === id && it.rarity === rarity);
    if (matches.length < C.CRAFT_INPUT) {
      this.ev(p, 'craft_fail', 1); // 材料不足
      return;
    }
    // 消耗 5 个
    let need = C.CRAFT_INPUT;
    p.inv = p.inv.filter((it) => {
      if (need > 0 && it.id === id && it.rarity === rarity) {
        need--;
        return false;
      }
      return true;
    });
    const chance = C.CRAFT_SUCCESS[rarity] ?? 0;
    if (Math.random() < chance) {
      p.inv.push({ uid: this.nextUid++, id, rarity: rarity + 1 });
      this.ev(p, 'craft_ok', rarity + 1);
    } else {
      // 失败:随机损失 1-4 个,其余退回
      const lost = 1 + Math.floor(Math.random() * 4);
      const back = C.CRAFT_INPUT - lost;
      for (let i = 0; i < back; i++) {
        p.inv.push({ uid: this.nextUid++, id, rarity });
      }
      this.ev(p, 'craft_fail', 0);
    }
    p.dirty = true;
    this.sendYou(p);
  }

  // ---------- 刷怪 ----------

  private prefill(): void {
    for (const ring of C.RINGS) {
      if (ring.density <= 0) continue;
      const n = Math.floor(ring.density * 0.7);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = randRange(ring.r0 + 60, ring.r1 - 40);
        this.spawnMob(pickSpecies(ring), a, r, weightedPick(ring.rarityW));
      }
    }
  }

  private spawnMobs(now: number): void {
    for (const ring of C.RINGS) {
      if (ring.density <= 0) continue;
      let count = 0;
      for (const m of this.mobs.values()) {
        const r = Math.hypot(m.x, m.y);
        if (r >= ring.r0 && r < ring.r1) count++;
      }
      const deficit = ring.density - count;
      if (deficit <= 0 || Math.random() > deficit * 0.03) continue;
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = Math.random() * TAU;
        const r = randRange(ring.r0 + 60, ring.r1 - 40);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        let tooClose = false;
        for (const p of this.players.values()) {
          if (dist(x, y, p.x, p.y) < 700) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        this.spawnMob(pickSpecies(ring), a, r, weightedPick(ring.rarityW));
        return;
      }
    }
  }

  private spawnMob(species: string, angle: number, radius: number, rarity: number): void {
    const rar = Math.min(rarity, C.MOB_MAX_DROP_RARITY);
    const m = new Mob(this.nextId++, species, Math.cos(angle) * radius, Math.sin(angle) * radius, rar);
    this.mobs.set(m.id, m);
  }

  // ---------- 工具 ----------

  private unlockedSlots(p: Player): number {
    let maxR = 0;
    for (const s of p.slots) if (s) maxR = Math.max(maxR, s.rarity);
    for (const it of p.inv) maxR = Math.max(maxR, it.rarity);
    return C.slotsForRarity(maxR);
  }

  private ev(p: Player, k: string, v?: number): void {
    this.send(p, { t: 'ev', k, v });
  }

  private send(p: Player, msg: ServerMsg): void {
    if (p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  private sendYou(p: Player, force = true): void {
    if (!p.dirty && !force) return;
    p.dirty = false;
    const slotList: (SlotWire | null)[] = p.slots.map((s) => {
      if (!s) return null;
      return {
        id: s.id,
        rarity: s.rarity,
        hpPct: Math.max(0, s.hp / s.maxHp),
        cdPct: s.cd > 0 ? s.cd / getPetal(s.id).reload : 0,
      };
    });
    this.send(p, {
      t: 'you',
      id: p.id,
      name: p.name,
      level: p.level,
      xp: p.xp,
      xpNeed: C.xpForLevel(p.level),
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      slots: this.unlockedSlots(p),
      slotList,
      inv: p.inv.map((it) => ({ ...it })),
      dead: p.dead,
      kills: p.kills,
      invuln: Math.max(0, p.invulnUntil - this.now),
    });
  }

  // ---------- 广播 ----------

  private broadcast(): void {
    const gone = this.gone;
    this.gone = [];
    const loTick = this.tick % 15 === 0;

    for (const p of this.players.values()) {
      const ents: Ent[] = [];
      ents.push(['p', p.id, Math.round(p.x), Math.round(p.y), Math.round(p.ang * 100) / 100, p.hp / p.maxHp, p.name]);

      for (const q of this.players.values()) {
        if (q === p || q.dead) continue;
        if (dist2(q.x, q.y, p.x, p.y) > C.SNAPSHOT_RANGE * C.SNAPSHOT_RANGE) continue;
        ents.push(['p', q.id, Math.round(q.x), Math.round(q.y), Math.round(q.ang * 100) / 100, q.hp / q.maxHp, q.name]);
      }
      for (const m of this.mobs.values()) {
        if (dist2(m.x, m.y, p.x, p.y) > C.SNAPSHOT_RANGE * C.SNAPSHOT_RANGE) continue;
        ents.push(['m', m.id, Math.round(m.x), Math.round(m.y), SPECIES_INDEX.get(m.defId) ?? 0, m.rarity, m.hp / m.maxHp]);
      }
      for (const d of this.drops.values()) {
        if (dist2(d.x, d.y, p.x, p.y) > C.SNAPSHOT_RANGE * C.SNAPSHOT_RANGE) continue;
        ents.push(['d', d.id, Math.round(d.x), Math.round(d.y), d.petalId, d.rarity]);
      }
      for (const b of this.bullets.values()) {
        if (dist2(b.x, b.y, p.x, p.y) > (C.SNAPSHOT_RANGE + 200) ** 2) continue;
        ents.push(['b', b.id, Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.kind]);
      }
      for (const w of this.webs.values()) {
        if (dist2(w.x, w.y, p.x, p.y) > C.SNAPSHOT_RANGE * C.SNAPSHOT_RANGE) continue;
        ents.push(['w', w.id, Math.round(w.x), Math.round(w.y), Math.round(w.r)]);
      }

      this.send(p, { t: 'snap', tick: this.tick, time: this.now, ents, gone });

      if (p.dirty || this.tick % 6 === 0) this.sendYou(p);
      if (loTick) {
        const ps: [number, number, [string, number][]][] = [];
        for (const q of this.players.values()) {
          if (q.dead) continue;
          if (dist2(q.x, q.y, p.x, p.y) > C.SNAPSHOT_RANGE * C.SNAPSHOT_RANGE) continue;
          const loadout: [string, number][] = [];
          for (const s of q.slots) if (s) loadout.push([s.id, s.rarity]);
          ps.push([q.id, q.level, loadout]);
        }
        this.send(p, { t: 'lo', ps });
      }
    }
  }
}

function pickSpecies(ring: (typeof C.RINGS)[number]): string {
  // 物种等权随机
  return ring.species[Math.floor(Math.random() * ring.species.length)];
}
