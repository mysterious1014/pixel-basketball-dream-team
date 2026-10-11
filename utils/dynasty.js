/* utils/dynasty.js —— 王朝赛季 & 赛季通行证纯算法层（第八章「创新玩法」，里程碑 3 第三块）
 * 职责：
 *   - dayNumber / seasonIndexOf / daysLeftOf：赛季窗口的确定性日期数学（纯整数换算，不读系统时间）
 *   - empty / normalize / rollIfNeeded：赛季段形状与跨窗滚动（dayKey 由调用方传入）
 *   - applySettle / planSettle：结算 → 赛季积分 + 任务计数器推进 + 任务达成（一次性发分）
 *   - levelOf / progressOf：通行证等级与进度
 *   - rewardOf / rewardsOf / rewardText / rewardsText / planClaim：领奖校验与奖励归一
 * 约束（可复现红线）：不读存档、不碰 wx、不取系统时间、不掷随机（AGENTS.md §3）。
 *   dayKey 一律由调用方（store/commands.js 切片、reducer 透传）传入；本文件与战斗引擎零耦合 ——
 *   积分与任务只是「结算结果的记账」，不参与比分计算。数值口径全在 config.dynasty / data/dynasty.js。
 */
const CONFIG = require('../config.js');
const dynastyData = require('../data/dynasty.js');
const itemsData = require('../data/items.js');

const DY = CONFIG.dynasty;

/* 结算会推进的计数器全集：data/dynasty.js#MISSIONS[].counter 必须落在这个集合里（P 组第 1 条校验）。
 * normalize 用它做白名单清洗 —— 脏存档里多出来的键一律丢弃，宁丢勿崩。 */
const COUNTER_KEYS = [
  'pveBattles', 'pveWins', 'arenaBattles', 'arenaWins',
  'streak', 'bestStreak',
  'insideWins', 'perimeterWins', 'balancedWins',
  'perfectWins', 'goldEarned'
];

function enabled() { return !!DY.enabled; }

/* 'YYYY-MM-DD' → 天序号（1970-01-01 = 0）。只做民用历换算，不读系统时间；非法输入返回 null。 */
function dayNumber(dayKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ''));
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

/* 距 startKey 过了几个赛季窗口（非法 / 负数 → 0，绝不出现负赛季号） */
function seasonIndexOf(startKey, dayKey) {
  const a = dayNumber(startKey);
  const b = dayNumber(dayKey);
  if (a === null || b === null) return 0;
  return Math.max(0, Math.floor((b - a) / (Number(DY.seasonDays) || 30)));
}

/* 本赛季还剩几天（窗口内：约 30 → 1；跨窗后由调用方先滚动，重新从 seasonDays 起算） */
function daysLeftOf(dynasty, dayKey) {
  const days = Number(DY.seasonDays) || 30;
  const a = dayNumber(dynasty && dynasty.startKey);
  const b = dayNumber(dayKey);
  if (a === null || b === null || b < a) return days;
  return Math.max(1, days - (b - a) % days);
}

/* 空赛季段（startKey = 建档当天）。initial-state / 跨窗滚动共用。 */
function empty(dayKey) {
  return {
    startKey: String(dayKey || ''),
    points: 0,
    premium: false,
    missions: {},
    completed: {},
    claimed: {}
  };
}

function cleanCounters(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.keys(raw).forEach(function (k) {
      if (COUNTER_KEYS.indexOf(k) === -1) return;
      const n = Math.floor(Number(raw[k]) || 0);
      if (n > 0) out[k] = n;
    });
  }
  return out;
}

function cleanCompleted(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.keys(raw).forEach(function (k) {
      if (raw[k] && dynastyData.getMission(k)) out[k] = true;
    });
  }
  return out;
}

function cleanClaimed(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.keys(raw).forEach(function (k) {
      if (raw[k] && /^(free|premium):\d+$/.test(k)) out[k] = true;
    });
  }
  return out;
}

/* 形状归一（存档迁移 / 每次滚动入口共用）：脏值一律归零，宁丢勿崩 */
function normalize(raw, dayKey) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const startKey = (typeof r.startKey === 'string' && dayNumber(r.startKey) !== null) ? r.startKey : String(dayKey || '');
  return {
    startKey: startKey,
    points: Math.max(0, Math.floor(Number(r.points) || 0)),
    premium: !!r.premium,
    missions: cleanCounters(r.missions),
    completed: cleanCompleted(r.completed),
    claimed: cleanClaimed(r.claimed)
  };
}

