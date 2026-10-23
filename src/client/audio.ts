// glorr 音效:WebAudio 合成,无外部资源

type SfxName = 'hit' | 'break' | 'levelup' | 'death' | 'pickup' | 'craft' | 'craftfail' | 'shoot';

export class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;
  private lastHit = 0;

  /** 必须在用户手势后调用 */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) this.ctx = new AC();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name: SfxName): void {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'hit': {
        // 节流,避免连击刺耳
        const now = performance.now();
        if (now - this.lastHit < 60) return;
        this.lastHit = now;
        this.tone(520 + Math.random() * 160, 0.05, 'square', 0.035, 240);
        break;
      }
      case 'shoot':
        this.tone(720, 0.07, 'sawtooth', 0.028, 380);
        break;
      case 'break':
        this.tone(300, 0.12, 'sawtooth', 0.05, 90);
        break;
      case 'levelup':
        this.tone(523, 0.1, 'sine', 0.08);
        window.setTimeout(() => this.tone(784, 0.16, 'sine', 0.08), 90);
        break;
      case 'death':
        this.tone(320, 0.5, 'sine', 0.09, 60);
        break;
      case 'pickup':
        this.tone(880, 0.06, 'sine', 0.045, 1180);
        break;
      case 'craft':
        this.tone(660, 0.09, 'triangle', 0.07);
        window.setTimeout(() => this.tone(990, 0.14, 'triangle', 0.07), 85);
        break;
      case 'craftfail':
        this.tone(220, 0.18, 'square', 0.05, 140);
        break;
    }
  }
}
