# glorr 重写契约 v2 · 经验固化 / 全内容还原

> **本文是重写阶段的单一事实来源(SSOT)。** 任何架构、内容、流程决策先对齐本文；与 `context.md` / `README.md` 冲突时，以本文为准（`context.md` 停留在「联机权威服 + 自托管」时代，属历史文档，还原完成后再重写）。
>
> 定稿：2026-11-07 · 维护：梓涵 / 爪爪

---

## 0. 为什么推倒

从「联机全栈 + 社区共创」起步，一路补丁到「纯前端单机 + GitHub Pages」。目标漂移 + 双模拟核心 + 文档失配，导致 11,342 行里出现两套战斗逻辑、三套地图方案、层层叠加的 UI。继续打补丁只会更贵。

**本期目标**：先把 florr 本体**完整还原**（系统边界 + 全内容清单 + 原版手感），**不做任何 glorr 自创改动**；还原验证通过后，再按梓涵的设定逐项加回来。

---

## 1. 血泪教训（每条都对应一次返工，禁止重犯）

| # | 教训 | 翻车现场 | 现在定死 |
|---|------|---------|---------|
| 1 | **运行形态先定死** | 联机 → 放弃公网 → 纯前端单机，反复横跳，服务端/账号/后台全成孤儿 | 纯前端单机；`sim/` 是唯一权威；Pages 静态托管 |
| 2 | **只准一个模拟核心** | `server/room.ts`(1155) + `client/localSim.ts`(1026) 两套战斗/掉落/合成，改一处漏一处 | 只有 `florr/sim/`；联机若回来，走「同一 sim + 网络同步层」，不复制逻辑 |
| 3 | **地图只用一套几何抽象** | 方形障碍 → wiki 烘焙 233×233 硬网格 → 程序化解析几何，三次推翻，每次都重做碰撞/刷怪/渲染 | 几何与碰撞统一在 `sim/geometry.ts`；渲染只读它，不自带第二套判定 |
| 4 | **文档与代码同源** | `context.md`/`README.md` 仍写「30Hz 权威服务端、三命名服务器、Docker 自托管、死亡全掉」，与实际完全相反 | 改架构先改本文；代码合入时同步更新「系统状态表」 |
| 5 | **先确认版本再照抄** | 曾按 `static.florr.io`（旧版）还原，被指出要做新版 | 一律以 `florrio.wiki.gg` 新版 + 现代实机录屏/截图为准 |
| 6 | **内容必须数据驱动** | 每加一个花瓣/怪物就往逻辑里塞分支 | 新增内容 = 加一行数据；机制靠 `tags` 标签解释器，禁止 `if (id === 'xxx')` 散落 |
| 7 | **表现层不掺规则** | 渲染里算伤害、UI 里存状态 | `data ← sim ← view/ui ← main` 单向依赖；`view/` 只读状态 |
| 8 | **每改必验、每改必推** | 曾出现栈溢出绿屏、白屏 404、资源 404 | `typecheck → build:pages → solo-check(无头) → deploy` 四步全过才算完成 |
| 9 | **部署只能走 Git Data API** | `github.com` 直连超时；git 走透明代理对 github.com 隧道 502 | `scripts/deploy.ts`：curl 走代理 → `api.github.com` Git Data API；`.pat` 存 token（已 gitignore） |
| 10 | **视觉验收要看实物** | 用 3840→1500 缩略图判读，误判「没有浪花/裂纹」 | 整图 + **原生分辨率裁剪**双图核对再下结论 |
| 11 | **不确定的数值不瞎编** | 曾给自创花瓣编数值，与 wiki 对不上 | 数据行标 `src: 'wiki' | 'est'`；`est` 为占位待校准，不冒充实测 |

---

## 2. 必须复用的资产（已验证正确，禁止重敲）

