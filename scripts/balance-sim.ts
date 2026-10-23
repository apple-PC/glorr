// glorr 平衡模拟:无头机器人按指定出装实测战斗数据
// 用法:GLORR_DEBUG=1 启动服务端后运行 npx tsx scripts/balance-sim.ts
import WebSocket from 'ws';

const URL = process.env.SMOKE_URL || 'ws://localhost:8080';
const RUN_MS = Number(process.env.SIM_SECS || 45) * 1000;

interface Loadout {
  name: string;
  items: { id: string; rarity: number }[];
  ring: [number, number]; // 目标环带 [r0, r1]
}

const SCENARIOS: Loadout[] = [
  { name: 'A 新手套(5基础) @C1', items: [{ id: 'basic', rarity: 0 }], ring: [560, 980] },
  {
    name: 'B 蜂针流(5蜂针+叶子) @C2',
    items: [
      { id: 'stinger', rarity: 1 }, { id: 'stinger', rarity: 1 }, { id: 'stinger', rarity: 1 },
      { id: 'stinger', rarity: 1 }, { id: 'stinger', rarity: 1 }, { id: 'leaf', rarity: 1 },
    ],
    ring: [1040, 1430],
  },
  {
    name: 'C 稀有混合(3蜂针+导弹+叶子+更快) @C3',
    items: [
      { id: 'stinger', rarity: 2 }, { id: 'stinger', rarity: 2 }, { id: 'stinger', rarity: 2 },
      { id: 'missile', rarity: 2 }, { id: 'leaf', rarity: 2 }, { id: 'faster', rarity: 2 },
    ],
    ring: [1490, 1880],
  },
  {
    name: 'D 史诗前排(4蜂针+导弹+叶子+石头) @C5',
    items: [
      { id: 'stinger', rarity: 3 }, { id: 'stinger', rarity: 3 }, { id: 'stinger', rarity: 3 },
      { id: 'stinger', rarity: 3 }, { id: 'missile', rarity: 3 }, { id: 'leaf', rarity: 3 }, { id: 'rock', rarity: 3 },
    ],
    ring: [2440, 2880],
  },
];

interface Result {
  kills: number;
  xp: number;
  level: number;
  deaths: number;
  breaks: number;
  hpSum: number;
  hpSamples: number;
  minHp: number;
}

async function runScenario(sc: Loadout, idx: number): Promise<Result> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const name = `bs${idx}${Date.now() % 100000}`;
    const res: Result = { kills: 0, xp: 0, level: 1, deaths: 0, breaks: 0, hpSum: 0, hpSamples: 0, minHp: 999 };
    let selfX = 0;
    let selfY = 0;
    let granted = false;
    let equipped = false;
    let killsBase = 0;
    let levelBase = 1;
    let token = '';

    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(res);
    }, RUN_MS + 4000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'register', name, password: 'test1234' }));
    });
    ws.on('error', reject);

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.t === 'auth_ok') {
        token = msg.token;
        ws.send(JSON.stringify({ t: 'join', token }));
      } else if (msg.t === 'auth_err') {
        clearTimeout(timer);
        reject(new Error(`鉴权失败: ${msg.reason}`));
      } else if (msg.t === 'you' && !granted) {
        granted = true;
        killsBase = msg.kills;
        levelBase = msg.level;
        // 授予出装(需要服务端 GLORR_DEBUG=1)
        ws.send(JSON.stringify({ t: 'debug_grant', items: sc.items }));
      } else if (msg.t === 'you' && granted && !equipped) {
        // 装备前 N 个到槽位
        const inv = msg.inv as { uid: number; id: string; rarity: number }[];
        const slotsToFill = Math.min(sc.items.length, msg.slots as number);
        for (let i = 0; i < slotsToFill && i < inv.length; i++) {
          ws.send(JSON.stringify({ t: 'equip', uid: inv[i].uid, slot: i }));
        }
        equipped = true;
      } else if (msg.t === 'ev') {
        if (msg.k === 'death') res.deaths++;
        if (msg.k === 'break') res.breaks++;
      } else if (msg.t === 'you') {
        res.level = msg.level;
        res.xp = msg.xp;
        res.kills = msg.kills - killsBase;
        const hp = msg.hp as number;
        const maxHp = msg.maxHp as number;
        res.hpSum += hp / Math.max(1, maxHp);
        res.hpSamples++;
        res.minHp = Math.min(res.minHp, hp / Math.max(1, maxHp));
      } else if (msg.t === 'snap') {
        // 导航:环带内巡猎
        const ents = msg.ents as [string, number, number, number, ...unknown[]][];
        let mx = 0;
        let my = 0;
        let bestD = Infinity;
        for (const e of ents) {
          if (e[0] === 'm') {
            const d = Math.hypot(e[2] - selfX, e[3] - selfY);
            const r = Math.hypot(e[2], e[3]);
            const inBand = r >= sc.ring[0] - 100 && r <= sc.ring[1] + 100;
            if (inBand && d < bestD) {
              bestD = d;
              mx = e[2];
              my = e[3];
            }
          }
          if (e[0] === 'p' && typeof e[6] === 'string' && e[6] === name) {
            selfX = e[2];
            selfY = e[3];
          }
        }
        let dx = 0;
        let dy = 0;
        const r = Math.hypot(selfX, selfY);
        if (bestD < Infinity) {
          const d = Math.hypot(mx - selfX, my - selfY) || 1;
          dx = (mx - selfX) / d;
          dy = (my - selfY) / d;
        } else if (r < sc.ring[0]) {
          dx = selfX / (r || 1);
          dy = selfY / (r || 1);
        } else if (r > sc.ring[1]) {
          dx = -selfX / (r || 1);
          dy = -selfY / (r || 1);
        } else {
          // 带内无怪:切向环绕
          dx = -selfY / (r || 1);
          dy = selfX / (r || 1);
        }
        ws.send(JSON.stringify({ t: 'in', x: dx, y: dy }));
      }
    });
  });
}

async function main(): Promise<void> {
  console.log(`[balance] 目标 ${URL} | 每场景 ${RUN_MS / 1000}s`);
  if (process.env.GLORR_DEBUG !== '1') {
    console.log('[balance] 提示:服务端需以 GLORR_DEBUG=1 启动才能授予出装');
  }
  const minutes = RUN_MS / 60000;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    process.stdout.write(`\n▸ ${sc.name} … `);
    const r = await runScenario(sc, i);
    const avgHp = r.hpSamples > 0 ? (r.hpSum / r.hpSamples) * 100 : 0;
    console.log(
      `击杀 ${(r.kills / minutes).toFixed(1)}/min | 经验 ${(r.xp / minutes).toFixed(0)}/min | ` +
      `Lv ${r.level} | 死亡 ${r.deaths} | 花瓣破碎 ${r.breaks} | 平均血线 ${avgHp.toFixed(0)}% | 最低 ${(r.minHp * 100).toFixed(0)}%`,
    );
  }
  console.log('\n[balance] 完成');
  process.exit(0);
}

main().catch((err) => {
  console.error('[balance] 致命错误:', err);
  process.exit(1);
});
