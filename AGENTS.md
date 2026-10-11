# AGENTS.md —— 《像素篮球梦之队》仓库协作约定

作用域：本目录树（`E:\codex\像素篮球梦之队`）下的全部文件。
与本文件冲突时，优先级为：**用户当次指令 > 提示词文档 > 本文件**。

---

## 1. 权威来源与裁决顺序

- 需求唯一权威：《像素篮球梦之队 · AI 开发提示词 v3.1 像素风版》（`C:\Users\14760\Desktop\提示词_像素风版.docx`，纯文本副本在 `E:\codex\work\docx_px_1\prompt.txt`）。
- 文档章节冲突时的裁决顺序（文档附录原文）：**第三章合规 > 第五章数据映射/薪资 > 第十一章技术约束 > 其余设计章节**。
- 本仓对文档矛盾处做的标定全部记录在 `config.js` 的行内注释，以及 `E:\codex\docs\像素篮球梦之队\2026-10-08-调研与实现计划.md`「数值裁决记录」。**改数值前先读那两处，不要凭直觉推翻标定。**

## 2. 三条红线（碰了就是 bug）

1. **合规红线（第三章）**
   - 任何界面/文案**不得声称数值来自 NBA 官方、2K 或任何商业数据源**，统一口径「梦之队原创球探报告」（`config.compliance.dataSourceLabel`）。
   - 代码与素材**不得出现真实联赛 / 球队商标与 Logo 图像**；球队只能以城市缩写文字出现（`data/teams.js`）。
   - **运行时代码零外链 URL**（不引外部图片、字体、JSON、API）。`tools/verify.mjs` F 组会扫全仓抓外链，加了就红。
   - 立绘缺失必须自动回退 CSS 像素占位图，**任何界面不得破图或空白**（`components/px-portrait`）。
   - `config.compliance.fictionalMode = true` 时全员显示风格化化名，这条通道必须一直可用。
2. **零依赖红线（第十一章）**
   - 原生 WXML / WXSS / JS / JSON，**不引入 Cocos / Laya / Vue / React / Vant / TDesign 等任何运行时依赖**，不建 `package.json`、不装 `node_modules`。
   - `tools/*.mjs` 只能用 Node 内置模块（`node:fs` / `node:path` / `node:zlib` / `node:module` / `node:url`）。`gen-assets.mjs` 自己手写 PNG 编码就是这个原因。
   - 调研得来的开源项目**只借鉴思路，不抄代码、不引包**（详见调研文档）。
3. **可复现红线（第七 / 十二章）**
   - `utils/battle.js`、`utils/prd.js` 里**禁止出现 `Math.random()` 和 `Date.now()`**；所有随机必须由调用方注入 seed，走 `utils/rng.js`。
   - 时间戳只能由 `store/commands.js` / 页面层传入，`utils/` 保持纯函数——这是整套逻辑能在 Node 里回归测试的前提。

## 3. 分层职责（单一出口，别越层）

| 层 | 职责 | 硬约束 |
|---|---|---|
| `config.js` | 全部数值 / 概率 / 规则常量 / 调色板 / 合规开关 | **数值只允许改这里**，其他文件不得散落硬编码 |
| `data/*.js` | 演示数据（球队 / 球员 / 战术 / 解说 / 道具 / 关卡 / 羁绊 / 天梯 / 时刻卡 / 竞技商城 / 交易市场 / 王朝赛季 / 每日任务） | 只描述「是什么」，不写业务逻辑；青训卡与天梯对手都用固定数据确定性构造 |
| `utils/*.js` | 纯函数算法（rng / ovr / radar / growth / bond / moment / prd / battle / arena / evolution / market / dynasty / daily / format / storage） | 不读存档、不碰 `wx`（`storage.js` 除外，且需 Node 降级）、不引随机、**不取系统时间**（`dayKey` 由 commands 传 `now` 进来） |
| `store/reducers.js` | 全部业务规则（够不够钱、能不能升星、超不超帽） | 纯函数，同输入同输出 |
| `store/commands.js` | 有副作用的编排（取时间、生成 seed、连续 dispatch、返回结果对象） | 页面**只调 commands**，不自己 dispatch 组合拳 |
| `store/selectors.js` | 派生视图（`rosterView` / `pityView` / `stageView` / `bagView` / `stageScout` / `arenaView` / `arenaSummary` / `bondCatalog` / `momentView` / `momentCatalog` / `evolutionView` / `marketView` / `dynastyView` / `dailyView` / `diamondShopView` / `shopView` …） | 页面**只读 selectors**，绝不自己算数字 |
| `pages/*` `components/*` | 渲染 + 交互 | 不放业务规则、不放全局变量 |

