// glorr 矢量美术:花瓣 / 生物 / 花朵,全部代码绘制,无外部图片资源
import { RARITY_COLORS } from '@shared/constants';
import { MOBS } from '@shared/data/mobs';
import { hash2, TAU } from '@shared/math';

const INK = '#2b2f33';

/** 花瓣本体固定色(稀有度用作槽位底色/描边,而非花瓣颜色) */
const PETAL_FILL: Record<string, string> = {
  basic: '#ffffff',
  fast: '#f2f2f2',
  heavy: '#b8b8b8',
  leaf: '#5cb85c',
  rose: '#e35d7a',
  stinger: '#f2d34a',
  rock: '#9aa0a6',
  missile: '#e6e6e6',
  web: '#e8eef6',
  faster: '#7fd8ff',
  honey: '#ffcb45',
  peas: '#7ed957',
  magnet: '#d9534f',
  wing: '#cfe8ff',
  glass: '#e9f4ff',
  clover: '#4fbf5f',
};

const MOB_EN: Record<string, string> = {
  baby_ant: 'Baby Ant',
  worker_ant: 'Worker Ant',
  ladybug: 'Ladybug',
  rock: 'Rock',
  bee: 'Bee',
  soldier_ant: 'Soldier Ant',
  hornet: 'Hornet',
  spider: 'Spider',
  bumblebee: 'Bumblebee',
  centipede: 'Centipede',
  dandelion: 'Dandelion',
};
const RARITY_EN = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra', 'Super', 'Eternal', 'Unique'];

/** 花瓣英文名(槽位标签用,与 florr 一致) */
export const PETAL_EN: Record<string, string> = {
  basic: 'Basic',
  fast: 'Light',
  heavy: 'Heavy',
  leaf: 'Leaf',
  rose: 'Rose',
  stinger: 'Stinger',
  rock: 'Rock',
  missile: 'Missile',
  web: 'Web',
  faster: 'Faster',
  honey: 'Honey',
  peas: 'Peas',
  magnet: 'Magnet',
  wing: 'Wing',
  glass: 'Glass',
  clover: 'Clover',
};

