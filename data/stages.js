/* data/stages.js —— PVE 赛季征程关卡表（第七章 7.4 模式：赛季征程）
 * 职责：3 章 × 6 关 = 18 关；每关定义对手名、推荐 OVR、体力消耗、奖励与首发星级门槛。
 * 对手阵容：boss 关写死 5 个卡牌 id；其余按 awayOvr 目标「确定性生成」（种子 = 关卡 id，可复现）。
 * defense / playStyle 字段（里程碑 2 战术克制）：对手的防守策略与进攻打法，取值见 data/tactics.js
 *   的 DEFENSES / AUTO_DEFENSE / PLAY_STYLES。两者都是明牌，由 selectors.stageScout 给出克制结论。
 */
const CONFIG = require('../config.js');
const rngUtil = require('../utils/rng.js');
const players = require('./players.js');

const CHAPTERS = [
  { id: 1, name: '街球起源', desc: '从水泥地打起，先证明自己能上场', color: '#4aa3ff' },
  { id: 2, name: '季后赛征途', desc: '对抗强度陡增，阵容深度开始吃紧', color: '#b06bff' },
  { id: 3, name: '梦之队殿堂', desc: '跨时代巨星同框，最后的考验', color: '#ffd23f' }
];

/* 【战术梯度（里程碑 2）】playStyle / defense 的排布是刻意的教学曲线，不要随手改：
 *   第一章前 3 关：对手只有打法倾向、防守一律 auto（不针对玩家），先让玩家学会读「对手打法 → 我该怎么防」；
 *   第一章第 4 关起：第一次出现「打法 + 防守」双重针对，此时关卡详情面板的侦察结论才真正救命；
 *   第二、三章：双重针对成为常态，BOSS 关用最极端的组合。
 * 实测依据（E:\codex\work\px_bal_stages.mjs，初始存档 5×R 青训 / 均评 81 / 每格 30 seeds）：
 *   对手「拉外线 + 外线扩防」时，默认打法胜率 3%、按侦察面板选到最优也只有 23%，而克制关闭时是 37%。
 *   所以这种组合只能出现在玩家已经学会换打法之后（第一章第 4 关以后、且第 4 关用的是较温和的收缩护筐）。 */
