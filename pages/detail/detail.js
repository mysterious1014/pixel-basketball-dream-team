/* pages/detail/detail.js —— 卡牌详情页（第十章「详情页（Canvas 六维雷达图）」）
 * 职责：单卡的完整面板 —— 立绘/OVR/稀有度/薪资、六维雷达图、19 项属性明细、
 *       养成四条线（升级 / 升星 / 突破 / 装备）、同名卡计数、同球员其它版本、一键编入阵容。
 * 口径：属性与 OVR 全部来自 selectors.effectiveCardOf（= utils/growth.effectiveCard），
 *       雷达图只吃 utils/radar.js 归并出的 6 维，绝不本页自己算（第十二章验收）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const players = require('../../data/players.js');
const itemsData = require('../../data/items.js');
const growth = require('../../utils/growth.js');
const radarUtil = require('../../utils/radar.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const P = CONFIG.palette;
const POSITIONS = CONFIG.roster.slotPositions;
const ATTR_KEYS = CONFIG.attrs.keys;
const ATTR_LABELS = CONFIG.attrs.labels;
/* 19 项属性的分组展示顺序（把同类放一起，长列表也好读） */
const ATTR_GROUPS = [
  { name: '进攻', keys: ['inside', 'mid', 'three', 'dunk', 'ft'] },
  { name: '组织', keys: ['handle', 'pass', 'offIQ'] },
  { name: '篮板', keys: ['oreb', 'dreb'] },
  { name: '防守', keys: ['steal', 'block', 'defIQ'] },
  { name: '身体', keys: ['speed', 'accel', 'strength', 'vertical'] },
  { name: '潜力', keys: ['stamina', 'potential'] }
];

function bonusText(bonus) {
  const keys = Object.keys(bonus || {});
  if (!keys.length) return '无加成';
  return keys.map(function (k) { return (ATTR_LABELS[k] || k) + ' +' + bonus[k]; }).join(' · ');
}

