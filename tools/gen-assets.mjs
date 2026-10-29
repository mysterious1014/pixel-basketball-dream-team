/* tools/gen-assets.mjs —— 像素素材生成器（第六章 6.1「程序生成的像素风占位图」）
 * 职责：不依赖任何外部图片/网络，直接把 RGBA 像素编码成 PNG 写入 assets/。
 *   - assets/portraits/<cardId>.png  球员像素立绘（64×64 设计原生绘制，特征驱动：肤色/发型/胡须/头饰/体型）
 *   - assets/tab/*.png               TabBar 图标（80×80，16×16 设计 ×5）
 *   - assets/ui/logo.png             启动页像素篮球 Logo（128×128）
 * 规范落地：调色板 ≤16 色、硬边无抗锯齿、64×64 基准画布（渲染端 image-rendering: pixelated）。
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
import { PORTRAIT_SPEC } from './portraits-spec.mjs';

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

/* ---------------- 球员立绘（64×64 设计原生绘制，特征驱动；里程碑 6 精细化） ----------------
 * 特征表在 tools/portraits-spec.mjs（按 playerId）；未登记（青训营）走确定性哈希兜底。
 * 单人 6–8 项特征：肤色 / 发型 / 发色 / 胡须 / 头饰 / 护臂 / 眉毛 / 体型剪影。
 */
const SKIN_TONES = [
  { light: '#f6d7b8', mid: '#e3b78e', dark: '#b98b60' },
  { light: '#f2c9a0', mid: '#d9a878', dark: '#a97b52' },
  { light: '#e0ac69', mid: '#c08b4b', dark: '#8d5f2c' },
  { light: '#c68a58', mid: '#9c6238', dark: '#6f4123' },
  { light: '#a9714b', mid: '#855233', dark: '#5c3620' },
  { light: '#6b4227', mid: '#4e2d19', dark: '#331c0e' }
];
const HAIR_COLORS = ['#101014', '#3a2a1c', '#6b4a2a', '#a5793f', '#c9c9d9', '#8a3b1f'];
const HAIR_STYLES = ['short', 'buzz', 'bald', 'receding', 'afro', 'curls', 'braids', 'dreads', 'ponytail', 'long'];
const BEARDS = ['none', 'mustache', 'goatee', 'full', 'long', 'chinstrap'];
const BANDS = ['none', 'headband', 'goggles'];
const SLEEVES = ['none', 'r', 'both'];
const BUILDS = ['normal', 'slim', 'tower', 'bulky'];

/* 未登记 playerId 的兜底：同输入同输出（青训营也人人不同脸） */
function specOf(card) {
  const spec = PORTRAIT_SPEC[card.playerId];
  if (spec) return spec;
  return {
    s: 1 + (pickHash(card.playerId + 's', 5)),
    hair: pickByHash(card.playerId + 'hair', HAIR_STYLES.slice(0, 8)),
    hc: pickByHash(card.playerId + 'hc', HAIR_COLORS.slice(0, 4)),
    beard: pickByHash(card.playerId + 'b', BEARDS),
    band: pickByHash(card.playerId + 'bd', BANDS.slice(0, 1)),
    sleeve: pickByHash(card.playerId + 'sl', SLEEVES),
    brow: 0,
    build: pickByHash(card.playerId + 'bu', ['normal', 'normal', 'slim', 'bulky'])
  };
}
function pickHash(str, n) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % n;
}

