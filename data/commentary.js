/* data/commentary.js —— 文字直播解说模板库（第七章 7.4「预置 50+ 解说模板」）
 * 职责：按事件类型分类的解说文案，支持 {player} {defender} {team} {pts} {score} {q} {tactic} {margin} 占位符。
 * 占位符口径：{q} 由 utils/battle.js 传入完整的节次标签（"第1节" / "加时1"），模板里不要再包一层「第…节」。
 * 风格：参考真实解说语感 + 虎扑「湿乎乎」的接地气调侃，全部为原创文案。
 * 合规：不出现真实联赛/球队商标、不声称数据来自任何官方来源。
 */

const COMMENTARY = {
  /* 两分命中 */
  make2: [
    '{player} {tactic}打成！稳稳收下两分，比分 {score}。',
    '{player} 一步过掉{defender}，轻松放篮得手，这球太合理了！',
    '合理！{player} 这球处理得太合理了，两分入账。',
    '{player} 中距离急停跳投，手起刀落，{team}再添两分。',
    '{player} 篮下强吃{defender}，硬生生凿进两分，这就是力量！',
    '{player} 反跑接球，上篮打进，跑位教科书。',
    '{team}的战术跑出来了，{player} 空切接球轻松两分。',
    '{player} 造犯规！加罚不中，但两分已经到手，比分 {score}。',
    '{player} 转身后仰，球在框上转了两圈还是掉了进去，运气也是实力。',
    '{player} 突破分球再回传，自己接球上篮，{defender}完全没反应过来。'
  ],
  /* 三分命中 */
  make3: [
    '{player} 三分线外一步拔起——空心入网！三分到手，{score}！',
    '这球三分太不讲道理了！{player} 抬手就有，{team}领先优势扩大。',
    '{player} 借掩护干拔三分，{defender}扑到脸上也没用，进了！',
    '三分雨下起来了！{player} 又是一记冷血三分。',
    '{player} 后撤步三分，防守人已经尽力了，这就是手感。',
    '弧顶三分，{player} 稳稳命中，全场沸腾！比分 {score}。',
    '{player} 追身三分！这球进得太关键了，气势彻底起来了。',
    '{player} 底角三分，接球就投，一点犹豫都没有，进了！',
    '三分线外一米！{player} 直接出手，篮球划过一道高弧线，命中！',
    '{player} 用一记三分告诉对面：这就是我的射程。'
  ],
  /* 投篮不中 */
  miss: [
    '{player} 的{tactic}弹框而出，{defender}的防守立功了。',
    '{player} 出手偏出，这球力道大了点。',
    '{defender} 贴得很紧，{player} 的投篮失去了准星。',
    '{player} 强投不中，{team}错失一次好机会。',
    '球在框上转了三圈，还是滚了出来——{player} 差一点。',
    '{player} 这次没能打进，{defender}的干扰非常到位。',
    '出手太急了，{player} 的球砸在前沿弹出。',
    '{player} 的三分短了，篮筐帮了{defender}一次忙。'
  ],
  /* 盖帽 */
  block: [
    '啪！{defender} 一记大帽把{player}的球扇飞，全场惊呼！',
    '{defender} 从身后追上来，直接把{player}的上篮按在篮板上！',
    '这是什么护筐！{defender} 盖掉{player}，{team}的气势被打断了。',
    '{defender} 站着不动就把球摘了，{player}的出手被封得死死的。',
    '火锅送到！{defender} 送给{player}一记结结实实的盖帽。',
    '{player} 想起身暴扣，{defender} 说不行，球被狠狠拍出界外。'
  ],
  /* 篮板 */
  rebound: [
    '{defender} 拿下后场篮板，{team}迅速推进。',
    '篮板被{defender} 死死抱住，这一攻宣告结束。',
    '{defender} 卡位、起跳、抓板，一气呵成。',
    '拼抢前场篮板失败，{defender} 保护下了这一球。',
    '{defender} 用身体挡住所有人，稳稳收下篮板。'
  ],
  /* 节次 */
  quarterStart: [
    '{q}开始，双方重新回到场上，比分 {score}。',
    '{q}开打，{team}率先握有球权。',
    '暂停结束，{q}继续，比分 {score}。',
    '{q}，替补席已经坐不住了，比分 {score}。'
  ],
  quarterEnd: [
    '{q}结束，比分 {score}。',
    '本节打完，{score}，双方回到板凳席补水。',
    '{q}哨响，比分定格在 {score}。',
    '{q}结束，教练组正在激烈地画战术板。'
  ],
  /* 加时 */
  ot: [
    '比分打平！进入决胜回合，空气都凝固了。',
    '平局！加时开始，每一球都可能决定胜负。',
    '决胜时间到，比分 {score}，谁都不肯让一步。'
  ],
  /* 连续得分 */
  hotStreak: [
    '{player} 手感发烫，连续得分根本停不下来！',
    '{player} 打疯了！{team}的进攻全靠他一个人在扛。',
    '又是{player}！这已经是连着的第几个了，太夸张了。',
    '{player} 进入无人之境，{defender}换谁都防不住。',
    '{team}这波流打出来了，{player} 是发动机。'
  ],
  /* 大比分领先 */
  bigLead: [
    '{team}已经领先 {margin} 分，比赛基本失去悬念。',
    '分差来到 {margin} 分，板凳席开始热身了。',
    '{team}把分差扩大到 {margin} 分，对手叫了暂停。',
    '领先 {margin} 分，{team}打得很从容。'
  ],
  /* 追分 */
  comeback: [
    '{team}开始追分了，一波流把分差咬回来！',
    '不放弃！{team}连得几分，悬念又回来了。',
    '分差只剩 {margin} 分，{team}的防守强度上来了。'
  ],
  /* 战术克制 · 进攻方惩罚对手防守策略（里程碑 2；只在命中时触发）
   * 占位符：{tactic} 进攻战术名 / {defense} 对手防守策略名 / {player} {defender} {team} {pts} {score} */
  counterAttack: [
    '对面{defense}，{player} 读得清清楚楚——{tactic}稳稳打进，这就是战术克制！',
    '{team}教练组笑了：对方{defense}，那就用{tactic}打死他们，{player} 得手，{score}。',
    '{defender} 站位太靠里，{player} 一记{tactic}直接惩罚，收下 {pts} 分。',
    '{defense}放的就是这个位置，{player} 毫不客气，{tactic}打成！',
    '战术板上写得明明白白：对方{defense}，我们就{tactic}。{player} 执行到位，比分 {score}。'
  ],
  /* 战术克制 · 防守策略掐死进攻战术（只在打铁时触发，盖帽另有专属文案） */
  counterDefend: [
    '{team}的{defense}正好卡在路线上，{player} 的{tactic}被掐死了。',
    '{player} 想打{tactic}，可惜遇上{defense}，{defender} 早就等在那里。',
    '{defense}针对性拉满，{player} 的{tactic}这球很难受，没进。',
    '被读出来了！{player} 的{tactic}撞上{defense}，{defender} 处理得干干净净。',
    '{player} 的{tactic}在{defense}面前吃了亏，这个回合的战术选择得调整。'
  ],
  /* 胜负 */
  win: [
    '终场哨响！{team}拿下胜利，最终比分 {score}。',
    '赢了！{team}顶住压力，{score}，主场般的欢呼。',
    '比赛结束，{score}，{team}笑到最后。',
    '终场！{team}用一场硬仗证明了阵容的价值，{score}。'
  ],
  lose: [
    '终场哨响，{score}，这次没能拿下，回去得练。',
    '遗憾落败，{score}。差的就是那几个关键球。',
    '比赛结束，{score}，输得不冤，对面确实更硬。',
    '终场，{score}。别急，养成到位再来一次。'
  ],

  /* ---------------- 竞技场（异步 PVP）专属解说（里程碑 2「文字直播扩充」） ----------------
   * 命名口径：统一 arena 前缀 + 与 PVE 同名的事件类型（arenaMake2 ↔ make2），
   *   这样 ARENA_MIX 是一张纯字符串映射表，加一种事件不用改 battle。
   * 文案口径：只写天梯/排位/上分的**氛围**，不写具体积分数字 —— battle 层拿不到 ratingDelta，
   *   硬编一个数字就会与结算面板对不上（玩家一眼看出是假的）。
   * 占位符纪律：{q} 由 utils/battle.js 传入完整节次标签（"第1节"/"加时1"），
   *   模板里**不得再包一层「第…节」**，否则会拼出「第第1节节」（AGENTS.md §8 记过的历史坑）。 */
  arenaMake2: [
    '天梯局的强度就是不一样，{player} 硬吃{defender}拿下两分，比分 {score}。',
    '{player} 这球处理得很老练，{defTeam}的防守轮转慢了半拍。',
    '排位赛里每一个两分都算数，{player} 稳稳收下。',
    '{player} 用身体顶开{defender}，这就是天梯的对抗强度。',
    '{q}才刚打开局面，{player} 已经让对面记住了他的号码。'
  ],
  arenaMake3: [
    '{player} 三分出手——进了！这一球够{defTeam}回去开一次录像会。',
    '天梯上分就靠这种球，{player} 三分命中，{score}！',
    '{player} 迎着{defender}投进三分，防守已经到位了，是手感不讲道理。',
    '这记三分价值连城，{player} 在天梯上完全不虚任何人。',
    '{player} 三分再中！{defTeam}的防守策略是时候换了。'
  ],
  arenaMiss: [
    '{player} 这球没打进——天梯的对手可不是关卡里那些陪练。',
    '{defender} 的防守到位，{player} 的出手被干扰得厉害。',
    '偏出！{defTeam}能在天梯这个位置站住，是有原因的。',
    '{player} 强投不中，这种球在排位里代价很大。',
    '篮筐拒绝了{player}，{defTeam}顺势抢下这次机会。'
  ],
  arenaBlock: [
    '{defender} 一巴掌把球扇飞！天梯级别的护筐。',
    '盖帽！{defender} 让{player}记住了这个禁区不好进。',
    '{player} 的出手被{defender}直接摁在板上，这球够进今日集锦。',
    '{defender} 的封盖干净利落，{defTeam}的气势一下起来了。'
  ],
  arenaHotStreak: [
    '{player} 又进了！连续得分，这天梯是要被他一个人打穿。',
    '手感滚烫！{player} 根本停不下来，{defTeam}暂停的心都有了。',
    '{player} 连拿数分，排位对面的选手已经开始慌了。',
    '这就是上分的节奏，{player} 把天梯局打成了个人秀。'
  ],
  arenaQuarterStart: [
    '{q}开球，天梯局的强度从第一秒就拉满。',
    '{q}开始，{team}与{defTeam}的排位之争继续。',
    '{q}，比分 {score}，这一节的每次攻防都影响排名。',
    '{q}哨响，天梯上没有一场轻松的对位。'
  ],
  arenaWin: [
    '天梯取胜！{score}，{team}又往前挪了一位。',
    '赢下这场排位，{score}。{team}的段位正在往上走。',
    '{score}，{team}在天梯上稳稳站住了这一步。',
    '终场 {score}，天梯胜利 —— 竞技币与积分都已入账。',
    '{team}拿下这次天梯挑战，{score}，下一位对手已经解锁。'
  ],
  arenaLose: [
    '天梯失利，{score}。录像还在，回去复盘比生气有用。',
    '{score}，这一位对手确实硬，调整阵容再来一次。',
    '输了这场排位，{score}。天梯不会因为你不服气就让路。',
    '终场 {score}，天梯挑战失败 —— 去侦察面板看看对面用的什么防守。',
    '{score}，惜败。换一套防守策略，明天再打回来。'
  ]
};

