/* pages/arena/arena.js —— 竞技场（第七章 7.4「模式：竞技场（异步 PVP）」，里程碑 2）
 * 职责：段位 / 积分 / 每日次数展示、天梯侦察列表、对手详情、历史对局回放入口。
 *
 * 【为什么叫「异步 PVP」】双方不同时在线：对手是 data/arena.js 里确定性构造的阵容快照，
 *   一场对局 = seed + 双方阵容，因此打完之后任何时候都能用快照逐回合复现（第十二章可复现口径）。
 *   本工程零后端、零外链（第十一章），页面里会把这一点讲清楚，不冒充真人对战。
 * 【分层】页面只调 store 的 commands（setPlayStyle / setDefense），只读 selectors.arenaView；
 *   积分、段位、每日次数、克制结论全部由 selectors/utils 算好，WXML 不做任何计算与三元嵌套。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const tactics = require('../../data/tactics.js');
const CONFIG = require('../../config.js');

Page(store.connectPage(function (state, self) {
  const local = (self && self.data) || {};
  const now = Date.now();
  const av = selectors.arenaView(state, now);
  const detailId = local.detailId || '';
  const detail = detailId ? (av.ladder.filter(function (r) { return r.id === detailId; })[0] || null) : null;
  const curDef = av.defenses.filter(function (d) { return d.key === av.defense; })[0] || av.defenses[0];

  return {
    enabled: av.enabled,
    /* 段位与积分 */
    rating: av.rating,
    rankName: av.rankName,
    rankShort: av.rankShort,
    rankColor: av.rankColor,
    rankText: av.rankText,
    /* 封顶段位没有「下一段」，文案必须在 js 里算好（WXML 不写三元嵌套） */
    rankCaption: av.nextRankName ? ('距离 ' + av.nextRankName + ' 还差 ' + av.rankNeed + ' 分') : '段位已封顶',
    rankRatio: av.rankRatio,
    rankNeed: av.rankNeed,
    nextRankName: av.nextRankName,
    lastRatingText: av.lastRatingText,
    arenaCoinText: String(av.arenaCoin),
    /* 战绩 */
    matches: av.matches,
    wins: av.wins,
    losses: av.losses,
    draws: av.draws,
    winRate: av.winRate,
    streak: av.streak,
    bestStreak: av.bestStreak,
    recordText: av.matches + ' 战 ' + av.wins + ' 胜 ' + av.losses + ' 负 ' + av.draws + ' 平 · 胜率 ' + av.winRate + '%',
    /* 出战条件 */
    dailyText: av.dailyText,
    dailyLeft: av.daily.left,
    dailyUsed: av.daily.used,
    dailyTotal: av.daily.total,
    diamondText: av.diamonds + ' 钻',
    extra: av.extra,
    extraNote: av.extraNote,
    stamina: av.stamina,
    staminaCost: av.staminaCost,
    rosterReady: av.rosterReady,
    overCap: av.overCap,
    starterCount: av.starterCount,
    starterNeed: av.starterNeed,
    canFight: av.canFight,
    starterAvgOvr: av.starterAvgOvr,
    blockText: !av.enabled ? '竞技场尚未开放'
      : (!av.rosterReady ? (av.overCap ? '薪资超出工资帽，先去阵容页调整' : '首发还差 ' + (av.starterNeed - av.starterCount) + ' 人')
        : (av.daily.left <= 0 ? (!av.extra.enabled ? '今日挑战次数已用完，明天再来'
          : (av.extra.canBuy ? '今日挑战次数已用完，可用钻石加赛（下方）'
            : (av.extra.soldOut ? '今日挑战次数已用完（加赛已购满），明天再来' : '今日挑战次数已用完（钻石不足，加赛需 ' + av.extra.cost + ' 钻）')))
          : (av.stamina < av.staminaCost ? '体力不足（每场需要 ' + av.staminaCost + '）' : ''))),
    /* 战术（与阵容页同一套 chips，改的是同一个 state.roster 字段） */
    playStyle: av.playStyle,
    playStyleName: av.playStyleName,
    styles: av.styles,
    defenses: av.defenses,
    defense: av.defense,
    defenseDesc: curDef ? curDef.desc : '',
    myDefenseName: av.myDefenseName,
    counterEnabled: av.counterEnabled,
    counterHint: av.counterHint,
    /* 天梯 */
    ladder: av.ladder,
    ladderCount: av.ladderCount,
    clearedCount: av.clearedCount,
    nextOpponentId: av.nextOpponentId,
    nextOpponentName: av.nextOpponentName,
    allCleared: av.allCleared,
    progressText: '天梯进度 ' + av.clearedCount + '/' + av.ladderCount,
    /* 历史（含可复现快照） */
    history: av.history,
    historyCount: av.history.length,
    historyMax: CONFIG.arena.historyMax,
    detail: detail,
    detailId: detailId,
    note: av.note,
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    enabled: true,
    rating: 0, rankName: '', rankShort: '', rankColor: '', rankText: '', rankCaption: '', rankRatio: 0, rankNeed: 0,
    nextRankName: '', lastRatingText: '+0', arenaCoinText: '0',
    matches: 0, wins: 0, losses: 0, draws: 0, winRate: 0, streak: 0, bestStreak: 0, recordText: '',
    dailyText: '', dailyLeft: 0, dailyUsed: 0, dailyTotal: 0,
    diamondText: '0 钻',
    extra: { enabled: false, cost: 0, bought: 0, max: 0, soldOut: false, affordable: false, canBuy: false, text: '', buyText: '', buyDisabled: true },
    extraNote: '',
    stamina: 0, staminaCost: 10, rosterReady: false, overCap: false,
    starterCount: 0, starterNeed: 5, canFight: false, starterAvgOvr: 0, blockText: '',
    playStyle: 'balanced', playStyleName: '', styles: [], defenses: [], defense: 'auto',
    defenseDesc: '', myDefenseName: '', counterEnabled: true, counterHint: '',
    ladder: [], ladderCount: 0, clearedCount: 0, nextOpponentId: '', nextOpponentName: '',
    allCleared: false, progressText: '',
    history: [], historyCount: 0, historyMax: 20,
    detail: null, detailId: '', note: '', dataSourceLabel: '', reduceMotion: false
  },

  resync() { if (this.__syncStore) this.__syncStore(); },
  noop() {},

  /* ---------- 战术（打法 / 防守策略） ---------- */
  onStyle(e) {
    const key = e.currentTarget.dataset.key;
    const res = store.setPlayStyle(key);
    if (!res || !res.ok) { wx.showToast({ title: (res && res.reason) || '打法不可用', icon: 'none' }); return; }
    wx.showToast({ title: '打法：' + ((tactics.PLAY_STYLES[key] || {}).name || key), icon: 'none', duration: 700 });
  },

  onDefense(e) {
    const key = e.currentTarget.dataset.key;
    const res = store.setDefense(key);
    if (!res || !res.ok) { wx.showToast({ title: (res && res.reason) || '防守策略不可用', icon: 'none' }); return; }
    const item = (this.data.defenses || []).filter(function (d) { return d.key === key; })[0];
    wx.showToast({ title: '防守：' + ((item && item.name) || key), icon: 'none', duration: 700 });
  },

  /* 一键采纳侦察建议：把防守策略切到 bestDefenseAgainst 算出来的那一套 */
  useSuggest(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const res = store.setDefense(key);
    if (!res || !res.ok) { wx.showToast({ title: (res && res.reason) || '防守策略不可用', icon: 'none' }); return; }
    wx.showToast({ title: '已采纳防守建议', icon: 'none', duration: 700 });
  },

  /* ---------- 对手详情 ---------- */
  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.ladder || []).filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    if (!row.unlocked) {
      wx.showToast({ title: row.lockText || '先赢下前一位对手', icon: 'none' });
      return;
    }
    this.setData({ detailId: id }, this.resync);
  },

  closeDetail() { this.setData({ detailId: '' }, this.resync); },

  /* ---------- 挑战 ----------
   * 与 PVE 同构：页面只做「软校验 + 跳转」，硬性校验（解锁 / 次数 / 体力 / 工资帽）
   * 全部在 store.arenaChallenge 里再兜一次，比赛页 begin() 才真正结算。 */
  challenge(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.data.nextOpponentId;
    const row = (this.data.ladder || []).filter(function (r) { return r.id === id; })[0];
    if (!row) { wx.showToast({ title: '对手不存在', icon: 'none' }); return; }
    if (!row.unlocked) { wx.showToast({ title: row.lockText || '先赢下前一位对手', icon: 'none' }); return; }
    if (!this.data.rosterReady) {
      wx.showToast({ title: this.data.overCap ? '薪资超帽，先去阵容页' : '首发不足 5 人', icon: 'none' });
      this.setData({ detailId: '' }, this.resync);
      wx.switchTab({ url: '/pages/roster/roster' });
      return;
    }
    if (this.data.dailyLeft <= 0) {
      wx.showToast({ title: (this.data.extra && this.data.extra.canBuy) ? '今日挑战次数已用完，可用钻石加赛' : '今日挑战次数已用完', icon: 'none' });
      return;
    }
    if (this.data.stamina < this.data.staminaCost) {
      wx.showToast({ title: '体力不足（需要 ' + this.data.staminaCost + '）', icon: 'none' });
      return;
    }
    this.setData({ detailId: '' }, this.resync);
    wx.navigateTo({ url: '/pages/match/match?mode=arena&opp=' + id });
  },

  /* ---------- 加赛（里程碑 5）：钻石加购当日挑战次数 ----------
   * 与竞技商城同一条交互：不可买时 toast 原因，可买时二次确认后只调命令（硬校验全在 store.arenaBuyExtra）。 */
  buyExtra() {
    const extra = this.data.extra || {};
    if (!extra.canBuy) {
      wx.showToast({ title: extra.buyText || '当前无法加赛', icon: 'none' });
      return;
    }
    const self = this;
    wx.showModal({
      title: '加购挑战次数',
      content: '花 ' + extra.cost + ' 钻石加赛 1 场？今日已购 ' + extra.bought + '/' + extra.max + '。',
      confirmText: '加购',
      cancelText: '再想想',
      success(res) {
        if (!res.confirm) return;
        const r = store.arenaBuyExtra();
        if (r && r.ok) wx.showToast({ title: '已加赛 +1 场（-' + r.cost + ' 钻）', icon: 'none', duration: 1200 });
        else wx.showToast({ title: (r && r.reason) || '加购失败', icon: 'none' });
        self.resync();
      }
    });
  },

  /* ---------- 历史回放：用存档里的快照复现（不消耗次数与体力） ---------- */
  replayHistory(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const row = (this.data.history || [])[idx];
    if (!row) return;
    if (!row.canReplay) {
      wx.showToast({ title: '快照阵容不完整，无法复现', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/match/match?mode=arena&hist=' + idx });
  },

  /* 竞技商城（里程碑 2 消费出口）：背包页的 shop 分页。
   * 用 navigateTo 而不是 switchTab —— 背包页不是 tabBar 页面（见 app.json）。 */
  goShop() {
    wx.navigateTo({ url: '/pages/bag/bag?tab=shop' });
  },

  copySeed(e) {
    const seed = e.currentTarget.dataset.seed;
    if (!seed || typeof wx === 'undefined' || !wx.setClipboardData) return;
    wx.setClipboardData({
      data: seed,
      success: function () { wx.showToast({ title: 'seed 已复制，可用 tools/replay-battle.mjs 复现', icon: 'none' }); }
    });
  },

  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); },
  goStages() { wx.switchTab({ url: '/pages/stages/stages' }); }
}));