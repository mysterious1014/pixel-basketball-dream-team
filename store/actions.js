/* store/actions.js —— Action 常量与纯 Action 工厂（单向数据流：只描述「发生了什么」）
 * 职责：集中定义 action type，避免各页面写字符串字面量。
 * 需要读状态/用随机的「命令」（抽卡、打比赛）放在 store/commands.js，reducer 保持纯函数。
 */

const T = {
  HYDRATE: 'HYDRATE',
  RESET: 'RESET',
  APP_FOREGROUND: 'APP_FOREGROUND',
  SET_PROFILE: 'SET_PROFILE',
  ADD_CURRENCY: 'ADD_CURRENCY',
  SPEND_CURRENCY: 'SPEND_CURRENCY',
  ADD_STAMINA: 'ADD_STAMINA',
  SPEND_STAMINA: 'SPEND_STAMINA',
  GACHA_RESULT: 'GACHA_RESULT',
  ADD_CARDS: 'ADD_CARDS',
  REMOVE_CARD: 'REMOVE_CARD',
  SET_ROSTER_SLOT: 'SET_ROSTER_SLOT',
  SWAP_ROSTER: 'SWAP_ROSTER',
  CLEAR_ROSTER_SLOT: 'CLEAR_ROSTER_SLOT',
  AUTO_FILL_ROSTER: 'AUTO_FILL_ROSTER',
  SET_PLAY_STYLE: 'SET_PLAY_STYLE',
  SET_DEFENSE: 'SET_DEFENSE',
  LEVEL_UP: 'LEVEL_UP',
  STAR_UP: 'STAR_UP',
  BREAKTHROUGH: 'BREAKTHROUGH',
  EQUIP: 'EQUIP',
  UNEQUIP: 'UNEQUIP',
  /* 里程碑 2：名场面时刻卡（随身装备语义，与 EQUIP/UNEQUIP 同构）与竞技商城购买 */
  EQUIP_MOMENT: 'EQUIP_MOMENT',
  UNEQUIP_MOMENT: 'UNEQUIP_MOMENT',
  ARENA_BUY: 'ARENA_BUY',
  /* 里程碑 5：竞技场加赛（钻石加购当日挑战次数） */
  ARENA_BUY_EXTRA: 'ARENA_BUY_EXTRA',
  /* 里程碑 3：时空进化（分解版本卡 → 巅峰碎片 → 合成巅峰卡） */
  EVOLVE_SALVAGE: 'EVOLVE_SALVAGE',
  EVOLVE_PAIR: 'EVOLVE_PAIR',
  EVOLVE_SYNTH: 'EVOLVE_SYNTH',
  /* 里程碑 3：交易市场（每日橱窗买入 / 出售 / 刷新） */
  MARKET_BUY: 'MARKET_BUY',
  MARKET_SELL: 'MARKET_SELL',
  MARKET_REFRESH: 'MARKET_REFRESH',
  /* 里程碑 3 第三块：王朝赛季 / 赛季通行证（跨窗滚动 / 领奖 / 王朝轨解锁） */
  DYNASTY_SYNC: 'DYNASTY_SYNC',
  DYNASTY_CLAIM: 'DYNASTY_CLAIM',
  DYNASTY_PREMIUM: 'DYNASTY_PREMIUM',
  /* 里程碑 4：每日任务（跨天滚动）与钻石商店（存货直购） */
  DAILY_SYNC: 'DAILY_SYNC',
  SHOP_BUY: 'SHOP_BUY',
  ADD_ITEM: 'ADD_ITEM',
  USE_ITEM: 'USE_ITEM',
  BATTLE_RESULT: 'BATTLE_RESULT',
  ARENA_RESULT: 'ARENA_RESULT',
  SET_SETTING: 'SET_SETTING',
  PUSH_NOTICE: 'PUSH_NOTICE',
  CLEAR_NOTICES: 'CLEAR_NOTICES'
};

function act(type, payload) { return { type: type, payload: payload || {} }; }

