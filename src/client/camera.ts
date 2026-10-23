// glorr 摄像机:跟随玩家,世界 ↔ 屏幕坐标转换
import { VIEW_HEIGHT } from '@shared/constants';
import { clamp, lerp } from '@shared/math';

export class Camera {
  x = 0;
  y = 0;
  zoom = 0.7;
  private targetZoom = 0.7;

  constructor(private viewW: number, private viewH: number) {}

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.targetZoom = clamp(h / VIEW_HEIGHT, 0.45, 1.15);
  }

  follow(tx: number, ty: number, dt: number): void {
    const k = Math.min(1, 9 * dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this.zoom = lerp(this.zoom, this.targetZoom, Math.min(1, 5 * dt));
  }

  snapTo(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
    this.zoom = this.targetZoom;
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.x) * this.zoom + this.viewW / 2,
      (wy - this.y) * this.zoom + this.viewH / 2,
    ];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.viewW / 2) / this.zoom + this.x,
      (sy - this.viewH / 2) / this.zoom + this.y,
    ];
  }
}
