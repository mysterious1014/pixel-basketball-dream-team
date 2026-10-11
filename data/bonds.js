/* data/bonds.js —— 羁绊内容定义（第七章 7.3，里程碑 2）
 * 职责：只描述「哪些人之间有什么羁绊、加多少」，不含任何判定逻辑。
 *       判定与叠加规则在 utils/bond.js，数值口径（档位门槛、上限、开关）在 config.bond。
 *
 * 【四类羁绊】文档 7.3 原文：同队羁绊、同届羁绊、宿敌羁绊、组合连线（如"水花组合"三分 +12%）。
 *   - 同队 / 同届：规则型，由 config.bond.teamTiers / eraTiers 描述，不需要在本文件枚举（球队与多少年
 *     选秀是 data/players.js 的字段），本文件只放需要点名的两类。
 *   - 宿敌（RIVALS）/ 组合连线（COMBOS）：内容型，逐条点名 playerId。
 *
 * 【bonus 口径】键 = config.attrs.keys 里的属性名，值 = 百分比加成（tools/verify.mjs H 组会校验键合法性）。
 *   与 data/items.js 的装备 bonus 同一套写法，只是装备是加「点数」、羁绊是加「百分比」。
 * 【合规】宿敌 / 组合的名称与描述全部是原创球探报告口吻，不声称来自 NBA 官方、2K 或任何商业数据源；
 *   不含任何真实联赛 / 球队商标与 Logo。
 * 【匹配口径】按 playerId 匹配，不按 cardId —— 同一名球员的任意版本（新秀 / 现役 / 巅峰传奇）都能触发，
 *   这正是第五章 5.1「版本系统」与羁绊系统的交叉点：换一个版本可能激活/断开同队羁绊，但组合连线不受影响。
 */

/* ---------------- 宿敌羁绊：两人同时在场即激活，对这两人各自生效 ---------------- */
/* 加成统一取 config.bond.rivalBonus（规则型数值，不在这里逐条写死） */
const RIVALS = [
  {
    id: 'rival_showtime_vs_celtics', name: '八十年代双雄', members: ['johnson_magic', 'bird_larry'],
    desc: '一个把表演带进球场，一个把倔强刻进骨头，十年里谁也不肯让对方独自站在山顶。'
  },
  {
    id: 'rival_flying_heir', name: '飞人传承', members: ['jordan_michael', 'bryant_kobe'],
    desc: '后辈把前辈的每一个动作都学了下来，然后用它去挑战前辈本人。'
  },
  {
    id: 'rival_finals_foes', name: '总决赛宿敌', members: ['curry_stephen', 'james_lebron'],
    desc: '连续几年在最高的舞台上正面相撞，胜负早就超出了比分本身。'
  },
  {
    id: 'rival_thunder_grudge', name: '雷霆旧怨', members: ['durant_kevin', 'westbrook_russell'],
    desc: '曾经并肩的两个人，从此每一次对话都带着火气。'
  },
  {
    id: 'rival_2001_finals', name: '二零零一之战', members: ['iverson_allen', 'bryant_kobe'],
    desc: '答案跨过倒在地上的对手，也把那段系列赛变成了传说。'
  },
  {
    id: 'rival_big_centers', name: '中锋之争', members: ['yao_ming', 'oneal_shaquille'],
    desc: '东方的技术流巨人和西方的力量型霸主，在禁区里互相试探底细。'
  },
  {
    id: 'rival_mvp_debate', name: '最有价值之争', members: ['antetokounmpo_giannis', 'jokic_nikola'],
    desc: '两种截然不同的统治方式，每年都要被拿来放在同一张桌上比较。'
  },
  {
    id: 'rival_power_forwards', name: '大前锋之争', members: ['garnett_kevin', 'duncan_tim'],
    desc: '一个用怒吼点燃全场，一个用沉默拿下胜利，谁都不服谁。'
  }
];

