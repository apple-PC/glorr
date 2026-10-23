// glorr UI 层:florr 式 HUD(花瓣双栏/玩家列表/聊天/小地图)+ 弹窗 + 拖拽
import { CRAFT_INPUT, CRAFT_SUCCESS, ETERNAL, MAX_SLOTS, RARITY_COLORS, WORLD, rarityName } from '@shared/constants';
import { getPetal } from '@shared/data/petals';
import type { Net, SelfState } from '@client/net';
import { drawFlower, drawPetalIcon } from '@client/sprites';
import { drawMinimap } from '@client/minimap';
import { TAU } from '@shared/math';

export interface UiCallbacks {
  onEquip(uid: number, slot: number): void;
  onUnequip(slot: number): void;
  onDrop(uid: number): void;
  onCraft(id: string, rarity: number): void;
  onRespawn(): void;
  onToggleSound(): void;
  onSendChat(text: string): void;
}

interface InvEntry {
  id: string;
  rarity: number;
  uids: number[];
}

export class Ui {
  private self: SelfState | null = null;
  private invEntries: InvEntry[] = [];
  private invSig = '';
  private slotSig = '';
  private drag: { uid: number; slot: number; moved: boolean } | null = null;
  private playerSig = '';

  // DOM
  private hud = document.getElementById('hud')!;
  private equipRow = document.getElementById('equiprow')!;
  private invRow = document.getElementById('invrow')!;
  private slotEls: HTMLDivElement[] = [];
  private slotCanvases: HTMLCanvasElement[] = [];
  private playerList = document.getElementById('playerlist')!;
  private chatLog = document.getElementById('chatlog')!;
  private chatInput = document.getElementById('chatinput') as HTMLInputElement;
  private toastsEl = document.getElementById('toasts')!;
  private craftModal = document.getElementById('craftmodal')!;
  private craftSelect = document.getElementById('craftselect') as HTMLSelectElement;
  private craftInfo = document.getElementById('craftinfo')!;
  private craftPreview = document.getElementById('craftpreview') as HTMLCanvasElement;
  private craftGo = document.getElementById('craftgo') as HTMLButtonElement;
  private deathScreen = document.getElementById('deathscreen')!;
  private deathLevel = document.getElementById('deathlevel')!;
  private deathKills = document.getElementById('deathkills')!;
  private ghost = document.getElementById('dragghost')!;
  private soundBtn = document.getElementById('soundbtn')!;
  private menuSoundBtn = document.getElementById('menusoundbtn')!;

  constructor(
    private net: Net,
    private cb: UiCallbacks,
  ) {
    this.buildEquipSlots();
    this.bindChrome();
    this.bindDrag();
    this.bindCraft();
    this.bindChat();
  }

  // ---------- 构建装备槽 ----------

