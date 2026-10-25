import type { MobDef } from '@shared/types';

// glorr 花园生物图鉴 —— 数值取自 florr.io 中文维基「模块:生物统计」普通稀有度
export const MOBS: MobDef[] = [
  {
    id: 'rock', name: '岩石', hp: 75, dmg: 10, speed: 0, radius: 27, xp: 1, armor: 1,
    behavior: 'static', aggro: 0, color: '#9aa0a6',
    drops: [['rock', 50], ['heavy', 20]],
  },
  {
    id: 'ladybug', name: '瓢虫', hp: 60, dmg: 10, speed: 105, radius: 20, xp: 1, armor: 1,
    behavior: 'passive', neutralFrom: 2, aggro: 460, color: '#e5484d',
    drops: [['rose', 60], ['fast', 40]],
  },
  {
    id: 'bee', name: '蜜蜂', hp: 35, dmg: 50, speed: 180, radius: 14, xp: 1, armor: 1,
    behavior: 'passive', neutralFrom: 2, aggro: 400, color: '#f5c518',
    drops: [['stinger', 60], ['honey', 30]],
  },
  {
    id: 'baby_ant', name: '幼蚁', hp: 25, dmg: 10, speed: 110, radius: 11, xp: 1, armor: 1,
    behavior: 'passive', aggro: 0, color: '#d8b978',
    drops: [['fast', 60], ['leaf', 30]],
  },
  {
    id: 'worker_ant', name: '工蚁', hp: 60, dmg: 10, speed: 150, radius: 15, xp: 1, armor: 1,
    behavior: 'neutral', aggro: 420, color: '#b08d4f',
    drops: [['leaf', 60], ['basic', 40]],
  },
  {
    id: 'soldier_ant', name: '兵蚁', hp: 100, dmg: 10, speed: 165, radius: 17, xp: 1, armor: 1,
    behavior: 'aggressive', aggro: 480, color: '#8a6b3a',
    drops: [['glass', 60], ['clover', 40]],
  },
  {
    id: 'hornet', name: '黄蜂', hp: 60, dmg: 50, speed: 140, radius: 15, xp: 1, armor: 1,
    behavior: 'aggressive', aggro: 520, color: '#e8a13a',
    ranged: { dmg: 10, speed: 320, cd: 2.2, range: 480 },
    drops: [['missile', 100]],
  },
  {
    id: 'spider', name: '蜘蛛', hp: 60, dmg: 15, speed: 265, radius: 16, xp: 1, armor: 1,
    behavior: 'aggressive', aggro: 460, color: '#5b5f6b', poison: 40,
    drops: [['web', 60], ['faster', 40]],
  },
  {
    id: 'bumblebee', name: '熊蜂', hp: 25, dmg: 20, speed: 155, radius: 23, xp: 1, armor: 1,
    behavior: 'passive', aggro: 0, color: '#d9a441',
    drops: [['honey', 100]],
  },
  {
    id: 'centipede', name: '蜈蚣', hp: 25, dmg: 10, speed: 90, radius: 20, xp: 1, armor: 1,
    behavior: 'passive', neutralFrom: 3, aggro: 420, color: '#8fbf5a',
    drops: [['peas', 60], ['leaf', 40]],
  },
  {
    id: 'dandelion', name: '蒲公英', hp: 40, dmg: 10, speed: 0, radius: 18, xp: 1, armor: 1,
    behavior: 'static', aggro: 0, color: '#e8e08a',
    ranged: { dmg: 10, speed: 280, cd: 2.6, range: 420 },
    drops: [['leaf', 100]],
  },
];

const MOB_MAP = new Map(MOBS.map((m) => [m.id, m]));

export function getMob(id: string): MobDef {
  const m = MOB_MAP.get(id);
  if (!m) throw new Error(`未知生物: ${id}`);
  return m;
}

export const SPECIES_INDEX = new Map(MOBS.map((m, i) => [m.id, i]));
