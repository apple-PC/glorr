// glorr 网络协议定义(客户端/服务端共用)

// ---------- 客户端 → 服务端 ----------
export type ClientMsg =
  | { t: 'register'; name: string; password: string }
  | { t: 'login'; name: string; password: string }
  | { t: 'whoami'; token: string }             // 用 token 恢复会话(不进入游戏)
  | { t: 'join'; token: string }               // 携带账号 token 进入游戏
  | { t: 'in'; x: number; y: number; expand?: number } // 移动输入方向 + 姿态(-1 收拢防御 / 0 常态 / +1 张开攻击)
  | { t: 'equip'; uid: number; slot: number }  // 背包花瓣 → 槽位(占用则交换)
  | { t: 'unequip'; slot: number }             // 槽位 → 背包
  | { t: 'moveInv'; from: number; to: number } // 背包内移动
  | { t: 'craft'; id: string; rarity: number } // 5 合 1 合成
  | { t: 'drop'; uid: number }                 // 丢弃背包花瓣
  | { t: 'debug_grant'; items: { id: string; rarity: number }[] } // 仅 GLORR_DEBUG=1 可用
  | { t: 'chat'; text: string }                // 房间聊天
  | { t: 'respawn' }
  | { t: 'ping'; ts: number };

// ---------- 实体线格式(紧凑数组) ----------
// 玩家:  ['p', id, x, y, ang, hpPct, name]
// 怪物:  ['m', id, x, y, speciesIdx, rarity, hpPct]
// 掉落:  ['d', id, x, y, petalId, rarity]
// 弹丸:  ['b', id, x, y, vx, vy, kind]
// 蛛网:  ['w', id, x, y, r]
export type Ent =
  | ['p', number, number, number, number, number, string]
  | ['m', number, number, number, number, number, number]
  | ['d', number, number, number, string, number]
  | ['b', number, number, number, number, number, string]
  | ['w', number, number, number, number];

export type ServerMsg =
  | { t: 'auth_ok'; token: string; name: string; level: number; kills: number; admin: boolean }
  | { t: 'auth_err'; reason: string }
  | { t: 'welcome'; id: number; tickHz: number; mapRadius: number; safeRadius: number; serverTime: number }
  | { t: 'snap'; tick: number; time: number; ents: Ent[]; gone: number[] }
  | {
      t: 'you';
      id: number;
      name: string;
      level: number;
      xp: number;
      xpNeed: number;
      hp: number;
      maxHp: number;
      slots: number;                 // 已解锁槽位数
      slotList: (import('./types').SlotWire | null)[];
      inv: import('./types').PetalInst[];
      dead: boolean;
      kills: number;
      invuln: number;                // 剩余无敌秒数
    }
  | { t: 'lo'; ps: [number, number, [string, number][]][] } // 其他玩家 [id, 等级, 花瓣概览]
  | { t: 'chat'; from: string; text: string }
  | { t: 'ev'; k: string; v?: number }
  | { t: 'pong'; ts: number; srv: number };

export const PROTOCOL_VERSION = 1;
