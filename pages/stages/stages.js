/* pages/stages/stages.js —— 关卡地图 / 赛季征程（Tab 4，第七章 7.4 模式：PVE）
 * 职责：3 章 × 6 关的顺序推进地图、体力与出战校验、关卡详情弹层，点「出战」跳比赛页。
 * 解锁规则：按 STAGES 顺序，前一关赢过才解锁下一关（BOSS 关同理），让养成有明确目标。
 * 里程碑 2：详情弹层多了「战术侦察」（对手防守策略 + 我方克制结论 + 防守建议），
 *          并在页首给出竞技场（异步 PVP 天梯）入口 —— 两个模式共用同一套克制口径。
 * 星级：由比赛净胜分决定（config.season.starThresholds），只保留历史最好成绩。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const stagesData = require('../../data/stages.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const STAR_TEXT = ['', '★', '★★', '★★★'];

Page(store.connectPage(function (state, self) {
  const local = (self && self.data) || {};
  const chapter = Number(local.chapter) || 1;
  const cleared = (state.season && state.season.cleared) || {};
  const stam = selectors.staminaView(state, Date.now());
  const roster = selectors.rosterView(state);
  const arena = selectors.arenaSummary(state, Date.now());

  // 顺序解锁：先算出全局「第一个未赢的关卡下标」
  let firstOpen = stagesData.STAGES.length;
  for (let i = 0; i < stagesData.STAGES.length; i++) {
    const rec = cleared[stagesData.STAGES[i].id];
    if (!rec || rec.result !== 'win') { firstOpen = i; break; }
  }

  const chapters = stagesData.CHAPTERS.map(function (ch) {
    const list = stagesData.stagesOf(ch.id);
    const items = list.map(function (s) {
      const globalIdx = stagesData.STAGES.indexOf(s);
      const rec = cleared[s.id];
      const stars = rec ? rec.stars : 0;
      return {
        id: s.id,
        index: s.index,
        name: s.name,
        opponent: s.opponent,
        boss: !!s.boss,
        awayOvr: s.awayOvr,
        staminaCost: s.staminaCost,
        cleared: !!rec && rec.result === 'win',
        attempted: !!rec,
        stars: stars,
        starText: STAR_TEXT[stars] || '',
        bestMargin: rec ? rec.bestMargin : null,
        unlocked: globalIdx <= firstOpen,
        canPlay: globalIdx <= firstOpen && stam.value >= s.staminaCost
      };
    });
    const done = items.filter(function (i) { return i.cleared; }).length;
    return {
      id: ch.id, name: ch.name, desc: ch.desc, color: ch.color,
      items: items, done: done, total: items.length,
      stars: items.reduce(function (a, b) { return a + b.stars; }, 0)
    };
  });

  const current = chapters.filter(function (c) { return c.id === chapter; })[0] || chapters[0];
  const detailId = local.detailId || '';
  let detail = null;
  if (detailId) {
    chapters.forEach(function (c) {
      c.items.forEach(function (it) { if (it.id === detailId) {
        const s = stagesData.getStage(it.id);
        detail = Object.assign({}, it, {
          chapterName: c.name,
          rewards: s.rewards,
          rewardText: [
            s.rewards.gold ? '金币 ' + fmt.numText(s.rewards.gold) : '',
            s.rewards.diamond ? '钻石 ' + s.rewards.diamond : '',
            s.rewards.exp ? '经验 ' + s.rewards.exp : '',
            s.rewards.shard ? '碎片 ×' + s.rewards.shard : '',
            s.rewards.ticketNormal ? '普通券 ×' + s.rewards.ticketNormal : '',
            s.rewards.ticketAdvanced ? '高级券 ×' + s.rewards.ticketAdvanced : '',
            s.rewards.item ? '装备 ' + ((require('../../data/items.js').getItem(s.rewards.item) || {}).name || s.rewards.item) : ''
          ].filter(Boolean).join(' · '),
          firstClear: !it.attempted,
          firstClearText: '首通额外 金币 ' + stagesData.FIRST_CLEAR_BONUS.gold + ' + 钻石 ' + stagesData.FIRST_CLEAR_BONUS.diamond,

          away: stagesData.buildAwayTeam(s, 1).players.map(function (p) {
            return { name: p.name, position: p.position, ovr: p.ovr, number: p.number, cardId: p.cardId };
          })
        });
      } });
    });
  }

  return {
    chapters: chapters,
    chapterTabs: chapters.map(function (c) { return { id: c.id, name: c.name, done: c.done, total: c.total }; }),
    chapter: current.id,
    chapterName: current.name,
    chapterDesc: current.desc,
    chapterColor: current.color,
    items: current.items,
    chapterDone: current.done,
    chapterTotal: current.total,
    chapterStars: current.stars,

    stamina: stam.value,
    staminaMax: stam.max,
    staminaNext: stam.nextText,
    totalStars: state.season ? state.season.totalStars : 0,
    starMax: stagesData.STAGES.length * 3,
    clearedCount: Object.keys(cleared).length,
    stageCount: stagesData.STAGES.length,

    rosterReady: roster.ready,
    overCap: roster.overCap,
    starterCount: roster.starterCount,
    starterAvgOvr: roster.starterAvgOvr,
    starThresholds: CONFIG.season.starThresholds,

    detail: detail,
    detailId: detailId,
    /* 战术侦察（里程碑 2）：只在详情打开时算一次，读的是与引擎同源的 selectors.stageScout */
    scout: detail ? selectors.stageScout(state, stagesData.getStage(detail.id)) : null,
    /* 竞技场入口摘要 */
    arenaEnabled: arena.enabled,
    arenaRankName: arena.rankName,
    arenaRating: arena.rating,
    arenaDailyText: arena.dailyText,
    arenaProgressText: arena.clearedCount + '/' + arena.ladderCount,
    arenaNextName: arena.allCleared ? '天梯已全部通关' : arena.nextOpponentName,
    reduceMotion: !!(state.settings && state.settings.reduceMotion)
  };
}, {
  data: {
    chapters: [], chapterTabs: [], chapter: 1, chapterName: '', chapterDesc: '', chapterColor: '',
    items: [], chapterDone: 0, chapterTotal: 0, chapterStars: 0,
    stamina: 0, staminaMax: 120, staminaNext: '', totalStars: 0, starMax: 54,
    clearedCount: 0, stageCount: 18,
    rosterReady: false, overCap: false, starterCount: 0, starterAvgOvr: 0, starThresholds: [4, 9, 15],
    detail: null, detailId: '', scout: null, reduceMotion: false,
    arenaEnabled: true, arenaRankName: '', arenaRating: 0, arenaDailyText: '', arenaProgressText: '', arenaNextName: ''
  },

  resync() { if (this.__syncStore) this.__syncStore(); },

  switchChapter(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id === this.data.chapter) return;
    this.setData({ chapter: id, detailId: '' }, this.resync);
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    if (!item.unlocked) {
      wx.showToast({ title: '先赢下前一关才能解锁', icon: 'none' });
      return;
    }
    this.setData({ detailId: id }, this.resync);
  },

  closeDetail() { this.setData({ detailId: '' }, this.resync); },
  noop() {},

  /* 出战：所有硬性校验（首发 5 人 / 工资帽 / 体力）都在 store.startBattle 里再兜一次 */
  startBattle() {
    const detail = this.data.detail;
    if (!detail) return;
    if (!this.data.rosterReady) {
      wx.showToast({ title: this.data.overCap ? '薪资超帽，先去阵容页' : '首发不足 5 人', icon: 'none' });
      this.setData({ detailId: '' }, this.resync);
      wx.switchTab({ url: '/pages/roster/roster' });
      return;
    }
    if (this.data.stamina < detail.staminaCost) {
      wx.showToast({ title: '体力不足（需要 ' + detail.staminaCost + '）', icon: 'none' });
      return;
    }
    const id = detail.id;
    this.setData({ detailId: '' }, this.resync);
    wx.navigateTo({ url: '/pages/match/match?stageId=' + id });
  },

  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); },

  /* 竞技场（异步 PVP 天梯）：非 tab 页，用 navigateTo */
  goArena() { wx.navigateTo({ url: '/pages/arena/arena' }); }
}));