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
 *
 * 里程碑 6 起 Canvas 升级为「真实比例像素球场 + 5v5 球员逐帧演出」：
 *   - 场景 = 球场白线（边线 / 中线 / 中圈 / 禁区 / 罚球圈 / 三分弧 / 篮板篮筐）+ 十名球员 + 球，
 *     回合命中 / 盖帽 / 打铁给放大特写（球员名 + 事件标签）；
 *   - 演出只做视觉（8 帧步进位移，帧参数读 config.battle.playback.animMs / animFrames），
 *     **不消耗随机数**，暂停 / 倍速 / 跳过不影响比分（seed 已定）；
 *   - 结算浮层弹出后整块观赛区隐藏（旧版结算后球场残留在浮层背后，属已修复的视觉 bug）。
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
const ANIM_MS = Number(PLAYBACK.animMs) || 95;      // 回合特写单帧时长（帧数 x 帧距 = 一次特写）
const ANIM_FRAMES = Math.max(2, Math.round(Number(PLAYBACK.animFrames) || 8)); // 特写帧数（steps 逐帧位移）

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
    this.stopAnim();
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
        self.renderScene(null, null);
      });
  },

  /* ================= 里程碑 6：像素球场 + 5v5 球员动画（自包含渲染块） =================
   * 本块只读 this.__ctx / this.__cw / this.__ch / this.data + 常量 P / SPEEDS / ANIM_MS / ANIM_FRAMES，
   * 其余全走参数，便于离线预览（work/px6 的预览页直接抽取本块在浏览器里渲染）。
   * 规范：整数坐标、无渐变、限色（第六章）；演出不消耗任何随机数（可复现红线）。
   * ------------------------------------------------------------------------------ */

  /* 球场几何：真实半场比例 → 画布坐标（纯函数） */
  courtGeom(W, H) {
    const m = Math.max(6, Math.round(Math.min(W, H) * 0.042));
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
    const w = x1 - x0, h = y1 - y0;
    return {
      m: m, x0: x0, y0: y0, x1: x1, y1: y1, w: w, h: h,
      cx: Math.round((x0 + x1) / 2), cy: Math.round((y0 + y1) / 2),
      line: Math.max(1, Math.round(Math.min(W, H) / 170)),
      hoopIn: Math.max(4, Math.round(w * 0.052)),
      keyLen: Math.max(16, Math.round(w * 0.21)),
      keyHalf: Math.max(10, Math.round(h * 0.17)),
      ftR: Math.max(5, Math.round(h * 0.115)),
      midR: Math.max(6, Math.round(h * 0.115)),
      arcR: Math.max(12, Math.round(h * 0.44)),
      cornerIn: Math.max(3, Math.round(h * 0.075)),
      boardH: Math.max(5, Math.round(h * 0.035))
    };
  },

  /* 静态球场：地板 + 白线 + 篮架（返回几何对象，动态层复用） */
  paintCourt() {
    const ctx = this.__ctx;
    if (!ctx) return null;
    const g = this.courtGeom(this.__cw, this.__ch);
    const L = '#f2e4c8';
    /* 地板：竖向木板条（两色交替），再叠一层棋盘压暗让白线跳出来 */
    ctx.fillStyle = P.court;
    ctx.fillRect(0, 0, this.__cw, this.__ch);
    ctx.fillStyle = P.courtDark;
    const plank = Math.max(5, Math.round(this.__cw / 26));
    for (let px = 0; px < this.__cw; px += plank * 2) ctx.fillRect(px, 0, plank, this.__ch);
    ctx.fillStyle = 'rgba(7,12,28,0.10)';
    for (let py = 0; py < this.__ch; py += 2) {
      for (let px = ((py / 2) % 2) * 2; px < this.__cw; px += 4) ctx.fillRect(px, py, 2, 1);
    }
    ctx.strokeStyle = L;
    ctx.fillStyle = L;
    ctx.lineWidth = g.line;
    /* 边线 + 中线 + 中圈 */
    ctx.strokeRect(g.x0 + 0.5, g.y0 + 0.5, g.w - 1, g.h - 1);
    ctx.beginPath();
    ctx.moveTo(g.cx + 0.5, g.y0);
    ctx.lineTo(g.cx + 0.5, g.y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.midR, 0, Math.PI * 2);
    ctx.stroke();
    /* 左右两套：禁区 + 罚球圈 + 限制区弧 + 三分（底角线 + 大弧） + 篮板/篮筐/球网 */
    const self = this;
    [1, -1].forEach(function (dir) {
      const hoopX = dir > 0 ? g.x0 + g.hoopIn : g.x1 - g.hoopIn;
      const keyOutX = dir > 0 ? g.x0 + g.keyLen : g.x1 - g.keyLen;
      ctx.strokeRect(Math.min(keyOutX, keyOutX) + 0.5, g.cy - g.keyHalf + 0.5, g.keyLen - 1, g.keyHalf * 2 - 1);
      ctx.beginPath();
      ctx.arc(keyOutX, g.cy, g.ftR, 0, Math.PI * 2);
      ctx.stroke();
      /* 限制区半圆（面向场地中心） */
      const ra = Math.max(4, Math.round(g.h * 0.085));
      ctx.beginPath();
      if (dir > 0) ctx.arc(hoopX, g.cy, ra, -Math.PI / 2, Math.PI / 2);
      else ctx.arc(hoopX, g.cy, ra, Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      /* 三分：底角直线 + 与底角线相交的大弧 */
      const dyHalf = Math.round(g.h / 2) - g.cornerIn;
      const dxArc = Math.round(Math.sqrt(Math.max(1, g.arcR * g.arcR - dyHalf * dyHalf)));
      const yTop = g.y0 + g.cornerIn, yBot = g.y1 - g.cornerIn;
      const baseX = dir > 0 ? g.x0 : g.x1;
      ctx.beginPath();
      ctx.moveTo(baseX, yTop + 0.5);
      ctx.lineTo(hoopX + dir * dxArc, yTop + 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(baseX, yBot - 0.5);
      ctx.lineTo(hoopX + dir * dxArc, yBot - 0.5);
      ctx.stroke();
      const a = Math.atan2(dyHalf, dxArc);
      ctx.beginPath();
      if (dir > 0) ctx.arc(hoopX, g.cy, g.arcR, -a, a, false);
      else ctx.arc(hoopX, g.cy, g.arcR, a - Math.PI, Math.PI - a, true);
      ctx.stroke();
      /* 篮板（竖线） + 篮筐（橙块） + 球网（抖动像素） */
      const bx = dir > 0 ? g.x0 + g.line + 1 : g.x1 - g.line - 1;
      ctx.fillStyle = L;
      ctx.fillRect(bx, g.cy - g.boardH, Math.max(1, g.line), g.boardH * 2);
      ctx.fillStyle = P.orange;
      const rimW = Math.max(3, Math.round(g.w * 0.014));
      ctx.fillRect(dir > 0 ? bx + 2 : bx - 1 - rimW, g.cy - 1, rimW, 3);
      ctx.fillStyle = P.textDim;
      const netX = dir > 0 ? bx + 2 : bx - 1 - rimW;
      for (let ny = 0; ny < 3; ny++) {
        for (let nx = 0; nx < rimW; nx++) {
          if ((nx + ny) % 2 === 0) ctx.fillRect(netX + nx, g.cy + 2 + ny, 1, 1);
        }
      }
      ctx.fillStyle = L;
    });
    return g;
  },

  /* 迷你像素小人尺度：u 像素 = 1 个「设计像素」 */
  __unit() { return Math.max(3, Math.min(5, Math.round(this.__ch / 72))); },

  /* 画一个像素小人：x,y = 脚底中心；dir = 朝向（1 面向右）；pose = stand/run/jump/contest；lift = 起跳抬升 */
  drawMan(x, y, dir, kit, pose, lift, scale) {
    const ctx = this.__ctx;
    if (!ctx) return;
    const u = (scale || this.__unit());
    const R = Math.round;
    const bx = R(x), by = R(y - (lift || 0));
    const legH = (pose === 'jump' || pose === 'contest') ? 2 : 3;
    /* 腿（跑动帧一前一后） */
    ctx.fillStyle = kit.legs;
    if (pose === 'run') {
      ctx.fillRect(R(bx - u * 1.3), by - u * legH, u, u * legH);
      ctx.fillRect(R(bx + u * 0.3), by - u * legH, u, u * legH - u);
    } else {
      ctx.fillRect(R(bx - u * 1.2), by - u * legH, u, u * legH);
      ctx.fillRect(R(bx + u * 0.2), by - u * legH, u, u * legH);
    }
    /* 躯干（球衣） */
    const jy = by - u * (legH + 4);
    ctx.fillStyle = kit.jer;
    ctx.fillRect(R(bx - u * 1.5), jy, u * 3, u * 4);
    ctx.fillStyle = kit.trim;
    ctx.fillRect(R(bx - u * 1.5), jy + u * 3, u * 3, u);          // 下摆
    ctx.fillRect(R(bx - u * 1.5), jy, u, u);                      // 左肩滚边
    ctx.fillRect(R(bx + u * 0.5), jy, u, u);                      // 右肩滚边
    /* 手臂 */
    ctx.fillStyle = kit.skin;
    if (pose === 'jump' || pose === 'contest') {
      ctx.fillRect(R(bx - u * 0.9), jy - u * 2.2, u * 0.8, u * 2.4);   // 双臂举起
      ctx.fillRect(R(bx + u * 0.1), jy - u * 2.2, u * 0.8, u * 2.4);
    } else if (pose === 'run') {
      ctx.fillRect(R(bx + dir * u * 0.9), jy + u * 0.4, u * 0.8, u * 2.2); // 前后摆臂
      ctx.fillRect(R(bx - dir * u * 1.7), jy + u * 0.8, u * 0.8, u * 1.8);
    } else {
      ctx.fillRect(R(bx - u * 2.1), jy + u * 0.3, u * 0.7, u * 2.4);
      ctx.fillRect(R(bx + u * 1.4), jy + u * 0.3, u * 0.7, u * 2.4);
    }
    /* 头（皮肤 + 发型 + 眼睛） */
    const hy = jy - u * 3.2;
    ctx.fillStyle = kit.skin;
    ctx.fillRect(R(bx - u), hy, u * 2, u * 2.6);
    ctx.fillStyle = kit.hair;
    ctx.fillRect(R(bx - u), hy - u * 0.8, u * 2, u * 1.1);
    ctx.fillStyle = P.navy900;
    ctx.fillRect(R(bx + dir * u * 0.2), hy + u * 0.9, Math.max(1, R(u * 0.45)), Math.max(1, R(u * 0.45)));
  },

  /* 球（含 1px 接缝） */
  drawBall(x, y) {
    const ctx = this.__ctx;
    if (!ctx) return;
    const u = this.__unit();
    const s = Math.max(3, Math.round(u * 1.1));
    const bx = Math.round(x - s / 2), by = Math.round(y - s / 2);
    ctx.fillStyle = P.gold;
    ctx.fillRect(bx, by, s, s);
    if (s >= 3) {
      ctx.fillStyle = '#7a4a10';
      ctx.fillRect(bx, by + Math.floor(s / 2), s, 1);
      ctx.fillRect(bx + Math.floor(s / 2), by, 1, s);
    }
  },

  /* 命中特写：放大版小人 + 姓名牌（milestone 6「场上球员动画特写」） */
  drawCloseUp(pane, kit, pose, name, label) {
    const ctx = this.__ctx;
    if (!ctx || !pane) return;
    const R = Math.round;
    const s = Math.max(4, Math.round(pane.h / 18));
    ctx.fillStyle = 'rgba(7,12,28,0.88)';
    ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
    ctx.strokeStyle = P.line;
    ctx.lineWidth = Math.max(1, this.courtGeom(this.__cw, this.__ch).line + 1);
    ctx.strokeRect(pane.x + 0.5, pane.y + 0.5, pane.w - 1, pane.h - 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = P.gold;
    ctx.font = 'bold ' + Math.max(9, Math.round(pane.h * 0.14)) + 'px monospace';
    ctx.fillText(label, pane.x + pane.w / 2, pane.y + Math.round(pane.h * 0.16));
    ctx.fillStyle = P.text;
    ctx.font = 'bold ' + Math.max(8, Math.round(pane.h * 0.12)) + 'px monospace';
    ctx.fillText(String(name || '').slice(0, 6), pane.x + pane.w / 2, pane.y + pane.h - Math.round(pane.h * 0.12));
    this.drawMan(pane.x + pane.w / 2, pane.y + pane.h - Math.round(pane.h * 0.24), 1, kit, pose, 0, s);
  },

  /* 一帧完整场景：静态球场 + 10 名球员 + 球 + 特写/横幅。entry=null 或 f=null ⇒ 定格 */
  renderScene(entry, f) {
    const ctx = this.__ctx;
    if (!ctx) return;
    const g = this.paintCourt();
    if (!g) return;
    const R = Math.round;
    const u = this.__unit();
    const homeKit = { jer: P.orange, trim: P.navy900, legs: P.navy700, skin: '#e8b98a', hair: '#1b1b1f' };
    const awayKit = { jer: '#dfe7ff', trim: '#2f5fa8', legs: '#2f3f6b', skin: '#a9714b', hair: '#2b2f45' };
    const kits = { home: homeKit, away: awayKit };
    const fixture = [-0.62, 0.62, -0.26, 0.34, 0.04];
    const homeSpot = [0.09, 0.22, 0.35, 0.48, 0.60];
    const awaySpot = [0.91, 0.78, 0.65, 0.52, 0.40];
    const anchor = (side, i) => ({
      x: g.x0 + g.w * (side === 'home' ? homeSpot[i] : awaySpot[i]),
      y: g.cy + fixture[i] * (g.h / 2)
    });
    const fx = (v) => Math.round(v);                    // 位置量化到整像素（像素风）
    const side = entry && (entry.side === 'home' || entry.side === 'away') ? entry.side : '';
    const isRound = !!side;
    const fnum = (f === null || f === undefined) ? 7 : f;
    const attackDir = side === 'home' ? 1 : -1;
    const hoopX = attackDir > 0 ? g.x1 - g.hoopIn : g.x0 + g.hoopIn;
    const hIdx = (str) => {
      let h = 0;
      const t = String(str || '');
      for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
      return h % 5;
    };
    const shooterIdx = isRound ? hIdx(entry.shooterUid || entry.shooter) : 0;
    const defIdx = isRound ? hIdx((entry.defenderUid || entry.defender) + 'd') : 0;
    const made = !!(entry && entry.made);
    const shootX = fx(hoopX - attackDir * g.arcR * 0.42);
    const shootY = fx(g.cy + (fixture[shooterIdx] * g.h * 0.1));
    const runT = isRound ? Math.min(1, fnum / 3) : 0;
    const jumpT = (isRound && fnum >= 3 && fnum <= 6) ? (fnum === 3 ? 0.25 : (fnum === 4 ? 0.85 : (fnum === 5 ? 1 : 0.4))) : 0;
    const lift = jumpT * u * 2.2;
    /* 十名球员 */
    for (const s of ['home', 'away']) {
      const kit = kits[s];
      const shift = isRound ? (s === side ? attackDir * g.w * 0.07 : -attackDir * g.w * 0.02) : 0;
      for (let i = 0; i < 5; i++) {
        const a = anchor(s, i);
        let px = a.x + shift, py = a.y, pose = 'stand', lf = 0;
        const moving = isRound && ((s === side) || (s !== side && i === defIdx));
        if (isRound && s === side && i === shooterIdx) {
          px = a.x + shift + (shootX - (a.x + shift)) * runT;
          py = a.y + (shootY - a.y) * runT;
          pose = fnum >= 3 && fnum <= 6 ? 'jump' : (fnum < 3 ? 'run' : 'stand');
          lf = lift;
        } else if (isRound && s !== side && i === defIdx) {
          const dpos = anchor(side, shooterIdx);
          px = a.x + (dpos.x + attackDir * u * 2.4 - a.x) * runT;
          py = a.y + (dpos.y - a.y) * runT;
          pose = fnum >= 4 && fnum <= 6 ? 'contest' : 'run';
          lf = jumpT * u * 1.8;
        } else if (moving && fnum < 3) {
          pose = 'run';
        }
        this.drawMan(px, py, s === 'home' ? 1 : -1, kit, pose, lf);
      }
    }
    /* 球 */
    if (!isRound) {
      this.drawBall(g.cx, g.cy + u);
    } else {
      const hand = anchor(side, shooterIdx);
      const hx = hand.x + attackDir * g.w * 0.07 + (shootX - (hand.x + attackDir * g.w * 0.07)) * runT;
      const hy = hand.y + (shootY - hand.y) * runT - u * 8 - lift;
      const target = { x: hoopX - attackDir * 2, y: g.cy - u * 2 };
      let bx = hx, by = hy;
      if (fnum >= 3) {
        const p = Math.min(1, (fnum - 3) / 2);
        bx = hx + (target.x - hx) * p;
        by = hy + (target.y - hy) * p - Math.sin(p * Math.PI) * u * 3.2;
      }
      if (fnum === 6) {
        if (made) { bx = target.x; by = target.y; }
        else { bx = hoopX + attackDir * -g.w * 0.10; by = g.cy + g.h * 0.10; }
      } else if (fnum >= 7) {
        if (made) { bx = target.x; by = target.y; }
        else { bx = hoopX + attackDir * -g.w * 0.10; by = g.cy + g.h * 0.14; }
      }
      this.drawBall(bx, by);
      /* 命中火花：篮筐四周 4 个像素点（f5-f7） */
      if (made && fnum >= 5) {
        ctx.fillStyle = P.gold;
        ctx.fillRect(R(target.x - u), R(target.y - u), 1, 1);
        ctx.fillRect(R(target.x + u), R(target.y - u), 1, 1);
        ctx.fillRect(R(target.x - u), R(target.y + u), 1, 1);
        ctx.fillRect(R(target.x + u), R(target.y + u), 1, 1);
      }
    }
    /* 特写镜头（回合事件 f>=2；命中/盖帽/打铁均给特写） */
    if (isRound && fnum >= 2) {
      const pane = {
        w: Math.round(g.w * 0.34), h: Math.round(g.h * 0.56),
        x: hoopX > g.cx ? g.x0 + Math.round(g.line * 2) : g.x1 - Math.round(g.w * 0.34) - Math.round(g.line * 2),
        y: g.y0 + Math.round(g.line * 2)
      };
      const blockish = entry.event === 'block';
      const kit = kits[blockish ? (side === 'home' ? 'away' : 'home') : side];
      const label = made ? ('+' + (entry.points || 2)) : (blockish ? '盖帽' : (entry.event === 'rebound' ? '篮板' : '打铁'));
      const pose = made ? (jumpT > 0 ? 'jump' : 'contest') : (blockish ? 'contest' : 'jump');
      const name = (blockish ? entry.defender : entry.shooter) || '';
      this.drawCloseUp(pane, kit, pose, name, label);
    }
    /* 节间横幅（信息条：只显示节次，避免长句盖住球场） */
    if (entry && entry.kind === 'info') {
      const text = entry.final ? '终场' : (entry.qLabel || '');
      if (text) {
        const bw = Math.round(g.w * 0.34), bh = Math.round(g.h * 0.16);
        const bx = g.cx - Math.round(bw / 2), by = g.cy - Math.round(bh / 2);
        ctx.fillStyle = 'rgba(7,12,28,0.85)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = P.orange;
        ctx.lineWidth = g.line;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = P.gold;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.max(11, Math.round(bh * 0.44)) + 'px monospace';
        ctx.fillText(text, g.cx, by + Math.round(bh / 2));
      }
    }
  },

  /* 播放一次事件动画（8 帧、步进式位移；倍速越快帧距越短，绝不改比分） */
  playScene(entry) {
    this.stopAnim();
    this.__lastEntry = entry;
    if (!this.__ctx) return;
    if (entry && entry.kind === 'info') { this.renderScene(entry, null); return; }
    const speed = (SPEEDS[this.data.speedIndex] || 1);
    const frameMs = Math.max(24, Math.round(ANIM_MS / speed));
    const self = this;
    let f = 0;
    this.renderScene(entry, 0);
    const stepFn = function () {
      f++;
      if (f >= ANIM_FRAMES) { self.__animTimer = null; self.renderScene(entry, null); return; }
      self.renderScene(entry, f);
      self.__animTimer = setTimeout(stepFn, frameMs);
    };
    this.__animTimer = setTimeout(stepFn, frameMs);
  },

  stopAnim() {
    if (this.__animTimer) { clearTimeout(this.__animTimer); this.__animTimer = null; }
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
    this.playScene(entry);
  },

  pause() {
    this.stopTimer();
    this.stopAnim();
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
    /* 观赛区随结算整组隐藏，这里不再补画最后一帧（里程碑 6 修复「结算后球场残留」） */
    this.finish();
  },

  /* ---------- 结算面板 ----------
   * 三种入口共用一个面板：PVE 给星级与首通奖励；竞技场给积分 / 段位 / 竞技币，**不发星级**（第七章 7.4，
   * 星级是 PVE 赛季征程的口径）。战术克制统计两种模式都显示：双方打法 + 防守策略 + 克 / 被克次数。 */
  finish() {
    this.stopTimer();
    this.stopAnim();
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
    this.stopAnim();
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