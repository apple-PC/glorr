// glorr 冒烟测试:无头机器人客户端,验证核心协议与玩法循环
// 用法:先启动服务端(npm start),再运行 npm run smoke
import WebSocket from 'ws';

const URL = process.env.SMOKE_URL || 'ws://localhost:8080';
const DURATION = Number(process.env.SMOKE_SECS || 24);

interface Stats {
  name: string;
  welcomed: boolean;
  authed: boolean;
  youCount: number;
  snapCount: number;
  mobsSeen: Set<number>;
  dropsSeen: Set<number>;
  playersSeen: Set<number>;
  bulletsSeen: number;
  level: number;
  xp: number;
  kills: number;
  invLen: number;
  slots: number;
  dead: boolean;
  evs: string[];
  moved: number;
  lastX: number;
  lastY: number;
  latencyPongs: number;
  craftReplied: boolean;
}

function makeBot(name: string, idx: number): Promise<Stats> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const st: Stats = {
      name,
      welcomed: false,
      youCount: 0,
      snapCount: 0,
      mobsSeen: new Set(),
      dropsSeen: new Set(),
      playersSeen: new Set(),
      bulletsSeen: 0,
      level: 1,
      xp: 0,
      kills: 0,
      invLen: 0,
      slots: 0,
      dead: false,
      evs: [],
      moved: 0,
      lastX: 0,
      lastY: 0,
      latencyPongs: 0,
      craftReplied: false,
      authed: false,
    };
    let selfX = 0;
    let selfY = 0;
    let nearestMob: { x: number; y: number } | null = null;
    let craftTested = false;
    const startedAt = Date.now();
    let token = '';

    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(st);
    }, DURATION * 1000);

    ws.on('open', () => {
      // 注册一个新账号(短名 + 序号保证唯一且合规)
      const accName = `bt${String(Date.now() % 100000)}${idx}`;
      ws.send(JSON.stringify({ t: 'register', name: accName, password: 'test1234' }));
      st.name = accName;
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`[${name}] 连接失败: ${err.message}`));
    });
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      switch (msg.t) {
        case 'auth_ok':
          st.authed = true;
          token = String(msg.token ?? '');
          // 注册/登录成功后进入游戏
          ws.send(JSON.stringify({ t: 'join', token }));
          break;
        case 'auth_err':
          st.evs.push(`auth_err:${String(msg.reason ?? '')}`);
          break;
        case 'welcome':
          st.welcomed = true;
          break;
        case 'you': {
          st.youCount++;
          const you = msg as unknown as {
            level: number; xp: number; kills: number; dead: boolean; slots: number;
            inv: unknown[]; x: number; y: number;
          };
          st.level = you.level;
          st.xp = you.xp;
          st.kills = you.kills;
          st.dead = you.dead;
          st.slots = you.slots;
          st.invLen = you.inv.length;
          break;
        }
        case 'snap': {
          st.snapCount++;
          const ents = msg.ents as [string, number, number, number, ...unknown[]][];
          nearestMob = null;
          let bestD = Infinity;
          for (const e of ents) {
            if (e[0] === 'm') {
              st.mobsSeen.add(e[1]);
              const d = Math.hypot(e[2] - selfX, e[3] - selfY);
              if (d < bestD) {
                bestD = d;
                nearestMob = { x: e[2], y: e[3] };
              }
            } else if (e[0] === 'd') {
              st.dropsSeen.add(e[1]);
            } else if (e[0] === 'p' && typeof e[6] === 'string') {
              st.playersSeen.add(e[1]);
              if (e[6] === st.name) {
                selfX = e[2];
                selfY = e[3];
                if (st.lastX !== 0 || st.lastY !== 0) {
                  st.moved += Math.hypot(e[2] - st.lastX, e[3] - st.lastY);
                }
                st.lastX = e[2];
                st.lastY = e[3];
              }
            } else if (e[0] === 'b') {
              st.bulletsSeen++;
            }
          }
          break;
        }
        case 'ev': {
          const k = String(msg.k);
          st.evs.push(k);
          if (k.startsWith('craft')) st.craftReplied = true;
          break;
        }
        case 'pong':
          st.latencyPongs++;
          break;
      }
    });

    // 输入循环:追踪最近的怪物(验证战斗循环),20Hz
    const inputTimer = setInterval(() => {
      if (ws.readyState !== 1) return;
      let dx = 0;
      let dy = 0;
      if (nearestMob) {
        const d = Math.hypot(nearestMob.x - selfX, nearestMob.y - selfY) || 1;
        dx = (nearestMob.x - selfX) / d;
        dy = (nearestMob.y - selfY) / d;
      } else {
        // 没看到怪就往外走
        const d = Math.hypot(selfX, selfY) || 1;
        dx = selfX / d + 0.3;
        dy = selfY / d + 0.3;
      }
      ws.send(JSON.stringify({ t: 'in', x: dx, y: dy }));
      // 每 2 秒一次心跳(与正式客户端一致)
      if (Date.now() % 2000 < 60) {
        ws.send(JSON.stringify({ t: 'ping', ts: Date.now() }));
      }
      // 10 秒后测试一次合成协议(材料不足也应得到失败回复)
      if (!craftTested && Date.now() - startedAt > 10000) {
        craftTested = true;
        ws.send(JSON.stringify({ t: 'craft', id: 'leaf', rarity: 0 }));
      }
    }, 50);

    ws.on('close', () => {
      clearInterval(inputTimer);
      clearTimeout(timeout);
      resolve(st);
    });
  });
}

