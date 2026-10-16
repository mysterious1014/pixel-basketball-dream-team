/* tools/verify.mjs —— 回归测试套件（第十二章 MVP 验收清单 + 里程碑 2/3/4 系统的自动化版本）
 * 用法：node tools/verify.mjs
 * 覆盖：
 *   A 配置与数值口径（权重和、稀有度带、薪资公式、文档示例复现）
 *   B 数据完整性（19 项属性、六维覆盖、卡池各档非空）
 *   C 抽卡（概率分布、十连保底、PRD 递增、90 抽硬保底）
 *   D 比赛（可复现、回合数、分节比分自洽、状态机相位、平局进加时）
 *   E Store（核心循环闭环：招募→编阵容→工资帽→PVE→养成；存档往返）
 *   F 工程完整性（app.json 页面齐备、tabBar 图标存在、无外链 URL、JS/JSON 可解析）
 *   G 页面 / 组件工程校验（usingComponents 可解析、事件处理函数存在、组件无孤儿）
 *   H 羁绊系统（宿敌 / 连线 / 同队 / 同届；不改 OVR 与工资帽；加时段必须以 quarterEnd 收尾）
 *   I 战术克制（克制环双向自洽、auto 定调、侦察面板、关闭态逐字节回退）
 *   J 竞技场（天梯 / ELO 积分 / 段位 / 快照复现 / 每日次数 / 失败路径）
 *   K 页面层口径（WXML 字段一致、页面可在 Node 里挂载并驱动到结算）
 *   L 名场面时刻卡（效果解析、战斗生效、穿戴闭环、基线逐字节不变）
 *   M 竞技商城 / 竞技场专属解说 / 播放节奏（消费出口闭环、视图与命令同口径）
 *   N 时空进化（分解 / 成套献祭 / 合成 / 页面驱动）
 *   O 交易市场（橱窗确定性 / 买入卖出刷新 / 附件退回 / 页面驱动）
 *   P 王朝赛季 & 赛季通行证（积分口径 / 跨窗滚动 / 两轨领奖 / 页面驱动）
 *   Q 每日任务 & 钻石商店（跨阈值发奖 / 三侧同解 / 视图与命令同口径 / 页面驱动）
 * 退出码 = 失败用例数（0 = 全绿），可直接接 CI。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => require(path.join(ROOT, p));

const CONFIG = R('config.js');
const ovr = R('utils/ovr.js');
const radar = R('utils/radar.js');
const prd = R('utils/prd.js');
const battle = R('utils/battle.js');
const rngUtil = R('utils/rng.js');
const players = R('data/players.js');
const stages = R('data/stages.js');
const commentary = R('data/commentary.js');
const items = R('data/items.js');
const growth = R('utils/growth.js');
const store = R('store/index.js');
const selectors = R('store/selectors.js');
const reducers = R('store/reducers.js');
const momentsData = R('data/moments.js');
const momentUtil = R('utils/moment.js');
const shopData = R('data/shop.js');
const evoUtil = R('utils/evolution.js');
const marketUtil = R('utils/market.js');
const marketData = R('data/market.js');
const dynastyData = R('data/dynasty.js');
const dynastyUtil = R('utils/dynasty.js');
const dailyData = R('data/daily.js');
const dailyUtil = R('utils/daily.js');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('assert returned false');
    pass++;
    console.log('  \u2713 ' + name);
  } catch (e) {
    fail++;
    failures.push(name + ' :: ' + (e && e.message ? e.message : e));
    console.log('  \u2717 ' + name + ' :: ' + (e && e.message ? e.message : e));
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg) { assert(Math.abs(a - b) <= (eps === undefined ? 1e-6 : eps), msg || (a + ' !~ ' + b)); }
function section(t) { console.log('\n== ' + t + ' =='); }

/* ================= A 配置与数值口径 ================= */
section('A 配置与数值口径');

check('5 项主属性各 12% + 其余 14 项均摊 40% = 100%', () => {
  const sec = 14;
  near(5 * CONFIG.ovr.primaryWeight + sec * (CONFIG.ovr.secondaryTotal / sec), 1, 1e-9);
  return true;
});

check('稀有度带连续覆盖 25–99 无缺口无重叠', () => {
  const bands = CONFIG.rarity.bands.slice().sort((a, b) => a.min - b.min);
  assert(bands[0].min === 25, '最低带应从 25 开始');
  assert(bands[bands.length - 1].max === 99, '最高带应到 99');
  for (let i = 1; i < bands.length; i++) assert(bands[i].min === bands[i - 1].max + 1, '带间断: ' + bands[i].key);
  return true;
});

check('薪资系数覆盖全部稀有度', () => {
  CONFIG.rarity.order.forEach((r) => assert(typeof CONFIG.salary.coef[r] === 'number', r + ' 缺系数'));
  return true;
});

check('文档第十一章 schema 示例可复现：库里 = SSR / salary≈1200 万', () => {
  const c = players.getCard('curry_stephen_active');
  assert(c.rarity === 'SSR', 'rarity=' + c.rarity);
  assert(Math.abs(c.salary - 1200) <= 20, 'salary=' + c.salary);
  assert(c.position === 'PG' && c.team === 'GSW' && c.version === '现役版');
  return true;
});

check('OVR 标定是纯线性变换，且 slope=1 可回退为文档字面公式', () => {
  const c = players.getCard('jordan_michael_peak');
  const raw = ovr.rawOvr(c.attrs, c.position);
  const cal = CONFIG.ovr.calibration;
  const clampv = (x) => Math.max(25, Math.min(99, x));
  const back = clampv(Math.round(cal.anchor + (raw - cal.anchor) * cal.slope));
  assert(back === c.ovr, 'calibrated mismatch: ' + back + ' vs ' + c.ovr);
  // 临时把 slope 设回 1，验证「字面公式」路径
  const keep = cal.slope;
  cal.slope = 1;
  const literal = ovr.computeOvr(c.attrs, c.position);
  cal.slope = keep;
  assert(literal === clampv(Math.round(raw)), 'literal=' + literal + ' raw=' + raw);
  return true;
});

check('工资帽真实生效：薪资 Top12 超限，5 SSR 首发 + 7 N 替补通过', () => {
  const cap = CONFIG.roster.salaryCap;
  const top12 = players.CARDS.slice().sort((a, b) => b.salary - a.salary).slice(0, 12);
  const topSum = top12.reduce((s, c) => s + c.salary, 0);
  assert(topSum > cap, '薪资 Top12 应超工资帽，实际 ' + topSum);
  const ssr = players.byRarity('SSR').slice(0, 5);
  const n = players.byRarity('N').slice(0, 7);
  const okSum = ssr.concat(n).reduce((s, c) => s + c.salary, 0);
  assert(okSum <= cap, 'SSR 首发 + N 替补应通过，实际 ' + okSum);
  return true;
});

/* ================= B 数据完整性 ================= */
section('B 数据完整性');

check('每张卡 19 项属性齐全且 ∈[25,99]', () => {
  players.CARDS.forEach((c) => {
    CONFIG.attrs.keys.forEach((k) => {
      const v = c.attrs[k];
      assert(typeof v === 'number' && v >= 25 && v <= 99, c.id + '.' + k + '=' + v);
    });
  });
  return true;
});

check('六维雷达完整覆盖 19 项且不重复', () => {
  const cov = radar.coverage();
  assert(cov.total === 19, 'total=' + cov.total);
  assert(cov.missing.length === 0, 'missing=' + cov.missing.join(','));
  assert(cov.duplicated.length === 0, 'dup=' + cov.duplicated.join(','));
  return true;
});

check('卡池五档全部非空（否则抽卡空转）', () => {
  CONFIG.rarity.order.forEach((r) => assert(players.byRarity(r).length > 0, r + ' 为空'));
  return true;
});

check('第十三章 30 人名单齐全 + 双版本 5 人 + 三版本演示', () => {
  const names = ['库里', '詹姆斯', '杜兰特', '字母哥', '约基奇', '东契奇', '塔图姆', 'SGA', '爱德华兹', '文班亚马', '哈登', '威少', '利拉德', '巴特勒', '欧文',
    '乔丹', '科比', '奥尼尔', '魔术师', '伯德', '邓肯', '加内特', '诺维茨基', '韦德', '姚明', '麦迪', '艾弗森', '卡特', '奥拉朱旺', '皮蓬'];
  const byName = {};
  players.CARDS.forEach((c) => { (byName[c.name] = byName[c.name] || []).push(c); });
  names.forEach((n) => assert(byName[n] && byName[n].length, '缺人: ' + n));
  ['詹姆斯', '库里', '杜兰特', '哈登', '威少'].forEach((n) => {
    const vs = byName[n].map((c) => c.version);
    assert(vs.indexOf('现役版') !== -1 && vs.indexOf('巅峰传奇版') !== -1, n + ' 缺双版本');
  });
  ['詹姆斯', '库里', '乔丹', '科比', '文班亚马'].forEach((n) => {
    assert(byName[n].some((c) => c.version === '新秀版'), n + ' 缺新秀版');
  });
  return true;
});

check('解说模板 ≥ 50 条且占位符可填充', () => {
  assert(commentary.countAll() >= 50, 'count=' + commentary.countAll());
  const t = commentary.fill('{player} 命中 {pts} 分，比分 {score}', { player: 'X', pts: 3, score: '1:2' });
  assert(t === 'X 命中 3 分，比分 1:2', t);
  return true;
});

check('战报文案：18 关全量模拟后无未填充占位符、无节次重复', () => {
  const fresh = R('store/initial-state.js').createInitialState(0);
  const home = selectors.homeTeam(fresh);
  const bad = [];
  stages.STAGES.forEach((s) => {
    const away = stages.buildAwayTeam(s, 1);
    const r = battle.simulate({ home: home, away: away, seed: 'text-' + s.id });
    r.log.forEach((e) => {
      if (/\{[a-zA-Z_]+\}/.test(e.text)) bad.push(s.id + ' 占位符漏出: ' + e.text);
      if (/第第|节节/.test(e.text)) bad.push(s.id + ' 节次重复: ' + e.text);
      if (!e.text || e.text.length < 4) bad.push(s.id + ' 空战报');
    });
  });
  assert(bad.length === 0, bad.slice(0, 3).join(' | '));
  return true;
});

check('青训营卡为确定性生成（两次加载结果一致）', () => {
  const a = players.CARDS.filter((c) => c.academy).map((c) => c.id + ':' + c.ovr).join(',');
  const again = require(path.join(ROOT, 'data/players.js')).CARDS.filter((c) => c.academy).map((c) => c.id + ':' + c.ovr).join(',');
  assert(a === again);
  return true;
});

/* ================= C 抽卡 ================= */
section('C 抽卡（概率 / 保底 / PRD）');

check('PRD 公式 p_eff = min(1, p + (n-1)*inc)', () => {
  near(prd.prdEffective(0.02, 1), 0.02);
  near(prd.prdEffective(0.02, 10), 0.2);
  near(prd.prdEffective(0.02, 50), 1);
  near(prd.prdEffective(0.02, 99), 1);
  near(prd.prdEffective(0, 10), 0);
  return true;
});

check('普通券概率分布与第七章表一致（2 万抽蒙特卡洛）', () => {
  const pool = CONFIG.gacha.pools.normal;
  const rng = rngUtil.createRng('verify-normal');
  const by = players.poolIndex();
  const tally = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 };
  const N = 20000;
  const pity = { urPity: 0, totalPulls: 0, totalUr: 0 };
  for (let i = 0; i < N; i++) {
    const r = prd.rollOnce(rng, pool, pity, by);
    tally[r.rarity]++;
    if (r.rarity === 'UR') pity.urPity = 0; else pity.urPity++;
  }
  near(tally.N / N, 0.6, 0.02, 'N=' + tally.N / N);
  near(tally.R / N, 0.3, 0.02, 'R=' + tally.R / N);
  near(tally.SR / N, 0.09, 0.01, 'SR=' + tally.SR / N);
  near(tally.SSR / N, 0.01, 0.006, 'SSR=' + tally.SSR / N);
  assert(tally.UR === 0, '普通券不应出 UR');
  return true;
});

check('高级券非 UR 档分布在 PRD 影响下仍接近基础表（1 万抽）', () => {
  const pool = CONFIG.gacha.pools.advanced;
  const rng = rngUtil.createRng('verify-adv');
  const by = players.poolIndex();
  const tally = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 };
  const N = 10000;
  const pity = { urPity: 0, totalPulls: 0, totalUr: 0 };
  for (let i = 0; i < N; i++) {
    const r = prd.rollOnce(rng, pool, pity, by);
    tally[r.rarity]++;
    if (r.rarity === 'UR') pity.urPity = 0; else pity.urPity++;
  }
  // PRD 抬高了 UR 的实际占比（inc=0.02 使平均约 8-10%），其余档按比例被压缩，属预期
  assert(tally.UR / N > 0.02, 'UR 应高于基础 2%（PRD 生效），实际 ' + tally.UR / N);
  assert(tally.R / N > 0.4 && tally.R / N < 0.56, 'R=' + tally.R / N);
  assert(tally.SR / N > 0.25 && tally.SR / N < 0.36, 'SR=' + tally.SR / N);
  return true;
});

check('十连必出 SR+（3000 次十连全满足）', () => {
  const pool = CONFIG.gacha.pools.normal;
  const by = players.poolIndex();
  for (let t = 0; t < 3000; t++) {
    const rng = rngUtil.createRng('ten-' + t);
    const res = prd.pullBatch(rng, pool, { urPity: 0, totalPulls: 0, totalUr: 0 }, by, 10);
    const has = res.results.some((r) => prd.rarityRank(r.rarity) >= prd.rarityRank('SR'));
    assert(has, '第 ' + t + ' 次十连无 SR+');
  }
  return true;
});

check('高级券 UR 最迟 50 抽出（PRD），90 抽硬保底为兜底', () => {
  const pool = CONFIG.gacha.pools.advanced;
  const by = players.poolIndex();
  let worst = 0;
  for (let t = 0; t < 500; t++) {
    const rng = rngUtil.createRng('pity-' + t);
    let pity = { urPity: 0, totalPulls: 0, totalUr: 0 };
    let since = 0;
    let got = false;
    for (let i = 0; i < 90; i++) {
      const r = prd.rollOnce(rng, pool, pity, by);
      since++;
      if (r.rarity === 'UR') { got = true; worst = Math.max(worst, since); break; }
      pity = { urPity: pity.urPity + 1, totalPulls: pity.totalPulls + 1, totalUr: pity.totalUr };
    }
    assert(got, '90 抽内未出 UR（第 ' + t + ' 组）');
  }
  assert(worst <= 50, 'PRD 下最迟应 50 抽出 UR，实际 ' + worst);
  return true;
});

/* ================= D 比赛 ================= */
section('D 比赛状态机');

function makeTeam(seedStr, targetOvr) {
  const rng = rngUtil.createRng(seedStr);
  const positions = CONFIG.roster.slotPositions;
  return {
    name: seedStr,
    playStyle: 'balanced',
    players: positions.map((pos, i) => {
      const attrs = {};
      CONFIG.attrs.keys.forEach((k) => { attrs[k] = Math.max(25, Math.min(99, targetOvr + rng.int(-6, 6))); });
      return { uid: seedStr + '-' + i, name: 'P' + i, number: i, position: pos, attrs: attrs, ovr: targetOvr };
    })
  };
}

check('同 seed + 同阵容 ⇒ 逐回合完全一致（可复现）', () => {
  const home = makeTeam('home', 85);
  const away = makeTeam('away', 85);
  const a = battle.simulate({ home: home, away: away, seed: 'repro-1' });
  const b = battle.simulate({ home: home, away: away, seed: 'repro-1' });
  assert(JSON.stringify(a) === JSON.stringify(b), '两次结果不一致');
  const c = battle.simulate({ home: home, away: away, seed: 'repro-2' });
  assert(JSON.stringify(a) !== JSON.stringify(c), '不同 seed 应产生不同结果');
  return true;
});

check('回合数 = 每队每节 12 × 4 节（不含加时）', () => {
  const res = battle.simulate({ home: makeTeam('h', 85), away: makeTeam('a', 85), seed: 'rounds' });
  const plays = res.log.filter((l) => l.shooter);
  assert(plays.length === CONFIG.battle.roundsPerQuarter * 2 * CONFIG.battle.quarters, 'plays=' + plays.length);
  assert(res.quarters.length === CONFIG.battle.quarters, 'quarters=' + res.quarters.length);
  return true;
});

check('分节比分之和 = 终场比分；球员得分之和 = 本队得分', () => {
  const res = battle.simulate({ home: makeTeam('h2', 88), away: makeTeam('a2', 84), seed: 'sum' });
  const qh = res.quarters.reduce((s, q) => s + q.home, 0);
  const qa = res.quarters.reduce((s, q) => s + q.away, 0);
  assert(qh === res.homeScore, qh + '!=' + res.homeScore);
  assert(qa === res.awayScore, qa + '!=' + res.awayScore);
  const sh = res.stats.home.reduce((s, p) => s + p.pts, 0);
  const sa = res.stats.away.reduce((s, p) => s + p.pts, 0);
  assert(sh === res.homeScore, 'home pts ' + sh);
  assert(sa === res.awayScore, 'away pts ' + sa);
  return true;
});

check('结算公式：A_eff≥D_eff 必命中；否则按 clamp(0.5+diff/100) 掷骰', () => {
  const rng = rngUtil.createRng('formula');
  const shooter = { attrs: ovr.normalizeAttrs({ three: 99, offIQ: 90, stamina: 90 }) };
  const defender = { attrs: ovr.normalizeAttrs({ defIQ: 30, stamina: 90 }) };
  const tactic = { offAttr: 'three', defAttr: 'defIQ', points: 3 };
  let made = 0;
  for (let i = 0; i < 200; i++) {
    const r = battle.resolve(rng, shooter, defender, tactic, 1);
    if (r.made) made++;
    if (r.aEff >= r.dEff) assert(r.made, 'A_eff>=D_eff 必须命中');
    else assert(r.hitP >= 0.05 && r.hitP <= 0.95, 'hitP 越界 ' + r.hitP);
  }
  assert(made > 150, '强打弱应高命中，实际 ' + made + '/200');
  return true;
});

check('平局必进加时且最终分出胜负（或达到 maxOt）', () => {
  // 构造一个极易打平的场景：双方属性完全相同且极低命中
  const mk = (n) => ({
    name: n, playStyle: 'balanced',
    players: CONFIG.roster.slotPositions.map((pos, i) => ({
      uid: n + i, name: n + i, number: i, position: pos,
      attrs: ovr.normalizeAttrs({ inside: 25, mid: 25, three: 25, dunk: 25, ft: 25, handle: 25, pass: 25, oreb: 25, dreb: 25, steal: 25, block: 25, speed: 25, accel: 25, strength: 25, vertical: 25, stamina: 99, offIQ: 25, defIQ: 99, potential: 25 }),
      ovr: 25
    }))
  });
  const res = battle.simulate({ home: mk('H'), away: mk('A'), seed: 'ot-test' });
  assert(res.result !== 'draw' || res.ot === CONFIG.battle.maxOt, 'result=' + res.result + ' ot=' + res.ot);
  return true;
});

check('状态机相位序列合法（TRANSITIONS 校验）', () => {
  const res = battle.simulate({ home: makeTeam('h3', 85), away: makeTeam('a3', 85), seed: 'phases' });
  const T = battle.TRANSITIONS;
  const seq = res.log.map((l) => l.phase);
  for (let i = 1; i < seq.length; i++) {
    const allowed = T[seq[i - 1]] || [];
    assert(allowed.indexOf(seq[i]) !== -1, seq[i - 1] + ' -> ' + seq[i] + ' 非法');
  }
  assert(battle.PHASES.length === 6);
  return true;
});

check('体力衰减生效：第 4 节低体力球员属性低于第 1 节', () => {
  const attrs = ovr.normalizeAttrs({ stamina: 40 });
  const f1 = battle.fatigueFactor(attrs, 1);
  const f4 = battle.fatigueFactor(attrs, 4);
  assert(f1 === 1, 'f1=' + f1);
  assert(f4 < f1, 'f4=' + f4);
  const hi = battle.fatigueFactor(ovr.normalizeAttrs({ stamina: 99 }), 4);
  assert(hi > f4, '高体力应衰减少');
  return true;
});

/* ================= E Store 核心循环 ================= */
section('E Store 核心循环闭环');

store.init({ fresh: true, now: 1000 });

check('新档即可出战：5 首发 + 工资帽通过', () => {
  const view = selectors.rosterView(store.getState());
  assert(view.starterCount === 5, 'starters=' + view.starterCount);
  assert(!view.overCap, 'overCap');
  assert(view.ready, 'not ready');
  return true;
});

check('招募 → 卡牌入库 → 货币/券扣减 → 保底计数更新', () => {
  const before = store.getState();
  const d0 = before.profile.diamond;
  const r = store.pull({ poolKey: 'advanced', count: 10, useTicket: false, seed: 'verify-pull-1' });
  assert(r.ok, r.reason);
  const after = store.getState();
  assert(Object.keys(after.collection).length === Object.keys(before.collection).length + 10);
  assert(after.profile.diamond === d0 - CONFIG.gacha.pools.advanced.tenDiamond);
  assert(after.gacha.advanced.totalPulls === before.gacha.advanced.totalPulls + 10);
  return true;
});

check('招募失败路径：钻石不足时不改状态', () => {
  const before = JSON.stringify(store.getState());
  const r = store.pull({ poolKey: 'advanced', count: 10, useTicket: false, seed: 'verify-pull-fail' });
  assert(!r.ok, 'should fail');
  assert(JSON.stringify(store.getState()) === before, 'state mutated on failure');
  return true;
});

check('阵容：点选交换 + 工资帽校验 + 同卡不重复上场', () => {
  const s0 = store.getState();
  const uids = Object.keys(s0.collection);
  store.dispatch(store.actions.setRosterSlot('starter', 0, uids[5]));
  let s1 = store.getState();
  assert(s1.roster.starters[0] === uids[5]);
  assert(s1.roster.bench.indexOf(uids[5]) === -1, '同卡出现在两处');
  store.dispatch(store.actions.swapRoster({ slot: 'starter', index: 0 }, { slot: 'starter', index: 1 }));
  s1 = store.getState();
  assert(s1.roster.starters[1] === uids[5]);
  const view = selectors.rosterView(s1);
  assert(typeof view.totalSalary === 'number' && view.totalSalary <= view.salaryCap);
  return true;
});

check('PVE：打一场 → 体力扣减 → 奖励入账 → 关卡记录星级', () => {
  const s0 = store.getState();
  const st0 = s0.profile.stamina;
  const g0 = s0.profile.gold;
  const r = store.startBattle({ stageId: 's1-1', seed: 'verify-battle-1' });
  assert(r.ok, r.reason);
  const s1 = store.getState();
  assert(s1.profile.stamina === st0 - stages.getStage('s1-1').staminaCost, 'stamina');
  assert(s1.profile.gold >= g0, 'gold should not decrease');
  const rec = s1.season.cleared['s1-1'];
  assert(rec, 'no clear record');
  assert(rec.stars >= 0 && rec.stars <= 3);
  assert(s1.lastMatch && s1.lastMatch.seed === 'verify-battle-1');
  return true;
});

check('PVE 失败路径：体力不足拒绝出战', () => {
  store.dispatch(store.actions.spendStamina(119, Date.now()));
  const r = store.startBattle({ stageId: 's3-6', seed: 'verify-battle-no-stam' });
  assert(!r.ok && /体力/.test(r.reason), r.reason);
  store.dispatch(store.actions.addStamina(120, Date.now()));
  return true;
});

check('养成：升级扣金币且属性提升；突破消耗碎片；装备加成生效', () => {
  const s0 = store.getState();
  const uid = s0.roster.starters[0];
  const before = selectors.effectiveCardOf(s0, uid);
  const lv = store.levelUp(uid);
  assert(lv.ok, lv.reason);
  const s1 = store.getState();
  const after = selectors.effectiveCardOf(s1, uid);
  assert(after.level === before.level + 1);
  assert(after.attrs.three >= before.attrs.three);
  assert(s1.profile.gold < s0.profile.gold);

  store.dispatch(store.actions.addItem('shoes_street', 1));
  const eq = store.equip(uid, 'shoes_street');
  assert(eq.ok, eq.reason);
  const s2 = store.getState();
  const withEq = selectors.effectiveCardOf(s2, uid);
  assert(withEq.attrs.speed > after.attrs.speed, 'speed should rise');
  const un = store.unequip(uid, 'shoes');
  assert(un.ok);
  return true;
});

check('升星吃同名卡：无同名卡时拒绝，有同名卡时成功且吃掉 donor', () => {
  const s0 = store.getState();
  const counts = {};
  Object.keys(s0.collection).forEach((u) => { counts[s0.collection[u].cardId] = (counts[s0.collection[u].cardId] || 0) + 1; });
  const lonely = Object.keys(s0.collection).find((u) => counts[s0.collection[u].cardId] === 1);
  const dup = Object.keys(s0.collection).find((u) => counts[s0.collection[u].cardId] >= 2);
  const r1 = store.starUp(lonely);
  assert(!r1.ok && /同名卡/.test(r1.reason), 'lonely should fail: ' + r1.reason);
  if (dup) {
    const before = Object.keys(store.getState().collection).length;
    const r2 = store.starUp(dup);
    assert(r2.ok, r2.reason);
    const after = store.getState();
    assert(Object.keys(after.collection).length === before - 1, 'donor should be consumed');
    assert(after.collection[dup].stars === 2, 'stars=' + after.collection[dup].stars);
  }
  return true;
});

check('存档往返：落盘后重新 init 得到一致状态', () => {
  store.flush();
  const snap = JSON.stringify(store.getState());
  const storage = R('utils/storage.js');
  const raw = storage.get(CONFIG.SAVE_KEY, null);
  assert(raw, 'no save in storage');
  const restored = store.migrate(raw, 2000);
  assert(JSON.stringify(restored.collection) === JSON.stringify(JSON.parse(snap).collection));
  assert(restored.profile.gold === JSON.parse(snap).profile.gold);
  return true;
});

check('体力恢复：5 分钟/点、上限 120（独立时间线，不受其它用例污染）', () => {
  const base = R('store/initial-state.js').createInitialState(0);
  let s = reducers.reduce(base, store.actions.spendStamina(60, 0));
  assert(s.profile.stamina === 60, 'after spend=' + s.profile.stamina);
  s = reducers.reduce(s, store.actions.foreground(6 * 60 * 1000));
  assert(s.profile.stamina === 61, 'after 6min=' + s.profile.stamina);
  s = reducers.reduce(s, store.actions.foreground(6 * 60 * 1000 + 4 * 60 * 1000));
  assert(s.profile.stamina === 62, 'after 10min=' + s.profile.stamina);
  s = reducers.reduce(s, store.actions.foreground(1000 * 60 * 60 * 24));
  assert(s.profile.stamina === CONFIG.economy.staminaMax, 'should cap at max, got ' + s.profile.stamina);

  /* 回归（2026-10-11 截图走查发现）：从「满体力」直接开赛（BATTLE_RESULT / ARENA_RESULT）必须与 SPEND_STAMINA 一样把 staminaAt 重置到 now。
   * 漏掉这一步时，满体期间的时间会被当成恢复时间 ⇒ 满体放两小时再打一场，结算一分钟后体力直接回满（白送一整管）。 */
  const full = R('store/initial-state.js').createInitialState(0);
  const battleFull = reducers.reduce(full, store.actions.battleResult({
    result: { result: 'win' }, stageId: 's1-1', staminaCost: 6, rewards: {}, now: 2 * 3600 * 1000
  }));
  assert(battleFull.profile.stamina === 114, '满体开赛应扣 6：' + battleFull.profile.stamina);
  assert(battleFull.profile.staminaAt === 2 * 3600 * 1000, '满体开赛必须把 staminaAt 重置到 now');
  assert(selectors.staminaView(battleFull, 2 * 3600 * 1000 + 60 * 1000).value === 114, '满体开赛 1 分钟后不应白送恢复');
  const arenaFull = reducers.reduce(full, store.actions.arenaResult({
    result: { result: 'win', margin: 10 }, rewards: {}, staminaCost: 10,
    dayKey: '2026-10-11', ratingDelta: 10, opponentId: 'a01', seed: 's', snapshot: null, now: 2 * 3600 * 1000
  }));
  assert(arenaFull.profile.stamina === 110, '满体竞技场应扣 10：' + arenaFull.profile.stamina);
  assert(selectors.staminaView(arenaFull, 2 * 3600 * 1000 + 60 * 1000).value === 110, '满体竞技场 1 分钟后不应白送恢复');
  return true;
});

/* ================= F 工程完整性 ================= */
section('F 工程完整性');

check('app.json 每个页面四件套齐全', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  app.pages.forEach((p) => {
    ['js', 'wxml', 'wxss', 'json'].forEach((ext) => {
      const f = path.join(ROOT, p + '.' + ext);
      assert(fs.existsSync(f), 'missing ' + p + '.' + ext);
    });
  });
  app.tabBar.list.forEach((t) => {
    assert(fs.existsSync(path.join(ROOT, t.iconPath)), 'missing icon ' + t.iconPath);
    assert(fs.existsSync(path.join(ROOT, t.selectedIconPath)), 'missing icon ' + t.selectedIconPath);
    assert(app.pages.indexOf(t.pagePath) !== -1, 'tabBar page not in pages: ' + t.pagePath);
  });
  return true;
});

check('所有立绘 PNG 存在（config.art.portraitEnabled=true 时不得破图）', () => {
  assert(CONFIG.art.portraitEnabled === true);
  players.CARDS.forEach((c) => {
    assert(fs.existsSync(path.join(ROOT, 'assets/portraits/' + c.id + '.png')), 'missing portrait ' + c.id);
  });
  return true;
});

/* PNG 结构体检：签名 / 每个 chunk 的 CRC / IDAT 必须是 zlib 流（RFC1950）且解压长度自洽。
 * 教训：IDAT 被写成 raw deflate 时，Node 的 inflateRaw 兜底能读、桌面 Chrome 也宽容，
 * 但 Android WebView(Skia) 只从 IHDR 报出 naturalWidth，像素全画不出来 —— 整屏空框且不报错。 */
const crc32Of = typeof zlib.crc32 === 'function'
  ? (buf) => zlib.crc32(buf) >>> 0
  : (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    return (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  })();

function pngProblem(file) {
  const b = fs.readFileSync(file);
  if (b.length < 8 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return '签名不是 PNG';
  let o = 8; let w = 0; let h = 0; let bd = 0; let ct = 0;
  const idat = [];
  while (o + 12 <= b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('ascii', o + 4, o + 8);
    const body = b.subarray(o + 8, o + 8 + len);
    if (b.readUInt32BE(o + 8 + len) !== crc32Of(Buffer.concat([Buffer.from(type, 'ascii'), body]))) return type + ' CRC 不匹配';
    if (type === 'IHDR') { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); bd = b[o + 16]; ct = b[o + 17]; }
    if (type === 'IDAT') idat.push(body);
    if (type === 'IEND') break;
    o += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : (ct === 0 || ct === 3) ? 1 : 0;
  if (bd !== 8 || ch === 0) return 'bitDepth=' + bd + ' colorType=' + ct + ' 不受支持';
  const stream = Buffer.concat(idat);
  if (stream.length < 2 || (stream[0] & 0x0f) !== 8 || (((stream[0] << 8) | stream[1]) % 31) !== 0) {
    return 'IDAT 不是 zlib 流（头 ' + stream.subarray(0, 2).toString('hex') + '，raw deflate 会被 WebView 判空）';
  }
  let raw;
  try { raw = zlib.inflateSync(stream); } catch (e) { return 'IDAT 解压失败: ' + e.message; }
  if (raw.length !== h * (w * ch + 1)) return '解压长度 ' + raw.length + ' != ' + (h * (w * ch + 1));
  return null;
}

check('所有 PNG 素材结构合法（IDAT 必须是 zlib 流，不得 raw deflate）', () => {
  const files = [];
  const walkPng = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walkPng(f);
      else if (/\.png$/i.test(e.name)) files.push(f);
    }
  };
  walkPng(path.join(ROOT, 'assets'));
  assert(files.length > 0, 'assets/ 下找不到 PNG');
  const bad = [];
  files.forEach((f) => { const why = pngProblem(f); if (why) bad.push(path.relative(ROOT, f) + ' -> ' + why); });
  assert(bad.length === 0, bad.length + ' 张不合格: ' + bad.slice(0, 8).join(' | '));
  return true;
});
check('运行时代码无外链 URL（第三章：不引用任何外部图片/数据源）', () => {
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'tools' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|json|wxml|wxss)$/.test(e.name)) {
        const src = fs.readFileSync(f, 'utf8');
        const m = src.match(/https?:\/\/[^\s"'`)]+/g);
        if (m && m.length) bad.push(f + ' -> ' + m.join(','));
      }
    }
  };
  walk(ROOT);
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('所有 JS/JSON 可解析', () => {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'tools') continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.js')) {
        new Function(fs.readFileSync(f, 'utf8'));
      } else if (e.name.endsWith('.json')) {
        JSON.parse(fs.readFileSync(f, 'utf8'));
      }
    }
  };
  walk(ROOT);
  return true;
});

check('装备三槽位齐全且加成键都是合法属性', () => {
  ['shoes', 'wrist', 'head'].forEach((s) => assert(items.equipmentOf(s).length >= 3, s + ' 装备不足'));
  items.EQUIPMENT.forEach((it) => {
    Object.keys(it.bonus).forEach((k) => assert(CONFIG.attrs.keys.indexOf(k) !== -1, it.id + ' 非法加成键 ' + k));
  });
  return true;
});

check('关卡表 18 关且对手阵容可构建', () => {
  assert(stages.STAGES.length === 18, 'stages=' + stages.STAGES.length);
  stages.STAGES.forEach((st) => {
    const team = stages.buildAwayTeam(st, 1);
    assert(team.players.length === 5, st.id + ' 对手不足 5 人');
  });
  return true;
});

/* ================= G 页面 / 组件工程校验 ================= */
section('G 页面与组件工程校验');

/* 小程序内置标签白名单：WXML 里出现白名单外的标签，必须在同名 .json 的 usingComponents 里声明 */
const BUILTIN_TAGS = new Set([
  'view', 'text', 'image', 'button', 'scroll-view', 'swiper', 'swiper-item', 'block', 'canvas',
  'input', 'textarea', 'switch', 'slider', 'picker', 'picker-view', 'picker-view-column',
  'navigator', 'icon', 'progress', 'radio', 'radio-group', 'checkbox', 'checkbox-group',
  'form', 'label', 'audio', 'video', 'camera', 'live-player', 'live-pusher', 'map',
  'cover-view', 'cover-image', 'open-data', 'web-view', 'ad', 'official-account',
  'page-meta', 'navigation-bar', 'functional-page-navigator', 'editor', 'match-media',
  'share-element', 'keyboard-accessory', 'slot', 'wxs', 'template', 'import', 'include',
  'root-portal', 'grid-view', 'list-view', 'sticky-header', 'sticky-section', 'snapshot',
  'movable-area', 'movable-view', 'rich-text', 'page-container', 'voip-room', 'channel-live', 'channel-video'
]);

/* 递归收集运行时代码文件（跳过 tools / node_modules / 隐藏目录） */
function collectFiles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'tools' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(f, out); else out.push(f);
  }
  return out;
}
const ALL_FILES = collectFiles(ROOT, []);
const REL = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const ROOT_JSON = new Set(['app.json', 'project.config.json', 'sitemap.json']);

check('usingComponents 声明的组件路径可解析且四件套齐全', () => {
  const bad = [];
  ALL_FILES.filter((f) => f.endsWith('.json') && !ROOT_JSON.has(REL(f))).forEach((jf) => {
    const json = JSON.parse(fs.readFileSync(jf, 'utf8'));
    const uc = json.usingComponents || {};
    Object.keys(uc).forEach((name) => {
      const t = uc[name];
      const abs = t.startsWith('/') ? path.join(ROOT, t) : path.resolve(path.dirname(jf), t);
      ['.js', '.json', '.wxml', '.wxss'].forEach((ext) => {
        if (!fs.existsSync(abs + ext)) bad.push(REL(jf) + ' -> ' + name + ' 缺 ' + ext);
      });
    });
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('WXML 用到的自定义标签都已在同名 .json 中声明', () => {
  const bad = [];
  ALL_FILES.filter((f) => f.endsWith('.wxml')).forEach((wf) => {
    const jf = wf.replace(/\.wxml$/, '.json');
    const uc = fs.existsSync(jf) ? (JSON.parse(fs.readFileSync(jf, 'utf8')).usingComponents || {}) : {};
    const src = fs.readFileSync(wf, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[\s\S]*?\}\}/g, ' '); // 去掉注释与 mustache 表达式，避免 "a < b" 被当成标签
    const tags = new Set();
    const re = /<\s*([a-zA-Z][\w-]*)/g;
    let m;
    while ((m = re.exec(src)) !== null) tags.add(m[1]);
    tags.forEach((t) => {
      if (BUILTIN_TAGS.has(t)) return;
      if (!uc[t]) bad.push(REL(wf) + ' 未声明组件 <' + t + '>');
    });
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('WXML 绑定的事件处理函数都在同名 .js 中定义', () => {
  const bad = [];
  ALL_FILES.filter((f) => f.endsWith('.wxml')).forEach((wf) => {
    const jsf = wf.replace(/\.wxml$/, '.js');
    if (!fs.existsSync(jsf)) { bad.push(REL(wf) + ' 缺少同名 .js'); return; }
    const js = fs.readFileSync(jsf, 'utf8');
    const src = fs.readFileSync(wf, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[\s\S]*?\}\}/g, ' '); // 去掉注释与 mustache 表达式，避免 "a < b" 被当成标签
    const re = /(?:bind|catch)(?::)?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(src)) !== null) {
      const fn = m[2].trim();
      if (!fn || seen.has(fn)) continue;
      seen.add(fn);
      if (!new RegExp('(^|[^\\w$.])' + fn + '\\s*[:(]').test(js)) bad.push(REL(wf) + ' -> ' + m[1] + '="' + fn + '" 未定义');
    }
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('页面用 Page() 注册、组件用 Component() 注册，且 WXML/WXSS 非空', () => {
  const bad = [];
  ALL_FILES.filter((f) => f.endsWith('.js')).forEach((f) => {
    const rel = REL(f);
    const src = fs.readFileSync(f, 'utf8');
    if (rel.startsWith('pages/')) { if (!/\bPage\s*\(/.test(src)) bad.push(rel + ' 未调用 Page()'); }
    else if (rel.startsWith('components/')) { if (!/\bComponent\s*\(/.test(src)) bad.push(rel + ' 未调用 Component()'); }
  });
  ALL_FILES.filter((f) => f.endsWith('.wxml') || f.endsWith('.wxss')).forEach((f) => {
    const rel = REL(f);
    if ((rel.startsWith('pages/') || rel.startsWith('components/')) && fs.statSync(f).size < 40) bad.push(rel + ' 内容过短，疑似占位');
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('组件目录完整：components/ 下每个组件都被至少一个页面/组件引用', () => {
  const dirs = fs.readdirSync(path.join(ROOT, 'components'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  const bad = [];
  const sources = ALL_FILES.filter((f) => f.endsWith('.json') && !ROOT_JSON.has(REL(f)))
    .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  dirs.forEach((d) => {
    if (sources.indexOf('components/' + d + '/index') === -1) bad.push(d + ' 未被任何页面引用（死代码）');
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

/* ================= H 羁绊系统（第七章 7.3，里程碑 2） ================= */
section('H 羁绊系统（同队 / 同届 / 宿敌 / 连线）');

const bondUtil = R('utils/bond.js');
const bondsData = R('data/bonds.js');

/* 属性全拉平成 80，便于断言「加成后 = round(80 × (1+pct/100))」 */
const FLAT = {};
CONFIG.attrs.keys.forEach((k) => { FLAT[k] = 80; });
function bondCard(uid, playerId, team, era, draft) {
  return { uid: uid, playerId: playerId, name: playerId, team: team, era: era, draft: draft, attrs: Object.assign({}, FLAT) };
}
function idsOf(bonds) { return (bonds || []).map((b) => b.id).slice().sort().join(','); }

check('data/bonds.js 完整：playerId 存在、无重复 id、members≥2、宿敌与连线不撞同一对、bonus 键合法', () => {
  const bad = [];
  const seen = {};
  const pairs = {};
  bondsData.RIVALS.concat(bondsData.COMBOS).forEach((b) => {
    if (seen[b.id]) bad.push('重复 id ' + b.id);
    seen[b.id] = true;
    if (!Array.isArray(b.members) || b.members.length < 2) bad.push(b.id + ' members<2');
    (b.members || []).forEach((m) => { if (!players.cardsOfPlayer(m).length) bad.push(b.id + ' 未知 playerId ' + m); });
    const key = (b.members || []).slice().sort().join('|');
    if (pairs[key]) bad.push('同一对既是 ' + pairs[key] + ' 又是 ' + b.id);
    pairs[key] = b.id;
  });
  bondsData.COMBOS.forEach((b) => Object.keys(b.bonus || {}).forEach((k) => {
    if (CONFIG.attrs.keys.indexOf(k) === -1) bad.push(b.id + ' 非法属性键 ' + k);
  }));
  Object.keys(CONFIG.bond.rivalBonus).forEach((k) => {
    if (CONFIG.attrs.keys.indexOf(k) === -1) bad.push('rivalBonus 非法属性键 ' + k);
  });
  CONFIG.bond.teamTiers.concat(CONFIG.bond.eraTiers).forEach((tier) => Object.keys(tier.bonus).forEach((k) => {
    if (CONFIG.attrs.keys.indexOf(k) === -1) bad.push('档位 ' + tier.name + ' 非法属性键 ' + k);
  }));
  assert(bad.length === 0, bad.join(' | '));
  assert(bondsData.RIVALS.length >= 5, '宿敌内容过少：' + bondsData.RIVALS.length);
  assert(bondsData.COMBOS.length >= 8, '连线内容过少：' + bondsData.COMBOS.length);
  return true;
});

check('同队羁绊按人数分档（2/3/5），多档只取满足的最高档', () => {
  const two = [bondCard('a', 'p1', 'GSW', '现役', 2009), bondCard('b', 'p2', 'GSW', '现役', 2020)];
  const r2 = bondUtil.evaluateLineup(two);
  assert(r2.byType.team === 1 && r2.bonds[0].name === '老队友', 'two=' + r2.bonds.map((b) => b.name));

  const r3 = bondUtil.evaluateLineup(two.concat([bondCard('c', 'p3', 'GSW', '传奇', 1990)]));
  const t3 = r3.bonds.filter((b) => b.type === 'team')[0];
  assert(t3 && t3.name === '球队默契', 'three=' + (t3 && t3.name));

  const five = [];
  [1990, 1980, 1970, 1960, 1950].forEach((d, i) => five.push(bondCard('u' + i, 'pp' + i, 'GSW', '传奇', d)));
  const r5 = bondUtil.evaluateLineup(five);
  const t5 = r5.bonds.filter((b) => b.type === 'team');
  assert(t5.length === 1 && t5[0].name === '王朝体系' && t5[0].memberCount === 5, 'five=' + t5.map((b) => b.name));
  return true;
});

check('同届羁绊要求同 era 且选秀年份跨度 ≤ config.bond.eraWindow', () => {
  const w = CONFIG.bond.eraWindow;
  const near = bondUtil.evaluateLineup([bondCard('a', 'p1', 'GSW', '现役', 2009), bondCard('b', 'p2', 'POR', '现役', 2009 + w)]);
  assert(near.byType.era === 1, '年份差 ' + w + ' 应激活同届羁绊');
  const far = bondUtil.evaluateLineup([bondCard('a', 'p1', 'GSW', '现役', 2009), bondCard('b', 'p2', 'POR', '现役', 2009 + w + 1)]);
  assert(far.byType.era === 0, '年份差 ' + (w + 1) + ' 不应激活');
  const crossEra = bondUtil.evaluateLineup([bondCard('a', 'p1', 'GSW', '现役', 2009), bondCard('b', 'p2', 'POR', '传奇', 2009)]);
  assert(crossEra.byType.era === 0, 'era 不同不应激活同届羁绊');
  return true;
});

check('宿敌羁绊：一对同场即激活，双方各自吃到 config.bond.rivalBonus', () => {
  const rv = bondsData.RIVALS[0];
  const r = bondUtil.evaluateLineup([
    bondCard('a', rv.members[0], 'ZZZ', '孤期甲', 1900),
    bondCard('b', rv.members[1], 'YYY', '孤期乙', 1901)
  ]);
  assert(r.byType.rival === 1, '应激活 1 条宿敌羁绊，实际 ' + r.byType.rival);
  const b = r.bonds.filter((x) => x.type === 'rival')[0];
  assert(b.id === rv.id && b.memberCount === 2, b.id);
  Object.keys(CONFIG.bond.rivalBonus).forEach((k) => {
    assert(r.bonusByUid.a[k] === CONFIG.bond.rivalBonus[k], 'a.' + k + ' 加成不符');
    assert(r.bonusByUid.b[k] === CONFIG.bond.rivalBonus[k], 'b.' + k + ' 宿敌双方都应吃到加成');
  });
  return true;
});

check('组合连线按 playerId 触发：「三分雨夜」库里+利拉德 = 三分 +12%（文档「水花组合 三分 +12%」的等价实现）', () => {
  const combo = bondsData.COMBOS.filter((c) => c.id === 'combo_three_rain')[0];
  assert(combo && combo.bonus.three === 12, 'data/bonds.js 应保留 12% 的三分连线');
  const r = bondUtil.evaluateLineup([bondCard('a', 'curry_stephen', 'GSW', '现役', 2009), bondCard('b', 'lillard_damian', 'POR', '现役', 2015)]);
  const b = r.bonds.filter((x) => x.type === 'combo')[0];
  assert(b && b.id === 'combo_three_rain', '未触发三分雨夜：' + idsOf(r.bonds));
  assert(r.bonusByUid.a.three === 12 && r.bonusByUid.b.three === 12, '连线双方都应 +12%');
  assert(bondUtil.applyBonus({ three: 80 }, { three: 12 }).three === Math.round(80 * 1.12), 'applyBonus 计算不符');
  return true;
});

check('连线按 playerId 匹配：同一球员的任意版本都能触发（版本系统 × 羁绊）', () => {
  const currys = players.cardsOfPlayer('curry_stephen');
  assert(currys.length >= 2, '库里应有多个版本');
  const lillard = players.cardsOfPlayer('lillard_damian')[0];
  const mk = (card, uid) => ({ uid: uid, playerId: card.playerId, name: card.name, team: card.team, era: card.era, draft: card.draft, attrs: Object.assign({}, FLAT) });
  currys.forEach((curry) => {
    const r = bondUtil.evaluateLineup([mk(curry, 'x'), mk(lillard, 'y')]);
    assert(idsOf(r.bonds).indexOf('combo_three_rain') !== -1, curry.version + ' 未触发连线');
  });
  return true;
});

check('多羁绊可叠加，且单项属性总加成不超过 config.bond.capPerAttr', () => {
  const r = bondUtil.evaluateLineup([
    bondCard('a', 'curry_stephen', 'GSW', '现役', 2009),
    bondCard('b', 'lillard_damian', 'POR', '现役', 2010),
    bondCard('c', 'james_lebron', 'LAL', '现役', 2008),
    bondCard('d', 'harden_james', 'GSW', '现役', 2009),
    bondCard('e', 'oneal_shaquille', 'LAL', '传奇', 1992)
  ]);
  assert(r.count >= 4, '样本应同时触发多条羁绊，实际 ' + r.count + '：' + idsOf(r.bonds));
  // 库里：三分雨夜 +12 与 罚球线射手 +10 应叠加成 22（证明是累加而不是覆盖）
  assert(r.bonusByUid.a.three === 22, 'three 叠加不符：' + r.bonusByUid.a.three);
  Object.keys(r.bonusByUid).forEach((uid) => Object.keys(r.bonusByUid[uid]).forEach((k) => {
    assert(r.bonusByUid[uid][k] <= CONFIG.bond.capPerAttr, uid + '.' + k + '=' + r.bonusByUid[uid][k] + ' 超过上限');
  }));
  // 反向对照：把 cap 压到 5，封顶逻辑必须真的咬住（防止这条断言因为数值凑巧不超而空跑）
  const capped = bondUtil.evaluateLineup([bondCard('a', 'curry_stephen', 'GSW', '现役', 2009), bondCard('b', 'lillard_damian', 'POR', '现役', 2015)], { capPerAttr: 5 });
  assert(capped.bonusByUid.a.three === 5, 'capPerAttr 覆盖未生效，实际 ' + capped.bonusByUid.a.three);
  return true;
});

check('羁绊关闭可回退里程碑 1 基线，且 evaluateLineup 不修改入参', () => {
  const line = [bondCard('a', 'curry_stephen', 'GSW', '现役', 2009), bondCard('b', 'lillard_damian', 'POR', '现役', 2015)];
  const off = bondUtil.evaluateLineup(line, { enabled: false });
  assert(off.count === 0 && Object.keys(off.bonusByUid).length === 0, '关闭后应零羁绊');
  assert(off.enabled === false, 'emptyResult 应回传 enabled 状态');
  const before = JSON.stringify(line.map((c) => c.attrs));
  bondUtil.evaluateLineup(line);
  assert(JSON.stringify(line.map((c) => c.attrs)) === before, 'evaluateLineup 不得修改入参属性');
  return true;
});

check('羁绊不改 ovr / rarity / salary：工资帽与站位组合无关', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const rv = selectors.rosterView(store.getState());
  assert(rv.bondCount > 0, '初始阵容（5 张青训卡同队同届）应触发羁绊');
  const orig = CONFIG.bond.enabled;
  CONFIG.bond.enabled = false;
  try {
    const rv2 = selectors.rosterView(store.getState());
    assert(rv2.totalSalary === rv.totalSalary, '薪资受羁绊影响：' + rv2.totalSalary + ' vs ' + rv.totalSalary);
    assert(rv2.avgOvr === rv.avgOvr && rv2.starterAvgOvr === rv.starterAvgOvr, 'OVR 受羁绊影响');
    assert(rv2.bondCount === 0, '关闭后应无羁绊');
    assert(rv2.overCap === rv.overCap, '工资帽判定受羁绊影响');
  } finally {
    CONFIG.bond.enabled = orig;
  }
  return true;
});

check('阵容页显示的羁绊 == 比赛里实际生效的羁绊（同一份 utils/bond.js）', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const st = store.getState();
  const rv = selectors.rosterView(st);
  assert(rv.bondCount > 0, '样本应触发羁绊');
  const res = battle.simulate({ home: selectors.homeTeam(st), away: stages.buildAwayTeam(stages.getStage('s1-1'), 1), seed: 'bond-consistency' });
  assert(idsOf(rv.bonds) === idsOf(res.home.bonds), 'roster=' + idsOf(rv.bonds) + ' battle=' + idsOf(res.home.bonds));
  assert(Array.isArray(res.away.bonds), 'teamEcho 应带出 away.bonds');
  // 对手侧也要吃羁绊：s3-6 BOSS 的湖人双星（魔术师 + 奥尼尔）应触发同队羁绊
  const boss = battle.simulate({ home: selectors.homeTeam(st), away: stages.buildAwayTeam(stages.getStage('s3-6'), 1), seed: 'bond-boss' });
  assert(boss.away.bonds.some((b) => b.type === 'team'), 'BOSS 关对手应触发同队羁绊，实际 ' + idsOf(boss.away.bonds));
  return true;
});

check('带羁绊的比赛仍然可复现（同 seed 逐字节一致）', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const st = store.getState();
  const home = selectors.homeTeam(st);
  const away = stages.buildAwayTeam(stages.getStage('s2-6'), 1);
  const a = battle.simulate({ home: home, away: away, seed: 'bond-repro' });
  const b = battle.simulate({ home: home, away: away, seed: 'bond-repro' });
  assert(JSON.stringify(a) === JSON.stringify(b), '两次结果不一致');
  assert(a.home.bonds.length > 0 || a.away.bonds.length > 0, '样本至少一方应有羁绊');
  return true;
});

check('羁绊加成后属性钳位在 [attrs.min, growth.attrCap]，文案口径正确', () => {
  const hi = {};
  const lo = {};
  CONFIG.attrs.keys.forEach((k) => { hi[k] = CONFIG.growth.attrCap; lo[k] = CONFIG.attrs.min; });
  const up = bondUtil.applyBonus(hi, { three: 45, pass: 45 });
  assert(up.three === CONFIG.growth.attrCap && up.pass === CONFIG.growth.attrCap, '未钳位到上限：' + up.three);
  const flat = bondUtil.applyBonus(lo, {});
  assert(flat.three === CONFIG.attrs.min, '零加成不应改变属性');
  assert(bondUtil.bonusText({ three: 12 }).indexOf('三分 +12%') !== -1, 'bonusText 文案不符：' + bondUtil.bonusText({ three: 12 }));
  return true;
});

check('打进加时的比赛相位序列仍合法（加时段必须以 quarterEnd 收尾）', () => {
  /* 存量缺陷回归锁：加时段原本只在开头 push overtime、段末直接跳 finished，
   * 于是 roundEnd → finished 违反 TRANSITIONS。里程碑 1 的 18 关固定 seed 都没进加时所以没暴露，
   * 里程碑 2 羁绊改了比分后 s2-2 进加时被 replay-battle 抓到。这里把它钉成断言。 */
  const T = battle.TRANSITIONS;
  const assertSeq = (res, tag) => {
    const seq = res.log.map((l) => l.phase);
    for (let i = 1; i < seq.length; i++) {
      assert((T[seq[i - 1]] || []).indexOf(seq[i]) !== -1, tag + ' ' + seq[i - 1] + '→' + seq[i] + ' 非法');
    }
    return seq;
  };
  store.init({ fresh: true, force: true, now: 1000 });
  const home = selectors.homeTeam(store.getState());
  stages.STAGES.forEach((s) => {
    assertSeq(battle.simulate({ home: home, away: stages.buildAwayTeam(s, 1), seed: 'replay-' + s.id }), s.id);
  });

  /* 反向对照（防空跑）：加时段的收尾**不能**依赖 18 关的固定 seed 恰好进加时。
   * 羁绊上线时是 s2-2 进加时才暴露了「加时段缺 quarterEnd」这个存量缺陷；
   * 但战术克制又改了比分，现在 18 关一关都不进加时 —— 继续拿 otGames>0 当守卫，
   * 这条断言要么因为「没样本」而红，要么（更糟）诱导人去放宽 TRANSITIONS 让它变绿。
   * 改成**构造**一场必定进加时的比赛：双方属性完全相同、进攻 25 / 防守意识 99 ⇒ 命中率极低。
   * 在前 60 个 seed 里取第一个真进加时的，样本永远存在，且不随关卡数值调整而失效。 */
  const weak = (n) => ({
    name: n, playStyle: 'balanced', defense: 'balanced',
    players: CONFIG.roster.slotPositions.map((pos, i) => ({
      uid: n + i, name: n + i, number: i, position: pos,
      attrs: ovr.normalizeAttrs({ inside: 25, mid: 25, three: 25, dunk: 25, ft: 25, handle: 25, pass: 25, oreb: 25, dreb: 25, steal: 25, block: 25, speed: 25, accel: 25, strength: 25, vertical: 25, stamina: 99, offIQ: 25, defIQ: 99, potential: 25 }),
      ovr: 25
    }))
  });
  let otRes = null;
  for (let i = 0; i < 60 && !otRes; i++) {
    const cand = battle.simulate({ home: weak('H'), away: weak('A'), seed: 'ot-phases-' + i });
    if (cand.ot > 0) otRes = cand;
  }
  assert(otRes, '构造的加时局在前 60 个 seed 里都没进加时，这条断言会变成空跑');
  const otSeq = assertSeq(otRes, 'ot');
  assert(otSeq.filter((p) => p === 'overtime').length === otRes.ot, 'overtime 条数与 ot 不符');
  assert(otSeq[otSeq.length - 1] === 'finished', '末条应为 finished');
  assert(otSeq[otSeq.length - 2] === 'quarterEnd', 'finished 前一条应为 quarterEnd（加时段收尾）');
  assert(otRes.quarters.length === CONFIG.battle.quarters + otRes.ot, 'quarters 条数不符');
  return true;
});

/* ================= I 战术克制（第七章 7.4，里程碑 2） ================= */
section('I 战术克制（防守策略 / auto 定调 / 侦察面板 / 回退对照）');

const tacticsData = R('data/tactics.js');
const arenaData = R('data/arena.js');
const arenaUtil = R('utils/arena.js');
const CC = CONFIG.battle.counter;
const AC = CONFIG.arena;
const DEF_KEYS = tacticsData.DEFENSES.map((d) => d.key);
/* 「人盯人」是唯一的空档策略：counters / counteredBy 都为空 ⇒ 双方都盯人时全场 0 克制。
 * I 组用它当反向样本，证明克制统计不是恒真的摆设。 */
const NEUTRAL_DEF = 'balanced';

/* 等强度合成队：全属性同值，且每人 team / era / playerId 互不相同 ⇒ 不触发任何羁绊。
 * 这样「防守策略」是唯一变量（羁绊会改属性，进而改 auto 定调与属性契合度，把结论搅浑）。 */
function synthTeam(name, playStyle, defense, value) {
  const v = Number(value) || 80;
  const base = {};
  CONFIG.attrs.keys.forEach((k) => { base[k] = v; });
  return {
    name: name, playStyle: playStyle, defense: defense,
    players: CONFIG.roster.slotPositions.map((pos, i) => ({
      uid: name + i, name: name + i, number: i, position: pos,
      team: 'SYN' + i, era: 'SYNE' + i, draft: 1990 + i, playerId: 'syn' + name + i,
      attrs: ovr.normalizeAttrs(Object.assign({}, base)), ovr: v
    }))
  };
}

/* 只把某一项属性拉高的平均值表（喂给 resolveDefense 的第 2 参，模拟「盖帽型 / 抢断型 / 意识型」内线） */
function synthAvg(over) {
  const a = {};
  CONFIG.attrs.keys.forEach((k) => { a[k] = 70; });
  Object.keys(over || {}).forEach((k) => { a[k] = over[k]; });
  return a;
}

/* 投影：只留「比分事实」，剔掉本来就会随 counter 配置或防守 key 变化的字段。
 * 反向对照全靠它 —— 关闭克制 与「开启但 bonus=0 且 mention=0」必须逐字节一致，
 * 真配置必须不一致，以此证明克制的影响 100% 来自 config.battle.counter，而不是随机流漂移。 */
function battleProjection(r) {
  const stripLog = (e) => {
    const c = Object.assign({}, e);
    delete c.counter; delete c.counterSide; delete c.defense; delete c.defenseName;
    return c;
  };
  const echo = (t) => ({ name: t.name, side: t.side, ovr: t.ovr, salary: t.salary, playStyle: t.playStyle, bondCount: t.bondCount, players: t.players });
  return JSON.stringify({
    homeScore: r.homeScore, awayScore: r.awayScore, margin: r.margin, result: r.result,
    ot: r.ot, rounds: r.rounds, stars: r.stars, quarters: r.quarters,
    home: echo(r.home), away: echo(r.away), stats: r.stats, mvp: r.mvp,
    log: r.log.map(stripLog)
  });
}

/* 临时改 config.battle.counter 跑一段，抛错也要还原：verify 是单进程顺序执行，脏配置会污染后面所有断言 */
function withCounter(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = CC[k]; CC[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { CC[k] = saved[k]; }); }
}

/* 固定对局样本：三种「打法 × 防守」组合，覆盖克制环的正反两面与 auto */
const FIXTURES = [
  { home: ['perimeter', 'balanced'], away: ['inside', 'inside'] },
  { home: ['inside', 'perimeter'], away: ['perimeter', 'balanced'] },
  { home: ['balanced', 'auto'], away: ['balanced', 'auto'] }
];
function fixtureRuns(perFixture) {
  const out = [];
  FIXTURES.forEach((f, fi) => {
    for (let i = 0; i < perFixture; i++) {
      out.push({
        seed: 'fix-' + fi + '-' + i,
        home: synthTeam('H', f.home[0], f.home[1]),
        away: synthTeam('A', f.away[0], f.away[1])
      });
    }
  });
  return out;
}

check('data/tactics.js 克制表双向自洽：战术 counter/beatenBy ↔ 防守 counters/counteredBy', () => {
  const bad = [];
  const hasTactic = (k) => tacticsData.TACTICS.filter((t) => t.key === k).length === 1;
  const hasDef = (k) => DEF_KEYS.indexOf(k) !== -1;
  tacticsData.TACTICS.forEach((t) => {
    // counter / beatenBy 指向防守策略 key；DEFENSES.counters / counteredBy 指向战术 key，两个方向都要能对上
    if (!hasDef(t.counter)) bad.push(t.key + ' counter 不是合法防守策略：' + t.counter);
    if (!hasDef(t.beatenBy)) bad.push(t.key + ' beatenBy 不是合法防守策略：' + t.beatenBy);
    if (t.counter === t.beatenBy) bad.push(t.key + ' 对同一套防守既克又被克');
    if (tacticsData.counterOf(t.key, t.counter) !== tacticsData.COUNTER.attack) bad.push(t.key + ' vs ' + t.counter + ' 应判 attack');
    if (tacticsData.counterOf(t.key, t.beatenBy) !== tacticsData.COUNTER.defend) bad.push(t.key + ' vs ' + t.beatenBy + ' 应判 defend');
  });
  tacticsData.DEFENSES.forEach((d) => {
    (d.counters || []).concat(d.counteredBy || []).forEach((tk) => { if (!hasTactic(tk)) bad.push(d.key + ' 引用了不存在的战术 ' + tk); });
    /* 注意视角：counterOf(tactic, defense) 站在**进攻方**，而 d.counters / d.counteredBy 站在**防守方**，
     * 所以 attack（战术克防守）对应 d.counteredBy，defend（防守掐战术）对应 d.counters。两边必须互为镜像。 */
    tacticsData.TACTICS.forEach((t) => {
      const tag = tacticsData.counterOf(t.key, d.key);
      if (tag === tacticsData.COUNTER.attack && (d.counteredBy || []).indexOf(t.key) === -1) bad.push(d.key + '.counteredBy 漏标 ' + t.key);
      if (tag === tacticsData.COUNTER.defend && (d.counters || []).indexOf(t.key) === -1) bad.push(d.key + '.counters 漏标 ' + t.key);
      if (tag === tacticsData.COUNTER.neutral && (d.counters || []).concat(d.counteredBy || []).indexOf(t.key) !== -1) bad.push(d.key + ' 多标了中性战术 ' + t.key);
      if (tag !== tacticsData.COUNTER.neutral && (d.counters || []).concat(d.counteredBy || []).filter((k) => k === t.key).length !== 1) bad.push(d.key + ' 对 ' + t.key + ' 重复标注');
    });
  });
  const neu = tacticsData.defenseByKey(NEUTRAL_DEF);
  assert(neu && neu.counters.length === 0 && neu.counteredBy.length === 0, '人盯人必须是中性选项（读不出对手时的安全解），否则克制环没有出口');
  const ins = tacticsData.defenseByKey('inside');
  const per = tacticsData.defenseByKey('perimeter');
  assert(ins && per, '收缩护筐 / 外线扩防 缺失');
  assert(ins.counters.slice().sort().join() === per.counteredBy.slice().sort().join(), '收缩的克制面必须等于扩防的被克面');
  assert(ins.counteredBy.slice().sort().join() === per.counters.slice().sort().join(), '收缩的被克面必须等于扩防的克制面');
  const vals = [tacticsData.COUNTER.attack, tacticsData.COUNTER.defend, tacticsData.COUNTER.neutral];
  assert(new Set(vals).size === 3, 'COUNTER 三个取值必须互不相同');
  assert(!tacticsData.defenseByKey('nope') && !tacticsData.isDefenseKey('nope') && tacticsData.isDefenseKey(tacticsData.AUTO_DEFENSE), 'isDefenseKey 判定不符');
  DEF_KEYS.forEach((k) => assert(CONFIG.attrs.keys.indexOf(CC.autoDefense[k]) !== -1, 'autoDefense.' + k + ' 指向非法属性'));
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  return true;
});

check('auto 防守按属性定调（盖帽→收缩 / 抢断→扩防 / 意识→盯人），显式指定优先，一局只推导一次', () => {
  assert(battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE }, synthAvg({ block: 95 })).key === 'inside', '盖帽高应定调收缩护筐');
  assert(battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE }, synthAvg({ steal: 95 })).key === 'perimeter', '抢断高应定调外线扩防');
  assert(battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE }, synthAvg({ defIQ: 95 })).key === NEUTRAL_DEF, '防守意识高应定调人盯人');
  const auto = battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE }, synthAvg({ block: 95 }));
  assert(auto.auto === true && auto.name && auto.short && auto.desc, 'auto 结果必须带完整展示字段（页面直接渲染）');
  assert(battle.resolveDefense({ defense: 'perimeter' }, synthAvg({ block: 95 })).key === 'perimeter', '显式指定必须压过属性推导');
  assert(battle.resolveDefense({ defense: 'perimeter' }, synthAvg({ block: 95 })).auto === false, '显式指定不该标 auto');
  assert(battle.resolveDefense({ defense: 'zone' }, synthAvg({ steal: 95 })).key === 'perimeter', '非法 key 应回落到 auto 推导而不是崩');
  // 不给 avg 时必须能从 team.players 自己算（关卡侦察 / 阵容页走的就是这条路径）
  const fromPlayers = battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE, players: synthTeam('X', 'balanced', 'auto').players });
  assert(fromPlayers && DEF_KEYS.indexOf(fromPlayers.key) !== -1, '无 avg 时 resolveDefense 应自行推导：' + JSON.stringify(fromPlayers));
  // 纯函数：同输入多次调用结果一致（平局时也必须稳定，否则对手策略无法侦察）
  for (let i = 0; i < 3; i++) {
    assert(JSON.stringify(battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE }, synthAvg())) === JSON.stringify(battle.resolveDefense({ defense: tacticsData.AUTO_DEFENSE }, synthAvg())), '属性全平时 auto 推导不稳定');
  }
  // 一局只推导一次：整场战报里同一侧面对的防守策略必须恒定
  const r = battle.simulate({ home: synthTeam('H', 'balanced', 'auto'), away: synthTeam('A', 'inside', 'auto'), seed: 'auto-once' });
  const seen = { home: {}, away: {} };
  r.log.forEach((e) => { if (e.side === 'home' || e.side === 'away') seen[e.side][e.defense] = (seen[e.side][e.defense] || 0) + 1; });
  assert(Object.keys(seen.home).length === 1 && Object.keys(seen.away).length === 1, '防守策略在一局内发生了变化：' + JSON.stringify(seen));
  assert(Object.keys(seen.home)[0] === r.away.defense && Object.keys(seen.away)[0] === r.home.defense, '战报里的防守策略与队伍定调不符');
  assert(r.home.defenseAuto === true && r.away.defenseAuto === true, 'auto 定调应在 teamEcho 里标记出来');
  return true;
});

check('resolve 的第 6 参可选：缺省 == {tag:neutral}，克制只乘 A 或 D 的基础值', () => {
  const attrs = (v) => ovr.normalizeAttrs((() => { const o = {}; CONFIG.attrs.keys.forEach((k) => { o[k] = v; }); return o; })());
  const shooter = { uid: 's', name: 's', attrs: attrs(85) };
  const defender = { uid: 'd', name: 'd', attrs: attrs(80) };
  const tactic = tacticsData.byKey('three');
  const bare = battle.resolve(rngUtil.createRng('i-resolve'), shooter, defender, tactic, 1);
  const neutral = battle.resolve(rngUtil.createRng('i-resolve'), shooter, defender, tactic, 1, { tag: tacticsData.COUNTER.neutral });
  assert(JSON.stringify(bare) === JSON.stringify(neutral), '缺省第 6 参必须等价于 neutral（老调用方不用改）');
  const atk = battle.resolve(rngUtil.createRng('i-resolve'), shooter, defender, tactic, 1, { tag: tacticsData.COUNTER.attack });
  const dfd = battle.resolve(rngUtil.createRng('i-resolve'), shooter, defender, tactic, 1, { tag: tacticsData.COUNTER.defend });
  near(atk.aEff, bare.aEff * (1 + CC.bonus), 0.05, 'attack 克制应把 A 乘 (1+bonus)');
  near(dfd.dEff, bare.dEff * (1 + CC.bonus), 0.05, 'defend 克制应把 D 乘 (1+bonus)');
  near(atk.dEff, bare.dEff, 1e-9, 'attack 克制不该动 D');
  near(dfd.aEff, bare.aEff, 1e-9, 'defend 克制不该动 A');
  // resolve 的返回值里 counter 只是把入参 tag 回显，比对时剔掉它，只看对抗数值
  const nums = (x) => JSON.stringify({ A: x.A, D: x.D, aEff: x.aEff, dEff: x.dEff, made: x.made, hitP: x.hitP });
  const off = withCounter({ enabled: false }, () => battle.resolve(rngUtil.createRng('i-resolve'), shooter, defender, tactic, 1, { tag: tacticsData.COUNTER.attack }));
  assert(nums(off) === nums(bare), 'enabled=false 时即使传了 attack 标记也不该有加成');
  assert(off.counter === tacticsData.COUNTER.attack, 'resolve 应把 tag 原样回显（战报角标靠它）');
  assert(bare.counter === tacticsData.COUNTER.neutral, '缺省第 6 参应回显 neutral');
  return true;
});

check('反向对照：counter.enabled=false 与「开启但 bonus=0 & mention=0」的比分投影逐字节一致', () => {
  const runs = fixtureRuns(6);
  let diff = 0;
  runs.forEach((f) => {
    const off = withCounter({ enabled: false }, () => battle.simulate({ home: f.home, away: f.away, seed: f.seed }));
    const zero = withCounter({ enabled: true, bonus: 0, mention: 0 }, () => battle.simulate({ home: f.home, away: f.away, seed: f.seed }));
    assert(off.counterEnabled === false && zero.counterEnabled === true, 'counterEnabled 标记不符');
    if (battleProjection(off) !== battleProjection(zero)) diff++;
  });
  assert(diff === 0, diff + '/' + runs.length + ' 局在「关闭」与「零强度开启」之间出现差异 ⇒ 克制偷偷消耗了随机流');
  assert(CC.enabled === true && CC.bonus > 0 && CC.mention > 0, 'withCounter 没有还原 config.battle.counter');
  return true;
});

check('真配置下投影必须不同，且克制确实在跑（counterEnabled / counters 非空）', () => {
  const runs = fixtureRuns(6);
  let same = 0;
  let tagged = 0;
  runs.forEach((f) => {
    const off = withCounter({ enabled: false }, () => battle.simulate({ home: f.home, away: f.away, seed: f.seed }));
    const real = battle.simulate({ home: f.home, away: f.away, seed: f.seed });
    if (battleProjection(off) === battleProjection(real)) same++;
    assert(real.counterEnabled === true, '真配置下 counterEnabled 应为 true');
    tagged += real.counters.home.attack + real.counters.home.defend + real.counters.away.attack + real.counters.away.defend;
    assert(real.home.defenseName && real.away.defenseName, '结算面板缺防守策略名');
  });
  assert(same < runs.length, runs.length + ' 局全部与关闭态一致 ⇒ 克制整段是空跑');
  assert(tagged > 0, '克制触发次数为 0');
  return true;
});

check('关闭克制 ⇒ 换对手防守策略对比分与战报毫无影响（防守策略是纯增量功能）', () => {
  let bad = 0;
  for (let i = 0; i < 6; i++) {
    const seed = 'off-def-' + i;
    const run = (defKey) => withCounter({ enabled: false }, () => battle.simulate({
      home: synthTeam('H', 'perimeter', 'balanced'), away: synthTeam('A', 'inside', defKey), seed: seed
    }));
    if (battleProjection(run('inside')) !== battleProjection(run('perimeter'))) bad++;
    const on = (defKey2) => battle.simulate({ home: synthTeam('H', 'perimeter', 'balanced'), away: synthTeam('A', 'inside', defKey2), seed: seed });
    assert(battleProjection(on('inside')) !== battleProjection(on('perimeter')), '开启克制后换防守策略竟无影响');
  }
  assert(bad === 0, bad + '/6 局在关闭态下仍受防守策略影响');
  return true;
});

check('战报克制标记与 counters 统计自洽；双方都盯人时必须 0 克制（30 场真数据）', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const home = selectors.homeTeam(store.getState());
  const games = [];
  stages.STAGES.forEach((s) => games.push({ tag: s.id, away: stages.buildAwayTeam(s, 1), seed: 'ic-stage-' + s.id }));
  arenaData.LADDER.forEach((o) => games.push({ tag: o.id, away: arenaData.buildAwayTeam(o), seed: 'ic-arena-' + o.id }));
  const bad = [];
  let nonNeutral = 0;
  let neutral = 0;
  let atk = 0;
  let dfd = 0;
  games.forEach((g) => {
    const r = battle.simulate({ home: home, away: g.away, seed: g.seed });
    const cnt = { home: { attack: 0, defend: 0 }, away: { attack: 0, defend: 0 } };
    r.log.forEach((e) => {
      if (e.side !== 'home' && e.side !== 'away') return;
      if (!e.counter) {
        if (e.counterSide) bad.push(g.tag + ' 无克制却带了 counterSide');
        return;
      }
      cnt[e.side][e.counter] += 1;
      const opp = e.side === 'home' ? r.away : r.home;
      if (e.counterSide !== e.side) bad.push(g.tag + ' counterSide 与 side 不符');
      if (e.defense !== opp.defense || e.defenseName !== opp.defenseName) bad.push(g.tag + ' 战报防守策略与队伍定调不符');
      if (tacticsData.counterOf(e.tactic, e.defense) !== e.counter) bad.push(g.tag + ' counter 标记与克制表不符（' + e.tactic + ' vs ' + e.defense + '）');
      if (!e.defenseName) bad.push(g.tag + ' 战报缺防守策略名（WXML 直接渲染这个字段）');
    });
    assert(JSON.stringify(cnt) === JSON.stringify(r.counters), g.tag + ' counters 统计与战报不符：' + JSON.stringify(r.counters) + ' vs ' + JSON.stringify(cnt));
    const sum = cnt.home.attack + cnt.home.defend + cnt.away.attack + cnt.away.defend;
    const isNeutral = r.home.defense === NEUTRAL_DEF && r.away.defense === NEUTRAL_DEF;
    if (isNeutral) { neutral++; if (sum !== 0) bad.push(g.tag + ' 双方人盯人却出现 ' + sum + ' 次克制'); }
    else { nonNeutral++; if (sum === 0) bad.push(g.tag + ' 非中性防守却 0 次克制（克制没在跑）'); }
    atk += cnt.home.attack + cnt.away.attack;
    dfd += cnt.home.defend + cnt.away.defend;
  });
  assert(bad.length === 0, bad.slice(0, 3).join(' | '));
  assert(games.length === stages.STAGES.length + arenaData.LADDER.length, '样本数不符');
  assert(nonNeutral >= 10, '非中性防守的对局只有 ' + nonNeutral + ' 场，样本不足以证明克制在跑');
  assert(neutral >= 3, '双方人盯人的对局只有 ' + neutral + ' 场，反向样本不足');
  assert(atk > 100 && dfd > 100, '克制触发过少 attack=' + atk + ' defend=' + dfd);
  return true;
});

check('行为对照：拉外线打收缩 > 打扩防，凿内线打扩防 > 打收缩（80 seeds，差值 > 2 分）', () => {
  const N = 80;
  /* seed 刻意不含 aDef：两臂必须共用同一批随机流，量到的差值才是「防守策略」这一个变量的贡献。
   * 把 aDef 混进 seed 会让关闭克制的对照组也出现 ±1.5 分的噪声，断言就退化成抽奖。 */
  const avgMargin = (hStyle, aDef, tag) => {
    let m = 0;
    for (let i = 0; i < N; i++) {
      m += battle.simulate({ home: synthTeam('H', hStyle, 'balanced'), away: synthTeam('A', 'balanced', aDef), seed: tag + '-' + hStyle + '-' + i }).margin;
    }
    return m / N;
  };
  const perIn = avgMargin('perimeter', 'inside', 'i80');
  const perOut = avgMargin('perimeter', 'perimeter', 'i80');
  const inOut = avgMargin('inside', 'perimeter', 'i80');
  const inIn = avgMargin('inside', 'inside', 'i80');
  assert(perIn - perOut > 2, '拉外线打收缩 ' + perIn.toFixed(2) + ' 未显著优于打扩防 ' + perOut.toFixed(2));
  assert(inOut - inIn > 2, '凿内线打扩防 ' + inOut.toFixed(2) + ' 未显著优于打收缩 ' + inIn.toFixed(2));
  const off = withCounter({ enabled: false }, () => ({
    per: avgMargin('perimeter', 'inside', 'i80') - avgMargin('perimeter', 'perimeter', 'i80'),
    ins: avgMargin('inside', 'perimeter', 'i80') - avgMargin('inside', 'inside', 'i80')
  }));
  assert(Math.abs(off.per) < 0.01 && Math.abs(off.ins) < 0.01, '关闭克制后差值应归零，实为 ' + JSON.stringify(off));
  return true;
});

check('侦察面板 == 引擎实际：stageScout / arenaView 显示的防守策略与克制率和 battle.simulate 一致', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const st = store.getState();
  const home = selectors.homeTeam(st);
  const bad = [];
  stages.STAGES.forEach((s) => {
    const sc = selectors.stageScout(st, s);
    const away = stages.buildAwayTeam(s, 1);
    const r = battle.simulate({ home: home, away: away, seed: 'scout-' + s.id });
    if (sc.defense !== r.away.defense) bad.push(s.id + ' 面板防守 ' + sc.defense + ' ≠ 实际 ' + r.away.defense);
    if (sc.defenseName !== r.away.defenseName) bad.push(s.id + ' 防守名不符');
    if (sc.playStyleName !== r.away.playStyleName) bad.push(s.id + ' 对手打法名不符');
    if (sc.ovr !== r.away.ovr) bad.push(s.id + ' 对手均评不符');
    if (sc.defenseAuto !== r.away.defenseAuto) bad.push(s.id + ' auto 标记不符');
    // 预测的克制出手占比 vs 30 seeds 实测占比（面板读的是引擎同一份权重表，偏差应只有抽样噪声）
    let rounds = 0;
    let atk = 0;
    let dfd = 0;
    for (let i = 0; i < 30; i++) {
      battle.simulate({ home: home, away: away, seed: 'scout-rate-' + s.id + '-' + i }).log.forEach((e) => {
        if (e.side !== 'home') return;
        rounds++;
        if (e.counter === tacticsData.COUNTER.attack) atk++;
        else if (e.counter === tacticsData.COUNTER.defend) dfd++;
      });
    }
    const ra = Math.round((atk / rounds) * 100);
    const rd = Math.round((dfd / rounds) * 100);
    if (Math.abs(ra - sc.myAttackPct) > 8) bad.push(s.id + ' 预测克制出手 ' + sc.myAttackPct + '% 与实测 ' + ra + '% 偏差过大');
    if (Math.abs(rd - sc.myDefendPct) > 8) bad.push(s.id + ' 预测被克 ' + sc.myDefendPct + '% 与实测 ' + rd + '% 偏差过大');
    if (sc.counterEnabled !== !!CC.enabled) bad.push(s.id + ' counterEnabled 不符');
  });
  const av = selectors.arenaView(st, 1000);
  arenaData.LADDER.forEach((o, i) => {
    const row = av.ladder[i];
    const r = battle.simulate({ home: home, away: arenaData.buildAwayTeam(o), seed: 'scout-ar-' + o.id });
    if (row.id !== o.id) bad.push('天梯顺序与 data/arena.js 不符');
    if (row.defense !== r.away.defense) bad.push(o.id + ' 天梯面板防守 ≠ 实际');
    if (row.defenseName !== r.away.defenseName) bad.push(o.id + ' 天梯防守名不符');
    if (row.playStyleName !== r.away.playStyleName) bad.push(o.id + ' 天梯打法名不符');
    if (row.ovr !== r.away.ovr) bad.push(o.id + ' 天梯均评不符');
    if (DEF_KEYS.indexOf(row.suggestDefenseKey) === -1) bad.push(o.id + ' 防守建议非法');
  });
  assert(bad.length === 0, bad.slice(0, 3).join(' | '));
  return true;
});

check('bestDefenseAgainst 的建议 == 实测最优防守（2 种对手打法 × 3 套防守 × 60 seeds）', () => {
  const N = 60;
  const bad = [];
  ['inside', 'perimeter'].forEach((aStyle) => {
    const awayT = synthTeam('A', aStyle, NEUTRAL_DEF);
    const sug = selectors.bestDefenseAgainst(battle.normalizeTeam(awayT, 'away'));
    const scores = {};
    DEF_KEYS.forEach((d) => {
      let m = 0;
      for (let i = 0; i < N; i++) m += battle.simulate({ home: synthTeam('H', 'balanced', d), away: awayT, seed: 'bd-' + aStyle + '-' + d + '-' + i }).margin;
      scores[d] = m / N;
    });
    const ranked = DEF_KEYS.slice().sort((x, y) => scores[y] - scores[x]);
    if (sug.key !== ranked[0]) bad.push('对手 ' + aStyle + '：建议 ' + sug.key + ' 但实测最优 ' + ranked[0] + ' ' + JSON.stringify(scores));
    if (scores[ranked[0]] - scores[ranked[1]] < 1) bad.push('对手 ' + aStyle + '：最优与次优只差 ' + (scores[ranked[0]] - scores[ranked[1]]).toFixed(2) + '，样本区分度不足');
    if (sug.text.indexOf(sug.name) === -1) bad.push('防守建议文案没带上策略名');
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('防守策略入库：setDefense 生效 / 非法值被拒 / 一键排阵不清空 / 老存档迁移补 auto', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  assert(store.getState().roster.defense === tacticsData.AUTO_DEFENSE, '新档默认应为 auto，实为 ' + store.getState().roster.defense);
  const r1 = store.setDefense('perimeter');
  assert(r1.ok && store.getState().roster.defense === 'perimeter', 'setDefense 未生效');
  assert(selectors.rosterView(store.getState()).defense === 'perimeter', 'rosterView 未透出防守策略');
  assert(selectors.homeTeam(store.getState()).defense === 'perimeter', 'homeTeam 未把防守策略交给引擎');
  const before = store.getState();
  const r2 = store.setDefense('zone-2-3');
  assert(r2.ok === false && r2.reason, '非法防守策略应被拒绝并给出原因');
  assert(store.getState() === before, '失败路径改动了存档');
  assert(reducers.reduce(before, store.actions.setDefense('nonsense')) === before, 'reducer 对非法防守策略应原样返回同一引用');
  store.autoFill();
  assert(store.getState().roster.defense === 'perimeter', '一键排阵不该清空防守策略');
  assert(!!store.getState().roster.playStyle, '一键排阵不该清空打法');
  // 老存档迁移：缺 roster.defense、缺整个 arena 段
  const legacy = JSON.parse(JSON.stringify(store.getState()));
  delete legacy.roster.defense;
  delete legacy.arena;
  const mig = store.migrate(legacy, 1000);
  assert(mig.roster.defense === tacticsData.AUTO_DEFENSE, '老存档 defense 应补 auto');
  assert(mig.arena && mig.arena.rating === AC.ratingStart && Array.isArray(mig.arena.history) && typeof mig.arena.beaten === 'object', '老存档 arena 段应补出空壳');
  const bad2 = JSON.parse(JSON.stringify(legacy));
  bad2.roster.defense = 'zone';
  assert(store.migrate(bad2, 1000).roster.defense === tacticsData.AUTO_DEFENSE, '存档里的非法防守策略应被迁移纠正');
  return true;
});

check('克制只作用于 A/D：不改 ovr / 薪资 / 星级门槛，tacticWeightMul 与加权表严格对应', () => {
  const h = synthTeam('H', 'perimeter', 'balanced');
  const a = synthTeam('A', 'inside', 'inside');
  const on = battle.simulate({ home: h, away: a, seed: 'i-ovr-on' });
  const off = withCounter({ enabled: false }, () => battle.simulate({ home: h, away: a, seed: 'i-ovr-off' }));
  assert(on.home.ovr === off.home.ovr && on.away.ovr === off.away.ovr, '克制影响了 ovr（工资帽/站位会跟着漂）');
  assert(on.home.salary === off.home.salary && on.away.salary === off.away.salary, '克制影响了薪资');
  assert(on.stars === battle.starsOf(on.margin, on.result), '星级门槛被克制改动');
  const nOn = battle.normalizeTeam(h, 'home');
  const nOff = withCounter({ enabled: false }, () => battle.normalizeTeam(h, 'home'));
  assert(JSON.stringify(nOn.tacticItems) === JSON.stringify(nOff.tacticItems), '基础战术权重表不该随开关变化');
  assert(nOff.tacticVs === null, '关闭克制时 tacticVs 应为 null（回落到里程碑 1 的同一张表）');
  DEF_KEYS.forEach((k) => {
    assert(Array.isArray(nOn.tacticVs[k]) && nOn.tacticVs[k].length === nOn.tacticItems.length, k + ' 的加权表形状不符');
    nOn.tacticVs[k].forEach((it, i) => {
      const mul = tacticsData.counterOf(it.t.key, k) === tacticsData.COUNTER.attack ? CC.tacticWeightMul : 1;
      near(it.w, nOn.tacticItems[i].w * mul, 1e-9, k + '/' + it.t.key + ' 权重未按 tacticWeightMul 加权');
      assert(it.t.key === nOn.tacticItems[i].t.key, '加权表顺序必须与基础表一致（随机流才不会漂）');
    });
  });
  return true;
});
/* ================= J 竞技场（第七章 7.4 异步 PVP，里程碑 2） ================= */
section('J 竞技场（天梯 / ELO 积分 / 段位 / 快照复现 / 每日次数）');

/* UTC 正午做基准：任何真实时区下「+1 小时」都不会跨天，日期断言不会在 CI 上漂 */
const NOON = 86400000 * 20000 + 12 * 3600000;
const NOON_NEXT = NOON + 86400000;

check('data/arena.js 天梯完整：id 唯一、index 与 rating 递增、5 张卡都存在、打法/防守合法、羁绊元数据齐全', () => {
  const bad = [];
  const seen = {};
  assert(arenaData.LADDER.length >= 10, '天梯对手过少：' + arenaData.LADDER.length);
  arenaData.LADDER.forEach((o, i) => {
    if (seen[o.id]) bad.push('重复 id ' + o.id);
    seen[o.id] = true;
    if (o.index !== i + 1) bad.push(o.id + ' index 应为 ' + (i + 1) + ' 实为 ' + o.index);
    if (i > 0 && !(o.rating > arenaData.LADDER[i - 1].rating)) bad.push(o.id + ' rating 未严格递增');
    if (!Array.isArray(o.cardIds) || o.cardIds.length !== CONFIG.roster.starterCount) bad.push(o.id + ' cardIds 应为 ' + CONFIG.roster.starterCount + ' 张');
    (o.cardIds || []).forEach((cid) => { if (!players.getCard(cid)) bad.push(o.id + ' 未知卡牌 ' + cid); });
    if (!tacticsData.PLAY_STYLES[o.playStyle]) bad.push(o.id + ' 打法非法 ' + o.playStyle);
    if (!tacticsData.isDefenseKey(o.defense)) bad.push(o.id + ' 防守非法 ' + o.defense);
    if (!o.name || !o.desc) bad.push(o.id + ' 缺名字或描述');
    ['gold', 'diamond', 'shard'].forEach((k) => {
      if (!(Number((o.rewards || {})[k]) >= 0)) bad.push(o.id + ' rewards.' + k + ' 非法');
      if (o.firstWin && !(Number(o.firstWin[k]) >= 0)) bad.push(o.id + ' firstWin.' + k + ' 非法');
    });
    const team = arenaData.buildAwayTeam(o);
    if (team.players.length !== CONFIG.roster.starterCount) bad.push(o.id + ' 构造出的对手不足 5 人');
    team.players.forEach((p) => { if (!p.playerId || !p.team || !p.era || !p.cardId) bad.push(o.id + ' 对手缺羁绊元数据'); });
    if (team.playStyle !== o.playStyle || team.defense !== o.defense) bad.push(o.id + ' buildAwayTeam 未透传打法/防守（侦察面板会失真）');
  });
  // 天梯必须真的是一条「越往后越强」的曲线，否则段位与积分没有意义
  const ovrs = arenaData.LADDER.map((o) => battle.normalizeTeam(arenaData.buildAwayTeam(o), 'away').ovr);
  assert(ovrs[ovrs.length - 1] > ovrs[0], '天梯末尾均评应高于开头：' + ovrs.join(','));
  assert(!arenaData.getOpponent('nope') && arenaData.indexOf('nope') === -1 && arenaData.indexOf('a01') === 0, 'getOpponent/indexOf 边界不符');
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  return true;
});

check('dayKeyOf / dailyOf 是纯函数：不读系统时间、跨天清零、剩余次数不为负、不改入参', () => {
  const key = arenaUtil.dayKeyOf(NOON);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(key), 'dayKey 格式不符：' + key);
  assert(arenaUtil.dayKeyOf(NOON) === key, 'dayKeyOf 不稳定（可能读了系统时间）');
  assert(arenaUtil.dayKeyOf(NOON_NEXT) !== key, '相隔一天的 dayKey 应不同');
  assert(arenaUtil.dayKeyOf(NOON + 3600000) === key, '同一小时内 dayKey 应相同');
  const arena = { dayKey: key, usedToday: 3 };
  const snap = JSON.stringify(arena);
  const same = arenaUtil.dailyOf(arena, NOON + 3600000, AC);
  assert(same.used === 3 && same.left === AC.dailyChallenges - 3 && same.dayKey === key && same.total === AC.dailyChallenges, '同一天应沿用 usedToday：' + JSON.stringify(same));
  const next = arenaUtil.dailyOf(arena, NOON_NEXT, AC);
  assert(next.used === 0 && next.left === AC.dailyChallenges, '跨天应清零');
  assert(arenaUtil.dailyOf({ dayKey: key, usedToday: 99 }, NOON, AC).left === 0, '超用时 left 不应为负');
  assert(arenaUtil.dailyOf(undefined, NOON, AC).left === AC.dailyChallenges, '缺 arena 段应按 0 次算');
  assert(arenaUtil.dailyOf({ dayKey: key, usedToday: 'x' }, NOON, AC).used === 0, '脏数据应按 0 次算');
  assert(JSON.stringify(arena) === snap, 'dailyOf 修改了入参');
  return true;
});

check('ELO-lite：期望胜率对称单调，积分变化为整数且被 K + 连胜封顶，弱胜强涨更多', () => {
  near(arenaUtil.expectedScore(1000, 1000, AC.ratingDivisor), 0.5, 1e-9, '同分期望胜率应为 0.5');
  [800, 1000, 1200, 1600].forEach((my) => [800, 1000, 1200, 1600].forEach((op) => {
    near(arenaUtil.expectedScore(my, op, AC.ratingDivisor) + arenaUtil.expectedScore(op, my, AC.ratingDivisor), 1, 1e-9, '期望胜率不对称 ' + my + '/' + op);
  }));
  assert(arenaUtil.expectedScore(1400, 1000) > 0.5 && arenaUtil.expectedScore(1000, 1400) < 0.5, '期望胜率应随分差单调');
  const dWinStrong = arenaUtil.ratingDelta(1400, 1000, 'win', 0, AC);
  const dWinWeak = arenaUtil.ratingDelta(1000, 1400, 'win', 0, AC);
  const dLoseStrong = arenaUtil.ratingDelta(1400, 1000, 'lose', 0, AC);
  const dLoseWeak = arenaUtil.ratingDelta(1000, 1400, 'lose', 0, AC);
  assert(dWinStrong > 0 && dWinWeak > 0, '胜场积分应为正');
  assert(dWinWeak > dWinStrong, '弱胜强应涨更多：' + dWinWeak + ' vs ' + dWinStrong);
  assert(dLoseStrong < 0 && dLoseWeak < 0, '负场积分应为负');
  assert(Math.abs(dLoseWeak) < Math.abs(dLoseStrong), '弱负强应扣更少：' + dLoseWeak + ' vs ' + dLoseStrong);
  assert(arenaUtil.ratingDelta(1000, 1000, 'draw', 0, AC) === 0, '同分平局积分应为 0');
  [dWinStrong, dWinWeak, dLoseStrong, dLoseWeak].forEach((d) => assert(Number.isInteger(d), '积分变化必须是整数，实为 ' + d));
  const cap = AC.ratingK + AC.streakBonusMax;
  for (let my = 400; my <= 2000; my += 200) {
    ['win', 'draw', 'lose'].forEach((res) => {
      const d = arenaUtil.ratingDelta(my, my + 900, res, AC.streakBonusMax, AC);
      assert(Math.abs(d) <= cap, 'delta ' + d + ' 超出 K + 连胜封顶 ' + cap);
    });
  }
  return true;
});

check('连胜加成：线性增长、按 streakBonusMax 封顶、负/平归零', () => {
  assert(arenaUtil.streakBonusOf(0, AC) === 0, '0 连胜不该有加成');
  assert(arenaUtil.streakBonusOf(1, AC) === AC.streakBonus, '1 连胜应为 streakBonus');
  assert(arenaUtil.streakBonusOf(AC.streakBonusMax / AC.streakBonus, AC) === AC.streakBonusMax, '封顶点不符');
  assert(arenaUtil.streakBonusOf(9999, AC) === AC.streakBonusMax, '未封顶');
  assert(arenaUtil.streakBonusOf(-3, AC) === 0, '负连胜应归零');
  const opp = arenaData.LADDER[0];
  const w = arenaUtil.settle(opp, { result: 'win' }, { myRating: 1000, streak: 4 });
  assert(w.streakAfter === 5 && w.streakBonus === arenaUtil.streakBonusOf(5, AC), '胜场连胜推进不符');
  assert(arenaUtil.settle(opp, { result: 'lose' }, { myRating: 1000, streak: 4 }).streakAfter === 0, '负场应断连胜');
  assert(arenaUtil.settle(opp, { result: 'draw' }, { myRating: 1000, streak: 4 }).streakAfter === 0, '平局也应断连胜');
  return true;
});

check('段位：随积分单调、上下封顶、进度条与颜色自洽（页面直接渲染，WXML 不算数）', () => {
  const ranks = AC.ranks;
  assert(ranks.length >= 4 && ranks[0].min === 0, '段位表应从 0 分起且至少 4 段');
  for (let i = 1; i < ranks.length; i++) {
    assert(ranks[i].min > ranks[i - 1].min, '段位门槛必须递增');
    assert(ranks[i].name && ranks[i].short && ranks[i].color, '段位缺展示字段');
    assert(/^#[0-9a-f]{6}$/i.test(ranks[i].color), '段位颜色必须是 6 位十六进制（WXSS 直接用，且第六章限色禁渐变）');
  }
  let prev = -1;
  for (let r = -500; r <= 3000; r += 25) {
    const idx = ranks.indexOf(arenaUtil.rankOf(r, ranks));
    assert(idx >= 0 && idx >= prev, 'rankOf 在 ' + r + ' 处不单调');
    prev = idx;
  }
  assert(arenaUtil.rankOf(-9999, ranks) === ranks[0], '负分应落在第一段');
  assert(arenaUtil.rankOf(99999, ranks) === ranks[ranks.length - 1], '超高分应封顶');
  const p0 = arenaUtil.rankProgress(0, ranks);
  assert(p0.current === ranks[0] && p0.next === ranks[1] && p0.need === ranks[1].min && p0.ratio === 0, '0 分进度不符');
  const mid = ranks[1].min + (ranks[2].min - ranks[1].min) / 2;
  near(arenaUtil.rankProgress(mid, ranks).ratio, 0.5, 1e-9, '段位中点 ratio 应为 0.5');
  const pTop = arenaUtil.rankProgress(99999, ranks);
  assert(pTop.next === null && pTop.need === 0 && pTop.ratio === 1 && pTop.text.indexOf('封顶') !== -1, '最高段位应显示封顶');
  assert(arenaUtil.rankProgress(NaN, ranks).current === ranks[0], '脏积分应回落到第一段');
  return true;
});

check('结算口径：胜给钻石、负/平不给；首胜只叠加一次；经验与竞技币按胜负取值；积分不低于下限', () => {
  const opp = arenaData.LADDER[3];
  const w = arenaUtil.settle(opp, { result: 'win' }, { myRating: 1000, streak: 0 });
  const wf = arenaUtil.settle(opp, { result: 'win' }, { myRating: 1000, streak: 0, firstWin: true });
  const l = arenaUtil.settle(opp, { result: 'lose' }, { myRating: 1000, streak: 0 });
  const d = arenaUtil.settle(opp, { result: 'draw' }, { myRating: 1000, streak: 0 });
  assert(w.rewards.diamond === opp.rewards.diamond, '胜场钻石不符');
  assert(l.rewards.diamond === 0 && d.rewards.diamond === 0, '负/平不该给钻石（防刷）');
  assert(l.rewards.gold === Math.round(opp.rewards.gold * 0.3), '负场金币比例不符：' + l.rewards.gold);
  assert(d.rewards.gold === Math.round(opp.rewards.gold * 0.5), '平局金币比例不符：' + d.rewards.gold);
  assert(w.rewards.exp === AC.expPerWin && l.rewards.exp === AC.expPerLose, '经验不符');
  assert(w.rewards.arenaCoin === AC.coinPerWin && l.rewards.arenaCoin === AC.coinPerLose, '竞技币不符');
  assert(!w.firstWin && wf.firstWin, 'firstWin 标记不符');
  assert(wf.rewards.gold === w.rewards.gold + opp.firstWin.gold, '首胜金币应叠加在常规奖励之上');
  assert(wf.rewards.diamond === w.rewards.diamond + opp.firstWin.diamond && wf.rewards.shard === w.rewards.shard + opp.firstWin.shard, '首胜钻石/碎片应叠加');
  assert(arenaUtil.settle(opp, { result: 'lose' }, { myRating: 1000, firstWin: true }).firstWin === false, '没赢就不该算首胜');
  assert(arenaUtil.settle(opp, { result: 'draw' }, { myRating: 1000, firstWin: true }).firstWin === false, '平局不该算首胜');
  assert(arenaUtil.settle(opp, { result: 'lose' }, { myRating: 0, streak: 0 }).ratingAfter >= AC.ratingMin, '积分跌破下限');
  assert(w.ratingAfter === Math.max(AC.ratingMin, 1000 + w.ratingDelta), 'ratingAfter 与 delta 不符');
  near(w.expected, arenaUtil.expectedScore(1000, opp.rating, AC.ratingDivisor), 1e-3, '期望胜率不符');
  assert(arenaUtil.settle(opp, { result: 'win' }, {}).rewards.exp === AC.expPerWin, '缺 ctx 时应有安全默认');
  const before = JSON.stringify(opp);
  arenaUtil.settle(opp, { result: 'win' }, { myRating: 1000 });
  assert(JSON.stringify(opp) === before, 'settle 修改了天梯数据（数据层必须只读）');
  return true;
});

check('快照格式：只存 seed + 对手 id + 打法/防守 + 卡牌实例引用，不存属性与战报（体积口径）', () => {
  const inst = { uid: 'u1', cardId: 'c1', level: 3, stars: 2, breakthrough: 1, equipment: { shoes: 'e1', wrist: null, head: null } };
  const s = arenaUtil.snapshotOf({ seed: 'sd', opponentId: 'a01', at: 123, playStyle: 'inside', defense: 'perimeter', instances: [inst] });
  assert(s.v === 1 && s.seed === 'sd' && s.opponentId === 'a01' && s.at === 123, '快照基本字段不符');
  assert(s.playStyle === 'inside' && s.defense === 'perimeter', '快照必须记录打法/防守，否则复现会漂');
  assert(s.home.length === 1 && s.home[0].uid === 'u1' && s.home[0].level === 3 && s.home[0].stars === 2, '卡牌实例引用不符');
  assert(s.home[0].equipment.shoes === 'e1' && s.home[0].equipment !== inst.equipment, '快照必须拷贝 equipment，不能与实例共享引用');
  assert(s.home[0].attrs === undefined, '快照不该存 19 项属性（应由 growth 从卡牌定义推导）');
  const json = JSON.stringify(s);
  assert(json.indexOf('"attrs"') === -1 && json.indexOf('"log"') === -1, '快照里出现了属性或战报');
  const d = arenaUtil.snapshotOf({});
  assert(d.seed === '' && d.playStyle === 'balanced' && d.defense === tacticsData.AUTO_DEFENSE && d.home.length === 0 && d.at === 0 && d.v === 1, '空入参应有安全默认值');
  return true;
});

check('全链路：初始存档能打赢天梯第一位，结算全部落库，且不写 PVE 的 season/stats', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const before = store.getState();
  const av0 = selectors.arenaView(before, Date.now());
  assert(av0.enabled && av0.canFight, '新档应可直接挑战：' + JSON.stringify({ left: av0.daily.left, stam: av0.stamina, ready: av0.rosterReady }));
  assert(av0.rating === AC.ratingStart && av0.rankName === AC.ranks[AC.ratingStart >= 1000 ? 1 : 0].name, '新档积分/段位不符：' + av0.rankName);
  assert(av0.daily.left === AC.dailyChallenges && av0.clearedCount === 0 && av0.nextOpponentId === arenaData.LADDER[0].id, '新档天梯进度不符');
  assert(av0.ladder[0].unlocked && av0.ladder[0].canPlay && !av0.ladder[1].unlocked, '天梯应从第一位开始顺序解锁');
  assert(av0.ladder[1].lockText.indexOf(av0.ladder[0].name) !== -1, '未解锁项应说明先赢谁');
  assert(av0.note && av0.note.indexOf('离线') !== -1, '缺少「离线天梯」口径说明（零后端必须写清楚）');
  const pveBefore = JSON.stringify({ season: before.season, stats: before.stats });
  const profileBefore = JSON.stringify({ gold: before.profile.gold, diamond: before.profile.diamond, exp: before.profile.exp, level: before.profile.level });

  /* 每日任务（里程碑 4）在首次天梯挑战时会达成 d_arena（+800 金）。本用例逐项对账「竞技场自身」
   * 的经济口径，临时关掉 daily 隔离干扰（arena 侧的每日记账由 Q 组三侧同解用例专门验），跑完还原。 */
  const first = arenaData.LADDER[0];
  const savedDaily = CONFIG.daily.enabled;
  let r;
  try {
    CONFIG.daily.enabled = false;
    r = store.arenaChallenge({ opponentId: first.id, seed: 'j-arena-a01' });
  } finally { CONFIG.daily.enabled = savedDaily; }
  assert(CONFIG.daily.enabled === true, 'daily 开关未还原（会污染后面所有断言）');
  assert(r.ok, r.reason);
  assert(r.mode === 'arena' && r.result && r.snapshot && r.rewards, '返回结果形状不符');
  assert(r.result.result === 'win', '初始存档打不赢 ' + first.name + '（' + r.result.homeScore + ':' + r.result.awayScore + '），整条天梯无法起步');
  assert(r.firstWin === true, '第一场应算首胜');
  /* mode:'arena' 必须与 commands.arenaChallenge 一致：battleProjection 把战报文案也算进指纹，
   * 而竞技场用的是扩充后的解说池（data/commentary.js 的 ARENA_MIX），少传这个参数就会判成「不同源」。
   * 这条断言的价值恰恰在此 —— 它同时锁住了「竞技场文案确实换了池」和「数值没被文案池影响」两件事。 */
  const direct = battle.simulate({ home: selectors.homeTeam(before), away: arenaData.buildAwayTeam(first), seed: 'j-arena-a01', mode: 'arena' });
  assert(battleProjection(direct) === battleProjection(r.result), 'arenaChallenge 的结果与 battle.simulate 不同源');
  /* 反向对照：同一个 seed 走 PVE 解说池，比分等数值必须完全一致，只有文案不同。
   * 证明 mode 只换文案、不碰数值（否则竞技场的难度曲线会与 PVE 漂移，星级/积分口径就不可比了）。 */
  const pveSame = battle.simulate({ home: selectors.homeTeam(before), away: arenaData.buildAwayTeam(first), seed: 'j-arena-a01' });
  assert(pveSame.homeScore === r.result.homeScore && pveSame.awayScore === r.result.awayScore &&
    pveSame.margin === r.result.margin && pveSame.ot === r.result.ot &&
    JSON.stringify(pveSame.stats) === JSON.stringify(r.result.stats), 'mode 影响了数值：竞技场与 PVE 的比分/统计不一致');
  assert(JSON.stringify(pveSame.log.map((e) => e.text)) !== JSON.stringify(r.result.log.map((e) => e.text)),
    'mode=arena 没有换解说池：竞技场专属解说形同虚设');

  const after = store.getState();
  assert(after.arena.matches === 1 && after.arena.wins === 1 && after.arena.usedToday === 1, 'arena 段未推进');
  assert(after.arena.rating === Math.max(AC.ratingMin, AC.ratingStart + r.ratingDelta) && after.arena.rating === r.ratingAfter, '积分落库不符');
  assert(after.arena.lastRatingDelta === r.ratingDelta && r.ratingDelta > 0, '胜场积分应为正且落库');
  assert(after.arena.streak === 1 && after.arena.bestStreak === 1, '连胜未落库');
  assert(after.arena.beaten[first.id].wins === 1 && after.arena.beaten[first.id].bestMargin === r.result.margin, '天梯战绩未落库');
  assert(after.arena.history.length === 1 && after.arena.history[0].seed === 'j-arena-a01', '历史未记录');
  assert(after.profile.stamina <= before.profile.stamina, '体力未扣');
  assert(after.profile.gold === before.profile.gold + r.rewards.gold, '金币未入账');
  assert(after.profile.diamond === before.profile.diamond + r.rewards.diamond, '钻石未入账');
  assert(after.profile.arenaCoin === AC.coinPerWin, '竞技币未入账：' + after.profile.arenaCoin);
  assert(after.bag.shard === before.bag.shard + r.rewards.shard, '碎片未入账');
  assert(after.profile.exp + (after.profile.level - before.profile.level) * 1 >= before.profile.exp, '经验未入账');
  assert(JSON.stringify({ season: after.season, stats: after.stats }) === pveBefore, '竞技场污染了 PVE 的 season/stats');
  assert(Object.keys(after.season.cleared).length === 0, '竞技场不该写 season.cleared');
  assert(selectors.arenaView(after, Date.now()).nextOpponentId === arenaData.LADDER[1].id, '打赢后应解锁下一位');
  assert(JSON.stringify(after.notices).indexOf(first.name) !== -1, '结算应推一条战报通知');
  assert(profileBefore !== JSON.stringify({ gold: after.profile.gold, diamond: after.profile.diamond, exp: after.profile.exp, level: after.profile.level }), '奖励完全没入账');
  return true;
});

check('失败路径：对手不存在 / 未解锁 / 首发不整 / 体力不足 / 次数用尽，一律 ok:false 且不动存档', () => {
  function expectFail(label, fn, re) {
    const snap = JSON.stringify(store.getState());
    const r = fn();
    assert(r && r.ok === false, label + '：应返回 ok:false');
    assert(typeof r.reason === 'string' && r.reason.length >= 4, label + '：reason 必须可读，实为「' + r.reason + '」');
    if (re) assert(re.test(r.reason), label + '：reason「' + r.reason + '」未命中 ' + re);
    assert(JSON.stringify(store.getState()) === snap, label + '：失败路径改动了存档');
  }

  store.init({ fresh: true, force: true, now: 1000 });
  expectFail('对手不存在', () => store.arenaChallenge({ opponentId: 'zzz', seed: 'j-fail-1' }), /不存在/);
  expectFail('未解锁', () => store.arenaChallenge({ opponentId: arenaData.LADDER[2].id, seed: 'j-fail-2' }), /先赢下/);
  expectFail('缺参数', () => store.arenaChallenge({}), /不存在/);

  store.dispatch(store.actions.clearRosterSlot('starter', 0));
  expectFail('首发不足', () => store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'j-fail-3' }), /首发/);
  store.dispatch(store.actions.autoFillRoster());

  // 体力不足：HYDRATE 一份「0 体力且恢复计时起点就在当下」的存档（否则 recoverStamina 会把它填满）
  const drained = JSON.parse(JSON.stringify(store.getState()));
  drained.profile.stamina = 0;
  drained.profile.staminaAt = Date.now();
  store.dispatch(store.actions.hydrate(drained));
  expectFail('体力不足', () => store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'j-fail-4' }), /体力/);

  // 次数用尽：真打满每日上限，下一场必须被拦
  store.init({ fresh: true, force: true, now: 1000 });
  for (let i = 0; i < AC.dailyChallenges; i++) {
    const rr = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'j-used-' + i });
    assert(rr.ok, '第 ' + (i + 1) + ' 场应可挑战：' + rr.reason);
  }
  const full = store.getState();
  assert(full.arena.usedToday === AC.dailyChallenges, '当日次数未累计到上限：' + full.arena.usedToday);
  assert(selectors.arenaView(full, Date.now()).daily.left === 0, '剩余次数应为 0');
  assert(!selectors.arenaView(full, Date.now()).canFight, '次数用尽后 canFight 应为 false');
  expectFail('次数用尽', () => store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'j-used-x' }), /次数/);
  return true;
});

check('快照复现：replaySnapshot 与原局逐字节一致，换 seed 必须不同，缺卡给可读失败，化名口径一致', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const first = arenaData.LADDER[0];
  const r = store.arenaChallenge({ opponentId: first.id, seed: 'j-replay-a01' });
  assert(r.ok, r.reason);
  const hist = store.getState().arena.history;
  assert(hist.length === 1 && hist[0].snapshot && hist[0].snapshot.seed === 'j-replay-a01', '历史里应带可复现快照');
  const snap = hist[0].snapshot;
  assert(snap.opponentId === first.id && snap.home.length === CONFIG.roster.starterCount, '快照内容不符');
  /* 不再 strip playedAt：快照现在存了 playedAt，replaySnapshot 会原样传回 simulate，
   * 所以「逐字节一致」是字面成立的（第十二章可复现红线的严格口径）。 */
  const strip = (x) => JSON.stringify(x);

  const p1 = store.replaySnapshot(snap);
  assert(p1.ok, p1.reason);
  assert(strip(p1.result) === strip(r.result), '快照复现与原局不一致（第十二章可复现红线）');
  const p2 = store.replaySnapshot(Object.assign({}, snap, { seed: snap.seed + '-x' }));
  assert(p2.ok && strip(p2.result) !== strip(r.result), '换 seed 应得到不同的一局（否则 seed 没在驱动随机）');
  const p3 = store.replaySnapshot(Object.assign({}, snap, { playStyle: 'inside' }));
  assert(p3.ok && strip(p3.result) !== strip(r.result), '快照里的打法必须参与复现');

  assert(store.replaySnapshot(null).ok === false, '空快照应失败');
  assert(/不存在/.test(store.replaySnapshot({ seed: 's', opponentId: 'zzz' }).reason || ''), '未知对手应给可读失败');
  // uid 只是统计身份，换了仍能重建面板；真正让快照失效的是 cardId 查不到卡牌定义
  const renamed = store.replaySnapshot(Object.assign({}, snap, { home: snap.home.map((h, hi) => (hi === 0 ? Object.assign({}, h, { uid: 'uid-not-exist' }) : h)) }));
  assert(renamed.ok, renamed.reason);
  const broken = JSON.parse(JSON.stringify(snap));
  broken.home[0].cardId = 'card-not-exist';
  const rb = store.replaySnapshot(broken);
  assert(rb.ok === false && typeof rb.reason === 'string' && rb.reason.length >= 4, '快照阵容不完整时应给可读失败，而不是崩或静默');
  assert(JSON.stringify(snap).length < 2048, '单条快照过大，20 条历史会顶到小程序单 key 上限');

  // 合规：开启「虚构化名」后，复现出来的对手姓名也必须走化名口径（第三章第 7 条一键切换）
  store.dispatch(store.actions.setSetting('fictionalNames', true));
  const aliased = store.replaySnapshot(snap);
  assert(aliased.ok, aliased.reason);
  const expectNames = arenaData.buildAwayCards(first).map((c) => selectors.displayName(store.getState(), c));
  assert(JSON.stringify(aliased.result.away.players.map((p) => p.name)) === JSON.stringify(expectNames), '化名模式下复现战报的对手姓名未走 displayName');
  const fresh = store.arenaChallenge({ opponentId: first.id, seed: 'j-replay-alias' });
  assert(fresh.ok && JSON.stringify(fresh.result.away.players.map((p) => p.name)) === JSON.stringify(expectNames), '化名模式下新对局的对手姓名未走 displayName');
  return true;
});

check('跨天清零与历史上限：dailyOf 视图与 reducer 落库同口径，历史截断到 historyMax 且最新在前', () => {
  const d1 = arenaUtil.dayKeyOf(NOON);
  const d2 = arenaUtil.dayKeyOf(NOON_NEXT);
  store.init({ fresh: true, force: true, now: NOON });
  let st = store.getState();
  assert(st.arena.dayKey === d1 && st.arena.usedToday === 0, '新档 dayKey 应按传入 now 生成，实为 ' + st.arena.dayKey);

  const fake = (res, margin) => ({ result: res, margin: margin, homeScore: 80, awayScore: 80 - margin, ot: 0, away: { name: 'x' } });
  const play = (state, dayKey, seed, res) => reducers.reduce(state, store.actions.arenaResult({
    result: fake(res || 'win', 5), opponentId: arenaData.LADDER[0].id, opponentName: 'x', rewards: {},
    ratingDelta: 10, staminaCost: 0, dayKey: dayKey, seed: seed, snapshot: null, now: NOON
  }));
  for (let i = 0; i < AC.dailyChallenges; i++) st = play(st, d1, 'j-day-' + i);
  assert(st.arena.usedToday === AC.dailyChallenges && st.arena.dayKey === d1, '当日次数未累计：' + st.arena.usedToday);
  assert(arenaUtil.dailyOf(st.arena, NOON, AC).left === 0, '当天应无剩余次数');
  assert(arenaUtil.dailyOf(st.arena, NOON_NEXT, AC).left === AC.dailyChallenges, '跨天视图应恢复满次数');
  assert(selectors.arenaView(st, NOON_NEXT).daily.left === AC.dailyChallenges, 'arenaView 跨天也应恢复满次数');

  const matchesBefore = st.arena.matches;
  const ratingBefore = st.arena.rating;
  const crossed = play(st, d2, 'j-day-cross');
  assert(crossed.arena.dayKey === d2, '落库后 dayKey 应切到新的一天');
  assert(crossed.arena.usedToday === 1, '跨天那场的当日次数应为 1，实为 ' + crossed.arena.usedToday);
  assert(crossed.arena.matches === matchesBefore + 1, '总场次不该被跨天清掉');
  assert(crossed.arena.rating === Math.max(AC.ratingMin, ratingBefore + 10), '跨天那场仍应正常结算积分');

  let hist = st;
  const total = AC.historyMax + 5;
  for (let i = 0; i < total; i++) hist = play(hist, d1, 'j-hist-' + i);
  assert(hist.arena.history.length === AC.historyMax, '历史应截断到 historyMax，实为 ' + hist.arena.history.length);
  assert(hist.arena.history[0].seed === 'j-hist-' + (total - 1), '历史应按时间倒序（最新在前）');
  assert(JSON.stringify(hist).length < 900000, '存档体积逼近小程序单 key 1MB 上限');
  return true;
});

check('存档往返：竞技场段与防守策略落盘读回一致，读回后快照仍可复现', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const r = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'j-save-a01' });
  assert(r.ok, r.reason);
  assert(store.setDefense('inside').ok, 'setDefense 失败');
  store.flush();
  store.init({ force: true, now: 1000 });   // 不带 fresh ⇒ 走 storage 读档 + migrate
  const back = store.getState();
  assert(back.roster.defense === 'inside', '防守策略未落盘');
  assert(back.arena.matches === 1 && back.arena.wins === 1 && back.arena.usedToday === 1, '竞技场战绩未落盘');
  assert(back.arena.rating === r.ratingAfter, '积分未落盘：' + back.arena.rating + ' vs ' + r.ratingAfter);
  assert(back.arena.beaten[arenaData.LADDER[0].id].wins === 1, '天梯战绩未落盘');
  assert(back.arena.history.length === 1 && back.arena.history[0].snapshot.seed === 'j-save-a01', '快照未落盘');
  assert(back.profile.arenaCoin === AC.coinPerWin, '竞技币未落盘');
  const rp = store.replaySnapshot(back.arena.history[0].snapshot);
  assert(rp.ok, rp.reason);
  /* 落盘再读回也必须逐字节一致（含 playedAt），证明快照真的把复现所需的一切都存下了 */
  assert(JSON.stringify(rp.result) === JSON.stringify(r.result), '落盘再读回的快照复现结果不一致（含 playedAt 应逐字节相同）');
  const av = selectors.arenaView(back, Date.now());
  assert(av.history.length === 1 && av.history[0].canReplay, 'arenaView 应标出可回放的历史');
  assert(av.recordText !== undefined || av.ladder[0].recordText.indexOf('1胜') !== -1, '天梯战绩文案不符：' + av.ladder[0].recordText);
  return true;
});

check('竞技场与 PVE 互不污染：打天梯不写 season/stats，打关卡不动积分与次数', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const s0 = store.getState();
  const pve0 = JSON.stringify({ season: s0.season, stats: s0.stats });
  const arena0 = JSON.stringify(s0.arena);
  const ar = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'j-iso-arena' });
  assert(ar.ok, ar.reason);
  const s1 = store.getState();
  assert(JSON.stringify({ season: s1.season, stats: s1.stats }) === pve0, '竞技场污染了 season/stats');
  assert(JSON.stringify(s1.arena) !== arena0, '竞技场段应推进');

  const st2 = store.startBattle({ stageId: stages.STAGES[0].id, seed: 'j-iso-stage' });
  assert(st2.ok, st2.reason);
  const s2 = store.getState();
  assert(s2.arena.rating === s1.arena.rating && s2.arena.matches === s1.arena.matches, '打关卡动了竞技场积分/场次');
  assert(s2.arena.usedToday === s1.arena.usedToday, '打关卡消耗了每日挑战次数');
  assert(s2.arena.history.length === s1.arena.history.length, '打关卡不该写竞技场历史');
  assert(s2.arena.beaten[stages.STAGES[0].id] === undefined, '关卡 id 不该混进天梯战绩');
  assert(s2.season.cleared[stages.STAGES[0].id], 'PVE 通关记录未写入');
  assert(s2.stats.battles === s0.stats.battles + 1, '执教战绩应只统计 PVE');
  return true;
});
/* ================= K 页面层口径（里程碑 2：战术克制 + 异步 PVP 的展示层） =================
 * 页面代码跑在小程序里，但它展示的每个数字都来自 store/selectors 与 utils（纯函数），
 * 所以这里把 Page / wx / getCurrentPages 打桩，直接在 Node 里「打开页面」跑一遍：
 *   ① WXML 引用的字段必须在同名 .js 里有来源 —— 拼错不会报错，只会静默空白；
 *   ② 比赛页三种模式（PVE / 竞技场挑战 / 历史回放）的结算字段必须与 commands 的返回一致；
 *   ③ 战报克制角标的条数与好坏判定必须与 battle.counters 同源（页面不许自己算第二遍）；
 *   ④ 主页 / 关卡页 / 竞技场页的入口摘要必须等于 selectors 的口径。
 * 打桩只给页面用到的那几个 wx API；故意不给 getStorageSync，utils/storage.js 会退回内存实现。
 * 确定性：比赛页支持 ?seed= 透传（match.js 只透传不造 seed），本组全部用固定 seed 驱动。
 */
section('K 页面层口径（WXML 字段一致 / 页面可在 Node 里驱动）');

/* ---------- 静态分析：WXML mustache 的根标识符 vs 同名 .js 提供的字段 ---------- */
function kBalanced(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return null;
}

/* 取对象字面量「第一层」的键：按深度 0 的逗号切片段，每段只认行首的 key:（或简写 key） */
function kTopKeys(objText) {
  const keys = new Set();
  const inner = objText.slice(1, -1);
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) { parts.push(inner.slice(start, i)); start = i + 1; }
  }
  parts.push(inner.slice(start));
  parts.forEach((p) => {
    let m = p.match(/(?:^|\n)[ \t]*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))[ \t]*:/);
    if (!m) m = p.match(/^[ \t\n]*([A-Za-z_$][\w$]*)[ \t\n]*$/);
    if (m) keys.add(m[1] || m[2] || m[3]);
  });
  return keys;
}

/* 页面 .js 能提供的字段：data 默认值 + 组件 properties + 所有 return { }（含 mapState 的返回值） */
function kProvidedByJs(jsSrc) {
  const names = new Set();
  [/\bdata[ \t]*:[ \t]*\{/g, /\bproperties[ \t]*:[ \t]*\{/g, /\breturn[ \t]*\{/g].forEach((re) => {
    let m;
    while ((m = re.exec(jsSrc)) !== null) {
      const blk = kBalanced(jsSrc, m.index + m[0].length - 1);
      if (blk) kTopKeys(blk).forEach((k) => names.add(k));
    }
  });
  return names;
}

const K_LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Date']);

/* WXML 里用到的「根标识符」中，js 没提供、也不是 wx:for 局部变量的那些 */
function kMissingNames(wxmlSrc, jsSrc) {
  const js = kProvidedByJs(jsSrc);
  const src = wxmlSrc.replace(/<!--[\s\S]*?-->/g, ' ');
  const locals = new Set(['item', 'index']);
  let m;
  const lre = /wx:for-(?:item|index)[ \t]*=[ \t]*"([^"]+)"/g;
  while ((m = lre.exec(src)) !== null) locals.add(m[1]);
  const used = new Set();
  const bre = /\{\{([\s\S]*?)\}\}/g;
  while ((m = bre.exec(src)) !== null) {
    const expr = m[1].replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    const tre = /(\.[ \t]*[A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)/g;
    let t;
    while ((t = tre.exec(expr)) !== null) { if (!t[1] && t[2]) used.add(t[2]); }
  }
  return Array.from(used).filter((u) => !js.has(u) && !locals.has(u) && !K_LITERALS.has(u)).sort();
}

const K_WXML = ALL_FILES.filter((f) => f.endsWith('.wxml'));

check('WXML 引用的字段都在同名 .js 里有来源（data / mapState 返回 / properties / wx:for 局部变量）', () => {
  const bad = [];
  K_WXML.forEach((wf) => {
    const jsf = wf.replace(/\.wxml$/, '.js');
    if (!fs.existsSync(jsf)) { bad.push(REL(wf) + ' 缺同名 .js'); return; }
    const miss = kMissingNames(fs.readFileSync(wf, 'utf8'), fs.readFileSync(jsf, 'utf8'));
    if (miss.length) bad.push(REL(wf) + ' -> ' + miss.join(', '));
  });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('上一条不是空跑：合成 fixture 里拼错的字段必须被抓出来，合法字段不误报', () => {
  const js = "Page({ data: { foo: 1, playing: false, list: [] }, onLoad: function () { return { bar: 2 }; } });";
  const okWxml = '<view wx:for="{{list}}" wx:key="i" wx:for-item="row">{{foo}} {{bar}} {{row.x}} {{index}} {{playing ? \'暂停\' : \'继续\'}}</view>';
  const badWxml = '<view>{{foo}} {{baz}} {{row.deep}}</view>';
  const okMiss = kMissingNames(okWxml, js);
  assert(okMiss.length === 0, '合法字段被误报: ' + okMiss.join(', '));
  const badMiss = kMissingNames(badWxml, js);
  assert(badMiss.indexOf('baz') !== -1, '拼错的字段 baz 没被抓出来');
  assert(badMiss.indexOf('row') !== -1, '未声明的循环变量 row 没被抓出来');
  assert(badMiss.indexOf('foo') === -1, 'foo 有来源，不该被报');
  return true;
});

check('pages/ 下每个页面目录都在 app.json 注册（漏注册 = 页面永远进不去）', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const registered = new Set(app.pages);
  const dirs = fs.readdirSync(path.join(ROOT, 'pages'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  const unregistered = dirs.filter((d) => !registered.has('pages/' + d + '/' + d));
  const outside = app.pages.filter((p) => p.indexOf('pages/') !== 0);
  assert(unregistered.length === 0, '未注册的页面目录: ' + unregistered.join(', '));
  assert(outside.length === 0, 'app.json 里有非 pages/ 路径: ' + outside.join(', '));
  assert(registered.has('pages/arena/arena'), '竞技场页未注册');
  return true;
});

/* ---------- 小程序运行时打桩 ---------- */
const K_UI = { toast: [], navigateTo: [], switchTab: [], clipboard: [], navigateBack: 0 };
function kResetUi() {
  K_UI.toast.length = 0; K_UI.navigateTo.length = 0; K_UI.switchTab.length = 0;
  K_UI.clipboard.length = 0; K_UI.navigateBack = 0;
}
global.wx = {
  showToast: function (o) { K_UI.toast.push((o && o.title) || ''); },
  navigateTo: function (o) { K_UI.navigateTo.push((o && o.url) || ''); },
  navigateBack: function () { K_UI.navigateBack++; },
  switchTab: function (o) { K_UI.switchTab.push((o && o.url) || ''); },
  setClipboardData: function (o) { K_UI.clipboard.push((o && o.data) || ''); }
  // 故意不提供 getStorageSync：utils/storage.js 探测不到就退回内存实现
};
global.getCurrentPages = function () { return [{}, {}]; };
let kCaptured = null;
global.Page = function (cfg) { kCaptured = cfg; };
global.Component = function (cfg) { kCaptured = cfg; };

/* 极简 setData：支持 'log[12]' / 'a.b' 路径写法（页面里大量使用） */
function kSetPath(obj, keyPath, value) {
  const tokens = String(keyPath).replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] === undefined || cur[t] === null) cur[t] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}

/* 打开一个页面：require（清缓存）→ 捕获 Page(cfg) → 造实例 → onLoad */
function kMount(rel, options) {
  kCaptured = null;
  const abs = require.resolve(path.join(ROOT, rel));
  delete require.cache[abs];
  require(abs);
  assert(kCaptured, rel + ' 没有调用 Page()/Component()');
  const cfg = kCaptured;
  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach((k) => kSetPath(inst.data, k, patch[k]));
    if (typeof cb === 'function') cb.call(inst);   // 与真机一致：回调绑定页面实例
  };
  if (inst.onLoad) inst.onLoad(options || {});
  return inst;
}

/* 卸载：解绑 store 订阅，避免上一个页面实例在后续 dispatch 里空跑 mapState */
function kUnmount(inst) { if (inst && inst.onUnload) inst.onUnload(); }

/* 组件挂载：properties 默认值并进 data，attached 时订阅 store（与 connectComponent 的行为一致） */
function kMountComponent(rel) {
  kCaptured = null;
  const abs = require.resolve(path.join(ROOT, rel));
  delete require.cache[abs];
  require(abs);
  assert(kCaptured, rel + ' 没有调用 Component()');
  const cfg = kCaptured;
  const inst = Object.assign({}, cfg.methods || {});
  const data = Object.assign({}, cfg.data || {});
  Object.keys(cfg.properties || {}).forEach((k) => {
    const p = cfg.properties[k];
    data[k] = (p && typeof p === 'object' && 'value' in p) ? p.value : p;
  });
  inst.data = data;
  inst.properties = data;
  inst.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach((k) => kSetPath(inst.data, k, patch[k]));
    if (typeof cb === 'function') cb.call(inst);   // 与真机一致：回调绑定组件实例
  };
  inst.triggerEvent = function () {};
  inst.__detached = (cfg.lifetimes && cfg.lifetimes.detached) || cfg.detached;
  const attached = (cfg.lifetimes && cfg.lifetimes.attached) || cfg.attached;
  if (attached) attached.call(inst);
  return inst;
}

/* 比赛页专用：onLoad 即结算，再 skip() 一次性播完战报并触发 finish() */
function kPlayMatch(options) {
  const inst = kMount('pages/match/match.js', options);
  if (!inst.data.error) {
    assert(inst.data.started, '比赛页未开始结算');
    inst.skip();
  }
  return inst;
}

const K_MATCH_WXML = fs.readFileSync(path.join(ROOT, 'pages/match/match.wxml'), 'utf8');

check('比赛页模板：星级按模式隐藏，竞技场结算 / 回放说明 / 克制统计 / 角标 / 模式化按钮都在', () => {
  const need = [
    ['wx:if="{{!arenaMode}}" class="mt-res-stars"', '星级块未按模式隐藏（竞技场不发星级）'],
    ['wx:if="{{arenaSettled}}"', '缺竞技场结算块'],
    ['wx:if="{{arenaReplayNote}}"', '缺历史回放说明块'],
    ['wx:if="{{counterEnabled}}"', '缺战术克制统计块'],
    ['wx:if="{{item.counter}}" class="mt-tc {{item.counterCls}}">{{item.counterText}}', '战报行缺克制角标'],
    ['bindtap="replay">{{replayLabel}}', '底部「再战」按钮文案未按模式化'],
    ['bindtap="backToStages">{{backLabel}}', '底部「返回」按钮文案未按模式化'],
    ['wx:if="{{!error && !finished}}"', '观赛区未随结算隐藏（球场会残留在结算浮层后）']
  ];
  need.forEach((n) => assert(K_MATCH_WXML.indexOf(n[0]) !== -1, n[1]));
  return true;
});

check('比赛页 PVE 模式：走 startBattle，给星级与首通奖励，不出竞技场结算，返回文案是「回关卡」', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  kResetUi();
  const inst = kPlayMatch({ stageId: stages.STAGES[0].id, seed: 'k3-pve' });
  try {
    assert(!inst.data.error, 'PVE 入口报错：' + inst.data.error);
    assert(inst.data.finished && inst.data.progress === 100, '跳过后应直接到结算');
    assert(inst.data.log.length === inst.data.totalLog, '战报应补齐到总条数');
    assert(inst.data.arenaMode === false && inst.data.arenaSettled === false && inst.data.arenaReplayNote === false, 'PVE 不该出竞技场结算');
    /* 页面显示的必须就是引擎算的（页面不许自己算星级 / 比分） */
    assert(inst.data.stars === inst.result.stars, '页面星级 != 引擎星级');
    assert(inst.data.starText.length === inst.data.stars, '星级文案与星级数不一致');
    assert(inst.data.homeScore === inst.result.homeScore && inst.data.awayScore === inst.result.awayScore, '比分与引擎不一致');
    assert(inst.data.seed === 'k3-pve', 'seed 透传失效');
    assert(inst.data.rewardLines.some((l) => l.k === '首通奖励'), '首通奖励未展示');
    assert(!inst.data.rewardLines.some((l) => l.k === '竞技币'), 'PVE 不该发竞技币');
    assert(inst.data.replayLabel === '再战' && inst.data.backLabel === '回关卡', '按钮文案错');
    assert(inst.data.canReplay === true && inst.data.replayBlockText === '', '初始体力应够再战第一关');
    assert(inst.data.counterBonusPct === Math.round(CONFIG.battle.counter.bonus * 100), '克制加成百分比未取自 config');
  } finally { kUnmount(inst); }
  return true;
});

check('比赛页竞技场模式：走 arenaChallenge，给积分/段位/竞技币，按 config 扣次数与体力', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const s0 = store.getState();
  const stam0 = selectors.staminaView(s0, 1000).value;
  const coin0 = s0.profile.arenaCoin || 0;
  kResetUi();
  const opp = arenaData.LADDER[0];
  const inst = kPlayMatch({ mode: 'arena', opp: opp.id, seed: 'k3-arena' });
  try {
    assert(!inst.data.error, '竞技场入口报错：' + inst.data.error);
    assert(inst.data.arenaMode === true && inst.data.arenaSettled === true, '竞技场挑战应出结算块');
    assert(inst.data.arenaReplayNote === false, '挑战不是回放');
    const s1 = store.getState();
    assert(/^[+-]\d+$/.test(inst.data.ratingDeltaText), '积分变化文案格式不对：' + inst.data.ratingDeltaText);
    assert(Number(inst.data.ratingDeltaText) === s1.arena.rating - CONFIG.arena.ratingStart, '积分变化与落库不一致');
    assert(inst.data.ratingAfter === s1.arena.rating, '结算后积分与落库不一致');
    assert(inst.data.ratingDeltaCls === (s1.arena.rating >= CONFIG.arena.ratingStart ? 'mt-delta--up' : 'mt-delta--down'), '涨跌配色判定错');
    const sum = selectors.arenaSummary(s1, Date.now());
    assert(inst.data.arenaRankName === sum.rankName && inst.data.arenaRankText === sum.rankText, '段位名/进度文案与 selectors 不一致');
    assert(inst.data.arenaDailyText === sum.dailyText, '每日次数文案与 selectors 不一致');
    assert(inst.data.arenaCoinText === String(sum.arenaCoin), '竞技币余额与 selectors 不一致');
    assert(inst.data.arenaStreakText.indexOf(String(s1.arena.streak)) === 0, '连胜场次与落库不一致');
    assert(inst.data.stars === inst.result.stars && inst.data.arenaMode === true, '竞技场仍算星级但模板必须隐藏');
    /* 经济：竞技币入账 == 面板显示；次数与体力按 config 扣 */
    const coinLine = inst.data.rewardLines.filter((l) => l.k === '竞技币')[0];
    assert(coinLine, '竞技场奖励里没有竞技币行');
    assert(Number(coinLine.v.replace('+', '')) === (s1.profile.arenaCoin || 0) - coin0, '竞技币行与落库不一致');
    assert(s1.arena.usedToday === 1, '每日次数未扣');
    assert(selectors.staminaView(s1, 1000).value === stam0 - CONFIG.arena.staminaCost, '体力未按 config.arena.staminaCost 扣');
    assert(!s1.season.cleared[opp.id] && s1.stats.battles === s0.stats.battles, '竞技场污染了 PVE 的 season/stats');
    assert(inst.data.seed === 'k3-arena', 'seed 透传失效');
    assert(inst.data.backLabel === '回天梯' && inst.data.replayLabel === '再战', '按钮文案错');
    assert(inst.data.canReplay === true && inst.data.replayBlockText === '', '还有次数与体力时应可再战');
  } finally { kUnmount(inst); }
  return true;
});

check('比赛页历史回放：走 replaySnapshot，同 seed 同比分，不出结算块、不消耗次数与体力', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const first = kPlayMatch({ mode: 'arena', opp: arenaData.LADDER[0].id, seed: 'k3-replay-origin' });
  const originScore = first.data.homeScore + ':' + first.data.awayScore;
  kUnmount(first);
  const before = store.getState();
  assert(before.arena.history.length === 1 && before.arena.history[0].snapshot, '历史快照未落库');
  kResetUi();
  const inst = kPlayMatch({ mode: 'arena', hist: 0 });
  try {
    assert(!inst.data.error, '回放入口报错：' + inst.data.error);
    assert(inst.data.arenaSettled === false && inst.data.arenaReplayNote === true, '回放不该出结算块，且要给回放说明');
    assert(inst.data.seed === before.arena.history[0].seed, 'seed 应与历史记录一致');
    assert(inst.data.homeScore + ':' + inst.data.awayScore === originScore, '回放比分与原局不一致');
    assert(inst.data.replayLabel === '再看一遍' && inst.data.backLabel === '回天梯', '回放按钮文案错');
    assert(inst.data.canReplay === true, '回放不消耗资源，应可反复看');
    assert(inst.data.rewardLines.length === 1 && inst.data.rewardLines[0].v.indexOf('历史回放') !== -1, '回放不该重发奖励');
    const after = store.getState();
    assert(after.arena.usedToday === before.arena.usedToday, '回放消耗了每日次数');
    assert(after.arena.history.length === before.arena.history.length, '回放写了历史');
    assert(after.arena.rating === before.arena.rating, '回放改了积分');
    assert((after.profile.arenaCoin || 0) === (before.profile.arenaCoin || 0), '回放发了竞技币');
  } finally { kUnmount(inst); }
  return true;
});

check('比赛页错误入口：对手不存在 / 历史缺失 / 关卡不存在，文案可读且返回按钮指向对的页面', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  kResetUi();
  const a = kMount('pages/match/match.js', { mode: 'arena', opp: 'nope' });
  assert(a.data.error.indexOf('天梯对手不存在') === 0, '对手不存在的文案：' + a.data.error);
  assert(a.data.arenaMode === true && a.data.backLabel === '回天梯', '竞技场错误应回天梯');
  kUnmount(a);
  const b = kMount('pages/match/match.js', { mode: 'arena', hist: 9 });
  assert(b.data.error.indexOf('历史对局不存在') !== -1, '历史缺失的文案：' + b.data.error);
  assert(b.data.arenaReplay === true && b.data.backLabel === '回天梯', '回放错误应回天梯');
  kUnmount(b);
  const c = kMount('pages/match/match.js', { stageId: 'nope' });
  assert(c.data.error.indexOf('关卡不存在') !== -1, '关卡不存在的文案：' + c.data.error);
  assert(c.data.arenaMode === false && c.data.backLabel === '回关卡', 'PVE 错误应回关卡');
  kUnmount(c);
  const d = kPlayMatch({ stageId: stages.STAGES[0].id, seed: 'k3-block' });
  assert(!d.data.error, d.data.error);
  kUnmount(d);
  /* 次数用尽后，再战按钮必须给出「次数」而不是「体力」的拦截文案 */
  const st = store.getState();
  for (let i = st.arena.usedToday; i < CONFIG.arena.dailyChallenges; i++) {
    const r = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'k3-drain-' + i });
    assert(r.ok, r.reason);
  }
  const e = kPlayMatch({ mode: 'arena', opp: arenaData.LADDER[0].id, seed: 'k3-drained' });
  assert(e.data.error.indexOf('今日挑战次数已用完') !== -1, '次数用尽应由 commands 拦下：' + e.data.error);
  kUnmount(e);
  return true;
});

check('战报克制角标 == battle.counters：条数、好坏判定、双方计数文案全部同源', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  /* 造一个克制必定触发的对局：拉外线（三分/突破为主）打 a02 的收缩护筐，
   * 同时我方外线扩防去掐他的中距离 —— 双向都会打出角标。 */
  assert(store.setPlayStyle('perimeter').ok, 'setPlayStyle 失败');
  assert(store.setDefense('perimeter').ok, 'setDefense 失败');
  const unlock = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'k4-unlock' });
  assert(unlock.ok, unlock.reason);
  kResetUi();
  const inst = kPlayMatch({ mode: 'arena', opp: arenaData.LADDER[1].id, seed: 'k4-counter' });
  try {
    assert(!inst.data.error, '入口报错：' + inst.data.error);
    assert(inst.data.counterEnabled === true, '克制未开启，断言会变成空跑');
    const c = inst.result.counters;
    const total = c.home.attack + c.home.defend + c.away.attack + c.away.defend;
    assert(total > 0, '这组配置本该触发克制，counters 却全是 0');
    const rows = inst.data.log.filter((r) => r && r.counter);
    assert(rows.length === total, '角标条数 ' + rows.length + ' != counters 总数 ' + total);
    rows.forEach((r) => {
      const src = inst.result.log[r.i];
      assert(src && src.counter === r.counter && src.side === r.side, '第 ' + r.i + ' 条角标与战报源数据不一致');
      /* 口径：counter=attack 表示「进攻方得利」，defend 表示「防守方得利」。
       * 站在玩家（home）视角：attack 且 side=home ⇒ 有利；defend 且 side=away ⇒ 有利。 */
      const good = r.counter === 'attack' ? r.side === 'home' : r.side === 'away';
      assert(r.counterText === (good ? '克制' : '被克'), '第 ' + r.i + ' 条角标文案判定反了');
      assert(r.counterCls === (good ? 'mt-tc--good' : 'mt-tc--bad'), '第 ' + r.i + ' 条角标配色判定反了');
    });
    assert(rows.filter((r) => r.side === 'home' && r.counter === 'attack').length === c.home.attack, 'home.attack 与角标不符');
    assert(rows.filter((r) => r.side === 'home' && r.counter === 'defend').length === c.home.defend, 'home.defend 与角标不符');
    assert(rows.filter((r) => r.side === 'away' && r.counter === 'attack').length === c.away.attack, 'away.attack 与角标不符');
    assert(inst.data.homeCounterText === '克 ' + c.home.attack + ' 次 · 被克 ' + c.home.defend + ' 次', '我方克制计数文案不符：' + inst.data.homeCounterText);
    assert(inst.data.awayCounterText === '克 ' + c.away.attack + ' 次 · 被克 ' + c.away.defend + ' 次', '对手克制计数文案不符：' + inst.data.awayCounterText);
    /* 双方打法与防守策略名也必须来自引擎的 teamEcho */
    assert(inst.data.homeDefenseName === inst.result.home.defenseName, '我方防守策略名与引擎不一致');
    assert(inst.data.awayDefenseName === inst.result.away.defenseName, '对手防守策略名与引擎不一致');
    assert(inst.data.homeTacticName === inst.result.home.playStyleName, '我方打法名与引擎不一致');
    assert(inst.data.awayTacticName === inst.result.away.playStyleName, '对手打法名与引擎不一致');
  } finally { kUnmount(inst); }
  return true;
});

check('关闭克制时页面也不显示克制块（counterEnabled 直接来自 battle，不写死）', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  kResetUi();
  const inst = kPlayMatch({ stageId: stages.STAGES[0].id, seed: 'k4-off' });
  try {
    const badgeRows = inst.data.log.filter((r) => r && r.counter);
    assert(inst.data.counterEnabled === inst.result.counterEnabled, 'counterEnabled 未跟随引擎');
    assert(badgeRows.length === inst.result.counters.home.attack + inst.result.counters.home.defend
      + inst.result.counters.away.attack + inst.result.counters.away.defend, '角标条数与 counters 不符');
    assert(inst.data.homeCounterText.indexOf('克 ') === 0, '克制计数文案缺失');
  } finally { kUnmount(inst); }
  return true;
});

check('竞技场页：天梯就绪、锁定对手只提示不跳转、解锁后跳比赛页带对参数、战术 chips 落到 store', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  kResetUi();
  const inst = kMount('pages/arena/arena.js', {});
  try {
    const av = selectors.arenaView(store.getState(), Date.now());
    assert(inst.data.enabled === true, '竞技场应开放');
    assert(inst.data.ladder.length === arenaData.LADDER.length, '天梯条数不对');
    assert(inst.data.rating === CONFIG.arena.ratingStart, '初始积分不对');
    assert(inst.data.rankName === av.rankName && inst.data.rankText === av.rankText, '段位口径与 selectors 不一致');
    assert(inst.data.dailyText === av.dailyText && inst.data.dailyLeft === CONFIG.arena.dailyChallenges, '每日次数口径不对');
    assert(inst.data.note.indexOf('零后端') !== -1, '必须讲清「离线天梯」口径，不冒充真人对战');
    /* 每一行都要有侦察结论（打法/防守/克制判定/建议），否则页面等于没做战术克制 */
    const VERDICT_CLS = ['', 'tc-good', 'tc-ok', 'tc-warn', 'tc-bad'];
    let biased = 0;
    inst.data.ladder.forEach((row) => {
      assert(row.verdict, row.id + ' 缺克制判定');
      assert(VERDICT_CLS.indexOf(row.verdictCls) !== -1, row.id + ' 克制判定配色非法：' + row.verdictCls);
      assert(row.counterText && row.valueText, row.id + ' 缺克制率文案');
      assert(row.suggestDefenseKey && row.suggestText, row.id + ' 缺防守建议');
      assert(row.defenseName && row.playStyleName, row.id + ' 缺对手打法/防守名');
      /* 人盯人不偏科 ⇒ 均势且 0%；只要对手不是人盯人，就必须算出非 0 的克制率与非「均势」的判定 */
      if (row.defense === 'balanced') {
        assert(row.verdict === '均势' && row.counterText.indexOf('0%') === 0, row.id + ' 人盯人应为均势 0%');
      } else {
        biased++;
        assert(row.verdict !== '均势', row.id + ' 非人盯人防守不该判均势');
        assert(row.counterText.indexOf('0% 出手吃克制') !== 0, row.id + ' 克制率不该全是 0');
      }
    });
    assert(biased > 0, '天梯里一支偏科防守都没有，克制侦察等于空跑');
    assert(inst.data.ladder[0].unlocked === true && inst.data.ladder[1].unlocked === false, '天梯应顺序解锁');

    /* 锁定对手：只提示，不跳转 */
    inst.challenge({ currentTarget: { dataset: { id: arenaData.LADDER[1].id } } });
    assert(K_UI.navigateTo.length === 0, '未解锁对手不该跳转');
    assert(K_UI.toast.some((t) => t.indexOf('先赢下') !== -1), '未解锁应给出可读提示：' + JSON.stringify(K_UI.toast));

    /* 战术 chips：打到 store，页面不存本地副本 */
    kResetUi();
    inst.onDefense({ currentTarget: { dataset: { key: 'inside' } } });
    assert(store.getState().roster.defense === 'inside', '防守策略未落库');
    inst.onStyle({ currentTarget: { dataset: { key: 'perimeter' } } });
    assert(store.getState().roster.playStyle === 'perimeter', '打法未落库');
    inst.useSuggest({ currentTarget: { dataset: { key: 'perimeter' } } });
    assert(store.getState().roster.defense === 'perimeter', '一键采纳建议未落库');
    kResetUi();
    inst.onDefense({ currentTarget: { dataset: { key: 'nope' } } });
    assert(store.getState().roster.defense === 'perimeter', '非法防守策略被写进了存档');
    assert(K_UI.toast.length === 1, '非法值应给出提示');

    /* 空历史：回放入口不动作 */
    kResetUi();
    inst.replayHistory({ currentTarget: { dataset: { index: 0 } } });
    assert(K_UI.navigateTo.length === 0, '没有历史时不该跳转');

    /* 解锁对手：跳比赛页，URL 必须带 mode=arena&opp= */
    kResetUi();
    inst.challenge({ currentTarget: { dataset: { id: arenaData.LADDER[0].id } } });
    assert(K_UI.navigateTo.length === 1 && K_UI.navigateTo[0] === '/pages/match/match?mode=arena&opp=' + arenaData.LADDER[0].id,
      '挑战跳转 URL 不对：' + JSON.stringify(K_UI.navigateTo));

    /* 打完一场后（store 订阅自动刷新页面数据），历史回放入口应带 hist 下标 */
    const r = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'k5-hist' });
    assert(r.ok, r.reason);
    assert(inst.data.history.length === 1 && inst.data.history[0].canReplay, '页面未随 store 刷新出历史');
    kResetUi();
    inst.replayHistory({ currentTarget: { dataset: { index: 0 } } });
    assert(K_UI.navigateTo.length === 1 && K_UI.navigateTo[0] === '/pages/match/match?mode=arena&hist=0',
      '回放跳转 URL 不对：' + JSON.stringify(K_UI.navigateTo));
    assert(inst.data.ladder[1].unlocked === true, '赢下第一位后应解锁第二位');
  } finally { kUnmount(inst); }
  return true;
});

check('入口摘要口径：主页 / 关卡页 / 我的页的竞技场卡片 == selectors.arenaSummary，侦察面板 == selectors.stageScout', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const sum = selectors.arenaSummary(store.getState(), Date.now());
  const home = kMount('pages/home/home.js', {});
  assert(home.data.arenaEnabled === sum.enabled, '主页竞技场开关口径不一致');
  assert(home.data.arenaRankName === sum.rankName && home.data.arenaRating === sum.rating, '主页段位/积分口径不一致');
  assert(home.data.arenaDailyText === sum.dailyText, '主页每日次数口径不一致');
  assert(home.data.arenaProgressText === sum.clearedCount + '/' + sum.ladderCount, '主页天梯进度口径不一致');
  assert(home.data.arenaCoinText === String(sum.arenaCoin), '主页竞技币口径不一致');
  kResetUi();
  home.goArena();
  assert(K_UI.navigateTo.length === 1 && K_UI.navigateTo[0] === '/pages/arena/arena', '主页入口跳转不对');
  kUnmount(home);

  const st = kMount('pages/stages/stages.js', {});
  assert(st.data.arenaRankName === sum.rankName && st.data.arenaRating === sum.rating, '关卡页段位/积分口径不一致');
  assert(st.data.arenaProgressText === sum.clearedCount + '/' + sum.ladderCount, '关卡页天梯进度口径不一致');
  kResetUi();
  st.goArena();
  assert(K_UI.navigateTo.length === 1 && K_UI.navigateTo[0] === '/pages/arena/arena', '关卡页入口跳转不对');
  /* 打开关卡详情：侦察面板必须与 selectors.stageScout 逐字段一致（页面不自己算克制） */
  st.openDetail({ currentTarget: { dataset: { id: stages.STAGES[0].id } } });
  const scout = selectors.stageScout(store.getState(), stages.STAGES[0]);
  assert(st.data.scout, '关卡详情未给出侦察面板');
  ['defenseText', 'playStyleName', 'counterText', 'verdict', 'verdictCls', 'valueText', 'suggestText', 'bonusPct', 'myDefenseName'].forEach((k) => {
    assert(st.data.scout[k] === scout[k], '侦察面板字段 ' + k + ' 口径漂移');
  });
  kUnmount(st);

  const pf = kMount('pages/profile/profile.js', {});
  assert(pf.data.arenaRankName === sum.rankName && pf.data.arenaRating === sum.rating, '我的页段位/积分口径不一致');
  assert(pf.data.arenaProgressText === sum.clearedCount + '/' + sum.ladderCount, '我的页天梯进度口径不一致');
  assert(pf.data.arenaCoinText === String(sum.arenaCoin), '我的页竞技币口径不一致');
  assert(pf.data.arenaDailyText === sum.dailyText, '我的页每日次数口径不一致');
  kResetUi();
  pf.goArena();
  assert(K_UI.navigateTo.length === 1 && K_UI.navigateTo[0] === '/pages/arena/arena', '我的页入口跳转不对');
  kUnmount(pf);
  return true;
});

check('全部页面与组件都能挂载：onLoad / attached / mapState 不抛异常（抛了就是整页白屏）', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const bad = [];
  app.pages.forEach((p) => {
    let inst = null;
    try {
      inst = kMount(p + '.js', {});
      assert(inst.data && Object.keys(inst.data).length > 0, 'data 为空');
    } catch (e) { bad.push(p + ' :: ' + (e && e.message ? e.message : e)); }
    if (inst) kUnmount(inst);
  });
  fs.readdirSync(path.join(ROOT, 'components'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => 'components/' + e.name + '/index.js')
    .forEach((rel) => {
      let inst = null;
      try {
        inst = kMountComponent(rel);
        assert(inst.data && Object.keys(inst.data).length > 0, 'data 为空');
      } catch (e) { bad.push(rel + ' :: ' + (e && e.message ? e.message : e)); }
      if (inst && inst.__detached) { try { inst.__detached.call(inst); } catch (e) { /* 卸载失败不影响冒烟结论 */ } }
    });
  assert(bad.length === 0, bad.join(' | '));
  return true;
});

check('页面与组件不得自产随机数（可复现红线的页面侧延伸：随机只能来自 utils/rng + seed）', () => {
  const bad = ALL_FILES
    .filter((f) => f.endsWith('.js') && (/^pages\//.test(REL(f)) || /^components\//.test(REL(f))))
    .filter((f) => /Math\.random[ \t]*\(/.test(fs.readFileSync(f, 'utf8')))
    .map(REL);
  assert(bad.length === 0, bad.join(', '));
  return true;
});

/* ================= L 名场面时刻卡（第八章「创新玩法」，里程碑 2） =================
 * 时刻卡是「实战触发的装备技能卡」：只在比赛内改两个乘数（属性对抗 A 值、出手人权重），
 * 不进养成面板、不改 OVR / 稀有度 / 薪资。本组锁四件事：
 *   ① 文档点名的两个原例逐条落地（35 秒奇迹 = 末节三分 ×1.2；81 分之夜 = 出手权重 ×2）；
 *   ② 可复现红线不破 —— 没佩戴 / 关闭开关时，18 关 PVE 与 12 位天梯的每一场比分逐字节不变；
 *   ③ 效果是真的（反向对照：戴上必须改变比赛，否则就是装饰）；
 *   ④ 经济纪律（不占工资帽、一份只能一人戴、快照带 moment 可复现）。
 */
section('L 名场面时刻卡（效果解析 / 战斗生效 / 穿戴闭环 / 基线不变）');

const MC = CONFIG.moment;
/* 文档第八章点名的两张卡：断言直接锁原文数值，谁改了数据表就会红 */
const M35 = 'm_35_seconds';
const M81 = 'm_81_points';

/* 临时改 config.moment 跑一段（与 withCounter 同构：verify 是单进程顺序执行，脏配置会污染后面所有断言） */
function withMoment(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = MC[k]; MC[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { MC[k] = saved[k]; }); }
}

/* 等强度合成队 + 指定佩戴表（momentMap = { 球员序号: 时刻卡 id }）。
 * 用合成队而不是真实存档阵容：全属性同值 ⇒ 出手权重与属性对抗都只由时刻卡这一个变量驱动。 */
function momentTeam(name, playStyle, defense, value, momentMap) {
  const t = synthTeam(name, playStyle, defense, value);
  t.players.forEach((p, i) => { p.moment = (momentMap && momentMap[i]) || ''; });
  return t;
}
function wearOne(momentId) { const m = {}; m[0] = momentId; return m; }
function wearAll(momentId) { const m = {}; CONFIG.roster.slotPositions.forEach((pos, i) => { m[i] = momentId; }); return m; }

/* 失败路径统一口径：ok:false + reason 可读 + 存档逐字节不动（与 J 组同构，抽出来给 L/M 复用） */
function expectStoreFail(label, fn, re) {
  const snap = JSON.stringify(store.getState());
  const r = fn();
  assert(r && r.ok === false, label + '：应返回 ok:false，实为 ' + JSON.stringify(r));
  assert(typeof r.reason === 'string' && r.reason.length >= 4, label + '：reason 必须可读，实为「' + r.reason + '」');
  if (re) assert(re.test(r.reason), label + '：reason「' + r.reason + '」未命中 ' + re);
  assert(JSON.stringify(store.getState()) === snap, label + '：失败路径改动了存档');
}

check('data/moments.js 完整：id 唯一、稀有度合法、effects 可解析、节次条件不倒挂、稀有度覆盖 ≥4 档', () => {
  const bad = [];
  const seen = {};
  const rarities = {};
  const KINDS = ['attr', 'shooter'];
  const tacticKeys = tacticsData.TACTICS.map((t) => t.key);
  assert(momentsData.COUNT >= 10, '时刻卡过少：' + momentsData.COUNT + '（第八章的差异化卖点不该只有一两张）');
  momentsData.MOMENTS.forEach((m) => {
    if (seen[m.id]) bad.push('重复 id ' + m.id);
    seen[m.id] = true;
    if (!m.name || !m.desc) bad.push(m.id + ' 缺名字或描述（界面会空白，违反第三章）');
    if (CONFIG.rarity.order.indexOf(m.rarity) === -1) bad.push(m.id + ' 稀有度非法 ' + m.rarity);
    rarities[m.rarity] = true;
    /* 文案必须由 utils/moment.js 从 effects 反推：手写一句 effectText 迟早与真实乘数漂移 */
    if (m.effectText !== undefined) bad.push(m.id + ' 不该手写 effectText');
    if (!Array.isArray(m.effects) || !m.effects.length) { bad.push(m.id + ' effects 为空'); return; }
    m.effects.forEach((e, ei) => {
      const tag = m.id + '.effects[' + ei + ']';
      if (KINDS.indexOf(e.kind) === -1) bad.push(tag + ' kind 非法 ' + e.kind + '（只支持 attr / shooter）');
      if (!isFinite(Number(e.mul)) || !(Number(e.mul) > 0)) bad.push(tag + ' mul 非法 ' + e.mul);
      if (e.tactics !== undefined && !e.tactics.length) bad.push(tag + ' tactics 是空数组（应缺省表示不限战术）');
      (e.tactics || []).forEach((k) => { if (tacticKeys.indexOf(k) === -1) bad.push(tag + ' 引用了不存在的战术 ' + k); });
      if (e.minQuarter !== undefined && !(Number(e.minQuarter) >= 1)) bad.push(tag + ' minQuarter 非法 ' + e.minQuarter);
      if (e.maxQuarter !== undefined && !(Number(e.maxQuarter) >= 1)) bad.push(tag + ' maxQuarter 非法 ' + e.maxQuarter);
      if (e.minQuarter !== undefined && e.maxQuarter !== undefined && Number(e.minQuarter) > Number(e.maxQuarter)) bad.push(tag + ' 节次条件倒挂');
    });
    if (!momentUtil.summaryOf(m)) bad.push(m.id + ' 生成不出效果文案');
  });
  assert(Object.keys(rarities).length >= 4, '稀有度档位过少：' + Object.keys(rarities).join(',') + '（商城定价按档位倒推，档位太少经济曲线拉不开）');
  assert(momentsData.getMoment('nope') === null && momentsData.isMoment(M35) && !momentsData.isMoment('nope'), 'getMoment/isMoment 边界不符');
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  return true;
});

check('文档第八章两个原例逐条落地：35 秒奇迹 = 末节及加时三分 ×1.2；81 分之夜 = 出手权重 ×2', () => {
  const m35 = momentsData.getMoment(M35);
  const m81 = momentsData.getMoment(M81);
  assert(m35 && m81, '文档点名的两张卡必须存在（' + M35 + ' / ' + M81 + '）');
  near(momentUtil.attrMul(m35, 'three', 4), 1.2, 1e-9, '末节三分应 ×1.2（文档原文「末节三分 +20%」）');
  /* 加时的 quarter 是 5、6…（utils/battle.js 传 quarterCount + otCount），关键球类卡必须继续生效 */
  near(momentUtil.attrMul(m35, 'three', 5), 1.2, 1e-9, '加时 quarter=5 必须继续生效');
  near(momentUtil.attrMul(m35, 'three', 3), 1, 1e-9, '第 3 节不该生效（节次条件失效 = 卡面文案骗人）');
  tacticsData.TACTICS.forEach((t) => {
    if (t.key === 'three') return;
    near(momentUtil.attrMul(m35, t.key, 4), 1, 1e-9, '35 秒奇迹不该影响 ' + t.key);
  });
  near(momentUtil.shooterMul(m35, 'three', 4), 1, 1e-9, '35 秒奇迹是 attr 类，不该改出手权重');
  tacticsData.TACTICS.forEach((t) => [1, 2, 3, 4, 5].forEach((q) => {
    near(momentUtil.shooterMul(m81, t.key, q), 2, 1e-9, '81 分之夜应对 ' + t.key + '/q' + q + ' 出手权重 ×2（文档「得分权重翻倍」）');
    near(momentUtil.attrMul(m81, t.key, q), 1, 1e-9, '81 分之夜不该改属性对抗');
  }));
  /* pickShooter 的 quarter 是里程碑 2 新加的第 4 参：老调用方不传 ⇒ 带节次条件的卡必须不误触发 */
  near(momentUtil.attrMul(m35, 'three', undefined), 1, 1e-9, '缺省 quarter 时带节次条件的卡不该生效');
  /* 多效果卡：同类相乘、异类互不干扰（effectMatches 是唯一的条件判据） */
  const multi = momentsData.MOMENTS.filter((m) => (m.effects || []).length >= 2)[0];
  assert(multi, '应至少有一张多效果卡（验证 effects 折叠）');
  const want = {};
  multi.effects.forEach((e) => {
    if (!momentUtil.effectMatches(e, 'three', 4)) return;
    want[e.kind] = (want[e.kind] || 1) * e.mul;
  });
  near(momentUtil.attrMul(multi, 'three', 4), want.attr === undefined ? 1 : want.attr, 1e-9, multi.id + ' 的 attr 折叠结果不符');
  near(momentUtil.shooterMul(multi, 'three', 4), want.shooter === undefined ? 1 : want.shooter, 1e-9, multi.id + ' 的 shooter 折叠结果不符');
  [null, undefined, {}, { effects: [] }].forEach((d) => {
    near(momentUtil.attrMul(d, 'three', 4), 1, 1e-9, '空定义必须返回 1（没戴卡 = 基线）');
    near(momentUtil.shooterMul(d, 'three', 4), 1, 1e-9, '空定义必须返回 1（没戴卡 = 基线）');
  });
  return true;
});

check('config.moment 旋钮真的连着效果：globalScale 缩放 / enabled 一键回退 / 脏 mul 退回 1', () => {
  const m35 = momentsData.getMoment(M35);
  const m81 = momentsData.getMoment(M81);
  near(momentUtil.scaled(1.2), 1.2, 1e-9, 'globalScale=1 时应为原值');
  withMoment({ globalScale: 0 }, () => {
    near(momentUtil.attrMul(m35, 'three', 4), 1, 1e-9, 'globalScale=0 应等价于全部关闭');
    near(momentUtil.shooterMul(m81, 'three', 4), 1, 1e-9, 'globalScale=0 应等价于全部关闭');
  });
  withMoment({ globalScale: 0.5 }, () => near(momentUtil.attrMul(m35, 'three', 4), 1.1, 1e-9, 'globalScale=0.5 应为 1+(1.2-1)×0.5'));
  withMoment({ globalScale: 2 }, () => near(momentUtil.shooterMul(m81, 'three', 4), 3, 1e-9, 'globalScale=2 应为 1+(2-1)×2'));
  withMoment({ enabled: false }, () => {
    near(momentUtil.attrMul(m35, 'three', 4), 1, 1e-9, 'enabled=false 时乘数必须为 1');
    near(momentUtil.shooterMul(m81, 'three', 4), 1, 1e-9, 'enabled=false 时乘数必须为 1');
    assert(momentUtil.effectText(m35).length === 0 && momentUtil.summaryOf(m35) === '', 'enabled=false 时文案应为空（页面据此隐藏整块，不能留一行空白）');
    assert(momentUtil.defOfInstance({ moment: M81 }) === null, 'enabled=false 时不该解析出时刻卡定义');
    const ev = momentUtil.evaluateLineup([{ uid: 'u1', name: 'A', moment: M81 }]);
    assert(ev.enabled === false && ev.count === 0 && ev.list.length === 0 && ev.summaryText === '' && ev.maxRarity === '', 'enabled=false 时评估结果必须是空态');
  });
  /* 空态与非空态形状必须一致（调用方不用判空，与 utils/bond.js 同口径） */
  assert(JSON.stringify(momentUtil.evaluateLineup([])) === JSON.stringify(momentUtil.emptyResult(true)), '空阵容应返回空态且字段形状一致');
  const cards = [{ uid: 'u1', name: 'A', moment: M81 }, { uid: 'u2', name: 'B', moment: '' }, { uid: 'u3', name: 'C', moment: 'm_nope' }];
  const snapCards = JSON.stringify(cards);
  const ev = momentUtil.evaluateLineup(cards);
  assert(ev.enabled === true && ev.count === 1 && ev.list.length === 1, '只应评估出 1 张有效卡，实为 ' + ev.count);
  assert(ev.list[0].momentId === M81 && ev.list[0].playerName === 'A' && ev.byUid.u1 === M81, '评估结果不符');
  assert(ev.maxRarity === m81.rarity, 'maxRarity 应取最高稀有度');
  assert(ev.list[0].effectLines.length && ev.list[0].effectText, '评估结果必须自带文案（页面不自己拼）');
  assert(JSON.stringify(cards) === snapCards, 'evaluateLineup 改动了入参');
  /* uiMaxListed：结算面板最多列几条，超出折叠成「等 N 项」，避免 5 张卡把面板挤爆 */
  const many = CONFIG.roster.slotPositions.map((pos, i) => ({ uid: 'u' + i, name: 'P' + i, moment: M81 }));
  const evMany = momentUtil.evaluateLineup(many);
  assert(evMany.count === many.length, 'count 应是全部佩戴数');
  const uiMax = Number(MC.uiMaxListed) || many.length;
  const listed = evMany.summaryText.split(' · ').filter((s) => s.indexOf('等 ') !== 0).length;
  assert(listed <= uiMax, '摘要未按 uiMaxListed 折叠：' + evMany.summaryText);
  if (many.length > uiMax) assert(/等 \d+ 项/.test(evMany.summaryText), '超出 uiMaxListed 时应折叠为「等 N 项」：' + evMany.summaryText);
  /* 脏数据一律退回 1，绝不让 NaN 进战斗公式（NaN 会让整局比分变成 NaN，而且不报错） */
  [0, -1, NaN, 'x', undefined, null].forEach((v) => near(momentUtil.scaled(v), 1, 1e-9, 'mul=' + v + ' 应退回 1'));
  assert(momentUtil.defOfInstance(null) === null && momentUtil.defOfInstance({}) === null && momentUtil.defOfInstance({ moment: 'nope' }) === null, '非法实例应返回 null');
  return true;
});

check('反向对照：关闭时刻卡 == 没人佩戴（逐字节一致）；戴上必须改变比赛，且堆叠同类卡刷不出数值', () => {
  const SEEDS = 20;
  let onDiff = 0;
  let allSame = 0;
  for (let i = 0; i < SEEDS; i++) {
    const seed = 'l-ctl-' + i;
    const run = (wear) => battle.simulate({
      home: momentTeam('H', 'perimeter', 'balanced', 80, wear),
      away: momentTeam('A', 'inside', 'inside'), seed: seed
    });
    const plain = battleProjection(run(null));
    /* ① 关闭开关 + 全员佩戴，必须与「没人佩戴」逐字节一致 ⇒ 乘数恒为 1、随机流零消耗 */
    const off = battleProjection(withMoment({ enabled: false }, () => run(wearAll(M81))));
    assert(off === plain, 'seed ' + seed + '：enabled=false 时结果与基线不同（关闭开关没能真的关掉）');
    /* ② 一人佩戴必须改变比赛，否则这张卡只是详情页的装饰 */
    if (battleProjection(run(wearOne(M81))) !== plain) onDiff++;
    /* ③ 五人同戴一张 shooter 卡 == 没人戴：等比放大不改变「相对」权重 ⇒ 刷币堆叠换不来数值碾压
     *    （config.arena.shop 裁决 3「时刻卡是打法改变而非数值碾压」的机制层证据） */
    if (battleProjection(run(wearAll(M81))) === plain) allSame++;
  }
  assert(onDiff >= Math.ceil(SEEDS * 0.75), SEEDS + ' 局里只有 ' + onDiff + ' 局被 81 分之夜改变，效果弱到接近装饰');
  assert(allSame === SEEDS, SEEDS + ' 局里有 ' + (SEEDS - allSame) + ' 局被「五人同戴一张卡」改变了 —— 出手权重是相对量，等比放大不该有任何效果');
  return true;
});

check('基线护栏：全新存档下开关时刻卡，18 关 PVE + 12 位天梯的每一场比分逐字节不变', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  const st0 = store.getState();
  assert(selectors.rosterView(st0).momentCount === 0, '全新存档不该有时刻卡');
  const cases = [];
  stages.STAGES.forEach((s) => cases.push({ label: 'pve:' + s.id, away: () => stages.buildAwayTeam(s, 1), mode: undefined }));
  arenaData.LADDER.forEach((o) => cases.push({ label: 'arena:' + o.id, away: () => arenaData.buildAwayTeam(o), mode: 'arena' }));
  assert(cases.length === stages.STAGES.length + arenaData.LADDER.length && cases.length >= 30, '样本量不足：' + cases.length);
  cases.forEach((c) => {
    const run = () => battleProjection(battle.simulate({
      home: selectors.homeTeam(store.getState()), away: c.away(), seed: 'l-base-' + c.label, mode: c.mode
    }));
    const on = run();
    const off = withMoment({ enabled: false }, run);
    /* 这条是「里程碑 2 基线（replay-battle 的 210 项）不会因时刻卡上线而漂」的护栏：
     * 没人佩戴时，开与关必须给出同一份比分事实，否则说明有隐藏状态泄漏进了引擎。 */
    assert(on === off, c.label + '：没人佩戴时开关时刻卡结果不同');
  });
  return true;
});

check('时刻卡不进工资帽、不改 OVR / 稀有度 / 薪资 / 属性面板（config.moment 裁决 3 与 4）', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.autoFillRoster());
  const capOf = (v) => JSON.stringify({
    totalSalary: v.totalSalary, salaryCap: v.salaryCap, salaryLeft: v.salaryLeft,
    overCap: v.overCap, capRatio: v.capRatio, avgOvr: v.avgOvr, starterAvgOvr: v.starterAvgOvr, ready: v.ready
  });
  const cardOf = (v) => JSON.stringify(v.starters.filter(Boolean).map((c) => ({
    uid: c.uid, ovr: c.ovr, rarity: c.rarity, salary: c.salary, attrs: c.attrs, level: c.level, stars: c.stars
  })));
  const v0 = selectors.rosterView(store.getState());
  const uids = v0.starters.filter(Boolean).map((c) => c.uid);
  assert(uids.length === CONFIG.roster.starterCount, '首发不满：' + uids.length);
  const team0 = battle.normalizeTeam(selectors.homeTeam(store.getState()), 'home');
  uids.forEach((uid) => {
    store.dispatch(store.actions.addItem(M81, 1));
    const r = store.equipMoment(uid, M81);
    assert(r.ok, '佩戴失败：' + r.reason);
  });
  const st1 = store.getState();
  const v1 = selectors.rosterView(st1);
  assert(v1.momentCount === CONFIG.roster.starterCount, 'momentCount 应为 ' + CONFIG.roster.starterCount + '，实为 ' + v1.momentCount);
  assert(capOf(v1) === capOf(v0), '佩戴时刻卡改动了工资帽口径：' + capOf(v0) + ' → ' + capOf(v1));
  assert(cardOf(v1) === cardOf(v0), '佩戴时刻卡改动了 OVR / 稀有度 / 薪资 / 属性面板（应只在战斗内触发）');
  const team1 = battle.normalizeTeam(selectors.homeTeam(st1), 'home');
  assert(team1.ovr === team0.ovr && team1.salary === team0.salary, '队伍总评/总薪随佩戴漂移：' + team0.ovr + '→' + team1.ovr);
  assert(team1.momentCount === CONFIG.roster.starterCount && team1.moments.length === CONFIG.roster.starterCount, '战斗侧应看到全部佩戴');
  /* 详情口径：属性面板不因换一张卡而跳动（玩家看到的是「实战触发」而非「面板膨胀」） */
  const mv = selectors.momentView(st1, uids[0]);
  assert(mv.currentId === M81 && mv.current && mv.current.rarity === momentsData.getMoment(M81).rarity, 'momentView 当前佩戴不符');
  assert(/翻倍|×2|\+100%/.test(mv.currentText), 'momentView 文案应体现「翻倍」，实为「' + mv.currentText + '」');
  assert(mv.hint && /工资帽/.test(mv.hint), '必须向玩家说明「不占工资帽」，实为「' + mv.hint + '」');
  return true;
});

check('穿戴闭环：入包 → 佩戴扣 1 → 一份只能一人戴 → 换卡旧卡退回 → 取下退回；失败路径不动存档', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.autoFillRoster());
  const uids = selectors.rosterView(store.getState()).starters.filter(Boolean).map((c) => c.uid);
  const bag = () => selectors.bagView(store.getState());
  const rows = () => selectors.momentCatalog(store.getState());
  assert(bag().momentCount === 0 && bag().moments.length === 0, '全新存档不该有时刻卡');
  assert(rows().total === momentsData.COUNT && rows().got === 0, '图鉴初始态不符：' + rows().progressText);

  store.dispatch(store.actions.addItem(M81, 1));
  /* 时刻卡与道具共用 state.bag，bagView 必须先问 momentsData 再问 itemsData，
   * 否则 getItem() 查不到就 return，卡会被「静默丢掉」：背包里明明有，界面什么都不显示。 */
  assert(bag().momentCount === 1 && bag().moments.length === 1 && bag().moments[0].id === M81, '时刻卡应进 bagView.moments');
  assert(bag().moments[0].effectText && bag().moments[0].effectLines.length, '背包里的时刻卡必须带效果文案');
  assert(bag().equipment.length === 0 && bag().materials.filter((m) => m.id === M81).length === 0, '时刻卡不该混进装备/材料分页');
  assert(rows().got === 1 && rows().rows.filter((r) => r.id === M81)[0].statusText.indexOf('背包') === 0, '图鉴应显示「背包 ×1」');

  const r1 = store.equipMoment(uids[0], M81);
  assert(r1.ok && r1.moment === M81 && r1.name === momentsData.getMoment(M81).name && r1.effectText, '佩戴应返回可读结果：' + r1.reason);
  assert(bag().momentCount === 0, '佩戴后背包应扣 1');
  assert(store.getState().collection[uids[0]].moment === M81, 'collection 里应记下佩戴的卡');
  const mv1 = selectors.momentView(store.getState(), uids[0]);
  assert(mv1.enabled && mv1.currentId === M81 && mv1.current && mv1.currentText, 'momentView 应给出当前佩戴');
  assert(mv1.owned.length === 0 && /竞技商城/.test(mv1.emptyText), '背包空了应指出获取途径，实为「' + mv1.emptyText + '」');
  assert(rows().rows.filter((r) => r.id === M81)[0].wornCount === 1, '图鉴应显示已被谁佩戴');
  assert(selectors.momentView(store.getState(), uids[1]).currentId === '', '别人的槽位不该串卡');

  expectStoreFail('一份只能一人戴', () => store.equipMoment(uids[1], M81), /背包/);
  expectStoreFail('未知球员', () => store.equipMoment('uid-nope', M81), /卡牌不存在/);
  expectStoreFail('不是时刻卡', () => store.equipMoment(uids[1], 'shard'), /时刻卡/);
  expectStoreFail('未知时刻卡', () => store.equipMoment(uids[1], 'm_nope'), /时刻卡/);
  expectStoreFail('空槽取下', () => store.unequipMoment(uids[1]), /没有佩戴/);
  expectStoreFail('取下未知球员', () => store.unequipMoment('uid-nope'), /卡牌不存在/);
  withMoment({ enabled: false }, () => expectStoreFail('开关关闭', () => store.equipMoment(uids[1], M81), /尚未开放/));

  /* 换卡：与装备同语义 —— 新卡扣 1、旧卡退回背包 */
  store.dispatch(store.actions.addItem(M35, 1));
  const r2 = store.equipMoment(uids[0], M35);
  assert(r2.ok, r2.reason);
  assert(store.getState().collection[uids[0]].moment === M35, '换卡后应佩戴新卡');
  /* bagAdd 会把计数归零的键**删掉**（存档不留 0 值垃圾），所以读数一律走 `|| 0` 兜底 */
  const held = (id) => Number(store.getState().bag[id]) || 0;
  assert(held(M81) === 1 && held(M35) === 0, '换卡时旧卡应退回背包、新卡应扣 1，实为 ' + held(M81) + '/' + held(M35));
  assert(selectors.momentView(store.getState(), uids[0]).owned.filter((m) => m.id === M81).length === 1, '退回的旧卡应重新出现在候选里');
  const r3 = store.unequipMoment(uids[0]);
  assert(r3.ok && r3.returned === M35, '取下应返回退掉的卡：' + r3.reason);
  assert(store.getState().collection[uids[0]].moment === '' && held(M35) === 1, '取下后应清空槽位并退回背包');
  expectStoreFail('再取一次', () => store.unequipMoment(uids[0]), /没有佩戴/);
  return true;
});

check('快照复现：佩戴时刻卡后快照带 moment，replaySnapshot 逐字节一致；抹掉 moment 回放必须不同', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.autoFillRoster());
  const uid = selectors.rosterView(store.getState()).starters.filter(Boolean)[0].uid;
  store.dispatch(store.actions.addItem(M81, 1));
  assert(store.equipMoment(uid, M81).ok, '佩戴失败');
  const r = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'l-snap-moment' });
  assert(r.ok, r.reason);
  const snap = store.getState().arena.history[0].snapshot;
  assert(snap.home.filter((h) => h.moment === M81).length === 1, '快照应记录谁戴了哪张卡，实为 ' + JSON.stringify(snap.home.map((h) => h.moment)));
  assert(r.result.home.momentCount === 1 && r.result.home.moments[0].momentId === M81, '结算回显应带时刻卡（面板要渲染）');
  assert(r.result.home.moments[0].effectText, '结算回显必须自带文案');
  const p = store.replaySnapshot(snap);
  assert(p.ok, p.reason);
  /* snapshotOf 存了什么，replaySnapshot 就得原样传回什么。漏 moment = 回放少一份乘数，比分对不上。 */
  assert(JSON.stringify(p.result) === JSON.stringify(r.result), '带时刻卡的快照复现不一致（第十二章可复现红线）');
  const wiped = JSON.parse(JSON.stringify(snap));
  wiped.home.forEach((h) => { h.moment = ''; });
  const pw = store.replaySnapshot(wiped);
  assert(pw.ok && JSON.stringify(pw.result) !== JSON.stringify(r.result), '抹掉快照里的 moment 后回放必须不同（否则卡根本没进复现链路）');
  assert(JSON.stringify(snap).length < 2048, '单条快照过大，20 条历史会顶到小程序单 key 上限：' + JSON.stringify(snap).length);
  return true;
});

check('utils/moment.js 是纯函数模块：源码无随机 / 无系统时间 / 不碰 wx / 不反向依赖 store，文案无 NaN', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils/moment.js'), 'utf8');
  ['Math.random', 'Date.now', 'new Date', 'wx.', "require('../store"].forEach((banned) => {
    assert(src.indexOf(banned) === -1, 'utils/moment.js 含 ' + banned + '（可复现红线：utils 保持纯函数）');
  });
  const m35 = momentsData.getMoment(M35);
  assert(momentUtil.attrMul(m35, 'three', 4) === momentUtil.attrMul(m35, 'three', 4), 'attrMul 不稳定（同输入不同输出）');
  assert(JSON.stringify(momentUtil.effectText(m35)) === JSON.stringify(momentUtil.effectText(m35)), 'effectText 不稳定');
  const before = JSON.stringify(momentsData.MOMENTS);
  momentsData.MOMENTS.forEach((m) => { momentUtil.attrMul(m, 'three', 4); momentUtil.shooterMul(m, 'inside', 2); momentUtil.effectText(m); momentUtil.summaryOf(m); });
  momentUtil.evaluateLineup([{ uid: 'u', name: 'n', moment: M81 }]);
  assert(JSON.stringify(momentsData.MOMENTS) === before, 'moment.js 改动了数据表（数据层必须只读）');
  /* 文案是界面直接渲染的东西：NaN / undefined / 空串都等于「破图或空白」，第三章红线 */
  momentsData.MOMENTS.forEach((m) => {
    const lines = momentUtil.effectText(m);
    assert(lines.length === m.effects.length, m.id + ' 文案条数应与 effects 一致');
    lines.forEach((t) => {
      assert(typeof t === 'string' && t.trim().length > 0, m.id + ' 出现空文案行');
      assert(!/NaN|undefined|null|\{\}/.test(t), m.id + ' 文案异常：' + t);
    });
    assert(momentUtil.summaryOf(m).length > 0, m.id + ' 摘要为空');
  });
  return true;
});

check('节次条件在时间上精确：35 秒奇迹只改末节，前 3 节战报逐条相同（随机流未分叉）', () => {
  const early = (r) => JSON.stringify(r.log.filter((e) => e.q >= 1 && e.q <= 3));
  /* 末节及以后（加时信息条没有 q 字段，用 undefined 一并纳入） */
  const late = (r) => JSON.stringify(r.log.filter((e) => e.q === undefined || e.q >= 4));
  let lateDiff = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const seed = 'l-q-' + i;
    const run = (wear) => battle.simulate({
      home: momentTeam('H', 'perimeter', 'balanced', 80, wear),
      away: momentTeam('A', 'inside', 'inside'), seed: seed
    });
    const plain = run(null);
    const worn = run(wearOne(M35));
    /* 前 3 节乘数恒为 1 ⇒ 消耗同一串随机数 ⇒ 战报必须逐条相同。
     * 这条同时反向锁住「节次条件写反了 / 忘了给 pickShooter 传 quarter」这两种最常见的错。 */
    assert(early(plain) === early(worn), 'seed ' + seed + '：前 3 节战报被末节卡改变了（节次条件失效）');
    if (late(plain) !== late(worn)) lateDiff++;
  }
  assert(lateDiff >= Math.floor(N * 0.5), N + ' 局里只有 ' + lateDiff + ' 局的末节被改变，minQuarter 可能没生效');
  return true;
});

check('引擎实测 == 卡面文案：末节三分 A_eff 提升 20%（±2%），出手占比随 shooter 卡按权重比上移', () => {
  const N = 200;
  const eff = { plain: { sum: 0, n: 0 }, worn: { sum: 0, n: 0 } };
  const share = { plain: { hit: 0, n: 0 }, worn: { hit: 0, n: 0 } };
  for (let i = 0; i < N; i++) {
    const seed = 'l-eff-' + i;
    const plain = battle.simulate({ home: momentTeam('H', 'perimeter', 'balanced'), away: momentTeam('A', 'inside', 'inside'), seed: seed });
    const worn = battle.simulate({ home: momentTeam('H', 'perimeter', 'balanced', 80, wearAll(M35)), away: momentTeam('A', 'inside', 'inside'), seed: seed });
    const shot = battle.simulate({ home: momentTeam('H', 'perimeter', 'balanced', 80, wearOne(M81)), away: momentTeam('A', 'inside', 'inside'), seed: seed });
    plain.log.forEach((e) => { if (e.side === 'home' && e.tactic === 'three' && e.q >= 4) { eff.plain.sum += e.aEff; eff.plain.n++; } });
    worn.log.forEach((e) => { if (e.side === 'home' && e.tactic === 'three' && e.q >= 4) { eff.worn.sum += e.aEff; eff.worn.n++; } });
    plain.log.forEach((e) => { if (e.side === 'home' && e.shooterUid) { share.plain.n++; if (e.shooterUid === 'H0') share.plain.hit++; } });
    shot.log.forEach((e) => { if (e.side === 'home' && e.shooterUid) { share.worn.n++; if (e.shooterUid === 'H0') share.worn.hit++; } });
  }
  assert(eff.plain.n >= 600 && eff.worn.n >= 600, '样本不足，结论不可信：' + eff.plain.n + '/' + eff.worn.n);
  /* 只能做聚合均值对照，不能逐回合对照：A 提高后「aEff >= dEff 直接命中」会少消耗一次 rng.chance，
   * 随机流在首次判罚分歧处就错开了 —— 逐回合比对必然红，而那是引擎的正确行为，不是 bug。 */
  const ratio = (eff.worn.sum / eff.worn.n) / (eff.plain.sum / eff.plain.n);
  near(ratio, 1.2, 0.02, '末节三分 A_eff 实测提升 ' + Math.round((ratio - 1) * 100) + '%，与卡面「+20%」不符');
  /* 等强度合成队 ⇒ 5 人出手权重相同，基线占比 1/5；一人 ×2 后应为 2/(2+4) = 1/3 */
  assert(share.plain.n >= 5000 && share.worn.n >= 5000, '出手样本不足：' + share.plain.n + '/' + share.worn.n);
  const base = share.plain.hit / share.plain.n;
  const worn2 = share.worn.hit / share.worn.n;
  near(base, 1 / CONFIG.roster.starterCount, 0.02, '基线出手占比应接近 1/' + CONFIG.roster.starterCount + '，实为 ' + base.toFixed(4));
  near(worn2, 2 / (2 + CONFIG.roster.starterCount - 1), 0.025, '81 分之夜的出手占比应为 2/(2+4)，实为 ' + worn2.toFixed(4));
  assert(worn2 > base * 1.4, '出手占比没有明显上移（' + base.toFixed(3) + ' → ' + worn2.toFixed(3) + '），「得分权重翻倍」名不副实');
  return true;
});

/* ================= M 竞技商城 / 竞技场解说 / 播放节奏（里程碑 2 收尾） =================
 * 三件事：① 给竞技币一个消费出口（此前只累积不消费，是经济上的死路）；
 *         ② 竞技场专属解说（mode='arena' 只换文案池，不动任何数值）；
 *         ③ 单局回放节奏回到文档要求的 2–3 分钟（此前 1× 只有 37 秒）。
 */
section('M 竞技商城 / 竞技场解说 / 播放节奏');

const SCFG = CONFIG.arena.shop;

check('data/shop.js 完整：id 唯一、ref 可解析、价格/限购/份数合法、每张时刻卡都有售、稀有度与价格同向', () => {
  const bad = [];
  const seen = {};
  const onSale = {};
  const priceByRarity = {};
  const tagKeys = shopData.TAGS.map((t) => t.key);
  assert(shopData.COUNT >= 15, '商城条目过少：' + shopData.COUNT);
  assert(tagKeys.length >= 2, '至少两组商品（时刻卡 + 养成补给），否则打不动天梯的人没有出口');
  shopData.TAGS.forEach((t) => { if (!t.name || !t.desc) bad.push('TAGS.' + t.key + ' 缺名称或说明'); });
  shopData.SHOP.forEach((e) => {
    if (seen[e.id]) bad.push('重复 id ' + e.id);
    seen[e.id] = true;
    if (['moment', 'item'].indexOf(e.kind) === -1) bad.push(e.id + ' kind 非法 ' + e.kind);
    if (tagKeys.indexOf(e.tag) === -1) bad.push(e.id + ' tag 不在 TAGS 里：' + e.tag);
    if (!(Number(e.price) > 0)) bad.push(e.id + ' price 非法 ' + e.price);
    if (!(Number(e.limit) >= 0)) bad.push(e.id + ' limit 非法 ' + e.limit);
    if (!(Number(e.qty) >= 1)) bad.push(e.id + ' qty 非法 ' + e.qty);
    if (!shopData.targetOf(e)) bad.push(e.id + ' ref 解析不到：' + e.kind + '/' + e.ref);
    if (!shopData.nameOf(e)) bad.push(e.id + ' 名称为空（界面会空白，违反第三章）');
    if (e.kind === 'moment') {
      if (!momentsData.isMoment(e.ref)) bad.push(e.id + ' 引用了不存在的时刻卡 ' + e.ref);
      onSale[e.ref] = true;
      const r = shopData.rarityOf(e);
      const p = Number(e.price);
      const b = priceByRarity[r] || (priceByRarity[r] = { min: Infinity, max: -Infinity });
      b.min = Math.min(b.min, p); b.max = Math.max(b.max, p);
      /* SSR/UR 必须限购，否则刷币就能让全队戴上「81 分之夜」（config.arena.shop 裁决 3） */
      if (['SSR', 'UR'].indexOf(r) !== -1 && !(Number(e.limit) >= 1)) bad.push(e.id + '（' + r + '）必须限购');
    } else if (!items.getItem(e.ref)) {
      bad.push(e.id + ' 引用了不存在的道具 ' + e.ref);
    }
  });
  /* 时刻卡的唯一获取途径就是这里，漏上架 = 玩家永远拿不到 = 系统等于没做 */
  const missing = momentsData.MOMENTS.filter((m) => !onSale[m.id]).map((m) => m.id);
  assert(missing.length === 0, '这些时刻卡没有获取途径：' + missing.join(','));
  const order = CONFIG.rarity.order.filter((r) => priceByRarity[r]);
  assert(order.length >= 4, '在售时刻卡的稀有度档位过少：' + order.join(','));
  for (let i = 1; i < order.length; i++) {
    assert(priceByRarity[order[i]].min >= priceByRarity[order[i - 1]].max, order[i] + ' 的定价与 ' + order[i - 1] + ' 倒挂（稀有度在商城里会失去意义）');
  }
  assert(shopData.getEntry('nope') === null && shopData.getEntry(shopData.SHOP[0].id) === shopData.SHOP[0], 'getEntry 边界不符');
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  return true;
});

check('竞技商城失败路径：开关关闭 / 限购兑满 / 余额不足 / 条目不存在，一律 ok:false、reason 可读、不动存档', () => {
  const cheap = shopData.SHOP.filter((e) => e.kind === 'item')[0];
  const limited = shopData.SHOP.filter((e) => Number(e.limit) > 0)[0];
  store.init({ fresh: true, force: true, now: 1000 });
  expectStoreFail('条目不存在', () => store.buyArenaItem('sh_nope'), /不存在/);
  expectStoreFail('缺参数', () => store.buyArenaItem(), /不存在/);
  expectStoreFail('余额不足', () => store.buyArenaItem(cheap.id), /不足/);

  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.addCurrency({ arenaCoin: 999999 }));
  const full = JSON.parse(JSON.stringify(store.getState()));
  full.arena.shopBought[limited.id] = Number(limited.limit);
  store.dispatch(store.actions.hydrate(full));
  expectStoreFail('限购兑满', () => store.buyArenaItem(limited.id), /兑满|限购/);
  const soldRow = selectors.shopView(store.getState()).groups.reduce((a, g) => a.concat(g.rows), []).filter((r) => r.id === limited.id)[0];
  assert(soldRow && soldRow.soldOut && !soldRow.canBuy && /兑满/.test(soldRow.buyText), '视图应标出「已兑满」，实为「' + (soldRow && soldRow.buyText) + '」');

  const savedShop = SCFG.enabled;
  const savedArena = AC.enabled;
  try {
    SCFG.enabled = false;
    assert(selectors.shopView(store.getState()).enabled === false, 'shopView.enabled 应随商城开关关闭');
    assert(/未开放/.test(selectors.shopView(store.getState()).note), '关闭态必须给可读说明，不能空白');
    expectStoreFail('商城未开放', () => store.buyArenaItem(cheap.id), /未开放/);
    SCFG.enabled = true;
    AC.enabled = false;
    assert(selectors.shopView(store.getState()).enabled === false, '竞技场总开关关掉时商城也该关');
    expectStoreFail('竞技场未开放', () => store.buyArenaItem(cheap.id), /未开放/);
  } finally { SCFG.enabled = savedShop; AC.enabled = savedArena; }
  assert(SCFG.enabled === true && AC.enabled === true, '开关未还原（会污染后面所有断言）');
  return true;
});

check('购买成功：扣币精确、商品按 qty 入包、shopBought 累加、限购随即生效、推一条通知', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.addCurrency({ arenaCoin: 5000 }));
  const e81 = shopData.SHOP.filter((e) => e.ref === M81)[0];
  assert(e81, '81 分之夜必须上架（文档点名的卡拿不到 = 系统没做完）');
  const r = store.buyArenaItem(e81.id);
  assert(r.ok, r.reason);
  const st = store.getState();
  assert(st.profile.arenaCoin === 5000 - e81.price, '扣币不精确：' + st.profile.arenaCoin);
  assert(r.cost === e81.price && r.coinBefore === 5000 && r.coinAfter === 5000 - e81.price, '返回值与实际扣币不同源（页面会显示错的余额）');
  assert(Number(st.bag[M81]) === Math.max(1, Number(e81.qty)), '时刻卡应按 qty 入包');
  assert(st.arena.shopBought[e81.id] === 1, 'shopBought 应累加');
  assert(selectors.bagView(st).moments.filter((m) => m.id === M81).length === 1, '买到的时刻卡应出现在背包分页');
  assert(JSON.stringify(st.notices).indexOf(shopData.nameOf(e81)) !== -1, '应推一条兑换通知');
  if (Number(e81.limit) === 1) {
    expectStoreFail('限购 1 件再买', () => store.buyArenaItem(e81.id), /兑满|限购/);
    assert(Number(store.getState().bag[M81]) === 1, '被拦下的购买不该发货');
  }
  /* 补给类：qty > 1 必须一次到账，limit = 0 必须能重复买 */
  const bulk = shopData.SHOP.filter((e) => e.kind === 'item' && Number(e.qty) > 1)[0];
  assert(bulk, '应有一件 qty>1 的补给');
  const had = Number(store.getState().bag[bulk.ref]) || 0;
  const rb = store.buyArenaItem(bulk.id);
  assert(rb.ok, rb.reason);
  assert(Number(store.getState().bag[bulk.ref]) === had + bulk.qty, 'qty 未一次到账');
  const rb2 = store.buyArenaItem(bulk.id);
  assert(rb2.ok, '不限购的商品应能重复兑换：' + rb2.reason);
  assert(store.getState().arena.shopBought[bulk.id] === 2, '重复购买的计数应累加');
  return true;
});

check('视图与命令同口径：每个条目 × 三档余额，shopView.canBuy 必须等于 buyArenaItem().ok', () => {
  /* 这条是防「按钮亮着但点了没反应」的核心交叉校验：
   * 视图（selectors.shopView）与命令（commands.buyArenaItem）各判一次同样的三道闸，
   * 口径一旦分叉，玩家在真机上只会看到「点了没反应」，日志里什么都没有。 */
  const all = (st) => selectors.shopView(st).groups.reduce((a, g) => a.concat(g.rows), []);
  shopData.SHOP.forEach((e) => {
    [0, Number(e.price), Number(e.price) * 3].forEach((coin) => {
      store.init({ fresh: true, force: true, now: 1000 });
      if (coin > 0) store.dispatch(store.actions.addCurrency({ arenaCoin: coin }));
      const row = all(store.getState()).filter((r) => r.id === e.id)[0];
      assert(row, 'shopView 里找不到 ' + e.id);
      const res = store.buyArenaItem(e.id);
      assert(!!res.ok === !!row.canBuy, e.id + ' 余额 ' + coin + '：视图 canBuy=' + row.canBuy + '，命令 ok=' + !!res.ok + '（' + (res.reason || '') + '）');
      assert(row.buyDisabled === !row.canBuy, e.id + '：buyDisabled 与 canBuy 不同源');
      assert(typeof row.buyText === 'string' && row.buyText.length > 0, e.id + '：buyText 为空（按钮会空白）');
      assert(row.priceText.indexOf(String(row.price)) === 0, e.id + '：priceText 与 price 不同源');
      assert(row.name && row.limitText, e.id + '：名称或限购文案为空');
      if (row.canBuy) assert(res.coinBefore === coin && res.coinAfter === coin - row.price, e.id + '：扣币与视图价格不一致');
    });
  });
  return true;
});

check('消费出口闭环：天梯产出的竞技币真的能花掉，且最贵的一件仍在文档的经济曲线内', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  assert(store.getState().profile.arenaCoin === 0, '全新存档竞技币应为 0');
  const r = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'm-coin-1' });
  assert(r.ok, r.reason);
  const coin1 = store.getState().profile.arenaCoin;
  const expect = r.result.result === 'win' ? AC.coinPerWin : AC.coinPerLose;
  assert(coin1 === expect, '产出与 config.arena 不同源：' + coin1 + ' vs ' + expect);
  const perDay = AC.dailyChallenges * AC.coinPerWin;
  const cheapest = shopData.SHOP.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  const dearest = shopData.SHOP.reduce((a, b) => (Number(b.price) > Number(a.price) ? b : a));
  /* 出口不能是画出来的饼：最便宜的一件应在 2 个满收入日内可及，最贵的一件不超过第九章的 30 天量级 */
  assert(cheapest.price / perDay <= 2, '最便宜的商品要 ' + (cheapest.price / perDay).toFixed(1) + ' 个满收入日，出口太远');
  assert(dearest.price / perDay <= 40, '最贵的商品要 ' + (dearest.price / perDay).toFixed(1) + ' 个满收入日，与第九章「30 天量级」曲线脱节');
  /* 单场产出（20 币）当然买不起 60 币的金币袋 —— 这里按「满收入日」把币补齐，验证的是出口本身通不通：
   * 竞技币必须真的能减少（「只累积不消费」正是本次要修的缺陷）。 */
  const daysToCheapest = Math.ceil(cheapest.price / perDay);
  store.dispatch(store.actions.addCurrency({ arenaCoin: perDay * daysToCheapest }));
  const before = store.getState().profile.arenaCoin;
  assert(before >= cheapest.price, '补齐 ' + daysToCheapest + ' 个满收入日后仍买不起最便宜的商品');
  const rb = store.buyArenaItem(cheapest.id);
  assert(rb.ok, '最便宜的商品应买得起：' + rb.reason);
  assert(store.getState().profile.arenaCoin === before - cheapest.price, '竞技币没有真的被花掉');
  assert((Number(store.getState().bag[cheapest.ref]) || 0) >= cheapest.qty, '买到的补给应进背包');
  return true;
});

check('存档往返：shopBought / 竞技币 / 背包落盘读回一致，读回后限购仍生效，老存档能迁移出 shopBought', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.addCurrency({ arenaCoin: 5000 }));
  const e = shopData.SHOP.filter((x) => x.ref === M81)[0];
  assert(store.buyArenaItem(e.id).ok, '购买失败');
  store.flush();
  const st0 = store.getState();
  const want = JSON.stringify({ coin: st0.profile.arenaCoin, bought: st0.arena.shopBought, bag: st0.bag });
  store.init({ force: true, now: 1000 });   // 不带 fresh ⇒ 走 storage 读档 + migrate
  const st1 = store.getState();
  assert(JSON.stringify({ coin: st1.profile.arenaCoin, bought: st1.arena.shopBought, bag: st1.bag }) === want, '落盘读回不一致');
  assert(store.buyArenaItem(e.id).ok === false, '读回后限购失效了（玩家能反复兑换同一张 UR 卡）');
  /* 老存档没有 shopBought 段：migrate 必须补出空对象，否则视图会在 undefined 上取值 */
  const legacy = JSON.parse(JSON.stringify(st1));
  delete legacy.arena.shopBought;
  const mig = store.migrate(legacy);
  assert(mig.arena.shopBought && typeof mig.arena.shopBought === 'object', 'migrate 应补出 arena.shopBought');
  const broken = JSON.parse(JSON.stringify(st1));
  broken.arena.shopBought = 'nope';
  assert(typeof store.migrate(broken).arena.shopBought === 'object', 'migrate 应把脏 shopBought 归一成对象');
  return true;
});

check('竞技商城不污染其它系统：买东西不动赛季 / 执教战绩 / 天梯积分与次数 / 体力 / 金币钻石', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.addCurrency({ arenaCoin: 99999 }));
  const st0 = store.getState();
  const pick = (s) => JSON.stringify({
    season: s.season, stats: s.stats, rating: s.arena.rating, matches: s.arena.matches,
    usedToday: s.arena.usedToday, beaten: s.arena.beaten, history: s.arena.history,
    stamina: s.profile.stamina, gold: s.profile.gold, diamond: s.profile.diamond, level: s.profile.level, exp: s.profile.exp
  });
  const e = shopData.SHOP.filter((x) => x.kind === 'moment')[0];
  assert(store.buyArenaItem(e.id).ok, '购买失败');
  const st1 = store.getState();
  assert(pick(st1) === pick(st0), '竞技商城动到了别的系统（只该扣竞技币 + 发货 + 记限购 + 推通知）');
  assert(st1.profile.arenaCoin === st0.profile.arenaCoin - e.price, '只有竞技币该变');
  return true;
});

check('竞技场专属解说就位：总数 ≥50（文档第七章）、专属 ≥20、ARENA_MIX 全部可解析、合并池是「基础 + 专属」', () => {
  assert(commentary.countAll() >= 50, '解说模板总数不足 50：' + commentary.countAll());
  assert(commentary.countArena() >= 20, '竞技场专属解说不足 20：' + commentary.countArena());
  const types = Object.keys(commentary.ARENA_MIX);
  assert(types.length >= 8, '竞技场解说类型过少：' + types.length);
  const bad = [];
  types.forEach((t) => {
    if (!Array.isArray(commentary.COMMENTARY[t]) || !commentary.COMMENTARY[t].length) bad.push('基础类型缺失 ' + t);
    const list = commentary.COMMENTARY[commentary.ARENA_MIX[t]];
    if (!Array.isArray(list) || !list.length) bad.push(commentary.ARENA_MIX[t] + ' 不存在或为空');
  });
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  /* 合并候选池，不是替换：否则 PVE 那套文案会在竞技场里全部消失 */
  types.forEach((t) => {
    const base = commentary.poolOf(t);
    const merged = commentary.poolOf(t, 'arena');
    const extra = commentary.COMMENTARY[commentary.ARENA_MIX[t]];
    assert(merged.length === base.length + extra.length, t + ' 的合并池长度不对：' + merged.length + ' != ' + base.length + '+' + extra.length);
    assert(merged.slice(0, base.length).every((x, i) => x === base[i]), t + ' 的合并池应把基础池原样放在前面');
    assert(commentary.poolOf(t, 'arena') === merged, 'poolOf 应命中缓存（一局 96 回合会反复取同一类型）');
    assert(commentary.poolOf(t) === base && commentary.poolOf(t, 'pve') === base && commentary.poolOf(t, undefined) === base, '非 arena 模式必须拿基础池（老调用方行为不能变）');
  });
  /* 没有专属池的类型（rebound / quarterEnd / ot …）在 arena 模式下必须安全退回基础池，不能返回 undefined */
  Object.keys(commentary.COMMENTARY).forEach((k) => {
    if (commentary.ARENA_MIX[k]) return;
    assert(commentary.poolOf(k, 'arena') === commentary.poolOf(k), k + ' 没有专属池时应原样退回基础池');
  });
  return true;
});

check('mode 只换文案不换数值：同 seed 下 arena 与 pve 的比分 / 净胜 / 加时 / 数据完全一致，战报文字不同', () => {
  /* 合并候选池不改变 pick() 的随机数消耗次数（每次仍是 1 个），所以整条随机流不动。
   * 若有人把这里改成「先 rng.chance() 决定要不要用竞技场文案」，本条会立刻红 —— 那会多消耗一个随机数，
   * 把之后每一回合的掷骰全部推移，PVE 与竞技场的基线一起报废（第十二章可复现红线）。 */
  const nums = (r) => JSON.stringify({ h: r.homeScore, a: r.awayScore, m: r.margin, res: r.result, ot: r.ot, rounds: r.rounds, stars: r.stars, quarters: r.quarters, stats: r.stats, mvp: r.mvp });
  const facts = (r) => JSON.stringify(r.log.map((e) => ({ i: e.i, q: e.q, phase: e.phase, side: e.side, tactic: e.tactic, shooterUid: e.shooterUid, defenderUid: e.defenderUid, made: e.made, aEff: e.aEff, dEff: e.dEff, hitP: e.hitP, home: e.home, away: e.away })));
  let textDiff = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const seed = 'm-mode-' + i;
    const mk = (mode) => battle.simulate({ home: synthTeam('H', 'perimeter', 'balanced'), away: synthTeam('A', 'inside', 'inside'), seed: seed, mode: mode });
    const pve = mk(undefined);
    const arena = mk('arena');
    assert(pve.mode === 'pve' && arena.mode === 'arena', 'result 应回带 mode（页面据此切结算文案）');
    assert(nums(pve) === nums(arena), 'seed ' + seed + '：mode 改变了数值（专属解说必须只是文案池）');
    assert(facts(pve) === facts(arena), 'seed ' + seed + '：回合事实不一致');
    if (JSON.stringify(pve.log.map((e) => e.text)) !== JSON.stringify(arena.log.map((e) => e.text))) textDiff++;
  }
  assert(textDiff === N, N + ' 局里只有 ' + textDiff + ' 局的文案变了（竞技场专属解说可能没接上）');
  return true;
});

check('解说占位符纪律：全部 {xxx} 都在白名单里、没有「第第1节节」这类双重包裹（含反向对照）', () => {
  const ALLOW = ['player', 'defender', 'team', 'defTeam', 'pts', 'tactic', 'defense', 'q', 'margin', 'score'];
  /* 抽成本地函数做正反两用：先扫真数据必须干净，再故意塞一条坏模板必须被抓出来 —— 否则这条断言只是摆设 */
  const scan = (lists) => {
    const bad = [];
    Object.keys(lists).forEach((k) => {
      (lists[k] || []).forEach((tpl, i) => {
        const tag = k + '[' + i + ']';
        const s = String(tpl);
        if (!tpl || !s.trim()) { bad.push(tag + ' 空模板'); return; }
        (s.match(/\{(\w+)\}/g) || []).forEach((ph) => {
          if (ALLOW.indexOf(ph.slice(1, -1)) === -1) bad.push(tag + ' 未知占位符 ' + ph + '（battle 不传这个变量，会原样渲染到界面上）');
        });
        /* {q} 传的已经是「第X节」/「加时1」，再包一层就成了「第第1节节」（AGENTS.md §9 踩过的坑） */
        if (/第\s*\{q\}/.test(s) || /\{q\}\s*节/.test(s)) bad.push(tag + ' 双重包裹节次：' + s);
      });
    });
    return bad;
  };
  const bad = scan(commentary.COMMENTARY);
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  const arenaKey = commentary.ARENA_MIX[Object.keys(commentary.ARENA_MIX)[0]];
  const list = commentary.COMMENTARY[arenaKey];
  const saved = list.length;
  list.push('{nope} 第{q}节出手');
  const caught = scan(commentary.COMMENTARY);
  list.length = saved;
  assert(caught.length >= 2, '坏模板没被抓出来（扫描是摆设）：' + caught.join(' | '));
  assert(list.length === saved && scan(commentary.COMMENTARY).length === 0, '反向对照后未还原数据表');
  /* fill 的兜底：变量缺失时原样保留占位符，绝不渲染出 undefined */
  assert(commentary.fill('{player} 命中 {nope}', { player: 'A' }) === 'A 命中 {nope}', 'fill 兜底不符');
  assert(commentary.fill('{player}', { player: '' }) === '{player}', '空值应保留占位符而不是渲染成空白');
  assert(commentary.fill('', { player: 'A' }) === '' && commentary.fill(null, {}) === '', 'fill 对空模板应返回空串');
  return true;
});

check('合规：全部解说模板不声称数据来自 NBA 官方 / 2K 等商业数据源（第三章最高优先级）', () => {
  const BANNED = ['NBA官方', 'NBA 官方', '官方数据', '官方授权', '正版授权', '2K', 'RealGM'];
  const bad = [];
  Object.keys(commentary.COMMENTARY).forEach((k) => (commentary.COMMENTARY[k] || []).forEach((tpl, i) => {
    BANNED.forEach((w) => { if (String(tpl).indexOf(w) !== -1) bad.push(k + '[' + i + '] 含「' + w + '」'); });
  }));
  assert(bad.length === 0, bad.slice(0, 4).join(' | '));
  return true;
});

check('播放节奏：1× 单局落在文档 2–3 分钟区间，倍速单调，节奏常量只在 config.js（页面不硬编码）', () => {
  const pb = CONFIG.battle.playback;
  assert(pb && Number(pb.baseMs) > 0 && Number(pb.infoMs) > 0, 'config.battle.playback 缺失或非法');
  assert(Number(pb.animMs) >= 24 && Number(pb.animFrames) >= 4 && Number(pb.animFrames) <= 16, 'config.battle.playback.animMs / animFrames 缺失或非法（演出帧距 / 帧数）');
  /* 口径与 pages/match/match.js 一致：一局 = 96 条回合战报 + 9 条信息条（4×quarterStart/quarterEnd + finished） */
  const rounds = CONFIG.battle.roundsPerQuarter * CONFIG.battle.quarters * 2;
  const infos = CONFIG.battle.quarters * 2 + 1;
  assert(rounds === 96 && infos === 9, '回合/信息条口径变了（' + rounds + '/' + infos + '），下面的时长断言要跟着重算');
  const secs = (s) => (rounds * pb.baseMs + infos * pb.infoMs) / (Number(s) || 1) / 1000;
  const one = secs(1);
  assert(one >= 120 && one <= 180, '1× 单局 ' + one.toFixed(1) + ' 秒，未落在文档要求的 2–3 分钟区间');
  assert(Array.isArray(pb.speeds) && pb.speeds.length >= 2 && Number(pb.speeds[0]) === 1, 'speeds 应以 1× 开头且至少两档');
  for (let i = 1; i < pb.speeds.length; i++) assert(pb.speeds[i] > pb.speeds[i - 1], 'speeds 必须单调递增');
  const fastest = secs(pb.speeds[pb.speeds.length - 1]);
  assert(fastest < 60, '最快倍速 ' + fastest.toFixed(1) + ' 秒，应给急性子玩家留一个 1 分钟内的出口');
  const src = fs.readFileSync(path.join(ROOT, 'pages/match/match.js'), 'utf8');
  assert(src.indexOf('CONFIG.battle.playback') !== -1, '比赛页应读 config.battle.playback');
  assert(!/const BASE_MS = \d/.test(src) && !/const INFO_MS = \d/.test(src), '比赛页硬编码了播放节奏（AGENTS.md §3：数值只允许改 config.js）');
  assert(src.indexOf('paceText') !== -1, '比赛页应给出时长提示（玩家得知道 1× 有多长）');
  assert(src.indexOf('PLAYBACK.animMs') !== -1 && src.indexOf('PLAYBACK.animFrames') !== -1, '比赛页应把演出帧参数读自 config.battle.playback（不硬编码 95ms / 8 帧）');
  return true;
});

check('开关互不牵连：关掉时刻卡不影响取回已佩戴的卡，关掉商城不影响时刻卡效果', () => {
  store.init({ fresh: true, force: true, now: 1000 });
  store.dispatch(store.actions.autoFillRoster());
  const uid = selectors.rosterView(store.getState()).starters.filter(Boolean)[0].uid;
  store.dispatch(store.actions.addItem(M81, 1));
  assert(store.equipMoment(uid, M81).ok, '佩戴失败');
  const savedM = MC.enabled;
  const savedS = SCFG.enabled;
  try {
    MC.enabled = false;
    const mv = selectors.momentView(store.getState(), uid);
    assert(mv.enabled === false && /未开启/.test(mv.currentText), '关闭态必须给可读文案，不能空白：' + mv.currentText);
    assert(selectors.momentCatalog(store.getState()).enabled === false, 'momentCatalog 应反映开关');
    /* reducer 刻意不判 enabled：关闭开关只让效果失效，不该把玩家的卡锁死在身上取不下来 */
    const back = store.unequipMoment(uid);
    assert(back.ok && Number(store.getState().bag[M81]) === 1, '关掉开关后卡必须还能取下来');
    assert(selectors.shopView(store.getState()).enabled === true, '时刻卡开关不该顺手关掉竞技商城');
    SCFG.enabled = false;
    assert(selectors.shopView(store.getState()).enabled === false && selectors.shopView(store.getState()).note, '商城关闭态应给可读说明');
    expectStoreFail('商城关闭', () => store.buyArenaItem(shopData.SHOP[0].id), /未开放/);
  } finally { MC.enabled = savedM; SCFG.enabled = savedS; }
  assert(MC.enabled === true && SCFG.enabled === true, '开关未还原');
  assert(selectors.shopView(store.getState()).enabled === true, '还原后商城应重新可用');
  return true;
});

/* ================= N 时空进化（第八章「创新玩法」，里程碑 3） =================
 * 时空进化 = 分解非巅峰版本卡 → 巅峰碎片（按球员隔离）→ 合成巅峰传奇版；
 * 「新秀版 + 现役版」成套献祭是文档点名的招牌动作。本组锁六件事：
 *   ① 数值口径（碎片换算沿用地基表、每个有巅峰版的球员都有价格、不是人人可进化）；
 *   ② 三条路径的成功/失败口径（失败一律 ok:false + 可读 reason + 存档逐字节不动）；
 *   ③ reducer 作为最后一道闸 —— 绕过命令层直接 dispatch 非法 payload 也不许动存档；
 *   ④ 纪律：分解价值按**出厂稀有度**（养满再拆不套利）、碎片按球员隔离、不动战斗与工资帽；
 *   ⑤ 存档往返与老档迁移（无 evolution 段补空壳、脏形状归一）；
 *   ⑥ 详情页面板字段与 store 同源，且三条交互能从页面真实驱动到 store。
 */
section('N 时空进化（分解 / 成套献祭 / 合成 / 页面驱动）');

const EC = CONFIG.evolution;

/* 取当前存档里第一张指定卡的 uid（找不到 → ''） */
function nUid(cardId) {
  const c = store.getState().collection;
  const u = Object.keys(c).find((k) => c[k].cardId === cardId);
  return u || '';
}
/* 造一场「手里有这些卡」的干净存档（force 复位，见 AGENTS §9 坑 1） */
function nSeed(cardIds) {
  store.init({ fresh: true, force: true, now: 1000 });
  if (cardIds && cardIds.length) store.dispatch(store.actions.addCards(cardIds, 'verify-n', 2000));
}
/* 临时改 config.evolution 跑一段（与 withMoment 同构；verify 是单进程顺序执行，脏配置会污染后面所有断言） */
function withEvolution(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = EC[k]; EC[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { EC[k] = saved[k]; }); }
}
const N_UI = { modals: [] };
global.wx.showModal = function (o) { N_UI.modals.push(o); if (o && o.success) o.success({ confirm: true }); };

check('数值口径：碎片换算覆盖全部档位、有巅峰版的球员都有价格、文班亚马（无巅峰版）不可进化', () => {
  CONFIG.rarity.order.forEach((r) => {
    const v = CONFIG.growth.dupToShard[r];
    assert(typeof v === 'number' && v > 0, 'dupToShard 缺档位 ' + r);
  });
  const evolvableNames = [];
  const notEvolvable = [];
  const seen = {};
  players.CARDS.forEach((c) => {
    if (seen[c.playerId]) return;
    seen[c.playerId] = true;
    (evoUtil.evolvable(players.cardsOfPlayer(c.playerId)) ? evolvableNames : notEvolvable).push(c.name);
  });
  /* 文档第十三章点名的双版本 5 人 + 新秀/巅峰组合的乔丹、科比，都必须能算出正数价格 */
  ['詹姆斯', '库里', '杜兰特', '哈登', '威少', '乔丹', '科比'].forEach((n) => {
    assert(evolvableNames.indexOf(n) !== -1, n + ' 不可进化');
  });
  /* 反向对照：文班亚马只有新秀 + 现役、没有巅峰版 ⇒ 不该进可进化名单（防「人人可进化」的空跑） */
  assert(notEvolvable.indexOf('文班亚马') !== -1, '文班亚马不该可进化');
  assert(evoUtil.peakCardOf(players.cardsOfPlayer('wembanyama_victor')) === null, '文班亚马不该有巅峰版');
  assert(evoUtil.peakCostOf(null) === null && evoUtil.peakCostOf({ rarity: 'NOPE' }) === null, '未登记档位应返回 null');
  assert(EC.pairMul > 1, 'pairMul 必须 > 1（成套献祭要比分开分解划算）');
  return true;
});

check('utils/evolution.js 是纯函数模块：按出厂稀有度计值、pairValue 公式、无随机无系统时间', () => {
  near(evoUtil.salvageValue(players.getCard('james_lebron_rookie')), 8, 1e-9, 'SR 新秀应值 8');
  near(evoUtil.salvageValue(players.getCard('james_lebron_active')), 16, 1e-9, 'SSR 现役应值 16');
  near(evoUtil.pairValue(players.getCard('james_lebron_rookie'), players.getCard('james_lebron_active')), 36, 1e-9, '詹姆斯成套应 36');
  near(evoUtil.pairValue(players.getCard('curry_stephen_rookie'), players.getCard('curry_stephen_active')), 30, 1e-9, '库里成套应 30');
  near(evoUtil.progressPct(30, 40), 75, 1e-9);
  near(evoUtil.progressPct(99, 40), 100, 1e-9, '进度条应封顶 100');
  near(evoUtil.progressPct(-3, 40), 0, 1e-9, '进度条应为 0 兜底');
  const src = fs.readFileSync(path.join(ROOT, 'utils/evolution.js'), 'utf8');
  assert(!/Math\.random[ \t]*\(/.test(src), 'evolution.js 不得有 Math.random');
  assert(!/Date\.now[ \t]*\(/.test(src), 'evolution.js 不得取系统时间');
  assert(src.indexOf("require('../store") === -1 && src.indexOf('/store/') === -1, 'evolution.js 不得反向依赖 store');
  return true;
});

check('分解版本卡：卡从收藏移除、该球员碎片 +8、通知与返回值口径正确、其它球员不受影响', () => {
  nSeed(['james_lebron_rookie']);
  const uid = nUid('james_lebron_rookie');
  const before = Object.keys(store.getState().collection).length;
  const r = store.salvageCard(uid);
  assert(r.ok && r.gain === 8 && r.playerId === 'james_lebron' && r.version === '新秀版', JSON.stringify(r));
  const st = store.getState();
  assert(!st.collection[uid], '卡没被移除');
  assert(Object.keys(st.collection).length === before - 1, '收藏数量没减');
  assert(Number(st.evolution.shards.james_lebron) === 8, 'shards=' + st.evolution.shards.james_lebron);
  assert(st.notices[0] && st.notices[0].kind === 'evolution' && st.notices[0].text.indexOf('巅峰碎片 +8') !== -1,
    '通知口径不符：' + JSON.stringify(st.notices[0]));
  assert((Number(st.evolution.shards.curry_stephen) || 0) === 0, '碎片按球员隔离，不该串味');
  return true;
});

check('分解失败路径 ×6：不存在 / 阵容中 / 巅峰卡 / 不可进化 / 已拥有巅峰版 —— 一律不动存档', () => {
  nSeed(['james_lebron_rookie', 'james_lebron_rookie', 'james_lebron_peak', 'wembanyama_victor_rookie']);
  const rookies = Object.keys(store.getState().collection).filter((u) => store.getState().collection[u].cardId === 'james_lebron_rookie');
  const peakUid = nUid('james_lebron_peak');
  const wembyUid = nUid('wembanyama_victor_rookie');
  assert(store.assignSlot('bench', 0, rookies[0]).ok, '编入替补失败');
  expectStoreFail('分解·阵容中', () => store.salvageCard(rookies[0]), /阵容/);
  expectStoreFail('分解·巅峰卡', () => store.salvageCard(peakUid), /不能分解/);
  expectStoreFail('分解·不可进化球员', () => store.salvageCard(wembyUid), /暂无巅峰传奇版/);
  expectStoreFail('分解·已拥有巅峰版', () => store.salvageCard(rookies[1]), /已拥有/);
  expectStoreFail('分解·幽灵 uid', () => store.salvageCard('c99999'), /不存在/);
  /* 反向对照：同一张卡「没在阵容 + 没拥有巅峰版」时是能分解的（上面五条不是空跑） */
  assert(store.salvageCard(rookies[1]).ok === false, '已拥有巅峰版时仍可分解');
  return true;
});

check('成套献祭（新秀 + 现役）：两张材料消失、碎片 +36；价值严格大于分开分解', () => {
  nSeed(['james_lebron_rookie', 'james_lebron_active']);
  const rUid = nUid('james_lebron_rookie');
  const aUid = nUid('james_lebron_active');
  const r = store.evolvePair('james_lebron');
  assert(r.ok && r.gain === 36, JSON.stringify(r));
  assert(r.rookieUid === rUid && r.activeUid === aUid, '材料选择不符：' + JSON.stringify(r));
  const st = store.getState();
  assert(!st.collection[rUid] && !st.collection[aUid], '材料没被消耗');
  assert(Number(st.evolution.shards.james_lebron) === 36, 'shards=' + st.evolution.shards.james_lebron);
  /* 配置层面：所有「新秀 + 现役」双全的球员，成套价值必须严格大于分开分解（裁决 6） */
  let pairs = 0;
  const seen = {};
  players.CARDS.forEach((c) => {
    if (seen[c.playerId]) return;
    seen[c.playerId] = true;
    const defs = players.cardsOfPlayer(c.playerId);
    const rookie = evoUtil.versionCardOf(defs, evoUtil.VERSION_ROOKIE);
    const active = evoUtil.versionCardOf(defs, evoUtil.VERSION_ACTIVE);
    if (!rookie || !active || !evoUtil.evolvable(defs)) return;
    pairs++;
    const pairGain = evoUtil.pairValue(rookie, active);
    const apart = evoUtil.salvageValue(rookie) + evoUtil.salvageValue(active);
    assert(pairGain > apart, c.name + ' 成套(' + pairGain + ') 未大于分开(' + apart + ')');
  });
  assert(pairs >= 2, '能成套的球员少于 2 人，断言会变成空跑');
  return true;
});

check('献祭失败路径：缺现役版 / 缺新秀版 / 材料在阵容中 —— 拒绝且存档逐字节不变', () => {
  nSeed(['james_lebron_rookie']);
  expectStoreFail('献祭·缺现役版', () => store.evolvePair('james_lebron'), /缺少/);
  store.dispatch(store.actions.addCards(['james_lebron_active'], 'verify-n', 3000));
  const aUid = nUid('james_lebron_active');
  assert(store.assignSlot('starters', 2, aUid).ok, '编入首发失败');
  expectStoreFail('献祭·现役在阵容', () => store.evolvePair('james_lebron'), /阵容/);
  store.dispatch(store.actions.addCards(['durant_kevin_active'], 'verify-n', 3000));
  expectStoreFail('献祭·缺新秀版（杜兰特）', () => store.evolvePair('durant_kevin'), /缺少/);
  expectStoreFail('献祭·不可进化球员', () => store.evolvePair('wembanyama_victor'), /巅峰/);
  return true;
});

check('合成巅峰卡：碎片不足拒绝 → 够则扣碎片 + 发一张出厂实例 → 已拥有拒绝', () => {
  nSeed(['james_lebron_rookie', 'james_lebron_active']);
  expectStoreFail('合成·碎片不足', () => store.synthPeak('james_lebron'), /碎片不足/);
  assert(store.evolvePair('james_lebron').ok, '献祭失败');
  assert(Number(store.getState().evolution.shards.james_lebron) === 36, '应 36');
  expectStoreFail('合成·还差 4', () => store.synthPeak('james_lebron'), /碎片不足/);
  /* 补一张新秀再分解（+8 → 44）：这是「献祭后还差一点、再攒一张重复卡」的真实路径 */
  store.dispatch(store.actions.addCards(['james_lebron_rookie'], 'verify-n', 3000));
  assert(store.salvageCard(nUid('james_lebron_rookie')).ok, '补的一张分解失败');
  assert(Number(store.getState().evolution.shards.james_lebron) === 44, '应 44');
  const before = Object.keys(store.getState().collection).length;
  const r = store.synthPeak('james_lebron');
  assert(r.ok && r.cost === 40 && r.cardId === 'james_lebron_peak', JSON.stringify(r));
  const st = store.getState();
  assert(Object.keys(st.collection).length === before + 1, '没有发出巅峰卡');
  const peakUids = Object.keys(st.collection).filter((u) => st.collection[u].cardId === 'james_lebron_peak');
  const inst = st.collection[peakUids[0]];
  assert(inst.level === 1 && inst.stars === 1 && inst.breakthrough === 0, '新卡应是 Lv.1 / 1★ / +0');
  assert(inst.source === 'evolution' && typeof inst.obtainedAt === 'number' && inst.obtainedAt > 0, '实例来源/时间戳口径不符');
  assert(Number(st.evolution.shards.james_lebron) === 4, '扣费不符：' + st.evolution.shards.james_lebron);
  expectStoreFail('合成·已拥有', () => store.synthPeak('james_lebron'), /已拥有/);
  return true;
});

check('核心循环闭环：合成的巅峰卡能编入阵容并真实出战（出厂 OVR / 稀有度 / 薪资一致）', () => {
  nSeed(['curry_stephen_rookie', 'curry_stephen_active']);
  assert(store.evolvePair('curry_stephen').ok, '献祭失败');
  assert(store.synthPeak('curry_stephen').ok, '合成失败（库里 30 碎片应正好够）');
  const peakUid = nUid('curry_stephen_peak');
  const def = players.getCard('curry_stephen_peak');
  const eff = selectors.effectiveCardOf(store.getState(), peakUid);
  assert(eff.ovr === def.ovr && eff.rarity === def.rarity && eff.salary === def.salary, '出厂口径不符');
  assert(store.assignSlot('starters', 0, peakUid).ok, '编入失败');
  const battle = store.startBattle({ stageId: 's1-1', seed: 'n-battle-1' });
  assert(battle.ok, '出战失败：' + battle.reason);
  assert(battle.result && typeof battle.result.homeScore === 'number', '没有结算结果');
  assert(store.getState().lastMatch && store.getState().lastMatch.seed === 'n-battle-1', '战报未落库');
  return true;
});

check('enabled=false 一键关闭：三条命令全部拒绝、视图给可读文案；恢复后立刻可用', () => {
  nSeed(['james_lebron_rookie', 'james_lebron_active']);
  const rUid = nUid('james_lebron_rookie');
  withEvolution({ enabled: false }, () => {
    expectStoreFail('关闭·分解', () => store.salvageCard(rUid), /未开放/);
    expectStoreFail('关闭·献祭', () => store.evolvePair('james_lebron'), /未开放/);
    expectStoreFail('关闭·合成', () => store.synthPeak('james_lebron'), /未开放/);
    const view = selectors.evolutionView(store.getState(), 'james_lebron');
    assert(view.enabled === false, '视图未反映开关');
    assert(view.pair.possible === false && view.pair.reason.indexOf('未开放') !== -1, '关闭态应给可读文案：' + view.pair.reason);
    assert(view.salvage.possible === false && view.synth.possible === false, '关闭态不该说能操作');
  });
  assert(CONFIG.evolution.enabled === true, '开关未还原');
  const view2 = selectors.evolutionView(store.getState(), 'james_lebron');
  assert(view2.pair.possible === true && view2.salvage.possible === true, '恢复后视图应重新可用');
  assert(store.salvageCard(rUid).ok, '恢复后命令应可用');
  return true;
});

check('分解只影响本球员：其它球员的碎片 / 被留下的卡（含装备与时刻卡）/ profile / 阵容逐字节不变', () => {
  nSeed(['james_lebron_rookie', 'james_lebron_active', 'curry_stephen_rookie']);
  const st0 = store.getState();
  const rUid = nUid('james_lebron_rookie');
  const keepUid = nUid('james_lebron_active');
  const curryUid = nUid('curry_stephen_rookie');
  store.dispatch(store.actions.addItem('shoes_street', 1));
  store.dispatch(store.actions.addItem('m_35_seconds', 1));
  assert(store.equip(keepUid, 'shoes_street').ok, '装备失败');
  assert(store.equipMoment(keepUid, 'm_35_seconds').ok, '佩戴时刻卡失败');
  const keepBefore = JSON.stringify(store.getState().collection[keepUid]);
  const curryBefore = JSON.stringify(store.getState().collection[curryUid]);
  assert(store.salvageCard(rUid).ok, '分解失败');
  const st = store.getState();
  assert(JSON.stringify(st.collection[keepUid]) === keepBefore, '被留下的卡被动过');
  assert(JSON.stringify(st.collection[curryUid]) === curryBefore, '别的球员的卡被动过');
  assert((Number(st.evolution.shards.curry_stephen) || 0) === 0, '别的球员的碎片被动过');
  assert(JSON.stringify(st.profile) === JSON.stringify(st0.profile), '分解不该动 profile');
  assert(JSON.stringify(st.roster) === JSON.stringify(st0.roster), '分解不该动阵容');
  return true;
});

check('存档往返与老档迁移：碎片落盘读回一致；无 evolution 段补空壳；脏形状归一', () => {
  nSeed(['james_lebron_rookie']);
  assert(store.salvageCard(nUid('james_lebron_rookie')).ok, '分解失败');
  store.flush();
  const snap = JSON.stringify(store.getState());
  store.init({ force: true, now: 9000 });   // 不带 fresh ⇒ 走 storage 读档 + migrate
  assert(JSON.stringify(store.getState().evolution) === JSON.stringify(JSON.parse(snap).evolution), '碎片没有落盘读回');
  const legacy = JSON.parse(snap);
  delete legacy.evolution;
  const mig = store.migrate(legacy, 1000);
  assert(mig.evolution && typeof mig.evolution.shards === 'object' && Object.keys(mig.evolution.shards).length === 0,
    'migrate 应补出 evolution.shards 空壳');
  const broken = JSON.parse(snap);
  broken.evolution = { shards: 'x' };
  assert(typeof store.migrate(broken, 1000).evolution.shards === 'object', '脏 shards 应归一成对象');
  const dirty = JSON.parse(snap);
  dirty.evolution = { shards: { james_lebron: '12', neg: -3, frac: 2.9, bad: 'NaN' } };
  const migDirty = store.migrate(dirty, 1000);
  assert(migDirty.evolution.shards.james_lebron === 12 && migDirty.evolution.shards.frac === 2,
    '脏碎片值未归一：' + JSON.stringify(migDirty.evolution.shards));
  assert(migDirty.evolution.shards.neg === undefined && migDirty.evolution.shards.bad === undefined,
    '非法碎片值应被丢弃：' + JSON.stringify(migDirty.evolution.shards));
  return true;
});

check('reducer 防御：绕过命令层直接 dispatch 非法 payload 一律不动存档（合法 payload 反向对照）', () => {
  nSeed(['james_lebron_rookie', 'james_lebron_active']);
  const rUid = nUid('james_lebron_rookie');
  const aUid = nUid('james_lebron_active');
  const before = JSON.stringify(store.getState());
  const T = store.actions.T;
  store.dispatch(store.actions.salvageCard('c99999', 8, 3000));                                    // 幽灵 uid
  store.dispatch(store.actions.salvageCard(rUid, 0, 3000));                                       // gain=0
  store.dispatch(store.actions.salvageCard(rUid, 999, 3000));                                     // gain 与公式不一致
  store.dispatch(store.actions.salvageCard(aUid, 15, 3000));                                      // gain 与公式不一致（SSR 正确值是 16）
  store.dispatch(store.actions.evolvePair('james_lebron', rUid, aUid, 999, 3000));                // 献祭 gain 不实
  store.dispatch(store.actions.evolvePair('james_lebron', rUid, rUid, 36, 3000));                 // 同一张卡当两份材料
  store.dispatch(store.actions.synthPeak('james_lebron', 'james_lebron_peak', 40, 3000));         // 碎片不足
  store.dispatch(store.actions.synthPeak('james_lebron', 'curry_stephen_peak', 40, 3000));        // 卡对不上球员
  store.dispatch(store.actions.synthPeak('james_lebron', 'james_lebron_peak', 999, 3000));        // cost 不实
  assert(JSON.stringify(store.getState()) === before, '非法 payload 动了存档');
  /* 反向对照：合法 payload 必须能过（上面不是「一律拒绝」的空跑） */
  store.dispatch(store.actions.salvageCard(rUid, 8, 3000));
  assert(Number(store.getState().evolution.shards.james_lebron) === 8, '合法 payload 被误拒');
  assert(typeof T.EVOLVE_SALVAGE === 'string' && typeof T.EVOLVE_PAIR === 'string' && typeof T.EVOLVE_SYNTH === 'string', 'action 常量缺失');
  return true;
});

check('分解收益按出厂稀有度：升满级 / 升星 / 突破后收益不变（裁决 2 的反向对照）', () => {
  nSeed(['curry_stephen_rookie']);
  const uid = nUid('curry_stephen_rookie');
  const def = players.getCard('curry_stephen_rookie');
  assert(evoUtil.salvageValue(def) === 4, '库里新秀（R）应值 4');
  store.dispatch(store.actions.addCurrency({ gold: 100000 }));
  for (let i = 0; i < growth.limits.levelMax - 1; i++) assert(store.levelUp(uid).ok, 'levelUp ' + i);
  const dupes = [];
  for (let i = 0; i < 11; i++) dupes.push('curry_stephen_rookie');   // 1+2+3+5 = 11 张同名卡
  store.dispatch(store.actions.addCards(dupes, 'verify-n', 3000));
  for (let s = 1; s < growth.limits.starMax; s++) assert(store.starUp(uid).ok, 'starUp ' + s);
  store.dispatch(store.actions.addItem('shard', 100));
  for (let b = 0; b < growth.limits.breakMax; b++) assert(store.breakthrough(uid).ok, 'breakthrough ' + b);
  const eff = selectors.effectiveCardOf(store.getState(), uid);
  assert(eff.level === growth.limits.levelMax && eff.stars === growth.limits.starMax && eff.breakthrough === growth.limits.breakMax,
    '养成前提不成立：' + JSON.stringify({ lv: eff.level, st: eff.stars, br: eff.breakthrough }));
  assert(eff.rarity !== def.rarity, '养满后稀有度应上升（否则这条断言是空跑）');
  const r = store.salvageCard(uid);
  assert(r.ok && r.gain === 4, '分解收益随养成漂移了：' + JSON.stringify(r));
  return true;
});

check('详情页时空进化面板：字段 == selectors.evolutionView；三条交互从页面真实驱动到 store', () => {
  /* 挂载「献祭后仍会活下来的那张卡」（uid 较大的现役版）：这样三条交互跑完页面都还在卡详情态，
   * 才能验证「页面随 store 刷新」；被分解/被献祭的卡会让详情页切到「卡不存在」态（by design）。 */
  nSeed(['james_lebron_rookie', 'james_lebron_active', 'james_lebron_rookie', 'james_lebron_active']);
  const actives = Object.keys(store.getState().collection)
    .filter((u) => store.getState().collection[u].cardId === 'james_lebron_active').sort();
  const viewUid = actives[actives.length - 1];
  kResetUi();
  N_UI.modals.length = 0;
  const inst = kMount('pages/detail/detail.js', { uid: viewUid });
  try {
    const view = selectors.evolutionView(store.getState(), 'james_lebron');
    assert(inst.data.evoEvolvable === true && inst.data.evoCost === view.cost, '面板口径漂移');
    assert(inst.data.evoProgressText === view.progressText && inst.data.evoNote === view.note, '进度/公示文案漂移');
    assert(inst.data.evoPairOk === view.pair.possible && inst.data.evoPairGain === view.pair.gain, '献祭口径漂移');
    assert(inst.data.evoSalvageText.indexOf('4 张') !== -1, '候选数不符：' + inst.data.evoSalvageText);
    /* 打开分解弹层 → 点第一行（新秀）→ 确认 → 分解落地并推 toast */
    inst.openEvoSheet();
    assert(inst.data.evoSheetOpen === true && inst.data.evoRows.length === 4, '弹层未打开：' + inst.data.evoRowCount);
    /* 排序口径：第一行应是新秀版（未禁用 + 版本序 + 养成度最低），与命令选材一致 */
    const row = inst.data.evoRows[0];
    assert(row.cardId === 'james_lebron_rookie', '第一行应是新秀版：' + row.cardId);
    inst.onSalvage({ currentTarget: { dataset: { uid: row.uid, reason: '', version: row.version, value: row.value, growth: row.growthText, last: row.isLast } } });
    assert(N_UI.modals.length === 1 && N_UI.modals[0].title === '分解确认', '确认弹窗缺失');
    assert(Number(store.getState().evolution.shards.james_lebron) === row.value, '分解未落地');
    assert(inst.data.evoShards === row.value, '页面没有随 store 刷新碎片：' + inst.data.evoShards);
    /* 献祭（此时还剩 新秀 + 现役）→ 36；合计 44 ≥ 40 → 合成 */
    inst.closeSheet();
    inst.onEvolvePair();
    assert(Number(store.getState().evolution.shards.james_lebron) === 44, '献祭未落地：' + JSON.stringify(store.getState().evolution.shards));
    assert(store.getState().collection[viewUid], '献祭不该吃掉正在查看的那张卡（低养成优先规则）');
    inst.onSynthPeak();
    const peaks = Object.keys(store.getState().collection).filter((u) => store.getState().collection[u].cardId === 'james_lebron_peak');
    assert(peaks.length === 1, '合成未落地');
    assert(K_UI.toast.some((t) => t.indexOf('合成成功') === 0), '缺少成功 toast：' + JSON.stringify(K_UI.toast));
    assert(inst.data.evoOwned === true && inst.data.evoSynthOk === false && inst.data.evoPairOk === false, '合成后页面状态未刷新');
    assert(inst.data.evoShards === 4, '页面碎片未刷新：' + inst.data.evoShards);
  } finally { kUnmount(inst); }
  return true;
});

check('详情页模板：时空进化面板 / 三按钮 / 分解弹层 / 公示文案都在（防「有字段不渲染」）', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/detail/detail.wxml'), 'utf8');
  const need = [
    ['wx:if="{{evoEvolvable}}"', '缺时空进化面板'],
    ['bindtap="onEvolvePair"', '缺成套献祭按钮'],
    ['bindtap="openEvoSheet"', '缺分解入口'],
    ['bindtap="onSynthPeak"', '缺合成按钮'],
    ['wx:if="{{evoSheetOpen}}"', '缺分解弹层'],
    ['<px-progress value="{{evoShards}}" max="{{evoCost}}"', '缺碎片进度条'],
    ['{{evoNote}}', '缺公示文案'],
    ['{{evoSalvageText}}', '缺分解入口文案']
  ];
  need.forEach((n) => assert(wxml.indexOf(n[0]) !== -1, n[1]));
  assert(wxml.indexOf('里程碑 3 开放，这里先做展示与切换') === -1, '旧占位文案还在（面板没接上）');
  return true;
});

check('消耗卡牌的路径统一退回随身附件：分解带装备 / 时刻卡的卡不再静默吞掉（与市场出售同口径）', () => {
  nSeed(['james_lebron_rookie']);
  store.dispatch(store.actions.addItem('shoes_street', 1));
  const momentId = momentsData.MOMENTS[0].id;
  store.dispatch(store.actions.addItem(momentId, 1));
  const uid = nUid('james_lebron_rookie');
  assert(store.equip(uid, 'shoes_street').ok, '装备失败（用例前提不成立）');
  assert(store.equipMoment(uid, momentId).ok, '戴时刻卡失败（用例前提不成立）');
  const bag0 = store.getState().bag;
  assert(store.salvageCard(uid).ok, '分解失败');
  const bag1 = store.getState().bag;
  assert(!store.getState().collection[uid], '卡没被吃掉');
  assert((Number(bag1.shoes_street) || 0) === (Number(bag0.shoes_street) || 0) + 1, '装备没退回背包：' + JSON.stringify(bag1));
  assert((Number(bag1[momentId]) || 0) === (Number(bag0[momentId]) || 0) + 1, '时刻卡没退回背包：' + JSON.stringify(bag1));
  assert((store.getState().notices[0] || {}).text.indexOf('退回背包') !== -1, '通知没写明附件去向');
  return true;
});

/* ================= O 交易市场（第八章「创新玩法」：「交易市场 & 王朝赛季（里程碑 3）」，第二块） =================
 * 口径：橱窗 = f(dayKey, rerolls) 纯函数（utils/market.js）；价格按出厂稀有度（config.market）；
 * 买 / 卖 / 刷新全部走 commands；reducer 用 action 自带的 (dayKey, rerolls) 重算货架做第二道校验。
 * 时间依赖：commands 用真实 now()（与 J 组竞技场同规），所以命令相关用例按「今天」跑；
 * 纯函数用例（货架确定性 / 出现率 / 换天重掷）用固定 dayKey 字符串，与机器时间无关。 */
section('O 交易市场（橱窗确定性 / 买入卖出刷新 / 附件退回 / 页面驱动）');

const MKCFG = CONFIG.market;
/* 临时改 config.market 跑一段（与 withEvolution / withMoment 同构；verify 单进程顺序执行，脏配置会污染后面断言） */
function withMarket(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = MKCFG[k]; MKCFG[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { MKCFG[k] = saved[k]; }); }
}

check('数值口径：买卖价 5 档齐全、卖价 = 买价 ÷ 3、刷新价为正；市场池剔除巅峰卡、档位权重可解析', () => {
  CONFIG.rarity.order.forEach((r) => {
    const b = marketUtil.buyPrice(r);
    const s = marketUtil.sellPrice(r);
    assert(b > 0 && s > 0, r + ' 缺买卖价（价格表要覆盖 rarity.order）');
    assert(s * 3 === b, r + ' 卖价必须是买价的 1/3（防套利护城河）：' + s + ' vs ' + b);
  });
  assert(marketUtil.refreshCost() > 0, '刷新价必须为正');
  const pool = marketUtil.poolCards();
  const peakIds = players.CARDS.filter((c) => c.version === '巅峰传奇版').map((c) => c.id);
  assert(peakIds.length > 0, '样本里必须有巅峰卡（否则「剔除巅峰」这条是空跑）');
  assert(pool.length === players.CARDS.length - peakIds.length, '池子大小应 = 全卡 - 巅峰卡');
  pool.forEach((c) => assert(peakIds.indexOf(c.id) === -1, '池子里不该有巅峰卡：' + c.id));
  const byR = {};
  pool.forEach((c) => { byR[c.rarity] = (byR[c.rarity] || 0) + 1; });
  ['N', 'R', 'SR', 'SSR'].forEach((r) => assert(byR[r] > 0, '池子 ' + r + ' 档为空，橱窗权重会空转'));
  marketData.SLOTS.forEach((slot) => {
    const keys = Object.keys(slot.weights || {});
    assert(keys.length > 0 && slot.key && slot.label, '橱窗档位形状不合法：' + JSON.stringify(slot));
    keys.forEach((r) => {
      assert(CONFIG.rarity.order.indexOf(r) !== -1, slot.key + ' 权重引用了不存在的稀有度 ' + r);
      assert(byR[r] > 0, slot.key + ' 权重里的 ' + r + ' 在池子里没货');
    });
    keys.forEach((r) => assert(Number(slot.weights[r]) > 0, slot.key + ' 的 ' + r + ' 权重应为正数'));
  });
  return true;
});

check('橱窗是纯函数：同 (dayKey, rerolls) 逐字节一致、5 格无重复、出现率符合标定、源码零随机零时间', () => {
  const a = marketUtil.shelfOf('2026-10-11', 0);
  const b = marketUtil.shelfOf('2026-10-11', 0);
  assert(JSON.stringify(a) === JSON.stringify(b), '同输入两次货架不一致');
  assert(a.length === marketData.SLOTS.length, '货架格数应等于 SLOTS 数');
  const seen = {};
  a.forEach((row, i) => {
    assert(!seen[row.cardId], '同一天货架不应出现重复卡：' + row.cardId);
    seen[row.cardId] = true;
    const slot = marketData.SLOTS[i];
    assert(row.slotKey === slot.key && row.slotLabel === slot.label, '第 ' + i + ' 格与数据不符');
    assert(slot.weights[row.rarity] !== undefined, row.rarity + ' 不在该格权重里');
    const def = players.getCard(row.cardId);
    assert(def && def.rarity === row.rarity && marketUtil.isMarketable(def), '货架行与卡定义不符：' + row.cardId);
  });
  /* 出现率口径：1000 天采样 —— SSR 日出现率应落在 25%~50%（当前权重 ≈ 37%），SR+ 覆盖 ≥95% 的天数 */
  let ssrDays = 0;
  let srPlusDays = 0;
  const DAY = 86400000;
  for (let d = 0; d < 1000; d++) {
    const day = arenaUtil.dayKeyOf(1750000000000 + d * DAY);
    const shelf = marketUtil.shelfOf(day, 0);
    if (shelf.some((r) => r.rarity === 'SSR')) ssrDays += 1;
    if (shelf.some((r) => r.rarity === 'SR' || r.rarity === 'SSR')) srPlusDays += 1;
    const dupCheck = {};
    shelf.forEach((r) => { assert(!dupCheck[r.cardId], '采样日出现重复卡：' + day); dupCheck[r.cardId] = 1; });
  }
  assert(ssrDays >= 250 && ssrDays <= 500, 'SSR 日出现率 ' + (ssrDays / 10).toFixed(1) + '% 偏离标定（应为 ≈37%）');
  assert(srPlusDays >= 950, 'SR+ 日覆盖率过低：' + (srPlusDays / 10).toFixed(1) + '%');
  /* 源码纪律：utils / data 零随机零时间；页面零 Math.random（可复现红线的分层延伸） */
  const srcU = fs.readFileSync(path.join(ROOT, 'utils/market.js'), 'utf8');
  assert(!/Math\.random[ \t]*\(/.test(srcU), 'utils/market.js 不得有 Math.random');
  assert(!/Date\.now[ \t]*\(/.test(srcU), 'utils/market.js 不得取系统时间');
  const srcD = fs.readFileSync(path.join(ROOT, 'data/market.js'), 'utf8');
  assert(!/Math\.random[ \t]*\(/.test(srcD) && !/Date\.now[ \t]*\(/.test(srcD), 'data/market.js 不得有随机/时间');
  const srcP = fs.readFileSync(path.join(ROOT, 'pages/market/market.js'), 'utf8');
  assert(!/Math\.random[ \t]*\(/.test(srcP), '市场页不得自产随机数');
  return true;
});

check('橱窗随时间重掷：换天 / 刷新都是新一版；连续 30 天至少 25 天变化（防「永远不换」空跑）', () => {
  const base = JSON.stringify(marketUtil.shelfOf('2026-10-11', 0));
  assert(JSON.stringify(marketUtil.shelfOf('2026-10-11', 1)) !== base, '刷新（rerolls+1）后货架没变');
  let diff = 0;
  for (let d = 1; d <= 30; d++) {
    const dd = (d < 10 ? '0' : '') + d;
    const monthA = JSON.stringify(marketUtil.shelfOf('2026-10-' + dd, 0));
    const monthB = JSON.stringify(marketUtil.shelfOf('2026-11-' + dd, 0));
    if (monthA !== monthB) diff += 1;
  }
  assert(diff >= 25, '30 天里只有 ' + diff + ' 天货架变化（重掷逻辑可疑）');
  assert(marketUtil.seedOf('2026-10-11', 0) !== marketUtil.seedOf('2026-10-11', 1), '种子应随 rerolls 变化');
  return true;
});

check('买入成功路径：金币扣减 / 新实例 source=market / 通知口径正确 / 不限购（同一天可再买）', () => {
  nSeed([]);
  const now = Date.now();
  const mv = selectors.marketView(store.getState(), now);
  /* 货架 = f(dayKey)（裁决 4/5），而起始阵容里就有 academy_*_1 / academy_*_3：
     若某天的第一格恰好是这几张，下面「新实例 source=market」会被起始卡抢先命中
     （2026-10-15 首格 = academy_pf_1 时踩到）。改成挑第一格「未持有」的货，
     判据本身不放松 —— 仍然断言买回来的实例必须全新且 source=market。 */
  const owned0 = Object.keys(store.getState().collection).map((u) => store.getState().collection[u].cardId);
  const row = mv.shelf.filter((r) => r.canBuy && owned0.indexOf(r.cardId) === -1)[0] || mv.shelf[0];
  assert(row && row.canBuy, '起始存档应买得起橱窗里的卡：' + JSON.stringify(row));
  const gold0 = store.getState().profile.gold;
  const r = store.marketBuy(row.cardId);
  assert(r && r.ok === true && r.price === row.price, '买入失败：' + JSON.stringify(r));
  const st = store.getState();
  assert(st.profile.gold === gold0 - row.price, '金币没扣对：' + st.profile.gold + ' vs ' + (gold0 - row.price));
  const got = Object.keys(st.collection).map((u) => st.collection[u]).filter((c) => c.cardId === row.cardId);
  assert(got.length === 1 && got[0].source === 'market' && got[0].level === 1 && got[0].stars === 1, '实例口径不对：' + JSON.stringify(got[0]));
  assert((st.notices[0] || {}).kind === 'market' && st.notices[0].text.indexOf('买入') !== -1, '通知缺失：' + JSON.stringify(st.notices[0]));
  /* 不限购（裁决 4）：同一张再买一次也成功，两张都进收藏 */
  const r2 = store.marketBuy(row.cardId);
  assert(r2 && r2.ok === true, '不限购口径被破坏：' + JSON.stringify(r2));
  const count = Object.keys(store.getState().collection).filter((u) => store.getState().collection[u].cardId === row.cardId).length;
  assert(count === 2, '第二张没入库：' + count);
  const mv2 = selectors.marketView(store.getState(), now);
  const row2 = mv2.shelf.filter((r) => r.cardId === row.cardId)[0];
  assert(row2 && row2.ownedText.indexOf('已有') !== -1, '视图里的持有数没更新');
  return true;
});

check('买入失败路径：未开放 / 卡不存在 / 巅峰卡 / 不在橱窗 / 金币不足 —— 一律 ok:false 且存档逐字节不动', () => {
  nSeed([]);
  const now = Date.now();
  const mv = selectors.marketView(store.getState(), now);
  const onShelf = {};
  mv.shelf.forEach((r) => { onShelf[r.cardId] = 1; });
  const offShelf = marketUtil.poolCards().filter((c) => !onShelf[c.id])[0];
  assert(offShelf, '池子应该大于货架（否则「不在橱窗」这条没法测）');
  expectStoreFail('买入幽灵卡', () => store.marketBuy('no_such_card'), /不存在/);
  expectStoreFail('买入巅峰卡', () => store.marketBuy('james_lebron_peak'), /巅峰/);
  expectStoreFail('买入不在橱窗的卡', () => store.marketBuy(offShelf.id), /橱窗/);
  expectStoreFail('未开放时买入', () => withMarket({ enabled: false }, () => store.marketBuy(mv.shelf[0].cardId)), /未开放/);
  store.dispatch(store.actions.setProfile({ gold: 10 }));
  expectStoreFail('金币不足', () => store.marketBuy(mv.shelf[0].cardId), /金币/);
  return true;
});

check('出售成功路径：卡出收藏 / 金币增加 / 带装备与时刻卡时附件退回背包 / 通知写明去向', () => {
  nSeed(['james_lebron_rookie']);
  store.dispatch(store.actions.addItem('shoes_street', 1));
  const momentId = momentsData.MOMENTS[0].id;
  store.dispatch(store.actions.addItem(momentId, 1));
  const uid = nUid('james_lebron_rookie');
  assert(store.equip(uid, 'shoes_street').ok, '装备失败（用例前提不成立）');
  assert(store.equipMoment(uid, momentId).ok, '戴时刻卡失败（用例前提不成立）');
  const bag0 = store.getState().bag;
  const gold0 = store.getState().profile.gold;
  const r = store.marketSell(uid);
  assert(r && r.ok === true && r.price === marketUtil.sellPrice('SR'), '出售失败：' + JSON.stringify(r));
  const st = store.getState();
  assert(!st.collection[uid], '卡没出收藏');
  assert(st.profile.gold === gold0 + r.price, '金币没加对');
  assert((Number(st.bag.shoes_street) || 0) === (Number(bag0.shoes_street) || 0) + 1, '装备没退回背包：' + JSON.stringify(st.bag));
  assert((Number(st.bag[momentId]) || 0) === (Number(bag0[momentId]) || 0) + 1, '时刻卡没退回背包：' + JSON.stringify(st.bag));
  assert(st.notices[0].text.indexOf('卖出') !== -1 && st.notices[0].text.indexOf('退回背包') !== -1, '通知没写明附件去向：' + st.notices[0].text);
  return true;
});

check('出售失败路径：不存在 / 阵容中 / 巅峰卡 / 未开放 —— 拒绝且存档逐字节不动；关闭态视图给可读文案', () => {
  nSeed(['james_lebron_peak']);
  const peakUid = nUid('james_lebron_peak');
  const rosterUid = Object.keys(store.getState().collection).filter((u) => selectors.inRoster(store.getState(), u))[0];
  assert(peakUid && rosterUid, '用例前提不成立（缺巅峰卡或阵容卡）');
  expectStoreFail('幽灵 uid 出售', () => store.marketSell('c99999'), /不存在/);
  expectStoreFail('阵容中的卡出售', () => store.marketSell(rosterUid), /阵容/);
  expectStoreFail('巅峰卡出售', () => store.marketSell(peakUid), /巅峰/);
  expectStoreFail('未开放时出售', () => withMarket({ enabled: false }, () => store.marketSell(peakUid)), /未开放/);
  withMarket({ enabled: false }, () => {
    const mv = selectors.marketView(store.getState(), Date.now());
    assert(mv.enabled === false && mv.refresh.can === false && mv.refresh.reason.length > 0, '关闭态刷新可用性文案缺失');
    assert(mv.shelf.length > 0 && mv.shelf.every((r) => r.canBuy === false && r.reason.length > 0), '关闭态橱窗应不可买且给出原因');
  });
  return true;
});

check('「最后一张」允许出售（软提示）；同一张进阵容后硬拒（反向对照）', () => {
  nSeed(['james_lebron_rookie']);
  const uid = nUid('james_lebron_rookie');
  const mv0 = selectors.marketView(store.getState(), Date.now());
  const row0 = mv0.sellRows.filter((r) => r.uid === uid)[0];
  assert(row0 && row0.isLast === true && row0.disabled === false && row0.warnText.indexOf('最后一张') !== -1,
    '最后一张标记缺失：' + JSON.stringify(row0));
  const benchIdx = store.getState().roster.bench.indexOf(null);
  assert(benchIdx !== -1, '应有一个空替补位（用例前提）');
  store.assignSlot('bench', benchIdx, uid);
  expectStoreFail('阵容中的卡出售（反向对照）', () => store.marketSell(uid), /阵容/);
  const mv1 = selectors.marketView(store.getState(), Date.now());
  const row1 = mv1.sellRows.filter((r) => r.uid === uid)[0];
  assert(row1.disabled === true && row1.disabledText.indexOf('阵容') !== -1, '行没禁用：' + JSON.stringify(row1));
  store.assignSlot('bench', benchIdx, '');
  const r = store.marketSell(uid);
  assert(r && r.ok === true, '移出阵容后应可出售最后一张：' + JSON.stringify(r));
  return true;
});

check('刷新：金币 -refreshCost、rerolls +1、货架重掷且视图同步；金币不足拒绝', () => {
  nSeed([]);
  const now = Date.now();
  const before = selectors.marketView(store.getState(), now);
  const ids0 = before.shelf.map((r) => r.cardId).join(',');
  const gold0 = store.getState().profile.gold;
  const r = store.marketRefresh();
  assert(r && r.ok === true && r.cost === marketUtil.refreshCost() && r.rerolls === 1, '刷新失败：' + JSON.stringify(r));
  assert(store.getState().profile.gold === gold0 - r.cost, '刷新没扣钱');
  const after = selectors.marketView(store.getState(), now);
  assert(after.rerollsText.indexOf('1 次') !== -1, '视图没同步刷新次数：' + after.rerollsText);
  assert(after.shelf.map((r2) => r2.cardId).join(',') !== ids0, '刷新后货架没变');
  assert((store.getState().notices[0] || {}).kind === 'market' && store.getState().notices[0].text.indexOf('刷新') !== -1, '刷新通知缺失');
  store.dispatch(store.actions.setProfile({ gold: 10 }));
  expectStoreFail('金币不足刷新', () => store.marketRefresh(), /金币/);
  return true;
});

check('与时空进化隔离：出售不加巅峰碎片；分解不加金币（两条路径不串线）', () => {
  nSeed(['james_lebron_rookie']);
  const shards0 = JSON.stringify((store.getState().evolution || {}).shards || {});
  const uid = nUid('james_lebron_rookie');
  const r = store.marketSell(uid);
  assert(r && r.ok === true, '出售失败');
  assert(JSON.stringify((store.getState().evolution || {}).shards || {}) === shards0, '出售动了巅峰碎片账本');
  /* 反向对照：分解加碎片但不加金币（否则说明两条消耗路径串线） */
  store.dispatch(store.actions.addCards(['james_lebron_rookie'], 'verify-o', 2000));
  const goldBefore = store.getState().profile.gold;
  assert(store.salvageCard(nUid('james_lebron_rookie')).ok, '分解失败');
  assert(store.getState().profile.gold === goldBefore, '分解加了金币（两条路径串线）');
  assert(Number(store.getState().evolution.shards.james_lebron) === 8, '分解没加碎片');
  return true;
});

check('存档往返与老档迁移：rerolls 落盘读回一致；无 market 段补空壳；脏形状归一', () => {
  nSeed([]);
  assert(store.marketRefresh().ok, '刷新失败（用例前提）');
  store.flush();
  const snap = JSON.stringify(store.getState());
  store.init({ force: true, now: 9000 });
  assert(JSON.stringify(store.getState().market) === JSON.stringify(JSON.parse(snap).market), 'market 段没有落盘读回');
  const legacy = JSON.parse(snap);
  delete legacy.market;
  const mig = store.migrate(legacy, 1000);
  assert(mig.market && mig.market.rerolls === 0, 'migrate 应补出 market.rerolls = 0 空壳');
  const dirty = JSON.parse(snap);
  dirty.market = { rerolls: '3.9' };
  assert(store.migrate(dirty, 1000).market.rerolls === 3, '脏 rerolls 应向下取整为 3');
  const broken = JSON.parse(snap);
  broken.market = { rerolls: -5 };
  assert(store.migrate(broken, 1000).market.rerolls === 0, '负 rerolls 应归零');
  const junk = JSON.parse(snap);
  junk.market = 'nope';
  assert(store.migrate(junk, 1000).market.rerolls === 0, '非对象 market 应丢弃补空壳');
  return true;
});

check('reducer 防御：直派非法市场 payload 一律不动存档（合法 payload 反向对照）', () => {
  nSeed([]);
  store.dispatch(store.actions.addCards(['james_lebron_rookie'], 'verify-o', 1500));
  const now = Date.now();
  const dayKey = arenaUtil.dayKeyOf(now);
  const mv = selectors.marketView(store.getState(), now);
  const onShelf = mv.shelf[0];
  const offShelf = marketUtil.poolCards().filter((c) => !mv.shelf.some((r) => r.cardId === c.id))[0];
  const rookUid = nUid('james_lebron_rookie');
  const rosterUid = Object.keys(store.getState().collection).filter((u) => selectors.inRoster(store.getState(), u))[0];
  const rosterRarity = players.getCard(store.getState().collection[rosterUid].cardId).rarity;
  const before = JSON.stringify(store.getState());
  store.dispatch(store.actions.marketBuy('no_such_card', dayKey, 0, 900, now));                                            // 幽灵卡
  store.dispatch(store.actions.marketBuy('james_lebron_peak', dayKey, 0, 14400, now));                                     // 巅峰卡
  store.dispatch(store.actions.marketBuy(offShelf.id, dayKey, 0, marketUtil.buyPrice(offShelf.rarity), now));               // 不在今日货架
  store.dispatch(store.actions.marketBuy(onShelf.cardId, dayKey, 0, 1, now));                                               // 价格篡改
  store.dispatch(store.actions.marketBuy(onShelf.cardId, dayKey, 5, onShelf.price, now));                                   // rerolls 与存档不符
  store.dispatch(store.actions.marketBuy(onShelf.cardId, '1999-01-01', 0, onShelf.price, now));                             // dayKey 与 now 不符
  store.dispatch(store.actions.marketSell(rookUid, 999, now));                                                              // 出售价篡改
  store.dispatch(store.actions.marketSell(rosterUid, marketUtil.sellPrice(rosterRarity), now));                             // 阵容中的卡直派
  store.dispatch(store.actions.marketRefresh(1, now));                                                                      // 刷新价篡改
  assert(JSON.stringify(store.getState()) === before, '非法 payload 动了存档');
  /* 反向对照：合法 payload 必须能过（上面不是「一律拒绝」的空跑） */
  store.dispatch(store.actions.marketBuy(onShelf.cardId, dayKey, 0, onShelf.price, now));
  const okBuy = Object.keys(store.getState().collection).some((u) => store.getState().collection[u].cardId === onShelf.cardId && store.getState().collection[u].source === 'market');
  assert(okBuy, '合法买入被误拒');
  assert(typeof store.actions.T.MARKET_BUY === 'string' && typeof store.actions.T.MARKET_SELL === 'string' && typeof store.actions.T.MARKET_REFRESH === 'string', 'action 常量缺失');
  return true;
});

check('市场页：字段 == selectors.marketView；买入 / 出售 / 刷新从页面真实驱动到 store', () => {
  nSeed(['james_lebron_rookie']);
  kResetUi();
  N_UI.modals.length = 0;
  const inst = kMount('pages/market/market.js', {});
  try {
    const view = selectors.marketView(store.getState(), Date.now());
    assert(inst.data.shelfCount === view.shelfCount && inst.data.sellableCount === view.sellableCount, '摘要口径漂移');
    assert(inst.data.shelf[0].cardId === view.shelf[0].cardId && inst.data.shelf[0].priceText === view.shelf[0].priceText, '货架口径漂移');
    assert(inst.data.refresh.cost === view.refresh.cost && inst.data.refresh.can === view.refresh.can, '刷新口径漂移');
    /* 买入：点第一格 → 二次确认 → 入库 + toast + 页面随 store 刷新 */
    const row = inst.data.shelf[0];
    const gold0 = store.getState().profile.gold;
    inst.onBuy({ currentTarget: { dataset: { id: row.cardId } } });
    assert(N_UI.modals.length === 1 && N_UI.modals[0].title.indexOf('买入') === 0, '买入缺二次确认');
    assert(Object.keys(store.getState().collection).some((u) => store.getState().collection[u].cardId === row.cardId && store.getState().collection[u].source === 'market'), '页面买入未落地');
    assert(store.getState().profile.gold === gold0 - row.price, '页面买入没扣钱');
    assert(K_UI.toast.some((t) => t.indexOf('已买入') === 0), '缺买入 toast：' + JSON.stringify(K_UI.toast));
    assert(inst.data.goldText !== view.goldText, '页面金币没随 store 刷新');
    /* 出售：点新秀版的出售按钮 → 二次确认 → 出收藏 + toast */
    const sellRow = inst.data.sellRows.filter((r) => r.cardId === 'james_lebron_rookie' && !r.disabled)[0];
    assert(sellRow, '出售列表里应有可售的新秀版');
    inst.onSell({ currentTarget: { dataset: { uid: sellRow.uid } } });
    assert(N_UI.modals.length === 2 && N_UI.modals[1].title.indexOf('卖出') === 0, '卖出缺二次确认');
    assert(!store.getState().collection[sellRow.uid], '页面卖出未落地');
    assert(K_UI.toast.some((t) => t.indexOf('已卖出') === 0), '缺卖出 toast');
    /* 刷新：点刷新 → 二次确认 → 扣钱 + rerolls +1 + 页面货架重掷 */
    const ids0 = inst.data.shelf.map((r) => r.cardId).join(',');
    inst.onRefresh();
    assert(N_UI.modals.length === 3, '刷新缺二次确认');
    assert(store.getState().market.rerolls === 1, '页面刷新未落地');
    assert(inst.data.shelf.map((r) => r.cardId).join(',') !== ids0, '页面货架没重掷');
  } finally { kUnmount(inst); }
  return true;
});

check('市场页模板：橱窗 / 出售 / 刷新 / 价格公示都在（防「有字段不渲染」）', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/market/market.wxml'), 'utf8');
  [
    ['wx:for="{{shelf}}"', '缺橱窗列表'],
    ['bindtap="onBuy"', '缺买入按钮'],
    ['wx:for="{{sellRows}}"', '缺出售列表'],
    ['bindtap="onSell"', '缺出售按钮'],
    ['bindtap="onRefresh"', '缺刷新按钮'],
    ['{{shelfTitle}}', '缺橱窗日期'],
    ['{{priceNote}}', '缺价格公示'],
    ['{{note}}', '缺规则说明'],
    ['{{refresh.buttonText}}', '缺刷新按钮文案']
  ].forEach((n) => assert(wxml.indexOf(n[0]) !== -1, n[1]));
  const js = fs.readFileSync(path.join(ROOT, 'pages/market/market.js'), 'utf8');
  ['onBuy', 'onSell', 'onRefresh'].forEach((m) => assert(js.indexOf(m + '(') !== -1, '缺方法 ' + m));
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  assert(app.pages.indexOf('pages/market/market') !== -1, '市场页未在 app.json 注册');
  return true;
});

check('不互相污染：买卖不动阵容 / 体力 / 竞技场段；卖重复卡不回退图鉴进度（卖最后一张才回退）', () => {
  nSeed([]);
  const roster0 = JSON.stringify(store.getState().roster);
  const stamina0 = store.getState().profile.stamina;
  const arena0 = JSON.stringify(store.getState().arena);
  store.dispatch(store.actions.addCards(['james_lebron_rookie', 'james_lebron_rookie'], 'verify-o', 2500));
  const uids = Object.keys(store.getState().collection).filter((u) => store.getState().collection[u].cardId === 'james_lebron_rookie').sort();
  const p0 = selectors.collectionProgress(store.getState());
  assert(store.marketSell(uids[0]).ok, '出售失败');
  assert(selectors.collectionProgress(store.getState()).uniqueOwned === p0.uniqueOwned, '卖重复卡不该回退图鉴进度');
  assert(store.marketSell(uids[1]).ok, '第二张出售失败');
  assert(selectors.collectionProgress(store.getState()).uniqueOwned === p0.uniqueOwned - 1, '卖最后一张图鉴进度应回退 1（软提示的依据）');
  assert(JSON.stringify(store.getState().roster) === roster0, '市场动了阵容');
  assert(store.getState().profile.stamina === stamina0, '市场动了体力');
  assert(JSON.stringify(store.getState().arena) === arena0, '市场动了竞技场段');
  return true;
});

/* ================= P 王朝赛季 & 赛季通行证（积分 / 任务 / 跨窗滚动 / 两轨领奖 / 页面驱动） =================
 * 口径：赛季 = seasonDays 天窗口（startKey 记在存档，跨窗滚动由 commands/reducer 拿到新 dayKey 时触发）；
 *   积分只从结算（基础分 + 首通）与任务达成来；utils/dynasty.js 是纯函数层（不掷随机、不取系统时间），
 *   commands 与 reducer 跑同一份 planSettle（同参 ⇒ 同解）；视图对「已过期未落库」的存档做虚拟滚动展示。
 * 时间依赖：命令相关用例用真实 now()（与 J/O 组同规，按「今天」跑）；纯函数用例用固定 dayKey 字符串。
 */
section('P 王朝赛季 & 赛季通行证（积分 / 任务 / 跨窗滚动 / 两轨领奖 / 页面驱动）');

const DYCFG = CONFIG.dynasty;
const initState = R('store/initial-state.js');
const storageUtil = R('utils/storage.js');
const DAY_MS = 86400000;

/* 临时改 config.dynasty 跑一段（与 withEvolution / withMarket 同构；单进程顺序执行，脏配置会污染后面断言） */
function withDynasty(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = DYCFG[k]; DYCFG[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { DYCFG[k] = saved[k]; }); }
}
function pToday() { return arenaUtil.dayKeyOf(Date.now()); }
function pDay(offset) { return arenaUtil.dayKeyOf(Date.now() + offset * DAY_MS); }
/* 注入指定王朝段的干净存档：走 storage + init 的正式读档路径（migrate + normalize），不是直接改内存态。
 * 用完必须 pRestore() 还原，避免污染后面的用例。 */
function pInject(mutate) {
  store.init({ fresh: true, force: true, now: Date.now() });   // 干净基线（同时把干净档写进内存 storage）
  const crafted = JSON.parse(JSON.stringify(store.getState()));
  if (mutate) mutate(crafted);
  storageUtil.set(CONFIG.SAVE_KEY, crafted);
  store.init({ force: true });                                  // 从 storage 读回
  return store.getState();
}
function pRestore() { store.init({ fresh: true, force: true, now: Date.now() }); }

check('数值口径：赛季窗口 / 积分表 / 任务表 / 奖励轨结构齐全，奖励不含任何直接战力', () => {
  assert(DYCFG.enabled === true, '王朝赛季应默认开启（关闭态另有用例）');
  assert(DYCFG.seasonDays === 30 && DYCFG.pointsPerLevel === 400 && DYCFG.levels === 50, '窗口 / 每级分 / 等级数口径漂移');
  assert(DYCFG.premiumCost > 0, '王朝轨解锁价必须为正');
  const table = DYCFG.points;
  [table.pveWin, table.pveDraw, table.pveLose, table.arenaWin, table.arenaDraw, table.arenaLose, table.firstClear]
    .forEach((v) => assert(typeof v === 'number' && v > 0, '积分表缺项或非正数：' + JSON.stringify(table)));
  assert(table.arenaWin > table.pveWin && table.pveLose > 0, '天梯单场分应高于 PVE、败场不空手（config.dynasty 注释口径）');

  /* 初始存档的王朝段 = empty(建档当天) */
  assert(JSON.stringify(initState.createInitialState(0).dynasty) === JSON.stringify({
    startKey: '1970-01-01', points: 0, premium: false, missions: {}, completed: {}, claimed: {}
  }), '初始存档缺王朝段或形状不符');

  /* MISSIONS：id 唯一、counter 属于结算会计口径、target / points 为正整数 */
  const seen = {};
  assert(dynastyData.MISSIONS.length >= 10, '赛季任务过少：' + dynastyData.MISSIONS.length);
  dynastyData.MISSIONS.forEach((m) => {
    assert(!seen[m.id], '重复任务 id：' + m.id);
    seen[m.id] = true;
    assert(dynastyUtil.COUNTER_KEYS.indexOf(m.counter) !== -1, m.id + ' 的 counter 不在结算会计集：' + m.counter);
    assert(Number.isInteger(m.target) && m.target > 0, m.id + ' target 应为正整数');
    assert(Number.isInteger(m.points) && m.points > 0, m.id + ' points 应为正整数');
    assert(m.name && m.desc, m.id + ' 缺名称或描述');
  });
  assert(dynastyData.getMission('m_pve_1') && dynastyData.getMission('nope') === null, 'getMission 边界不符');

  /* PASS_TRACK：覆盖 1..levels 每一级；免费轨每级有奖；王朝轨只在每 5 级有奖；item 引用可解析且不是装备 */
  assert(dynastyData.PASS_TRACK.length === DYCFG.levels, '奖励轨行数应等于等级数');
  dynastyData.PASS_TRACK.forEach((row, i) => {
    assert(row.level === i + 1, '奖励轨等级应连续：' + row.level);
    assert(row.free && ['gold', 'diamond', 'item'].indexOf(row.free.kind) !== -1, 'Lv.' + row.level + ' 免费轨缺奖励或类型非法');
    assert((row.level % 5 === 0) === !!row.premium, 'Lv.' + row.level + ' 王朝轨档位不符（只在每 5 级有奖）');
    dynastyUtil.rewardsOf(row.free).concat(dynastyUtil.rewardsOf(row.premium)).forEach((r) => {
      if (r.kind === 'item') {
        assert(items.getItem(r.id), '奖励引用了不存在的道具：' + r.id);
        assert(!items.isEquipment(r.id), '通行证不得发装备（不卖直接战力）：' + r.id);
        assert(Math.max(1, Number(r.count) || 1) >= 1, 'item 数量应为正');
      } else {
        assert(Number(r.amount) > 0, '奖励数值应为正：' + JSON.stringify(r));
      }
    });
  });
  assert(dynastyData.rowOf(0) === null && dynastyData.rowOf(51) === null && !!dynastyData.rowOf(50), 'rowOf 边界不符');
  /* 领取的都是补给与货币，没有卡 / 时刻卡 / 装备入口 */
  const kinds = new Set();
  dynastyData.PASS_TRACK.forEach((row) => dynastyUtil.rewardsOf(row.free).concat(dynastyUtil.rewardsOf(row.premium)).forEach((r) => kinds.add(r.kind)));
  assert(!kinds.has('card') && !kinds.has('moment') && !kinds.has('equipment'), '奖励轨出现了直接战力类型：' + Array.from(kinds).join(','));
  return true;
});

check('日期数学与等级纯函数边界：dayNumber / seasonIndexOf / daysLeftOf / rollIfNeeded / levelOf / progressOf', () => {
  assert(dynastyUtil.dayNumber('1970-01-01') === 0 && dynastyUtil.dayNumber('1970-01-02') === 1, 'dayNumber 起点换算错');
  assert(dynastyUtil.dayNumber('1970-02-01') === 31, 'dayNumber 跨月换算错');
  ['', 'junk', '2026-1-1', null].forEach((bad) => assert(dynastyUtil.dayNumber(bad) === null, '非法日期应返回 null：' + bad));

  assert(dynastyUtil.seasonIndexOf('2026-10-01', '2026-10-29') === 0, '第 28 天不该进下赛季');
  assert(dynastyUtil.seasonIndexOf('2026-10-01', '2026-10-30') === 0, '第 29 天不该进下赛季');
  assert(dynastyUtil.seasonIndexOf('2026-10-01', '2026-10-31') === 1, '整 30 天应进下赛季');
  assert(dynastyUtil.seasonIndexOf('2026-10-01', '2026-11-30') === 2, '第 60 天应进第 3 个赛季');
  assert(dynastyUtil.seasonIndexOf('2026-10-01', '2026-09-01') === 0, '未来日期不该给出负赛季号');
  assert(dynastyUtil.seasonIndexOf('junk', '2026-10-01') === 0, '非法 startKey 应回退 0');

  const e = dynastyUtil.empty('2026-10-01');
  assert(dynastyUtil.daysLeftOf(e, '2026-10-01') === 30, '开季当天应剩 30 天');
  assert(dynastyUtil.daysLeftOf(e, '2026-10-15') === 16, '第 15 天应剩 16 天');
  assert(dynastyUtil.daysLeftOf(e, '2026-10-30') === 1, '窗口最后一天应剩 1 天');
  assert(dynastyUtil.daysLeftOf({ startKey: 'junk' }, '2026-10-01') === 30, '非法 startKey 应回退满窗');
  assert(dynastyUtil.rollIfNeeded(e, '2026-10-30').rolled === false, '第 29 天不应滚动');
  assert(dynastyUtil.rollIfNeeded(e, '2026-10-31').rolled === true, '整 30 天必须滚动');
  assert(dynastyUtil.rollIfNeeded(e, 'junk').rolled === false, '非法 dayKey 不该滚动（reducer 不猜时间）');

  assert(dynastyUtil.levelOf(0) === 0 && dynastyUtil.levelOf(399) === 0, 'Lv.0 边界错');
  assert(dynastyUtil.levelOf(400) === 1 && dynastyUtil.levelOf(401) === 1, 'Lv.1 边界错');
  assert(dynastyUtil.levelOf(19999) === 49 && dynastyUtil.levelOf(20000) === 50 && dynastyUtil.levelOf(99999) === 50, '满级封顶错');
  assert(dynastyUtil.levelOf(-5) === 0, '负分应回退 Lv.0');

  const p0 = dynastyUtil.progressOf(0);
  assert(p0.level === 0 && p0.into === 0 && p0.toNext === 400 && p0.nextLevelPoints === 400 && p0.maxed === false, '零进度口径错');
  const p45 = dynastyUtil.progressOf(18000);
  assert(p45.level === 45 && p45.into === 0 && p45.toNext === 400, '整级进度口径错');
  const pmax = dynastyUtil.progressOf(20000);
  assert(pmax.maxed === true && pmax.into === 400 && pmax.ratio === 1 && pmax.toNext === 0, '满级进度口径错');
  return true;
});

check('积分口径：win / draw / lose × 模式 + 首通；计数器确定性推进；纯函数不改入参', () => {
  const d0 = dynastyUtil.empty('2026-10-01');
  const snap = JSON.stringify(d0);
  const at = (info) => dynastyUtil.planSettle(d0, '2026-10-01', info);
  const g = (info) => at(info).pointsGained;
  assert(g({ mode: 'pve', result: 'win', stars: 1, playStyle: 'balanced', gold: 0 }) === 120, 'PVE 胜场基础分错');
  assert(g({ mode: 'pve', result: 'draw', playStyle: 'balanced', gold: 0 }) === 60, 'PVE 平局分错');
  assert(g({ mode: 'pve', result: 'lose', playStyle: 'balanced', gold: 0 }) === 30, 'PVE 败场分错');
  assert(g({ mode: 'arena', result: 'win', playStyle: 'balanced', gold: 0 }) === 150, '天梯胜场分错');
  assert(g({ mode: 'arena', result: 'draw', playStyle: 'balanced', gold: 0 }) === 75, '天梯平局分错');
  assert(g({ mode: 'arena', result: 'lose', playStyle: 'balanced', gold: 0 }) === 50, '天梯败场分错');
  assert(g({ mode: 'pve', result: 'win', stars: 1, firstClear: true, playStyle: 'balanced', gold: 0 }) === 220, '首通应额外 +100');
  assert(g({ mode: 'nope', result: 'weird', playStyle: 'balanced', gold: 0 }) === 30, '未知模式/结果应回退 PVE 败场口径');
  assert(JSON.stringify(d0) === snap, 'planSettle 改动了入参（不再是纯函数）');
  assert(JSON.stringify(at({ mode: 'pve', result: 'win', stars: 1, gold: 0 })) === JSON.stringify(at({ mode: 'pve', result: 'win', stars: 1, gold: 0 })), '同输入两次计划不一致');

  const r = at({ mode: 'arena', result: 'win', stars: 3, playStyle: 'inside', gold: 700 });
  assert(r.dynasty.missions.arenaWins === 1 && r.dynasty.missions.insideWins === 1 && r.dynasty.missions.bestStreak === 1, '胜场计数器未推进');
  assert(r.dynasty.missions.arenaBattles === 1 && r.dynasty.missions.perfectWins === undefined, '天梯不该计 3★（perfectWins 仅 PVE）');
  assert(r.dynasty.missions.goldEarned === 700, '金币累计口径错');
  const r2 = at({ mode: 'pve', result: 'win', stars: 3, playStyle: 'perimeter', gold: 1200 });
  assert(r2.dynasty.missions.perfectWins === 1 && r2.dynasty.missions.perimeterWins === 1, 'PVE 3★ / 打法胜场未计');
  const preStreak = Object.assign(dynastyUtil.empty('2026-10-01'), { missions: { streak: 2, bestStreak: 2 } });
  const r3 = dynastyUtil.planSettle(preStreak, '2026-10-01', { mode: 'pve', result: 'draw', playStyle: 'balanced', gold: 300 });
  assert(r3.dynasty.missions.streak === 0 && r3.dynasty.missions.bestStreak === 2, '平局应断连胜但保留历史最佳');
  /* 任务一次发分：把 pveWins 顶到 4，再胜一场 = 基础分 + 任务分，且 completed 记账 */
  const near = Object.assign(dynastyUtil.empty('2026-10-01'), { missions: { pveWins: 4 } });
  const first = dynastyUtil.planSettle(near, '2026-10-01', { mode: 'pve', result: 'win', stars: 1, playStyle: 'balanced', gold: 0 });
  assert(first.pointsGained === 270, '达成任务的当次应加发任务分（120 + 150）：' + first.pointsGained);
  assert(first.missionsCompleted.length === 1 && first.missionsCompleted[0].id === 'm_pve_1', '任务达成清单缺 m_pve_1');
  const second = dynastyUtil.planSettle(first.dynasty, '2026-10-01', { mode: 'pve', result: 'win', stars: 1, playStyle: 'balanced', gold: 0 });
  assert(second.pointsGained === 120, '任务分被重复发放：' + second.pointsGained);
  assert(second.missionsCompleted.length === 0, '已完成任务不该再次达成');
  return true;
});

check('reducer 账本：连胜链 / 任务只发一次分 / 升级通知，且战报通知仍在动态流 [0]', () => {
  const base = initState.createInitialState(0);
  const win = (i) => store.actions.battleResult({
    result: { result: 'win', stars: 2, margin: 6, homeScore: 70, awayScore: 64 },
    stageId: 's1-1', staminaCost: 6, rewards: { gold: 1000 }, dayKey: '2026-10-01', now: 1000 + i
  });
  let st = Object.assign({}, base, { dynasty: dynastyUtil.empty('2026-10-01') });
  st = reducers.reduce(st, win(1));
  assert(st.dynasty.points === 220, '首胜应为 120 + 首通 100：' + st.dynasty.points);
  st = reducers.reduce(st, win(2));
  assert(st.dynasty.points === 340 && st.dynasty.missions.streak === 2 && st.dynasty.missions.bestStreak === 2, '第二胜积分 / 连胜不符');
  st = reducers.reduce(st, win(3));
  assert(st.dynasty.points === 610, '第三胜应触发三连击 +150：' + st.dynasty.points);
  assert(st.dynasty.completed.m_streak_1 === true, '三连击未写账本');
  assert(JSON.stringify(st.notices).indexOf('赛季任务达成') !== -1, '任务达成未推通知');
  assert((st.notices[0] || {}).kind === 'battle', '战报通知应仍在动态流 [0]');
  st = reducers.reduce(st, win(4));
  assert(st.dynasty.points === 730, '第四胜不该重复发任务分：' + st.dynasty.points);
  /* 升级通知：399 分 + 120 = 519 跨过 Lv.1（本场无任务达成，走升级分支）。
   * daily 段种子成「同一天且计数器不会跨阈值」——否则里程碑 4 的每日任务通知会插在升级通知前面，
   * 位次断言 [1] 失去意义（每日通知自己的位次由 Q 组用例专门锁）。 */
  const pre = Object.assign({}, base, {
    dynasty: Object.assign(dynastyUtil.empty('2026-10-01'), { points: 399 }),
    daily: { dayKey: '2026-10-01', counters: { battles: 1, wins: 2 } }
  });
  const lv = reducers.reduce(pre, win(9));
  assert(lv.dynasty.points === 619 && dynastyUtil.levelOf(lv.dynasty.points) === 1, '升级链分数错：' + lv.dynasty.points);
  assert((lv.notices[1] || {}).text.indexOf('升至 Lv.1') !== -1, '升级通知缺失：' + JSON.stringify(lv.notices.slice(0, 2)));
  return true;
});

check('PVE 三侧同解（命令返回值 == 纯函数计划 == 落库），首通只算一次', () => {
  pRestore();
  const table = DYCFG.points;
  const before = JSON.parse(JSON.stringify(store.getState()));
  const r1 = store.startBattle({ stageId: 's1-1', seed: 'px-p1' });
  assert(r1.ok, '开赛失败：' + r1.reason);
  const dayKey = pToday();
  const exp1 = dynastyUtil.planSettle(before.dynasty, dayKey, {
    mode: 'pve', result: r1.result.result, stars: r1.result.stars, playStyle: before.roster.playStyle,
    firstClear: true, gold: r1.rewards.gold
  });
  const after1 = store.getState();
  assert(JSON.stringify(after1.dynasty) === JSON.stringify(exp1.dynasty), '命令返回值 / 纯函数 / 落库三者不一致');
  assert(r1.rewards.firstClear === true, '本场应为首通（+100 的对照前提）');
  const base1 = r1.result.result === 'win' ? table.pveWin : (r1.result.result === 'draw' ? table.pveDraw : table.pveLose);
  assert(exp1.missionsCompleted.length === 0, '干净存档首场 PVE 不应达成任务（防数据漂移）');
  assert(exp1.pointsGained === base1 + table.firstClear, '首场积分应 = 基础分 + 首通：' + exp1.pointsGained);
  assert(r1.dynasty.pointsGained === exp1.pointsGained && r1.dynasty.level === exp1.levelAfter, '命令返回的王朝增量与纯函数不一致');
  assert(r1.dynasty.levelUp === (exp1.levelAfter > exp1.levelBefore), 'levelUp 口径不一致');
  assert(JSON.stringify(r1.dynasty.missions) === JSON.stringify(exp1.missionsCompleted.map((m) => m.name)), '任务清单口径不一致');
  assert(after1.dynasty.points === before.dynasty.points + exp1.pointsGained, '落库积分与计划不符');
  assert(selectors.dynastyView(after1, Date.now()).level === r1.dynasty.level, '面板等级与视图不一致');
  /* 第二场（重复挑战）：不再发首通 */
  const before2 = JSON.parse(JSON.stringify(store.getState()));
  const r2 = store.startBattle({ stageId: 's1-1', seed: 'px-p2' });
  assert(r2.ok && r2.rewards.firstClear === false, '重复挑战不该再发首通');
  const base2 = r2.result.result === 'win' ? table.pveWin : (r2.result.result === 'draw' ? table.pveDraw : table.pveLose);
  const exp2 = dynastyUtil.planSettle(before2.dynasty, pToday(), {
    mode: 'pve', result: r2.result.result, stars: r2.result.stars, playStyle: 'balanced',
    firstClear: false, gold: r2.rewards.gold
  });
  assert(exp2.pointsGained === base2, '第二场不应再 +100：' + exp2.pointsGained);
  assert(JSON.stringify(store.getState().dynasty) === JSON.stringify(exp2.dynasty), '第二场落库与计划不符');
  pRestore();
  return true;
});

check('竞技场三侧同解：命令返回值 == 纯函数计划 == 落库，且不改竞技场自身口径', () => {
  pRestore();
  const before = JSON.parse(JSON.stringify(store.getState()));
  const av = selectors.arenaView(store.getState(), Date.now());
  const r = store.arenaChallenge({ opponentId: 'a01', seed: 'px-a1' });
  assert(r.ok, '竞技场开赛失败：' + r.reason);
  const exp = dynastyUtil.planSettle(before.dynasty, av.daily.dayKey, {
    mode: 'arena', result: r.result.result, playStyle: before.roster.playStyle, firstClear: false, gold: r.rewards.gold
  });
  const after = store.getState();
  assert(JSON.stringify(after.dynasty) === JSON.stringify(exp.dynasty), '竞技场王朝计划三侧不一致');
  assert(r.dynasty.pointsGained === exp.pointsGained && r.dynasty.level === exp.levelAfter, '命令返回增量与纯函数不一致');
  const table = DYCFG.points;
  const base = r.result.result === 'win' ? table.arenaWin : (r.result.result === 'draw' ? table.arenaDraw : table.arenaLose);
  assert(exp.pointsGained >= base, '天梯基础分口径错');
  assert(after.arena.matches === before.arena.matches + 1 && after.arena.usedToday === before.arena.usedToday + 1, '竞技场口径被王朝影响');
  pRestore();
  return true;
});

check('跨窗滚动：整 30 天滚动重置（纯函数 / reducer / 结算路径 / 命令），视图虚拟滚动不落库', () => {
  const e = dynastyUtil.empty('2026-10-01');
  assert(dynastyUtil.rollIfNeeded(e, '2026-10-30').rolled === false, '第 29 天不应滚动');
  assert(dynastyUtil.rollIfNeeded(e, '2026-10-31').rolled === true, '整 30 天必须滚动');
  /* reducer 通道：滚动清空积分 / 任务 / 账本 / 王朝轨，并推一条可读通知 */
  const base = initState.createInitialState(0);
  const st = Object.assign({}, base, {
    dynasty: { startKey: '2026-10-01', points: 6100, premium: true, missions: { pveWins: 9, streak: 4 }, completed: { m_streak_1: true }, claimed: { 'free:1': true, 'premium:5': true } }
  });
  const r1 = reducers.reduce(st, store.actions.dynastySync('2026-11-05', 900));
  assert(r1 !== st && r1.dynasty.startKey === '2026-11-05' && r1.dynasty.points === 0 && r1.dynasty.premium === false, '滚动未重置赛季段');
  assert(JSON.stringify(r1.dynasty.missions) === '{}' && JSON.stringify(r1.dynasty.completed) === '{}' && JSON.stringify(r1.dynasty.claimed) === '{}', '滚动应清空任务与账本');
  assert((r1.notices[0] || {}).kind === 'dynasty' && r1.notices[0].text.indexOf('新赛季开启') !== -1, '滚动缺通知');
  assert(reducers.reduce(st, store.actions.dynastySync('2026-10-20', 900)) === st, '未跨窗的 SYNC 不该落库');
  /* 结算路径：同一场结算先滚动再记账，并补一条新赛季通知（战报仍在 [0]） */
  const st2 = Object.assign({}, base, { dynasty: { startKey: '2026-10-01', points: 700, premium: true, missions: {}, completed: {}, claimed: {} } });
  const r2 = reducers.reduce(st2, store.actions.battleResult({
    result: { result: 'win', stars: 2, margin: 5, homeScore: 70, awayScore: 65 },
    stageId: 's1-1', staminaCost: 6, rewards: { gold: 1000 }, dayKey: '2026-11-02', now: 1200
  }));
  assert(r2.dynasty.startKey === '2026-11-02' && r2.dynasty.premium === false, '结算路径未滚动');
  assert(r2.dynasty.points === 220, '滚动后的首场结算应从新赛季起算：' + r2.dynasty.points);
  assert(JSON.stringify(r2.notices).indexOf('新赛季开启') !== -1, '结算路径滚动缺通知');
  assert((r2.notices[0] || {}).kind === 'battle', '战报通知应仍在动态流 [0]');
  /* 命令通道 + 虚拟视图：注入过期存档 → 视图先呈现新赛季（不落库），dynastySync 才真正滚动 */
  pInject((s) => { s.dynasty = { startKey: pDay(-40), points: 7777, premium: true, missions: { pveWins: 9 }, completed: { m_pve_1: true }, claimed: { 'free:1': true } }; });
  const vBefore = selectors.dynastyView(store.getState(), Date.now());
  assert(vBefore.points === 0 && vBefore.startKey === pToday() && vBefore.premium === false, '视图应虚拟滚动到新赛季');
  assert(store.getState().dynasty.startKey === pDay(-40) && store.getState().dynasty.points === 7777, '视图展示不该提前落库');
  const sync = store.dynastySync();
  assert(sync.ok && sync.rolled === true, 'dynastySync 应执行滚动');
  assert(store.getState().dynasty.points === 0 && store.getState().dynasty.startKey === pToday() && store.getState().dynasty.premium === false, '命令滚动未落库');
  assert((store.getState().notices[0] || {}).text.indexOf('新赛季开启') !== -1, '命令滚动缺通知');
  const again = store.dynastySync();
  assert(again.ok && again.rolled === false, '已滚动的赛季不该重复滚动');
  pRestore();
  return true;
});

check('缺 dayKey / 非法 dayKey：结算不记账（老直派调用方不受影响），reducer 拒绝落库', () => {
  const base = initState.createInitialState(0);
  const st = Object.assign({}, base, { dynasty: { startKey: '2026-10-01', points: 333, premium: false, missions: {}, completed: {}, claimed: {} } });
  const noKey = reducers.reduce(st, store.actions.battleResult({
    result: { result: 'win' }, stageId: 's1-1', staminaCost: 6, rewards: {}, now: 1000
  }));
  assert(noKey.dynasty === st.dynasty, '缺 dayKey 的结算动了王朝段（旧直派测试的兼容性）');
  const mk = (dayKey) => store.actions.battleResult({
    result: { result: 'win', stars: 2, margin: 5, homeScore: 70, awayScore: 65 },
    stageId: 's1-1', staminaCost: 6, rewards: { gold: 1000 }, dayKey, now: 1000
  });
  const junk = reducers.reduce(st, mk('junk'));
  assert(junk.dynasty === st.dynasty, '非法 dayKey 的结算动了王朝段');
  assert(junk.notices.length === st.notices.length + 1, '非法 dayKey 不应影响战报通知');
  const arenaJunk = reducers.reduce(st, store.actions.arenaResult({
    result: { result: 'win', margin: 5 }, rewards: {}, staminaCost: 10, dayKey: 'junk',
    ratingDelta: 10, opponentId: 'a01', seed: 's', snapshot: null, now: 1000
  }));
  assert(arenaJunk.dynasty === st.dynasty, '竞技场非法 dayKey 动了王朝段');
  return true;
});

check('领奖闭环（命令层）：免费轨到账 + 账本 + 重复 / 越界 / 未达成 / 未解锁 / 坏轨道全拒绝', () => {
  pInject((s) => { s.dynasty = { startKey: pToday(), points: 900, premium: false, missions: {}, completed: {}, claimed: {} }; });
  const gold0 = store.getState().profile.gold;
  const r1 = store.claimDynastyReward(1, 'free');
  assert(r1.ok && r1.level === 1 && r1.track === 'free' && r1.rewardText === '金币 ×400', 'Lv.1 免费轨领取失败：' + JSON.stringify(r1));
  assert(store.getState().profile.gold === gold0 + 400, '奖励未到账');
  assert(store.getState().dynasty.claimed['free:1'] === true, '领奖账本未写');
  assert((store.getState().notices[0] || {}).kind === 'dynasty' && store.getState().notices[0].text.indexOf('Lv.1') !== -1, '领奖通知缺失');
  const v1 = selectors.dynastyView(store.getState(), Date.now());
  assert(v1.claimableCount === 1 && v1.rows[0].free.claimed === true && v1.rows[0].free.btnText === '已领取', '视图未反映已领取');
  expectStoreFail('重复领取', () => store.claimDynastyReward(1, 'free'), /已经领过/);
  expectStoreFail('等级越界', () => store.claimDynastyReward(99, 'free'), /等级不存在/);
  expectStoreFail('等级未达成', () => store.claimDynastyReward(5, 'free'), /积分还不够/);
  expectStoreFail('王朝轨未解锁', () => store.claimDynastyReward(1, 'premium'), /尚未解锁/);
  expectStoreFail('坏轨道名', () => store.claimDynastyReward(2, 'nope'), /奖励轨不存在/);
  const r2 = store.claimDynastyReward(2, 'free');
  assert(r2.ok && store.getState().profile.gold === gold0 + 400 + 450, '第二级奖励未到账');
  const v2 = selectors.dynastyView(store.getState(), Date.now());
  assert(v2.claimableCount === 0 && v2.claimableText === '暂无待领奖励', '领完应无可领提示：' + v2.claimableText);
  pRestore();
  return true;
});

check('王朝轨解锁闭环（命令层）：余额不足拒绝 / 成功扣钻 / 重复拒绝 / 解锁后 premium 奖励到账', () => {
  pInject((s) => {
    s.dynasty = { startKey: pToday(), points: 2400, premium: false, missions: {}, completed: {}, claimed: {} };
    s.profile.diamond = 1000;
  });
  expectStoreFail('钻石不足', () => store.unlockDynastyPremium(), /钻石不足/);
  pInject((s) => {
    s.dynasty = { startKey: pToday(), points: 4100, premium: false, missions: {}, completed: {}, claimed: {} };
    s.profile.diamond = 3000;
  });
  const dia0 = store.getState().profile.diamond;
  const u = store.unlockDynastyPremium();
  assert(u.ok && u.cost === DYCFG.premiumCost, '解锁失败：' + JSON.stringify(u));
  assert(store.getState().profile.diamond === dia0 - DYCFG.premiumCost && store.getState().dynasty.premium === true, '解锁未扣钻 / 未记账');
  assert((store.getState().notices[0] || {}).text.indexOf('王朝轨已解锁') !== -1, '解锁通知缺失');
  expectStoreFail('重复解锁', () => store.unlockDynastyPremium(), /已解锁/);
  const bag0 = Number(store.getState().bag['gold_pack']) || 0;
  const c5 = store.claimDynastyReward(5, 'premium');
  assert(c5.ok && (Number(store.getState().bag['gold_pack']) || 0) === bag0 + 2, 'premium Lv.5 道具未到账');
  const dia1 = store.getState().profile.diamond;
  const c10 = store.claimDynastyReward(10, 'premium');
  assert(c10.ok && store.getState().profile.diamond === dia1 + 40, 'premium Lv.10 钻石未到账');
  const v = selectors.dynastyView(store.getState(), Date.now());
  assert(v.premium === true && v.premiumCan === false && v.premiumBtnText === '王朝轨已解锁', '解锁后视图口径错');
  assert(v.claimableCount === 10 + 2 - 2, '解锁并领取两档后可领数不符：' + v.claimableCount);
  assert(v.rows[4].premium.claimed === true && v.rows[9].premium.claimed === true, 'premium 账本未反映');
  pRestore();
  return true;
});

check('reducer 防御：直派非法王朝 payload 一律恒等返回（合法 payload 反向对照）', () => {
  const base = initState.createInitialState(0);
  const st = Object.assign({}, base, { dynasty: { startKey: '2026-10-01', points: 900, premium: false, missions: {}, completed: {}, claimed: {} } });
  const T = store.actions.T;
  ['DYNASTY_SYNC', 'DYNASTY_CLAIM', 'DYNASTY_PREMIUM'].forEach((k) => assert(typeof T[k] === 'string', '缺 action 常量 ' + k));
  assert(reducers.reduce(st, store.actions.dynastySync('junk', 100)) === st, '非法 dayKey 的 SYNC 动了存档');
  assert(reducers.reduce(st, store.actions.dynastySync('2026-10-01', 100)) === st, '未跨窗 SYNC 应恒等（不需要落库）');
  assert(reducers.reduce(st, store.actions.dynastyClaim(99, 'free', '2026-10-01', 100)) === st, '等级越界动了存档');
  assert(reducers.reduce(st, store.actions.dynastyClaim(2, 'nope', '2026-10-01', 100)) === st, '轨名注入动了存档');
  assert(reducers.reduce(st, store.actions.dynastyClaim(3, 'free', '2026-10-01', 100)) === st, '未达成等级动了存档');
  assert(reducers.reduce(st, store.actions.dynastyClaim(2, 'free', 'junk', 100)) === st, '非法 dayKey 的 CLAIM 动了存档');
  const lowDia = Object.assign({}, st, { profile: Object.assign({}, st.profile, { diamond: 100 }) });
  assert(reducers.reduce(lowDia, store.actions.dynastyPremium('2026-10-01', 100)) === lowDia, '余额不足的解锁动了存档');
  assert(reducers.reduce(st, store.actions.dynastyPremium('junk', 100)) === st, '非法 dayKey 的解锁动了存档');
  /* 反向对照：同一份纯函数口径下，合法 payload 必须能过 */
  const okClaim = reducers.reduce(st, store.actions.dynastyClaim(2, 'free', '2026-10-01', 100));
  assert(okClaim !== st && okClaim.dynasty.claimed['free:2'] === true && okClaim.profile.gold === st.profile.gold + 450, '合法领奖被误拒');
  const okPrem = reducers.reduce(st, store.actions.dynastyPremium('2026-10-01', 100));
  assert(okPrem !== st && okPrem.dynasty.premium === true && okPrem.profile.diamond === st.profile.diamond - DYCFG.premiumCost, '合法解锁被误拒');
  const okSync = reducers.reduce(st, store.actions.dynastySync('2026-11-05', 100));
  assert(okSync !== st && okSync.dynasty.startKey === '2026-11-05' && okSync.dynasty.points === 0, '合法滚动被误拒');
  return true;
});

check('存档迁移与往返：无 dynasty 段补空壳、脏形状归一、合法值往返逐字节一致', () => {
  const noDyn = store.migrate({ profile: { gold: 5 } }, 1000);
  assert(noDyn.dynasty && noDyn.dynasty.startKey === arenaUtil.dayKeyOf(1000), '老存档应补空壳且起点 = 建档当天');
  assert(noDyn.dynasty.points === 0 && noDyn.dynasty.premium === false && JSON.stringify(noDyn.dynasty.missions) === '{}', '空壳形状不符');
  const dirty = store.migrate({
    dynasty: {
      startKey: 'xx', points: -3.7, premium: 'yes',
      missions: { pveWins: '4', junk: 9, neg: -2 },
      completed: { m_pve_1: 1, nonexistent: true },
      claimed: { 'free:1': true, 'evil:2': true, 'free:abc': true }
    }
  }, 1000);
  assert(dirty.dynasty.startKey === arenaUtil.dayKeyOf(1000), '非法 startKey 应回退建档当天');
  assert(dirty.dynasty.points === 0 && dirty.dynasty.premium === true, 'points / premium 归一错：' + JSON.stringify(dirty.dynasty));
  assert(dirty.dynasty.missions.pveWins === 4 && dirty.dynasty.missions.junk === undefined && dirty.dynasty.missions.neg === undefined, '计数器白名单清洗错');
  assert(dirty.dynasty.completed.m_pve_1 === true && dirty.dynasty.completed.nonexistent === undefined, '完成任务账本清洗错');
  assert(dirty.dynasty.claimed['free:1'] === true && dirty.dynasty.claimed['evil:2'] === undefined && dirty.dynasty.claimed['free:abc'] === undefined, '领奖账本清洗错');
  assert(dynastyUtil.normalize({ startKey: '2026-10-01', points: 7.9 }, '2026-11-01').startKey === '2026-10-01', '合法 startKey 不该被覆盖');
  assert(dynastyUtil.normalize(null, '2026-11-01').startKey === '2026-11-01', '空值应取传入 dayKey');
  /* 往返：注入一份完整存档 → export → migrate 回来逐字节一致 */
  pInject((s) => {
    s.dynasty = {
      startKey: pToday(), points: 610, premium: true,
      missions: { pveWins: 3, streak: 1, bestStreak: 3 }, completed: { m_streak_1: true }, claimed: { 'free:1': true, 'premium:5': true }
    };
  });
  const round = store.migrate(JSON.parse(store.exportSave()), 5000);
  assert(JSON.stringify(round.dynasty) === JSON.stringify(store.getState().dynasty), '存档往返 dynasty 漂移');
  pRestore();
  return true;
});

check('enabled=false：命令全拒绝、结算不累计、视图可读，恢复开关后立即可用（反向对照）', () => {
  pInject((s) => { s.dynasty = { startKey: pToday(), points: 500, premium: false, missions: {}, completed: {}, claimed: {} }; });
  withDynasty({ enabled: false }, () => {
    expectStoreFail('关闭时同步', () => store.dynastySync(), /尚未开放/);
    expectStoreFail('关闭时领奖', () => store.claimDynastyReward(1, 'free'), /尚未开放/);
    expectStoreFail('关闭时解锁', () => store.unlockDynastyPremium(), /尚未开放/);
    const before = JSON.stringify(store.getState().dynasty);
    const rb = store.startBattle({ stageId: 's1-1', seed: 'px-off' });
    assert(rb.ok && rb.dynasty === null, '关闭时结算不该返回王朝增量');
    assert(JSON.stringify(store.getState().dynasty) === before, '关闭时结算累计了王朝积分');
    const v = selectors.dynastyView(store.getState(), Date.now());
    assert(v.enabled === false && v.claimableCount === 0 && v.premiumCan === false, '关闭时视图仍在推销奖励');
    assert(v.premiumReason === '王朝赛季尚未开放' && v.note.indexOf('不含任何直接战力') !== -1, '关闭时缺少可读说明');
    assert(selectors.dynastySummary(store.getState(), Date.now()).claimable === 0, '关闭时摘要不该有可领数');
    const st0 = store.getState();
    assert(reducers.reduce(st0, store.actions.dynastySync(pToday(), 100)) === st0, '关闭时 reducer 仍有后门');
    assert(reducers.reduce(st0, store.actions.dynastyPremium(pToday(), 100)) === st0, '关闭时解锁仍有后门');
  });
  /* 反向对照：恢复开关后同一存档立即可领 */
  const back = store.claimDynastyReward(1, 'free');
  assert(back.ok && store.getState().dynasty.claimed['free:1'] === true, '恢复开关后领奖失败');
  pRestore();
  return true;
});

check('王朝页：字段 == selectors.dynastyView；onClaim / onUnlockPremium 从页面真实驱动到 store', () => {
  pInject((s) => {
    s.dynasty = { startKey: pToday(), points: 4100, premium: false, missions: { pveWins: 2, streak: 1 }, completed: {}, claimed: {} };
    s.profile.diamond = 3000;
  });
  kResetUi();
  N_UI.modals.length = 0;
  const inst = kMount('pages/dynasty/dynasty.js', {});
  try {
    const v = selectors.dynastyView(store.getState(), Date.now());
    assert(inst.data.pointsText === v.pointsText && inst.data.levelText === v.levelText, '概览口径漂移');
    assert(inst.data.daysLeftText === v.daysLeftText && inst.data.seasonTitle === v.seasonTitle, '赛季窗口口径漂移');
    assert(inst.data.claimableCount === v.claimableCount && inst.data.claimableText === v.claimableText, '可领数口径漂移');
    assert(inst.data.rows.length === v.rowCount && inst.data.rowCount === DYCFG.levels, '通行证行数与等级数不符');
    assert(inst.data.missionDone === v.missionDone && inst.data.missions.length === v.missionCount, '任务口径漂移');
    assert(inst.data.rows[0].free.claimable === true && inst.data.rows[0].premium.claimable === false, '首行可领状态不符');
    assert(inst.data.rows[4].premium.btnText === '待解锁', '未解锁轨按钮文案错');
    assert(inst.data.premiumCan === true && inst.data.premiumReason === '', '解锁面板初始态错');
    /* 领奖：免费轨 Lv.1（二次确认 → 命令 → toast → 页面随 store 刷新） */
    const gold0 = store.getState().profile.gold;
    inst.onClaim({ currentTarget: { dataset: { level: 1, track: 'free' } } });
    assert(N_UI.modals.length === 1 && N_UI.modals[0].title === '领取 Lv.1 奖励', '缺领奖二次确认');
    assert(store.getState().profile.gold === gold0 + 400 && store.getState().dynasty.claimed['free:1'] === true, '页面领奖未落地');
    assert(K_UI.toast.some((t) => t === '已领取 金币 ×400'), '缺领奖 toast：' + JSON.stringify(K_UI.toast));
    assert(inst.data.claimableCount === v.claimableCount - 1, '页面可领数没随 store 刷新');
    /* 重复点同一格：本地已不可领 ⇒ 只提示，不再弹确认 */
    inst.onClaim({ currentTarget: { dataset: { level: 1, track: 'free' } } });
    assert(N_UI.modals.length === 1, '不可领的格子还能弹确认');
    assert(K_UI.toast.some((t) => t === '现在还不能领'), '不可领缺少拒绝提示');
    /* 解锁王朝轨 + 领 premium Lv.5 */
    inst.onUnlockPremium();
    assert(N_UI.modals.length === 2 && N_UI.modals[1].title === '解锁王朝轨', '缺解锁二次确认');
    assert(store.getState().dynasty.premium === true && store.getState().profile.diamond === 1720, '页面解锁未落地');
    assert(inst.data.premium === true && inst.data.premiumCan === false && inst.data.premiumBtnText === '王朝轨已解锁', '页面解锁态没刷新');
    const bag0 = Number(store.getState().bag['gold_pack']) || 0;
    inst.onClaim({ currentTarget: { dataset: { level: 5, track: 'premium' } } });
    assert((Number(store.getState().bag['gold_pack']) || 0) === bag0 + 2, 'premium 领奖未落地');
    assert(K_UI.toast.some((t) => t === '已领取 金币袋 ×2'), 'premium 领奖 toast 缺失');
    /* 入口跳转：竞技场是非 tab 页，必须走 navigateTo（坑 15） */
    kResetUi();
    inst.goArena();
    assert(K_UI.navigateTo.indexOf('/pages/arena/arena') !== -1, 'goArena 应走 navigateTo');
    assert(store.dynastySync().rolled === false, 'onShow 的同步命令应是无副作用直通');
  } finally { kUnmount(inst); }
  pRestore();
  return true;
});

check('入口与摘要：主页快捷入口走 navigateTo；个人页面板 == dynastySummary；比赛结算面板带赛季积分行', () => {
  pInject((s) => {
    s.dynasty = { startKey: pToday(), points: 610, premium: false, missions: { pveWins: 3 }, completed: { m_streak_1: true }, claimed: {} };
  });
  kResetUi();
  const home = kMount('pages/home/home.js', {});
  try {
    const q = home.data.quickLinks.filter((x) => x.key === 'dynasty')[0];
    assert(q && q.url === '/pages/dynasty/dynasty' && q.tab === false, '主页缺王朝快捷入口');
    home.onQuick({ currentTarget: { dataset: { key: 'dynasty' } } });
    assert(K_UI.navigateTo.indexOf('/pages/dynasty/dynasty') !== -1, '王朝入口应走 navigateTo（非 tab 页）');
  } finally { kUnmount(home); }

  const prof = kMount('pages/profile/profile.js', {});
  try {
    const sum = selectors.dynastySummary(store.getState(), Date.now());
    assert(prof.data.dynastyEnabled === true && prof.data.dynastyLevelText === sum.levelText, '个人页王朝等级口径漂移');
    assert(prof.data.dynastyPointsText === sum.pointsText && prof.data.dynastyDaysLeftText === sum.daysLeftText, '个人页王朝摘要漂移');
    assert(prof.data.dynastyClaimableText === sum.claimableText, '个人页待领口径漂移');
    kResetUi();
    prof.goDynasty();
    assert(K_UI.navigateTo.indexOf('/pages/dynasty/dynasty') !== -1, 'goDynasty 应走 navigateTo');
  } finally { kUnmount(prof); }

  const gm = kPlayMatch({ stageId: 's1-1', seed: 'px-pm' });
  try {
    const gains = gm.dynastyGains;
    assert(gains && gains.pointsGained > 0, 'PVE 结算未带王朝增量');
    const line = gm.data.rewardLines.filter((l) => l.k === '赛季积分')[0];
    assert(line && line.v.indexOf('+' + gains.pointsGained) === 0, '结算面板赛季积分行缺失或不一致：' + JSON.stringify(gm.data.rewardLines));
    if (gains.missions.length) assert(gm.data.dynastyMissionText.indexOf(gains.missions[0]) !== -1, '任务达成行缺失');
  } finally { kUnmount(gm); }
  pRestore();
  return true;
});

check('历史回放不重发赛季积分：回放路径无王朝增量、不显示积分 / 任务行', () => {
  pRestore();
  const r = store.arenaChallenge({ opponentId: 'a01', seed: 'px-replay-1' });
  assert(r.ok, '竞技场开赛失败：' + r.reason);
  const afterChallenge = JSON.stringify(store.getState().dynasty);
  const inst = kPlayMatch({ mode: 'arena', hist: 0 });
  try {
    assert(!inst.data.error, '回放页面报错：' + inst.data.error);
    assert(inst.data.arenaReplayNote === true && inst.dynastyGains === null, '回放不该有王朝增量');
    assert(!inst.data.rewardLines.some((l) => l.k === '赛季积分'), '回放不该显示赛季积分行');
    assert(inst.data.dynastyMissionText === '', '回放不该显示任务达成行');
    assert(JSON.stringify(store.getState().dynasty) === afterChallenge, '回放改动了王朝积分');
  } finally { kUnmount(inst); }
  pRestore();
  return true;
});

check('王朝页 / 个人页 / 比赛页模板：两轨列表、领取、解锁、任务、积分行都在（防「有字段不渲染」）', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/dynasty/dynasty.wxml'), 'utf8');
  [
    ['wx:for="{{missions}}"', '缺任务列表'],
    ['wx:for="{{rows}}"', '缺通行证两轨列表'],
    ['bindtap="onClaim"', '缺领取按钮'],
    ['bindtap="onUnlockPremium"', '缺解锁按钮'],
    ['bindtap="goStages"', '缺去 PVE 入口'],
    ['bindtap="goArena"', '缺去天梯入口'],
    ['{{premiumBtnText}}', '缺解锁按钮文案'],
    ['{{premiumReason}}', '缺解锁条件提示'],
    ['{{claimableText}}', '缺待领提示'],
    ['{{daysLeftText}}', '缺赛季剩余天数'],
    ['{{incomeText}}', '缺积分产出公示'],
    ['{{progress.toNextText}}', '缺升级进度'],
    ['{{note}}', '缺规则说明'],
    ['{{dataSourceLabel}}', '缺数值来源标注']
  ].forEach((n) => assert(wxml.indexOf(n[0]) !== -1, n[1]));
  const prof = fs.readFileSync(path.join(ROOT, 'pages/profile/profile.wxml'), 'utf8');
  ['dynastyLevelText', 'dynastyPointsText', 'dynastyDaysLeftText', 'dynastyClaimableText', 'goDynasty'].forEach((f) => assert(prof.indexOf(f) !== -1, '个人页缺 ' + f));
  const matchWxml = fs.readFileSync(path.join(ROOT, 'pages/match/match.wxml'), 'utf8');
  assert(matchWxml.indexOf('{{dynastyMissionText}}') !== -1, '比赛页缺任务达成行');
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  assert(app.pages.indexOf('pages/dynasty/dynasty') !== -1, '王朝页未注册');
  const pageJs = fs.readFileSync(path.join(ROOT, 'pages/dynasty/dynasty.js'), 'utf8');
  ['onClaim', 'onUnlockPremium', 'goStages', 'goArena', '__cellOf'].forEach((m) => assert(pageJs.indexOf(m + '(') !== -1, '页面缺方法 ' + m));
  return true;
});

check('源码纪律：utils/dynasty.js 无随机 / 系统时间；战斗引擎与王朝零耦合；页面不直派 action', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils/dynasty.js'), 'utf8');
  assert(src.indexOf('Math.random(') === -1, 'utils/dynasty.js 出现 Math.random');
  assert(src.indexOf('Date.now(') === -1, 'utils/dynasty.js 出现 Date.now');
  assert(src.indexOf('wx.') === -1, 'utils/dynasty.js 不该碰 wx');
  const battleSrc = fs.readFileSync(path.join(ROOT, 'utils/battle.js'), 'utf8');
  assert(battleSrc.indexOf('dynasty') === -1, '战斗引擎不该引用王朝赛季');
  const pageSrc = fs.readFileSync(path.join(ROOT, 'pages/dynasty/dynasty.js'), 'utf8');
  ['store.dynastySync(', 'store.claimDynastyReward(', 'store.unlockDynastyPremium('].forEach((m) => assert(pageSrc.indexOf(m) !== -1, '页面缺命令调用 ' + m));
  assert(pageSrc.indexOf('store.dispatch(') === -1, '页面不该直派 action');
  const cmdSrc = fs.readFileSync(path.join(ROOT, 'store/commands.js'), 'utf8');
  assert(cmdSrc.indexOf('dynastyUtil.planClaim(') !== -1 && cmdSrc.indexOf('dynastyUtil.planSettle(') !== -1, '命令层应复用纯函数计划');
  return true;
});

check('领奖 / 解锁只动 profile·bag·dynasty·notices：阵容 / 赛季 / 竞技场 / 图鉴 / 战绩逐字节不变', () => {
  pInject((s) => {
    s.dynasty = { startKey: pToday(), points: 4100, premium: false, missions: {}, completed: {}, claimed: {} };
    s.profile.diamond = 3000;
  });
  const b = store.getState();
  const snaps = {
    roster: JSON.stringify(b.roster), season: JSON.stringify(b.season), arena: JSON.stringify(b.arena),
    stats: JSON.stringify(b.stats), gacha: JSON.stringify(b.gacha), collection: JSON.stringify(b.collection),
    evolution: JSON.stringify(b.evolution), market: JSON.stringify(b.market)
  };
  assert(store.unlockDynastyPremium().ok, '解锁失败');
  assert(store.claimDynastyReward(5, 'premium').ok, 'premium 领奖失败');
  assert(store.claimDynastyReward(10, 'free').ok, '免费轨领奖失败');
  const a = store.getState();
  Object.keys(snaps).forEach((k) => assert(JSON.stringify(a[k]) === snaps[k], '领奖 / 解锁动到了 ' + k));
  assert(a.dynasty.points === b.dynasty.points, '领奖不该改赛季积分');
  assert(a.profile.diamond === 3000 - DYCFG.premiumCost + 40, '钻石收支口径错：' + a.profile.diamond);
  pRestore();
  return true;
});

check('回归对照：王朝开关不影响战斗结果（同 seed 逐字节一致，仅 playedAt 时间戳不同）', () => {
  pRestore();
  const r1 = store.startBattle({ stageId: 's1-1', seed: 'px-decouple' });
  const s1 = JSON.stringify(Object.assign({}, r1.result, { playedAt: 0 }));
  pRestore();
  const r2 = withDynasty({ enabled: false }, () => store.startBattle({ stageId: 's1-1', seed: 'px-decouple' }));
  const s2 = JSON.stringify(Object.assign({}, r2.result, { playedAt: 0 }));
  assert(s1 === s2, '战斗结果随王朝开关漂移');
  assert(r1.dynasty && r1.dynasty.pointsGained > 0 && r2.dynasty === null, '开关对照不成立');
  pRestore();
  return true;
});

/* ================= Q 每日任务 & 钻石商店（跨阈值发奖 / 三侧同解 / 视图与命令同口径 / 页面驱动） =================
 * 口径：任务表在 data/daily.js（只描述「是什么」），算法在 utils/daily.js（纯函数，不取系统时间、不掷随机），
 *   开关在 config.daily，计数由 BATTLE_RESULT / ARENA_RESULT / GACHA_RESULT 三处内联推进（不碰战斗引擎）。
 *   达成判据 = 本次推进跨过阈值（before < target ≤ after）：一日内计数单调递增 ⇒ 每天至多发一次，无需领取账本。
 * 时间依赖：命令相关用例用真实 now()（与 J/O/P 组同规，按「今天」跑）；纯函数用例用固定 dayKey 字符串。
 */
section('Q 每日任务 & 钻石商店（跨阈值发奖 / 三侧同解 / 视图与命令同口径 / 页面驱动）');

const DLCFG = CONFIG.daily;

/* 临时改 config.daily 跑一段（与 withDynasty / withEvolution 同构；单进程顺序执行，脏配置会污染后面断言） */
function withDaily(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = DLCFG[k]; DLCFG[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { DLCFG[k] = saved[k]; }); }
}

check('数值口径：任务表 5 条 / counter 白名单 / 奖励三类可解析（无装备·卡牌·时刻卡），全清产出 = 1600 金 + 30 钻 + 2 补给', () => {
  assert(DLCFG.enabled === true, '每日任务应默认开启（关闭态另有用例）');
  assert(JSON.stringify(initState.createInitialState(0).daily) === JSON.stringify({ dayKey: '1970-01-01', counters: {} }),
    '初始存档缺每日段或形状不符');
  assert(dailyData.DAILY_MISSIONS.length === 5, '任务条数漂移：' + dailyData.DAILY_MISSIONS.length);
  const seen = {};
  let gold = 0; let diamond = 0; const itemNames = [];
  dailyData.DAILY_MISSIONS.forEach((m) => {
    assert(!seen[m.id], '重复任务 id：' + m.id);
    seen[m.id] = true;
    assert(dailyUtil.COUNTER_KEYS.indexOf(m.counter) !== -1, m.id + ' 的 counter 不在白名单：' + m.counter);
    assert(Number.isInteger(m.target) && m.target > 0, m.id + ' target 应为正整数');
    assert(m.name && m.desc, m.id + ' 缺名称 / 描述');
    const r = m.reward || {};
    assert(['gold', 'diamond', 'item'].indexOf(r.kind) !== -1, m.id + ' 奖励类型非法：' + r.kind);
    if (r.kind === 'gold') gold += r.amount;
    else if (r.kind === 'diamond') diamond += r.amount;
    else {
      const it = items.getItem(r.id);
      assert(it, m.id + ' 的奖励道具无法解析：' + r.id);
      assert(!it.slot, m.id + ' 奖励了装备（直接战力，config.daily 裁决 2 禁止）：' + r.id);
      assert(!momentsData.getMoment(r.id), m.id + ' 奖励了时刻卡：' + r.id);
      itemNames.push(it.name + '×' + (r.count || 1));
    }
  });
  assert(gold === 1600 && diamond === 30 && itemNames.length === 2, '全清产出口径漂移：' + gold + '/' + diamond + '/' + itemNames.join('、'));
  return true;
});

check('utils/daily.js 纯函数纪律：无随机 / 系统时间 / wx；导出面齐全且 COUNTER_KEYS 与任务表一致', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils/daily.js'), 'utf8');
  assert(src.indexOf('Math.random(') === -1, 'utils/daily.js 出现 Math.random');
  assert(src.indexOf('Date.now(') === -1, 'utils/daily.js 出现 Date.now');
  assert(src.indexOf('wx.') === -1, 'utils/daily.js 不该碰 wx');
  assert(JSON.stringify(dailyUtil.COUNTER_KEYS) === JSON.stringify(['battles', 'wins', 'arenaBattles', 'pulls', 'staminaSpent']),
    'COUNTER_KEYS 集合漂移：' + JSON.stringify(dailyUtil.COUNTER_KEYS));
  ['enabled', 'isValidKey', 'empty', 'normalize', 'rollIfNeeded', 'applySettle', 'planSettle', 'rewardText', 'rewardsText', 'completedText']
    .forEach((k) => assert(typeof dailyUtil[k] === 'function', '缺导出 ' + k));
  assert(dailyUtil.enabled() === true && DLCFG.enabled === true, 'enabled() 应跟随 config.daily');
  return true;
});

check('日期数学：isValidKey 形状判定 / rollIfNeeded 同日不滚·跨天清零·非法不记账 / normalize 白名单清洗（不改入参）', () => {
  assert(dailyUtil.isValidKey('2026-10-01') && dailyUtil.isValidKey('1970-01-01'), '合法 dayKey 被拒');
  ['', null, undefined, '2026-1-1', '2026/10/01', '20261001', 'abc'].forEach((k) =>
    assert(!dailyUtil.isValidKey(k), '非法 dayKey 被放过：' + JSON.stringify(k)));
  const d0 = { dayKey: '2026-10-01', counters: { battles: 3 } };
  const snap = JSON.stringify(d0);
  assert(JSON.stringify(dailyUtil.empty('2026-10-01')) === JSON.stringify({ dayKey: '2026-10-01', counters: {} }), 'empty 形状漂移');
  const same = dailyUtil.rollIfNeeded(d0, '2026-10-01');
  assert(same.rolled === false && same.daily.counters.battles === 3, '同日不该滚动');
  const next = dailyUtil.rollIfNeeded(d0, '2026-10-02');
  assert(next.rolled === true && JSON.stringify(next.daily) === JSON.stringify({ dayKey: '2026-10-02', counters: {} }), '跨天应清零滚动');
  const bad = dailyUtil.rollIfNeeded(d0, 'garbage');
  assert(bad.rolled === false && bad.daily.dayKey === '2026-10-01' && bad.daily.counters.battles === 3, '非法 dayKey 不该滚动也不该丢账');
  const cleaned = dailyUtil.normalize({ dayKey: '2024-01-01', counters: { battles: '3x', wins: -2, pulls: 2.7, ghost: 9, arenaBattles: 4 } }, '2026-10-01');
  assert(JSON.stringify(cleaned) === JSON.stringify({ dayKey: '2024-01-01', counters: { pulls: 2, arenaBattles: 4 } }),
    'normalize 白名单清洗不符：' + JSON.stringify(cleaned));
  const fallback = dailyUtil.normalize({ dayKey: 'garbage', counters: { battles: 2 } }, '2026-10-01');
  assert(fallback.dayKey === '2026-10-01' && fallback.counters.battles === 2, '非法 dayKey 应回退到调用方给的值');
  assert(JSON.stringify(d0) === snap, 'rollIfNeeded / normalize 修改了入参');
  return true;
});

check('达成判据 = 跨阈值：多任务同批命中 / 连续推进不重发 / 非法或非正增量不记账 / 非法 dayKey 的 planSettle 不结算', () => {
  const e = dailyUtil.empty('2026-10-01');
  const first = dailyUtil.applySettle(e, '2026-10-01', { battles: 1, wins: 1, arenaBattles: 1, pulls: 10, staminaSpent: 60 });
  assert(first.rolled === false && first.completed.length === 4, '同批应命中 4 项（不含 d_win：1 胜 < 2）：' + first.completed.map((m) => m.id).join(','));
  assert(first.completed.map((m) => m.id).join(',') === 'd_battle,d_arena,d_pull,d_stamina', '命中顺序应按任务表顺序');
  const second = dailyUtil.applySettle(first.daily, '2026-10-01', { battles: 1, wins: 1, staminaSpent: 60 });
  assert(second.completed.length === 1 && second.completed[0].id === 'd_win', '第 2 胜应命中 d_win 且仅此一项：' + second.completed.map((m) => m.id).join(','));
  const third = dailyUtil.applySettle(second.daily, '2026-10-01', { battles: 5, wins: 5, arenaBattles: 5, pulls: 99, staminaSpent: 600 });
  assert(third.completed.length === 0, '已完成任务不该再次达成：' + third.completed.map((m) => m.id).join(','));
  const rolled = dailyUtil.applySettle(second.daily, '2026-10-02', { battles: 1 });
  assert(rolled.rolled === true && rolled.completed.length === 1 && rolled.completed[0].id === 'd_battle', '跨天后的第一场应重新达成 d_battle');
  const none = dailyUtil.applySettle(e, '2026-10-01', { battles: 'x', wins: -1, pulls: 0 });
  assert(none.completed.length === 0 && JSON.stringify(none.daily.counters) === '{}', '非法 / 非正增量不该记账：' + JSON.stringify(none.daily.counters));
  const bad = dailyUtil.planSettle(e, 'garbage', { battles: 1 });
  assert(bad.settled === false && bad.rolled === false && bad.completed.length === 0 && bad.daily.dayKey === '2026-10-01', '非法 dayKey 的 planSettle 应不结算且保留形状');
  assert(JSON.stringify(e) === JSON.stringify(dailyUtil.empty('2026-10-01')), 'applySettle / planSettle 修改了入参');
  return true;
});

check('奖励 / 完成文案从 reward 反推：rewardText / rewardsText / completedText（1 项 vs 多项、非法给空串）', () => {
  assert(dailyUtil.rewardText({ kind: 'gold', amount: 800 }) === '+800 金币', '金币文案错');
  assert(dailyUtil.rewardText({ kind: 'diamond', amount: 30 }) === '+30 钻石', '钻石文案错');
  assert(dailyUtil.rewardText({ kind: 'item', id: 'stamina_potion', count: 1 }) === '+体力药水 ×1', '道具文案错');
  assert(dailyUtil.rewardText({ kind: 'item', id: 'ghost', count: 0 }) === '+ghost ×1', '未知道具应回退到 id 且 count 兜底为 1');
  assert(dailyUtil.rewardText({ kind: 'card' }) === '' && dailyUtil.rewardText(null) === '', '非法奖励应给空串而不是崩');
  const list = dailyData.DAILY_MISSIONS;
  assert(dailyUtil.rewardsText([list[0].reward, list[1].reward]) === '+800 金币、+30 钻石', 'rewardsText 拼接错');
  assert(dailyUtil.completedText([list[0]]) === '晨练打卡', '单项完成文案错');
  assert(dailyUtil.completedText([list[0], list[2]]) === '晨练打卡 等 2 项', '多项完成文案错');
  assert(dailyUtil.completedText([]) === '' && dailyUtil.completedText(null) === '', '空清单应给空串');
  return true;
});

check('PVE 三侧同解：命令返回值 == 纯函数计划 == 落库（计数器与奖励逐项对账），首战必达晨练打卡、次战不重发', () => {
  pRestore();
  const before = JSON.parse(JSON.stringify(store.getState()));
  const r1 = store.startBattle({ stageId: 's1-1', seed: 'px-q-pve' });
  assert(r1.ok && r1.daily, '首战应返回每日增量：' + JSON.stringify(r1.daily));
  const exp1 = dailyUtil.planSettle(before.daily, pToday(), {
    battles: 1, wins: r1.result.result === 'win' ? 1 : 0, staminaSpent: r1.stage.staminaCost
  });
  const after1 = store.getState();
  assert(JSON.stringify(after1.daily) === JSON.stringify(exp1.daily), '落库与纯函数计划不一致');
  assert(r1.daily.completed.map((c) => c.id).join(',') === exp1.completed.map((m) => m.id).join(','), '命令返回值与计划不一致');
  assert(JSON.stringify(r1.daily.completed) === JSON.stringify([{ id: 'd_battle', name: '晨练打卡', rewardText: '+800 金币' }]),
    '首战必达晨练打卡：' + JSON.stringify(r1.daily.completed));
  assert(after1.profile.gold === before.profile.gold + r1.rewards.gold + 800,
    '晨练打卡的 800 金没入账：' + (after1.profile.gold - before.profile.gold) + ' vs ' + r1.rewards.gold);
  /* 次战：不重发 d_battle（若两连胜恰好触发 d_win 一档，仍以纯函数裁决为准） */
  const r2 = store.startBattle({ stageId: 's1-2', seed: 'px-q-pve2' });
  const exp2 = dailyUtil.planSettle(after1.daily, pToday(), {
    battles: 1, wins: r2.result.result === 'win' ? 1 : 0, staminaSpent: r2.stage.staminaCost
  });
  assert(r2.daily.completed.filter((c) => c.id === 'd_battle').length === 0, 'd_battle 被重复发放');
  assert(JSON.stringify(store.getState().daily) === JSON.stringify(exp2.daily), '次战落库与计划不一致');
  pRestore();
  return true;
});

check('天梯三侧同解：arenaChallenge 同口径（battles·wins·arenaBattles·staminaSpent），且不写 PVE 的 season/stats', () => {
  pRestore();
  const before = JSON.parse(JSON.stringify(store.getState()));
  const r = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'px-q-arena' });
  assert(r.ok && r.daily && r.mode === 'arena', '天梯应返回每日增量：' + JSON.stringify(r.daily));
  const exp = dailyUtil.planSettle(before.daily, pToday(), {
    battles: 1, wins: r.result.result === 'win' ? 1 : 0, arenaBattles: 1, staminaSpent: AC.staminaCost
  });
  const after = store.getState();
  assert(JSON.stringify(after.daily) === JSON.stringify(exp.daily), '落库与计划不一致：' + JSON.stringify(after.daily));
  assert(r.daily.completed.map((c) => c.id).join(',') === 'd_battle,d_arena', '首场天梯必达「晨练 + 天梯报到」：' + JSON.stringify(r.daily.completed));
  assert(after.profile.gold === before.profile.gold + r.rewards.gold + 1600, '两条任务共 1600 金没入账');
  assert(after.daily.counters.arenaBattles === 1 && after.daily.counters.battles === 1, '计数器增量不符：' + JSON.stringify(after.daily.counters));
  assert(JSON.stringify(after.season) === JSON.stringify(before.season) && JSON.stringify(after.stats) === JSON.stringify(before.stats),
    '每日记账不该动 PVE 的 season / stats');
  pRestore();
  return true;
});

check('抽卡推进：pull 落库 == planSettle（单抽记 1、十连记 10），球探出动发券入袋且券真的能用', () => {
  pRestore();
  const before = JSON.parse(JSON.stringify(store.getState()));
  const rp = store.pull({ poolKey: 'normal', useTicket: true, count: 1, seed: 'px-q-pull' });
  assert(rp.ok, '单抽失败：' + rp.reason);
  const exp = dailyUtil.planSettle(before.daily, pToday(), { pulls: 1 });
  assert(JSON.stringify(store.getState().daily) === JSON.stringify(exp.daily), '抽卡落库与计划不一致');
  assert(exp.completed.length === 1 && exp.completed[0].id === 'd_pull', '单抽应达成「球探出动」');
  assert((Number(store.getState().bag.ticket_normal) || 0) === (Number(before.bag.ticket_normal) || 0) + 1, '奖励的普通招募券没入袋');
  assert(store.getState().notices[0].kind === 'gacha' && store.getState().notices[1].kind === 'daily', '通知顺序：最佳卡在前、每日任务在后');
  const ticket0 = store.getState().profile.ticketNormal;
  assert(store.useItem('ticket_normal', 1).ok, '任务发的券应能在背包里使用');
  assert(store.getState().profile.ticketNormal === ticket0 + 1, '用券后普通券计数不对');
  /* 十连按 10 次记（反向对照单抽 1 次） */
  const day1 = JSON.parse(JSON.stringify(store.getState().daily));
  assert(store.pull({ poolKey: 'normal', useTicket: true, count: 10, seed: 'px-q-pull10' }).ok, '十连失败');
  assert((store.getState().daily.counters.pulls || 0) === (day1.counters.pulls || 0) + 10, '十连应记 10 次：' + JSON.stringify(store.getState().daily));
  pRestore();
  return true;
});
check('通知顺序：战报仍在 [0]，每日通知 kind=daily（达成文本 + 奖励已入账），跨天滚动通知排在达成之后', () => {
  pInject((s) => { s.daily = { dayKey: pDay(-1), counters: {} }; });
  store.dispatch(store.actions.battleResult({
    result: { result: 'win', stars: 2, margin: 6, homeScore: 70, awayScore: 64 },
    stageId: 's1-1', staminaCost: 6, rewards: { gold: 1000 }, dayKey: pToday(), now: 3000
  }));
  const n = store.getState().notices;
  assert(n[0] && n[0].kind === 'battle' && n[0].text.indexOf('战胜') === 0, '战报通知应仍在动态流 [0]：' + JSON.stringify(n.slice(0, 3)));
  assert(n[1] && n[1].kind === 'daily' && n[1].text === '每日任务完成：晨练打卡（奖励已入账）', '达成通知位次 / 文案错：' + JSON.stringify(n.slice(0, 3)));
  assert(n[2] && n[2].kind === 'daily' && n[2].text === '每日任务已刷新（新的一天）', '跨天滚动通知应排在达成之后：' + JSON.stringify(n.slice(0, 3)));
  pRestore();
  return true;
});

check('reducer 防御：伪造价格 / 伪造货币 / 未知商品 / 非法 dayKey 一律恒等返回；缺 dayKey 的结算不记账（反向对照连击）', () => {
  pRestore();
  const snap = JSON.stringify(store.getState());
  store.dispatch(store.actions.shopBuy('stamina_potion', 1, 'diamond', 5000));
  store.dispatch(store.actions.shopBuy('stamina_potion', 200, 'gold', 5000));
  store.dispatch(store.actions.shopBuy('stamina_potion', 100, 'diamond', 5000));
  store.dispatch(store.actions.shopBuy('ghost_item', 100, 'diamond', 5000));
  store.dispatch(store.actions.shopBuy('shoes_rookie', 800, 'diamond', 5000));
  store.dispatch(store.actions.dailySync('garbage', 5000));
  store.dispatch(store.actions.dailySync('', 5000));
  assert(JSON.stringify(store.getState()) === snap, '伪造 payload 动了存档');
  /* 缺 dayKey 的结算：老调用方 / 直派测试不记账（reducer 不猜时间） */
  const d0 = JSON.stringify(store.getState().daily);
  store.dispatch(store.actions.battleResult({
    result: { result: 'win', stars: 2, margin: 6, homeScore: 70, awayScore: 64 },
    stageId: 's1-1', staminaCost: 6, rewards: { gold: 1000 }, now: 6000
  }));
  assert(JSON.stringify(store.getState().daily) === d0, '缺 dayKey 不该推进每日计数');
  assert(store.getState().notices.filter((x) => x.kind === 'daily').length === 0, '缺 dayKey 不该推每日通知');
  pRestore();
  return true;
});

check('dailySync 命令：跨天滚动落库 + 通知；同日再调是 no-op（状态逐字节不变）', () => {
  pInject((s) => { s.daily = { dayKey: pDay(-1), counters: { battles: 3, wins: 2 } }; });
  const r1 = store.dailySync();
  assert(r1.ok && r1.rolled === true, '跨天应滚动：' + JSON.stringify(r1));
  assert(JSON.stringify(store.getState().daily) === JSON.stringify({ dayKey: pToday(), counters: {} }), '跨天未清零：' + JSON.stringify(store.getState().daily));
  assert(store.getState().notices[0].kind === 'daily' && store.getState().notices[0].text === '每日任务已刷新（新的一天）', '缺滚动通知');
  const snap = JSON.stringify(store.getState());
  const r2 = store.dailySync();
  assert(r2.ok && r2.rolled === false && JSON.stringify(store.getState()) === snap, '同日再调应为 no-op');
  pRestore();
  return true;
});

check('购买成功：扣款精确 / 入包 / shop 通知；失败路径（余额不足·未上架）可读拒绝且存档逐字节不变', () => {
  pRestore();
  const before = store.getState();
  const r = store.buyConsumable('stamina_potion');
  assert(r.ok && r.price === 200 && r.currency === 'diamond', '购买失败：' + r.reason);
  const after = store.getState();
  assert(after.profile.diamond === before.profile.diamond - 200, '扣款不精确：' + after.profile.diamond);
  assert((Number(after.bag.stamina_potion) || 0) === 1, '商品没入包：' + JSON.stringify(after.bag));
  assert(after.notices[0].kind === 'shop' && after.notices[0].text === '钻石商店：购买 体力药水 -200 钻石', 'shop 通知文案错：' + JSON.stringify(after.notices[0]));
  assert(after.profile.gold === before.profile.gold && after.profile.stamina === before.profile.stamina, '购买不该动别的钱包 / 体力');
  /* 失败路径 1：余额不足 */
  pInject((s) => { s.profile.diamond = 10; });
  const snap = JSON.stringify(store.getState());
  const f1 = store.buyConsumable('stamina_potion');
  assert(!f1.ok && f1.reason.indexOf('钻石不足') === 0 && f1.reason.indexOf('现有 10') !== -1, '余额不足文案错：' + f1.reason);
  /* 失败路径 2：未上架（装备有价格但没有货币口径，不属于钻石商店） */
  const f2 = store.buyConsumable('shoes_rookie');
  const f3 = store.buyConsumable('ghost');
  assert(!f2.ok && /未上架/.test(f2.reason) && !f3.ok && /未上架/.test(f3.reason), '未上架应给可读拒绝');
  assert(JSON.stringify(store.getState()) === snap, '失败路径动了存档');
  pRestore();
  return true;
});

check('视图 == 命令（钻石商店）：canBuy / buyText 与 buyConsumable 的真实结果逐项一致，买后水位翻转', () => {
  pInject((s) => { s.profile.diamond = 250; });
  const view0 = selectors.diamondShopView(store.getState());
  assert(view0.items.length === 4 && view0.diamond === 250, '条目数 / 钱包口径错：' + view0.items.length);
  const by = {};
  view0.items.forEach((i) => { by[i.id] = i; });
  assert(by.stamina_potion.canBuy === true && by.stamina_potion.buyText === '购买', '200 钻应可买');
  assert(by.gold_pack.canBuy === true && by.ticket_normal.canBuy === true, '100 / 60 钻应可买');
  assert(by.ticket_advanced.canBuy === false && by.ticket_advanced.buyText === '钻石不足', '300 钻应不可买且给可读文案');
  /* canBuy=true 的行，命令必须真的能买到（防「按钮亮着但点了没反应」） */
  assert(store.buyConsumable('stamina_potion').ok, 'canBuy 行购买失败');
  const view1 = selectors.diamondShopView(store.getState());
  const after = {};
  view1.items.forEach((i) => { after[i.id] = i; });
  assert(after.stamina_potion.canBuy === false && after.stamina_potion.buyText === '钻石不足', '买后水位应翻转：' + JSON.stringify(after.stamina_potion));
  /* canBuy=false 的行，命令必须真的失败（与视图同口径） */
  assert(!store.buyConsumable('gold_pack').ok && !store.buyConsumable('ticket_normal').ok, 'canBuy=false 的行不该买成功');
  assert(store.getState().profile.diamond === 50, '扣款链口径错：' + store.getState().profile.diamond);
  pRestore();
  return true;
});

check('dailyView：进度 / 完成态 / 文案全算好（页面零判断）；过期存档的视图虚拟滚动不改存档', () => {
  pInject((s) => { s.daily = { dayKey: pDay(-1), counters: { battles: 5, wins: 5 } }; });
  const v0 = selectors.dailyView(store.getState(), Date.now());
  assert(v0.enabled === true && v0.dayKey === pToday(), '视图 dayKey 应为今天');
  assert(v0.missions.length === 5 && v0.doneCount === 0 && v0.doneText === '0 / 5', '过期存档的视图应虚拟清零：' + v0.doneText);
  assert(v0.missions[0].progress === 0 && v0.missions[0].done === false && v0.missions[0].mark === '·', '虚拟滚动后不该显示昨天的进度');
  assert(v0.note.indexOf('自动发奖') !== -1, '规则说明应写明「达成即自动发奖」');
  assert(JSON.stringify(store.getState().daily.counters) === JSON.stringify({ battles: 5, wins: 5 }), '视图虚拟滚动不该改存档');
  pInject((s) => { s.daily = { dayKey: pToday(), counters: { battles: 1, wins: 2 } }; });
  const v1 = selectors.dailyView(store.getState(), Date.now());
  assert(v1.doneCount === 2 && v1.doneText === '2 / 5', '完成态计数错：' + v1.doneText);
  assert(v1.missions[0].done === true && v1.missions[0].mark === '✓' && v1.missions[0].progressText === '1 / 1', '晨练打卡完成态错');
  assert(v1.missions[1].done === true && v1.missions[2].done === false && v1.missions[2].progressText === '0 / 1', '赢球 / 天梯完成态错');
  assert(v1.missions[0].ratio === 100 && v1.missions[2].ratio === 0, '进度条比例错');
  pRestore();
  return true;
});

check('存档迁移与归一：老档缺 daily 补空壳；脏 counters 逐项清洗；非法 dayKey 回退；往返再读不变', () => {
  pInject((s) => { delete s.daily; });
  assert(JSON.stringify(store.getState().daily) === JSON.stringify({ dayKey: pToday(), counters: {} }), '老档应补空壳：' + JSON.stringify(store.getState().daily));
  pInject((s) => { s.daily = { dayKey: '2024-01-01', counters: { battles: '3x', wins: -2, pulls: 2.7, ghost: 9, arenaBattles: 4 } }; });
  assert(JSON.stringify(store.getState().daily) === JSON.stringify({ dayKey: '2024-01-01', counters: { pulls: 2, arenaBattles: 4 } }),
    '脏 counters 清洗不符：' + JSON.stringify(store.getState().daily));
  const rt = JSON.parse(JSON.stringify(store.getState().daily));
  pInject((s) => { s.daily = JSON.parse(JSON.stringify(rt)); });
  assert(JSON.stringify(store.getState().daily) === JSON.stringify(rt), '往返再读形状漂移');
  pInject((s) => { s.daily = { dayKey: 'garbage', counters: { battles: 2 } }; });
  const fb = store.getState().daily;
  assert(fb.dayKey === pToday() && fb.counters.battles === 2, '非法 dayKey 应回退到建档当天且保留合法计数：' + JSON.stringify(fb));
  pRestore();
  return true;
});

check('enabled=false：命令全拒 / 视图可读 / 结算不累计；恢复开关后立即恢复推进（反向对照）', () => {
  pInject((s) => { s.daily = { dayKey: pToday(), counters: {} }; });
  const d0 = JSON.stringify(store.getState().daily);
  withDaily({ enabled: false }, () => {
    const sync = store.dailySync();
    assert(!sync.ok && sync.reason.indexOf('尚未开放') !== -1, '关闭态 dailySync 应拒绝：' + JSON.stringify(sync));
    const view = selectors.dailyView(store.getState(), Date.now());
    assert(view.enabled === false && view.note.indexOf('未开放') !== -1, '关闭态视图应可读且说明原因');
    assert(view.missions.length === 5, '关闭态也要能渲染任务列表（给进度区兜底）');
    const b = store.startBattle({ stageId: 's1-1', seed: 'px-q-off' });
    assert(b.ok && b.daily === null, '关闭态结算不该返回每日增量');
    store.dispatch(store.actions.dailySync(pDay(1), 4000));
    assert(JSON.stringify(store.getState().daily) === d0, '关闭态不该推进 / 滚动');
    assert(store.getState().notices.filter((x) => x.kind === 'daily').length === 0, '关闭态不该推每日通知');
  });
  assert(DLCFG.enabled === true, '开关未还原');
  const b2 = store.startBattle({ stageId: 's1-2', seed: 'px-q-on' });
  assert(b2.ok && b2.daily && b2.daily.completed.filter((c) => c.id === 'd_battle').length === 1, '恢复开关后应立即可用：' + JSON.stringify(b2.daily));
  pRestore();
  return true;
});

check('结算发奖只动 profile·bag·daily·notices（及结算本身该动的段）：阵容 / 图鉴 / 竞技场 / 市场 / 设置逐字节不变', () => {
  pRestore();
  const b = store.getState();
  const snaps = {
    roster: JSON.stringify(b.roster), collection: JSON.stringify(b.collection), arena: JSON.stringify(b.arena),
    gacha: JSON.stringify(b.gacha), evolution: JSON.stringify(b.evolution), market: JSON.stringify(b.market),
    settings: JSON.stringify(b.settings)
  };
  const r = store.startBattle({ stageId: 's1-1', seed: 'px-q-isolate' });
  assert(r.daily && r.daily.completed.length === 1, '本用例前提：首战恰好完成 1 条任务');
  const a = store.getState();
  Object.keys(snaps).forEach((k) => assert(JSON.stringify(a[k]) === snaps[k], '每日发奖动到了 ' + k));
  assert(a.profile.gold === b.profile.gold + r.rewards.gold + 800 && a.daily.counters.battles === 1, '发奖 / 计数落库不对');
  pRestore();
  return true;
});

check('开关对照：同 seed 的 PVE 与天梯结果与 daily 开关无关（逐字节一致，仅 playedAt 时间戳不同）', () => {
  pRestore();
  const r1 = store.startBattle({ stageId: 's1-1', seed: 'px-q-decouple' });
  const s1 = JSON.stringify(Object.assign({}, r1.result, { playedAt: 0 }));
  pRestore();
  const r2 = withDaily({ enabled: false }, () => store.startBattle({ stageId: 's1-1', seed: 'px-q-decouple' }));
  const s2 = JSON.stringify(Object.assign({}, r2.result, { playedAt: 0 }));
  assert(s1 === s2, 'PVE 结果随 daily 开关漂移');
  assert(r1.daily && r1.daily.completed.length === 1 && r2.daily === null, '开关对照不成立');
  /* 天梯同口径 */
  pRestore();
  const a1 = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'px-q-decouple-a' });
  const t1 = JSON.stringify(Object.assign({}, a1.result, { playedAt: 0 }));
  pRestore();
  const a2 = withDaily({ enabled: false }, () => store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'px-q-decouple-a' }));
  const t2 = JSON.stringify(Object.assign({}, a2.result, { playedAt: 0 }));
  assert(t1 === t2 && a1.ratingDelta === a2.ratingDelta && JSON.stringify(a1.rewards) === JSON.stringify(a2.rewards),
    '天梯结果 / 积分 / 奖励随 daily 开关漂移');
  assert(a2.daily === null, '关闭态天梯不该返回每日增量');
  assert(DLCFG.enabled === true, '开关未还原');
  pRestore();
  return true;
});

check('比赛页与回放：结算面板带每日任务行；历史回放不显示也不重发（daily 计数器逐字节不变）', () => {
  pRestore();
  kResetUi();
  const pve = kPlayMatch({ stageId: 's1-1', seed: 'px-q-match' });
  try {
    const line = pve.data.rewardLines.filter((l) => l.k === '每日任务')[0];
    assert(line && line.v === '完成 晨练打卡（奖励已入账）', 'PVE 结算面板缺每日任务行：' + JSON.stringify(pve.data.rewardLines));
  } finally { kUnmount(pve); }
  pRestore();
  const origin = kPlayMatch({ mode: 'arena', opp: arenaData.LADDER[0].id, seed: 'px-q-replay-origin' });
  try {
    const line = origin.data.rewardLines.filter((l) => l.k === '每日任务')[0];
    assert(line && line.v === '完成 晨练打卡 等 2 项（奖励已入账）', '天梯结算面板缺每日任务行：' + JSON.stringify(origin.data.rewardLines));
  } finally { kUnmount(origin); }
  const d0 = JSON.stringify(store.getState().daily);
  kResetUi();
  const replay = kPlayMatch({ mode: 'arena', hist: 0 });
  try {
    assert(replay.data.arenaReplayNote === true, '回放标记缺失');
    assert(!replay.data.rewardLines.some((l) => l.k === '每日任务'), '回放不该显示每日任务行');
    assert(JSON.stringify(store.getState().daily) === d0, '回放重发了每日任务');
  } finally { kUnmount(replay); }
  pRestore();
  return true;
});

check('背包页与入口：字段 == selectors；onBuyConsumable / onShow 从页面真实驱动；主页任务入口 navigateTo；模板与源码纪律', () => {
  pRestore();
  kResetUi();
  N_UI.modals.length = 0;
  const bagPage = kMount('pages/bag/bag.js', { tab: 'goal' });
  try {
    const v = selectors.dailyView(store.getState(), Date.now());
    assert(bagPage.data.daily.doneText === v.doneText && bagPage.data.daily.missions.length === v.missions.length, '任务面板字段 != selectors.dailyView');
    assert(bagPage.data.daily.note === v.note && bagPage.data.daily.count === 5, '任务说明 / 计数口径漂移');
    const sv = selectors.diamondShopView(store.getState());
    assert(bagPage.data.diamondShop.diamond === sv.diamond && bagPage.data.diamondShop.items.length === sv.items.length, '钻石商店字段 != selectors.diamondShopView');
    /* 购买：二次确认 → 命令 → toast → 页面随 store 刷新 */
    const diamond0 = store.getState().profile.diamond;
    bagPage.onBuyConsumable({ currentTarget: { dataset: { id: 'stamina_potion', name: '体力药水', price: '200 钻石', can: 'true' } } });
    assert(N_UI.modals.length === 1 && N_UI.modals[0].title === '确认购买', '缺购买二次确认');
    assert(store.getState().profile.diamond === diamond0 - 200, '页面购买未落地');
    assert(K_UI.toast.some((t) => t === '已购买 体力药水'), '缺购买 toast：' + JSON.stringify(K_UI.toast));
    assert(bagPage.data.diamondShop.diamond === diamond0 - 200, '页面钱包没随 store 刷新');
    /* 不可买：只 toast 原因，不弹确认 */
    bagPage.onBuyConsumable({ currentTarget: { dataset: { id: 'ticket_advanced', name: '高级球探券', can: 'false', why: '钻石不足' } } });
    assert(N_UI.modals.length === 1 && K_UI.toast.some((t) => t === '钻石不足'), '不可买应只提示原因');
  } finally { kUnmount(bagPage); }
  /* 跨天 onShow：页面进入时滚一次，把「昨天」落库重置 */
  pInject((s) => { s.daily = { dayKey: pDay(-1), counters: { battles: 2 } }; });
  const bag2 = kMount('pages/bag/bag.js', { tab: 'goal' });
  try {
    bag2.onShow();
    assert(store.getState().daily.dayKey === pToday() && JSON.stringify(store.getState().daily.counters) === '{}', 'onShow 没把跨天落库');
    assert(bag2.data.daily.missions[0].progress === 0 && bag2.data.daily.doneText === '0 / 5', '页面任务面板没刷新到新的一天');
  } finally { kUnmount(bag2); }
  /* 主页快捷入口：任务页是非 tab 页，必须走 navigateTo（坑 15） */
  const home = kMount('pages/home/home.js', {});
  try {
    const q = home.data.quickLinks.filter((x) => x.key === 'tasks')[0];
    assert(q && q.url === '/pages/bag/bag?tab=goal' && q.tab === false && q.label === '任务', '主页缺任务快捷入口');
    kResetUi();
    home.onQuick({ currentTarget: { dataset: { key: 'tasks' } } });
    assert(K_UI.navigateTo.indexOf('/pages/bag/bag?tab=goal') !== -1 && K_UI.switchTab.length === 0, '任务入口应走 navigateTo');
  } finally { kUnmount(home); }
  /* 模板 / 源码纪律 */
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/bag/bag.wxml'), 'utf8');
  [
    ['每日任务', '缺每日任务面板'], ['{{daily.doneText}}', '缺完成计数'], ['{{daily.note}}', '缺规则说明'],
    ['{{item.progressText}}', '缺任务进度'], ['{{item.rewardText}}', '缺任务奖励'], ['钻石商店', '缺钻石商店面板'],
    ['bindtap="onBuyConsumable"', '缺购买事件'], ['data-why="{{item.buyText}}"', '缺不可买原因']
  ].forEach((n) => assert(wxml.indexOf(n[0]) !== -1, n[1]));
  const bagJs = fs.readFileSync(path.join(ROOT, 'pages/bag/bag.js'), 'utf8');
  ['store.dailySync(', 'store.buyConsumable(', 'selectors.dailyView(', 'selectors.diamondShopView('].forEach((m) => assert(bagJs.indexOf(m) !== -1, '页面缺 ' + m));
  assert(bagJs.indexOf('store.dispatch(') === -1, '页面不该直派 action');
  const matchJs = fs.readFileSync(path.join(ROOT, 'pages/match/match.js'), 'utf8');
  assert(matchJs.indexOf('!this.arenaReplay && this.dailyGains') !== -1, '回放守护缺失（每日任务行会出现在回放里）');
  const homeJs = fs.readFileSync(path.join(ROOT, 'pages/home/home.js'), 'utf8');
  assert(homeJs.indexOf("key: 'tasks'") !== -1, '主页快捷入口表缺 tasks');
  const cmdJs = fs.readFileSync(path.join(ROOT, 'store/commands.js'), 'utf8');
  assert(cmdJs.indexOf('dailyUtil.planSettle(') !== -1 && cmdJs.indexOf('function buyConsumable') !== -1, '命令层缺每日计划 / 购买命令');
  pRestore();
  return true;
});
/* ================= R 竞技场加赛（钻石加购挑战次数，里程碑 5） =================
 * 需求出处：用户反馈「竞技币不够，挑战 5 次上限了」——加赛是「想多打」的钻石出口，
 *   与免费次数共用一条进度（total = dailyChallenges + 今日已购），零氪基线 5 场/100 币/日 不变。
 * 覆盖：
 *   ① 数值口径（开关 / 单价 / 上限合法 + 基线 100 币/日 锁定）；
 *   ② dailyOf 读侧（extra 计入 total、跨天归零、脏数据归零、超上限封顶、入参不改、缺配置回退）；
 *   ③ 命令闭环（扣钻 → extraToday+1 → left+1 → 通知 → 第 6 场可打并计入每日任务）；
 *   ④ 视图 == 命令（canBuy === ok 三档 + arenaSummary 同口径）；
 *   ⑤ reducer 防御（伪造 n / 改价 / 日期不符 / 缺时间 / 余额不足 → 存档逐字节不变）；
 *   ⑥ 跨天滚动与上限封顶（出路提示文案、买满、打满 10 场后第 11 场拒绝）；
 *   ⑦ 加赛场次快照复现逐字节一致；
 *   ⑧ 开关对照（enabled=false：命令拒绝 / 视图关闭 / 同 seed 战斗投影逐字节不变）；
 *   ⑨ 存档迁移与往返（缺字段 / 脏形状归一）；
 *   ⑩ 页面层真实驱动 + 模板与源码纪律 + 同轮占位收口（音效文案 / 版本号一致性）。
 * 时间依赖：命令相关用例用真实 now()（与 J/O/P/Q 组同规，按「今天」跑）；纯函数用例用固定 NOON。
 */
section('R 竞技场加赛（钻石加购挑战次数，里程碑 5）');

const XC = CONFIG.arena.extraChallenges;

/* 临时改 config.arena.extraChallenges 跑一段（与 withDaily / withEvolution 同构；单进程顺序执行，脏配置会污染后面断言） */
function withExtra(patch, fn) {
  const keys = Object.keys(patch);
  const saved = {};
  keys.forEach((k) => { saved[k] = XC[k]; XC[k] = patch[k]; });
  try { return fn(); } finally { keys.forEach((k) => { XC[k] = saved[k]; }); }
}

check('数值口径：加赛开关 / 单价 / 上限合法，且零氪基线（免费 5 场 × 20 币 = 100/日）未被松动', () => {
  assert(XC && XC.enabled === true, '加赛应默认开启（关闭态另有用例）');
  assert(Number.isInteger(XC.costDiamonds) && XC.costDiamonds > 0, '单价必须为正整数：' + XC.costDiamonds);
  assert(Number.isInteger(XC.maxPerDay) && XC.maxPerDay >= 1, '上限必须为正整数：' + XC.maxPerDay);
  assert(AC.dailyChallenges * AC.coinPerWin === 100, '零氪基线被动了：免费日收入应为 100 币');
  assert(XC.costDiamonds * XC.maxPerDay >= AC.dailyChallenges * AC.coinPerWin * 2,
    '满买一档（' + (XC.costDiamonds * XC.maxPerDay) + ' 钻）不足以构成「长期加速器」定价（应远贵于一天免费产出的币值折算）');
  return true;
});

check('dailyOf 读侧：加赛计入 total、跨天归零、脏数据归零、超上限封顶、入参不改、缺配置回退', () => {
  const key = arenaUtil.dayKeyOf(NOON);
  const arena = { dayKey: key, usedToday: 4, extraToday: 2 };
  const snap = JSON.stringify(arena);
  const av = arenaUtil.dailyOf(arena, NOON, AC);
  assert(av.extra === 2 && av.total === AC.dailyChallenges + 2 && av.left === AC.dailyChallenges - 2,
    '同日加赛读数不符：' + JSON.stringify(av));
  const next = arenaUtil.dailyOf(arena, NOON_NEXT, AC);
  assert(next.extra === 0 && next.total === AC.dailyChallenges && next.left === AC.dailyChallenges, '跨天应把加赛一起清零');
  assert(arenaUtil.dailyOf({ dayKey: key, usedToday: 0, extraToday: 'x' }, NOON, AC).extra === 0, '脏字符串应按 0 算');
  assert(arenaUtil.dailyOf({ dayKey: key, usedToday: 0, extraToday: -3 }, NOON, AC).extra === 0, '负值应按 0 算');
  assert(arenaUtil.dailyOf({ dayKey: key, usedToday: 0, extraToday: 99 }, NOON, AC).extra === XC.maxPerDay,
    '手改存档的场次应封顶到 maxPerDay（不能换来无限挑战）');
  assert(arenaUtil.dailyOf({ dayKey: key, usedToday: 0 }, NOON, AC).extra === 0, '缺 extraToday 应按 0 算');
  assert(arenaUtil.dailyOf(undefined, NOON, AC).extra === 0, '缺 arena 段应按 0 算');
  const bare = arenaUtil.dailyOf({ dayKey: key, usedToday: 0, extraToday: 2 }, NOON, { dailyChallenges: AC.dailyChallenges });
  assert(bare.extra === 0 && bare.total === AC.dailyChallenges, '缺 extraChallenges 配置应回退里程碑 2 口径');
  assert(JSON.stringify(arena) === snap, 'dailyOf 修改了入参');
  return true;
});

check('命令闭环：arenaBuyExtra 扣钻 / extraToday +1 / left +1 / 通知压栈；第 6 场（加赛位）可打且计入每日任务', () => {
  store.init({ fresh: true, force: true, now: NOON });
  const d0 = Number(store.getState().profile.diamond);
  const r = store.arenaBuyExtra();
  assert(r.ok, '首次加赛应成功：' + r.reason);
  assert(r.cost === XC.costDiamonds && r.bought === 1 && r.total === AC.dailyChallenges + 1, '返回值不符：' + JSON.stringify(r));
  let st = store.getState();
  assert(st.arena.extraToday === 1 && st.profile.diamond === d0 - XC.costDiamonds, '扣钻或计数没落库');
  assert(selectors.arenaView(st, Date.now()).daily.left === AC.dailyChallenges + 1, 'left 应 +1');
  assert(selectors.arenaView(st, Date.now()).extra.canBuy === true, '购 1 次后仍应可继续加购');
  assert(st.notices && st.notices[0] && st.notices[0].text.indexOf('加赛') !== -1, '通知未压栈：' + JSON.stringify(st.notices && st.notices[0]));

  for (let i = 0; i < AC.dailyChallenges; i++) {
    const rr = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-close-' + i });
    assert(rr.ok, '第 ' + (i + 1) + ' 场应可挑战：' + rr.reason);
  }
  const sixth = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id });
  assert(sixth.ok, '第 6 场（加赛位）应可挑战：' + sixth.reason);
  st = store.getState();
  assert(st.arena.usedToday === AC.dailyChallenges + 1, 'usedToday 应累计到 6：' + st.arena.usedToday);
  assert(selectors.arenaView(st, Date.now()).daily.left === 0, '加赛位用完后 left 应为 0');
  assert(st.daily.counters.arenaBattles === AC.dailyChallenges + 1, '加赛场次应计入每日任务：' + st.daily.counters.arenaBattles);
  return true;
});

check('视图 == 命令：arenaView / arenaSummary 的 canBuy 与 arenaBuyExtra 真实结果同口径（可买 / 余额不足 / 购满三档）', () => {
  store.init({ fresh: true, force: true, now: NOON });
  assert(selectors.arenaView(store.getState(), Date.now()).extra.canBuy === true, '初始应可买');
  const sum0 = selectors.arenaSummary(store.getState(), Date.now());
  const v0 = selectors.arenaView(store.getState(), Date.now());
  assert(sum0.extra.canBuy === v0.extra.canBuy && sum0.extra.bought === v0.extra.bought && sum0.extra.max === v0.extra.max,
    'arenaSummary 与 arenaView 加赛口径不一致');

  let s = JSON.parse(JSON.stringify(store.getState()));
  s.profile.diamond = XC.costDiamonds - 1;
  store.dispatch(store.actions.hydrate(s));
  assert(selectors.arenaView(store.getState(), Date.now()).extra.canBuy === false, '余额不足时应不可买');
  const poor = store.arenaBuyExtra();
  assert(poor.ok === false && poor.reason.indexOf('钻石') !== -1, '余额不足应给钻石文案：' + (poor && poor.reason));

  s = JSON.parse(JSON.stringify(store.getState()));
  s.profile.diamond = XC.costDiamonds * (XC.maxPerDay + 1);
  s.arena.extraToday = XC.maxPerDay;
  s.arena.dayKey = arenaUtil.dayKeyOf(Date.now());
  store.dispatch(store.actions.hydrate(s));
  assert(selectors.arenaView(store.getState(), Date.now()).extra.canBuy === false, '购满后应不可买');
  const full = store.arenaBuyExtra();
  assert(full.ok === false && full.reason.indexOf('购满') !== -1, '购满应给购满文案：' + (full && full.reason));

  store.init({ fresh: true, force: true, now: NOON });
  for (let i = 1; i <= XC.maxPerDay; i++) {
    const before = selectors.arenaView(store.getState(), Date.now()).extra;
    const r = store.arenaBuyExtra();
    assert(r.ok === before.canBuy, '第 ' + i + ' 次：canBuy=' + before.canBuy + ' 与命令结果 ' + r.ok + ' 不一致');
    assert(r.ok && r.bought === i, '第 ' + i + ' 次加赛应成功：' + r.reason);
  }
  assert(selectors.arenaView(store.getState(), Date.now()).extra.canBuy === false, '购满后视图应关闭');
  return true;
});

check('reducer 防御：直派伪造 payload（n 跳变 / 改价 / 日期不符 / 缺时间 / 余额不足）一律不动存档', () => {
  store.init({ fresh: true, force: true, now: NOON });
  const today = arenaUtil.dayKeyOf(Date.now());
  const nowMs = Date.now();
  const snap = JSON.stringify(store.getState());
  const cases = [
    ['n 跳变', { dayKey: today, n: 3, cost: XC.costDiamonds, now: nowMs }],
    ['n 倒退', { dayKey: today, n: 0, cost: XC.costDiamonds, now: nowMs }],
    ['超上限 n', { dayKey: today, n: XC.maxPerDay + 1, cost: XC.costDiamonds, now: nowMs }],
    ['单价篡改', { dayKey: today, n: 1, cost: 1, now: nowMs }],
    ['日期不符', { dayKey: '2000-01-01', n: 1, cost: XC.costDiamonds, now: nowMs }],
    ['缺时间', { dayKey: today, n: 1, cost: XC.costDiamonds, now: undefined }]
  ];
  cases.forEach((cse) => {
    const out = reducers.reduce(store.getState(), store.actions.arenaBuyExtra(cse[1].dayKey, cse[1].n, cse[1].cost, cse[1].now));
    assert(JSON.stringify(out) === snap, cse[0] + '：伪造 payload 改动了存档');
  });
  const poor = JSON.parse(snap);
  poor.profile.diamond = 0;
  const out2 = reducers.reduce(poor, store.actions.arenaBuyExtra(today, 1, XC.costDiamonds, nowMs));
  assert(JSON.stringify(out2) === JSON.stringify(poor), '余额不足时应原样返回');
  return true;
});

check('跨天滚动：加赛跨天清零（买后跨天再打一场 → extraToday 归 0、total 回免费档）', () => {
  const t0 = Date.now();
  const today = arenaUtil.dayKeyOf(t0);
  const tomorrowTs = t0 + 24 * 3600 * 1000;
  const tmrKey = arenaUtil.dayKeyOf(tomorrowTs);
  store.init({ fresh: true, force: true, now: NOON });
  const b = store.arenaBuyExtra();
  assert(b.ok, b.reason);
  let st = store.getState();
  assert(st.arena.extraToday === 1 && st.arena.dayKey === today, '加赛应落在今天：' + st.arena.dayKey);
  const fake = { result: 'win', margin: 5, homeScore: 80, awayScore: 75, ot: 0, away: { name: 'x' } };
  st = reducers.reduce(st, store.actions.arenaResult({
    result: fake, opponentId: arenaData.LADDER[0].id, opponentName: 'x', rewards: {},
    ratingDelta: 10, staminaCost: 0, dayKey: tmrKey, seed: 'r-cross', snapshot: null, now: tomorrowTs
  }));
  assert(st.arena.extraToday === 0 && st.arena.usedToday === 1 && st.arena.dayKey === tmrKey, '跨天应把加赛一起清零');
  const av = arenaUtil.dailyOf(st.arena, tomorrowTs, AC);
  assert(av.extra === 0 && av.total === AC.dailyChallenges && av.left === AC.dailyChallenges - 1,
    '跨天后 total 应回免费档：' + JSON.stringify(av));
  return true;
});

check('上限封顶与出路提示：免费打满的失败文案提示加赛；买满 + 打满 10 场后第 11 场被拦', () => {
  store.init({ fresh: true, force: true, now: NOON });
  for (let i = 0; i < AC.dailyChallenges; i++) {
    const rr = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-cap-' + i });
    assert(rr.ok, '第 ' + (i + 1) + ' 场应可挑战：' + rr.reason);
  }
  const blocked = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-cap-hint' });
  assert(blocked.ok === false && blocked.reason.indexOf('次数') !== -1 && blocked.reason.indexOf('加赛') !== -1,
    '免费打满的失败文案应提示加赛出路：' + (blocked && blocked.reason));

  for (let i = 0; i < XC.maxPerDay; i++) {
    const r = store.arenaBuyExtra();
    assert(r.ok, '第 ' + (i + 1) + ' 次加赛应成功：' + r.reason);
  }
  const over = store.arenaBuyExtra();
  assert(over.ok === false && over.reason.indexOf('购满') !== -1, '购满后的加赛应被拦：' + (over && over.reason));

  const total = AC.dailyChallenges + XC.maxPerDay;
  for (let i = AC.dailyChallenges; i < total; i++) {
    const rr = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-cap-' + i });
    assert(rr.ok, '第 ' + (i + 1) + ' 场应可挑战：' + rr.reason);
  }
  assert(store.getState().arena.usedToday === total, 'usedToday 应到 ' + total);
  const eleventh = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-cap-x' });
  assert(eleventh.ok === false && eleventh.reason.indexOf('次数') !== -1, '打满后应被次数拦下：' + (eleventh && eleventh.reason));
  assert(selectors.arenaView(store.getState(), Date.now()).canFight === false, '打满后 canFight 应为 false');
  return true;
});

check('加赛场次快照复现：第 6 场（加赛位）与原局逐字节一致', () => {
  store.init({ fresh: true, force: true, now: NOON });
  const b = store.arenaBuyExtra();
  assert(b.ok, b.reason);
  for (let i = 0; i < AC.dailyChallenges; i++) {
    const rr = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-replay-' + i });
    assert(rr.ok, rr.reason);
  }
  const sixth = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id });
  assert(sixth.ok, sixth.reason);
  const hist = store.getState().arena.history[0];
  assert(hist.snapshot && hist.snapshot.seed === sixth.seed, '第 6 场快照未落库');
  const rep = store.replaySnapshot(hist.snapshot);
  assert(rep.ok, rep.reason);
  assert(JSON.stringify(rep.result) === JSON.stringify(sixth.result), '加赛场次的复现与原局不一致');
  return true;
});

check('开关对照：extraChallenges.enabled=false → 命令拒绝 / 视图关闭 / 同 seed 战斗投影逐字节不变', () => {
  store.init({ fresh: true, force: true, now: NOON });
  const on = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-switch' });
  assert(on.ok, on.reason);
  withExtra({ enabled: false }, () => {
    store.init({ fresh: true, force: true, now: NOON });
    const g = selectors.arenaView(store.getState(), Date.now()).extra;
    assert(g.enabled === false && g.canBuy === false && g.buyText === '', '关闭后视图应整体关闭加赛位');
    const r = store.arenaBuyExtra();
    assert(r.ok === false && r.reason.indexOf('加赛') !== -1, '关闭后命令应拒绝：' + (r && r.reason));
    const off = store.arenaChallenge({ opponentId: arenaData.LADDER[0].id, seed: 'r-switch' });
    assert(off.ok, off.reason);
    assert(battleProjection(off.result) === battleProjection(on.result), '加赛开关不该影响战斗结果');
  });
  return true;
});

check('存档迁移与往返：缺 extraToday / 脏形状 → 归一为 0；hydrate 往返后 arena 段不漂移', () => {
  store.init({ fresh: true, force: true, now: NOON });
  const st0 = JSON.parse(JSON.stringify(store.getState()));
  const legacy = JSON.parse(JSON.stringify(st0));
  delete legacy.arena.extraToday;
  assert(store.migrate(legacy, 1000).arena.extraToday === 0, '缺 extraToday 应补 0');
  const dirty = JSON.parse(JSON.stringify(st0));
  dirty.arena.extraToday = 'x';
  assert(store.migrate(dirty, 1000).arena.extraToday === 0, '脏字符串应归一为 0');
  dirty.arena.extraToday = -2;
  assert(store.migrate(dirty, 1000).arena.extraToday === 0, '负数应归一为 0');
  dirty.arena.extraToday = 2.7;
  assert(store.migrate(dirty, 1000).arena.extraToday === 2, '小数应向下取整');
  const round = JSON.parse(JSON.stringify(store.getState()));
  store.dispatch(store.actions.hydrate(round));
  assert(JSON.stringify(store.getState().arena) === JSON.stringify(round.arena), '存档往返后 arena 段漂移');
  return true;
});

check('页面层：竞技场页加赛购买从页面真实驱动；模板与源码纪律', () => {
  store.init({ fresh: true, force: true, now: NOON });
  kResetUi();
  const inst = kMount('pages/arena/arena.js', {});
  try {
    const av = selectors.arenaView(store.getState(), Date.now());
    assert(inst.data.extra && inst.data.extra.canBuy === av.extra.canBuy, '页面加赛位与 selectors 不一致');
    assert(inst.data.extraNote === av.extraNote && inst.data.diamondText === av.diamonds + ' 钻', '加赛文案与 selectors 不一致');
    const d0 = store.getState().profile.diamond;
    inst.buyExtra();
    assert(store.getState().arena.extraToday === 1 && store.getState().profile.diamond === d0 - XC.costDiamonds, '页面购买未落库');
    assert(K_UI.toast.some((t) => t.indexOf('已加赛') !== -1), '购买成功应给 toast：' + JSON.stringify(K_UI.toast));
    const poor = JSON.parse(JSON.stringify(store.getState()));
    poor.profile.diamond = 0;
    store.dispatch(store.actions.hydrate(poor));
    const before = store.getState().arena.extraToday;
    kResetUi();
    inst.buyExtra();
    assert(store.getState().arena.extraToday === before, '不可买时不该改动存档');
    assert(K_UI.toast.some((t) => t.indexOf('钻石') !== -1), '不可买应 toast 原因：' + JSON.stringify(K_UI.toast));
  } finally { kUnmount(inst); }
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/arena/arena.wxml'), 'utf8');
  [['bindtap="buyExtra"', '缺加赛入口'], ['{{extra.buyText}}', '缺加赛按钮文案'], ['{{extraNote}}', '缺加赛规则说明']]
    .forEach((n) => assert(wxml.indexOf(n[0]) !== -1, n[1]));
  const js = fs.readFileSync(path.join(ROOT, 'pages/arena/arena.js'), 'utf8');
  assert(js.indexOf('store.arenaBuyExtra(') !== -1, '页面缺加赛命令出口');
  assert(js.indexOf('store.dispatch(') === -1, '页面不该直派 action');
  return true;
});

check('陈旧占位收口：设置页音效文案诚实化；版本号后缀与里程碑一致；竞技商城公示提示加赛出口', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/settings/settings.wxml'), 'utf8');
  assert(wxml.indexOf('里程碑 2 接入音频总线') === -1, '音效文案还在承诺「里程碑 2 接入」');
  assert(wxml.indexOf('当前版本未接入音频输出') !== -1, '音效开关缺少诚实说明');
  assert(/^M\d+$/.test(CONFIG.MILESTONE), 'MILESTONE 格式应为 M+数字：' + CONFIG.MILESTONE);
  assert(CONFIG.VERSION.slice(-(CONFIG.MILESTONE.length + 1)).toLowerCase() === '-' + CONFIG.MILESTONE.toLowerCase(),
    'VERSION 后缀应与 MILESTONE 一致：' + CONFIG.VERSION + ' / ' + CONFIG.MILESTONE);
  const sv = selectors.shopView(store.getState());
  assert(sv.incomeText.indexOf('加赛') !== -1, '竞技商城收入公示未提示加赛出口：' + sv.incomeText);
  return true;
});/* ================= 汇总 ================= */
console.log('\n========================================');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log(' - ' + f));
}
console.log('========================================');
process.exit(fail === 0 ? 0 : 1);
