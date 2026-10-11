/* store/commands.js —— 命令层（读状态 + 计算 + 派发 Action）
 * 职责：把「需要随机 / 需要跨模块计算」的业务动作包成一个个可调用的命令，
 *       页面只调命令、看返回值，不直接拼 Action，也不碰 reducer 内部规则。
 * 约束：reducer 必须保持纯函数，所以随机与时间戳都在这一层生成后随 Action 传进去。
 *       抽卡与比赛都支持注入 seed，便于 tools/verify.mjs 做确定性回归。
 */
const CONFIG = require('../config.js');
const A = require('./actions.js');
const selectors = require('./selectors.js');
const prd = require('../utils/prd.js');
const battle = require('../utils/battle.js');
const rngUtil = require('../utils/rng.js');
const players = require('../data/players.js');
const stagesData = require('../data/stages.js');
const arenaData = require('../data/arena.js');
const tacticsData = require('../data/tactics.js');
const arenaUtil = require('../utils/arena.js');
const itemsData = require('../data/items.js');
const momentsData = require('../data/moments.js');
const momentUtil = require('../utils/moment.js');
const shopData = require('../data/shop.js');
const growth = require('../utils/growth.js');
const evolutionUtil = require('../utils/evolution.js');
const marketUtil = require('../utils/market.js');
const dailyUtil = require('../utils/daily.js');
const dynastyUtil = require('../utils/dynasty.js');
const fmt = require('../utils/format.js');

