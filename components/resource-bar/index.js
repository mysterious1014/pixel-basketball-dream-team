/* components/resource-bar —— 顶部资源条（金币 / 钻石 / 体力，可选招募券）
 * 职责：把 Store 里的经济与体力实时投影到每个页面顶部，是第十二章验收
 *       「主页/招募/阵容三处页面数据经 Store 同步一致」的最直观证据。
 * 实现：走 store.connectComponent 订阅，Store 一变自动 setData；本组件不写状态。
 * 体力恢复（第九章：5 分钟/点、上限 120）由 app.js 的全局计时器驱动 dispatch，本组件只读。
 */
const store = require('../../store/index.js');
const selectors = require('../../store/selectors.js');
const fmt = require('../../utils/format.js');

Component(store.connectComponent(function (state) {
  const st = selectors.staminaView(state, Date.now());
  return {
    goldText: fmt.numText(state.profile.gold),
    diamondText: fmt.numText(state.profile.diamond),
    staminaValue: st.value,
    staminaMax: st.max,
    staminaRatio: Math.round(st.ratio * 100),
    staminaNext: st.nextText,
    staminaLow: st.value < 20,
    ticketNormal: Number(state.profile.ticketNormal) || 0,
    ticketAdvanced: Number(state.profile.ticketAdvanced) || 0,
    level: state.profile.level
  };
}, {
  options: { addGlobalClass: true },

  properties: {
    tickets: { type: Boolean, value: false }, // 是否显示招募券（招募页用）
    compact: { type: Boolean, value: false }, // 紧凑模式（详情页等空间紧张处）
    showLevel: { type: Boolean, value: true }
  },

  data: {
    goldText: '0',
    diamondText: '0',
    staminaValue: 0,
    staminaMax: 120,
    staminaRatio: 0,
    staminaNext: '',
    staminaLow: false,
    ticketNormal: 0,
    ticketAdvanced: 0,
    level: 1
  }
}));