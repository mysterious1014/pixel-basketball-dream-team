/* app.js —— 小程序入口
 * 职责：初始化 Store（读档 / 建初始存档）、按需加载像素字体、驱动全局体力计时器、暴露系统信息。
 * 注意：不在 globalData 里放业务状态，业务状态一律走 store/（第十一章「禁止页面间乱传全局变量」）。
 */
const store = require('./store/index.js');
const CONFIG = require('./config.js');

// 体力恢复心跳间隔（第九章：5 分钟/点。30s 轮询足够顺滑，且无变化时 dispatch 直接返回原 state，不写盘）
const STAMINA_TICK = 30000;

App({
  onLaunch() {
    store.init();
    this.loadPixelFont();
    this.globalData.systemInfo = this.readWindowInfo();
  },

  onShow() {
    // 回前台时补算体力，并启动心跳
    store.dispatch(store.actions.foreground(Date.now()));
    this.startStaminaTicker();
  },

  onHide() {
    this.stopStaminaTicker();
  },

  /* 前台期间定时补算体力：让「资源条倒计时」不需要每个页面自己开定时器 */
  startStaminaTicker() {
    if (this.__staminaTimer) return;
    this.__staminaTimer = setInterval(() => {
      store.dispatch(store.actions.foreground(Date.now()));
    }, STAMINA_TICK);
  },

  stopStaminaTicker() {
    if (!this.__staminaTimer) return;
    clearInterval(this.__staminaTimer);
    this.__staminaTimer = null;
  },

  /* 像素字体（第六章）：把 Zpix.ttf 放进 assets/fonts/ 并在 config.art.localFontPath 填路径即可全局启用。
   * 默认留空 = 不加载，走 fontStack 回退栈，保证零依赖、零外链、无破图。 */
  loadPixelFont() {
    const path = CONFIG.art.localFontPath;
    if (!path || typeof wx === 'undefined' || !wx.loadFontFace) return;
    try {
      wx.loadFontFace({
        global: true,
        family: CONFIG.art.localFontFamily,
        source: 'url("' + path + '")',
        fail: () => {}
      });
    } catch (e) {
      /* 字体加载失败不影响游戏，静默回退 */
    }
  },

  readWindowInfo() {
    try {
      if (typeof wx === 'undefined') return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 };
      if (wx.getWindowInfo) return wx.getWindowInfo();
      return wx.getSystemInfoSync();
    } catch (e) {
      return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 };
    }
  },

  globalData: {
    config: CONFIG,
    systemInfo: null
  }
});