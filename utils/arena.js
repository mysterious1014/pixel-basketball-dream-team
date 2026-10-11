/* utils/arena.js —— 竞技场（异步 PVP）纯算法层（第七章 7.4「模式：竞技场」，里程碑 2）
 * 职责：日期切片、ELO-lite 积分、段位判定、奖励结算、可复现快照的序列化。
 * 约束（可复现红线）：本文件**不读存档、不碰 wx、不调用 Date.now()/Math.random()**。
 *   时间只能由调用方（store/commands.js）以 now 传入；随机只能由 seed 经 utils/battle.js 驱动。
 *   这样「同一 now + 同一 seed + 同一双方阵容 ⇒ 同一场结果」在 Node 里可以被 tools/verify.mjs 直接验证。
 * 数值口径（K 值 / 段位门槛 / 每日次数 / 加赛单价与上限 / 奖励基准）全部在 config.arena，本文件不写死数字。
 * 天梯内容（有哪些对手、他们的阵容与打法）在 data/arena.js。
 */
const CONFIG = require('../config.js');
const fmt = require('./format.js');

const A = CONFIG.arena;

/* ---------------- 每日次数 ---------------- */

/* 本地日期切片：实现已抽到 utils/format.js#dayKeyOf（交易市场共用同一份；口径仍是「0 必须算成
 * 1970-01-01」，不回退当前时间）。保留本文件同名导出，既有调用方零改动。 */
const dayKeyOf = fmt.dayKeyOf;

/* 从存档里的 arena 段算出「今天用了几次、还剩几次」。跨天自动清零（纯函数，不改 state）。
 * 里程碑 5 加赛：total = dailyChallenges + 今日已购加赛场次；读侧对 extraToday 先归一再封顶到
 * maxPerDay —— 脏存档（手改 / 降级残留）不能换来无限挑战。返回值新增一个 extra 字段，
 * 既有调用方（只看 total / left / used）零改动。 */
function dailyOf(arena, now, cfg) {
  const c = cfg || A;
  const key = dayKeyOf(now);
  const sameDay = !!(arena && arena.dayKey === key);
  const used = sameDay ? (Number(arena.usedToday) || 0) : 0;
  const ecfg = c.extraChallenges || {};
  const maxExtra = Math.max(0, Math.floor(Number(ecfg.maxPerDay) || 0));
  const rawExtra = sameDay ? Math.floor(Number(arena.extraToday) || 0) : 0;
  const extra = Math.max(0, Math.min(maxExtra, rawExtra));
  const total = c.dailyChallenges + extra;
  return { dayKey: key, used: used, extra: extra, total: total, left: Math.max(0, total - used) };
}

/* ---------------- ELO-lite 积分 ---------------- */

/* 期望胜率：expected = 1 / (1 + 10^((opp - my) / divisor)) */
function expectedScore(myRating, oppRating, divisor) {
  const d = Number(divisor) || A.ratingDivisor;
  return 1 / (1 + Math.pow(10, ((Number(oppRating) || 0) - (Number(myRating) || 0)) / d));
}

/* 积分变化：delta = round(K × (actual − expected)) + 连胜加成。
 * actual = 胜 1 / 平 0.5 / 负 0。下限（ratingMin）在 reducer 落库时兜，这里只给增量。 */
function ratingDelta(myRating, oppRating, result, streakBonus, cfg) {
  const c = cfg || A;
  const actual = result === 'win' ? 1 : (result === 'draw' ? 0.5 : 0);
  const raw = c.ratingK * (actual - expectedScore(myRating, oppRating, c.ratingDivisor));
  return Math.round(raw + (Number(streakBonus) || 0));
}

/* 连胜加成：赢了才算，随连胜场次线性增长并封顶（config.arena.streakBonus / streakBonusMax） */
function streakBonusOf(streakAfterWin, cfg) {
  const c = cfg || A;
  const n = Math.max(0, Number(streakAfterWin) || 0);
  if (!n) return 0;
  return Math.min(n * c.streakBonus, c.streakBonusMax);
}

/* ---------------- 段位 ---------------- */

function rankOf(rating, ranks) {
  const list = ranks || A.ranks;
  const r = Number(rating) || 0;
  let out = list[0];
  for (let i = 0; i < list.length; i++) if (r >= list[i].min) out = list[i];
  return out;
}

/* 段位进度：当前段位、下一段位、还差多少分、进度比例（页面直接渲染，WXML 不算数） */
function rankProgress(rating, ranks) {
  const list = ranks || A.ranks;
  const r = Number(rating) || 0;
  const cur = rankOf(r, list);
  const idx = list.indexOf(cur);
  const next = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
  const span = next ? Math.max(1, next.min - cur.min) : 1;
  return {
    current: cur,
    next: next,
    rating: r,
    need: next ? Math.max(0, next.min - r) : 0,
    ratio: next ? fmt.clamp((r - cur.min) / span, 0, 1) : 1,
    text: next ? (cur.name + ' → ' + next.name) : (cur.name + '（已封顶）')
  };
}

