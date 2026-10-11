/* data/daily.js —— 每日任务表（第十章页面清单「背包/商城/任务」的任务分页，里程碑 4）
 * 职责：只描述「每天有哪些任务、奖励是什么」——不写算法（算法在 utils/daily.js），不放开关（在 config.daily）。
 * 纪律：
 *   - DAILY_MISSIONS[].counter 必须是 utils/daily.js#COUNTER_KEYS 里的键（结算 / 抽卡时确定性推进）；
 *     target 为正整数、id 唯一。所有任务每天按本地日期重置，达成即自动发奖
 *     （一日内计数单调递增 ⇒ 同一任务每天至多发一次，不需要领取账本）。
 *   - reward 只允许 gold / diamond / item 三类（第九章「付费不卖直接战力」）：item 的 id 必须能在
 *     data/items.js 解析到，且不得是装备（装备直接改战斗属性，属直接战力）。Q 组第 1 条逐项校验。
 * 想调浓淡：任务目标 / 奖励改这里；改完跑 verify.mjs Q 组。
 * 数值口径（全清一天 ≈ 1600 金币 + 30 钻 + 普通券 ×1 + 体力药水 ×1）：
 *   对齐既有产出 —— 王朝免费轨 ≈1513 金币/日、竞技场 100 竞技币/日；每日任务是「活跃底薪」，
 *   钻石给到 30/日（约合 1/10 张高级券），不松动「钻石稀缺、高级抽 300 钻」的既有标定。
 */

const DAILY_MISSIONS = [
  { id: 'd_battle', counter: 'battles', target: 1, name: '晨练打卡', desc: '完成 1 场任意比赛（赛季征程或天梯）', reward: { kind: 'gold', amount: 800 } },
  { id: 'd_win', counter: 'wins', target: 2, name: '赢球节奏', desc: '赢下 2 场任意比赛', reward: { kind: 'diamond', amount: 30 } },
  { id: 'd_arena', counter: 'arenaBattles', target: 1, name: '天梯报到', desc: '完成 1 场天梯挑战', reward: { kind: 'gold', amount: 800 } },
  { id: 'd_pull', counter: 'pulls', target: 1, name: '球探出动', desc: '招募 1 次（任意卡池）', reward: { kind: 'item', id: 'ticket_normal', count: 1 } },
  { id: 'd_stamina', counter: 'staminaSpent', target: 60, name: '挥汗如雨', desc: '累计消耗 60 点体力（任意模式）', reward: { kind: 'item', id: 'stamina_potion', count: 1 } }
];

function getMission(id) {
  for (let i = 0; i < DAILY_MISSIONS.length; i++) if (DAILY_MISSIONS[i].id === id) return DAILY_MISSIONS[i];
  return null;
}

module.exports = {
  DAILY_MISSIONS: DAILY_MISSIONS,
  getMission: getMission
};