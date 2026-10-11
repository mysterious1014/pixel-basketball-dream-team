/* utils/rng.js —— 确定性随机数（可复现比赛的基石）
 * 职责：字符串种子哈希(xmur3) + mulberry32 伪随机序列，提供 next/int/float/chance/pick/weighted/shuffle。
 * 为什么不用 Math.random：第七章结算公式 + 第十二章验收都要求「比赛结算可复现」，
 * 必须保证「同一 seed + 同一输入 ⇒ 逐回合完全一致」。抽卡也用它，便于回归测试概率与保底。
 */

/* 字符串 → 32 位整数种子 */
function hashSeed(str) {
  const s = String(str);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/* mulberry32：体积小、分布够用、完全确定 */
function createState(seedNum) {
  let a = seedNum >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 创建一个随机源实例 */
function createRng(seed) {
  const seedNum = typeof seed === 'number' ? (seed >>> 0) : hashSeed(seed);
  const nextRaw = createState(seedNum);

  return {
    seed: seed,
    seedNum: seedNum,
    /* [0,1) */
    next: function () { return nextRaw(); },
    /* 闭区间整数 [min,max] */
    int: function (min, max) {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi < lo) return lo;
      return lo + Math.floor(nextRaw() * (hi - lo + 1));
    },
    /* 浮点 [min,max) */
    float: function (min, max) { return min + nextRaw() * (max - min); },
    /* 概率命中：p ∈ [0,1] */
    chance: function (p) { return nextRaw() < p; },
    /* 等概率取一个元素 */
    pick: function (arr) {
      if (!arr || !arr.length) return undefined;
      return arr[Math.floor(nextRaw() * arr.length) % arr.length];
    },
    /* 按权重取一个元素，weightKey 默认 'w' */
    weighted: function (items, weightKey) {
      const key = weightKey || 'w';
      if (!items || !items.length) return undefined;
      let total = 0;
      for (let i = 0; i < items.length; i++) total += Math.max(0, Number(items[i][key]) || 0);
      if (total <= 0) return items[0];
      let r = nextRaw() * total;
      for (let i = 0; i < items.length; i++) {
        r -= Math.max(0, Number(items[i][key]) || 0);
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    /* 洗牌（不改动原数组） */
    shuffle: function (arr) {
      const out = (arr || []).slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(nextRaw() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    }
  };
}

/* 生成一个人类可读的对战种子（仅用于新开局；写入结果后即可复现该局） */
function newSeed(prefix) {
  const p = prefix || 'm';
  return p + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

module.exports = { createRng: createRng, hashSeed: hashSeed, newSeed: newSeed };
