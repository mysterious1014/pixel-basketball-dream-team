/* utils/format.js —— 展示格式化工具
 * 职责：万/亿缩写、时间格式化、体力倒计时、百分比、钳位与四舍五入等纯函数。
 */

function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

function round(v) { return Math.round(Number(v) || 0); }

/* 金额（单位：万）→ 显示文本：1201 → 1201 万；>=10000 → 1.0 亿 */
function salaryText(wan) {
  const n = Number(wan) || 0;
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 亿';
  return String(Math.round(n)) + ' 万';
}

/* 大数字缩写：12345 → 1.2万 */
function numText(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(2) + '亿';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万';
  return String(Math.round(v));
}

function pct(v, digits) {
  const d = digits === undefined ? 1 : digits;
  return ((Number(v) || 0) * 100).toFixed(d) + '%';
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* 秒 → mm:ss */
function mmss(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
}

/* 时间戳 → YYYY-MM-DD HH:mm */
function dateTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function dateOnly(ts) {
  const d = new Date(Number(ts) || Date.now());
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* 本地日期切片（YYYY-MM-DD，纯函数：ts 为 0 / NaN 时老老实实算 1970-01-01，不回退当前时间）。
 * 竞技场每日次数（utils/arena.js）与交易市场橱窗（utils/market.js）共用这一份 ——
 * 两处都需要「同 now ⇒ 同日期串」，且都禁止在 utils 里调 Date.now()。 */
function dayKeyOf(ts) {
  const n = Number(ts);
  const d = new Date(isFinite(n) ? n : 0);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* 相对时间：3 分钟前 / 2 小时前 */
function fromNow(ts, now) {
  const diff = Math.max(0, (Number(now) || Date.now()) - (Number(ts) || 0));
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}

/* 比分文本：102 : 98 */
function scoreText(a, b) { return (Number(a) || 0) + ' : ' + (Number(b) || 0); }

module.exports = {
  clamp: clamp, round: round, salaryText: salaryText, numText: numText, pct: pct,
  pad2: pad2, mmss: mmss, dateTime: dateTime, dateOnly: dateOnly, dayKeyOf: dayKeyOf, fromNow: fromNow, scoreText: scoreText
};