/** 花瓣形状路径(以原点为中心,朝上,-y 为尖) */
function petalPath(ctx: CanvasRenderingContext2D, id: string, s: number): void {
  ctx.beginPath();
  switch (id) {
    case 'fast':
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.62, s * 0.52);
      ctx.lineTo(-s * 0.62, s * 0.52);
      ctx.closePath();
      break;
    case 'heavy':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const x = Math.cos(a) * s;
        const y = Math.sin(a) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'leaf':
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.98, -s * 0.1, 0, s);
      ctx.quadraticCurveTo(-s * 0.98, -s * 0.1, 0, -s);
      break;
    case 'rose':
      ctx.arc(0, 0, s * 0.7, 0, TAU);
      break;
    case 'stinger':
      ctx.moveTo(0, -s * 1.2);
      ctx.lineTo(s * 0.4, s * 0.72);
      ctx.lineTo(-s * 0.4, s * 0.72);
      ctx.closePath();
      break;
    case 'rock': {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = s * (0.82 + hash2(i, 7) * 0.28);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'missile':
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.42, -s * 0.15);
      ctx.lineTo(s * 0.42, s * 0.62);
      ctx.lineTo(-s * 0.42, s * 0.62);
      ctx.lineTo(-s * 0.42, -s * 0.15);
      ctx.closePath();
      break;
    case 'web':
      ctx.arc(0, 0, s * 0.78, 0, TAU);
      break;
    case 'faster': {
      const pts = [
        [0.15, -s], [0.62, -s * 0.2], [0.28, -s * 0.18],
        [0.55, s], [-0.35, -s * 0.12], [-0.05, -s * 0.14],
      ];
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      break;
    }
    case 'honey':
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.82, -s * 0.05, 0, s * 0.88);
      ctx.quadraticCurveTo(-s * 0.82, -s * 0.05, 0, -s);
      break;
    case 'peas': {
      // 豌豆荚:三颗豌豆
      ctx.arc(0, -s * 0.35, s * 0.42, 0, TAU);
      break;
    }
    case 'magnet': {
      // U 形磁铁
      const leg = s * 0.3;
      const rad = s * 0.62;
      ctx.moveTo(-rad, -s * 0.05);
      ctx.lineTo(-rad, s * 0.55);
      ctx.lineTo(-rad + leg, s * 0.55);
      ctx.lineTo(-rad + leg, -s * 0.05 + leg * 0.6);
      ctx.arc(0, -s * 0.05 + leg * 0.6, rad - leg, Math.PI, 0, true);
      ctx.lineTo(rad, s * 0.55);
      ctx.lineTo(rad - leg, s * 0.55);
      ctx.lineTo(rad - leg, -s * 0.05);
      ctx.arc(0, -s * 0.05, rad, 0, Math.PI, true);
      ctx.closePath();
      break;
    }
    case 'wing': {
      // 翅膀:弧形羽叶
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.95, -s * 0.3, s * 0.55, s * 0.55);
      ctx.quadraticCurveTo(s * 0.1, s * 0.1, 0, s * 0.05);
      ctx.quadraticCurveTo(-s * 0.1, s * 0.1, -s * 0.55, s * 0.55);
      ctx.quadraticCurveTo(-s * 0.95, -s * 0.3, 0, -s);
      break;
    }
    case 'glass':
      // 玻璃:菱形碎片
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.55, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.55, 0);
      ctx.closePath();
      break;
    case 'clover':
      // 三叶草:三个圆叶
      ctx.arc(-s * 0.3, -s * 0.2, s * 0.42, 0, TAU);
      ctx.arc(s * 0.3, -s * 0.2, s * 0.42, 0, TAU);
      ctx.arc(0, s * 0.3, s * 0.42, 0, TAU);
      break;
    case 'basic':
      // 旧版 florr 的 Basic 是白色圆形花瓣
      ctx.arc(0, 0, s * 0.62, 0, TAU);
      break;
    default: {
      ctx.ellipse(0, -s * 0.12, s * 0.55, s * 0.88, 0, 0, TAU);
    }
  }
}

/** 绘制单个花瓣(世界坐标) */
export function drawPetal(
  ctx: CanvasRenderingContext2D,
  petalId: string,
  x: number,
  y: number,
  size: number,
  angle: number,
  rarity: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.globalAlpha = alpha;

  if (rarity >= 6) {
    ctx.shadowColor = RARITY_COLORS[rarity];
    ctx.shadowBlur = 10;
  }
  petalPath(ctx, petalId, size);
  const fill = PETAL_FILL[petalId] ?? RARITY_COLORS[rarity];
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.2, size * 0.1);
  ctx.strokeStyle = shade(fill, -60);
  ctx.stroke();

  // 细节装饰
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  if (petalId === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.8);
    ctx.lineTo(0, size * 0.8);
    ctx.stroke();
  } else if (petalId === 'rose') {
    ctx.fillStyle = 'rgba(120,10,30,0.55)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * size * 0.36, Math.sin(a) * size * 0.36 - size * 0.12, size * 0.16, 0, TAU);
      ctx.fill();
    }
  } else if (petalId === 'web') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.moveTo(-Math.cos(a) * size * 0.7, -Math.sin(a) * size * 0.7);
      ctx.lineTo(Math.cos(a) * size * 0.7, Math.sin(a) * size * 0.7);
    }
    ctx.stroke();
  } else if (petalId === 'rock') {
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.45);
    ctx.lineTo(size * 0.25, -size * 0.2);
    ctx.stroke();
  } else if (petalId === 'missile') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(0, -size * 0.42, size * 0.14, 0, TAU);
    ctx.fill();
  } else if (petalId === 'basic') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(0, size * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

/** 玩家花朵 */
export function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ang: number,
  opts: { invuln?: boolean; color?: string; name?: string; hpPct?: number } = {},
): void {
  ctx.save();
  ctx.translate(x, y);

  // 无敌闪烁
  if (opts.invuln) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8 + pulse * 3, 0, TAU);
    ctx.stroke();
  }

  // 花心
  ctx.fillStyle = opts.color ?? '#ffd94d';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // 表情:始终正立(不随移动旋转),瞳孔略偏向朝向
  const lookX = Math.cos(ang) * r * 0.06;
  const lookY = Math.sin(ang) * r * 0.06;
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.ellipse(-r * 0.22, -r * 0.04, r * 0.1, r * 0.15, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.22, -r * 0.04, r * 0.1, r * 0.15, 0, 0, TAU);
  ctx.fill();
  // 眼睛高光
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-r * 0.22 + lookX, -r * 0.1 + lookY, r * 0.035, 0, TAU);
  ctx.arc(r * 0.22 + lookX, -r * 0.1 + lookY, r * 0.035, 0, TAU);
  ctx.fill();
  // 嘴(小小的皱眉)
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = Math.max(1.6, r * 0.08);
  ctx.beginPath();
  ctx.moveTo(-r * 0.18, r * 0.3);
  ctx.quadraticCurveTo(0, r * 0.16, r * 0.18, r * 0.3);
  ctx.stroke();
  ctx.restore();

  // 名字
  if (opts.name) {
    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(opts.name, x, y - r - 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(opts.name, x, y - r - 16);
    ctx.restore();
  }
  // 血条:始终在花朵正下方(与 florr 一致)
  if (opts.hpPct !== undefined) {
    drawBar(ctx, x, y + r + 7, r * 2.6, opts.hpPct);
  }
}