function check(label: string, ok: boolean, detail = ''): boolean {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  return ok;
}

async function main(): Promise<void> {
  console.log(`[smoke] 目标 ${URL},时长 ${DURATION}s,启动 2 个机器人`);
  const results = await Promise.all([makeBot('bot-甲', 1), makeBot('bot-乙', 2)]);
  let allOk = true;

  for (const st of results) {
    console.log(`\n[${st.name}] 快照 ${st.snapCount} | you ${st.youCount} | 见怪 ${st.mobsSeen.size} | 见掉落 ${st.dropsSeen.size} | 见玩家 ${st.playersSeen.size} | 弹丸 ${st.bulletsSeen} | Lv.${st.level} xp ${st.xp} 击杀 ${st.kills} 背包 ${st.invLen} 槽位 ${st.slots} 移动 ${st.moved.toFixed(0)} 事件 [${st.evs.join(',')}]`);
    allOk = check(`${st.name}: 注册/登录鉴权`, st.authed) && allOk;
    allOk = check(`${st.name}: welcome`, st.welcomed) && allOk;
    allOk = check(`${st.name}: you 状态流`, st.youCount > 10, `${st.youCount} 次`) && allOk;
    allOk = check(`${st.name}: 快照流`, st.snapCount > DURATION * 15, `${st.snapCount} 帧`) && allOk;
    allOk = check(`${st.name}: 怪物已刷新`, st.mobsSeen.size >= 10, `${st.mobsSeen.size} 只`) && allOk;
    allOk = check(`${st.name}: 互相可见`, st.playersSeen.size >= 2, `${st.playersSeen.size} 人`) && allOk;
    allOk = check(`${st.name}: 位置随输入更新`, st.moved > 100, `移动 ${st.moved.toFixed(0)}`) && allOk;
    allOk = check(`${st.name}: 战斗循环(经验/击杀/掉落)`, st.xp > 0 || st.kills > 0 || st.dropsSeen.size > 0, `xp=${st.xp} kills=${st.kills} drops=${st.dropsSeen.size}`) && allOk;
    allOk = check(`${st.name}: 合成协议有响应`, st.craftReplied) && allOk;
    allOk = check(`${st.name}: 心跳 pong`, st.latencyPongs > 0) && allOk;
  }

  console.log(`\n[smoke] ${allOk ? '全部通过' : '存在失败项'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('[smoke] 致命错误:', err);
  process.exit(1);
});
