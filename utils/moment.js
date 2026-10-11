/* utils/moment.js —— 名场面时刻卡的效果解析与折叠（第八章「创新玩法」，里程碑 2）
 * 职责：把 data/moments.js 的 effects 数组折叠成战斗引擎能直接用的两个乘数
 *       （属性对抗 A 值乘数、出手人权重乘数），并生成给页面渲染的文案。
 *
 * 【为什么放在 utils 而不是 selectors】utils/battle.js（结算）与 store/selectors.js（阵容页 / 详情页 /
 *   结算面板显示）必须用**同一份**解析结果，否则会出现「详情页说 +20%、比赛里没生效」这种最难查的 bug
 *   —— 与 utils/bond.js 完全同一条理由（AGENTS.md §3 单一出口）。
 * 【可复现红线】本模块不含任何随机与时间：全部效果都是确定性乘数，同输入 ⇒ 同输出（AGENTS.md §2.3）。
 *   因此「没佩戴时刻卡」时 utils/battle.js 的随机流与里程碑 2 基线逐字节一致（verify.mjs L 组反向对照）。
 * 【不改 OVR / 薪资】见 config.moment 裁决 3：工资帽必须与佩戴组合无关。
 * 【不消耗随机流】乘数只作用在既有掷骰的输入上（A 的基础值、weighted 的权重），不额外 rng.chance()。
 */
const CONFIG = require('../config.js');
const tacticData = require('../data/tactics.js');
const momentsData = require('../data/moments.js');

function cfg() { return CONFIG.moment || { enabled: false, globalScale: 1 }; }

function isEnabled() { return !!cfg().enabled; }

/* 全局强度缩放：1 + (mul − 1) × globalScale。
 * globalScale = 1 → 原值；= 0 → 恒为 1（等价于全部关闭）；> 1 → 放大。
 * 用这个形状而不是 mul × globalScale，是为了让「无效果」的不动点始终落在 1，缩放不会凭空造出加成。 */
function scaled(mul) {
  const m = Number(mul);
  if (!isFinite(m) || m <= 0) return 1;
  const s = Number(cfg().globalScale);
  const g = isFinite(s) ? Math.max(0, s) : 1;
  return 1 + (m - 1) * g;
}

/* 条件匹配：tactics 缺省 = 不限战术；minQuarter / maxQuarter 缺省 = 不限节次。
 * 注意加时的 quarter 是 5、6…（utils/battle.js 传 quarterCount + otCount），
 * 所以 minQuarter:4 天然覆盖加时 —— 关键球类卡就该在加时继续生效。 */
function effectMatches(effect, tacticKey, quarter) {
  if (!effect) return false;
  if (effect.tactics && effect.tactics.length) {
    if (effect.tactics.indexOf(tacticKey) === -1) return false;
  }
  const q = Number(quarter) || 0;
  if (effect.minQuarter !== undefined && q < Number(effect.minQuarter)) return false;
  if (effect.maxQuarter !== undefined && q > Number(effect.maxQuarter)) return false;
  return true;
}

/* 折叠某一类效果：命中的乘数**相乘**（先各自过 globalScale，再连乘），无命中返回 1 */
function fold(def, kind, tacticKey, quarter) {
  if (!isEnabled() || !def || !def.effects || !def.effects.length) return 1;
  let mul = 1;
  def.effects.forEach(function (e) {
    if (e.kind !== kind) return;
    if (!effectMatches(e, tacticKey, quarter)) return;
    mul *= scaled(e.mul);
  });
  return mul;
}

/* 属性对抗 A 值乘数（utils/battle.js#resolve 用） */
function attrMul(def, tacticKey, quarter) { return fold(def, 'attr', tacticKey, quarter); }

/* 出手人权重乘数（utils/battle.js#pickShooter 用） */
function shooterMul(def, tacticKey, quarter) { return fold(def, 'shooter', tacticKey, quarter); }

/* ---------------- 文案（页面只读，绝不自己拼） ---------------- */

function tacticLabel(key) {
  const t = tacticData.byKey(key);
  return t ? t.short : key;
}

function pctText(mul) {
  const pct = Math.round((Number(mul) - 1) * 100);
  if (pct >= 100) return pct % 100 === 0 ? (pct === 100 ? '翻倍' : '×' + (1 + pct / 100)) : '+' + pct + '%';
  return (pct >= 0 ? '+' : '') + pct + '%';
}

