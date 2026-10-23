// glorr 全局常量 —— 数值参考 florr.io 官方 Wiki(2026-10 核对)

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const TICK_MS = 1000 / TICK_HZ;

// ---------- 稀有度体系(与花瓣/怪物共享) ----------
export const RARITY_IDS = [
  'common', 'unusual', 'rare', 'epic', 'legendary',
  'mythic', 'ultra', 'super', 'eternal', 'unique',
] as const;
export type RarityId = (typeof RARITY_IDS)[number];

export const RARITY_NAMES = [
  '普通', '罕见', '稀有', '史诗', '传奇', '神话', '究极', '超级', '永恒', '唯一',
] as const;

// 主色 / 描边暗色(对齐 Florr 观感)
export const RARITY_COLORS = [
  '#7EEF6D', '#FFE65D', '#4D52E3', '#861FDE', '#DE1F1F',
  '#1FDBDE', '#FF2B75', '#2BFFA3', '#F5F5F5', '#555555',
];
export const RARITY_DARK = [
  '#3f9e33', '#c9a92e', '#2f34a8', '#5f179b', '#9c1616',
  '#159a9c', '#c11d55', '#1cb87c', '#cccccc', '#3a3a3a',
];

export function rarityName(i: number): string {
  return RARITY_NAMES[i] ?? '未知';
}

/** 依据背景亮度选可读文字色 */
export function textOn(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#1a1a1a' : '#f2f2f2';
}

// ---------- 花瓣槽位 ----------
export const MAX_SLOTS = 10;
/** 槽位数 = min(5 + 最高稀有度等级, 10),与 Florr 一致 */
export function slotsForRarity(maxRarity: number): number {
  return Math.min(5 + Math.max(0, maxRarity), MAX_SLOTS);
}

// ---------- 合成 ----------
export const CRAFT_INPUT = 5;
/** 合成成功率(按"从哪一级"索引,唯一不可合成) */
export const CRAFT_SUCCESS = [0.64, 0.32, 0.16, 0.08, 0.04, 0.02, 0.01, 0.001];
export const ETERNAL = 8; // 永恒
export const UNIQUE = 9;  // 唯一(仅锻造,不开放合成)

// ---------- 属性缩放曲线 ----------
/** 伤害/耐久:每级 ×3(Common 1x → Eternal 6561x) */
export function statScale(i: number): number {
  return Math.pow(3, i);
}
/** 治疗类:3^i 到神话,之后每级 ×√3(对齐 Florr 治疗曲线) */
export function healScale(i: number): number {
  return i <= 5 ? Math.pow(3, i) : Math.pow(3, 5) * Math.pow(Math.sqrt(3), i - 5);
}

// ---------- 掉落物存续(秒),超级以上不消失 ----------
export const DROP_DESPAWN = [30, 60, 90, 120, 150, 180, 210, Infinity, Infinity, Infinity];

// ---------- 玩家 ----------
export const PLAYER = {
  radius: 22,
  baseHp: 100,
  speed: 290,          // 世界单位/秒
  accel: 9,            // 速度趋近速率(1/s)
  petalOrbit: 46,      // 花瓣轨道半径
  baseRotation: 1.9,   // 基础旋转速度 rad/s
  spawnInvuln: 2.0,    // 复活无敌秒数
  pickupRadius: 46,
  invCap: 200,
  xpBase: 8,
  xpPow: 1.7,
  deathDropAll: true,  // 死亡掉落全部携带花瓣
  respawnDelay: 2.5,
};
export function xpForLevel(lv: number): number {
  return Math.floor(PLAYER.xpBase * Math.pow(lv, PLAYER.xpPow));
}

// ---------- 世界/地图 ----------
export const WORLD = {
  radius: 4600,
  safeRadius: 520,     // 中心安全区(出生点)
};
export const VIEW_HEIGHT = 1500; // 客户端视口对应的世界高度(缩放基准)

// ---------- PvE 掉落资格 ----------
export const DROP_MIN_CONTRIB = 0.15; // 伤害占比门槛
export const DROP_TOP_N = 4;          // 前 N 名
export const DROP_SUPER_CONTRIB = 0.01; // 超级以上怪物放宽
export const DROP_SUPER_TOP_N = 25;

// ---------- 怪物稀有度属性倍率(近似指数 2.6^i) ----------
export const MOB_STAT_MULT = [1, 2.6, 6.8, 17.6, 45.9, 119, 310, 806, 2096];
export const MOB_XP_MULT = [1, 2, 4, 8, 16, 32, 64, 128, 256];
export const MOB_MAX_DROP_RARITY = 6; // 怪物掉落花瓣最高究极

// ---------- 花园环形分区 ----------
export interface RingDef {
  id: string;
  r0: number;
  r1: number;
  density: number;      // 目标常驻怪物数
  pvp: boolean;         // 是否开启玩家对战
  species: string[];    // 刷怪表
  rarityW: number[];    // 怪物稀有度权重(索引=稀有度)
}
export const RINGS: RingDef[] = [
  { id: 'C0', r0: 0, r1: 520, density: 0, pvp: false, species: [], rarityW: [] },
  { id: 'C1', r0: 520, r1: 1000, density: 26, pvp: false, species: ['baby_ant', 'worker_ant', 'ladybug', 'rock'], rarityW: [70, 28, 2] },
  { id: 'C2', r0: 1000, r1: 1450, density: 30, pvp: false, species: ['worker_ant', 'ladybug', 'bee', 'rock'], rarityW: [45, 42, 12, 1] },
  { id: 'C3', r0: 1450, r1: 1900, density: 32, pvp: false, species: ['ladybug', 'bee', 'hornet', 'rock', 'spider'], rarityW: [24, 40, 28, 7, 1] },
  { id: 'C4', r0: 1900, r1: 2400, density: 34, pvp: false, species: ['bee', 'hornet', 'spider', 'rock', 'bumblebee'], rarityW: [12, 32, 36, 16, 4] },
  { id: 'C5', r0: 2400, r1: 2900, density: 36, pvp: true, species: ['hornet', 'spider', 'bumblebee', 'bee', 'rock'], rarityW: [5, 20, 34, 26, 12, 3] },
  { id: 'C6', r0: 2900, r1: 3400, density: 38, pvp: true, species: ['spider', 'bumblebee', 'hornet', 'rock'], rarityW: [2, 12, 28, 30, 20, 7, 1] },
  { id: 'C7', r0: 3400, r1: 3900, density: 40, pvp: true, species: ['bumblebee', 'spider', 'hornet'], rarityW: [0, 5, 18, 30, 28, 14, 5] },
  { id: 'C8', r0: 3900, r1: 4400, density: 42, pvp: true, species: ['bumblebee', 'spider', 'hornet'], rarityW: [0, 2, 10, 24, 30, 22, 10, 2] },
  { id: 'C9', r0: 4400, r1: 4600, density: 44, pvp: true, species: ['bumblebee', 'spider', 'hornet'], rarityW: [0, 0, 4, 16, 28, 30, 22] },
];

export function ringAt(r: number): RingDef | undefined {
  for (const ring of RINGS) if (r >= ring.r0 && r < ring.r1) return ring;
  return undefined;
}
export function isPvp(x: number, y: number): boolean {
  const ring = ringAt(Math.hypot(x, y));
  return ring ? ring.pvp : false;
}

// ---------- 观战/服务端基础 ----------
export const ROOM_CAPACITY = 60;
export const SNAPSHOT_RANGE = 2600; // 实体同步半径
export const START_KIT = ['basic', 'basic', 'basic', 'basic', 'basic'];