const RAW_STAGES = [
  /* 第一章 */
  { id: 's1-1', chapter: 1, index: 1, name: '水泥地首秀', opponent: '青训一队', awayOvr: 68, defense: 'auto', playStyle: 'balanced', staminaCost: 6, rewards: { gold: 1200, diamond: 0, exp: 40, shard: 2 } },
  { id: 's1-2', chapter: 1, index: 2, name: '街角斗牛', opponent: '街角老炮', awayOvr: 72, defense: 'auto', playStyle: 'inside', staminaCost: 6, rewards: { gold: 1500, diamond: 20, exp: 45, shard: 2 } },
  { id: 's1-3', chapter: 1, index: 3, name: '城市联赛预选', opponent: '城市联队', awayOvr: 76, defense: 'auto', playStyle: 'perimeter', staminaCost: 7, rewards: { gold: 1800, diamond: 20, exp: 50, shard: 3, item: 'shoes_street' } },
  { id: 's1-4', chapter: 1, index: 4, name: '夜场挑战赛', opponent: '夜场常客', awayOvr: 79, defense: 'inside', playStyle: 'inside', staminaCost: 7, rewards: { gold: 2200, diamond: 30, exp: 55, shard: 3 } },
  { id: 's1-5', chapter: 1, index: 5, name: '区决赛', opponent: '北区冠军', awayOvr: 82, defense: 'balanced', playStyle: 'balanced', staminaCost: 8, rewards: { gold: 2800, diamond: 40, exp: 60, shard: 4, ticketNormal: 2 } },
  { id: 's1-6', chapter: 1, index: 6, name: 'BOSS · 街球之王', opponent: '街球之王', boss: true, awayOvr: 84, defense: 'perimeter', playStyle: 'perimeter', awayIds: ['academy_pg_4', 'iverson_allen_peak', 'carter_vince_peak', 'academy_pf_4', 'academy_c_4'], staminaCost: 10, rewards: { gold: 4200, diamond: 80, exp: 90, shard: 8, ticketAdvanced: 1 } },

  /* 第二章 */
  { id: 's2-1', chapter: 2, index: 1, name: '首轮遭遇', opponent: '新锐军团', awayOvr: 85, defense: 'auto', playStyle: 'balanced', staminaCost: 8, rewards: { gold: 3200, diamond: 40, exp: 70, shard: 4 } },
  { id: 's2-2', chapter: 2, index: 2, name: '客场硬仗', opponent: '客场之狼', awayOvr: 86, defense: 'balanced', playStyle: 'inside', staminaCost: 8, rewards: { gold: 3400, diamond: 40, exp: 75, shard: 4, item: 'wrist_pixel' } },
  { id: 's2-3', chapter: 2, index: 3, name: '加时阴影', opponent: '铁壁防线', awayOvr: 87, defense: 'inside', playStyle: 'inside', staminaCost: 9, rewards: { gold: 3800, diamond: 50, exp: 80, shard: 5 } },
  { id: 's2-4', chapter: 2, index: 4, name: '天王山之战', opponent: '天王山主队', awayOvr: 88, defense: 'auto', playStyle: 'perimeter', staminaCost: 9, rewards: { gold: 4200, diamond: 60, exp: 85, shard: 5, ticketNormal: 3 } },
  { id: 's2-5', chapter: 2, index: 5, name: '分区决赛', opponent: '分区霸主', awayOvr: 89, defense: 'perimeter', playStyle: 'balanced', staminaCost: 10, rewards: { gold: 4800, diamond: 70, exp: 90, shard: 6 } },
  { id: 's2-6', chapter: 2, index: 6, name: 'BOSS · 闪电军团', opponent: '闪电军团', boss: true, awayOvr: 90, defense: 'inside', playStyle: 'inside', awayIds: ['gilgeous_alexander_active', 'wade_dwyane_peak', 'butler_jimmy_active', 'antetokounmpo_giannis_active', 'wembanyama_victor_active'], staminaCost: 12, rewards: { gold: 7000, diamond: 150, exp: 140, shard: 12, ticketAdvanced: 2, item: 'head_pixel' } },

  /* 第三章 */
  { id: 's3-1', chapter: 3, index: 1, name: '殿堂之门', opponent: '殿堂守卫', awayOvr: 91, defense: 'balanced', playStyle: 'balanced', staminaCost: 10, rewards: { gold: 5600, diamond: 80, exp: 100, shard: 8 } },
  { id: 's3-2', chapter: 3, index: 2, name: '三分雨夜', opponent: '射手军团', awayOvr: 92, defense: 'perimeter', playStyle: 'perimeter', staminaCost: 10, rewards: { gold: 6000, diamond: 80, exp: 105, shard: 8, item: 'shoes_pixel' } },
  { id: 's3-3', chapter: 3, index: 3, name: '内线绞肉机', opponent: '巨兽禁区', awayOvr: 93, defense: 'inside', playStyle: 'inside', staminaCost: 11, rewards: { gold: 6400, diamond: 90, exp: 110, shard: 9 } },
  { id: 's3-4', chapter: 3, index: 4, name: '王朝余晖', opponent: '王朝老兵', awayOvr: 94, defense: 'balanced', playStyle: 'balanced', staminaCost: 11, rewards: { gold: 7000, diamond: 100, exp: 120, shard: 10, ticketAdvanced: 1 } },
  { id: 's3-5', chapter: 3, index: 5, name: '跨时代对决', opponent: '时空联队', awayOvr: 95, defense: 'auto', playStyle: 'perimeter', staminaCost: 12, rewards: { gold: 8000, diamond: 120, exp: 130, shard: 12 } },
  { id: 's3-6', chapter: 3, index: 6, name: 'BOSS · 梦之队本体', opponent: '梦之队本体', boss: true, awayOvr: 97, defense: 'auto', playStyle: 'inside', awayIds: ['johnson_magic_peak', 'jordan_michael_peak', 'james_lebron_peak', 'duncan_tim_peak', 'oneal_shaquille_peak'], staminaCost: 15, rewards: { gold: 15000, diamond: 400, exp: 260, shard: 30, ticketAdvanced: 3, item: 'shoes_hof' } }
];