/** 血条(黑底 + 圆角 + 描边,与 florr 一致) */
export function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number): void {
  const h = 6;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, h + 2, 4);
  ctx.fillStyle = 'rgba(18,18,18,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const p = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = p > 0.5 ? '#5fd36e' : p > 0.25 ? '#e8c33a' : '#e05252';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w * p, h, 3);
  ctx.fill();
  ctx.restore();
}

/** 行进方向箭头(从花朵指向移动方向,半透明绿) */
export function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  alpha = 0.9,
): void {
  const len = 220;
  const shaft = 9;
  const headLen = 54;
  const headW = 42;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -shaft);
  ctx.lineTo(len - headLen, -shaft);
  ctx.lineTo(len - headLen, -headW / 2);
  ctx.lineTo(len, 0);
  ctx.lineTo(len - headLen, headW / 2);
  ctx.lineTo(len - headLen, shaft);
  ctx.lineTo(0, shaft);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74,140,74,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,80,30,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/** 生物绘制(朝上为基础朝向,ang 为朝向角) */
export function drawMob(
  ctx: CanvasRenderingContext2D,
  speciesIdx: number,
  x: number,
  y: number,
  radius: number,
  ang: number,
  rarity: number,
  t: number,
  hpPct: number,
  hitFlash: number,
): void {
  const def = MOBS[speciesIdx];
  if (!def) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + Math.PI / 2);

  const r = radius;
  const body = def.color;

  // 稀有度光环(究极以上)
  if (rarity >= 5) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = RARITY_COLORS[rarity];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  switch (def.id) {
    case 'baby_ant':
    case 'worker_ant':
    case 'soldier_ant': {
      const segs = 3;
      for (let i = 0; i < segs; i++) {
        const sr = r * (i === segs - 1 ? 0.42 : 0.55 - i * 0.05);
        const sy = r * 0.55 - i * r * 0.62;
        ctx.fillStyle = i === segs - 1 ? body : shade(body, -12);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, sy, sr, sr * 0.86, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      // 腿
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        for (const side of [-1, 1]) {
          const wig = Math.sin(t * 12 + i * 1.7 + (side > 0 ? Math.PI : 0)) * r * 0.18;
          const ly = -r * 0.3 + i * r * 0.5;
          ctx.beginPath();
          ctx.moveTo(side * r * 0.4, ly);
          ctx.lineTo(side * (r * 0.95), ly + wig);
          ctx.stroke();
        }
      }
      // 触角
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, -r * 0.95);
      ctx.lineTo(-r * 0.5, -r * 1.35);
      ctx.moveTo(r * 0.16, -r * 0.95);
      ctx.lineTo(r * 0.5, -r * 1.35);
      ctx.stroke();
      break;
    }
    case 'ladybug': {
      ctx.fillStyle = body;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 头
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, -r * 0.82, r * 0.4, 0, TAU);
      ctx.fill();
      //  spots
      ctx.fillStyle = INK;
      const spots: [number, number][] = [
        [-r * 0.42, -r * 0.28], [r * 0.42, -r * 0.28],
        [-r * 0.3, r * 0.38], [r * 0.3, r * 0.38], [0, -r * 0.05],
      ];
      for (const [sx, sy] of spots) {
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.15, 0, TAU);
        ctx.fill();
      }
      // 中线
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.75);
      ctx.lineTo(0, r * 0.9);
      ctx.stroke();
      break;
    }
    case 'rock': {
      ctx.fillStyle = body;
      ctx.strokeStyle = '#5c636b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = r * (0.85 + hash2(i, 21) * 0.25);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-r * 0.15, -r * 0.2, r * 0.5, Math.PI * 0.9, Math.PI * 1.5);
      ctx.stroke();
      break;
    }
    case 'bee':
    case 'hornet':
    case 'bumblebee': {
      const fuzzy = def.id === 'bumblebee';
      // 翅膀(在身后)
      const flap = Math.sin(t * (fuzzy ? 26 : 34)) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(220,235,255,0.55)';
      ctx.strokeStyle = 'rgba(120,140,160,0.5)';
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * r * 0.35, -r * 0.15);
        ctx.rotate(side * (0.5 + flap * 0.5));
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.55, r * 0.42, r * 0.24 * (0.5 + flap * 0.5), 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // 身体
      ctx.fillStyle = body;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.12, r * 0.62, r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 条纹
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, r * 0.12, r * 0.62, r * 0.85, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = INK;
      for (let i = 0; i < 3; i++) {
        const sy = -r * 0.45 + i * r * 0.55;
        ctx.fillRect(-r, sy, r * 2, r * 0.22);
      }
      ctx.restore();
      // 头
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, -r * 0.78, r * 0.34, 0, TAU);
      ctx.fill();
      // 刺
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.95);
      ctx.lineTo(r * 0.14, r * 1.35);
      ctx.lineTo(-r * 0.14, r * 1.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'spider': {
      // 腿
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          const wig = Math.sin(t * 9 + i * 1.3 + (side > 0 ? Math.PI : 0)) * r * 0.22;
          const ly = -r * 0.45 + i * r * 0.42;
          ctx.beginPath();
          ctx.moveTo(side * r * 0.3, ly);
          ctx.quadraticCurveTo(side * r * 1.0, ly - r * 0.2 + wig, side * r * 1.25, ly + r * 0.35 + wig);
          ctx.stroke();
        }
      }
      // 腹部
      ctx.fillStyle = body;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.62, r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 头
      ctx.beginPath();
      ctx.arc(0, -r * 0.42, r * 0.36, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // 眼
      ctx.fillStyle = '#ff5b5b';
      ctx.beginPath();
      ctx.arc(-r * 0.14, -r * 0.52, r * 0.08, 0, TAU);
      ctx.arc(r * 0.14, -r * 0.52, r * 0.08, 0, TAU);
      ctx.fill();
      break;
    }
    case 'centipede': {
      // 蜈蚣:一串绿色圆节
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t2 = i / (n - 1);
        const cx = Math.sin(t2 * Math.PI * 1.2 + t * 3 + i) * r * 0.45;
        const cy = -r * 0.8 + i * (r * 0.42);
        ctx.fillStyle = i % 2 === 0 ? body : shade(body, -14);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.44, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'dandelion': {
      // 蒲公英:白色绒球
      ctx.strokeStyle = '#9aa07a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(0, r * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#f4f2e2';
      ctx.strokeStyle = '#b9b48f';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const cx = Math.cos(a) * r * 0.62;
        const cy = Math.sin(a) * r * 0.62 - r * 0.1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.22, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#e8e08a';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = body;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 受击闪白
  if (hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.75, hitFlash * 6);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 名字 + 稀有度 + 血条(florr 风格,常显)
  const nm = MOB_EN[def.id] ?? def.name;
  const rc = rarity === 0 ? '#e8e8e8' : RARITY_COLORS[rarity] ?? '#e8e8e8';
  ctx.save();
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(nm, x, y - radius - 26);
  ctx.fillStyle = '#fff';
  ctx.fillText(nm, x, y - radius - 26);
  ctx.font = '700 9.5px system-ui, sans-serif';
  ctx.strokeText(RARITY_EN[rarity] ?? '', x, y - radius - 14);
  ctx.fillStyle = rc;
  ctx.fillText(RARITY_EN[rarity] ?? '', x, y - radius - 14);
  ctx.restore();
  drawBar(ctx, x, y - radius - 4, radius * 2.2, hpPct);
}

/** 颜色明暗调整 */
function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (num & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/** 统一深色描边,做出 florr 的贴纸感 */
function iconStroke(ctx: CanvasRenderingContext2D, s: number, alpha = 0.8): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.1, s * 0.14);
  ctx.strokeStyle = `rgba(38, 42, 46, ${alpha})`;
  ctx.stroke();
}

