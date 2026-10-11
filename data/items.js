/* data/items.js —— 道具与装备数据（第七章 7.5 装备 / 第九章 经济）
 * 职责：装备（球鞋/护腕/头带，给属性加成）+ 消耗品（突破碎片/体力/金币/招募券）。
 * 说明：MVP 装备通过「比赛奖励 + 商城（里程碑2）」获得，背包页可查看与装备。
 */

const SLOTS = {
  shoes: { key: 'shoes', name: '球鞋', icon: '👟' },
  wrist: { key: 'wrist', name: '护腕', icon: '🎽' },
  head: { key: 'head', name: '头带', icon: '🎀' }
};

const EQUIPMENT = [
  { id: 'shoes_rookie', name: '青训球鞋', slot: 'shoes', rarity: 'N', bonus: { speed: 1, accel: 1 }, desc: '训练营发的基础款，鞋底还有点硬。', price: 800 },
  { id: 'shoes_street', name: '街头战靴', slot: 'shoes', rarity: 'R', bonus: { speed: 2, accel: 2, vertical: 1 }, desc: '水泥地磨出来的抓地力。', price: 2400 },
  { id: 'shoes_pixel', name: '像素飞人鞋', slot: 'shoes', rarity: 'SR', bonus: { speed: 3, accel: 3, vertical: 3 }, desc: '16-bit 世界里最抢眼的配色。', price: 6800 },
  { id: 'shoes_hof', name: '名人堂战靴', slot: 'shoes', rarity: 'SSR', bonus: { speed: 5, accel: 4, vertical: 5, stamina: 2 }, desc: '殿堂级球员的专属签名鞋。', price: 16800 },

  { id: 'wrist_cotton', name: '棉质护腕', slot: 'wrist', rarity: 'N', bonus: { ft: 1, handle: 1 }, desc: '擦汗用的，也算装备。', price: 600 },
  { id: 'wrist_tape', name: '绷带护腕', slot: 'wrist', rarity: 'R', bonus: { ft: 2, handle: 2, mid: 1 }, desc: '老派球员的最爱。', price: 2000 },
  { id: 'wrist_pixel', name: '像素护腕', slot: 'wrist', rarity: 'SR', bonus: { ft: 3, handle: 3, mid: 2, three: 1 }, desc: '带点阵花纹，手感意外地稳。', price: 5600 },
  { id: 'wrist_hof', name: '冠军护腕', slot: 'wrist', rarity: 'SSR', bonus: { ft: 5, handle: 4, mid: 3, three: 3 }, desc: '戴过它的人都进了名人堂。', price: 15200 },

  { id: 'head_cloth', name: '吸汗头带', slot: 'head', rarity: 'N', bonus: { stamina: 1, defIQ: 1 }, desc: '不让汗水流进眼睛。', price: 700 },
  { id: 'head_retro', name: '复古发带', slot: 'head', rarity: 'R', bonus: { stamina: 2, defIQ: 2, offIQ: 1 }, desc: '80 年代球星的标配。', price: 2200 },
  { id: 'head_pixel', name: '像素头带', slot: 'head', rarity: 'SR', bonus: { stamina: 3, defIQ: 3, offIQ: 2, block: 1 }, desc: '戴上之后视野都变清晰了。', price: 6000 },
  { id: 'head_hof', name: '王朝头带', slot: 'head', rarity: 'SSR', bonus: { stamina: 5, defIQ: 4, offIQ: 4, block: 2, steal: 2 }, desc: '一个王朝的象征。', price: 16000 }
];

const CONSUMABLES = [
  { id: 'shard', name: '突破碎片', type: 'material', rarity: 'R', desc: '球员突破所需材料，比赛与任务产出。', stackMax: 9999 },
  { id: 'stamina_potion', name: '体力药水', type: 'stamina', value: 30, rarity: 'N', desc: '立即恢复 30 点体力。', price: 200, currency: 'diamond' },
  { id: 'gold_pack', name: '金币袋', type: 'gold', value: 5000, rarity: 'N', desc: '打开获得 5000 金币。', price: 100, currency: 'diamond' },
  { id: 'ticket_normal', name: '普通招募券', type: 'ticket', field: 'ticketNormal', rarity: 'R', desc: '普通招募 1 次。', price: 60, currency: 'diamond' },
  { id: 'ticket_advanced', name: '高级球探券', type: 'ticket', field: 'ticketAdvanced', rarity: 'SR', desc: '高级球探 1 次。', price: 300, currency: 'diamond' }
];

const INDEX = {};
EQUIPMENT.concat(CONSUMABLES).forEach(function (it) { INDEX[it.id] = it; });

/* 装备索引（utils/growth.js 用它算装备加成） */
const EQUIP_INDEX = {};
EQUIPMENT.forEach(function (it) { EQUIP_INDEX[it.id] = it; });

function getItem(id) { return INDEX[id] || null; }
function isEquipment(id) { return !!EQUIP_INDEX[id]; }
function equipmentOf(slot) { return EQUIPMENT.filter(function (it) { return it.slot === slot; }); }

module.exports = {
  SLOTS: SLOTS,
  EQUIPMENT: EQUIPMENT,
  CONSUMABLES: CONSUMABLES,
  INDEX: INDEX,
  EQUIP_INDEX: EQUIP_INDEX,
  getItem: getItem,
  isEquipment: isEquipment,
  equipmentOf: equipmentOf
};
