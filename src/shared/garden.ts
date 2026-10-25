// glorr 新版花园:直接使用 wiki 新花园地图烘焙出的迷宫网格
// 白色=可行走,黑色=墙;绿色点=出生点/传送门
import { GRID_CELL, GRID_H, GRID_W, MAP_PX, ROWS, SPAWN_PX } from '@shared/gardenGrid';

export const GARDEN_HALF = 3200;
/** 世界单位 / 地图像素 */
export const WORLD_PER_PX = GARDEN_HALF / (MAP_PX / 2);
const PX_PER_WORLD = 1 / WORLD_PER_PX;

export function worldToPx(x: number): number {
  return x * PX_PER_WORLD + MAP_PX / 2;
}
export function pxToWorld(px: number): number {
  return (px - MAP_PX / 2) * WORLD_PER_PX;
}

function cellWalkable(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  return ROWS[gy].charCodeAt(gx) === 49; // '1'
}

export function walkablePx(px: number, py: number): boolean {
  if (px < 0 || py < 0 || px >= MAP_PX || py >= MAP_PX) return false;
  return cellWalkable(Math.floor(px / GRID_CELL), Math.floor(py / GRID_CELL));
}

export function walkable(x: number, y: number): boolean {
  return walkablePx(worldToPx(x), worldToPx(y));
}

/** 圆形与墙格碰撞 */
export function blocked(x: number, y: number, r: number): boolean {
  const px = worldToPx(x);
  const py = worldToPx(y);
  const rp = r * PX_PER_WORLD;
  const gx0 = Math.floor((px - rp) / GRID_CELL);
  const gx1 = Math.floor((px + rp) / GRID_CELL);
  const gy0 = Math.floor((py - rp) / GRID_CELL);
  const gy1 = Math.floor((py + rp) / GRID_CELL);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return true;
      if (cellWalkable(gx, gy)) continue;
      const x0 = gx * GRID_CELL;
      const y0 = gy * GRID_CELL;
      const cx = Math.max(x0, Math.min(px, x0 + GRID_CELL));
      const cy = Math.max(y0, Math.min(py, y0 + GRID_CELL));
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < rp * rp) return true;
    }
  }
  return false;
}

/** 把圆形推出墙体:搜索附近可行走点 */
export function pushOut(x: number, y: number, r: number): [number, number] {
  if (!blocked(x, y, r)) return [x, y];
  const step = GRID_CELL * WORLD_PER_PX;
  for (let ring = 1; ring <= 8; ring++) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const nx = x + Math.cos(a) * step * ring;
      const ny = y + Math.sin(a) * step * ring;
      if (!blocked(nx, ny, r)) return [nx, ny];
    }
  }
  return [x, y];
}

/** 绿色点聚类为传送门/出生点 */
export interface Portal {
  x: number;
  y: number;
}
export const PORTALS: Portal[] = (() => {
  const clusters: { sx: number; sy: number; n: number }[] = [];
  for (const [px, py] of SPAWN_PX) {
    let c = clusters.find((k) => Math.hypot(k.sx / k.n - px, k.sy / k.n - py) < 14);
    if (!c) {
      c = { sx: 0, sy: 0, n: 0 };
      clusters.push(c);
    }
    c.sx += px;
    c.sy += py;
    c.n++;
  }
  return clusters.map((c) => ({ x: pxToWorld(c.sx / c.n), y: pxToWorld(c.sy / c.n) }));
})();

/** 出生点:中央环形湖(图中偏下的锯齿环) */
export const PLAYER_SPAWN: [number, number] = (() => {
  const tx = pxToWorld(310);
  const ty = pxToWorld(545);
  let best = PORTALS[0];
  let bd = Infinity;
  for (const p of PORTALS) {
    const d = Math.hypot(p.x - tx, p.y - ty);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best ? [best.x, best.y] : [0, 0];
})();

export interface GardenZone {
  id: string;
  name: string;
  px0: number;
  py0: number;
  px1: number;
  py1: number;
  species: string[];
  rarityW: number[];
  weight: number;
}

function zone(
  id: string,
  name: string,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  species: string[],
  rarityW: number[],
  weight: number,
): GardenZone {
  return { id, name, px0, py0, px1, py1, species, rarityW, weight };
}

/** 分区刷怪(像素坐标,依据 wiki 描述的特殊房间位置) */
export const ZONES: GardenZone[] = [
  zone('spiral', '究极螺旋', 0, 0, 235, 235, ['bumblebee', 'spider', 'hornet', 'centipede'], [0, 0, 0, 5, 15, 30, 30, 15, 5], 3),
  zone('tr', '传说瓢虫房', 470, 0, 700, 235, ['ladybug'], [0, 0, 4, 16, 40, 30, 8, 1], 4),
  zone('br', '传说蜜蜂房', 470, 470, 700, 700, ['bee'], [0, 0, 4, 16, 40, 30, 8, 1], 4),
  zone('bl', '传奇黄蜂走廊', 0, 300, 205, 525, ['hornet'], [0, 0, 8, 28, 40, 18, 5, 1], 4),
  zone('blroom', '史诗蒲公英房', 0, 525, 225, 700, ['dandelion', 'centipede'], [0, 4, 26, 45, 20, 5], 4),
  zone('myth', '神话长廊', 0, 0, 205, 300, ['spider', 'bumblebee', 'hornet', 'centipede'], [0, 0, 0, 8, 24, 38, 22, 6, 2], 3),
  zone('inner', '花园中心', 235, 235, 465, 465, ['baby_ant', 'worker_ant', 'rock', 'ladybug'], [58, 28, 10, 3, 1], 30),
  zone('mid', '花园中圈', 150, 150, 550, 550, ['worker_ant', 'ladybug', 'bee', 'rock', 'soldier_ant', 'centipede'], [34, 34, 15, 10, 5, 2], 40),
  zone('outer', '花园外圈', 0, 0, 700, 700, ['bee', 'hornet', 'spider', 'rock', 'bumblebee', 'soldier_ant', 'centipede'], [10, 18, 22, 12, 20, 10, 8, 3], 22),
];

function weightedPick(w: number[]): number {
  let sum = 0;
  for (const v of w) sum += v;
  if (sum <= 0) return 0;
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

/** 随机合法刷怪点(按分区权重,必须落在可行走格) */
export function randomSpawnPoint(): { x: number; y: number; zone: GardenZone } | null {
  let total = 0;
  for (const z of ZONES) total += z.weight;
  for (let attempt = 0; attempt < 48; attempt++) {
    let r = Math.random() * total;
    let zoneSel = ZONES[0];
    for (const z of ZONES) {
      r -= z.weight;
      if (r <= 0) {
        zoneSel = z;
        break;
      }
    }
    const px = zoneSel.px0 + Math.random() * (zoneSel.px1 - zoneSel.px0);
    const py = zoneSel.py0 + Math.random() * (zoneSel.py1 - zoneSel.py0);
    if (!walkablePx(px, py)) continue;
    const x = pxToWorld(px);
    const y = pxToWorld(py);
    if (Math.hypot(x - PLAYER_SPAWN[0], y - PLAYER_SPAWN[1]) < 320) continue;
    if (blocked(x, y, 26)) continue;
    return { x, y, zone: zoneSel };
  }
  return null;
}