function createCommands(api) {
  const getState = api.getState;
  const dispatch = api.dispatch;

  function now() { return Date.now(); }

  function fail(reason) { return { ok: false, reason: reason }; }

  /* 对手队伍 + 合规化名覆盖（第三章第 7 条「一键切换虚构化名」）。
   * startBattle / arenaChallenge / replaySnapshot 三处必须走同一个函数：
   *   漏掉的后果是「开启化名后，事后复现的战报仍显示真名」，而且与原局不再逐字节一致
   *   （第十二章可复现红线）。data/*.js 只给卡牌原名，化名是显示层口径，只能在这里贴。 */
  function withDisplayNames(state, away) {
    (away.players || []).forEach(function (p) {
      const card = players.getCard(p.cardId);
      if (card) p.name = selectors.displayName(state, card);
    });
    return away;
  }

  /* ---------------- 招募（第七章 7.1） ---------------- */
  function pull(opts) {
    const o = opts || {};
    const state = getState();
    const pool = CONFIG.gacha.pools[o.poolKey];
    if (!pool) return fail('卡池不存在');
    const count = Number(o.count) === 10 ? CONFIG.gacha.tenPull.count : 1;

    // 计费：优先用券，否则用钻石
    const cost = { diamond: 0, ticketField: null, ticketCount: 0 };
    if (o.useTicket) {
      const owned = Number(state.profile[pool.ticketField]) || 0;
      if (owned < count) return fail(pool.ticketName + '不足（需要 ' + count + ' 张，现有 ' + owned + '）');
      cost.ticketField = pool.ticketField;
      cost.ticketCount = count;
    } else {
      const need = count === 10 ? pool.tenDiamond : pool.singleDiamond;
      if ((Number(state.profile.diamond) || 0) < need) return fail('钻石不足（需要 ' + need + '）');
      cost.diamond = need;
    }

    /* 本次时间戳只取一次：seed / 落库时间 / dayKey（每日任务计数）共用同一个 t */
    const t = now();
    const seed = o.seed || ('gacha-' + pool.key + '-' + state.stats.pulls + '-' + t.toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36));
    const rng = rngUtil.createRng(seed);
    const byRarity = players.poolIndex();
    const res = prd.pullBatch(rng, pool, state.gacha[pool.key], byRarity, count);

    dispatch(A.gachaResult({
      poolKey: pool.key, count: count, results: res.results, pity: res.pity,
      guaranteeApplied: res.guaranteeApplied, cost: cost, now: t, dayKey: fmt.dayKeyOf(t)
    }));

    return {
      ok: true,
      seed: seed,
      poolKey: pool.key,
      count: count,
      cost: cost,
      guaranteeApplied: res.guaranteeApplied,
      pity: res.pity,
      results: res.results.map(function (r) {
        const card = players.getCard(r.cardId);
        return {
          uid: null,
          cardId: r.cardId,
          name: card ? selectors.displayName(getState(), card) : r.cardId,
          alias: card ? card.alias : '',
          position: card ? card.position : '',
          number: card ? card.number : 0,
          version: card ? card.version : '',
          ovr: card ? card.ovr : 0,
          rarity: r.rarity,
          baseRarity: card ? card.rarity : r.rarity,
          colors: card ? card.colors : null,
          forced: r.forced
        };
      })
    };
  }

  /* ---------------- 比赛（第七章 7.4） ---------------- */
  function computeRewards(stage, result, firstClear) {
    const base = stage.rewards || {};
    const win = result.result === 'win';
    const mult = win ? 1 : (result.result === 'draw' ? 0.5 : 0.3);
    const out = {
      gold: Math.round((Number(base.gold) || 0) * mult),
      diamond: win ? (Number(base.diamond) || 0) : 0,
      exp: win ? (Number(base.exp) || 0) : CONFIG.economy.expPerLose,
      shard: win ? (Number(base.shard) || 0) : 0,
      item: win ? (base.item || null) : null,
      ticketNormal: win ? (Number(base.ticketNormal) || 0) : 0,
      ticketAdvanced: win ? (Number(base.ticketAdvanced) || 0) : 0,
      firstClear: false,
      stars: result.stars
    };
    if (win && firstClear) {
      out.gold += stagesData.FIRST_CLEAR_BONUS.gold;
      out.diamond += stagesData.FIRST_CLEAR_BONUS.diamond;
      out.firstClear = true;
    }
    return out;
  }

  /* 结算返回值里的王朝赛季增量（结算面板用；null = 未开启 / 未记账） */
  function dynastyGainsOf(plan) {
    if (!plan || !plan.settled) return null;
    return {
      pointsGained: plan.pointsGained,
      level: plan.levelAfter,
      levelUp: plan.levelAfter > plan.levelBefore,
      missions: plan.missionsCompleted.map(function (m) { return m.name; })
    };
  }

  /* 结算返回值里的每日任务增量（结算面板用；null = 未开启 / 未记账） */
  function dailyGainsOf(plan) {
    if (!plan || !plan.settled) return null;
    const list = plan.completed || [];
    return {
      rolled: !!plan.rolled,
      completed: list.map(function (m) { return { id: m.id, name: m.name, rewardText: dailyUtil.rewardText(m.reward) }; }),
      text: list.length ? ('完成 ' + dailyUtil.completedText(list) + '（奖励已入账）') : ''
    };
  }

  function startBattle(opts) {
    const o = opts || {};
    const state = getState();
    const stage = stagesData.getStage(o.stageId);
    if (!stage) return fail('关卡不存在');

    const view = selectors.rosterView(state);
    if (view.starterCount < CONFIG.roster.starterCount) return fail('首发不足 5 人，请先去阵容页排兵');
    if (view.overCap) return fail('薪资超出工资帽 ' + fmt.salaryText(view.totalSalary - view.salaryCap) + '，无法出战');

    /* 本场时间戳只取一次：playedAt / dayKey / 落库时间共用同一个 t（跨零点前后不会一半算今天一半算明天） */
    const t = now();
    const stam = selectors.staminaView(state, t);
    if (stam.value < stage.staminaCost) return fail('体力不足（需要 ' + stage.staminaCost + '，现有 ' + stam.value + '）');

    const seed = o.seed || rngUtil.newSeed('s-' + stage.id);
    const home = selectors.homeTeam(state);
    const away = withDisplayNames(state, stagesData.buildAwayTeam(stage, o.awayBoost || 1));

    const result = battle.simulate({ home: home, away: away, seed: seed, playedAt: t });
    const prev = (state.season.cleared || {})[stage.id];
    const rewards = computeRewards(stage, result, !prev);
    const dayKey = fmt.dayKeyOf(t);

    /* 王朝赛季计划（里程碑 3 第三块）：与 reducer 跑同一份纯函数 planSettle（同参 ⇒ 同解），
     * 返回值里的积分 / 升级 / 任务信息给结算面板用；落库仍由 reducer 复核。 */
    const dynastyPlan = CONFIG.dynasty.enabled ? dynastyUtil.planSettle(state.dynasty, dayKey, {
      mode: 'pve', result: result.result, stars: result.stars,
      playStyle: (state.roster && state.roster.playStyle) || 'balanced',
      firstClear: !prev, gold: rewards.gold
    }) : null;

    /* 每日任务计划（里程碑 4）：与 reducer 跑同一份纯函数（同参 ⇒ 同解），返回值给结算面板用 */
    const dailyPlan = CONFIG.daily.enabled ? dailyUtil.planSettle(state.daily, dayKey, {
      battles: 1,
      wins: result.result === 'win' ? 1 : 0,
      staminaSpent: stage.staminaCost
    }) : null;

    dispatch(A.battleResult({ result: result, stageId: stage.id, staminaCost: stage.staminaCost, rewards: rewards, dayKey: dayKey, now: t }));
    return {
      ok: true, result: result, rewards: rewards, seed: seed, stage: stage,
      dynasty: dynastyGainsOf(dynastyPlan),
      daily: dailyGainsOf(dailyPlan)
    };
  }

  /* 复现一局（第十二章验收「比赛结算可复现」）：同 seed + 同阵容 ⇒ 逐回合一致 */
  function replay(seed, home, away) {
    return battle.simulate({ home: home, away: away, seed: seed });
  }

  /* ---------------- 阵容（第七章 7.2） ---------------- */
  function assignSlot(slot, index, uid) {
    const state = getState();
    if (!uid) { dispatch(A.clearRosterSlot(slot, index)); return { ok: true }; }
    if (!state.collection[uid]) return fail('卡牌不存在');
    dispatch(A.setRosterSlot(slot, index, uid));
    const view = selectors.rosterView(getState());
    return { ok: true, overCap: view.overCap, totalSalary: view.totalSalary };
  }

  function swap(from, to) {
    dispatch(A.swapRoster(from, to));
    const view = selectors.rosterView(getState());
    return { ok: true, overCap: view.overCap, totalSalary: view.totalSalary };
  }

  function autoFill() {
    dispatch(A.autoFillRoster());
    const view = selectors.rosterView(getState());
    return { ok: true, avgOvr: view.avgOvr, totalSalary: view.totalSalary, overCap: view.overCap };
  }

  function setPlayStyle(style) {
    if (!tacticsData.PLAY_STYLES[style]) return fail('打法不存在');
    dispatch(A.setPlayStyle(style));
    return { ok: true };
  }

  /* 防守策略（里程碑 2 战术克制）：'auto' 或 data/tactics.js DEFENSES 里的 key */
  function setDefense(key) {
    if (!tacticsData.isDefenseKey(key)) return fail('防守策略不存在');
    dispatch(A.setDefense(key));
    return { ok: true, defense: key };
  }

  /* ---------------- 竞技场（第七章 7.4「模式：竞技场（异步 PVP）」，里程碑 2） ----------------
   * 一场挑战 = 校验（阵容/工资帽/解锁/每日次数/体力）→ 拼 seed → 跑 utils/battle.js → 结算 → 落库。
   * 「异步」体现在：对手是 data/arena.js 里的阵容快照，不需要对方在线；
   *   结果由 seed 决定，存下 { seed + 我方卡牌实例引用 + 对手 id } 就能随时离线复现（replaySnapshot）。 */
  function arenaChallenge(opts) {
    const o = opts || {};
    const state = getState();
    if (!CONFIG.arena.enabled) return fail('竞技场尚未开放');
    const opp = arenaData.getOpponent(o.opponentId);
    if (!opp) return fail('对手不存在');

    /* 本场时间戳只取一次：dayKey / seed / playedAt / 落库共用同一个 t */
    const t = now();

    const view = selectors.rosterView(state);
    if (view.starterCount < CONFIG.roster.starterCount) return fail('首发不足 5 人，请先去阵容页排兵');
    if (view.overCap) return fail('薪资超出工资帽 ' + fmt.salaryText(view.totalSalary - view.salaryCap) + '，无法出战');

    const av = selectors.arenaView(state, t);
    const row = av.ladder.filter(function (r) { return r.id === opp.id; })[0];
    if (!row || !row.unlocked) return fail('先赢下前一位对手，才能挑战 ' + opp.name);
    if (av.daily.left <= 0) {
      /* 加赛（里程碑 5）：还有加赛出口时把出路写进失败文案 —— 打到上限的时刻最需要知道「还能打」 */
      const extraOut = av.extra && av.extra.enabled && !av.extra.soldOut;
      return fail('今日挑战次数已用完（每日 ' + CONFIG.arena.dailyChallenges + ' 场' + (extraOut ? '，可在竞技场页用钻石加赛' : '') + '）');
    }

    const stam = selectors.staminaView(state, t);
    if (stam.value < CONFIG.arena.staminaCost) return fail('体力不足（需要 ' + CONFIG.arena.staminaCost + '，现有 ' + stam.value + '）');

    /* seed 口径：对手 id + 本地日期 + 当日第几场。同一天重复挑战同一对手也是新的一局（末位递增）。 */
    const seed = o.seed || ('arena-' + opp.id + '-' + av.daily.dayKey + '-' + (av.daily.used + 1));

    const home = selectors.homeTeam(state);
    const away = withDisplayNames(state, arenaData.buildAwayTeam(opp));

    /* mode:'arena' 只影响解说文案池（data/commentary.js 的 ARENA_MIX），不改任何数值 ——
     * 但**必须**与 replaySnapshot 传同一个 mode，否则历史回放会复现出另一套文案，
     * 「同 seed 逐字节一致」当场破（J 组会抓）。 */
    const result = battle.simulate({ home: home, away: away, seed: seed, mode: 'arena', playedAt: t });
    const arena = state.arena || {};
    const beaten = arena.beaten || {};
    const settled = arenaUtil.settle(opp, result, {
      firstWin: !(beaten[opp.id] && beaten[opp.id].wins),
      myRating: arena.rating === undefined ? CONFIG.arena.ratingStart : arena.rating,
      streak: arena.streak || 0
    });
    const snapshot = arenaUtil.snapshotOf({
      seed: seed, opponentId: opp.id, at: t,
      playStyle: home.playStyle, defense: home.defense,
      /* playedAt 与原局 simulate 传的是同一个 now() 口径，复现才能逐字节一致 */
      playedAt: result.playedAt,
      instances: home.players.map(function (p) { return state.collection[p.uid]; }).filter(Boolean)
    });

    /* 王朝赛季计划（里程碑 3 第三块）：与 reducer 跑同一份纯函数（同参 ⇒ 同解） */
    const dynastyPlan = CONFIG.dynasty.enabled ? dynastyUtil.planSettle(state.dynasty, av.daily.dayKey, {
      mode: 'arena', result: result.result,
      playStyle: (state.roster && state.roster.playStyle) || 'balanced',
      firstClear: false, gold: settled.rewards.gold
    }) : null;

    /* 每日任务计划（里程碑 4）：与 reducer 跑同一份纯函数（同参 ⇒ 同解） */
    const dailyPlan = CONFIG.daily.enabled ? dailyUtil.planSettle(state.daily, av.daily.dayKey, {
      battles: 1,
      wins: result.result === 'win' ? 1 : 0,
      arenaBattles: 1,
      staminaSpent: CONFIG.arena.staminaCost
    }) : null;

    dispatch(A.arenaResult({
      result: result, opponentId: opp.id, opponentName: opp.name,
      rewards: settled.rewards, ratingDelta: settled.ratingDelta,
      staminaCost: CONFIG.arena.staminaCost, dayKey: av.daily.dayKey,
      seed: seed, snapshot: snapshot, now: t
    }));

    return {
      ok: true, mode: 'arena', result: result, rewards: settled.rewards, seed: seed,
      opponent: opp, ratingDelta: settled.ratingDelta, ratingAfter: settled.ratingAfter,
      expected: settled.expected, streakAfter: settled.streakAfter, streakBonus: settled.streakBonus,
      firstWin: settled.firstWin, snapshot: snapshot,
      dynasty: dynastyGainsOf(dynastyPlan),
      daily: dailyGainsOf(dailyPlan)
    };
  }

  /* 加赛（里程碑 5）：钻石加购当日挑战次数。
   * 三层闸：开关 → 未购满 → 钻石够；价格与 n 由 reducer 用同一份纯输入重算对账（直派伪造无效）。
   * 与 arenaChallenge 同口径只取一次时间（dayKey 从它切片），保证「同一天」两侧判据一致。 */
  function arenaBuyExtra() {
    const state = getState();
    if (!CONFIG.arena.enabled) return fail('竞技场尚未开放');
    const ecfg = CONFIG.arena.extraChallenges || {};
    if (!ecfg.enabled) return fail('加赛尚未开放');
    const t = now();
    const av = selectors.arenaView(state, t);
    if (av.extra.soldOut) return fail('今日加赛已购满（每日最多 +' + av.extra.max + ' 场）');
    if (!av.extra.affordable) return fail('钻石不足（需要 ' + av.extra.cost + '，现有 ' + av.diamonds + '）');
    dispatch(A.arenaBuyExtra(av.daily.dayKey, av.extra.bought + 1, av.extra.cost, t));
    return { ok: true, bought: av.extra.bought + 1, cost: av.extra.cost, total: av.daily.total + 1 };
  }

  /* 用存档里的快照复现一场历史对局：同 seed + 同双方阵容 ⇒ 逐回合一致（第十二章验收口径） */
  function replaySnapshot(snapshot) {
    if (!snapshot || !snapshot.seed) return fail('快照无效');
    const opp = arenaData.getOpponent(snapshot.opponentId);
    if (!opp) return fail('对手不存在：' + snapshot.opponentId);
    const home = selectors.homeTeamFromSnapshot(getState(), snapshot);
    if (!home) return fail('快照阵容不完整（卡牌可能已被消耗或替换）');
    const away = withDisplayNames(getState(), arenaData.buildAwayTeam(opp));
    /* 快照只存 seed + 阵容（含 moment 佩戴状态），mode 由「这是竞技场历史」这一事实隐含 ⇒ 这里固定传 'arena'，
     * 与 arenaChallenge 的原局同口径。少了这个参数，回放的文案池会退回 PVE，逐字节一致就红了。 */
    return {
      ok: true, mode: 'arena',
      result: battle.simulate({
        home: home, away: away, seed: snapshot.seed, mode: 'arena',
        /* 传快照里存的原开赛时间 ⇒ 复现结果与原局**逐字节**一致，不需要验收脚本 strip 任何字段 */
        playedAt: Number(snapshot.playedAt) || 0
      })
    };
  }

  /* ---------------- 养成（第七章 7.5） ---------------- */
  function levelUp(uid) {
    const state = getState();
    const inst = state.collection[uid];
    if (!inst) return fail('卡牌不存在');
    const check = growth.checkLevelUp(inst, state.profile);
    if (!check.ok) return fail(check.reason);
    dispatch(A.levelUp(uid, check.cost, now()));
    return { ok: true, level: check.nextLevel, cost: check.cost };
  }

  /* 找一张可以当材料的同名卡（优先未在阵容里、养成度最低的） */
  function findDonor(uid) {
    const state = getState();
    const inst = state.collection[uid];
    if (!inst) return null;
    const dups = selectors.duplicatesOf(state, inst.cardId).filter(function (u) { return u !== uid; });
    if (!dups.length) return null;
    return dups.map(function (u) {
      const d = state.collection[u];
      return { uid: u, score: (selectors.inRoster(state, u) ? 1000 : 0) + d.stars * 10 + d.level };
    }).sort(function (a, b) { return a.score - b.score; })[0].uid;
  }

  function starUp(uid) {
    const state = getState();
    const inst = state.collection[uid];
    if (!inst) return fail('卡牌不存在');
    if (inst.stars >= growth.limits.starMax) return fail('已满星（' + growth.limits.starMax + ' 星）');
    const need = growth.starUpCost(inst.stars);
    const dups = selectors.duplicatesOf(state, inst.cardId).filter(function (u) { return u !== uid; });
    if (dups.length < need) return fail('需要 ' + need + ' 张同名卡（现有 ' + dups.length + ' 张）');
    const donor = findDonor(uid);
    dispatch(A.starUp(uid, donor));
    return { ok: true, stars: inst.stars + 1, consumed: donor };
  }

  function breakthrough(uid) {
    const state = getState();
    const inst = state.collection[uid];
    if (!inst) return fail('卡牌不存在');
    const cost = growth.breakCost(inst.breakthrough);
    if (!cost) return fail('已满突破（+' + growth.limits.breakMax + '）');
    if ((Number(state.profile.gold) || 0) < cost.gold) return fail('金币不足，需要 ' + fmt.numText(cost.gold));
    if ((Number(state.bag.shard) || 0) < cost.shard) return fail('突破碎片不足，需要 ' + cost.shard + ' 个（现有 ' + (Number(state.bag.shard) || 0) + '）');
    dispatch(A.breakthrough(uid, cost));
    return { ok: true, breakthrough: inst.breakthrough + 1, cost: cost };
  }

  function equip(uid, itemId) {
    const state = getState();
    if (!state.collection[uid]) return fail('卡牌不存在');
    if (!itemsData.isEquipment(itemId)) return fail('不是装备');
    if ((Number(state.bag[itemId]) || 0) <= 0) return fail('背包里没有这件装备');
    dispatch(A.equip(uid, itemId));
    return { ok: true };
  }

  function unequip(uid, slot) {
    const state = getState();
    if (!state.collection[uid]) return fail('卡牌不存在');
    dispatch(A.unequip(uid, slot));
    return { ok: true };
  }

  /* ---------------- 名场面时刻卡（第八章，里程碑 2） ----------------
   * 与装备完全同一套语义：卡实例在背包里扣 1，戴到球员身上，换下时退回背包。
   * 命令层的校验与 reducer 一模一样 —— reducer 是最后一道闸，命令层负责给出**可读的失败原因**，
   * 页面把 reason 直接丢给 wx.showToast 即可，不用自己判断（AGENTS.md §3：页面不放业务规则）。 */
  function equipMoment(uid, momentId) {
    const state = getState();
    if (!CONFIG.moment.enabled) return fail('名场面时刻卡尚未开放');
    if (!state.collection[uid]) return fail('卡牌不存在');
    if (!momentsData.isMoment(momentId)) return fail('不是时刻卡');
    if ((Number(state.bag[momentId]) || 0) <= 0) return fail('背包里没有这张时刻卡，去竞技商城兑换');
    dispatch(A.equipMoment(uid, momentId));
    const def = momentsData.getMoment(momentId);
    return { ok: true, moment: momentId, name: def.name, effectText: momentUtil.summaryOf(def) };
  }

  function unequipMoment(uid) {
    const state = getState();
    if (!state.collection[uid]) return fail('卡牌不存在');
    const old = state.collection[uid].moment;
    if (!old) return fail('这名球员没有佩戴时刻卡');
    dispatch(A.unequipMoment(uid));
    return { ok: true, returned: old };
  }

  /* ---------------- 竞技商城（里程碑 2：竞技币消费出口） ----------------
   * 三道闸与 reducer 的 ARENA_BUY 逐条对应：开关 → 限购 → 余额。
   * 两边必须同口径，否则会出现「按钮亮着但点了没反应」（视图说能买、reducer 悄悄 return state），
   * 这是最难查的一类 bug；M 组用交叉校验锁死（对每个条目同时问 shopView.canBuy 与 buyArenaItem.ok）。 */
  function buyArenaItem(entryId) {
    const state = getState();
    const scfg = CONFIG.arena.shop || {};
    if (!CONFIG.arena.enabled) return fail('竞技场尚未开放');
    if (!scfg.enabled) return fail('竞技商城尚未开放');
    const entry = shopData.getEntry(entryId);
    if (!entry) return fail('商品不存在');
    const coinName = scfg.currencyName || '竞技币';
    const arena = state.arena || {};
    const bought = Number((arena.shopBought || {})[entryId]) || 0;
    const limit = Number(entry.limit) || 0;
    if (limit > 0 && bought >= limit) return fail('这件商品已兑满（限购 ' + limit + ' 件）');
    const price = Number(entry.price) || 0;
    const coin = Number(state.profile.arenaCoin) || 0;
    if (coin < price) return fail(coinName + '不足（需要 ' + price + '，现有 ' + coin + '）');

    dispatch(A.arenaBuy(entryId, now()));
    const after = getState();
    return {
      ok: true, entryId: entryId, kind: entry.kind, ref: entry.ref,
      name: shopData.nameOf(entry), qty: Math.max(1, Number(entry.qty) || 1),
      cost: price, coinBefore: coin, coinAfter: Number(after.profile.arenaCoin) || 0
    };
  }

  /* ---------------- 时空进化（第八章「创新玩法」，里程碑 3） ----------------
   * 三条命令与 reducer 的 EVOLVE_* 逐条同口径：命令层给**可读 reason**，reducer 是最后一道闸。
   * 材料选择规则（config.evolution 裁决 4）：同版本优先「未在阵容 + 养成度最低」的实例
   * （和升星 findDonor 同规）；但材料**不允许**是阵容中的卡（硬拒绝，不自动摘除）。
   * 候选选谁由 selectors.evolutionMaterialOf 统一决定，视图与命令共用同一份 —— 页面上看到的
   * 「能献祭 / 能分解」与命令实际选中的材料不会漂移。 */
  function ownsCard(state, cardId) {
    return Object.keys(state.collection).some(function (u) { return state.collection[u].cardId === cardId; });
  }

  function salvageCard(uid) {
    const state = getState();
    if (!evolutionUtil.enabled()) return fail('时空进化尚未开放');
    const inst = state.collection[uid];
    if (!inst) return fail('卡牌不存在');
    const def = players.getCard(inst.cardId);
    if (!def) return fail('卡牌数据缺失');
    const peak = evolutionUtil.peakCardOf(players.cardsOfPlayer(def.playerId));
    if (!peak || !evolutionUtil.peakCostOf(peak)) return fail('该球员暂无巅峰传奇版，无法获得巅峰碎片');
    if (def.id === peak.id) return fail('巅峰传奇版不能分解');
    if (selectors.inRoster(state, uid)) return fail('该卡正在阵容中，请先移出再分解');
    if (ownsCard(state, peak.id)) return fail('已拥有 ' + def.name + ' 的巅峰传奇版，无需再攒巅峰碎片');
    const gain = evolutionUtil.salvageValue(def);
    if (gain <= 0) return fail('这张卡没有分解价值');
    dispatch(A.salvageCard(uid, gain, now()));
    return { ok: true, uid: uid, cardId: def.id, playerId: def.playerId, name: def.name, version: def.version, gain: gain };
  }

  function evolvePair(playerId) {
    const state = getState();
    if (!evolutionUtil.enabled()) return fail('时空进化尚未开放');
    const defs = players.cardsOfPlayer(playerId);
    const peak = evolutionUtil.peakCardOf(defs);
    if (!peak || !evolutionUtil.peakCostOf(peak)) return fail('该球员暂无可合成的巅峰传奇版');
    const name = (defs[0] && defs[0].name) || playerId;
    if (ownsCard(state, peak.id)) return fail('已拥有 ' + name + ' 的巅峰传奇版');
    const rookie = evolutionUtil.versionCardOf(defs, evolutionUtil.VERSION_ROOKIE);
    const active = evolutionUtil.versionCardOf(defs, evolutionUtil.VERSION_ACTIVE);
    if (!rookie || !active) return fail(name + ' 缺少' + (!rookie ? '新秀版' : '现役版') + '卡牌，无法成套献祭');
    const rm = selectors.evolutionMaterialOf(state, rookie.id);
    if (!rm.total) return fail(name + ' 缺少' + rookie.version + '卡牌，无法成套献祭');
    if (!rm.uid) return fail(rookie.version + '正在阵容中，请先移出再成套献祭');
    const am = selectors.evolutionMaterialOf(state, active.id);
    if (!am.total) return fail(name + ' 缺少' + active.version + '卡牌，无法成套献祭');
    if (!am.uid) return fail(active.version + '正在阵容中，请先移出再成套献祭');
    const gain = evolutionUtil.pairValue(rookie, active);
    dispatch(A.evolvePair(playerId, rm.uid, am.uid, gain, now()));
    return { ok: true, playerId: playerId, name: name, gain: gain, rookieUid: rm.uid, activeUid: am.uid };
  }

  function synthPeak(playerId) {
    const state = getState();
    if (!evolutionUtil.enabled()) return fail('时空进化尚未开放');
    const defs = players.cardsOfPlayer(playerId);
    const peak = evolutionUtil.peakCardOf(defs);
    const cost = evolutionUtil.peakCostOf(peak);
    if (!peak || !cost) return fail('该球员暂无巅峰传奇版');
    const name = (defs[0] && defs[0].name) || playerId;
    if (ownsCard(state, peak.id)) return fail('已拥有 ' + name + ' 的巅峰传奇版');
    const balance = Number((state.evolution && state.evolution.shards && state.evolution.shards[playerId]) || 0);
    if (balance < cost) return fail('巅峰碎片不足（需要 ' + cost + '，现有 ' + balance + '）');
    dispatch(A.synthPeak(playerId, peak.id, cost, now()));
    return { ok: true, playerId: playerId, name: name, cardId: peak.id, cost: cost };
  }

  /* ---------------- 交易市场（第八章「创新玩法」，里程碑 3 第二块） ----------------
   * 货架 = f(dayKey, rerolls) 纯函数（utils/market.js）：dayKey 由 now 切片（时间只在本层取），
   * 买卡把同一对 (dayKey, rerolls) 传给 reducer，reducer 重算货架校验「卡真的在架上」；
   * 刷新只做 rerolls + 1 —— 不存库存、不存商品列表（config.market 裁决 4 / 5）。 */
  function marketBuy(cardId) {
    const state = getState();
    if (!marketUtil.enabled()) return fail('交易市场尚未开放');
    const def = players.getCard(cardId);
    if (!def) return fail('卡牌不存在');
    if (!marketUtil.isMarketable(def)) return fail('巅峰传奇版不流通（巅峰卡请走招募 / 时空进化）');
    const t = now();
    const dayKey = fmt.dayKeyOf(t);
    const rerolls = Math.floor(Number((state.market && state.market.rerolls) || 0));
    const shelf = marketUtil.shelfOf(dayKey, rerolls);
    if (!shelf.some(function (row) { return row.cardId === def.id; })) return fail('这张卡不在今日橱窗里，刷新看看');
    const price = marketUtil.buyPrice(def.rarity);
    if (!(price > 0)) return fail('这张卡暂不上架');
    const gold = Number(state.profile.gold) || 0;
    if (gold < price) return fail('金币不足（需要 ' + price + '，现有 ' + gold + '）');
    dispatch(A.marketBuy(def.id, dayKey, rerolls, price, t));
    return { ok: true, cardId: def.id, name: def.name, version: def.version, rarity: def.rarity, price: price };
  }

  function marketSell(uid) {
    const state = getState();
    if (!marketUtil.enabled()) return fail('交易市场尚未开放');
    const inst = state.collection[uid];
    if (!inst) return fail('卡牌不存在');
    const def = players.getCard(inst.cardId);
    if (!def) return fail('卡牌数据缺失');
    if (!marketUtil.isMarketable(def)) return fail('巅峰传奇版不流通（不可出售）');
    if (selectors.inRoster(state, uid)) return fail('该卡正在阵容中，请先移出再出售');
    const price = marketUtil.sellPrice(def.rarity);
    if (!(price > 0)) return fail('这张卡暂无出售价值');
    dispatch(A.marketSell(uid, price, now()));
    return { ok: true, uid: uid, cardId: def.id, name: def.name, version: def.version, rarity: def.rarity, price: price };
  }

  function marketRefresh() {
    const state = getState();
    if (!marketUtil.enabled()) return fail('交易市场尚未开放');
    const cost = marketUtil.refreshCost();
    if (!(cost > 0)) return fail('刷新暂不可用');
    const gold = Number(state.profile.gold) || 0;
    if (gold < cost) return fail('金币不足（刷新需要 ' + cost + '）');
    dispatch(A.marketRefresh(cost, now()));
    return { ok: true, cost: cost, rerolls: Math.floor(Number((state.market && state.market.rerolls) || 0)) + 1 };
  }

  function useItem(itemId, count) {
    const state = getState();
    const item = itemsData.getItem(itemId);
    if (!item) return fail('道具不存在');
    const owned = Number(state.bag[itemId]) || 0;
    if (owned <= 0) return fail('道具数量不足');
    if (itemsData.isEquipment(itemId)) return fail('装备请在球员详情页穿戴');
    dispatch(A.useItem(itemId, count || 1, now()));
    return { ok: true };
  }

  /* ---------------- 王朝赛季 & 赛季通行证（第八章「创新玩法」，里程碑 3 第三块） ----------------
   * 三道闸与 reducer 的 DYNASTY_* 用例逐条对应（与竞技商城 / 交易市场同规）：
   * 开关 → 纯函数裁决（跨窗滚动 / 等级 / 轨道 / 余额）→ reducer 复核。两侧口径必须一致，
   * 否则会出现「按钮亮着但点了没反应」（P 组用交叉校验锁死）。
   * dayKey 一律由本层从 now 切片（可复现红线：utils 不取系统时间）。 */
  function dynastySync() {
    const state = getState();
    if (!dynastyUtil.enabled()) return fail('王朝赛季尚未开放');
    const t = now();
    const dayKey = fmt.dayKeyOf(t);
    const roll = dynastyUtil.rollIfNeeded(state.dynasty, dayKey);
    if (!roll.rolled) return { ok: true, rolled: false };
    dispatch(A.dynastySync(dayKey, t));
    return { ok: true, rolled: true };
  }

  function claimDynastyReward(level, track) {
    const state = getState();
    if (!dynastyUtil.enabled()) return fail('王朝赛季尚未开放');
    const t = now();
    const dayKey = fmt.dayKeyOf(t);
    const plan = dynastyUtil.planClaim(state.dynasty, dayKey, track, level);
    if (!plan.ok) return fail(plan.reason);
    dispatch(A.dynastyClaim(plan.level, plan.track, dayKey, t));
    return { ok: true, level: plan.level, track: plan.track, rewardText: dynastyUtil.rewardsText(plan.rewards) };
  }

  function unlockDynastyPremium() {
    const state = getState();
    if (!dynastyUtil.enabled()) return fail('王朝赛季尚未开放');
    const cost = Number(CONFIG.dynasty.premiumCost) || 0;
    const t = now();
    const dayKey = fmt.dayKeyOf(t);
    const roll = dynastyUtil.rollIfNeeded(state.dynasty, dayKey);
    if (roll.dynasty.premium) return fail('王朝轨本赛季已解锁');
    if (!(cost > 0)) return fail('王朝轨暂不可购买');
    const diamond = Number(state.profile.diamond) || 0;
    if (diamond < cost) return fail('钻石不足（需要 ' + cost + '，现有 ' + diamond + '）');
    dispatch(A.dynastyPremium(dayKey, t));
    return { ok: true, cost: cost };
  }

  /* ---------------- 每日任务 / 钻石商店（里程碑 4） ----------------
   * 三道闸与 reducer 的 DAILY_SYNC / SHOP_BUY 用例逐条对应（与竞技商城 / 交易市场 / 王朝赛季同规）：
   * 开关 → 纯函数裁决 → reducer 复核；dayKey 一律由本层从 now 切片（可复现红线：utils 不取系统时间）。 */
  function dailySync() {
    const state = getState();
    if (!dailyUtil.enabled()) return fail('每日任务尚未开放');
    const t = now();
    const dayKey = fmt.dayKeyOf(t);
    const roll = dailyUtil.rollIfNeeded(state.daily, dayKey);
    if (!roll.rolled) return { ok: true, rolled: false };
    dispatch(A.dailySync(dayKey, t));
    return { ok: true, rolled: true };
  }

  /* 钻石商店买入（data/items.js#CONSUMABLES 的带价条目；只卖补给，不卖直接战力）。
   * 定价与货币直接来自数据表、与 reducer 的重算对账同源 ⇒ 不会出现「按钮亮着但点了没反应」。 */
  function buyConsumable(id) {
    const state = getState();
    const item = itemsData.getItem(id);
    if (!item || !(Number(item.price) > 0)) return fail('该商品暂未上架');
    if (item.currency !== 'diamond' && item.currency !== 'gold') return fail('该商品暂未上架');
    const wallet = Number(state.profile[item.currency]) || 0;
    if (wallet < Number(item.price)) {
      return fail((item.currency === 'diamond' ? '钻石' : '金币') + '不足（需要 ' + item.price + '，现有 ' + wallet + '）');
    }
    const t = now();
    dispatch(A.shopBuy(item.id, item.price, item.currency, t));
    return { ok: true, itemId: item.id, name: item.name, price: item.price, currency: item.currency };
  }

  /* ---------------- 存档 ---------------- */
  function resetSave() {
    dispatch(A.reset(now()));
    api.save(true);
    return { ok: true };
  }

  function exportSave() {
    return JSON.stringify(getState());
  }

  return {
    pull: pull,
    startBattle: startBattle,
    replay: replay,
    computeRewards: computeRewards,
    assignSlot: assignSlot,
    swap: swap,
    autoFill: autoFill,
    setPlayStyle: setPlayStyle,
    setDefense: setDefense,
    arenaChallenge: arenaChallenge,
    arenaBuyExtra: arenaBuyExtra,
    replaySnapshot: replaySnapshot,
    levelUp: levelUp,
    starUp: starUp,
    breakthrough: breakthrough,
    findDonor: findDonor,
    equip: equip,
    unequip: unequip,
    equipMoment: equipMoment,
    unequipMoment: unequipMoment,
    buyArenaItem: buyArenaItem,
    salvageCard: salvageCard,
    evolvePair: evolvePair,
    synthPeak: synthPeak,
    marketBuy: marketBuy,
    marketSell: marketSell,
    marketRefresh: marketRefresh,
    dynastySync: dynastySync,
    claimDynastyReward: claimDynastyReward,
    unlockDynastyPremium: unlockDynastyPremium,
    dailySync: dailySync,
    buyConsumable: buyConsumable,
    useItem: useItem,
    resetSave: resetSave,
    exportSave: exportSave
  };
}

module.exports = { createCommands: createCommands };
