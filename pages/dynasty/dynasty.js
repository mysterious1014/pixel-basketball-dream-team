/* pages/dynasty/dynasty.js —— 王朝赛季 & 赛季通行证（第八章「创新玩法」，里程碑 3 第三块）
 * 职责：赛季概览（积分 / 等级 / 剩余天数）、赛季任务列表、通行证两轨领奖、王朝轨解锁。
 * 分层：只读 selectors.dynastyView，只调 store.dynastySync / claimDynastyReward / unlockDynastyPremium；
 *   可领与否 / 进度 / 文案全部在 selector 里算好（WXML 零计算，AGENTS §4）。
 * 跨窗滚动：onShow 调 dynastySync() 把「已过期但还没落库」的赛季真正滚动掉（视图层已有虚拟滚动兜底）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const CONFIG = require('../../config.js');

Page(store.connectPage(function (state) {
  const dv = selectors.dynastyView(state, Date.now());
  return {
    enabled: dv.enabled,
    seasonTitle: dv.seasonTitle,
    daysLeftText: dv.daysLeftText,
    pointsText: dv.pointsText,
    levelText: dv.levelText,
    progress: dv.progress,
    premium: dv.premium,
    premiumCost: dv.premiumCost,
    premiumBtnText: dv.premiumBtnText,
    premiumCan: dv.premiumCan,
    premiumReason: dv.premiumReason,
    missions: dv.missions,
    missionDone: dv.missionDone,
    missionCount: dv.missionCount,
    rows: dv.rows,
    rowCount: dv.rowCount,
    claimableCount: dv.claimableCount,
    claimableText: dv.claimableText,
    incomeText: dv.incomeText,
    note: dv.note,
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    enabled: true, seasonTitle: '', daysLeftText: '', pointsText: '0', levelText: 'Lv.0',
    progress: { into: 0, need: 400, ratio: 0, text: '0 / 400', toNextText: '' },
    premium: false, premiumCost: 0, premiumBtnText: '', premiumCan: false, premiumReason: '',
    missions: [], missionDone: 0, missionCount: 0,
    rows: [], rowCount: 0, claimableCount: 0, claimableText: '',
    incomeText: '', note: '', dataSourceLabel: '', reduceMotion: false
  },

  /* 进页面先滚一次赛季窗口（纯函数判断；没跨窗时命令直接返回、不派发） */
  onShow() { store.dynastySync(); },
  goStages() { wx.switchTab({ url: '/pages/stages/stages' }); },
  goArena() { wx.navigateTo({ url: '/pages/arena/arena' }); },

  onClaim(e) {
    const level = Number(e.currentTarget.dataset.level) || 0;
    const track = e.currentTarget.dataset.track;
    const cell = this.__cellOf(level, track);
    if (!cell || !cell.claimable) { wx.showToast({ title: '现在还不能领', icon: 'none' }); return; }
    wx.showModal({
      title: '领取 Lv.' + level + ' 奖励',
      content: cell.text + (track === 'premium' ? '（王朝轨）' : '（免费轨）'),
      confirmText: '领取',
      success: function (res) {
        if (!res.confirm) return;
        const out = store.claimDynastyReward(level, track);
        wx.showToast({ title: out && out.ok ? ('已领取 ' + out.rewardText) : ((out && out.reason) || '领取失败'), icon: 'none' });
      }
    });
  },

  onUnlockPremium() {
    if (!this.data.premiumCan) { wx.showToast({ title: this.data.premiumReason || '现在不能解锁', icon: 'none' }); return; }
    const cost = this.data.premiumCost;
    wx.showModal({
      title: '解锁王朝轨',
      content: '花 ' + cost + ' 钻石解锁本赛季王朝轨奖励（有效期至本赛季结束，下赛季需重新解锁）。',
      confirmText: '解锁',
      success: function (res) {
        if (!res.confirm) return;
        const out = store.unlockDynastyPremium();
        wx.showToast({ title: out && out.ok ? '王朝轨已解锁' : ((out && out.reason) || '解锁失败'), icon: 'none' });
      }
    });
  },

  __cellOf(level, track) {
    const row = (this.data.rows || []).filter(function (r) { return r.level === level; })[0];
    if (!row) return null;
    return track === 'premium' ? row.premium : row.free;
  }
}));
