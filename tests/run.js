// AI Accept 2026-10-17 main v1
// 在线工具单元测试入口：node tests/run.js [分类...]
//   - 按 tools.html 的顺序在 node 中加载全部工具脚本（分类文件载入时不访问 document）
//   - 依次执行 tests/*.test.js；每个测试文件导出 function (t, Tools)
//   - 任一断言失败则退出码为 1
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
global.window = global;

// 与 tools.html 中 <script> 顺序保持一致（app.js / main.js 依赖 DOM，不在 node 中加载）
var html = fs.readFileSync(path.join(ROOT, 'tools.html'), 'utf8');
var scripts = [];
html.replace(/<script src="(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g, function (m, src) {
  if (!/js\/(main|tools\/app)\.js$/.test(src)) scripts.push(src);
  return m;
});
scripts.forEach(function (src) { require(path.join(ROOT, src)); });
var Tools = global.Tools;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeT(file) {
  var t = { pass: 0, fail: 0, file: file };
  function report(name, detail) {
    t.fail++;
    console.log('  FAIL ' + name + (detail ? '\n       ' + detail : ''));
  }
  t.ok = function (cond, name, detail) {
    if (cond) t.pass++;
    else report(name, detail);
  };
  t.equal = function (actual, expected, name) {
    if (actual === expected) t.pass++;
    else report(name, 'expected ' + JSON.stringify(expected) + '\n       actual   ' + JSON.stringify(actual));
  };
  t.deepEqual = function (actual, expected, name) {
    if (deepEqual(actual, expected)) t.pass++;
    else report(name, 'expected ' + JSON.stringify(expected) + '\n       actual   ' + JSON.stringify(actual));
  };
  // fn 应抛错；pattern 可选，用于匹配错误消息
  t.throws = function (fn, pattern, name) {
    try {
      fn();
    } catch (e) {
      if (!pattern || pattern.test(String(e && e.message))) { t.pass++; return e; }
      report(name, 'error message ' + JSON.stringify(e && e.message) + ' does not match ' + pattern);
      return e;
    }
    report(name, 'expected to throw');
    return null;
  };
  return t;
}

var only = process.argv.slice(2);
var files = fs.readdirSync(__dirname).filter(function (f) {
  if (!/\.test\.js$/.test(f)) return false;
  return !only.length || only.indexOf(f.replace(/\.test\.js$/, '')) >= 0;
}).sort();

var total = { pass: 0, fail: 0 };
var started = Date.now();
files.forEach(function (f) {
  var t = makeT(f);
  console.log(f);
  try {
    require(path.join(__dirname, f))(t, Tools);
  } catch (e) {
    t.fail++;
    console.log('  CRASH ' + (e && e.stack || e));
  }
  console.log('  ' + t.pass + ' passed, ' + t.fail + ' failed');
  total.pass += t.pass;
  total.fail += t.fail;
});

// 注册表完整性：每个工具都有 id / 分类 / 名称 / 说明，且 id 唯一
var ids = {};
Tools.list.forEach(function (d) {
  if (!d.desc) { total.fail++; console.log('  FAIL tool ' + d.id + ' has no desc'); }
  if (ids[d.id]) { total.fail++; console.log('  FAIL duplicate id ' + d.id); }
  ids[d.id] = true;
});

// smoke.html 的脚本清单须与 tools.html 一致（新增工具文件时两处都要加）
var smoke = fs.readFileSync(path.join(__dirname, 'smoke.html'), 'utf8');
var smokeScripts = [];
smoke.replace(/<script src="\.\.\/(js\/[^"?]+)"><\/script>/g, function (m, src) {
  if (!/js\/tools\/app\.js$/.test(src)) smokeScripts.push(src);
  return m;
});
if (smokeScripts.join() !== scripts.join()) {
  total.fail++;
  console.log('  FAIL tests/smoke.html 的脚本清单与 tools.html 不一致\n       tools.html: ' + scripts.join(', ') + '\n       smoke.html: ' + smokeScripts.join(', '));
}

console.log('\n' + Tools.list.length + ' tools registered · ' + total.pass + ' passed · ' + total.fail + ' failed · ' + (Date.now() - started) + 'ms');
process.exitCode = total.fail ? 1 : 0;
