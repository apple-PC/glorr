// glorr UI 层:HUD / 花瓣槽 / 背包 / 合成 / 拖拽 / 小地图 / Toast
import { MAX_SLOTS, RARITY_COLORS, RARITY_NAMES, WORLD, CRAFT_SUCCESS, ETERNAL, CRAFT_INPUT } from '@shared/constants';
import { getPetal } from '@shared/data/petals';
import { rarityName } from '@shared/constants';
import type { Net, SelfState } from '@client/net';
import { drawPetalIcon } from '@client/sprites';
import { drawMinimap } from '@client/minimap';

export interface UiCallbacks {
  onEquip(uid: number, slot: number): void;
  onUnequip(slot: number): void;
  onMoveInv(from: number, to: number): void;
  onDrop(uid: number): void;
  onCraft(id: string, rarity: number): void;
  onRespawn(): void;
  onToggleSound(): void;
}

const INV_CELL = 46;
const INV_COLS = 6;

export class Ui {
  private self: SelfState | null = null;
  private invSig = '';
  private slotSig = '';
  private invScroll = 0;
  private slotEls: HTMLDivElement[] = [];
  private slotCanvases: HTMLCanvasElement[] = [];
  private drag: { uid: number; from: number; moved: boolean } | null = null;

  // DOM
  private hud = document.getElementById('hud')!;
  private levelEl = document.getElementById('level')!;
  private xpFill = document.getElementById('xpfill')!;
  private killsEl = document.getElementById('kills')!;
  private latencyEl = document.getElementById('latency')!;
  private slotsEl = document.getElementById('slots')!;
  private invPanel = document.getElementById('invpanel')!;
  private invCanvas = document.getElementById('invcanvas') as HTMLCanvasElement;
  private invCount = document.getElementById('invcount')!;
  private craftPanel = document.getElementById('craftpanel')!;
  private craftSelect = document.getElementById('craftselect') as HTMLSelectElement;
  private craftInfo = document.getElementById('craftinfo')!;
  private craftPreview = document.getElementById('craftpreview') as HTMLCanvasElement;
  private craftGo = document.getElementById('craftgo') as HTMLButtonElement;
  private toastsEl = document.getElementById('toasts')!;
  private deathScreen = document.getElementById('deathscreen')!;
  private deathLevel = document.getElementById('deathlevel')!;
  private deathKills = document.getElementById('deathkills')!;
  private ghost = document.getElementById('dragghost')!;
  private soundBtn = document.getElementById('soundbtn')!;

  constructor(
    private net: Net,
    private cb: UiCallbacks,
  ) {
    this.buildSlots();
    this.bindButtons();
    this.bindInventory();
    this.bindCraft();
  }

  // ---------- 构建 ----------

