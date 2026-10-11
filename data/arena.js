/* data/arena.js —— 竞技场天梯表（第七章 7.4「模式：竞技场（异步 PVP）」，里程碑 2）
 * 职责：只描述「天梯上有谁、他们长什么样、打赢给什么」，不写业务逻辑。
 *       积分算法 / 每日次数 / 奖励结算在 utils/arena.js，数值口径（K 值、段位、次数上限）在 config.arena。
 *
 * 【为什么是本地生成的对手】第十一章零依赖红线：本工程不引后端、不发任何网络请求。
 *   异步 PVP 的本质是「打对手已保存的阵容快照，双方不同时在线」——快照从哪来并不影响这套机制。
 *   这里用固定 cardId 列表确定性构造 12 支原创战队，等价于服务端下发的快照；
 *   真接后端时只要把 getOpponent()/buildAwayTeam() 换成读取服务端 JSON，utils/arena.js 与页面层不用改。
 *
 * 【合规】战队名与描述全部原创，不含任何真实联赛 / 球队商标与 Logo，也不声称数据来自官方或商业数据源。
 * 【可侦察】每位对手的 playStyle / defense 都是明牌（竞技场侦察面板直接读这张表），
 *   这正是「战术克制」的决策入口：看懂对手防守策略，再选能惩罚它的进攻打法。
 */
const players = require('./players.js');

const LADDER = [
  {
    id: 'a01', index: 1, name: '街角新军', rating: 800,
    desc: '刚从水泥地凑齐的五个人，配合还生涩，但谁都不肯认输。',
    cardIds: ['academy_pg_1', 'academy_sg_1', 'academy_sf_1', 'academy_pf_1', 'academy_c_1'],
    playStyle: 'balanced', defense: 'auto',
    rewards: { gold: 900, diamond: 10, shard: 2 }, firstWin: { gold: 1200, diamond: 30, shard: 2 }
  },
  {
    id: 'a02', index: 2, name: '夜市猎手', rating: 860,
    desc: '在夜市球场混了三年，专挑外来户下手，防守永远缩在禁区里等你撞。',
    cardIds: ['academy_pg_2', 'academy_sg_2', 'academy_sf_2', 'academy_pf_2', 'academy_c_2'],
    playStyle: 'inside', defense: 'inside',
    rewards: { gold: 1100, diamond: 12, shard: 2 }, firstWin: { gold: 1400, diamond: 30, shard: 3 }
  },
  {
    id: 'a03', index: 3, name: '像素风暴', rating: 920,
    desc: '全场不停跑动、见缝就投三分，防守扩到中线，赌的就是你不敢突。',
    cardIds: ['academy_pg_3', 'academy_sg_3', 'academy_sf_3', 'academy_pf_3', 'academy_c_3'],
    playStyle: 'perimeter', defense: 'perimeter',
    rewards: { gold: 1300, diamond: 15, shard: 3 }, firstWin: { gold: 1600, diamond: 40, shard: 3 }
  },
  {
    id: 'a04', index: 4, name: '铁壳卫队', rating: 980,
    desc: '青训营的落选者组成的队伍，防守纪律严明，一对一跟到底。',
    cardIds: ['academy_pg_4', 'academy_sg_4', 'academy_sf_3', 'academy_pf_3', 'academy_c_3'],
    playStyle: 'balanced', defense: 'balanced',
    rewards: { gold: 1600, diamond: 18, shard: 3 }, firstWin: { gold: 1800, diamond: 45, shard: 4 }
  },
  {
    id: 'a05', index: 5, name: '新星联队', rating: 1040,
    desc: '三个刚进联盟的新面孔加上一个老将中锋，天赋溢出，经验不足。',
    cardIds: ['curry_stephen_rookie', 'bryant_kobe_rookie', 'james_lebron_rookie', 'academy_pf_4', 'wembanyama_victor_rookie'],
    playStyle: 'perimeter', defense: 'auto',
    rewards: { gold: 1900, diamond: 22, shard: 4 }, firstWin: { gold: 2000, diamond: 50, shard: 4 }
  },
  {
    id: 'a06', index: 6, name: '水花试验', rating: 1100,
    desc: '两个能在 Logo 位置出手的后卫，把三分线当成罚球线用。',
    cardIds: ['curry_stephen_active', 'lillard_damian_active', 'butler_jimmy_active', 'academy_sf_4', 'academy_c_4'],
    playStyle: 'perimeter', defense: 'perimeter',
    rewards: { gold: 2200, diamond: 26, shard: 4 }, firstWin: { gold: 2200, diamond: 60, shard: 5 }
  },
  {
    id: 'a07', index: 7, name: '答案与飞人', rating: 1160,
    desc: '两代得分狂人凑在一队，谁都不传球，但谁都能自己解决问题。',
    cardIds: ['iverson_allen_peak', 'jordan_michael_rookie', 'bryant_kobe_rookie', 'nowitzki_dirk_peak', 'yao_ming_peak'],
    playStyle: 'inside', defense: 'inside',
    rewards: { gold: 2500, diamond: 30, shard: 5 }, firstWin: { gold: 2400, diamond: 70, shard: 5 }
  },
  {
    id: 'a08', index: 8, name: '旧怨雷霆', rating: 1220,
    desc: '曾经并肩、如今互不相让的几个人，把火气全撒在对手身上。',
    cardIds: ['westbrook_russell_active', 'harden_james_active', 'durant_kevin_active', 'antetokounmpo_giannis_active', 'jokic_nikola_active'],
    playStyle: 'balanced', defense: 'auto',
    rewards: { gold: 2800, diamond: 34, shard: 6 }, firstWin: { gold: 2600, diamond: 80, shard: 6 }
  },
  {
    id: 'a09', index: 9, name: '绿军铁血', rating: 1300,
    desc: '防守强度拉到犯规边缘，进攻靠三个能自己创造空间的老将。',
    cardIds: ['bird_larry_peak', 'garnett_kevin_peak', 'tatum_jayson_active', 'irving_kyrie_active', 'olajuwon_hakeem_peak'],
    playStyle: 'balanced', defense: 'balanced',
    rewards: { gold: 3200, diamond: 40, shard: 7 }, firstWin: { gold: 2800, diamond: 90, shard: 7 }
  },
  {
    id: 'a10', index: 10, name: '禁区双霸', rating: 1380,
    desc: '一个占住低位、一个占住罚球线，篮下已经没有你的位置。',
    cardIds: ['oneal_shaquille_peak', 'bryant_kobe_peak', 'wade_dwyane_peak', 'duncan_tim_peak', 'mcgrady_tracy_peak'],
    playStyle: 'inside', defense: 'inside',
    rewards: { gold: 3600, diamond: 46, shard: 8 }, firstWin: { gold: 3000, diamond: 100, shard: 8 }
  },
  {
    id: 'a11', index: 11, name: '铁幕王朝', rating: 1480,
    desc: '天梯尽头的守门人，攻防两端都没有短板，专治各种取巧阵容。',
    cardIds: ['jordan_michael_peak', 'pippen_scottie_peak', 'garnett_kevin_peak', 'johnson_magic_peak', 'oneal_shaquille_peak'],
    playStyle: 'balanced', defense: 'balanced',
    rewards: { gold: 4200, diamond: 55, shard: 10 }, firstWin: { gold: 3400, diamond: 120, shard: 10 }
  },
  {
    id: 'a12', index: 12, name: '像素之神', rating: 1600,
    desc: '跨时代最强五人同框。打赢他们，你的阵容就该被写进球探报告。',
    cardIds: ['curry_stephen_peak', 'james_lebron_peak', 'jordan_michael_peak', 'duncan_tim_peak', 'wembanyama_victor_active'],
    playStyle: 'perimeter', defense: 'auto',
    rewards: { gold: 5000, diamond: 70, shard: 12 }, firstWin: { gold: 4000, diamond: 200, shard: 15 }
  }
];

