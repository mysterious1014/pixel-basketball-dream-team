/* utils/storage.js —— 存储适配层（单一出口）
 * 职责：包一层 wx.setStorageSync/getStorageSync；在 Node（tools/verify.mjs 回归测试）里自动降级为内存实现，
 *       让 store/ 与 utils/ 的纯逻辑可以脱离小程序环境跑测试。
 * 约束：所有持久化只能走这里，禁止页面直接调 wx.*Storage。
 */

const memory = Object.create(null);

function hasWx() {
  return typeof wx !== 'undefined' && !!wx && typeof wx.getStorageSync === 'function';
}

function get(key, fallback) {
  try {
    if (hasWx()) {
      const v = wx.getStorageSync(key);
      return (v === '' || v === null || v === undefined) ? fallback : v;
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : fallback;
  } catch (e) {
    return fallback;
  }
}

function set(key, value) {
  try {
    if (hasWx()) { wx.setStorageSync(key, value); return true; }
    memory[key] = value;
    return true;
  } catch (e) {
    return false;
  }
}

function remove(key) {
  try {
    if (hasWx()) { wx.removeStorageSync(key); return true; }
    delete memory[key];
    return true;
  } catch (e) {
    return false;
  }
}

/* 仅测试用：清空内存降级存储 */
function __clearMemory() {
  Object.keys(memory).forEach(function (k) { delete memory[k]; });
}

module.exports = { get: get, set: set, remove: remove, __clearMemory: __clearMemory };
