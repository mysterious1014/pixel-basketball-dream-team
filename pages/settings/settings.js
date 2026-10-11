/* pages/settings/settings.js —— 设置页（第十章页面清单「设置」）
 * 职责：无障碍与演出开关（减少动效 / 比赛速度 / 音效）、合规「虚构化名」一键切换（第三章第 7 条）、
 *       存档导出与重置、以及合规声明与关于信息。
 * 约束：所有开关都写进 Store 的 settings 并随存档持久化，页面之间共享同一份偏好。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const players = require('../../data/players.js');
const stagesData = require('../../data/stages.js');
const commentary = require('../../data/commentary.js');
const itemsData = require('../../data/items.js');
const CONFIG = require('../../config.js');
const fmt = require('../../utils/format.js');

const SPEEDS = [
  { value: 1, name: '1× 慢速', desc: '逐回合细看，适合第一次体验' },
  { value: 2, name: '2× 常速', desc: '默认节奏，单局约 40 秒' },
  { value: 4, name: '4× 快速', desc: '只想看结果时用' }
];

Page(store.connectPage(function (state) {
  const s = state.settings || {};
  const progress = selectors.collectionProgress(state);
  return {
    reduceMotion: !!s.reduceMotion,
    fictionalNames: !!s.fictionalNames,
    sound: s.sound !== false,
    autoSpeed: Number(s.autoSpeed) || 1,
    speeds: SPEEDS,
    speedName: (SPEEDS.filter(function (x) { return x.value === (Number(s.autoSpeed) || 1); })[0] || SPEEDS[1]).name,

    managerName: state.profile.name || '梦之队经理',
    level: state.profile.level,
    saveKey: CONFIG.SAVE_KEY,
    saveSchema: CONFIG.SAVE_SCHEMA,
    saveSize: fmt.numText(JSON.stringify(state).length),
    createdAt: fmt.dateTime(state.createdAt),
    updatedAt: fmt.fromNow(state.updatedAt, Date.now()),

    useDemoData: CONFIG.compliance.useDemoData,
    fictionalModeDefault: CONFIG.compliance.fictionalMode,
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    legalNote: CONFIG.compliance.legalNote,
    trademarkNote: CONFIG.compliance.trademarkNote,
    apiBaseEmpty: !CONFIG.compliance.apiBase,

    gameName: CONFIG.GAME_NAME,
    version: CONFIG.VERSION,
    milestone: CONFIG.MILESTONE,
    cardCount: players.COUNT,
    handCount: players.HAND_AUTHORED,
    academyCount: players.ACADEMY_COUNT,
    stageCount: stagesData.STAGES.length,
    chapterCount: stagesData.CHAPTERS.length,
    commentaryCount: commentary.countAll(),
    itemCount: itemsData.EQUIPMENT.length + itemsData.CONSUMABLES.length,
    ownedCount: progress.uniqueOwned,

    portraitEnabled: CONFIG.art.portraitEnabled,
    fontPathSet: !!CONFIG.art.localFontPath,
    fontStack: CONFIG.art.fontStack,
    salaryCap: fmt.salaryText(CONFIG.roster.salaryCap),
    staminaMax: CONFIG.economy.staminaMax,
    staminaSeconds: CONFIG.economy.staminaRecoverSeconds,
    hardPity: CONFIG.gacha.pity.advancedUrHardPity,
    prdInc: fmt.pct(CONFIG.gacha.prd.inc, 0),
    roundsPerQuarter: CONFIG.battle.roundsPerQuarter
  };
}, {
  data: {
    reduceMotion: false, fictionalNames: false, sound: true, autoSpeed: 1, speeds: [], speedName: '',
    managerName: '', level: 1, saveKey: '', saveSchema: 1, saveSize: '0', createdAt: '', updatedAt: '',
    useDemoData: true, fictionalModeDefault: false, dataSourceLabel: '', legalNote: '', trademarkNote: '', apiBaseEmpty: true,
    gameName: '', version: '', milestone: '', cardCount: 0, handCount: 0, academyCount: 0,
    stageCount: 0, chapterCount: 0, commentaryCount: 0, itemCount: 0, ownedCount: 0,
    portraitEnabled: true, fontPathSet: false, fontStack: '',
    salaryCap: '', staminaMax: 120, staminaSeconds: 300, hardPity: 90, prdInc: '2%', roundsPerQuarter: 12,
    aboutOpen: false
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    store.dispatch(store.actions.setSetting(key, value));
    if (key === 'fictionalNames') {
      wx.showToast({ title: value ? '已切换为虚构化名' : '已恢复原展示名', icon: 'none' });
    }
  },

  onSpeed(e) {
    const v = Number(e.currentTarget.dataset.v);
    store.dispatch(store.actions.setSetting('autoSpeed', v));
  },

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
        wx.showToast({ title: '已更名', icon: 'none', duration: 800 });
      }
    });
    void self;
  },

  toggleAbout() { this.setData({ aboutOpen: !this.data.aboutOpen }); },

  /* 导出存档：复制到剪贴板（MVP 不做云同步，避免引入任何外部服务与外链） */
  exportSave() {
    const text = store.exportSave();
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '存档 JSON 已复制（' + text.length + ' 字符）', icon: 'none' });
      },
      fail: function () { wx.showToast({ title: '复制失败', icon: 'none' }); }
    });
  },

  /* 重置存档：二次确认，防止误触 */
  resetSave() {
    wx.showModal({
      title: '重置存档',
      content: '将清空全部卡牌、阵容、货币与赛季进度，恢复到新手礼包状态。此操作不可撤销。',
      confirmText: '继续',
      confirmColor: '#ff4d5e',
      success: function (r) {
        if (!r.confirm) return;
        wx.showModal({
          title: '再确认一次',
          content: '真的要删掉这支梦之队吗？',
          confirmText: '确定重置',
          confirmColor: '#ff4d5e',
          success: function (r2) {
            if (!r2.confirm) return;
            store.resetSave();
            wx.showToast({ title: '已重置为新手存档', icon: 'none' });
            setTimeout(function () { wx.reLaunch({ url: '/pages/launch/launch' }); }, 700);
          }
        });
      }
    });
  },

  goCollection() { wx.navigateTo({ url: '/pages/collection/collection' }); },
  goRecruit() { wx.switchTab({ url: '/pages/recruit/recruit' }); }
}));