/* 跨窗滚动：过期 ⇒ 从 dayKey 起一个新赛季（积分 / 任务 / 领奖 / 王朝轨全部重置）。
 * 返回 { dynasty, rolled }。dayKey 非法（'' / 脏值）⇒ 不滚动、不记账（reducer 不猜时间）。 */
function rollIfNeeded(dynasty, dayKey) {
  const d = normalize(dynasty, dayKey);
  if (dayNumber(dayKey) === null) return { dynasty: d, rolled: false };
  if (!d.startKey || seasonIndexOf(d.startKey, dayKey) > 0) {
    return { dynasty: empty(dayKey), rolled: true };
  }
  return { dynasty: d, rolled: false };
}

/* ---------------- 结算 ---------------- */

/* 一场结算 → 增量（积分 + 计数器 + 任务达成）。
 * info = { mode: 'pve'|'arena', result, stars, playStyle, gold, firstClear }
 * 调用方必须先 rollIfNeeded；本函数只做增量、不做跨窗。纯函数：同输入同输出。 */
function applySettle(dynasty, info) {
  const d = normalize(dynasty, '');
  const i = info || {};
  const mode = i.mode === 'arena' ? 'arena' : 'pve';
  const res = i.result === 'win' ? 'win' : (i.result === 'draw' ? 'draw' : 'lose');
  const missions = Object.assign({}, d.missions);

  function add(key, n) {
    const v = Math.floor((Number(missions[key]) || 0) + (Number(n) || 0));
    if (v > 0) missions[key] = v;
    else delete missions[key];
  }

  add(mode === 'arena' ? 'arenaBattles' : 'pveBattles', 1);

  const table = DY.points || {};
  let gained = Number(res === 'win' ? table[mode + 'Win'] : (res === 'draw' ? table[mode + 'Draw'] : table[mode + 'Lose'])) || 0;

  if (res === 'win') {
    add(mode === 'arena' ? 'arenaWins' : 'pveWins', 1);
    const streak = (Number(missions.streak) || 0) + 1;
    missions.streak = streak;
    missions.bestStreak = Math.max(Number(missions.bestStreak) || 0, streak);
    const style = ['inside', 'perimeter', 'balanced'].indexOf(i.playStyle) !== -1 ? i.playStyle : 'balanced';
    add(style + 'Wins', 1);
    if (mode === 'pve' && Number(i.stars) >= 3) add('perfectWins', 1);
  } else {
    missions.streak = 0; /* 平 / 负都断连胜 */
  }
  if (i.firstClear) gained += Number(table.firstClear) || 0;
  add('goldEarned', Math.max(0, Math.floor(Number(i.gold) || 0)));

  /* 任务达成检查：一任务只发一次分（completed 账本）；跨过目标值的当次结算就发 */
  const completed = Object.assign({}, d.completed);
  const done = [];
  (dynastyData.MISSIONS || []).forEach(function (m) {
    if (completed[m.id]) return;
    if ((Number(missions[m.counter]) || 0) >= (Number(m.target) || 0)) {
      completed[m.id] = true;
      gained += Number(m.points) || 0;
      done.push(m);
    }
  });

  const levelBefore = levelOf(d.points);
  const points = Math.max(0, d.points + gained);
  return {
    dynasty: {
      startKey: d.startKey, points: points, premium: d.premium,
      missions: missions, completed: completed, claimed: d.claimed
    },
    pointsGained: gained,
    missionsCompleted: done,
    levelBefore: levelBefore,
    levelAfter: levelOf(points)
  };
}

/* 结算计划 = 跨窗滚动 + 增量。commands 先算一遍用于返回值，reducer 用同参再算一遍落库 ——
 * 两侧都是纯函数、输入一模一样，不可能给出两个答案（与交易市场「reducer 重算货架」同一手法）。 */
function planSettle(dynasty, dayKey, info) {
  const roll = rollIfNeeded(dynasty, dayKey);
  if (dayNumber(dayKey) === null) {
    const lv = levelOf(roll.dynasty.points);
    return { rolled: false, settled: false, dynasty: roll.dynasty, pointsGained: 0, missionsCompleted: [], levelBefore: lv, levelAfter: lv };
  }
  const applied = applySettle(roll.dynasty, info);
  return {
    rolled: roll.rolled, settled: true,
    dynasty: applied.dynasty,
    pointsGained: applied.pointsGained,
    missionsCompleted: applied.missionsCompleted,
    levelBefore: applied.levelBefore,
    levelAfter: applied.levelAfter
  };
}

