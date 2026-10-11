/* pages/profile/profile.js —— 我的（Tab 5，第十章页面清单）
 * 职责：经理档案、执教统计（PVE 赛季 + 竞技场天梯）、图鉴收集进度、球队动态，以及通往图鉴/背包/设置/竞技场的入口。
 * 合规：本页固定展示第三章要求的法律声明与「原创球探报告」数据来源说明。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const CONFIG = require('../../config.js');
const stagesData = require('../../data/stages.js');
const fmt = require('../../utils/format.js');

Page(store.connectPage(function (state) {
  const lv = selectors.levelView(state);
  const progress = selectors.collectionProgress(state);
  const pity = selectors.pityView(state);
  const s = state.stats;
  const cleared = (state.season && state.season.cleared) || {};
  const arena = selectors.arenaSummary(state, Date.now());
  /* 交易市场（里程碑 3 第二块）：只要摘要（橱窗格数 / 可售张数 / 金币），买卖在市集页做 */
  const market = selectors.marketView(state, Date.now());
  /* 王朝赛季（里程碑 3 第三块）：只要摘要（等级 / 积分 / 剩余天数 / 待领），任务与通行证在王朝页做 */
  const dynasty = selectors.dynastySummary(state, Date.now());

  return {
    gameName: CONFIG.GAME_NAME,
    version: CONFIG.VERSION,
    milestone: CONFIG.MILESTONE,
    managerName: state.profile.name || '梦之队经理',
    level: lv.level,
    exp: lv.exp,
    need: lv.need,
    expRatio: Math.round(lv.ratio * 100),
    goldText: fmt.numText(state.profile.gold),
    diamondText: fmt.numText(state.profile.diamond),
    ticketNormal: state.profile.ticketNormal,
    ticketAdvanced: state.profile.ticketAdvanced,

    rarityRows: progress.byRarity.map(function (r) {
      return { rarity: r.rarity, label: r.label, got: r.got, total: r.total, pct: r.total ? Math.round((r.got / r.total) * 100) : 0 };
    }),
    ownedCount: progress.uniqueOwned,
    totalCount: progress.total,
    collectRatio: Math.round(progress.ratio * 100),
    instances: progress.instances,

    battles: s.battles,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    winRate: s.battles ? Math.round((s.wins / s.battles) * 100) : 0,
    bestMargin: s.bestMargin,
    totalPoints: s.totalPoints,
    pulls: s.pulls,
    cardsObtained: s.cardsObtained,
    urCount: pity.advanced.totalUr,

    /* 竞技场（第七章 7.4 异步 PVP，里程碑 2）：与 PVE 的赛季征程分账显示 */
    arenaEnabled: arena.enabled,
    arenaRankName: arena.rankName,
    arenaRating: arena.rating,
    arenaWins: arena.wins,
    arenaMatches: arena.matches,
    arenaProgressText: arena.clearedCount + '/' + arena.ladderCount,
    arenaStreak: arena.streak,
    arenaCoinText: String(arena.arenaCoin),
    arenaDailyText: arena.dailyText,

    /* 交易市场摘要 */
    marketShelfCount: market.shelfCount,
    marketSellable: market.sellableCount,
    marketDayText: market.shelfTitle,

    /* 王朝赛季摘要 */
    dynastyEnabled: dynasty.enabled,
    dynastyLevelText: dynasty.levelText,
    dynastyPointsText: dynasty.pointsText,
    dynastyDaysLeftText: dynasty.daysLeftText,
    dynastyClaimableText: dynasty.claimableText,

    stars: state.season ? state.season.totalStars : 0,
    starMax: stagesData.STAGES.length * 3,
    clearedCount: Object.keys(cleared).length,
    stageCount: stagesData.STAGES.length,

    notices: (state.notices || []).slice(0, 10).map(function (n) {
      return { text: n.text, kind: n.kind, at: fmt.fromNow(n.at, Date.now()) };
    }),
    noticeCount: (state.notices || []).length,

    saveSize: fmt.numText(JSON.stringify(state).length),
    createdAt: fmt.dateOnly(state.createdAt),
    legalNote: CONFIG.compliance.legalNote,
    trademarkNote: CONFIG.compliance.trademarkNote,
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    gameName: '', version: '', milestone: '', managerName: '', level: 1, exp: 0, need: 0, expRatio: 0,
    arenaEnabled: true, arenaRankName: '', arenaRating: 0, arenaWins: 0, arenaMatches: 0,
    arenaProgressText: '0/12', arenaStreak: 0, arenaCoinText: '0', arenaDailyText: '',
    marketShelfCount: 0, marketSellable: 0, marketDayText: '',
    dynastyEnabled: true, dynastyLevelText: 'Lv.0', dynastyPointsText: '0', dynastyDaysLeftText: '', dynastyClaimableText: '',
    goldText: '0', diamondText: '0', ticketNormal: 0, ticketAdvanced: 0,
    rarityRows: [], ownedCount: 0, totalCount: 0, collectRatio: 0, instances: 0,
    battles: 0, wins: 0, losses: 0, draws: 0, winRate: 0, bestMargin: 0, totalPoints: 0,
    pulls: 0, cardsObtained: 0, urCount: 0,
    stars: 0, starMax: 54, clearedCount: 0, stageCount: 18,
    notices: [], noticeCount: 0, saveSize: '0', createdAt: '',
    legalNote: '', trademarkNote: '', dataSourceLabel: '', reduceMotion: false
  },

  goCollection() { wx.navigateTo({ url: '/pages/collection/collection' }); },
  goBag() { wx.navigateTo({ url: '/pages/bag/bag' }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); },
  goStages() { wx.switchTab({ url: '/pages/stages/stages' }); },
  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); },
  /* 竞技场是非 tab 页，用 navigateTo */
  goArena() { wx.navigateTo({ url: '/pages/arena/arena' }); },
  /* 交易市场（里程碑 3 第二块），同样是非 tab 页 */
  goMarket() { wx.navigateTo({ url: '/pages/market/market' }); },
  goDynasty() { wx.navigateTo({ url: '/pages/dynasty/dynasty' }); },

  /* 改经理名（wx.showModal 的 editable 模式，零依赖） */
  rename() {
    const self = this;
    wx.showModal({
      title: '改个响亮的名号',
      editable: true,
      placeholderText: '最多 12 个字',
      success: function (res) {
        if (!res.confirm) return;
        const name = String(res.content || '').trim().slice(0, 12);
        if (!name) { wx.showToast({ title: '名字不能为空', icon: 'none' }); return; }
        store.dispatch(store.actions.setProfile({ name: name }));
        wx.showToast({ title: '已更名为 ' + name, icon: 'none' });
      }
    });
  },

  clearNotices() {
    if (!this.data.noticeCount) return;
    store.dispatch(store.actions.clearNotices());
    wx.showToast({ title: '动态已清空', icon: 'none', duration: 700 });
  }
}));