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
    case 'worker_ant': {
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

  if (hpPct < 0.999) drawBar(ctx, x, y - radius - 10, radius * 2.1, hpPct);
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

/** UI 用小图标(不旋转) */
export function drawPetalIcon(
  ctx: CanvasRenderingContext2D,
  petalId: string,
  cx: number,
  cy: number,
  size: number,
  rarity: number,
): void {
  drawPetal(ctx, petalId, cx, cy, size, -Math.PI / 2, rarity, 1);
}
