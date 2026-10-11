/* store/initial-state.js —— 初始存档（第九章经济 / 第十二章「核心循环闭环」的起点）
 * 职责：定义一份「打开就能玩」的新存档：5 首发（R 档青训）+ 5 替补（N 档青训）、
 *       初始货币与招募券、空的保底计数器、空的赛季进度。
 * 说明：uid 用自增计数器生成（不依赖 Date.now/Math.random），保证 reducer 是纯函数、可回归测试。
 */
const CONFIG = require('../config.js');
const players = require('../data/players.js');

/* 新手礼包：5 张 R 档青训卡打满 5 个位置 + 5 张 N 档替补（替补占工资帽但压低均薪） */
const STARTER_CARD_IDS = [
  'academy_pg_3', 'academy_sg_3', 'academy_sf_3', 'academy_pf_3', 'academy_c_3',
  'academy_pg_1', 'academy_sg_1', 'academy_sf_1', 'academy_pf_1', 'academy_c_1'
];

function emptyRoster() {
  const starters = [];
  const bench = [];
  for (let i = 0; i < CONFIG.roster.starterCount; i++) starters.push(null);
  for (let i = 0; i < CONFIG.roster.benchCount; i++) bench.push(null);
  /* defense（里程碑 2 战术克制）：'auto' = 按上场五人的防守属性自动定调（见 config.battle.counter.autoDefense），
   * 也可以指定 data/tactics.js DEFENSES 里的 key。老存档没有这个字段，store/index.js 的 migrate 会补 'auto'。 */
  return { starters: starters, bench: bench, playStyle: 'balanced', defense: 'auto' };
}

/* 竞技场（异步 PVP，里程碑 2）：积分 / 每日次数 / 天梯战绩 / 可复现快照历史。
 * 全部字段都能由 reducer 纯函数推进；rating 下限与每日次数上限在 config.arena。 */
function emptyArena(now) {
  return {
    rating: CONFIG.arena.ratingStart,
    matches: 0, wins: 0, losses: 0, draws: 0,
    streak: 0, bestStreak: 0,
    dayKey: require('../utils/arena.js').dayKeyOf(now),
    usedToday: 0,
    /* 加赛（里程碑 5）：当日已用钻石加购的挑战场次。total = dailyChallenges + extraToday，
     * 跨天与 usedToday 一起清零；读侧一律经 utils/arena.js#dailyOf 归一 + 封顶。 */
    extraToday: 0,
    beaten: {},
    history: [],
    lastRatingDelta: 0,
    /* 竞技商城已购件数（里程碑 2）：{ [shopEntryId]: 已买件数 }，只对 limit>0 的条目有意义。
     * 放在 arena 段而不是 profile：限购是竞技场的账，跟积分/次数一起被 dailyOf 之类的视图读取，
     * 也保证「清空竞技场进度」这类调试动作不会漏掉它。 */
    shopBought: {}
  };
}

/* 时空进化（里程碑 3）：巅峰碎片账本，按球员隔离 { [playerId]: 碎片数 }。
 * 全流程由 reducer 纯函数推进（无时间戳、无随机）；读侧一律 (Number(...) || 0)。 */
function emptyEvolution() {
  return { shards: {} };
}

/* 交易市场（里程碑 3 第二块）：存档只存一个刷新计数器 —— 货架 = f(dayKey, rerolls) 是纯函数，
 * 不存商品列表（见 config.market 裁决 4 / 5）。 */
function emptyMarket() {
  return { rerolls: 0 };
}

/* 王朝赛季（里程碑 3 第三块）：赛季起点 + 积分 / 任务计数 / 领奖账本。
 * 全流程由 reducer 纯函数推进（无时间戳、无随机）；跨窗滚动只由 commands/reducer 拿到新 dayKey 时触发。 */
function emptyDynasty(now) {
  return require('../utils/dynasty.js').empty(require('../utils/format.js').dayKeyOf(now));
}

/* 每日任务（里程碑 4）：当天日期 + 计数器账本。跨天重置只由 commands/reducer 拿到新 dayKey 时触发。 */
function emptyDaily(now) {
  return require('../utils/daily.js').empty(require('../utils/format.js').dayKeyOf(now));
}

function emptyGacha() {
  return {
    normal: { urPity: 0, totalPulls: 0, totalUr: 0 },
    advanced: { urPity: 0, totalPulls: 0, totalUr: 0 },
    history: []
  };
}

/* 建新存档。now 由调用方传入（测试可固定），不读系统时间 */
function createInitialState(now) {
  const ts = Number(now) || 0;
  const state = {
    schema: CONFIG.SAVE_SCHEMA,
    createdAt: ts,
    updatedAt: ts,
    nextUid: 1,
    profile: {
      name: '梦之队经理',
      level: CONFIG.economy.startLevel,
      exp: 0,
      gold: CONFIG.economy.startGold,
      diamond: CONFIG.economy.startDiamond,
      ticketNormal: CONFIG.economy.startTicketNormal,
      ticketAdvanced: CONFIG.economy.startTicketAdvanced,
      stamina: CONFIG.economy.startStamina,
      staminaAt: ts,
      // 竞技币：竞技场产出，为里程碑 2 之后的竞技商城预留（当前只累积、无处消费）
      arenaCoin: 0
    },
    collection: {},
    roster: emptyRoster(),
    gacha: emptyGacha(),
    season: { cleared: {}, totalStars: 0 },
    arena: emptyArena(ts),
    evolution: emptyEvolution(),
    market: emptyMarket(),
    dynasty: emptyDynasty(ts),
    daily: emptyDaily(ts),
    bag: { shard: 20 },
    settings: { reduceMotion: false, fictionalNames: !!CONFIG.compliance.fictionalMode, sound: true, autoSpeed: 1 },
    stats: { battles: 0, wins: 0, losses: 0, draws: 0, pulls: 0, cardsObtained: 0, bestMargin: 0, totalPoints: 0 },
    lastMatch: null,
    notices: []
  };

  // 发新手礼包卡并自动排进阵容
  const ids = STARTER_CARD_IDS.filter(function (id) { return !!players.getCard(id); });
  ids.forEach(function (cardId, i) {
    const uid = 'c' + state.nextUid++;
    state.collection[uid] = {
      uid: uid, cardId: cardId, level: 1, stars: 1, breakthrough: 0,
      equipment: { shoes: null, wrist: null, head: null },
      obtainedAt: ts, source: 'starter'
    };
    if (i < CONFIG.roster.starterCount) state.roster.starters[i] = uid;
    else if (i - CONFIG.roster.starterCount < CONFIG.roster.benchCount) state.roster.bench[i - CONFIG.roster.starterCount] = uid;
  });

  return state;
}

module.exports = {
  createInitialState: createInitialState,
  emptyArena: emptyArena,
  emptyEvolution: emptyEvolution,
  emptyDynasty: emptyDynasty,
  emptyDaily: emptyDaily,
  STARTER_CARD_IDS: STARTER_CARD_IDS
};
