// glorr 花园静态底图:一次性把草地/湖泊/圆石/装饰/传送门烘焙到离屏画布
// 运行时每帧只 blit 该画布(按可视区域自动裁剪) + 叠加水波动画
import { BOULDERS, GARDEN_HALF, LAKE, PORTALS } from '@shared/garden';
import { TAU } from '@shared/math';

const S = 0.6; // 世界->画布缩放(6400 世界单位 -> 3840 画布像素)

let gardenCanvas: HTMLCanvasElement | null = null;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGrassTile(): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const c = tile.getContext('2d')!;
  c.fillStyle = '#46a35c';
  c.fillRect(0, 0, 128, 128);
  const rng = mulberry32(1234);
  for (let i = 0; i < 1500; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const v = (rng() * 30) | 0;
    const light = rng() > 0.5;
    c.fillStyle = light ? `rgba(${70 + v},${170 + v},${96 + v},0.5)` : `rgba(${40 + (v >> 1)},${130 + (v >> 1)},${70 + (v >> 1)},0.45)`;
    c.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 130; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const h = 4 + rng() * 6;
    c.strokeStyle = `rgba(${30 + (rng() * 20) | 0},${120 + (rng() * 30) | 0},${60 + (rng() * 20) | 0},0.5)`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 1.5, y - h);
    c.moveTo(x, y);
    c.lineTo(x + 1.5, y - h * 0.8);
    c.stroke();
  }
  return tile;
}

