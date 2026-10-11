/* components/radar-chart —— 六维雷达图（第十章「详情页 Canvas 六维雷达图」单一出口）
 * 职责：用 Canvas 2D 画 16-bit 硬边六边形雷达（网格环 + 轴线 + 数据多边形 + 顶点块 + 维度标签）。
 * 口径：只接受 utils/radar.js 归并出的 6 个值（得分/组织/篮板/防守/运动/续航），
 *       避免各页面自己拼维度导致口径不一致（第十二章验收）。
 * 像素风约束（第六章）：坐标一律取整、禁用阴影与渐变、只用 config.palette 里的有限色，
 *       画布按 dpr 放大后整数绘制，边缘保持硬边观感。
 * 容错（第三章）：基础库不支持 Canvas 2D 时，自动回退为「像素条形」文字视图，绝不空白。
 */
const CONFIG = require('../../config.js');
const radar = require('../../utils/radar.js');

const P = CONFIG.palette;
const RINGS = 4;          // 网格环数（25% / 50% / 75% / 100%）
const MAXV = CONFIG.attrs.max; // 数值满刻度 = 99（绝对值，不做拉伸，避免误导）

Component({
  options: { addGlobalClass: true },

  properties: {
    // 6 个维度值（25–99）。也可以直接传 attrs，组件内部自己归并
    values: { type: Array, value: [] },
    attrs: { type: Object, value: null },
    labels: { type: Array, value: [] },
    size: { type: Number, value: 420 }, // rpx，正方形边长
    color: { type: String, value: '' }  // 留空 = 用活力橙
  },

  data: {
    supported: true,
    fbRows: [],
    labelList: []
  },

  observers: {
    'values, attrs, labels, size, color': function () { this.refresh(); }
  },

  lifetimes: {
    attached: function () { this.refresh(); },
    detached: function () { if (this.__timer) { clearTimeout(this.__timer); this.__timer = null; } }
  },

  methods: {
    /* 取 6 维值：优先 values，其次由 attrs 归并 */
    resolveValues: function () {
      const v = this.data.values;
      if (v && v.length === 6) return v.map(function (x) { return Number(x) || 0; });
      if (this.data.attrs) return radar.toValues(this.data.attrs);
      return [0, 0, 0, 0, 0, 0];
    },

    resolveLabels: function () {
      const l = this.data.labels;
      return (l && l.length === 6) ? l : radar.labels();
    },

    refresh: function () {
      const self = this;
      const values = this.resolveValues();
      const labels = this.resolveLabels();
      this.setData({
        labelList: labels,
        fbRows: labels.map(function (t, i) {
          return { key: i, label: t, value: values[i], pct: Math.round((values[i] / MAXV) * 100) };
        })
      });
      // 合并连续刷新，等 WXML 渲染完再取 canvas 节点
      if (this.__timer) clearTimeout(this.__timer);
      this.__timer = setTimeout(function () { self.__timer = null; self.draw(); }, 30);
    },

    draw: function () {
      const self = this;
      if (typeof wx === 'undefined' || !wx.createSelectorQuery) { this.setData({ supported: false }); return; }
      wx.createSelectorQuery().in(this)
        .select('#pxRadarCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          const info = res && res[0];
          if (!info || !info.node || !info.node.getContext) { self.setData({ supported: false }); return; }
          try {
            self.paint(info.node, info.width, info.height);
            if (!self.data.supported) self.setData({ supported: true });
          } catch (e) {
            self.setData({ supported: false });
          }
        });
    },

    /* 实际绘制：全部坐标取整，硬边像素观感 */
    paint: function (node, w, h) {
      const dpr = this.dpr();
      const width = Math.max(1, Math.round(w));
      const height = Math.max(1, Math.round(h));
      node.width = Math.round(width * dpr);
      node.height = Math.round(height * dpr);

      const ctx = node.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const values = this.resolveValues();
      const labels = this.resolveLabels();
      const stroke = this.data.color || P.orange;
      const cx = Math.round(width / 2);
      const cy = Math.round(height / 2);
      const R = Math.round(Math.min(width, height) * 0.34);
      const n = 6;

      // 背景：深色底 + 中心十字，营造像素记分牌质感
      ctx.fillStyle = P.navy900;
      ctx.fillRect(0, 0, width, height);

      // 网格环（由内到外）
      for (let ring = 1; ring <= RINGS; ring++) {
        const rr = Math.round((R * ring) / RINGS);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const pt = this.point(cx, cy, rr, i, n);
          if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.strokeStyle = ring === RINGS ? P.line : P.lineSoft;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (ring === RINGS) {
          ctx.fillStyle = 'rgba(27,40,84,0.45)';
          ctx.fill();
        }
      }

      // 轴线
      ctx.strokeStyle = P.lineSoft;
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const pt = this.point(cx, cy, R, i, n);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }

      // 数据多边形
      ctx.beginPath();
      const pts = [];
      for (let i = 0; i < n; i++) {
        const ratio = Math.max(0, Math.min(1, (Number(values[i]) || 0) / MAXV));
        const pt = this.point(cx, cy, Math.round(R * ratio), i, n);
        pts.push(pt);
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = this.rgba(stroke, 0.26);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 顶点：小方块（像素点，不用圆）
      ctx.fillStyle = P.gold;
      for (let i = 0; i < pts.length; i++) {
        ctx.fillRect(Math.round(pts[i].x) - 2, Math.round(pts[i].y) - 2, 5, 5);
      }

      // 维度标签 + 数值
      ctx.font = '11px monospace';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const pt = this.point(cx, cy, R + 18, i, n);
        const left = pt.x < cx - 4;
        const right = pt.x > cx + 4;
        ctx.textAlign = left ? 'right' : (right ? 'left' : 'center');
        ctx.fillStyle = P.textDim;
        ctx.fillText(labels[i], Math.round(pt.x), Math.round(pt.y) - 6);
        ctx.fillStyle = P.gold;
        ctx.fillText(String(Math.round(values[i] || 0)), Math.round(pt.x), Math.round(pt.y) + 7);
      }
    },

    /* 第 i 个顶点坐标（i=0 在正上方，顺时针），角度按 60° 等分 */
    point: function (cx, cy, r, i, n) {
      const a = (-Math.PI / 2) + (Math.PI * 2 * i) / n;
      return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
    },

    rgba: function (hex, alpha) {
      const m = /^#([0-9a-f]{6})$/i.exec(String(hex || P.orange));
      if (!m) return 'rgba(255,138,31,' + alpha + ')';
      const v = parseInt(m[1], 16);
      return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + alpha + ')';
    },

    dpr: function () {
      try {
        if (typeof wx === 'undefined') return 2;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        return info.pixelRatio || 2;
      } catch (e) { return 2; }
    }
  }
});