/* 竞技场专属解说的映射表：mode='arena' 时，把对应类型的模板池**合并**进候选池。
 * 【为什么是合并候选池，而不是额外掷一次骰子】pick() 每次调用固定消耗 1 个随机数；
 *   合并候选池不改变消耗次数 ⇒ 比分与整条随机流完全不受影响，只有文案变。
 *   若改成「先 rng.chance() 决定要不要用竞技场文案」，就会多消耗一个随机数，
 *   把之后每一回合的掷骰全部推移 —— 竞技场与 PVE 的基线会一起报废（第十二章可复现红线）。
 * 【混合比例】= 竞技场条数 / 合并后总条数（make2 是 5/15 ≈ 33%）。想调浓淡就增减条数，不要加掷骰。
 * 【可扩展】新增一种事件只要在这里加一行映射 + 一个 arenaXxx 数组，battle 一行都不用动。 */
const ARENA_MIX = {
  make2: 'arenaMake2',
  make3: 'arenaMake3',
  miss: 'arenaMiss',
  block: 'arenaBlock',
  hotStreak: 'arenaHotStreak',
  quarterStart: 'arenaQuarterStart',
  win: 'arenaWin',
  lose: 'arenaLose'
};

/* 合并候选池的缓存：一局 96 个回合会反复取同一类型，不能每次都 concat 一遍 */
const POOL_CACHE = {};

