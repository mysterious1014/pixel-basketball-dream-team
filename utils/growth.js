/* utils/growth.js —— 养成公式（第七章 7.5 单一出口）
 * 职责：等级 / 星级 / 突破 / 装备 → 有效属性，再由 utils/ovr.js 推出有效 OVR、稀有度、薪资。
 * 口径说明：
 *   - baseOvr / baseRarity：卡牌出厂值（数据层固化，抽卡卡池按它归档）；
 *   - ovr / rarity / salary：养成后的有效值（阵容与工资帽按它校验）。
 *   - 稀有度始终由当前 OVR 推导（第五章 5.4），因此养满可以从 SSR 升到 UR，但不会改变它在卡池里的档位。
 */
const CONFIG = require('../config.js');
const ovrUtil = require('./ovr.js');
const fmt = require('./format.js');

const G = CONFIG.growth;

/* 等级/星级/突破带来的全属性加成（向下取整，最终钳位 99） */
function growthBonus(level, stars, breakthrough) {
  const lv = fmt.clamp(Number(level) || 1, 1, G.levelMax);
  const st = fmt.clamp(Number(stars) || 1, 1, G.starMax);
  const br = fmt.clamp(Number(breakthrough) || 0, 0, G.breakMax);
  return Math.floor((lv - 1) * G.perLevel) + (st - 1) * G.perStar + br * G.perBreak;
}

/* 装备加成：items = {itemId: itemDef}，equipped = {shoes:'id', wrist:'id', head:'id'} */
function equipmentBonus(equipped, itemIndex) {
  const out = {};
  if (!equipped || !itemIndex) return out;
  Object.keys(equipped).forEach(function (slot) {
    const id = equipped[slot];
    if (!id) return;
    const item = itemIndex[id];
    if (!item || item.slot !== slot) return;
    Object.keys(item.bonus || {}).forEach(function (k) {
      out[k] = (out[k] || 0) + (Number(item.bonus[k]) || 0);
    });
  });
  return out;
}

/* 基础属性 + 养成 → 有效属性（钳位 attrCap） */
function effectiveAttrs(baseAttrs, instance, itemIndex) {
  const base = ovrUtil.normalizeAttrs(baseAttrs);
  const bonus = growthBonus(instance && instance.level, instance && instance.stars, instance && instance.breakthrough);
  const eq = equipmentBonus(instance && instance.equipment, itemIndex);
  const out = {};
  for (let i = 0; i < ovrUtil.ATTR_KEYS.length; i++) {
    const k = ovrUtil.ATTR_KEYS[i];
    const v = base[k] + bonus + (eq[k] || 0);
    out[k] = Math.round(fmt.clamp(v, CONFIG.attrs.min, G.attrCap));
  }
  return out;
}

/* 一张卡的完整有效面板（详情页 / 阵容页 / 战斗都走这里） */
function effectiveCard(cardDef, instance, itemIndex) {
  const attrs = effectiveAttrs(cardDef.attrs, instance, itemIndex);
  const ev = ovrUtil.evaluate(attrs, cardDef.position);
  const lv = fmt.clamp((instance && instance.level) || 1, 1, G.levelMax);
  return {
    uid: instance && instance.uid,
    cardId: cardDef.id,
    playerId: cardDef.playerId,
    name: cardDef.name,
    alias: cardDef.alias || '',
    team: cardDef.team,
    city: cardDef.city,
    number: cardDef.number,
    position: cardDef.position,
    version: cardDef.version,
    era: cardDef.era,
    draft: cardDef.draft,
    academy: !!cardDef.academy,
    signature: cardDef.signature,
    tags: cardDef.tags || [],
    attrs: attrs,
    level: lv,
    stars: fmt.clamp((instance && instance.stars) || 1, 1, G.starMax),
    breakthrough: fmt.clamp((instance && instance.breakthrough) || 0, 0, G.breakMax),
    equipment: (instance && instance.equipment) || { shoes: null, wrist: null, head: null },
    /* 时刻卡（里程碑 2）：原样带出实例上的 id，供 selectors.homeTeam / battle.normalizeTeam 解析。
     * 刻意**不并入 attrs** —— config.moment 裁决 4：时刻卡是实战触发，不是面板属性，
     * 所以详情页的属性表与 OVR 不会因为换一张卡而跳动。 */
    moment: (instance && instance.moment) || '',
    bonus: growthBonus(lv, (instance && instance.stars) || 1, (instance && instance.breakthrough) || 0),
    baseOvr: cardDef.ovr,
    baseRarity: cardDef.rarity,
    baseSalary: cardDef.salary,
    ovrRaw: ev.ovrRaw,
    ovr: ev.ovr,
    rarity: ev.rarity,
    salary: ev.salary
  };
}

/* 升到 level+1 需要的金币 */
function levelUpCost(level) {
  const lv = fmt.clamp(Number(level) || 1, 1, G.levelMax);
  return Math.round(G.levelGoldBase * Math.pow(G.levelGoldGrowth, lv - 1));
}

/* 升到 stars+1 需要的同名卡数量（0 = 已满星） */
function starUpCost(stars) {
  const st = fmt.clamp(Number(stars) || 1, 1, G.starMax);
  if (st >= G.starMax) return 0;
  return G.starDupCost[st] || 1;
}

/* 突破到 breakthrough+1 的消耗（null = 已满突破） */
function breakCost(breakthrough) {
  const br = fmt.clamp(Number(breakthrough) || 0, 0, G.breakMax);
  if (br >= G.breakMax) return null;
  return G.breakCost[br] || null;
}

/* 升级前校验：返回 {ok, reason} */
function checkLevelUp(instance, profile) {
  const lv = (instance && instance.level) || 1;
  if (lv >= G.levelMax) return { ok: false, reason: '已满级（Lv.' + G.levelMax + '）' };
  const cost = levelUpCost(lv);
  if ((profile.gold || 0) < cost) return { ok: false, reason: '金币不足，需要 ' + fmt.numText(cost) };
  return { ok: true, cost: cost, nextLevel: lv + 1 };
}

module.exports = {
  growthBonus: growthBonus,
  equipmentBonus: equipmentBonus,
  effectiveAttrs: effectiveAttrs,
  effectiveCard: effectiveCard,
  levelUpCost: levelUpCost,
  starUpCost: starUpCost,
  breakCost: breakCost,
  checkLevelUp: checkLevelUp,
  limits: { levelMax: G.levelMax, starMax: G.starMax, breakMax: G.breakMax }
};
