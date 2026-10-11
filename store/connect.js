/* store/connect.js —— 页面/组件与 Store 的绑定（第十一章「轻量状态管理」）
 * 职责：把 mapState 的结果自动 setData 到页面上；Store 一变，所有已绑定的页面同步刷新。
 *       这是第十二章验收「主页/招募/阵容三处页面数据经 Store 同步一致」的实现基础。
 * 优化：浅比较 mapState 结果，只有真变了才 setData，避免无谓的重渲染卡顿。
 */

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    if (a[k] !== b[k]) {
      // 数组/对象用 JSON 兜底比较（mapState 通常返回新对象）
      try { if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue; } catch (e) { /* 循环引用直接判不等 */ }
      return false;
    }
  }
  return true;
}

/* 绑定页面：config 是 Page({...}) 的那个对象 */
function connectPage(mapState, config) {
  const store = require('./index.js');
  const out = Object.assign({}, config);
  const origOnLoad = config.onLoad;
  const origOnShow = config.onShow;
  const origOnUnload = config.onUnload;
  const origOnHide = config.onHide;

  out.onLoad = function (options) {
    const self = this;
    this.__mapState = mapState;
    this.__syncStore = function () {
      if (!self.__mapState) return;
      const next = self.__mapState(store.getState(), self);
      if (!next) return;
      if (shallowEqual(next, self.__lastMapped)) return;
      self.__lastMapped = next;
      self.setData(next);
    };
    this.__unsub = store.subscribe(this.__syncStore);
    if (origOnLoad) origOnLoad.call(this, options);
    this.__syncStore();
  };

  out.onShow = function () {
    if (this.__syncStore) this.__syncStore();
    if (origOnShow) origOnShow.call(this);
  };

  out.onHide = function () {
    if (origOnHide) origOnHide.call(this);
  };

  out.onUnload = function () {
    if (this.__unsub) { this.__unsub(); this.__unsub = null; }
    if (origOnUnload) origOnUnload.call(this);
  };

  return out;
}

/* 绑定自定义组件：attached 时订阅，detached 时解绑 */
function connectComponent(mapState, config) {
  const store = require('./index.js');
  const out = Object.assign({}, config);
  const methods = Object.assign({}, config.methods);
  const origAttached = (config.lifetimes && config.lifetimes.attached) || config.attached;
  const origDetached = (config.lifetimes && config.lifetimes.detached) || config.detached;

  methods.__syncStore = function () {
    const next = mapState(store.getState(), this);
    if (!next) return;
    if (shallowEqual(next, this.__lastMapped)) return;
    this.__lastMapped = next;
    this.setData(next);
  };

  out.lifetimes = Object.assign({}, config.lifetimes, {
    attached: function () {
      const self = this;
      this.__unsub = store.subscribe(function () { self.__syncStore(); });
      if (origAttached) origAttached.call(this);
      this.__syncStore();
    },
    detached: function () {
      if (this.__unsub) { this.__unsub(); this.__unsub = null; }
      if (origDetached) origDetached.call(this);
    }
  });
  out.methods = methods;
  return out;
}

module.exports = { connectPage: connectPage, connectComponent: connectComponent, shallowEqual: shallowEqual };
