/* web/runtime/wxml.js —— WXML 解析 / 编译 / 渲染（H5 版）
 * 覆盖面按本仓实测（2026-10-15 方案 §4）：{{}} 插值、wx:if/elif/else、wx:for(+item/index/key)、
 * block、bindtap/catchtap/bindchange/binderror、hover-class、slot、data-*、内联 style 里的 rpx。
 * 模板里没有方法调用（1299 个表达式全是属性访问 / 三元 / 逻辑 / 算术），所以用 with + 代理作用域求值即可。
 */
(function (global) {
  'use strict';

  var Wxss = global.PxWxss;

  /* ============ 1. 解析 ============ */
  var SELF_CLOSING = { image: 1, input: 1, br: 1, hr: 1, canvas: 0 };

  function findTagEnd(src, start) {
    var i = start + 1;
    var quote = null;
    while (i < src.length) {
      var c = src.charAt(i);
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') return i;
      i++;
    }
    return src.length;
  }

  function parseAttrs(str) {
    var out = [];
    var re = /([^\s=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|(\S+)))?/g;
    var m;
    while ((m = re.exec(str))) {
      var value = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : ''));
      out.push({ name: m[1], value: value });
    }
    return out;
  }

  function parse(src) {
    var root = { type: 'root', children: [] };
    var stack = [root];
    var i = 0;
    var text = String(src == null ? '' : src);

    function pushText(t) {
      if (!t) return;
      stack[stack.length - 1].children.push({ type: 'text', value: t });
    }

    while (i < text.length) {
      var lt = text.indexOf('<', i);
      if (lt === -1) { pushText(text.slice(i)); break; }
      if (lt > i) pushText(text.slice(i, lt));
      if (text.substr(lt, 4) === '<!--') {
        var cend = text.indexOf('-->', lt);
        i = cend === -1 ? text.length : cend + 3;
        continue;
      }
      var gt = findTagEnd(text, lt);
      var raw = text.slice(lt + 1, gt);
      var trimmed = raw.trim();
      var closing = trimmed.charAt(0) === '/';
      var selfClose = /\/$/.test(trimmed);
      var body = closing ? trimmed.slice(1) : trimmed.replace(/\/$/, '');
      var nameMatch = /^([A-Za-z][\w:-]*)/.exec(body);
      if (!nameMatch) { i = gt + 1; continue; }
      var tag = nameMatch[1];
      if (closing) {
        for (var s = stack.length - 1; s > 0; s--) {
          if (stack[s].tag === tag) { stack.length = s; break; }
        }
      } else {
        var node = {
          type: 'element',
          tag: tag,
          attrs: parseAttrs(body.slice(tag.length)),
          children: []
        };
        stack[stack.length - 1].children.push(node);
        if (!selfClose && !SELF_CLOSING[tag]) stack.push(node);
      }
      i = gt + 1;
    }
    return root;
  }

  /* ============ 2. 表达式求值 ============ */
  var exprCache = Object.create(null);
  var proxyCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function scopeProxy(scope) {
    if (!proxyCache || typeof Proxy === 'undefined') return scope;
    var p = proxyCache.get(scope);
    if (!p) {
      p = new Proxy(scope, {
        has: function () { return true; },
        get: function (t, k) { return t[k]; }
      });
      proxyCache.set(scope, p);
    }
    return p;
  }

  function evalExpr(expr, scope) {
    var key = String(expr == null ? '' : expr).trim();
    if (key === '') return '';
    /* wx:if / wx:elif / wx:else 的判据是「原始属性值」，带着 {{ }} 外壳传进来；
       不剥壳的话 new Function 直接语法错，条件恒为假（2026-10-15 首跑踩到：
       比赛页整页空白、雷达图永远走回退分支）。 */
    if (key.charAt(0) === '{' && key.slice(-2) === '}}') {
      var inner = key.slice(2, -2);
      if (inner.indexOf('{{') === -1) key = inner.trim();
    }
    if (key === '') return '';
    var fn = exprCache[key];
    if (!fn) {
      try {
        fn = new Function('__s', 'with(__s){ return (' + key + '); }');
      } catch (e) {
        fn = function () { return ''; };
      }
      exprCache[key] = fn;
    }
    try { return fn(scopeProxy(scope || {})); } catch (e) { return undefined; }
  }

  function isMustache(v) {
    return typeof v === 'string' && v.indexOf('{{') !== -1;
  }

  function interpolate(text, scope) {
    var s = String(text == null ? '' : text);
    if (s.indexOf('{{') === -1) return s;
    var out = '';
    var i = 0;
    while (i < s.length) {
      var open = s.indexOf('{{', i);
      if (open === -1) { out += s.slice(i); break; }
      out += s.slice(i, open);
      var close = s.indexOf('}}', open + 2);
      if (close === -1) { out += s.slice(open); break; }
      var v = evalExpr(s.slice(open + 2, close), scope);
      out += (v === undefined || v === null) ? '' : String(v);
      i = close + 2;
    }
    return out;
  }

  /* 属性求值（小程序语义）：整串就是一个 {{ }} 时返回「求值后的原始值」
     （数组 / 对象 / 数字 / 布尔），否则把各段文本拼成字符串。
     不做这一步，values="{{radarValues}}" 会被拼成 "76,82,..." 字符串，
     组件的 Array 属性拿不到数组（2026-10-15 首跑：雷达图六维全是 0）。 */
  function attrValue(raw, scope) {
    var s = String(raw == null ? '' : raw);
    var inner = s.slice(2, -2);
    var whole = s.slice(0, 2) === '{{' && s.slice(-2) === '}}' &&
      inner.indexOf('{{') === -1 && inner.indexOf('}}') === -1;
    return whole ? evalExpr(s, scope) : interpolate(raw, scope);
  }

  /* ============ 3. 渲染 ============ */
  var DIRECTIVE = {
    'wx:if': 1, 'wx:elif': 1, 'wx:else': 1, 'wx:for': 1,
    'wx:for-item': 1, 'wx:for-index': 1, 'wx:key': 1
  };

  var EVENT_MAP = {
    bindtap: 'tap', catchtap: 'tap',
    bindlongpress: 'longpress', catchlongpress: 'longpress',
    bindchange: 'change', catchchange: 'change',
    bindinput: 'input', bindconfirm: 'confirm',
    bindload: 'load', binderror: 'error',
    bindtouchstart: 'touchstart', bindtouchend: 'touchend'
  };

  var ASSET_RE = /^\/?assets\//;

  function fixAsset(src) {
    if (typeof src !== 'string' || src === '') return src;
    return src.charAt(0) === '/' ? src.slice(1) : src;
  }

  function datasetFromAttrs(attrs, scope) {
    var ds = {};
    for (var i = 0; i < attrs.length; i++) {
      var n = attrs[i].name;
      if (n.slice(0, 5) !== 'data-') continue;
      var key = n.slice(5).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
      var v = attrValue(attrs[i].value, scope);
      ds[key] = typeof v === 'string' ? coerce(v) : (v === undefined ? '' : v);
    }
    return ds;
  }

  function coerce(raw) {
    if (raw === '') return '';
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }

  var DOM_EVENT = {
    tap: 'click', longpress: 'contextmenu', change: 'change', input: 'input',
    confirm: 'confirm', load: 'load', error: 'error', touchstart: 'touchstart', touchend: 'touchend'
  };

  /* 事件绑定：bindX/catchX 落到 DOM 事件；处理器名在 owner（页面/组件实例）上取 */
  function bindEvent(el, attrName, handlerName, scope, ctx, stop) {
    var type = EVENT_MAP[attrName];
    if (!type) return;
    var domType = DOM_EVENT[type] || type;
    var dataset = datasetFromAttrs(el.__pxAttrs || [], scope);
    el.__pxDataset = dataset;
    el.addEventListener(domType, function (ev) {
      if (stop && ev.stopPropagation) ev.stopPropagation();
      var owner = ctx.owner;
      var fn = owner && owner[handlerName];
      if (typeof fn !== 'function') return;
      var detail = (ev.detail && typeof ev.detail === "object") ? ev.detail : {};
      if (type === 'input' && ev.target && typeof ev.target.value === 'string') detail = { value: ev.target.value };
      try {
        fn.call(owner, {
          type: type,
          timeStamp: Date.now(),
          currentTarget: { id: el.id || '', dataset: dataset },
          target: { id: el.id || '', dataset: dataset },
          detail: detail,
          touches: [],
          changedTouches: []
        });
      } catch (e) { console.error('[px] handler error:', handlerName, e); }
    }, false);
  }

  function applyAttrs(el, node, scope, ctx) {
    var attrs = node.attrs;
    el.__pxAttrs = attrs;
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name;
      if (DIRECTIVE[name]) continue;
      var rawValue = attrs[i].value;
      if (EVENT_MAP[name]) {
        bindEvent(el, name, interpolate(rawValue, scope), scope, ctx, name.indexOf('catch') === 0);
        continue;
      }
      if (name === 'hover-class') { el.__pxHover = interpolate(rawValue, scope); continue; }
      if (name === 'hover-start-time' || name === 'hover-stay-time') continue;
      var value = isMustache(rawValue) ? attrValue(rawValue, scope) : rawValue;
      if (name === 'class') {
        el.setAttribute('class', String(value == null ? '' : value));
      } else if (name === 'style') {
        var cssText = String(value == null ? '' : value);
        el.setAttribute('style', Wxss ? Wxss.convertInline(cssText) : cssText);
      } else if (name === 'src') {
        el.setAttribute('src', fixAsset(String(value == null ? '' : value)));
      } else if (name === 'checked' && el.__pxSwitch) {
        /* switch 的选中态由 switch 分支维护；写成 setAttribute('checked','false')
           会让 hasAttribute 恒为真，点击永远得到 false（2026-10-15 踩到） */
        continue;
      } else if (name === 'mode') {
        /* 小程序的 image mode：aspectFill/aspectFit 用 CSS 还原 */
        el.__pxMode = value;
      } else {
        el.setAttribute(name, value);
      }
    }
    if (el.tagName === 'IMG' || el.__pxMode) {
      var mode = el.__pxMode || 'scaleToFill';
      if (mode === 'aspectFill') { el.style.objectFit = 'cover'; el.style.width = '100%'; el.style.height = '100%'; }
      else if (mode === 'aspectFit') { el.style.objectFit = 'contain'; }
      else if (mode === 'widthFix') { el.style.width = '100%'; el.style.height = 'auto'; }
    }
    if (el.__pxHover) attachHover(el, scope, ctx);
  }

  function attachHover(el, scope, ctx) {
    if (el.__pxHoverBound) return;
    el.__pxHoverBound = true;
    var add = function () {
      var cls = el.__pxHover;
      if (cls) cls.split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
    };
    var remove = function () {
      var cls = el.__pxHover;
      if (cls) cls.split(/\s+/).forEach(function (c) { if (c) el.classList.remove(c); });
    };
    el.addEventListener('touchstart', add, { passive: true });
    el.addEventListener('touchend', remove);
    el.addEventListener('touchcancel', remove);
    el.addEventListener('mousedown', add);
    el.addEventListener('mouseup', remove);
    el.addEventListener('mouseleave', remove);
  }

  /* children：处理 wx:if / wx:elif / wx:else 兄弟联动 */
  function renderChildren(nodes, scope, ctx, parent) {
    var branch = false;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.type === 'element') {
        var map = attrMap(node);
        if (map['wx:if'] !== undefined) {
          branch = !!evalExpr(map['wx:if'], scope);
          if (branch) renderElement(node, scope, ctx, parent);
          continue;
        }
        if (map['wx:elif'] !== undefined) {
          if (branch) continue;
          branch = !!evalExpr(map['wx:elif'], scope);
          if (branch) renderElement(node, scope, ctx, parent);
          continue;
        }
        if (map['wx:else'] !== undefined) {
          if (branch) continue;
          branch = true;
          renderElement(node, scope, ctx, parent);
          continue;
        }
      }
      /* 纯空白文本节点不算「打断」：小程序里 wx:if 与 wx:else 之间换行缩进不影响配对。
         若把它当成普通节点，branch 会被重置成 false，于是 if 与 else 同时渲染
         （2026-10-15 踩到：立绘图片与回退占位同时出现在一张卡上）。 */
      if (node.type === 'text' && String(node.value == null ? '' : node.value).trim() === '') continue;
      branch = false;
      renderNode(node, scope, ctx, parent);
    }
  }

  var attrMapCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function attrMap(node) {
    if (attrMapCache) {
      var cached = attrMapCache.get(node);
      if (cached) return cached;
    }
    var map = {};
    for (var i = 0; i < node.attrs.length; i++) map[node.attrs[i].name] = node.attrs[i].value;
    if (attrMapCache) attrMapCache.set(node, map);
    return map;
  }

  function renderNode(node, scope, ctx, parent) {
    if (node.type === 'text') {
      parent.appendChild(document.createTextNode(interpolate(node.value, scope)));
      return;
    }
    var map = attrMap(node);
    if (map['wx:for'] !== undefined) {
      var list = evalExpr(map['wx:for'], scope);
      if (!list) return;
      if (!list.length && typeof list.length !== 'number') return;
      var itemName = map['wx:for-item'] || 'item';
      var indexName = map['wx:for-index'] || 'index';
      for (var k = 0; k < list.length; k++) {
        var child = Object.create(scope || {});
        child[itemName] = list[k];
        child[indexName] = k;
        renderElement(node, child, ctx, parent);
      }
      return;
    }
    renderElement(node, scope, ctx, parent);
  }

  function renderElement(node, scope, ctx, parent) {
    var tag = node.tag;
    if (tag === 'block') { renderChildren(node.children, scope, ctx, parent); return; }
    if (tag === 'slot') { renderSlot(node, scope, ctx, parent); return; }
    if (tag === 'template' || tag === 'import' || tag === 'include') return;

    var using = (ctx && ctx.using) || {};
    if (using[tag]) { renderComponent(node, scope, ctx, parent, using[tag]); return; }

    var el;
    if (tag === 'canvas') {
      var id = attrMap(node).id || '';
      var kept = ctx && ctx.preserve && ctx.preserve.canvas ? ctx.preserve.canvas[id] : null;
      if (kept) { el = kept; delete ctx.preserve.canvas[id]; }
      else el = document.createElement('canvas');
    } else if (tag === 'switch') {
      el = document.createElement('switch');
      el.__pxSwitch = true;
    } else if (tag === 'image') {
      el = document.createElement('img');
    } else {
      el = document.createElement(tag);
    }
    applyAttrs(el, node, scope, ctx);
    /* 小程序 <switch>：本仓只有设置页 3 个开关，但它必须能点、能回传 detail.value，
       否则「减少动效 / 音效 / 虚构化名」三个开关在 H5 里是死的。 */
    if (tag === 'switch') {
      el.__pxOn = !!attrValue(attrMap(node).checked, scope);
      if (el.__pxOn) el.setAttribute('checked', 'checked');
      el.addEventListener('click', function () {
        var next = !el.__pxOn;
        if (next) el.setAttribute('checked', 'checked'); else el.removeAttribute('checked');
        try {
          el.dispatchEvent(new CustomEvent('change', { detail: { value: next } }));
        } catch (e) {
          var ev2 = document.createEvent('CustomEvent');
          ev2.initCustomEvent('change', false, false, { value: next });
          el.dispatchEvent(ev2);
        }
      });
    }
    if (tag !== 'canvas') renderChildren(node.children, scope, ctx, el);
    if (tag === 'scroll-view' && ctx && ctx.preserve && ctx.preserve.scroll) {
      var tops = ctx.preserve.scroll;
      var top = tops.length ? tops.shift() : 0;
      if (top) { el.scrollTop = top; }
    }
    parent.appendChild(el);
  }

  function renderSlot(node, scope, ctx, parent) {
    var slots = ctx && ctx.slots;
    if (!slots) return;
    var content = slots.default || [];
    for (var i = 0; i < content.length; i++) {
      /* slot 内容用「父级作用域」渲染：渲染组件时把父 scope 记在 slots.scope 上 */
      renderNode(content[i], slots.scope || scope, slots.ctx || ctx, parent);
    }
  }

  /* ============ 4. 组件 ============ */
  function renderComponent(node, scope, ctx, parent, compPath) {
    var Registry = global.PxRegistry;
    if (Registry && Registry.ensure) Registry.ensure(compPath);
    var config = Registry && Registry.components[compPath];
    var host = document.createElement(node.tag);
    applyAttrs(host, node, scope, ctx);
    if (!config) { renderChildren(node.children, scope, ctx, host); parent.appendChild(host); return; }

    var inst = Registry.createComponent(compPath, config, node, scope, ctx);
    /* slot 内容：用父级作用域渲染 */
    var slotCtx = {
      owner: ctx.owner,
      using: ctx.using,
      preserve: {},
      slots: null,
      scope: scope,
      ctx: ctx
    };
    inst.__pxSlotScope = scope;
    inst.__pxSlotCtx = slotCtx;
    inst.__host = host;
    inst.__pxRenderBody();
    parent.appendChild(host);
    Registry.attachComponent(inst);
    return;
  }

  /* ============ 5. 对外 API ============ */
  function renderInto(container, nodes, scope, ctx) {
    var list = ctx && ctx.preserve ? ctx.preserve : null;
    if (list && list.scroll) {
      var prev = container.querySelectorAll('scroll-view');
      list.scroll = [];
      for (var i = 0; i < prev.length; i++) list.scroll.push(prev[i].scrollTop);
    }
    if (list && list.canvas) {
      var canvases = container.querySelectorAll('canvas');
      for (var c = 0; c < canvases.length; c++) {
        var cv = canvases[c];
        if (cv.id) { list.canvas[cv.id] = cv; }
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      }
    }
    while (container.firstChild) container.removeChild(container.firstChild);
    renderChildren(nodes, scope, ctx, container);
  }

  global.PxWxml = {
    parse: parse,
    attrValue: attrValue,
    evalExpr: evalExpr,
    interpolate: interpolate,
    renderNodes: renderChildren,
    renderInto: renderInto,
    attrMap: attrMap
  };
})(typeof window !== 'undefined' ? window : this);