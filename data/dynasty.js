/* data/dynasty.js —— 王朝赛季任务表 + 通行证奖励轨（第八章「创新玩法」：「交易市场 & 王朝赛季」，里程碑 3 第三块）
 * 职责：只描述「有哪些任务、每级奖励是什么」——不写算法（算法在 utils/dynasty.js），不放经济口径（在 config.dynasty）。
 * 纪律：
 *   - MISSIONS[].counter 必须是 utils/dynasty.js#COUNTER_KEYS 里的键（结算时由 applySettle 确定性推进）；
 *     target / points 为正整数，id 唯一。达成即发一次积分（completed 账本防重复，见 config.dynasty 裁决 4）。
 *   - PASS_TRACK 覆盖 1..config.dynasty.levels 每一级；free 每级都有奖励，premium 只在每 5 级有（其余 null）。
 *     item 奖励的 id 必须能在 data/items.js 解析到（P 组第 1 条会逐项校验）。
 * 想调浓淡：任务目标 / 积分改 MISSIONS，奖励改 PASS_TRACK；改完跑 verify.mjs P 组。
 */

const MISSIONS = [
  { id: 'm_pve_1', counter: 'pveWins', target: 5, points: 150, name: '热身完毕', desc: '本赛季赢得 5 场 PVE 比赛' },
  { id: 'm_pve_2', counter: 'pveWins', target: 15, points: 300, name: '轮换阵容', desc: '本赛季赢得 15 场 PVE 比赛' },
  { id: 'm_pve_3', counter: 'pveWins', target: 30, points: 500, name: '赛季全勤', desc: '本赛季赢得 30 场 PVE 比赛' },
  { id: 'm_arena_1', counter: 'arenaWins', target: 3, points: 150, name: '天梯入门', desc: '本赛季赢下 3 场天梯挑战' },
  { id: 'm_arena_2', counter: 'arenaWins', target: 10, points: 300, name: '天梯常客', desc: '本赛季赢下 10 场天梯挑战' },
  { id: 'm_arena_3', counter: 'arenaWins', target: 20, points: 500, name: '天梯统治者', desc: '本赛季赢下 20 场天梯挑战' },
  { id: 'm_streak_1', counter: 'bestStreak', target: 3, points: 150, name: '三连击', desc: '本赛季打出一次 3 连胜' },
  { id: 'm_streak_2', counter: 'bestStreak', target: 6, points: 300, name: '六连胜', desc: '本赛季打出一次 6 连胜' },
  { id: 'm_streak_3', counter: 'bestStreak', target: 10, points: 450, name: '十战十胜', desc: '本赛季打出一次 10 连胜' },
  { id: 'm_style_inside', counter: 'insideWins', target: 5, points: 200, name: '禁区碾压', desc: '用「强攻内线」打法赢 5 场（任何模式）' },
  { id: 'm_style_perimeter', counter: 'perimeterWins', target: 5, points: 200, name: '三分暴雨', desc: '用「外线投射」打法赢 5 场（任何模式）' },
  { id: 'm_style_balanced', counter: 'balancedWins', target: 5, points: 200, name: '均衡之道', desc: '用「均衡攻防」打法赢 5 场（任何模式）' },
  { id: 'm_perfect_1', counter: 'perfectWins', target: 3, points: 200, name: '完美首秀', desc: '3★ 拿下 3 场 PVE 比赛（重复挑战也算）' },
  { id: 'm_perfect_2', counter: 'perfectWins', target: 9, points: 350, name: '完美主义', desc: '3★ 拿下 9 场 PVE 比赛（重复挑战也算）' },
  { id: 'm_gold_1', counter: 'goldEarned', target: 40000, points: 200, name: '小有积蓄', desc: '本赛季累计获得 4 万金币（PVE + 天梯）' },
  { id: 'm_gold_2', counter: 'goldEarned', target: 120000, points: 350, name: '富甲一方', desc: '本赛季累计获得 12 万金币（PVE + 天梯）' }
];

