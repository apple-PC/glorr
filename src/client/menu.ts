// glorr 主菜单背景:绿色底 + 深色三角 + 飘浮的已拥有花瓣
import { TAU, hash2 } from '@shared/math';
import { drawPetal } from '@client/sprites';

interface FloatPetal {
  id: string;
  rarity: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
}

const BASE = '#4fae63';
const TRI = 'rgba(20,80,35,0.10)';

export class MenuBg {
  private petals: FloatPetal[] = [];
  private raf = 0;
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {}

  /** 设置飘浮花瓣(已拥有收藏;调用后保留现有位置做连续性) */
  setPetals(list: { id: string; rarity: number }[]): void {
    const old = this.petals;
    this.petals = list.slice(0, 26).map((p, i) => {
      const prev = old[i];
      if (prev && prev.id === p.id) return prev;
      const a = Math.random() * TAU;
      const r = Math.random() * 0.45;
      return {
        id: p.id,
        rarity: p.rarity,
        x: this.canvas.width / 2 + Math.cos(a) * this.canvas.width * r,
        y: this.canvas.height / 2 + Math.sin(a) * this.canvas.height * r,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14 - 4,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 0.5,
        size: 14 + Math.random() * 9,
      };
    });
  }

  start(): void {
    this.resize();
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      if (!this.running) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);

    // 深色三角背景
    const cell = 150;
    ctx.fillStyle = TRI;
    for (let gx = 0; gx <= w / cell; gx++) {
      for (let gy = 0; gy <= h / cell; gy++) {
        const n = 2 + Math.floor(hash2(gx, gy) * 3);
        for (let i = 0; i < n; i++) {
          const px = gx * cell + hash2(gx * 3 + i, gy) * cell;
          const py = gy * cell + hash2(gx, gy * 3 + i) * cell;
          const s = 15 + hash2(px | 0, py | 0) * 20;
          const rot = hash2(gx + i, gy - i) * TAU;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.87, s * 0.5);
          ctx.lineTo(-s * 0.87, s * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // 飘浮花瓣
    for (const p of this.petals) {
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      p.rot += p.vr / 60;
      if (p.x < -60) p.x = w + 60;
      if (p.x > w + 60) p.x = -60;
      if (p.y < -60) p.y = h + 60;
      if (p.y > h + 60) p.y = -60;
      ctx.globalAlpha = 0.92;
      drawPetal(ctx, p.id, p.x, p.y, p.size, p.rot - Math.PI / 2, p.rarity);
      ctx.globalAlpha = 1;
    }

    // 暗角
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,24,12,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}
