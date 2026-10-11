/* components/player-card —— 卡牌外观（第六章像素 UI：稀有度边框 + 点阵 OVR）
 * 职责：图鉴 / 阵容 / 抽卡结果共用的卡牌单元。selected 时高亮描边，locked 时置灰剪影。
 */
Component({
  options: { addGlobalClass: true },
  properties: {
    card: { type: Object, value: null },
    selected: { type: Boolean, value: false },
    locked: { type: Boolean, value: false },
    width: { type: Number, value: 200 },
    showMeta: { type: Boolean, value: true }
  },
  data: { rarityColor: '#9aa4b8' },
  observers: {
    'card.rarity': function (r) {
      const map = require('../../config.js').palette.rarity;
      this.setData({ rarityColor: map[r] || map.N });
    }
  }
});