/* ---------------- 组合连线：members 全部在场即激活，对全体成员生效 ---------------- */
const COMBOS = [
  {
    id: 'combo_three_rain', name: '三分雨夜', members: ['curry_stephen', 'lillard_damian'],
    bonus: { three: 12 }, desc: '两个能在半场外出手的射手同时在场，防守线被迫拉到中圈。'
  },
  {
    id: 'combo_ok_duo', name: '禁区双霸', members: ['oneal_shaquille', 'bryant_kobe'],
    bonus: { inside: 10, dunk: 8 }, desc: '一内一外的经典搭配，包夹谁都是错。'
  },
  {
    id: 'combo_bulls_dynasty', name: '王朝侧翼', members: ['jordan_michael', 'pippen_scottie'],
    bonus: { defIQ: 8, steal: 8 }, desc: '最强的外线防守组合，对手的每一次传球都要冒险。'
  },
  {
    id: 'combo_twin_towers', name: '双塔禁区', members: ['olajuwon_hakeem', 'yao_ming'],
    bonus: { block: 10, dreb: 8 }, desc: '禁区里站着两座塔，突破进去就是抬头看天。'
  },
  {
    id: 'combo_cavs_duo', name: '骑士双核', members: ['james_lebron', 'irving_kyrie'],
    bonus: { pass: 8, handle: 8 }, desc: '一个负责把球送到最合理的地方，一个负责把不合理变成合理。'
  },
  {
    id: 'combo_euro_cores', name: '欧洲双核', members: ['jokic_nikola', 'doncic_luka'],
    bonus: { pass: 10, offIQ: 8 }, desc: '两双最会读比赛的眼睛，节奏全在他们手里。'
  },
  {
    id: 'combo_scorers', name: '得分狂人', members: ['bryant_kobe', 'mcgrady_tracy'],
    bonus: { mid: 10, dunk: 6 }, desc: '手感来了谁也拦不住，两个人可以在同一晚把分数刷爆。'
  },
  {
    id: 'combo_hangtime', name: '飞人表亲', members: ['carter_vince', 'mcgrady_tracy'],
    bonus: { dunk: 12, vertical: 6 }, desc: '同一家族的两个飞行者，篮筐对他们来说太低了。'
  },
  {
    id: 'combo_celtic_blood', name: '绿军铁血', members: ['bird_larry', 'garnett_kevin'],
    bonus: { three: 6, strength: 8 }, desc: '同一件球衣的两个时代，共同点是绝不后退一步。'
  },
  {
    id: 'combo_new_wings', name: '新生代锋线', members: ['antetokounmpo_giannis', 'tatum_jayson'],
    bonus: { inside: 8, vertical: 6 }, desc: '长臂与弹跳的组合，攻守两端都能覆盖三个位置。'
  },
  {
    id: 'combo_dual_guards', name: '双能卫线', members: ['doncic_luka', 'gilgeous_alexander'],
    bonus: { handle: 8, offIQ: 6 }, desc: '两个人都能自己解决进攻，也都能把球交出去。'
  },
  {
    id: 'combo_stone_unicorn', name: '石佛与独角兽', members: ['duncan_tim', 'wembanyama_victor'],
    bonus: { block: 10, defIQ: 8 }, desc: '最沉稳的老派内线与最不像内线的新型内线，防守端互补得刚好。'
  },
  {
    id: 'combo_dallas_line', name: '达拉斯传承', members: ['nowitzki_dirk', 'irving_kyrie'],
    bonus: { three: 8, mid: 8 }, desc: '金鸡独立与后撤步，两种几乎无解的出手方式凑在一起。'
  },
  {
    id: 'combo_shoot_gods', name: '罚球线射手', members: ['curry_stephen', 'harden_james'],
    bonus: { three: 10, ft: 6 }, desc: '一个把三分当上篮，一个把犯规当战术，防守端两头都顾不上。'
  },
  {
    id: 'combo_point_forwards', name: '组织前锋', members: ['james_lebron', 'antetokounmpo_giannis'],
    bonus: { pass: 6, inside: 8 }, desc: '两个持球推进的前锋，转换进攻里几乎没法拦。'
  }
];

const TYPE_LABELS = {
  team: '同队',
  era: '同届',
  rival: '宿敌',
  combo: '连线'
};

/* ---------------- 索引与轻量查询（与 data/players.js 的 helper 同一风格） ---------------- */
const BY_ID = {};
RIVALS.forEach(function (b) { BY_ID[b.id] = Object.assign({ type: 'rival' }, b); });
COMBOS.forEach(function (b) { BY_ID[b.id] = Object.assign({ type: 'combo' }, b); });

function byId(id) { return BY_ID[id] || null; }

/* 某名球员参与的全部点名羁绊（宿敌 + 组合连线），图鉴/详情页用来提示「集齐他能开什么」 */
function linksOfPlayer(playerId) {
  return RIVALS.filter(function (b) { return b.members.indexOf(playerId) !== -1; })
    .map(function (b) { return Object.assign({ type: 'rival' }, b); })
    .concat(COMBOS.filter(function (b) { return b.members.indexOf(playerId) !== -1; })
      .map(function (b) { return Object.assign({ type: 'combo' }, b); }));
}

/* 把无序的两人对折成稳定 key，用于校验「同一对不会既是宿敌又是连线」 */
function pairKey(a, b) { return a < b ? (a + '|' + b) : (b + '|' + a); }

module.exports = {
  RIVALS: RIVALS,
  COMBOS: COMBOS,
  TYPE_LABELS: TYPE_LABELS,
  BY_ID: BY_ID,
  byId: byId,
  linksOfPlayer: linksOfPlayer,
  pairKey: pairKey
};