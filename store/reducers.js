/* store/reducers.js —— 唯一的状态变更出口（纯函数，不读时间、不用随机）
 * 职责：把 Action 应用到 State 上，返回新 State。所有业务规则（工资帽、保底计数、体力恢复、
 *       养成消耗、比赛奖励）都在这里落地，页面只负责派发 Action 与渲染。
 * 约束：禁止直接改传入的 state；禁止在 reducer 内调用 Date.now()/Math.random()（可测试性）。
 */
const CONFIG = require('../config.js');
const A = require('./actions.js');
const initial = require('./initial-state.js');
const growth = require('../utils/growth.js');
const players = require('../data/players.js');
const itemsData = require('../data/items.js');
const tacticsData = require('../data/tactics.js');
const momentsData = require('../data/moments.js');
const shopData = require('../data/shop.js');
const evolutionUtil = require('../utils/evolution.js');
const marketUtil = require('../utils/market.js');
const dynastyUtil = require('../utils/dynasty.js');
const dailyUtil = require('../utils/daily.js');
const fmt = require('../utils/format.js');

const T = A.T;
const MAX_HISTORY = 60;
const MAX_NOTICES = 30;

function copy(o) { return Object.assign({}, o); }

/* 体力恢复（第九章：5 分钟/点，上限 120）——纯函数，now 由 Action 带入 */
/* 注意：本函数「始终」返回新对象，调用方可以安全地原地改返回值而不会污染旧 state */
function recoverStamina(profile, now) {
  const max = CONFIG.economy.staminaMax;
  const stepMs = CONFIG.economy.staminaRecoverSeconds * 1000;
  const rawAt = Number(profile.staminaAt);
  const at = isFinite(rawAt) ? rawAt : (Number(now) || 0); // 0 是合法时间戳，不能用 || 兜底
  if (profile.stamina >= max) return copy(profile); // 满体力时不推进计时，staminaAt 只在跌破上限后才有意义
  const elapsed = Math.max(0, now - at);
  const gain = Math.floor(elapsed / stepMs);
  if (gain <= 0) return copy(profile);
  const next = Math.min(max, profile.stamina + gain);
  const nextAt = next >= max ? at : at + gain * stepMs;
  return copy(Object.assign({}, profile, { stamina: next, staminaAt: nextAt }));
}

function nextStaminaText(profile, now) {
  if (profile.stamina >= CONFIG.economy.staminaMax) return '';
  const stepMs = CONFIG.economy.staminaRecoverSeconds * 1000;
  const rawAt2 = Number(profile.staminaAt);
  const at = isFinite(rawAt2) ? rawAt2 : now;
  const rest = Math.max(0, stepMs - (now - at));
  return fmt.mmss(Math.ceil(rest / 1000));
}

/* 生成一个卡牌实例 */
function makeInstance(state, cardId, source, now) {
  const uid = 'c' + state.nextUid;
  state.nextUid += 1;
  return {
    uid: uid, cardId: cardId, level: 1, stars: 1, breakthrough: 0,
    equipment: { shoes: null, wrist: null, head: null },
    /* 名场面时刻卡槽（里程碑 2）：'' = 未佩戴。与 equipment 同为「随身」语义 ——
     * 卡实例在背包里扣 1，佩戴到某名球员身上，换下时退回背包（EQUIP_MOMENT / UNEQUIP_MOMENT）。 */
    moment: '',
    obtainedAt: now, source: source || 'unknown'
  };
}

function pushNotice(state, text, kind, now) {
  const list = [{ text: text, kind: kind || 'info', at: now }].concat(state.notices || []);
  state.notices = list.slice(0, MAX_NOTICES);
}

/* 每日任务（里程碑 4）：把「本日新达成任务」的奖励发到 profile / bag，并推一条合并通知。
 * 达成判据由 utils/daily.js#planSettle 保证（跨阈值只发一次）；本函数只负责入账与通知。 */
function grantDailyRewards(next, plan, now) {
  if (!plan || !plan.completed || !plan.completed.length) return;
  const profile = copy(next.profile);
  let bag = next.bag;
  plan.completed.forEach(function (m) {
    const r = m.reward || {};
    if (r.kind === 'gold') profile.gold = (Number(profile.gold) || 0) + (Number(r.amount) || 0);
    else if (r.kind === 'diamond') profile.diamond = (Number(profile.diamond) || 0) + (Number(r.amount) || 0);
    else if (r.kind === 'item') bag = bagAdd(bag, r.id, Math.max(1, Number(r.count) || 1));
  });
  next.profile = profile;
  next.bag = bag;
  pushNotice(next, '每日任务完成：' + dailyUtil.completedText(plan.completed) + '（奖励已入账）', 'daily', now);
}

/* 从阵容里摘掉某个 uid（升星吃掉同名卡 / 移除卡时防止悬空引用） */
function detachFromRoster(roster, uid) {
  const next = copy(roster);
  next.starters = roster.starters.map(function (u) { return u === uid ? null : u; });
  next.bench = roster.bench.map(function (u) { return u === uid ? null : u; });
  return next;
}

/* 该 uid 是否在阵容中（首发或替补）—— 时空进化的材料卡硬拒绝判据（config.evolution 裁决 4） */
function rosterHas(roster, uid) {
  if (!roster || !uid) return false;
  return (roster.starters || []).indexOf(uid) !== -1 || (roster.bench || []).indexOf(uid) !== -1;
}

/* 是否已拥有某张卡 —— 时空进化：已拥有巅峰版 ⇒ 冻结该球员的分解/献祭/合成（裁决 3） */
function ownsCard(state, cardId) {
  const collection = state.collection || {};
  return Object.keys(collection).some(function (uid) { return collection[uid].cardId === cardId; });
}

function bagAdd(bag, itemId, count) {
  const next = copy(bag);
  next[itemId] = (Number(next[itemId]) || 0) + count;
  if (next[itemId] <= 0) delete next[itemId];
  return next;
}

/* 卡实例身上的「随身附件」清单（装备三槽 + 时刻卡）。
 * 附件是随身语义（EQUIP / EQUIP_MOMENT 进出的是同一份背包计数）—— 卡被消耗的路径
 * （出售 / 分解 / 献祭 / 移除）必须把附件退回背包，不许静默吞掉。 */
function attachmentsOf(inst) {
  const out = [];
  const eq = (inst && inst.equipment) || {};
  Object.keys(eq).forEach(function (slot) { if (eq[slot]) out.push(eq[slot]); });
  if (inst && inst.moment) out.push(inst.moment);
  return out;
}
function returnAttachments(bag, inst) {
  let next = bag;
  attachmentsOf(inst).forEach(function (itemId) { next = bagAdd(next, itemId, 1); });
  return next;
}
/* 通知后缀：有附件时写明「已退回背包」，没有则空串 */
function attachSuffix(inst) {
  const eq = (inst && inst.equipment) || {};
  let gear = 0;
  Object.keys(eq).forEach(function (slot) { if (eq[slot]) gear += 1; });
  const moment = inst && inst.moment ? 1 : 0;
  if (!gear && !moment) return '';
  const parts = [];
  if (gear) parts.push('装备 ×' + gear);
  if (moment) parts.push('时刻卡 ×' + moment);
  return '（' + parts.join(' / ') + ' 已退回背包）';
}

