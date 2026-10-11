/* utils/battle.js —— 比赛状态机与属性对抗结算（第七章 7.4 单一出口）
 * 职责：把「回合开始 → 战术判定 → 持球人判定 → 属性对抗结算 → 触发动画/文字 → 回合结束」
 *       实现成确定性状态机，产出可复现的逐回合战报、分节比分、球员统计与胜负判定。
 *
 * 【结算公式（文档原文）】
 *   A_eff = 持球人进攻属性(依战术取 inside/mid/three/handle) × rand(0.85,1.15)
 *   D_eff = 防守人防守属性(block/steal/defIQ)             × rand(0.85,1.15)
 *   若 A_eff ≥ D_eff ⇒ 命中；否则 hit = clamp(0.5 + (A_eff−D_eff)/100, 0.05, 0.95) 掷骰。
 *   单节 12 回合（每队），四节后比分高者胜；平分进「决胜 2 回合」，最多 maxOt 次。
 *
 * 【战术克制（里程碑 2）】相位 2「战术判定」现在是双方的判定：
 *   防守方在归一化阶段就把策略定调（auto 只推导一次，不逐回合掷骰 ⇒ 可侦察、可复现、不额外消耗随机流），
 *   进攻方再按「基础权重 × 打法 × 属性契合 × 能否克制对方防守」挑战术。
 *   克制只作用在 A/D 的**基础值**上（×(1+config.battle.counter.bonus)），再进 rand(0.85,1.15)，
 *   因此文档公式的形状与量纲都没变。counter.enabled=false 时不选策略、不加乘数、不改权重、不掷解说骰。
 *
 * 【可复现性】所有随机都来自注入 seed 的 utils/rng.js，禁止 Date.now()/Math.random() 参与结算；
 *   同一 seed + 同一双方阵容 ⇒ 逐回合完全一致（tools/replay-battle.mjs 会验证）。
 */
const CONFIG = require('../config.js');
const rngUtil = require('./rng.js');
const fmt = require('./format.js');
const tacticData = require('../data/tactics.js');
const commentary = require('../data/commentary.js');
const ovrUtil = require('./ovr.js');
const bondUtil = require('./bond.js');
const momentUtil = require('./moment.js');

const B = CONFIG.battle;

/* 状态机相位（文档 7.4 的六步） */
const PHASES = ['roundStart', 'tactic', 'handler', 'contest', 'feedback', 'roundEnd'];

/* 状态机转移表：每个相位允许进入的下一相位集合（tools/verify.mjs 会用它校验实现） */
/* 日志级转移表：log[i].phase 记录的是「该条战报结束时所处相位」，
 * 因此相邻两条战报的相位必须落在下面这张表里（tools/verify.mjs 用它校验）。
 * 单回合内部的六相位顺序由 PHASES 描述，并用 entry.phasesRun 记录实际执行数。 */
const TRANSITIONS = {
  roundStart: ['roundEnd'],
  roundEnd: ['roundEnd', 'quarterEnd'],
  quarterEnd: ['roundStart', 'overtime', 'finished'],
  overtime: ['roundEnd'],
  finished: []
};

