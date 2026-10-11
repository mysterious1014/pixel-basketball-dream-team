/* pages/bag/bag.js —— 背包 / 时刻卡 / 竞技商城 / 目标（第十章页面清单「背包/商城/任务」）
 * 职责：查看并使用消耗品、查看装备与碎片、查看名场面时刻卡图鉴、在竞技商城花竞技币、展示目标清单。
 * 里程碑 2 变化：「商城」从**可见不可买的诚实占位**升级为真正的竞技商城（竞技币消费出口），
 *           时刻卡只能在这里兑换（data/shop.js 的裁决：天梯独占奖励）。
 * 里程碑 4 变化：钻石商店从「诚实占位」转正为补给直购；「目标」分页升级为「任务」分页
 *           （每日任务 + 经理目标）。任何界面不得出现空白或破图（第三章容错精神）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const itemsData = require('../../data/items.js');
const stagesData = require('../../data/stages.js');
const players = require('../../data/players.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const P = CONFIG.palette;
const TABS = [
  { key: 'material', name: '材料' },
  { key: 'equip', name: '装备' },
  { key: 'moment', name: '时刻卡' },
  { key: 'shop', name: '竞技商城' },
  { key: 'goal', name: '任务' }
];
const ATTR_LABELS = CONFIG.attrs.labels;

function bonusText(bonus) {
  const keys = Object.keys(bonus || {});
  if (!keys.length) return '无加成';
  return keys.map(function (k) { return (ATTR_LABELS[k] || k) + ' +' + bonus[k]; }).join(' · ');
}

/* MVP 目标清单：全部从 Store 现算，完成即打勾（给零氪玩家一条清晰的养成路径） */
function goalsOf(state, momentGot, momentWorn) {
  const progress = selectors.collectionProgress(state);
  const roster = selectors.rosterView(state);
  const lvUpDone = Object.keys(state.collection).some(function (uid) {
    const i = state.collection[uid];
    return i.level > 1 || i.stars > 1 || i.breakthrough > 0;
  });
  const equipped = Object.keys(state.collection).some(function (uid) {
    const e = state.collection[uid].equipment || {};
    return !!(e.shoes || e.wrist || e.head);
  });
  return [
    { key: 'g1', text: '完成一次招募', done: state.stats.pulls > 0, tip: '招募页 → 单抽或十连' },
    { key: 'g2', text: '排满 5 名首发且不超工资帽', done: roster.ready, tip: '阵容页 → 一键最强' },
    { key: 'g3', text: '赢下一场赛季征程', done: state.stats.wins > 0, tip: '比赛页 → 出战' },
    { key: 'g4', text: '通关第一章 BOSS', done: !!((state.season.cleared || {})['s1-6'] && state.season.cleared['s1-6'].result === 'win'), tip: '关卡 1-6' },
    { key: 'g5', text: '收集 10 张不同卡牌', done: progress.uniqueOwned >= 10, tip: '当前 ' + progress.uniqueOwned + '/' + players.COUNT },
    { key: 'g6', text: '获得一张 SSR 或更高', done: Object.keys(state.collection).some(function (uid) {
      const c = players.getCard(state.collection[uid].cardId);
      return !!c && CONFIG.rarity.order.indexOf(c.rarity) >= CONFIG.rarity.order.indexOf('SSR');
    }), tip: '高级球探更容易出' },
    { key: 'g7', text: '养成任意一名球员', done: lvUpDone, tip: '详情页 → 升级/升星/突破' },
    { key: 'g8', text: '给球员穿上一件装备', done: equipped, tip: '详情页 → 装备槽' },
    { key: 'g9', text: '拿到 3 星评价', done: Object.keys(state.season.cleared || {}).some(function (k) { return state.season.cleared[k].stars >= 3; }), tip: '净胜 ' + CONFIG.season.starThresholds[2] + ' 分以上' },
    { key: 'g10', text: '打满 10 场比赛', done: state.stats.battles >= 10, tip: '当前 ' + state.stats.battles + '/10' },
    /* 里程碑 2 新增：把玩家引到「打天梯 → 攒竞技币 → 换时刻卡 → 戴上去」这条新循环上 */
    { key: 'g11', text: '赢下一场竞技场天梯', done: Number((state.arena || {}).wins) > 0, tip: '我的页 / 主页 → 竞技场' },
    { key: 'g12', text: '兑换一张名场面时刻卡', done: momentGot > 0, tip: '本页 → 竞技商城' },
    { key: 'g13', text: '给球员戴上一张时刻卡', done: momentWorn > 0, tip: '详情页 → 时刻卡槽' }
  ];
}