/* 首通额外奖励（一次性） */
const FIRST_CLEAR_BONUS = { gold: 2000, diamond: 60 };

function stagesOf(chapterId) {
  return RAW_STAGES.filter(function (s) { return s.chapter === chapterId; });
}

function getStage(id) {
  for (let i = 0; i < RAW_STAGES.length; i++) if (RAW_STAGES[i].id === id) return RAW_STAGES[i];
  return null;
}

/* 按目标 OVR 确定性生成对手阵容：每个位置取「OVR 最接近目标」的前 3 张里随机挑 1 张 */
function buildAwayCards(stage) {
  if (stage.awayIds && stage.awayIds.length >= 5) {
    const picked = stage.awayIds.map(function (id) { return players.getCard(id); }).filter(Boolean);
    if (picked.length >= 5) return picked.slice(0, 5);
  }
  const rng = rngUtil.createRng('stage-' + stage.id);
  const positions = CONFIG.roster.slotPositions;
  const out = [];
  const used = [];
  positions.forEach(function (pos) {
    const pool = players.byPosition(pos).filter(function (c) { return used.indexOf(c.playerId) === -1; });
    const sorted = pool.slice().sort(function (a, b) {
      return Math.abs(a.ovr - stage.awayOvr) - Math.abs(b.ovr - stage.awayOvr);
    });
    const top = sorted.slice(0, 3);
    const card = top.length ? rng.pick(top) : sorted[0];
    if (card) { out.push(card); used.push(card.playerId); }
  });
  return out;
}

/* 对手队伍对象（直接喂给 utils/battle.js） */
function buildAwayTeam(stage, boost) {
  const cards = buildAwayCards(stage);
  const b = Number(boost) || 1;
  return {
    name: stage.opponent,
    /* 进攻打法同样是明牌（关卡详情面板会显示），与 defense 一起构成「侦察 → 选克制」的决策闭环 */
    playStyle: stage.playStyle || 'balanced',
    /* 防守策略（第七章 7.4 战术克制）：透传给 utils/battle.js，由它决定是直接用还是按属性 auto 推导。
     * 关卡详情面板读的也是同一条数据，所以「侦察到的」与「比赛里生效的」必然一致。 */
    defense: stage.defense || 'auto',
    players: cards.map(function (c) {
      const attrs = {};
      Object.keys(c.attrs).forEach(function (k) {
        attrs[k] = Math.round(Math.min(99, c.attrs[k] * b));
      });
      /* 透传羁绊判定用的元数据（第七章 7.3）：对手同样吃同队/同届/宿敌/连线加成，
       * 这样 BOSS 关的传奇阵容（如 s3-6 的湖人双星 + 公牛王朝）会打出自己的性格。 */
      return {
        uid: 'away-' + c.id, name: c.name, number: c.number, position: c.position,
        attrs: attrs, ovr: c.ovr, salary: c.salary, cardId: c.id,
        team: c.team, era: c.era, draft: c.draft, playerId: c.playerId, tags: c.tags
      };
    })
  };
}

module.exports = {
  CHAPTERS: CHAPTERS,
  STAGES: RAW_STAGES,
  FIRST_CLEAR_BONUS: FIRST_CLEAR_BONUS,
  stagesOf: stagesOf,
  getStage: getStage,
  buildAwayCards: buildAwayCards,
  buildAwayTeam: buildAwayTeam
};
