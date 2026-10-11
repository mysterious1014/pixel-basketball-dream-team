/* utils/daily.js —— 每日任务纯算法层（第十章页面清单「任务」，里程碑 4）
 * 职责：
 *   - empty / normalize / rollIfNeeded：每日段的形状与跨天滚动（dayKey 由调用方传入）
 *   - applySettle / planSettle：推进计数器 → 返回「本日新达成的任务」（达成即自动发奖，不设领取账本）
 *   - rewardText / rewardsText：奖励文案从 reward 结构反推（不手写文案，改表即改口径）
 * 约束（可复现红线）：不读存档、不碰 wx、不取系统时间、不掷随机（AGENTS.md §3）。
 *   dayKey 一律由调用方（store/commands.js 切片、reducer 透传）传入；本文件与战斗引擎零耦合 ——
 *   计数只是「结算 / 抽卡的记账」，不参与比分计算。任务表在 data/daily.js，开关在 config.daily。
 */
const CONFIG = require('../config.js');
const dailyData = require('../data/daily.js');
const itemsData = require('../data/items.js');

const D = CONFIG.daily;

/* 结算 / 抽卡会推进的计数器全集：data/daily.js#DAILY_MISSIONS[].counter 必须落在这个集合里（Q 组第 1 条校验）。
 * normalize 用它做白名单清洗 —— 脏存档里多出来的键一律丢弃，宁丢勿崩。 */
const COUNTER_KEYS = ['battles', 'wins', 'arenaBattles', 'pulls', 'staminaSpent'];

function enabled() { return !!D.enabled; }

/* 'YYYY-MM-DD' 形状校验（纯字符串判断，不读系统时间；与 utils/dynasty.js#dayNumber 的口径一致）。 */
function isValidKey(dayKey) { return /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')); }

/* 空每日段（dayKey = 建档当天）。initial-state / 跨天滚动共用。 */
function empty(dayKey) {
  return { dayKey: String(dayKey || ''), counters: {} };
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

/* 形状归一（存档迁移共用）：脏值一律归零，宁丢勿崩 */
function normalize(raw, dayKey) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const key = (typeof r.dayKey === 'string' && isValidKey(r.dayKey)) ? r.dayKey : String(dayKey || '');
  return { dayKey: key, counters: cleanCounters(r.counters) };
}

/* 跨天滚动：dayKey 与存档不一致 ⇒ 从 dayKey 起新的一天（计数器整体重置）。
 * dayKey 非法（'' / 脏值）⇒ 不滚动、不记账（reducer 不猜时间）。 */
function rollIfNeeded(daily, dayKey) {
  const d = normalize(daily, dayKey);
  if (!isValidKey(dayKey)) return { daily: d, rolled: false };
  if (d.dayKey !== String(dayKey)) return { daily: empty(dayKey), rolled: true };
  return { daily: d, rolled: false };
}

/* 一次结算 / 抽卡 → 计数器增量 + 新达成任务。
 * gains = { battles, wins, arenaBattles, pulls, staminaSpent }（非负整数，其余键忽略）。
 * 调用方必须先拿 dayKey（本函数内部会先 rollIfNeeded）；纯函数：同输入同输出、不改入参。
 * 达成判据 = 「本次推进跨过阈值」（before < target ≤ after）：
 *   一日内计数单调递增 ⇒ 同一任务每天至多触发一次；跨天后计数器清零 ⇒ 明天可再次达成。 */
function applySettle(daily, dayKey, gains) {
  const roll = rollIfNeeded(daily, dayKey);
  const d = roll.daily;
  const counters = Object.assign({}, d.counters);
  const pairs = {};
  COUNTER_KEYS.forEach(function (k) {
    const add = Math.floor(Number(gains && gains[k]) || 0);
    if (add <= 0) return;
    const before = Number(counters[k]) || 0;
    counters[k] = before + add;
    pairs[k] = { before: before, after: counters[k] };
  });
  const completed = [];
  (dailyData.DAILY_MISSIONS || []).forEach(function (m) {
    const p = pairs[m.counter];
    if (!p) return;
    if (p.before < (Number(m.target) || 0) && p.after >= (Number(m.target) || 0)) completed.push(m);
  });
  return { daily: { dayKey: d.dayKey, counters: counters }, rolled: roll.rolled, completed: completed };
}

/* 结算计划 = 跨天滚动 + 增量。commands 先算一遍用于返回值，reducer 用同参再算一遍落库 ——
 * 两侧都是纯函数、输入一模一样，不可能给出两个答案（与王朝赛季 planSettle 同一手法）。 */
function planSettle(daily, dayKey, gains) {
  if (!isValidKey(dayKey)) {
    return { rolled: false, settled: false, daily: normalize(daily, ''), completed: [] };
  }
  const applied = applySettle(daily, dayKey, gains);
  return { rolled: applied.rolled, settled: true, daily: applied.daily, completed: applied.completed };
}

/* ---------------- 奖励文案（从 reward 反推；同一条文给通知 / 页面共用） ---------------- */

function rewardText(reward) {
  const r = reward || {};
  if (r.kind === 'gold') return '+' + (Number(r.amount) || 0) + ' 金币';
  if (r.kind === 'diamond') return '+' + (Number(r.amount) || 0) + ' 钻石';
  if (r.kind === 'item') {
    const it = itemsData.getItem(r.id);
    return '+' + (it ? it.name : r.id) + ' ×' + Math.max(1, Number(r.count) || 1);
  }
  return '';
}

function rewardsText(rewards) {
  return (rewards || []).map(rewardText).filter(function (t) { return !!t; }).join('、');
}

/* 把一批「新达成任务」的奖励合成为一条通知文案（reducer 与页面模板共用） */
function completedText(completed) {
  const list = completed || [];
  if (!list.length) return '';
  return list[0].name + (list.length > 1 ? ' 等 ' + list.length + ' 项' : '');
}

module.exports = {
  COUNTER_KEYS: COUNTER_KEYS,
  enabled: enabled,
  isValidKey: isValidKey,
  empty: empty,
  normalize: normalize,
  rollIfNeeded: rollIfNeeded,
  applySettle: applySettle,
  planSettle: planSettle,
  rewardText: rewardText,
  rewardsText: rewardsText,
  completedText: completedText
};