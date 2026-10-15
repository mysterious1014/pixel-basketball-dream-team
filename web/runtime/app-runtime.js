/* web/runtime/app-runtime.js —— App / Page / Component 注册与实例化、模板装配、页面栈与 tabBar
 * 目标：让 pages/ 与 components/ 的源码零改动地在浏览器里跑起来。
 */
(function (global) {
  'use strict';

  var Loader = global.PxLoader;
  var Wxml = global.PxWxml;
  var Wxss = global.PxWxss;

  var Registry = {
    pages: {},        // route -> config
    components: {},   // path -> config
    templates: {},    // 'pages/home/home' -> nodes
    usingCache: {},   // path -> { tag: compPath }
    app: null,
    appPath: ''
  };
  global.PxRegistry = Registry;

  function stripExt(p) { return String(p).replace(/\.js$/, ''); }

  function jsonOf(path) {
    var src = Loader.file(path + '.json');
    if (!src) return {};
    try { return JSON.parse(src); } catch (e) { return {}; }
  }

  /* 按需加载模块：页面 / 组件源码只在第一次用到时执行（等价小程序的用时加载）。
     没这一步 Registry.pages / Registry.components 永远是空的（2026-10-15 首跑踩到：
     主页只报 "page not registered"，页面白屏）。 */
  var injectedStyles = {};
  /* 组件 WXSS 注入：小程序里组件样式默认只作用于自身，本仓 5 个组件的类名前缀互不重叠
     （rb__ / rc__ / pc__ / pp__ / pg__），所以统一注入 <head> 即可，不必做样式隔离。
     漏了这一步组件会「裸奔」：resource-bar 直接掉成一列纯文本（2026-10-15 首跑踩到）。 */
  function injectComponentStyle(key) {
    if (injectedStyles[key]) return;
    injectedStyles[key] = true;
    var css = Wxss.convert(Loader.file(key + '.wxss') || '');
    if (!css.trim()) return;
    var style = document.createElement('style');
    style.setAttribute('data-component', key);
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensure(path) {
    var key = stripExt(path);
    if (Registry.pages[key] || Registry.components[key]) return true;
    try {
      Loader.load(key + '.js');
      if (Registry.components[key]) injectComponentStyle(key);
      return true;
    } catch (e) {
      console.error('[px] module load failed: ' + key, e);
      return false;
    }
  }
  Registry.ensure = ensure;

  function usingOf(path) {
    if (Registry.usingCache[path]) return Registry.usingCache[path];
    var out = {};
    var map = jsonOf(path).usingComponents || {};
    Object.keys(map).forEach(function (tag) {
      var v = map[tag];
      if (!v) return;
      out[tag] = stripExt(v.charAt(0) === '/' ? v.slice(1) : Loader.resolve(path + '.json', v));
    });
    Registry.usingCache[path] = out;
    return out;
  }

  function templateOf(path) {
    if (Registry.templates[path]) return Registry.templates[path];
    var src = Loader.file(path + '.wxml') || '';
    Registry.templates[path] = Wxml.parse(src);
    return Registry.templates[path];
  }

  /* ===== 注册（模块加载时被调用） ===== */
  global.App = function (config) {
    Registry.app = config;
    Registry.appPath = Loader.currentPath();
  };
  global.Page = function (config) {
    Registry.pages[stripExt(Loader.currentPath())] = config;
  };
  global.Component = function (config) {
    Registry.components[stripExt(Loader.currentPath())] = config;
  };
  global.getApp = function () { return Registry.app; };

  /* ===== 通用小工具 ===== */
  function setByPath(obj, path, value) {
    if (path.indexOf('.') === -1 && path.indexOf('[') === -1) { obj[path] = value; return; }
    var parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] === undefined || cur[k] === null) cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function mergeData(target, patch, data) {
    Object.keys(patch || {}).forEach(function (k) { setByPath(data, k, patch[k]); });
  }

  /* ===== 页面实例 ===== */
  function createPage(route, options) {
    if (!Registry.pages[route]) ensure(route);
    var config = Registry.pages[route];
    if (!config) return null;
    var inst = {};
    Object.keys(config).forEach(function (k) {
      if (typeof config[k] === 'function') inst[k] = config[k];
    });
    inst.route = route;
    inst.options = options || {};
    inst.data = {};
    var data0 = config.data || {};
    Object.keys(data0).forEach(function (k) { inst.data[k] = data0[k]; });
    inst.__pxConfig = config;
    inst.__pxContainer = document.createElement('div');
    inst.__pxContainer.className = 'px-page';
    inst.__pxCtx = { owner: inst, using: usingOf(route), preserve: null, slots: null };

    inst.setData = function (patch, cb) {
      mergeData(inst.data, patch, inst.data);
      inst.__pxRender();
      if (typeof cb === 'function') cb.call(inst);
    };
    inst.selectComponent = function () { return null; };
    inst.selectAllComponents = function () { return []; };
    inst.__pxRender = function () {
      inst.__pxCtx.preserve = { canvas: {}, scroll: [] };
      Wxml.renderInto(inst.__pxContainer, templateOf(route).children, inst.data, inst.__pxCtx);
      syncTabBar(route);
    };
    return inst;
  }

  /* ===== 组件实例 ===== */
  function createComponent(path, config, node, parentScope, parentCtx) {
    var inst = {};
    var props = {};
    var defs = config.properties || {};
    var attrs = {};
    (node.attrs || []).forEach(function (a) { attrs[a.name] = a.value; });
    Object.keys(defs).forEach(function (key) {
      var def = defs[key] || {};
      var raw = attrs[key];
      if (raw === undefined) raw = attrs[key.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); })];
      if (raw === undefined) { props[key] = def.value; return; }
      var val = Wxml.attrValue ? Wxml.attrValue(raw, parentScope) : Wxml.interpolate(raw, parentScope);
      props[key] = coerceType(val, def.type);
    });
    inst.data = {};
    Object.keys(config.data || {}).forEach(function (k) { inst.data[k] = config.data[k]; });
    Object.keys(props).forEach(function (k) { inst.data[k] = props[k]; });
    inst.properties = props;
    inst.__pxPath = path;
    inst.__pxConfig = config;
    inst.__pxSlotScope = parentScope;
    inst.__pxSlotCtx = parentCtx;

    var methods = config.methods || {};
    Object.keys(methods).forEach(function (k) { inst[k] = methods[k]; });
    Object.keys(config).forEach(function (k) {
      if (typeof config[k] === 'function' && k !== 'attached' && k !== 'ready' && k !== 'detached') inst[k] = config[k];
    });

    inst.setData = function (patch, cb) {
      mergeData(inst.data, patch, inst.data);
      if (inst.__pxRenderBody) inst.__pxRenderBody();
      if (typeof cb === 'function') cb.call(inst);
    };
    inst.triggerEvent = function (name, detail) {
      if (inst.__host) {
        try {
          inst.__host.dispatchEvent(new CustomEvent(name, { detail: detail === undefined ? {} : detail, bubbles: false }));
        } catch (e) {
          var ev = document.createEvent('CustomEvent');
          ev.initCustomEvent(name, false, false, detail);
          inst.__host.dispatchEvent(ev);
        }
      }
    };
    inst.selectComponent = function () { return null; };
    inst.selectAllComponents = function () { return []; };
    inst.__pxRenderBody = function () {
      var host = inst.__host;
      if (!host) return;
      inst.__pxCtx.preserve = { canvas: {}, scroll: [] };
      /* 保留 host（外部 class/样式所在），只重画组件模板内容 */
      Wxml.renderInto(host, templateOf(path).children, inst.data, inst.__pxCtx);
    };
    inst.__pxCtx = {
      owner: inst,
      using: usingOf(path),
      preserve: null,
      slots: { default: node.children, scope: parentScope, ctx: parentCtx },
      get slotScope() { return inst.__pxSlotScope; }
    };
    /* slot 内容需要父作用域：渲染器读 ctx.slots */
    inst.__pxCtx.slots = { default: node.children, scope: parentScope, ctx: parentCtx };
    return inst;
  }

  function coerceType(val, type) {
    if (val === undefined || val === null || val === '') return val;
    if (type === Number) { var n = Number(val); return isNaN(n) ? 0 : n; }
    if (type === Boolean) return val === 'true' || val === true || val === '1';
    /* Array / Object 属性：整串 {{ }} 时已是真值，直接透传；纯文本再兜底解析一次 */
    if (type === Array) {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try { var j = JSON.parse(val); if (Array.isArray(j)) return j; } catch (e) {}
        return val.split(',').map(function (x) { return Number(x); });
      }
      return [];
    }
    if (type === Object) return (val && typeof val === 'object') ? val : {};
    return String(val);
  }

  function attachComponent(inst) {
    var cfg = inst.__pxConfig || {};
    var lts = cfg.lifetimes || {};
    var attached = lts.attached || cfg.attached;
    var ready = lts.ready || cfg.ready;
    var observers = cfg.observers || {};
    /* 属性观察者：初始化时按当前属性值触发一次（等价小程序初次属性设置） */
    Object.keys(observers).forEach(function (key) {
      if (typeof observers[key] !== 'function') return;
      if (inst.data[key] === undefined) return;
      try { observers[key].apply(inst, [inst.data[key]]); } catch (e) {}
    });
    if (typeof attached === 'function') { try { attached.call(inst); } catch (e) { console.error('[px] attached error', inst.__pxPath, e); } }
    if (typeof ready === 'function') { try { ready.call(inst); } catch (e) {} }
  }

  function detachComponent(inst) {
    var cfg = inst.__pxConfig || {};
    var lts = cfg.lifetimes || {};
    var detached = lts.detached || cfg.detached;
    if (typeof detached === 'function') { try { detached.call(inst); } catch (e) {} }
  }

  Registry.createComponent = createComponent;
  Registry.attachComponent = attachComponent;
  Registry.detachComponent = detachComponent;

  /* ===== 页面栈 / 路由 ===== */
  var stack = [];
  var TAB_ROUTES = null;
  var tabbarEl = null;

  function tabRoutes() {
    if (TAB_ROUTES) return TAB_ROUTES;
    var app = jsonOf('__app__');
    TAB_ROUTES = [];
    return TAB_ROUTES;
  }

  function parseUrl(url) {
    var s = String(url || '');
    var q = s.indexOf('?');
    var route = q === -1 ? s : s.slice(0, q);
    var query = {};
    if (q !== -1) {
      s.slice(q + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = i === -1 ? kv : kv.slice(0, i);
        var v = i === -1 ? '' : decodeURIComponent(kv.slice(i + 1));
        query[k] = v;
      });
    }
    return { route: route.replace(/^\//, ''), query: query };
  }

  function mountPage(route, query) {
    var inst = createPage(route, query);
    if (!inst) { console.warn('[px] page not registered: ' + route); return null; }
    inst.__pxStyle = injectPageStyle(route);
    root().appendChild(inst.__pxContainer);
    inst.__pxMounted = true;
    if (typeof inst.onLoad === 'function') inst.onLoad.call(inst, query);
    if (typeof inst.onShow === 'function') inst.onShow.call(inst);
    if (typeof inst.onReady === 'function') inst.onReady.call(inst);
    return inst;
  }

  function root() {
    var el = document.getElementById('px-root');
    return el;
  }

  function injectPageStyle(route) {
    var css = Wxss.convert(Loader.file(route + '.wxss') || '');
    if (!css.trim()) return null;
    var style = document.createElement('style');
    style.setAttribute('data-page', route);
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }

  function current() { return stack.length ? stack[stack.length - 1] : null; }

  /* ===== 导航栏 + 浏览器历史（H5 专有） ===== */
  var navEl = null;
  function syncNavBar() {
    if (!navEl) navEl = document.getElementById('px-nav');
    if (!navEl) return;
    var cur = current();
    var conf = cur ? jsonOf(cur.route) : {};
    var title = conf.navigationBarTitleText || '';
    navEl.style.background = conf.navigationBarBackgroundColor || '#070c1c';
    var dark = conf.navigationBarTextStyle === 'black';
    var color = dark ? '#0d1530' : '#e8ecff';
    navEl.querySelector('.px-nav__title').textContent = title;
    navEl.querySelector('.px-nav__title').style.color = color;
    navEl.querySelector('.px-nav__back').style.color = color;
    if (stack.length > 1) navEl.className = 'px-nav px-nav--back';
    else navEl.className = 'px-nav';
  }

  var histArmed = false;
  function armHistory() {
    if (histArmed) return;
    histArmed = true;
    try {
      history.replaceState({ px: 0 }, '');
      history.pushState({ px: 1 }, '');
    } catch (e) {}
  }
  function pushHistory() { try { history.pushState({ px: history.length }, ''); } catch (e) {} }
  function goBack() {
    /* 优先走历史：让 WebView 的物理返回键与页内返回箭头共用同一条路径 */
    try { if (history.length > 1) { history.back(); return; } } catch (e) {}
    if (stack.length > 1) Router.back(1);
    syncNavBar();
  }
  global.PxNavBack = goBack;
  global.getCurrentPages = function () { return stack.slice(); };
  function onPop() {
    if (stack.length > 1) Router.back(1);
    else armHistoryForce();
    syncNavBar();
  }
  function armHistoryForce() { try { history.pushState({ px: 1 }, ''); } catch (e) {} }
  window.addEventListener('popstate', function () { onPop(); });
  (function bindNavBack() {
    var el = document.getElementById('px-nav');
    if (!el) return;
    var btn = el.querySelector('.px-nav__back');
    if (btn) btn.addEventListener('click', function (ev) { if (ev.stopPropagation) ev.stopPropagation(); goBack(); });
  })();

  function hidePage(inst) {
    if (!inst || !inst.__pxMounted) return;
    if (typeof inst.onHide === 'function') inst.onHide.call(inst);
    inst.__pxContainer.style.display = 'none';
  }

  function showPage(inst) {
    if (!inst || !inst.__pxMounted) return;
    inst.__pxContainer.style.display = '';
    if (typeof inst.onShow === 'function') inst.onShow.call(inst);
  }

  function unmountPage(inst) {
    if (!inst || !inst.__pxMounted) return;
    if (typeof inst.onUnload === 'function') inst.onUnload.call(inst);
    if (inst.__pxStyle && inst.__pxStyle.parentNode) inst.__pxStyle.parentNode.removeChild(inst.__pxStyle);
    if (inst.__pxContainer.parentNode) inst.__pxContainer.parentNode.removeChild(inst.__pxContainer);
    inst.__pxMounted = false;
  }

  var Router = {
    tabRoutes: [],
    setTabRoutes: function (list) { Router.tabRoutes = list || []; },
    isTab: function (route) { return Router.tabRoutes.indexOf(route) !== -1; },
    push: function (url) {
      var p = parseUrl(url);
      var inst = mountPage(p.route, p.query);
      if (!inst) return false;
      hidePage(current());
      stack.push(inst);
      syncTabBar(p.route);
      syncNavBar();
      pushHistory();
      return true;
    },
    switchTab: function (url) {
      var p = parseUrl(url);
      while (stack.length) unmountPage(stack.pop());
      var inst = mountPage(p.route, p.query);
      if (!inst) return false;
      stack.push(inst);
      syncTabBar(p.route);
      syncNavBar();
      pushHistory();
      return true;
    },
    back: function (delta) {
      var n = delta || 1;
      while (n-- > 0 && stack.length > 1) unmountPage(stack.pop());
      showPage(current());
      syncTabBar(current() ? current().route : '');
      syncNavBar();
      return true;
    },
    relaunch: function (url) {
      while (stack.length) unmountPage(stack.pop());
      return Router.push(url);
    },
    current: current,
    stackDepth: function () { return stack.length; }
  };
  global.PxRouter = Router;

  /* ===== tabBar ===== */
  function syncTabBar(route) {
    if (!tabbarEl) return;
    var bar = Router.tabBar;
    if (!bar || !bar.list) return;
    var isTab = Router.isTab(route);
    tabbarEl.style.display = isTab ? '' : 'none';
    if (!isTab) return;
    Array.prototype.forEach.call(tabbarEl.children, function (item, i) {
      var on = bar.list[i] && bar.list[i].pagePath === route;
      item.classList.toggle('px-tab--on', !!on);
      var img = item.querySelector('img');
      if (img && bar.list[i]) img.setAttribute('src', (on ? bar.list[i].selectedIconPath : bar.list[i].iconPath).replace(/^\//, ''));
      var label = item.querySelector('.px-tab-label');
      if (label && bar.list[i]) {
        label.textContent = bar.list[i].text;
        label.style.color = on ? (bar.selectedColor || '#fff') : (bar.color || '#888');
      }
    });
  }

  function buildTabBar(bar) {
    Router.tabBar = bar;
    var el = document.getElementById('px-tabbar');
    if (!el || !bar || !bar.list) return;
    tabbarEl = el;
    el.style.background = bar.backgroundColor || '#111';
    el.style.borderTopColor = bar.borderStyle === 'black' ? '#000' : (bar.borderStyle || '#333');
    el.innerHTML = '';
    bar.list.forEach(function (item) {
      var cell = document.createElement('div');
      cell.className = 'px-tab';
      var img = document.createElement('img');
      img.className = 'px-tab-icon';
      img.setAttribute('src', (item.iconPath || '').replace(/^\//, ''));
      var label = document.createElement('span');
      label.className = 'px-tab-label';
      label.textContent = item.text || '';
      cell.appendChild(img);
      cell.appendChild(label);
      cell.addEventListener('click', function () { Router.switchTab('/' + item.pagePath); });
      el.appendChild(cell);
    });
    syncTabBar(current() ? current().route : '');
  }

  Registry.buildTabBar = buildTabBar;
  Registry.syncTabBar = syncTabBar;
  Registry.json = jsonOf;

  /* ===== 启动 ===== */
  function start() {
    var appJson = Loader.file('app.json');
    if (!appJson) { document.body.innerHTML = '<pre>缺少 app.json</pre>'; return; }
    var appConf = JSON.parse(appJson);
    injectAppStyle();
    Registry.buildTabBar(appConf.tabBar);
    Router.setTabRoutes((appConf.tabBar && appConf.tabBar.list || []).map(function (i) { return i.pagePath; }));
    /* app.js：触发 App() 注册与 onLaunch */
    Loader.load('app.js');
    var app = Registry.app;
    if (app && typeof app.onLaunch === 'function') {
      try { app.onLaunch.call(app, {}); } catch (e) { console.error('[px] onLaunch error', e); }
    }
    if (app && typeof app.onShow === 'function') { try { app.onShow.call(app, {}); } catch (e) {} }
    /* 入口：优先 hash，其次 app.json 第一个页面 */
    var hash = (location.hash || '').replace(/^#/, '');
    var entry = hash || ('/' + (appConf.pages[0] || 'pages/home/home'));
    var p = parseUrl(entry);
    var inst = mountPage(p.route, p.query);
    if (inst) stack.push(inst);
    syncTabBar(p.route);
    syncNavBar();
    armHistory();
    window.addEventListener('hashchange', function () {
      var cur = current();
      var want = (location.hash || '').replace(/^#/, '').replace(/^\//, '');
      if (cur && want && cur.route === want) return;
    });
  }

  var appStyleInjected = false;
  function injectAppStyle() {
    if (appStyleInjected) return;
    appStyleInjected = true;
    var css = Wxss.convert(Loader.file('app.wxss') || '');
    var style = document.createElement('style');
    style.setAttribute('data-app', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  global.PxApp = { start: start, Registry: Registry, Router: Router };
})(typeof window !== 'undefined' ? window : this);