状态管理：**禁止页面间乱传全局变量**（第十一章）。`app.js` 的 `globalData` 只放 `systemInfo` 这类环境信息，业务状态一律走 Store。

## 4. 页面 / 组件写法约定

```js
// 页面模板：mapState 第二个参数是页面实例，可以读到页面本地筛选态
Page(store.connectPage(function (state, self) {
  return { list: selectors.someView(state, self.data.filter) };
}, {
  onFilter(e) {
    this.setData({ filter: e.detail.value }); // 本地态
    this.resync();                            // 等价 this.__syncStore()，重新跑 mapState
  }
}));
```

- **WXML 不支持方法调用与复杂表达式**：`{{ isOk(a) }}`、三元嵌套、字符串拼接都容易踩坑。所有布尔判断、拼接文案、预计算数组**必须在 `.js` 里算好**再丢给 `setData`（`pages/detail/detail.js` 的弹层布尔预计算就是这个原因）。
- **WXSS 不能引用本地 `url()`**（小程序限制，只有网络图或 base64 可用）。所以像素 9-slice 边框一律用 `box-shadow` 多点描边实现，见 `app.wxss` 的 `.px-panel` / `.px-btn`。
- 自定义标签必须在同名 `.json` 的 `usingComponents` 里声明；`verify.mjs` G 组会校验「声明可解析 / 标签已声明 / 事件处理函数存在 / 组件无孤儿」。
- 组件四件套（`.js` / `.json` / `.wxml` / `.wxss`）缺一不可，即使 `.wxss` 只有一行注释。
- **`verify.mjs` K 组会把每个页面在 Node 里真挂载一遍**（打桩 `Page` / `wx` / `getCurrentPages`，跑 `onLoad` 与 mapState，比赛页还会驱动到结算）。所以：mapState 里引用未定义变量 = 整页白屏 = K 组红；WXML 里写了一个 `.js` 没提供的字段（拼错）也会红。新增页面字段时，**`data` 默认值与 mapState 返回要同时补**，别只补一边。

## 5. 像素风规范（第六章）

- 调色板：只用 `config.palette` 里的 16 色（深藏蓝底 + 活力橙 / 金点缀），单图 ≤32 色，**禁渐变**，过渡用抖动（dithering）。
- 位图：`image-rendering: pixelated`；立绘 64×64 原生绘制（肤色 / 发型 / 发色 / 胡须 / 发带墨镜 / 体型 6 项特征表见 `tools/portraits-spec.mjs`，139 位球员手工特征 + 青训哈希兜底，改完跑 `node tools/gen-assets.mjs --portraits-only`）；Tab 图标 16×16 → 80×80 整数倍输出。
- 动画：抽卡翻牌 / 进球反馈 / UI 反馈一律用 `steps()` 逐帧位移或抖动，**禁用 3D 透视旋转、禁用平滑缓动**。
- 字体：`config.art.fontStack` = `"Press Start 2P", "Zpix", "FZPXJW", "Courier New", monospace`。想启用真像素中文字体，把 `Zpix.ttf` 放进 `assets/fonts/` 再填 `config.art.localFontPath`（该目录已 gitignore、已从打包排除）。
- 字号：正文不小于 24rpx；比分与 OVR 用大号像素粗体。适配基准 375×667。
- 新素材走 `node tools/gen-assets.mjs` 程序生成，**不要塞网图 / AI 图进 `assets/`**（第三章占位素材要求）。

## 6. 提交前必跑

```bash
node tools/verify.mjs                      # 必须 PASS 205 / FAIL 0（A~R 共 18 组）
node tools/replay-battle.mjs --all --all-arena  # 必须「全部通过：比赛结算可复现」（18 关 + 12 位天梯对手，各 7 项 = 210 项）
```

改了 `data/players.js`（增删卡）后还要补跑 `node tools/gen-assets.mjs --portraits-only`，否则 F 组「所有立绘 PNG 存在」会红。
退出码即失败数，可直接接 CI。**不要为了让脚本变绿而删断言**；确属断言过期，先改 `config.js` / 文档口径再改断言，并在提交说明里写清理由。

## 7. 本机环境注意（Windows / PowerShell）

- **`apply_patch` 在本环境不可用**（会被当 PowerShell 命令解析报错）。写文件用：
  `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))`
  配合**单引号 here-string** `@'...'@`（保留 `$` 与反引号原样、无 BOM）。
