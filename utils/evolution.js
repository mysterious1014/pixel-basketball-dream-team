/* utils/evolution.js —— 时空进化公式（第八章「创新玩法」，里程碑 3 单一出口）
 * 职责：把「版本卡 → 巅峰碎片 → 合成巅峰卡」的全部换算收成纯函数：
 *       - shardValue：按稀有度查 config.growth.dupToShard（N2 / R4 / SR8 / SSR16 / UR32）
 *       - salvageValue：一张卡的分解价值，按**出厂稀有度**（config.evolution 裁决 2）
 *       - pairValue：「新秀版 + 现役版」成套献祭价值 = floor((v1 + v2) × pairMul)
 *       - peakCardOf / versionCardOf：在多版本卡表里找巅峰版 / 指定版本
 *       - peakCostOf：合成该巅峰卡所需碎片（未登记档位 = null = 不可进化）
 *       - progressPct：碎片进度（0–100）
 * 约束：不读存档、不取时间、不掷随机（AGENTS.md §3）。状态判定在 selectors，
 *       编排在 commands，业务校验在 reducers —— 这里只放公式。
 */
const CONFIG = require('../config.js');
const players = require('../data/players.js');
const fmt = require('./format.js');

const EVO = CONFIG.evolution;

const VERSION_ROOKIE = players.VERSIONS[0]; // 新秀版
const VERSION_ACTIVE = players.VERSIONS[1]; // 现役版
const VERSION_PEAK = players.VERSIONS[2];   // 巅峰传奇版

/* 开关做成函数：测试里改 CONFIG.evolution.enabled 要立刻生效（与 moment/enabled 同规） */
function enabled() { return !!EVO.enabled; }

/* 一张卡分解为巅峰碎片的价值（按出厂稀有度口径，养成不改变它） */
function shardValue(rarity) {
  return Number((CONFIG.growth.dupToShard || {})[rarity]) || 0;
}
function salvageValue(cardDef) {
  return cardDef ? shardValue(cardDef.rarity) : 0;
}

/* 「新秀版 + 现役版」成套献祭：价值 = 两张分解价值之和 × pairMul（向下取整，见裁决 6） */
function pairValue(rookieDef, activeDef) {
  const base = salvageValue(rookieDef) + salvageValue(activeDef);
  const mul = Number(EVO.pairMul) || 0;
  return Math.floor(base * mul);
}

function isPeakVersion(version) { return version === VERSION_PEAK; }

/* 从某球员的卡表里找巅峰传奇版 / 指定版本（没有 → null） */
function peakCardOf(cards) {
  const list = cards || [];
  for (let i = 0; i < list.length; i++) {
    if (isPeakVersion(list[i].version)) return list[i];
  }
  return null;
}
function versionCardOf(cards, version) {
  const list = cards || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].version === version) return list[i];
  }
  return null;
}

/* 合成巅峰卡的碎片价（按巅峰卡出厂稀有度；未登记 → null = 该球员不可进化） */
function peakCostOf(peakDef) {
  if (!peakDef) return null;
  const raw = (EVO.peakCost || {})[peakDef.rarity];
  if (raw === undefined || raw === null) return null;
  const cost = Number(raw);
  return cost > 0 ? cost : null;
}

/* 某球员是否参与时空进化：存在巅峰版且配置了价格 */
function evolvable(cards) {
  const peak = peakCardOf(cards);
  return !!peak && peakCostOf(peak) !== null;
}

function progressPct(current, cost) {
  const c = Number(cost) || 0;
  if (c <= 0) return 0;
  return fmt.clamp(Math.round(((Number(current) || 0) / c) * 100), 0, 100);
}

module.exports = {
  VERSION_ROOKIE: VERSION_ROOKIE,
  VERSION_ACTIVE: VERSION_ACTIVE,
  VERSION_PEAK: VERSION_PEAK,
  enabled: enabled,
  shardValue: shardValue,
  salvageValue: salvageValue,
  pairValue: pairValue,
  isPeakVersion: isPeakVersion,
  peakCardOf: peakCardOf,
  versionCardOf: versionCardOf,
  peakCostOf: peakCostOf,
  evolvable: evolvable,
  progressPct: progressPct
};