/* store/selectors.js —— 派生数据单一出口（只读，不改 state）
 * 职责：把 State 转成页面直接能渲染的结构：有效卡牌、阵容视图（含工资帽校验）、
 *       图鉴进度、体力视图、比赛用的队伍对象、合规化名显示。
 * 为什么集中在这里：第十二章验收要求「主页/招募/阵容三处页面数据经 Store 同步一致」，
 * 只要三处都用同一套 selector，就不可能算出不一样的工资/OVR。
 */
const CONFIG = require('../config.js');
const players = require('../data/players.js');
const itemsData = require('../data/items.js');
const growth = require('../utils/growth.js');
const bondUtil = require('../utils/bond.js');
const bondsData = require('../data/bonds.js');
const battleUtil = require('../utils/battle.js');
const tacticsData = require('../data/tactics.js');
const arenaUtil = require('../utils/arena.js');
const arenaData = require('../data/arena.js');
const momentUtil = require('../utils/moment.js');
const momentsData = require('../data/moments.js');
const shopData = require('../data/shop.js');
const evoUtil = require('../utils/evolution.js');
const marketUtil = require('../utils/market.js');
const dynastyUtil = require('../utils/dynasty.js');
const dynastyData = require('../data/dynasty.js');
const dailyUtil = require('../utils/daily.js');
const dailyData = require('../data/daily.js');
const reducers = require('./reducers.js');
const fmt = require('../utils/format.js');

/* 合规：虚构化模式下显示化名与虚构城市（第三章第 7 条「一键切换」） */
function displayName(state, card) {
  if (!card) return '';
  return state.settings && state.settings.fictionalNames ? (card.alias || card.name) : card.name;
}

function displayCity(state, card) {
  if (!card) return '';
  return state.settings && state.settings.fictionalNames ? (card.cityAlias || card.city) : card.city;
}

/* 一张已拥有卡牌的完整有效面板 */
/* 由「卡牌实例」（state.collection 里的一条，或竞技场快照里的一条）算出有效面板。
 * 抽出来的原因：竞技场快照存的是实例引用（cardId + 养成度 + 装备），复现时必须走同一个
 * growth.effectiveCard，否则「当场结算的属性」与「事后复现的属性」会漂，可复现红线就破了。 */
function effectiveCardFrom(state, inst, dups) {
  if (!inst) return null;
  const def = players.getCard(inst.cardId);
  if (!def) return null;
  const eff = growth.effectiveCard(def, inst, itemsData.EQUIP_INDEX);
  eff.displayName = displayName(state, def);
  eff.displayCity = displayCity(state, def);
  eff.dups = dups === undefined ? duplicatesOf(state, def.id).length : dups;
  return eff;
}

function effectiveCardOf(state, uid) {
  return effectiveCardFrom(state, state.collection[uid]);
}

/* 同名卡（同 cardId）的全部 uid，升星要吃同名卡时用 */
function duplicatesOf(state, cardId) {
  return Object.keys(state.collection).filter(function (uid) { return state.collection[uid].cardId === cardId; });
}

/* 背包里全部卡牌（含未在阵容中的），按 OVR 降序 */
function ownedCards(state) {
  return Object.keys(state.collection)
    .map(function (uid) { return effectiveCardOf(state, uid); })
    .filter(Boolean)
    .sort(function (a, b) { return b.ovr - a.ovr || a.cardId.localeCompare(b.cardId); });
}

function inRoster(state, uid) {
  return state.roster.starters.indexOf(uid) !== -1 || state.roster.bench.indexOf(uid) !== -1;
}

/* ---------------- 羁绊视图（第七章 7.3，里程碑 2） ----------------
 * 与 utils/battle.js 内部调用的是**同一个** utils/bond.js，
 * 所以「阵容页看到的羁绊」与「比赛里真正生效的羁绊」在结构上不可能不一致。
 * 注意：羁绊只加战斗属性，不改 ovr / rarity / salary —— 工资帽必须与站位组合无关（config.bond 裁决 1）。 */
const BOND_STATUS_TEXT = { on: '已激活', owned: '已集齐 · 未上场', part: '部分拥有', none: '未集齐' };
const BOND_STATUS_RANK = { on: 0, owned: 1, part: 2, none: 3 };

/* 把 utils/bond.js 的判定结果压成页面能直接渲染的形状（WXML 不支持方法调用，文案必须在这里算好） */
function bondRows(evalRes) {
  return evalRes.bonds.map(function (b) {
    return {
      id: b.id,
      type: b.type,
      typeLabel: b.typeLabel,
      name: b.name,
      desc: b.desc,
      detail: b.detail || '',
      bonusText: b.bonusText,
      memberNames: b.memberNames,
      memberText: b.memberNames.join(' · '),
      memberCount: b.memberCount
    };
  });
}

function bondEvalOf(starters) {
  return bondUtil.evaluateLineup((starters || []).filter(Boolean));
}

/* 羁绊总览（阵容页面板 / 比赛页结算都用它） */
function bondView(state) {
  const rv = rosterView(state);
  return {
    enabled: CONFIG.bond.enabled,
    bonds: rv.bonds,
    count: rv.bondCount,
    byType: rv.bondByType,
    summaryText: rv.bondSummaryText,
    maxPct: rv.bondMaxPct,
    hint: rv.bondCount ? '' : '同队 / 同届 / 宿敌 / 连线四类羁绊都还没触发，试试把老队友排在一起'
  };
}

/* 羁绊图鉴：全部点名羁绊（宿敌 + 连线）的收集状态，驱动「为了开羁绊去抽卡」的收集动机 */
function bondCatalog(state) {
  const ownedIds = {};
  Object.keys(state.collection).forEach(function (uid) {
    const def = players.getCard(state.collection[uid].cardId);
    if (def) ownedIds[def.playerId] = true;
  });
  const courtIds = {};
  rosterView(state).starters.filter(Boolean).forEach(function (c) { courtIds[c.playerId] = true; });
  const ownedList = Object.keys(ownedIds);
  const courtList = Object.keys(courtIds);

  const entries = bondsData.RIVALS.map(function (b) {
    return { type: 'rival', typeLabel: bondsData.TYPE_LABELS.rival, id: b.id, name: b.name, desc: b.desc, members: b.members, bonus: CONFIG.bond.rivalBonus };
  }).concat(bondsData.COMBOS.map(function (b) {
    return { type: 'combo', typeLabel: bondsData.TYPE_LABELS.combo, id: b.id, name: b.name, desc: b.desc, members: b.members, bonus: b.bonus };
  }));

  return entries.map(function (e) {
    const status = bondUtil.catalogStatus(e, ownedList, courtList);
    const rows = e.members.map(function (pid) {
      const cards = players.cardsOfPlayer(pid);
      const def = cards.length ? cards[0] : null;
      return {
        playerId: pid,
        name: def ? displayName(state, def) : pid,
        owned: ownedList.indexOf(pid) !== -1,
        onCourt: courtList.indexOf(pid) !== -1
      };
    });
    return {
      id: e.id,
      type: e.type,
      typeLabel: e.typeLabel,
      name: e.name,
      desc: e.desc,
      bonusText: bondUtil.bonusText(e.bonus),
      members: rows,
      memberText: rows.map(function (r) { return r.name; }).join(' + '),
      ownedCount: rows.filter(function (r) { return r.owned; }).length,
      needCount: rows.length,
      status: status,
      statusText: BOND_STATUS_TEXT[status] || status
    };
  }).sort(function (a, b) {
    const d = (BOND_STATUS_RANK[a.status] || 9) - (BOND_STATUS_RANK[b.status] || 9);
    return d !== 0 ? d : (a.type === b.type ? a.id.localeCompare(b.id) : (a.type === 'combo' ? -1 : 1));
  });
}

/* 某名球员参与的点名羁绊（详情页「他能开什么」提示） */
function bondsOfPlayer(state, playerId) {
  const ownedIds = {};
  Object.keys(state.collection).forEach(function (uid) {
    const def = players.getCard(state.collection[uid].cardId);
    if (def) ownedIds[def.playerId] = true;
  });
  const courtIds = {};
  rosterView(state).starters.filter(Boolean).forEach(function (c) { courtIds[c.playerId] = true; });
  return bondUtil.linksOfPlayer(playerId).map(function (b) {
    const entry = { members: b.members };
    const status = bondUtil.catalogStatus(entry, Object.keys(ownedIds), Object.keys(courtIds));
    const partners = b.members.filter(function (pid) { return pid !== playerId; }).map(function (pid) {
      const cards = players.cardsOfPlayer(pid);
      return cards.length ? displayName(state, cards[0]) : pid;
    });
    return {
      id: b.id, type: b.type, typeLabel: b.typeLabel, name: b.name, desc: b.desc,
      bonusText: bondUtil.bonusText(b.type === 'rival' ? CONFIG.bond.rivalBonus : b.bonus),
      partnerText: partners.join(' + '), status: status, statusText: BOND_STATUS_TEXT[status] || status
    };
  });
}