/* 队伍归一化：只取首发 5 人上场（替补在里程碑 2 开放轮换） */
function normalizeTeam(team, side) {
  const raw = (team && team.players) || [];
  const basePlayers = raw.map(function (p, i) {
    return {
      uid: p.uid || (side + '-' + i),
      name: p.name || ('球员' + (i + 1)),
      number: p.number === undefined ? i : p.number,
      position: p.position || 'SF',
      ovr: Number(p.ovr) || 0,
      salary: Number(p.salary) || 0,
      attrs: ovrUtil.normalizeAttrs(p.attrs),
      /* 羁绊判定用的元数据（第七章 7.3）。缺字段就当没有这个维度，不影响其它逻辑：
       * tools/verify.mjs 的 D 组用的就是不带这些字段的合成队伍，因此羁绊为 0，
       * 「结算公式 / 相位 / 回合数」等断言与里程碑 1 完全同口径。 */
      team: p.team || '',
      era: p.era || '',
      draft: Number(p.draft) || 0,
      playerId: p.playerId || '',
      tags: p.tags || [],
      /* 名场面时刻卡（第八章，里程碑 2）：实例上佩戴的卡 id。
       * 与 team/era/tags 一样属于「判定输入的元数据」，缺字段就当没戴（D 组的合成队伍即如此），
       * 因此里程碑 1/2 的既有断言与本文件的老调用方一行都不用改。 */
      moment: p.moment || ''
    };
  });

  /* 羁绊（第七章 7.3，里程碑 2）：
   *   - 只作用于上场 5 人的**战斗属性**；ovr / salary 一律不动（config.bond 裁决 1：工资帽不能随站位漂移）。
   *   - utils/bond.js 是纯函数（无随机、无时间），所以「同 seed + 同阵容 ⇒ 逐字节可复现」这条红线不破。
   *   - 主客双方都算，公平且让 BOSS 关的传奇阵容有自己的性格。
   *   - 用新对象承载加成后的属性，不修改调用方传进来的数组（selectors/stages 的对象可被复用）。 */
  const onCourtBase = basePlayers.slice(0, CONFIG.roster.starterCount);
  const bondEval = bondUtil.evaluateLineup(onCourtBase);
  const boosted = {};
  onCourtBase.forEach(function (p) {
    const pct = bondEval.bonusByUid[p.uid];
    if (!pct) return;
    boosted[p.uid] = Object.assign({}, p, { attrs: bondUtil.applyBonus(p.attrs, pct), bondPct: pct });
  });
  /* lift 同时承担两件事：贴羁绊加成后的属性、把 moment id 解析成时刻卡定义。
   * 为什么在这里解析而不是每回合查表：一局 96 个进攻回合，解析一次就够；
   * 更关键的是 normalizeTeam 是 battle 与 selectors 的共用入口，两边拿到的必须是**同一份**定义对象
   * （AGENTS.md §3 单一出口 —— 否则会出现「详情页说 +20%、比赛里没生效」）。
   * momentUtil 关闭 / id 非法时返回 null ⇒ 后续所有乘数恒为 1 ⇒ 随机流与基线逐字节一致。 */
  const lift = function (p) {
    const q = boosted[p.uid] || p;
    const mDef = momentUtil.defOfInstance(q);
    return mDef ? Object.assign({}, q, { momentDef: mDef }) : q;
  };
  const players = basePlayers.map(lift);
  const onCourt = onCourtBase.map(lift);
  const momentEval = momentUtil.evaluateLineup(onCourt);
  const style = tacticData.PLAY_STYLES[(team && team.playStyle) || 'balanced'] || tacticData.PLAY_STYLES.balanced;

  // 战术权重 = 基础权重 × 打法乘数 × 队伍属性契合度（让高三分队伍自然更爱投三分）
  const avg = averageAttrs(onCourt);
  const items = tacticData.TACTICS.map(function (t) {
    const mul = (style.mul && style.mul[t.key]) || 1;
    const fit = fmt.clamp((avg[t.offAttr] || 70) / 80, 0.6, 1.5);
    return { t: t, w: t.weight * mul * fit };
  });

  /* 战术克制（第七章 7.4「战术判定」，里程碑 2）：
   *   defense   —— 本局定调的防守策略（阵容页/关卡表/天梯表指定的 key，或 auto 推导结果）
   *   tacticVs  —— 对三套防守策略各自的加权战术表（与对手是谁无关，所以这里一次算完，回合内只查表） */
  const defense = resolveDefense({ defense: (team && team.defense) || tacticData.AUTO_DEFENSE }, avg);
  const tacticVs = buildTacticVs(items);

  return {
    side: side,
    name: (team && team.name) || (side === 'home' ? '梦之队' : '对手'),
    playStyle: style.key,
    playStyleName: style.name,
    defense: defense,
    tacticVs: tacticVs,
    players: players,
    onCourt: onCourt,
    avg: avg,
    tacticItems: items,
    ovr: Math.round(players.reduce(function (s, p) { return s + p.ovr; }, 0) / Math.max(1, onCourt.length)),
    /* 羁绊结果随队伍对象带出，teamEcho 再转成结算面板能直接渲染的形状 */
    bonds: bondEval.bonds,
    bondCount: bondEval.count,
    bondSummaryText: bondEval.summaryText,
    /* 时刻卡结果随队伍对象带出，teamEcho 再转成结算面板能直接渲染的形状（与 bonds 同一条路） */
    moments: momentEval.list,
    momentCount: momentEval.count,
    momentSummaryText: momentEval.summaryText
  };
}

