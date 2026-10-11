/* pages/recruit/recruit.js —— 招募页（Tab 3，第七章 7.1 抽卡 + PRD 保底）
 * 职责：两个卡池（普通招募券 N–SSR / 高级球探券 R–UR）的单抽与十连、概率公示、保底进度、像素翻牌演出。
 * 计费规则：券够就优先用券，不够自动切钻石（页面按钮上直接写清本次要花什么，避免误扣）。
 * 演出约束（第六章动画基调）：翻牌用 scaleY + steps() 逐帧「压扁翻面」，禁用 3D 透视旋转；
 *       SSR/UR 出现时叠加像素抖动（px-shake）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const prd = require('../../utils/prd.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const P = CONFIG.palette;
const FLIP_HALF = 150;   // 翻面动画的中点（ms），此时切换正反面
const STAGGER = 110;     // 「全部翻开」的逐张间隔

/* 概率公示行：把 config 里的基础概率表转成可读文本（合规：公示基础概率） */
function rateRows(pool) {
  return CONFIG.rarity.order.slice().reverse().map(function (r) {
    const p = Number(pool.rates[r]) || 0;
    return { rarity: r, label: CONFIG.rarity.labels[r], pct: p > 0 ? fmt.pct(p, p < 0.01 ? 2 : 1) : '—', zero: p <= 0 };
  });
}