/* 阵容视图：首发/替补 + 薪资合计 + 工资帽校验 + 平均 OVR + 羁绊 */
function rosterView(state) {
  const cap = CONFIG.roster.salaryCap;
  const starters = state.roster.starters.map(function (uid) { return uid ? effectiveCardOf(state, uid) : null; });
  const bench = state.roster.bench.map(function (uid) { return uid ? effectiveCardOf(state, uid) : null; });
  const all = starters.concat(bench).filter(Boolean);
  const totalSalary = all.reduce(function (s, c) { return s + c.salary; }, 0);
  const totalOvr = all.reduce(function (s, c) { return s + c.ovr; }, 0);
  const starterCount = starters.filter(Boolean).length;
  const bondEval = bondEvalOf(starters);
  /* 时刻卡（里程碑 2）：与羁绊同一条纪律 —— 只影响比赛内乘数，**不进 totalSalary**，
   * 所以工资帽与「谁戴了哪张卡」无关（config.moment 裁决 3）。
   * 名字用 displayName 而不是卡面原名：合规化名开关打开时，结算面板与阵容页必须是同一套名字。 */
  const momentEval = momentUtil.evaluateLineup(starters.filter(Boolean).map(function (c) {
    return { uid: c.uid, name: c.displayName || c.name, moment: c.moment };
  }));
  const positions = CONFIG.roster.slotPositions.map(function (pos, i) {
    const c = starters[i];
    return { slot: i, position: pos, card: c, matched: !!c && c.position === pos };
  });
  return {
    starters: starters,
    bench: bench,
    positions: positions,
    count: all.length,
    starterCount: starterCount,
    benchCount: bench.filter(Boolean).length,
    totalSalary: totalSalary,
    salaryCap: cap,
    salaryLeft: cap - totalSalary,
    overCap: totalSalary > cap,
    capRatio: fmt.clamp(totalSalary / cap, 0, 1),
    avgOvr: all.length ? Math.round(totalOvr / all.length) : 0,
    starterAvgOvr: starterCount ? Math.round(starters.filter(Boolean).reduce(function (s, c) { return s + c.ovr; }, 0) / starterCount) : 0,
    ready: starterCount === CONFIG.roster.starterCount && totalSalary <= cap,
    playStyle: state.roster.playStyle || 'balanced',
    /* 防守策略（里程碑 2 战术克制）：'auto' 或 data/tactics.js DEFENSES 里的 key */
    defense: state.roster.defense || tacticsData.AUTO_DEFENSE,
    /* 羁绊（只影响比赛属性，不进 totalSalary —— 工资帽与站位组合无关） */
    bonds: bondRows(bondEval),
    bondCount: bondEval.count,
    bondByType: bondEval.byType,
    bondSummaryText: bondEval.summaryText,
    bondMaxPct: bondEval.maxPct,
    bondEnabled: bondEval.enabled,
    /* 时刻卡摘要（阵容页 / 比赛结算面板直接渲染，页面不自己拼文案） */
    moments: momentEval.list,
    momentCount: momentEval.count,
    momentSummaryText: momentEval.summaryText,
    momentMaxRarity: momentEval.maxRarity,
    momentEnabled: momentEval.enabled
  };
}

/* 喂给 utils/battle.js 的主队对象 */
function homeTeam(state) {
  const view = rosterView(state);
  return {
    name: state.profile.name || CONFIG.GAME_NAME,
    playStyle: view.playStyle,
    defense: view.defense,
    players: view.starters.filter(Boolean).map(function (c) {
      /* team / era / draft / playerId / tags 是羁绊判定的输入（第七章 7.3），必须一起交给 battle；
       * moment 是名场面时刻卡的输入（第八章，里程碑 2），漏传 ⇒ 卡戴了但比赛里不生效。 */
      return {
        uid: c.uid, name: c.displayName, number: c.number, position: c.position,
        attrs: c.attrs, ovr: c.ovr, salary: c.salary,
        team: c.team, era: c.era, draft: c.draft, playerId: c.playerId, tags: c.tags,
        moment: c.moment
      };
    })
  };
}

/* 由竞技场快照重建主队（复现历史对局用）。
 * 快照只带卡牌实例引用，属性由 effectiveCardFrom → growth.effectiveCard 重新推导，
 * 与 utils/battle.js 结算时用的是同一条路径 ⇒ 同 seed 必得同一份战报。 */
function homeTeamFromSnapshot(state, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.home)) return null;
  const cards = snapshot.home.map(function (inst) { return effectiveCardFrom(state, inst, 0); }).filter(Boolean);
  if (cards.length !== CONFIG.roster.starterCount) return null;
  return {
    name: state.profile.name || CONFIG.GAME_NAME,
    playStyle: snapshot.playStyle || 'balanced',
    defense: snapshot.defense || tacticsData.AUTO_DEFENSE,
    players: cards.map(function (c) {
      return {
        uid: c.uid, name: c.displayName, number: c.number, position: c.position,
        attrs: c.attrs, ovr: c.ovr, salary: c.salary,
        team: c.team, era: c.era, draft: c.draft, playerId: c.playerId, tags: c.tags,
        /* 与 homeTeam 同口径：快照复现必须把当时的佩戴状态一起还原，否则乘数不同 ⇒ 比分不同 */
        moment: c.moment
      };
    })
  };
}

/* 图鉴进度：按稀有度统计已收集 / 总数 */
function collectionProgress(state) {
  const ownedIds = {};
  Object.keys(state.collection).forEach(function (uid) { ownedIds[state.collection[uid].cardId] = true; });
  const byRarity = CONFIG.rarity.order.map(function (r) {
    const list = players.byRarity(r);
    const got = list.filter(function (c) { return ownedIds[c.id]; }).length;
    return { rarity: r, label: CONFIG.rarity.labels[r], got: got, total: list.length };
  });
  const uniqueOwned = Object.keys(ownedIds).length;
  return {
    byRarity: byRarity,
    uniqueOwned: uniqueOwned,
    total: players.COUNT,
    ratio: players.COUNT ? uniqueOwned / players.COUNT : 0,
    instances: Object.keys(state.collection).length
  };
}

/* 体力视图（含下一点倒计时） */
function staminaView(state, now) {
  const profile = reducers.recoverStamina(state.profile, now || Date.now());
  return {
    value: profile.stamina,
    max: CONFIG.economy.staminaMax,
    ratio: fmt.clamp(profile.stamina / CONFIG.economy.staminaMax, 0, 1),
    nextText: reducers.nextStaminaText(profile, now || Date.now())
  };
}

/* 关卡视图：是否通关、星级、是否可挑战 */
function stageView(state, stage) {
  const rec = (state.season.cleared || {})[stage.id];
  const stamina = state.profile.stamina;
  return {
    stage: stage,
    cleared: !!rec && rec.result === 'win',
    attempted: !!rec,
    stars: rec ? rec.stars : 0,
    bestMargin: rec ? rec.bestMargin : null,
    staminaCost: stage.staminaCost,
    canPlay: stamina >= stage.staminaCost,
    rewards: stage.rewards
  };
}

/* 抽卡保底进度视图 */
function pityView(state) {
  const hard = CONFIG.gacha.pity.advancedUrHardPity;
  const adv = state.gacha.advanced || { urPity: 0, totalPulls: 0, totalUr: 0 };
  const nor = state.gacha.normal || { urPity: 0, totalPulls: 0, totalUr: 0 };
  const nextUrP = require('../utils/prd.js').prdEffective(CONFIG.gacha.pools.advanced.rates.UR, adv.urPity + 1);
  return {
    advanced: { urPity: adv.urPity, totalPulls: adv.totalPulls, totalUr: adv.totalUr, hardPity: hard, hardLeft: Math.max(0, hard - adv.urPity), nextUrRate: nextUrP },
    normal: { urPity: nor.urPity, totalPulls: nor.totalPulls, totalUr: nor.totalUr },
    history: (state.gacha.history || []).map(function (h) {
      const card = players.getCard(h.cardId);
      return { uid: h.uid, cardId: h.cardId, name: card ? displayName(state, card) : h.cardId, rarity: h.rarity, forced: h.forced, at: h.at };
    })
  };
}

/* 背包视图 */
/* 背包视图。
 * 【时刻卡为什么必须在这里单独分流】bag 是一个 id → 数量 的计数表，装备 / 消耗品 / 时刻卡三种东西混存在一起
 * （键各自唯一，不会撞）。但 itemsData.getItem() 只认 items.js 里的 id，时刻卡 id 解析不到 ⇒
 * 早先的写法 `if (!item) return;` 会把时刻卡**静默丢掉**：玩家花竞技币换了卡，背包页却什么都看不见。
 * 所以这里先问 momentsData，再问 itemsData，两边都认不出来才算脏数据。 */
