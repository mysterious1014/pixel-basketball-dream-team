/* components/px-portrait —— 球员立绘（第三章容错机制：缺失自动回退占位图，绝不破图）
 * 职责：优先读 assets/portraits/<cardId>.png（程序生成的像素立绘）；
 *       读不到 / config 关闭 / 加载失败时，回退到纯 CSS 像素占位（球衣色块 + 号码）。
 */
const CONFIG = require('../../config.js');
const players = require('../../data/players.js');

Component({
  options: { addGlobalClass: true },
  properties: {
    cardId: { type: String, value: '' },
    size: { type: Number, value: 120 },
    dim: { type: Boolean, value: false }
  },
  data: {
    src: '',
    failed: false,
    primary: '#26366b',
    secondary: '#ff8a1f',
    number: 0,
    label: '?'
  },
  observers: {
    'cardId': function (id) { this.refresh(id); }
  },
  lifetimes: {
    attached: function () { this.refresh(this.data.cardId); }
  },
  methods: {
    refresh: function (id) {
      const card = players.getCard(id);
      const enabled = !!CONFIG.art.portraitEnabled && !!id;
      this.setData({
        src: enabled ? CONFIG.art.portraitDir + id + '.png' : '',
        failed: false,
        primary: card ? card.colors.primary : '#26366b',
        secondary: card ? card.colors.secondary : '#ff8a1f',
        number: card ? card.number : 0,
        label: card ? card.name.slice(0, 1) : '?'
      });
    },
    onError: function () {
      // 第三章：立绘缺失时 UI 自动回退占位图，任何界面不得出现破图或空白
      this.setData({ failed: true });
    }
  }
});
