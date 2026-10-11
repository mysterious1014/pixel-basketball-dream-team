/* utils/radar.js —— 19 项属性 → 六维雷达图归并（第十章「六维雷达图映射」单一出口）
 * 职责：得分/组织/篮板/防守/运动/续航 六个维度，每维取组成属性均值。
 * 说明：详情页 Canvas 雷达图只认这里输出的 6 个值，避免各页面自己拼维度导致口径不一致。
 */
const CONFIG = require('../config.js');
const ovr = require('./ovr.js');

const DIMS = CONFIG.radar.dims;

/* attrs → [{key,label,value}]，value 为组成属性均值（四舍五入，钳位 25–99） */
function toRadar(attrs) {
  const a = ovr.normalizeAttrs(attrs);
  return DIMS.map(function (d) {
    let sum = 0;
    for (let i = 0; i < d.from.length; i++) sum += a[d.from[i]];
    const v = Math.round(sum / d.from.length);
    return { key: d.key, label: d.label, value: v };
  });
}

/* 只做数值数组（Canvas 绘制用） */
function toValues(attrs) {
  return toRadar(attrs).map(function (d) { return d.value; });
}

/* 维度标签数组 */
function labels() {
  return DIMS.map(function (d) { return d.label; });
}

/* 自检：六维是否完整覆盖 19 项属性且不重复（tools/verify.mjs 会跑） */
function coverage() {
  const seen = [];
  DIMS.forEach(function (d) { d.from.forEach(function (k) { seen.push(k); }); });
  const missing = ovr.ATTR_KEYS.filter(function (k) { return seen.indexOf(k) === -1; });
  const dup = seen.filter(function (k, i) { return seen.indexOf(k) !== i; });
  return { total: seen.length, missing: missing, duplicated: dup };
}

module.exports = { toRadar: toRadar, toValues: toValues, labels: labels, dims: DIMS, coverage: coverage };