  private buildSlots(): void {
    this.slotsEl.innerHTML = '';
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot locked';
      const cv = document.createElement('canvas');
      cv.width = 44;
      cv.height = 44;
      cv.style.width = '44px';
      cv.style.height = '44px';
      cv.style.borderRadius = '10px';
      const overlay = document.createElement('div');
      overlay.className = 'cdoverlay';
      const dur = document.createElement('div');
      dur.className = 'durability';
      const durFill = document.createElement('div');
      dur.appendChild(durFill);
      slot.append(cv, overlay, dur);
      this.slotsEl.appendChild(slot);
      this.slotEls.push(slot);
      this.slotCanvases.push(cv);

      // 点击槽位 = 卸下
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.self || i >= this.self.slots) return;
        if (this.drag && this.drag.moved) return;
        this.cb.onUnequip(i);
      });
      slot.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.drag) return;
        if (i < (this.self?.slots ?? 0)) this.cb.onEquip(this.drag.uid, i);
        this.endDrag();
      });
    }
  }

  private bindButtons(): void {
    document.getElementById('invbtn')!.addEventListener('click', () => this.toggleInv());
    document.getElementById('craftbtn')!.addEventListener('click', () => {
      this.craftPanel.classList.toggle('hidden');
      this.refreshCraftOptions();
    });
    this.soundBtn.addEventListener('click', () => {
      this.cb.onToggleSound();
    });
    document.getElementById('respawnbtn')!.addEventListener('click', () => {
      this.deathScreen.classList.add('hidden');
      this.cb.onRespawn();
    });
  }

  setSoundLabel(on: boolean): void {
    this.soundBtn.textContent = `音效:${on ? '开' : '关'}`;
  }

  private bindInventory(): void {
    this.invCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.invScroll = Math.max(0, this.invScroll + Math.sign(e.deltaY) * INV_CELL);
      this.drawInventory();
    }, { passive: false });

    this.invCanvas.addEventListener('pointerdown', (e) => {
      if (!this.self) return;
      const idx = this.cellAt(e);
      if (idx < 0 || idx >= this.self.inv.length) return;
      e.preventDefault();
      this.drag = { uid: this.self.inv[idx].uid, from: idx, moved: false };
      this.ghost.classList.remove('hidden');
      this.moveGhost(e.clientX, e.clientY);
    });

    this.invCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.self) return;
      const idx = this.cellAt(e);
      if (idx >= 0 && idx < this.self.inv.length) {
        this.cb.onDrop(this.self.inv[idx].uid);
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.drag.moved = true;
      this.moveGhost(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.drag) return;
      // 落在背包格子里 = 移动
      const rect = this.invCanvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        const idx = this.cellAt(e);
        if (idx >= 0 && idx !== this.drag.from) {
          this.cb.onMoveInv(this.drag.from, idx);
        }
      } else if (!this.isOverSlot(e.clientX, e.clientY) && this.drag.moved) {
        // 拖出面板 = 丢弃
        this.cb.onDrop(this.drag.uid);
      }
      this.endDrag();
    });
  }

  private isOverSlot(x: number, y: number): boolean {
    return this.slotEls.some((el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  private cellAt(e: { clientX: number; clientY: number }): number {
    const rect = this.invCanvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - 6) / (INV_CELL + 3));
    const row = Math.floor((e.clientY - rect.top - 6) / (INV_CELL + 3));
    if (col < 0 || col >= INV_COLS || row < 0) return -1;
    return row * INV_COLS + col + this.invScroll;
  }

  private moveGhost(x: number, y: number): void {
    if (!this.drag || !this.self) return;
    const inst = this.self.inv.find((it) => it.uid === this.drag!.uid);
    if (!inst) return;
    this.ghost.innerHTML = '';
    const cv = document.createElement('canvas');
    cv.width = 44;
    cv.height = 44;
    const c = cv.getContext('2d')!;
    drawPetalIcon(c, inst.id, 22, 22, 17, inst.rarity);
    this.ghost.appendChild(cv);
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }

  private endDrag(): void {
    this.drag = null;
    this.ghost.classList.add('hidden');
  }

  // ---------- 合成 ----------

  private bindCraft(): void {
    this.craftSelect.addEventListener('change', () => this.refreshCraftInfo());
    this.craftGo.addEventListener('click', () => {
      const val = this.craftSelect.value;
      if (!val) return;
      const [id, rarity] = val.split(':');
      this.cb.onCraft(id, Number(rarity));
    });
  }

  private refreshCraftOptions(): void {
    if (!this.self) return;
    const counts = new Map<string, number>();
    for (const it of this.self.inv) {
      const key = `${it.id}:${it.rarity}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const prev = this.craftSelect.value;
    this.craftSelect.innerHTML = '';
    const keys = [...counts.keys()].sort();
    for (const key of keys) {
      const [id, rarity] = key.split(':');
      const def = getPetal(id);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${def.name}·${rarityName(Number(rarity))} ×${counts.get(key)}`;
      this.craftSelect.appendChild(opt);
    }
    if (keys.includes(prev)) this.craftSelect.value = prev;
    else if (!keys.length) {
      const opt = document.createElement('option');
      opt.textContent = '背包空空如也';
      this.craftSelect.appendChild(opt);
    }
    this.refreshCraftInfo();
  }

  private refreshCraftInfo(): void {
    if (!this.self) return;
    const val = this.craftSelect.value;
    const c = this.craftPreview.getContext('2d')!;
    c.clearRect(0, 0, this.craftPreview.width, this.craftPreview.height);
    if (!val || !val.includes(':')) {
      this.craftInfo.textContent = '选择要合成的花瓣';
      this.craftGo.disabled = true;
      return;
    }
    const [id, rarityS] = val.split(':');
    const rarity = Number(rarityS);
    const def = getPetal(id);
    const count = this.self.inv.filter((it) => it.id === id && it.rarity === rarity).length;
    const chance = rarity >= ETERNAL ? 0 : (CRAFT_SUCCESS[rarity] ?? 0);
    const target = rarity + 1 <= ETERNAL ? `${rarityName(rarity + 1)}` : '不可合成';
    this.craftInfo.innerHTML =
      `${def.name}·${rarityName(rarity)}:拥有 <b>${count}</b>/${CRAFT_INPUT}<br />` +
      `成功率 <b>${(chance * 100).toFixed(chance < 0.01 ? 2 : 0)}%</b> → ${target}<br />` +
      `<span style="color:#8a938f">${def.desc}</span>`;
    // 预览:5 格,已有填色
    for (let i = 0; i < CRAFT_INPUT; i++) {
      drawPetalIcon(c, id, 26 + i * 47, 28, 16, i < count ? rarity : 0);
      if (i >= count) {
        c.globalAlpha = 0.25;
        drawPetalIcon(c, id, 26 + i * 47, 28, 16, rarity);
        c.globalAlpha = 1;
      }
    }
    this.craftGo.disabled = count < CRAFT_INPUT || rarity >= ETERNAL;
  }

  // ---------- 状态刷新 ----------

  setSelf(self: SelfState): void {
    const first = !this.self;
    this.self = self;
    this.levelEl.textContent = String(self.level);
    const xpPct = self.xpNeed > 0 ? (self.xp / self.xpNeed) * 100 : 0;
    this.xpFill.style.width = `${Math.min(100, xpPct)}%`;
    this.killsEl.textContent = String(self.kills);
    this.invCount.textContent = `${self.inv.length}/${200}`;

    // 槽位
    const sig = self.slotList.map((s) => (s ? `${s.id}:${s.rarity}` : '-')).join(',');
    if (sig !== this.slotSig || first) {
      this.slotSig = sig;
      this.drawSlotIcons();
    }
    for (let i = 0; i < MAX_SLOTS; i++) {
      const el = this.slotEls[i];
      const locked = i >= self.slots;
      el.classList.toggle('locked', locked);
      const s = self.slotList[i];
      const durFill = el.querySelector('.durability > div') as HTMLDivElement;
      durFill.style.width = s ? `${Math.max(0, s.hpPct) * 100}%` : '0%';
      durFill.style.background = s && s.hpPct < 0.4 ? '#e05252' : '#58cc70';
    }

    // 背包
    const invSig = self.inv.map((it) => `${it.uid}`).join(',');
    if (invSig !== this.invSig || first) {
      this.invSig = invSig;
      this.drawInventory();
      if (!this.craftPanel.classList.contains('hidden')) this.refreshCraftOptions();
    }

    if (first) this.hud.classList.remove('hidden');
  }

  /** 每帧更新装填扫层 */
  tickSlots(): void {
    if (!this.self) return;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = this.self.slotList[i];
      const overlay = this.slotEls[i].querySelector('.cdoverlay') as HTMLDivElement;
      if (s && s.cdPct > 0) {
        overlay.style.background = `conic-gradient(rgba(0,0,0,0.42) ${s.cdPct * 360}deg, transparent 0deg)`;
      } else if (overlay.style.background) {
        overlay.style.background = '';
      }
    }
  }

  private drawSlotIcons(): void {
    if (!this.self) return;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const cv = this.slotCanvases[i];
      const c = cv.getContext('2d')!;
      c.clearRect(0, 0, cv.width, cv.height);
      const s = this.self.slotList[i];
      if (!s) continue;
      drawPetalIcon(c, s.id, 22, 22, 16, s.rarity);
    }
  }

  private drawInventory(): void {
    if (!this.self) return;
    const c = this.invCanvas.getContext('2d')!;
    c.clearRect(0, 0, this.invCanvas.width, this.invCanvas.height);
    const rows = Math.ceil(this.self.inv.length / INV_COLS);
    const maxScroll = Math.max(0, (rows - Math.floor(this.invCanvas.height / (INV_CELL + 3))) * INV_CELL);
    this.invScroll = Math.min(this.invScroll, maxScroll);
    for (let i = 0; i < this.self.inv.length; i++) {
      const row = Math.floor(i / INV_COLS) - this.invScroll / INV_CELL;
      if (row < 0) continue;
      const col = i % INV_COLS;
      const x = 6 + col * (INV_CELL + 3);
      const y = 6 + (row * (INV_CELL + 3));
      if (y > this.invCanvas.height) break;
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.strokeStyle = RARITY_COLORS[this.self.inv[i].rarity];
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(x, y, INV_CELL, INV_CELL, 8);
      c.fill();
      c.stroke();
      drawPetalIcon(c, this.self.inv[i].id, x + INV_CELL / 2, y + INV_CELL / 2, 15, this.self.inv[i].rarity);
    }
  }

  toggleInv(): void {
    this.invPanel.classList.toggle('hidden');
    if (!this.invPanel.classList.contains('hidden')) this.drawInventory();
  }

  closePanels(): void {
    this.invPanel.classList.add('hidden');
    this.craftPanel.classList.add('hidden');
  }

  // ---------- 小地图 / Toast / 死亡 ----------

  drawMinimapFrame(): void {
    drawMinimap(
      this.invPanel.ownerDocument.getElementById('minimap') as HTMLCanvasElement,
      this.net,
      WORLD.radius,
      WORLD.safeRadius,
    );
  }

  toast(text: string): void {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.toastsEl.appendChild(div);
    window.setTimeout(() => {
      div.classList.add('fade');
      window.setTimeout(() => div.remove(), 450);
    }, 2200);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild?.remove();
  }

  setLatency(ms: number): void {
    this.latencyEl.textContent = `${ms} ms`;
  }

  showDeath(level: number, kills: number): void {
    this.deathLevel.textContent = String(level);
    this.deathKills.textContent = String(kills);
    this.deathScreen.classList.remove('hidden');
  }

  hideStart(): void {
    document.getElementById('startscreen')!.classList.add('hidden');
  }

  showStart(): void {
    document.getElementById('startscreen')!.classList.remove('hidden');
  }
}
