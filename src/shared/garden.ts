// glorr 方形花园地图:边界墙、中央环形湖城墙、四角特殊房间、分区刷怪
import { hash2 } from '@shared/math';

export const GARDEN_HALF = 3200;

export interface GRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const H = GARDEN_HALF;
const T = 90;

function rect(x0: number, y0: number, x1: number, y1: number): GRect {
  return { x0, y0, x1, y1 };
}

/** 房间四壁,open 指定留缺口的一边 */
function frame(x0: number, y0: number, x1: number, y1: number, open: 'left' | 'right' | 'top' | 'bottom', t = 80, gap = 180): GRect[] {
  const out: GRect[] = [];
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  // 上
  if (open === 'top') {
    out.push(rect(x0, y0, midX - gap / 2, y0 + t), rect(midX + gap / 2, y0, x1, y0 + t));
  } else out.push(rect(x0, y0, x1, y0 + t));
  // 下
  if (open === 'bottom') {
    out.push(rect(x0, y1 - t, midX - gap / 2, y1), rect(midX + gap / 2, y1 - t, x1, y1));
  } else out.push(rect(x0, y1 - t, x1, y1));
  // 左
  if (open === 'left') {
    out.push(rect(x0, y0, x0 + t, midY - gap / 2), rect(x0, midY + gap / 2, x0 + t, y1));
  } else out.push(rect(x0, y0, x0 + t, y1));
  // 右
  if (open === 'right') {
    out.push(rect(x1 - t, y0, x1, midY - gap / 2), rect(x1 - t, midY + gap / 2, x1, y1));
  } else out.push(rect(x1 - t, y0, x1, y1));
  return out;
}

/** 全部障碍/墙体(世界坐标矩形) */
export const WALLS: GRect[] = [
  // 世界边界
  rect(-H, -H, H, -H + T),
  rect(-H, H - T, H, H),
  rect(-H, -H, -H + T, H),
  rect(H - T, -H, H, H),
];

// 中央环形湖城墙(东西南北各留缺口)
const CR = 620;
const CG = 110;
const CW = 80;
WALLS.push(
  rect(-CR, -CR, -CG, -CR + CW),
  rect(CG, -CR, CR, -CR + CW),
  rect(-CR, CR - CW, -CG, CR),
  rect(CG, CR - CW, CR, CR),
  rect(-CR, -CR, -CR + CW, -CG),
  rect(-CR, CG, -CR + CW, CR),
  rect(CR - CW, -CR, CR, -CG),
  rect(CR - CW, CG, CR, CR),
);

/**
 * 左上螺旋：用对数螺旋近似几段挡墙
 */
for (let i = 0; i < 5; i++) {
  const a0 = i * 1.15;
  const r0 = 240 + i * 210;
  const x = -2150 + Math.cos(a0) * r0 * 0.35;
  const y = 2050 + Math.sin(a0) * r0 * 0.35;
  WALLS.push(rect(x - 150, y - 45, x + 150, y + 45));
}

// 四角房间
WALLS.push(...frame(1750, -2450, 2450, -1750, 'left'));   // 右下：蜜蜂
WALLS.push(...frame(1750, 1750, 2450, 2450, 'bottom'));   // 右上：瓢虫
WALLS.push(...frame(-2450, -2450, -1750, -1750, 'right')); // 左下：蒲公英
WALLS.push(...frame(-2450, 1750, -1750, 2450, 'bottom')); // 左上：究极
// 左下到左上的长走廊(两列墙)
WALLS.push(rect(-2450, -700, -2370, 1500), rect(-1830, -700, -1750, 1500));

// 中圈散布的石墙
const SCATTER: [number, number, number, number][] = [
  [-1500, -400, -1150, -330],
  [-700, 900, -300, 970],
  [400, -1200, 850, -1130],
  [1100, 300, 1500, 370],
  [-1200, 1500, -900, 1700],
  [900, 1400, 1300, 1470],
  [200, 2200, 600, 2270],
  [-2000, 300, -1700, 420],
  [1600, 900, 2000, 970],
  [-300, -2300, 200, -2230],
];
for (const [x0, y0, x1, y1] of SCATTER) WALLS.push(rect(x0, y0, x1, y1));

export interface GardenZone {
  id: string;
  name: string;
  rect: GRect;
  species: string[];
  rarityW: number[];
  weight: number;
}