function getOpponent(id) {
  for (let i = 0; i < LADDER.length; i++) if (LADDER[i].id === id) return LADDER[i];
  return null;
}

function indexOf(id) {
  for (let i = 0; i < LADDER.length; i++) if (LADDER[i].id === id) return i;
  return -1;
}

/* 对手卡牌（按天梯表 cardIds 顺序，与 data/stages.js 的 boss 关同一套构造方式） */
function buildAwayCards(opp) {
  return (opp.cardIds || []).map(function (id) { return players.getCard(id); }).filter(Boolean);
}

/* 对手队伍对象（直接喂给 utils/battle.js）。
 * team / era / draft / playerId / tags 必须透传 —— 对手同样吃羁绊（config.bond 裁决 2）。 */
function buildAwayTeam(opp) {
  const cards = buildAwayCards(opp);
  return {
    name: opp.name,
    playStyle: opp.playStyle || 'balanced',
    defense: opp.defense || 'auto',
    players: cards.map(function (c) {
      return {
        uid: 'arena-' + c.id, name: c.name, number: c.number, position: c.position,
        attrs: Object.assign({}, c.attrs), ovr: c.ovr, salary: c.salary, cardId: c.id,
        team: c.team, era: c.era, draft: c.draft, playerId: c.playerId, tags: c.tags
      };
    })
  };
}

module.exports = {
  LADDER: LADDER,
  getOpponent: getOpponent,
  indexOf: indexOf,
  buildAwayCards: buildAwayCards,
  buildAwayTeam: buildAwayTeam
};