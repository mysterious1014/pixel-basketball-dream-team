#!/usr/bin/env node
/* tools/replay-battle.mjs —— 比赛复现 / 可回放性校验工具
 *
 * 为什么需要它：第十二章 MVP 验收要求「比赛结算按第七章公式可复现」。
 * utils/battle.js 是纯函数（所有随机来自注入 seed 的 utils/rng.js），
 * 本工具用「同 seed 跑两遍逐字节比对」把这条验收标准变成一条可执行命令。
 * 比赛页结算面板里的 seed 可以直接复制过来复现同一局（点「点击复制」→ 粘给 --seed）。
 *
 * 用法：
 *   node tools/replay-battle.mjs                          # 默认：初始存档阵容 vs 1-1，同 seed 跑两遍
 *   node tools/replay-battle.mjs --stage s3-6 --log 12    # 指定关卡，多打几行战报
 *   node tools/replay-battle.mjs --seed gacha-abc         # 用比赛页复制出来的 seed 复现
 *   node tools/replay-battle.mjs --boost 1.05             # 给对手属性加成（模拟难度上调）
 *   node tools/replay-battle.mjs --all                    # 18 关全跑一遍复现校验（适合接 CI）
 *   node tools/replay-battle.mjs --arena a03 --log 12     # 复现一位竞技场（异步 PVP）对手
 *   node tools/replay-battle.mjs --all-arena              # 12 位天梯对手全跑一遍（适合接 CI）
 *   node tools/replay-battle.mjs --json                   # 只输出 JSON 结果，便于脚本消费
 *
 * 退出码：0 = 全部通过；1 = 有校验失败。
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => require(path.join(ROOT, p));

const CONFIG = R('config.js');
const store = R('store/index.js');
const selectors = R('store/selectors.js');
const stagesData = R('data/stages.js');
const arenaData = R('data/arena.js');
const playersData = R('data/players.js');
const battle = R('utils/battle.js');
const rngUtil = R('utils/rng.js');

/* ---------- 极简参数解析 ---------- */
function parseArgs(argv) {
  const out = { stage: 's1-1', arena: '', seed: '', log: 8, boost: 1, all: false, allArena: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--all-arena') out.allArena = true;
    else if (a === '--json') out.json = true;
    else if (a === '--arena') out.arena = argv[++i];
    else if (a === '--stage') out.stage = argv[++i];
    else if (a === '--seed') out.seed = argv[++i];
    else if (a === '--log') out.log = Number(argv[++i]) || 0;
    else if (a === '--boost') out.boost = Number(argv[++i]) || 1;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log('用法: node tools/replay-battle.mjs [--stage s1-1] [--arena a01] [--seed xxx] [--log 8] [--boost 1] [--all] [--all-arena] [--json]');
  process.exit(0);
}

/* ---------- 准备一份干净的存档（Node 环境下 storage 自动降级为内存） ---------- */
store.init({ fresh: true, now: 0 });
const state = store.getState();
const view = selectors.rosterView(state);
const home = selectors.homeTeam(state);

let errors = 0;
function fail(msg) { errors++; if (!args.json) console.log('  \u2717 ' + msg); }
function ok(msg) { if (!args.json) console.log('  \u2713 ' + msg); }

/* 对手队伍统一贴合规化名（与 store/commands.js 的 withDisplayNames 同口径，
 * 否则复现出来的战报姓名与真机显示不一致，等于复现了另一局） */
function withDisplayNames(away) {
  (away.players || []).forEach((p) => {
    const card = playersData.getCard(p.cardId);
    if (card) p.name = selectors.displayName(state, card);
  });
  return away;
}

/* ---------- 单局复现校验（PVE 关卡与竞技场天梯共用同一套 7 项断言） ---------- */
/* mode 由调用方传入（PVE 关卡不传 = 'pve'，竞技场传 'arena'），必须与 store/commands.js 同口径，
 * 否则解说池不同 ⇒ 复现出来的战报文案与真机不一致，等于复现了另一局。 */
function replayMatch(label, away, seed, mode) {
  const r1 = battle.simulate({ home: home, away: away, seed: seed, mode: mode });
  const r2 = battle.simulate({ home: home, away: away, seed: seed, mode: mode });

  const out = { label: label, seed: seed, result: r1 };

  // 1) 同 seed 两次模拟必须逐字节一致
  const s1 = JSON.stringify(r1);
  const s2 = JSON.stringify(r2);
  if (s1 === s2) ok(label + ' 同 seed 复现一致（' + s1.length + ' 字节）');
  else fail(label + ' 同 seed 两次结果不一致，战斗不可复现');

  // 2) 分节比分之和必须等于终场比分
  const qh = r1.quarters.reduce((a, q) => a + q.home, 0);
  const qa = r1.quarters.reduce((a, q) => a + q.away, 0);
  if (qh === r1.homeScore && qa === r1.awayScore) ok(label + ' 分节比分自洽 ' + r1.homeScore + ':' + r1.awayScore);
  else fail(label + ' 分节合计 ' + qh + ':' + qa + ' ≠ 终场 ' + r1.homeScore + ':' + r1.awayScore);

  // 3) 回合数 = 每队每节回合 × 节数 + 加时
  const expectRounds = CONFIG.battle.roundsPerQuarter * CONFIG.battle.quarters + CONFIG.battle.otRounds * r1.ot;
  if (r1.rounds === expectRounds) ok(label + ' 回合数 ' + r1.rounds + ' 符合配置');
  else fail(label + ' 回合数 ' + r1.rounds + ' ≠ 期望 ' + expectRounds);

  // 4) 日志相位转移必须落在状态机转移表内
  let transBad = 0;
  for (let i = 1; i < r1.log.length; i++) {
    const from = r1.log[i - 1].phase;
    const to = r1.log[i].phase;
    const allowed = battle.TRANSITIONS[from];
    if (!allowed || allowed.indexOf(to) === -1) transBad++;
  }
  if (transBad === 0) ok(label + ' 日志相位转移合法（' + r1.log.length + ' 条）');
  else fail(label + ' 有 ' + transBad + ' 处非法相位转移');

  // 5) 单回合必须走完六相位
  const badPhases = r1.log.filter((e) => e.phasesRun !== undefined && e.phasesRun !== battle.PHASES.length).length;
  if (badPhases === 0) ok(label + ' 每个进攻回合走完 ' + battle.PHASES.length + ' 个相位');
  else fail(label + ' 有 ' + badPhases + ' 个回合相位执行数异常');

  // 6) 胜负与星级判定
  const expectResult = r1.margin > 0 ? 'win' : (r1.margin < 0 ? 'lose' : 'draw');
  if (r1.result === expectResult) ok(label + ' 胜负判定正确（净胜 ' + r1.margin + '）');
  else fail(label + ' 胜负判定错误: ' + r1.result);
  if (battle.starsOf(r1.margin, r1.result) === r1.stars) ok(label + ' 星级 ' + r1.stars + '★ 与净胜分门槛一致');
  else fail(label + ' 星级与门槛不一致');

  // 7) 换 seed 应当（大概率）产生不同比分——证明 seed 真的在起作用
  const other = battle.simulate({ home: home, away: away, seed: seed + '-different', mode: mode });
  out.seedSensitive = (other.homeScore !== r1.homeScore || other.awayScore !== r1.awayScore);

  return out;
}

function replayOne(stageId, seedOverride) {
  const stage = stagesData.getStage(stageId);
  if (!stage) { fail('关卡不存在: ' + stageId); return null; }
  const seed = seedOverride || ('replay-' + stageId);
  const away = stagesData.buildAwayTeam(stage, args.boost);
  return replayMatch(stageId, away, seed);
}

/* 竞技场（异步 PVP）：对手来自 data/arena.js 的天梯快照，seed 口径与 store/commands.js 一致 */
function replayArena(oppId, seedOverride) {
  const opp = arenaData.getOpponent(oppId);
  if (!opp) { fail('天梯对手不存在: ' + oppId); return null; }
  const seed = seedOverride || ('arena-' + oppId);
  /* mode:'arena' 必须与 store/commands.js#arenaChallenge 一致，否则离线复现用的是 PVE 解说池，
   * 「同 seed 逐字节一致」断言会红（第十二章验收口径：任意一场都能离线逐回合复现）。 */
  return replayMatch('arena:' + oppId + ' ' + opp.name, withDisplayNames(arenaData.buildAwayTeam(opp)), seed, 'arena');
}

/* ---------- 输出 ---------- */
function printDetail(one) {
  const r = one.result;
  console.log('');
  console.log('== ' + one.label + ' · seed=' + one.seed + ' ==');
  console.log('  ' + r.home.name + ' ' + r.homeScore + ' : ' + r.awayScore + ' ' + r.away.name);
  console.log('  结果 ' + r.result + ' · 净胜 ' + r.margin + ' · ' + r.stars + '★ · 加时 ' + r.ot + ' 次 · 回合 ' + r.rounds);
  console.log('  主队均评 ' + r.home.ovr + '（打法 ' + r.home.playStyleName + ' · 防守 ' + r.home.defenseName + '） vs 客队均评 ' + r.away.ovr + '（打法 ' + r.away.playStyleName + ' · 防守 ' + r.away.defenseName + '）');
  console.log('  战术克制: 我方 克 ' + r.counters.home.attack + ' 次 / 被克 ' + r.counters.home.defend +
    ' 次 · 对手 克 ' + r.counters.away.attack + ' 次 / 被克 ' + r.counters.away.defend + ' 次' +
    (r.counterEnabled ? '' : '（config.battle.counter.enabled = false，克制未开启）'));
  console.log('  分节: ' + r.quarters.map((q) => q.label + ' ' + q.home + '-' + q.away).join(' | '));
  if (r.mvp) console.log('  MVP: ' + r.mvp.name + '（' + r.mvp.pts + ' 分 / ' + r.mvp.blk + ' 盖帽 / ' + r.mvp.dreb + ' 篮板）');
  const top = r.stats.home.slice().sort((a, b) => b.pts - a.pts).slice(0, 3);
  console.log('  我方得分前三: ' + top.map((s) => s.name + ' ' + s.pts).join(', '));
  if (args.log > 0) {
    console.log('  战报片段（前 ' + Math.min(args.log, r.log.length) + ' 条 / 共 ' + r.log.length + ' 条）:');
    r.log.slice(0, args.log).forEach((e) => {
      const tag = e.kind === 'info' ? '[信息]' : (e.made ? '[命中' + e.points + ']' : '[' + (e.event === 'block' ? '盖帽' : (e.event === 'rebound' ? '篮板' : '打铁')) + ']');
      console.log('    ' + (e.qLabel || '--').padEnd(5, ' ') + ' ' + tag.padEnd(7, ' ') + ' ' + e.text);
    });
  }
  console.log('  seed 敏感: ' + (one.seedSensitive ? '是（换 seed 比分变化，随机源确实由 seed 驱动）' : '否（本局换 seed 恰好同分）'));
}

if (!args.json) {
  console.log('《' + CONFIG.GAME_NAME + '》比赛复现校验' + (args.allArena || args.arena ? '（含竞技场天梯）' : ''));
  console.log('主队: ' + home.name + ' · 首发 ' + home.players.length + ' 人 · 均评 ' + view.starterAvgOvr + ' · 薪资 ' + view.totalSalary + ' 万 · 打法 ' + (home.playStyle || 'balanced') + ' · 防守 ' + (home.defense || 'auto'));
  console.log('规则: 每队每节 ' + CONFIG.battle.roundsPerQuarter + ' 回合 × ' + CONFIG.battle.quarters + ' 节，平分进 ' + CONFIG.battle.otRounds + ' 回合加时');
}

const results = [];
const push = (one) => {
  if (!one) return;
  results.push({
    label: one.label, seed: one.seed,
    homeScore: one.result.homeScore, awayScore: one.result.awayScore,
    result: one.result.result, stars: one.result.stars, ot: one.result.ot,
    counters: one.result.counters,
    defense: { home: one.result.home.defense, away: one.result.away.defense }
  });
};
if (args.all || args.allArena) {
  if (!args.json) console.log('');
  if (args.all) stagesData.STAGES.forEach((s) => push(replayOne(s.id)));
  if (args.allArena) arenaData.LADDER.forEach((o) => push(replayArena(o.id)));
} else if (args.arena) {
  const one = replayArena(args.arena, args.seed);
  push(one);
  if (!args.json && one) printDetail(one);
} else {
  const one = replayOne(args.stage, args.seed);
  push(one);
  if (!args.json && one) printDetail(one);
}

if (args.json) {
  console.log(JSON.stringify({ ok: errors === 0, errors: errors, defaultSeedPrefix: 'replay-', seedGen: typeof rngUtil.newSeed, results: results }, null, 2));
} else {
  console.log('');
  console.log('========================================');
  console.log(errors === 0 ? '全部通过：比赛结算可复现' : ('失败 ' + errors + ' 项'));
  console.log('========================================');
}
process.exit(errors === 0 ? 0 : 1);