- 全仓文本统一 **LF 换行、UTF-8 无 BOM**。用 PowerShell 的 `.Replace()` 做多行匹配前，**必须先把文件 CRLF → LF 归一化**，否则匹配不到。
- `Remove-Item -Recurse` 被本机策略拦截；删文件用 `[System.IO.File]::Delete($path)`。
- 一次性脚本 / 探针 / 草稿一律放 `E:\codex\work\`，**不要留在仓库里**（`tools/_fix*.js`、`_probe*` 这类临时文件必须删干净）。
- 需要保留给用户的文档写进 `E:\codex\docs\像素篮球梦之队\`；仓库自带的 `README.md` / `AGENTS.md` 留在仓库内，不外移、不重命名。
- **提交与推送**：本仓已脱离「无 commit 状态」—— 2026-10-11 在 `main` 建立首次提交 `c646fab` 并推送 GitHub（`mysterious1014/pixel-basketball-dream-team`）。**交付收尾（或用户点名）才提交推送，平时不随手 commit**；流程：`node tools/verify.mjs` + `node tools/replay-battle.mjs --all --all-arena` 全绿 → `git commit` → `git push` → 线上校验留证据（远端 SHA == HEAD、raw 文件逐字节比对）；**force-push / 重写历史 / 删除远端分支等破坏性动作先问用户**。
- **本机没有系统级 git**，只有 Codex 运行时自带的一套；其 `git-credential-manager.exe` 图形授权不可用（不弹窗，连 `--version` 都挂起，别在它身上干等）。本仓推送凭据已配置为 `credential.helper = store --file=E:/codex/.secrets/pixel-basketball-dream-team-git-credentials`（明文只在 `.secrets`，不进 Git / 回复 / 文档）；凭据失效时走 GitHub 设备码流程重新授权（浏览器打开 `https://github.com/login/device` 输入代码，账号里显示为「GitHub CLI」应用）。
- 密钥 / 明文 token 绝不进 Git、绝不出现在回复或文档里，只写文件路径。

## 8. 常见改动指引

- **加一张球员卡**：`data/players.js` 手写条目（19 项属性齐全，取值 25–99）→ `node tools/gen-assets.mjs --portraits-only` → `node tools/verify.mjs`。OVR / 稀有度 / 薪资由 `utils/ovr.js` 推导，**不要手写这三个字段**。
- **加一关 PVE**：`data/stages.js` 追加（对手阵容必须能用现有卡构建，F 组会校验）→ 视情况调 `config.season`。
- **加装备 / 消耗品**：`data/items.js`；`bonus` 的键必须是 `config.attrs.keys` 里的合法属性名（F 组会校验）。
- **加解说模板**：`data/commentary.js`，用 `{player}` / `{team}` 之类占位符经 `fill()` 渲染；文档要求 50+，当前 117 条（含克制专属的 `counterAttack` / `counterDefend` 各 5 条、竞技场专属 37 条）。**注意别写出 `第第1节节` 这类拼接重复**（历史上踩过，已修；M 组第 10 条会扫）。
- **加一类竞技场解说**：在 `data/commentary.js` 加一个 `arenaXxx` 数组 + `ARENA_MIX` 里加一行映射，`utils/battle.js` 一行都不用动。**只能扩候选池，禁止用「先 rng.chance() 决定用哪套文案」的方式混入** —— 那会多消耗一个随机数，把之后每一回合的掷骰全部推移，PVE 与竞技场的可复现基线一起报废（M 组第 9 条锁死「同 seed 下 mode 只换文案不换数值」）。混合比例 = 专属条数 / 合并后总条数，想调浓淡就增减条数。
- **调抽卡手感**：改 `config.gacha.pools.*.rates` 或 `config.gacha.prd.inc`，然后跑 `verify.mjs` C 组；概率公示页读的是 `utils/prd.js` 的 `publicRates()`，会自动跟着变。
- **调比赛节奏**：改 `config.battle.roundsPerQuarter`（口径 = 每队每节）→ 跑 `replay-battle.mjs --all` 确认 18 关仍可复现且比分区间合理。
- **调战术克制**：克制环在 `data/tactics.js`（`TACTICS[].counter/beatenBy` 与 `DEFENSES[].counters/counteredBy` 是同一张表的两个视角，**改一边必须改另一边**，I 组第 1 条会抓）；强度在 `config.battle.counter`。
  - `bonus = 0.1` 与 `tacticWeightMul = 1` 都有实验背书（`E:\codex\work\px_bal_matrix2.mjs` 等）：`tacticWeightMul > 1` 会让打法差距从 ±3 分拉到 ±14 分，直接击穿 PVE 星级门槛（净胜 4 / 9 / 15）。**别凭手感调这两个数**。
  - 侦察建议的判据是**净得分价值**（`selectors.bestDefenseAgainst`，按战术 `points` 加权），不是出手占比 —— 只看占比会把「本来就不投的被克出手」误判成劣势。
  - 改完跑 `verify.mjs` I 组（12 条，含「关闭 == bonus0&mention0 逐字节一致」的反向对照）+ `replay-battle.mjs --all --all-arena`。
