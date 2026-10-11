/* data/moments.js —— 名场面时刻卡内容表（第八章「创新玩法」，里程碑 2）
 * 职责：只描述「有哪些时刻卡、各自效果是什么、文案怎么写」，不含任何判定逻辑。
 *       效果的读取与折叠在 utils/moment.js，数值口径（开关 / 全局缩放）在 config.moment，
 *       战斗内生效点在 utils/battle.js（pickShooter 的出手权重、resolve 的属性对抗 A 值）。
 *
 * 【文档原文】第八章：「名场面时刻卡：装备技能卡，如"35 秒奇迹"（末节三分 +20%）、"81 分之夜"（得分权重翻倍）。」
 *   本表把这两条按原文数值实现（m_35_seconds / m_81_points），其余为同一体系的原创扩展。
 *
 * 【效果口径】effects 是数组，每条是一个确定性乘数（**不掷额外的骰子**）：
 *   kind: 'attr'    —— 该球员出手时，属性对抗里的 A 值 × mul（作用位置与 config.battle.counter.bonus 同层，
 *                      即先乘 A 的基础值，再进 rand(0.85,1.15)，公式形状与量纲不变）
 *   kind: 'shooter' —— 该球员在 pickShooter 里的权重 × mul（更容易接到球 ⇒ 得分占比更高）
 *   可选过滤条件（缺省 = 不限）：
 *     tactics: ['inside'|'mid'|'three'|'handle']  只对指定进攻战术生效
 *     minQuarter / maxQuarter: 数字               只对指定节次生效；**加时的 quarter 是 5、6…**，
 *                                                 所以 minQuarter:4 天然覆盖加时（关键球就该在加时生效）
 *   多条 effects 之间**相乘**（同类叠加），utils/moment.js 负责折叠，页面不自己算。
 *
 * 【为什么不写 effectText】文案由 utils/moment.js 的 effectText() 从 effects 反推生成，
 *   避免「数据里手写一句话」与「实际乘数」漂移（同一理由：装备加成也只显示 bonus 的实际键值）。
 *
 * 【合规】第三章最高优先级：卡名与描述全部是原创球探报告口吻，不含真实联赛 / 球队商标与 Logo，
 *   不声称数据来自 NBA 官方、2K 或任何商业数据源；「35 秒奇迹」「81 分之夜」为文档指定的原创化用名。
 * 【纪律】与羁绊同一条：时刻卡**不改 ovr / rarity / salary**（否则工资帽会随佩戴组合漂移），
 *   也不改进养成面板的静态属性 —— 它是「实战触发」，不是「面板膨胀」。
 */

