/* utils/bond.js —— 羁绊判定与叠加（第七章 7.3 单一出口，里程碑 2）
 * 职责：给一组「上场球员的有效面板」，算出激活了哪些羁绊、每人每项属性获得多少百分比加成。
 *
 * 【为什么放在 utils 而不是 selectors】utils/battle.js（比赛结算）与 store/selectors.js（阵容页显示）
 *   必须用**同一份**判定结果，否则会出现「阵容页说有羁绊、比赛里没生效」这种最难查的 bug。
 *   纯函数 + 无 wx 依赖 ⇒ 两边共用，且能在 Node 里被 tools/verify.mjs 直接回归。
 * 【可复现红线】本模块不含任何随机与时间：同输入 ⇒ 同输出（AGENTS.md §2.3）。
 * 【不改 OVR / 薪资】见 config.bond 注释的裁决 1：羁绊只加战斗属性，工资帽必须与站位组合无关。
 */
const CONFIG = require('../config.js');
const ovrUtil = require('./ovr.js');
const fmt = require('./format.js');
const teams = require('../data/teams.js');
const bondsData = require('../data/bonds.js');

const ATTR_KEYS = ovrUtil.ATTR_KEYS;
const ATTR_LABELS = CONFIG.attrs.labels;
const TYPE_LABELS = bondsData.TYPE_LABELS;

/* 空的判定结果（羁绊关闭 / 阵容为空时返回，形状必须与非空时一致，省得调用方判空） */
function emptyResult(enabled) {
  return {
    enabled: !!enabled,
    bonds: [],
    bonusByUid: {},
    count: 0,
    byType: { team: 0, era: 0, rival: 0, combo: 0 },
    summaryText: '',
    maxPct: 0
  };
}

/* 按 keyFn 分组，保持首次出现顺序（输出稳定，不依赖对象键序） */
function groupBy(list, keyFn) {
  const order = [];
  const map = {};
  list.forEach(function (item) {
    const k = keyFn(item);
    if (k === undefined || k === null || k === '') return;
    if (!map[k]) { map[k] = []; order.push(k); }
    map[k].push(item);
  });
  return { order: order, map: map };
}

/* 档位表按 min 降序取第一个满足的档（config.bond.teamTiers / eraTiers 已是降序，这里再兜一次） */
function pickTier(tiers, count) {
  const sorted = (tiers || []).slice().sort(function (a, b) { return b.min - a.min; });
  for (let i = 0; i < sorted.length; i++) if (count >= sorted[i].min) return sorted[i];
  return null;
}

/* {three: 12, pass: 8} → 「三分 +12% · 传球 +8%」（按 config.attrs.keys 的固定顺序输出，保证可复现） */
function bonusText(bonus) {
  const parts = [];
  ATTR_KEYS.forEach(function (k) {
    const v = Number((bonus || {})[k]) || 0;
    if (v) parts.push((ATTR_LABELS[k] || k) + ' +' + (Math.round(v * 10) / 10) + '%');
  });
  return parts.join(' · ');
}

/* 基础属性 + 百分比加成 → 新属性对象（四舍五入并钳位，不修改入参） */
function applyBonus(attrs, pctMap) {
  const base = ovrUtil.normalizeAttrs(attrs);
  const out = {};
  for (let i = 0; i < ATTR_KEYS.length; i++) {
    const k = ATTR_KEYS[i];
    const pct = Number((pctMap || {})[k]) || 0;
    const v = pct ? base[k] * (1 + pct / 100) : base[k];
    out[k] = Math.round(fmt.clamp(v, CONFIG.attrs.min, CONFIG.growth.attrCap));
  }
  return out;
}

/* 同届羁绊：在一个 era 分组里找「选秀年份跨度 ≤ eraWindow 的最大簇」
 * 确定性口径：按 draft 升序，逐个起点做滑动窗口，取最大簇；同长度取起点更早的那个。 */
function largestDraftCluster(group, window) {
  const withDraft = group.filter(function (c) { return Number(c.draft) > 0; });
  if (withDraft.length < 2) return [];
  const sorted = withDraft.slice().sort(function (a, b) { return a.draft - b.draft; });
  let best = [];
  for (let i = 0; i < sorted.length; i++) {
    const run = [sorted[i]];
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].draft - sorted[i].draft <= window) run.push(sorted[j]);
    }
    if (run.length > best.length) best = run;
  }
  return best;
}

function makeBond(type, id, name, desc, members, bonus, extra) {
  return Object.assign({
    id: id,
    type: type,
    typeLabel: TYPE_LABELS[type] || type,
    name: name,
    desc: desc || '',
    members: members.map(function (c) { return c.uid; }),
    memberNames: members.map(function (c) { return c.displayName || c.name; }),
    memberCount: members.length,
    bonus: bonus,
    bonusText: bonusText(bonus)
  }, extra || {});
}

/* 点名类羁绊（宿敌 / 组合连线）：members 里的 playerId 必须全部在场 */
function matchNamed(entries, type, onCourt, bonusOf) {
  const out = [];
  const present = {};
  onCourt.forEach(function (c) {
    if (!c.playerId) return;
    if (!present[c.playerId]) present[c.playerId] = [];
    present[c.playerId].push(c);
  });
  entries.forEach(function (entry) {
    const need = entry.members || [];
    if (need.length < 2) return;
    for (let i = 0; i < need.length; i++) if (!present[need[i]]) return;
    const hit = [];
    need.forEach(function (pid) { present[pid].forEach(function (c) { hit.push(c); }); });
    const bonus = bonusOf(entry);
    if (!bonus) return;
    out.push(makeBond(type, entry.id, entry.name, entry.desc, hit, bonus, { linkIds: need.slice() }));
  });
  return out;
}