- **加一位天梯对手**：`data/arena.js#LADDER` 追加（`id` 唯一、`index` 与 `rating` 递增、5 个 `cardIds` 必须是现有卡、`playStyle` / `defense` 合法，J 组第 1 条逐项校验）→ 视情况调 `config.arena`。**防守策略要混排**，全是人盯人的话战术克制等于没有。
- **调竞技场经济 / 积分**：全在 `config.arena`（次数、体力、K 值、段位表、竞技币）。改完跑 J 组（13 条）；加赛数值（`extraChallenges`）改动另跑 R 组（12 项）；`utils/arena.js` 是纯函数，**不要在里面读 `Date.now()`**（`dayKey` 由 commands 注入）。
- **调竞技场加赛**：全在 `config.arena.extraChallenges`（开关 / 单价 / 上限，现 40 钻/场、每日 +5）。改完跑 R 组（12 项）；`arena.extraToday` 读侧一律经 `utils/arena.js#dailyOf` 归一 + 封顶，**别在页面 / reducer 另写一份**；动这条「命令 → actions → reducer」链路时先对齐构造器签名（R 组抓过「签名错、命令仍返回 ok」的静默错）。
- **加一条羁绊**：宿敌 / 组合连线在 `data/bonds.js` 追加（`members` 用 `playerId`，`bonus` 是**百分比**，键必须是 `config.attrs.keys` 里的合法属性）；同队 / 同届的档位与数值在 `config.bond.teamTiers` / `eraTiers`。改完跑 `verify.mjs` H 组。
  - **同一对球员不要既是宿敌又是连线**（H 组第 1 条会抓）。
  - 连线按 `playerId` 匹配 ⇒ 任意版本都能触发；同队按卡牌 `team` ⇒ 版本会影响（詹姆斯现役 LAL / 巅峰 CLE）。
  - **羁绊不得改 `ovr` / `rarity` / `salary`**，否则工资帽会随站位组合漂移（`config.bond` 注释里的裁决 1，H 组有断言锁死）。
- **调羁绊强度**：改 `config.bond`（`capPerAttr` 是单属性总加成上限，`comboScale` 是连线全局缩放）。想回到里程碑 1 的战斗基线做对照，把 `config.bond.enabled` 设成 `false`。
- **加一张时刻卡**：`data/moments.js` 追加（`id` 唯一、`rarity` 合法、`effects` 只支持 `kind: 'attr' | 'shooter'`，可选 `tactics` / `minQuarter` / `maxQuarter` 过滤，多条同类相乘）→ **必须同步在 `data/shop.js` 上架**（商城是时刻卡的唯一获取途径，漏上架 = 玩家永远拿不到，L 组第 1 条与 M 组第 1 条都会抓）→ 跑 `verify.mjs` L/M 组。
  - **不要手写 `effectText`**：文案由 `utils/moment.js` 从 `effects` 反推生成，手写一句话迟早与真实乘数漂移（L 组会检查这个字段不存在）。
  - **时刻卡不得改 `ovr` / `rarity` / `salary` / 静态属性**（`config.moment` 裁决 3、4，与羁绊同一条纪律），否则工资帽会随佩戴组合漂移、详情页属性表会因换卡跳动。
  - 效果必须是**确定性乘数，不得掷额外的骰子** —— 这是「没佩戴时随机流与基线逐字节一致」的前提（L 组第 4、5 条：18 关 + 12 位天梯逐个开/关对照）。
  - 加时段的 `quarter` 是 5、6…，所以 `minQuarter: 4` 天然覆盖加时。反过来 `pickShooter` 的 `quarter` 是第 4 个可选参，老调用方不传时带节次条件的卡一律不命中。