/* 防守策略定调：给了合法 key 就用它；auto（默认）则按队伍平均防守属性推导，一局只推导一次。
 * 为什么不用逐回合掷骰：① 对手策略必须能被玩家侦察（关卡详情 / 竞技场侦察面板读的就是这个函数）；
 * ② 不额外消耗随机流 ⇒ 「counter 关闭」与「bonus=0」两种回退能与旧基线逐字节对齐（I 组反向对照）。
 * 纯函数：不读存档、不碰 wx、不用 Date.now()/Math.random()。 */
function resolveDefense(team, avg) {
  const C = B.counter || {};
  const key = (team && team.defense) || tacticData.AUTO_DEFENSE;
  const fixed = tacticData.defenseByKey(key);
  if (fixed) {
    return { key: fixed.key, name: fixed.name, short: fixed.short, desc: fixed.desc, weight: fixed.weight, auto: false };
  }
  const a = avg || averageAttrs((((team && team.players) || []).slice(0, CONFIG.roster.starterCount)).map(function (p) {
    return { attrs: ovrUtil.normalizeAttrs(p.attrs) };
  }));
  let best = null;
  let bestW = -Infinity;
  tacticData.DEFENSES.forEach(function (d) {
    const attr = (C.autoDefense && C.autoDefense[d.key]) || 'defIQ';
    const w = d.weight * ((a[attr] || 70) / (C.autoAttrDivisor || 80));
    /* 最大值必须单独用 bestW 记：best 对象里那个字段叫 weight。
     * 早期写成 w > best.w（undefined）⇒ 比较恒为 false，auto 永远回落到 DEFENSES[0]「人盯人」，
     * 整条属性推导失效（tools/verify.mjs I 组「auto 推导」断言就是盯这个）。平局保留先出现的一套，结果稳定。 */
    if (best === null || w > bestW) { bestW = w; best = { key: d.key, name: d.name, short: d.short, desc: d.desc, weight: w, auto: true }; }
  });
  return best;
}

/* 对每套防守策略生成一份「加权后的进攻战术表」：能克制该策略的战术权重 ×tacticWeightMul。
 * counter 关闭时返回 null，pickTactic 会回落到基础表（与里程碑 1 同一条随机流）。 */
function buildTacticVs(items) {
  const C = B.counter;
  if (!C || !C.enabled) return null;
  const out = {};
  tacticData.DEFENSES.forEach(function (d) {
    out[d.key] = items.map(function (it) {
      const tag = tacticData.counterOf(it.t.key, d.key);
      return tag === tacticData.COUNTER.attack ? { t: it.t, w: it.w * C.tacticWeightMul } : { t: it.t, w: it.w };
    });
  });
  return out;
}

function averageAttrs(players) {
  const out = {};
  const n = Math.max(1, players.length);
  ovrUtil.ATTR_KEYS.forEach(function (k) {
    let s = 0;
    players.forEach(function (p) { s += p.attrs[k]; });
    out[k] = s / n;
  });
  return out;
}

/* 体力衰减：每过一节，低体力球员属性下降（确定性，不用随机） */
function fatigueFactor(attrs, quarter) {
  const st = Number(attrs.stamina) || 80;
  const drop = (quarter - 1) * B.fatigue.perQuarter * (1 - st / 100) * B.fatigue.weight;
  return fmt.clamp(1 - drop, 0.7, 1);
}

/* 相位 2：战术判定。defKey = 对方本局定调的防守策略；
 * 克制开启时用「针对该策略的加权表」，否则回落基础表（随机流与里程碑 1 完全一致）。 */