/* ---------------- 结算 ----------------
 * 一场竞技场对局的全部产出：奖励 + 积分变化 + 期望胜率 + 连胜。
 * 与 PVE 的差别（config.arena 裁决 6）：不发星级、不写 season.cleared，只走积分与货币。 */
function settle(opp, result, ctx) {
  const c = ctx || {};
  const cfg = c.config || A;
  const res = result && result.result;
  const win = res === 'win';
  const draw = res === 'draw';
  const base = (opp && opp.rewards) || {};
  const firstWin = win && !!c.firstWin;

  /* 输/平也给一点金币与碎片（异步 PVP 的常见做法：失败不至于完全白打），但不给钻石 */
  const mult = win ? 1 : (draw ? 0.5 : 0.3);
  const rewards = {
    gold: Math.round((Number(base.gold) || 0) * mult),
    diamond: win ? Math.round((Number(base.diamond) || 0) * (draw ? 0.5 : 1)) : 0,
    shard: Math.round((Number(base.shard) || 0) * mult),
    exp: win ? cfg.expPerWin : (draw ? Math.round((cfg.expPerWin + cfg.expPerLose) / 2) : cfg.expPerLose),
    arenaCoin: win ? cfg.coinPerWin : cfg.coinPerLose
  };
  if (firstWin) {
    const fw = (opp && opp.firstWin) || {};
    rewards.gold += Number(fw.gold) || 0;
    rewards.diamond += Number(fw.diamond) || 0;
    rewards.shard += Number(fw.shard) || 0;
  }

  const streakAfter = win ? (Number(c.streak) || 0) + 1 : 0;
  const bonus = streakBonusOf(streakAfter, cfg);
  const my = Number(c.myRating === undefined ? cfg.ratingStart : c.myRating) || 0;
  const expected = expectedScore(my, (opp && opp.rating) || my, cfg.ratingDivisor);
  const delta = ratingDelta(my, (opp && opp.rating) || my, res, bonus, cfg);

  return {
    win: win, draw: draw, firstWin: firstWin,
    rewards: rewards,
    streakAfter: streakAfter,
    streakBonus: bonus,
    expected: Math.round(expected * 1000) / 1000,
    ratingDelta: delta,
    ratingAfter: Math.max(cfg.ratingMin, my + delta)
  };
}

/* ---------------- 可复现快照 ----------------
 * 异步 PVP 的关键：一场对局 = seed + 双方阵容。存下这两样，任何时候都能离线复现同一局。
 * 快照里存的是「卡牌实例引用」（uid/cardId/养成度/装备），不是 19 项属性数组：
 *   ① 体积小（一条 ≈ 0.5KB，20 条历史也就 10KB，不会顶到小程序单 key 1MB 上限）；
 *   ② 属性由 utils/growth.js 从卡牌定义 + 养成度推导，与当场结算走的是同一个函数，不会漂。
 * 对手侧只需要 opponentId —— data/arena.js 是确定性数据，id 即可还原整支队伍。 */
function snapshotOf(opts) {
  const o = opts || {};
  return {
    v: 1,
    seed: o.seed || '',
    opponentId: o.opponentId || '',
    playStyle: o.playStyle || 'balanced',
    defense: o.defense || 'auto',
    at: Number(o.at) || 0,
    /* playedAt 必须进快照：battle.simulate 的结果对象会回带 playedAt，
     * 而复放时如果传 0，结果对象就与原局差这一个字段 ⇒「同 seed 逐字节一致」只能靠验收脚本
     * 手动 strip 掉它才成立（等于口径打了折）。存下来 ⇒ 复现是**字面意义**上的逐字节一致，
     * 且回放面板显示的是当初开赛的时间而不是 0。体积 +13 字节，对 2KB 上限无影响。 */
    playedAt: Number(o.playedAt) || 0,
    home: (o.instances || []).map(function (i) {
      return {
        uid: i.uid, cardId: i.cardId,
        level: Number(i.level) || 1, stars: Number(i.stars) || 1, breakthrough: Number(i.breakthrough) || 0,
        equipment: Object.assign({}, i.equipment || { shoes: null, wrist: null, head: null }),
        /* 时刻卡必须进快照：它是战斗乘数的输入之一，漏存 ⇒ 回放时乘数变 1 ⇒ 比分对不上原局，
         * 「同 seed 可复现」红线当场破（J 组「快照复现逐字节一致」会抓）。空串 = 未佩戴。 */
        moment: i.moment || ''
      };
    })
  };
}

module.exports = {
  dayKeyOf: dayKeyOf,
  dailyOf: dailyOf,
  expectedScore: expectedScore,
  ratingDelta: ratingDelta,
  streakBonusOf: streakBonusOf,
  rankOf: rankOf,
  rankProgress: rankProgress,
  settle: settle,
  snapshotOf: snapshotOf
};