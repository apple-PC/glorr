// glorr 账号系统
// - 优先使用 Postgres(DATABASE_URL 存在时),适合公网部署(Fly / 任意云)
// - 无 DATABASE_URL 时回退到本地 JSON(data/accounts.json),方便本地开发/测试
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db';

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

export interface AccountProgress {
  level: number;
  xp: number;
  kills: number;
  playtime: number;
  inv: InvSave[];
  slots: (SlotSave | null)[];
}

export interface IAccountStore {
  register(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string };
  login(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string };
  issueToken(name: string): string;
  tokenName(token: string): Account | null;
  revokeTokens(name: string): void;
  get(name: string): Account | undefined;
  all(): Account[];
  count(): { total: number; banned: number; admins: number };
  saveProgress(name: string, data: AccountProgress): void;
  setBanned(name: string, banned: boolean, reason?: string): boolean;
  setAdmin(name: string, admin: boolean): boolean;
  resetPassword(name: string, newPassword: string): { ok: boolean; error?: string };
  setLevel(name: string, level: number): boolean;
  deleteAccount(name: string): boolean;
  publicInfo(name: string): PublicAccount | null;
}

export type AccountStore = IAccountStore;

const NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,12}$/;

export function validateName(name: string): string | null {
  if (!NAME_RE.test(name)) return '名称需 2-12 位,支持中英文/数字/_/-';
  return null;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// 内存 token(不持久化,单实例足够;Fly 默认单实例常驻)
abstract class BaseStore implements IAccountStore {
  protected tokens = new Map<string, { name: string; expires: number }>();

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
    const account = this.get(entry.name);
    if (!account || account.banned) return null;
    return account;
  }

  revokeTokens(name: string): void {
    for (const [token, entry] of this.tokens) {
      if (entry.name === name) this.tokens.delete(token);
    }
  }

  abstract register(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string };
  abstract login(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string };
  abstract get(name: string): Account | undefined;
  abstract all(): Account[];
  abstract count(): { total: number; banned: number; admins: number };
  abstract saveProgress(name: string, data: AccountProgress): void;
  abstract setBanned(name: string, banned: boolean, reason?: string): boolean;
  abstract setAdmin(name: string, admin: boolean): boolean;
  abstract resetPassword(name: string, newPassword: string): { ok: boolean; error?: string };
  abstract setLevel(name: string, level: number): boolean;
  abstract deleteAccount(name: string): boolean;
  abstract publicInfo(name: string): PublicAccount | null;
}

// ============ 本地 JSON 实现(回退) ============

export class JsonAccountStore extends BaseStore {
  private accounts = new Map<string, Account>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private filePath: string;

