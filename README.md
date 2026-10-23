# glorr

**开源社区共创的 Florr 式多人实时花瓣对战游戏。**

> glorr 是一款受 [florr.io](https://florr.io) 核心玩法启发的**非官方社区作品**。你扮演一朵花,花瓣自动旋转发射当武器;击杀生物掉落花瓣,装配成 build,从花园安全区一路打向高危险外环。代码与美术资产均为原创,与 florr.io 官方无任何关联。

设计总纲见 [context.md](./context.md)。

## 特性

- **完整核心循环**:杀怪 → 掉花瓣 → 装配/合成 → 升级 → 挑战更高难度区域
- **忠实数值体系**:10 级稀有度(普通→永恒/唯一)、属性 3×/级、5 合 1 合成(成功率 64% → 0.1%)、槽位 `min(5+最高稀有度, 10)`
- **掉落资格规则**:伤害占比 ≥15% 且前 4 名才可拾取(超级怪 1%/前 25)
- **权威服务端**:30Hz 定步长模拟,客户端移动预测 + 实体插值
- **内容**:11 种花瓣 × 8 种生物 × 9 环花园地图(C0 安全区 → C9 高危),C5 起开放 PvP
- **手感细节**:鼠标移动控制、花瓣装填缩回动画、受击闪白、击退、蛛网减速、死亡全掉、复活无敌
- **数据驱动**:花瓣/生物/地图全部是结构化数据,新增内容只改数据文件
- **可自托管**:Docker Compose 一键起私服,房主自定难度

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

### 操作

| 输入 | 作用 |
|---|---|
| 鼠标移动 | 花朵朝光标方向移动(死区 14px) |
| WASD / 方向键 | 辅助移动 |
| 花瓣 | 自动旋转,近战接触伤害,远程沿朝向发射 |
| Tab | 打开/关闭背包 |
| 拖拽 | 背包花瓣 → 底部槽位装备;拖出面板丢弃;右键快速丢弃 |
| 背包格间拖拽 | 整理背包 |
| 合成按钮 | 5 个同种同稀有度 → 1 个高一级 |

### 本地冒烟测试

```bash
npm start &          # 先起服务端
npm run smoke        # 2 个无头机器人验证协议/刷怪/战斗/掉落/合成/心跳
```

## 架构

```
src/
├── shared/            # 客户端/服务端共用(无环境依赖)
│   ├── constants.ts   # 稀有度/缩放曲线/合成率/地图分区/掉落规则
│   ├── math.ts        # 数学工具
│   ├── protocol.ts    # WebSocket 消息类型
│   └── data/          # 内容数据(花瓣图鉴/生物图鉴)
├── server/            # 权威服务端(Node + ws)
│   ├── index.ts       # HTTP 静态托管 + WS 升级
│   └── room.ts        # 30Hz 房间模拟:AI/战斗/掉落/合成/广播
└── client/            # 浏览器客户端(TS + Canvas 2D,零运行时框架)
    ├── main.ts        # 总装:预测/输入/循环
    ├── net.ts         # 连接/快照缓冲/插值
    ├── render.ts      # 世界渲染
    ├── sprites.ts     # 矢量美术(花瓣/生物/花朵)
    ├── ui.ts          # HUD/背包/合成/拖拽
    └── ...
```

数据流:客户端 20Hz 上报输入方向 → 服务端 30Hz 权威模拟 → 30Hz 兴趣管理快照(半径 2600)→ 客户端插值渲染;自身移动本地预测、误差平滑修正。

## 部署

### 1. GitHub Pages(客户端站点)

仓库已开启 Pages(`main` 分支 `/docs` 目录源),站点地址:

```
https://apple-PC.github.io/glorr/
```

更新站点只需重新构建并提交 `docs/`:

```bash
npm run build:pages   # = vite build --outDir docs
git add docs && git commit -m "chore: rebuild pages" && git push
```

> 注意:Pages 只托管静态客户端,**联机需要单独的游戏服务端**。页面开始界面填写服务器地址即可,也可用 `?server=wss://你的域名` 参数预设。

### 2. 游戏服务端(公网)

```bash
# Docker Compose(推荐)
docker compose up -d          # 监听 8080,HTTP + WebSocket 同端口

# 或直接运行
npm ci --omit=dev && npm run build:client
PORT=8080 npm start
```

部署到 Render / Railway / Fly.io / 任意 VPS 均可(需支持 WebSocket,公网建议套 wss 反代)。服务端无状态依赖,M1 阶段房间数据全在内存,重启即新局。

## 内容扩展(社区共创入口)

新增一种花瓣只需在 `src/shared/data/petals.ts` 加一条数据;新增生物改 `src/shared/data/mobs.ts`;调难度改 `src/shared/constants.ts` 的 `RINGS`。数值全部走稀有度缩放曲线,无需改逻辑。欢迎 PR。

## 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 原型 | 花园地图 + 基础花瓣/生物 + 单机可玩 | ✅ |
| M1 可联机 | 权威服务端 + 房间 + 掉落/合成/槽位成长 | ✅ |
| M2 有深度 | 天赋树 + 完整稀有度链 + PvP 区域 + 第二张地图 | 进行中 |
| M3 社区版 | Docker 自托管 + 内容数据管线 + 投票机制 + 观战 | 规划中 |

## 技术栈

TypeScript(全量 strict)· Node 22 + ws · Canvas 2D · Vite · Docker。无数据库、无外链资源。

## 免责声明

本项目为学习交流性质的开源粉丝作品,致敬 florr.io 的玩法设计。所有代码、美术、音效均为原创,未使用任何官方资产;项目与 florr.io 官方无从属关系,也不会以任何形式商用官方素材。

## License

MIT
