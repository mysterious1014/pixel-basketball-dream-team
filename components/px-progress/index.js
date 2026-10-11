/* components/px-progress —— 像素进度条（工资帽 / 体力 / 保底 / 经验通用）
 * 职责：把 px-bar 的样式封装成可复用组件，统一「比例 → 百分比宽度 + 配色 + 溢出告警」的口径。
 * 说明：借鉴 Vant Progress 的 props 设计（第四章 UI 组件调研），但完全自研、零依赖、无外链。
 * 动画：宽度变化用 steps() 逐帧过渡，贴合 16-bit 复古手感（第六章动画基调）。
 */
Component({
  options: { addGlobalClass: true },

  properties: {
    value: { type: Number, value: 0 },
    max: { type: Number, value: 100 },
    // 配色：'' 绿 / orange / gold / danger / ur
    variant: { type: String, value: '' },
    label: { type: String, value: '' },       // 条内右侧文字
    caption: { type: String, value: '' },     // 条上方标题
    height: { type: Number, value: 24 },      // rpx
    ticks: { type: Boolean, value: true },    // 像素刻度线
    // 超过 max 时自动切红（工资帽超限告警）
    warnOver: { type: Boolean, value: false }
  },

  data: { pct: 0, cls: '', over: false },

  observers: {
    'value, max, variant, warnOver': function () { this.recompute(); }
  },

  lifetimes: {
    attached: function () { this.recompute(); }
  },

  methods: {
    recompute: function () {
      const max = Number(this.data.max) || 0;
      const value = Number(this.data.value) || 0;
      const ratio = max > 0 ? value / max : 0;
      const over = this.data.warnOver && value > max;
      const pct = Math.max(0, Math.min(100, Math.round(ratio * 1000) / 10));
      let variant = this.data.variant || '';
      if (over) variant = 'danger';
      this.setData({
        pct: pct,
        over: over,
        cls: variant ? ('px-bar__fill--' + variant) : ''
      });
    }
  }
});