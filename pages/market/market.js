/* pages/market/market.js —— 交易市场（第八章「创新玩法」，里程碑 3 第二块）
 * 职责：今日橱窗（买入）/ 出售列表 / 刷新按钮 的展示与交互。
 * 分层：只读 selectors.marketView，只调 store.marketBuy / marketSell / marketRefresh；
 *   货架、价格、可用性与禁售原因全部在 selector 里算好（WXML 零计算，AGENTS §4）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const CONFIG = require('../../config.js');

Page(store.connectPage(function (state) {
  const mv = selectors.marketView(state, Date.now());
  return {
    enabled: mv.enabled,
    goldText: mv.goldText,
    dayKey: mv.dayKey,
    shelfTitle: mv.shelfTitle,
    rerollsText: mv.rerollsText,
    shelf: mv.shelf,
    shelfCount: mv.shelfCount,
    refresh: mv.refresh,
    sellRows: mv.sellRows,
    sellCount: mv.sellCount,
    sellableCount: mv.sellableCount,
    note: mv.note,
    priceNote: mv.priceNote,
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    enabled: true, goldText: '0', dayKey: '', shelfTitle: '', rerollsText: '',
    shelf: [], shelfCount: 0,
    refresh: { cost: 300, costText: '300 金币', buttonText: '刷新 300', can: false, reason: '' },
    sellRows: [], sellCount: 0, sellableCount: 0,
    note: '', priceNote: '', dataSourceLabel: '', reduceMotion: false
  },

  goCollection() { wx.navigateTo({ url: '/pages/collection/collection' }); },
  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); },

  onBuy(e) {
    const cardId = e.currentTarget.dataset.id;
    const row = (this.data.shelf || []).filter(function (r) { return r.cardId === cardId; })[0];
    if (!row) return;
    if (!row.canBuy) { wx.showToast({ title: row.reason || '现在买不了', icon: 'none' }); return; }
    wx.showModal({
      title: '买入 ' + row.name,
      content: row.version + ' · ' + row.priceText + '，立即入库。',
      confirmText: '买入',
      success: function (res) {
        if (!res.confirm) return;
        const out = store.marketBuy(cardId);
        wx.showToast({ title: out && out.ok ? ('已买入 ' + row.name) : ((out && out.reason) || '买入失败'), icon: 'none' });
      }
    });
  },

  onSell(e) {
    const uid = e.currentTarget.dataset.uid;
    const row = (this.data.sellRows || []).filter(function (r) { return r.uid === uid; })[0];
    if (!row) return;
    if (row.disabled) { wx.showToast({ title: row.disabledText || '现在卖不了', icon: 'none' }); return; }
    wx.showModal({
      title: '卖出 ' + row.name,
      content: row.version + ' · Lv.' + row.level + ' ' + row.starText + ' · ' + row.priceText + (row.warnText ? '（' + row.warnText + '）' : ''),
      confirmText: '卖出',
      success: function (res) {
        if (!res.confirm) return;
        const out = store.marketSell(uid);
        wx.showToast({ title: out && out.ok ? ('已卖出 ' + row.name) : ((out && out.reason) || '卖出失败'), icon: 'none' });
      }
    });
  },

  onRefresh() {
    const rf = this.data.refresh || {};
    if (!rf.can) { wx.showToast({ title: rf.reason || '现在不能刷新', icon: 'none' }); return; }
    wx.showModal({
      title: '刷新橱窗',
      content: '花 ' + rf.costText + ' 重掷今日 5 格橱窗。',
      confirmText: '刷新',
      success: function (res) {
        if (!res.confirm) return;
        const out = store.marketRefresh();
        wx.showToast({ title: out && out.ok ? '橱窗已刷新' : ((out && out.reason) || '刷新失败'), icon: 'none' });
      }
    });
  }
}));
