/* data/players.js —— 全部球员卡牌数据（第三章「数据解耦」：数据集中于此，禁止散落硬编码）
 * 职责：定义 MVP 演示数据通道的全部卡牌（40 张手工卡 + 20 张确定性生成的青训营卡），
 *       并在加载时统一算出 ovrRaw / ovr / rarity / salary（走 utils/ovr.js，保证三处口径一致）。
 *
 * 【数据口径】第五章 5.3：MVP useDemoData=true，不联网抓取，依据公开篮球认知做「合理近似」，
 *   对外统一称「梦之队原创球探报告」，不声称来自 NBA 官方 / 2K / 任何商业数据源。
 * 【合规】不含任何真实联赛/球队商标与 Logo；alias 为「虚构化兜底」用的风格化化名（第三章第 7 条）。
 *
 * 【为什么有青训营卡】文档第十三章 30 人名单全是全明星，而第七章普通券概率是 N 60% / R 30%，
 *   若卡池里没有 N/R 卡，抽卡系统会直接空转。故用确定性生成器补 20 张纯原创的青训营卡
 *   （N×10 / R×5 / SR×5），既填满卡池，又强化合规（这部分是 100% 原创内容）。
 */
const CONFIG = require('../config.js');
const ovrUtil = require('../utils/ovr.js');
const teams = require('./teams.js');
const rngUtil = require('../utils/rng.js');

const VERSIONS = ['新秀版', '现役版', '巅峰传奇版'];
const CONFIG_ATTR_MIN = CONFIG.attrs.min;
const CONFIG_ATTR_MAX = CONFIG.attrs.max;
const CONFIG_ATTR_KEYS = CONFIG.attrs.keys;
const CONFIG_CALIBRATION = CONFIG.ovr.calibration;
const CONFIG_RARITY_ORDER = CONFIG.rarity.order;

