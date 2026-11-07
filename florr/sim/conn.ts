// 【单一模拟核心的只读视图】
// 渲染层/UI 只依赖本文件的类型与 GameConn 接口,不感知模拟内部实现。
// 重写契约:不再有第二套模拟实现(联机若回归,走「同一 sim + 网络同步层」)。
import type { ClientMsg } from '@/sim/protocol';
import type { PetalInst, SlotWire } from '@/sim/types';

export interface EntState {
  kind: 'p' | 'm' | 'd' | 'b' | 'w';
  x: number;
  y: number;
  px: number;
  py: number;
  stamp: number;
  bornAt: number;
  name?: string;
  ang?: number;
  hpPct?: number;
  species?: number;
  rarity?: number;
  petalId?: string;
  vx?: number;
  vy?: number;
  projKind?: string;
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

/** 模拟核心对外的唯一表面:状态只读 + 意图写入 */
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
  onFloat?: ((x: number, y: number, text: string, color: string) => void) | null;
  send(msg: ClientMsg): void;
  tick(dt: number): void;
  renderPos(e: EntState): [number, number];
  selfEnt(): EntState | undefined;
  /** 攻击/防御姿态对花瓣轨道半径的缩放系数 */
  stanceScale(): number;
  /** 设置姿态:-1 收拢防御 / 0 常态 / +1 张开攻击 */
  setStance(v: -1 | 0 | 1): void;
  /** 应用天赋等级(纯数据,不含 UI) */
  applyTalents(t: Record<string, number>): void;
}

/** 主动技能(原版 Z/X/C 之外的 glorr 定制项,还原阶段暂留接口,阶段 D 再定) */
export interface TalentActions {
  talent(kind: 'speed' | 'magnet' | 'heal'): void;
}
