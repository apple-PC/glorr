// glorr 小地图
import { RINGS } from '@shared/constants';
import { TAU } from '@shared/math';
import type { Net } from '@client/net';

export function drawMinimap(canvas: HTMLCanvasElement, net: Net, mapRadius: number, safeRadius: number): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 8;
  const scale = R / mapRadius;

  c.clearRect(0, 0, size, size);

  // 底盘
  c.fillStyle = 'rgba(28,43,26,0.92)';
  c.beginPath();
  c.arc(cx, cy, R + 3, 0, TAU);
  c.fill();

  // 安全区
  c.fillStyle = 'rgba(200,230,160,0.22)';
  c.beginPath();
  c.arc(cx, cy, Math.max(2, safeRadius * scale), 0, TAU);
  c.fill();

  // 分区边界
  c.strokeStyle = 'rgba(255,255,255,0.16)';
  c.lineWidth = 1;
  for (const ring of RINGS) {
    if (ring.r1 <= 0) continue;
    c.beginPath();
    c.arc(cx, cy, ring.r1 * scale, 0, TAU);
    c.stroke();
  }

  // PvP 边界(第一个开启 PvP 的环内沿)
  const pvpRing = RINGS.find((r) => r.pvp);
  if (pvpRing) {
    c.save();
    c.strokeStyle = 'rgba(255,110,110,0.85)';
    c.setLineDash([4, 4]);
    c.beginPath();
    c.arc(cx, cy, pvpRing.r0 * scale, 0, TAU);
    c.stroke();
    c.restore();
  }

  // 玩家
  const selfEnt = net.selfEnt();
  for (const [id, e] of net.ents) {
    if (e.kind !== 'p') continue;
    const isSelf = id === net.selfId;
    const x = cx + e.x * scale;
    const y = cy + e.y * scale;
    c.fillStyle = isSelf ? '#ffffff' : 'rgba(255,235,160,0.9)';
    c.beginPath();
    c.arc(x, y, isSelf ? 3.4 : 2.4, 0, TAU);
    c.fill();
    if (isSelf) {
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 1;
      c.stroke();
    }
  }

  // 边框
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.stroke();
}