  private buildEquipSlots(): void {
    this.equipRow.innerHTML = '';
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'eslot locked';
      slot.dataset.slot = String(i);
      const cv = document.createElement('canvas');
      cv.width = 42;
      cv.height = 42;
      cv.style.width = '42px';
      cv.style.height = '42px';
      cv.style.borderRadius = '10px';
      const overlay = document.createElement('div');
      overlay.className = 'cdoverlay';
      const dur = document.createElement('div');
      dur.className = 'dur';
      const durFill = document.createElement('div');
      dur.appendChild(durFill);
      slot.append(cv, overlay, dur);
      this.equipRow.appendChild(slot);
      this.slotEls.push(slot);
      this.slotCanvases.push(cv);
    }
  }

  // ---------- 固定控件 ----------

  private bindChrome(): void {
    document.getElementById('craftbtn')!.addEventListener('click', () => this.toggleCraft());
    document.getElementById('craftclose')!.addEventListener('click', () => this.craftModal.classList.add('hidden'));
    this.soundBtn.addEventListener('click', () => this.cb.onToggleSound());
    this.menuSoundBtn.addEventListener('click', () => this.cb.onToggleSound());
    document.getElementById('respawnbtn')!.addEventListener('click', () => {
      this.deathScreen.classList.add('hidden');
      this.cb.onRespawn();
    });
  }

  setSoundLabel(on: boolean): void {
    this.soundBtn.classList.toggle('off', !on);
    this.menuSoundBtn.classList.toggle('off', !on);
  }

  // ---------- 拖拽(背包热键栏 ⇄ 装备槽,拖到世界丢弃) ----------

  private bindDrag(): void {
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.drag.moved = true;
      this.moveGhost(e.clientX, e.clientY);
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.drag) return;
      const drag = this.drag;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = under?.closest('.eslot') as HTMLElement | null;

      if (drag.uid >= 0) {
        if (slotEl) {
          const slot = Number(slotEl.dataset.slot);
          if (slot < (this.self?.slots ?? 0)) this.cb.onEquip(drag.uid, slot);
        } else if (under === document.getElementById('game')) {
          // 拖到世界 = 丢弃
          this.cb.onDrop(drag.uid);
        }
      } else if (drag.slot >= 0) {
        // 拖已装备花瓣:点一下或拖出 = 卸下
        if (!drag.moved || !slotEl || under === document.getElementById('game')) {
          this.cb.onUnequip(drag.slot);
        }
      }
      this.endDrag();
    });

    // 装备槽:按下开始拖动
    this.equipRow.addEventListener('pointerdown', (e) => {
      const slotEl = (e.target as HTMLElement).closest('.eslot') as HTMLElement | null;
      if (!slotEl || !this.self) return;
      const idx = Number(slotEl.dataset.slot);
      if (idx >= this.self.slots || !this.self.slotList[idx]) return;
      e.preventDefault();
      this.drag = { uid: -1, slot: idx, moved: false };
      this.ghost.classList.remove('hidden');
      this.moveGhost(e.clientX, e.clientY);
    });

    // 背包热键栏:按下开始拖动 / 点击装备
    this.invRow.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('.islot') as HTMLElement | null;
      if (!el) return;
      const idx = Number(el.dataset.idx);
      const entry = this.invEntries[idx];
      if (!entry || entry.uids.length === 0) return;
      e.preventDefault();
      this.drag = { uid: entry.uids[0], slot: -1, moved: false };
      this.ghost.classList.remove('hidden');
      this.moveGhost(e.clientX, e.clientY);
    });

    this.invRow.addEventListener('pointerup', (e) => {
      const el = (e.target as HTMLElement).closest('.islot') as HTMLElement | null;
      if (!el || !this.drag || this.drag.moved) return;
      const idx = Number(el.dataset.idx);
      if (this.drag.uid >= 0 && this.invEntries[idx]) this.equipEntry(idx);
    });
  }

  private moveGhost(x: number, y: number): void {
    if (!this.drag) return;
    let inst: { id: string; rarity: number } | null = null;
    if (this.drag.uid >= 0 && this.self) {
      inst = this.self.inv.find((it) => it.uid === this.drag!.uid) ?? null;
    } else if (this.drag.slot >= 0 && this.self) {
      const s = this.self.slotList[this.drag.slot];
      inst = s ? { id: s.id, rarity: s.rarity } : null;
    }
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

  // ---------- 合成弹窗 ----------

  private bindCraft(): void {
    this.craftSelect.addEventListener('change', () => this.refreshCraftInfo());
    this.craftGo.addEventListener('click', () => {
      const val = this.craftSelect.value;
      if (!val || !val.includes(':')) return;
      const [id, rarity] = val.split(':');
      this.cb.onCraft(id, Number(rarity));
    });
  }

  toggleCraft(): void {
    this.craftModal.classList.toggle('hidden');
    if (!this.craftModal.classList.contains('hidden')) this.refreshCraftOptions();
  }

  closeCraft(): void {
    this.craftModal.classList.add('hidden');
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
    const target = rarity + 1 <= ETERNAL ? rarityName(rarity + 1) : '不可合成';
    this.craftInfo.innerHTML =
      `${def.name}·${rarityName(rarity)}:拥有 <b>${count}</b>/${CRAFT_INPUT} → ${target}<br />` +
      `成功率 <b>${(chance * 100).toFixed(chance < 0.01 ? 2 : 0)}%</b> · ${def.desc}`;
    for (let i = 0; i < CRAFT_INPUT; i++) {
      const cx = 27 + i * 49;
      const filled = i < count;
      if (!filled) c.globalAlpha = 0.22;
      drawPetalIcon(c, id, cx, 28, 15, rarity);
      c.globalAlpha = 1;
    }
    this.craftGo.disabled = count < CRAFT_INPUT || rarity >= ETERNAL;
  }

  // ---------- 聊天 ----------

  private bindChat(): void {
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) this.cb.onSendChat(text);
        this.chatInput.value = '';
        this.chatInput.blur();
      } else if (e.key === 'Escape') {
        this.chatInput.value = '';
        this.chatInput.blur();
      }
    });
  }

  addChat(from: string, text: string): void {
    const div = document.createElement('div');
    div.className = 'chatline';
    const b = document.createElement('b');
    b.textContent = `${from}:`;
    div.append(b, document.createTextNode(text));
    this.chatLog.appendChild(div);
    while (this.chatLog.children.length > 6) this.chatLog.firstChild?.remove();
  }

  addSysChat(text: string): void {
    const div = document.createElement('div');
    div.className = 'chatline sys';
    div.textContent = text;
    this.chatLog.appendChild(div);
    while (this.chatLog.children.length > 6) this.chatLog.firstChild?.remove();
  }

  isChatFocused(): boolean {
    return document.activeElement === this.chatInput;
  }

  focusChat(): void {
    this.chatInput.focus();
  }

  // ---------- 状态刷新 ----------

  setSelf(self: SelfState): void {
    const first = !this.self;
    this.self = self;

    // 装备槽图标/边框/锁定
    const sig = self.slotList.map((s) => (s ? `${s.id}:${s.rarity}` : '-')).join(',');
    if (sig !== this.slotSig || first) {
      this.slotSig = sig;
      for (let i = 0; i < MAX_SLOTS; i++) {
        const cv = this.slotCanvases[i];
        const c = cv.getContext('2d')!;
        c.clearRect(0, 0, cv.width, cv.height);
        const el = this.slotEls[i];
        const s = self.slotList[i];
        if (s) {
          drawPetalIcon(c, s.id, 21, 21, 15, s.rarity);
          el.style.borderColor = RARITY_COLORS[s.rarity];
        } else {
          el.style.borderColor = 'rgba(255,255,255,0.14)';
        }
      }
    }
    for (let i = 0; i < MAX_SLOTS; i++) {
      const el = this.slotEls[i];
      const locked = i >= self.slots;
      el.classList.toggle('locked', locked);
      const s = self.slotList[i];
      const durFill = el.querySelector('.dur > div') as HTMLDivElement;
      durFill.style.width = s ? `${Math.max(0, s.hpPct) * 100}%` : '0%';
      durFill.style.background = s && s.hpPct < 0.4 ? '#e05252' : '#7ee07e';
    }

    // 背包热键栏(按 花瓣+稀有度 聚合)
    const invSig = self.inv.map((it) => `${it.id}:${it.rarity}:${it.uid}`).join(',');
    if (invSig !== this.invSig || first) {
      this.invSig = invSig;
      this.buildInvRow();
      if (!this.craftModal.classList.contains('hidden')) this.refreshCraftOptions();
    }

    if (first) {
      this.hud.classList.remove('hidden');
      this.addSysChat('欢迎来到 glorr 花园,击杀生物收集花瓣吧');
    }
  }

  private buildInvRow(): void {
    if (!this.self) return;
    this.invRow.innerHTML = '';
    const map = new Map<string, InvEntry>();
    for (const it of this.self.inv) {
      const key = `${it.id}:${it.rarity}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { id: it.id, rarity: it.rarity, uids: [] };
        map.set(key, entry);
      }
      entry.uids.push(it.uid);
    }
    this.invEntries = [...map.values()];
    this.invEntries.forEach((entry, idx) => {
      const el = document.createElement('div');
      el.className = 'islot';
      el.dataset.idx = String(idx);
      el.style.background = RARITY_COLORS[entry.rarity];
      el.style.border = '2px solid rgba(0,0,0,0.25)';
      const cv = document.createElement('canvas');
      cv.width = 34;
      cv.height = 34;
      cv.style.width = '34px';
      cv.style.height = '34px';
      cv.style.borderRadius = '8px';
      const c = cv.getContext('2d')!;
      drawPetalIcon(c, entry.id, 17, 17, 12, entry.rarity);
      const hk = document.createElement('span');
      hk.className = 'hk';
      hk.textContent = idx < 9 ? String(idx + 1) : '0';
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = String(entry.uids.length);
      el.append(cv, hk, cnt);
      el.title = `${getPetal(entry.id).name}·${rarityName(entry.rarity)} ×${entry.uids.length}(点击装备)`;
      this.invRow.appendChild(el);
    });
  }

  /** 热键/点击背包条目:装备到第一个空槽,满了放第 0 格 */
  equipEntry(idx: number): void {
    const entry = this.invEntries[idx];
    if (!entry || entry.uids.length === 0 || !this.self) return;
    let target = this.self.slotList.findIndex((x, i) => !x && i < this.self!.slots);
    if (target < 0) target = 0;
    this.cb.onEquip(entry.uids[0], target);
  }

  /** 每帧:装填扫层 */
  tickSlots(): void {
    if (!this.self) return;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = this.self.slotList[i];
      const overlay = this.slotEls[i].querySelector('.cdoverlay') as HTMLDivElement;
      if (s && s.cdPct > 0) {
        overlay.style.background = `conic-gradient(rgba(0,0,0,0.45) ${s.cdPct * 360}deg, transparent 0deg)`;
      } else if (overlay.style.background) {
        overlay.style.background = '';
      }
    }
  }

  /** 玩家列表(自己 + 视野内玩家) */
  updatePlayerList(): void {
    if (!this.self) return;
    const rows: [number, string, number, boolean][] = [];
    rows.push([this.net.selfId, this.self.name, this.self.level, true]);
    for (const [id, e] of this.net.ents) {
      if (e.kind !== 'p' || id === this.net.selfId || !e.name) continue;
      const info = this.net.othersInfo.get(id);
      rows.push([id, e.name, info?.level ?? 1, false]);
    }
    const sig = rows.map((r) => `${r[0]}:${r[2]}`).join(',');
    if (sig === this.playerSig) return;
    this.playerSig = sig;

    this.playerList.innerHTML = '';
    for (const [id, name, level, isSelf] of rows) {
      const row = document.createElement('div');
      row.className = `prow${isSelf ? ' self' : ''}`;
      const cv = document.createElement('canvas');
      cv.width = 30;
      cv.height = 30;
      const c = cv.getContext('2d')!;
      drawFlower(c, 15, 15, 9, -Math.PI / 2, {});
      const meta = document.createElement('div');
      meta.className = 'pmeta';
      const n = document.createElement('span');
      n.className = 'pname';
      n.textContent = name;
      const l = document.createElement('span');
      l.className = 'plvl';
      l.textContent = `Lv ${level}`;
      meta.append(n, l);
      row.append(cv, meta);
      this.playerList.appendChild(row);
    }
  }

  drawMinimapFrame(): void {
    drawMinimap(
      document.getElementById('minimap') as HTMLCanvasElement,
      this.net,
      WORLD.radius,
      WORLD.safeRadius,
    );
  }

  // ---------- Toast / 死亡 ----------

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

  showDeath(level: number, kills: number): void {
    this.deathLevel.textContent = String(level);
    this.deathKills.textContent = String(kills);
    this.deathScreen.classList.remove('hidden');
  }

  hideDeath(): void {
    this.deathScreen.classList.add('hidden');
  }

  hideLoading(): void {
    document.getElementById('loadingscreen')!.classList.add('hidden');
  }

  showMenu(): void {
    document.getElementById('menuscreen')!.classList.remove('hidden');
  }

  hideMenu(): void {
    document.getElementById('menuscreen')!.classList.add('hidden');
  }
}
