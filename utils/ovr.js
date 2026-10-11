/* utils/ovr.js —— OVR / 稀有度 / 薪资计算（第五章 5.4 单一出口）
 * 职责：按位置加权求 OVR、按 OVR 映射稀有度、按 OVR+稀有度算薪资。
 *
 * 【字面公式】OVR_raw = Σ(主属性×0.12) + Σ(其余14项×(0.4/14))，四舍五入取整。
 * 【标定】    OVR     = round(clamp(anchor + (OVR_raw - anchor) × slope, 25, 99))
 *   为什么加标定（文档内部冲突的裁决，详见 docs）：
 *   字面公式对「专项型巨星」有系统性压制——库里的 oreb/block 只有 40/32，
 *   而它们占 40% 权重，结果 OVR_raw=85.0 → 稀有度只有 SR。全联盟最高约 89，
 *   SSR(90-94)/UR(95-99) 永远为空 ⇒ 第七章「高级券 UR 2%」「90 抽必出 UR」无卡可发，抽卡系统直接崩。
 *   标定把 raw 线性拉伸回文档规定的稀有度带：库里 → 92/SSR，正好对上第十一章 schema 示例
 *   （rarity 'SSR'、salary 1200 万）。把 config.ovr.calibration.slope 设为 1 即还原字面公式。
 */
const CONFIG = require('../config.js');

const ATTR_KEYS = CONFIG.attrs.keys;
const ATTR_MIN = CONFIG.attrs.min;
const ATTR_MAX = CONFIG.attrs.max;
const POSITION_PRIMARY = CONFIG.ovr.positionPrimary;
const POSITIONS = Object.keys(POSITION_PRIMARY);

/* 某位置的 5 项主属性 */
function primaryKeys(position) {
  return POSITION_PRIMARY[position] || POSITION_PRIMARY.SF;
}

/* 某位置的其余 14 项属性 */
function secondaryKeys(position) {
  const pri = primaryKeys(position);
  return ATTR_KEYS.filter(function (k) { return pri.indexOf(k) === -1; });
}

/* 属性兜底：缺失键补 ATTR_MIN，越界钳位，非法值转数字 */
function normalizeAttrs(attrs) {
  const out = {};
  const src = attrs || {};
  for (let i = 0; i < ATTR_KEYS.length; i++) {
    const k = ATTR_KEYS[i];
    let v = Number(src[k]);
    if (!isFinite(v)) v = ATTR_MIN;
    out[k] = Math.round(v < ATTR_MIN ? ATTR_MIN : (v > ATTR_MAX ? ATTR_MAX : v));
  }
  return out;
}

/* 字面公式：不做标定，返回带小数的加权原始分 */
function rawOvr(attrs, position) {
  const a = normalizeAttrs(attrs);
  const pri = primaryKeys(position);
  const sec = secondaryKeys(position);
  const perSecondary = CONFIG.ovr.secondaryTotal / sec.length; // 0.4 / 14
  let sum = 0;
  for (let i = 0; i < pri.length; i++) sum += a[pri[i]] * CONFIG.ovr.primaryWeight;
  for (let i = 0; i < sec.length; i++) sum += a[sec[i]] * perSecondary;
  return sum;
}

/* 最终 OVR：标定 + 钳位 + 取整，范围 25–99 */
function computeOvr(attrs, position) {
  const cal = CONFIG.ovr.calibration;
  const raw = rawOvr(attrs, position);
  const v = cal.anchor + (raw - cal.anchor) * cal.slope;
  return Math.round(v < CONFIG.ovr.min ? CONFIG.ovr.min : (v > CONFIG.ovr.max ? CONFIG.ovr.max : v));
}

/* OVR → 稀有度（覆盖 25–99 全区间） */
function rarityOf(ovr) {
  const bands = CONFIG.rarity.bands;
  for (let i = 0; i < bands.length; i++) {
    if (ovr >= bands[i].min && ovr <= bands[i].max) return bands[i].key;
  }
  return ovr > bands[0].max ? bands[0].key : bands[bands.length - 1].key;
}

/* (OVR, 稀有度) → 单卡薪资（单位：万） */
function salaryOf(ovr, rarity) {
  const s = CONFIG.salary;
  if (ovr < s.threshold) return s.base;
  const coef = s.coef[rarity] || 1;
  const v = Math.round((ovr - s.threshold) * coef * s.scale);
  return v < s.base ? s.base : v;
}

/* 一次算出 OVR/稀有度/薪资（数据层与养成层都走这里，保证三处一致） */
function evaluate(attrs, position) {
  const norm = normalizeAttrs(attrs);
  const raw = rawOvr(norm, position);
  const cal = CONFIG.ovr.calibration;
  let ovr = Math.round(cal.anchor + (raw - cal.anchor) * cal.slope);
  ovr = ovr < CONFIG.ovr.min ? CONFIG.ovr.min : (ovr > CONFIG.ovr.max ? CONFIG.ovr.max : ovr);
  const rarity = rarityOf(ovr);
  return { ovrRaw: Math.round(raw * 100) / 100, ovr: ovr, rarity: rarity, salary: salaryOf(ovr, rarity) };
}

/* 阵容薪资合计（工资帽校验用） */
function totalSalary(cards) {
  let sum = 0;
  for (let i = 0; i < (cards || []).length; i++) {
    if (cards[i]) sum += Number(cards[i].salary) || 0;
  }
  return sum;
}

module.exports = {
  ATTR_KEYS: ATTR_KEYS,
  ATTR_LABELS: CONFIG.attrs.labels,
  POSITIONS: POSITIONS,
  primaryKeys: primaryKeys,
  secondaryKeys: secondaryKeys,
  normalizeAttrs: normalizeAttrs,
  rawOvr: rawOvr,
  computeOvr: computeOvr,
  rarityOf: rarityOf,
  salaryOf: salaryOf,
  evaluate: evaluate,
  totalSalary: totalSalary
};