/* ---------------- 40 张手工卡（第十三章名单 + 双版本 + 三版本演示） ---------------- */
/* attrs 键序 = config.attrs.keys：inside mid three dunk ft handle pass oreb dreb steal block speed accel strength vertical stamina offIQ defIQ potential */
const RAW_CARDS = [
  /* --- 现役版 15 人 --- */
  { id: 'curry_stephen_active', playerId: 'curry_stephen', name: '库里', alias: '三分雨', team: 'GSW', number: 30, position: 'PG', version: '现役版', era: '现役', draft: 2009, signature: 'Logo 三分', tags: ['射手', '组织', '无球'], attrs: { inside: 74, mid: 94, three: 99, dunk: 64, ft: 97, handle: 98, pass: 90, oreb: 42, dreb: 70, steal: 86, block: 34, speed: 88, accel: 93, strength: 62, vertical: 70, stamina: 95, offIQ: 98, defIQ: 78, potential: 96 } },
  { id: 'james_lebron_active', playerId: 'james_lebron', name: '詹姆斯', alias: '王座二三', team: 'LAL', number: 23, position: 'SF', version: '现役版', era: '现役', draft: 2003, signature: '全场推进', tags: ['组织', '锋线', '耐操'], attrs: { inside: 96, mid: 88, three: 78, dunk: 92, ft: 72, handle: 90, pass: 93, oreb: 66, dreb: 84, steal: 80, block: 62, speed: 84, accel: 84, strength: 94, vertical: 86, stamina: 94, offIQ: 95, defIQ: 86, potential: 94 } },
  { id: 'durant_kevin_active', playerId: 'durant_kevin', name: '杜兰特', alias: '死神镰刀', team: 'PHX', number: 35, position: 'SF', version: '现役版', era: '现役', draft: 2007, signature: '无解中投', tags: ['射手', '单打', '锋线'], attrs: { inside: 90, mid: 97, three: 92, dunk: 88, ft: 92, handle: 88, pass: 82, oreb: 46, dreb: 76, steal: 72, block: 74, speed: 82, accel: 82, strength: 76, vertical: 82, stamina: 86, offIQ: 92, defIQ: 80, potential: 90 } },
  { id: 'antetokounmpo_giannis_active', playerId: 'antetokounmpo_giannis', name: '字母哥', alias: '希腊巨兽', team: 'MIL', number: 34, position: 'PF', version: '现役版', era: '现役', draft: 2013, signature: '一步过全场', tags: ['冲击', '护筐', '转换'], attrs: { inside: 98, mid: 74, three: 52, dunk: 99, ft: 55, handle: 82, pass: 80, oreb: 84, dreb: 92, steal: 82, block: 90, speed: 88, accel: 90, strength: 94, vertical: 94, stamina: 92, offIQ: 88, defIQ: 92, potential: 94 } },
  { id: 'jokic_nikola_active', playerId: 'jokic_nikola', name: '约基奇', alias: '高位指挥', team: 'DEN', number: 15, position: 'C', version: '现役版', era: '现役', draft: 2014, signature: '中锋发牌', tags: ['组织', '低位', '高球商'], attrs: { inside: 94, mid: 92, three: 85, dunk: 80, ft: 88, handle: 86, pass: 99, oreb: 82, dreb: 95, steal: 84, block: 74, speed: 62, accel: 58, strength: 94, vertical: 70, stamina: 88, offIQ: 99, defIQ: 94, potential: 94 } },
  { id: 'doncic_luka_active', playerId: 'doncic_luka', name: '东契奇', alias: '慢步魔术师', team: 'LAL', number: 77, position: 'PG', version: '现役版', era: '现役', draft: 2018, signature: '后撤步三分', tags: ['组织', '单打', '节奏'], attrs: { inside: 88, mid: 92, three: 86, dunk: 74, ft: 82, handle: 96, pass: 96, oreb: 48, dreb: 82, steal: 78, block: 46, speed: 74, accel: 74, strength: 84, vertical: 68, stamina: 84, offIQ: 96, defIQ: 74, potential: 97 } },
  { id: 'tatum_jayson_active', playerId: 'tatum_jayson', name: '塔图姆', alias: '冷面杀手', team: 'BOS', number: 0, position: 'SF', version: '现役版', era: '现役', draft: 2017, signature: '侧翼单打', tags: ['单打', '锋线', '关键球'], attrs: { inside: 86, mid: 90, three: 88, dunk: 90, ft: 86, handle: 84, pass: 80, oreb: 56, dreb: 82, steal: 76, block: 70, speed: 82, accel: 82, strength: 82, vertical: 84, stamina: 88, offIQ: 88, defIQ: 86, potential: 95 } },
  { id: 'gilgeous_alexander_active', playerId: 'gilgeous_alexander', name: 'SGA', alias: '沉默刺客', team: 'OKC', number: 2, position: 'PG', version: '现役版', era: '现役', draft: 2018, signature: '突破节奏', tags: ['突破', '防守', '稳定'], attrs: { inside: 96, mid: 94, three: 80, dunk: 88, ft: 92, handle: 94, pass: 86, oreb: 44, dreb: 66, steal: 92, block: 52, speed: 90, accel: 92, strength: 76, vertical: 80, stamina: 92, offIQ: 92, defIQ: 88, potential: 97 } },
  { id: 'edwards_anthony_active', playerId: 'edwards_anthony', name: '爱德华兹', alias: '新狼王', team: 'MIN', number: 5, position: 'SG', version: '现役版', era: '现役', draft: 2020, signature: '暴力起飞', tags: ['爆发', '扣篮', '防守'], attrs: { inside: 92, mid: 88, three: 86, dunk: 96, ft: 80, handle: 86, pass: 76, oreb: 50, dreb: 66, steal: 82, block: 62, speed: 90, accel: 92, strength: 84, vertical: 94, stamina: 88, offIQ: 84, defIQ: 82, potential: 96 } },
  { id: 'wembanyama_victor_active', playerId: 'wembanyama_victor', name: '文班亚马', alias: '外星长臂', team: 'SAS', number: 1, position: 'C', version: '现役版', era: '现役', draft: 2023, signature: '禁飞区', tags: ['护筐', '空间', '潜力'], attrs: { inside: 88, mid: 86, three: 82, dunk: 94, ft: 82, handle: 82, pass: 76, oreb: 78, dreb: 92, steal: 78, block: 98, speed: 78, accel: 78, strength: 78, vertical: 90, stamina: 84, offIQ: 84, defIQ: 92, potential: 99 } },
  { id: 'harden_james_active', playerId: 'harden_james', name: '哈登', alias: '大胡子', team: 'LAC', number: 1, position: 'SG', version: '现役版', era: '现役', draft: 2009, signature: '造犯规大师', tags: ['组织', '射手', '单打'], attrs: { inside: 88, mid: 88, three: 90, dunk: 82, ft: 90, handle: 94, pass: 92, oreb: 44, dreb: 70, steal: 78, block: 42, speed: 78, accel: 80, strength: 84, vertical: 72, stamina: 82, offIQ: 94, defIQ: 66, potential: 88 } },
  { id: 'westbrook_russell_active', playerId: 'westbrook_russell', name: '威少', alias: '爆炸先生', team: 'SAC', number: 0, position: 'PG', version: '现役版', era: '现役', draft: 2008, signature: '推土机突破', tags: ['冲击', '三双', '激情'], attrs: { inside: 90, mid: 76, three: 52, dunk: 92, ft: 62, handle: 86, pass: 86, oreb: 62, dreb: 82, steal: 82, block: 48, speed: 88, accel: 90, strength: 86, vertical: 88, stamina: 88, offIQ: 80, defIQ: 72, potential: 84 } },
  { id: 'lillard_damian_active', playerId: 'lillard_damian', name: '利拉德', alias: '看表时刻', team: 'POR', number: 0, position: 'PG', version: '现役版', era: '现役', draft: 2012, signature: '超远三分', tags: ['射手', '关键球', '挡拆'], attrs: { inside: 86, mid: 90, three: 94, dunk: 78, ft: 94, handle: 92, pass: 86, oreb: 36, dreb: 58, steal: 74, block: 34, speed: 84, accel: 86, strength: 66, vertical: 74, stamina: 88, offIQ: 90, defIQ: 70, potential: 86 } },
  { id: 'butler_jimmy_active', playerId: 'butler_jimmy', name: '巴特勒', alias: '苦咖啡', team: 'GSW', number: 22, position: 'SF', version: '现役版', era: '现役', draft: 2011, signature: '季后赛模式', tags: ['防守', '关键球', '硬汉'], attrs: { inside: 90, mid: 88, three: 70, dunk: 84, ft: 90, handle: 84, pass: 86, oreb: 62, dreb: 76, steal: 90, block: 62, speed: 80, accel: 80, strength: 88, vertical: 78, stamina: 90, offIQ: 88, defIQ: 92, potential: 86 } },
  { id: 'irving_kyrie_active', playerId: 'irving_kyrie', name: '欧文', alias: '德鲁大叔', team: 'DAL', number: 2, position: 'PG', version: '现役版', era: '现役', draft: 2011, signature: '脚踝终结者', tags: ['控球', '单打', '终结'], attrs: { inside: 94, mid: 96, three: 90, dunk: 86, ft: 92, handle: 99, pass: 84, oreb: 38, dreb: 60, steal: 80, block: 40, speed: 88, accel: 90, strength: 62, vertical: 78, stamina: 84, offIQ: 90, defIQ: 72, potential: 88 } },

  /* --- 巅峰传奇版 15 人（退役传奇） --- */
  { id: 'jordan_michael_peak', playerId: 'jordan_michael', name: '乔丹', alias: '飞人二三', team: 'CHI', number: 23, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 1984, signature: '最后一投', tags: ['传奇', '防守', '关键球'], attrs: { inside: 98, mid: 99, three: 84, dunk: 99, ft: 90, handle: 96, pass: 88, oreb: 72, dreb: 86, steal: 97, block: 70, speed: 93, accel: 95, strength: 90, vertical: 96, stamina: 97, offIQ: 97, defIQ: 97, potential: 99 } },
  { id: 'bryant_kobe_peak', playerId: 'bryant_kobe', name: '科比', alias: '黑曼巴', team: 'LAL', number: 24, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 1996, signature: '曼巴后仰', tags: ['单打', '关键球', '防守'], attrs: { inside: 94, mid: 98, three: 88, dunk: 94, ft: 90, handle: 94, pass: 84, oreb: 56, dreb: 76, steal: 86, block: 56, speed: 88, accel: 90, strength: 84, vertical: 90, stamina: 95, offIQ: 95, defIQ: 92, potential: 96 } },
  { id: 'oneal_shaquille_peak', playerId: 'oneal_shaquille', name: '奥尼尔', alias: '柴油巨兽', team: 'LAL', number: 34, position: 'C', version: '巅峰传奇版', era: '传奇', draft: 1992, signature: '篮架摧残者', tags: ['内线', '力量', '统治'], attrs: { inside: 99, mid: 86, three: 25, dunk: 99, ft: 42, handle: 62, pass: 78, oreb: 97, dreb: 97, steal: 62, block: 94, speed: 66, accel: 68, strength: 99, vertical: 90, stamina: 86, offIQ: 90, defIQ: 88, potential: 92 } },
  { id: 'johnson_magic_peak', playerId: 'johnson_magic', name: '魔术师', alias: '微笑指挥官', team: 'LAL', number: 32, position: 'PG', version: '巅峰传奇版', era: '传奇', draft: 1979, signature: '不看人传球', tags: ['组织', '传球', '高大控卫'], attrs: { inside: 92, mid: 88, three: 72, dunk: 90, ft: 78, handle: 94, pass: 99, oreb: 66, dreb: 88, steal: 90, block: 52, speed: 86, accel: 86, strength: 86, vertical: 82, stamina: 92, offIQ: 98, defIQ: 90, potential: 96 } },
  { id: 'bird_larry_peak', playerId: 'bird_larry', name: '伯德', alias: '大鸟', team: 'BOS', number: 33, position: 'SF', version: '巅峰传奇版', era: '传奇', draft: 1979, signature: '垃圾话与绝杀', tags: ['射手', '传球', '高球商'], attrs: { inside: 84, mid: 96, three: 92, dunk: 78, ft: 92, handle: 86, pass: 94, oreb: 74, dreb: 90, steal: 82, block: 56, speed: 70, accel: 68, strength: 84, vertical: 70, stamina: 90, offIQ: 99, defIQ: 88, potential: 94 } },
  { id: 'duncan_tim_peak', playerId: 'duncan_tim', name: '邓肯', alias: '石佛', team: 'SAS', number: 21, position: 'PF', version: '巅峰传奇版', era: '传奇', draft: 1997, signature: '打板跳投', tags: ['低位', '护筐', '稳定'], attrs: { inside: 96, mid: 94, three: 42, dunk: 88, ft: 68, handle: 72, pass: 86, oreb: 90, dreb: 96, steal: 74, block: 96, speed: 70, accel: 68, strength: 94, vertical: 84, stamina: 95, offIQ: 94, defIQ: 99, potential: 95 } },
  { id: 'garnett_kevin_peak', playerId: 'garnett_kevin', name: '加内特', alias: '狼王怒吼', team: 'BOS', number: 5, position: 'PF', version: '巅峰传奇版', era: '传奇', draft: 1995, signature: '全场扫荡', tags: ['防守', '机动', '激情'], attrs: { inside: 92, mid: 90, three: 66, dunk: 94, ft: 78, handle: 78, pass: 84, oreb: 86, dreb: 94, steal: 86, block: 90, speed: 82, accel: 82, strength: 88, vertical: 90, stamina: 96, offIQ: 90, defIQ: 97, potential: 94 } },
  { id: 'nowitzki_dirk_peak', playerId: 'nowitzki_dirk', name: '诺维茨基', alias: '金鸡独立', team: 'DAL', number: 41, position: 'PF', version: '巅峰传奇版', era: '传奇', draft: 1998, signature: '单脚后仰', tags: ['射手', '空间', '关键球'], attrs: { inside: 88, mid: 98, three: 94, dunk: 84, ft: 94, handle: 78, pass: 82, oreb: 66, dreb: 88, steal: 68, block: 72, speed: 70, accel: 68, strength: 86, vertical: 76, stamina: 92, offIQ: 96, defIQ: 80, potential: 92 } },
  { id: 'wade_dwyane_peak', playerId: 'wade_dwyane', name: '韦德', alias: '闪电侠', team: 'MIA', number: 3, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 2003, signature: '欧洲步上篮', tags: ['突破', '防守', '关键球'], attrs: { inside: 98, mid: 92, three: 72, dunk: 96, ft: 80, handle: 94, pass: 86, oreb: 62, dreb: 74, steal: 92, block: 78, speed: 92, accel: 94, strength: 84, vertical: 90, stamina: 92, offIQ: 92, defIQ: 90, potential: 92 } },
  { id: 'yao_ming_peak', playerId: 'yao_ming', name: '姚明', alias: '移动长城', team: 'HOU', number: 11, position: 'C', version: '巅峰传奇版', era: '传奇', draft: 2002, signature: '低位勾手', tags: ['内线', '手感', '高度'], attrs: { inside: 96, mid: 94, three: 62, dunk: 88, ft: 92, handle: 62, pass: 78, oreb: 86, dreb: 92, steal: 46, block: 92, speed: 54, accel: 50, strength: 94, vertical: 70, stamina: 78, offIQ: 92, defIQ: 90, potential: 88 } },
  { id: 'mcgrady_tracy_peak', playerId: 'mcgrady_tracy', name: '麦迪', alias: '干拔诗人', team: 'ORL', number: 1, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 1997, signature: '35 秒 13 分', tags: ['单打', '射手', '天赋'], attrs: { inside: 92, mid: 94, three: 88, dunk: 94, ft: 80, handle: 92, pass: 84, oreb: 52, dreb: 74, steal: 80, block: 62, speed: 88, accel: 90, strength: 78, vertical: 90, stamina: 80, offIQ: 90, defIQ: 80, potential: 90 } },
  { id: 'iverson_allen_peak', playerId: 'iverson_allen', name: '艾弗森', alias: '答案', team: 'PHI', number: 3, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 1996, signature: '交叉步过人', tags: ['突破', '抢断', '斗志'], attrs: { inside: 96, mid: 92, three: 80, dunk: 88, ft: 82, handle: 98, pass: 84, oreb: 44, dreb: 58, steal: 96, block: 34, speed: 96, accel: 98, strength: 56, vertical: 82, stamina: 94, offIQ: 88, defIQ: 80, potential: 90 } },
  { id: 'carter_vince_peak', playerId: 'carter_vince', name: '卡特', alias: '半人半神', team: 'TOR', number: 15, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 1998, signature: '死亡之扣', tags: ['扣篮', '弹跳', '射手'], attrs: { inside: 92, mid: 88, three: 88, dunk: 99, ft: 82, handle: 84, pass: 76, oreb: 54, dreb: 74, steal: 74, block: 62, speed: 88, accel: 90, strength: 84, vertical: 99, stamina: 86, offIQ: 84, defIQ: 76, potential: 90 } },
  { id: 'olajuwon_hakeem_peak', playerId: 'olajuwon_hakeem', name: '奥拉朱旺', alias: '梦幻脚步', team: 'HOU', number: 34, position: 'C', version: '巅峰传奇版', era: '传奇', draft: 1984, signature: '梦幻舞步', tags: ['低位', '护筐', '抢断'], attrs: { inside: 96, mid: 90, three: 40, dunk: 94, ft: 70, handle: 80, pass: 80, oreb: 88, dreb: 92, steal: 90, block: 96, speed: 82, accel: 82, strength: 90, vertical: 88, stamina: 92, offIQ: 90, defIQ: 97, potential: 94 } },
  { id: 'pippen_scottie_peak', playerId: 'pippen_scottie', name: '皮蓬', alias: '全能副手', team: 'CHI', number: 33, position: 'SF', version: '巅峰传奇版', era: '传奇', draft: 1987, signature: '死亡缠绕', tags: ['防守', '组织', '全能'], attrs: { inside: 88, mid: 88, three: 74, dunk: 90, ft: 72, handle: 86, pass: 90, oreb: 66, dreb: 86, steal: 94, block: 80, speed: 86, accel: 86, strength: 86, vertical: 84, stamina: 94, offIQ: 90, defIQ: 98, potential: 92 } },

  /* --- 双版本要求：詹姆斯 / 库里 / 杜兰特 / 哈登 / 威少 的巅峰传奇版 --- */
  { id: 'james_lebron_peak', playerId: 'james_lebron', name: '詹姆斯', alias: '王座二三', team: 'CLE', number: 23, position: 'SF', version: '巅峰传奇版', era: '传奇', draft: 2003, signature: '追身大帽', tags: ['组织', '锋线', '统治'], attrs: { inside: 99, mid: 94, three: 84, dunk: 98, ft: 76, handle: 94, pass: 96, oreb: 76, dreb: 90, steal: 88, block: 72, speed: 90, accel: 90, strength: 97, vertical: 94, stamina: 97, offIQ: 97, defIQ: 90, potential: 99 } },
  { id: 'curry_stephen_peak', playerId: 'curry_stephen', name: '库里', alias: '三分雨', team: 'GSW', number: 30, position: 'PG', version: '巅峰传奇版', era: '传奇', draft: 2009, signature: '半场射程', tags: ['射手', '组织', '无球'], attrs: { inside: 78, mid: 96, three: 99, dunk: 68, ft: 98, handle: 99, pass: 92, oreb: 44, dreb: 72, steal: 88, block: 36, speed: 90, accel: 94, strength: 66, vertical: 74, stamina: 96, offIQ: 99, defIQ: 80, potential: 98 } },
  { id: 'durant_kevin_peak', playerId: 'durant_kevin', name: '杜兰特', alias: '死神镰刀', team: 'OKC', number: 35, position: 'SF', version: '巅峰传奇版', era: '传奇', draft: 2007, signature: '无解中投', tags: ['射手', '单打', '锋线'], attrs: { inside: 94, mid: 99, three: 95, dunk: 92, ft: 94, handle: 92, pass: 84, oreb: 50, dreb: 80, steal: 78, block: 78, speed: 86, accel: 86, strength: 80, vertical: 86, stamina: 92, offIQ: 94, defIQ: 84, potential: 94 } },
  { id: 'harden_james_peak', playerId: 'harden_james', name: '哈登', alias: '大胡子', team: 'HOU', number: 13, position: 'SG', version: '巅峰传奇版', era: '传奇', draft: 2009, signature: '后撤步三分', tags: ['组织', '射手', '单打'], attrs: { inside: 94, mid: 92, three: 95, dunk: 88, ft: 92, handle: 97, pass: 94, oreb: 48, dreb: 74, steal: 84, block: 46, speed: 84, accel: 86, strength: 88, vertical: 78, stamina: 90, offIQ: 97, defIQ: 70, potential: 92 } },
  { id: 'westbrook_russell_peak', playerId: 'westbrook_russell', name: '威少', alias: '爆炸先生', team: 'OKC', number: 0, position: 'PG', version: '巅峰传奇版', era: '传奇', draft: 2008, signature: '场均三双', tags: ['冲击', '三双', '激情'], attrs: { inside: 96, mid: 84, three: 60, dunk: 98, ft: 66, handle: 92, pass: 90, oreb: 68, dreb: 88, steal: 88, block: 52, speed: 94, accel: 96, strength: 90, vertical: 94, stamina: 94, offIQ: 84, defIQ: 76, potential: 88 } },

  /* --- 三版本演示：新秀版（第八章「时空进化」的地基） --- */
  { id: 'james_lebron_rookie', playerId: 'james_lebron', name: '詹姆斯', alias: '王座二三', team: 'CLE', number: 23, position: 'SF', version: '新秀版', era: '新秀', draft: 2003, signature: '天选之子', tags: ['冲击', '潜力', '锋线'], attrs: { inside: 92, mid: 80, three: 62, dunk: 94, ft: 68, handle: 86, pass: 84, oreb: 62, dreb: 78, steal: 78, block: 60, speed: 90, accel: 92, strength: 88, vertical: 92, stamina: 88, offIQ: 84, defIQ: 76, potential: 99 } },
  { id: 'curry_stephen_rookie', playerId: 'curry_stephen', name: '库里', alias: '三分雨', team: 'GSW', number: 30, position: 'PG', version: '新秀版', era: '新秀', draft: 2009, signature: '娃娃脸杀手', tags: ['射手', '潜力', '无球'], attrs: { inside: 66, mid: 82, three: 88, dunk: 56, ft: 90, handle: 90, pass: 82, oreb: 36, dreb: 60, steal: 76, block: 30, speed: 82, accel: 86, strength: 52, vertical: 62, stamina: 82, offIQ: 86, defIQ: 68, potential: 97 } },
  { id: 'jordan_michael_rookie', playerId: 'jordan_michael', name: '乔丹', alias: '飞人二三', team: 'CHI', number: 23, position: 'SG', version: '新秀版', era: '新秀', draft: 1984, signature: '飞天遁地', tags: ['爆发', '潜力', '扣篮'], attrs: { inside: 92, mid: 88, three: 62, dunk: 94, ft: 80, handle: 90, pass: 80, oreb: 62, dreb: 76, steal: 86, block: 58, speed: 92, accel: 94, strength: 82, vertical: 94, stamina: 88, offIQ: 86, defIQ: 82, potential: 99 } },
  { id: 'bryant_kobe_rookie', playerId: 'bryant_kobe', name: '科比', alias: '黑曼巴', team: 'LAL', number: 8, position: 'SG', version: '新秀版', era: '新秀', draft: 1996, signature: '高中生扣篮王', tags: ['潜力', '扣篮', '单打'], attrs: { inside: 84, mid: 84, three: 70, dunk: 88, ft: 76, handle: 86, pass: 72, oreb: 44, dreb: 62, steal: 74, block: 46, speed: 86, accel: 88, strength: 70, vertical: 86, stamina: 82, offIQ: 78, defIQ: 72, potential: 98 } },
  { id: 'wembanyama_victor_rookie', playerId: 'wembanyama_victor', name: '文班亚马', alias: '外星长臂', team: 'SAS', number: 1, position: 'C', version: '新秀版', era: '新秀', draft: 2023, signature: '独角兽', tags: ['护筐', '潜力', '空间'], attrs: { inside: 84, mid: 82, three: 78, dunk: 90, ft: 76, handle: 78, pass: 72, oreb: 72, dreb: 86, steal: 74, block: 94, speed: 76, accel: 76, strength: 70, vertical: 86, stamina: 78, offIQ: 78, defIQ: 86, potential: 99 } }
];

