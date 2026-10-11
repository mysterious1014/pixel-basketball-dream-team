/* data/tactics.js —— 战术表（第七章 7.4「战术判定」的数据源）
 * 职责：定义进攻战术 → 用哪项进攻属性 vs 哪项防守属性、得几分、基础权重；
 *       以及防守策略（里程碑 2 战术克制）→ 4 个进攻战术 × 3 套防守策略的克制环。
 * 约束：进攻属性严格取自文档允许的 inside / mid / three / handle；防守属性取自 block / steal / defIQ。
 *       本文件只描述「是什么」，克制数值（加成幅度 / 权重乘数 / 开关）在 config.battle.counter，
 *       推导与结算逻辑在 utils/battle.js（第三章数据解耦 + AGENTS.md §3 分层职责）。
 *
 * 【克制环怎么读】每条战术有两个字段：
 *   counter   —— 这套战术**惩罚**哪套防守（进攻方吃 +bonus）
 *   beatenBy  —— 这套战术**被**哪套防守掐死（防守方吃 +bonus）
 * 篮球口径：收缩护筐（inside）把禁区堵死 ⇒ 中距离与三分有空间，但突破/强攻撞墙；
 *           外线扩防（perimeter）扑到三分线 ⇒ 突破与低位有空间，但干拔跳投被干扰；
 *           人盯人（balanced）不偏科 ⇒ 谁也不克制谁，是「读不出对手」时的安全选项。
 * 因此玩家的最优解是**侦察对手防守策略**（关卡详情 / 竞技场侦察面板都会显示），
 * 再选能惩罚它的进攻打法；反之自己的防守策略也要防着对手的打法。
 */

const TACTICS = [
  {
    key: 'inside', name: '内线强攻', short: '内线', points: 2,
    offAttr: 'inside', defAttr: 'block', weight: 26,
    counter: 'perimeter', beatenBy: 'inside',
    desc: '低位要位硬吃，考验对抗与护筐'
  },
  {
    key: 'mid', name: '中距离单打', short: '中投', points: 2,
    offAttr: 'mid', defAttr: 'steal', weight: 24,
    counter: 'inside', beatenBy: 'perimeter',
    desc: '背身翻身跳投，考验手感与抄截'
  },
  {
    key: 'three', name: '外线三分', short: '三分', points: 3,
    offAttr: 'three', defAttr: 'defIQ', weight: 26,
    counter: 'inside', beatenBy: 'perimeter',
    desc: '挡拆后外线出手，考验防守轮转意识'
  },
  {
    key: 'handle', name: '突破分球', short: '突破', points: 2,
    offAttr: 'handle', defAttr: 'defIQ', weight: 24,
    counter: 'perimeter', beatenBy: 'inside',
    desc: '持球撕开防线，杀到篮下终结'
  }
];

/* 打法（阵容页可选）对战术权重的乘数：让「选打法」在 MVP 就有真实策略意义 */
const PLAY_STYLES = {
  balanced: { key: 'balanced', name: '均衡', desc: '不做偏向，按战术基础权重出招', mul: { inside: 1, mid: 1, three: 1, handle: 1 } },
  inside: { key: 'inside', name: '凿内线', desc: '内线/中距离出手更多，三分更少', mul: { inside: 1.7, mid: 1.3, three: 0.55, handle: 1 } },
  perimeter: { key: 'perimeter', name: '拉外线', desc: '三分与突破更多，内线更少', mul: { inside: 0.6, mid: 0.9, three: 1.8, handle: 1.3 } }
};

/* 防守策略（里程碑 2）。key 与 TACTICS[].counter / beatenBy 的取值域一致。
 * weight 只在「auto」推导时当基础权重用（乘上队伍平均防守属性，见 config.battle.counter.autoDefense）。
 * auto 不是一张策略卡，而是「按队伍防守属性自动定调」，因此单独用 AUTO_DEFENSE 常量表示。 */
const DEFENSES = [
  {
    key: 'balanced', name: '人盯人', short: '盯人', weight: 30,
    desc: '一对一跟到底，不偏科：克制不了谁，也不会被谁白吃',
    counters: [], counteredBy: []
  },
  {
    key: 'inside', name: '收缩护筐', short: '收缩', weight: 34,
    desc: '堵禁区、放外线：掐死内线强攻与突破分球，但会被中投和三分惩罚',
    counters: ['inside', 'handle'], counteredBy: ['mid', 'three']
  },
  {
    key: 'perimeter', name: '外线扩防', short: '扩防', weight: 34,
    desc: '扑到三分线：掐死中距离与三分，但会被低位强攻和突破惩罚',
    counters: ['mid', 'three'], counteredBy: ['inside', 'handle']
  }
];

const AUTO_DEFENSE = 'auto';

/* 克制结果的三种取值（utils/battle.js 与页面共用同一套字符串，避免两边口径漂移） */
const COUNTER = {
  attack: 'attack',    // 进攻战术克制对方防守 ⇒ A_eff 吃加成
  defend: 'defend',    // 对方防守克制进攻战术 ⇒ D_eff 吃加成
  neutral: 'neutral'   // 无克制关系
};

function byKey(key) {
  for (let i = 0; i < TACTICS.length; i++) if (TACTICS[i].key === key) return TACTICS[i];
  return TACTICS[0];
}

function defenseByKey(key) {
  for (let i = 0; i < DEFENSES.length; i++) if (DEFENSES[i].key === key) return DEFENSES[i];
  return null;
}

/* 进攻战术 vs 防守策略 → 克制判定（纯查表，无随机、无状态） */
function counterOf(tacticKey, defenseKey) {
  const t = byKey(tacticKey);
  if (!t || !defenseByKey(defenseKey)) return COUNTER.neutral;
  if (t.counter === defenseKey) return COUNTER.attack;
  if (t.beatenBy === defenseKey) return COUNTER.defend;
  return COUNTER.neutral;
}

/* 防守策略的合法性：auto 或 DEFENSES 里的 key */
function isDefenseKey(key) {
  return key === AUTO_DEFENSE || !!defenseByKey(key);
}

module.exports = {
  TACTICS: TACTICS,
  PLAY_STYLES: PLAY_STYLES,
  DEFENSES: DEFENSES,
  AUTO_DEFENSE: AUTO_DEFENSE,
  COUNTER: COUNTER,
  byKey: byKey,
  defenseByKey: defenseByKey,
  counterOf: counterOf,
  isDefenseKey: isDefenseKey
};