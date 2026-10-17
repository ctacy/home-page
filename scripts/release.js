// AI Accept 2026-10-17 main v1
// 发布脚本：node scripts/release.js [--dry-run] [--skip-smoke] [--no-bump]
//   1. 单元测试（tests/run.js）
//   2. 浏览器冒烟测试（tests/smoke.html，需本机 Chrome / Edge；找不到时警告并跳过）
//   3. 更新 index.html / tools.html 中 CSS/JS 的 ?v= 版本号（YYYYMMDD + 两位序号，同日递增）
//   4. 校验：页面引用的本地 CSS/JS 都带 ?v=，且文件存在
//   5. 打包 dist/home-page-<版本>.zip（只含需上传到服务器的文件，不含 tests / scripts / 文档）
// 任一步失败即退出（退出码 1），不会产出半成品。
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var PAGES = ['index.html', 'tools.html'];
// 部署到服务器的内容
var DEPLOY = ['index.html', 'tools.html', 'md5.html', 'assets', 'css', 'js'];

var args = process.argv.slice(2);
var DRY = args.indexOf('--dry-run') >= 0;
var SKIP_SMOKE = args.indexOf('--skip-smoke') >= 0;
var NO_BUMP = args.indexOf('--no-bump') >= 0;

function step(msg) { console.log('\n▶ ' + msg); }
function fail(msg) { console.error('\n✖ ' + msg); process.exit(1); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// ---------- 1. 单元测试 ----------
step('单元测试');
var unit = cp.spawnSync(process.execPath, [path.join(ROOT, 'tests', 'run.js')], { encoding: 'utf8' });
var unitLast = (unit.stdout || '').trim().split('\n').pop();
console.log('  ' + unitLast);
if (unit.status !== 0) {
  console.log(unit.stdout);
  console.error(unit.stderr);
  fail('单元测试未通过，已中止发布');
}

// ---------- 2. 浏览器冒烟测试 ----------
function findBrowser() {
  var c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ];
  for (var i = 0; i < c.length; i++) if (c[i] && fs.existsSync(c[i])) return c[i];
  return null;
}

step('浏览器冒烟测试');
if (SKIP_SMOKE) {
  console.log('  已按 --skip-smoke 跳过');
} else {
  var browser = findBrowser();
  if (!browser) {
    console.warn('  ⚠ 未找到 Chrome / Edge（可设置环境变量 CHROME_PATH），跳过冒烟测试');
  } else {
    var url = 'file:///' + path.join(ROOT, 'tests', 'smoke.html').replace(/\\/g, '/');
    var smoke = cp.spawnSync(browser, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files',
      '--virtual-time-budget=60000', '--dump-dom', url], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
    var m = /<pre id="result">([\s\S]*?)<\/pre>/.exec(smoke.stdout || '');
    var result = m ? m[1].trim() : '（未读取到结果）';
    console.log('  ' + result.split('\n').join('\n  '));
    if (!/^PASS/.test(result)) fail('冒烟测试未通过，已中止发布');
  }
}

// ---------- 3. 版本号 ----------
function pad2(n) { return (n < 10 ? '0' : '') + n; }
var now = new Date();
var today = now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());
var current = (/\?v=(\d+)/.exec(read('tools.html')) || [])[1] || '';
var version;
if (NO_BUMP) {
  version = current;
} else if (current.indexOf(today) === 0) {
  version = today + pad2((parseInt(current.slice(8), 10) || 1) + 1);
} else {
  version = today + '01';
}

step('版本号：' + (current || '（无）') + ' → ' + version + (NO_BUMP ? '（--no-bump，不修改）' : ''));
var pageText = {};
PAGES.forEach(function (p) {
  var s = read(p);
  if (!NO_BUMP) s = s.replace(/\?v=\d+/g, '?v=' + version);
  pageText[p] = s;
});

// ---------- 4. 校验引用 ----------
step('校验页面资源引用');
var problems = [];
PAGES.forEach(function (p) {
  var re = /(?:href|src)="((?:css|js|assets)\/[^"]+)"/g, r, n = 0;
  while ((r = re.exec(pageText[p])) !== null) {
    var ref = r[1], file = ref.split('?')[0];
    if (/\.(css|js)$/.test(file) && !/\?v=\d+$/.test(ref)) problems.push(p + '：' + ref + ' 缺少 ?v= 版本号');
    if (!fs.existsSync(path.join(ROOT, file))) problems.push(p + '：引用的 ' + file + ' 不存在');
    n++;
  }
  console.log('  ' + p + '：' + n + ' 个本地资源引用');
});
if (problems.length) fail('资源引用有问题：\n  ' + problems.join('\n  '));

if (DRY) {
  console.log('\n✔ --dry-run：检查全部通过，未写入任何文件');
  process.exit(0);
}
if (!NO_BUMP) PAGES.forEach(function (p) { fs.writeFileSync(path.join(ROOT, p), pageText[p], 'utf8'); });

// ---------- 5. 打包 ----------
var crcTable = null;
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  if (!crcTable) {
    crcTable = [];
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  var crc = 0xffffffff;
  for (var j = 0; j < buf.length; j++) crc = crcTable[(crc ^ buf[j]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function walk(rel, out) {
  var abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isDirectory()) {
    fs.readdirSync(abs).sort().forEach(function (f) { walk(rel + '/' + f, out); });
  } else {
    out.push(rel);
  }
  return out;
}

// 最小 ZIP 写入器（deflate，UTF-8 文件名）
function writeZip(files, dest) {
  var locals = [], centrals = [], offset = 0;
  var t = new Date();
  var dosTime = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1);
  var dosDate = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  files.forEach(function (rel) {
    var data = fs.readFileSync(path.join(ROOT, rel));
    var comp = zlib.deflateRawSync(data, { level: 9 });
    var name = Buffer.from(rel, 'utf8');
    var crc = crc32(data);
    var h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    locals.push(h, name, comp);
    var c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, name);
    offset += h.length + name.length + comp.length;
  });
  var central = Buffer.concat(centrals);
  var end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(dest, Buffer.concat(locals.concat([central, end])));
}

step('打包');
var files = [];
DEPLOY.forEach(function (rel) { walk(rel, files); });
var distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
var zipPath = path.join(distDir, 'home-page-' + version + '.zip');
writeZip(files, zipPath);
console.log('  ' + files.length + ' 个文件 → ' + path.relative(ROOT, zipPath) + '（' + (fs.statSync(zipPath).size / 1024).toFixed(1) + ' KB）');

console.log('\n✔ 发布包已就绪：' + path.relative(ROOT, zipPath));
console.log('  1Panel：网站目录 → 上传该 zip → 解压并覆盖，然后浏览器 Ctrl+F5 验证');
console.log('  建议随后提交：git commit -am "release: ' + version + '"');