/* ---------------- 青训营 20 张（确定性生成，纯原创，填满 N/R/SR 档） ---------------- */
/* 位置模板 = 角色球员基准值，按 5.3 的档位逻辑写死（后卫 steal/handle 高、中锋 dreb/block 高） */
const ACADEMY_TEMPLATE = {
  PG: { inside: 62, mid: 66, three: 70, dunk: 55, ft: 72, handle: 74, pass: 70, oreb: 38, dreb: 52, steal: 64, block: 30, speed: 74, accel: 74, strength: 52, vertical: 62, stamina: 70, offIQ: 68, defIQ: 60, potential: 74 },
  SG: { inside: 66, mid: 70, three: 74, dunk: 62, ft: 74, handle: 70, pass: 62, oreb: 40, dreb: 54, steal: 64, block: 32, speed: 76, accel: 76, strength: 56, vertical: 68, stamina: 72, offIQ: 68, defIQ: 60, potential: 74 },
  SF: { inside: 70, mid: 72, three: 68, dunk: 70, ft: 70, handle: 66, pass: 64, oreb: 48, dreb: 62, steal: 62, block: 46, speed: 72, accel: 72, strength: 66, vertical: 70, stamina: 72, offIQ: 66, defIQ: 64, potential: 74 },
  PF: { inside: 76, mid: 68, three: 52, dunk: 80, ft: 66, handle: 58, pass: 60, oreb: 74, dreb: 78, steal: 56, block: 68, speed: 66, accel: 66, strength: 78, vertical: 74, stamina: 72, offIQ: 62, defIQ: 68, potential: 74 },
  C: { inside: 80, mid: 66, three: 40, dunk: 84, ft: 62, handle: 48, pass: 58, oreb: 80, dreb: 84, steal: 46, block: 80, speed: 56, accel: 54, strength: 84, vertical: 76, stamina: 70, offIQ: 60, defIQ: 70, potential: 74 }
};

