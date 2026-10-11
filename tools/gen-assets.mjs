/* tools/gen-assets.mjs —— 像素素材生成器（第六章 6.1「程序生成的像素风占位图」）
 * 职责：不依赖任何外部图片/网络，直接把 RGBA 像素编码成 PNG 写入 assets/。
 *   - assets/portraits/<cardId>.png  球员像素立绘（64×64，由 32×32 设计整数倍放大）
 *   - assets/tab/*.png               TabBar 图标（80×80，16×16 设计 ×5）
 *   - assets/ui/logo.png             启动页像素篮球 Logo（128×128）
 * 规范落地：调色板 ≤16 色、硬边无抗锯齿、整数倍放大（渲染端再加 image-rendering: pixelated）。
 * 合规落地：全部为程序生成的原创像素块 + 球衣号码，不含任何真实照片、商标或 Logo。
 * 用法：node tools/gen-assets.mjs [--preview] [--portraits-only] [--icons-only]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const players = require(path.join(ROOT, 'data/players.js'));

/* ---------------- PNG 编码 ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* rgba: Uint8Array(w*h*4)，逐行 filter=0 */
function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 画布 ---------------- */
function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha === undefined ? 255 : alpha];
}

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8Array(w * h * 4); }
  set(x, y, rgba) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !rgba) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = rgba[0]; this.data[i + 1] = rgba[1]; this.data[i + 2] = rgba[2]; this.data[i + 3] = rgba[3];
  }
  rect(x, y, w, h, rgba) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, rgba); }
  clear(rgba) { this.rect(0, 0, this.w, this.h, rgba || [0, 0, 0, 0]); }
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.data[i + 3] === 0) continue;
      this.set(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
    }
  }
  /* 整数倍放大（nearest，绝不插值） */
  scale(n) {
    const out = new Canvas(this.w * n, this.h * n);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      out.rect(x * n, y * n, n, n, [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]);
    }
    return out;
  }
  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePng(this.w, this.h, this.data));
    return fs.statSync(file).size;
  }
}

/* ---------------- 3×5 点阵数字 ---------------- */
const DIGITS = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###']
};

function drawNumber(cv, text, x, y, scale, rgba) {
  let cx = x;
  for (const ch of String(text)) {
    const glyph = DIGITS[ch];
    if (!glyph) continue;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (glyph[r][c] === '#') cv.rect(cx + c * scale, y + r * scale, scale, scale, rgba);
    }
    cx += 4 * scale;
  }
}

function numberWidth(text, scale) {
  return String(text).length * 4 * scale - scale;
}

/* ---------------- 调色板（全图 ≤16 色，符合第六章硬约束） ---------------- */
const SKIN_TONES = [
  { light: '#f2c9a0', mid: '#d9a878', dark: '#a97b52' },
  { light: '#e0ac69', mid: '#c08b4b', dark: '#8d5f2c' },
  { light: '#a9714b', mid: '#855233', dark: '#5c3620' },
  { light: '#6b4227', mid: '#4e2d19', dark: '#331c0e' }
];
const HAIR = ['#1b1b1f', '#3a2a1c', '#5a4632', '#2b2f45'];

