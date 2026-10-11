/* data/shop.js —— 竞技商城条目（里程碑 2「竞技币消费出口」）
 * 职责：只描述「卖什么、多少竞技币、限购几件、一次给几份」，不含任何购买逻辑。
 *       校验与落库在 store/reducers.js（ARENA_BUY），编排在 store/commands.js（buyArenaItem），
 *       展示视图在 store/selectors.js（shopView），规则口径在 config.arena.shop。
 *
 * 【为什么单独一个文件，不塞进 data/items.js】
 *   items.js 是「道具本身是什么」（名称 / 属性加成 / 稀有度），商城条目是「怎么卖」
 *   （价格 / 限购 / 一次给几份）。同一件道具在不同商店可以有不同价格与限购，两者是**一对多**关系，
 *   混在一起会让「改个售价」动到道具定义。时刻卡（data/moments.js）同理，这里只引用它的 id。
 *
 * 【kind 口径】
 *   'moment' —— 名场面时刻卡，ref = data/moments.js 的 id。**时刻卡只能在这里获得**（第八章差异化卖点，
 *               也是天梯的独占奖励：不打竞技场就永远拿不到）。
 *   'item'   —— data/items.js 里的道具，ref = 道具 id，qty = 一次购买到手数量。
 *
 * 【定价口径】竞技币日收入上限 = config.arena.dailyChallenges × coinPerWin = 5 × 20 = 100（全胜且不刷失败局）。
 *   下面的 price 就是按「多少个满收入日」倒推的：N≈1.5 天、R≈3 天、SR≈7 天、SSR≈15 天、UR≈32 天。
 *   UR 刻意压在 30 天量级 —— 与第九章「零氪 30 天可达全 SSR 阵容；UR 为长期追求」同一条曲线。
 * 【限购口径】limit = 终身可购件数（0 = 不限购）。因为 config.moment.uniqueInstance = true，
 *   一份卡只能一名球员戴 ⇒ limit 直接等于「最多几名球员能吃到这张卡」。
 *   SSR / UR 限 1 件是防崩坏的关键：一张「81 分之夜」够改变打法，五张就是数值碾压（config.arena.shop 裁决 3）。
 */

const momentsData = require('./moments.js');
const itemsData = require('./items.js');

const SHOP = [
  /* ---------------- 时刻卡：商城的核心商品，按稀有度从低到高 ---------------- */
  { id: 'sh_m_warmup', kind: 'moment', ref: 'm_warmup', price: 150, limit: 3, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_crowd', kind: 'moment', ref: 'm_crowd', price: 150, limit: 3, qty: 1, tag: '时刻卡' },

  { id: 'sh_m_and_one', kind: 'moment', ref: 'm_and_one', price: 320, limit: 3, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_fast_break', kind: 'moment', ref: 'm_fast_break', price: 320, limit: 3, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_corner_three', kind: 'moment', ref: 'm_corner_three', price: 320, limit: 3, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_second_wind', kind: 'moment', ref: 'm_second_wind', price: 320, limit: 3, qty: 1, tag: '时刻卡' },

  { id: 'sh_m_ankle', kind: 'moment', ref: 'm_ankle_breaker', price: 700, limit: 2, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_poster', kind: 'moment', ref: 'm_poster_dunk', price: 700, limit: 2, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_mid', kind: 'moment', ref: 'm_mid_master', price: 700, limit: 2, qty: 1, tag: '时刻卡' },
  { id: 'sh_m_clutch', kind: 'moment', ref: 'm_clutch_gene', price: 700, limit: 2, qty: 1, tag: '时刻卡' },

  { id: 'sh_m_35s', kind: 'moment', ref: 'm_35_seconds', price: 1500, limit: 1, qty: 1, tag: '时刻卡', hot: true },
  { id: 'sh_m_paint', kind: 'moment', ref: 'm_paint_monster', price: 1500, limit: 1, qty: 1, tag: '时刻卡' },

  { id: 'sh_m_81', kind: 'moment', ref: 'm_81_points', price: 3200, limit: 1, qty: 1, tag: '时刻卡', hot: true },
  { id: 'sh_m_triple', kind: 'moment', ref: 'm_triple_double', price: 3200, limit: 1, qty: 1, tag: '时刻卡' },

  /* ---------------- 养成补给：让打不动天梯的玩家也有稳定兑换出口（第九章「零氪有完整体验」） ---------------- */
  { id: 'sh_shard', kind: 'item', ref: 'shard', price: 120, limit: 0, qty: 5, tag: '补给' },
  { id: 'sh_stamina', kind: 'item', ref: 'stamina_potion', price: 90, limit: 0, qty: 1, tag: '补给' },
  { id: 'sh_ticket_adv', kind: 'item', ref: 'ticket_advanced', price: 400, limit: 0, qty: 1, tag: '补给' },
  { id: 'sh_gold', kind: 'item', ref: 'gold_pack', price: 60, limit: 0, qty: 2, tag: '补给' }
];

/* 商城分组的展示顺序（页面 tab / 分段标题用，避免在 WXML 里写死顺序） */
const TAGS = [
  { key: '时刻卡', name: '名场面时刻卡', desc: '天梯独占：改变打法的装备技能卡，只能在这里换到' },
  { key: '补给', name: '养成补给', desc: '碎片 / 体力 / 招募券，稳定兑换出口' }
];

const INDEX = {};
SHOP.forEach(function (s) { INDEX[s.id] = s; });

function getEntry(id) { return INDEX[id] || null; }
function entriesOf(tag) { return SHOP.filter(function (s) { return s.tag === tag; }); }

/* 条目的名称 / 描述 / 稀有度一律从被引用的对象解析，**不在本文件重复写一份** ——
 * 否则改了 moments.js 的卡名，商城里还是旧名，两处文案必然漂移（AGENTS.md §3 单一出口的同一条纪律）。
 * 解析不到时退回条目 id，保证任何界面都不会渲染出空白或 undefined（第三章：不得破图/空白）。 */
function targetOf(entry) {
  if (!entry) return null;
  if (entry.kind === 'moment') return momentsData.getMoment(entry.ref);
  return itemsData.getItem(entry.ref);
}

function nameOf(entry) {
  const t = targetOf(entry);
  return (t && t.name) || (entry && entry.ref) || '';
}

function descOf(entry) {
  const t = targetOf(entry);
  return (t && t.desc) || '';
}

function rarityOf(entry) {
  const t = targetOf(entry);
  return (t && t.rarity) || 'N';
}

module.exports = {
  SHOP: SHOP,
  COUNT: SHOP.length,
  TAGS: TAGS,
  INDEX: INDEX,
  getEntry: getEntry,
  entriesOf: entriesOf,
  targetOf: targetOf,
  nameOf: nameOf,
  descOf: descOf,
  rarityOf: rarityOf
};