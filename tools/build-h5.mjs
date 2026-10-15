/* tools/build-h5.mjs —— 生成 H5 版（零依赖，只用 Node 内置模块）
 * 做什么：把小程序源码（CJS 模块 + WXML/WXSS/JSON 文本）内嵌成 web/dist/bundle.js，
 *         并把 assets/ 复制到 web/dist/assets/。
 * 为什么内嵌：H5 包必须能脱离服务器直接跑（file:// 与 WebView 加载本地文件都要求零 fetch）。
 * 用法：node tools/build-h5.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'web', 'dist');

const MODULE_DIRS = ['utils', 'data', 'store', 'pages', 'components'];
const SKIP_DIRS = new Set(['assets', 'tools', 'web', '.git', 'node_modules']);

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('_')) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const all = walk(ROOT, []);
const modules = {};
const files = {};
let moduleCount = 0;
let fileCount = 0;

const ROOT_JS = new Set(['config.js', 'app.js']);

for (const f of all) {
  const r = rel(f);
  const ext = path.extname(f);
  if (ext === '.js') {
    const top = r.split('/')[0];
    const isRootJs = ROOT_JS.has(r);
    const inModuleDir = MODULE_DIRS.includes(top);
    if (!isRootJs && !inModuleDir) continue;
    modules[r] = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    moduleCount++;
  } else if (ext === '.wxml' || ext === '.wxss' || ext === '.json') {
    const top = r.split('/')[0];
    const isRootFile = r === 'app.json' || r === 'app.wxss' || r === 'sitemap.json';
    const inModuleDir = MODULE_DIRS.includes(top);
    if (!isRootFile && !inModuleDir) continue;
    if (r.endsWith('project.config.json') || r.endsWith('project.private.config.json')) continue;
    files[r] = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    fileCount++;
  }
}

fs.mkdirSync(OUT, { recursive: true });

const header = [
  '/* 由 tools/build-h5.mjs 生成，请勿手改。',
  ' * 内容 = 小程序源码文本（CJS 模块 + WXML/WXSS/JSON），供 web/runtime/loader.js 在浏览器里执行。',
  ' * 生成时间戳不写入文件，保证构建可复现（同源码 => 同产物）。',
  ' */'
].join('\n');

const body =
  header + '\n' +
  'window.__PX_MODULES__ = ' + JSON.stringify(modules, null, 0) + ';\n' +
  'window.__PX_FILES__ = ' + JSON.stringify(files, null, 0) + ';\n';

fs.writeFileSync(path.join(OUT, 'bundle.js'), body, 'utf8');

/* 复制 assets（原样，含立绘 PNG / tabBar 图标） */
const srcAssets = path.join(ROOT, 'assets');
const dstAssets = path.join(OUT, 'assets');
if (fs.existsSync(srcAssets)) {
  fs.mkdirSync(dstAssets, { recursive: true });
  const copy = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) {
        if (e.name === 'fonts') continue;
        fs.mkdirSync(b, { recursive: true });
        copy(a, b);
      } else {
        fs.copyFileSync(a, b);
      }
    }
  };
  copy(srcAssets, dstAssets);
}

/* 复制 web 静态资源（index.html 与 runtime） */
for (const name of ['index.html']) {
  fs.copyFileSync(path.join(ROOT, 'web', name), path.join(OUT, name));
}
const runtimeSrc = path.join(ROOT, 'web', 'runtime');
const runtimeDst = path.join(OUT, 'runtime');
fs.mkdirSync(runtimeDst, { recursive: true });
for (const e of fs.readdirSync(runtimeSrc)) {
  fs.copyFileSync(path.join(runtimeSrc, e), path.join(runtimeDst, e));
}

const bundleSize = fs.statSync(path.join(OUT, 'bundle.js')).size;
console.log('H5 构建完成');
console.log('  模块: ' + moduleCount + ' 个');
console.log('  文本: ' + fileCount + ' 个（wxml/wxss/json）');
console.log('  bundle.js: ' + (bundleSize / 1024).toFixed(1) + ' KB');
console.log('  输出目录: ' + path.relative(ROOT, OUT).split(path.sep).join('/'));