const PASS_TRACK = [
  { level: 1, free: { kind: 'gold', amount: 400 }, premium: null },
  { level: 2, free: { kind: 'gold', amount: 450 }, premium: null },
  { level: 3, free: { kind: 'gold', amount: 500 }, premium: null },
  { level: 4, free: { kind: 'gold', amount: 550 }, premium: null },
  { level: 5, free: { kind: 'gold', amount: 600 }, premium: { kind: 'item', id: 'gold_pack', count: 2 } },
  { level: 6, free: { kind: 'gold', amount: 650 }, premium: null },
  { level: 7, free: { kind: 'gold', amount: 700 }, premium: null },
  { level: 8, free: { kind: 'gold', amount: 750 }, premium: null },
  { level: 9, free: { kind: 'gold', amount: 800 }, premium: null },
  { level: 10, free: { kind: 'diamond', amount: 40 }, premium: { kind: 'diamond', amount: 40 } },
  { level: 11, free: { kind: 'gold', amount: 900 }, premium: null },
  { level: 12, free: { kind: 'gold', amount: 900 }, premium: null },
  { level: 13, free: { kind: 'gold', amount: 900 }, premium: null },
  { level: 14, free: { kind: 'gold', amount: 900 }, premium: null },
  { level: 15, free: { kind: 'item', id: 'stamina_potion', count: 1 }, premium: { kind: 'item', id: 'gold_pack', count: 2 } },
  { level: 16, free: { kind: 'gold', amount: 1000 }, premium: null },
  { level: 17, free: { kind: 'gold', amount: 1000 }, premium: null },
  { level: 18, free: { kind: 'gold', amount: 1000 }, premium: null },
  { level: 19, free: { kind: 'gold', amount: 1000 }, premium: null },
  { level: 20, free: { kind: 'diamond', amount: 50 }, premium: { kind: 'diamond', amount: 60 } },
  { level: 21, free: { kind: 'gold', amount: 1100 }, premium: null },
  { level: 22, free: { kind: 'gold', amount: 1100 }, premium: null },
  { level: 23, free: { kind: 'gold', amount: 1100 }, premium: null },
  { level: 24, free: { kind: 'gold', amount: 1100 }, premium: null },
  { level: 25, free: { kind: 'item', id: 'ticket_normal', count: 2 }, premium: { kind: 'item', id: 'gold_pack', count: 3 } },
  { level: 26, free: { kind: 'gold', amount: 1200 }, premium: null },
  { level: 27, free: { kind: 'gold', amount: 1200 }, premium: null },
  { level: 28, free: { kind: 'gold', amount: 1200 }, premium: null },
  { level: 29, free: { kind: 'gold', amount: 1200 }, premium: null },
  { level: 30, free: { kind: 'diamond', amount: 60 }, premium: { kind: 'diamond', amount: 80 } },
  { level: 31, free: { kind: 'gold', amount: 1300 }, premium: null },
  { level: 32, free: { kind: 'gold', amount: 1300 }, premium: null },
  { level: 33, free: { kind: 'gold', amount: 1300 }, premium: null },
  { level: 34, free: { kind: 'gold', amount: 1300 }, premium: null },
  { level: 35, free: { kind: 'item', id: 'stamina_potion', count: 2 }, premium: { kind: 'item', id: 'gold_pack', count: 3 } },
  { level: 36, free: { kind: 'gold', amount: 1400 }, premium: null },
  { level: 37, free: { kind: 'gold', amount: 1400 }, premium: null },
  { level: 38, free: { kind: 'gold', amount: 1400 }, premium: null },
  { level: 39, free: { kind: 'gold', amount: 1400 }, premium: null },
  { level: 40, free: { kind: 'diamond', amount: 80 }, premium: { kind: 'item', id: 'gold_pack', count: 4 } },
  { level: 41, free: { kind: 'gold', amount: 1500 }, premium: null },
  { level: 42, free: { kind: 'gold', amount: 1500 }, premium: null },
  { level: 43, free: { kind: 'gold', amount: 1500 }, premium: null },
  { level: 44, free: { kind: 'gold', amount: 1500 }, premium: null },
  { level: 45, free: { kind: 'diamond', amount: 100 }, premium: { kind: 'item', id: 'ticket_advanced', count: 3 } },
  { level: 46, free: { kind: 'gold', amount: 1600 }, premium: null },
  { level: 47, free: { kind: 'gold', amount: 1600 }, premium: null },
  { level: 48, free: { kind: 'gold', amount: 1600 }, premium: null },
  { level: 49, free: { kind: 'gold', amount: 1600 }, premium: null },
  { level: 50, free: { kind: 'item', id: 'ticket_advanced', count: 2 }, premium: { kind: 'diamond', amount: 150 } }
];

function getMission(id) {
  for (let i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i];
  return null;
}

function rowOf(level) {
  const lv = Math.floor(Number(level) || 0);
  for (let i = 0; i < PASS_TRACK.length; i++) if (PASS_TRACK[i].level === lv) return PASS_TRACK[i];
  return null;
}

module.exports = {
  MISSIONS: MISSIONS,
  PASS_TRACK: PASS_TRACK,
  getMission: getMission,
  rowOf: rowOf
};
