/* pages/launch/launch.js —— 启动页（第十章页面清单第 1 项）
 * 职责：像素 LOGO + 合规声明 + 读档进度，短暂展示后进入主页 Tab。
 * 说明：本页是 app.json pages[0]，也是唯一入口；主页是 tabBar 页面，必须用 wx.switchTab 跳转。
 *       Store 已在 app.js onLaunch 初始化，这里只读展示，不写状态。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const CONFIG = require('../../config.js');
const players = require('../../data/players.js');

const SPLASH_MS = 1400;

Page(store.connectPage(function (state) {
  const progress = selectors.collectionProgress(state);
  return {
    gameName: CONFIG.GAME_NAME,
    gameNameEn: CONFIG.GAME_NAME_EN,
    version: CONFIG.VERSION,
    milestone: CONFIG.MILESTONE,
    legalNote: CONFIG.compliance.legalNote,
    dataSourceLabel: CONFIG.compliance.dataSourceLabel,
    cardTotal: players.COUNT,
    owned: progress.uniqueOwned,
    hasSave: progress.instances > 0,
    level: state.profile.level
  };
}, {
  data: {
    gameName: '',
    gameNameEn: '',
    version: '',
    milestone: '',
    legalNote: '',
    dataSourceLabel: '',
    cardTotal: 0,
    owned: 0,
    hasSave: false,
    level: 1,
    entered: false
  },

  onLoad() {
    const self = this;
    this.__timer = setTimeout(function () { self.enter(); }, SPLASH_MS);
  },

  onUnload() {
    if (this.__timer) { clearTimeout(this.__timer); this.__timer = null; }
  },

  /* 进入主页：保证只跳一次（连点 / 定时器同时触发都不会重复导航） */
  enter() {
    if (this.data.entered) return;
    this.setData({ entered: true });
    if (this.__timer) { clearTimeout(this.__timer); this.__timer = null; }
    wx.switchTab({
      url: '/pages/home/home',
      fail: function () { wx.reLaunch({ url: '/pages/home/home' }); }
    });
  }
}));