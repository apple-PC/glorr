// 【花瓣数据层】全量清单(catalog) + 已考据数值覆盖(VERIFIED)
// 重写契约:新增花瓣 = 在 catalog.ts 加一行;机制靠 tags 解释,不在这里塞逻辑分支。
// src:'wiki' = 已按 florr wiki 校核;src:'est' = 按角色给的占位默认值,不是实测,禁止当平衡依据。
import * as C from '@/data/rules';
import type { PetalDef } from '@/sim/types';
import { PETALS as CATALOG, type PetalRole, type PetalTag } from '@/data/catalog';

/** 扩展后的花瓣定义:保留 sim 依赖的全部旧字段,追加全内容元数据 */
export interface PetalDefX extends PetalDef {
  en: string;
  role: PetalRole;
  tags: PetalTag[];
  src: 'wiki' | 'est';
}

/** 已按 wiki / 平衡模拟校核的 17 种(原 glorr 数据,原样保留,不重敲) */
const VERIFIED: Record<string, Partial<PetalDef>> = {
  basic:   { name: '基础', kind: 'melee',  dmg: 10,  hp: 10,  reload: 2.5, minRarity: 0, desc: '均衡的入门花瓣,伤害与耐久都够用(2.5s 冷却)' },
  fast:    { name: '轻',   kind: 'melee',  dmg: 13,  hp: 5,   reload: 0.8, minRarity: 0, desc: '伤害极低,但几乎没有重量,旋转灵活' },
  heavy:   { name: '重',   kind: 'melee',  dmg: 13,  hp: 150, reload: 10,  minRarity: 0, rotMul: 0.55, desc: '高耐久高伤害,但会拖慢花瓣转速' },
  leaf:    { name: '叶子', kind: 'heal',   dmg: 16,  hp: 12,  reload: 1.8, minRarity: 1, healPerSec: 1, desc: '展开时持续回复生命' },
  rose:    { name: '玫瑰', kind: 'heal',   dmg: 5,   hp: 5,   reload: 3.5, minRarity: 1, onHitHeal: 7.5, desc: '命中敌人瞬间回复生命' },
  stinger: { name: '蜂针', kind: 'melee',  dmg: 100, hp: 1,   reload: 10,  minRarity: 1, desc: '高攻速近战输出,耐久偏低' },
  rock:    { name: '岩石', kind: 'melee',  dmg: 22,  hp: 30,  reload: 3,   minRarity: 2, desc: '耐久极高的撞击型花瓣' },
  missile: { name: '导弹', kind: 'ranged', dmg: 22,  hp: 8,   reload: 1.9, minRarity: 2, projSpeed: 430, projRange: 640, desc: '远程攻击,沿花瓣朝向射出' },
  web:     { name: '蛛网', kind: 'ranged', dmg: 5,   hp: 12,  reload: 2.4, minRarity: 2, projSpeed: 380, projRange: 420, slow: 0.45, slowDur: 3, desc: '发射蛛网,命中区域大幅减速敌人' },
  faster:  { name: '更快', kind: 'buff',   dmg: 4,   hp: 20,  reload: 0,   minRarity: 2, rotBonus: 0.16, desc: '提升所有花瓣的旋转速度' },
  honey:   { name: '蜂蜜', kind: 'heal',   dmg: 4,   hp: 20,  reload: 0,   minRarity: 2, healPerSec: 4, slowResist: 0.35, desc: '持续回血,并减缓受到的减速效果' },
  peas:    { name: '豌豆', kind: 'ranged', dmg: 8,   hp: 12,  reload: 2.0, minRarity: 2, projSpeed: 380, projRange: 380, projCount: 4, desc: '一次向四个方向散射豌豆' },
  magnet:  { name: '磁铁', kind: 'buff',   dmg: 1,   hp: 30,  reload: 1.5, minRarity: 2, pickupBonus: 80, desc: '大幅扩大掉落物拾取范围' },
  wing:    { name: '翅膀', kind: 'buff',   dmg: 4,   hp: 18,  reload: 0,   minRarity: 2, orbitBonus: 9, desc: '加大花瓣环绕半径,扩大攻击范围' },
  glass:   { name: '玻璃', kind: 'melee',  dmg: 20,  hp: 5,   reload: 2.5, minRarity: 1, desc: '高伤害的脆玻璃碎片,极易破碎' },
  clover:  { name: '三叶草', kind: 'buff', dmg: 10,  hp: 10,  reload: 2.5, minRarity: 2, rotBonus: 0.05, desc: '略微加快花瓣旋转' },
  dandelion: { name: '蒲公英', kind: 'ranged', dmg: 6, hp: 12, reload: 2.6, minRarity: 1, projSpeed: 280, projRange: 420, desc: '发射绒毛种子' },
};