Page(store.connectPage(function (state, self) {
  const local = (self && self.data) || {};
  const uid = local.uid || '';
  const card = uid ? selectors.effectiveCardOf(state, uid) : null;
  if (!card) {
    return { missing: true, uid: uid, reduceMotion: !!(state.settings && state.settings.reduceMotion) };
  }
  const def = players.getCard(card.cardId);
  const sheet = local.sheet || '';
  // 弹层开关预计算：WXML 表达式不支持方法调用，这里先算好布尔值
  const equipOpen = sheet.indexOf('equip-') === 0;
  const equipSlot = equipOpen ? sheet.slice('equip-'.length) : '';
  const equipSlotName = equipOpen ? ((itemsData.SLOTS[equipSlot] || {}).name || '') : '';
  /* 名场面时刻卡槽（第八章，里程碑 2）：与装备同一套交互（点槽位 → 弹层选背包里的卡）。
   * 字段全部来自 selectors.momentView，页面不自己判断能不能戴（AGENTS.md §3：页面不放业务规则）。
   * 这里刻意把嵌套结构**摊平**成一层字段：WXML 不支持方法调用与深层三元，摊平后模板只剩 {{ }} 取值。 */
  const momentOpen = sheet === 'moment';
  const mv = selectors.momentView(state, uid);
  const momentCur = mv.current;

  // 19 项属性：基础值 / 养成后有效值 / 加成差
  const groups = ATTR_GROUPS.map(function (g) {
    return {
      name: g.name,
      rows: g.keys.map(function (k) {
        const base = def.attrs[k];
        const eff = card.attrs[k];
        return {
          key: k,
          label: ATTR_LABELS[k] || k,
          base: base,
          value: eff,
          delta: eff - base,
          deltaText: eff - base > 0 ? ('+' + (eff - base)) : '',
          pct: Math.round((eff / CONFIG.attrs.max) * 100)
        };
      })
    };
  });

  // 雷达图（第十章映射表）
  const radarValues = radarUtil.toValues(card.attrs);
  const radarRows = radarUtil.toRadar(card.attrs).map(function (d) {
    return { key: d.key, label: d.label, value: d.value };
  });

  // 养成：等级
  const lvCost = growth.levelUpCost(card.level);
  const lvMaxed = card.level >= growth.limits.levelMax;
  // 养成：升星
  const starNeed = growth.starUpCost(card.stars);
  const dups = selectors.duplicatesOf(state, card.cardId).filter(function (u) { return u !== uid; });
  const starMaxed = card.stars >= growth.limits.starMax;
  // 养成：突破
  const brCost = growth.breakCost(card.breakthrough);
  const brMaxed = !brCost;
  const shard = Number(state.bag.shard) || 0;
  const gold = Number(state.profile.gold) || 0;

  // 装备三槽
  const slots = ['shoes', 'wrist', 'head'].map(function (s) {
    const meta = itemsData.SLOTS[s];
    const id = (card.equipment || {})[s];
    const item = id ? itemsData.getItem(id) : null;
    return {
      slot: s,
      slotName: meta.name,
      itemId: id || '',
      itemName: item ? item.name : '空',
      rarity: item ? item.rarity : '',
      bonusText: item ? bonusText(item.bonus) : '未穿戴',
      empty: !item
    };
  });

  // 装备弹层候选（背包里对应槽位的装备）
  let equipOptions = [];
  if (equipOpen) {
    equipOptions = itemsData.equipmentOf(equipSlot).filter(function (it) {
      return (Number(state.bag[it.id]) || 0) > 0;
    }).map(function (it) {
      return { id: it.id, name: it.name, rarity: it.rarity, count: Number(state.bag[it.id]) || 0, bonusText: bonusText(it.bonus), desc: it.desc };
    });
  }

  // 编入阵容弹层：12 个位置
  let rosterSlots = [];
  if (sheet === 'roster') {
    for (let i = 0; i < POSITIONS.length; i++) {
      const cur = state.roster.starters[i];
      const c = cur ? selectors.effectiveCardOf(state, cur) : null;
      rosterSlots.push({
        slot: 'starters', index: i, position: POSITIONS[i], label: '首发 ' + POSITIONS[i],
        uid: cur || '', name: c ? c.displayName : '空缺', ovr: c ? c.ovr : 0,
        matched: !c || c.position === POSITIONS[i], current: cur === uid
      });
    }
    for (let i = 0; i < CONFIG.roster.benchCount; i++) {
      const cur = state.roster.bench[i];
      const c = cur ? selectors.effectiveCardOf(state, cur) : null;
      rosterSlots.push({
        slot: 'bench', index: i, position: '', label: '替补 ' + (i + 1),
        uid: cur || '', name: c ? c.displayName : '空缺', ovr: c ? c.ovr : 0,
        matched: true, current: cur === uid
      });
    }
  }

  // 同球员其它版本 + 时空进化视图（第八章「创新玩法」，里程碑 3）
  /* 时空进化的全部数字（进度 / 三条命令的可用性 / 分解候选行）来自 selectors.evolutionView，
   * 页面只做「摊平 + 组装卡片视图」，不自己判断能不能分解 / 献祭 / 合成（AGENTS.md §3）。 */
  const evo = selectors.evolutionView(state, def.playerId);
  const evoMeta = {};
  evo.versionRows.forEach(function (r) { evoMeta[r.cardId] = r; });
  const versions = players.cardsOfPlayer(def.playerId).map(function (v) {
    const mine = Object.keys(state.collection).filter(function (u) { return state.collection[u].cardId === v.id; });
    const eff = mine[0] ? selectors.effectiveCardOf(state, mine[0]) : null;
    const meta = evoMeta[v.id] || {};
    return {
      cardId: v.id, uid: mine[0] || '', version: v.version,
      owned: mine.length > 0, count: mine.length,
      valueText: meta.valueText || '', peak: !!meta.peak,
      color: P.rarity[v.rarity] || P.rarity.N, self: v.id === def.id,
      // 直接喂给 components/player-card（未获得时组件自动渲染剪影，不会破图）
      card: {
        cardId: v.id,
        displayName: eff ? eff.displayName : selectors.displayName(state, v),
        position: v.position,
        ovr: eff ? eff.ovr : v.ovr,
        rarity: eff ? eff.rarity : v.rarity,
        level: eff ? eff.level : 1
      }
    };
  });

  const si = state.roster.starters.indexOf(uid);
  const bi = state.roster.bench.indexOf(uid);

  return {
    missing: false,
    uid: uid,
    sheet: sheet,
    cardId: card.cardId,
    playerId: card.playerId,
    name: card.displayName,
    city: card.displayCity,
    team: card.team,
    number: card.number,
    position: card.position,
    version: card.version,
    era: card.era,
    draft: def.draft || 0,
    signature: def.signature || '',
    tags: def.tags || [],
    academy: !!def.academy,

    ovr: card.ovr,
    baseOvr: card.baseOvr,
    rarity: card.rarity,
    baseRarity: card.baseRarity,
    color: P.rarity[card.rarity] || P.rarity.N,
    salaryText: fmt.salaryText(card.salary),
    baseSalaryText: fmt.salaryText(card.baseSalary),
    level: card.level,
    stars: card.stars,
    starText: new Array(card.stars + 1).join('★'),
    breakthrough: card.breakthrough,
    bonus: card.bonus,
    dups: dups.length,

    radarValues: radarValues,
    radarRows: radarRows,
    groups: groups,

    lvCost: lvCost,
    lvCostText: fmt.numText(lvCost),
    lvMaxed: lvMaxed,
    canLevel: !lvMaxed && gold >= lvCost,
    levelMax: growth.limits.levelMax,

    starNeed: starNeed,
    starMaxed: starMaxed,
    canStar: !starMaxed && dups.length >= starNeed,
    starMax: growth.limits.starMax,

    brCost: brCost,
    brCostText: brCost ? (fmt.numText(brCost.gold) + ' 金币 + ' + brCost.shard + ' 碎片') : '已满突破',
    brMaxed: brMaxed,
    canBreak: !!brCost && gold >= brCost.gold && shard >= brCost.shard,
    breakMax: growth.limits.breakMax,
    shard: shard,
    goldText: fmt.numText(gold),

    /* 时刻卡槽（摊平后的一层字段） */
    momentOpen: momentOpen,
    momentEnabled: mv.enabled,
    momentSlotName: mv.slotLabel,
    momentName: momentCur ? momentCur.name : '空',
    momentRarity: momentCur ? momentCur.rarity : '',
    momentHas: !!momentCur,
    momentEffectText: mv.currentText,
    momentEffectLines: momentCur ? momentCur.effectLines : [],
    momentDesc: momentCur ? momentCur.desc : '',
    momentOptions: mv.owned,
    momentOptionCount: mv.ownedCount,
    momentEmptyText: mv.emptyText,
    momentHint: mv.hint,

    /* 时空进化（里程碑 3）：全部字段来自 selectors.evolutionView，页面零计算 */
    evoEvolvable: evo.evolvable,
    evoEnabled: evo.enabled,
    evoOwned: evo.owned,
    evoShards: evo.shards,
    evoCost: evo.cost,
    evoProgressText: evo.progressText,
    evoMissingText: evo.missingText,
    evoPeakName: evo.peakName,
    evoPeakRarity: evo.peakRarity,
    evoOwnedText: evo.owned ? ('已拥有 ×' + evo.ownCount) : '巅峰版尚未获得',
    evoPairOk: evo.pair.possible,
    evoPairText: evo.pair.text,
    evoPairReason: evo.pair.reason,
    evoPairGain: evo.pair.gain,
    evoSynthOk: evo.synth.possible,
    evoSynthReason: evo.synth.reason,
    evoSynthBtnText: evo.owned ? '已合成巅峰版' : ('合成巅峰版（' + evo.cost + ' 碎片）'),
    evoSalvageOk: evo.salvage.possible,
    evoSalvageText: '分解版本卡' + (evo.salvage.candidates ? ('（' + evo.salvage.candidates + ' 张可分解）') : ''),
    evoNote: evo.note,
    evoSheetOpen: sheet === 'evo',
    evoRows: evo.rows,
    evoRowCount: evo.rows.length,

    slots: slots,
    equipOpen: equipOpen,
    equipSlot: equipSlot,
    equipSlotName: equipSlotName,
    equipItemId: (card.equipment || {})[equipSlot] || '',
    equipOptions: equipOptions,
    rosterSlots: rosterSlots,
    versions: versions,
    /* 这名球员参与的点名羁绊（宿敌 / 连线），驱动「为了开羁绊去集卡」 */
    bondLinks: selectors.bondsOfPlayer(state, def.playerId),

    inRoster: si !== -1 || bi !== -1,
    rosterLabel: si !== -1 ? ('首发 ' + POSITIONS[si]) : (bi !== -1 ? ('替补 ' + (bi + 1)) : '未上场'),
    positionMatched: si === -1 || card.position === POSITIONS[si],

    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    missing: false, uid: '', playerId: '', sheet: '',
    cardId: '', name: '', city: '', team: '', number: 0, position: '', version: '', era: '',
    draft: 0, signature: '', tags: [], academy: false,
    ovr: 0, baseOvr: 0, rarity: 'N', baseRarity: 'N', color: '#9aa4b8',
    salaryText: '0 万', baseSalaryText: '0 万',
    level: 1, stars: 1, starText: '★', breakthrough: 0, bonus: 0, dups: 0,
    radarValues: [], radarRows: [], groups: [],
    lvCost: 0, lvCostText: '0', lvMaxed: false, canLevel: false, levelMax: 20,
    starNeed: 0, starMaxed: false, canStar: false, starMax: 5,
    brCost: null, brCostText: '', brMaxed: false, canBreak: false, breakMax: 3, shard: 0, goldText: '0',
    slots: [], equipOpen: false, equipSlot: '', equipSlotName: '', equipItemId: '',
    /* 时刻卡字段的默认值必须与 mapState 返回**同时**存在（AGENTS.md §4）：
     * 缺了首屏就是 undefined，K 组「WXML 字段都有来源」会红。 */
    momentOpen: false, momentEnabled: true, momentSlotName: '名场面时刻卡',
    momentName: '空', momentRarity: '', momentHas: false, momentEffectText: '未佩戴',
    momentEffectLines: [], momentDesc: '', momentOptions: [], momentOptionCount: 0,
    momentEmptyText: '', momentHint: '',
    /* 时空进化字段的默认值必须与 mapState 返回**同时**存在（AGENTS.md §4）：缺了首屏就是
     * undefined，K 组「WXML 字段都有来源」会红。 */
    evoEvolvable: false, evoEnabled: true, evoOwned: false, evoShards: 0, evoCost: 0,
    evoProgressText: '', evoMissingText: '', evoPeakName: '', evoPeakRarity: '', evoOwnedText: '',
    evoPairOk: false, evoPairText: '', evoPairReason: '', evoPairGain: 0,
    evoSynthOk: false, evoSynthReason: '', evoSynthBtnText: '',
    evoSalvageOk: false, evoSalvageText: '', evoNote: '',
    evoSheetOpen: false, evoRows: [], evoRowCount: 0,
    equipOptions: [], rosterSlots: [], versions: [], bondLinks: [],
    inRoster: false, rosterLabel: '未上场', positionMatched: true,
    dataSourceLabel: '', reduceMotion: false
  },

  onLoad(options) {
    const uid = (options && options.uid) || '';
    this.setData({ uid: uid }, this.resync);
  },

  resync() { if (this.__syncStore) this.__syncStore(); },

  /* ---------- 养成 ---------- */
  onLevelUp() {
    const res = store.levelUp(this.data.uid);
    this.toast(res, '升级成功 Lv' + (this.data.level + 1));
  },

  onStarUp() {
    if (!this.data.canStar) {
      wx.showToast({ title: this.data.starMaxed ? '已满星' : ('需要 ' + this.data.starNeed + ' 张同名卡，现有 ' + this.data.dups + ' 张'), icon: 'none' });
      return;
    }
    const self = this;
    wx.showModal({
      title: '升星确认',
      content: '将消耗 1 张同名卡「' + this.data.name + '」（优先消耗未在阵容中的），升到 ' + (this.data.stars + 1) + ' 星。',
      confirmText: '升星',
      success: function (r) {
        if (!r.confirm) return;
        self.toast(store.starUp(self.data.uid), '升星成功 ' + (self.data.stars + 1) + '★');
      }
    });
  },

  onBreak() {
    if (!this.data.canBreak) {
      wx.showToast({ title: this.data.brMaxed ? '已满突破' : '金币或碎片不足', icon: 'none' });
      return;
    }
    this.toast(store.breakthrough(this.data.uid), '突破成功 +' + (this.data.breakthrough + 1));
  },

  toast(res, okText) {
    if (res && res.ok) wx.showToast({ title: okText, icon: 'none', duration: 900 });
    else wx.showToast({ title: (res && res.reason) || '操作失败', icon: 'none' });
  },

  /* ---------- 装备 ---------- */
  openEquip(e) {
    this.setData({ sheet: 'equip-' + e.currentTarget.dataset.slot }, this.resync);
  },
  onEquip(e) {
    const id = e.currentTarget.dataset.id;
    this.toast(store.equip(this.data.uid, id), '已穿戴');
    this.setData({ sheet: '' }, this.resync);
  },
  onUnequip(e) {
    const slot = e.currentTarget.dataset.slot;
    this.toast(store.unequip(this.data.uid, slot), '已取下并放回背包');
    this.setData({ sheet: '' }, this.resync);
  },

  /* ---------- 名场面时刻卡（里程碑 2）----------
   * 与装备同一套语义：卡实例从背包扣 1 戴到这名球员身上，取下退回背包。
   * 能不能戴由 commands.equipMoment 判（余额/合法性/开关），页面只把 reason toast 出来。 */
  openMoment() { this.setData({ sheet: 'moment' }, this.resync); },
  onMomentEquip(e) {
    const id = e.currentTarget.dataset.id;
    this.toast(store.equipMoment(this.data.uid, id), '已佩戴');
    this.setData({ sheet: '' }, this.resync);
  },
  onMomentUnequip() {
    this.toast(store.unequipMoment(this.data.uid), '已取下并放回背包');
    this.setData({ sheet: '' }, this.resync);
  },
  goShop() { wx.navigateTo({ url: '/pages/bag/bag?tab=shop' }); },

  /* ---------- 时空进化（第八章「创新玩法」，里程碑 3）----------
   * 三个入口的可用性由 mapState 预计算（evoPairOk / evoSalvageOk / evoSynthOk），
   * 页面只负责二次确认与 toast；真正的业务规则在 commands 与 reducers（AGENTS.md §3）。
   * 不可用的按钮渲染成 px-btn--disabled（pointer-events:none），原因文案就在按钮下方。 */
  openEvoSheet() {
    if (!this.data.evoSalvageOk) {
      wx.showToast({ title: this.data.evoNote || '暂不可分解', icon: 'none' });
      return;
    }
    this.setData({ sheet: 'evo' }, this.resync);
  },
  onSalvage(e) {
    const ds = e.currentTarget.dataset;
    const uid = ds.uid;
    if (!uid) return;
    if (ds.reason) { wx.showToast({ title: ds.reason, icon: 'none' }); return; }
    const self = this;
    const lastTip = ds.last ? '这是该版本的最后一张，分解后该版本将从图鉴中消失。' : '';
    wx.showModal({
      title: '分解确认',
      content: '将分解「' + ds.version + '」×1（' + ds.growth + '）→ 巅峰碎片 ' + ds.value + '。' + lastTip,
      confirmText: '分解',
      success: function (r) {
        if (!r.confirm) return;
        self.toast(store.salvageCard(uid), '分解成功 +' + ds.value + ' 碎片');
      }
    });
  },
  onEvolvePair() {
    if (!this.data.evoPairOk) {
      wx.showToast({ title: this.data.evoPairReason || '暂不可用', icon: 'none' });
      return;
    }
    const self = this;
    wx.showModal({
      title: '时空进化确认',
      content: '献祭「' + this.data.name + '」新秀版 ×1 + 现役版 ×1（优先消耗未在阵容、养成度最低的）→ 巅峰碎片 +' + this.data.evoPairGain + '。材料不可找回。',
      confirmText: '献祭',
      success: function (r) {
        if (!r.confirm) return;
        self.toast(store.evolvePair(self.data.playerId), '献祭成功 +' + self.data.evoPairGain + ' 碎片');
      }
    });
  },
  onSynthPeak() {
    if (!this.data.evoSynthOk) {
      wx.showToast({ title: this.data.evoSynthReason || '巅峰碎片不足', icon: 'none' });
      return;
    }
    const self = this;
    wx.showModal({
      title: '合成确认',
      content: '消耗 ' + this.data.evoCost + ' 巅峰碎片，合成「' + this.data.evoPeakName + '」巅峰传奇版（Lv.1 / 1★）。',
      confirmText: '合成',
      success: function (r) {
        if (!r.confirm) return;
        self.toast(store.synthPeak(self.data.playerId), '合成成功：' + self.data.evoPeakName);
      }
    });
  },

  /* ---------- 编入阵容 ---------- */
  openRoster() { this.setData({ sheet: 'roster' }, this.resync); },
  onAssign(e) {
    const ds = e.currentTarget.dataset;
    const res = store.assignSlot(ds.slot, Number(ds.index), this.data.uid);
    this.setData({ sheet: '' });
    if (res && res.ok) {
      wx.showToast({ title: res.overCap ? '已编入，但薪资超帽' : '已编入阵容', icon: 'none' });
    } else {
      wx.showToast({ title: (res && res.reason) || '编入失败', icon: 'none' });
    }
  },
  onRemove() {
    const uid = this.data.uid;
    const st = store.getState();
    const si = st.roster.starters.indexOf(uid);
    const bi = st.roster.bench.indexOf(uid);
    if (si === -1 && bi === -1) return;
    store.dispatch(store.actions.clearRosterSlot(si !== -1 ? 'starters' : 'bench', si !== -1 ? si : bi));
    this.setData({ sheet: '' });
    wx.showToast({ title: '已移出阵容', icon: 'none', duration: 800 });
  },

  closeSheet() { this.setData({ sheet: '' }, this.resync); },
  noop() {},

  /* ---------- 跳转 ---------- */
  goVersion(e) {
    const uid = e.currentTarget.dataset.uid;
    if (!uid) { wx.showToast({ title: '还没获得这个版本', icon: 'none' }); return; }
    if (uid === this.data.uid) return;
    this.setData({ uid: uid, sheet: '' }, this.resync);
  },
  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); },
  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); },
  goBag() { wx.navigateTo({ url: '/pages/bag/bag' }); },
}));