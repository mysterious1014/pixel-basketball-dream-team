/* pages/match/match.js —— 比赛页（第十章页面清单「比赛页」，第七章 7.4 状态机演出）
 * 职责：进入即结算（store.startBattle 一次性跑完确定性状态机），再把战报按回合「像素直播」播出来：
 *       Canvas 画像素球场 + 记分牌 + 球与攻防球员块，右侧滚动文字直播，结束弹结算面板。
 * 为什么先结算后播放：第七章要求「比赛结算按公式可复现」，结算是纯函数（seed 决定一切），
 *       播放只是把 result.log 逐条渲染，因此暂停/加速/跳过都不会改变比分（seed 会显示在结算面板上）。
 * 演出约束（第六章）：Canvas 全部整数坐标、无抗锯齿渐变、有限调色板；UI 反馈用 px-shake/px-pop 逐帧动画。
 *
 * 里程碑 2 起本页支持两种模式（?mode= 区分，缺省为 PVE）：
 *   ?stageId=s1-1              PVE 赛季征程：store.startBattle，结算给星级与首通奖励
 *   ?mode=arena&opp=a03        竞技场挑战：store.arenaChallenge，结算给积分 / 竞技币，不给星级
 *   ?mode=arena&hist=0         竞技场历史回放：store.replaySnapshot，用存档快照复现，不消耗次数与体力
 *   &seed=xxx                  可选：指定 seed 复现某一局（QA / tools/verify.mjs K 组用它做确定性断言）
 * 战报里的「克制 / 被克」角标来自 battle 每条 log 的 counter 字段（第七章 7.4 战术克制）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const battle = require('../../utils/battle.js');
const stagesData = require('../../data/stages.js');
const arenaData = require('../../data/arena.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const P = CONFIG.palette;

/* 播放节奏全部来自 config.battle.playback（AGENTS.md §3：数值只允许改 config.js，页面不留硬编码）。
 * 为什么调过：第一章「目标体验：单局 2–3 分钟」，而里程碑 2 之前 1× 只有约 37 秒 —— 战报一闪就过，
 * 玩家来不及读解说，「文字直播」退化成了进度条。现在 1× ≈ 2.4 分钟落在文档区间内，
 * 4× ≈ 37 秒保留了原来的快节奏（急性子玩家一键即可），倍速是**观看速度**，与比分无关（seed 已定）。 */
const PLAYBACK = CONFIG.battle.playback || { baseMs: 1450, infoMs: 800, speeds: [1, 2, 4] };
const SPEEDS = (PLAYBACK.speeds && PLAYBACK.speeds.length) ? PLAYBACK.speeds : [1, 2, 4];
const BASE_MS = Number(PLAYBACK.baseMs) || 1450;   // 1 倍速下每条回合战报的停留时间
const INFO_MS = Number(PLAYBACK.infoMs) || 800;    // 分节/加时等信息条更快

/* 一局战报的构成（不含加时，加时只会更长）：
 *   回合条数 = 每队每节回合数 × 节数 × 2 队；信息条 = 每节 quarterStart + quarterEnd，外加终场 finished 一条。
 * 用来给玩家一个「这局大概要看多久」的预期，否则调慢节奏会被当成卡死。 */
const ROUND_ROWS = CONFIG.battle.roundsPerQuarter * CONFIG.battle.quarters * 2;
const INFO_ROWS = CONFIG.battle.quarters * 2 + 1;

