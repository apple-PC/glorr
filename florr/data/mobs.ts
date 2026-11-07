// 【生物数据层】全量清单(catalog) + 已考据数值覆盖(VERIFIED)
// 重写契约:新增生物 = 在 catalog.ts 加一行;行为靠 behavior/family 驱动,不写 id 分支。
// src:'wiki' = 已按中文维基「模块:生物统计」校核;src:'est' = 占位默认,不是实测。
import type { MobDef } from '@/sim/types';
import { MOBS as CATALOG, AREA_BY_ID, type MobFamily } from '@/data/catalog';
import { pickDropFor } from '@/data/areas';

export interface MobDefX extends MobDef {
  en: string;
  family: MobFamily;
  area: string;
  boss: boolean;
  src: 'wiki' | 'est';
}

/** 已校核的 11 种(原 glorr 数据,原样保留) */
const VERIFIED: Record<string, Partial<MobDef>> = {
  rock:       { name: '岩石', hp: 75, dmg: 10, speed: 0,   radius: 27, xp: 1, armor: 1, behavior: 'static',     aggro: 0,   color: '#9aa0a6', drops: [['rock', 50], ['heavy', 20]] },
  ladybug:    { name: '瓢虫', hp: 60, dmg: 10, speed: 105, radius: 20, xp: 1, armor: 1, behavior: 'passive',    aggro: 460, neutralFrom: 2, color: '#e5484d', drops: [['rose', 60], ['fast', 40]] },
  bee:        { name: '蜜蜂', hp: 35, dmg: 50, speed: 180, radius: 14, xp: 1, armor: 1, behavior: 'passive',    aggro: 400, neutralFrom: 2, color: '#f5c518', drops: [['stinger', 60], ['honey', 30]] },
  baby_ant:   { name: '幼蚁', hp: 25, dmg: 10, speed: 110, radius: 11, xp: 1, armor: 1, behavior: 'passive',    aggro: 0,   color: '#d8b978', drops: [['fast', 60], ['leaf', 30]] },
  worker_ant: { name: '工蚁', hp: 60, dmg: 10, speed: 150, radius: 15, xp: 1, armor: 1, behavior: 'neutral',    aggro: 420, color: '#b08d4f', drops: [['leaf', 60], ['basic', 40]] },
  soldier_ant:{ name: '兵蚁', hp: 100,dmg: 10, speed: 165, radius: 17, xp: 1, armor: 1, behavior: 'aggressive', aggro: 480, color: '#8a6b3a', drops: [['glass', 60], ['clover', 40]] },
  hornet:     { name: '黄蜂', hp: 60, dmg: 50, speed: 140, radius: 15, xp: 1, armor: 1, behavior: 'aggressive', aggro: 520, color: '#e8a13a', ranged: { dmg: 10, speed: 320, cd: 2.2, range: 480 }, drops: [['missile', 100]] },
  spider:     { name: '蜘蛛', hp: 60, dmg: 15, speed: 265, radius: 16, xp: 1, armor: 1, behavior: 'aggressive', aggro: 460, color: '#5b5f6b', poison: 40, drops: [['web', 60], ['faster', 40]] },
  bumblebee:  { name: '熊蜂', hp: 25, dmg: 20, speed: 155, radius: 23, xp: 1, armor: 1, behavior: 'passive',    aggro: 0,   color: '#d9a441', drops: [['honey', 100]] },
  centipede:  { name: '蜈蚣', hp: 25, dmg: 10, speed: 90,  radius: 20, xp: 1, armor: 1, behavior: 'passive',    aggro: 420, neutralFrom: 3, color: '#8fbf5a', drops: [['peas', 60], ['leaf', 40]] },
  dandelion:  { name: '蒲公英', hp: 40, dmg: 10, speed: 0, radius: 18, xp: 1, armor: 1, behavior: 'static',   aggro: 0, color: '#e8e08a', ranged: { dmg: 10, speed: 280, cd: 2.6, range: 420 }, drops: [['leaf', 100]] },
};