const ACADEMY_SURNAME = ['林', '赵', '秦', '柯', '沈', '邵', '雷', '程', '袁', '霍'];
const ACADEMY_GIVEN = ['阿凯', '小北', '子豪', '大熊', '飞鱼', '星辰', '一鸣', '长风', '远帆', '晓峰',
  '劲松', '子墨', '昊然', '青云', '铁柱', '志远', '天成', '嘉树', '沐阳', '砚秋'];
const ACADEMY_TAGS = { PG: ['控场', '青训'], SG: ['投射', '青训'], SF: ['锋线', '青训'], PF: ['蓝领', '青训'], C: ['护筐', '青训'] };
/* 每张青训卡的目标 OVR：4 档 × 5 位置 = 20 张 → N(68,74) / R(81) / SR(86) */
const ACADEMY_TARGETS = [68, 74, 81, 86];

function clampAttr(v) {
  return Math.round(v < CONFIG_ATTR_MIN ? CONFIG_ATTR_MIN : (v > CONFIG_ATTR_MAX ? CONFIG_ATTR_MAX : v));
}

/* 按目标 OVR 反解「整体属性加成」：
 * 19 项权重之和 = 1，所以给全部属性同时 +B 会让 raw 恰好 +B，
 * 于是 B = (target - anchor) / slope + anchor - raw0，可精准命中目标档位。 */
