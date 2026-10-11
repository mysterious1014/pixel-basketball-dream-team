/* store/index.js —— Store 装配与持久化（第十一章「状态管理」单一出口）
 * 职责：极简发布订阅 + 单向数据流。init 读档 → dispatch 走 reducer → 通知订阅者 → 防抖落盘。
 * 约束：页面禁止直接读写全局变量；所有业务变更只能 dispatch Action 或调 commands。
 * 可测试性：storage 在无 wx 环境（Node）自动降级为内存，tools/verify.mjs 直接跑全流程。
 */
const storage = require('../utils/storage.js');
const CONFIG = require('../config.js');
const reducers = require('./reducers.js');
const initial = require('./initial-state.js');
const A = require('./actions.js');
const connect = require('./connect.js');
const commandsFactory = require('./commands.js');

let state = null;
let initialized = false;
const listeners = [];
let saveTimer = null;
const SAVE_DEBOUNCE = 260;

/* 版本迁移：以「新初始档」为骨架，把旧存档里存在的字段覆盖上去，
 * 这样新增字段自动拿默认值，缺字段也不会崩（比整档重置更友好） */
function migrate(saved, now) {
  const base = initial.createInitialState(now);
  if (!saved || typeof saved !== 'object') return base;
  const out = Object.assign({}, base);
  Object.keys(base).forEach(function (k) {
    if (saved[k] === undefined || saved[k] === null) return;
    if (k === 'profile' || k === 'roster' || k === 'gacha' || k === 'season' || k === 'bag' || k === 'settings' || k === 'stats' || k === 'arena' || k === 'evolution' || k === 'market' || k === 'dynasty' || k === 'daily') {
      out[k] = Object.assign({}, base[k], saved[k]);
      // 数组长度按当前配置补齐（工资帽/首发数变更时不留悬空）
      if (k === 'roster') {
        out.roster.starters = fixLen(saved.roster.starters, CONFIG.roster.starterCount);
        out.roster.bench = fixLen(saved.roster.bench, CONFIG.roster.benchCount);
        // 里程碑 2 新增字段：老存档没有 defense（战术克制），补默认 'auto'
        if (!require('../data/tactics.js').isDefenseKey(out.roster.defense)) out.roster.defense = 'auto';
      }
      if (k === 'arena') {
        // 里程碑 2 新增段：老存档整个 arena 缺失时上面的 Object.assign 已给出空壳，这里再补数组/对象形状
        out.arena.beaten = (saved.arena && saved.arena.beaten) || {};
        out.arena.history = (saved.arena && Array.isArray(saved.arena.history)) ? saved.arena.history : [];
        // 竞技商城限购账本（里程碑 2 消费出口）：老存档没有 ⇒ 空账本，等价于「一件都没买过」
        out.arena.shopBought = (saved.arena && saved.arena.shopBought && typeof saved.arena.shopBought === 'object') ? saved.arena.shopBought : {};
        // 加赛（里程碑 5）：老存档没有 ⇒ Object.assign 已给 0；脏形状（非数字 / 负数 / 小数）⇒ 归一为 ≥0 整数
        out.arena.extraToday = Math.max(0, Math.floor(Number(saved.arena && saved.arena.extraToday) || 0));
      }
      if (k === 'market') {
        // 里程碑 3 第二块：交易市场。老存档没有 ⇒ 上面的 Object.assign 已给出空壳；
        // 脏形状（非数字 / 负数 / 小数）⇒ 归一为 ≥0 整数，宁丢勿崩
        out.market.rerolls = Math.max(0, Math.floor(Number(saved.market && saved.market.rerolls) || 0));
      }
      if (k === 'dynasty') {
        // 里程碑 3 第三块：王朝赛季。老存档没有 ⇒ 上面的 Object.assign 已给出空壳（startKey = 建档当天的 dayKey）；
        // 脏形状（points 负数 / missions 非对象 / 非法 startKey / 假 claim 键）⇒ normalize 逐项归一，宁丢勿崩
        out.dynasty = require('../utils/dynasty.js').normalize(saved.dynasty, base.dynasty.startKey);
      }
      if (k === 'daily') {
        // 里程碑 4：每日任务。老存档没有 ⇒ 上面的 Object.assign 已给出空壳（dayKey = 建档当天的 dayKey）；
        // 脏形状（counters 非对象 / 键不在白名单 / 负数）⇒ normalize 逐项归一，宁丢勿崩
        out.daily = require('../utils/daily.js').normalize(saved.daily, base.daily.dayKey);
      }
      if (k === 'evolution') {
        // 里程碑 3 新增段：老存档没有 ⇒ 空账本（上面的 Object.assign 已给出空壳）；
        // 脏形状（shards 非对象 / 值为 NaN / 负数 / 非整数）⇒ 逐键归一，宁丢勿崩
        const rawShards = (saved.evolution && saved.evolution.shards) || {};
        const clean = {};
        if (rawShards && typeof rawShards === 'object' && !Array.isArray(rawShards)) {
          Object.keys(rawShards).forEach(function (pid) {
            const n = Math.floor(Number(rawShards[pid]) || 0);
            if (n > 0) clean[pid] = n;
          });
        }
        out.evolution.shards = clean;
      }
      if (k === 'gacha') {
        out.gacha.normal = Object.assign({}, base.gacha.normal, saved.gacha.normal || {});
        out.gacha.advanced = Object.assign({}, base.gacha.advanced, saved.gacha.advanced || {});
        out.gacha.history = Array.isArray(saved.gacha.history) ? saved.gacha.history : [];
      }
    } else if (k === 'collection') {
      out.collection = (saved.collection && typeof saved.collection === 'object') ? saved.collection : {};
    } else {
      out[k] = saved[k];
    }
  });
  out.schema = CONFIG.SAVE_SCHEMA;
  out.nextUid = Math.max(Number(saved.nextUid) || 1, countCollection(out.collection) + 1);
  return out;
}

