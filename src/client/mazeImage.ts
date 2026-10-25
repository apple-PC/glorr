// 把烘焙的迷宫网格绘制成一张离屏画布(渲染/小地图共用)
import { GRID_H, GRID_W, ROWS } from '@shared/gardenGrid';

let maze: HTMLCanvasElement | null = null;

export function getMazeCanvas(): HTMLCanvasElement {
  if (maze) return maze;
  const c = document.createElement('canvas');
  c.width = GRID_W;
  c.height = GRID_H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.fillStyle = '#1b2a20';
  ctx.fillRect(0, 0, GRID_W, GRID_H);

  for (let gy = 0; gy < GRID_H; gy++) {
    const row = ROWS[gy];
    for (let gx = 0; gx < GRID_W; gx++) {
      if (row.charCodeAt(gx) !== 49) continue;
      // 细微色差,避免死板
      const n = (gx * 73856093) ^ (gy * 19349663);
      ctx.fillStyle = n % 13 === 0 ? '#47a35f' : n % 7 === 0 ? '#3c9a54' : '#419f59';
      ctx.fillRect(gx, gy, 1, 1);
    }
  }
  maze = c;
  return c;
}

// 700x700 上色版地图(更顺滑的渲染底图)
let gardenImg: HTMLImageElement | null = null;
let started = false;

export function getGardenImage(): HTMLImageElement | null {
  if (!started) {
    started = true;
    gardenImg = new Image();
    gardenImg.src = './garden.png';
  }
  return gardenImg && gardenImg.complete && gardenImg.naturalWidth > 0 ? gardenImg : null;
}