Page(store.connectPage(function (state, self) {
  const local = (self && self.data) || {};
  const poolKey = local.poolKey || 'advanced';
  const pool = CONFIG.gacha.pools[poolKey];
  const pity = selectors.pityView(state);
  const adv = pity.advanced;
  const tickets = Number(state.profile[pool.ticketField]) || 0;
  const diamond = Number(state.profile.diamond) || 0;

  const singleByTicket = tickets >= 1;
  const tenByTicket = tickets >= CONFIG.gacha.tenPull.count;

  return {
    poolKeys: ['normal', 'advanced'],
    poolKey: poolKey,
    poolName: pool.name,
    poolDesc: pool.desc,
    poolTicketName: pool.ticketName,
    rates: rateRows(pool),
    tickets: tickets,
    diamond: diamond,
    diamondText: fmt.numText(diamond),

    singleLabel: singleByTicket ? '单抽 · 券×1' : '单抽 · 钻 ' + pool.singleDiamond,
    tenLabel: tenByTicket ? '十连 · 券×10' : '十连 · 钻 ' + pool.tenDiamond,
    canSingle: singleByTicket || diamond >= pool.singleDiamond,
    canTen: tenByTicket || diamond >= pool.tenDiamond,

    // 保底（高级池 90 抽硬保底 + PRD 递增）
    urPity: adv.urPity,
    hardPity: adv.hardPity,
    hardLeft: adv.hardLeft,
    pityRatio: Math.round((adv.urPity / adv.hardPity) * 100),
    nextUrRate: fmt.pct(adv.nextUrRate, 1),
    baseUrRate: fmt.pct(CONFIG.gacha.pools.advanced.rates.UR, 1),
    totalUr: adv.totalUr,
    advPulls: adv.totalPulls,
    norPulls: pity.normal.totalPulls,
    prdInc: CONFIG.gacha.prd.inc,
    prdNote: 'PRD：每未出 1 次 UR，下次 UR 概率 +' + fmt.pct(CONFIG.gacha.prd.inc, 0) + '，直到出货或触发 ' + adv.hardPity + ' 抽硬保底。',

    history: pity.history.slice(0, 12).map(function (h) {
      return { uid: h.uid, cardId: h.cardId, name: h.name, rarity: h.rarity, color: P.rarity[h.rarity] || P.rarity.N, at: fmt.fromNow(h.at, Date.now()), forced: h.forced };
    }),

    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    poolKeys: [], poolKey: 'advanced', poolName: '', poolDesc: '', poolTicketName: '',
    rates: [], tickets: 0, diamond: 0, diamondText: '0',
    singleLabel: '', tenLabel: '', canSingle: false, canTen: false,
    urPity: 0, hardPity: 90, hardLeft: 90, pityRatio: 0, nextUrRate: '0%', baseUrRate: '0%',
    totalUr: 0, advPulls: 0, norPulls: 0, prdInc: 0.02, prdNote: '',
    history: [], reduceMotion: false,
    // 演出态（不进 Store）
    resultOpen: false,
    resultCards: [],
    revealedAll: false,
    bestRarity: '',
    guaranteeText: '',
    busy: false,
    rateOpen: false
  },

  onLoad(options) {
    if (options && options.pool && CONFIG.gacha.pools[options.pool]) {
      this.setData({ poolKey: options.pool }, this.resync);
    }
  },

  resync() { if (this.__syncStore) this.__syncStore(); },

  switchPool(e) {
    const key = e.currentTarget.dataset.key;
    if (!CONFIG.gacha.pools[key] || key === this.data.poolKey) return;
    this.setData({ poolKey: key }, this.resync);
  },

  toggleRates() { this.setData({ rateOpen: !this.data.rateOpen }); },

  /* ---------- 抽卡 ---------- */
  doPull(e) {
    const count = Number(e.currentTarget.dataset.count) === 10 ? 10 : 1;
    this.pull(count);
  },

  pull(count) {
    if (this.data.busy) return;
    const poolKey = this.data.poolKey;
    const pool = CONFIG.gacha.pools[poolKey];
    const tickets = Number(store.getState().profile[pool.ticketField]) || 0;
    const useTicket = tickets >= count;

    this.setData({ busy: true });
    const res = store.pull({ poolKey: poolKey, count: count, useTicket: useTicket });
    if (!res || !res.ok) {
      this.setData({ busy: false });
      wx.showToast({ title: (res && res.reason) || '招募失败', icon: 'none' });
      return;
    }

    // 从 Store 的历史记录里取回本次新卡的 uid（命令层返回的 uid 为 null）
    const history = store.getState().gacha.history.slice(0, count).slice().reverse();
    const order = CONFIG.rarity.order;
    let best = 'N';
    const cards = res.results.map(function (r, i) {
      if (order.indexOf(r.rarity) > order.indexOf(best)) best = r.rarity;
      return {
        idx: i,
        uid: history[i] ? history[i].uid : '',
        cardId: r.cardId,
        name: r.name,
        position: r.position,
        number: r.number,
        version: r.version,
        ovr: r.ovr,
        rarity: r.rarity,
        color: P.rarity[r.rarity] || P.rarity.N,
        forced: !!r.forced,
        flipped: false,
        flipping: false
      };
    });

    this.setData({
      busy: false,
      resultOpen: true,
      resultCards: cards,
      revealedAll: false,
      bestRarity: best,
      guaranteeText: res.guaranteeApplied ? '十连保底生效：至少一张 SR 以上' : ''
    });

    // 单抽直接翻开；十连留给玩家点（也可一键全翻）
    if (count === 1) this.revealIndex(0);
  },

  /* 逐帧翻面：先播压扁动画，到中点切换正面 */
  revealIndex(i) {
    const self = this;
    const cards = this.data.resultCards;
    if (!cards[i] || cards[i].flipped || cards[i].flipping) return;
    this.setData({ ['resultCards[' + i + '].flipping']: true });
    setTimeout(function () {
      self.setData({
        ['resultCards[' + i + '].flipping']: false,
        ['resultCards[' + i + '].flipped']: true
      });
      self.checkAllRevealed();
    }, this.data.reduceMotion ? 0 : FLIP_HALF);
  },

  onCardTap(e) {
    this.revealIndex(Number(e.currentTarget.dataset.idx));
  },

  revealAll() {
    const self = this;
    const n = this.data.resultCards.length;
    for (let i = 0; i < n; i++) {
      (function (k) { setTimeout(function () { self.revealIndex(k); }, k * (self.data.reduceMotion ? 0 : STAGGER)); })(i);
    }
  },

  checkAllRevealed() {
    const all = this.data.resultCards.every(function (c) { return c.flipped; });
    if (all && !this.data.revealedAll) {
      this.setData({ revealedAll: true });
      const best = this.data.bestRarity;
      if (best === 'UR' || best === 'SSR') {
        wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
      }
    }
  },

  closeResult() {
    if (this.__timers) { this.__timers.forEach(clearTimeout); this.__timers = null; }
    this.setData({ resultOpen: false, resultCards: [], revealedAll: false });
  },

  goDetail(e) {
    const uid = e.currentTarget.dataset.uid;
    if (!uid) return;
    wx.navigateTo({ url: '/pages/detail/detail?uid=' + uid });
  },

  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); }
}));