module.exports = {
  T: T,
  act: act,
  hydrate: function (state) { return act(T.HYDRATE, { state: state }); },
  reset: function (now) { return act(T.RESET, { now: now }); },
  foreground: function (now) { return act(T.APP_FOREGROUND, { now: now }); },
  setProfile: function (patch) { return act(T.SET_PROFILE, { patch: patch }); },
  addCurrency: function (patch) { return act(T.ADD_CURRENCY, { patch: patch }); },
  spendCurrency: function (patch) { return act(T.SPEND_CURRENCY, { patch: patch }); },
  addStamina: function (amount, now) { return act(T.ADD_STAMINA, { amount: amount, now: now }); },
  spendStamina: function (amount, now) { return act(T.SPEND_STAMINA, { amount: amount, now: now }); },
  gachaResult: function (result) { return act(T.GACHA_RESULT, { result: result }); },
  addCards: function (cardIds, source, now) { return act(T.ADD_CARDS, { cardIds: cardIds, source: source, now: now }); },
  removeCard: function (uid) { return act(T.REMOVE_CARD, { uid: uid }); },
  setRosterSlot: function (slot, index, uid) { return act(T.SET_ROSTER_SLOT, { slot: slot, index: index, uid: uid }); },
  swapRoster: function (from, to) { return act(T.SWAP_ROSTER, { from: from, to: to }); },
  clearRosterSlot: function (slot, index) { return act(T.CLEAR_ROSTER_SLOT, { slot: slot, index: index }); },
  autoFillRoster: function () { return act(T.AUTO_FILL_ROSTER, {}); },
  setPlayStyle: function (style) { return act(T.SET_PLAY_STYLE, { style: style }); },
  setDefense: function (defense) { return act(T.SET_DEFENSE, { defense: defense }); },
  levelUp: function (uid, cost, now) { return act(T.LEVEL_UP, { uid: uid, cost: cost, now: now }); },
  starUp: function (uid, donorUid) { return act(T.STAR_UP, { uid: uid, donorUid: donorUid }); },
  breakthrough: function (uid, cost) { return act(T.BREAKTHROUGH, { uid: uid, cost: cost }); },
  equip: function (uid, itemId) { return act(T.EQUIP, { uid: uid, itemId: itemId }); },
  unequip: function (uid, slot) { return act(T.UNEQUIP, { uid: uid, slot: slot }); },
  equipMoment: function (uid, momentId) { return act(T.EQUIP_MOMENT, { uid: uid, momentId: momentId }); },
  unequipMoment: function (uid) { return act(T.UNEQUIP_MOMENT, { uid: uid }); },
  arenaBuy: function (entryId, now) { return act(T.ARENA_BUY, { entryId: entryId, now: now }); },
  arenaBuyExtra: function (dayKey, n, cost, now) { return act(T.ARENA_BUY_EXTRA, { dayKey: dayKey, n: n, cost: cost, now: now }); },
  /* 里程碑 3：时空进化。三条命令都带 now（reducer 里给 obtainedAt/updatedAt 用，与 levelUp 同规） */
  salvageCard: function (uid, gain, now) { return act(T.EVOLVE_SALVAGE, { uid: uid, gain: gain, now: now }); },
  evolvePair: function (playerId, rookieUid, activeUid, gain, now) { return act(T.EVOLVE_PAIR, { playerId: playerId, rookieUid: rookieUid, activeUid: activeUid, gain: gain, now: now }); },
  synthPeak: function (playerId, cardId, cost, now) { return act(T.EVOLVE_SYNTH, { playerId: playerId, cardId: cardId, cost: cost, now: now }); },
  /* 里程碑 3：交易市场。marketBuy 带 (dayKey, rerolls) —— reducer 用同一对输入重算货架，
   * 校验「这张卡确实在今日橱窗里」（两侧都是纯函数，不可能算出两个答案）。 */
  marketBuy: function (cardId, dayKey, rerolls, price, now) { return act(T.MARKET_BUY, { cardId: cardId, dayKey: dayKey, rerolls: rerolls, price: price, now: now }); },
  marketSell: function (uid, price, now) { return act(T.MARKET_SELL, { uid: uid, price: price, now: now }); },
  marketRefresh: function (cost, now) { return act(T.MARKET_REFRESH, { cost: cost, now: now }); },
  /* 里程碑 3 第三块：王朝赛季。dayKey 一律由 commands 从 now 切片后带入（与竞技场 / 市场同规） */
  dynastySync: function (dayKey, now) { return act(T.DYNASTY_SYNC, { dayKey: dayKey, now: now }); },
  dynastyClaim: function (level, track, dayKey, now) { return act(T.DYNASTY_CLAIM, { level: level, track: track, dayKey: dayKey, now: now }); },
  dynastyPremium: function (dayKey, now) { return act(T.DYNASTY_PREMIUM, { dayKey: dayKey, now: now }); },
  dailySync: function (dayKey, now) { return act(T.DAILY_SYNC, { dayKey: dayKey, now: now }); },
  shopBuy: function (itemId, price, currency, now) { return act(T.SHOP_BUY, { itemId: itemId, price: price, currency: currency, now: now }); },
  addItem: function (itemId, count) { return act(T.ADD_ITEM, { itemId: itemId, count: count }); },
  useItem: function (itemId, count, now) { return act(T.USE_ITEM, { itemId: itemId, count: count, now: now }); },
  battleResult: function (payload) { return act(T.BATTLE_RESULT, payload); },
  arenaResult: function (payload) { return act(T.ARENA_RESULT, payload); },
  setSetting: function (key, value) { return act(T.SET_SETTING, { key: key, value: value }); },
  pushNotice: function (notice) { return act(T.PUSH_NOTICE, { notice: notice }); },
  clearNotices: function () { return act(T.CLEAR_NOTICES, {}) }
};