Page(store.connectPage(function (state, self) {
  const local = (self && self.data) || {};
  const tab = local.tab || 'material';
  const bag = selectors.bagView(state);
  /* 时刻卡图鉴（第八章，里程碑 2）：全部卡 + 持有/佩戴状态，数字全部来自 selectors，页面不自算。
   * 必须在 goalsOf 之前算好 —— 目标清单里有两条要读它（AGENTS.md §4：预计算都在 .js 里做完）。 */
  const moments = selectors.momentCatalog(state);
  const momentGot = moments.got;
  const momentWorn = moments.rows.filter(function (r) { return r.wornCount > 0; }).length;
  const goals = goalsOf(state, momentGot, momentWorn);

  const materials = itemsData.CONSUMABLES.map(function (it) {
    const count = it.id === 'shard' ? bag.shard : (Number(state.bag[it.id]) || 0);
    return {
      id: it.id, name: it.name, desc: it.desc, count: count, rarity: it.rarity,
      color: P.rarity[it.rarity] || P.rarity.N,
      usable: count > 0 && it.type !== 'material',
      typeText: it.type === 'stamina' ? ('体力 +' + it.value) : (it.type === 'gold' ? ('金币 +' + fmt.numText(it.value)) : (it.type === 'ticket' ? '招募券 +1' : '养成材料'))
    };
  });

  const equipment = itemsData.EQUIPMENT.map(function (it) {
    const count = Number(state.bag[it.id]) || 0;
    return {
      id: it.id, name: it.name, slot: it.slot, slotName: (itemsData.SLOTS[it.slot] || {}).name || it.slot,
      rarity: it.rarity, color: P.rarity[it.rarity] || P.rarity.N,
      bonusText: bonusText(it.bonus), desc: it.desc, count: count, owned: count > 0,
      price: it.price
    };
  }).sort(function (a, b) { return (b.count - a.count) || (CONFIG.rarity.order.indexOf(b.rarity) - CONFIG.rarity.order.indexOf(a.rarity)); });

  const shop = itemsData.CONSUMABLES.filter(function (it) { return it.price; }).map(function (it) {
    const cur = it.currency === 'diamond' ? '钻石' : '金币';
    return { id: it.id, name: it.name, desc: it.desc, price: it.price, currency: cur, rarity: it.rarity };
  });

  const equippedCount = Object.keys(state.collection).filter(function (uid) {
    const e = state.collection[uid].equipment || {};
    return !!(e.shoes || e.wrist || e.head);
  }).length;

  /* 竞技商城（里程碑 2 消费出口）：canBuy / buyText / limitText 都在 selectors.shopView 里算好了，
   * 页面只渲染 —— WXML 不写三元嵌套（AGENTS.md §4）。 */
  const arenaShop = selectors.shopView(state);

  /* 钻石商店（里程碑 4）：条目 / canBuy / 文案都由 selectors.diamondShopView 算好，页面只渲染 */
  const diamondShop = selectors.diamondShopView(state);
  /* 每日任务（里程碑 4）：进度 / 完成态 / 奖励文案都由 selectors.dailyView 算好 */
  const daily = selectors.dailyView(state, Date.now());

  return {
    tabs: TABS,
    tab: tab,
    materials: materials,
    equipment: equipment,
    shop: shop,
    moments: moments.rows,
    momentTotal: moments.total,
    momentGot: moments.got,
    momentProgressText: moments.progressText,
    momentEnabled: moments.enabled,
    momentWorn: momentWorn,
    momentInBag: bag.momentCount,
    arenaShop: arenaShop,
    diamondShop: diamondShop,
    daily: daily,
    arenaCoin: arenaShop.coin,
    arenaCoinText: arenaShop.coinText,
    goals: goals,
    goalDone: goals.filter(function (g) { return g.done; }).length,
    goalTotal: goals.length,
    shard: bag.shard,
    equipKinds: equipment.filter(function (e) { return e.count > 0; }).length,
    equippedCount: equippedCount,
    goldText: fmt.numText(state.profile.gold),
    diamondText: fmt.numText(state.profile.diamond),
    ticketNormal: Number(state.profile.ticketNormal) || 0,
    ticketAdvanced: Number(state.profile.ticketAdvanced) || 0,
    cardCount: Object.keys(state.collection).length,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    tabs: [], tab: 'material', materials: [], equipment: [], shop: [],
    moments: [], momentTotal: 0, momentGot: 0, momentProgressText: '', momentEnabled: true, momentWorn: 0, momentInBag: 0,
    arenaShop: { enabled: true, groups: [], coin: 0, coinText: '0 竞技币', currencyName: '竞技币', incomeText: '', note: '', entryCount: 0 },
    daily: { enabled: true, dayKey: '', missions: [], doneCount: 0, count: 0, doneText: '0 / 0', note: '' },
    diamondShop: { items: [], diamond: 0, gold: 0, note: '' },
    arenaCoin: 0, arenaCoinText: '0 竞技币',
    goals: [],
    goalDone: 0, goalTotal: 0, shard: 0, equipKinds: 0, equippedCount: 0,
    goldText: '0', diamondText: '0', ticketNormal: 0, ticketAdvanced: 0, cardCount: 0, reduceMotion: false
  },

  onLoad(options) {
    if (options && options.tab) this.setData({ tab: options.tab }, this.resync);
  },

  /* 每次进入页面滚一次每日任务（跨天时把「昨天」落库重置；未跨天则是 no-op） */
  onShow() { store.dailySync(); },

  resync() { if (this.__syncStore) this.__syncStore(); },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.tab) return;
    this.setData({ tab: key }, this.resync);
  },

  onUse(e) {
    const id = e.currentTarget.dataset.id;
    const res = store.useItem(id, 1);
    if (res && res.ok) wx.showToast({ title: '已使用', icon: 'none', duration: 800 });
    else wx.showToast({ title: (res && res.reason) || '无法使用', icon: 'none' });
  },

  onEquipHint() {
    wx.showModal({
      title: '装备怎么穿？',
      content: '装备需要在球员详情页穿戴：图鉴 → 选一名球员 → 装备栏点对应槽位即可。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  goCollection() { wx.navigateTo({ url: '/pages/collection/collection' }); },
  goStages() { wx.switchTab({ url: '/pages/stages/stages' }); },
  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); },

  /* 钻石商店购买（里程碑 4）：补给直购。命令层是唯一的闸（余额 / 上架 / 货币口径），
   * 不可买时 toast 原因，可买时二次确认后派发（与竞技商城同一条交互）。 */
  onBuyConsumable(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '该商品';
    const priceText = e.currentTarget.dataset.price || '';
    const canBuy = e.currentTarget.dataset.can === 'true' || e.currentTarget.dataset.can === true;
    if (!canBuy) {
      wx.showToast({ title: e.currentTarget.dataset.why || '当前无法购买', icon: 'none' });
      return;
    }
    const self = this;
    wx.showModal({
      title: '确认购买',
      content: '花 ' + priceText + ' 购买「' + name + '」？',
      confirmText: '购买',
      cancelText: '再想想',
      success(res) {
        if (!res.confirm) return;
        const r = store.buyConsumable(id);
        if (r && r.ok) wx.showToast({ title: '已购买 ' + r.name, icon: 'none', duration: 1200 });
        else wx.showToast({ title: (r && r.reason) || '购买失败', icon: 'none' });
        self.resync();
      }
    });
  },

  /* 竞技商城兑换（里程碑 2）。
   * 命令层是唯一的闸：余额 / 限购 / 开关都在 commands.buyArenaItem 里判，
   * 页面只做两件事 —— 不可买时把原因 toast 出来，可买时二次确认后派发。
   * 二次确认是刻意的：竞技币只能靠打天梯攒，误触一下就是好几天的进度。 */
  onBuy(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '该商品';
    const price = Number(e.currentTarget.dataset.price) || 0;
    const canBuy = e.currentTarget.dataset.can === 'true' || e.currentTarget.dataset.can === true;
    if (!canBuy) {
      wx.showToast({ title: e.currentTarget.dataset.why || '当前无法兑换', icon: 'none' });
      return;
    }
    const self = this;
    wx.showModal({
      title: '确认兑换',
      content: '花 ' + price + ' ' + this.data.arenaShop.currencyName + ' 兑换「' + name + '」？',
      confirmText: '兑换',
      cancelText: '再想想',
      success(res) {
        if (!res.confirm) return;
        const r = store.buyArenaItem(id);
        if (r && r.ok) {
          wx.showToast({ title: '已兑换 ' + r.name, icon: 'none', duration: 1200 });
          self.resync();
        } else {
          wx.showToast({ title: (r && r.reason) || '兑换失败', icon: 'none' });
          self.resync();
        }
      }
    });
  },

  /* 时刻卡佩戴入口：与装备同一条路径（图鉴 → 详情页 → 槽位），不在这个页面直接戴。
   * 原因：时刻卡是**随身**的，必须先选定戴到哪名球员，背包页没有「当前球员」这个上下文。 */
  onMomentHint() {
    const inBag = this.data.momentInBag;
    wx.showModal({
      title: '时刻卡怎么戴？',
      content: inBag > 0
        ? '背包里有 ' + inBag + ' 张时刻卡：图鉴 → 选一名球员 → 详情页「名场面时刻卡」槽位点击即可佩戴。一场比赛内触发，不改属性面板。'
        : '先去「竞技商城」用竞技币兑换时刻卡，再到球员详情页的「名场面时刻卡」槽位佩戴。竞技币只能靠打天梯获得。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  goArena() { wx.navigateTo({ url: '/pages/arena/arena' }); }
}));