function poolOf(type, mode) {
  const base = COMMENTARY[type] || COMMENTARY.make2;
  if (mode !== 'arena') return base;
  const key = type + '|arena';
  if (POOL_CACHE[key]) return POOL_CACHE[key];
  const extra = COMMENTARY[ARENA_MIX[type]];
  const merged = (extra && extra.length) ? base.concat(extra) : base;
  POOL_CACHE[key] = merged;
  return merged;
}

/* 占位符替换（找不到占位符就原样保留，避免出现 undefined） */
function fill(template, vars) {
  if (!template) return '';
  const v = vars || {};
  return String(template).replace(/\{(\w+)\}/g, function (m, k) {
    return (v[k] === undefined || v[k] === null || v[k] === '') ? m : String(v[k]);
  });
}

/* 按类型取一条解说（rng 注入，保证可复现）。
 * mode 是里程碑 2 新加的第 4 个可选参数：'arena' = 竞技场专属解说，缺省 = PVE 基线。
 * 老调用方（含 tools/verify.mjs 的既有断言）不传 mode，行为与里程碑 2 之前逐字节一致。 */
function pick(rng, type, vars, mode) {
  const list = poolOf(type, mode);
  const tpl = list[Math.floor(rng.next() * list.length) % list.length];
  return fill(tpl, vars);
}

function countAll() {
  return Object.keys(COMMENTARY).reduce(function (n, k) { return n + COMMENTARY[k].length; }, 0);
}

module.exports = {
  COMMENTARY: COMMENTARY,
  ARENA_MIX: ARENA_MIX,
  fill: fill,
  pick: pick,
  poolOf: poolOf,
  countAll: countAll,
  /* 竞技场专属条数（文档要求 50+ 解说模板，这里给验收脚本一个精确口径） */
  countArena: function () {
    return Object.keys(ARENA_MIX).reduce(function (n, k) {
      const list = COMMENTARY[ARENA_MIX[k]];
      return n + (list ? list.length : 0);
    }, 0);
  }
};