function fixLen(arr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(arr && arr[i] ? arr[i] : null);
  return out;
}

function countCollection(collection) {
  let max = 0;
  Object.keys(collection || {}).forEach(function (uid) {
    const n = parseInt(String(uid).replace(/\D/g, ''), 10);
    if (isFinite(n) && n > max) max = n;
  });
  return max;
}

/* 初始化：优先读存档，读不到就建新档 */
function init(opts) {
  const o = opts || {};
  if (initialized && !o.force) return state;
  const now = Number(o.now) || Date.now();
  let saved = null;
  if (!o.fresh) saved = storage.get(CONFIG.SAVE_KEY, null);
  state = migrate(saved, now);
  initialized = true;
  if (!saved) save(true);
  return state;
}

function getState() {
  if (!initialized) init();
  return state;
}

function dispatch(action) {
  if (!initialized) init();
  if (!action || !action.type) return state;
  const next = reducers.reduce(state, action);
  if (next === state) return state;
  state = next;
  notify();
  save(false);
  return state;
}

function notify() {
  // 复制一份再遍历，避免订阅者在回调里退订导致数组错位
  const list = listeners.slice();
  for (let i = 0; i < list.length; i++) {
    try { list[i](state); } catch (e) { /* 单个订阅者异常不能拖垮整个 Store */ }
  }
}

function subscribe(fn) {
  if (typeof fn !== 'function') return function () {};
  listeners.push(fn);
  return function unsubscribe() {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

/* 防抖落盘：连续 dispatch 只写一次，避免真机 IO 卡顿 */
function save(immediate) {
  if (!initialized) return false;
  if (immediate) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return storage.set(CONFIG.SAVE_KEY, state);
  }
  if (saveTimer) return true;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    storage.set(CONFIG.SAVE_KEY, state);
  }, SAVE_DEBOUNCE);
  return true;
}

function flush() { return save(true); }

function listenerCount() { return listeners.length; }

/* 命令层注入 { getState, dispatch, save } */
const commands = commandsFactory.createCommands({ getState: getState, dispatch: dispatch, save: save });

module.exports = {
  init: init,
  getState: getState,
  dispatch: dispatch,
  subscribe: subscribe,
  save: save,
  flush: flush,
  listenerCount: listenerCount,
  migrate: migrate,
  connectPage: connect.connectPage,
  connectComponent: connect.connectComponent,
  actions: A,
  selectors: require('./selectors.js')
};

Object.keys(commands).forEach(function (k) { module.exports[k] = commands[k]; });