/** 分区刷怪表(特殊房间优先,其次内/中/外圈) */
export const ZONES: GardenZone[] = [
  {
    id: 'tr', name: '传说瓢虫房', rect: rect(1750, 1750, 2450, 2450),
    species: ['ladybug'], rarityW: [0, 0, 4, 16, 40, 30, 8, 1], weight: 4,
  },
  {
    id: 'br', name: '传说蜜蜂房', rect: rect(1750, -2450, 2450, -1750),
    species: ['bee'], rarityW: [0, 0, 4, 16, 40, 30, 8, 1], weight: 4,
  },
  {
    id: 'bl', name: '传奇黄蜂走廊', rect: rect(-2450, -900, -1830, 700),
    species: ['hornet'], rarityW: [0, 0, 8, 28, 40, 18, 5, 1], weight: 4,
  },
  {
    id: 'blroom', name: '史诗蒲公英房', rect: rect(-2450, -2450, -1750, -1700),
    species: ['dandelion', 'centipede'], rarityW: [0, 4, 26, 45, 20, 5], weight: 4,
  },
  {
    id: 'myth', name: '神话长廊', rect: rect(-2450, 700, -1750, 1750),
    species: ['spider', 'bumblebee', 'hornet', 'centipede'], rarityW: [0, 0, 0, 8, 24, 38, 22, 6, 2], weight: 3,
  },
  {
    id: 'spiral', name: '究极螺旋', rect: rect(-2450, 1750, -1750, 2450),
    species: ['bumblebee', 'spider', 'hornet', 'centipede'], rarityW: [0, 0, 0, 4, 14, 28, 30, 16, 6], weight: 3,
  },
  {
    id: 'inner', name: '花园内圈', rect: rect(-1600, -1600, 1600, 1600),
    species: ['baby_ant', 'worker_ant', 'rock', 'ladybug'], rarityW: [58, 28, 10, 3, 1], weight: 30,
  },
  {
    id: 'mid', name: '花园中圈', rect: rect(-2400, -2400, 2400, 2400),
    species: ['worker_ant', 'ladybug', 'bee', 'rock', 'soldier_ant', 'centipede'], rarityW: [34, 34, 15, 10, 5, 2], weight: 40,
  },
  {
    id: 'outer', name: '花园外圈', rect: rect(-H, -H, H, H),
    species: ['bee', 'hornet', 'spider', 'rock', 'bumblebee', 'soldier_ant', 'centipede'],
    rarityW: [10, 18, 22, 12, 20, 10, 8, 3], weight: 22,
  },
];

export const SAFE_RADIUS = 560;

function inRect(x: number, y: number, r: GRect): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function zoneAt(x: number, y: number): GardenZone | undefined {
  for (const z of ZONES) if (inRect(x, y, z.rect)) return z;
  return undefined;
}

/** 圆形与墙体的碰撞:返回是否重叠 */
export function blocked(x: number, y: number, r: number): boolean {
  if (x < -H + r || x > H - r || y < -H + r || y > H - r) return true;
  for (const w of WALLS) {
    const cx = Math.max(w.x0, Math.min(x, w.x1));
    const cy = Math.max(w.y0, Math.min(y, w.y1));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** 将圆形推出墙体(简易两轮迭代) */
export function pushOut(x: number, y: number, r: number): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    for (const w of WALLS) {
      const cx = Math.max(w.x0, Math.min(x, w.x1));
      const cy = Math.max(w.y0, Math.min(y, w.y1));
      let dx = x - cx;
      let dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < r) {
        if (d < 0.0001) {
          const left = x - w.x0;
          const right = w.x1 - x;
          const top = y - w.y0;
          const bottom = w.y1 - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = w.x0 - r;
          else if (m === right) x = w.x1 + r;
          else if (m === top) y = w.y0 - r;
          else y = w.y1 + r;
        } else {
          const push = (r - d) / d;
          x += dx * push;
          y += dy * push;
        }
      }
    }
    x = Math.max(-H + r, Math.min(H - r, x));
    y = Math.max(-H + r, Math.min(H - r, y));
  }
  return [x, y];
}

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

/** 随机取一个合法刷怪点(按分区权重) */
export function randomSpawnPoint(): { x: number; y: number; zone: GardenZone } | null {
  let total = 0;
  for (const z of ZONES) total += z.weight;
  for (let attempt = 0; attempt < 24; attempt++) {
    let r = Math.random() * total;
    let zone = ZONES[0];
    for (const z of ZONES) {
      r -= z.weight;
      if (r <= 0) {
        zone = z;
        break;
      }
    }
    const x = zone.rect.x0 + Math.random() * (zone.rect.x1 - zone.rect.x0);
    const y = zone.rect.y0 + Math.random() * (zone.rect.y1 - zone.rect.y0);
    if (Math.hypot(x, y) < SAFE_RADIUS + 80) continue;
    if (blocked(x, y, 26)) continue;
    return { x, y, zone };
  }
  return null;
}

/** 以世界坐标哈希生成装饰噪声(渲染用) */
export function wallShade(x: number, y: number): number {
  return hash2(x | 0, y | 0);
}