function pickByHash(str, arr) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function shade(hex, amount) {
  const [r, g, b] = hexToRgba(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return [f(r), f(g), f(b), 255];
}

/* ---------------- 球员立绘（32×32 设计 → ×2 = 64×64） ---------------- */
function drawPortrait(card) {
  const W = 32;
  const cv = new Canvas(W, W);
  const jersey = card.colors.primary;
  const trim = card.colors.secondary;
  const skin = pickByHash(card.id, SKIN_TONES);
  const hair = pickByHash(card.id + 'h', HAIR);

  const BG1 = hexToRgba('#101a35');
  const BG2 = hexToRgba('#16234a');
  const OUT = hexToRgba('#07080f');
  const JER = hexToRgba(jersey);
  const JER_D = shade(jersey, -42);
  const JER_L = shade(jersey, 34);
  const TRIM = hexToRgba(trim);
  const SK_L = hexToRgba(skin.light);
  const SK_M = hexToRgba(skin.mid);
  const SK_D = hexToRgba(skin.dark);
  const HAIR_C = hexToRgba(hair);
  const NUM = hexToRgba('#f6f7ff');

  // 背景：像素抖动（dithering）过渡，不用渐变
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dither = ((x + y) % 2 === 0);
    cv.set(x, y, y < 10 ? (dither ? BG2 : BG1) : (dither ? BG1 : BG2));
  }

  // 肩膀 / 球衣（梯形，逐行加宽）
  for (let y = 14; y < W; y++) {
    const t = y - 14;
    const half = Math.min(11, 5 + Math.floor(t * 0.62));
    const cx = 16;
    for (let x = cx - half; x <= cx + half; x++) {
      const edge = (x === cx - half || x === cx + half);
      cv.set(x, y, edge ? OUT : (x < cx - half + 3 ? JER_D : (x > cx + half - 3 ? JER_D : JER)));
    }
  }
  for (let y = 16; y < 30; y++) cv.set(11, y, JER_L);
  cv.rect(13, 14, 6, 1, TRIM);
  for (let y = 15; y < W; y++) { cv.set(9, y, y % 3 === 0 ? TRIM : JER_D); cv.set(22, y, y % 3 === 0 ? TRIM : JER_D); }

  // 脖子
  cv.rect(14, 11, 4, 4, SK_M);
  cv.rect(14, 11, 1, 4, SK_D);

  // 头（含描边）
  cv.rect(11, 3, 10, 9, OUT);
  cv.rect(12, 4, 8, 8, SK_L);
  cv.rect(12, 4, 2, 8, SK_M);
  cv.rect(18, 9, 2, 3, SK_M);
  cv.rect(11, 2, 10, 3, HAIR_C);
  cv.rect(11, 4, 2, 3, HAIR_C);
  cv.rect(18, 4, 3, 2, HAIR_C);
  cv.set(14, 7, OUT); cv.set(17, 7, OUT);
  cv.set(15, 10, SK_D); cv.set(16, 10, SK_D);

  // 球衣号码
  const numText = String(card.number);
  const scale = numText.length >= 2 ? 2 : 3;
  const w = numberWidth(numText, scale);
  drawNumber(cv, numText, Math.floor((W - w) / 2), 19, scale, NUM);

  return cv.scale(2);
}

/* ---------------- TabBar 图标（16×16 设计 → ×5 = 80×80） ---------------- */
const ICON_ART = {
  home: [
    '                ', '       ##       ', '      ####      ', '     ######     ',
    '    ########    ', '   ##########   ', '  ############  ', '  ############  ',
    '  ############  ', '  #####  #####  ', '  #####  #####  ', '  #####  #####  ',
    '  #####  #####  ', '  #####  #####  ', '                ', '                '
  ],
  roster: [
    '                ', '  ############  ', '  #..........#  ', '  #..##..##..#  ',
    '  #..........#  ', '  #....##....#  ', '  #..........#  ', '  #..##..##..#  ',
    '  #..........#  ', '  ############  ', '                ', '                ',
    '                ', '                ', '                ', '                '
  ],
  recruit: [
    '                ', '                ', '  ############  ', '  #..........#  ',
    '  #....##....#  ', '  #...####...#  ', '  #..######..#  ', '  #...####...#  ',
    '  #...#..#...#  ', '  #..##..##..#  ', '  #..........#  ', '  ############  ',
    '                ', '                ', '                ', '                '
  ],
  stages: [
    '                ', '                ', '     ######     ', '   ##......##   ',
    '  #..######..#  ', '  #.#......#.#  ', ' #..#......#..# ', ' #.#........#.# ',
    '##.#........#.##', '##.#........#.##', ' #.#........#.# ', ' #..#......#..# ',
    '  #.#......#.#  ', '  #..######..#  ', '   ##......##   ', '     ######     '
  ],
  profile: [
    '                ', '                ', '     ######     ', '    ########    ',
    '    ########    ', '    ########    ', '     ######     ', '      ####      ',
    '   ############ ', '  ##############', '  ##############', '  ##############',
    '  ##############', '                ', '                ', '                '
  ]
};

