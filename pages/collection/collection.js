/* pages/collection/collection.js —— 图鉴（第十章页面清单「图鉴」）
 * 职责：把 data/players.js 的全部卡牌按稀有度/位置/年代筛选展示，未获得的显示为剪影（第三章容错：绝不空白）。
 * 口径：进度统计走 selectors.collectionProgress，与主页、我的页完全一致（第十二章验收）。
 * 合规：显示名走 selectors.displayName，开启「虚构化名」后自动变成风格化化名（第三章第 7 条兜底）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const players = require('../../data/players.js');
const CONFIG = require('../../config.js');

const P = CONFIG.palette;
const RARITY_FILTERS = ['全部'].concat(CONFIG.rarity.order.slice().reverse());
const POS_FILTERS = ['全部'].concat(CONFIG.roster.slotPositions);
const ERA_FILTERS = ['全部', '现役', '传奇', '新秀', '青训'];
const SORTS = [
  { key: 'rarity', name: '稀有度' },
  { key: 'ovr', name: 'OVR' },
  { key: 'position', name: '位置' }
];

Page(store.connectPage(function (state, self) {
  const local = (self && self.data) || {};
  const fRarity = local.fRarity || '全部';
  const fPos = local.fPos || '全部';
  const fEra = local.fEra || '全部';
  const onlyOwned = !!local.onlyOwned;
  const sortKey = local.sortKey || 'rarity';

  // 每张卡的所有实例（重复卡计数 + 取一个可跳转的 uid）
  const owned = {};
  Object.keys(state.collection).forEach(function (uid) {
    const inst = state.collection[uid];
    if (!inst) return;
    if (!owned[inst.cardId]) owned[inst.cardId] = { count: 0, uid: uid, best: null };
    owned[inst.cardId].count += 1;
    const eff = selectors.effectiveCardOf(state, uid);
    if (eff && (!owned[inst.cardId].best || eff.ovr > owned[inst.cardId].best.ovr)) owned[inst.cardId].best = eff;
  });

  const order = CONFIG.rarity.order;
  let list = players.CARDS
    .filter(function (c) { return fRarity === '全部' || c.rarity === fRarity; })
    .filter(function (c) { return fPos === '全部' || c.position === fPos; })
    .filter(function (c) { return fEra === '全部' || c.era === fEra; })
    .filter(function (c) { return !onlyOwned || !!owned[c.id]; })
    .map(function (c) {
      const o = owned[c.id];
      const eff = o ? o.best : null;
      return {
        cardId: c.id,
        uid: o ? o.uid : '',
        owned: !!o,
        count: o ? o.count : 0,
        name: o ? selectors.displayName(state, c) : '？？？',
        position: c.position,
        version: c.version,
        era: c.era,
        city: o ? selectors.displayCity(state, c) : '？？',
        number: c.number,
        ovr: eff ? eff.ovr : c.ovr,
        rarity: eff ? eff.rarity : c.rarity,
        baseRarity: c.rarity,
        color: P.rarity[c.rarity] || P.rarity.N,
        orderIdx: order.indexOf(c.rarity),
        sortRank: order.indexOf(c.position)
      };
    });

  list.sort(function (a, b) {
    if (sortKey === 'ovr') return b.ovr - a.ovr || b.orderIdx - a.orderIdx;
    if (sortKey === 'position') return a.sortRank - b.sortRank || b.ovr - a.ovr;
    return b.orderIdx - a.orderIdx || b.ovr - a.ovr;
  });

  const progress = selectors.collectionProgress(state);

  return {
    rarityFilters: RARITY_FILTERS,
    posFilters: POS_FILTERS,
    eraFilters: ERA_FILTERS,
    sorts: SORTS,
    fRarity: fRarity, fPos: fPos, fEra: fEra, onlyOwned: onlyOwned, sortKey: sortKey,
    list: list,
    shown: list.length,
    ownedInList: list.filter(function (x) { return x.owned; }).length,
    uniqueOwned: progress.uniqueOwned,
    total: progress.total,
    ratio: Math.round(progress.ratio * 100),
    rarityRows: progress.byRarity.map(function (r) {
      return { rarity: r.rarity, got: r.got, total: r.total };
    }),
    fictionalNames: !!(state.settings && state.settings.fictionalNames),
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    rarityFilters: [], posFilters: [], eraFilters: [], sorts: [],
    fRarity: '全部', fPos: '全部', fEra: '全部', onlyOwned: false, sortKey: 'rarity',
    list: [], shown: 0, ownedInList: 0,
    uniqueOwned: 0, total: 0, ratio: 0, rarityRows: [],
    fictionalNames: false, dataSourceLabel: '', reduceMotion: false,
    panelOpen: false
  },

  resync() { if (this.__syncStore) this.__syncStore(); },

  onRarity(e) { this.setData({ fRarity: e.currentTarget.dataset.v }, this.resync); },
  onPos(e) { this.setData({ fPos: e.currentTarget.dataset.v }, this.resync); },
  onEra(e) { this.setData({ fEra: e.currentTarget.dataset.v }, this.resync); },
  onSort(e) { this.setData({ sortKey: e.currentTarget.dataset.v }, this.resync); },
  toggleOwned() { this.setData({ onlyOwned: !this.data.onlyOwned }, this.resync); },
  togglePanel() { this.setData({ panelOpen: !this.data.panelOpen }); },
  resetFilter() {
    this.setData({ fRarity: '全部', fPos: '全部', fEra: '全部', onlyOwned: false, sortKey: 'rarity' }, this.resync);
  },

  onTapCard(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.uid) {
      wx.showToast({ title: '尚未获得，去招募页碰碰运气', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/detail/detail?uid=' + ds.uid });
  },

  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); }
}));