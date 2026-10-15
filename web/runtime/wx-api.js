/* web/runtime/wx-api.js —— wx.* 的浏览器实现（按本仓实测的 15 个 API 实现，不做多余接口）
 * 覆盖：showToast / showModal(含 editable) / 路由四件套 / getWindowInfo / getSystemInfoSync /
 *       createSelectorQuery(fields{node,size} + boundingClientRect) / Storage 三件套 /
 *       setClipboardData / vibrateShort / loadFontFace。
 */
(function (global) {
  'use strict';

  var Router = global.PxRouter;
  var PREFIX = 'px-h5:';

  /* ---------- UI：toast ---------- */
  var toastTimer = null;
  function showToast(opts) {
    var o = opts || {};
    var el = document.getElementById('px-toast');
    if (!el) return;
    el.textContent = o.title || '';
    el.className = 'px-toast px-toast--show' + (o.icon === 'success' ? ' px-toast--ok' : '') + (o.icon === 'none' ? '' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = 'px-toast';
    }, o.duration || 1500);
  }

  /* ---------- UI：modal（含 editable 输入） ---------- */
  function showModal(opts) {
    var o = opts || {};
    var mask = document.createElement('div');
    mask.className = 'px-modal-mask';
    var box = document.createElement('div');
    box.className = 'px-modal';
    var title = document.createElement('div');
    title.className = 'px-modal__title';
    title.textContent = o.title || '';
    box.appendChild(title);

    var input = null;
    if (o.editable) {
      input = document.createElement('input');
      input.className = 'px-modal__input';
      input.setAttribute('maxlength', '24');
      input.placeholder = o.placeholderText || '';
      input.value = o.content || '';
      box.appendChild(input);
    } else if (o.content) {
      var body = document.createElement('div');
      body.className = 'px-modal__body';
      body.textContent = o.content;
      box.appendChild(body);
    }

    var foot = document.createElement('div');
    foot.className = 'px-modal__foot';
    var showCancel = o.showCancel !== false;
    var cancelBtn = null;
    if (showCancel) {
      cancelBtn = document.createElement('div');
      cancelBtn.className = 'px-modal__btn px-modal__btn--cancel';
      cancelBtn.textContent = o.cancelText || '取消';
      foot.appendChild(cancelBtn);
    }
    var okBtn = document.createElement('div');
    okBtn.className = 'px-modal__btn px-modal__btn--ok';
    okBtn.textContent = o.confirmText || '确定';
    if (o.confirmColor) okBtn.style.color = o.confirmColor;
    foot.appendChild(okBtn);
    box.appendChild(foot);
    mask.appendChild(box);
    document.body.appendChild(mask);

    function close(res) {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      if (typeof o.success === 'function') { try { o.success(res); } catch (e) { console.error(e); } }
      if (typeof o.complete === 'function') { try { o.complete(res); } catch (e) {} }
    }
    okBtn.addEventListener('click', function () {
      close({ confirm: true, cancel: false, content: input ? input.value : '' });
    });
    if (cancelBtn) cancelBtn.addEventListener('click', function () { close({ confirm: false, cancel: true }); });
    mask.addEventListener('click', function (ev) { if (ev.target === mask) close({ confirm: false, cancel: true }); });
    if (input) setTimeout(function () { input.focus(); }, 30);
    return { confirm: true, cancel: false };
  }

  /* ---------- selectorQuery ---------- */
  function createSelectorQuery() {
    var scope = null;
    var chain = [];
    var api = {
      in: function (owner) { scope = owner || null; return api; },
      select: function (sel) { chain.push({ select: sel }); return api; },
      selectAll: function (sel) { chain.push({ selectAll: sel }); return api; },
      fields: function (f) { chain.push({ fields: f }); return api; },
      boundingClientRect: function (cb) { chain.push({ rect: true, cb: cb }); return api; },
      scrollOffset: function (cb) { chain.push({ scroll: true, cb: cb }); return api; },
      exec: function (cb) {
        var out = [];
        var queryScope = scope && scope.__host ? scope.__host : document;
        for (var i = 0; i < chain.length; i++) {
          var step = chain[i];
          if (step.select) {
            current = queryScope.querySelector(step.select);
            out.push(null);
          } else if (step.selectAll) {
            current = Array.prototype.slice.call(queryScope.querySelectorAll(step.selectAll));
            out.push(null);
          } else if (step.fields) {
            out.pop();
            out.push(fieldInfo(current, step.fields));
          } else if (step.rect) {
            out.pop();
            var info = rectInfo(current);
            out.push(info);
            if (step.cb) step.cb(info);
          } else if (step.scroll) {
            out.pop();
            var si = { id: current && current.id || '', scrollTop: current ? current.scrollTop : 0, scrollLeft: current ? current.scrollLeft : 0 };
            out.push(si);
            if (step.cb) step.cb(si);
          }
        }
        if (typeof cb === 'function') cb(out);
      }
    };
    var current = null;
    return api;
  }

  function fieldInfo(el, f) {
    if (!el) return null;
    var out = { id: el.id || '', dataset: el.__pxDataset || {} };
    if (f && f.node) out.node = el;
    if (f && f.size) {
      var r = el.getBoundingClientRect();
      out.width = Math.round(r.width * 100) / 100;
      out.height = Math.round(r.height * 100) / 100;
    }
    if (f && f.rect) { var rr = rectInfo(el); out.left = rr.left; out.top = rr.top; out.right = rr.right; out.bottom = rr.bottom; }
    if (f && f.computedStyle) out.computedStyle = [];
    return out;
  }

  function rectInfo(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return {
      id: el.id || '',
      dataset: el.__pxDataset || {},
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100
    };
  }

  /* ---------- 系统信息 ---------- */
  function getWindowInfo() {
    var w = window.innerWidth || 375;
    var h = window.innerHeight || 667;
    var container = document.getElementById('px-root');
    var cw = container ? container.clientWidth : w;
    return {
      windowWidth: w,
      windowHeight: h,
      screenWidth: screen.width || w,
      screenHeight: screen.height || h,
      pixelRatio: window.devicePixelRatio || 2,
      statusBarHeight: 20,
      containerWidth: cw,
      safeArea: { top: 0, left: 0, right: w, bottom: h, width: w, height: h },
      platform: 'devtools'
    };
  }

  /* ---------- 存储 ---------- */
  function setStorageSync(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value === undefined ? null : value)); return true; }
    catch (e) { return false; }
  }
  function getStorageSync(key) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return '';
      return JSON.parse(raw);
    } catch (e) { return ''; }
  }
  function removeStorageSync(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  }

  /* ---------- 其它 ---------- */
  function setClipboardData(opts) {
    var o = opts || {};
    var text = o.data || '';
    var done = function () {
      if (typeof o.success === 'function') o.success({});
      if (typeof o.complete === 'function') o.complete({});
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
    return { errMsg: 'setClipboardData:ok' };
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function vibrateShort(opts) {
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    if (opts && typeof opts.success === 'function') opts.success({});
    if (opts && typeof opts.complete === 'function') opts.complete({});
  }

  function loadFontFace(opts) {
    var o = opts || {};
    if (!window.FontFace || !document.fonts) { if (typeof o.fail === 'function') o.fail({}); return; }
    try {
      var face = new FontFace(o.family || 'px', 'url(' + o.source + ')');
      face.load().then(function () {
        document.fonts.add(face);
        if (typeof o.success === 'function') o.success({});
      }, function () { if (typeof o.fail === 'function') o.fail({}); });
    } catch (e) { if (typeof o.fail === 'function') o.fail({}); }
  }

  var wx = {
    showToast: showToast,
    hideToast: function () { var el = document.getElementById('px-toast'); if (el) el.className = 'px-toast'; },
    showLoading: function (o) { showToast({ title: (o && o.title) || '加载中', duration: 60000 }); },
    hideLoading: function () { wx.hideToast(); },
    showModal: showModal,
    switchTab: function (o) { Router.switchTab(o && o.url); },
    navigateTo: function (o) { Router.push(o && o.url); },
    navigateBack: function (o) { Router.back(o && o.delta); },
    reLaunch: function (o) { Router.relaunch(o && o.url); },
    redirectTo: function (o) { Router.back(1); Router.push(o && o.url); },
    getWindowInfo: getWindowInfo,
    getSystemInfoSync: getWindowInfo,
    getSystemInfo: function (o) { var info = getWindowInfo(); if (o && o.success) setTimeout(function () { o.success(info); }, 0); },
    createSelectorQuery: createSelectorQuery,
    setStorageSync: setStorageSync,
    getStorageSync: getStorageSync,
    removeStorageSync: removeStorageSync,
    setClipboardData: setClipboardData,
    vibrateShort: vibrateShort,
    loadFontFace: loadFontFace,
    nextTick: function (fn) { setTimeout(fn, 0); },
    setNavigationBarTitle: function () {},
    stopPullDownRefresh: function () {},
    hideKeyboard: function () {}
  };

  global.wx = wx;
  global.PxBoot = {
    start: function () {
      var loading = document.getElementById('px-loading');
      if (loading) loading.parentNode.removeChild(loading);
      global.PxApp.start();
    }
  };
})(typeof window !== 'undefined' ? window : this);