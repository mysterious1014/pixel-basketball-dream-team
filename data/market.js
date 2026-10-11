/* data/market.js —— 交易市场橱窗档位（第八章「创新玩法」：「交易市场 & 王朝赛季（里程碑 3）」）
 * 职责：描述「每日橱窗有哪几格、每格出什么稀有度、格名叫什么」——只描述是什么，
 *       不写算法（算法在 utils/market.js#shelfOf），也不放价格（数值在 config.market）。
 * weights 是**加权抽稀有度**的相对权重（只从当前池子里有货的稀有度中抽，权重不必凑满 100）；
 * 池子口径：全部非巅峰版本卡（市场不流通巅峰卡，见 config.market 裁决 1）。
 * 橱窗出现率（当前池：N10 / R8 / SR15 / SSR7，无 UR）——
 *   基础位 N65/R35；轮换位 R60/SR40；焦点位 SR85/SSR15；名将位 SR80/SSR20；
 *   神秘位 N20/R35/SR37/SSR8 ⇒ 每天约 37% 能看到至少一张 SSR，其余天数也必有 SR 档可选。
 * 想调浓淡只改这里的权重；改完跑 verify.mjs O 组（货架确定性 / 无重复 / 稀有度归属）。 */
const SLOTS = [
  { key: 'basic', label: '基础橱窗', weights: { N: 65, R: 35 } },
  { key: 'rotate', label: '轮换橱窗', weights: { R: 60, SR: 40 } },
  { key: 'focus', label: '焦点橱窗', weights: { SR: 85, SSR: 15 } },
  { key: 'star', label: '名将橱窗', weights: { SR: 80, SSR: 20 } },
  { key: 'mystery', label: '神秘橱窗', weights: { N: 20, R: 35, SR: 37, SSR: 8 } }
];

module.exports = { SLOTS: SLOTS };
