/* pages/home/home.js —— 主页（Tab 1，第十章页面清单）
 * 职责：一屏看清「我是谁 / 阵容多强 / 钱和体力够不够 / 下一步去哪」，并把核心循环的入口全部铺开：
 *       招募 → 阵容 → 比赛 → 养成。所有数字都来自 selectors，绝不自己算（第十二章验收：三处页面数据一致）。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const stagesData = require('../../data/stages.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

/* 找到「下一个该打的关卡」：按章节顺序第一个没赢过的 */
function nextStageOf(state) {
  const cleared = (state.season && state.season.cleared) || {};
  for (let i = 0; i < stagesData.STAGES.length; i++) {
    const s = stagesData.STAGES[i];
    const rec = cleared[s.id];
    if (!rec || rec.result !== 'win') {
      return {
        id: s.id, name: s.name, chapter: s.chapter, index: s.index,
        opponent: s.opponent, awayOvr: s.awayOvr, staminaCost: s.staminaCost,
        boss: !!s.boss, cleared: !!rec
      };
    }
  }
  const last = stagesData.STAGES[stagesData.STAGES.length - 1];
  return { id: last.id, name: last.name, chapter: last.chapter, index: last.index, opponent: last.opponent, awayOvr: last.awayOvr, staminaCost: last.staminaCost, boss: true, cleared: true };
}

const QUICK_LINKS = [
  { key: 'recruit', label: '招募', icon: '抽', tab: true, url: '/pages/recruit/recruit' },
  { key: 'roster', label: '阵容', icon: '阵', tab: true, url: '/pages/roster/roster' },
  { key: 'stages', label: '比赛', icon: '赛', tab: true, url: '/pages/stages/stages' },
  { key: 'collection', label: '图鉴', icon: '图', tab: false, url: '/pages/collection/collection' },
  { key: 'bag', label: '背包', icon: '包', tab: false, url: '/pages/bag/bag' },
  { key: 'tasks', label: '任务', icon: '务', tab: false, url: '/pages/bag/bag?tab=goal' },
  { key: 'market', label: '市场', icon: '市', tab: false, url: '/pages/market/market' },
  { key: 'dynasty', label: '王朝', icon: '朝', tab: false, url: '/pages/dynasty/dynasty' },
  { key: 'settings', label: '设置', icon: '设', tab: false, url: '/pages/settings/settings' }
];

