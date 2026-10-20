// AI Accept 2026-10-17 main v1
// 开发辅助类工具单元测试。期望值来自 Date / RegExp / String 原生实现、独立 LCS 实现或手算，不取自被测代码。
'use strict';

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function p2(n) { return (n < 10 ? '0' : '') + n; }

// 独立实现：按本地时区格式化为 YYYY-MM-DD HH:mm:ss
function localString(ms) {
  var d = new Date(ms);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}

// 独立实现：O(n·m) LCS 长度
function lcsLength(a, b) {
  var prev = new Array(b.length + 1).fill(0), cur;
  for (var i = 1; i <= a.length; i++) {
    cur = new Array(b.length + 1).fill(0);
    for (var j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

function lines(text) {
  if (text === '') return [];
  var l = text.split(/\r\n|\r|\n/);
  if (l.length > 1 && l[l.length - 1] === '') l.pop();
  return l;
}

function near(a, b) { return Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)); }

module.exports = function (t, Tools) {
  var L = Tools.lib;
  var r = rng(1017);
  var i;

  // ================= 时间戳 =================
  t.deepEqual(L.tsDetect('1760578200'), { ms: 1760578200000, unit: 's' }, '时间戳 10 位识别为秒');
  t.deepEqual(L.tsDetect('1760578200123'), { ms: 1760578200123, unit: 'ms' }, '时间戳 13 位识别为毫秒');
  t.deepEqual(L.tsDetect('1760578200123456'), { ms: 1760578200123, unit: 'us' }, '时间戳 16 位识别为微秒');
  t.deepEqual(L.tsDetect('1760578200123456789'), { ms: 1760578200123, unit: 'ns' }, '时间戳 19 位识别为纳秒');
  t.deepEqual(L.tsDetect('  -86400 '), { ms: -86400000, unit: 's' }, '时间戳 负数秒（1970 年以前）');
  t.equal(L.tsInfo(-86400000).iso, '1969-12-31T00:00:00.000Z', '时间戳 负数换算 ISO');
  t.equal(L.tsInfo(0).iso, new Date(0).toISOString(), '时间戳 0 为 Unix 纪元');
  t.equal(L.tsInfo(1760578200000).utc, '2025-10-16 01:30:00 UTC', '时间戳 UTC 显示（手算）');
  t.equal(L.tsInfo(1760578200123).utc, '2025-10-16 01:30:00.123 UTC', '时间戳 毫秒部分保留');
  t.equal(L.tsInfo(new Date(2026, 9, 16, 12, 0, 0).getTime()).weekday, '星期五', '时间戳 星期（2026-10-16 为星期五）');
  t.throws(function () { L.tsDetect(''); }, /请输入/, '时间戳 空输入报错');
  t.throws(function () { L.tsDetect('17605x'); }, /数字/, '时间戳 非数字报错');
  t.throws(function () { L.tsDetect('9999999999999999999999999'); }, /范围/, '时间戳 超出 Date 范围报错');

  t.equal(L.parseDateTime('2026-10-16 09:30:00'), new Date(2026, 9, 16, 9, 30, 0).getTime(), '日期 本地时间解析');
  t.equal(L.parseDateTime('2026/1/5'), new Date(2026, 0, 5).getTime(), '日期 斜杠与单数字月日');
  t.equal(L.parseDateTime('2026-10-16T09:30'), new Date(2026, 9, 16, 9, 30).getTime(), '日期 T 分隔无时区按本地');
  t.equal(L.parseDateTime('2026-10-16 09:30:00.5'), new Date(2026, 9, 16, 9, 30, 0, 500).getTime(), '日期 小数秒 .5 为 500 毫秒');
  t.equal(L.parseDateTime('2024-02-29'), new Date(2024, 1, 29).getTime(), '日期 闰年 2 月 29 日');
  t.equal(L.parseDateTime('0099-06-01'), (function () { var d = new Date(2000, 5, 1); d.setFullYear(99); return d.getTime(); })(), '日期 公元 99 年不被映射为 1999');
  ['2026-10-16T09:30:00+08:00', '2026-10-16T01:30:00Z', '2026-10-16T01:30:00.123Z', '2026-10-15T20:30:00-05:00'].forEach(function (s) {
    t.equal(L.parseDateTime(s), Date.parse(s), '日期 ISO 带时区与 Date.parse 一致 ' + s);
  });
  t.equal(L.parseDateTime('2026-10-16T09:30:00+0800'), Date.parse('2026-10-16T09:30:00+08:00'), '日期 ISO 时区 +0800 无冒号');
  t.throws(function () { L.parseDateTime('2026-02-30'); }, /不存在/, '日期 2 月 30 日报错');
  t.throws(function () { L.parseDateTime('2026-02-29'); }, /不存在/, '日期 平年 2 月 29 日报错');
  t.throws(function () { L.parseDateTime('2026-13-01'); }, /范围/, '日期 13 月报错');
  t.throws(function () { L.parseDateTime('2026-10-16 24:00:00'); }, /范围/, '日期 24 时报错');
  t.throws(function () { L.parseDateTime('16/10/2026'); }, /无法识别/, '日期 不支持的格式报错');
  t.throws(function () { L.parseDateTime(''); }, /请输入/, '日期 空输入报错');

  var tsRound = 0;
  for (i = 0; i < 300; i++) {
    var sec = Math.floor(r() * 4e9) - 1e9;
    var ms = sec * 1000;
    var info = L.tsInfo(ms);
    if (info.local !== localString(ms)) tsRound++;
    if (L.parseDateTime(info.local) !== ms) tsRound++;
    if (L.tsDetect(String(sec)).ms !== ms && Math.abs(sec) >= 1e8) tsRound++;
    var withMs = ms + 1 + Math.floor(r() * 998);
    if (L.parseDateTime(L.tsInfo(withMs).local) !== withMs) tsRound++;
  }
  t.equal(tsRound, 0, '时间戳 ↔ 本地时间往返 300 组（含毫秒、1938–2096 年）');

  // ================= 文本对比 =================
  function check(name, a, b, opts) {
    var res = L.diffLines(a, b, opts);
    var ops = res.ops;
    var olds = [], news = [], eq = 0, add = 0, del = 0;
    ops.forEach(function (o) {
      if (o.type === 'eq') { eq++; news.push(o.text); olds.push(lines(a)[o.oldNo - 1]); }
      else if (o.type === 'add') { add++; news.push(o.text); }
      else { del++; olds.push(o.text); }
    });
    t.deepEqual(olds, lines(a), name + '：回放可重建旧文本');
    t.deepEqual(news, lines(b), name + '：回放可重建新文本');
    t.equal(res.added, add, name + '：新增行数统计');
    t.equal(res.removed, del, name + '：删除行数统计');
    var ka = lines(a), kb = lines(b);
    if (opts && (opts.ignoreCase || opts.ignoreWhitespace)) {
      var norm = function (s) { s = opts.ignoreWhitespace ? s.trim() : s; return opts.ignoreCase ? s.toLowerCase() : s; };
      ka = ka.map(norm); kb = kb.map(norm);
    }
    t.equal(eq, lcsLength(ka, kb), name + '：相同行数为最长公共子序列');
    return res;
  }
  var r0 = check('空文本对空文本', '', '');
  t.equal(r0.ops.length, 0, '空文本对空文本无操作');
  check('空文本对新文本', '', 'a\nb\n');
  check('旧文本对空文本', 'a\nb', '');
  var same = check('完全相同', 'a\nb\nc', 'a\nb\nc');
  t.ok(same.added === 0 && same.removed === 0, '完全相同无增删');
  var diffAll = check('完全不同', 'a\nb', 'x\ny\nz');
  t.ok(diffAll.added === 3 && diffAll.removed === 2, '完全不同：3 增 2 删');
  var ins = check('中间插入', 'a\nb\nc', 'a\nb\nX\nc');
  t.ok(ins.added === 1 && ins.removed === 0, '中间插入：1 增');
  t.deepEqual(ins.ops.filter(function (o) { return o.type === 'add'; }).map(function (o) { return [o.text, o.newNo]; }), [['X', 3]], '中间插入：新行号正确');
  var dl = check('中间删除', 'a\nb\nc\nd', 'a\nd');
  t.ok(dl.added === 0 && dl.removed === 2, '中间删除：2 删');
  var mod = check('修改一行', 'a\nb\nc', 'a\nB\nc');
  t.ok(mod.added === 1 && mod.removed === 1, '修改一行：1 增 1 删');
  check('CRLF 与 LF 混用', 'a\r\nb\r\nc', 'a\nb\nc');
  t.equal(L.diffLines('a\r\nb', 'a\nb').added, 0, 'CRLF 与 LF 视为相同行');
  var ws = L.diffLines('  a\nb  ', 'a\nb', { ignoreWhitespace: true });
  t.ok(ws.added === 0 && ws.removed === 0, '忽略首尾空白');
  t.equal(L.diffLines('  a', 'a').added, 1, '不忽略空白时首尾空白算差异');
  var ic = L.diffLines('Hello\nWORLD', 'hello\nworld', { ignoreCase: true });
  t.ok(ic.added === 0 && ic.removed === 0, '忽略大小写');
  check('忽略大小写且有真实差异', 'Hello\nA\nWORLD', 'hello\nworld\nB', { ignoreCase: true });

  var fuzzBad = 0, fuzzT = { equal: function (x, y) { if (x !== y) fuzzBad++; }, deepEqual: function (x, y) { if (JSON.stringify(x) !== JSON.stringify(y)) fuzzBad++; } };
  for (i = 0; i < 250; i++) {
    var alpha = 'abcde'.slice(0, 2 + Math.floor(r() * 4));
    var mk = function () { var n = Math.floor(r() * 14), arr = []; for (var k = 0; k < n; k++) arr.push(alpha.charAt(Math.floor(r() * alpha.length))); return arr.join('\n'); };
    var A = mk(), B = mk();
    var res = L.diffLines(A, B);
    var o = [], nw = [], eqn = 0;
    res.ops.forEach(function (op) {
      if (op.type === 'eq') { eqn++; o.push(lines(A)[op.oldNo - 1]); nw.push(op.text); if (lines(A)[op.oldNo - 1] !== op.text) fuzzBad++; }
      else if (op.type === 'add') nw.push(op.text);
      else o.push(op.text);
    });
    fuzzT.deepEqual(o, lines(A));
    fuzzT.deepEqual(nw, lines(B));
    fuzzT.equal(eqn, lcsLength(lines(A), lines(B)));
  }
  t.equal(fuzzBad, 0, '文本对比 250 组随机对拍：回放还原且公共行数最优');

  var hunk = L.diffHunks(L.diffLines('1\n2\n3\n4\n5\n6\n7\n8\n9\n10', '1\n2\n3\n4\n5\nX\n6\n7\n8\n9\n10').ops, 2);
  t.deepEqual(hunk.map(function (h) { return h.type === 'skip' ? 'skip' + h.count : h.type; }), ['skip3', 'eq', 'eq', 'add', 'eq', 'eq', 'skip3'], '折叠远离差异的相同行（上下文 2 行）');

  var big = [], big2 = [];
  for (i = 0; i < 6000; i++) { big.push('a' + i); big2.push('b' + i); }
  t.throws(function () { L.diffLines(big.join('\n'), big2.join('\n')); }, /过大/, '超大差异（6000×6000 行）拒绝计算');
  var start = Date.now();
  var sameBig = L.diffLines(big.join('\n'), big.concat(['x']).join('\n'));
  t.ok(sameBig.added === 1 && Date.now() - start < 2000, '超大但仅尾部差异时快速完成（公共前缀剥离）');

  // ================= 正则 =================
  function viaNative(source, flags, text) {
    var re = new RegExp(source, flags.indexOf('g') >= 0 ? flags : flags + 'g');
    var out = [];
    var it = text.matchAll(re), m;
    while (!(m = it.next()).done) {
      out.push({ index: m.value.index, text: m.value[0], groups: m.value.slice(1) });
      if (flags.indexOf('g') < 0) break;
    }
    return out;
  }
  [
    ['(?:)', 'g', 'ab'],
    ['(?:)', 'g', '😀'],
    ['(?:)', 'gu', '😀a'],
    ['\\b', 'g', 'hello big world'],
    ['^', 'gm', 'a\nb\nc'],
    ['$', 'gm', 'a\nb\n'],
    ['a*', 'g', 'baaab'],
    ['\\d+', 'g', 'a1b22c333'],
    ['\\d+', '', 'a1b22c333'],
    ['(\\w)(\\d)?', 'g', 'a1 b c3'],
    ['(?<y>\\d{4})-(?<m>\\d{2})', 'g', '2026-10 与 2025-01'],
    ['.', 'gu', 'a😀b'],
    ['.', 'g', 'a😀b'],
    ['abc', 'gi', 'ABC abc AbC'],
    ['a.b', 'gs', 'a\nb'],
    ['foo', 'gy', 'foofoo foo']
  ].forEach(function (c) {
    var got = L.regexMatchAll(c[0], c[1], c[2]).matches.map(function (m) { return { index: m.index, text: m.text, groups: m.groups }; });
    t.deepEqual(got, viaNative(c[0], c[1], c[2]), '正则与 matchAll 一致 /' + c[0] + '/' + c[1] + ' on ' + JSON.stringify(c[2]));
  });
  var named = L.regexMatchAll('(?<y>\\d{4})-(?<m>\\d{2})', 'g', '2026-10').matches[0];
  t.deepEqual(named.named, { y: '2026', m: '10' }, '正则 命名分组');
  t.equal(L.regexMatchAll('a', 'g', 'xyz').matches.length, 0, '正则 无匹配');
  var lim = L.regexMatchAll('(?:)', 'g', new Array(2001).join('x'));
  t.ok(lim.matches.length === 1000 && lim.truncated === true, '正则 匹配数达到 1000 上限并标记截断');
  var exact = L.regexMatchAll('a', 'g', new Array(1001).join('a'));
  t.ok(exact.matches.length === 1000 && exact.truncated === false, '正则 恰好 1000 个匹配不标记截断');
  t.equal(L.regexMatchAll('x', 'g', 'xx', 1).matches.length, 1, '正则 自定义上限');
  t.throws(function () { L.regexMatchAll('(', 'g', 'a'); }, /正则语法错误/, '正则 语法错误报错');
  t.throws(function () { L.regexMatchAll('a', 'gg', 'a'); }, /正则语法错误/, '正则 重复 flag 报错');
  t.deepEqual(L.parseRegexLiteral('/ab+c/gi'), { source: 'ab+c', flags: 'gi' }, '正则 解析 /pattern/flags 字面量');
  t.deepEqual(L.parseRegexLiteral('/a\\/b/'), { source: 'a\\/b', flags: '' }, '正则 字面量含转义斜杠');
  t.equal(L.parseRegexLiteral('abc'), null, '正则 非字面量返回 null');

  [
    ['(\\d{4})-(\\d{2})', 'g', '2026-10, 2025-01', '$2/$1'],
    ['(?<y>\\d{4})-(?<m>\\d{2})', 'g', '2026-10', '$<m>月$<y>年'],
    ['o', 'g', 'foo', '[$&]'],
    ['o', '', 'foo', '0'],
    ['(a)', 'g', 'aa', '$$$1'],
    ['x', 'g', 'axb', '$`|$\'']
  ].forEach(function (c) {
    t.equal(L.regexReplace(c[0], c[1], c[2], c[3]), c[2].replace(new RegExp(c[0], c[1]), c[3]), '正则替换与 String.replace 一致 ' + c[3]);
  });

  // ================= 命名转换 =================
  var expectCase = {
    XMLHttpRequest: { camel: 'xmlHttpRequest', pascal: 'XmlHttpRequest', snake: 'xml_http_request', kebab: 'xml-http-request', constant: 'XML_HTTP_REQUEST', dot: 'xml.http.request', space: 'xml http request', title: 'Xml Http Request' },
    getHTTPResponse2Code: { camel: 'getHttpResponse2Code', pascal: 'GetHttpResponse2Code', snake: 'get_http_response2_code', kebab: 'get-http-response2-code', constant: 'GET_HTTP_RESPONSE2_CODE', dot: 'get.http.response2.code', space: 'get http response2 code', title: 'Get Http Response2 Code' },
    user_name: { camel: 'userName', pascal: 'UserName', snake: 'user_name', kebab: 'user-name', constant: 'USER_NAME', dot: 'user.name', space: 'user name', title: 'User Name' },
    'already-kebab': { camel: 'alreadyKebab', pascal: 'AlreadyKebab', snake: 'already_kebab', kebab: 'already-kebab', constant: 'ALREADY_KEBAB', dot: 'already.kebab', space: 'already kebab', title: 'Already Kebab' },
    'MAX_RETRY_COUNT': { camel: 'maxRetryCount', pascal: 'MaxRetryCount', snake: 'max_retry_count', kebab: 'max-retry-count', constant: 'MAX_RETRY_COUNT', dot: 'max.retry.count', space: 'max retry count', title: 'Max Retry Count' },
    '  hello   world  ': { camel: 'helloWorld', pascal: 'HelloWorld', snake: 'hello_world', kebab: 'hello-world', constant: 'HELLO_WORLD', dot: 'hello.world', space: 'hello world', title: 'Hello World' },
    'api.v2.user-id': { camel: 'apiV2UserId', pascal: 'ApiV2UserId', snake: 'api_v2_user_id', kebab: 'api-v2-user-id', constant: 'API_V2_USER_ID', dot: 'api.v2.user.id', space: 'api v2 user id', title: 'Api V2 User Id' },
    userID: { camel: 'userId', pascal: 'UserId', snake: 'user_id', kebab: 'user-id', constant: 'USER_ID', dot: 'user.id', space: 'user id', title: 'User Id' }
  };
  Object.keys(expectCase).forEach(function (input) {
    t.deepEqual(L.convertCaseAll(input), expectCase[input], '命名转换 ' + JSON.stringify(input));
  });
  t.deepEqual(L.convertCaseAll(''), { camel: '', pascal: '', snake: '', kebab: '', constant: '', dot: '', space: '', title: '' }, '命名转换 空输入');
  var multi = 'getHTTPResponse2Code\nXMLHttpRequest\n\nuser_name'.split('\n').filter(function (s) { return s.trim(); }).map(function (s) { return L.convertCase(s, 'snake'); });
  t.deepEqual(multi, ['get_http_response2_code', 'xml_http_request', 'user_name'], '命名转换 多行逐行处理');
  var caseRound = 0;
  ['camel', 'pascal', 'snake', 'kebab', 'constant', 'dot', 'space', 'title'].forEach(function (f) {
    Object.keys(expectCase).forEach(function (input) {
      var once = L.convertCase(input, f);
      if (L.convertCase(once, 'snake') !== expectCase[input].snake) caseRound++;
    });
  });
  t.equal(caseRound, 0, '命名转换 任一格式再转回 snake 结果一致');
  t.throws(function () { L.convertCase('a', 'unknown'); }, /未知格式/, '命名转换 未知格式报错');

  // ================= 带宽换算 =================
  var bw = L.bwConvert('100', 'Mbps').values;
  t.ok(near(bw['MB/s'], 12.5), '带宽 100 Mbps = 12.5 MB/s', bw['MB/s']);
  t.ok(near(bw.Kbps, 100000), '带宽 100 Mbps = 100000 Kbps（十进制）', bw.Kbps);
  t.ok(near(bw['KB/s'], 12500), '带宽 100 Mbps = 12500 KB/s', bw['KB/s']);
  t.ok(near(bw['MiB/s'], 1e8 / 8 / 1048576), '带宽 100 Mbps 换算 MiB/s', bw['MiB/s']);
  t.ok(near(bw.Gbps, 0.1), '带宽 100 Mbps = 0.1 Gbps', bw.Gbps);
  t.ok(near(L.bwConvert('1', 'GB/s').values.Gbps, 8), '带宽 1 GB/s = 8 Gbps');
  t.ok(near(L.bwConvert('1', 'MiB/s').values['B/s'], 1048576), '带宽 1 MiB/s = 1048576 B/s');
  t.equal(L.bwConvert('1e3', 'bps').bitsPerSec, 1000, '带宽 科学计数法输入');
  t.equal(L.bwConvert('.5', 'Kbps').bitsPerSec, 500, '带宽 省略整数位的小数');
  t.throws(function () { L.bwConvert('-1', 'Mbps'); }, /有效/, '带宽 负数报错');
  t.throws(function () { L.bwConvert('abc', 'Mbps'); }, /有效/, '带宽 非数字报错');
  t.throws(function () { L.bwConvert('', 'Mbps'); }, /有效/, '带宽 空输入报错');
  t.throws(function () { L.bwConvert('1', 'Tbps'); }, /未知单位/, '带宽 未知单位报错');

  var s1024 = L.downloadSeconds('1', 'GB', 1024, '100', 'Mbps');
  var s1000 = L.downloadSeconds('1', 'GB', 1000, '100', 'Mbps');
  t.ok(near(s1024, 1073741824 * 8 / 1e8), '下载耗时 1 GB（1024 进制）@100 Mbps ≈ 85.9 秒', s1024);
  t.ok(near(s1000, 80), '下载耗时 1 GB（1000 进制）@100 Mbps = 80 秒', s1000);
  t.ok(near(L.downloadSeconds('500', 'MB', 1000, '12.5', 'MB/s'), 40), '下载耗时 500 MB @12.5 MB/s = 40 秒');
  t.equal(L.formatDuration(s1024), '0:01:26', '时长格式化 85.9 秒');
  t.equal(L.formatDuration(s1000), '0:01:20', '时长格式化 80 秒');
  t.equal(L.formatDuration(25 * 3600 + 61), '25:01:01', '时长格式化 超过 24 小时');
  t.equal(L.formatDuration(59.6), '0:01:00', '时长格式化 四舍五入进位');
  t.ok(/^0:00:00（约 0\.5 秒）$/.test(L.formatDuration(0.5)), '时长格式化 不足 1 秒', L.formatDuration(0.5));
  t.throws(function () { L.formatDuration(-1); }, /无效/, '时长格式化 负数报错');
  t.throws(function () { L.formatDuration(Infinity); }, /无效/, '时长格式化 无穷大报错');
  t.throws(function () { L.downloadSeconds('1', 'GB', 1024, '0', 'Mbps'); }, /大于 0/, '下载耗时 带宽为 0 报错');
  t.throws(function () { L.downloadSeconds('1', 'PB', 1024, '1', 'Mbps'); }, /未知大小单位/, '下载耗时 未知大小单位报错');
  t.throws(function () { L.downloadSeconds('1', 'GB', 1001, '1', 'Mbps'); }, /1024 或 1000/, '下载耗时 非法进制报错');

  // ================= 数字大小写 =================
  // 期望值来自《支付结算办法》附件「正确填写票据和结算凭证的基本规定」中的示例与手算
  var rmbCases = {
    '1409.50': '壹仟肆佰零玖元伍角整',
    '6007.14': '陆仟零柒元壹角肆分',
    '1680.32': '壹仟陆佰捌拾元叁角贰分',
    '107000.53': '壹拾万柒仟元伍角叁分',
    '325.04': '叁佰贰拾伍元零肆分',
    '16.00': '壹拾陆元整',
    '0': '零元整',
    '0.05': '伍分',
    '0.5': '伍角整',
    '100000000': '壹亿元整',
    '100000001': '壹亿零壹元整',
    '1000010000': '壹拾亿零壹万元整',
    '123450000000': '壹仟贰佰叁拾肆亿伍仟万元整',
    '1000100000000': '壹万零壹亿元整',
    '1000000010000': '壹万亿零壹万元整',
    '9999999999999999.99': '玖仟玖佰玖拾玖万玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分',
    '¥10,005.50': '壹万零伍元伍角整',
    '-12.3': '负壹拾贰元叁角整',
    '１２３': '壹佰贰拾叁元整'
  };
  Object.keys(rmbCases).forEach(function (k) { t.equal(L.rmbUpper(k).text, rmbCases[k], '人民币大写 ' + k); });
  t.equal(L.rmbUpper('1.005').text, '壹元零壹分', '人民币大写 分以下四舍五入');
  t.equal(L.rmbUpper('9.995').text, '壹拾元整', '人民币大写 四舍五入连续进位');
  t.ok(L.rmbUpper('1.005').rounded && !L.rmbUpper('1.000').rounded, '人民币大写 rounded 标记');
  t.equal(L.rmbUpper('-0.001').text, '零元整', '人民币大写 舍入为 0 时不带负号');
  t.throws(function () { L.rmbUpper('12345678901234567'); }, /16 位/, '人民币大写 超过 16 位报错');
  t.throws(function () { L.rmbUpper('9999999999999999.995'); }, /16 位/, '人民币大写 进位后超过 16 位报错');
  t.throws(function () { L.rmbUpper('1e5'); }, /有效/, '人民币大写 科学计数法报错');
  t.throws(function () { L.rmbUpper('.'); }, /有效/, '人民币大写 只有小数点报错');

  var cnLower = {
    '0': '零', '10': '十', '15': '十五', '110': '一百一十', '1005': '一千零五', '10005': '一万零五',
    '100000': '十万', '105000': '十万五千', '1000000001': '十亿零一', '3.14': '三点一四', '-0.5': '负零点五', '2.00': '二点零零'
  };
  Object.keys(cnLower).forEach(function (k) { t.equal(L.numberToChinese(k, false), cnLower[k], '中文小写 ' + k); });
  t.equal(L.numberToChinese('10.5', true), '壹拾点伍', '中文大写 保留首位壹拾');
  t.equal(L.numberToChinese('-0', false), '零', '中文小写 -0 不带负号');

  var cnBack = {
    '壹仟肆佰零玖元伍角整': '1409.5', '陆仟零柒元壹角肆分': '6007.14', '叁佰贰拾伍元零肆分': '325.04',
    '人民币壹拾陆元整': '16', '伍分': '0.05', '零元整': '0', '十五': '15', '一百一十': '110', '三百五': '350',
    '三百零五': '305', '一万五': '15000', '一亿五': '150000000', '一亿零五万': '100050000',
    '一万二千三百四十五亿': '1234500000000', '二〇二六': '2026', '三点一四': '3.14', '点五': '0.5',
    '负十二': '-12', '两千': '2000', '貳萬': '20000', '十亿零一': '1000000001'
  };
  Object.keys(cnBack).forEach(function (k) { t.equal(L.chineseToNumber(k), cnBack[k], '中文转数字 ' + k); });
  t.equal(L.chineseToNumber(L.rmbUpper('9999999999999999.99').text), '9999999999999999.99', '中文转数字 16 位整数不丢精度');
  var cnRound = 0;
  for (var ri = 0; ri < 300; ri++) {
    var rv = String(Math.floor(r() * Math.pow(10, 1 + Math.floor(r() * 15))));
    if (L.chineseToNumber(L.numberToChinese(rv, false)) !== rv || L.chineseToNumber(L.numberToChinese(rv, true)) !== rv) cnRound++;
  }
  t.equal(cnRound, 0, '中文数字 随机整数小写 / 大写往返一致');
  t.throws(function () { L.chineseToNumber('十百'); }, /单位顺序/, '中文转数字 单位顺序错误报错');
  t.throws(function () { L.chineseToNumber('一二十'); }, /缺少单位/, '中文转数字 数字连续报错');
  t.throws(function () { L.chineseToNumber('一万二万'); }, /多次/, '中文转数字 万重复报错');
  t.throws(function () { L.chineseToNumber('一亿亿'); }, /亿亿/, '中文转数字 亿亿报错');
  t.throws(function () { L.chineseToNumber('三abc'); }, /无法识别/, '中文转数字 非法字符报错');
  t.throws(function () { L.chineseToNumber(''); }, /请输入/, '中文转数字 空输入报错');

  t.equal(L.groupThousands('-1234567.891'), '-1,234,567.891', '千分位 负数与小数');
  t.equal(L.groupThousands('123'), '123', '千分位 不足 4 位');
};