/** 按科属给的占位默认(未逐项校核的生物,标记 est) */
const FAMILY_DEFAULT: Record<MobFamily, Pick<MobDef, 'hp' | 'dmg' | 'speed' | 'radius' | 'xp' | 'armor' | 'aggro' | 'color'>> = {
  ant:      { hp: 55,  dmg: 12, speed: 140, radius: 15, xp: 1, armor: 1, aggro: 440, color: '#b08d4f' },
  bee:      { hp: 40,  dmg: 30, speed: 170, radius: 16, xp: 1, armor: 1, aggro: 430, color: '#f5c518' },
  wasp:     { hp: 65,  dmg: 40, speed: 155, radius: 16, xp: 2, armor: 2, aggro: 520, color: '#e8a13a' },
  beetle:   { hp: 140, dmg: 25, speed: 95,  radius: 24, xp: 3, armor: 4, aggro: 430, color: '#6f7a52' },
  centipede:{ hp: 80,  dmg: 18, speed: 110, radius: 20, xp: 2, armor: 2, aggro: 460, color: '#8fbf5a' },
  ladybug:  { hp: 70,  dmg: 14, speed: 110, radius: 20, xp: 1, armor: 1, aggro: 450, color: '#e5484d' },
  spider:   { hp: 75,  dmg: 20, speed: 230, radius: 17, xp: 2, armor: 2, aggro: 500, color: '#5b5f6b' },
  rock:     { hp: 110, dmg: 12, speed: 0,   radius: 27, xp: 1, armor: 3, aggro: 0,   color: '#9aa0a6' },
  plant:    { hp: 60,  dmg: 12, speed: 0,   radius: 19, xp: 1, armor: 1, aggro: 0,   color: '#7fae5a' },
  ocean:    { hp: 85,  dmg: 18, speed: 90,  radius: 21, xp: 2, armor: 2, aggro: 440, color: '#4aa6c9' },
  hel:      { hp: 180, dmg: 45, speed: 150, radius: 22, xp: 6, armor: 6, aggro: 560, color: '#8e5bd0' },
  mecha:    { hp: 220, dmg: 50, speed: 130, radius: 24, xp: 8, armor: 8, aggro: 560, color: '#8d99a6' },
  special:  { hp: 90,  dmg: 20, speed: 120, radius: 20, xp: 2, armor: 2, aggro: 450, color: '#a0a0a0' },
  termite:  { hp: 70,  dmg: 16, speed: 130, radius: 17, xp: 2, armor: 2, aggro: 470, color: '#c9a06b' },
};

/** 区域难度系数(占位,待 wiki 逐区校核) */
const AREA_TIER = new Map([...AREA_BY_ID.values()].map((a) => [a.id, a.tier]));

function build(row: (typeof CATALOG)[number]): MobDefX {
  const v = VERIFIED[row.id];
  const base = FAMILY_DEFAULT[row.family];
  const tier = AREA_TIER.get(row.area) ?? 0;
  const scale = 1 + tier * 0.6;
  return {
    id: row.id,
    en: row.en,
    name: row.zh,
    family: row.family,
    area: row.area,
    boss: row.boss ?? false,
    src: v ? 'wiki' : 'est',
    hp: Math.round(base.hp * (row.boss ? 12 : 1) * scale),
    dmg: Math.round(base.dmg * scale),
    speed: base.speed,
    radius: row.boss ? Math.round(base.radius * 2.2) : base.radius,
    xp: Math.round(base.xp * (row.boss ? 40 : 1) * scale),
    armor: base.armor,
    behavior: row.behavior,
    aggro: base.aggro,
    color: base.color,
    drops: pickDropFor(row.id, row.area),
    ...(v ?? {}),
  };
}

/** 全量生物表 —— 顺序即 species index(渲染/快照用) */
export const MOBS: MobDefX[] = CATALOG.map(build);
const MAP = new Map(MOBS.map((m) => [m.id, m]));

export function getMob(id: string): MobDefX {
  const m = MAP.get(id);
  if (!m) throw new Error(`未知生物: ${id}`);
  return m;
}
export function mobExists(id: string): boolean { return MAP.has(id); }
export const SPECIES_INDEX = new Map(MOBS.map((m, i) => [m.id, i]));
export function allMobs(): MobDefX[] { return MOBS; }
