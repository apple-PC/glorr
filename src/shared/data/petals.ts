import type { PetalDef } from '@shared/types';
import * as C from '@shared/constants';

// glorr 花瓣图鉴(数值参考 florr.io 基础花瓣,缩放曲线见 constants)
export const PETALS: PetalDef[] = [
  {
    id: 'basic', name: '基础', kind: 'melee', dmg: 10, hp: 10, reload: 2.5, minRarity: 0,
    desc: '均衡的入门花瓣,伤害与耐久都够用(2.5s 冷却)',
  },
  {
    id: 'fast', name: '轻', kind: 'melee', dmg: 4, hp: 12, reload: 0, minRarity: 0,
    desc: '伤害极低,但几乎没有重量,旋转灵活',
  },
  {
    id: 'heavy', name: '重', kind: 'melee', dmg: 26, hp: 60, reload: 0, minRarity: 0, rotMul: 0.55,
    desc: '高耐久高伤害,但会拖慢花瓣转速',
  },
  {
    id: 'leaf', name: '叶子', kind: 'heal', dmg: 6, hp: 18, reload: 0, minRarity: 1, healPerSec: 3.5,
    desc: '展开时持续回复生命,赶路刷怪全程生效',
  },
  {
    id: 'rose', name: '玫瑰', kind: 'heal', dmg: 8, hp: 22, reload: 0, minRarity: 1, onHitHeal: 14,
    desc: '命中敌人瞬间回复生命,应急保命',
  },
  {
    id: 'stinger', name: '蜂针', kind: 'melee', dmg: 18, hp: 10, reload: 0, minRarity: 1,
    desc: '高攻速近战输出,耐久偏低,用量堆伤害',
  },
  {
    id: 'rock', name: '石头', kind: 'melee', dmg: 30, hp: 90, reload: 0, minRarity: 2,
    desc: '耐久极高的撞击型花瓣,适合前排推怪',
  },
  {
    id: 'missile', name: '导弹', kind: 'ranged', dmg: 22, hp: 8, reload: 1.9, minRarity: 2,
    projSpeed: 430, projRange: 640,
    desc: '远程攻击,沿花瓣朝向射出,小心误伤',
  },
  {
    id: 'web', name: '蛛网', kind: 'ranged', dmg: 5, hp: 12, reload: 2.4, minRarity: 2,
    projSpeed: 380, projRange: 420, slow: 0.45, slowDur: 3,
    desc: '发射蛛网,命中区域大幅减速敌人',
  },
  {
    id: 'faster', name: '更快', kind: 'buff', dmg: 4, hp: 20, reload: 0, minRarity: 2, rotBonus: 0.16,
    desc: '提升所有花瓣的旋转速度',
  },
  {
    id: 'honey', name: '蜂蜜', kind: 'heal', dmg: 4, hp: 20, reload: 0, minRarity: 2, healPerSec: 4, slowResist: 0.35,
    desc: '持续回血,并减缓受到的减速效果',
  },
  {
    id: 'peas', name: '豌豆', kind: 'ranged', dmg: 8, hp: 12, reload: 2.0, minRarity: 2,
    projSpeed: 380, projRange: 380, projCount: 4,
    desc: '一次向四个方向散射豌豆,覆盖面广但单发伤害低',
  },
  {
    id: 'magnet', name: '磁铁', kind: 'buff', dmg: 4, hp: 20, reload: 0, minRarity: 2, pickupBonus: 34,
    desc: '大幅扩大掉落物拾取范围',
  },
  {
    id: 'wing', name: '翅膀', kind: 'buff', dmg: 4, hp: 18, reload: 0, minRarity: 2, orbitBonus: 9,
    desc: '加大花瓣环绕半径,从而扩大攻击范围',
  },
  {
    id: 'glass', name: '玻璃', kind: 'melee', dmg: 18, hp: 8, reload: 2.5, minRarity: 1,
    desc: '高伤害的脆玻璃碎片,极易破碎',
  },
  {
    id: 'clover', name: '三叶草', kind: 'heal', dmg: 4, hp: 20, reload: 2.5, minRarity: 2, healPerSec: 2.5,
    desc: '持续回血,据说能带来好运',
  },
];

const PETAL_MAP = new Map(PETALS.map((p) => [p.id, p]));

export function getPetal(id: string): PetalDef {
  const p = PETAL_MAP.get(id);
  if (!p) throw new Error(`未知花瓣: ${id}`);
  return p;
}

export function petalExists(id: string): boolean {
  return PETAL_MAP.has(id);
}

/** 该稀有度下花瓣的实际耐久 */
export function petalMaxHp(def: PetalDef, rarity: number): number {
  return Math.round(def.hp * Math.pow(3, rarity));
}
/** 该稀有度下花瓣的单次伤害 */
export function petalDmg(def: PetalDef, rarity: number): number {
  return Math.round(def.dmg * Math.pow(3, rarity) * 10) / 10;
}
/** 每秒治疗量(治疗曲线) */
export function petalHealPerSec(def: PetalDef, rarity: number): number {
  if (!def.healPerSec) return 0;
  const s = rarity <= 5 ? Math.pow(3, rarity) : Math.pow(3, 5) * Math.pow(Math.sqrt(3), rarity - 5);
  return Math.round(def.healPerSec * s * 10) / 10;
}
/** 命中瞬间治疗量 */
export function petalOnHitHeal(def: PetalDef, rarity: number): number {
  if (!def.onHitHeal) return 0;
  const s = rarity <= 5 ? Math.pow(3, rarity) : Math.pow(3, 5) * Math.pow(Math.sqrt(3), rarity - 5);
  return Math.round(def.onHitHeal * s * 10) / 10;
}

/** 由装备计算花瓣旋转速度(客户端预测与服务端同公式;允许 null 槽位) */
export function rotationSpeed(loadout: ({ id: string } | null)[]): number {
  let rot = C.PLAYER.baseRotation;
  for (const s of loadout) {
    if (!s) continue;
    const def = PETAL_MAP.get(s.id);
    if (!def) continue;
    if (def.rotBonus) rot += def.rotBonus;
    if (def.rotMul) rot *= def.rotMul;
  }
  return rot;
}

/** 由装备计算花瓣轨道半径(翅膀加大攻击范围;两端同公式) */
export function orbitRadius(loadout: ({ id: string } | null)[]): number {
  let r = C.PLAYER.petalOrbit;
  for (const s of loadout) {
    if (!s) continue;
    const def = PETAL_MAP.get(s.id);
    if (def?.orbitBonus) r += def.orbitBonus;
  }
  return r;
}

/** 由装备计算掉落拾取半径(磁铁) */
export function pickupRadius(loadout: ({ id: string } | null)[]): number {
  let r = C.PLAYER.pickupRadius;
  for (const s of loadout) {
    if (!s) continue;
    const def = PETAL_MAP.get(s.id);
    if (def?.pickupBonus) r += def.pickupBonus;
  }
  return r;
}