/* 主入口：cards = 上场球员的有效面板数组（需含 uid / playerId / team / era / draft / attrs） */
function evaluateLineup(cards, cfgOverride) {
  const cfg = Object.assign({}, CONFIG.bond, cfgOverride || {});
  const onCourt = (cards || []).filter(Boolean);
  if (!cfg.enabled || onCourt.length < 2) return emptyResult(cfg.enabled);

  const bonds = [];

  /* 1) 同队羁绊：同 team 的人数达档，加成只给这几个人 */
  const teamGroup = groupBy(onCourt, function (c) { return c.team; });
  teamGroup.order.sort().forEach(function (abbr) {
    const group = teamGroup.map[abbr];
    if (group.length < 2) return;
    const tier = pickTier(cfg.teamTiers, group.length);
    if (!tier) return;
    const t = teams.teamOf(abbr);
    bonds.push(makeBond('team', 'team_' + abbr, tier.name,
      tier.desc, group, tier.bonus,
      { group: abbr, groupName: (t && t.name) || abbr, detail: ((t && t.name) || abbr) + ' × ' + group.length }));
  });

  /* 2) 同届羁绊：同 era 且选秀年份跨度 ≤ eraWindow */
  const eraGroup = groupBy(onCourt, function (c) { return c.era; });
  eraGroup.order.sort().forEach(function (era) {
    const cluster = largestDraftCluster(eraGroup.map[era], cfg.eraWindow);
    if (cluster.length < 2) return;
    const tier = pickTier(cfg.eraTiers, cluster.length);
    if (!tier) return;
    const years = cluster.map(function (c) { return Number(c.draft); }).sort(function (a, b) { return a - b; });
    const span = years[0] === years[years.length - 1] ? String(years[0]) : (years[0] + '–' + years[years.length - 1]);
    bonds.push(makeBond('era', 'era_' + era, tier.name,
      tier.desc, cluster, tier.bonus,
      { group: era, groupName: era, detail: era + ' ' + span + ' × ' + cluster.length }));
  });

  /* 3) 宿敌羁绊：加成统一走 config.bond.rivalBonus（规则型数值） */
  bonds.push.apply(bonds, matchNamed(bondsData.RIVALS, 'rival', onCourt, function () {
    return cfg.rivalBonus && Object.keys(cfg.rivalBonus).length ? cfg.rivalBonus : null;
  }));

  /* 4) 组合连线：加成由 data/bonds.js 自带，config.bond.comboScale 做全局缩放 */
  const scale = Number(cfg.comboScale);
  bonds.push.apply(bonds, matchNamed(bondsData.COMBOS, 'combo', onCourt, function (entry) {
    if (!entry.bonus) return null;
    const out = {};
    Object.keys(entry.bonus).forEach(function (k) { out[k] = (Number(entry.bonus[k]) || 0) * (isFinite(scale) ? scale : 1); });
    return out;
  }));

  /* 叠加：先累加再按 capPerAttr 封顶（顺序无关，结果确定） */
  const cap = Number(cfg.capPerAttr) || Infinity;
  const bonusByUid = {};
  bonds.forEach(function (b) {
    b.members.forEach(function (uid) {
      const acc = bonusByUid[uid] || (bonusByUid[uid] = {});
      Object.keys(b.bonus).forEach(function (k) {
        acc[k] = Math.min(cap, (Number(acc[k]) || 0) + (Number(b.bonus[k]) || 0));
      });
    });
  });

  const byType = { team: 0, era: 0, rival: 0, combo: 0 };
  let maxPct = 0;
  bonds.forEach(function (b) { byType[b.type] = (byType[b.type] || 0) + 1; });
  Object.keys(bonusByUid).forEach(function (uid) {
    Object.keys(bonusByUid[uid]).forEach(function (k) {
      if (bonusByUid[uid][k] > maxPct) maxPct = bonusByUid[uid][k];
    });
  });

  return {
    enabled: true,
    bonds: bonds,
    bonusByUid: bonusByUid,
    count: bonds.length,
    byType: byType,
    // 同名羁绊（如两组「同届之谊」）在摘要里只出现一次，阵容面板靠 detail/成员区分
    summaryText: bonds.map(function (b) { return b.name; }).filter(function (n, i, arr) { return arr.indexOf(n) === i; }).join(' · '),
    maxPct: Math.round(maxPct * 10) / 10
  };
}

/* 图鉴用：某条点名羁绊当前的激活状态
 *   on    = 成员全部在场（已激活）
 *   owned = 成员全部拥有但没全上场
 *   part  = 只拥有一部分成员
 *   none  = 一个都没有 */
function catalogStatus(entry, ownedPlayerIds, onCourtPlayerIds) {
  const need = entry.members || [];
  const onCourt = need.filter(function (p) { return onCourtPlayerIds.indexOf(p) !== -1; }).length;
  if (onCourt === need.length) return 'on';
  const owned = need.filter(function (p) { return ownedPlayerIds.indexOf(p) !== -1; }).length;
  if (owned === need.length) return 'owned';
  if (owned > 0) return 'part';
  return 'none';
}

/* 某名球员参与的点名羁绊（详情页/图鉴提示「集齐他能开什么」） */
function linksOfPlayer(playerId) { return bondsData.linksOfPlayer(playerId); }

module.exports = {
  evaluateLineup: evaluateLineup,
  applyBonus: applyBonus,
  bonusText: bonusText,
  catalogStatus: catalogStatus,
  linksOfPlayer: linksOfPlayer,
  largestDraftCluster: largestDraftCluster,
  pickTier: pickTier,
  emptyResult: emptyResult
};