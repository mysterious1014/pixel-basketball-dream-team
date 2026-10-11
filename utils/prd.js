/* utils/prd.js —— 抽卡与 PRD 保底（第七章 7.1 单一出口）
 * 职责：按基础概率表 + PRD 递增 + 十连保底 + 硬保底，产出一次/十连抽卡结果。
 *
 * 【PRD 口径】p_eff = min(cap, p + (n-1) * inc)，n = 本次抽卡前「连续未出 UR 的抽数 + 1」。
 *   文档给的 inc=0.02 会让 p_eff 在第 50 抽达到 1，因此 90 抽硬保底实际上永远不会触发
 *   （它是兜底，不是主力）。想要真实 90 抽体验，把 config.gacha.prd.inc 调成 0.005。
 * 【副作用说明】UR 单独先掷，其余档位在「未出 UR」的分支里按原比例归一化，
 *   所以 R/SR/SSR 的实际边际概率会随 PRD 上升而轻微下降——这是标准 PRD 行为，概率公示页按基础表展示。
 * 本模块是纯函数：不读存档、不用 Math.random，随机源由调用方注入（可复现、可回归测试）。
 */
const CONFIG = require('../config.js');
const fmt = require('./format.js');

const RARITY_RANK = CONFIG.rarity.order; // ['N','R','SR','SSR','UR']

function rarityRank(r) { return RARITY_RANK.indexOf(r); }

/* PRD 有效概率：p + (n-1)*inc，钳位到 cap */
function prdEffective(baseP, n, prdCfg) {
  const cfg = prdCfg || CONFIG.gacha.prd;
  if (!(baseP > 0)) return 0;
  const v = baseP + (Math.max(1, n) - 1) * cfg.inc;
  return fmt.clamp(v, 0, cfg.cap);
}

/* 在「非 UR」分支里按基础概率归一化抽一个档位 */
function rollNonUr(rng, pool, urKey) {
  const items = [];
  Object.keys(pool.rates).forEach(function (k) {
    if (k === urKey) return;
    const w = Number(pool.rates[k]) || 0;
    if (w > 0) items.push({ k: k, w: w });
  });
  if (!items.length) return pool.allow[pool.allow.length - 1];
  return rng.weighted(items, 'w').k;
}

/* 按稀有度从卡池里等概率挑一张卡（cardIndex: rarity → [cardDef]） */
function pickCard(rng, byRarity, rarity) {
  const list = byRarity[rarity];
  if (!list || !list.length) {
    // 该档位无卡时向下兜底，避免抽到空
    for (let i = rarityRank(rarity) - 1; i >= 0; i--) {
      const alt = list && list.length ? list : byRarity[RARITY_RANK[i]];
      if (alt && alt.length) return rng.pick(alt);
    }
    return null;
  }
  return rng.pick(list);
}

/* 单抽：返回 { rarity, cardId, forced, prdP } */
function rollOnce(rng, pool, pity, byRarity) {
  const urKey = CONFIG.gacha.prd.targetRarity;
  const baseUr = Number(pool.rates[urKey]) || 0;
  const n = (pity.urPity || 0) + 1;
  const hardPity = pool.key === 'advanced' ? CONFIG.gacha.pity.advancedUrHardPity : 0;

  let rarity = null;
  let forced = null;
  let prdP = 0;

  if (baseUr > 0) {
    prdP = prdEffective(baseUr, n);
    if (hardPity && n >= hardPity) {
      rarity = urKey;
      forced = 'hardPity';
    } else if (rng.chance(prdP)) {
      rarity = urKey;
      if (prdP >= 1) forced = 'prd';
    }
  }
  if (!rarity) rarity = rollNonUr(rng, pool, urKey);

  const card = pickCard(rng, byRarity, rarity);
  return {
    rarity: rarity,
    cardId: card ? card.id : null,
    baseRarity: rarity,
    forced: forced,
    prdP: prdP,
    prdN: n
  };
}

/* 一批抽卡（单抽或十连）。pity 传入当前值，返回更新后的 pity，调用方负责落库。 */
function pullBatch(rng, pool, pityIn, byRarity, count) {
  const pity = {
    urPity: (pityIn && pityIn.urPity) || 0,
    totalPulls: (pityIn && pityIn.totalPulls) || 0,
    totalUr: (pityIn && pityIn.totalUr) || 0
  };
  const n = count || 1;
  const results = [];
  const urKey = CONFIG.gacha.prd.targetRarity;

  for (let i = 0; i < n; i++) {
    const r = rollOnce(rng, pool, pity, byRarity);
    results.push(r);
    if (r.rarity === urKey) { pity.urPity = 0; pity.totalUr += 1; } else { pity.urPity += 1; }
    pity.totalPulls += 1;
  }

  // 十连必出 SR+：若整批没有任何 >= SR 的结果，把最后一抽强制升到保底档位
  const minRank = rarityRank(CONFIG.gacha.tenPull.guaranteeMinRarity);
  let guaranteeApplied = false;
  if (n >= CONFIG.gacha.tenPull.count && minRank >= 0) {
    const hasHigh = results.some(function (r) { return rarityRank(r.rarity) >= minRank; });
    if (!hasHigh) {
      const last = results[results.length - 1];
      const target = CONFIG.gacha.tenPull.guaranteeMinRarity;
      const card = pickCard(rng, byRarity, target);
      last.rarity = target;
      last.cardId = card ? card.id : last.cardId;
      last.forced = 'tenPull';
      guaranteeApplied = true;
    }
  }

  return { results: results, pity: pity, guaranteeApplied: guaranteeApplied, poolKey: pool.key };
}

/* 概率公示（招募页展示，合规要求：不声称来自任何官方数据源） */
function publicRates(pool) {
  const out = [];
  RARITY_RANK.forEach(function (k) {
    const p = Number(pool.rates[k]) || 0;
    if (p <= 0) return;
    out.push({ rarity: k, label: CONFIG.rarity.labels[k], rate: p, text: fmt.pct(p, p < 0.01 ? 2 : 1) });
  });
  return out;
}

module.exports = {
  pullBatch: pullBatch,
  rollOnce: rollOnce,
  prdEffective: prdEffective,
  publicRates: publicRates,
  rarityRank: rarityRank,
  RARITY_RANK: RARITY_RANK
};