const MOMENTS = [
  /* ---------------- N：入门级，商城低价常驻，让新手先摸到这套系统 ---------------- */
  {
    id: 'm_warmup', name: '热身完毕', rarity: 'N',
    effects: [{ kind: 'attr', tactics: ['mid'], mul: 1.05 }],
    desc: '赛前多投了五百个球，手感上来了，中距离比平时稳一点。'
  },
  {
    id: 'm_crowd', name: '主场声浪', rarity: 'N',
    effects: [{ kind: 'shooter', mul: 1.2 }],
    desc: '看台一喊起来，球就特别爱往他手里传。'
  },

  /* ---------------- R：单一战术专精，性价比档位 ---------------- */
  {
    id: 'm_and_one', name: '打成二加一', rarity: 'R',
    effects: [{ kind: 'attr', tactics: ['inside'], mul: 1.09 }],
    desc: '被撞得失去平衡还是把球放进去了，裁判的哨声比欢呼晚半拍。'
  },
  {
    id: 'm_fast_break', name: '一条龙快攻', rarity: 'R',
    effects: [{ kind: 'attr', tactics: ['handle'], mul: 1.09 }],
    desc: '后场拿到球就没再传过，三步跨过半场，防守人只能追背影。'
  },
  {
    id: 'm_corner_three', name: '底角狙击', rarity: 'R',
    effects: [{ kind: 'attr', tactics: ['three'], mul: 1.08 }],
    desc: '整场只投底角，但每一次都像用尺子量过。'
  },
  {
    id: 'm_second_wind', name: '下半场觉醒', rarity: 'R',
    effects: [{ kind: 'attr', minQuarter: 3, mul: 1.07 }],
    desc: '上半场在找感觉，下半场才真正开始打球。'
  },

  /* ---------------- SR：开始有复合效果，打法能看出性格 ---------------- */
  {
    id: 'm_ankle_breaker', name: '脚踝终结者', rarity: 'SR',
    effects: [{ kind: 'attr', tactics: ['handle'], mul: 1.13 }],
    desc: '一个变向之后，防守人坐在了地板上，镜头都懒得再给他。'
  },
  {
    id: 'm_poster_dunk', name: '海报级暴扣', rarity: 'SR',
    effects: [
      { kind: 'attr', tactics: ['inside'], mul: 1.12 },
      { kind: 'shooter', tactics: ['inside'], mul: 1.35 }
    ],
    desc: '他不是上篮，他是把球连同防守人一起钉进篮筐，第二天上了所有海报。'
  },
  {
    id: 'm_mid_master', name: '中距离教科书', rarity: 'SR',
    effects: [{ kind: 'attr', tactics: ['mid'], mul: 1.13 }],
    desc: '背身、翻身、急停，三个动作重复了二十年，没人防得住。'
  },
  {
    id: 'm_clutch_gene', name: '关键球基因', rarity: 'SR',
    effects: [
      { kind: 'attr', minQuarter: 4, mul: 1.10 },
      { kind: 'shooter', minQuarter: 4, mul: 1.15 }
    ],
    desc: '比分越接近，他越安静；最后一攻，全队都知道球会给谁。'
  },

  /* ---------------- SSR：文档指定原例之一 ---------------- */
  {
    id: 'm_35_seconds', name: '35 秒奇迹', rarity: 'SSR',
    effects: [{ kind: 'attr', tactics: ['three'], minQuarter: 4, mul: 1.20 }],
    desc: '三十五秒，四记三分，一次抢断。计分板还没来得及刷新，比赛已经结束了。'
  },
  {
    id: 'm_paint_monster', name: '禁区怪物', rarity: 'SSR',
    effects: [
      { kind: 'attr', tactics: ['inside'], mul: 1.15 },
      { kind: 'shooter', tactics: ['inside'], mul: 1.5 }
    ],
    desc: '三秒区是他的地盘，进去的人要么把球留下，要么把自己留下。'
  },

  /* ---------------- UR：改变一整场的打法，商城限购 ---------------- */
  {
    id: 'm_81_points', name: '81 分之夜', rarity: 'UR',
    effects: [{ kind: 'shooter', mul: 2.0 }],
    desc: '那晚他没有对手，只有篮筐。球一次次回到他手里，分数一直涨到没人敢算。'
  },
  {
    id: 'm_triple_double', name: '三双之夜', rarity: 'UR',
    effects: [
      { kind: 'shooter', mul: 1.6 },
      { kind: 'attr', mul: 1.08 }
    ],
    desc: '得分、篮板、助攻，三栏都写满。他不是在打比赛，他是在填一张表格。'
  }
];

const INDEX = {};
MOMENTS.forEach(function (m) { INDEX[m.id] = m; });

function getMoment(id) { return INDEX[id] || null; }
function isMoment(id) { return !!INDEX[id]; }
function byRarity(r) { return MOMENTS.filter(function (m) { return m.rarity === r; }); }

module.exports = {
  MOMENTS: MOMENTS,
  COUNT: MOMENTS.length,
  INDEX: INDEX,
  getMoment: getMoment,
  isMoment: isMoment,
  byRarity: byRarity
};