function attrsForTarget(position, targetOvr, rng) {
  const base = ACADEMY_TEMPLATE[position];
  const jitter = rng.int(-1, 1);
  const attrs = {};
  CONFIG_ATTR_KEYS.forEach(function (k) { attrs[k] = clampAttr(base[k] + jitter); });
  const raw0 = ovrUtil.rawOvr(attrs, position);
  const bonus = Math.round((targetOvr - CONFIG_CALIBRATION.anchor) / CONFIG_CALIBRATION.slope + CONFIG_CALIBRATION.anchor - raw0);
  CONFIG_ATTR_KEYS.forEach(function (k) { attrs[k] = clampAttr(attrs[k] + bonus); });
  return attrs;
}

function buildAcademy() {
  const rng = rngUtil.createRng('pxbb-academy-v1'); // 固定种子 ⇒ 每次加载生成同一批卡（可复现）
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const out = [];
  let idx = 0;
  for (let t = 0; t < ACADEMY_TARGETS.length; t++) {
    for (let p = 0; p < positions.length; p++) {
      const pos = positions[p];
      const name = ACADEMY_SURNAME[idx % ACADEMY_SURNAME.length] + ACADEMY_GIVEN[idx % ACADEMY_GIVEN.length];
      out.push({
        id: 'academy_' + pos.toLowerCase() + '_' + (t + 1),
        playerId: 'academy_' + pos.toLowerCase() + '_' + (t + 1),
        name: name,
        alias: name,
        team: 'DTC',
        number: 4 + idx * 2,
        position: pos,
        version: '现役版',
        era: '青训',
        draft: 2024 + (idx % 2),
        signature: '青训营 ' + pos + ' 苗子',
        tags: ACADEMY_TAGS[pos],
        academy: true,
        attrs: attrsForTarget(pos, ACADEMY_TARGETS[t], rng)
      });
      idx++;
    }
  }
  return out;
}

