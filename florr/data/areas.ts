// 【区域数据层】区域清单来自 catalog;这里提供刷怪表、掉落表、分区难度带。
// 重写契约:阶段 C 实现 7 区域时,只需在此填 spawn 表,sim 不改逻辑。
import { AREAS, AREA_BY_ID, PETALS, MOBS, NPCS, type PetalRow } from '@/data/catalog';

export { AREAS, AREA_BY_ID, NPCS };

/** 每个区域可用的掉落花瓣(按 minRarity 上限过滤,避免新手区掉超级) */
const AREA_RARITY_CAP: Record<string, number> = {
  garden: 2, desert: 4, ocean: 4, jungle: 5, hel: 7,
  crystal_room: 5, sewers: 3, ant_hell: 3, factory: 6, pyramid: 6, rift: 8,
  termite_mound: 4, worm: 4, training: 1,
};

/** 区域倾向的花瓣角色(掉落表加权) */
const AREA_ROLE_WEIGHT: Record<string, Partial<Record<PetalRow['role'], number>>> = {
  garden:  { melee: 4, heal: 3, buff: 2, ranged: 2, utility: 1 },
  desert:  { tank: 3, melee: 3, ranged: 2, summon: 2, utility: 1 },
  ocean:   { ranged: 3, heal: 3, utility: 2, buff: 2 },
  jungle:  { summon: 4, heal: 3, melee: 2, utility: 2 },
  hel:     { melee: 3, tank: 3, ranged: 3, summon: 2, utility: 2 },
  factory: { utility: 4, ranged: 3, tank: 2 },
  pyramid: { utility: 4, tank: 3, melee: 2 },
  rift:    { utility: 4, summon: 3, ranged: 2 },
};

/** 为某生物生成掉落表(数据驱动,无 id 分支);已考据生物在 mobs.ts 里被 VERIFIED 覆盖 */
export function pickDropFor(_mobId: string, area: string): [string, number][] {
  const cap = AREA_RARITY_CAP[area] ?? 2;
  const w = AREA_ROLE_WEIGHT[area] ?? AREA_ROLE_WEIGHT.garden;
  const pool = PETALS.filter((p) => p.minRarity <= cap && !p.tags.includes('uncraftable'));
  const scored = pool
    .map((p) => ({ id: p.id, w: (w[p.role] ?? 1) * (1 + p.minRarity * 0.15) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 6);
  if (scored.length === 0) return [['basic', 100]];
  return scored.map((s, i) => [s.id, Math.max(5, 100 - i * 17)] as [string, number]);
}

/** 区域刷怪表(阶段 C 用;当前 Garden 由 sim/geometry.ts 的 ZONES 驱动) */
export interface SpawnRule {
  area: string;
  species: string[];
  /** 索引 = 稀有度,值 = 权重 */
  rarityW: number[];
  density: number;
  pvp: boolean;
}

const RARITY_BANDS: Record<number, number[]> = {
  0: [70, 28, 2],
  1: [45, 40, 13, 2],
  2: [24, 38, 28, 9, 1],
  3: [10, 28, 34, 20, 7, 1],
  4: [2, 12, 26, 30, 20, 8, 2],
};

export function spawnRuleFor(areaId: string): SpawnRule | null {
  const a = AREA_BY_ID.get(areaId);
  if (!a || a.mobs.length === 0) return null;
  return {
    area: areaId,
    species: a.mobs.filter((id) => MOBS.some((m) => m.id === id)),
    rarityW: RARITY_BANDS[a.tier] ?? RARITY_BANDS[2],
    density: 26 + a.tier * 4,
    pvp: areaId === 'rift',
  };
}

export const SPAWN_RULES: SpawnRule[] = AREAS
  .map((a) => spawnRuleFor(a.id))
  .filter((r): r is SpawnRule => r !== null);

/** 全内容统计(供图鉴与自检) */
export const CONTENT_STATS = {
  petals: PETALS.length,
  mobs: MOBS.length,
  areas: AREAS.length,
  dungeons: AREAS.filter((a) => a.kind === 'dungeon').length,
  npcs: NPCS.length,
};
