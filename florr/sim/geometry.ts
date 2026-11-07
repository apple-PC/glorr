// glorr 新版花园:程序化生成的 florr 风格花园
// 碰撞用解析几何(椭圆湖泊 + 圆石 + 世界边界),不再使用粗网格
// 视觉:中央平滑湖泊 + 圆石障碍簇 + 同心分层刷怪区 + 草地纹理(见 gardenRender.ts)

export const GARDEN_HALF = 3200;

// ---------- 确定性随机(布置障碍/装饰) ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 中央湖泊(椭圆,不可行走) ----------
export interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
}
export const LAKE: Ellipse = { x: 0, y: 0, rx: 1000, ry: 760 };

// ---------- 圆石障碍(不可行走) ----------
export interface Boulder {
  x: number;
  y: number;
  r: number;
  /** 主色调微调,让石头不呆板 */
  tint: number;
}
export const BOULDERS: Boulder[] = (() => {
  const rng = mulberry32(0x9e3779b9);
  const list: Boulder[] = [];
  const margin = 240; // 离世界边界的距离
  let guard = 0;
  while (list.length < 30 && guard++ < 4000) {
    // 在除湖泊外的区域随机放一个簇中心
    const ang = rng() * Math.PI * 2;
    const dist = 700 + rng() * (GARDEN_HALF - margin - 900);
    const cx = Math.cos(ang) * dist;
    const cy = Math.sin(ang) * dist;
    // 避开湖泊
    const ln = (cx / LAKE.rx) ** 2 + (cy / LAKE.ry) ** 2;
    if (ln < 1.18) continue;
    // 避开出生点附近
    if (Math.hypot(cx - 0, cy - 1500) < 760) continue;
    const clusterN = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < clusterN; i++) {
      const oa = rng() * Math.PI * 2;
      const od = rng() * 95;
      const bx = cx + Math.cos(oa) * od;
      const by = cy + Math.sin(oa) * od;
      const br = 34 + rng() * 52;
      if (bx < -GARDEN_HALF + margin || bx > GARDEN_HALF - margin) continue;
      if (by < -GARDEN_HALF + margin || by > GARDEN_HALF - margin) continue;
      list.push({ x: bx, y: by, r: br, tint: (rng() * 24) | 0 });
    }
  }
  return list;
})();

// ---------- 碰撞 ----------
export function blocked(x: number, y: number, r: number): boolean {
  // 世界边界(隐形墙)
  if (x - r < -GARDEN_HALF || x + r > GARDEN_HALF || y - r < -GARDEN_HALF || y + r > GARDEN_HALF) return true;
  // 湖泊(椭圆,按半径外扩做近似碰撞)
  const nx = (x - LAKE.x) / (LAKE.rx + r);
  const ny = (y - LAKE.y) / (LAKE.ry + r);
  if (nx * nx + ny * ny < 1) return true;
  // 圆石
  for (const b of BOULDERS) {
    const dx = x - b.x;
    const dy = y - b.y;
    const rr = b.r + r;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

export function walkable(x: number, y: number): boolean {
  return !blocked(x, y, 0);
}

/** 把圆形推出墙体/湖泊/圆石 */
export function pushOut(x: number, y: number, r: number): [number, number] {
  if (!blocked(x, y, r)) return [x, y];
  for (let ring = 1; ring <= 40; ring++) {
    const step = 28 * ring;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      if (!blocked(nx, ny, r)) return [nx, ny];
    }
  }
  return [x, y];
}

// ---------- 出生点 / 传送门 ----------
export const PLAYER_SPAWN: [number, number] = (() => {
  const p = pushOut(0, 1500, 26);
  return p;
})();

export interface Portal {
  x: number;
  y: number;
}
export const PORTALS: Portal[] = (() => {
  const cand: [number, number][] = [
    [0, 1500],
    [-1900, -1900],
    [1900, -1900],
    [-1900, 1900],
    [1900, 1900],
    [0, -2200],
  ];
  return cand
    .map(([x, y]) => pushOut(x, y, 22))
    .filter(([x, y]) => walkable(x, y))
    .map(([x, y]) => ({ x, y }));
})();

// ---------- 分区刷怪(同心环:中心安全 → 外圈高危) ----------
export interface GardenZone {
  id: string;
  name: string;
  cx: number;
  cy: number;
  r0: number;
  r1: number;
  species: string[];
  rarityW: number[];
  weight: number;
}

function zone(
  id: string,
  name: string,
  r0: number,
  r1: number,
  species: string[],
  rarityW: number[],
  weight: number,
): GardenZone {
  return { id, name, cx: 0, cy: 0, r0, r1, species, rarityW, weight };
}

export const ZONES: GardenZone[] = [
  // 中心安全区:常见/不寻常的小怪
  zone('inner', '花园中心', 1150, 1750, ['baby_ant', 'worker_ant', 'rock', 'ladybug'], [60, 30, 8, 2], 28),
  // 中圈:稀有小怪为主
  zone('mid', '花园中圈', 1750, 2450, ['worker_ant', 'ladybug', 'bee', 'rock', 'soldier_ant', 'centipede'], [34, 34, 15, 10, 5, 2], 40),
  // 外圈:史诗/传说/神话
  zone('outer', '花园外圈', 2450, 3120, ['bee', 'hornet', 'spider', 'rock', 'bumblebee', 'soldier_ant', 'centipede', 'dandelion'], [8, 16, 22, 12, 18, 8, 10, 6], 22),
  // 四角特殊房(高稀有度)
  zone('myth', '神话长廊', 0, 0, ['spider', 'bumblebee', 'hornet', 'centipede'], [0, 0, 0, 8, 24, 38, 22, 6, 2], 10),
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

/** 随机合法刷怪点(按分区权重,落在可行走处) */
export function randomSpawnPoint(): { x: number; y: number; zone: GardenZone } | null {
  let total = 0;
  for (const z of ZONES) total += z.weight;
  for (let attempt = 0; attempt < 60; attempt++) {
    let r = Math.random() * total;
    let zoneSel: GardenZone = ZONES[0];
    for (const z of ZONES) {
      r -= z.weight;
      if (r <= 0) {
        zoneSel = z;
        break;
      }
    }
    let x: number;
    let y: number;
    if (zoneSel.id === 'myth') {
      // 四角区域:选一个角 + 随机偏移
      const corner = Math.floor(Math.random() * 4);
      const sx = corner % 2 === 0 ? -1 : 1;
      const sy = corner < 2 ? -1 : 1;
      x = sx * (1500 + Math.random() * 1300);
      y = sy * (1500 + Math.random() * 1300);
    } else {
      const ang = Math.random() * Math.PI * 2;
      const rad = zoneSel.r0 + Math.random() * (zoneSel.r1 - zoneSel.r0);
      x = zoneSel.cx + Math.cos(ang) * rad;
      y = zoneSel.cy + Math.sin(ang) * rad;
    }
    if (!walkable(x, y)) continue;
    if (blocked(x, y, 26)) continue;
    if (Math.hypot(x - PLAYER_SPAWN[0], y - PLAYER_SPAWN[1]) < 420) continue;
    return { x, y, zone: zoneSel };
  }
  return null;
}