/* ---------------- 组装：统一算出 ovrRaw / ovr / rarity / salary ---------------- */
function buildCard(raw) {
  const team = teams.teamOf(raw.team);
  const ev = ovrUtil.evaluate(raw.attrs, raw.position);
  return {
    id: raw.id,
    playerId: raw.playerId,
    name: raw.name,
    alias: raw.alias || raw.name,
    team: team.abbr,
    city: team.city,
    cityAlias: team.cityAlias,
    colors: team.colors,
    number: raw.number,
    position: raw.position,
    version: raw.version,
    era: raw.era,
    draft: raw.draft,
    signature: raw.signature,
    tags: raw.tags || [],
    academy: !!raw.academy,
    attrs: ovrUtil.normalizeAttrs(raw.attrs),
    ovrRaw: ev.ovrRaw,
    ovr: ev.ovr,
    rarity: ev.rarity,
    salary: ev.salary
  };
}

const ALL_RAW = RAW_CARDS.concat(buildAcademy());
const CARDS = ALL_RAW.map(buildCard);

const INDEX = {};
CARDS.forEach(function (c) { INDEX[c.id] = c; });

const BY_RARITY = {};
CONFIG_RARITY_ORDER.forEach(function (r) { BY_RARITY[r] = []; });
CARDS.forEach(function (c) {
  if (!BY_RARITY[c.rarity]) BY_RARITY[c.rarity] = [];
  BY_RARITY[c.rarity].push(c);
});

