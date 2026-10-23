// glorr 账号持久化 + 管理 API 专项测试
import WebSocket from 'ws';
import fs from 'node:fs';

const URL = process.env.SMOKE_URL || 'ws://localhost:8080';
const API = 'http://localhost:8080';

function check(label: string, ok: boolean, detail = ''): boolean {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  return ok;
}

function readAccounts(): { name: string; level: number; inv: unknown[]; slots: unknown[]; admin: boolean }[] {
  try {
    const d = JSON.parse(fs.readFileSync('data/accounts.json', 'utf-8')) as { accounts: { name: string; level: number; inv: unknown[]; slots: unknown[]; admin: boolean }[] };
    return d.accounts;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  let allOk = true;
  const accName = `pt${Date.now() % 100000}`;

  // 1. 注册 → join → 等 you
  const ws = new WebSocket(URL);
  let token = '';
  let slots = 0;
  let invLen = 0;
  let level = 0;
  let died = false;
  let youCount = 0;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('超时')), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'register', name: accName, password: 'test1234' })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.t === 'auth_ok') {
        token = msg.token;
        ws.send(JSON.stringify({ t: 'join', token }));
      } else if (msg.t === 'auth_err') {
        clearTimeout(timer);
        reject(new Error(`注册失败: ${msg.reason}`));
      } else if (msg.t === 'ev' && msg.k === 'death') {
        died = true;
      } else if (msg.t === 'you') {
        youCount++;
        slots = msg.slots;
        invLen = msg.inv.length;
        level = msg.level;
        if (youCount === 1) {
          clearTimeout(timer);
          resolve();
        }
      }
    });
    ws.on('error', reject);
  });
  console.log(`\n[账号 ${accName}]`);
  allOk = check('注册后直接进房,拿到 you 状态', slots === 5 && level === 1, `slots=${slots} inv=${invLen} lv=${level}`) && allOk;

  // 2. 保持连接 17 秒(跨过一次 15s 定期存档),然后断开
  await new Promise((r) => setTimeout(r, 17000));
  ws.close();
  await new Promise((r) => setTimeout(r, 1500)); // 等落盘(防抖 3s + 余量)

  const saved = readAccounts().find((a) => a.name === accName);
  allOk = check('进度已落盘(账号存在)', Boolean(saved)) && allOk;
  const savedSlots = saved?.slots.filter(Boolean).length ?? -1;
  allOk = check('装备已持久化(5 个基础花瓣)', savedSlots === 5, `slots=${savedSlots} 死亡=${died}`) && allOk;

  // 3. 管理 API:用第一个注册的账号(管理员)登录
  const accounts = readAccounts();
  const adminAcc = accounts.find((a) => a.admin);
  allOk = check('首个注册账号自动成为管理员', Boolean(adminAcc), adminAcc?.name ?? '无');
  if (!adminAcc) {
    console.log('\n[smoke] 存在失败项');
    process.exit(1);
  }
  // 从 bot 脚本已知测试密码;专项测试注册的账号不是管理员,用存档里第一个管理员无法知道密码,
  // 因此这里改用「注册即管理员」不可行 —— 跳过密码型 API 测试的情况由 admin-check 脚本覆盖。
  console.log(`\n[管理 API] 管理员账号:${adminAcc.name}(密码测试脚本固定为 test1234 的机器人账号)`);

  const loginRes = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: adminAcc.name, password: 'test1234' }),
  });
  const loginData = (await loginRes.json()) as { ok: boolean; token?: string; error?: string };
  allOk = check('管理员登录 API', loginRes.ok && loginData.ok, loginData.error ?? '') && allOk;
  const adminToken = loginData.token ?? '';

  const auth = { authorization: `Bearer ${adminToken}` };
  const overviewRes = await fetch(`${API}/api/admin/overview`, { headers: auth });
  const overview = (await overviewRes.json()) as { ok: boolean; rooms: { name: string; players: number }[]; online: number; accounts: { total: number }; maintenance: boolean };
  allOk = check('总览 API(房间/在线/账号)', overview.ok && overview.rooms.length >= 1 && overview.accounts.total >= 1, `rooms=${overview.rooms.length} online=${overview.online} total=${overview.accounts.total}`) && allOk;

  const accRes = await fetch(`${API}/api/admin/accounts?q=pt`, { headers: auth });
  const accData = (await accRes.json()) as { ok: boolean; accounts: { name: string }[] };
  allOk = check('账号列表 API(搜索)', accData.ok && accData.accounts.some((a) => a.name === accName), `命中 ${accData.accounts.length}`) && allOk;

  const mtRes = await fetch(`${API}/api/admin/maintenance`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ on: true }),
  });
  allOk = check('维护模式开关 API', mtRes.ok) && allOk;
  await fetch(`${API}/api/admin/maintenance`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ on: false }),
  });

  const anRes = await fetch(`${API}/api/admin/announce`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text: '专项测试广播' }),
  });
  allOk = check('全服广播 API', anRes.ok) && allOk;

  const banRes = await fetch(`${API}/api/admin/account`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: accName, action: 'ban', value: '测试封禁' }),
  });
  allOk = check('封禁 API', banRes.ok) && allOk;
  const banned = readAccounts().find((a) => a.name === accName) as { banned: boolean } | undefined;
  allOk = check('封禁已生效', banned?.banned === true) && allOk;

  const unbanRes = await fetch(`${API}/api/admin/account`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: accName, action: 'unban' }),
  });
  allOk = check('解封 API', unbanRes.ok) && allOk;

  const lvRes = await fetch(`${API}/api/admin/account`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: accName, action: 'set_level', value: '7' }),
  });
  const lvAcc = readAccounts().find((a) => a.name === accName) as { level: number } | undefined;
  allOk = check('改等级 API', lvRes.ok && lvAcc?.level === 7, `level=${lvAcc?.level}`) && allOk;

  const noAuth = await fetch(`${API}/api/admin/overview`);
  allOk = check('无 token 访问被拒(401)', noAuth.status === 401) && allOk;

  console.log(`\n[persist-admin] ${allOk ? '全部通过' : '存在失败项'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('[persist-admin] 致命错误:', err);
  process.exit(1);
});