/* 把装备从卡上取下并退回背包 */
function unequipToBag(state, uid, slot) {
  const inst = state.collection[uid];
  if (!inst) return state;
  const itemId = inst.equipment && inst.equipment[slot];
  const collection = copy(state.collection);
  const target = copy(inst);
  target.equipment = copy(inst.equipment || {});
  target.equipment[slot] = null;
  collection[uid] = target;
  return Object.assign({}, state, {
    collection: collection,
    bag: itemId ? bagAdd(state.bag, itemId, 1) : state.bag
  });
}

function reduce(state, action) {
  if (!state) return initial.createInitialState(action && action.payload ? action.payload.now : 0);
  const p = (action && action.payload) || {};
  const now = Number(p.now) || state.updatedAt || 0;

  switch (action.type) {
    case T.HYDRATE: {
      return p.state || state;
    }

    case T.RESET: {
      return initial.createInitialState(now);
    }

    case T.APP_FOREGROUND: {
      const profile = recoverStamina(state.profile, now);
      // 没有真实变化就返回原 state，避免无谓的持久化写入
      if (profile.stamina === state.profile.stamina && profile.staminaAt === state.profile.staminaAt) return state;
      return Object.assign({}, state, { profile: profile, updatedAt: now });
    }

    case T.SET_PROFILE: {
      return Object.assign({}, state, { profile: copy(Object.assign({}, state.profile, p.patch)), updatedAt: now });
    }

    case T.ADD_CURRENCY: {
      const profile = copy(state.profile);
      Object.keys(p.patch || {}).forEach(function (k) {
        profile[k] = (Number(profile[k]) || 0) + (Number(p.patch[k]) || 0);
        if (k === 'stamina') profile.stamina = Math.min(CONFIG.economy.staminaMax, profile.stamina);
      });
      return Object.assign({}, state, { profile: profile, updatedAt: now });
    }

    case T.SPEND_CURRENCY: {
      const profile = copy(state.profile);
      Object.keys(p.patch || {}).forEach(function (k) {
        profile[k] = Math.max(0, (Number(profile[k]) || 0) - (Number(p.patch[k]) || 0));
      });
      return Object.assign({}, state, { profile: profile, updatedAt: now });
    }

    case T.ADD_STAMINA: {
      const profile = recoverStamina(state.profile, now);
      profile.stamina = Math.min(CONFIG.economy.staminaMax, profile.stamina + (Number(p.amount) || 0));
      profile.staminaAt = now;
      return Object.assign({}, state, { profile: profile, updatedAt: now });
    }

    case T.SPEND_STAMINA: {
      const profile = recoverStamina(state.profile, now);
      const wasFull = profile.stamina >= CONFIG.economy.staminaMax;
      profile.stamina = Math.max(0, profile.stamina - (Number(p.amount) || 0));
      // 从「满体力」跌破上限的那一刻开始计时恢复
      if (wasFull) profile.staminaAt = now;
      return Object.assign({}, state, { profile: profile, updatedAt: now });
    }

    case T.ADD_CARDS: {
      const collection = copy(state.collection);
      const draft = { nextUid: state.nextUid };
      const added = [];
      (p.cardIds || []).forEach(function (cardId) {
        if (!players.getCard(cardId)) return;
        const inst = makeInstance(draft, cardId, p.source, now);
        collection[inst.uid] = inst;
        added.push(inst.uid);
      });
      const next = Object.assign({}, state, { collection: collection, nextUid: draft.nextUid, updatedAt: now });
      next.stats = copy(state.stats);
      next.stats.cardsObtained = state.stats.cardsObtained + added.length;
      return next;
    }

    case T.REMOVE_CARD: {
      if (!state.collection[p.uid]) return state;
      const inst = state.collection[p.uid];
      const collection = copy(state.collection);
      delete collection[p.uid];
      return Object.assign({}, state, {
        collection: collection,
        roster: detachFromRoster(state.roster, p.uid),
        /* 随身附件退回背包（与出售 / 分解 / 献祭同规） */
        bag: returnAttachments(state.bag, inst),
        updatedAt: now
      });
    }

    case T.GACHA_RESULT: {
      const r = p.result || {};
      const collection = copy(state.collection);
      const draft = { nextUid: state.nextUid };
      const history = [];
      (r.results || []).forEach(function (one) {
        if (!one.cardId) return;
        const inst = makeInstance(draft, one.cardId, 'gacha:' + r.poolKey, now);
        collection[inst.uid] = inst;
        history.unshift({ uid: inst.uid, cardId: one.cardId, rarity: one.rarity, forced: one.forced || null, at: now });
      });
      const gacha = copy(state.gacha);
      if (r.poolKey && r.pity) gacha[r.poolKey] = copy(r.pity);
      gacha.history = history.concat(gacha.history || []).slice(0, MAX_HISTORY);

      const profile = copy(state.profile);
      const cost = r.cost || {};
      if (cost.diamond) profile.diamond = Math.max(0, profile.diamond - cost.diamond);
      if (cost.ticketField && cost.ticketCount) {
        profile[cost.ticketField] = Math.max(0, (Number(profile[cost.ticketField]) || 0) - cost.ticketCount);
      }

      const stats = copy(state.stats);
      stats.pulls = stats.pulls + (r.results || []).length;
      stats.cardsObtained = stats.cardsObtained + history.length;

      /* 每日任务（里程碑 4）：抽卡计数（十连算 10 次）。dayKey 由 commands 切片随 payload 带入；
       * 缺 dayKey（老调用方 / 直派测试）⇒ 不记账。 */
      let daily = state.daily;
      let dailyPlan = null;
      if (CONFIG.daily.enabled && r.dayKey) {
        const plan = dailyUtil.planSettle(state.daily, r.dayKey, { pulls: (r.results || []).length || Number(r.count) || 0 });
        if (plan.settled) { daily = plan.daily; dailyPlan = plan; }
      }

      const next = Object.assign({}, state, {
        collection: collection, nextUid: draft.nextUid, gacha: gacha, profile: profile, stats: stats, daily: daily, updatedAt: now
      });
      if (dailyPlan) {
        if (dailyPlan.rolled) pushNotice(next, '每日任务已刷新（新的一天）', 'daily', now);
        grantDailyRewards(next, dailyPlan, now);
      }
      const best = (r.results || []).slice().sort(function (a, b) {
        const order = CONFIG.rarity.order;
        return order.indexOf(b.rarity) - order.indexOf(a.rarity);
      })[0];
      if (best) {
        const card = players.getCard(best.cardId);
        pushNotice(next, '招募到 ' + (card ? card.name : best.cardId) + '（' + best.rarity + '）', 'gacha', now);
      }
      return next;
    }

    case T.SET_ROSTER_SLOT: {
      const roster = copy(state.roster);
      const list = p.slot === 'bench' ? roster.bench.slice() : roster.starters.slice();
      const uid = p.uid || null;
      // 同一张卡不能同时出现在两个位置：先全局摘除
      list[p.index] = uid;
      if (p.slot === 'bench') roster.bench = list; else roster.starters = list;
      const other = p.slot === 'bench' ? roster.starters.slice() : roster.bench.slice();
      for (let i = 0; i < other.length; i++) if (other[i] === uid) other[i] = null;
      if (p.slot === 'bench') roster.starters = other; else roster.bench = other;
      return Object.assign({}, state, { roster: roster, updatedAt: now });
    }

    case T.CLEAR_ROSTER_SLOT: {
      const roster = copy(state.roster);
      if (p.slot === 'bench') { roster.bench = roster.bench.slice(); roster.bench[p.index] = null; }
      else { roster.starters = roster.starters.slice(); roster.starters[p.index] = null; }
      return Object.assign({}, state, { roster: roster, updatedAt: now });
    }

    /* 点选 A 再点选 B 交换（第七章 7.2「防坑」：MVP 不用拖拽） */
    case T.SWAP_ROSTER: {
      const roster = copy(state.roster);
      const starters = roster.starters.slice();
      const bench = roster.bench.slice();
      const from = p.from || {};
      const to = p.to || {};
      const fromList = from.slot === 'bench' ? bench : starters;
      const toList = to.slot === 'bench' ? bench : starters;
      const tmp = fromList[from.index];
      fromList[from.index] = toList[to.index];
      toList[to.index] = tmp;
      roster.starters = starters;
      roster.bench = bench;
      return Object.assign({}, state, { roster: roster, updatedAt: now });
    }

    case T.AUTO_FILL_ROSTER: {
      return Object.assign({}, state, { roster: autoFill(state), updatedAt: now });
    }

    case T.SET_PLAY_STYLE: {
      return Object.assign({}, state, { roster: copy(Object.assign({}, state.roster, { playStyle: p.style || 'balanced' })), updatedAt: now });
    }

    /* 防守策略（里程碑 2 战术克制）：'auto' 或 data/tactics.js DEFENSES 里的 key，非法值直接忽略 */
    case T.SET_DEFENSE: {
      const d = p.defense || tacticsData.AUTO_DEFENSE;
      if (!tacticsData.isDefenseKey(d)) return state;
      return Object.assign({}, state, { roster: copy(Object.assign({}, state.roster, { defense: d })), updatedAt: now });
    }

    case T.LEVEL_UP: {
      const inst = state.collection[p.uid];
      if (!inst) return state;
      const collection = copy(state.collection);
      collection[p.uid] = copy(Object.assign({}, inst, { level: Math.min(growth.limits.levelMax, inst.level + 1) }));
      const profile = copy(state.profile);
      profile.gold = Math.max(0, profile.gold - (Number(p.cost) || 0));
      return Object.assign({}, state, { collection: collection, profile: profile, updatedAt: now });
    }

    /* 升星消耗同名卡（第七章 7.5）：donor 被吃掉并从阵容摘除 */
    case T.STAR_UP: {
      const inst = state.collection[p.uid];
      const donor = state.collection[p.donorUid];
      if (!inst || !donor || p.uid === p.donorUid) return state;
      if (inst.cardId !== donor.cardId) return state;
      if (inst.stars >= growth.limits.starMax) return state;
      const collection = copy(state.collection);
      collection[p.uid] = copy(Object.assign({}, inst, { stars: inst.stars + 1 }));
      delete collection[p.donorUid];
      const next = Object.assign({}, state, {
        collection: collection,
        roster: detachFromRoster(state.roster, p.donorUid),
        updatedAt: now
      });
      pushNotice(next, (players.getCard(inst.cardId) || {}).name + ' 升到 ' + (inst.stars + 1) + ' 星', 'growth', now);
      return next;
    }

    case T.BREAKTHROUGH: {
      const inst = state.collection[p.uid];
      if (!inst) return state;
      const cost = p.cost || {};
      const collection = copy(state.collection);
      collection[p.uid] = copy(Object.assign({}, inst, { breakthrough: Math.min(growth.limits.breakMax, inst.breakthrough + 1) }));
      const profile = copy(state.profile);
      profile.gold = Math.max(0, profile.gold - (Number(cost.gold) || 0));
      return Object.assign({}, state, {
        collection: collection,
        profile: profile,
        bag: bagAdd(state.bag, 'shard', -(Number(cost.shard) || 0)),
        updatedAt: now
      });
    }

    case T.EQUIP: {
      const inst = state.collection[p.uid];
      const item = itemsData.getItem(p.itemId);
      if (!inst || !item || !itemsData.isEquipment(p.itemId)) return state;
      if ((Number(state.bag[p.itemId]) || 0) <= 0) return state;
      const slot = item.slot;
      const old = inst.equipment && inst.equipment[slot];
      const collection = copy(state.collection);
      const target = copy(inst);
      target.equipment = copy(inst.equipment || {});
      target.equipment[slot] = p.itemId;
      collection[p.uid] = target;
      let bag = bagAdd(state.bag, p.itemId, -1);
      if (old) bag = bagAdd(bag, old, 1);
      return Object.assign({}, state, { collection: collection, bag: bag, updatedAt: now });
    }

    case T.UNEQUIP: {
      return unequipToBag(state, p.uid, p.slot);
    }

    /* ---------------- 名场面时刻卡（第八章，里程碑 2） ----------------
     * 刻意与 EQUIP / UNEQUIP 完全同构：卡实例在背包里扣 1，戴到某名球员身上，换下时退回背包。
     * 同构的好处是「一份卡只能一名球员戴」（config.moment.uniqueInstance）自动成立，
     * 不需要额外的占用表 —— 背包计数就是唯一的真相来源。
     * reducer 只做数据合法性判断，**不做数值判断**（时刻卡不改属性面板，所以这里没有工资帽/属性上限校验）。 */
    case T.EQUIP_MOMENT: {
      if (!CONFIG.moment.enabled) return state;
      const inst = state.collection[p.uid];
      if (!inst || !momentsData.isMoment(p.momentId)) return state;
      if ((Number(state.bag[p.momentId]) || 0) <= 0) return state;
      const old = inst.moment;
      const collection = copy(state.collection);
      const target = copy(inst);
      target.moment = p.momentId;
      collection[p.uid] = target;
      let bag = bagAdd(state.bag, p.momentId, -1);
      if (old) bag = bagAdd(bag, old, 1);
      return Object.assign({}, state, { collection: collection, bag: bag, updatedAt: now });
    }

    case T.UNEQUIP_MOMENT: {
      const inst = state.collection[p.uid];
      /* 刻意不判 CONFIG.moment.enabled：关闭开关只让效果失效，不该把玩家的卡锁死在身上取不下来 */
      if (!inst || !inst.moment) return state;
      const collection = copy(state.collection);
      const target = copy(inst);
      target.moment = '';
      collection[p.uid] = target;
      return Object.assign({}, state, {
        collection: collection,
        bag: bagAdd(state.bag, inst.moment, 1),
        updatedAt: now
      });
    }

    /* ---------------- 竞技商城（里程碑 2：竞技币消费出口） ----------------
     * 规则口径见 config.arena.shop 的裁决；条目内容在 data/shop.js。
     * 三道闸：① 商城/竞技场开着 ② 条目存在且未超限购 ③ 竞技币够。任何一道不过就原样返回 state（不动存档）。
     * 时刻卡与道具都进同一个 bag（键 = 各自的 id），因为两者都是「背包里的可持有物」，
     * 分开存会让 selectors.bagView 与穿戴逻辑各写两套。 */
    case T.ARENA_BUY: {
      const scfg = CONFIG.arena.shop || {};
      if (!CONFIG.arena.enabled || !scfg.enabled) return state;
      const entry = shopData.getEntry(p.entryId);
      if (!entry) return state;
      const arena0 = state.arena || initial.emptyArena(now);
      const boughtMap = arena0.shopBought || {};
      const bought = Number(boughtMap[entry.id]) || 0;
      if (Number(entry.limit) > 0 && bought >= Number(entry.limit)) return state;
      const price = Number(entry.price) || 0;
      const coin = Number(state.profile.arenaCoin) || 0;
      if (coin < price) return state;

      const qty = Math.max(1, Number(entry.qty) || 1);
      const profile = copy(state.profile);
      profile.arenaCoin = coin - price;

      const arena = copy(arena0);
      arena.shopBought = copy(boughtMap);
      arena.shopBought[entry.id] = bought + 1;

      const next = Object.assign({}, state, {
        profile: profile,
        bag: bagAdd(state.bag, entry.ref, qty),
        arena: arena,
        updatedAt: now
      });
      pushNotice(next, '竞技商城兑换 ' + shopData.nameOf(entry) + '（-' + price + ' ' + (scfg.currencyName || '竞技币') + '）', 'shop', now);
      return next;
    }

    /* 加赛（里程碑 5）：钻石加购当日挑战次数。
     * 与 MARKET_BUY 同规：dayKey / n / 单价全部由 action 带入，这里用同一份纯输入重算对账 ——
     * 直派伪造 payload（跳变 n / 篡改单价 / 日期不匹配 / 钻石不足 / 超上限）一律原样返回 state。 */
    case T.ARENA_BUY_EXTRA: {
      const cfg = CONFIG.arena;
      const ecfg = cfg.extraChallenges || {};
      if (!cfg.enabled || !ecfg.enabled) return state;
      const dayKey = fmt.dayKeyOf(p.now);
      if (p.dayKey !== dayKey) return state;
      const arena0 = state.arena || initial.emptyArena(now);
      const maxExtra = Math.max(0, Math.floor(Number(ecfg.maxPerDay) || 0));
      const bought = arena0.dayKey === dayKey
        ? Math.max(0, Math.min(maxExtra, Math.floor(Number(arena0.extraToday) || 0)))
        : 0;
      if (Math.floor(Number(p.n) || 0) !== bought + 1) return state;
      if (bought + 1 > maxExtra) return state;
      const cost = Math.floor(Number(ecfg.costDiamonds) || 0);
      if (!(cost > 0) || Number(p.cost) !== cost) return state;
      const diamond = Number(state.profile.diamond) || 0;
      if (diamond < cost) return state;

      const profile = copy(state.profile);
      profile.diamond = diamond - cost;
      const arena = copy(arena0);
      if (arena.dayKey !== dayKey) { arena.dayKey = dayKey; arena.usedToday = 0; arena.extraToday = 0; }
      arena.extraToday = bought + 1;
      const next = Object.assign({}, state, { profile: profile, arena: arena, updatedAt: now });
      pushNotice(next, '竞技场加赛 +1 场（-' + cost + ' 钻石，今日 ' + arena.extraToday + '/' + maxExtra + '）', 'arena', now);
      return next;
    }

    /* ---------------- 时空进化（第八章「创新玩法」，里程碑 3） ----------------
     * 三条路径全在这三个 case 里收口（业务规则层，口径见 config.evolution 的 6 条裁决）：
     *   EVOLVE_SALVAGE：分解一张非巅峰版本卡 → 该球员巅峰碎片 +gain
     *   EVOLVE_PAIR   ：献祭「新秀版 + 现役版」各一张 → 巅峰碎片 +gain（= 两张之和 × pairMul）
     *   EVOLVE_SYNTH  ：扣 peakCost 碎片 → 新增一张巅峰传奇版实例（source='evolution'）
     * 共同前置（任一不过 ⇒ 原样返回 state）：开关开着 / 球员有巅峰版 / 材料不在阵容中 /
     * 尚未拥有巅峰版 / 数值与公式一致。公式只来自 utils/evolution.js，这里不重算、只校验。 */
    case T.EVOLVE_SALVAGE: {
      if (!evolutionUtil.enabled()) return state;
      const inst = state.collection[p.uid];
      if (!inst) return state;
      const def = players.getCard(inst.cardId);
      if (!def) return state;
      const cards = players.cardsOfPlayer(def.playerId);
      const peak = evolutionUtil.peakCardOf(cards);
      if (!peak || !evolutionUtil.peakCostOf(peak)) return state;
      if (def.id === peak.id) return state;
      if (rosterHas(state.roster, p.uid)) return state;
      if (ownsCard(state, peak.id)) return state;
      const gain = Number(p.gain) || 0;
      if (gain <= 0 || gain !== evolutionUtil.salvageValue(def)) return state;
      const collection = copy(state.collection);
      delete collection[p.uid];
      const shards = copy((state.evolution && state.evolution.shards) || {});
      shards[def.playerId] = (Number(shards[def.playerId]) || 0) + gain;
      const next = Object.assign({}, state, {
        collection: collection,
        evolution: Object.assign({}, state.evolution, { shards: shards }),
        bag: returnAttachments(state.bag, inst),
        updatedAt: now
      });
      pushNotice(next, '时空进化：' + def.name + '（' + def.version + '）分解 → 巅峰碎片 +' + gain + attachSuffix(inst), 'evolution', now);
      return next;
    }

    case T.EVOLVE_PAIR: {
      if (!evolutionUtil.enabled()) return state;
      const defs = players.cardsOfPlayer(p.playerId);
      const peak = evolutionUtil.peakCardOf(defs);
      if (!peak || !evolutionUtil.peakCostOf(peak)) return state;
      const rookie = evolutionUtil.versionCardOf(defs, evolutionUtil.VERSION_ROOKIE);
      const active = evolutionUtil.versionCardOf(defs, evolutionUtil.VERSION_ACTIVE);
      if (!rookie || !active) return state;
      const rInst = state.collection[p.rookieUid];
      const aInst = state.collection[p.activeUid];
      if (!rInst || !aInst || p.rookieUid === p.activeUid) return state;
      if (rInst.cardId !== rookie.id || aInst.cardId !== active.id) return state;
      if (rosterHas(state.roster, p.rookieUid) || rosterHas(state.roster, p.activeUid)) return state;
      if (ownsCard(state, peak.id)) return state;
      const gain = Number(p.gain) || 0;
      if (gain <= 0 || gain !== evolutionUtil.pairValue(rookie, active)) return state;
      const collection = copy(state.collection);
      delete collection[p.rookieUid];
      delete collection[p.activeUid];
      const shards = copy((state.evolution && state.evolution.shards) || {});
      shards[p.playerId] = (Number(shards[p.playerId]) || 0) + gain;
      const next = Object.assign({}, state, {
        collection: collection,
        evolution: Object.assign({}, state.evolution, { shards: shards }),
        bag: returnAttachments(returnAttachments(state.bag, rInst), aInst),
        updatedAt: now
      });
      pushNotice(next, '时空进化：' + rookie.name + ' 的新秀版 + 现役版 献祭 → 巅峰碎片 +' + gain + attachSuffix(rInst) + attachSuffix(aInst), 'evolution', now);
      return next;
    }

    case T.EVOLVE_SYNTH: {
      if (!evolutionUtil.enabled()) return state;
      const defs = players.cardsOfPlayer(p.playerId);
      const peak = evolutionUtil.peakCardOf(defs);
      const cost = evolutionUtil.peakCostOf(peak);
      if (!peak || !cost) return state;
      if (Number(p.cost) !== cost || p.cardId !== peak.id) return state;
      if (ownsCard(state, peak.id)) return state;
      const shards0 = (state.evolution && state.evolution.shards) || {};
      const balance = Number(shards0[p.playerId]) || 0;
      if (balance < cost) return state;
      const collection = copy(state.collection);
      const draft = { nextUid: state.nextUid };
      const inst = makeInstance(draft, peak.id, 'evolution', now);
      collection[inst.uid] = inst;
      const shards = copy(shards0);
      /* 清到 0 就删键（与 bagAdd 同规）；读侧一律 (Number(...) || 0)，见 AGENTS §9 坑 11 */
      if (balance - cost <= 0) delete shards[p.playerId];
      else shards[p.playerId] = balance - cost;
      const next = Object.assign({}, state, {
        collection: collection,
        nextUid: draft.nextUid,
        evolution: Object.assign({}, state.evolution, { shards: shards }),
        updatedAt: now
      });
      pushNotice(next, '时空进化：合成 ' + peak.name + ' 巅峰传奇版（-' + cost + ' 巅峰碎片）', 'evolution', now);
      return next;
    }

    /* 交易市场（里程碑 3 第二块，口径见 config.market 的 6 条裁决）：
     *   MARKET_BUY    ：今日橱窗的卡 → 收藏，扣金币（dayKey × rerolls 由 action 带入，
     *                   这里用同一对纯输入重算货架 —— 与 commands 不可能出现两个答案）；
     *   MARKET_SELL   ：收藏里的卡 → 金币，随身附件退回背包；阵容中 / 巅峰卡硬拒；
     *   MARKET_REFRESH：扣金币 → rerolls + 1（货架 = f(dayKey, rerolls) 自动重掷）。
     * 任一校验不过 ⇒ 原样返回 state（非法 payload 不改存档，与 EVOLVE 三案同规）。 */
    case T.MARKET_BUY: {
      if (!marketUtil.enabled()) return state;
      const def = players.getCard(p.cardId);
      if (!marketUtil.isMarketable(def)) return state;
      const rerolls = Math.floor(Number((state.market && state.market.rerolls) || 0));
      if (Math.floor(Number(p.rerolls) || 0) !== rerolls) return state;
      if (fmt.dayKeyOf(p.now) !== p.dayKey) return state;
      const shelf = marketUtil.shelfOf(p.dayKey, rerolls);
      if (!shelf.some(function (row) { return row.cardId === def.id; })) return state;
      const price = marketUtil.buyPrice(def.rarity);
      if (!(price > 0) || Number(p.price) !== price) return state;
      const gold = Number(state.profile.gold) || 0;
      if (gold < price) return state;
      const profile = copy(state.profile);
      profile.gold = gold - price;
      const collection = copy(state.collection);
      const draft = { nextUid: state.nextUid };
      const inst = makeInstance(draft, def.id, 'market', now);
      collection[inst.uid] = inst;
      const next = Object.assign({}, state, {
        profile: profile, collection: collection, nextUid: draft.nextUid, updatedAt: now
      });
      pushNotice(next, '交易市场：买入 ' + def.name + '（' + def.version + '） -' + price + ' 金币', 'market', now);
      return next;
    }

    case T.MARKET_SELL: {
      if (!marketUtil.enabled()) return state;
      const inst = state.collection[p.uid];
      if (!inst) return state;
      const def = players.getCard(inst.cardId);
      if (!marketUtil.isMarketable(def)) return state;
      if (rosterHas(state.roster, p.uid)) return state;
      const price = marketUtil.sellPrice(def.rarity);
      if (!(price > 0) || Number(p.price) !== price) return state;
      const collection = copy(state.collection);
      delete collection[p.uid];
      const profile = copy(state.profile);
      profile.gold = (Number(state.profile.gold) || 0) + price;
      const next = Object.assign({}, state, {
        collection: collection,
        profile: profile,
        bag: returnAttachments(state.bag, inst),
        updatedAt: now
      });
      pushNotice(next, '交易市场：卖出 ' + def.name + '（' + def.version + '） +' + price + ' 金币' + attachSuffix(inst), 'market', now);
      return next;
    }

    case T.MARKET_REFRESH: {
      if (!marketUtil.enabled()) return state;
      const cost = marketUtil.refreshCost();
      if (!(cost > 0) || Number(p.cost) !== cost) return state;
      const gold = Number(state.profile.gold) || 0;
      if (gold < cost) return state;
      const profile = copy(state.profile);
      profile.gold = gold - cost;
      const market = copy(state.market || {});
      market.rerolls = Math.floor(Number(market.rerolls) || 0) + 1;
      const next = Object.assign({}, state, { profile: profile, market: market, updatedAt: now });
      pushNotice(next, '交易市场：刷新今日橱窗 -' + cost + ' 金币', 'market', now);
      return next;
    }

    case T.ADD_ITEM: {
      return Object.assign({}, state, { bag: bagAdd(state.bag, p.itemId, Number(p.count) || 0), updatedAt: now });
    }

    case T.USE_ITEM: {
      const item = itemsData.getItem(p.itemId);
      const owned = Number(state.bag[p.itemId]) || 0;
      const n = Math.min(owned, Number(p.count) || 1);
      if (!item || n <= 0) return state;
      let next = Object.assign({}, state, { bag: bagAdd(state.bag, p.itemId, -n) });
      if (item.type === 'stamina') {
        const profile = recoverStamina(next.profile, now);
        profile.stamina = Math.min(CONFIG.economy.staminaMax, profile.stamina + item.value * n);
        next.profile = copy(profile);
      } else if (item.type === 'gold') {
        next.profile = copy(Object.assign({}, next.profile, { gold: next.profile.gold + item.value * n }));
      } else if (item.type === 'ticket') {
        const profile = copy(next.profile);
        profile[item.field] = (Number(profile[item.field]) || 0) + n;
        next.profile = profile;
      }
      return Object.assign({}, next, { updatedAt: now });
    }

    case T.BATTLE_RESULT: {
      const result = p.result;
      if (!result) return state;
      const profile = recoverStamina(state.profile, now);
      const wasFull = profile.stamina >= CONFIG.economy.staminaMax;
      profile.stamina = Math.max(0, profile.stamina - (Number(p.staminaCost) || 0));
      // 从「满体力」跌破上限的那一刻开始计时恢复（与 SPEND_STAMINA 同一条口径）
      if (wasFull) profile.staminaAt = now;

      const rewards = p.rewards || {};
      profile.gold = profile.gold + (Number(rewards.gold) || 0);
      profile.diamond = profile.diamond + (Number(rewards.diamond) || 0);
      profile.exp = profile.exp + (Number(rewards.exp) || 0);
      profile.ticketNormal = (Number(profile.ticketNormal) || 0) + (Number(rewards.ticketNormal) || 0);
      profile.ticketAdvanced = (Number(profile.ticketAdvanced) || 0) + (Number(rewards.ticketAdvanced) || 0);
      // 经理等级：经验满阈值升级（第九章：养成线清晰）
      while (profile.exp >= levelExpNeed(profile.level)) {
        profile.exp -= levelExpNeed(profile.level);
        profile.level += 1;
      }

      let bag = state.bag;
      if (rewards.shard) bag = bagAdd(bag, 'shard', Number(rewards.shard));
      if (rewards.item) bag = bagAdd(bag, rewards.item, 1);

      const season = copy(state.season);
      const cleared = copy(season.cleared || {});
      const prevRec = p.stageId ? cleared[p.stageId] : null;
      if (p.stageId) {
        const prev = prevRec;
        const stars = Math.max((prev && prev.stars) || 0, result.stars || 0);
        const bestMargin = Math.max((prev && prev.bestMargin) || -999, result.margin);
        cleared[p.stageId] = { stars: stars, bestMargin: bestMargin, result: result.result, at: now, firstClear: !prev };
      }
      season.cleared = cleared;
      season.totalStars = Object.keys(cleared).reduce(function (s, k) { return s + (cleared[k].stars || 0); }, 0);

      const stats = copy(state.stats);
      stats.battles += 1;
      if (result.result === 'win') stats.wins += 1;
      else if (result.result === 'lose') stats.losses += 1;
      else stats.draws += 1;
      stats.totalPoints += result.homeScore;
      stats.bestMargin = Math.max(stats.bestMargin, result.margin);

      /* 王朝赛季（里程碑 3 第三块）：PVE 结算 → 赛季积分 + 任务进度。
       * dayKey 由 commands 切片传入；缺失（老调用方 / 直派测试）⇒ 不记账（reducer 不猜时间）。
       * planSettle 是纯函数（不掷骰、不读时间、不改比分），与 commands 侧跑同一份逻辑。 */
      let dynasty = state.dynasty;
      let dynPlan = null;
      if (CONFIG.dynasty.enabled && p.dayKey) {
        const plan = dynastyUtil.planSettle(state.dynasty, p.dayKey, {
          mode: 'pve', result: result.result, stars: result.stars,
          playStyle: (state.roster && state.roster.playStyle) || 'balanced',
          firstClear: !prevRec, gold: Math.max(0, Number(rewards.gold) || 0)
        });
        if (plan.settled) { dynasty = plan.dynasty; dynPlan = plan; }
      }

      /* 每日任务（里程碑 4）：PVE 结算 → 计数推进（场次 / 胜场 / 体力消耗）+ 达成发奖。
       * dayKey 口径与王朝 / 竞技场 / 交易市场一致；缺 dayKey（老调用方 / 直派测试）⇒ 不记账。 */
      let daily = state.daily;
      let dailyPlan = null;
      if (CONFIG.daily.enabled && p.dayKey) {
        const plan = dailyUtil.planSettle(state.daily, p.dayKey, {
          battles: 1,
          wins: result.result === 'win' ? 1 : 0,
          staminaSpent: Math.max(0, Number(p.staminaCost) || 0)
        });
        if (plan.settled) { daily = plan.daily; dailyPlan = plan; }
      }

      const next = Object.assign({}, state, {
        profile: copy(profile), bag: bag, season: season, stats: stats,
        dynasty: dynasty, daily: daily, lastMatch: result, updatedAt: now
      });
      /* 王朝赛季的三类事件（跨窗滚动 / 任务达成 / 升级）依次推通知；先于战报通知压栈 ⇒ 战报仍在动态流 [0]（阅读顺序不变） */
      if (dynPlan) {
        if (dynPlan.rolled) pushNotice(next, '王朝赛季：新赛季开启，赛季积分、任务与领奖记录已重置', 'dynasty', now);
        if (dynPlan.missionsCompleted.length) {
          const mp = dynPlan.missionsCompleted.reduce(function (s, m) { return s + (Number(m.points) || 0); }, 0);
          pushNotice(next, '赛季任务达成：' + dynPlan.missionsCompleted[0].name +
            (dynPlan.missionsCompleted.length > 1 ? ' 等 ' + dynPlan.missionsCompleted.length + ' 项' : '') +
            '（积分 +' + mp + '）', 'dynasty', now);
        } else if (dynPlan.levelAfter > dynPlan.levelBefore) {
          pushNotice(next, '王朝赛季升至 Lv.' + dynPlan.levelAfter + '，通行证有奖励可领', 'dynasty', now);
        }
      }
      if (dailyPlan) {
        if (dailyPlan.rolled) pushNotice(next, '每日任务已刷新（新的一天）', 'daily', now);
        grantDailyRewards(next, dailyPlan, now);
      }
      if (p.stageId) pushNotice(next, (result.result === 'win' ? '战胜 ' : '不敌 ') + ((result.away && result.away.name) || '对手') + ' ' + result.homeScore + ':' + result.awayScore, 'battle', now);
      return next;
    }

    /* ---------------- 竞技场（异步 PVP，里程碑 2） ----------------
     * 与 BATTLE_RESULT 的差别（config.arena 裁决 6）：只推进 arena 段与货币，
     * **不写 season.cleared、不发星级、不混入 stats（执教战绩仍是 PVE 口径）**。
     * dayKey / ratingDelta / snapshot 全部由 commands 层算好后传进来 —— reducer 不读时间、不做业务判断以外的计算。 */
    case T.ARENA_RESULT: {
      const result = p.result;
      if (!result) return state;
      const cfg = CONFIG.arena;
      const rewards = p.rewards || {};
      const arena0 = state.arena || initial.emptyArena(now);

      const profile = recoverStamina(state.profile, now);
      const wasFull = profile.stamina >= CONFIG.economy.staminaMax;
      profile.stamina = Math.max(0, profile.stamina - (Number(p.staminaCost) || cfg.staminaCost));
      // 从「满体力」跌破上限的那一刻开始计时恢复（与 SPEND_STAMINA 同一条口径）
      if (wasFull) profile.staminaAt = now;
      profile.gold = profile.gold + (Number(rewards.gold) || 0);
      profile.diamond = profile.diamond + (Number(rewards.diamond) || 0);
      profile.exp = profile.exp + (Number(rewards.exp) || 0);
      profile.arenaCoin = (Number(profile.arenaCoin) || 0) + (Number(rewards.arenaCoin) || 0);
      while (profile.exp >= levelExpNeed(profile.level)) {
        profile.exp -= levelExpNeed(profile.level);
        profile.level += 1;
      }

      let bag = state.bag;
      if (rewards.shard) bag = bagAdd(bag, 'shard', Number(rewards.shard));

      const arena = copy(arena0);
      // 跨天则先清零当日次数（dailyOf 的同一套口径，只是这里要落库）
      const dayKey = p.dayKey || arena.dayKey;
      if (arena.dayKey !== dayKey) { arena.dayKey = dayKey; arena.usedToday = 0; arena.extraToday = 0; }
      arena.usedToday = (Number(arena.usedToday) || 0) + 1;
      arena.rating = Math.max(cfg.ratingMin, (Number(arena.rating) || cfg.ratingStart) + (Number(p.ratingDelta) || 0));
      arena.lastRatingDelta = Number(p.ratingDelta) || 0;
      arena.matches = (Number(arena.matches) || 0) + 1;
      if (result.result === 'win') {
        arena.wins = (Number(arena.wins) || 0) + 1;
        arena.streak = (Number(arena.streak) || 0) + 1;
        arena.bestStreak = Math.max(Number(arena.bestStreak) || 0, arena.streak);
      } else {
        if (result.result === 'lose') arena.losses = (Number(arena.losses) || 0) + 1;
        else arena.draws = (Number(arena.draws) || 0) + 1;
        arena.streak = 0;
      }

      const beaten = copy(arena.beaten || {});
      const prev = beaten[p.opponentId] || null;
      beaten[p.opponentId] = {
        wins: (prev ? Number(prev.wins) || 0 : 0) + (result.result === 'win' ? 1 : 0),
        losses: (prev ? Number(prev.losses) || 0 : 0) + (result.result === 'lose' ? 1 : 0),
        draws: (prev ? Number(prev.draws) || 0 : 0) + (result.result === 'draw' ? 1 : 0),
        bestMargin: Math.max(prev ? Number(prev.bestMargin) || -999 : -999, result.margin),
        firstWinAt: (prev && prev.firstWinAt) || (result.result === 'win' ? now : 0),
        lastAt: now
      };
      arena.beaten = beaten;

      /* 历史行 = 结果摘要 + 可复现快照（seed + 卡牌实例引用）。不存整份战报：
       * 一局 105 条日志约 40KB，存 20 局会顶到小程序单 key 1MB 上限，而战报可由快照随时重算。 */
      const row = {
        at: now,
        opponentId: p.opponentId,
        opponentName: p.opponentName || ((result.away || {}).name || '对手'),
        seed: p.seed || result.seed,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        result: result.result,
        margin: result.margin,
        ot: result.ot || 0,
        ratingDelta: Number(p.ratingDelta) || 0,
        snapshot: p.snapshot || null
      };
      arena.history = [row].concat(Array.isArray(arena.history) ? arena.history : []).slice(0, cfg.historyMax);

      /* 王朝赛季（里程碑 3 第三块）：天梯结算同样计入赛季积分与任务。
       * config.arena 裁决 6 只限定「不发星级、不写 season.cleared」—— 赛季积分是跨模式的活动账，
       * 与 PVE 星级是两回事；dayKey 用 action 自带的（commands 切片），与每日次数同一口径。 */
      let dynasty = state.dynasty;
      let dynPlan = null;
      if (CONFIG.dynasty.enabled && p.dayKey) {
        const plan = dynastyUtil.planSettle(state.dynasty, p.dayKey, {
          mode: 'arena', result: result.result,
          playStyle: (state.roster && state.roster.playStyle) || 'balanced',
          firstClear: false, gold: Math.max(0, Number(rewards.gold) || 0)
        });
        if (plan.settled) { dynasty = plan.dynasty; dynPlan = plan; }
      }

      /* 每日任务（里程碑 4）：天梯结算 → 场次 / 胜场 / 天梯场次 / 体力消耗推进 + 达成发奖 */
      let daily = state.daily;
      let dailyPlan = null;
      if (CONFIG.daily.enabled && p.dayKey) {
        const plan = dailyUtil.planSettle(state.daily, p.dayKey, {
          battles: 1,
          wins: result.result === 'win' ? 1 : 0,
          arenaBattles: 1,
          staminaSpent: Math.max(0, Number(p.staminaCost) || cfg.staminaCost)
        });
        if (plan.settled) { daily = plan.daily; dailyPlan = plan; }
      }

      const next = Object.assign({}, state, { profile: copy(profile), bag: bag, arena: arena, dynasty: dynasty, daily: daily, updatedAt: now });
      /* 王朝赛季通知先于竞技场通知压栈 ⇒ 竞技场战报仍在动态流 [0]（与 BATTLE_RESULT 同规） */
      if (dynPlan) {
        if (dynPlan.rolled) pushNotice(next, '王朝赛季：新赛季开启，赛季积分、任务与领奖记录已重置', 'dynasty', now);
        if (dynPlan.missionsCompleted.length) {
          const mp = dynPlan.missionsCompleted.reduce(function (s, m) { return s + (Number(m.points) || 0); }, 0);
          pushNotice(next, '赛季任务达成：' + dynPlan.missionsCompleted[0].name +
            (dynPlan.missionsCompleted.length > 1 ? ' 等 ' + dynPlan.missionsCompleted.length + ' 项' : '') +
            '（积分 +' + mp + '）', 'dynasty', now);
        } else if (dynPlan.levelAfter > dynPlan.levelBefore) {
          pushNotice(next, '王朝赛季升至 Lv.' + dynPlan.levelAfter + '，通行证有奖励可领', 'dynasty', now);
        }
      }
      if (dailyPlan) {
        if (dailyPlan.rolled) pushNotice(next, '每日任务已刷新（新的一天）', 'daily', now);
        grantDailyRewards(next, dailyPlan, now);
      }
      pushNotice(next, '竞技场' + (result.result === 'win' ? '战胜 ' : (result.result === 'draw' ? '战平 ' : '不敌 ')) +
        row.opponentName + ' ' + result.homeScore + ':' + result.awayScore +
        '（积分 ' + (row.ratingDelta >= 0 ? '+' : '') + row.ratingDelta + '）', 'arena', now);
      return next;
    }

    /* ---------------- 王朝赛季 / 赛季通行证（第八章「创新玩法」，里程碑 3 第三块） ----------------
     * 跨窗滚动 / 领奖门禁 / 王朝轨解锁全部走 utils/dynasty.js 的纯函数；reducer 是最后一道闸：
     * 非法 payload（缺 dayKey / 等级越界 / 轨名注入 / 未达成 / 未解锁 / 余额不足）一律原样返回 state。 */
    case T.DYNASTY_SYNC: {
      if (!CONFIG.dynasty.enabled) return state;
      if (dynastyUtil.dayNumber(p.dayKey) === null) return state;
      const roll = dynastyUtil.rollIfNeeded(state.dynasty, p.dayKey);
      if (!roll.rolled) return state;
      const next = Object.assign({}, state, { dynasty: roll.dynasty, updatedAt: now });
      pushNotice(next, '王朝赛季：新赛季开启，赛季积分、任务与领奖记录已重置', 'dynasty', now);
      return next;
    }

    case T.DYNASTY_CLAIM: {
      if (!CONFIG.dynasty.enabled) return state;
      if (dynastyUtil.dayNumber(p.dayKey) === null) return state;
      const plan = dynastyUtil.planClaim(state.dynasty, p.dayKey, p.track, p.level);
      if (!plan.ok) return state;
      const d = copy(plan.dynasty);
      d.claimed = copy(d.claimed);
      d.claimed[plan.track + ':' + plan.level] = true;
      const profile = copy(state.profile);
      let bag = state.bag;
      plan.rewards.forEach(function (r) {
        if (r.kind === 'gold') profile.gold = (Number(profile.gold) || 0) + (Number(r.amount) || 0);
        else if (r.kind === 'diamond') profile.diamond = (Number(profile.diamond) || 0) + (Number(r.amount) || 0);
        else if (r.kind === 'item') bag = bagAdd(bag, r.id, Math.max(1, Number(r.count) || 1));
      });
      const next = Object.assign({}, state, { profile: profile, bag: bag, dynasty: d, updatedAt: now });
      pushNotice(next, '王朝通行证：领取 Lv.' + plan.level + ' 奖励（' + dynastyUtil.rewardsText(plan.rewards) + '）', 'dynasty', now);
      return next;
    }

    case T.DYNASTY_PREMIUM: {
      if (!CONFIG.dynasty.enabled) return state;
      if (dynastyUtil.dayNumber(p.dayKey) === null) return state;
      const cost = Number(CONFIG.dynasty.premiumCost) || 0;
      const roll = dynastyUtil.rollIfNeeded(state.dynasty, p.dayKey);
      const d = roll.dynasty;
      if (d.premium || !(cost > 0)) return state;
      if ((Number(state.profile.diamond) || 0) < cost) return state;
      const profile = copy(state.profile);
      profile.diamond = (Number(profile.diamond) || 0) - cost;
      const next = Object.assign({}, state, {
        profile: profile, dynasty: Object.assign({}, d, { premium: true }), updatedAt: now
      });
      pushNotice(next, '王朝赛季：王朝轨已解锁 -' + cost + ' 钻石', 'dynasty', now);
      return next;
    }

    /* ---------------- 每日任务 / 钻石商店（里程碑 4） ----------------
     * 跨天滚动走 utils/daily.js 的纯函数；reducer 是最后一道闸：非法 payload（缺 / 脏 dayKey、
     * 伪造价格与货币、余额不足）一律原样返回 state。 */
    case T.DAILY_SYNC: {
      if (!CONFIG.daily.enabled) return state;
      if (!dailyUtil.isValidKey(p.dayKey)) return state;
      const roll = dailyUtil.rollIfNeeded(state.daily, p.dayKey);
      if (!roll.rolled) return state;
      const next = Object.assign({}, state, { daily: roll.daily, updatedAt: now });
      pushNotice(next, '每日任务已刷新（新的一天）', 'daily', now);
      return next;
    }

    /* 钻石商店：定义在 data/items.js#CONSUMABLES（带 price 的条目）。
     * 定价与货币由 reducer 从数据重算对账（直派伪造 payload 一律不动存档）；只卖补给，不卖直接战力。 */
    case T.SHOP_BUY: {
      const item = itemsData.getItem(p.itemId);
      if (!item || !(Number(item.price) > 0)) return state;
      if (item.currency !== 'diamond' && item.currency !== 'gold') return state;
      if (Number(p.price) !== Number(item.price) || p.currency !== item.currency) return state;
      const profile = copy(state.profile);
      const wallet = Number(profile[item.currency]) || 0;
      if (wallet < Number(item.price)) return state;
      profile[item.currency] = wallet - Number(item.price);
      const bag = bagAdd(state.bag, item.id, 1);
      const next = Object.assign({}, state, { profile: profile, bag: bag, updatedAt: now });
      pushNotice(next, '钻石商店：购买 ' + item.name + ' -' + item.price + (item.currency === 'diamond' ? ' 钻石' : ' 金币'), 'shop', now);
      return next;
    }

    case T.SET_SETTING: {
      const settings = copy(state.settings);
      settings[p.key] = p.value;
      return Object.assign({}, state, { settings: settings, updatedAt: now });
    }

    case T.PUSH_NOTICE: {
      const next = copy(state);
      next.notices = (state.notices || []).slice();
      pushNotice(next, p.notice && p.notice.text, (p.notice && p.notice.kind) || 'info', now);
      return next;
    }

    case T.CLEAR_NOTICES: {
      return Object.assign({}, state, { notices: [] });
    }

    default:
      return state;
  }
}

