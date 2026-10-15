/* web/runtime/wxss.js —— WXSS -> CSS 转换
 * 三件事：① rpx 换算成 calc(N * var(--px-rpx))（--px-rpx = 屏宽 / 750，等价小程序 750rpx 设计宽）；
 *         ② page 选择器映射到 body；③ 去注释。
 * 标签选择器（view / text / image / scroll-view）无需改写：渲染时保留原标签名，基础样式在 index.html 里补。
 */
(function (global) {
  'use strict';

  var COMMENT = /\/\*[\s\S]*?\*\//g;
  var RPX = /(-?\d*\.?\d+)rpx/g;

  function rpx(n) { return 'calc(' + n + ' * var(--px-rpx))'; }

  function convert(css) {
    var out = String(css == null ? '' : css).replace(COMMENT, '');
    out = out.replace(RPX, function (m, n) { return rpx(n); });
    out = out.replace(/(^|[}\s,])page(?=[\s,{:])/g, '$1body');
    return out;
  }

  /* 内联样式与 wxss 用同一套换算（模板里有 style="width:{{size}}rpx" 这种写法） */
  function convertInline(style) {
    return String(style == null ? '' : style).replace(RPX, function (m, n) { return rpx(n); });
  }

  global.PxWxss = { convert: convert, convertInline: convertInline };
})(typeof window !== 'undefined' ? window : this);