function drawLumpyRock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tint: number): void {
  const rng = mulberry32(((x * 73856093) ^ (y * 19349663)) >>> 0);
  // 落地阴影
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.14, y + r * 0.26, r * 1.12, r * 0.92, 0, 0, TAU);
  ctx.fill();
  // 不规则石体(更多、偏移更大的瓣,形成棱角)
  const base = 152 - tint;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.12, x, y, r * 1.15);
  g.addColorStop(0, `rgb(${base + 54},${base + 52},${base + 48})`);
  g.addColorStop(0.55, `rgb(${base + 2},${base},${base - 4})`);
  g.addColorStop(1, `rgb(${base - 56},${base - 58},${base - 62})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  const lobes = 6 + ((rng() * 4) | 0);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + rng() * 0.6;
    const d = r * (0.18 + rng() * 0.36);
    ctx.moveTo(x + Math.cos(a) * (d + r * 0.6) + 1, y + Math.sin(a) * (d + r * 0.6));
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.5 + rng() * 0.42), r * (0.46 + rng() * 0.42), a, 0, TAU);
  }
  ctx.fill();
  // 深色描边(定义石体边缘,避免发糊)
  ctx.strokeStyle = 'rgba(20,20,22,0.5)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // 多条裂纹(加深对比)
  ctx.strokeStyle = 'rgba(22,22,24,0.55)';
  ctx.lineWidth = 1.8;
  const cracks = 2 + ((rng() * 3) | 0);
  for (let c = 0; c < cracks; c++) {
    const ca = rng() * TAU;
    let px = x - Math.cos(ca) * r * 0.5;
    let py = y - Math.sin(ca) * r * 0.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const segs = 3 + ((rng() * 3) | 0);
    for (let s = 0; s < segs; s++) {
      const na = ca + (rng() - 0.5) * 1.4;
      const len = r * (0.18 + rng() * 0.22);
      px += Math.cos(na) * len;
      py += Math.sin(na) * len;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // 顶部高光
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.34, r * 0.42, r * 0.24, 0, 0, TAU);
  ctx.fill();
}

function build(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(GARDEN_HALF * 2 * S);
  canvas.height = Math.round(GARDEN_HALF * 2 * S);
  const ctx = canvas.getContext('2d')!;
  const H = GARDEN_HALF;
  const toX = (wx: number) => (wx + H) * S;
  const toY = (wy: number) => (wy + H) * S;
  const toR = (w: number) => w * S;

  // 草地底色
  ctx.fillStyle = '#46a35c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 大块明暗草斑(不规则斑块,打破均匀感)
  const prng = mulberry32(2025);
  for (let i = 0; i < 60; i++) {
    const wx = (prng() * 2 - 1) * (H - 200);
    const wy = (prng() * 2 - 1) * (H - 200);
    const rr = (240 + prng() * 340) * S;
    const light = prng() > 0.5;
    const g = ctx.createRadialGradient(toX(wx), toY(wy), 0, toX(wx), toY(wy), rr);
    if (light) {
      g.addColorStop(0, 'rgba(120,200,120,0.16)');
    } else {
      g.addColorStop(0, 'rgba(28,105,52,0.18)');
    }
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // 用多个重叠圆拼出不规则斑形
    const blobN = 5 + ((prng() * 4) | 0);
    ctx.beginPath();
    for (let b = 0; b < blobN; b++) {
      const a = prng() * TAU;
      const d = prng() * rr * 0.55;
      const br = rr * (0.4 + prng() * 0.5);
      ctx.moveTo(toX(wx) + Math.cos(a) * d + br, toY(wy) + Math.sin(a) * d);
      ctx.arc(toX(wx) + Math.cos(a) * d, toY(wy) + Math.sin(a) * d, br, 0, TAU);
    }
    ctx.fill();
  }

  // 细草纹理
  const pattern = ctx.createPattern(buildGrassTile(), 'repeat')!;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 分层刷怪区色带 + 边界环
  const zones = [
    { r: 1750, col: 'rgba(150,230,150,0.12)' }, // 中心安全
    { r: 2450, col: 'rgba(210,225,120,0.10)' }, // 中圈
    { r: 3120, col: 'rgba(120,150,205,0.12)' }, // 外圈
  ];
  for (const z of zones) {
    const g = ctx.createRadialGradient(toX(0), toY(0), 0, toX(0), toY(0), toR(z.r));
    g.addColorStop(0, z.col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const z of zones) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(toX(0), toY(0), toR(z.r), toR(z.r), 0, 0, TAU);
    ctx.stroke();
  }

  // 世界边缘暗角
  const edge = ctx.createRadialGradient(toX(0), toY(0), toR(2600), toX(0), toY(0), toR(3300));
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(10,25,8,0.38)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ---------- 湖泊 ----------
  const lx = toX(LAKE.x);
  const ly = toY(LAKE.y);
  const lrx = toR(LAKE.rx);
  const lry = toR(LAKE.ry);
  // 沙滩
  ctx.fillStyle = '#d8c690';
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx + toR(34), lry + toR(34), 0, 0, TAU);
  ctx.fill();
  // 浅水过渡(两道,做出色阶)
  ctx.fillStyle = '#7cc0e2';
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx + toR(18), lry + toR(18), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#6cb6dc';
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx + toR(8), lry + toR(8), 0, 0, TAU);
  ctx.fill();
  // 深水渐变(更明显的深浅)
  const water = ctx.createRadialGradient(lx - lrx * 0.22, ly - lry * 0.22, lrx * 0.05, lx, ly, lrx * 1.05);
  water.addColorStop(0, '#5fb0e0');
  water.addColorStop(0.4, '#3f8cc4');
  water.addColorStop(0.75, '#2f6fa6');
  water.addColorStop(1, '#1f4f7d');
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx, lry, 0, 0, TAU);
  ctx.fill();
  // 浪花圈(水线明亮泡沫 + 内圈淡波纹)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx - 1, lry - 1, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(lx, ly, lrx - toR(14), lry - toR(14), 0, 0, TAU);
  ctx.stroke();
  // 水线泡沫点
  const frng = mulberry32(55);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 70; i++) {
    const a = frng() * TAU;
    const er = 1 - (frng() - 0.5) * 0.02;
    const fx = lx + Math.cos(a) * lrx * er;
    const fy = ly + Math.sin(a) * lry * er;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.6 + frng() * 1.8, 0, TAU);
    ctx.fill();
  }
  // 水面高光
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.ellipse(lx - lrx * 0.25, ly - lry * 0.3, lrx * 0.4, lry * 0.28, 0, 0, TAU);
  ctx.fill();
  // 静态波纹
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse(lx, ly, lrx * (0.2 + i * 0.075), lry * (0.2 + i * 0.075), 0, 0, TAU);
    ctx.stroke();
  }

  // 睡莲
  const lrng = mulberry32(7);
  let pads = 0;
  let lg = 0;
  while (pads < 52 && lg++ < 900) {
    const a = lrng() * TAU;
    const rr = Math.sqrt(lrng()) * 0.8;
    const px = LAKE.x + Math.cos(a) * LAKE.rx * rr;
    const py = LAKE.y + Math.sin(a) * LAKE.ry * rr;
    if ((px / LAKE.rx) ** 2 + (py / LAKE.ry) ** 2 > 0.92) continue;
    const pr = 14 + lrng() * 16;
    ctx.save();
    ctx.translate(toX(px), toY(py));
    ctx.rotate(lrng() * TAU);
    ctx.fillStyle = '#2f8f4f';
    ctx.beginPath();
    ctx.ellipse(0, 0, toR(pr), toR(pr) * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, toR(pr), -0.5, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    pads++;
  }

  // ---------- 陆地装饰 ----------
  const drng = mulberry32(99);
  // 草簇
  for (let i = 0; i < 1200; i++) {
    const wx = (drng() * 2 - 1) * (H - 60);
    const wy = (drng() * 2 - 1) * (H - 60);
    if ((wx / LAKE.rx) ** 2 + (wy / LAKE.ry) ** 2 < 1.06) continue;
    const x = toX(wx);
    const y = toY(wy);
    const h = 5 + drng() * 8;
    ctx.strokeStyle = `rgba(${30 + (drng() * 20) | 0},${120 + (drng() * 30) | 0},${60 + (drng() * 20) | 0},0.5)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - h);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2, y - h * 0.8);
    ctx.stroke();
  }
  // 花丛(按花田聚簇,更自然)
  const flowerCols = ['#ff7b9c', '#ffd94d', '#ffffff', '#c98bff', '#ff9e57'];
  const patches = 18;
  for (let p = 0; p < patches; p++) {
    const pcx = (drng() * 2 - 1) * (H - 400);
    const pcy = (drng() * 2 - 1) * (H - 400);
    if ((pcx / LAKE.rx) ** 2 + (pcy / LAKE.ry) ** 2 < 1.1) continue;
    const col = flowerCols[(drng() * flowerCols.length) | 0];
    const count = 14 + ((drng() * 16) | 0);
    for (let i = 0; i < count; i++) {
      const a = drng() * TAU;
      const d = drng() * 140;
      const fx = pcx + Math.cos(a) * d;
      const fy = pcy + Math.sin(a) * d;
      if ((fx / LAKE.rx) ** 2 + (fy / LAKE.ry) ** 2 < 1.05) continue;
      const x = toX(fx);
      const y = toY(fy);
      // 叶子
      ctx.fillStyle = '#2f8f3f';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 4, 2.4, a, 0, TAU);
      ctx.fill();
      // 花瓣(5 瓣)
      ctx.fillStyle = col;
      for (let k = 0; k < 5; k++) {
        const pa = a + (k / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(pa) * 3, y + Math.sin(pa) * 3, 2.4, 0, TAU);
        ctx.fill();
      }
      // 花心
      ctx.fillStyle = 'rgba(255,225,90,0.95)';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, TAU);
      ctx.fill();
    }
  }
  // 小灌木(深绿丛,点缀)
  for (let i = 0; i < 40; i++) {
    const wx = (drng() * 2 - 1) * (H - 120);
    const wy = (drng() * 2 - 1) * (H - 120);
    if ((wx / LAKE.rx) ** 2 + (wy / LAKE.ry) ** 2 < 1.08) continue;
    const x = toX(wx);
    const y = toY(wy);
    const br = 18 + drng() * 22;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, br, br * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f7d3f';
    ctx.beginPath();
    ctx.ellipse(x, y, br, br * 0.85, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3c964d';
    ctx.beginPath();
    ctx.ellipse(x - br * 0.25, y - br * 0.25, br * 0.5, br * 0.45, 0, 0, TAU);
    ctx.fill();
  }

  // ---------- 圆石 ----------
  for (const b of BOULDERS) {
    drawLumpyRock(ctx, toX(b.x), toY(b.y), toR(b.r), b.tint);
  }

  // ---------- 传送门 ----------
  for (const p of PORTALS) {
    const x = toX(p.x);
    const y = toY(p.y);
    const r = toR(20);
    const pg = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    pg.addColorStop(0, 'rgba(150,255,150,0.9)');
    pg.addColorStop(0.6, 'rgba(70,210,90,0.7)');
    pg.addColorStop(1, 'rgba(40,150,60,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,90,40,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }

  return canvas;
}

export function getGardenCanvas(): HTMLCanvasElement | null {
  if (gardenCanvas) return gardenCanvas;
  try {
    gardenCanvas = build();
  } catch {
    gardenCanvas = null;
  }
  return gardenCanvas;
}
