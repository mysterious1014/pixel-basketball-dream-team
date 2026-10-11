/* pages/roster/roster.js —— 阵容编辑页（Tab 2，第七章 7.2）
 * 职责：5 首发 + 7 替补编排、工资帽实时校验、打法与防守策略选择、一键最优。
 * 交互（文档「防坑」要求）：MVP 不用拖拽，改为「点选 A 再点选 B 交换」+ 弹层换人，真机不会卡。
 * 数据一致性：薪资 / OVR / 位置全部走 selectors.rosterView，与主页、比赛页共用同一口径。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const tactics = require('../../data/tactics.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const POSITIONS = CONFIG.roster.slotPositions;
const STYLE_LIST = Object.keys(tactics.PLAY_STYLES).map(function (k) {
  const s = tactics.PLAY_STYLES[k];
  return { key: s.key, name: s.name, desc: s.desc };
});
const POS_FILTERS = ['全部'].concat(POSITIONS);

/* 把一张有效卡压成列表渲染需要的轻量对象（避免 setData 传输过大） */
function toRow(c, state, selected) {
  const where = selectors.inRoster(state, c.uid);
  let slotLabel = '未上场';
  if (where) {
    const si = state.roster.starters.indexOf(c.uid);
    slotLabel = si !== -1 ? ('首发 ' + POSITIONS[si]) : ('替补 ' + (state.roster.bench.indexOf(c.uid) + 1));
  }
  return {
    uid: c.uid,
    cardId: c.cardId,
    name: c.displayName,
    position: c.position,
    ovr: c.ovr,
    rarity: c.rarity,
    salaryText: fmt.salaryText(c.salary),
    level: c.level,
    stars: c.stars,
    matched: selected ? c.position === selected.position : true,
    inRoster: where,
    slotLabel: slotLabel,
    isCurrent: !!(selected && selected.uid === c.uid)
  };
}

function slotOf(state, slot, index, cards) {
  const uid = slot === 'bench' ? state.roster.bench[index] : state.roster.starters[index];
  const card = uid ? cards[uid] : null;
  return {
    slot: slot,
    index: index,
    uid: uid || '',
    position: slot === 'starters' ? POSITIONS[index] : '替补' + (index + 1),
    needPosition: slot === 'starters' ? POSITIONS[index] : '',
    empty: !card,
    cardId: card ? card.cardId : '',
    name: card ? card.displayName : '',
    ovr: card ? card.ovr : 0,
    rarity: card ? card.rarity : 'N',
    salaryText: card ? fmt.salaryText(card.salary) : '--',
    level: card ? card.level : 0,
    stars: card ? card.stars : 0,
    matched: slot === 'bench' ? true : (!!card && card.position === POSITIONS[index])
  };
}