  constructor(filePath?: string) {
    super();
    this.filePath = filePath ?? path.resolve(process.cwd(), 'data/accounts.json');
    this.load();
    process.on('exit', () => this.flush());
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { accounts?: Account[] };
      for (const acc of raw.accounts ?? []) {
        if (acc && typeof acc.name === 'string') this.accounts.set(acc.name, acc);
      }
      console.log(`[accounts] 已加载 ${this.accounts.size} 个账号(本地 JSON)`);
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

  private touch(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.persist();
    }, 3000);
  }

  private touchNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }

  private flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) this.persist();
  }

  register(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string } {
    const err = validateName(name);
    if (err) return { ok: false, error: err };
    if (password.length < 4) return { ok: false, error: '密码至少 4 位' };
    if (this.accounts.has(name)) return { ok: false, error: '该名称已被注册' };
    const salt = crypto.randomBytes(16).toString('hex');
    const account: Account = {
      name,
      salt,
      hash: hashPassword(password, salt),
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
    if (account.hash !== hashPassword(password, account.salt)) {
      return { ok: false, error: '密码错误' };
    }
    return { ok: true, account };
  }

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

  saveProgress(name: string, data: AccountProgress): void {
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
    account.hash = hashPassword(newPassword, salt);
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

// ============ Postgres 实现 ============

interface AccountRow {
  name: string;
  salt: string;
  hash: string;
  admin: boolean;
  banned: boolean;
  ban_reason: string;
  created_at: string | number;
  last_seen: string | number;
  level: number;
  xp: number;
  kills: number;
  playtime: number;
  inv: InvSave[];
  slots: (SlotSave | null)[];
}

export class PostgresAccountStore extends BaseStore {
  private accounts = new Map<string, Account>();

  async init(): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL 未设置,无法使用 Postgres 存储');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        name TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        hash TEXT NOT NULL,
        admin BOOLEAN NOT NULL DEFAULT FALSE,
        banned BOOLEAN NOT NULL DEFAULT FALSE,
        ban_reason TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        last_seen BIGINT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        playtime INTEGER NOT NULL DEFAULT 0,
        inv JSONB NOT NULL DEFAULT '[]'::jsonb,
        slots JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    const res = await pool.query('SELECT * FROM accounts');
    for (const row of res.rows as AccountRow[]) {
      this.accounts.set(row.name, this.rowToAccount(row));
    }
    console.log(`[accounts] Postgres 已加载 ${this.accounts.size} 个账号`);
  }

  private rowToAccount(row: AccountRow): Account {
    return {
      name: row.name,
      salt: row.salt,
      hash: row.hash,
      admin: row.admin,
      banned: row.banned,
      banReason: row.ban_reason,
      createdAt: Number(row.created_at),
      lastSeen: Number(row.last_seen),
      level: row.level,
      xp: row.xp,
      kills: row.kills,
      playtime: row.playtime,
      inv: Array.isArray(row.inv) ? row.inv : [],
      slots: Array.isArray(row.slots) ? row.slots : [],
    };
  }

  private async writeRow(a: Account): Promise<void> {
    if (!pool) return;
    await pool.query(
      `INSERT INTO accounts
        (name, salt, hash, admin, banned, ban_reason, created_at, last_seen, level, xp, kills, playtime, inv, slots)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (name) DO UPDATE SET
         salt=EXCLUDED.salt, hash=EXCLUDED.hash, admin=EXCLUDED.admin, banned=EXCLUDED.banned,
         ban_reason=EXCLUDED.ban_reason, created_at=EXCLUDED.created_at, last_seen=EXCLUDED.last_seen,
         level=EXCLUDED.level, xp=EXCLUDED.xp, kills=EXCLUDED.kills, playtime=EXCLUDED.playtime,
         inv=EXCLUDED.inv, slots=EXCLUDED.slots`,
      [
        a.name, a.salt, a.hash, a.admin, a.banned, a.banReason, a.createdAt, a.lastSeen,
        a.level, a.xp, a.kills, a.playtime, a.inv, a.slots,
      ],
    );
  }

  register(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string } {
    const err = validateName(name);
    if (err) return { ok: false, error: err };
    if (password.length < 4) return { ok: false, error: '密码至少 4 位' };
    if (this.accounts.has(name)) return { ok: false, error: '该名称已被注册' };
    const salt = crypto.randomBytes(16).toString('hex');
    const account: Account = {
      name,
      salt,
      hash: hashPassword(password, salt),
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
    void this.writeRow(account);
    return { ok: true, account };
  }

  login(name: string, password: string): { ok: true; account: Account } | { ok: false; error: string } {
    const account = this.accounts.get(name);
    if (!account) return { ok: false, error: '账号不存在,请先注册' };
    if (account.banned) return { ok: false, error: `账号已被封禁:${account.banReason || '违规'}` };
    if (account.hash !== hashPassword(password, account.salt)) {
      return { ok: false, error: '密码错误' };
    }
    return { ok: true, account };
  }

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

  saveProgress(name: string, data: AccountProgress): void {
    const account = this.accounts.get(name);
    if (!account) return;
    account.level = data.level;
    account.xp = data.xp;
    account.kills = data.kills;
    account.playtime = data.playtime;
    account.inv = data.inv;
    account.slots = data.slots;
    account.lastSeen = Date.now();
    void this.writeRow(account);
  }

  setBanned(name: string, banned: boolean, reason = ''): boolean {
    const account = this.accounts.get(name);
    if (!account) return false;
    account.banned = banned;
    account.banReason = banned ? reason : '';
    void this.writeRow(account);
    return true;
  }

  setAdmin(name: string, admin: boolean): boolean {
    const account = this.accounts.get(name);
    if (!account) return false;
    account.admin = admin;
    void this.writeRow(account);
    return true;
  }

  resetPassword(name: string, newPassword: string): { ok: boolean; error?: string } {
    const account = this.accounts.get(name);
    if (!account) return { ok: false, error: '账号不存在' };
    if (newPassword.length < 4) return { ok: false, error: '密码至少 4 位' };
    const salt = crypto.randomBytes(16).toString('hex');
    account.salt = salt;
    account.hash = hashPassword(newPassword, salt);
    this.revokeTokens(name);
    void this.writeRow(account);
    return { ok: true };
  }

  setLevel(name: string, level: number): boolean {
    const account = this.accounts.get(name);
    if (!account) return false;
    account.level = Math.max(1, Math.min(200, Math.floor(level)));
    void this.writeRow(account);
    return true;
  }

  deleteAccount(name: string): boolean {
    if (!pool) return false;
    const existed = this.accounts.delete(name);
    if (existed) {
      this.revokeTokens(name);
      void pool.query('DELETE FROM accounts WHERE name=$1', [name]);
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

// ============ 工厂 ============

export async function createAccountStore(): Promise<IAccountStore> {
  if (process.env.DATABASE_URL && pool) {
    const store = new PostgresAccountStore();
    await store.init();
    return store;
  }
  console.log('[accounts] 未检测到 DATABASE_URL,使用本地 JSON 存储(data/accounts.json)');
  return new JsonAccountStore();
}