function bagView(state) {
  const equipment = [];
  const materials = [];
  const moments = [];
  Object.keys(state.bag).forEach(function (id) {
    const count = Number(state.bag[id]) || 0;
    if (count <= 0) return;
    const moment = momentsData.getMoment(id);
    if (moment) {
      moments.push({
        id: id, count: count, name: moment.name, rarity: moment.rarity, desc: moment.desc,
        effectLines: momentUtil.effectText(moment), effectText: momentUtil.summaryOf(moment),
        enabled: momentUtil.isEnabled()
      });
      return;
    }
    const item = itemsData.getItem(id);
    if (!item) return;
    const row = { id: id, count: count, item: item };
    if (itemsData.isEquipment(id)) equipment.push(row); else materials.push(row);
  });
  /* 时刻卡按稀有度高→低排（玩家最关心刚换到的那张），同稀有度按 id 稳定排序，避免每次渲染顺序跳动 */
  const order = CONFIG.rarity.order;
  moments.sort(function (a, b) {
    const d = order.indexOf(b.rarity) - order.indexOf(a.rarity);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  return {
    equipment: equipment, materials: materials, moments: moments,
    shard: Number(state.bag.shard) || 0,
    momentCount: moments.reduce(function (s, m) { return s + m.count; }, 0)
  };
}

/* 经理等级进度 */
function levelView(state) {
  const need = reducers.levelExpNeed(state.profile.level);
  return { level: state.profile.level, exp: state.profile.exp, need: need, ratio: fmt.clamp(state.profile.exp / need, 0, 1) };
}

/* ---------------- 战术克制视图（第七章 7.4「战术判定」，里程碑 2） ----------------
 * 页面只读这里：克制环、我方打法/防守策略、以及「打法 × 对手防守策略」的出手占比矩阵。
 * 所有数字都来自 utils/battle.js 的同一套 normalizeTeam（连属性契合度 fit 都算进去了），
 * 所以「面板上看到的克制率」与「比赛里真正生效的加权」不可能不一致。 */

/* 某支队伍在对方某套防守策略下的克制结构。两套口径同时给出：
 *   出手占比（attackPct/defendPct）——  intuitive，面板上写「多少出手吃克制」；
 *   得分价值占比（*ValuePct）—— 按战术得分加权（三分 = 1.5 倍两分），这才是净胜分真正相关的量。
 * netValuePct 的正负号站在**被测队伍**这边：>0 表示它占便宜。
 * 数字来源就是 utils/battle.js 归一化后的 tacticItems/tacticVs（比赛里实际用的那份权重），
 * 所以「面板显示的克制率」与「引擎真正加权的东西」是同一份数据，不可能不一致。 */
function counterShare(team, defKey) {
  const items = (team.tacticVs && team.tacticVs[defKey]) || team.tacticItems;
  let wTotal = 0;
  let atk = 0;
  let dfd = 0;
  let vTotal = 0;
  let vAtk = 0;
  let vDfd = 0;
  items.forEach(function (it) {
    const value = it.w * (it.t.points || 2);
    wTotal += it.w;
    vTotal += value;
    const tag = tacticsData.counterOf(it.t.key, defKey);
    if (tag === tacticsData.COUNTER.attack) { atk += it.w; vAtk += value; }
    else if (tag === tacticsData.COUNTER.defend) { dfd += it.w; vDfd += value; }
  });
  return {
    attackPct: wTotal ? Math.round((atk / wTotal) * 100) : 0,
    defendPct: wTotal ? Math.round((dfd / wTotal) * 100) : 0,
    attackValuePct: vTotal ? Math.round((vAtk / vTotal) * 100) : 0,
    defendValuePct: vTotal ? Math.round((vDfd / vTotal) * 100) : 0,
    netValuePct: vTotal ? Math.round(((vAtk - vDfd) / vTotal) * 100) : 0
  };
}

function verdictOf(share, enabled) {
  const net = share.netValuePct;
  if (!enabled) return { verdict: '未开启', cls: '', net: 0 };
  if (net >= 15) return { verdict: '大优', cls: 'tc-good', net: net };
  if (net > 0) return { verdict: '小优', cls: 'tc-ok', net: net };
  if (net <= -15) return { verdict: '大劣', cls: 'tc-bad', net: net };
  if (net < 0) return { verdict: '小劣', cls: 'tc-warn', net: net };
  return { verdict: '均势', cls: '', net: 0 };
}

/* 面对某支队伍，我方该上哪套防守策略：取「净得分价值」最小（对手占便宜最少）的那一套。
 * 判据与实测一致：tools/verify.mjs I 组用等强度合成队跑了 3×3 × 200 seeds 的对照，
 * 本函数给出的最优策略在 9 个格子里与实测净胜分最高的策略完全一致。
 * 代价只有 4 战术 × 3 策略 = 12 次乘加，页面渲染得起（不像真模拟要跑 96 回合）。 */
function bestDefenseAgainst(team) {
  let best = null;
  tacticsData.DEFENSES.forEach(function (d) {
    const s = counterShare(team, d.key);
    if (!best || s.netValuePct < best.share.netValuePct) best = { key: d.key, name: d.name, short: d.short, share: s };
  });
  return {
    key: best.key, name: best.name, short: best.short,
    netValuePct: best.share.netValuePct,
    suppressPct: best.share.defendValuePct,
    givePct: best.share.attackValuePct,
    text: '防守建议：' + best.name + '（掐住他 ' + best.share.defendValuePct + '% 的得分价值，只放出 ' + best.share.attackValuePct + '%）'
  };
}

function tacticsView(state) {
  const rv = rosterView(state);
  const C = CONFIG.battle.counter || {};
  const enabled = !!C.enabled;
  const base = homeTeam(state);
  const styleList = Object.keys(tacticsData.PLAY_STYLES).map(function (k) { return tacticsData.PLAY_STYLES[k]; });

  /* 三种打法各归一化一次（含属性契合度），后面所有克制率都从这三份数据里查 */
  const byStyle = {};
  styleList.forEach(function (s) {
    byStyle[s.key] = battleUtil.normalizeTeam(Object.assign({}, base, { playStyle: s.key }), 'home');
  });
  const mine = byStyle[rv.playStyle] || byStyle.balanced;

  /* auto 会推导成什么：直接问 battle（比赛里生效的就是这个函数） */
  const resolved = base.players.length
    ? battleUtil.resolveDefense({ defense: rv.defense, players: base.players })
    : { key: '', name: '—', short: '—', desc: '', auto: true };

  const matrix = tacticsData.TACTICS.map(function (t) {
    return {
      key: t.key, name: t.name, short: t.short, desc: t.desc, points: t.points,
      counterName: (tacticsData.defenseByKey(t.counter) || {}).name || '',
      beatenByName: (tacticsData.defenseByKey(t.beatenBy) || {}).name || '',
      cells: tacticsData.DEFENSES.map(function (d) {
        const tag = tacticsData.counterOf(t.key, d.key);
        return {
          key: d.key, tag: tag,
          label: tag === tacticsData.COUNTER.attack ? '克' : (tag === tacticsData.COUNTER.defend ? '被克' : '—'),
          cls: tag === tacticsData.COUNTER.attack ? 'tc-good' : (tag === tacticsData.COUNTER.defend ? 'tc-bad' : '')
        };
      })
    };
  });

  const matchup = styleList.map(function (s) {
    const team = byStyle[s.key];
    return {
      key: s.key, name: s.name, desc: s.desc, isCurrent: s.key === rv.playStyle,
      rows: tacticsData.DEFENSES.map(function (d) {
        const share = counterShare(team, d.key);
        const v = verdictOf(share, enabled);
        return {
          key: d.key, name: d.name, short: d.short,
          attackPct: share.attackPct, defendPct: share.defendPct,
          text: share.attackPct + '% / ' + share.defendPct + '%',
          verdict: v.verdict, cls: v.cls
        };
      })
    };
  });

  return {
    enabled: enabled,
    bonusPct: Math.round((Number(C.bonus) || 0) * 100),
    defenseList: tacticsData.DEFENSES,
    playStyle: rv.playStyle,
    playStyleName: (tacticsData.PLAY_STYLES[rv.playStyle] || {}).name || '',
    styles: styleList.map(function (s) { return { key: s.key, name: s.name, desc: s.desc }; }),
    defense: rv.defense,
    defenseAuto: rv.defense === tacticsData.AUTO_DEFENSE,
    defenseResolved: resolved,
    defenses: [{ key: tacticsData.AUTO_DEFENSE, name: '自动', short: '自动', desc: '按上场五人的防守属性定调：盖帽高→收缩护筐，抢断高→外线扩防，防守意识高→人盯人', auto: true }].concat(
      tacticsData.DEFENSES.map(function (d) { return { key: d.key, name: d.name, short: d.short, desc: d.desc, auto: false }; })
    ),
    myDefenseName: resolved.name,
    myDefenseDesc: resolved.desc,
    myDefenseAutoText: rv.defense === tacticsData.AUTO_DEFENSE ? ('自动定调为「' + resolved.name + '」') : '手动指定',
    matrix: matrix,
    matrixDefenses: tacticsData.DEFENSES.map(function (d) { return { key: d.key, name: d.name, short: d.short }; }),
    matchup: matchup,
    hint: enabled
      ? '侦察对手防守策略，再把打法调成能惩罚它的那一个：克制方对抗属性 +' + Math.round((Number(C.bonus) || 0) * 100) + '%'
      : '战术克制当前未开启（config.battle.counter.enabled = false）'
  };
}

/* auto 定调结果（判断「建议的防守策略是不是已经生效」时要用，避免重复推导） */
function resolvedKey(state, tv) { return tv && tv.defenseResolved ? tv.defenseResolved.key : ''; }

/* 关卡侦察（PVE）：对手防守策略 + 我方当前打法的克制结论 + 防守建议。
 * 与竞技场用的是同一套 counterShare / verdictOf，所以两个模式的「侦察」口径完全一致。 */
function stageScout(state, stage) {
  const rv = rosterView(state);
  const tv = tacticsView(state);
  const away = battleUtil.normalizeTeam(require('../data/stages.js').buildAwayTeam(stage, 1), 'away');
  const mine = battleUtil.normalizeTeam(homeTeam(state), 'home');
  const share = counterShare(mine, away.defense.key);
  const v = verdictOf(share, tv.enabled);
  const suggest = bestDefenseAgainst(away);
  return {
    defense: away.defense.key,
    defenseName: away.defense.name,
    defenseShort: away.defense.short,
    defenseAuto: away.defense.auto,
    defenseText: away.defense.auto ? (away.defense.name + '（按属性自动定调）') : away.defense.name,
    playStyle: away.playStyle,
    playStyleName: away.playStyleName,
    ovr: away.ovr,
    bondCount: away.bondCount,
    bondText: away.bonds.map(function (b) { return b.name; }).slice(0, 3).join(' · '),
    myAttackPct: share.attackPct,
    myDefendPct: share.defendPct,
    myNetValuePct: share.netValuePct,
    counterText: share.attackPct + '% 出手吃克制 · ' + share.defendPct + '% 被克',
    valueText: '得分价值 ' + share.attackValuePct + '% 占便宜 · ' + share.defendValuePct + '% 吃亏',
    verdict: v.verdict,
    verdictCls: v.cls,
    suggestDefenseKey: suggest.key,
    suggestDefenseName: suggest.name,
    suggestNetValuePct: suggest.netValuePct,
    suggestText: suggest.text,
    counterEnabled: tv.enabled,
    bonusPct: tv.bonusPct,
    counterHint: tv.hint,
    myDefense: rv.defense,
    myDefenseName: tv.myDefenseName,
    suggestIsCurrent: rv.defense === suggest.key || (rv.defense === tacticsData.AUTO_DEFENSE && resolvedKey(state, tv) === suggest.key),
    myPlayStyle: rv.playStyle,
    myPlayStyleName: tv.playStyleName
  };
}

/* 竞技场摘要（主页 / 关卡页的入口卡片用）：段位、积分、今日剩余次数、下一位对手。
 * 刻意不做天梯侦察（那是 arenaView 的活）：入口卡片只要这几个数字，
 * 免得每次 mapState 都归一化 12 支对手队伍（每支都要跑一遍羁绊判定）。 */
function arenaSummary(state, now) {
  const cfg = CONFIG.arena;
  const arena = state.arena || {};
  const rating = Number(arena.rating === undefined ? cfg.ratingStart : arena.rating) || 0;
  const prog = arenaUtil.rankProgress(rating, cfg.ranks);
  const daily = arenaUtil.dailyOf(arena, now, cfg);
  const beaten = arena.beaten || {};
  let cleared = 0;
  for (let i = 0; i < arenaData.LADDER.length; i++) {
    const b = beaten[arenaData.LADDER[i].id];
    if (!b || !b.wins) break;
    cleared++;
  }
  const next = cleared < arenaData.LADDER.length ? arenaData.LADDER[cleared] : null;
  /* 加赛（里程碑 5）：比赛页「再战」拦截文案要能指出加赛出口（未购满 + 钻石够才算「还有出路」） */
  const ecfg = cfg.extraChallenges || {};
  const extraMax = Math.max(0, Math.floor(Number(ecfg.maxPerDay) || 0));
  const extraCost = Math.max(0, Math.floor(Number(ecfg.costDiamonds) || 0));
  const extraBought = daily.extra;
  const extraSoldOut = extraBought >= extraMax;
  const extraAffordable = (Number(state.profile.diamond) || 0) >= extraCost;
  const extra = {
    enabled: !!cfg.enabled && !!ecfg.enabled,
    cost: extraCost, bought: extraBought, max: extraMax,
    soldOut: extraSoldOut, affordable: extraAffordable,
    canBuy: !!cfg.enabled && !!ecfg.enabled && !extraSoldOut && extraAffordable
  };
  return {
    enabled: !!cfg.enabled,
    rating: rating,
    rankName: prog.current.name,
    rankShort: prog.current.short,
    rankColor: prog.current.color,
    rankText: prog.text,
    rankRatio: Math.round(prog.ratio * 100),
    rankNeed: prog.need,
    dailyText: '今日 ' + daily.used + '/' + daily.total + ' 场',
    dailyLeft: daily.left,
    staminaCost: cfg.staminaCost,
    streak: Number(arena.streak) || 0,
    wins: Number(arena.wins) || 0,
    matches: Number(arena.matches) || 0,
    clearedCount: cleared,
    ladderCount: arenaData.LADDER.length,
    nextOpponentId: next ? next.id : '',
    nextOpponentName: next ? next.name : '',
    allCleared: !next,
    extra: extra,
    arenaCoin: Number(state.profile.arenaCoin) || 0
  };
}

/* ---------------- 竞技场视图（异步 PVP，里程碑 2） ---------------- */
function arenaView(state, now) {
  const cfg = CONFIG.arena;
  const arena = state.arena || {};
  const rating = Number(arena.rating === undefined ? cfg.ratingStart : arena.rating) || 0;
  const daily = arenaUtil.dailyOf(arena, now, cfg);
  const prog = arenaUtil.rankProgress(rating, cfg.ranks);
  const rv = rosterView(state);
  const stam = staminaView(state, now);
  const tv = tacticsView(state);
  const beaten = arena.beaten || {};
  const enabled = !!cfg.enabled;
  /* 加赛（里程碑 5）：钻石加购当日挑战次数的出口。数值与文案全部在这里算好（WXML 零判断，AGENTS §4）。 */
  const ecfg = cfg.extraChallenges || {};
  const extraEnabled = enabled && !!ecfg.enabled;
  const extraMax = Math.max(0, Math.floor(Number(ecfg.maxPerDay) || 0));
  const extraCost = Math.max(0, Math.floor(Number(ecfg.costDiamonds) || 0));
  const diamonds = Number(state.profile.diamond) || 0;
  const extraBought = daily.extra;
  const extraSoldOut = extraBought >= extraMax;
  const extraAffordable = diamonds >= extraCost;
  const extraCanBuy = extraEnabled && !extraSoldOut && extraAffordable;

  /* 天梯顺序解锁：第一个「没赢过」的下标就是当前进度，之前的可重复挑战刷分 */
  let firstUnbeaten = arenaData.LADDER.length;
  for (let i = 0; i < arenaData.LADDER.length; i++) {
    const b = beaten[arenaData.LADDER[i].id];
    if (!b || !b.wins) { firstUnbeaten = i; break; }
  }

  const myTeam = battleUtil.normalizeTeam(homeTeam(state), 'home');
  const canFight = enabled && rv.ready && daily.left > 0 && stam.value >= cfg.staminaCost;

  const ladder = arenaData.LADDER.map(function (o, i) {
    const norm = battleUtil.normalizeTeam(arenaData.buildAwayTeam(o), 'away');
    const b = beaten[o.id] || null;
    const unlocked = i <= firstUnbeaten;

    /* 侦察结论 1：我方当前打法打他这套防守，有多少出手吃克制 */
    const share = counterShare(myTeam, norm.defense.key);
    const v = verdictOf(share, tv.enabled);

    /* 侦察结论 2：他这套打法最怕我哪套防守（bestDefenseAgainst，按净得分价值挑） */
    const suggest = bestDefenseAgainst(norm);

    return {
      id: o.id, index: o.index, name: o.name, desc: o.desc,
      rating: o.rating, rankName: arenaUtil.rankOf(o.rating, cfg.ranks).name,
      ovr: norm.ovr,
      playStyle: norm.playStyle, playStyleName: norm.playStyleName,
      defense: norm.defense.key, defenseName: norm.defense.name, defenseShort: norm.defense.short,
      defenseAuto: norm.defense.auto,
      bondCount: norm.bondCount,
      bondText: norm.bonds.map(function (x) { return x.name; }).slice(0, 3).join(' · '),
      players: arenaData.buildAwayCards(o).map(function (c) {
        return { cardId: c.id, name: displayName(state, c), position: c.position, ovr: c.ovr, number: c.number };
      }),
      myAttackPct: share.attackPct,
      myDefendPct: share.defendPct,
      myNetValuePct: share.netValuePct,
      verdict: v.verdict, verdictCls: v.cls,
      counterText: share.attackPct + '% 出手吃克制 · ' + share.defendPct + '% 被克',
      valueText: '得分价值 ' + share.attackValuePct + '% 占便宜 · ' + share.defendValuePct + '% 吃亏',
      suggestDefenseKey: suggest.key,
      suggestDefenseName: suggest.name,
      suggestNetValuePct: suggest.netValuePct,
      suggestIsCurrent: rv.defense === suggest.key || (rv.defense === tacticsData.AUTO_DEFENSE && tv.defenseResolved.key === suggest.key),
      suggestText: suggest.text,
      wins: b ? b.wins : 0,
      losses: b ? (b.losses + (b.draws || 0)) : 0,
      bestMargin: b ? b.bestMargin : null,
      beaten: !!(b && b.wins),
      recordText: b ? (b.wins + '胜 ' + ((b.losses || 0) + (b.draws || 0)) + '负') : '未交手',
      unlocked: unlocked,
      isNext: i === firstUnbeaten,
      lockText: unlocked ? '' : '先赢下 ' + arenaData.LADDER[i - 1].name,
      canPlay: unlocked && canFight,
      rewardText: [
        o.rewards.gold ? '金币 ' + fmt.numText(o.rewards.gold) : '',
        o.rewards.diamond ? '钻石 ' + o.rewards.diamond : '',
        o.rewards.shard ? '碎片 ×' + o.rewards.shard : ''
      ].filter(Boolean).join(' · '),
      firstWinText: o.firstWin ? ('首胜额外：金币 ' + fmt.numText(o.firstWin.gold) + ' · 钻石 ' + o.firstWin.diamond + ' · 碎片 ×' + o.firstWin.shard) : ''
    };
  });

  const matches = Number(arena.matches) || 0;
  const wins = Number(arena.wins) || 0;
  const history = (Array.isArray(arena.history) ? arena.history : []).map(function (h) {
    return {
      at: h.at,
      atText: fmt.fromNow(h.at, now),
      opponentId: h.opponentId,
      opponentName: h.opponentName,
      score: fmt.scoreText(h.homeScore, h.awayScore),
      result: h.result,
      resultText: h.result === 'win' ? '胜' : (h.result === 'lose' ? '负' : '平'),
      margin: h.margin,
      ot: h.ot || 0,
      ratingDelta: h.ratingDelta,
      ratingText: (h.ratingDelta >= 0 ? '+' : '') + h.ratingDelta,
      seed: h.seed,
      canReplay: !!h.snapshot && !!homeTeamFromSnapshot(state, h.snapshot)
    };
  });

  return {
    enabled: enabled,
    rating: rating,
    rankName: prog.current.name,
    rankShort: prog.current.short,
    rankColor: prog.current.color,
    nextRankName: prog.next ? prog.next.name : '',
    rankText: prog.text,
    rankRatio: Math.round(prog.ratio * 100),
    rankNeed: prog.need,
    daily: daily,
    dailyText: '今日 ' + daily.used + '/' + daily.total + ' 场',
    diamonds: diamonds,
    extra: {
      enabled: extraEnabled,
      cost: extraCost,
      bought: extraBought,
      max: extraMax,
      soldOut: extraSoldOut,
      affordable: extraAffordable,
      canBuy: extraCanBuy,
      text: '加赛 ' + extraBought + '/' + extraMax + ' · ' + extraCost + ' 钻/场',
      buyText: !extraEnabled ? '' : (extraSoldOut ? ('今日已购满 +' + extraMax)
        : (extraAffordable ? ('加赛 +1 场 · ' + extraCost + ' 钻')
          : ('钻石不足（需 ' + extraCost + '）'))),
      buyDisabled: !extraCanBuy
    },
    extraNote: extraEnabled
      ? ('免费次数用完后可用钻石加赛：每场 ' + extraCost + ' 钻、每日最多 +' + extraMax + ' 场，跨天重置（加赛同样消耗体力）。')
      : '',
    matches: matches, wins: wins,
    losses: Number(arena.losses) || 0,
    draws: Number(arena.draws) || 0,
    winRate: matches ? Math.round((wins / matches) * 100) : 0,
    streak: Number(arena.streak) || 0,
    bestStreak: Number(arena.bestStreak) || 0,
    lastRatingDelta: Number(arena.lastRatingDelta) || 0,
    lastRatingText: ((Number(arena.lastRatingDelta) || 0) >= 0 ? '+' : '') + (Number(arena.lastRatingDelta) || 0),
    arenaCoin: Number(state.profile.arenaCoin) || 0,
    stamina: stam.value,
    staminaCost: cfg.staminaCost,
    rosterReady: rv.ready,
    overCap: rv.overCap,
    starterAvgOvr: rv.starterAvgOvr,
    starterCount: rv.starterCount,
    starterNeed: CONFIG.roster.starterCount,
    canFight: canFight,
    playStyle: rv.playStyle,
    playStyleName: tv.playStyleName,
    styles: tv.styles,
    defenses: tv.defenses,
    defense: rv.defense,
    myDefenseName: tv.myDefenseName,
    counterEnabled: tv.enabled,
    counterHint: tv.hint,
    ladder: ladder,
    ladderCount: ladder.length,
    clearedCount: firstUnbeaten,
    nextOpponentId: firstUnbeaten < ladder.length ? ladder[firstUnbeaten].id : '',
    nextOpponentName: firstUnbeaten < ladder.length ? ladder[firstUnbeaten].name : '',
    allCleared: firstUnbeaten >= ladder.length,
    history: history,
    seedPrefix: 'arena-',
    note: '离线天梯：对手为本地确定性生成的原创战队快照（本工程零后端、零外链），每局由 seed 驱动，可离线逐回合复现。'
  };
}

/* ---------------- 名场面时刻卡视图（第八章，里程碑 2） ----------------
 * 详情页的「时刻卡槽」与背包页的「时刻卡」分页都只读这里，页面不自己拼效果文案
 * （AGENTS.md §4：WXML 不放表达式逻辑，所有拼接在 .js 里算好）。 */

/* 某名球员的时刻卡槽：当前佩戴 + 背包里可换的候选 */
function momentView(state, uid) {
  const enabled = momentUtil.isEnabled();
  const inst = uid ? state.collection[uid] : null;
  const currentId = (inst && inst.moment) || '';
  const currentDef = currentId ? momentsData.getMoment(currentId) : null;
  const bag = bagView(state);

  /* 候选 = 背包里的时刻卡。已被**别的**球员戴走的卡不在背包里（uniqueInstance），所以不会重复出现在候选中。 */
  const owned = bag.moments.map(function (m) {
    return {
      id: m.id, name: m.name, rarity: m.rarity, desc: m.desc, count: m.count,
      effectLines: m.effectLines, effectText: m.effectText,
      isCurrent: m.id === currentId
    };
  });

  return {
    enabled: enabled,
    hasPlayer: !!inst,
    currentId: currentId,
    current: currentDef ? {
      id: currentDef.id, name: currentDef.name, rarity: currentDef.rarity, desc: currentDef.desc,
      effectLines: momentUtil.effectText(currentDef), effectText: momentUtil.summaryOf(currentDef)
    } : null,
    /* 空态文案三种情形分开写，避免界面上出现空白（第三章：任何界面不得破图或空白） */
    currentText: !enabled ? '时刻卡未开启，佩戴后不产生任何效果'
      : (currentDef ? momentUtil.summaryOf(currentDef) : '未佩戴 · 点下方任意一张换上'),
    owned: owned,
    ownedCount: owned.length,
    emptyText: owned.length ? '' : (enabled ? '背包里还没有时刻卡，去竞技商城用竞技币兑换' : '时刻卡未开启'),
    slotLabel: '名场面时刻卡',
    hint: enabled ? '只在比赛内触发，不改属性面板与 OVR，也不占工资帽' : ''
  };
}

/* 时刻卡图鉴：全部 14 张 + 持有/佩戴状态（背包页「图鉴」口径，与 bondCatalog 同构） */
function momentCatalog(state) {
  const enabled = momentUtil.isEnabled();
  const ownedCount = {};
  Object.keys(state.bag).forEach(function (id) {
    if (momentsData.isMoment(id)) ownedCount[id] = Number(state.bag[id]) || 0;
  });
  /* 谁戴着哪张：一个 id 可能被多名球员各戴一份（前提是买了多份），所以记名字列表而不是单个 uid */
  const wornBy = {};
  Object.keys(state.collection).forEach(function (uid) {
    const mid = state.collection[uid].moment;
    if (!mid) return;
    const card = effectiveCardOf(state, uid);
    const nm = card ? (card.displayName || card.name) : uid;
    if (!wornBy[mid]) wornBy[mid] = [];
    wornBy[mid].push(nm);
  });

  const order = CONFIG.rarity.order;
  const rows = momentsData.MOMENTS.map(function (m) {
    const inBag = Number(ownedCount[m.id]) || 0;
    const worn = wornBy[m.id] || [];
    return {
      id: m.id, name: m.name, rarity: m.rarity, desc: m.desc,
      effectLines: momentUtil.effectText(m), effectText: momentUtil.summaryOf(m),
      /* 稀有度色由这里给（config.palette.rarity），页面不自己查表 —— 与 bagView 的材料/装备同一套视觉语言 */
      color: (CONFIG.palette.rarity || {})[m.rarity] || CONFIG.palette.textMute,
      inBag: inBag, wornCount: worn.length, wornNames: worn.join(' · '),
      owned: inBag > 0 || worn.length > 0,
      statusText: worn.length ? ('已佩戴 · ' + worn.join(' · ')) : (inBag > 0 ? ('背包 ×' + inBag) : '未获得'),
      enabled: enabled
    };
  });
  rows.sort(function (a, b) {
    const d = order.indexOf(b.rarity) - order.indexOf(a.rarity);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  const got = rows.filter(function (r) { return r.owned; }).length;
  return {
    enabled: enabled,
    rows: rows,
    total: rows.length,
    got: got,
    progressText: '已收集 ' + got + ' / ' + rows.length,
    ratio: rows.length ? fmt.clamp(got / rows.length, 0, 1) : 0
  };
}

/* ---------------- 时空进化视图（第八章「创新玩法」，里程碑 3） ----------------
 * 给详情页的时空进化面板出视图：进度 / 三条命令的可用性与文案 / 分解候选行 / 版本清单。
 * 页面只读这里，不自己判断能不能分解 / 献祭 / 合成（AGENTS.md §3）；commands 与 reducer
 * 各自再校验一遍同口径条件（视图 = 提示，命令 = 可读失败原因，reducer = 最后一道闸）。
 * 碎片按球员隔离：state.evolution.shards[playerId]，读侧一律 (Number(...) || 0)（AGENTS §9 坑 11）。 */

/* 时空进化材料候选：某张卡（指定 cardId）在存档里的实例清单。
 * total > 0 但 uid 为空 ⇒ 全部在阵容中（命令层/视图据此给不同文案）；
 * 择优规则与升星 findDonor 同规：未在阵容优先、养成度最低优先（stars*10 + level 升序）。 */
function evolutionMaterialOf(state, cardId) {
  const uids = Object.keys(state.collection).filter(function (u) { return state.collection[u].cardId === cardId; });
  const free = uids.filter(function (u) { return !inRoster(state, u); });
  free.sort(function (a, b) {
    const da = state.collection[a];
    const db = state.collection[b];
    return (da.stars * 10 + da.level) - (db.stars * 10 + db.level) || (a < b ? -1 : 1);
  });
  return { total: uids.length, free: free.length, uid: free[0] || '', uids: uids };
}

function evolutionView(state, playerId) {
  const enabled = evoUtil.enabled();
  const defs = players.cardsOfPlayer(playerId);
  const peak = evoUtil.peakCardOf(defs);
  const cost = evoUtil.peakCostOf(peak);
  const peakId = peak ? peak.id : '';
  const evolvable = !!peak && cost !== null;
  const name = (defs[0] && defs[0].name) || playerId;
  const shards = Number((state.evolution && state.evolution.shards && state.evolution.shards[playerId]) || 0);
  const peakUids = peak ? Object.keys(state.collection).filter(function (u) { return state.collection[u].cardId === peak.id; }) : [];
  const owned = peakUids.length > 0;

  /* 分解候选行：该球员全部非巅峰实例（含阵容中的，标记 disabled 与原因） */
  const rows = [];
  if (evolvable) {
    defs.forEach(function (d) {
      if (d.id === peakId) return;
      const uids = Object.keys(state.collection).filter(function (u) { return state.collection[u].cardId === d.id; });
      uids.forEach(function (u) {
        const inst = state.collection[u];
        const inR = inRoster(state, u);
        const value = evoUtil.salvageValue(d);
        rows.push({
          uid: u,
          cardId: d.id,
          version: d.version,
          rarity: d.rarity,
          value: value,
          valueText: '+' + value + ' 碎片',
          level: inst.level,
          stars: inst.stars,
          growthText: 'Lv.' + inst.level + ' · ' + new Array((inst.stars || 1) + 1).join('★'),
          inRoster: inR,
          isLast: uids.length === 1,
          lastText: uids.length === 1 ? '最后一张' : '',
          disabled: inR || owned || !enabled,
          disabledText: inR ? '阵容中，先移出' : (owned ? '已拥有巅峰版' : (!enabled ? '未开启' : ''))
        });
      });
    });
    /* 排序口径：可分解的排前面；再按版本（新秀 → 现役）；同版本内养成度最低的排前面，
     * 与命令层的选材规则（evolutionMaterialOf）一致 —— 页面第一行就是命令会吃掉的那张。 */
    const vOrder = {};
    vOrder[evoUtil.VERSION_ROOKIE] = 0;
    vOrder[evoUtil.VERSION_ACTIVE] = 1;
    rows.sort(function (a, b) {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      const va = vOrder[a.version];
      const vb = vOrder[b.version];
      if (va !== vb) return va - vb;
      return (a.stars * 10 + a.level) - (b.stars * 10 + b.level) || (a.uid < b.uid ? -1 : 1);
    });
  }
  const freeRows = rows.filter(function (r) { return !r.inRoster; });

  /* 成套献祭：材料 = 新秀版 ×1 + 现役版 ×1（都在手、且不在阵容中） */
  const rookie = evoUtil.versionCardOf(defs, evoUtil.VERSION_ROOKIE);
  const active = evoUtil.versionCardOf(defs, evoUtil.VERSION_ACTIVE);
  const pair = {
    possible: false, gain: 0, base: 0,
    text: '', reason: '', compareText: '',
    rookieText: rookie ? (rookie.version + ' ×1') : '',
    activeText: active ? (active.version + ' ×1') : ''
  };
  if (evolvable) {
    if (!enabled) pair.reason = '时空进化尚未开放';
    else if (owned) pair.reason = '已拥有巅峰传奇版，献祭入口已关闭';
    else if (!rookie || !active) pair.reason = '缺少' + (!rookie ? '新秀版' : '现役版') + '卡牌，无法成套献祭';
    else {
      pair.gain = evoUtil.pairValue(rookie, active);
      pair.base = evoUtil.salvageValue(rookie) + evoUtil.salvageValue(active);
      pair.text = '献祭 ' + rookie.version + ' ×1 + ' + active.version + ' ×1 → 巅峰碎片 +' + pair.gain;
      pair.compareText = '成套献祭 +' + pair.gain + '，比分开分解（+' + pair.base + '）更划算';
      const rm = evolutionMaterialOf(state, rookie.id);
      const am = evolutionMaterialOf(state, active.id);
      if (!rm.total) pair.reason = '缺少' + rookie.version + '卡牌';
      else if (!rm.uid) pair.reason = rookie.version + '正在阵容中，请先移出';
      else if (!am.total) pair.reason = '缺少' + active.version + '卡牌';
      else if (!am.uid) pair.reason = active.version + '正在阵容中，请先移出';
      else pair.possible = true;
    }
  }

  /* 合成巅峰卡：碎片够 + 未拥有 + 开关开着 */
  const synth = { possible: false, reason: '', costText: cost ? ('消耗 ' + cost + ' 巅峰碎片') : '' };
  if (evolvable) {
    if (!enabled) synth.reason = '时空进化尚未开放';
    else if (owned) synth.reason = '';
    else if (shards < cost) synth.reason = '巅峰碎片不足（还差 ' + (cost - shards) + '）';
    else synth.possible = true;
  }

  const salvage = {
    possible: evolvable && enabled && !owned && freeRows.length > 0,
    candidates: freeRows.length,
    reason: ''
  };
  if (evolvable && !salvage.possible) {
    salvage.reason = !enabled ? '时空进化尚未开放'
      : (owned ? '已拥有巅峰传奇版，分解入口已关闭'
        : '没有可分解的材料（阵容中的卡不能分解，请先移出）');
  }

  const valueTable = CONFIG.rarity.order.map(function (r) { return r + ' ' + evoUtil.shardValue(r); }).join(' / ');
  let note = '';
  if (evolvable) {
    note = '分解按卡牌出厂稀有度计值（' + valueTable + '）；巅峰碎片按球员隔离，只能用于合成这名球员的巅峰版。';
    if (pair.possible) note += ' ' + pair.compareText + '。';
  } else if (defs.length > 1) {
    note = '该球员暂无巅峰传奇版卡牌，时空进化暂不适用。';
  } else {
    note = '时空进化面向拥有多版本卡牌（新秀版 / 现役版 / 巅峰传奇版）的球员。';
  }

  return {
    enabled: enabled,
    evolvable: evolvable,
    playerId: playerId,
    name: name,
    shards: shards,
    cost: cost || 0,
    owned: owned,
    ownCount: peakUids.length,
    peakCardId: peakId,
    peakName: peak ? displayName(state, peak) : '',
    peakRarity: peak ? peak.rarity : '',
    peakOvr: peak ? peak.ovr : 0,
    peakUid: peakUids[0] || '',
    progressPct: cost ? evoUtil.progressPct(shards, cost) : 0,
    progressText: cost ? (shards + ' / ' + cost) : '',
    missingText: (cost && !owned && shards < cost) ? ('还差 ' + (cost - shards) + ' 碎片') : '',
    ready: !!cost && shards >= cost && !owned,
    pair: pair,
    synth: synth,
    salvage: salvage,
    rows: rows,
    freeCount: freeRows.length,
    versionRows: defs.map(function (d) {
      const total = Object.keys(state.collection).filter(function (u) { return state.collection[u].cardId === d.id; }).length;
      return {
        cardId: d.id,
        version: d.version,
        rarity: d.rarity,
        peak: d.id === peakId,
        value: evoUtil.salvageValue(d),
        valueText: d.id === peakId ? '' : ('分解 +' + evoUtil.salvageValue(d)),
        count: total,
        owned: total > 0
      };
    }),
    note: note,
    valueTable: valueTable
  };
}

/* ---------------- 交易市场视图（里程碑 3 第二块：每日橱窗 / 出售 / 刷新） ----------------
 * 货架来自 utils/market.js#shelfOf（纯函数，(dayKey, rerolls) ⇒ 逐字节确定）；
 * 「能不能买 / 能不能卖 / 能不能刷新」与全部文案在这里算完，页面只渲染（AGENTS §4）。
 * commands 层会再校验同样条件，两侧口径必须一致（O 组交叉校验 canBuy === 命令成功）。 */
function marketView(state, now) {
  const enabled = marketUtil.enabled();
  const dayKey = fmt.dayKeyOf(now);
  const rerolls = Math.floor(Number((state.market && state.market.rerolls) || 0));
  const gold = Number(state.profile.gold) || 0;

  /* 橱窗行 */
  const shelf = marketUtil.shelfOf(dayKey, rerolls).map(function (s) {
    const def = players.getCard(s.cardId);
    let owned = 0;
    Object.keys(state.collection || {}).forEach(function (u) {
      if (state.collection[u].cardId === s.cardId) owned += 1;
    });
    const price = marketUtil.buyPrice(def.rarity);
    const canBuy = enabled && price > 0 && gold >= price;
    return {
      slotKey: s.slotKey, slotLabel: s.slotLabel,
      cardId: def.id, name: displayName(state, def), version: def.version,
      position: def.position, rarity: def.rarity, ovr: def.ovr, number: def.number,
      color: def.colors ? def.colors.primary : '#2a3a6b',
      price: price, priceText: price + ' 金币', btnText: '买入 ' + price,
      owned: owned, ownedText: owned > 0 ? ('已有 ×' + owned) : '尚未拥有',
      canBuy: canBuy,
      reason: !enabled ? '交易市场尚未开放' : (price <= 0 ? '暂不上架' : (gold < price ? '金币不足（还差 ' + (price - gold) + '）' : ''))
    };
  });

  /* 出售行：全部收藏实例（含阵容中 / 巅峰卡，disabled 给原因）；
   * 排序：可售优先 → 稀有度升序（先清废卡）→ 养成度最低 → uid（与进化候选行同规）。 */
  const byCard = {};
  Object.keys(state.collection || {}).forEach(function (u) {
    const cid = state.collection[u].cardId;
    byCard[cid] = (byCard[cid] || 0) + 1;
  });
  const rOrder = CONFIG.rarity.order;
  const sellRows = Object.keys(state.collection || {}).map(function (u) {
    const inst = state.collection[u];
    const def = players.getCard(inst.cardId);
    if (!def) return null;
    const peak = !marketUtil.isMarketable(def);
    const inR = inRoster(state, u);
    const price = marketUtil.sellPrice(def.rarity);
    const eq = inst.equipment || {};
    let gear = 0;
    Object.keys(eq).forEach(function (slot) { if (eq[slot]) gear += 1; });
    const moment = inst.moment ? 1 : 0;
    const last = byCard[def.id] === 1;
    const disabled = peak || inR;
    const warn = [];
    if (last && !disabled) warn.push('最后一张（图鉴收集进度会回退）');
    if (gear || moment) warn.push('附件退回背包：' + (gear ? '装备 ×' + gear : '') + (gear && moment ? ' · ' : '') + (moment ? '时刻卡 ×1' : ''));
    return {
      uid: u, cardId: def.id, name: displayName(state, def), version: def.version,
      position: def.position, rarity: def.rarity,
      color: def.colors ? def.colors.primary : '#2a3a6b',
      level: inst.level, stars: inst.stars,
      starText: new Array((Number(inst.stars) || 1) + 1).join('★'),
      ownedText: '持有 ×' + byCard[def.id],
      price: price, priceText: '+' + price + ' 金币', btnText: '卖出 ' + price,
      isLast: last, inRoster: inR, isPeak: peak,
      disabled: disabled,
      disabledText: peak ? '巅峰传奇版不流通' : (inR ? '阵容中，先移出' : ''),
      warnText: warn.join('；')
    };
  }).filter(Boolean);

  sellRows.sort(function (a, b) {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    const ra = rOrder.indexOf(a.rarity);
    const rb = rOrder.indexOf(b.rarity);
    if (ra !== rb) return ra - rb;
    const ga = a.stars * 10 + a.level;
    const gb = b.stars * 10 + b.level;
    if (ga !== gb) return ga - gb;
    return a.uid < b.uid ? -1 : 1;
  });

  const sellableCount = sellRows.filter(function (r) { return !r.disabled; }).length;
  const cost = marketUtil.refreshCost();
  const refreshCan = enabled && cost > 0 && gold >= cost;

  /* 价格公示 / 规则说明：直接由 config 拼（改数值 ⇒ 文案自动跟随，不手写） */
  const buyText = rOrder.map(function (r) { return r + ' ' + marketUtil.buyPrice(r); }).join(' / ');
  const sellText = rOrder.map(function (r) { return r + ' ' + marketUtil.sellPrice(r); }).join(' / ');

  return {
    enabled: enabled,
    goldText: fmt.numText(gold),
    dayKey: dayKey,
    shelfTitle: '今日橱窗 · ' + dayKey,
    rerollsText: '橱窗已刷新 ' + rerolls + ' 次（每次重掷 5 格）',
    shelf: shelf,
    shelfCount: shelf.length,
    refresh: {
      cost: cost, costText: cost + ' 金币', buttonText: '刷新 ' + cost,
      can: refreshCan,
      reason: !enabled ? '交易市场尚未开放'
        : (cost <= 0 ? '刷新暂不可用' : (gold < cost ? '金币不足（还差 ' + (cost - gold) + '）' : ''))
    },
    sellRows: sellRows,
    sellCount: sellRows.length,
    sellableCount: sellableCount,
    note: '橱窗 = f(本地日期, 已刷新次数)：同一存档同一天同一刷新次数看到的是同一份货架（可复现、跨设备一致）。卖出的卡从收藏中移除，阵容中的卡不能出售；巅峰传奇版只能通过招募 / 时空进化获得。',
    priceNote: '买入（金币）：' + buyText + '；卖出：' + sellText + '（卖价 = 买价 ÷ 3，买下立刻卖出净亏 2/3）。非巅峰卡按出厂稀有度计，养成不改变价格。'
  };
}

/* ---------------- 王朝赛季视图（第八章「创新玩法」，里程碑 3 第三块） ----------------
 * 赛季窗口 / 任务进度 / 通行证两轨的「可领与否」全部在这里算完（页面零判断，AGENTS §4）。
 * 虚拟滚动：存档已跨窗但还没落库时，视图先按滚动后的新赛季展示（rollIfNeeded 是纯函数，
 * 视图与落库不会给出两个答案）；落库只由 commands.dynastySync / 结算触发。 */

/* 可领奖励计数（视图与摘要共用一份口径）：等级已达成 + 该轨可用 + 未领 + 该级确有奖励 */
function dynastyClaimableOf(d, level, enabled) {
  if (!enabled) return 0;
  let n = 0;
  (dynastyData.PASS_TRACK || []).forEach(function (row) {
    if (row.level > level) return;
    if (row.free && !d.claimed['free:' + row.level]) n += 1;
    if (d.premium && row.premium && !d.claimed['premium:' + row.level]) n += 1;
  });
  return n;
}

function dynastyView(state, now) {
  const cfg = CONFIG.dynasty;
  const enabled = !!cfg.enabled;
  const pointsCfg = cfg.points || {};
  const dayKey = fmt.dayKeyOf(now);
  const d = dynastyUtil.rollIfNeeded(state.dynasty, dayKey).dynasty;
  const pro = dynastyUtil.progressOf(d.points);
  const diamond = Number(state.profile.diamond) || 0;
  const premiumCost = Number(cfg.premiumCost) || 0;
  const daysLeft = dynastyUtil.daysLeftOf(d, dayKey);

  const missions = (dynastyData.MISSIONS || []).map(function (m) {
    const cur = Number(d.missions[m.counter]) || 0;
    const done = !!d.completed[m.id] || cur >= m.target;
    const progress = Math.min(cur, m.target);
    const ratio = m.target > 0 ? Math.round((progress / m.target) * 100) : 100;
    return {
      id: m.id, name: m.name, desc: m.desc,
      points: Number(m.points) || 0, pointsText: '+' + (Number(m.points) || 0),
      progress: progress, target: m.target,
      progressText: progress + ' / ' + m.target,
      ratio: ratio, done: done
    };
  });

  const rows = (dynastyData.PASS_TRACK || []).map(function (row) {
    const unlocked = pro.level >= row.level;
    function cell(track, reward) {
      const has = !!reward;
      const claimed = !!d.claimed[track + ':' + row.level];
      const trackOpen = track === 'free' || !!d.premium;
      const claimable = enabled && has && unlocked && trackOpen && !claimed;
      return {
        has: has,
        text: has ? dynastyUtil.rewardsText(reward) : '—',
        claimed: claimed,
        claimable: claimable,
        btnText: !has ? '' : (claimed ? '已领取' : (!unlocked ? '未达成' : (!trackOpen ? '待解锁' : '领取')))
      };
    }
    return {
      level: row.level, unlocked: unlocked,
      free: cell('free', row.free),
      premium: cell('premium', row.premium)
    };
  });

  const claimableCount = dynastyClaimableOf(d, pro.level, enabled);
  return {
    enabled: enabled,
    dayKey: dayKey,
    startKey: d.startKey,
    seasonTitle: '本赛季从 ' + d.startKey + ' 开始',
    daysLeft: daysLeft,
    daysLeftText: '距赛季结束还剩 ' + daysLeft + ' 天',
    points: d.points,
    pointsText: String(d.points),
    level: pro.level,
    levelText: 'Lv.' + pro.level,
    progress: {
      into: pro.into, need: pro.need,
      ratio: Math.round(pro.ratio * 100),
      text: pro.maxed ? '已满级' : (pro.into + ' / ' + pro.need),
      toNextText: pro.maxed ? '通行证已满级' : ('距下一级还差 ' + pro.toNext + ' 分')
    },
    premium: !!d.premium,
    premiumCost: premiumCost,
    premiumBtnText: d.premium ? '王朝轨已解锁' : ('解锁 ' + premiumCost + ' 钻'),
    premiumCan: enabled && !d.premium && premiumCost > 0 && diamond >= premiumCost,
    premiumReason: !enabled ? '王朝赛季尚未开放'
      : (d.premium ? '本赛季王朝轨已解锁（下赛季需重新解锁）'
        : (premiumCost <= 0 ? '王朝轨暂不可购买'
          : (diamond < premiumCost ? '钻石不足（还差 ' + (premiumCost - diamond) + '）' : ''))),
    missions: missions,
    missionDone: missions.filter(function (m) { return m.done; }).length,
    missionCount: missions.length,
    rows: rows,
    rowCount: rows.length,
    claimableCount: claimableCount,
    claimableText: claimableCount > 0 ? (claimableCount + ' 项奖励待领取') : '暂无待领奖励',
    incomeText: 'PVE 胜 +' + (pointsCfg.pveWin || 0) + ' / 平 +' + (pointsCfg.pveDraw || 0) + ' / 负 +' + (pointsCfg.pveLose || 0) +
      '；天梯胜 +' + (pointsCfg.arenaWin || 0) + ' / 平 +' + (pointsCfg.arenaDraw || 0) + ' / 负 +' + (pointsCfg.arenaLose || 0) +
      '；关卡首通额外 +' + (pointsCfg.firstClear || 0) + '。赛季任务另计。',
    note: '赛季 ' + (Number(cfg.seasonDays) || 30) + ' 天一滚动：结束后积分、任务与领奖记录重置，王朝轨需重新解锁。' +
      '通行证奖励不含任何直接战力（不卖卡、不卖时刻卡、不卖装备）—— 王朝轨卖的只是补给与时间。'
  };
}

/* 摘要（主页 / 我的页面板用）：与 dynastyView 同口径，只保留一目了然的几个数 */
function dynastySummary(state, now) {
  const cfg = CONFIG.dynasty;
  const enabled = !!cfg.enabled;
  const dayKey = fmt.dayKeyOf(now);
  const d = dynastyUtil.rollIfNeeded(state.dynasty, dayKey).dynasty;
  const pro = dynastyUtil.progressOf(d.points);
  const daysLeft = dynastyUtil.daysLeftOf(d, dayKey);
  const claimable = dynastyClaimableOf(d, pro.level, enabled);
  return {
    enabled: enabled,
    level: pro.level,
    levelText: 'Lv.' + pro.level,
    points: d.points,
    pointsText: String(d.points),
    ratio: Math.round(pro.ratio * 100),
    daysLeft: daysLeft,
    daysLeftText: '剩 ' + daysLeft + ' 天',
    premium: !!d.premium,
    claimable: claimable,
    claimableText: claimable > 0 ? (claimable + ' 项可领') : '暂无待领',
    progressText: d.points + ' / ' + (pro.maxed ? '满级' : pro.nextLevelPoints)
  };
}

/* ---------------- 竞技商城视图（里程碑 2：竞技币消费出口） ----------------
 * 「能不能买」的判断全部在这里算完（余额 / 限购 / 开关），页面只渲染 canBuy 与 buyText，
 * 不在 WXML 里写三元嵌套（AGENTS.md §4）。commands.buyArenaItem 会再校验一次同样的条件 ——
 * reducer 是最后的闸，视图只是给用户看的提示，两者判断口径必须一致（M 组会交叉校验）。 */
function shopView(state) {
  const cfg = CONFIG.arena.shop || {};
  const enabled = !!CONFIG.arena.enabled && !!cfg.enabled;
  const coinName = cfg.currencyName || '竞技币';
  const coin = Number(state.profile.arenaCoin) || 0;
  const boughtMap = (state.arena && state.arena.shopBought) || {};

  const groups = shopData.TAGS.map(function (tag) {
    const rows = shopData.entriesOf(tag.key).map(function (e) {
      const bought = Number(boughtMap[e.id]) || 0;
      const limit = Number(e.limit) || 0;
      const soldOut = limit > 0 && bought >= limit;
      const price = Number(e.price) || 0;
      const affordable = coin >= price;
      const def = shopData.targetOf(e);
      const qty = Math.max(1, Number(e.qty) || 1);
      return {
        id: e.id, kind: e.kind, ref: e.ref, tag: e.tag, hot: !!e.hot,
        name: shopData.nameOf(e), desc: shopData.descOf(e), rarity: shopData.rarityOf(e),
        color: (CONFIG.palette.rarity || {})[shopData.rarityOf(e)] || CONFIG.palette.textMute,
        price: price, qty: qty, limit: limit, bought: bought,
        /* 时刻卡给效果文案，道具给「一次到手几份」——两种商品的信息重心不同，这里一次算好 */
        effectLines: e.kind === 'moment' ? momentUtil.effectText(def) : [],
        effectText: e.kind === 'moment' ? momentUtil.summaryOf(def) : '',
        qtyText: qty > 1 ? ('×' + qty) : '',
        priceText: price + ' ' + coinName,
        limitText: limit > 0 ? (soldOut ? '已兑满' : ('限购 ' + limit + ' · 已兑 ' + bought)) : '不限购',
        soldOut: soldOut,
        affordable: affordable,
        canBuy: enabled && !soldOut && affordable,
        buyText: !enabled ? '商城未开放' : (soldOut ? '已兑满' : (affordable ? '兑换' : coinName + '不足')),
        buyDisabled: !(enabled && !soldOut && affordable)
      };
    });
    return { key: tag.key, name: tag.name, desc: tag.desc, rows: rows, count: rows.length };
  });

  return {
    enabled: enabled,
    coin: coin,
    coinText: coin + ' ' + coinName,
    currencyName: coinName,
    groups: groups,
    entryCount: groups.reduce(function (s, g) { return s + g.count; }, 0),
    /* 收入口径写给玩家看：他得知道「打几场能换到」，否则定价就是一串没有意义的数字 */
    incomeText: '每胜 +' + CONFIG.arena.coinPerWin + ' · 每负 +' + CONFIG.arena.coinPerLose +
      ' · 免费每日 ' + CONFIG.arena.dailyChallenges + ' 场' +
      (CONFIG.arena.extraChallenges && CONFIG.arena.extraChallenges.enabled
        ? '（可用钻石加赛 +' + CONFIG.arena.extraChallenges.maxPerDay + '）' : ''),
    note: enabled
      ? '竞技币只能在天梯获得，也只能在这里花。时刻卡为本商城独占，换到后去球员详情页佩戴。'
      : '竞技商城尚未开放'
  };
}

/* ---------------- 每日任务视图（第十章「任务」，里程碑 4） ----------------
 * 每天按本地日期重置；跨天未落库时视图先按「新一天」展示（rollIfNeeded 纯函数，与落库同解）。
 * 任务进度 / 完成态 / 奖励文案全部在这里算完（页面零判断，AGENTS §4）。 */
function dailyView(state, now) {
  const enabled = !!CONFIG.daily.enabled;
  const dayKey = fmt.dayKeyOf(now);
  const d = dailyUtil.rollIfNeeded(state.daily, dayKey).daily;
  const missions = (dailyData.DAILY_MISSIONS || []).map(function (m) {
    const target = Number(m.target) || 0;
    const cur = Number(d.counters[m.counter]) || 0;
    const progress = Math.min(cur, target);
    const done = cur >= target;
    return {
      id: m.id, name: m.name, desc: m.desc,
      progress: progress, target: target,
      progressText: progress + ' / ' + target,
      ratio: target > 0 ? Math.round((progress / target) * 100) : 100,
      done: done,
      mark: done ? '✓' : '·',
      rewardText: dailyUtil.rewardText(m.reward)
    };
  });
  const doneCount = missions.filter(function (m) { return m.done; }).length;
  return {
    enabled: enabled,
    dayKey: dayKey,
    missions: missions,
    doneCount: doneCount,
    count: missions.length,
    doneText: doneCount + ' / ' + missions.length,
    note: enabled
      ? '每日按本地日期刷新（与竞技场 / 交易市场的日期口径一致）；达成即自动发奖，无需手动领取。'
      : '每日任务尚未开放（config.daily.enabled = false）。'
  };
}

/* ---------------- 钻石商店视图（里程碑 4） ----------------
 * 条目 = data/items.js#CONSUMABLES 里带 price 的补给（体力药水 / 金币袋 / 招募券）。
 * canBuy / buyText 的判据与 commands.buyConsumable 完全一致（Q 组交叉校验锁死「按钮亮着但点了没反应」）。 */
function diamondShopView(state) {
  const diamond = Number(state.profile.diamond) || 0;
  const gold = Number(state.profile.gold) || 0;
  const items = (itemsData.CONSUMABLES || []).filter(function (it) { return Number(it.price) > 0; }).map(function (it) {
    const valid = it.currency === 'diamond' || it.currency === 'gold';
    const currency = valid ? it.currency : '';
    const wallet = currency === 'gold' ? gold : diamond;
    const price = Number(it.price) || 0;
    const canBuy = valid && price > 0 && wallet >= price;
    return {
      id: it.id, name: it.name, desc: it.desc, rarity: it.rarity,
      price: price, currency: currency,
      priceText: valid ? (price + (currency === 'diamond' ? ' 钻石' : ' 金币')) : '—',
      canBuy: canBuy,
      buyText: !valid ? '未上架' : (canBuy ? '购买' : ((currency === 'diamond' ? '钻石' : '金币') + '不足'))
    };
  });
  return {
    items: items,
    diamond: diamond,
    gold: gold,
    note: '只卖补给（体力药水 / 金币袋 / 招募券），不卖任何直接战力 —— 与竞技商城 / 王朝轨同一条纪律。'
  };
}

module.exports = {
  displayName: displayName,
  displayCity: displayCity,
  effectiveCardOf: effectiveCardOf,
  effectiveCardFrom: effectiveCardFrom,
  duplicatesOf: duplicatesOf,
  ownedCards: ownedCards,
  inRoster: inRoster,
  rosterView: rosterView,
  homeTeam: homeTeam,
  homeTeamFromSnapshot: homeTeamFromSnapshot,
  tacticsView: tacticsView,
  stageScout: stageScout,
  bestDefenseAgainst: bestDefenseAgainst,
  counterShare: counterShare,
  arenaView: arenaView,
  arenaSummary: arenaSummary,
  collectionProgress: collectionProgress,
  staminaView: staminaView,
  stageView: stageView,
  pityView: pityView,
  bagView: bagView,
  levelView: levelView,
  bondView: bondView,
  bondCatalog: bondCatalog,
  bondsOfPlayer: bondsOfPlayer,
  momentView: momentView,
  momentCatalog: momentCatalog,
  evolutionView: evolutionView,
  evolutionMaterialOf: evolutionMaterialOf,
  marketView: marketView,
  dynastyView: dynastyView,
  dynastySummary: dynastySummary,
  dailyView: dailyView,
  diamondShopView: diamondShopView,
  shopView: shopView
};