/* 条件文案：时间在前、战术在后，直接连写（"末节及加时三分"、"第3节起"）。
 * 中文语序是「什么时候 + 干什么」，所以刻意不把战术提到时间前面（"三分 末节及加时" 读着别扭）。 */
function whenText(e) {
  const parts = [];
  const min = e.minQuarter;
  const max = e.maxQuarter;
  if (min !== undefined || max !== undefined) {
    if (min !== undefined && max === undefined) parts.push(Number(min) >= CONFIG.battle.quarters ? '末节及加时' : '第' + min + '节起');
    else if (min === undefined && max !== undefined) parts.push('第' + max + '节前');
    else parts.push(min === max ? '第' + min + '节' : '第' + min + '–' + max + '节');
  }
  if (e.tactics && e.tactics.length) parts.push(e.tactics.map(tacticLabel).join('/'));
  return parts.join('');
}

/* 单条 effect → 一行可读文案。顺序固定：条件在前、效果在后（"末节及加时三分 对抗 +20%"） */
function effectLine(e) {
  if (!e) return '';
  const when = whenText(e);
  if (e.kind === 'attr') return (when ? when + ' ' : '') + '对抗 ' + pctText(scaled(e.mul));
  if (e.kind === 'shooter') return (when ? when + ' ' : '') + '出手权重 ' + pctText(scaled(e.mul));
  return when;
}

/* 一张卡的完整效果文案（数组，页面 wx:for 直接渲染；关闭时返回空数组） */
function effectText(def) {
  if (!isEnabled() || !def || !def.effects) return [];
  return def.effects.map(effectLine);
}

function effectTextOf(momentId) { return effectText(momentsData.getMoment(momentId)); }

/* 一行摘要（列表 / 结算面板用）：多条效果用「 · 」连接 */
function summaryOf(def) { return effectText(def).join(' · '); }

/* 从卡牌实例取时刻卡定义（instance.moment 是 id；缺省 / 非法 / 关闭 一律返回 null） */
function defOfInstance(inst) {
  if (!isEnabled()) return null;
  const id = inst && inst.moment;
  if (!id) return null;
  return momentsData.getMoment(id);
}

/* 空的评估结果（关闭 / 阵容为空时返回，形状必须与非空时一致，省得调用方判空 —— 与 utils/bond.js 同口径） */
function emptyResult(enabled) {
  return { enabled: !!enabled, list: [], byUid: {}, count: 0, summaryText: '', maxRarity: '' };
}

const RARITY_ORDER = CONFIG.rarity.order;

/* 给一组上场球员，算出谁戴了哪张时刻卡（结算面板 / 阵容页共用）
 * cards: [{ uid, name, moment }] —— 只读这三个字段，所以 battle 的 normalizeTeam 与 selectors 都能直接喂 */
function evaluateLineup(cards) {
  if (!isEnabled()) return emptyResult(false);
  const list = [];
  const byUid = {};
  let maxIdx = -1;
  (cards || []).forEach(function (c) {
    const def = c && momentsData.getMoment(c.moment);
    if (!def) return;
    byUid[c.uid] = def.id;
    list.push({
      uid: c.uid, playerName: c.name || '', momentId: def.id,
      name: def.name, rarity: def.rarity, desc: def.desc,
      effectLines: effectText(def), effectText: summaryOf(def)
    });
    const ri = RARITY_ORDER.indexOf(def.rarity);
    if (ri > maxIdx) maxIdx = ri;
  });
  const uiMax = Number(cfg().uiMaxListed) || list.length;
  const shown = list.slice(0, uiMax);
  let summaryText = shown.map(function (x) { return x.name; }).join(' · ');
  if (list.length > shown.length) summaryText += ' 等 ' + list.length + ' 项';
  return {
    enabled: true,
    list: list,
    byUid: byUid,
    count: list.length,
    summaryText: summaryText,
    maxRarity: maxIdx >= 0 ? RARITY_ORDER[maxIdx] : ''
  };
}

module.exports = {
  isEnabled: isEnabled,
  scaled: scaled,
  effectMatches: effectMatches,
  attrMul: attrMul,
  shooterMul: shooterMul,
  effectLine: effectLine,
  effectText: effectText,
  effectTextOf: effectTextOf,
  summaryOf: summaryOf,
  defOfInstance: defOfInstance,
  evaluateLineup: evaluateLineup,
  emptyResult: emptyResult
};