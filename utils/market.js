/* utils/market.js —— 交易市场纯算法层（第八章「创新玩法」，里程碑 3 第二块）
 * 职责：
 *   - poolCards()   市场池 = 全部非巅峰版本卡（巅峰卡是抽卡 + 时空进化的产物，市场不流通）
 *   - buyPrice / sellPrice / refreshCost：只查 config.market（数值不写死在这里）
 *   - shelfOf(dayKey, rerolls)：每日橱窗 = f(dayKey, rerolls)，纯函数、逐字节确定
 *   - seedOf(dayKey, rerolls)：橱窗随机源种子（可打印进测试失败信息）
 * 约束（可复现红线）：不读存档、不碰 wx、不取系统时间、不掷随机（AGENTS.md §3）。
 *   dayKey 由调用方（store/commands.js）从 now 切片后传入；随机只由 utils/rng.js 按种子驱动。
 * 为什么货架与「已拥有些什么」无关：见 config.market 裁决 5（否则买一张 → 货架重算 → 商品漂移）。 */
const CONFIG = require('../config.js');
const rngUtil = require('./rng.js');
const players = require('../data/players.js');
const marketData = require('../data/market.js');

const MKT = CONFIG.market;

function enabled() { return !!MKT.enabled; }

/* 市场池：全部非巅峰版本卡（与 data/players.js 同引用；当前 40 张，N10 / R8 / SR15 / SSR7） */
function poolCards() {
  return players.CARDS.filter(function (c) { return c.version !== players.VERSIONS[2]; });
}

function isMarketable(def) {
  return !!def && def.version !== players.VERSIONS[2];
}

function buyPrice(rarity) {
  const n = Number((MKT.buyPrice || {})[rarity]);
  return n > 0 ? n : 0;
}

function sellPrice(rarity) {
  const n = Number((MKT.sellPrice || {})[rarity]);
  return n > 0 ? n : 0;
}

function refreshCost() {
  const n = Number(MKT.refreshCost);
  return n > 0 ? n : 0;
}

function seedOf(dayKey, rerolls) {
  const key = (dayKey === undefined || dayKey === null) ? '' : String(dayKey);
  return 'market-' + key + '#' + Math.floor(Number(rerolls) || 0);
}

/* 每日橱窗：按 data/market.js 的档位顺序逐格抽卡。
 * 每格固定消耗 2 个随机数（先按权重抽稀有度，再在候选里等概率取一张），与「池子大小」无关；
 * 候选 = 池子里属于该档位稀有度、且未被本橱窗前面的格子选走的卡 ⇒ 同一天不出重复卡。
 * 同 (dayKey, rerolls) ⇒ 逐字节相同；换天 / 刷新（rerolls+1）⇒ 整架重掷。 */
function shelfOf(dayKey, rerolls) {
  const rng = rngUtil.createRng(seedOf(dayKey, rerolls));
  const slots = marketData.SLOTS || [];
  const pool = poolCards();
  const chosen = {};
  const out = [];
  slots.forEach(function (slot) {
    const groups = [];
    Object.keys(slot.weights || {}).forEach(function (r) {
      const list = pool.filter(function (c) { return c.rarity === r && !chosen[c.id]; });
      if (list.length) groups.push({ rarity: r, w: Number(slot.weights[r]) || 0, list: list });
    });
    if (!groups.length) return; /* 池子空转保护（未来某档稀有度被删空时，不崩、少一格） */
    const g = rng.weighted(groups);
    const card = rng.pick(g.list);
    chosen[card.id] = true;
    out.push({ slotKey: slot.key, slotLabel: slot.label, rarity: g.rarity, cardId: card.id });
  });
  return out;
}

module.exports = {
  enabled: enabled,
  poolCards: poolCards,
  isMarketable: isMarketable,
  buyPrice: buyPrice,
  sellPrice: sellPrice,
  refreshCost: refreshCost,
  seedOf: seedOf,
  shelfOf: shelfOf
};
