// glorr 网络层:连接、快照缓冲、实体插值
import { TICK_MS } from '@shared/constants';
import type { ClientMsg, Ent, ServerMsg } from '@shared/protocol';
import type { PetalInst, SlotWire } from '@shared/types';
import { clamp, lerp } from '@shared/math';

export interface EntState {
  kind: 'p' | 'm' | 'd' | 'b' | 'w';
  x: number;
  y: number;
  px: number;
  py: number;
  stamp: number;
  bornAt: number; // 客户端首次见到的时间(掉落淡出用)
  // 玩家
  name?: string;
  ang?: number;
  hpPct?: number;
  // 怪物
  species?: number;
  rarity?: number;
  // 掉落
  petalId?: string;
  // 弹丸
  vx?: number;
  vy?: number;
  projKind?: string;
  // 蛛网
  r?: number;
}

export interface SelfState {
  id: number;
  name: string;
  level: number;
  xp: number;
  xpNeed: number;
  hp: number;
  maxHp: number;
  slots: number;
  slotList: (SlotWire | null)[];
  inv: PetalInst[];
  dead: boolean;
  kills: number;
  invuln: number;
}

export type EvKind = 'levelup' | 'death' | 'respawn' | 'craft_ok' | 'craft_fail' | 'pickup' | 'break';

export interface OtherInfo {
  level: number;
  loadout: [string, number][];
}

// 游戏连接抽象:联机(Net)与单机(LocalSim)共用同一公共表面,渲染/UI 据此解耦
export interface GameConn {
  connected: boolean;
  readonly solo: boolean;
  selfId: number;
  self: SelfState | null;
  ents: Map<number, EntState>;
  othersLoadout: Map<number, [string, number][]>;
  othersInfo: Map<number, OtherInfo>;
  latency: number;
  onWelcome: (() => void) | null;
  onYou: ((s: SelfState) => void) | null;
  onEv: ((k: EvKind, v?: number) => void) | null;
  onEntGone: ((e: EntState) => void) | null;
  onClose: (() => void) | null;
  onChat: ((from: string, text: string) => void) | null;
  onAuthOk: ((info: { token: string; name: string; level: number; kills: number; admin: boolean }) => void) | null;
  onAuthErr: ((reason: string) => void) | null;
  onFloat?: ((x: number, y: number, text: string, color: string) => void) | null;
  talent?: (kind: 'speed' | 'magnet' | 'heal') => void;
  connect(url: string, token?: string): Promise<void>;
  register(name: string, password: string): void;
  login(name: string, password: string): void;
  whoami(token: string): void;
  join(token: string): void;
  send(msg: ClientMsg): void;
  close(): void;
  tick(dt: number): void;
  renderPos(e: EntState): [number, number];
  selfEnt(): EntState | undefined;
  /** 攻击/防御姿态对花瓣轨道半径的缩放系数(联机模式暂无姿态,返回 1) */
  stanceScale(): number;
}

export class Net implements GameConn {
  readonly solo = false;
  ws: WebSocket | null = null;
  connected = false;
  selfId = 0;
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

  private pingTimer = 0;

