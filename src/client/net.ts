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

export class Net {
  ws: WebSocket | null = null;
  connected = false;
  selfId = 0;
  self: SelfState | null = null;
  ents = new Map<number, EntState>();
  othersLoadout = new Map<number, [string, number][]>();
  latency = 0;

  onWelcome: (() => void) | null = null;
  onYou: ((s: SelfState) => void) | null = null;
  onEv: ((k: EvKind, v?: number) => void) | null = null;
  onEntGone: ((e: EntState) => void) | null = null;
  onClose: (() => void) | null = null;

  private pingTimer = 0;

  connect(url: string, name: string): Promise<void> {
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
        reject(new Error('连接超时,请检查服务器地址'));
      }, 6000);
      ws.onopen = () => {
        this.connected = true;
        this.send({ t: 'join', name });
        this.onWelcome?.();
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

  private apply(msg: ServerMsg): void {
    switch (msg.t) {
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
        for (const [pid, loadout] of msg.ps) {
          this.othersLoadout.set(pid, loadout);
        }
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
}