function pickTactic(rng, team, defKey) {
  const items = (defKey && team.tacticVs && team.tacticVs[defKey]) || team.tacticItems;
  return rng.weighted(items, 'w').t;
}

/* 相位 3：持球人判定（越擅长该战术属性 + 进攻意识越高，越容易拿球）
 * quarter 是里程碑 2 新加的第 4 个参数：时刻卡的「末节/下半场」类条件需要知道现在是第几节。
 * 老调用方不传 ⇒ quarter=undefined ⇒ 带节次条件的卡一律不命中（乘数 1），不会误触发。 */
function pickShooter(rng, players, tactic, quarter) {
  const items = players.map(function (p) {
    let w = Math.max(1, p.attrs[tactic.offAttr] + p.attrs.offIQ * 0.4);
    /* 名场面时刻卡：出手权重乘数（文档「81 分之夜（得分权重翻倍）」就落在这一行）。
     * 没戴卡时 mm 恒为 1 ⇒ w 与基线完全相同 ⇒ rng.weighted 的落点不变 ⇒ 随机流逐字节一致。
     * 刻意不调用任何 rng：时刻卡是确定性乘数，不掷额外的骰子（可复现红线）。 */
    if (p.momentDef) {
      const mm = momentUtil.shooterMul(p.momentDef, tactic.key, quarter);
      if (mm !== 1) w = w * mm;
    }
    return { p: p, w: w };
  });
  return rng.weighted(items, 'w').p;
}

/* 相位 3b：防守人判定（防守属性平方加权 ⇒ 最强防守人更可能对上位） */
function pickDefender(rng, players, tactic) {
  const items = players.map(function (p) {
    const d = p.attrs[tactic.defAttr];
    return { p: p, w: Math.max(1, (d * d) / 10) };
  });
  return rng.weighted(items, 'w').p;
}

/* 相位 4：属性对抗结算（严格按文档公式）
 * counter 是第 6 个可选参数 { tag: 'attack'|'defend'|'neutral' }，缺省即 neutral —— 老调用方（含 D 组断言）不用改。
 * 克制乘子作用在 A/D 的基础值上，再进 rand(0.85,1.15)，所以公式形状与量纲不变。 */
function resolve(rng, shooter, defender, tactic, quarter, counter) {
  const fs = fatigueFactor(shooter.attrs, quarter);
  const fd = fatigueFactor(defender.attrs, quarter);
  const tag = (counter && counter.tag) || tacticData.COUNTER.neutral;
  let A = shooter.attrs[tactic.offAttr] * fs;
  let D = defender.attrs[tactic.defAttr] * fd;
  if (tag !== tacticData.COUNTER.neutral && B.counter && B.counter.enabled) {
    const mul = 1 + B.counter.bonus;
    if (tag === tacticData.COUNTER.attack) A = A * mul; else D = D * mul;
  }
  /* 名场面时刻卡（第八章，里程碑 2）：只作用在**出手人自己**的 A 基础值上，与克制乘数同层，
   * 因此文档 7.4 的公式形状与量纲都没变（先乘基础值，再进 rand(0.85,1.15)）。
   * 文档原例「35 秒奇迹（末节三分 +20%）」就落在这里：tactic=three 且 quarter>=4 时 A ×1.2。
   * mm 恒为 1 时 A 一字不动 ⇒ 随机流与基线逐字节一致（verify.mjs L 组反向对照锁死）。 */
  if (shooter.momentDef) {
    const mm = momentUtil.attrMul(shooter.momentDef, tactic.key, quarter);
    if (mm !== 1) A = A * mm;
  }
  const aEff = A * rng.float(B.variance[0], B.variance[1]);
  const dEff = D * rng.float(B.variance[0], B.variance[1]);
  let made = false;
  let hitP = 1;
  if (aEff >= dEff) {
    made = true;
  } else {
    hitP = fmt.clamp(B.hit.base + (aEff - dEff) / B.hit.divisor, B.hit.clamp[0], B.hit.clamp[1]);
    made = rng.chance(hitP);
  }
  return {
    A: A, D: D, aEff: aEff, dEff: dEff, made: made,
    hitP: aEff >= dEff ? 1 : hitP,
    counter: tag,
    fatigue: { shooter: fs, defender: fd }
  };
}