const BY_PLAYER = {};
CARDS.forEach(function (c) {
  if (!BY_PLAYER[c.playerId]) BY_PLAYER[c.playerId] = [];
  BY_PLAYER[c.playerId].push(c);
});

function getCard(id) { return INDEX[id] || null; }
function cardsOfPlayer(playerId) { return BY_PLAYER[playerId] || []; }
function byRarity(r) { return BY_RARITY[r] || []; }
function byPosition(pos) { return CARDS.filter(function (c) { return c.position === pos; }); }
function byEra(era) { return CARDS.filter(function (c) { return c.era === era; }); }
function byTeam(abbr) { return CARDS.filter(function (c) { return c.team === abbr; }); }

/* 图鉴用的「人物」维度（同一人多个版本合并成一行） */
function listPlayers() {
  const seen = [];
  const out = [];
  CARDS.forEach(function (c) {
    if (seen.indexOf(c.playerId) !== -1) return;
    seen.push(c.playerId);
    out.push({
      playerId: c.playerId,
      name: c.name,
      alias: c.alias,
      position: c.position,
      team: c.team,
      city: c.city,
      cityAlias: c.cityAlias,
      era: c.era,
      academy: c.academy,
      bestOvr: cardsOfPlayer(c.playerId).reduce(function (m, x) { return x.ovr > m ? x.ovr : m; }, 0),
      versions: cardsOfPlayer(c.playerId).map(function (x) { return { id: x.id, version: x.version, ovr: x.ovr, rarity: x.rarity }; })
    });
  });
  return out;
}

/* 卡池分档索引（抽卡用；按出厂 rarity 归档，养成提升不改变卡池归属） */
function poolIndex(cardIds) {
  const out = {};
  CONFIG_RARITY_ORDER.forEach(function (r) { out[r] = []; });
  const ids = cardIds || CARDS.map(function (c) { return c.id; });
  ids.forEach(function (id) {
    const c = INDEX[id];
    if (c && out[c.rarity]) out[c.rarity].push(c);
  });
  return out;
}

module.exports = {
  VERSIONS: VERSIONS,
  CARDS: CARDS,
  COUNT: CARDS.length,
  HAND_AUTHORED: RAW_CARDS.length,
  ACADEMY_COUNT: ALL_RAW.length - RAW_CARDS.length,
  ACADEMY_TARGETS: ACADEMY_TARGETS,
  INDEX: INDEX,
  BY_RARITY: BY_RARITY,
  BY_PLAYER: BY_PLAYER,
  getCard: getCard,
  cardsOfPlayer: cardsOfPlayer,
  byRarity: byRarity,
  byPosition: byPosition,
  byEra: byEra,
  byTeam: byTeam,
  listPlayers: listPlayers,
  poolIndex: poolIndex
};
