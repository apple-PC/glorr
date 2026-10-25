// glorr 小地图(方形花园)
import { GARDEN_HALF, WALLS, ZONES } from '@shared/garden';
import { TAU } from '@shared/math';
import type { GameConn } from '@client/net';

const TINT: Record<string, string> = {
  tr: 'rgba(255,220,120,0.20)',
  br: 'rgba(120,180,255,0.20)',
  bl: 'rgba(255,140,80,0.20)',
  blroom: 'rgba(255,200,80,0.16)',
  myth: 'rgba(160,120,255,0.22)',
  spiral: 'rgba(220,120,255,0.26)',
};

export function drawMinimap(canvas: HTMLCanvasElement, net: GameConn, _mapRadius: number, _safeRadius: number): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const scale = (size / 2 - 8) / GARDEN_HALF;

  c.clearRect(0, 0, size, size);

  // 底盘
  c.fillStyle = 'rgba(40,90,45,0.95)';
  c.fillRect(4, 4, size - 8, size - 8);

  // 区域淡色
  for (const z of ZONES) {
    const t = TINT[z.id];
    if (!t) continue;
    c.fillStyle = t;
    c.fillRect(cx + z.rect.x0 * scale, cy + z.rect.y0 * scale, (z.rect.x1 - z.rect.x0) * scale, (z.rect.y1 - z.rect.y0) * scale);
  }

  // 中央湖
  c.fillStyle = '#3f7fd0';
  c.beginPath();
  c.arc(cx, cy, 300 * scale, 0, TAU);
  c.fill();

  // 墙体
  c.fillStyle = '#6b4a2f';
  for (const w of WALLS) {
    c.fillRect(cx + w.x0 * scale, cy + w.y0 * scale, Math.max(1, (w.x1 - w.x0) * scale), Math.max(1, (w.y1 - w.y0) * scale));
  }

  // 玩家
  for (const [id, e] of net.ents) {
    if (e.kind !== 'p') continue;
    const isSelf = id === net.selfId;
    c.fillStyle = isSelf ? '#ffffff' : 'rgba(255,235,160,0.95)';
    c.beginPath();
    c.arc(cx + e.x * scale, cy + e.y * scale, isSelf ? 3.2 : 2.2, 0, TAU);
    c.fill();
    if (isSelf) {
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 1;
      c.stroke();
    }
  }

  // 边框
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = 2;
  c.strokeRect(4, 4, size - 8, size - 8);
}