/**
 * UI 花瓣图标:居中、不旋转、按花瓣本体上色(槽位底色由 CSS 负责稀有度)
 * 造型对齐现代 florr:大色块 + 粗描边 + 极简高光
 */
export function drawPetalIcon(
  ctx: CanvasRenderingContext2D,
  petalId: string,
  cx: number,
  cy: number,
  size: number,
  rarity = 0,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size;
  void rarity;
  switch (petalId) {
    case 'basic': {
      // 单纯的白色圆瓣
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.52, 0, TAU);
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.strokeStyle = 'rgba(206, 212, 218, 0.95)';
      ctx.stroke();
      break;
    }
    case 'fast': {
      // Light:四个小白球菱形排布
      const rr = s * 0.4;
      const off = s * 0.5;
      const pts: [number, number][] = [[0, -off], [off, 0], [0, off], [-off, 0]];
      for (const [dx, dy] of pts) {
        ctx.beginPath();
        ctx.arc(dx, dy, rr, 0, TAU);
        ctx.fillStyle = '#fdfcf6';
        ctx.fill();
        iconStroke(ctx, s, 0.55);
      }
      break;
    }
    case 'heavy': {
      // 六边形砝码
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const x = Math.cos(a) * s * 0.92;
        const y = Math.sin(a) * s * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#b7bcc2';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const x = Math.cos(a) * s * 0.45;
        const y = Math.sin(a) * s * 0.45;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      break;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 1.02, -s * 0.15, 0, s);
      ctx.quadraticCurveTo(-s * 1.02, -s * 0.15, 0, -s);
      ctx.fillStyle = '#5fbe5d';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.72);
      ctx.lineTo(0, s * 0.8);
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.strokeStyle = 'rgba(30, 90, 42, 0.55)';
      ctx.stroke();
      break;
    }
    case 'rose': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.95, 0, TAU);
      ctx.fillStyle = '#e8607f';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
      // 螺旋花瓣
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        const a = t * TAU * 1.6;
        const r = s * 0.1 + t * s * 0.72;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = Math.max(1, s * 0.11);
      ctx.strokeStyle = 'rgba(150, 26, 60, 0.7)';
      ctx.stroke();
      break;
    }
    case 'stinger': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.08);
      ctx.lineTo(s * 0.52, s * 0.72);
      ctx.quadraticCurveTo(0, s * 1.02, -s * 0.52, s * 0.72);
      ctx.closePath();
      ctx.fillStyle = '#f7e07d';
      ctx.fill();
      iconStroke(ctx, s, 0.75);
      // 深色尖端
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.08);
      ctx.lineTo(s * 0.24, -s * 0.2);
      ctx.lineTo(-s * 0.24, -s * 0.2);
      ctx.closePath();
      ctx.fillStyle = '#8c6a12';
      ctx.fill();
      break;
    }
    case 'rock': {
      ctx.beginPath();
      const pts: [number, number][] = [
        [-0.86, -0.2], [-0.4, -0.86], [0.34, -0.9], [0.9, -0.28],
        [0.72, 0.56], [0.12, 0.94], [-0.62, 0.72],
      ];
      pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px * s, py * s) : ctx.lineTo(px * s, py * s)));
      ctx.closePath();
      ctx.fillStyle = '#9aa0a6';
      ctx.fill();
      iconStroke(ctx, s, 0.75);
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, -s * 0.2);
      ctx.lineTo(s * 0.16, s * 0.12);
      ctx.lineTo(-s * 0.06, s * 0.62);
      ctx.lineWidth = Math.max(1, s * 0.09);
      ctx.strokeStyle = 'rgba(50, 56, 62, 0.55)';
      ctx.stroke();
      break;
    }
    case 'missile': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.02);
      ctx.quadraticCurveTo(s * 0.42, -s * 0.5, s * 0.42, s * 0.4);
      ctx.lineTo(s * 0.42, s * 0.66);
      ctx.lineTo(-s * 0.42, s * 0.66);
      ctx.lineTo(-s * 0.42, s * 0.4);
      ctx.quadraticCurveTo(-s * 0.42, -s * 0.5, 0, -s * 1.02);
      ctx.closePath();
      ctx.fillStyle = '#f3f4f6';
      ctx.fill();
      iconStroke(ctx, s, 0.75);
      // 红色弹头
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.02);
      ctx.quadraticCurveTo(s * 0.32, -s * 0.62, s * 0.24, -s * 0.34);
      ctx.lineTo(-s * 0.24, -s * 0.34);
      ctx.quadraticCurveTo(-s * 0.32, -s * 0.62, 0, -s * 1.02);
      ctx.closePath();
      ctx.fillStyle = '#e05252';
      ctx.fill();
      break;
    }
    case 'web': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.92, 0, TAU);
      ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
      ctx.fill();
      iconStroke(ctx, s, 0.5);
      ctx.strokeStyle = 'rgba(120, 130, 142, 0.65)';
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        ctx.moveTo(-Math.cos(a) * s * 0.8, -Math.sin(a) * s * 0.8);
        ctx.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8);
      }
      for (const rr of [0.35, 0.62]) {
        ctx.moveTo(Math.cos(0) * s * rr, Math.sin(0) * s * rr);
        ctx.arc(0, 0, s * rr, 0, TAU);
      }
      ctx.stroke();
      break;
    }
    case 'faster': {
      // 单个淡色小泡泡
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 0, TAU);
      ctx.fillStyle = '#f2efc2';
      ctx.fill();
      iconStroke(ctx, s, 0.5);
      ctx.beginPath();
      ctx.arc(-s * 0.24, -s * 0.26, s * 0.26, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      break;
    }
    case 'honey': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.98);
      ctx.bezierCurveTo(s * 0.86, -s * 0.1, s * 0.66, s * 0.9, 0, s * 0.9);
      ctx.bezierCurveTo(-s * 0.66, s * 0.9, -s * 0.86, -s * 0.1, 0, -s * 0.98);
      ctx.fillStyle = '#f3b23a';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
      ctx.beginPath();
      ctx.ellipse(-s * 0.24, s * 0.16, s * 0.17, s * 0.26, -0.4, 0, TAU);
      ctx.fillStyle = 'rgba(255, 244, 200, 0.8)';
      ctx.fill();
      break;
    }
    case 'peas': {
      ctx.save();
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.42, s * 1.0, 0, 0, TAU);
      ctx.fillStyle = '#57b95a';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
      ctx.fillStyle = '#9ee27f';
      for (const dy of [-0.42, 0, 0.42]) {
        ctx.beginPath();
        ctx.arc(0, dy * s, s * 0.32, 0, TAU);
        ctx.fill();
        iconStroke(ctx, s * 0.72, 0.5);
      }
      ctx.restore();
      break;
    }
    case 'magnet': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, Math.PI, TAU);
      const lw = Math.max(2, s * 0.42);
      ctx.lineWidth = lw;
      ctx.strokeStyle = '#d9494f';
      ctx.lineCap = 'butt';
      ctx.stroke();
      ctx.fillStyle = '#dfe3e8';
      ctx.fillRect(-s * 0.62 - lw / 2, -s * 0.02, lw, s * 0.4);
      ctx.fillRect(s * 0.62 - lw / 2, -s * 0.02, lw, s * 0.4);
      break;
    }
    case 'wing': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.9);
      ctx.quadraticCurveTo(s * 0.95, -s * 0.45, s * 0.5, s * 0.5);
      ctx.quadraticCurveTo(s * 0.1, s * 0.2, 0, s * 0.62);
      ctx.quadraticCurveTo(-s * 0.1, s * 0.2, -s * 0.5, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.95, -s * 0.45, 0, -s * 0.9);
      ctx.fillStyle = '#eef6ff';
      ctx.fill();
      iconStroke(ctx, s, 0.5);
      break;
    }
    case 'glass': {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.62, -s * 0.05);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.62, -s * 0.05);
      ctx.closePath();
      ctx.fillStyle = '#d8ecff';
      ctx.fill();
      iconStroke(ctx, s, 0.6);
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -s * 0.5);
      ctx.lineTo(s * 0.2, s * 0.05);
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      break;
    }
    case 'clover': {
      ctx.strokeStyle = '#2f7a3a';
      ctx.lineWidth = Math.max(1.5, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.2);
      ctx.lineTo(s * 0.1, s * 0.95);
      ctx.stroke();
      for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
        ctx.beginPath();
        ctx.arc(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36, s * 0.4, 0, TAU);
        ctx.fillStyle = '#5ac263';
        ctx.fill();
        iconStroke(ctx, s * 0.8, 0.6);
      }
      break;
    }
    default: {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.62, s * 0.92, 0, 0, TAU);
      ctx.fillStyle = PETAL_FILL[petalId] ?? '#ffffff';
      ctx.fill();
      iconStroke(ctx, s, 0.7);
    }
  }
  ctx.restore();
}

