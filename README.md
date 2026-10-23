# glorr

**开源社区共创的 Florr 式多人实时花瓣对战游戏。**

> glorr 是一款受 [florr.io](https://florr.io) 核心玩法启发的**非官方社区作品**。你扮演一朵花,花瓣自动旋转发射当武器;击杀生物掉落花瓣,装配成 build,从花园安全区一路打向高危险外环。代码与美术资产均为原创,与 florr.io 官方无任何关联。

设计总纲见 [context.md](./context.md)。

## 特性

- **完整核心循环**:杀怪 → 掉花瓣 → 装配/合成 → 升级 → 挑战更高难度区域
- **忠实数值体系**:10 级稀有度、属性 3×/级、5 合 1 合成(成功率 64% → 0.1%)、槽位 `min(5+最高稀有度, 10)`
- **掉落资格规则**:伤害占比 ≥15% 且前 4 名才可拾取(超级怪 1%/前 25)
- **账号系统**:注册/登录(scrypt 加密)、名称创建后不可变、等级/击杀/花瓣全部持久化,换设备登录即继承;死亡全掉
- **三个命名服务器**:设置面板内切换 Scarlet / Youse / Huaduo(默认按 URL `?room=` 分出三个房间)
- **管理后台**:独立页面 `/admin`(可配独立端口),服务器开关、房间管理、账号管理、全服广播
- **权威服务端**:30Hz 定步长模拟,客户端移动预测 + 实体插值
- **内容**:11 种花瓣 × 8 种生物 × 9 环花园地图,C5 起开放 PvP
- **手感细节**:鼠标移动控制、花瓣装填缩回动画、受击闪白、击退、蛛网减速、复活无敌
- **可自托管**:Docker Compose 一键起私服

## 快速开始

```bash
npm install

# 开发模式(客户端 5173 热更 + 服务端 8080,自动代理 WebSocket)
npm run dev
# 打开 http://localhost:5173

# 生产模式(构建后单端口托管,打开即玩)
npm run build
npm start
# 打开 http://localhost:8080
```

首次进入需要**注册账号**(名称 2-12 位,注册后不可修改;密码至少 4 位)。第一个注册的账号自动成为管理员。

### 操作

| 输入 | 作用 |
|---|---|
| 鼠标移动 | 花朵朝光标方向移动(死区 14px) |
| WASD / 方向键 | 辅助移动 |
| 花瓣 | 自动旋转,近战接触伤害,远程沿朝向发射 |
| 数字键 1-9 / 0 | 快速装备背包热键栏对应花瓣 |
| ENTER | 打开聊天框;聊天中回车发送、ESC 取消 |
| 拖拽 | 背包花瓣 → 装备槽;拖到地图世界 = 丢弃;拖动已装备花瓣 = 卸下 |
| 设置(齿轮) | 切换服务器(Scarlet/Youse/Huaduo)、音效开关 |
| 合成(锤子) | 5 个同种同稀有度 → 1 个高一级 |

界面流程:加载屏 → 登录/注册 → 主菜单(准备就绪 → 选「花园」进入)。

## 架构

```
src/
├── shared/            # 客户端/服务端共用(无环境依赖)
│   ├── constants.ts   # 稀有度/缩放曲线/合成率/地图分区/掉落规则
│   ├── servers.ts     # 三个命名服务器配置(改这里即可换部署地址)
│   ├── math.ts        # 数学工具
│   ├── protocol.ts    # WebSocket 消息类型
│   └── data/          # 内容数据(花瓣图鉴/生物图鉴)
├── server/            # 权威服务端(Node + ws)
│   ├── index.ts       # HTTP 静态托管 + WS 网关(注册/登录/分房)+ 管理 API
│   ├── accounts.ts    # 账号存储(JSON + scrypt + token)
│   └── room.ts        # 30Hz 房间模拟:AI/战斗/掉落/合成/广播
└── client/            # 浏览器客户端(TS + Canvas 2D,零运行时框架)
    ├── index.html     # 游玩端入口
    ├── admin/         # 管理后台入口(独立页面 /admin)
    ├── main.ts        # 总装:账号流程/预测/输入/循环
    ├── net.ts         # 连接/快照缓冲/插值
    ├── render.ts      # 世界渲染
    ├── sprites.ts     # 矢量美术(花瓣/生物/花朵)
    └── ui.ts          # HUD/背包/合成/拖拽/设置
```

数据流:客户端 20Hz 上报输入方向 → 服务端 30Hz 权威模拟 → 30Hz 兴趣管理快照(半径 2600)→ 客户端插值渲染;自身移动本地预测、误差平滑修正。

## 账号与服务器

- 账号数据保存在服务端 `data/accounts.json`(已 gitignore),断线/重启不丢;死亡会掉光随身花瓣并同步存档
- 三个命名服务器默认指向本机 8080 的三个房间(`?room=scarlet|youse|huaduo`);部署到公网后修改 `src/shared/servers.ts` 里的三个 `url` 即可(所有客户端共用)
- token 按服务器分别保存在浏览器 localStorage,换服务器自动切换账号会话

## 管理后台

```
http://localhost:8080/admin        # 与游玩端同机不同路径
ADMIN_PORT=8081 npm start          # 或启用独立端口,与游玩端完全分离
```

功能:维护模式开关(拒绝新连接)、房间列表与开关、全服广播、账号管理(搜索/封禁/解封/重置密码/改等级/授予撤销管理员/删除)、实时统计(在线/房间/账号/运行时间)与操作日志。管理员账号在管理后台登录(需账号具有管理员权限)。

在无法使用 WebSocket 的环境(如上面的公网演示链接)里,游戏内注册通道不可用,可改用 HTTP 接口引导首个管理员:

```bash
curl -X POST https://<你的域名>/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"admin","password":"your-password"}'
# 返回的 token 即登录态;首个注册账号自动成为管理员
```

## 在线体验

| 链接 | 说明 |
|---|---|
| https://glorr-petal-game.app.workbuddy.host/?sharecode=TR4PI2EHIV | 公网演示(UI + 管理后台;**网关不支持 WebSocket,不能实时联机**) |
| https://apple-Pc.github.io/glorr/ | GitHub Pages(静态客户端,同样需要可联机的服务器) |
| 本机 `npm start` → http://localhost:8080 | **完整体验**(默认三个服务器指向本机三房间) |

> 想公开可玩:把服务端部署到支持 WebSocket 的平台(见下),再把 `src/shared/servers.ts` 里三个 `url` 改成你的域名(如 `wss://glorr.example.com/?room=scarlet`),重新 `npm run build:pages` 推送即可。

## 部署

### GitHub Pages(客户端站点)

仓库已开启 Pages(`main` 分支 `/docs` 目录源),站点地址:

```
https://apple-PC.github.io/glorr/
```

更新站点只需重新构建并提交 `docs/`:

```bash
npm run build:pages   # = vite build --base ./ --outDir docs
git add docs && git commit -m "chore: rebuild pages" && git push
```

> 注意:Pages 只托管静态客户端,**联机需要单独的游戏服务端**。默认三个服务器指向 localhost,公网部署后请改 `src/shared/servers.ts`。

### 游戏服务端(公网,可联机)

**Render**(仓库根已带 `render.yaml`,New Blueprint 一键创建;免费档休眠约 50s 冷启动):

```bash
# 或在 Render 面板用 render.yaml 创建;部署后:
# https://<你的服务名>.onrender.com/?room=scarlet
```

**Fly.io**(仓库根已带 `fly.toml`):

```bash
fly auth login && fly launch --no-deploy && fly deploy
```

**任意 VPS / Docker Compose**(推荐,数据持久):

```bash
docker compose up -d          # 监听 8080,HTTP + WebSocket 同端口
# 或直接运行
npm ci --omit=dev && npm run build:client
PORT=8080 npm start
```

部署到公网后需支持 WebSocket(建议 wss 反代);修改 `src/shared/servers.ts` 的三个 url 指向新域名即可全站生效。注意:免费沙箱类平台磁盘不持久,`data/accounts.json` 可能在重启/重新部署后重置,正式运营建议挂持久卷或改用 SQLite/外部数据库。

## 测试

```bash
npm run typecheck      # 全量类型检查
npm start &            # 先起服务端
npm run smoke          # 机器人冒烟:注册/鉴权/战斗/掉落/合成/心跳(20 项)
npx tsx scripts/persist-admin-check.ts   # 账号持久化 + 管理 API(14 项)
```

## 内容扩展(社区共创入口)

新增一种花瓣只需在 `src/shared/data/petals.ts` 加一条数据;新增生物改 `src/shared/data/mobs.ts`;调难度改 `src/shared/constants.ts` 的 `RINGS`。数值全部走稀有度缩放曲线,无需改逻辑。欢迎 PR。

## 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 原型 | 花园地图 + 基础花瓣/生物 + 单机可玩 | ✅ |
| M1 可联机 | 权威服务端 + 房间 + 掉落/合成/槽位成长 + 账号系统 + 管理后台 | ✅ |
| M2 有深度 | 天赋树 + 完整稀有度链 + PvP 深化 + 第二张地图 | 进行中 |
| M3 社区版 | Docker 自托管 + 内容数据管线 + 投票机制 + 观战 | 规划中 |

## 技术栈

TypeScript(全量 strict)· Node 22 + ws · Canvas 2D · Vite · Docker。账号存储为 JSON 文件,无外部数据库依赖。

## 免责声明

本项目为学习交流性质的开源粉丝作品,致敬 florr.io 的玩法设计。所有代码、美术、音效均为原创,未使用任何官方资产;项目与 florr.io 官方无从属关系,也不会以任何形式商用官方素材。

## License

MIT
