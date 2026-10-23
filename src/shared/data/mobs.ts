import type { MobDef } from '@shared/types';

// glorr 花园生物图鉴(数值参考 florr.io 花园/Ant Hell 常见物种)
export const MOBS: MobDef[] = [
  {
    id: 'baby_ant', name: '幼蚁', hp: 12, dmg: 6, speed: 110, radius: 11, xp: 3, armor: 0,
    behavior: 'passive', aggro: 0, color: '#d8b978',
    drops: [['basic', 7], ['fast', 3]],
  },
  {
    id: 'worker_ant', name: '工蚁', hp: 30, dmg: 10, speed: 150, radius: 15, xp: 6, armor: 0,
    behavior: 'neutral', aggro: 420, color: '#b08d4f',
    drops: [['basic', 4], ['fast', 3], ['leaf', 3]],
  },
  {
    id: 'ladybug', name: '瓢虫', hp: 42, dmg: 9, speed: 105, radius: 20, xp: 8, armor: 1,
    behavior: 'neutral', aggro: 460, color: '#e5484d',
    drops: [['rose', 5], ['leaf', 4], ['stinger', 2]],
  },
  {
    id: 'rock', name: '石头', hp: 130, dmg: 14, speed: 0, radius: 27, xp: 10, armor: 6,
    behavior: 'static', aggro: 0, color: '#9aa0a6',
    drops: [['heavy', 5], ['rock', 4], ['basic', 2]],
  },
  {
    id: 'bee', name: '蜜蜂', hp: 26, dmg: 12, speed: 215, radius: 14, xp: 10, armor: 0,
    behavior: 'aggressive', aggro: 400, color: '#f5c518',
    drops: [['stinger', 4], ['honey', 4], ['leaf', 2]],
  },
  {
    id: 'hornet', name: '黄蜂', hp: 34, dmg: 10, speed: 135, radius: 15, xp: 14, armor: 1,
    behavior: 'aggressive', aggro: 520, color: '#e8a13a',
    ranged: { dmg: 14, speed: 320, cd: 2.2, range: 480 },
    drops: [['missile', 6], ['stinger', 3], ['leaf', 2]],
  },
  {
    id: 'spider', name: '蜘蛛', hp: 30, dmg: 14, speed: 265, radius: 16, xp: 18, armor: 0,
    behavior: 'aggressive', aggro: 460, color: '#5b5f6b',
    drops: [['web', 5], ['faster', 3], ['stinger', 2]],
  },
  {
    id: 'bumblebee', name: '熊蜂', hp: 95, dmg: 18, speed: 155, radius: 23, xp: 30, armor: 4,
    behavior: 'aggressive', aggro: 440, color: '#d9a441',
    drops: [['honey', 5], ['stinger', 3], ['leaf', 2]],
  },
];

const MOB_MAP = new Map(MOBS.map((m) => [m.id, m]));

export function getMob(id: string): MobDef {
  const m = MOB_MAP.get(id);
  if (!m) throw new Error(`未知生物: ${id}`);
  return m;
}

export const SPECIES_INDEX = new Map(MOBS.map((m, i) => [m.id, i]));