Page(store.connectPage(function (state, self) {
  const view = selectors.rosterView(state);
  const local = (self && self.data) || {};
  const cards = {};
  Object.keys(state.collection).forEach(function (uid) {
    const c = selectors.effectiveCardOf(state, uid);
    if (c) cards[uid] = c;
  });

  const starters = [];
  for (let i = 0; i < CONFIG.roster.starterCount; i++) starters.push(slotOf(state, 'starters', i, cards));
  const bench = [];
  for (let i = 0; i < CONFIG.roster.benchCount; i++) bench.push(slotOf(state, 'bench', i, cards));

  // 弹层候选卡：按页面本地的筛选条件过滤（mapState 第二参数就是页面实例）
  const sel = local.selected || null;
  const posFilter = local.posFilter || '全部';
  const onlyFree = !!local.onlyFree;
  const list = selectors.ownedCards(state)
    .filter(function (c) { return posFilter === '全部' || c.position === posFilter; })
    .filter(function (c) { return !onlyFree || !selectors.inRoster(state, c.uid); })
    .map(function (c) { return toRow(c, state, sel ? { position: sel.needPosition, uid: sel.uid } : null); });

  // 羁绊图鉴只算一次（23 条点名羁绊），下面两处复用
  const bondCatalog = selectors.bondCatalog(state);

  /* 战术克制（里程碑 2）：打法/防守两套 chips + 克制表 + 我方三种打法的克制结论。
   * 全部数字来自 selectors.tacticsView —— 它读的是 battle.normalizeTeam 归一化后的权重表，
   * 也就是比赛里真正生效的那一份，所以「面板说的」与「引擎做的」不可能不一致。 */
  const tv = selectors.tacticsView(state);
  const curDef = tv.defenses.filter(function (d) { return d.key === view.defense; })[0] || tv.defenses[0];
  const curMatch = tv.matchup.filter(function (m) { return m.key === view.playStyle; })[0] || null;

  return {
    starters: starters,
    bench: bench,
    totalSalaryText: fmt.salaryText(view.totalSalary),
    capText: fmt.salaryText(view.salaryCap),
    leftText: fmt.salaryText(view.salaryLeft),
    capRatio: Math.round(view.capRatio * 100),
    overCap: view.overCap,
    salaryLeft: view.salaryLeft,
    starterCount: view.starterCount,
    starterNeed: CONFIG.roster.starterCount,
    benchCount: view.benchCount,
    benchNeed: CONFIG.roster.benchCount,
    avgOvr: view.avgOvr,
    starterAvgOvr: view.starterAvgOvr,
    ready: view.ready,
    mismatchCount: view.positions.filter(function (p) { return p.card && !p.matched; }).length,
    playStyle: view.playStyle,
    styleList: STYLE_LIST,
    styleDesc: (tactics.PLAY_STYLES[view.playStyle] || tactics.PLAY_STYLES.balanced).desc,
    /* 防守策略与克制（第七章 7.4，里程碑 2） */
    defense: view.defense,
    defenseList: tv.defenses,
    defenseDesc: curDef ? curDef.desc : '',
    myDefenseName: tv.myDefenseName,
    myDefenseAutoText: tv.myDefenseAutoText,
    counterEnabled: tv.enabled,
    counterBonusPct: tv.bonusPct,
    counterHint: tv.hint,
    tacticMatrix: tv.matrix,
    matrixDefenses: tv.matrixDefenses,
    matchupList: tv.matchup,
    curMatchup: curMatch ? curMatch.rows : [],
    curMatchupName: curMatch ? curMatch.name : '',
    posFilters: POS_FILTERS,
    pickerList: list,
    pickerCount: list.length,
    reduceMotion: !!(state.settings && state.settings.reduceMotion),
    goldText: fmt.numText(state.profile.gold),
    /* 羁绊（第七章 7.3）：数据全部来自 selectors.rosterView / bondCatalog，页面不自己算 */
    bondEnabled: view.bondEnabled,
    bondList: view.bonds,
    bondCount: view.bondCount,
    bondSummaryText: view.bondSummaryText,
    bondHint: view.bondCount ? '' : '同队 / 同届 / 宿敌 / 连线四类羁绊都还没触发，试试把老队友排在一起',
    /* 名场面时刻卡（第八章，里程碑 2）：与羁绊同一条纪律 —— 只在比赛内生效，
     * 不改 OVR / 薪资，也不进工资帽（config.moment 裁决 3），所以换卡不会让阵容突然超帽。 */
    momentEnabled: view.momentEnabled,
    momentList: view.moments,
    momentCount: view.momentCount,
    momentSummaryText: view.momentSummaryText,
    momentHint: view.momentCount ? '' : '还没人佩戴时刻卡 —— 去竞技商城用竞技币兑换，再到球员详情页戴上',
    bondCatalogList: bondCatalog,
    bondCatalogCount: bondCatalog.length,
    bondActiveCount: bondCatalog.filter(function (b) { return b.status === 'on'; }).length
  };
}, {
  data: {
    starters: [], bench: [],
    totalSalaryText: '0 万', capText: '0 万', leftText: '0 万',
    capRatio: 0, overCap: false, salaryLeft: 0,
    starterCount: 0, starterNeed: 5, benchCount: 0, benchNeed: 7,
    avgOvr: 0, starterAvgOvr: 0, ready: false, mismatchCount: 0,
    playStyle: 'balanced', styleList: [], styleDesc: '', posFilters: [],
    defense: 'auto', defenseList: [], defenseDesc: '', myDefenseName: '', myDefenseAutoText: '',
    counterEnabled: true, counterBonusPct: 0, counterHint: '',
    tacticMatrix: [], matrixDefenses: [], matchupList: [], curMatchup: [], curMatchupName: '',
    pickerList: [], pickerCount: 0,
    reduceMotion: false, goldText: '0',
    bondEnabled: true, bondList: [], bondCount: 0, bondSummaryText: '', bondHint: '',
    momentEnabled: true, momentList: [], momentCount: 0, momentSummaryText: '', momentHint: '',
    bondCatalogList: [], bondCatalogCount: 0, bondActiveCount: 0,
    // 页面本地态（不进 Store）
    selected: null,
    sheetOpen: false,
    posFilter: '全部',
    onlyFree: false,
    swapping: false,
    flash: '',
    bondSheetOpen: false,
    tacticSheetOpen: false
  },

  /* ---------- 羁绊图鉴（里程碑 2） ---------- */
  openBondSheet() { this.setData({ bondSheetOpen: true, selected: null }); },

  /* 时刻卡图鉴（里程碑 2）：复用背包页的 moment 分页，不另开一个页面 ——
   * 时刻卡的「持有/佩戴」状态与背包是同一份数据（state.bag + collection[].moment），
   * 分成两页必然出现两边数字对不上的情况（AGENTS.md §3 单一出口）。 */
  goMomentBag() { wx.navigateTo({ url: '/pages/bag/bag?tab=moment' }); },
  closeBondSheet() { this.setData({ bondSheetOpen: false }); },

  /* ---------- 克制表（里程碑 2 战术克制） ---------- */
  openTacticSheet() { this.setData({ tacticSheetOpen: true, selected: null }); },
  closeTacticSheet() { this.setData({ tacticSheetOpen: false }); },

  /* ---------- 选中 / 交换（点选 A 再点选 B） ---------- */
  onTapSlot(e) {
    const ds = e.currentTarget.dataset;
    const target = { slot: ds.slot, index: Number(ds.index), uid: ds.uid || '', needPosition: ds.pos || '' };
    const cur = this.data.selected;

    if (!cur) {
      this.setData({ selected: target, swapping: false });
      return;
    }
    if (cur.slot === target.slot && cur.index === target.index) {
      // 再点自己 = 取消选中
      this.setData({ selected: null, swapping: false });
      return;
    }
    // 点选 B：执行交换（空位也能换，等于移动）
    const res = store.swap({ slot: cur.slot, index: cur.index }, { slot: target.slot, index: target.index });
    this.setData({ selected: null, swapping: false, flash: cur.slot + cur.index + '-' + target.slot + target.index });
    if (res && res.overCap) {
      wx.showToast({ title: '交换后超出工资帽', icon: 'none' });
    } else {
      wx.showToast({ title: '已交换', icon: 'none', duration: 700 });
    }
  },

  openPicker() {
    if (!this.data.selected) { wx.showToast({ title: '请先点选一个位置', icon: 'none' }); return; }
    const sel = this.data.selected;
    this.setData({ sheetOpen: true, posFilter: sel.needPosition || '全部', onlyFree: false }, this.resync);
  },

  closeSheet() { this.setData({ sheetOpen: false }); },
  noop() {},

  onPickCard(e) {
    const uid = e.currentTarget.dataset.uid;
    const sel = this.data.selected;
    if (!sel || !uid) return;
    const res = store.assignSlot(sel.slot, sel.index, uid);
    this.setData({ sheetOpen: false, selected: null });
    if (res && res.overCap) wx.showToast({ title: '已编入，但薪资超帽', icon: 'none' });
    else wx.showToast({ title: '已编入阵容', icon: 'none', duration: 700 });
  },

  clearSlot() {
    const sel = this.data.selected;
    if (!sel) return;
    store.dispatch(store.actions.clearRosterSlot(sel.slot, sel.index));
    this.setData({ selected: null });
    wx.showToast({ title: '已移出阵容', icon: 'none', duration: 700 });
  },

  goDetail() {
    const sel = this.data.selected;
    if (!sel || !sel.uid) return;
    wx.navigateTo({ url: '/pages/detail/detail?uid=' + sel.uid });
  },

  /* ---------- 筛选 ---------- */
  onPosFilter(e) {
    this.setData({ posFilter: e.currentTarget.dataset.pos }, this.resync);
  },
  toggleOnlyFree() {
    this.setData({ onlyFree: !this.data.onlyFree }, this.resync);
  },
  /* 本地筛选变化后，主动让 connectPage 重算一次 mapState */
  resync() { if (this.__syncStore) this.__syncStore(); },

  /* ---------- 打法 / 防守策略 ---------- */
  onStyle(e) {
    const key = e.currentTarget.dataset.key;
    store.setPlayStyle(key);
    wx.showToast({ title: '打法：' + (tactics.PLAY_STYLES[key] || {}).name, icon: 'none', duration: 700 });
  },

  /* 防守策略：'auto' 或 data/tactics.js DEFENSES 里的 key。
   * 非法值由 commands.setDefense 拦下（返回 ok:false），页面不重复判断。 */
  onDefense(e) {
    const key = e.currentTarget.dataset.key;
    const res = store.setDefense(key);
    if (!res || !res.ok) {
      wx.showToast({ title: (res && res.reason) || '防守策略不可用', icon: 'none' });
      return;
    }
    const item = (this.data.defenseList || []).filter(function (d) { return d.key === key; })[0];
    wx.showToast({ title: '防守：' + ((item && item.name) || key), icon: 'none', duration: 700 });
  },

  /* ---------- 一键最优 ---------- */
  autoFill() {
    const res = store.autoFill();
    this.setData({ selected: null });
    if (res && res.overCap) {
      wx.showToast({ title: '已排满，但薪资超帽，请手动下调', icon: 'none' });
    } else {
      wx.showToast({ title: '已排出最强阵容 均评' + (res ? res.avgOvr : ''), icon: 'none' });
    }
  },

  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); },
  goStages() { wx.switchTab({ url: '/pages/stages/stages' }); }
}));