/** 按角色给的占位默认(仅用于尚未逐项校核的花瓣,标记 src:'est') */
const ROLE_DEFAULT: Record<PetalRole, Omit<PetalDef, 'id' | 'name' | 'desc' | 'minRarity'>> = {
  melee:   { kind: 'melee',  dmg: 12, hp: 15, reload: 2.5 },
  ranged:  { kind: 'ranged', dmg: 10, hp: 10, reload: 2.0, projSpeed: 380, projRange: 460 },
  heal:    { kind: 'heal',   dmg: 6,  hp: 12, reload: 2.5, healPerSec: 1.5 },
  summon:  { kind: 'buff',   dmg: 4,  hp: 20, reload: 4.0 },
  buff:    { kind: 'buff',   dmg: 4,  hp: 18, reload: 0 },
  tank:    { kind: 'buff',   dmg: 5,  hp: 40, reload: 3.0 },
  utility: { kind: 'buff',   dmg: 5,  hp: 15, reload: 2.5 },
};

/** 标签 → 附加机制字段(解释器据此生效;不写 id 分支) */
function tagFields(tags: PetalTag[]): Partial<PetalDef> {
  const f: Partial<PetalDef> = {};
  if (tags.includes('rotation')) f.rotBonus = (f.rotBonus ?? 0) + 0.08;
  if (tags.includes('orbit')) f.orbitBonus = (f.orbitBonus ?? 0) + 8;
  if (tags.includes('pickup')) f.pickupBonus = (f.pickupBonus ?? 0) + 60;
  if (tags.includes('slow')) { f.slow = f.slow ?? 0.4; f.slowDur = f.slowDur ?? 3; }
  if (tags.includes('particles')) f.projCount = f.projCount ?? 3;
  if (tags.includes('homing')) f.projSpeed = f.projSpeed ?? 420;
  if (tags.includes('regen')) f.healPerSec = f.healPerSec ?? 1.5;
  return f;
}

function build(row: (typeof CATALOG)[number]): PetalDefX {
  const v = VERIFIED[row.id];
  const base = ROLE_DEFAULT[row.role];
  return {
    id: row.id,
    name: row.zh,
    en: row.en,
    role: row.role,
    tags: row.tags,
    src: v ? 'wiki' : 'est',
    minRarity: row.minRarity,
    desc: row.note ?? `${row.zh} (${row.en})`,
    kind: base.kind,
    dmg: base.dmg,
    hp: base.hp,
    reload: base.reload,
    ...tagFields(row.tags),
    ...(v ?? {}),
  };
}

/** 全量花瓣表 —— 顺序稳定,供图鉴/掉落表引用 */
export const PETAL_DEFS: PetalDefX[] = CATALOG.map(build);
/** 兼容旧接口名(部分模块直接遍历 PETALS) */
export const PETALS = PETAL_DEFS;

const MAP = new Map(PETAL_DEFS.map((p) => [p.id, p]));

export function getPetal(id: string): PetalDefX {
  const p = MAP.get(id);
  if (!p) throw new Error(`未知花瓣: ${id}`);
  return p;
}
export function petalExists(id: string): boolean { return MAP.has(id); }
export function allPetals(): PetalDefX[] { return PETAL_DEFS; }

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
  return Math.round(def.healPerSec * C.healScale(rarity) * 10) / 10;
}
/** 命中瞬间治疗量 */
export function petalOnHitHeal(def: PetalDef, rarity: number): number {
  if (!def.onHitHeal) return 0;
  return Math.round(def.onHitHeal * C.healScale(rarity) * 10) / 10;
}

/** 由装备计算花瓣旋转速度 */
export function rotationSpeed(loadout: ({ id: string } | null)[]): number {
  let rot = C.PLAYER.baseRotation;
  for (const s of loadout) {
    if (!s) continue;
    const def = MAP.get(s.id);
    if (!def) continue;
    if (def.rotBonus) rot += def.rotBonus;
    if (def.rotMul) rot *= def.rotMul;
  }
  return rot;
}
/** 由装备计算花瓣轨道半径 */
export function orbitRadius(loadout: ({ id: string } | null)[]): number {
  let r = C.PLAYER.petalOrbit;
  for (const s of loadout) {
    if (!s) continue;
    const def = MAP.get(s.id);
    if (def?.orbitBonus) r += def.orbitBonus;
  }
  return r;
}
/** 由装备计算掉落拾取半径 */
export function pickupRadius(loadout: ({ id: string } | null)[]): number {
  let r = C.PLAYER.pickupRadius;
  for (const s of loadout) {
    if (!s) continue;
    const def = MAP.get(s.id);
    if (def?.pickupBonus) r += def.pickupBonus;
  }
  return r;
}