- **调时刻卡强度**：总旋钮只有 `config.moment.globalScale`（缩放形状 `1 + (mul − 1) × globalScale`，设 0 等价于全部关闭）；单卡强度改 `data/moments.js` 里的 `mul`。改完跑 L 组第 11 条（200 seeds 的引擎实测均值必须与卡面文案对得上）。
- **加一个竞技商城条目**：`data/shop.js` 追加（`kind` 为 `'moment'` 或 `'item'`，`ref` 必须能在 `data/moments.js` / `data/items.js` 里解析到；`tag` 必须是 `TAGS` 里已有的 key；`limit` = 0 表示不限购）。**名称 / 描述 / 稀有度一律由 `shopData.nameOf/descOf/rarityOf` 从被引用对象解析，不要在 shop.js 里重写一份文案**。
  - 定价口径：竞技币日收入上限 = `config.arena.dailyChallenges × coinPerWin` = 100 币，按「几个满收入日」倒推（N 1.5 天 / R 3 天 / SR 7 天 / SSR 15 天 / UR 32 天，对齐第九章「零氪 30 天全 SSR、UR 为长期追求」）。
  - **SSR / UR 必须限购**（M 组会抓），否则刷币就能让全队戴上「81 分之夜」。
  - 改完跑 M 组：第 1 条查数据、第 4 条交叉校验「`shopView.canBuy` == `buyArenaItem().ok`」（防「按钮亮着但点了没反应」）。
- **调播放节奏**：改 `config.battle.playback`（`baseMs` / `infoMs` / `speeds`），**不要动 `pages/match/match.js` 里的常量**（页面只读 config，M 组第 12 条会扫源码里有没有 `const BASE_MS = 数字`）。时长口径 = 96 条回合战报 × `baseMs` + 9 条信息条 × `infoMs`，1× 必须落在文档要求的 120–180 秒。改这两个数只影响观看时长，不影响比分。
- **调比赛画面（球场 / 特写动画，里程碑 6）**：渲染块整体在 `pages/match/match.js`（`courtGeom / paintCourt / drawMan / drawBall / drawCloseUp / renderScene / playScene`）—— 比例系数在 `courtGeom`，帧距 / 帧数在 `config.battle.playback.animMs / animFrames`（M 组会扫页面对这两个字段的引用）。演出只做逐帧位移，**绝不消耗随机数**；暂停 / 跳过 / 卸载 / 结算都会 `stopAnim()` 定格。观赛区整组挂在 `wx:if="{{!error && !finished}}"` 下，结算浮层弹出后必须隐藏（K 组有断言锁死）。
- **加一个可进化的球员 / 调时空进化消耗**：能否进化只取决于「该球员有没有巅峰传奇版」—— `data/players.js` 加卡即自动纳入（`utils/evolution.js` 与页面一行都不用动）；调消耗改 `config.evolution.peakCost`（现 SR 20 / SSR 30 / UR 40），成套倍率改 `pairMul`（现 1.5，**必须 > 1** —— N 组有「成套价值严格大于分开分解」的断言，否则成套这条路就没有存在意义）。分解价值复用 `config.growth.dupToShard`（N2 / R4 / SR8 / SSR16 / UR32），按**出厂稀有度**计值，别改成有效稀有度（先升满再拆会套利，「收益可公示」也保不住）。碎片按球员隔离存 `state.evolution.shards[playerId]`，读侧一律 `Number(...) || 0`、清到 0 要 `delete`；「材料在阵容中」是硬拒绝（与升星的自动摘除 donor 不同，别照抄升星）。改完跑 `verify.mjs` N 组（16 项）；进化不动战斗逻辑，`replay-battle --all --all-arena` 属确认性回归。
- **调市场数值 / 加橱窗档位**：价格与刷新费全在 `config.market`（买价 N 900 / R 1800 / SR 3600 / SSR 7200 / UR 14400，刷新 300）；`sellPrice` 是独立表但**必须恒等于买价 ÷ 3**（O 组第 1 条锁死防套利护城河）。橱窗几格、每格出什么稀有度与相对权重在 `data/market.js#SLOTS`（权重不用凑 100，只从池子里有货的稀有度抽）——市场池自动 = 全部非巅峰卡（`utils/market.js#poolCards`），**不要往池子里放巅峰卡**（会同时打崩抽卡与时空进化两条线）。货架 = `f(dayKey, rerolls)` 纯函数：**不要让它读「已拥有些什么」**、也不要往 `state.market` 里存商品列表（裁决 4 / 5），刷新只做 `rerolls + 1`。入口是主页快捷入口 + 个人页摘要面板（非 tabBar 页，一律 `navigateTo`，见坑 15）。改完跑 `verify.mjs` O 组（15 项）。
- **加一条每日任务 / 调奖励**：`data/daily.js` 追加 `{ id, counter, target, name, desc, reward }`。硬约束：`counter` 必须落在 `utils/daily.js#COUNTER_KEYS`（结算 / 抽卡只会推进这五个键）、`target` 为正整数、`reward.kind` 只允许 `gold | diamond | item`，且 `item` 必须能在 `data/items.js` 解析到、**不得是装备 / 时刻卡**（直接战力）。达成判据 = 「本次推进跨过阈值」（`before < target ≤ after`）——一日内计数单调递增，所以**不要加领取账本**（`state.daily` 只有 `dayKey + counters` 两个字段；跨天滚动只由 commands/reducer 拿到新 `dayKey` 时落库，视图虚拟滚动不写档）。改完跑 `verify.mjs` Q 组（20 项）。
- **调每日任务开关 / 钻石商店**：开关只有 `config.daily.enabled`（false = 命令拒绝、结算不累计、任务页可读；Q 组第 16 条锁）。商店条目 = `data/items.js#CONSUMABLES` 里带 `price` 的补给（`currency` 只允许 `diamond | gold`）；价格 / 货币由 **reducer 从数据表重算对账**（与市场货架同一条纪律，直派伪造 payload 一律不动存档），页面按钮判据必须走 `selectors.diamondShopView`（`canBuy == 命令真实可买`，Q 组第 13 条锁死）。计数推进只允许在 `BATTLE_RESULT / ARENA_RESULT / GACHA_RESULT` 三处内联，**禁止挪进 `utils/battle.js`**（可复现红线：不掷骰、不读时间、不改比分；Q 组第 18 条有同 seed 逐字节对照）。
- **加一条赛季任务 / 调通行证数值**：任务表 `data/dynasty.js#MISSIONS`（`id` 唯一；`counter` 必须 ∈ `utils/dynasty.js#COUNTER_KEYS` 的 11 个结算计数器；`target` / `points` 为正整数）。奖励改 `data/dynasty.js#PASS_TRACK`（必须覆盖 1..`config.dynasty.levels` 每一级且等级连续；`free` 每级有奖、`premium` 只在每 5 级；`item` 奖励的 id 必须能从 `data/items.js` 解析且**不得是装备** —— P 组第 1 条锁死「奖励轨不发任何直接战力」）。数值全在 `config.dynasty`（现 30 天窗口 / 400 分一级 / 50 级 / 王朝轨 1280 钻 / 积分表 PVE 120-60-30、天梯 150-75-50、首通 +100）。领奖账本键 = `free:<等级>` 或 `premium:<等级>`，与 `utils/dynasty.js#cleanClaimed` 的正则 `/^(free|premium):\d+$/` 配套，新增轨道要连存档清洗与 P 组断言一起改。时间只准 commands 切片 `dayKey` 注入（`utils/dynasty.js` 零随机零时间、与战斗引擎零耦合）。改完跑 `verify.mjs` P 组（20 项）。