function paceText(speed) {
  const ms = (ROUND_ROWS * BASE_MS + INFO_ROWS * INFO_MS) / (Number(speed) || 1);
  const s = Math.max(1, Math.round(ms / 1000));
  return s >= 60 ? ('约 ' + Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒') : ('约 ' + s + ' 秒');
}

/* battle 的一条战报 → 页面渲染用的轻量行（stepOne 与 skip 共用，避免两处口径漂移）。
 * 克制角标的颜色站在**玩家**视角：我方进攻吃到克制 = 绿；我方进攻被对方防守掐死 = 红；
 * 对手进攻被我方防守掐住 = 绿；对手进攻吃到克制 = 红。判据全部由 js 算好，WXML 只贴 class。 */
function toLogRow(entry, i) {
  const counter = entry.counter || '';
  const good = counter === 'attack' ? entry.side === 'home' : entry.side === 'away';
  return {
    i: i,
    text: entry.text,
    info: entry.kind === 'info',
    final: !!entry.final,
    side: entry.side || '',
    home: entry.side === 'home',
    q: entry.qLabel || '',
    made: !!entry.made,
    scored: !!entry.made,
    tactic: entry.tacticName || '',
    defense: entry.defenseName || '',
    shooter: entry.shooter || '',
    pts: entry.points || 0,
    counter: counter,
    counterText: counter ? (good ? '克制' : '被克') : '',
    counterCls: counter ? (good ? 'mt-tc--good' : 'mt-tc--bad') : '',
    cls: entry.final ? 'mt-log--final' : (entry.kind === 'info' ? 'mt-log--info' : (entry.made ? (entry.side === 'home' ? 'mt-log--good' : 'mt-log--bad') : 'mt-log--miss'))
  };
}

/* battle.counters 的一侧 → 结算面板文案。
 * 口径（与引擎一致，页面不再算第二遍）：counters[side].attack = 该队进攻时「我方打法克对手防守」的出手数，
 * counters[side].defend = 该队进攻时「被对手防守掐住」的出手数。attack 越多越好，defend 越多说明打法被读死了。 */
function counterText(c) {
  if (!c) return '';
  return '克 ' + c.attack + ' 次 · 被克 ' + c.defend + ' 次';
}

Page(store.connectPage(function (state) {
  return {
    reduceMotion: !!(state.settings && state.settings.reduceMotion),
    settingSpeed: Number(state.settings.autoSpeed) || 1,
    goldText: fmt.numText(state.profile.gold),
    diamondText: fmt.numText(state.profile.diamond),
    stamina: selectors.staminaView(state, Date.now()).value
  };
}, {
  data: {
    stageId: '',
    stageName: '',
    opponent: '',
    mode: 'pve',
    arenaMode: false,
    arenaReplay: false,
    error: '',
    started: false,
    finished: false,
    playing: false,

    homeName: '梦之队',
    awayName: '对手',
    homeScore: 0,
    awayScore: 0,
    quarterLabel: '第1节',
    progress: 0,
    totalLog: 0,

    log: [],
    scrollInto: '',
    flash: '',

    speedIndex: 0,
    speeds: SPEEDS,
    paceText: paceText(SPEEDS[0]),

    // 结算
    resultText: '',
    resultKind: '',
    margin: 0,
    stars: 0,
    starText: '',
    ot: 0,
    seed: '',
    quarters: [],
    mvp: null,
    homeBonds: [],
    awayBonds: [],
    /* 名场面时刻卡（第八章，里程碑 2）：默认值必须与 finish() 的返回同时存在，
     * 否则首屏 wx:for 拿到 undefined（K 组「WXML 字段都有来源」会红） */
    homeMoments: [],
    awayMoments: [],
    homeStats: [],
    awayStats: [],
    rewards: null,
    rewardLines: [],
    dynastyMissionText: '',
    canReplay: false,
    replayBlockText: '',
    replayLabel: '再战',
    backLabel: '回关卡',
    /* 竞技场结算（里程碑 2）：积分 / 段位 / 连胜 / 竞技币，替代 PVE 的星级 */
    arenaSettled: false,
    arenaReplayNote: false,
    ratingDeltaText: '',
    ratingDeltaCls: '',
    ratingAfter: 0,
    arenaRankName: '',
    arenaRankText: '',
    arenaStreak: 0,
    arenaStreakBonus: 0,
    arenaStreakText: '',
    arenaExpectedText: '',
    arenaCoinText: '',
    arenaDailyText: '',
    arenaFirstWin: false,
    /* 战术克制统计（两种模式都显示，数字全部来自 battle 的 counters） */
    counterEnabled: false,
    counterBonusPct: 0,
    homeTacticName: '',
    awayTacticName: '',
    homeDefenseName: '',
    awayDefenseName: '',
    homeCounterText: '',
    awayCounterText: '',

    reduceMotion: false,
    settingSpeed: 1,
    paceText: paceText(SPEEDS[0]),
    goldText: '0',
    diamondText: '0',
    stamina: 0
  },

  onLoad(options) {
    const o = options || {};
    /* 可复现红线：页面不自己造 seed，只做透传；缺省时由 commands 按「模式 + 日期 + 场次」拼 */
    this.seedOverride = o.seed || '';
    if (o.mode === 'arena') {
      this.mode = 'arena';
      const rawIdx = o.hist === undefined || o.hist === '' ? NaN : Number(o.hist);
      this.histIndex = isFinite(rawIdx) ? rawIdx : -1;
      if (this.histIndex >= 0) {
        /* 历史回放：从存档里取快照，用 replaySnapshot 复现（不消耗次数与体力） */
        const row = (((store.getState() || {}).arena || {}).history || [])[this.histIndex];
        if (!row || !row.snapshot) {
          this.setData({ mode: 'arena', arenaMode: true, arenaReplay: true, backLabel: '回天梯', error: '历史对局不存在，或快照已失效' });
          return;
        }
        this.snapshot = row.snapshot;
        this.arenaReplay = true;
        this.setData({
          mode: 'arena', arenaMode: true, arenaReplay: true,
          stageName: '历史回放', opponent: row.opponentName,
          replayLabel: '再看一遍', backLabel: '回天梯'
        });
      } else {
        const opp = arenaData.getOpponent(o.opp);
        if (!opp) {
          this.setData({ mode: 'arena', arenaMode: true, backLabel: '回天梯', error: '天梯对手不存在：' + (o.opp || '(空)') });
          return;
        }
        this.oppId = opp.id;
        this.setData({
          mode: 'arena', arenaMode: true,
          stageName: '竞技场 · 第' + opp.index + '位', opponent: opp.name,
          backLabel: '回天梯'
        });
      }
      this.begin();
      return;
    }

    const stageId = o.stageId || '';
    const stage = stagesData.getStage(stageId);
    if (!stage) {
      this.setData({ error: '关卡不存在：' + stageId });
      return;
    }
    this.setData({ stageId: stageId, stageName: stage.name, opponent: stage.opponent });
    this.begin();
  },

  onReady() {
    this.initCanvas();
    if (this.data.started && !this.data.error) this.startPlayback();
  },

  onUnload() {
    this.stopTimer();
  },

  onHide() {
    // 离开页面自动暂停，回来不会「播完了却没看到」
    if (this.data.playing) this.pause();
  },

  /* ---------- 结算（只跑一次） ----------
   * 三种入口共用一个出口：PVE 走 startBattle，竞技场挑战走 arenaChallenge，历史回放走 replaySnapshot。
   * 硬性校验（首发 / 工资帽 / 体力 / 次数 / 解锁）全在 commands 层，页面只处理 ok:false。 */
  begin() {
    let res;
    if (this.mode === 'arena') {
      res = this.arenaReplay ? store.replaySnapshot(this.snapshot) : store.arenaChallenge({ opponentId: this.oppId, seed: this.seedOverride || undefined });
    } else {
      res = store.startBattle({ stageId: this.data.stageId, seed: this.seedOverride || undefined });
    }
    if (!res || !res.ok) {
      this.setData({ error: (res && res.reason) || '无法开始比赛', started: false });
      return false;
    }
    this.result = res.result;
    this.rewards = res.rewards || null;
    this.arenaSettle = (this.mode === 'arena' && !this.arenaReplay) ? res : null;
    /* 王朝赛季增量（里程碑 3 第三块）：命令层与 reducer 同参同解，直接展示；历史回放没有 res.dynasty */
    this.dynastyGains = res.dynasty || null;
    /* 每日任务增量（里程碑 4）：同上；历史回放没有 res.daily ⇒ null（不重发、不显示） */
    this.dailyGains = res.daily || null;
    this.cursor = 0;

    const r = this.result;
    this.setData({
      started: true,
      finished: false,
      error: '',
      homeName: (r.home && r.home.name) || '梦之队',
      awayName: (r.away && r.away.name) || '对手',
      homeScore: 0,
      awayScore: 0,
      quarterLabel: '第1节',
      log: [],
      totalLog: r.log.length,
      progress: 0,
      seed: r.seed,
      speedIndex: Math.max(0, SPEEDS.indexOf(Number(this.data.settingSpeed) || 1)),
      paceText: paceText(SPEEDS[Math.max(0, SPEEDS.indexOf(Number(this.data.settingSpeed) || 1))] || 1)
    });
    return true;
  },

  /* ---------- Canvas 像素球场 ---------- */
  initCanvas() {
    const self = this;
    if (typeof wx === 'undefined' || !wx.createSelectorQuery) return;
    wx.createSelectorQuery().select('#pxCourt')
      .fields({ node: true, size: true })
      .exec(function (res) {
        const info = res && res[0];
        if (!info || !info.node || !info.node.getContext) { self.__cv = null; return; }
        const dpr = (function () {
          try {
            const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            return w.pixelRatio || 2;
          } catch (e) { return 2; }
        })();
        const node = info.node;
        const w = Math.max(1, Math.round(info.width));
        const h = Math.max(1, Math.round(info.height));
        node.width = Math.round(w * dpr);
        node.height = Math.round(h * dpr);
        const ctx = node.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        self.__cv = node;
        self.__ctx = ctx;
        self.__cw = w;
        self.__ch = h;
        self.drawCourt(null);
      });
  },

  /* 画一帧：地板 + 线 + 两侧篮筐 + 记分牌 + 球与攻防球员块 */
  drawCourt(entry) {
    const ctx = this.__ctx;
    if (!ctx) return;
    const W = this.__cw;
    const H = this.__ch;
    const side = entry && entry.side;
    const made = !!(entry && entry.made);

    // 地板：竖向木板条（两个棕色交替，模拟像素木地板）
    ctx.fillStyle = P.court;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.courtDark;
    const plank = Math.max(6, Math.round(W / 24));
    for (let x = 0; x < W; x += plank * 2) ctx.fillRect(x, 0, plank, H);

    // 边线
    const m = Math.round(Math.min(W, H) * 0.06);
    ctx.strokeStyle = '#f4e6cf';
    ctx.lineWidth = 2;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);

    // 中线 + 中圈
    const cx = Math.round(W / 2);
    const cy = Math.round(H / 2);
    ctx.beginPath();
    ctx.moveTo(cx, m);
    ctx.lineTo(cx, H - m);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.round(Math.min(W, H) * 0.12), 0, Math.PI * 2);
    ctx.stroke();

    // 两侧禁区 + 篮筐
    const keyW = Math.round((W - m * 2) * 0.16);
    const keyH = Math.round((H - m * 2) * 0.5);
    ctx.strokeRect(m, cy - Math.round(keyH / 2), keyW, keyH);
    ctx.strokeRect(W - m - keyW, cy - Math.round(keyH / 2), keyW, keyH);
    ctx.fillStyle = P.orange;
    ctx.fillRect(m + 2, cy - 5, 6, 10);              // 左侧筐（客队）
    ctx.fillRect(W - m - 8, cy - 5, 6, 10);          // 右侧筐（主队）

    // 记分牌（像素点阵牌）
    const bw = Math.round(W * 0.46);
    const bh = Math.round(H * 0.2);
    const bx = Math.round(cx - bw / 2);
    const by = m + 4;
    ctx.fillStyle = P.navy900;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font = 'bold ' + Math.max(11, Math.round(bh * 0.5)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = P.gold;
    ctx.fillText(String(this.data.homeScore), bx + Math.round(bw * 0.28), by + Math.round(bh * 0.52));
    ctx.fillText(String(this.data.awayScore), bx + Math.round(bw * 0.72), by + Math.round(bh * 0.52));
    ctx.fillStyle = P.textDim;
    ctx.font = Math.max(8, Math.round(bh * 0.24)) + 'px monospace';
    ctx.fillText(String(this.data.quarterLabel || ''), cx, by + Math.round(bh * 0.52));
    ctx.fillText('HOME', bx + Math.round(bw * 0.28), by + Math.round(bh * 0.86));
    ctx.fillText('AWAY', bx + Math.round(bw * 0.72), by + Math.round(bh * 0.86));

    // 球与攻防球员块（像素方块，不用圆）
    const unit = Math.max(6, Math.round(Math.min(W, H) * 0.055));
    const attackX = side === 'home' ? Math.round(W * 0.7) : (side === 'away' ? Math.round(W * 0.3) : cx);
    const hoopX = side === 'home' ? W - m - 8 : m + 2;
    const ballX = made && side ? hoopX : attackX;
    const ballY = cy + Math.round((made && side ? 0 : unit * 1.6));

    if (side) {
      // 防守方块
      ctx.fillStyle = side === 'home' ? P.rarity.SR : P.rarity.R;
      ctx.fillRect(Math.round(ballX + (side === 'home' ? -unit * 2.2 : unit * 1.4)), Math.round(ballY - unit * 0.4), unit, Math.round(unit * 1.6));
      // 进攻方块
      ctx.fillStyle = side === 'home' ? P.orange : '#7ee8ff';
      ctx.fillRect(Math.round(ballX - unit / 2), Math.round(ballY - unit * 0.8), unit, Math.round(unit * 1.8));
    }
    // 球
    ctx.fillStyle = P.gold;
    ctx.fillRect(Math.round(ballX - unit * 0.3), Math.round(ballY - unit * 2.2), Math.round(unit * 0.6), Math.round(unit * 0.6));
  },

  /* ---------- 播放控制 ---------- */
  interval() {
    const speed = SPEEDS[this.data.speedIndex] || 1;
    return Math.round(BASE_MS / speed);
  },

  startPlayback() {
    if (!this.result || this.data.finished) return;
    this.stopTimer();
    this.setData({ playing: true });
    this.tick();
  },

  tick() {
    const self = this;
    if (!this.result) return;
    if (this.cursor >= this.result.log.length) { this.finish(); return; }
    const entry = this.result.log[this.cursor];
    this.stepOne(entry);
    const delay = entry.kind === 'info' ? Math.round(INFO_MS / (SPEEDS[this.data.speedIndex] || 1)) : this.interval();
    this.__timer = setTimeout(function () { self.__timer = null; self.tick(); }, delay);
  },

  stepOne(entry) {
    const i = this.cursor;
    this.cursor = i + 1;
    const patch = {};
    patch['log[' + i + ']'] = toLogRow(entry, i);
    patch.homeScore = typeof entry.home === 'number' ? entry.home : this.data.homeScore;
    patch.awayScore = typeof entry.away === 'number' ? entry.away : this.data.awayScore;
    patch.quarterLabel = entry.qLabel || this.data.quarterLabel;
    patch.progress = Math.round((this.cursor / this.data.totalLog) * 100);
    patch.scrollInto = 'lg-' + i;
    // 交替两个等价 class：class 名变化才能真正重启 CSS 动画（steps 逐帧闪烁）
    if (entry.made && entry.side === 'home') patch.flash = (i % 2 === 0) ? 'mt-flash-a' : 'mt-flash-b';
    this.setData(patch);
    this.drawCourt(entry);
  },

  pause() {
    this.stopTimer();
    if (this.data.playing) this.setData({ playing: false });
  },

  resume() {
    if (this.data.finished) return;
    this.startPlayback();
  },

  togglePlay() {
    if (this.data.finished) return;
    if (this.data.playing) this.pause(); else this.resume();
  },

  stopTimer() {
    if (this.__timer) { clearTimeout(this.__timer); this.__timer = null; }
  },

  changeSpeed() {
    const next = (this.data.speedIndex + 1) % SPEEDS.length;
    /* 换倍速时同步刷新时长提示：玩家看到的「约 2 分 26 秒」必须与实际播放速度一致 */
    this.setData({ speedIndex: next, paceText: paceText(SPEEDS[next] || 1) });
    if (this.data.playing) { this.stopTimer(); this.tick(); }
  },

  /* 跳过：一次性把剩余战报补齐（比分不变，只是不再逐条播） */
  skip() {
    if (!this.result || this.data.finished) return;
    this.stopTimer();
    const log = this.result.log;
    const patch = {};
    for (let i = this.cursor; i < log.length; i++) {
      patch['log[' + i + ']'] = toLogRow(log[i], i);
    }
    this.cursor = log.length;
    patch.progress = 100;
    patch.scrollInto = 'lg-' + (log.length - 1);
    this.setData(patch);
    this.drawCourt(log[log.length - 1]);
    this.finish();
  },

  /* ---------- 结算面板 ----------
   * 三种入口共用一个面板：PVE 给星级与首通奖励；竞技场给积分 / 段位 / 竞技币，**不发星级**（第七章 7.4，
   * 星级是 PVE 赛季征程的口径）。战术克制统计两种模式都显示：双方打法 + 防守策略 + 克 / 被克次数。 */
  finish() {
    this.stopTimer();
    const r = this.result;
    if (!r) return;
    const rewards = this.rewards || {};
    const lines = [];
    if (rewards.gold) lines.push({ k: '金币', v: '+' + fmt.numText(rewards.gold) });
    if (rewards.diamond) lines.push({ k: '钻石', v: '+' + rewards.diamond });
    if (rewards.exp) lines.push({ k: '经理经验', v: '+' + rewards.exp });
    if (rewards.shard) lines.push({ k: '突破碎片', v: '+' + rewards.shard });
    if (rewards.arenaCoin) lines.push({ k: '竞技币', v: '+' + rewards.arenaCoin });
    if (rewards.ticketNormal) lines.push({ k: '普通招募券', v: '+' + rewards.ticketNormal });
    if (rewards.ticketAdvanced) lines.push({ k: '高级球探券', v: '+' + rewards.ticketAdvanced });
    if (rewards.item) {
      const it = require('../../data/items.js').getItem(rewards.item);
      lines.push({ k: '装备', v: (it ? it.name : rewards.item) + ' ×1' });
    }
    if (rewards.firstClear) lines.push({ k: '首通奖励', v: '已发放' });
    /* 王朝赛季（里程碑 3 第三块）：本场赛季积分（升级附加说明）；回放不重发、不显示 */
    if (!this.arenaReplay && this.dynastyGains && this.dynastyGains.pointsGained > 0) {
      lines.push({
        k: '赛季积分',
        v: '+' + this.dynastyGains.pointsGained + (this.dynastyGains.levelUp ? '（升至 ' + this.dynastyGains.level + ' 级）' : '')
      });
    }
    /* 每日任务（里程碑 4）：本场达成的任务（回放不重发、不显示） */
    if (!this.arenaReplay && this.dailyGains && this.dailyGains.completed && this.dailyGains.completed.length) {
      lines.push({ k: '每日任务', v: this.dailyGains.text });
    }
    if (!lines.length) lines.push({ k: '奖励', v: this.arenaReplay ? '历史回放，不重发奖励' : '本场无（失败只给少量经验）' });

    const starText = ['', '★', '★★', '★★★'][r.stars] || '';
    const state = store.getState();
    const stam = selectors.staminaView(state, Date.now());

    /* 竞技场结算：this.arenaSettle 是 begin() 存下的 commands 返回值；历史回放没有结算（为 null），
     * 段位 / 竞技币余额则统一从 selectors.arenaSummary 读，避免页面自己算积分。 */
    const settle = (this.arenaSettle && typeof this.arenaSettle.ratingDelta === 'number') ? this.arenaSettle : null;
    const sum = this.mode === 'arena' ? selectors.arenaSummary(state, Date.now()) : null;

    /* 再战条件与拦截文案：
     *   历史回放 —— 不消耗次数与体力，永远可以再看一遍；
     *   竞技场挑战 —— 看今日剩余次数与体力（已战胜的对手可重复刷分，天梯是否通关不影响）；
     *   PVE —— 看本关体力消耗。
     * 文案在这里算好，replay() 直接 toast，WXML 不做任何判断。 */
    let canReplay = false;
    let replayBlockText = '';
    if (this.arenaReplay) {
      canReplay = true;
    } else if (this.mode === 'arena') {
      const arenaCost = CONFIG.arena.staminaCost;
      canReplay = sum.dailyLeft > 0 && stam.value >= arenaCost;
      if (!canReplay) {
        /* 加赛（里程碑 5）：次数用尽时若还有加赛出口（未购满 + 钻石够），把出路写进拦截文案 */
        replayBlockText = sum.dailyLeft <= 0
          ? (sum.extra && sum.extra.canBuy ? ('今日挑战次数已用完，回天梯可用钻石加赛（' + sum.extra.cost + ' 钻/场）') : '今日挑战次数已用完，明天再来')
          : ('体力不足（每场需要 ' + arenaCost + '）');
      }
    } else {
      const stageCost = (stagesData.getStage(this.data.stageId) || {}).staminaCost || 0;
      canReplay = stam.value >= stageCost;
      if (!canReplay) replayBlockText = '体力不足（本关需要 ' + stageCost + '），去背包喝体力药水';
    }

    this.setData({
      finished: true,
      playing: false,
      progress: 100,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      quarterLabel: r.ot ? ('加时' + r.ot) : '终场',
      resultKind: r.result,
      resultText: r.result === 'win' ? '胜利' : (r.result === 'lose' ? '失败' : '平局'),
      margin: r.margin,
      stars: r.stars,
      starText: starText,
      ot: r.ot,
      quarters: r.quarters.map(function (q) {
        return { label: q.label, home: q.home, away: q.away, totalHome: q.totalHome, totalAway: q.totalAway, ot: !!q.ot };
      }),
      mvp: r.mvp ? { name: r.mvp.name, side: r.mvp.side === 'home' ? '我方' : '对手', pts: r.mvp.pts, blk: r.mvp.blk, dreb: r.mvp.dreb } : null,
      /* 本场生效的羁绊（第七章 7.3）：直接取 battle 的 teamEcho，与结算用的是同一份判定 */
      homeBonds: (r.home && r.home.bonds) || [],
      awayBonds: (r.away && r.away.bonds) || [],
      /* 本场生效的名场面时刻卡：直接取 battle 的 teamEcho（与结算用的是同一份解析结果，
       * 不可能出现「面板说触发了、引擎没算」）。effectLines / effectText 已在 utils/moment.js 算好，
       * 页面不自己拼文案（AGENTS.md §4：WXML 不放表达式逻辑）。 */
      homeMoments: (r.home && r.home.moments) || [],
      awayMoments: (r.away && r.away.moments) || [],
      homeStats: (r.stats.home || []).slice().sort(function (a, b) { return b.pts - a.pts; })
        .map(function (s) { return { uid: s.uid, name: s.name, position: s.position, pts: s.pts, tpm: s.tpm, blk: s.blk, dreb: s.dreb }; }),
      awayStats: (r.stats.away || []).slice().sort(function (a, b) { return b.pts - a.pts; })
        .map(function (s) { return { uid: s.uid, name: s.name, position: s.position, pts: s.pts, tpm: s.tpm, blk: s.blk, dreb: s.dreb }; }),
      rewards: rewards,
      rewardLines: lines,
      canReplay: canReplay,
      replayBlockText: replayBlockText,
      /* 本场达成的赛季任务（回放不重发奖励，也不显示） */
      dynastyMissionText: (!this.arenaReplay && this.dynastyGains && this.dynastyGains.missions.length)
        ? ('赛季任务达成：' + this.dynastyGains.missions.join('、'))
        : '',
      stamina: stam.value,

      /* 竞技场结算（第七章 7.4）：ELO-lite 积分变化 / 段位 / 连胜 / 赛前期望胜率 / 竞技币余额 */
      arenaSettled: !!settle,
      arenaReplayNote: !!this.arenaReplay,
      ratingDeltaText: settle ? ((settle.ratingDelta >= 0 ? '+' : '') + settle.ratingDelta) : '',
      ratingDeltaCls: settle ? (settle.ratingDelta >= 0 ? 'mt-delta--up' : 'mt-delta--down') : '',
      ratingAfter: settle ? settle.ratingAfter : 0,
      arenaRankName: sum ? sum.rankName : '',
      arenaRankText: sum ? sum.rankText : '',
      arenaStreak: settle ? settle.streakAfter : 0,
      arenaStreakBonus: settle ? settle.streakBonus : 0,
      arenaStreakText: settle ? (settle.streakAfter + ' 场' + (settle.streakBonus ? '（连胜加成 +' + settle.streakBonus + ' 分）' : '')) : '',
      arenaExpectedText: settle ? (Math.round(settle.expected * 100) + '%') : '',
      arenaCoinText: sum ? String(sum.arenaCoin) : '',
      arenaDailyText: sum ? sum.dailyText : '',
      arenaFirstWin: !!(settle && settle.firstWin),

      /* 战术克制统计：数字直接取 battle 的 counters / teamEcho，页面只负责拼文案 */
      counterEnabled: !!r.counterEnabled,
      counterBonusPct: Math.round(CONFIG.battle.counter.bonus * 100),
      homeTacticName: (r.home && r.home.playStyleName) || '',
      awayTacticName: (r.away && r.away.playStyleName) || '',
      homeDefenseName: (r.home && r.home.defenseName) || '',
      awayDefenseName: (r.away && r.away.defenseName) || '',
      homeCounterText: counterText(r.counters && r.counters.home),
      awayCounterText: counterText(r.counters && r.counters.away)
    });
    this.drawCourt(r.log[r.log.length - 1]);
    if (r.result === 'win') { wx.vibrateShort && wx.vibrateShort({ type: 'medium' }); }
  },

  /* ---------- 结算后操作 ---------- */
  replay() {
    if (!this.data.canReplay) {
      wx.showToast({ title: this.data.replayBlockText || '当前无法再战', icon: 'none' });
      return;
    }
    if (!this.begin()) return;
    const self = this;
    setTimeout(function () { self.initCanvas(); self.startPlayback(); }, 60);
  },

  /* 离场：竞技场页在页面栈上（navigateTo 进来），navigateBack 直接回天梯；
   * PVE 从关卡 tab 进来，同理回关卡。按钮文案由 data.backLabel 驱动，WXML 不判断模式。 */
  backToStages() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/stages/stages' });
  },

  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); },
  goBag() { wx.navigateTo({ url: '/pages/bag/bag' }); },

  /* 复现验证入口：把 seed 复制出来，配合 tools/replay-battle.mjs 可离线逐回合比对 */
  copySeed() {
    const seed = this.data.seed;
    if (!seed) return;
    wx.setClipboardData({
      data: seed,
      success: function () { wx.showToast({ title: 'seed 已复制，可用 tools/replay-battle.mjs 复现', icon: 'none' }); }
    });
  }
}));