/* 相位 5：未命中时的附加事件（盖帽 or 防守篮板） */
function resolveMiss(rng, def, defender, shooter) {
  const blockP = fmt.clamp(B.eventChance.blockOnMiss * (defender.attrs.block / 85), 0, 0.6);
  if (rng.chance(blockP)) return { event: 'block', player: defender };
  const items = def.onCourt.map(function (p) { return { p: p, w: Math.max(1, p.attrs.dreb) }; });
  return { event: 'rebound', player: rng.weighted(items, 'w').p };
}

/* 主模拟入口 */
function simulate(opts) {
  const options = opts || {};
  const seed = options.seed || rngUtil.newSeed('m');
  const rng = rngUtil.createRng(seed);
  const roundsPerQuarter = options.roundsPerQuarter || B.roundsPerQuarter;
  const quarterCount = options.quarters || B.quarters;
  const otRounds = options.otRounds || B.otRounds;
  const maxOt = options.maxOt || B.maxOt;
  /* 比赛模式（里程碑 2）：'arena' = 竞技场（异步 PVP），其余/缺省 = PVE 赛季征程。
   * 唯一用途是**换解说文案池**（data/commentary.js 的 ARENA_MIX），不参与任何数值判定：
   * 候选池合并后 pick() 仍只消耗 1 个随机数 ⇒ 比分与整条随机流与 PVE 基线完全一致，
   * 只有战报文字变（详见 data/commentary.js 里 ARENA_MIX 的注释）。
   * 快照复现必须传同一个 mode，否则文案对不上 ⇒ 「逐字节一致」会红。 */
  const mode = options.mode === 'arena' ? 'arena' : 'pve';

  const home = normalizeTeam(options.home, 'home');
  const away = normalizeTeam(options.away, 'away');
  const teams = { home: home, away: away };

  const stats = { home: initStats(home), away: initStats(away) };
  const log = [];
  const quarters = [];
  const streak = { home: 0, away: 0 };
  /* 战术克制：counterOn 是全局开关的一次性快照（B.counter.enabled），
   * counters 统计双方各触发了多少次「我方战术克对手防守 / 对手防守克我方战术」，结算面板直接渲染。 */
  const counterOn = !!(B.counter && B.counter.enabled);
  const counters = { home: { attack: 0, defend: 0 }, away: { attack: 0, defend: 0 } };
  let homeScore = 0;
  let awayScore = 0;
  let possessionSide = rng.chance(0.5) ? 'home' : 'away';
  let phaseSeq = 0;
  let otCount = 0;
  let finished = false;

  function pushLog(entry) {
    entry.i = phaseSeq++;
    log.push(entry);
    return entry;
  }

  function text(type, vars) {
    return commentary.pick(rng, type, vars, mode);
  }

  function scoreVars() {
    return { score: fmt.scoreText(homeScore, awayScore) };
  }

  function playRound(quarter, quarterLabel, roundInQuarter) {
    const off = teams[possessionSide];
    const defSide = possessionSide === 'home' ? 'away' : 'home';
    const def = teams[defSide];

    // 相位 1：回合开始（不产生随机）
    /* 相位 2 战术判定：防守策略已在归一化阶段定调（这里只读），进攻战术按克制加权表挑。 */
    const defScheme = def.defense;
    const tactic = pickTactic(rng, off, defScheme.key);          // 相位 2
    const shooter = pickShooter(rng, off.onCourt, tactic, quarter); // 相位 3（quarter 供时刻卡的节次条件判定）
    const defender = pickDefender(rng, def.onCourt, tactic);    // 相位 3b
    const counterTag = counterOn ? tacticData.counterOf(tactic.key, defScheme.key) : tacticData.COUNTER.neutral;
    if (counterTag !== tacticData.COUNTER.neutral) counters[possessionSide][counterTag] += 1;
    const res = resolve(rng, shooter, defender, tactic, quarter, counterOn ? { tag: counterTag } : null); // 相位 4

    const entry = {
      q: quarter,
      qLabel: quarterLabel,
      r: roundInQuarter,
      side: possessionSide,
      offName: off.name,
      defName: def.name,
      tactic: tactic.key,
      tacticName: tactic.name,
      defense: defScheme.key,
      defenseName: defScheme.name,
      /* 空串 = 无克制关系（WXML 里 wx:if="{{item.counter}}" 直接可用，不需要三元判断） */
      counter: counterTag === tacticData.COUNTER.neutral ? '' : counterTag,
      counterSide: counterTag === tacticData.COUNTER.neutral ? '' : possessionSide,
      points: tactic.points,
      shooter: shooter.name,
      shooterUid: shooter.uid,
      defender: defender.name,
      defenderUid: defender.uid,
      aEff: Math.round(res.aEff * 10) / 10,
      dEff: Math.round(res.dEff * 10) / 10,
      hitP: Math.round(res.hitP * 100) / 100,
      made: res.made,
      event: res.made ? (tactic.points === 3 ? 'three' : 'two') : 'miss',
      phasesRun: PHASES.length, // 单回合内部走完六个相位
      phase: 'feedback'
    };

    if (res.made) {
      if (possessionSide === 'home') homeScore += tactic.points; else awayScore += tactic.points;
      addScore(stats[possessionSide], shooter.uid, tactic);
      streak[possessionSide] += 1;
      streak[defSide] = 0;
    } else {
      const miss = resolveMiss(rng, def, defender, shooter);    // 相位 5
      entry.event = miss.event;
      if (miss.event === 'block') {
        addBlock(stats[defSide], defender.uid);
      } else {
        addRebound(stats[defSide], miss.player.uid);
      }
      streak[possessionSide] = 0;
    }

    // 相位 5：触发动画/文字
    const v = Object.assign({
      player: entry.shooter,
      defender: entry.defender,
      team: off.name,
      defTeam: def.name,
      pts: tactic.points,
      tactic: tactic.name,
      defense: defScheme.name,
      q: quarterLabel,
      margin: Math.abs(homeScore - awayScore)
    }, scoreVars());

    let type;
    if (entry.event === 'block') type = 'block';
    else if (entry.event === 'rebound') type = rng.chance(0.55) ? 'rebound' : 'miss';
    else if (entry.event === 'three') type = 'make3';
    else type = 'make2';

    /* 克制解说（config.battle.counter.mention）：只在真的发生克制、且 mention > 0 时才掷这一次骰。
     * 这条 if 的短路顺序是刻意安排的 —— mention=0 或 counter 关闭时完全不消耗随机流，
     * I 组的「bonus=0 ⇒ 与关闭态逐字节一致」反向对照靠的就是它。 */
    /* 只在「文案与事实相符」时才替换：克制方命中 → counterAttack；被克方打铁 → counterDefend。
     * 盖帽有专属文案（更生动），这里让位；短路顺序保证 mention=0 时不消耗随机流。 */
    if (entry.counter && entry.event !== 'block' && B.counter.mention > 0) {
      const punish = entry.counter === tacticData.COUNTER.attack ? entry.made : !entry.made;
      if (punish && rng.chance(B.counter.mention)) {
        type = entry.counter === tacticData.COUNTER.attack ? 'counterAttack' : 'counterDefend';
      }
    }

    if (entry.made && streak[possessionSide] >= 4 && rng.chance(0.4)) type = 'hotStreak';
    if (!entry.made && rng.chance(0.06)) {
      const margin = homeScore - awayScore;
      const leading = margin > 0 ? 'home' : 'away';
      if (Math.abs(margin) >= 12 && leading === possessionSide) type = 'bigLead';
      else if (Math.abs(margin) >= 8 && leading !== possessionSide) type = 'comeback';
    }

    entry.text = text(type, v);
    entry.home = homeScore;
    entry.away = awayScore;
    entry.phase = 'roundEnd';
    pushLog(entry);

    // 相位 6：回合结束 → 攻守转换
    possessionSide = defSide;
  }

  function playQuarter(quarter, rounds, label) {
    let qh = 0;
    let qa = 0;
    const hs = homeScore;
    const as = awayScore;
    pushLog({ q: quarter, qLabel: label, kind: 'info', text: text('quarterStart', Object.assign({ q: label, team: teams[possessionSide].name }, scoreVars())), home: homeScore, away: awayScore, phase: 'roundStart' });
    for (let r = 0; r < rounds * 2; r++) {
      // 每队各 rounds 个回合：交替上场
      playRound(quarter, label, Math.floor(r / 2) + 1);
    }
    qh = homeScore - hs;
    qa = awayScore - as;
    quarters.push({ q: quarter, label: label, home: qh, away: qa, totalHome: homeScore, totalAway: awayScore });
    pushLog({ q: quarter, qLabel: label, kind: 'info', text: text('quarterEnd', Object.assign({ q: label, team: teams[possessionSide].name }, scoreVars())), home: homeScore, away: awayScore, phase: 'quarterEnd' });
  }

  for (let q = 1; q <= quarterCount; q++) {
    playQuarter(q, roundsPerQuarter, '第' + q + '节');
  }

  while (homeScore === awayScore && otCount < maxOt) {
    otCount += 1;
    pushLog({ kind: 'info', ot: otCount, text: text('ot', scoreVars()), home: homeScore, away: awayScore, phase: 'overtime' });
    const hs = homeScore;
    const as = awayScore;
    for (let r = 0; r < otRounds * 2; r++) playRound(quarterCount + otCount, '加时' + otCount, Math.floor(r / 2) + 1);
    quarters.push({ q: quarterCount + otCount, label: '加时' + otCount, home: homeScore - hs, away: awayScore - as, totalHome: homeScore, totalAway: awayScore, ot: otCount });
    /* 加时段也要用 quarterEnd 收尾，与 playQuarter 对称。
     * 存量缺陷：原来加时只在开头 push 一条 overtime，段末直接跳到 finished，
     * 于是最后两条战报是 roundEnd → finished，而 TRANSITIONS 里 roundEnd 只允许到 roundEnd/quarterEnd。
     * 里程碑 1 没暴露是因为 18 关的固定 seed 都没打进加时；里程碑 2 羁绊改了比分，s2-2 进加时后被
     * tools/replay-battle.mjs 抓到。修法选「补齐状态机」而不是「放宽 TRANSITIONS」——后者会把断言变成摆设。 */
    pushLog({ kind: 'info', ot: otCount, text: text('quarterEnd', Object.assign({ q: '加时' + otCount, team: teams[possessionSide].name }, scoreVars())), home: homeScore, away: awayScore, phase: 'quarterEnd' });
  }

  finished = true;
  const margin = homeScore - awayScore;
  const result = margin > 0 ? 'win' : (margin < 0 ? 'lose' : 'draw');
  const mvp = pickMvp(stats, home, away);
  const endVars = Object.assign({ team: result === 'win' ? home.name : away.name, margin: Math.abs(margin) }, scoreVars());
  pushLog({ kind: 'info', final: true, text: text(result === 'win' ? 'win' : (result === 'lose' ? 'lose' : 'ot'), endVars), home: homeScore, away: awayScore, phase: 'finished' });

  return {
    seed: seed,
    engineVersion: '1.0',
    /* 回带模式：页面/验收脚本可以直接从结果对象读到「这局是竞技场还是 PVE」，
     * 不必自己记住调用时传了什么（比赛页三种入口共用一个出口，最容易在这里搞混）。 */
    mode: mode,
    finished: finished,
    home: teamEcho(home),
    away: teamEcho(away),
    quarters: quarters,
    homeScore: homeScore,
    awayScore: awayScore,
    margin: margin,
    result: result,
    ot: otCount,
    counters: counters,
    counterEnabled: counterOn,
    rounds: roundsPerQuarter * quarterCount + otRounds * otCount,
    stars: starsOf(margin, result),
    log: log,
    stats: { home: statList(stats.home, home), away: statList(stats.away, away) },
    mvp: mvp,
    playedAt: options.playedAt || 0
  };
}