## 9. 已踩过的坑（改代码前扫一眼）

1. **`store.init({ fresh: true })` 不会真的重置**。`store/index.js` 的守卫是 `if (initialized && !o.force) return state;` —— 看的是 `force`，不是 `fresh`。所以在已经 init 过的进程里（`tools/verify.mjs` 就是），想要一份干净存档必须写 `store.init({ fresh: true, force: true, now: 1000 })`，否则拿到的是上一个用例跑完的残留状态。H 组曾经因此在错误的阵容上做断言。
2. **加时段必须以 `quarterEnd` 收尾**。`utils/battle.js` 的加时循环原本只在开头 push 一条 `overtime`，段末直接跳 `finished`，于是战报相位序列出现 `roundEnd → finished`，违反 `TRANSITIONS`。里程碑 1 没暴露是因为 18 关的固定 seed 都没打进加时；里程碑 2 羁绊改了比分，s2-2 进加时后立刻被 `replay-battle.mjs` 抓到。**修法是补齐状态机，不是放宽 `TRANSITIONS`**（放宽等于把断言变成摆设）。H 组最后一条断言专门锁这个，并且自带「18 关里必须至少有一关进加时，否则算空跑」的反向对照。
3. **改任何影响比分的逻辑，都会改变 18 关的星级分布**。`replay-battle.mjs --all` 用的是每关固定 seed（`replay-<stageId>`），所以比分是确定性的基线；跑完请顺手看一眼比分表有没有出现「第一章全 0★」这类失衡（羁绊上线后 s1-1 从 85:66 / 3★ 变成 78:71 / 1★，因为对手也是全青训 DTC 阵容、同样吃到「王朝体系」，属预期的对称结果）。
4. **`data/items.js` 的 `SLOTS.icon` 是 emoji**，目前没被任何 WXML 引用（死数据）。新加图标一律走 `tools/gen-assets.mjs` 生成像素 PNG 或用单字文字图标，别再往数据里塞 emoji。
5. **`auto` 防守曾经永远落回人盯人**。`utils/battle.js#resolveDefense()` 里写的是 `w > best.w`，而候选对象的字段叫 `weight` ⇒ 比较恒为 `false`，`best` 永远停在第一个候选。字段名写错这种事 `node --check` 查不出、静态校验也看不出，只有断言「三个 auto 分支各自可复现」才抓得住（I 组第 2 条）。修完记得重跑平衡矩阵：`s2-4` / `s3-5` / `s3-6` 与 `a05` / `a08` / `a12` 的定调都会变。
6. **mapState 里引用未定义变量 = 整页白屏，而且静态检查看不见**。`pages/stages/stages.js` 曾写着 `staminaNext: st.nextText`，而变量叫 `stam` ⇒ 关卡页一挂载就抛 `ReferenceError`。这类 bug 只有 K 组第 13 条（把所有页面在 Node 里挂载一遍）能抓到，所以**新增页面一定要跑一次 verify**。
7. **锚点替换脚本删掉的括号必须逐个补回**。本轮用锚点替换给关卡详情加字段时，旧文本含 `});` 收尾而新文本没补，直接语法错误（F 组「所有 JS/JSON 可解析」当场红）。写完立刻 `node --check <file>`，别等 verify。
8. **测试桩的 `setData` 回调必须绑定实例**：真机是 `cb.call(page)`，桩里写裸 `cb()` 时，页面常见的 `this.setData(patch, this.resync)` 会让 `resync` 的 `this` 落到 `globalThis`（页面是 CJS 非严格模式，**不报错**），于是 mapState 静默不重跑。
9. **防守策略与打法的 key 同名**（都是 `balanced` / `inside` / `perimeter`，防守另有 `auto`）：`state.roster.playStyle` 是打法，`state.roster.defense` 是防守。`setDefense` 收到非法值会**静默拒绝**，调试克制时先打印 `result.home.defense` / `result.away.defense` 确认两边到底是什么策略，别把「key 写错」误判成「引擎没生效」。
10. **时刻卡与道具共用 `state.bag`，`bagView` 必须先问 `momentsData` 再问 `itemsData`**。`selectors.bagView()` 的循环里原本只有 `const item = itemsData.getItem(id); if (!item) return;` —— 时刻卡查不到道具定义就被 `return` **静默丢掉**：存档里明明有卡，背包页什么都不显示，而且不报错。现在顺序是先 `momentsData.getMoment(id)` 命中就进 `moments` 分页。新加「背包里的可持有物」时记得走同一条分流。
11. **`bagAdd` 会把计数归零的键删掉**（`if (next[itemId] <= 0) delete next[itemId]`），所以读背包一律写 `(Number(state.bag[id]) || 0)`。直接 `Number(state.bag[id]) === 0` 在键被删掉时是 `NaN === 0` ⇒ 恒 false（L 组第 7 条踩过）。
12. **attr 类时刻卡会让「逐回合对照」失效，只能用聚合均值**。`utils/battle.js#resolve()` 里 `aEff >= dEff` 时是直接命中、**不消耗** `rng.chance`；A 被乘高之后这个分支更容易走到，于是随机流在首次判罚分歧处就错开了。所以「戴卡 vs 没戴卡」的战报只能在**条件未命中的前缀**上逐条比对（L 组第 10 条比的是前 3 节），量级提升要用大样本聚合均值（L 组第 11 条，200 seeds）。看到「逐回合对不上」先想这条，别急着怀疑引擎。
13. **出手权重是相对量，等比放大等于没放大**。`rng.weighted` 先求总权重再按比例落点，所以五人同戴一张 `shooter` 卡与没人戴**逐字节相同**（L 组第 4 条把这个当成断言锁住了）。这正是「时刻卡是打法改变而非数值碾压」的机制层保证 —— 想加强度请改 `mul` 或 `globalScale`，不要指望玩家多买几张。
14. **`snapshotOf` 存了什么，`replaySnapshot` 就得原样传回什么**。本轮踩了两次：漏 `moment` ⇒ 回放少一份乘数、比分对不上；漏 `playedAt` ⇒ 结果对象里的时间戳对不上，「逐字节一致」只能靠验收脚本 `strip()` 掉字段才勉强成立（等于把断言打了折）。现在快照两个字段都存、回放都传，`verify.mjs` 里两处 `strip()` 已收紧成全量 `JSON.stringify` 对比。**给快照加字段时，三处要一起改**：`utils/arena.js#snapshotOf`、`store/commands.js#replaySnapshot`、以及 J/L 组的复现断言。
15. **竞技商城入口不能用 `switchTab`**。`pages/bag` 不是 tabBar 页（tabBar 只有 home / roster / recruit / stages / profile），所以竞技场页的 `goShop()` 用 `wx.navigateTo({ url: '/pages/bag/bag?tab=shop' })`，背包页在 `onLoad` 里读 `options.tab` 定位分页。写成 `switchTab` 会静默失败（页面不跳、也不报错）。
16. **从「满体力」开赛也要重置体力锚点**。`T.BATTLE_RESULT` / `T.ARENA_RESULT` 原本只做 `recoverStamina` 再扣点，漏了 `T.SPEND_STAMINA` 那条「wasFull ⇒ staminaAt = now」守卫：满体期间的时间会被当成恢复时间，满体放两小时再打一场，结算一分钟后体力直接回满（白送整管）。修法：两个结算用例补齐同一行守卫；`verify.mjs` B 组「体力恢复」检查里已加回归断言（满体开赛 ⇒ `staminaAt === now`，且 1 分钟后不白送恢复）。这类「另一条路径有、这条路径漏」的守卫差，短信息看不出来，只有对账入口的数字才能倒逼出来。
17. **详情页面板的页面级测试要挑「会活下来的卡」**。把当前查看的卡分解 / 献祭后，面板按设计切到「卡不存在」空态（该卡已不在 collection）。N 组给页面用例挂载实例时必须挂该球员 uid 较大、不会被动用的那张（如现役版）；挂成被消耗的那张，面板直接进空态、断言全部静默落空。
18. **时空进化有三道独立门禁，调试先看 `evolutionView` 而不是按钮**。门禁顺序：`config.evolution.enabled` → 该球员「有巅峰版 + 登记了 peakCost」→「已拥有巅峰版则三条路径全冻结 / 材料卡在阵容中拒绝 / 巅峰卡自身不可分解」。reducer 与 command 两层都要拒，非法 payload 一律原样返回 `state`（N 组第 12 条锁死）；`peakCostOf` 对未登记档位返回 `null` 而不是抛错 ——「不可进化」是数据状态，不是异常。
19. **verify 的源码纪律断言扫全文件文本（含注释）**。`utils/market.js` 头注释里的字面「不调用 `Date.now()/Math.random()`」⇒ O 组「不得有 Math.random」当场红（它匹配字面模式，注释也算）。措辞统一成「不取系统时间、不掷随机」（参照 `utils/evolution.js`）。另外**新增 verify 分组前先 `node --check tools/verify.mjs`**：本轮还踩了两个语法级错误 —— 新组简写 `MC` 与时刻卡组的 `const MC` 撞名、坏正则（`Math.random[ ]*(` 的 `(` 未转义 ⇒ 正则未闭合），都是 `node --check` 当场可见的。
20. **市场的「卡真在货架上」由 reducer 二次重算**。commands 把 `(dayKey, rerolls)` 随 action 带入，reducer 用同一对纯输入重算 `shelfOf`，并对账 `dayKey == fmt.dayKeyOf(p.now)` / `p.rerolls == state.market.rerolls` / `p.price == 买价公式`（O 组第 12 条：直派伪造 payload 一律不动存档）。刷新只做 `rerolls + 1` —— 不要把商品列表 / 库存塞进 `state.market`（裁决 4 / 5）；`dayKey` 只允许 commands 从 `now()` 切片（与竞技场同规）。
21. **卡从收藏消失的路径必须统一退回随身附件**。本轮把 `REMOVE_CARD` / `EVOLVE_SALVAGE` / `EVOLVE_PAIR` 与新的 `MARKET_SELL` 全部接到 `reducers.js` 的 `attachmentsOf / returnAttachments`：装备与时刻卡退回背包、通知里写明去向（N 组第 16 条锁死）。历史上这类路径曾把附件随卡静默吞掉 —— 新加任何「消耗 / 移除卡牌」的操作，先想这条。
22. **结算后观赛区必须整组隐藏（球场残留 bug）**。比赛页旧版只弹结算浮层，Canvas 球场还在浮层背后显示 —— 用户能直接看到「比赛结束后球场还在」。修法 = 观赛区包一层 `wx:if="{{!error && !finished}}"` + `finish() / skip() / onUnload()` 里 `stopAnim()` 定格；别改成「给球场盖遮罩」：遮罩挡不住动画定时器，也不解决语义。K 组已锁这条判据。
23. **演出渲染块被离线预览抽取时，页内常量要一起进预览桩**。court 渲染块（`courtGeom`…`playScene`）在设计期用 `E:\codex\work` 的一次性预览页抽进浏览器执行，块里引用 `ANIM_MS / SPEEDS` 这类页内常量；预览桩漏定义就是整场白屏（`node --check` 查不出模板字符串里的内容）。给渲染块加依赖时，同步补预览桩再截图。