/* 经理等级经验阈值（简单线性增长） */
function levelExpNeed(level) {
  return Math.round(CONFIG.economy.expToNextBase * (1 + (level - 1) * 0.35));
}

/* 一键最优阵容：按位置挑有效 OVR 最高的卡进首发，其余高分进替补 */
function autoFill(state) {
  const positions = CONFIG.roster.slotPositions;
  const uids = Object.keys(state.collection);
  const scored = uids.map(function (uid) {
    const inst = state.collection[uid];
    const def = players.getCard(inst.cardId);
    if (!def) return null;
    const eff = growth.effectiveCard(def, inst, itemsData.EQUIP_INDEX);
    return { uid: uid, position: def.position, ovr: eff.ovr };
  }).filter(Boolean);

  const starters = [null, null, null, null, null];
  const used = [];
  positions.forEach(function (pos, i) {
    const cand = scored.filter(function (c) { return c.position === pos && used.indexOf(c.uid) === -1; })
      .sort(function (a, b) { return b.ovr - a.ovr; });
    if (cand.length) { starters[i] = cand[0].uid; used.push(cand[0].uid); }
  });
  // 位置没凑齐就用剩余最高分补位
  const rest = scored.filter(function (c) { return used.indexOf(c.uid) === -1; }).sort(function (a, b) { return b.ovr - a.ovr; });
  for (let i = 0; i < starters.length; i++) {
    if (starters[i]) continue;
    const cand = rest.shift();
    if (cand) { starters[i] = cand.uid; used.push(cand.uid); }
  }
  const bench = rest.slice(0, CONFIG.roster.benchCount).map(function (c) { return c.uid; });
  while (bench.length < CONFIG.roster.benchCount) bench.push(null);
  // playStyle / defense 是玩家的战术选择，一键排阵不能把它们顺手清掉
  return { starters: starters, bench: bench, playStyle: state.roster.playStyle, defense: state.roster.defense || tacticsData.AUTO_DEFENSE };
}

module.exports = {
  reduce: reduce,
  recoverStamina: recoverStamina,
  nextStaminaText: nextStaminaText,
  levelExpNeed: levelExpNeed,
  autoFill: autoFill
};