| 资产 | 规模 | 内容 | 处理 |
|------|------|------|------|
| `sprites.ts` | 1102 行 | 矢量美术：`drawPetal/drawFlower/drawBar/drawDirectionArrow/drawMob/drawPetalIcon/drawTalentBadge/PETAL_EN` | 整体迁移 `florr/view/sprites.ts` |
| `style.css` | 1131 行 | florr 复刻皮肤：头像+名字条+经验条、稀有度方块槽、四功能键、转速盘、fmodal 面板 | 整体迁移 `florr/style.css` |
| `constants.ts` | 153 行 | 10 级稀有度配色、3^i 缩放、合成率 64→0.1%、槽位 `min(5+r,10)`、掉落资格、生物血量倍率（wiki 考据） | 迁 `florr/data/rules.ts` |
| `data/petals.ts` `data/mobs.ts` | 141 / 72 行 | 17 花瓣 + 11 生物**已考据数值** | 保留为 `VERIFIED` 覆盖表，其余全量清单用 `est` 占位 |
| `gardenRender.ts` | 389 行 | 程序化花园底图：湖泊深浅/浪花/泡沫、圆石裂纹、草斑、花丛、灌木 | 迁 `florr/view/garden.ts`，作为 Garden 区域底图 |
| `audio/particles/camera/math/input/minimap/menu` | ~500 行 | 已验证稳定，无规则耦合 | 原样迁移 |
| `scripts/solo-check.ts` | 26 项断言 | 无头 Chrome 端到端（含姿态/死亡不掉落/地图/面板） | 保留，作为回归闸门 |
| `scripts/deploy.ts` | 90 行 | Git Data API 一键构建+推送 | 保留 |

---

## 3. 明确废弃（本轮不迁移，旧 `src/` 留到最后删）

- `src/server/*`：联机权威层（room/accounts/db/index）、`net.ts` 的 `Net` 实现 → 与「单一模拟核心」冲突。
- `account/*`、`admin/*`：glorr 自创账号 / GitHub 存档 / 管理后台 → 属「还原之后再改」范畴，还原阶段归零。
- 自研天赋树、`Z/X/C` 主动技、**死亡不掉落**、程序化中央湖地图 → 均为定制项；还原阶段按原版归零，验证后再按梓涵设定加回。
- `gardenGrid.ts` / `mazeImage.ts` / `garden.png`：上轮已删，不再复活。

---

## 4. 架构（`florr/` 为唯一源码根）

```
florr/
├── index.html · style.css · main.ts        # 入口 / 皮肤 / 薄装配层
├── data/        # 【纯数据，零逻辑】
│   ├── rules.ts      稀有度/缩放/合成/槽位/掉落/经验
│   ├── petals.ts     ~119 种花瓣全量清单 + VERIFIED 覆盖
│   ├── mobs.ts       ~70 种生物全量清单 + VERIFIED 覆盖
│   ├── areas.ts      7 区域 + 5 地下城 + 分区刷怪表
│   └── talents.ts    天赋
├── sim/         # 【唯一权威模拟，零 DOM】
│   ├── geometry.ts   世界几何 + 碰撞（唯一真相）
│   ├── types.ts · math.ts · conn.ts(只读状态接口 GameConn)
│   └── sim.ts        tick: 输入/移动/花瓣/战斗/AI/掉落/拾取/装备/合成/升级
├── view/        # 【只读状态作画】
│   ├── sprites.ts · garden.ts · renderer.ts · minimap.ts
│   └── camera.ts · particles.ts · audio.ts
├── ui/          # 【只读状态 + 只发意图】
│   └── hud.ts · inventory.ts · craft.ts · bestiary.ts · talents.ts
└── input.ts     # 鼠标/键盘/姿态
```

**依赖方向严格单向**：`data ← sim ← {view, ui} ← main`。`sim` 不 import `view/ui`，`view` 不写状态。

---

## 5. 原版系统全清单（wiki 考据 2026-11-07）