  /** 建立连接;token 为空则不发送 join(等待登录/注册) */
  connect(url: string, token = ''): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws = ws;
      const timeout = window.setTimeout(() => {
        reject(new Error('连接超时,请检查服务器'));
      }, 6000);
      ws.onopen = () => {
        this.connected = true;
        window.clearTimeout(timeout);
        if (token) this.send({ t: 'join', token });
        resolve();
      };
      ws.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('无法连接到服务器'));
      };
      ws.onclose = () => {
        this.connected = false;
        window.clearTimeout(timeout);
        this.onClose?.();
      };
      ws.onmessage = (e) => {
        try {
          this.apply(JSON.parse(e.data as string) as ServerMsg);
        } catch {
          /* 忽略坏包 */
        }
      };
    });
  }

  register(name: string, password: string): void {
    this.send({ t: 'register', name, password });
  }

  login(name: string, password: string): void {
    this.send({ t: 'login', name, password });
  }

  whoami(token: string): void {
    this.send({ t: 'whoami', token });
  }

  join(token: string): void {
    this.send({ t: 'join', token });
  }

  private apply(msg: ServerMsg): void {
    switch (msg.t) {
      case 'auth_ok':
        this.onAuthOk?.({ token: msg.token, name: msg.name, level: msg.level, kills: msg.kills, admin: msg.admin });
        break;
      case 'auth_err':
        this.onAuthErr?.(msg.reason);
        break;
      case 'welcome':
        this.selfId = msg.id;
        break;
      case 'snap':
        this.applySnapshot(msg.ents, msg.gone, msg.time);
        break;
      case 'you':
        this.self = {
          id: msg.id,
          name: msg.name,
          level: msg.level,
          xp: msg.xp,
          xpNeed: msg.xpNeed,
          hp: msg.hp,
          maxHp: msg.maxHp,
          slots: msg.slots,
          slotList: msg.slotList,
          inv: msg.inv,
          dead: msg.dead,
          kills: msg.kills,
          invuln: msg.invuln,
        };
        this.onYou?.(this.self);
        break;
      case 'lo':
        for (const [pid, level, loadout] of msg.ps) {
          this.othersLoadout.set(pid, loadout);
          this.othersInfo.set(pid, { level, loadout });
        }
        break;
      case 'chat':
        this.onChat?.(msg.from, msg.text);
        break;
      case 'ev':
        this.onEv?.(msg.k as EvKind, msg.v);
        break;
      case 'pong':
        this.latency = Math.max(0, Math.round(performance.now() - msg.ts));
        break;
    }
  }

  private applySnapshot(ents: Ent[], gone: number[], time: number): void {
    const now = performance.now();
    for (const id of gone) {
      const e = this.ents.get(id);
      if (e) {
        this.onEntGone?.(e);
        this.ents.delete(id);
      }
    }
    for (const ent of ents) {
      const kind = ent[0];
      const id = ent[1];
      let e = this.ents.get(id);
      if (!e) {
        e = { kind, x: 0, y: 0, px: 0, py: 0, stamp: now, bornAt: now };
        this.ents.set(id, e);
        e.x = ent[2] as number;
        e.y = ent[3] as number;
        e.px = e.x;
        e.py = e.y;
        e.stamp = now;
      } else {
        e.px = e.x;
        e.py = e.y;
        e.x = ent[2] as number;
        e.y = ent[3] as number;
        e.stamp = now;
      }
      switch (kind) {
        case 'p':
          e.kind = 'p';
          e.ang = ent[4] as number;
          e.hpPct = ent[5] as number;
          e.name = ent[6] as string;
          break;
        case 'm':
          e.kind = 'm';
          e.species = ent[4] as number;
          e.rarity = ent[5] as number;
          e.hpPct = ent[6] as number;
          break;
        case 'd':
          e.kind = 'd';
          e.petalId = ent[4] as string;
          e.rarity = ent[5] as number;
          break;
        case 'b':
          e.kind = 'b';
          e.vx = ent[4] as number;
          e.vy = ent[5] as number;
          e.projKind = ent[6] as string;
          break;
        case 'w':
          e.kind = 'w';
          e.r = ent[4] as number;
          break;
      }
    }
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.connected = false;
    this.ents.clear();
    this.self = null;
    this.selfId = 0;
  }

  tick(dt: number): void {
    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer = 2;
      this.send({ t: 'ping', ts: performance.now() });
    }
  }

  /** 渲染用插值坐标 */
  renderPos(e: EntState): [number, number] {
    const alpha = clamp((performance.now() - e.stamp) / TICK_MS, 0, 1.4);
    return [lerp(e.px, e.x, Math.min(alpha, 1)), lerp(e.py, e.y, Math.min(alpha, 1))];
  }

  selfEnt(): EntState | undefined {
    return this.ents.get(this.selfId);
  }

  /** 联机模式暂无姿态系统,轨道半径不缩放 */
  stanceScale(): number {
    return 1;
  }
}
