// glorr 世界渲染:背景 / 实体 / 粒子 / 浮动文字
import { DROP_DESPAWN, RARITY_COLORS, RINGS, WORLD } from '@shared/constants';
import { MOBS } from '@shared/data/mobs';
import { getPetal, rotationSpeed } from '@shared/data/petals';
import type { Camera } from '@client/camera';
import type { Net } from '@client/net';
import { drawBar, drawFlower, drawMob, drawPetal } from '@client/sprites';
import { clamp, hash2, lerp, smoothstep, TAU } from '@shared/math';

export interface SelfView {
  x: number;
  y: number;
  ang: number;
  hpPct: number;
  invuln: boolean;
  slotAngles: number[];
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

const RING_TINTS = ['#c9e3a3', '#b9db92', '#aad285', '#9cc978', '#8ec06c', '#82b762', '#76ad58', '#6ba34f', '#619945'];

export class Renderer {
  private mobAngles = new Map<number, number>();
  floats: FloatText[] = [];

  constructor(private canvas: HTMLCanvasElement) {}

  resize(dpr: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  addFloat(x: number, y: number, text: string, color = '#fff'): void {
    this.floats.push({ x, y, text, life: 1.2, color });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    camera: Camera,
    net: Net,
    self: SelfView,
    time: number,
    particles: { draw: (c: CanvasRenderingContext2D) => void },
  ): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const z = camera.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#4a6b3f';
    ctx.fillRect(0, 0, w, h);

    // 世界变换
    ctx.setTransform(
      dpr * z, 0, 0, dpr * z,
      dpr * (w / 2 - camera.x * z),
      dpr * (h / 2 - camera.y * z),
    );

    this.drawBackground(ctx, camera, w, h);
    this.drawEntities(ctx, camera, net, self, time);
    particles.draw(ctx);
    this.drawFloats(ctx);

    // 屏幕空间:暗角
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,20,8,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- 背景 ----------

  private drawBackground(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
    const z = cam.zoom;
    const halfW = w / 2 / z;
    const halfH = h / 2 / z;
    const x0 = cam.x - halfW;
    const x1 = cam.x + halfW;
    const y0 = cam.y - halfH;
    const y1 = cam.y + halfH;

    // 环形分区色带
    for (let i = 0; i < RINGS.length; i++) {
      const ring = RINGS[i];
      if (ring.r1 < 1) continue;
      ctx.fillStyle = i === 0 ? RING_TINTS[0] : RING_TINTS[Math.min(i, RING_TINTS.length - 1)];
      ctx.beginPath();
      ctx.arc(0, 0, ring.r1, 0, TAU);
      if (ring.r0 > 0) ctx.arc(0, 0, ring.r0, 0, TAU, true);
      ctx.fill();
    }

    // 世界外
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, WORLD.radius, 0, TAU);
    ctx.arc(0, 0, WORLD.radius + 4000, 0, TAU, true);
    ctx.fillStyle = '#22331c';
    ctx.fill();
    ctx.restore();

    // 安全区边界
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, WORLD.safeRadius, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1.5;
    const grid = 200;
    ctx.beginPath();
    for (let gx = Math.floor(x0 / grid) * grid; gx <= x1; gx += grid) {
      ctx.moveTo(gx, y0);
      ctx.lineTo(gx, y1);
    }
    for (let gy = Math.floor(y0 / grid) * grid; gy <= y1; gy += grid) {
      ctx.moveTo(x0, gy);
      ctx.lineTo(x1, gy);
    }
    ctx.stroke();

    // 装饰:草丛与野花(按格子确定性生成)
    const cell = 170;
    const cx0 = Math.floor(x0 / cell);
    const cx1 = Math.floor(x1 / cell);
    const cy0 = Math.floor(y0 / cell);
    const cy1 = Math.floor(y1 / cell);
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gy = cy0; gy <= cy1; gy++) {
        const n = 2 + Math.floor(hash2(gx, gy) * 3);
        for (let i = 0; i < n; i++) {
          const px = gx * cell + hash2(gx * 3 + i, gy) * cell;
          const py = gy * cell + hash2(gx, gy * 3 + i) * cell;
          if (Math.hypot(px, py) > WORLD.radius - 10) continue;
          const kind = hash2(px | 0, py | 0);
          ctx.strokeStyle = 'rgba(60,110,50,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (kind < 0.75) {
            // 草叶
            ctx.moveTo(px, py);
            ctx.quadraticCurveTo(px + 5, py - 9, px + 10, py - 13);
            ctx.moveTo(px, py);
            ctx.quadraticCurveTo(px - 5, py - 8, px - 9, py - 12);
          } else {
            // 野花
            ctx.moveTo(px, py);
            ctx.lineTo(px, py - 10);
            ctx.stroke();
            ctx.fillStyle = kind < 0.87 ? 'rgba(255,255,255,0.85)' : 'rgba(255,214,102,0.9)';
            ctx.beginPath();
            ctx.arc(px, py - 12, 3.2, 0, TAU);
            ctx.fill();
            continue;
          }
          ctx.stroke();
        }
      }
    }
  }

  // ---------- 实体 ----------

  private drawEntities(ctx: CanvasRenderingContext2D, cam: Camera, net: Net, self: SelfView, time: number): void {
    // 蛛网(最底层)
    for (const e of net.ents.values()) {
      if (e.kind !== 'w') continue;
      const [rx, ry] = net.renderPos(e);
      if (!this.inView(cam, rx, ry, e.r ?? 70)) continue;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      const r = e.r ?? 70;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, TAU);
      ctx.moveTo(rx - r, ry);
      ctx.lineTo(rx + r, ry);
      ctx.moveTo(rx, ry - r);
      ctx.lineTo(rx, ry + r);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(rx - Math.cos(a) * r, ry - Math.sin(a) * r);
        ctx.lineTo(rx + Math.cos(a) * r, ry + Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 掉落物
    for (const e of net.ents.values()) {
      if (e.kind !== 'd' || !e.petalId) continue;
      const [rx, ry] = net.renderPos(e);
      if (!this.inView(cam, rx, ry, 30)) continue;
      const rarity = e.rarity ?? 0;
      // 存续淡出
      const age = (performance.now() - e.bornAt) / 1000;
      const limit = DROP_DESPAWN[rarity];
      let alpha = 1;
      if (Number.isFinite(limit) && age > limit - 2) alpha = clamp((limit - age) / 2, 0, 1);
      if (alpha <= 0) continue;
      // 稀有度光晕
      if (rarity >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.25 * alpha;
        ctx.fillStyle = RARITY_COLORS[rarity];
        ctx.beginPath();
        ctx.arc(rx, ry, 13 + Math.sin(time * 4 + rx) * 2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      drawPetal(ctx, e.petalId, rx, ry, 11, -Math.PI / 2, rarity, alpha);
    }

    // 怪物
    for (const [id, e] of net.ents) {
      if (e.kind !== 'm' || e.species === undefined) continue;
      const [rx, ry] = net.renderPos(e);
      const def = MOBS[e.species];
      if (!def) continue;
      if (!this.inView(cam, rx, ry, def.radius + 60)) continue;
      // 朝向:由位移推导并平滑
      const mvx = e.x - e.px;
      const mvy = e.y - e.py;
      let ang = this.mobAngles.get(id) ?? 0;
      if (Math.hypot(mvx, mvy) > 0.4) {
        const target = Math.atan2(mvy, mvx);
        let d = (target - ang) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        ang += d * 0.35;
        this.mobAngles.set(id, ang);
      }
      drawMob(ctx, e.species, rx, ry, def.radius, ang, e.rarity ?? 0, time, e.hpPct ?? 1, 0);
    }

    // 其他玩家
    for (const [id, e] of net.ents) {
      if (e.kind !== 'p' || id === net.selfId || !e.name) continue;
      const [rx, ry] = net.renderPos(e);
      if (!this.inView(cam, rx, ry, 120)) continue;
      const loadout = (net.othersLoadout.get(id) ?? []).map(([pid, rarity]) => ({ id: pid, rarity }));
      this.drawPlayerWithPetals(ctx, rx, ry, e.ang ?? 0, e.name, e.hpPct ?? 1, loadout, time, false, 0);
    }

    // 弹丸
    for (const e of net.ents.values()) {
      if (e.kind !== 'b') continue;
      const [rx, ry] = net.renderPos(e);
      if (!this.inView(cam, rx, ry, 40)) continue;
      const ang = Math.atan2(e.vy ?? 0, e.vx ?? 0);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ang);
      if (e.projKind === 'web') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = '#cfd6e0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else if (e.projKind === 'sting') {
        ctx.fillStyle = '#ffd94d';
        ctx.strokeStyle = '#8a6d10';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, 3.4);
        ctx.lineTo(-5, -3.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // 导弹
        ctx.fillStyle = '#f0f0f0';
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 3.6, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e05252';
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(2.5, 2.6);
        ctx.lineTo(2.5, -2.6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 自己(最上层)
    this.drawPlayerWithPetals(ctx, self.x, self.y, self.ang, '', self.hpPct, net.self?.slotList ?? [], time, true, self.invuln ? 1 : 0, self.slotAngles);
  }

  /** 绘制花朵 + 轨道花瓣(自己也用同一套逻辑) */
  private drawPlayerWithPetals(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    ang: number,
    name: string,
    hpPct: number,
    slotList: ({ id: string; rarity: number; hpPct?: number; cdPct?: number } | null)[],
    time: number,
    isSelf: boolean,
    invulnFlag: number,
    selfAngles?: number[],
  ): void {
    const orbit = 46;
    const rot = rotationSpeed(slotList);
    for (let i = 0; i < slotList.length; i++) {
      const s = slotList[i];
      if (!s) continue;
      const def = getPetal(s.id);
      const angle = selfAngles ? selfAngles[i] : i * (TAU / Math.max(1, slotList.length)) + rot * time;
      // 远程花瓣装填动画:装填时缩回花心
      let radius = orbit;
      if (def.kind === 'ranged' && def.reload > 0) {
        const deployT = 1 - (s.cdPct ?? 0);
        const scale = smoothstep((deployT - 0.72) / 0.28);
        radius = orbit * (0.22 + 0.78 * scale);
      }
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      const alpha = (s.hpPct ?? 1) < 0.35 ? 0.55 + (s.hpPct ?? 1) : 1;
      drawPetal(ctx, s.id, px, py, 12, angle, s.rarity, alpha);
    }
    drawFlower(ctx, x, y, 22, ang, {
      invuln: invulnFlag > 0,
      name: name || undefined,
      hpPct: isSelf ? undefined : hpPct,
    });
    if (isSelf && hpPct < 0.999) {
      drawBar(ctx, x, y - 34, 52, hpPct);
    }
  }

  private inView(cam: Camera, x: number, y: number, pad: number): boolean {
    const z = cam.zoom;
    const halfW = window.innerWidth / 2 / z + pad;
    const halfH = window.innerHeight / 2 / z + pad;
    return Math.abs(x - cam.x) < halfW && Math.abs(y - cam.y) < halfH;
  }

  private drawFloats(ctx: CanvasRenderingContext2D): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= 1 / 60;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / 1.2;
      ctx.save();
      ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      const fy = f.y - 46 - t * 34;
      ctx.strokeText(f.text, f.x, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, fy);
      ctx.restore();
    }
  }
}

export { lerp };
