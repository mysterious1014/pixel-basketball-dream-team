/* config.js —— 全局配置单一出口（第三章「数据解耦」要求：禁止在其他文件散落硬编码）
 * 职责：游戏名/版本、演示数据开关、合规开关、美术开关、数值常量（OVR 标定/稀有度/薪资/工资帽）、
 *       抽卡概率与 PRD 参数、比赛规则、体力与经济、养成曲线、调色板。
 * 权威来源：《像素篮球梦之队 · AI 开发提示词 v3.1 像素风版》。
 * 文档内部冲突的裁决见 docs/2026-10-08-调研与实现计划.md「数值裁决记录」。
 */

const CONFIG = {
  /* ---------- 基本信息 ---------- */
  GAME_NAME: '像素篮球梦之队',
  GAME_NAME_EN: 'PIXEL DREAM TEAM',
  VERSION: '0.6.0-m6',   // 版本号随里程碑递增（0.M.0-mM）；M6 = 现役全量扩充 + 立绘精细化 + 比赛页重做
  MILESTONE: 'M6',
  SAVE_KEY: 'pxbb_save_v1',
  SAVE_SCHEMA: 1,

  /* ---------- 第三章 合规（最高优先级） ---------- */
  compliance: {
    // 一键切换：true = 演示数据通道（MVP 固定 true）；false = 走正式数据接口（预留为空）
    useDemoData: true,
    // 虚构化兜底：true = 全部球员显示为风格化化名（库里→三分雨）
    fictionalMode: false,
    // 正式数据接口预留为空，禁止引用任何外部图片/数据 URL
    apiBase: '',
    dataSourceLabel: '梦之队原创球探报告',
    legalNote: '本项目定位为个人学习 / 技术演示，非商业分发。全部数值为原创球探报告，不来自 NBA 官方、2K 或任何商业数据源。',
    trademarkNote: '本程序不含任何真实联赛 / 球队商标与 Logo 图像，球队仅以城市缩写文字出现。'
  },

  /* ---------- 第六章 美术 ---------- */
  art: {
    // 立绘开关：true 时读取 assets/portraits/<cardId>.png；缺失自动回退 CSS 像素占位图（第三章容错机制）
    portraitEnabled: true,
    portraitDir: '/assets/portraits/',
    // 像素字体：把 Zpix.ttf 放进 assets/fonts/ 后填写相对路径即可全局启用；留空则走系统等宽回退栈
    localFontPath: '',
    localFontFamily: 'Zpix',
    fontStack: '"Press Start 2P", "Zpix", "FZPXJW", "Courier New", monospace'
  },

  // 全局 16 色调色板（第六章：单图 ≤32 色，建议 16–24 色，避免渐变）
  palette: {
    navy900: '#070c1c', navy800: '#0d1530', navy700: '#131d3d', navy600: '#1b2854',
    navy500: '#26366b', line: '#3c4f8f', lineSoft: '#2a3a6b',
    text: '#e8ecff', textDim: '#97a2cc', textMute: '#6d78a3',
    orange: '#ff8a1f', orangeDark: '#c85f0a', gold: '#ffd23f',
    court: '#c98a4b', courtDark: '#a2682f',
    hp: '#43d67a', danger: '#ff4d5e',
    rarity: { N: '#9aa4b8', R: '#4aa3ff', SR: '#b06bff', SSR: '#ffc53d', UR: '#ff4fd8' }
  },

  /* ---------- 第五章 5.2 属性字段（19 项，25–99） ---------- */
  attrs: {
    keys: [
      'inside', 'mid', 'three', 'dunk', 'ft', 'handle', 'pass', 'oreb', 'dreb', 'steal',
      'block', 'speed', 'accel', 'strength', 'vertical', 'stamina', 'offIQ', 'defIQ', 'potential'
    ],
    min: 25,
    max: 99,
    labels: {
      inside: '突破上篮', mid: '中距离', three: '三分', dunk: '扣篮', ft: '罚球',
      handle: '控球', pass: '传球', oreb: '进攻篮板', dreb: '防守篮板', steal: '抢断',
      block: '盖帽', speed: '速度', accel: '加速', strength: '力量', vertical: '弹跳',
      stamina: '体力', offIQ: '进攻意识', defIQ: '防守意识', potential: '潜力'
    }
  },

  /* ---------- 第五章 5.4 OVR / 稀有度 / 薪资 ---------- */
  ovr: {
    // 位置主属性（各 12%），其余 14 项均摊 40%，权重和 = 100%（文档原文）
    primaryWeight: 0.12,
    secondaryTotal: 0.4,
    positionPrimary: {
      PG: ['handle', 'pass', 'speed', 'three', 'offIQ'],
      SG: ['three', 'mid', 'dunk', 'speed', 'offIQ'],
      SF: ['mid', 'dunk', 'speed', 'defIQ', 'stamina'],
      PF: ['dunk', 'oreb', 'dreb', 'strength', 'defIQ'],
      C: ['dreb', 'block', 'oreb', 'strength', 'vertical']
    },
    // 标定：ovr = round(clamp(anchor + (raw - anchor) * slope, min, max))
    // slope 设为 1 即还原 5.4 字面公式（raw 直接当 OVR）。
    // 为什么必须标定：字面公式下库里 raw=85.0 → OVR 85(SR)，全联盟最高约 89，
    // SSR/UR 区间永远为空 ⇒ 第七章「高级券 UR 2%」「90 抽必出 UR」无卡可发。
    // 标定后库里 = 92 / SSR，与第十一章 schema 示例（rarity 'SSR'、salary 1200）吻合。
    calibration: { anchor: 60, slope: 1.2 },
    min: 25,
    max: 99
  },

  rarity: {
    order: ['N', 'R', 'SR', 'SSR', 'UR'],
    // 覆盖全部 OVR 区间（v3.1 修订：N 下探至 25）
    bands: [
      { key: 'UR', min: 95, max: 99, label: '镭射' },
      { key: 'SSR', min: 90, max: 94, label: '金' },
      { key: 'SR', min: 85, max: 89, label: '紫' },
      { key: 'R', min: 80, max: 84, label: '蓝' },
      { key: 'N', min: 25, max: 79, label: '灰' }
    ],
    labels: { N: '普通', R: '稀有', SR: '超稀有', SSR: '史诗', UR: '传说' }
  },

  salary: {
    // 单卡薪资(万) = OVR>=threshold ? max(base, round((OVR-threshold) * 系数 * scale)) : base
    // scale=42 的依据：使第十一章 schema 示例「库里 SSR / salary 1200 万」可复现（OVR92 → 1201 万），
    // 同时让 12000 万工资帽真正约束阵容（全 UR ≈ 22000 万 超限；5 SSR 首发 + 低配替补 ≈ 8600 万 通过）。
    threshold: 70,
    base: 200,
    scale: 42,
    coef: { UR: 1.6, SSR: 1.3, SR: 1.1, R: 1.0, N: 0.8 }
  },

  /* ---------- 第七章 7.2 阵容 ---------- */
  roster: {
    starterCount: 5,
    benchCount: 7,
    slotPositions: ['PG', 'SG', 'SF', 'PF', 'C'],
    salaryCap: 12000,
    // 交互（防坑）：MVP 用「点选 A 再点选 B 交换」，不用拖拽
    swapMode: 'tap'
  },

  /* ---------- 第七章 7.3 羁绊系统（里程碑 2） ----------
   * 设计裁决（改动前必读）：
   *   1) 羁绊**只加上场 5 人的战斗属性**，不改 OVR / 稀有度 / 薪资。
   *      原因：薪资由第五章公式从 OVR 推导，若羁绊改 OVR，工资帽会随阵容组合漂移，
   *      7.2「总薪资 ≤ 12000 万」的校验就失去了确定性（同一批卡换个站位就超帽/不超帽）。
   *   2) 主客双方都吃羁绊（公平，且让 BOSS 关的传奇阵容有个性）。
   *   3) 加成是**百分比**，与文档示例「水花组合 三分 +12%」一致；单项属性有总上限防叠爆。
   *   4) enabled=false 可一键回退到里程碑 1 的战斗基线（回归对照用）。
   * 内容定义（哪些人算宿敌 / 哪些人算组合连线）在 data/bonds.js，本段只放数值口径。
   */
  bond: {
    enabled: true,
    // 只统计上场的首发 5 人；替补不计入（轮换是里程碑 2 之后的事）
    countOnCourtOnly: true,
    // 单项属性的羁绊总加成上限（%）：多个羁绊可叠加，但每项属性封顶到这里
    capPerAttr: 45,
    // 同队羁绊：首发中同 team 的人数达到 min 即激活（多档取满足的最高档，只对同队那几人生效）
    teamTiers: [
      { min: 5, name: '王朝体系', desc: '五人同出一队，体系已经刻进肌肉记忆', bonus: { pass: 14, offIQ: 10, defIQ: 8, stamina: 6 } },
      { min: 3, name: '球队默契', desc: '三人同队，跑位不用喊', bonus: { pass: 9, offIQ: 6, defIQ: 5 } },
      { min: 2, name: '老队友', desc: '两人做过队友，彼此知道球会到哪', bonus: { pass: 5, offIQ: 3 } }
    ],
    // 同届羁绊：同 era 且选秀年份差 ≤ eraWindow 的人数达到 min 即激活
    eraWindow: 3,
    eraTiers: [
      { min: 3, name: '黄金一代', desc: '同一批进联盟的人，如今统治着赛场', bonus: { offIQ: 8, stamina: 6, speed: 4 } },
      { min: 2, name: '同届之谊', desc: '同年出道，互相熟悉得像照镜子', bonus: { offIQ: 5, stamina: 3 } }
    ],
    // 宿敌羁绊：data/bonds.js 的 RIVALS 中两人同时在场即激活，对这两人各自生效
    rivalBonus: { strength: 8, vertical: 6, inside: 6, defIQ: 4 },
    // 组合连线：data/bonds.js 的 COMBOS 自带 bonus，这里只留一个全局缩放（做数值平衡用）
    comboScale: 1
  },

  /* ---------- 名场面时刻卡（第八章「创新玩法」，里程碑 2） ----------
   * 文档原文：「名场面时刻卡：装备技能卡，如"35 秒奇迹"（末节三分 +20%）、"81 分之夜"（得分权重翻倍）。」
   * 设计裁决（改动前必读）：
   *   1) 时刻卡是**随身装备**（每人一个 moment 槽），不是队伍光环：效果只对佩戴者本人的出手生效，
   *      因此「81 分之夜」= 该球员成为出手人的权重翻倍（一人独砍高分），语义与文档示例一致。
   *   2) 全部效果都是**确定性乘数**，不掷额外的骰子 ⇒ 没佩戴时刻卡时随机流与里程碑 2 基线逐字节一致
   *      （L 组第 1 条反向对照锁死这条），「同 seed 可复现」红线不破。
   *   3) 与羁绊同一条纪律：**不改 ovr / rarity / salary**，否则工资帽会随佩戴组合漂移（同 config.bond 裁决 1）。
   *   4) 效果只作用于战斗内（属性对抗 A 值、出手人权重、战术权重），不进养成面板的静态属性，
   *      所以详情页属性表与 OVR 不会因为换一张时刻卡而跳动 —— 玩家看到的是「实战触发」而非「面板膨胀」。
   *   5) globalScale 是唯一的总强度旋钮：1 − (1 − mul) × globalScale 的方式缩放，设 0 即等价于全部关闭。
   *   6) enabled=false：一键回退（不读槽位、不加乘数），战斗与里程碑 2 基线逐字节一致。
   * 内容表（有哪些卡、各自效果与文案）在 data/moments.js，本段只放数值口径。
   */
  moment: {
    enabled: true,
    // 每张卡实例同一时刻只能被一名球员佩戴（与装备同语义：背包扣 1，换下退回背包）
    uniqueInstance: true,
    // 全局强度缩放（数值平衡总旋钮，0 = 全部失效）
    globalScale: 1,
    // 单场比赛结算面板最多展示几条已激活时刻卡（超出折叠为「等 N 项」）
    uiMaxListed: 3
  },

  /* ---------- 第七章 7.1 招募 ---------- */
  gacha: {
    pools: {
      normal: {
        key: 'normal',
        name: '普通招募',
        desc: 'N–SSR · 十连必出 SR+',
        ticketField: 'ticketNormal',
        ticketName: '普通招募券',
        singleDiamond: 60,
        tenDiamond: 540,
        rates: { N: 0.6, R: 0.3, SR: 0.09, SSR: 0.01, UR: 0 },
        allow: ['N', 'R', 'SR', 'SSR']
      },
      advanced: {
        key: 'advanced',
        name: '高级球探',
        desc: 'R–UR · 90 抽必出 UR',
        ticketField: 'ticketAdvanced',
        ticketName: '高级球探券',
        singleDiamond: 300,
        tenDiamond: 2700,
        rates: { N: 0, R: 0.55, SR: 0.35, SSR: 0.08, UR: 0.02 },
        allow: ['R', 'SR', 'SSR', 'UR']
      }
    },
    tenPull: { count: 10, guaranteeMinRarity: 'SR' },
    pity: { advancedUrHardPity: 90 },
    // PRD：p_eff = min(cap, p + (n-1) * inc)，n = 连续未出 UR 的抽数（文档 7.1 原文）
    // 注意：inc=0.02 时第 50 抽 p_eff 即达 1，UR 实际最迟第 50 抽出，
    // 因此 90 抽硬保底是兜底逻辑（正常不会触发）。想要真 90 抽体验把 inc 调成 0.005。
    prd: { targetRarity: 'UR', inc: 0.02, cap: 1 }
  },

  /* ---------- 第七章 7.4 比赛 ---------- */
  battle: {
    roundsPerQuarter: 12,
    quarters: 4,
    otRounds: 2,
    maxOt: 5,
    variance: [0.85, 1.15],
    hit: { base: 0.5, divisor: 100, clamp: [0.05, 0.95] },
    // 体力影响：每过一节，低体力球员属性衰减（可复现，不用随机）
    fatigue: { perQuarter: 0.02, weight: 3 }, // 每过一节按体力衰减属性（可复现，非随机）
    // roundsPerQuarter 口径：每队每节回合数（12 → 全场每队 48 回合、105 条战报）。
    // 实测比分区间约 44–98（视双方强度差，replay-battle --all 的 18 关样本）。
    pointsByTactic: { inside: 2, mid: 2, three: 3, handle: 2, fast: 2 },
    /* 文字直播播放节奏（第一章「目标体验：单局 2–3 分钟」）。
     * 为什么放 config 而不是页面常量：AGENTS.md §3「数值只允许改 config.js」，且调节奏要能一眼看到对总时长的影响。
     * 口径：一局 = 96 条回合战报 + 9 条信息条（4×quarterStart/quarterEnd + finished）。
     *   1× 总时长 ≈ (96×baseMs + 9×infoMs) / 1000 = (96×1450 + 9×800) / 1000 ≈ 146 秒 ≈ 2.4 分钟 ⇒ 落在文档 2–3 分钟区间。
     *   倍速 2× ≈ 73 秒、4× ≈ 37 秒（= 里程碑 2 之前的默认手感，急性子玩家仍可一键跳到）。
     * 改这两个数只会影响观看时长，**不影响比分**（播放只是逐条渲染 result.log，seed 已定）。
     * animMs / animFrames：回合特写（进球 / 盖帽 / 打铁）的单帧时长与帧数 —— 帧数 x 帧距约 0.76 秒一次特写，
     *   倍速同比例缩短；演出只在 canvas 里做逐帧位移，不掷随机数、不改变任何比分（暂停 / 跳过会立即停掉并定格）。 */
    playback: { baseMs: 1450, infoMs: 800, speeds: [1, 2, 4], animMs: 95, animFrames: 8 },
    // 抢断/盖帽附加事件概率（仅影响文字直播与少量回合结果）
    eventChance: { steal: 0.12, blockOnMiss: 0.25 },

    /* ---------- 战术克制（第七章 7.4「战术判定」，里程碑 2） ----------
     * 口径：4 个进攻战术 × 3 套防守策略 构成克制环（内容表在 data/tactics.js：DEFENSES + 每条战术的
     *       counter / beatenBy 两个字段，本段只放数值）。
     *   - bonus：克制方的对抗属性乘数 = 1 + bonus，作用在 A/D 的**基础值**上，再进 rand(0.85,1.15)。
     *     所以文档 7.4 的公式形状没变，只是多了一个「战术选择」的乘子（0.1 ≈ ±15% 抖动量级的 2/3，
     *     足以让侦察有意义，又不至于盖过球员属性差）。
     *   - tacticWeightMul：某个进攻战术若能克制对方当前防守策略，其战术权重 ×此值。
     *     **标定值 1（= 关闭进攻方临场自适应）**，实测依据（等强度合成队，200 seeds/格，E:\codex\work\px_bal_matrix2.mjs）：
     *       · =1.35 时进攻方会临场改投能克制防守的战术，于是防守怎么选都被反制回来：
     *         对手均衡打法时我方「收缩护筐」净胜 −5.47，选错代价被放大而选对收益被吃掉；
     *       · =1 时出手分布固定（= 打法 × 属性契合），三套防守策略各有其最优对手打法，没有绝对劣势选项：
     *         对手凿内线 → 收缩护筐 +8.35（最优）；对手拉外线 → 外线扩防 +2.44（最优）；对手均衡 → 外线扩防 +5.4。
     *     更重要的收益：出手分布固定 ⇒ 侦察面板的克制率与「净得分价值」模型是**精确**的而非近似的，
     *     玩家读到的数字就是比赛里真正发生的事。想要 AI 会临场应变，把这个值调到 >1 即可（面板仍然精确）。
     *   - autoDefense：防守策略为 auto 时按队伍平均属性推导（block→收缩护筐 / steal→外线扩防 /
     *     defIQ→人盯人），权重 = 数据里的基础权重 × (平均属性 / autoAttrDivisor)。
     *     **一局只推导一次**（不逐回合掷骰）⇒ 对手策略可侦察、可复现，且不额外消耗随机流。
     *   - mention：克制发生时，用「克制解说」替代普通解说的概率（data/commentary.js 的
     *     counterAttack / counterDefend 两类模板）。
     *   - enabled=false：一键回退到「无克制」的战斗基线（不选策略、不加乘数、不改权重、不消耗随机数），
     *     tools/verify.mjs 的 I 组用它做反向对照，证明克制的影响全部来自本段数值而不是随机流漂移。
     */
    counter: {
      enabled: true,
      bonus: 0.1,
      tacticWeightMul: 1,
      mention: 0.35,
      autoDefense: { balanced: 'defIQ', inside: 'block', perimeter: 'steal' },
      autoAttrDivisor: 80
    }
  },

  /* ---------- 第九章 经济 ---------- */
  economy: {
    staminaMax: 120,
    staminaRecoverSeconds: 300, // 5 分钟 / 点
    startGold: 30000,
    startDiamond: 3000, // 够 1 次高级十连（2700），首屏即可体验保底
    startTicketNormal: 30, // 够 3 次普通十连
    startTicketAdvanced: 12, // 够 1 次高级十连 + 2 次单抽
    startStamina: 120,
    startLevel: 1,
    expPerWin: 60,
    expPerLose: 25,
    expToNextBase: 200
  },

  /* ---------- 7.5 养成 ---------- */
  growth: {
    levelMax: 20,
    starMax: 5,
    breakMax: 3,
    attrCap: 99,
    perLevel: 0.6, // 每级全属性 +0.6（向下取整）
    perStar: 2, // 每星全属性 +2
    perBreak: 3, // 每突破全属性 +3
    levelGoldBase: 200,
    levelGoldGrowth: 1.22,
    // 升星消耗同名卡数量：1→2 星需 1 张，以此类推
    starDupCost: [0, 1, 2, 3, 5],
    breakCost: [
      { gold: 4000, shard: 8 },
      { gold: 9000, shard: 16 },
      { gold: 18000, shard: 30 }
    ],
    // 同名卡转碎片（时空进化的地基，里程碑 3 用）
    dupToShard: { N: 2, R: 4, SR: 8, SSR: 16, UR: 32 }
  },

  /* ---------- 时空进化（第八章「创新玩法」，里程碑 3） ----------
   * 文档原文：「时空进化：新秀版 + 现役版 → 巅峰版碎片。」（5.1：每个版本是一张独立卡牌）
   * 玩法闭环：分解非巅峰版本卡 → 巅峰碎片（按球员隔离）→ 攒够 peakCost → 合成巅峰传奇版。
   * 设计裁决（改动前必读，完整推导见 E:\codex\docs\像素篮球梦之队\2026-10-11-里程碑3-时空进化.md）：
   *   1) 碎片按球员隔离（state.evolution.shards[playerId]）：卖点是「同一球员多版本」的生涯轨迹，
   *      做成通用碎片的话随便拆卡就能换 UR，集卡叙事与第九章「UR 长期追求」一起崩。
   *   2) 分解价值按**出厂稀有度**（cards[].rarity，养成不改变它）查 config.growth.dupToShard：
   *      否则「先升满再拆」套利，且收益随升星/突破跳动、没法在界面公示。
   *   3) 巅峰卡不可分解；一旦拥有该球员巅峰版，分解 / 献祭 / 合成全部冻结 —— 碎片对该球员已无出口。
   *   4) 材料卡必须不在阵容中（硬拒绝 + 提示先移出）：分解 / 献祭点选的是具体卡，误消耗阵容卡损失太大。
   *   5) 允许分解「最后一张该版本」（软提示）：硬拦会让「差 4 碎片但只剩一张新秀」的玩家无路可走。
   *   6) 成套献祭价值 = 两张分解价值之和 × pairMul，严格大于分开分解（pairMul > 1），
   *      让文档点名的招牌动作在数值上有意义：詹姆斯 36 vs 24、库里 30 vs 20。
   * 数值标定（为什么是 20 / 30 / 40）：
   *   - 有巅峰版的球员共 20 位（13 位纯巅峰退役传奇 + 双版本 5 人 + 乔丹 / 科比）；
 *     13 位传奇没有同球员的非巅峰版本 ⇒ 碎片材料实际不可得；7 位多版本里只有詹姆斯与库里能打出成套献祭；
   *   - peakCost { SR 20, SSR 30, UR 40 } 让成套献祭大约「一次到位」：库里 30/30 正好、詹姆斯 36/40 还差 4；
   *   - 没有现役版的乔丹 / 科比（UR）只能靠重复卡慢慢攒 —— UR 是文档第九章点名的「长期追求」。
   * 内容表零改动：可进化名单完全由 data/players.js 里「是否存在巅峰传奇版」推导，未来补卡自动生效。 */
  evolution: {
    enabled: true,
    // 合成巅峰卡所需碎片：按巅峰卡的出厂稀有度分档（未登记的档位 = 不可进化）
    peakCost: { SR: 20, SSR: 30, UR: 40 },
    // 「新秀版 + 现役版」成套献祭的加权：floor((v1 + v2) × pairMul)
    pairMul: 1.5
  },

  /* ---------- 交易市场（第八章「创新玩法」：「交易市场 & 王朝赛季（里程碑 3）」，第二块） ----------
   * 玩法闭环：每日橱窗（5 格档位权重在 data/market.js）买入版本卡 ←→ 出售手头多余的版本卡换金币。
   * 设计裁决（改动前必读，完整推导见 E:\codex\docs\像素篮球梦之队\2026-10-11-里程碑3-交易市场.md）：
   *   1) 市场只流通**非巅峰**版本卡（当前数据集 40 张）：巅峰卡是抽卡（全档稀有）与时空进化的产物，
   *      让金币直接买断巅峰，会同时打崩抽卡与进化两条线的价值。
   *   2) 价格按**出厂稀有度**计（与时空进化裁决 2 同口径）：升级 / 升星 / 突破不改变买卖价，
   *      否则「先升满再卖」会套利，且价格没法在界面公示。
   *   3) 卖价 = 买价 ÷ 3：买下立刻卖出净亏 2/3，从机制上杜绝「刷市场」的套利循环。
   *   4) 橱窗不限购：不做每日库存 —— 库存要与 (dayKey, rerolls, 每格已买数) 三者联动，
   *      命令 / reducer / 页面三处对账复杂；不限购把「买到心仪卡」变成「攒够金币」的问题，
   *      正好把金币回收做大（5★ 一张 SSR 要 11 张同名 = 79200 金币）。
   *   5) 橱窗内容 = f(dayKey, rerolls)，与「已拥有些什么」无关：否则买一张 → 货架重算 →
   *      商品漂移，页面里会出现「买前买后两个版本」的怪相。
   *   6) 出售允许「最后一张」（软提示，与进化裁决 5 同规）；硬拦只有两个：在阵容中 / 巅峰卡。
   * 数值标定（为什么是 900 / 1800 / 3600 / 7200）：
   *   - 金币产出：PVE 每胜 1200（s1-1）~ 6000+（s3），首通额外 +2000；金币消耗：升级单卡 1→20 约 4.7 万、
   *     突破 4000/9000/18000/卡 —— 市场定价取「一档突破的零头到一半」，SSR 7200 ≈ 一次一档突破；
   *   - 当前非巅峰池没有 UR（UR 全部是巅峰卡），UR 档位与 dupToShard 同规，为未来扩卡预留。
   * 内容表（橱窗档位权重）在 data/market.js；算法在 utils/market.js；本文件只放数值。 */
  market: {
    enabled: true,
    buyPrice: { N: 900, R: 1800, SR: 3600, SSR: 7200, UR: 14400 },
    sellPrice: { N: 300, R: 600, SR: 1200, SSR: 2400, UR: 4800 },
    refreshCost: 300
  },

  /* ---------- 关卡（PVE 赛季征程） ---------- */
  season: {
    chapters: 3,
    stagesPerChapter: 6,
    starThresholds: [4, 9, 15] // 净胜分 → 1/2/3 星
  },

  /* ---------- 王朝赛季 & 赛季通行证（第八章「创新玩法」：「交易市场 & 王朝赛季」，里程碑 3 第三块） ----------
   * 玩法闭环：任意结算（PVE / 竞技场）→ 赛季积分 + 赛季任务进度 → 通行证等级 → 领奖（免费轨 + 钻石解锁的王朝轨）。
   * 设计裁决（改动前必读，完整推导见 E:\codex\docs\像素篮球梦之队\2026-10-11-里程碑3-王朝赛季与通行证.md）：
   *   1) 赛季 = 固定 seasonDays 天的窗口，起点记在存档（dynasty.startKey）。跨窗滚动只发生在 commands/reducer
   *      拿到新 dayKey 的那一刻（dayKey 口径与竞技场 / 交易市场共用 utils/format.js#dayKeyOf）；
   *      utils 不取系统时间；页面视图对「已过期但还没落库」的存档做**虚拟滚动**展示（视图直接呈现滚动后的
   *      假想赛季，不等落库），落库只由命令 / 结算触发 —— 视图与存档不会给出两个答案。
   *   2) 赛季积分只从「结算基础分 + 首通 + 任务达成」来（utils/dynasty.js#applySettle 确定性推进）。
   *      与战斗引擎零耦合：不掷骰、不读时间、不改比分 ⇒ 18 关与天梯的可复现基线不受影响（P 组有对照断言）。
   *   3) 通行证两条轨：免费轨全程开放；王朝轨用钻石一次性解锁（**每赛季重新解锁**）。
   *      第 9 章「付费不卖直接战力」同源纪律：轨上只有金币 / 钻石 / 补给道具（体力药水 / 招募券 / 金币袋），
   *      没有任何直接战力（不卖卡、不卖时刻卡、不卖装备）。奖励表在 data/dynasty.js#PASS_TRACK。
   *   4) 任务进度计数器全部是赛季级全局计数（胜利场次 / 连胜 / 打法胜场 / 3★ 场次 / 金币累计），
   *      达成即发一次积分（completed 账本防重复），不掷骰。任务表在 data/dynasty.js#MISSIONS。
   *   5) enabled=false：入口隐藏、命令拒绝、结算不再累计（战斗与经济完全回到「没有王朝赛季」的状态）。
   * 数值标定（为什么是 400 × 50 级 / 1280 钻）：
   *   - 满级 20000 分。活跃口径 ≈ 30 天 × 5 场天梯（55% 胜率 ≈ 16000 分）+ 任务 ≈ 4500 分 ⇒ 高活跃可满级；
   *     casual 口径（每天 1 场天梯 + 2 场 PVE 胜）≈ 13000 分 ≈ 32 级 —— 「活跃度换进度、肝度换满级」。
   *   - 免费轨全程约 4.5 万金币 + 330 钻 + 补给若干；王朝轨 1280 钻解锁、含 330 钻回馈 ⇒ 净 850 钻
   *     换约 2600 钻当量的补给（对照第九章：零氪 30 天全 SSR、UR 为长期追求，通行证不生产开局捷径）。
   */
  dynasty: {
    enabled: true,
    seasonDays: 30,       // 赛季窗口长度（天）：跨窗后积分 / 任务 / 领奖记录整体重置
    pointsPerLevel: 400,  // 每级所需赛季积分
    levels: 50,           // 通行证等级上限（满级 = levels × pointsPerLevel = 20000 分）
    premiumCost: 1280,    // 王朝轨解锁价（钻石，每赛季重新解锁）
    /* 一场结算的赛季积分：按模式 × 结果 + 首通加成；任务达成的积分在 data/dynasty.js */
    points: {
      pveWin: 120, pveDraw: 60, pveLose: 30,
      arenaWin: 150, arenaDraw: 75, arenaLose: 50,
      firstClear: 100
    }
  },

  /* ---------- 每日任务（第十章页面清单「背包/商城/任务」，里程碑 4） ----------
   * 玩法闭环：任意比赛 / 抽卡 / 消耗体力 → 每日计数器推进（utils/daily.js#applySettle）→
   * 达成即自动发奖（金币 / 钻石 / 补给）。任务表与奖励在 data/daily.js。
   * 设计裁决（改动前必读）：
   *   1) 每天按**本地日期**重置（dayKey 口径与竞技场 / 交易市场 / 王朝赛季共用 utils/format.js#dayKeyOf）：
   *      跨天滚动只发生在 commands/reducer 拿到新 dayKey 的那一刻；视图对「已过期但还没落库」的存档
   *      做虚拟滚动展示，视图与存档不会给出两个答案。
   *   2) 达成即自动发奖、不设手动领取：一日内计数单调递增 ⇒ 同一任务每天至多发一次奖。
   *      奖励只发金币 / 钻石 / 补给（不发卡、时刻卡、装备 —— 与王朝轨同一条「不卖直接战力」纪律）。
   *   3) 计数只从「结算 / 抽卡」来（BATTLE_RESULT / ARENA_RESULT / GACHA_RESULT 三处内联推进），
   *      与战斗引擎零耦合：不掷骰、不读时间、不改比分（18 关与天梯的可复现基线不受影响，Q 组有对照断言）。
   *   4) enabled=false：不推进、不发奖、任务页给可读文案（恢复开关后立即可用）。
   * 产出标定（全清一天 ≈ 1600 金币 + 30 钻 + 普通招募券 ×1 + 体力药水 ×1）：
   *   对齐既有经济 —— 王朝免费轨 ≈1513 金币/日、竞技场 100 竞技币/日；钻石 30/日约合 1/10 张高级券，
   *   不松动「钻石稀缺、高级单抽 300 钻」的既有标定（细节见里程碑 4 文档）。
   */
  daily: {
    enabled: true
  },

  /* ---------- 竞技场（异步 PVP，第七章 7.4「模式：竞技场」，里程碑 2） ----------
   * 设计裁决（改动前必读）：
   *   1) 「异步」= 打对手**已保存的阵容快照**，双方不需要同时在线。本工程零后端（第十一章零依赖红线），
   *      所以对手快照由 data/arena.js 的天梯表确定性生成；快照结构 { v, seed, home, away } 与
   *      commands.replay(seed, home, away) 的入参一一对应 ⇒ 将来接后端时，只要把本地生成的快照换成
   *      服务端下发的同结构 JSON，utils/arena.js 与页面层都不用改。
   *   2) 每局 seed = 'arena-<对手id>-<当日第几场>'（commands 层拼，utils 层不碰时间），
   *      因此任意一场都能用 tools/replay-battle.mjs --arena 离线逐回合复现（第十二章验收口径）。
   *   3) 积分用 ELO-lite：expected = 1/(1+10^((opp-my)/ratingDivisor))，delta = round(K×(actual-expected))，
   *      actual = 胜 1 / 平 0.5 / 负 0。打赢强的多涨、输给弱的多扣；连胜另有 streakBonus 加成。
   *   4) 每日次数按**本地日期**重置，dayKey 只能由 commands 传入 now 后在 utils/arena.js 里算
   *      （可复现红线：utils/ 里禁止 Date.now()）。
   *   5) 天梯顺序解锁：赢下第 N 位才开放第 N+1 位；已战胜的对手可重复挑战刷分。
   *   6) 竞技场**不发星级、不写 season.cleared**（星级是 PVE 赛季征程的口径），只发积分 / 货币 / 碎片。
   *   7) enabled=false：整个模式关闭（页面不进入口、命令直接 fail），战斗与经济回到 PVE 基线。
   */
  arena: {
    enabled: true,
    dailyChallenges: 5,       // 每日挑战次数（按本地日期重置）
    staminaCost: 10,          // 每场体力消耗（第九章体力口径）
    ratingStart: 1000,
    ratingMin: 0,             // 掉分下限：新手不会被扣到负数
    ratingK: 32,
    ratingDivisor: 400,
    streakBonus: 3,           // 连胜第 n 场额外 +min(n×streakBonus, streakBonusMax) 积分
    streakBonusMax: 15,
    historyMax: 20,           // 存档里保留的最近战报条数（含可复现快照）
    coinPerWin: 20,           // 竞技币：唯一花处是竞技商城（见下方 shop 与 data/shop.js）
    coinPerLose: 5,
    /* 加赛（里程碑 5）：钻石加购当日挑战次数 —— 直接回应「挑战 5 次上限了、竞技币不够」的反馈。
     * 竞技币只从天梯产出，但「每日 5 场」的闸让活跃玩家打到上限后无处可去；加赛是「想多打」的
     * 钻石出口，不是把竞技币变成可直接购买的货币。裁决：
     *   1) 与免费次数共用一条进度：total = dailyChallenges + 今日已购，跨天一起清零。
     *      存档只加一个计数器 arena.extraToday（dayKey 仍由 commands 切片，可复现红线不破）。
     *   2) 价格恒定 40 钻/次（不递增）：本功能定位是「加钟的暖心出口」，阶梯价只会让玩家反复心算。
     *      40 钻 ≈ 1.3 天的免费钻石（每日任务 30/日），也比一张普通招募券（60 钻）便宜 ——
     *      它买的是「时间」，不是「战力」。
     *   3) 上限 +5 场/日（当日最多 10 场）。零氪基线不动：免费 5 场 / 100 币/日 仍是竞技商城
     *      定价的倒推口径（见 data/shop.js）；满买 5 场 = 200 钻/日 ≈ 6.7 天钻石积累，是长期
     *      加速器而非常规日耗，且每场仍按 staminaCost 扣体力（第二道闸）。
     *   4) 购买不设「先用完免费次数」前置：预先加购后一口气打完是合理用法，误消费由确认弹窗兜。
     *   5) enabled=false：命令拒绝、页面不显示入口，存档字段保留（回里程碑 2 口径）。
     */
    extraChallenges: {
      enabled: true,
      costDiamonds: 40,   // 每次加购的钻石单价
      maxPerDay: 5        // 每日加购上限（把当日上限从 5 提到最多 10 场）
    },
    /* 竞技商城（里程碑 2 消费出口）。竞技币此前只累积不消费，这里给它一个出口。
     * 裁决：
     *   1) 只收竞技币，**不收金币 / 钻石** —— 竞技币是 PVP 专属产出，混用会让 PVE 玩家也能买到 PVP 奖励，
     *      破坏「打天梯才有回报」的动机；反过来 PVP 也不该能买断 PVE 养成主线。
     *   2) 卖什么：时刻卡（本章核心卖点，且只能在这里获得 ⇒ 天梯有独占奖励）+ 少量养成补给
     *      （碎片 / 体力 / 招募券），让打不动天梯的玩家也有稳定兑换出口，符合第九章「零氪有完整体验」。
     *   3) 不卖直接战力（第九章「付费不卖直接战力」的同源纪律）：时刻卡是**打法改变**而非数值碾压，
     *      且限购 + 高价，不能靠刷币一夜暴富。
     *   4) limit > 0 = 终身限购件数（存档记在 arena.shopBought）；0 / 缺省 = 不限购。
     *      限购是时刻卡不失控的关键：一张「81 分之夜」够改变打法，五张就是数值崩坏。
     *   5) 条目内容（名称 / 价格 / 限购 / 文案）在 data/shop.js，本段只放规则口径。
     *   6) enabled=false：商城页签隐藏、buyArenaItem 直接 fail，竞技币回到只累积状态。 */
    shop: {
      enabled: true,
      currency: 'arenaCoin',
      currencyName: '竞技币'
    },
    expPerWin: 80,
    expPerLose: 30,
    // 段位（按积分区间取名，颜色取自 config.palette，第六章禁渐变/限色）
    ranks: [
      { min: 0, name: '街头新秀', short: '新秀', color: '#9aa4b8' },
      { min: 1000, name: '城市轮换', short: '轮换', color: '#4aa3ff' },
      { min: 1150, name: '季后赛边缘', short: '边缘', color: '#b06bff' },
      { min: 1300, name: '全明星', short: '明星', color: '#ffc53d' },
      { min: 1500, name: '殿堂传奇', short: '殿堂', color: '#ff4fd8' }
    ]
  },

  /* ---------- 第十章 六维雷达图归并 ---------- */
  radar: {
    dims: [
      { key: 'score', label: '得分', from: ['inside', 'mid', 'three', 'dunk', 'ft'] }, // 文档雷达表漏了 ft（只覆盖 18/19），归入「得分」补全
      { key: 'play', label: '组织', from: ['pass', 'handle', 'offIQ'] },
      { key: 'board', label: '篮板', from: ['oreb', 'dreb'] },
      { key: 'defense', label: '防守', from: ['steal', 'block', 'defIQ'] },
      { key: 'athletic', label: '运动', from: ['speed', 'accel', 'vertical', 'strength'] },
      { key: 'endure', label: '续航', from: ['stamina', 'potential'] }
    ]
  }
};

module.exports = CONFIG;