/** 天赋/技能圆形徽章(双层圆环 + 白色符号,对齐 florr 天赋图标) */
export function drawTalentBadge(
  ctx: CanvasRenderingContext2D,
  kind: 'speed' | 'magnet' | 'heal' | 'hp' | 'dmg',
  cx: number,
  cy: number,
  r: number,
): void {
  const palette: Record<string, [string, string]> = {
    speed: ['#4b8ee0', '#2f66ad'],
    magnet: ['#e0574f', '#ad3a33'],
    heal: ['#5cc45f', '#3a8f3d'],
    hp: ['#e0568a', '#ab3462'],
    dmg: ['#e0903c', '#ad6a24'],
  };
  const [inner, outer] = palette[kind] ?? ['#9aa0a6', '#6d7379'];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = outer;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, TAU);
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.6, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'speed': {
      ctx.beginPath();
      ctx.moveTo(r * 0.16, -r * 0.6);
      ctx.lineTo(-r * 0.3, r * 0.06);
      ctx.lineTo(r * 0.02, r * 0.06);
      ctx.lineTo(-r * 0.16, r * 0.62);
      ctx.lineTo(r * 0.34, -r * 0.06);
      ctx.lineTo(r * 0.02, -r * 0.06);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'magnet': {
      ctx.beginPath();
      ctx.arc(0, r * 0.06, r * 0.42, Math.PI, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, r * 0.06);
      ctx.lineTo(-r * 0.42, r * 0.5);
      ctx.moveTo(r * 0.42, r * 0.06);
      ctx.lineTo(r * 0.42, r * 0.5);
      ctx.stroke();
      break;
    }
    case 'heal': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.5);
      ctx.lineTo(0, r * 0.5);
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(r * 0.5, 0);
      ctx.stroke();
      break;
    }
    case 'hp': {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.55);
      ctx.bezierCurveTo(-r * 0.75, r * 0.02, -r * 0.42, -r * 0.62, 0, -r * 0.2);
      ctx.bezierCurveTo(r * 0.42, -r * 0.62, r * 0.75, r * 0.02, 0, r * 0.55);
      ctx.fill();
      break;
    }
    case 'dmg': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, r * 0.45);
      ctx.lineTo(r * 0.45, -r * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.5);
      ctx.lineTo(r * 0.5, -r * 0.5);
      ctx.lineTo(r * 0.5, -r * 0.1);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
