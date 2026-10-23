// glorr 账号系统:JSON 文件存储 + scrypt 密码哈希 + 内存 token
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface SlotSave {
  id: string;
  rarity: number;
}

export interface InvSave {
  id: string;
  rarity: number;
}

export interface Account {
  name: string;
  salt: string;
  hash: string;
  admin: boolean;
  banned: boolean;
  banReason: string;
  createdAt: number;
  lastSeen: number;
  level: number;
  xp: number;
  kills: number;
  playtime: number;
  /** persistent 背包(死亡会清空掉落部分,断线保存) */
  inv: InvSave[];
  /** persistent 装备(恢复时满耐久) */
  slots: (SlotSave | null)[];
}

export type PublicAccount = Omit<Account, 'salt' | 'hash'>;

const NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,12}$/;
const STORE_PATH = path.resolve(process.cwd(), 'data/accounts.json');

export class AccountStore {
  private accounts = new Map<string, Account>();
  private tokens = new Map<string, { name: string; expires: number }>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(private filePath: string = STORE_PATH) {
    this.load();
    // 进程退出时落盘
    process.on('exit', () => this.flush());
  }

  // ---------- 持久化 ----------

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { accounts?: Account[] };
      for (const acc of raw.accounts ?? []) {
        if (acc && typeof acc.name === 'string') this.accounts.set(acc.name, acc);
      }
      console.log(`[accounts] 已加载 ${this.accounts.size} 个账号`);
    } catch (err) {
      console.error('[accounts] 存档读取失败,使用空存档:', err);
    }
  }

  private persist(): void {
    this.dirty = false;
    const data = { version: 1, accounts: [...this.accounts.values()] };
    const tmp = `${this.filePath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[accounts] 存档写入失败:', err);
    }
  }

  /** 防抖保存 */
  touch(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.persist();
    }, 3000);
  }

  /** 立即落盘(管理操作等需要即时生效的场景) */
  touchNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) this.persist();
  }

  // ---------- 注册 / 登录 ----------

  static validateName(name: string): string | null {
    if (!NAME_RE.test(name)) return '名称需 2-12 位,支持中英文/数字/_/-';
    return null;
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  /** 注册;第一个账号自动成为管理员 */
  register(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string } {
    const err = AccountStore.validateName(name);
    if (err) return { ok: false, error: err };
    if (password.length < 4) return { ok: false, error: '密码至少 4 位' };
    if (this.accounts.has(name)) return { ok: false, error: '该名称已被注册' };
    const salt = crypto.randomBytes(16).toString('hex');
    const account: Account = {
      name,
      salt,
      hash: this.hashPassword(password, salt),
      admin: this.accounts.size === 0,
      banned: false,
      banReason: '',
      createdAt: Date.now(),
      lastSeen: Date.now(),
      level: 1,
      xp: 0,
      kills: 0,
      playtime: 0,
      inv: [],
      slots: [],
    };
    this.accounts.set(name, account);
    this.touch();
    return { ok: true, account };
  }

  login(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string } {
    const account = this.accounts.get(name);
    if (!account) return { ok: false, error: '账号不存在,请先注册' };
    if (account.banned) return { ok: false, error: `账号已被封禁:${account.banReason || '违规'}` };
    if (account.hash !== this.hashPassword(password, account.salt)) {
      return { ok: false, error: '密码错误' };
    }
    return { ok: true, account };
  }

  // ---------- Token ----------

  issueToken(name: string): string {
    const token = crypto.randomBytes(24).toString('hex');
    this.tokens.set(token, { name, expires: Date.now() + 7 * 24 * 3600 * 1000 });
    return token;
  }

  tokenName(token: string): Account | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    const account = this.accounts.get(entry.name);
    if (!account || account.banned) return null;
    return account;
  }

  revokeTokens(name: string): void {
    for (const [token, entry] of this.tokens) {
      if (entry.name === name) this.tokens.delete(token);
    }
  }

  // ---------- 查询 / 管理 ----------

  get(name: string): Account | undefined {
    return this.accounts.get(name);
  }

  all(): Account[] {
    return [...this.accounts.values()];
  }

  count(): { total: number; banned: number; admins: number } {
    let banned = 0;
    let admins = 0;
    for (const a of this.accounts.values()) {
      if (a.banned) banned++;
      if (a.admin) admins++;
    }
    return { total: this.accounts.size, banned, admins };
  }

  /** 保存玩家进度(断线/定时/死亡时调用) */
  saveProgress(
    name: string,
    data: { level: number; xp: number; kills: number; playtime: number; inv: InvSave[]; slots: (SlotSave | null)[] },
  ): void {
    const account = this.accounts.get(name);
    if (!account) return;
    account.level = data.level;
    account.xp = data.xp;
    account.kills = data.kills;
    account.playtime = data.playtime;
    account.inv = data.inv;
    account.slots = data.slots;
    account.lastSeen = Date.now();
    this.touch();
  }

  setBanned(name: string, banned: boolean, reason = ''): boolean {
    const account = this.accounts.get(name);
    if (!account) return false;
    account.banned = banned;
    account.banReason = banned ? reason : '';
    this.touchNow();
    return true;
  }

  setAdmin(name: string, admin: boolean): boolean {
    const account = this.accounts.get(name);
    if (!account) return false;
    account.admin = admin;
    this.touchNow();
    return true;
  }

  resetPassword(name: string, newPassword: string): { ok: boolean; error?: string } {
    const account = this.accounts.get(name);
    if (!account) return { ok: false, error: '账号不存在' };
    if (newPassword.length < 4) return { ok: false, error: '密码至少 4 位' };
    const salt = crypto.randomBytes(16).toString('hex');
    account.salt = salt;
    account.hash = this.hashPassword(newPassword, salt);
    this.revokeTokens(name);
    this.touchNow();
    return { ok: true };
  }

  setLevel(name: string, level: number): boolean {
    const account = this.accounts.get(name);
    if (!account) return false;
    account.level = Math.max(1, Math.min(200, Math.floor(level)));
    this.touchNow();
    return true;
  }

  deleteAccount(name: string): boolean {
    const existed = this.accounts.delete(name);
    if (existed) {
      this.revokeTokens(name);
      this.touchNow();
    }
    return existed;
  }

  publicInfo(name: string): PublicAccount | null {
    const account = this.accounts.get(name);
    if (!account) return null;
    const { salt: _s, hash: _h, ...rest } = account;
    return rest;
  }
}
