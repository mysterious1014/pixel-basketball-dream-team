/* data/teams.js —— 球队元数据（第三章合规：只出现文字城市名/缩写，绝不含任何 Logo 图像）
 * 职责：城市缩写 → 中文名、虚构化城市名、占位立绘用的两色球衣配色。
 * 说明：colors 仅用于程序生成的像素占位图，是原创配色，不代表任何真实球队的官方视觉资产。
 */

const TEAMS = {
  GSW: { abbr: 'GSW', city: '金州', cityAlias: '金门湾', colors: { primary: '#1d6fa5', secondary: '#f0b323' } },
  LAL: { abbr: 'LAL', city: '洛杉矶', cityAlias: '天使城', colors: { primary: '#6a3fb5', secondary: '#f0c33c' } },
  PHX: { abbr: 'PHX', city: '菲尼克斯', cityAlias: '烈阳城', colors: { primary: '#8a3fd0', secondary: '#f28c1f' } },
  MIL: { abbr: 'MIL', city: '密尔沃基', cityAlias: '湖畔镇', colors: { primary: '#1f7a44', secondary: '#e8e3d3' } },
  DEN: { abbr: 'DEN', city: '丹佛', cityAlias: '高原城', colors: { primary: '#1b4f9c', secondary: '#e0a526' } },
  BOS: { abbr: 'BOS', city: '波士顿', cityAlias: '北岸城', colors: { primary: '#1c7a4a', secondary: '#eaeaea' } },
  OKC: { abbr: 'OKC', city: '俄克拉荷马', cityAlias: '中原城', colors: { primary: '#1f6fb2', secondary: '#ef6b2b' } },
  MIN: { abbr: 'MIN', city: '明尼苏达', cityAlias: '北境城', colors: { primary: '#2b5ea7', secondary: '#59c2a0' } },
  SAS: { abbr: 'SAS', city: '圣安东尼奥', cityAlias: '沙漠城', colors: { primary: '#3b3b3b', secondary: '#d9a441' } },
  LAC: { abbr: 'LAC', city: '洛杉矶港', cityAlias: '港湾城', colors: { primary: '#c0392b', secondary: '#eef2f7' } },
  SAC: { abbr: 'SAC', city: '萨克拉门托', cityAlias: '河谷城', colors: { primary: '#6b4fa0', secondary: '#8fd3e8' } },
  POR: { abbr: 'POR', city: '波特兰', cityAlias: '雨城', colors: { primary: '#b03a3a', secondary: '#2f2f2f' } },
  DAL: { abbr: 'DAL', city: '达拉斯', cityAlias: '孤星城', colors: { primary: '#2f6bb0', secondary: '#e6eef7' } },
  CHI: { abbr: 'CHI', city: '芝加哥', cityAlias: '风城', colors: { primary: '#b3212b', secondary: '#1f1f1f' } },
  HOU: { abbr: 'HOU', city: '休斯顿', cityAlias: '航天城', colors: { primary: '#c0392b', secondary: '#f2f2f2' } },
  MIA: { abbr: 'MIA', city: '迈阿密', cityAlias: '南海岸', colors: { primary: '#a02040', secondary: '#f0b323' } },
  PHI: { abbr: 'PHI', city: '费城', cityAlias: '自由钟城', colors: { primary: '#2f5fa8', secondary: '#d6453d' } },
  TOR: { abbr: 'TOR', city: '多伦多', cityAlias: '枫叶城', colors: { primary: '#b0322f', secondary: '#2f2f2f' } },
  ORL: { abbr: 'ORL', city: '奥兰多', cityAlias: '魔幻城', colors: { primary: '#2b62a8', secondary: '#c9ced6' } },
  CLE: { abbr: 'CLE', city: '克利夫兰', cityAlias: '湖畔钢城', colors: { primary: '#8c2f39', secondary: '#c9a227' } },
  NYK: { abbr: 'NYK', city: '纽约', cityAlias: '不夜城', colors: { primary: '#2b57a5', secondary: '#e8862f' } },
  BKN: { abbr: 'BKN', city: '布鲁克林', cityAlias: '桥港城', colors: { primary: '#4a4a56', secondary: '#c9c9d9' } },
  DET: { abbr: 'DET', city: '底特律', cityAlias: '齿轮城', colors: { primary: '#9c2f38', secondary: '#c9d3e0' } },
  IND: { abbr: 'IND', city: '印第安纳', cityAlias: '竞速城', colors: { primary: '#c9a227', secondary: '#26366b' } },
  MEM: { abbr: 'MEM', city: '孟菲斯', cityAlias: '蓝调城', colors: { primary: '#3b5b8c', secondary: '#a9c7e8' } },
  NOP: { abbr: 'NOP', city: '新奥尔良', cityAlias: '河口岸', colors: { primary: '#2b6b5f', secondary: '#d9b44a' } },
  UTA: { abbr: 'UTA', city: '盐湖城', cityAlias: '雪岭城', colors: { primary: '#4a3f8c', secondary: '#79c9c2' } },
  WAS: { abbr: 'WAS', city: '华盛顿', cityAlias: '国会城', colors: { primary: '#33518c', secondary: '#c95b4a' } },
  CHA: { abbr: 'CHA', city: '夏洛特', cityAlias: '皇后城', colors: { primary: '#2f8c6b', secondary: '#7fd0b9' } },
  ATL: { abbr: 'ATL', city: '亚特兰大', cityAlias: '桃树城', colors: { primary: '#b33a3a', secondary: '#e8d24a' } },
  FA: { abbr: 'FA', city: '自由市场', cityAlias: '自由城', colors: { primary: '#5a5a6e', secondary: '#c9c9d9' } },
  DTC: { abbr: 'DTC', city: '梦之队青训营', cityAlias: '梦之营', colors: { primary: '#26366b', secondary: '#ff8a1f' } }
};

/* 兜底：未知缩写返回青训营配色，保证任何界面不出现破图或空白 */
function teamOf(abbr) {
  return TEAMS[abbr] || { abbr: abbr || 'DTC', city: '未知', cityAlias: '未知', colors: TEAMS.DTC.colors };
}

module.exports = { TEAMS: TEAMS, teamOf: teamOf, ABBRS: Object.keys(TEAMS) };
