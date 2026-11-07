// 【天赋数据层】升级给点,树状节点
// 注:原版 florr 的天赋树结构 wiki 未完全公开,当前节点沿用已实现的 5 条并标记 est;
// 阶段 B 依据实机/ wiki 校准后只改数据,不改 UI 与 sim。
export interface TalentDef {
  id: 'speed' | 'magnet' | 'heal' | 'hp' | 'dmg' | 'slots' | 'rotation' | 'luck';
  name: string;
  en: string;
  max: number;
  baseCost: number;
  desc: string;
  src: 'wiki' | 'est';
}

export const TALENTS: TalentDef[] = [
  { id: 'speed',    name: '疾跑', en: 'Speed',    max: 5, baseCost: 1, desc: '技能「疾跑」持续更久、冷却更短', src: 'est' },
  { id: 'magnet',   name: '磁力', en: 'Magnet',   max: 5, baseCost: 1, desc: '技能「磁铁」持续更久、冷却更短', src: 'est' },
  { id: 'heal',     name: '愈合', en: 'Heal',     max: 5, baseCost: 1, desc: '技能「治疗」持续更久、冷却更短', src: 'est' },
  { id: 'hp',       name: '生命', en: 'Health',   max: 8, baseCost: 1, desc: '每级 +8% 最大生命', src: 'wiki' },
  { id: 'dmg',      name: '锋利', en: 'Damage',   max: 8, baseCost: 1, desc: '每级 +6% 花瓣伤害', src: 'wiki' },
  { id: 'slots',    name: '槽位', en: 'Slots',    max: 5, baseCost: 5, desc: '每级 +1 花瓣槽(上限受稀有度约束)', src: 'wiki' },
  { id: 'rotation', name: '转速', en: 'Rotation', max: 8, baseCost: 2, desc: '每级 +4% 花瓣旋转速度', src: 'wiki' },
  { id: 'luck',     name: '幸运', en: 'Luck',     max: 8, baseCost: 2, desc: '提高合成与掉落判定', src: 'wiki' },
];

/** 升级给点:尾数 5 额外 +1,尾数 0 额外 +9(沿用已实现规则) */
export function tpForLevel(level: number): number {
  let n = 1;
  if (level % 5 === 0) n += level % 10 === 0 ? 9 : 1;
  return n;
}