function teamEcho(team) {
  return {
    name: team.name,
    side: team.side,
    playStyle: team.playStyle,
    playStyleName: team.playStyleName,
    defense: team.defense.key,
    defenseName: team.defense.name,
    defenseShort: team.defense.short,
    defenseAuto: team.defense.auto,
    ovr: team.ovr,
    salary: team.players.reduce(function (s, p) { return s + (p.salary || 0); }, 0),
    players: team.onCourt.map(function (p) {
      return { uid: p.uid, name: p.name, number: p.number, position: p.position, ovr: p.ovr };
    }),
    bonds: (team.bonds || []).map(function (b) {
      return { id: b.id, type: b.type, typeLabel: b.typeLabel, name: b.name, detail: b.detail || '', desc: b.desc, bonusText: b.bonusText, memberNames: b.memberNames };
    }),
    bondCount: team.bondCount || 0,
    bondSummaryText: team.bondSummaryText || '',
    /* 时刻卡（里程碑 2）：effectLines 是给 wx:for 的数组，effectText 是单行摘要。
     * 全部在 utils/moment.js 里算好，页面不自己拼文案（AGENTS.md §4：WXML 不放表达式逻辑）。 */
    moments: (team.moments || []).map(function (m) {
      return {
        uid: m.uid, playerName: m.playerName, momentId: m.momentId,
        name: m.name, rarity: m.rarity, desc: m.desc,
        effectLines: m.effectLines, effectText: m.effectText
      };
    }),
    momentCount: team.momentCount || 0,
    momentSummaryText: team.momentSummaryText || ''
  };
}