| 系统 | 原版内容 | 还原状态 |
|------|---------|---------|
| 稀有度 | 10 级：Common→Unusual→Rare→Epic→Legendary→Mythic→Ultra→Super→Eternal/Unique；属性 3^i | ✅ 数据齐 |
| 花瓣 | 约 119 种；官方分 6 类：Multihit / Singlehit / Ranged / Summoner / Healing / Tanking | 🟡 全量清单已录入，机制逐项补 |
| 生物 | 约 70 种（蚂蚁系/蜂系/甲虫系/蜈蚣系/沙漠系/海洋系/Hel 系/Mecha 系） | 🟡 全量清单已录入，数值待校准 |
| 区域 | Garden / Desert / Ocean / Jungle / Hel / Crystal Room；地下城 Ant Hell / Sewers / Factory / Pyramid / Rift | 🟡 结构已建，Garden 可玩 |
| 特殊 NPC | Trader（沙漠）、Target Dummy（丛林）、Oracle（海洋）、Titan（丛林，锻唯一） | ⬜ 待做 |
| 槽位 | `min(5 + 最高稀有度等级, 10)` | ✅ |
| 合成 | 5 合 1，成功率 64/32/16/8/4/2/1/0.1%，失败损失 1-4 | ✅ |
| 唯一花瓣 | 不可合成，Titan 锻造（耗 5 Super） | ⬜ 待做 |
| 掉落资格 | 伤害占比 ≥15% 且前 4；Super 以上放宽 1% / 前 25 | ✅（单机退化为可直接拾取） |
| 掉落存续 | 按稀有度 30s→210s，Super 以上不消失 | ✅ |
| 花瓣耐久 | 归零 → 破碎 → 冷却 → 满耐久再生（不永久消失） | ✅ |
| 姿态 | 左键/空格张开攻击、右键/Shift 收拢防御、松开常态 | ✅ |
| 死亡 | 原版各版本有差异；还原阶段按 wiki 现行规则 | ⬜ 待校准 |
| 等级/天赋 | 击杀得 XP，升级给天赋点 | 🟡 |
| PvP / 血祭 | 部分区域可攻击玩家；血祭来自 PvP 裂隙 | ⬜ 待做 |
| 商人 / 币 | Trader 花瓣换同稀有度 Coin | ⬜ 待做 |

---

## 6. 全内容数据层约定

- `PETALS` / `MOBS` 为**全量清单**：名字、分类、机制标签、所属区域一律齐备。
- 数值字段带 `src` 标记：`'wiki'` = 已考据（现有 17 花瓣 / 11 生物原样迁入），`'est'` = 按角色给的占位默认值，**不是实测**，禁止当作平衡依据。
- 机制靠 `tags` 驱动（如 `ranged` `poison` `split` `summon` `heal` `armor` `knockback` `mana`），解释器在 `sim/` 集中实现；新增花瓣只加数据行。

---

## 7. 阶段路线（每阶段都要能跑、能推）

| 阶段 | 内容 | 验收 |
|------|------|------|
| **A 骨架（本轮）** | 经验契约 + `florr/` 分层 + 全量数据表 + 单一 sim + 复用美术/UI + 切构建 | `typecheck`/`build`/`solo-check` 全过；Pages 能进游戏；已推 |
| **B 机制** | 按 tags 实现 119 花瓣机制、70 生物 AI、天赋、死亡规则 | 图鉴中每个花瓣都能装备并产生该机制效果 |
| **C 地图** | 7 区域 + 5 地下城几何/刷怪/传送、4 NPC、锻造、PvP | 可从 Garden 一路推进到 Hel |
| **D 再改** | 按梓涵设定加回 glorr 定制（死亡不掉落、账号存档、自研天赋等） | 逐项确认，避免又堆补丁 |

---

## 8. 协作约定

1. **每次改动都推**：`npm run deploy`（构建 + Git Data API 提交 + Pages 生效验证）。
2. 改动先过四步闸门：`typecheck → build:pages → solo-check → deploy`；不过不算完成。
3. 不确定的机制/数值：标 `est` 或 `⬜ 待校准`，去 wiki/实机核实后再改，不凭印象写。
4. **旧 `src/` 保留到 A 阶段线上验证通过后再删**，删之前不改动它（避免边拆边塌）。

---

## 9. 修订记录

| 日期 | 改动 |
|------|------|
| 2026-11-07 | v2 初稿：经验契约、资产复用清单、全内容清单、分层架构、阶段路线 |
