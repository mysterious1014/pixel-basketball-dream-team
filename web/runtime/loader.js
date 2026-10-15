/* web/runtime/loader.js —— 内嵌源码的 CommonJS 加载器 + 模块注册表
 * 说明：H5 版直接复用小程序源码（utils/ store/ data/ config.js pages/ components/），
 *       这些模块写法是 CommonJS（require/module.exports），本加载器把构建脚本内嵌进来的
 *       源码文本用 new Function 包成模块执行，业务代码一行都不用改。
 * 纪律（2026-10-15 H5 改造方案 §6）：文件内不得出现外部资源地址；不得使用 ES module 语法。
 */
(function (global) {
  'use strict';

  var SRC = global.__PX_MODULES__ || {};
  var FILES = global.__PX_FILES__ || {};
  var cache = {};
  var stack = [];

  function resolve(fromPath, request) {
    var req = String(request);
    if (req.charAt(0) !== '.') return req.replace(/^\/+/, '');
    var dir = fromPath.split('/');
    dir.pop();
    var parts = req.split('/');
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === '' || seg === '.') continue;
      if (seg === '..') dir.pop();
      else dir.push(seg);
    }
    return dir.join('/');
  }

  function has(path) { return Object.prototype.hasOwnProperty.call(SRC, path); }

  function load(path) {
    if (Object.prototype.hasOwnProperty.call(cache, path)) return cache[path].exports;
    var key = path;
    if (!has(key) && has(key + '.js')) key = key + '.js';
    if (!has(key)) throw new Error('[px] module not found: ' + path);
    var mod = { exports: {} };
    cache[key] = mod;
    if (key !== path) cache[path] = mod;
    stack.push(key);
    try {
      var fn = new Function('require', 'module', 'exports', '__filename', '__dirname', SRC[key]);
      fn(
        function (req) { return load(resolve(key, req)); },
        mod,
        mod.exports,
        key,
        key.split('/').slice(0, -1).join('/')
      );
    } finally {
      stack.pop();
    }
    return mod.exports;
  }

  function currentPath() { return stack.length ? stack[stack.length - 1] : ''; }
  function file(path) { return FILES[path]; }
  function filesWithSuffix(suffix) {
    var out = [];
    Object.keys(FILES).forEach(function (k) { if (k.slice(-suffix.length) === suffix) out.push(k); });
    return out;
  }

  global.PxLoader = {
    load: load,
    file: file,
    filesWithSuffix: filesWithSuffix,
    currentPath: currentPath,
    resolve: resolve
  };
})(typeof window !== 'undefined' ? window : this);