/* ---------------- 通行证等级 ---------------- */

function levelOf(points) {
  const per = Number(DY.pointsPerLevel) || 1;
  const max = Number(DY.levels) || 0;
  return Math.min(max, Math.floor(Math.max(0, Number(points) || 0) / per));
}

/* 等级进度（页面直接渲染；WXML 不算数，AGENTS §4） */
function progressOf(points) {
  const per = Number(DY.pointsPerLevel) || 1;
  const max = Number(DY.levels) || 0;
  const pts = Math.max(0, Number(points) || 0);
  const level = levelOf(pts);
  const maxed = level >= max;
  const base = level * per;
  const into = maxed ? per : Math.min(per, pts - base);
  return {
    level: level, maxed: maxed, points: pts,
    into: into, need: per,
    ratio: maxed ? 1 : into / per,
    toNext: maxed ? 0 : (base + per - pts),
    nextLevelPoints: maxed ? pts : base + per
  };
}

/* ---------------- 奖励 ---------------- */

/* 第 level 级的奖励对象（level 从 1 起；无奖励返回 null） */
function rewardOf(level, track) {
  const row = dynastyData.rowOf(level);
  if (!row) return null;
  if (track === 'premium') return row.premium || null;
  if (track === 'free') return row.free || null;
  return null;
}

/* 奖励归一为数组（当前每级单奖，数组形状给未来多奖行留口） */
function rewardsOf(reward) {
  if (!reward) return [];
  return Array.isArray(reward) ? reward.filter(Boolean) : [reward];
}

/* 奖励 → 展示文案（'金币 ×800' / '钻石 ×40' / '体力药水 ×1'）；引用解析不到时原样显示 id */
function rewardText(reward) {
  const r = reward || {};
  if (r.kind === 'gold') return '金币 ×' + (Number(r.amount) || 0);
  if (r.kind === 'diamond') return '钻石 ×' + (Number(r.amount) || 0);
  if (r.kind === 'item') {
    const it = itemsData.getItem(r.id);
    return (it ? it.name : r.id) + ' ×' + Math.max(1, Number(r.count) || 1);
  }
  return '奖励';
}

function rewardsText(reward) {
  return rewardsOf(reward).map(rewardText).join(' + ');
}

/* 领奖校验（commands 与 reducer 共用同一份纯函数；返回 { ok } 或 { ok:true, rewards, dynasty }） */
function planClaim(dynasty, dayKey, track, level) {
  const roll = rollIfNeeded(dynasty, dayKey);
  const d = roll.dynasty;
  const lv = Math.floor(Number(level) || 0);
  if (track !== 'free' && track !== 'premium') return { ok: false, reason: '奖励轨不存在' };
  if (lv < 1 || lv > (Number(DY.levels) || 0)) return { ok: false, reason: '等级不存在' };
  if (track === 'premium' && !d.premium) return { ok: false, reason: '王朝轨尚未解锁，先解锁再领' };
  if (levelOf(d.points) < lv) return { ok: false, reason: '赛季积分还不够（Lv.' + lv + ' 需要 ' + (lv * (Number(DY.pointsPerLevel) || 0)) + ' 分）' };
  const rewards = rewardsOf(rewardOf(lv, track));
  if (!rewards.length) return { ok: false, reason: '这一级没有奖励' };
  if (d.claimed[track + ':' + lv]) return { ok: false, reason: '这一级已经领过了' };
  return { ok: true, track: track, level: lv, rewards: rewards, dynasty: d, rolled: roll.rolled };
}

module.exports = {
  COUNTER_KEYS: COUNTER_KEYS,
  enabled: enabled,
  dayNumber: dayNumber,
  seasonIndexOf: seasonIndexOf,
  daysLeftOf: daysLeftOf,
  empty: empty,
  normalize: normalize,
  rollIfNeeded: rollIfNeeded,
  applySettle: applySettle,
  planSettle: planSettle,
  levelOf: levelOf,
  progressOf: progressOf,
  rewardOf: rewardOf,
  rewardsOf: rewardsOf,
  rewardText: rewardText,
  rewardsText: rewardsText,
  planClaim: planClaim
};
