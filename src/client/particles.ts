// glorr 粒子系统(纯表现层)

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'dot' | 'spark' | 'ring';
  drag: number;
}

export class Particles {
  private list: Particle[] = [];
  private max = 600;

  burst(x: number, y: number, color: string, n = 10, speed = 160, size = 4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.list.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.4 + Math.random() * 0.35,
        maxLife: 0.75,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        kind: 'dot',
        drag: 4,
      });
    }
    this.trim();
  }

  spark(x: number, y: number, color: string, angle: number, n = 4): void {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 1.4;
      const v = 200 + Math.random() * 160;
      this.list.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.18 + Math.random() * 0.12,
        maxLife: 0.3,
        size: 2.5,
        color,
        kind: 'spark',
        drag: 2,
      });
    }
    this.trim();
  }

  ring(x: number, y: number, color: string, size = 60): void {
    this.list.push({
      x, y, vx: 0, vy: 0,
      life: 0.55, maxLife: 0.55,
      size, color, kind: 'ring', drag: 0,
    });
    this.trim();
  }

  private trim(): void {
    if (this.list.length > this.max) this.list.splice(0, this.list.length - this.max);
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      if (p.drag > 0) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t) + 8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * t;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.list.length = 0;
  }
}
