// glorr 输入:鼠标(主)+ WASD(辅)

export class Input {
  mouseX = 0;
  mouseY = 0; // 屏幕坐标(CSS px)
  keys = new Set<string>();
  /** 本帧是否有过用户交互(用于音效解锁) */
  interacted = false;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.interacted = true;
    });
    window.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (t) {
        this.mouseX = t.clientX;
        this.mouseY = t.clientY;
        this.interacted = true;
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (t) {
        this.mouseX = t.clientX;
        this.mouseY = t.clientY;
        this.interacted = true;
      }
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.interacted = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** 综合输入向量(世界系,长度 ≤1);鼠标方向优先,WASD 叠加 */
  vector(selfX: number, selfY: number, cam: { screenToWorld: (x: number, y: number) => [number, number] }): [number, number] {
    let dx = 0;
    let dy = 0;
    const [mx, my] = cam.screenToWorld(this.mouseX, this.mouseY);
    const mdx = mx - selfX;
    const mdy = my - selfY;
    const md = Math.hypot(mdx, mdy);
    // 光标距花朵超过 14 屏幕像素才移动(死区)
    const deadPx = 14;
    if (md * 0.7 > deadPx) {
      dx = mdx / (md || 1);
      dy = mdy / (md || 1);
    }
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    return [dx, dy];
  }

  isDown(key: string): boolean {
    return this.keys.has(key);
  }
}