function drawIcon(art, colorHex) {
  const cv = new Canvas(16, 16);
  const c = hexToRgba(colorHex);
  art.forEach((row, y) => {
    const line = (row + '                ').slice(0, 16);
    for (let x = 0; x < 16; x++) {
      const ch = line[x];
      if (ch === '#') cv.set(x, y, c); // '.' 仅用于排版可读性，实际透明
    }
  });
  return cv.scale(5);
}

/* ---------------- Logo：程序化像素篮球（32×32 → ×4 = 128×128） ---------------- */
function drawLogo() {
  const S = 32;
  const cv = new Canvas(S, S);
  const cx = 15.5, cy = 15.5, R = 13.2;
  const ball = hexToRgba('#ff8a1f');
  const ballD = hexToRgba('#d06a10');
  const ballL = hexToRgba('#ffa94d');
  const seam = hexToRgba('#2a1a08');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R) continue;
      const light = dx + dy;
      let c = light < -8 ? ballL : (light > 8 ? ballD : ball);
      const vert = Math.abs(dx) < 0.55;
      const horiz = Math.abs(dy) < 0.55;
      const dLeft = Math.sqrt((dx + 9.5) * (dx + 9.5) + dy * dy);
      const dRight = Math.sqrt((dx - 9.5) * (dx - 9.5) + dy * dy);
      const arc = Math.abs(dLeft - R) < 0.75 || Math.abs(dRight - R) < 0.75;
      if (vert || horiz || arc) c = seam;
      cv.set(x, y, c);
    }
  }
  return cv;
}

/* ---------------- 验收预览图 ---------------- */
function buildPreview() {
  const ids = ['curry_stephen_active', 'jordan_michael_peak', 'oneal_shaquille_peak', 'wembanyama_victor_active', 'academy_pg_3', 'james_lebron_rookie'];
  const cell = 64 * 3;
  const cols = 5;
  const cv = new Canvas(cell * cols + 20, cell * 2 + 20);
  cv.clear(hexToRgba('#0b1226'));
  let i = 0;
  for (const id of ids) {
    const card = players.getCard(id);
    if (!card) continue;
    cv.blit(drawPortrait(card).scale(3), (i % cols) * cell + 10, Math.floor(i / cols) * cell + 10);
    i++;
  }
  cv.blit(drawLogo().scale(3), 2 * cell + 10 + 16, cell + 10 + 16);
  ['home', 'stages', 'recruit', 'roster', 'profile'].forEach((k, n) => {
    cv.blit(drawIcon(ICON_ART[k], '#6d78a3'), 4 * cell + 10, 10 + n * 76);
    cv.blit(drawIcon(ICON_ART[k], '#ff8a1f'), 4 * cell + 10 + 90, 10 + n * 76);
  });
  const out = path.resolve(ROOT, '..', 'work', 'px_preview.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  cv.save(out);
  console.log('preview ->', out);
}

/* ---------------- 主流程 ---------------- */
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--preview')) { buildPreview(); return; }
  const onlyPortraits = args.includes('--portraits-only');
  const onlyIcons = args.includes('--icons-only');
  const assets = path.join(ROOT, 'assets');
  let count = 0;
  let bytes = 0;

  if (!onlyIcons) {
    for (const card of players.CARDS) {
      bytes += drawPortrait(card).save(path.join(assets, 'portraits', card.id + '.png'));
      count++;
    }
    bytes += drawLogo().scale(4).save(path.join(assets, 'ui', 'logo.png'));
    count++;
    console.log('portraits + logo:', count, 'files');
  }

  if (!onlyPortraits) {
    Object.keys(ICON_ART).forEach((key) => {
      bytes += drawIcon(ICON_ART[key], '#6d78a3').save(path.join(assets, 'tab', key + '.png'));
      bytes += drawIcon(ICON_ART[key], '#ff8a1f').save(path.join(assets, 'tab', key + '_on.png'));
      count += 2;
    });
    console.log('tab icons:', Object.keys(ICON_ART).length * 2, 'files');
  }

  console.log('TOTAL', count, 'files,', (bytes / 1024).toFixed(1), 'KB');
}

main();