Page(store.connectPage(function (state) {
  const roster = selectors.rosterView(state);
  const progress = selectors.collectionProgress(state);
  const lv = selectors.levelView(state);
  const stam = selectors.staminaView(state, Date.now());
  const arena = selectors.arenaSummary(state, Date.now());
  const next = nextStageOf(state);
  const stars = state.season ? state.season.totalStars : 0;
  const starMax = stagesData.STAGES.length * 3;
  const last = state.lastMatch;

  return {
    gameName: CONFIG.GAME_NAME,
    managerName: state.profile.name || '梦之队经理',
    level: lv.level,
    expRatio: Math.round(lv.ratio * 100),
    expText: lv.exp + ' / ' + lv.need,

    starterTiles: roster.positions.map(function (p) {
      return {
        slot: p.slot,
        position: p.position,
        matched: p.matched,
        empty: !p.card,
        cardId: p.card ? p.card.cardId : '',
        name: p.card ? p.card.displayName : '空缺',
        ovr: p.card ? p.card.ovr : 0,
        rarity: p.card ? p.card.rarity : 'N'
      };
    }),
    starterCount: roster.starterCount,
    starterNeed: CONFIG.roster.starterCount,
    avgOvr: roster.starterAvgOvr,
    salaryText: fmt.salaryText(roster.totalSalary),
    capText: fmt.salaryText(roster.salaryCap),
    capRatio: Math.round(roster.capRatio * 100),
    overCap: roster.overCap,
    rosterReady: roster.ready,
    playStyleName: roster.playStyle,

    ownedCount: progress.uniqueOwned,
    totalCount: progress.total,
    collectRatio: Math.round(progress.ratio * 100),
    instances: progress.instances,

    stars: stars,
    starMax: starMax,
    clearedCount: Object.keys((state.season && state.season.cleared) || {}).length,
    stageCount: stagesData.STAGES.length,

    stamina: stam.value,
    canPlayNext: stam.value >= next.staminaCost,
    nextStage: next,

    winRate: state.stats.battles ? Math.round((state.stats.wins / state.stats.battles) * 100) : 0,
    battles: state.stats.battles,
    wins: state.stats.wins,
    pulls: state.stats.pulls,

    lastMatch: last ? {
      text: (last.result === 'win' ? '胜 ' : (last.result === 'lose' ? '负 ' : '平 ')) +
        ((last.away && last.away.name) || '对手') + ' ' + last.homeScore + ':' + last.awayScore,
      result: last.result,
      stars: last.stars || 0,
      at: fmt.fromNow(last.playedAt, Date.now())
    } : null,

    notices: (state.notices || []).slice(0, 3).map(function (n) {
      return { text: n.text, kind: n.kind, at: fmt.fromNow(n.at, Date.now()) };
    }),

    /* 竞技场入口（第七章 7.4 异步 PVP，里程碑 2）：只要摘要，天梯侦察在竞技场页做 */
    arenaEnabled: arena.enabled,
    arenaRankName: arena.rankName,
    arenaRating: arena.rating,
    arenaDailyText: arena.dailyText,
    arenaProgressText: arena.clearedCount + '/' + arena.ladderCount,
    arenaNextName: arena.allCleared ? '天梯已全部通关' : arena.nextOpponentName,
    arenaCoinText: String(arena.arenaCoin),

    quickLinks: QUICK_LINKS,
    reduceMotion: !!(state.settings && state.settings.reduceMotion),
    dataSourceLabel: CONFIG.compliance.dataSourceLabel
  };
}, {
  data: {
    gameName: '', managerName: '', level: 1, expRatio: 0, expText: '0 / 0',
    starterTiles: [], starterCount: 0, starterNeed: 5, avgOvr: 0,
    salaryText: '0 万', capText: '0 万', capRatio: 0, overCap: false, rosterReady: false, playStyleName: '',
    ownedCount: 0, totalCount: 0, collectRatio: 0, instances: 0,
    stars: 0, starMax: 0, clearedCount: 0, stageCount: 0,
    stamina: 0, canPlayNext: false, nextStage: null,
    winRate: 0, battles: 0, wins: 0, pulls: 0,
    lastMatch: null, notices: [], quickLinks: [], reduceMotion: false, dataSourceLabel: '',
    arenaEnabled: true, arenaRankName: '', arenaRating: 0, arenaDailyText: '',
    arenaProgressText: '', arenaNextName: '', arenaCoinText: '0'
  },

  onQuick(e) {
    const item = this.data.quickLinks.filter(function (q) { return q.key === e.currentTarget.dataset.key; })[0];
    if (!item) return;
    if (item.tab) wx.switchTab({ url: item.url });
    else wx.navigateTo({ url: item.url });
  },

  goRoster() { wx.switchTab({ url: '/pages/roster/roster' }); },
  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); },
  goStages() { wx.switchTab({ url: '/pages/stages/stages' }); },
  goCollection() { wx.navigateTo({ url: '/pages/collection/collection' }); },
  /* 竞技场是非 tab 页，用 navigateTo（比赛页离场时 navigateBack 就能回到这里） */
  goArena() { wx.navigateTo({ url: '/pages/arena/arena' }); },

  /* 主页一键开打：直接带着「下一关」跳比赛页 */
  playNext() {
    const next = this.data.nextStage;
    if (!next) return;
    if (!this.data.rosterReady) {
      wx.showToast({ title: this.data.overCap ? '薪资超帽，先去阵容页' : '首发不足 5 人', icon: 'none' });
      wx.switchTab({ url: '/pages/roster/roster' });
      return;
    }
    if (!this.data.canPlayNext) {
      wx.showToast({ title: '体力不足（需要 ' + next.staminaCost + '）', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/match/match?stageId=' + next.id });
  }
}));