// glorr 小地图(新版花园迷宫)
import { GARDEN_HALF, PORTALS } from '@shared/garden';
import { getGardenImage, getMazeCanvas } from '@client/mazeImage';
import { TAU } from '@shared/math';
import type { GameConn } from '@client/net';

export function drawMinimap(canvas: HTMLCanvasElement, net: GameConn, _mapRadius: number, _safeRadius: number): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const size = canvas.width;
  const inset = 4;

  c.clearRect(0, 0, size, size);

  // 迷宫底图
  const garden = getGardenImage();
  if (garden) {
    c.imageSmoothingEnabled = true;
    c.drawImage(garden, inset, inset, size - inset * 2, size - inset * 2);
  } else {
    c.imageSmoothingEnabled = false;
    c.drawImage(getMazeCanvas(), inset, inset, size - inset * 2, size - inset * 2);
    c.imageSmoothingEnabled = true;
  }

  const scale = (size - inset * 2) / (GARDEN_HALF * 2);
  const cx = size / 2;
  const cy = size / 2;

  // 传送门
  c.fillStyle = '#7ee07e';
  for (const p of PORTALS) {
    c.beginPath();
    c.arc(cx + p.x * scale, cy + p.y * scale, 2, 0, TAU);
    c.fill();
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
  c.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
}