function drawPortrait(card) {
  const W = 64;
  const cv = new Canvas(W, W);
  const spec = specOf(card);
  const jersey = card.colors.primary;
  const trim = card.colors.secondary;
  const skin = SKIN_TONES[spec.s] || SKIN_TONES[1];
  const hairC = HAIR_COLORS[spec.hc] || HAIR_COLORS[0];

  /* 热血街头风配色（与 config.palette 场景键同值） */
  const SKY = ['#241a4e', '#5a235e', '#b8344e', '#ef6a3a', '#f0853a'].map(hexToRgba);
  const CITY = hexToRgba('#131d3d');
  const LIT = hexToRgba('#ffd23f');
  const WALL = hexToRgba('#7a5238');
  const WALLD = hexToRgba('#5a3a28');
  const FENCE = hexToRgba('#454e5e');
  const CLAY = hexToRgba('#c47f43');
  const CLAYD = hexToRgba('#90562a');
  const CRACK = hexToRgba('#5f3a1c');
  const PATCH = hexToRgba('#7d8a45');
  const GRAFF = ['#ff3f8e', '#74d63f', '#37d6d6', '#a653d6'].map(hexToRgba);
  const OUT = hexToRgba('#07080f');
  const JER = hexToRgba(jersey);
  const JER_D = shade(jersey, -42);
  const TRIM = hexToRgba(trim);
  const SK_L = hexToRgba(skin.light);
  const SK_M = hexToRgba(skin.mid);
  const SK_D = hexToRgba(skin.dark);
  const HC = hexToRgba(hairC);
  const HCD = shade(hairC, -26);
  const NUM = hexToRgba('#f6f7ff');
  const LENS = hexToRgba('#8fd3e8');
  const MOUTH = hexToRgba('#541b1b');
  const TONGUE = hexToRgba('#c24a4a');
  const CLEAR = [0, 0, 0, 0];

  /* —— 背景：黄昏色带 / 楼群剪影 / 涂鸦砖墙 / 铁丝网 / 水泥地（全硬边，无渐变） —— */
  const bandEdge = [0, 4, 8, 12, 16, 20];
  for (let b = 0; b < 5; b++) for (let y = bandEdge[b]; y < bandEdge[b + 1]; y++) cv.rect(0, y, W, 1, SKY[b]);
  for (let bx = 0; bx < W;) {
    const bw = 5 + pickHash('bw' + bx + card.id, 5);
    const bh = 5 + pickHash('bh' + bx + card.id, 8);
    cv.rect(bx, 20 - bh, bw, bh, CITY);
    for (let wy = 20 - bh + 2; wy < 18; wy += 3) {
      for (let wx = bx + 1; wx < bx + bw - 1; wx += 3) {
        if (pickHash('lt' + bx + wx + wy, 3) === 0) cv.set(wx, wy, LIT);
      }
    }
    bx += bw;
  }
  cv.rect(0, 20, W, 12, WALL);
  for (let y = 20; y < 32; y += 4) cv.rect(0, y, W, 1, WALLD);
  cv.rect(0, 23, 1, 1, WALLD); cv.rect(32, 27, 1, 1, WALLD); cv.rect(8, 27, 1, 1, WALLD); cv.rect(40, 23, 1, 1, WALLD);
  const g1 = GRAFF[pickHash(card.id + 'g1', 4)];
  const g2 = GRAFF[pickHash(card.id + 'g2', 4)];
  cv.rect(1, 23, 4, 2, g1); cv.rect(3, 25, 3, 2, g1); cv.rect(5, 27, 2, 2, g1);
  cv.rect(59, 24, 4, 2, g2); cv.rect(57, 26, 4, 2, g2); cv.rect(58, 28, 2, 2, g2);
  for (let x = 0; x < W; x += 8) cv.rect(x, 27, 1, 5, FENCE);
  for (let y = 28; y < 32; y += 2) {
    for (let x = (y % 4 === 0 ? 2 : 0); x < W; x += 8) { cv.set(x, y, FENCE); cv.set(x + 4, y, FENCE); }
  }
  for (let y = 32; y < W; y++) for (let x = 0; x < W; x++) cv.set(x, y, ((x + y) % 2 === 0) ? CLAY : CLAYD);
  [[3, 58], [5, 57], [7, 58], [9, 56], [10, 55], [54, 59], [56, 58], [58, 59], [60, 57]].forEach(([x, y]) => cv.set(x, y, CRACK));
  cv.rect(48, 50, 6, 2, PATCH); cv.rect(10, 52, 5, 2, PATCH);

  /* —— 人物（2.5 头身热血 Q 版：超大头、怒眉、大眼、张嘴呐喊） —— */
  const B = ({
    normal: { hw: 30, shStart: 37, shMax: 22 },
    bulky: { hw: 32, shStart: 36, shMax: 26 },
    tower: { hw: 28, shStart: 39, shMax: 20 },
    slim: { hw: 28, shStart: 38, shMax: 18 }
  })[spec.build] || { hw: 30, shStart: 37, shMax: 22 };
  const hx = 32 - (B.hw >> 1), hy = 2, hw = B.hw, hh = 31;
  const ox = hx - 1, oy = hy - 1, ow = hw + 2;

  /* 肩膀 / 球衣（梯形加宽，描边，两侧阴影） */
  for (let y = B.shStart; y < W; y++) {
    const t = y - B.shStart;
    const half = Math.min(B.shMax, 8 + Math.floor(t * 0.8));
    for (let x = 32 - half; x <= 32 + half; x++) {
      const edge = (x === 32 - half || x === 32 + half);
      cv.set(x, y, edge ? OUT : (Math.abs(x - 32) > half - 4 ? JER_D : JER));
    }
  }
  /* 两侧手臂：袖管 + 前臂（护臂走副色），贴球衣外沿 */
  for (const side of [-1, 1]) {
    const ax = side < 0 ? 32 - B.shMax + 1 : 32 + B.shMax - 5;
    const sleeveOn = spec.sleeve === 'both' || (spec.sleeve === 'r' && side > 0);
    for (let y = B.shStart + 1; y < W; y++) {
      for (let i = 0; i < 5; i++) {
        const isEdge = (i === 0 || i === 4);
        cv.set(ax + i, y, isEdge ? OUT : (y <= B.shStart + 10 ? (sleeveOn ? TRIM : JER_D) : SK_M));
      }
    }
    cv.rect(ax + 1, B.shStart + 10, 3, 1, TRIM);
  }
  /* V 领 + 侧边条纹 */
  cv.rect(25, B.shStart, 14, 1, TRIM);
  for (let i = 0; i < 4; i++) {
    cv.set(26 + i, B.shStart + 2 + i, TRIM);
    cv.set(37 - i, B.shStart + 2 + i, TRIM);
  }
  cv.rect(32 - B.shMax + 2, B.shStart + 5, 2, 18, TRIM);
  cv.rect(32 + B.shMax - 4, B.shStart + 5, 2, 18, TRIM);

  /* 号码（统一 ×4，1px 投影） */
  const numText = String(card.number);
  const numScale = 4;
  const nw = numberWidth(numText, numScale);
  const nx = 32 - (nw >> 1), ny = B.shStart + 7;
  drawNumber(cv, numText, nx + 1, ny + 1, numScale, OUT);
  drawNumber(cv, numText, nx, ny, numScale, NUM);

  /* 脖子（头压在上端） */
  cv.rect(28, hy + hh - 2, 8, B.shStart - (hy + hh) + 4, SK_M);
  cv.rect(28, hy + hh - 2, 2, B.shStart - (hy + hh) + 4, SK_D);

  /* 头（描边 + 切角） */
  cv.rect(ox, oy, ow, hh + 1, OUT);
  cv.set(ox, oy, CLEAR); cv.set(ox + ow - 1, oy, CLEAR);
  cv.rect(hx, hy, hw, hh, SK_L);
  cv.rect(hx, hy + 8, 2, hh - 10, SK_M);
  cv.rect(hx + hw - 2, hy + 6, 2, hh - 7, SK_M);
  cv.rect(hx + 2, hy + hh - 2, hw - 4, 2, SK_M);
  /* 耳朵 */
  cv.rect(hx - 2, hy + 12, 2, 6, SK_M);
  cv.set(hx - 3, hy + 12, OUT); cv.set(hx - 3, hy + 17, OUT);
  cv.rect(hx + hw, hy + 12, 2, 6, SK_M);
  cv.set(hx + hw + 2, hy + 12, OUT); cv.set(hx + hw + 2, hy + 17, OUT);

  /* 发型（热血尖角短发 + 其余既有发型） */
  const hs = spec.hair;
  if (hs === 'short') {
    cv.rect(ox, oy + 1, ow, 4, HC);
    cv.rect(ox, oy + 5, 1, 4, HC);
    cv.rect(ox + ow - 1, oy + 5, 1, 4, HC);
    for (let x = ox + 1; x < ox + ow - 3; x += 5) { cv.rect(x, oy - 1, 3, 3, HC); cv.set(x + 1, oy, HCD); }
  } else if (hs === 'buzz') {
    cv.rect(ox, oy, ow, 3, HC);
    cv.rect(ox, oy + 3, 1, 2, HC);
    cv.rect(ox + ow - 1, oy + 3, 1, 2, HC);
  } else if (hs === 'bald') {
    cv.rect(hx + 6, oy + 2, 9, 1, SK_L);
    cv.rect(hx + 1, hy + 3, 1, 2, HCD);
    cv.rect(hx + hw - 2, hy + 3, 1, 2, HCD);
  } else if (hs === 'receding') {
    cv.rect(ox, oy, ow, 3, HC);
    cv.rect(ox, oy + 3, 4, 2, HC);
    cv.rect(ox + ow - 4, oy + 3, 4, 2, HC);
    cv.rect(ox, oy + 5, 1, 5, HC);
    cv.rect(ox + ow - 1, oy + 5, 1, 5, HC);
  } else if (hs === 'afro') {
    const rows = [[-2, ow + 4], [-3, ow + 6], [-3, ow + 6], [-3, ow + 6], [-2, ow + 4], [0, ow]];
    rows.forEach((rw, i) => cv.rect(ox + rw[0], oy - 1 + i, rw[1], 1, HC));
    cv.rect(ox - 2, oy + 5, 1, 7, HC);
    cv.rect(ox + ow + 1, oy + 5, 1, 7, HC);
  } else if (hs === 'curls') {
    cv.rect(ox, oy + 1, ow, 4, HC);
    for (let x = ox; x < ox + ow; x += 4) { cv.rect(x, oy + 5, 2, 2, HC); cv.rect(x + 1, oy + 7, 2, 1, HC); }
    cv.rect(ox, oy + 5, 1, 3, HC);
    cv.rect(ox + ow - 1, oy + 5, 1, 3, HC);
  } else if (hs === 'braids') {
    cv.rect(ox, oy, ow, 5, HC);
    for (let x = ox + 2; x < ox + ow - 1; x += 4) cv.rect(x, oy + 1, 1, 10, HCD);
    cv.rect(ox, oy + 5, 1, 6, HC);
    cv.rect(ox + ow - 1, oy + 5, 1, 6, HC);
  } else if (hs === 'dreads') {
    cv.rect(ox, oy, ow, 4, HC);
    cv.rect(ox - 2, oy + 3, 2, 9, HC);
    cv.rect(ox + 1, oy + 4, 2, 10, HCD);
    cv.rect(ox + ow - 1, oy + 4, 2, 10, HCD);
    cv.rect(ox + ow, oy + 3, 2, 9, HC);
  } else if (hs === 'ponytail') {
    cv.rect(ox, oy, ow, 4, HC);
    cv.rect(ox + ow, oy + 2, 3, 8, HC);
    cv.rect(ox + ow + 1, oy + 10, 2, 4, HCD);
  } else if (hs === 'long') {
    cv.rect(ox, oy, ow, 4, HC);
    cv.rect(ox - 1, oy + 4, 2, 13, HC);
    cv.rect(ox + ow - 1, oy + 4, 2, 13, HC);
    cv.rect(ox - 1, oy + 17, 1, 3, HCD);
    cv.rect(ox + ow, oy + 17, 1, 3, HCD);
  }

  /* 头饰（压在发型下缘） */
  if (spec.band === 'headband') {
    cv.rect(ox - 2, hy + 7, 2, 4, TRIM);
    cv.rect(ox + ow, hy + 7, 2, 4, TRIM);
    cv.rect(ox, hy + 8, ow, 2, TRIM);
    cv.rect(ox, hy + 10, ow, 1, OUT);
  } else if (spec.band === 'goggles') {
    cv.rect(ox - 1, hy + 12, ow + 2, 1, OUT);
    cv.rect(hx + 3, hy + 13, 8, 6, OUT);
    cv.rect(hx + 4, hy + 14, 6, 4, LENS);
    cv.rect(hx + hw - 11, hy + 13, 8, 6, OUT);
    cv.rect(hx + hw - 10, hy + 14, 6, 4, LENS);
    cv.rect(ox - 1, hy + 12, ow + 2, 1, OUT);
  }

  /* 怒眉（人人有；brow 越高压得越狠、越粗） */
  const bl = spec.brow >= 2 ? 6 : (spec.brow === 1 ? 5 : 4);
  const drawBrow = (left) => {
    const x0 = left ? hx + 4 : hx + hw - 4 - bl;
    for (let k = 0; k < bl; k++) {
      const step = Math.floor(k * 3 / bl);
      const xx = left ? x0 + k : x0 + (bl - 1 - k);
      cv.rect(xx, hy + 11 + step, 1, 2, HC);
    }
  };
  drawBrow(true); drawBrow(false);

  /* 大眼（白框 + 内侧深色瞳孔 + 高光） */
  if (spec.band !== 'goggles') {
    cv.rect(hx + 4, hy + 14, 6, 4, OUT);
    cv.rect(hx + 5, hy + 14, 5, 3, NUM);
    cv.rect(hx + 7, hy + 15, 2, 2, OUT);
    cv.set(hx + 5, hy + 14, LIT);
    cv.rect(hx + hw - 10, hy + 14, 6, 4, OUT);
    cv.rect(hx + hw - 10, hy + 14, 5, 3, NUM);
    cv.rect(hx + hw - 9, hy + 15, 2, 2, OUT);
    cv.set(hx + hw - 6, hy + 14, LIT);
  }

  /* 鼻 */
  cv.rect(31, hy + 19, 2, 2, SK_D);

  /* 胡须（先画，呐喊嘴再压上来） */
  const bc = HCD;
  if (spec.beard === 'mustache') {
    cv.rect(hx + 4, hy + 22, hw - 8, 2, bc);
  } else if (spec.beard === 'goatee') {
    cv.rect(hx + 4, hy + 22, hw - 8, 2, bc);
    cv.rect(30, hy + 28, 4, 3, bc);
  } else if (spec.beard === 'full' || spec.beard === 'long') {
    cv.rect(hx, hy + 18, 2, 10, bc);
    cv.rect(hx + hw - 2, hy + 18, 2, 10, bc);
    cv.rect(hx + 2, hy + 27, hw - 4, 3, bc);
    cv.rect(hx + 4, hy + 22, hw - 8, 2, bc);
    if (spec.beard === 'long') cv.rect(hx + 4, hy + hh - 1, hw - 8, 2, bc);
  } else if (spec.beard === 'chinstrap') {
    cv.rect(hx, hy + 21, 1, 7, bc);
    cv.rect(hx + hw - 1, hy + 21, 1, 7, bc);
    cv.rect(hx, hy + 27, hw, 1, bc);
    cv.rect(hx + 4, hy + 22, hw - 8, 1, bc);
  }

  /* 嘴：全员张开呐喊（上排牙 + 口腔 + 舌头） */
  cv.rect(27, hy + 23, 10, 6, OUT);
  cv.rect(28, hy + 24, 8, 4, MOUTH);
  cv.rect(28, hy + 24, 8, 1, NUM);
  cv.rect(30, hy + 27, 4, 1, TONGUE);

  return cv;
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
  const ids = [
    'curry_stephen_active', 'curry_stephen_rookie', 'antetokounmpo_giannis_active', 'jokic_nikola_active',
    'wembanyama_victor_active', 'holmgren_chet_active', 'oneal_shaquille_peak', 'jordan_michael_peak',
    'iverson_allen_peak', 'bird_larry_peak', 'nowitzki_dirk_peak', 'johnson_magic_peak',
    'davis_anthony_active', 'wade_dwyane_peak', 'harden_james_active', 'doncic_luka_active',
    'gilgeous_alexander_active', 'morant_ja_active', 'allen_jarrett_active', 'ball_lamelo_active',
    'sharpe_shaedon_active', 'banchero_paolo_active', 'kessler_walker_active', 'hartenstein_isaiah_active',
    'williamson_zion_active', 'edey_zach_active', 'zubac_ivica_active', 'white_derrick_active',
    'caruso_alex_active', 'yao_ming_peak', 'james_lebron_active', 'durant_kevin_active',
    'academy_pg_3', 'academy_c_2', 'academy_sg_4', 'academy_pf_1', 'robinson_mitchell_active', 'towns_karlanthony_active'
  ];
  const cell = 64 * 3;
  const cols = 8;
  const rows = Math.ceil(ids.length / cols);
  const cv = new Canvas(cell * cols + 20, cell * rows + 120);
  cv.clear(hexToRgba('#0b1226'));
  let i = 0;
  for (const id of ids) {
    const card = players.getCard(id);
    if (!card) { console.error('preview missing', id); continue; }
    cv.blit(drawPortrait(card).scale(3), (i % cols) * cell + 10, Math.floor(i / cols) * cell + 10);
    i++;
  }
  const yy = rows * cell + 20;
  cv.blit(drawLogo().scale(1), 10, yy);
  ['home', 'stages', 'recruit', 'roster', 'profile'].forEach((k, n) => {
    cv.blit(drawIcon(ICON_ART[k], '#6d78a3'), 140 + n * 150, yy);
    cv.blit(drawIcon(ICON_ART[k], '#ff8a1f'), 140 + n * 150 + 86, yy);
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