function initStats(team) {
  const m = {};
  team.players.forEach(function (p) {
    m[p.uid] = { uid: p.uid, name: p.name, position: p.position, number: p.number, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, blk: 0, dreb: 0 };
  });
  return m;
}

function addScore(stats, uid, tactic) {
  const s = stats[uid];
  if (!s) return;
  s.fga += 1;
  s.fgm += 1;
  s.pts += tactic.points;
  if (tactic.points === 3) { s.tpa += 1; s.tpm += 1; }
}

function addBlock(stats, uid) { if (stats[uid]) stats[uid].blk += 1; }
function addRebound(stats, uid) { if (stats[uid]) stats[uid].dreb += 1; }

/* 投失也要记出手数（在 resolveMiss 前无法知道归属，这里补记） */
function statList(map, team) {
  return team.players.map(function (p) { return map[p.uid]; }).filter(Boolean);
}

function pickMvp(stats, home, away) {
  let best = null;
  ['home', 'away'].forEach(function (side) {
    Object.keys(stats[side]).forEach(function (uid) {
      const s = stats[side][uid];
      const score = s.pts + s.blk * 1.5 + s.dreb;
      if (!best || score > best.score) best = { side: side, uid: uid, name: s.name, pts: s.pts, blk: s.blk, dreb: s.dreb, score: score };
    });
  });
  if (best) delete best.score;
  return best;
}

function starsOf(margin, result) {
  if (result !== 'win') return 0;
  const t = CONFIG.season.starThresholds;
  const m = Math.abs(margin);
  if (m >= t[2]) return 3;
  if (m >= t[1]) return 2;
  return 1;
}

/* 供比赛页「按回合播放」使用：把战报切成可逐帧消费的片段 */
function sliceLog(result, upto) {
  const n = Math.max(0, Math.min((result.log || []).length, upto === undefined ? result.log.length : upto));
  return (result.log || []).slice(0, n);
}

module.exports = {
  PHASES: PHASES,
  TRANSITIONS: TRANSITIONS,
  simulate: simulate,
  normalizeTeam: normalizeTeam,
  resolveDefense: resolveDefense,
  buildTacticVs: buildTacticVs,
  fatigueFactor: fatigueFactor,
  resolve: resolve,
  starsOf: starsOf,
  sliceLog: sliceLog
};
