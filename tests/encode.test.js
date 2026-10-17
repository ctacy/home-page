// AI Accept 2026-10-17 main v1
// 编码转换类工具单元测试。期望值来自 RFC 测试向量、node 内置实现或手算，不取自被测代码。
'use strict';

var url = require('url');

// node 内置 punycode 模块已弃用，加载时临时屏蔽弃用警告
function loadPunycode() {
  var saved = process.noDeprecation;
  process.noDeprecation = true;
  try { return require('punycode'); } catch (e) { return null; } finally { process.noDeprecation = saved; }
}

// 可复现的伪随机数（mulberry32）
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 随机合法 Unicode 字符串：ASCII / 拉丁 / 中日韩 / emoji，不含孤立代理项
function randomText(r, maxLen) {
  var len = Math.floor(r() * (maxLen + 1)), s = '';
  for (var i = 0; i < len; i++) {
    var k = r(), cp;
    if (k < 0.45) cp = 0x20 + Math.floor(r() * 95);
    else if (k < 0.55) cp = [0x09, 0x0A, 0x0D][Math.floor(r() * 3)];
    else if (k < 0.7) cp = 0xA0 + Math.floor(r() * 0x2E0);
    else if (k < 0.9) cp = 0x4E00 + Math.floor(r() * 0x5000);
    else cp = 0x1F300 + Math.floor(r() * 0x300);
    s += String.fromCodePoint(cp);
  }
  return s;
}

var COMMENT_LIKE = [
  '// 单行注释 x',
  '/* 块注释 y */',
  '<!-- HTML 注释 z -->',
  '{"a": 1, // 行尾注释\n "b": /* 内联 */ 2}',
  '-- SQL 注释\nSELECT 1; # 井号注释'
];

module.exports = function (t, Tools) {
  var L = Tools.lib;
  var r = rng(20261017);
  var i, s;

  // ================= Base64 =================
  var b64 = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
  b64.forEach(function (v) {
    t.equal(L.base64Encode(v[0]), v[1], 'Base64 RFC 4648 向量编码 "' + v[0] + '"');
    t.equal(L.base64Decode(v[1]), v[0], 'Base64 RFC 4648 向量解码 "' + v[1] + '"');
  });
  t.equal(L.base64Encode('中文'), Buffer.from('中文').toString('base64'), 'Base64 中文按 UTF-8 编码');
  t.equal(L.base64Encode('😀'), '8J+YgA==', 'Base64 emoji 四字节 UTF-8');

  var b64Mismatch = 0, b64Url = 0, b64Round = 0;
  for (i = 0; i < 600; i++) {
    s = randomText(r, 40);
    var enc = L.base64Encode(s);
    if (enc !== Buffer.from(s, 'utf8').toString('base64')) b64Mismatch++;
    if (L.base64Encode(s, true) !== Buffer.from(s, 'utf8').toString('base64url')) b64Url++;
    if (L.base64Decode(enc) !== s || L.base64Decode(L.base64Encode(s, true)) !== s) b64Round++;
  }
  t.equal(b64Mismatch, 0, 'Base64 与 Buffer 对拍 600 组随机字符串');
  t.equal(b64Url, 0, 'Base64 URL-safe 与 Buffer base64url 对拍 600 组');
  t.equal(b64Round, 0, 'Base64 标准与 URL-safe 往返还原 600 组');

  var bytesMismatch = 0;
  for (i = 0; i < 300; i++) {
    var n = Math.floor(r() * 50), bytes = new Uint8Array(n);
    for (var j = 0; j < n; j++) bytes[j] = Math.floor(r() * 256);
    var e1 = L.bytesToBase64(bytes);
    if (e1 !== Buffer.from(bytes).toString('base64')) bytesMismatch++;
    if (Buffer.from(L.base64ToBytes(e1)).compare(Buffer.from(bytes)) !== 0) bytesMismatch++;
  }
  t.equal(bytesMismatch, 0, 'Base64 任意字节（含高位字节）与 Buffer 对拍 300 组');

  t.equal(L.base64Encode('\xfb\xff', false), Buffer.from('\xfb\xff', 'utf8').toString('base64'), 'Base64 含 + / 字符的输出');
  t.equal(L.base64Encode('??>', true), Buffer.from('??>').toString('base64url'), 'Base64 URL-safe 用 - _ 且无填充');
  t.equal(L.base64Decode('Zm9v\n YmFy\t'), 'foobar', 'Base64 解码容忍空白与换行');
  t.equal(L.base64Decode('Zm9vYg'), 'foob', 'Base64 解码容忍缺失的 = 填充');
  t.equal(L.base64Decode('Zm9vYmE'), 'fooba', 'Base64 解码容忍缺失的单个 =');
  t.equal(L.base64Decode('5Lit5paH'), '中文', 'Base64 解码中文');
  t.throws(function () { L.base64Decode('Zm9v*YmFy'); }, /非 Base64/, 'Base64 非法字符报错');
  t.throws(function () { L.base64Decode('Zm9vY'); }, /长度/, 'Base64 长度为 4n+1 报错');
  t.throws(function () { L.base64Decode('/w=='); }, /UTF-8/, 'Base64 解码结果非 UTF-8 报错');
  t.throws(function () { L.base64Decode('Zm=9v'); }, /非 Base64/, 'Base64 中间出现 = 报错');

  // ================= URL =================
  var urlMismatch = 0;
  for (i = 0; i < 400; i++) {
    s = randomText(r, 30) + ' &=?/#:@+%';
    if (L.urlEncode(s) !== encodeURIComponent(s)) urlMismatch++;
    if (L.urlEncode(s, 'uri') !== encodeURI(s)) urlMismatch++;
    if (L.urlDecode(encodeURIComponent(s)) !== s) urlMismatch++;
    if (L.urlDecode(encodeURI(s), 'uri') !== decodeURI(encodeURI(s))) urlMismatch++;
  }
  t.equal(urlMismatch, 0, 'URL 编解码与 encodeURIComponent / encodeURI 对拍 400 组');
  t.equal(L.urlEncode('a b&c=中'), 'a%20b%26c%3D%E4%B8%AD', 'URL 组件模式编码保留字');
  t.equal(L.urlEncode('https://a.com/p?q=中 文#h', 'uri'), 'https://a.com/p?q=%E4%B8%AD%20%E6%96%87#h', 'URL 整体模式保留 :/?#');
  t.throws(function () { L.urlDecode('%E4%B8'); }, /%/, 'URL 解码不完整 UTF-8 序列报错');
  t.throws(function () { L.urlDecode('100%'); }, /%/, 'URL 解码孤立 % 报错');
  t.throws(function () { L.urlDecode('%ZZ'); }, /%/, 'URL 解码非十六进制 % 报错');

  var href = 'https://user:pw@例子.测试:8443/a/b%20c?x=1&y=%E4%B8%AD&x=2#frag';
  var u = new URL(href);
  var rows = L.urlParse(href), map = {};
  rows.forEach(function (row) { if (!(row.label in map)) map[row.label] = row.value; });
  t.equal(map['协议'], u.protocol, 'URL 解析协议');
  t.equal(map['主机'], u.hostname, 'URL 解析主机（国际化域名转 Punycode）');
  t.equal(map['端口'], u.port, 'URL 解析端口');
  t.equal(map['用户名'], u.username, 'URL 解析用户名');
  t.equal(map['路径'], u.pathname, 'URL 解析路径');
  t.equal(map['查询串'], u.search, 'URL 解析查询串');
  t.equal(map['锚点'], u.hash, 'URL 解析锚点');
  var params = rows.filter(function (row) { return /^参数 /.test(row.label); }).map(function (row) { return [row.label.slice(3), row.value]; });
  var expectParams = [];
  u.searchParams.forEach(function (v, k) { expectParams.push([k, v]); });
  t.deepEqual(params, expectParams, 'URL 解析查询参数（含重复键与中文解码）');
  t.equal(L.urlParse('http://a.com').filter(function (row) { return row.label === '端口'; })[0].value, '（默认）', 'URL 无端口显示默认');
  t.throws(function () { L.urlParse('a.com/x'); }, /URL/, 'URL 缺协议报错');

  // ================= Escape =================
  var escMismatch = 0;
  for (i = 0; i < 400; i++) {
    s = randomText(r, 30) + '@*_+-./ ';
    if (L.escapeEncode(s) !== escape(s)) escMismatch++;
    if (L.escapeDecode(escape(s)) !== s) escMismatch++;
  }
  t.equal(escMismatch, 0, 'Escape 与全局 escape / unescape 对拍 400 组');
  t.equal(L.escapeEncode('中a b'), '%u4E2Da%20b', 'Escape 中文为 %uXXXX，空格为 %20');
  t.equal(L.escapeDecode('%u4e2d%41'), '中A', 'Escape 解码大小写混合的 %uXXXX 与 %XX');
  t.throws(function () { L.escapeDecode('%u4e'); }, /不完整/, 'Escape 解码不完整 %u 报错');
  t.throws(function () { L.escapeDecode('%Z1'); }, /不完整/, 'Escape 解码非法 %XX 报错');

  // ================= Unicode =================
  var sample = 'A中😀';
  t.equal(L.unicodeEncode(sample, 'u'), '\\u0041\\u4E2D\\uD83D\\uDE00', 'Unicode \\uXXXX 格式，emoji 拆为代理对');
  t.equal(L.unicodeEncode(sample, 'u', true), 'A\\u4E2D\\uD83D\\uDE00', 'Unicode 仅转换非 ASCII');
  t.equal(L.unicodeEncode(sample, 'u-brace'), '\\u{41}\\u{4E2D}\\u{1F600}', 'Unicode \\u{} 码点格式');
  t.equal(L.unicodeEncode(sample, 'html-hex'), '&#x41;&#x4E2D;&#x1F600;', 'Unicode HTML 十六进制实体');
  t.equal(L.unicodeEncode(sample, 'html-dec'), '&#65;&#20013;&#128512;', 'Unicode HTML 十进制实体');
  t.equal(L.unicodeDecode('a\\u4e2d\\uD83D\\uDE00\\u{1F600}&#x6587;&#23383;b'), 'a中😀😀文字b', 'Unicode 反向解析混合格式');
  t.equal(L.unicodeDecode('无转义 \\n \\x41 &amp;'), '无转义 \\n \\x41 &amp;', 'Unicode 非 Unicode 转义原样保留');
  var uniMismatch = 0;
  for (i = 0; i < 300; i++) {
    s = randomText(r, 25);
    ['u', 'u-brace', 'html-hex', 'html-dec'].forEach(function (f) {
      if (L.unicodeDecode(L.unicodeEncode(s, f)) !== s) uniMismatch++;
      if (L.unicodeDecode(L.unicodeEncode(s, f, true)) !== s) uniMismatch++;
    });
    if (L.unicodeEncode(s, 'u') !== s.split('').map(function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }).join('')) uniMismatch++;
  }
  t.equal(uniMismatch, 0, 'Unicode 四种格式往返与独立实现对拍 300 组');
  t.throws(function () { L.unicodeDecode('\\u{110000}'); }, /码点/, 'Unicode 超出范围的码点报错');

  // ================= Base32 =================
  var b32 = [['', ''], ['f', 'MY======'], ['fo', 'MZXQ===='], ['foo', 'MZXW6==='], ['foob', 'MZXW6YQ='], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI======']];
  b32.forEach(function (v) {
    t.equal(L.base32Encode(v[0]), v[1], 'Base32 RFC 4648 向量编码 "' + v[0] + '"');
    t.equal(L.base32Encode(v[0], false), v[1].replace(/=+$/, ''), 'Base32 无填充编码 "' + v[0] + '"');
    t.equal(L.base32Decode(v[1]), v[0], 'Base32 RFC 4648 向量解码 "' + v[1] + '"');
    t.equal(L.base32Decode(v[1].replace(/=+$/, '').toLowerCase()), v[0], 'Base32 解码小写且无填充 "' + v[1] + '"');
  });
  var b32Round = 0;
  for (i = 0; i < 300; i++) {
    s = randomText(r, 30);
    if (L.base32Decode(L.base32Encode(s)) !== s || L.base32Decode(L.base32Encode(s, false)) !== s) b32Round++;
  }
  t.equal(b32Round, 0, 'Base32 往返还原 300 组随机字符串');
  t.throws(function () { L.base32Decode('MZXW1==='); }, /非 Base32/, 'Base32 含数字 1 报错');
  t.throws(function () { L.base32Decode('MZXW8'); }, /非 Base32/, 'Base32 含数字 8 报错');
  t.throws(function () { L.base32Decode('M'); }, /长度/, 'Base32 长度不合法报错');

  // ================= Punycode =================
  // RFC 3492 §7.1 示例
  var rfc = [
    [[0x0644, 0x064A, 0x0647, 0x0645, 0x0627, 0x0628, 0x062A, 0x0643, 0x0644, 0x0645, 0x0648, 0x0634, 0x0639, 0x0631, 0x0628, 0x064A, 0x061F], 'egbpdaj6bu4bxfgehfvwxn', '(A) 阿拉伯文'],
    [[0x4ED6, 0x4EEC, 0x4E3A, 0x4EC0, 0x4E48, 0x4E0D, 0x8BF4, 0x4E2D, 0x6587], 'ihqwcrb4cv8a8dqg056pqjye', '(B) 简体中文'],
    [[0x4ED6, 0x5011, 0x7232, 0x4EC0, 0x9EBD, 0x4E0D, 0x8AAA, 0x4E2D, 0x6587], 'ihqwctvzc91f659drss3x8bo0yb', '(C) 繁体中文'],
    [[0x0033, 0x5E74, 0x0042, 0x7D44, 0x91D1, 0x516B, 0x5148, 0x751F], '3B-ww4c5e180e575a65lsy2b', '(L) 3年B組金八先生'],
    [[0x0070, 0x0061, 0x0074, 0x0074, 0x0079, 0x0068, 0x0065, 0x0072, 0x0020, 0x0072, 0x0061, 0x0074, 0x0020, 0x0068, 0x0061, 0x0074, 0x0020, 0x0061, 0x006E, 0x0064, 0x0020, 0x0079, 0x006F, 0x0075, 0x0020, 0x006B, 0x006E, 0x006F, 0x0077, 0x0073], null, '纯 ASCII']
  ];
  rfc.forEach(function (v) {
    var text = String.fromCodePoint.apply(String, v[0]);
    if (v[1]) {
      t.equal(L.punycodeEncode(text), v[1], 'Punycode RFC 3492 ' + v[2] + ' 编码');
      t.equal(L.punycodeDecode(v[1]), text, 'Punycode RFC 3492 ' + v[2] + ' 解码');
    } else {
      t.equal(L.punycodeDecode(L.punycodeEncode(text)), text, 'Punycode ' + v[2] + ' 往返');
    }
  });
  t.equal(L.punycodeEncode('中文'), 'fiq228c', 'Punycode 「中文」');
  t.equal(L.punycodeEncode('mañana'), 'maana-pta', 'Punycode 「mañana」');
  t.equal(L.domainToAscii('中文.com'), 'xn--fiq228c.com', '域名 中文.com → xn--');
  t.equal(L.domainToAscii('mañana.com'), 'xn--maana-pta.com', '域名 mañana.com → xn--');
  t.equal(L.domainToUnicode('xn--fiq228c.com'), '中文.com', '域名 xn--fiq228c.com → 中文');
  t.equal(L.domainToUnicode('XN--MAANA-PTA.com'), 'mañana.com', '域名 xn-- 前缀与编码大小写不敏感');
  t.equal(L.domainToAscii('中文。com'), 'xn--fiq228c.com', '域名 全角句号分隔');

  ['bücher.de', '例え.テスト', 'münchen.example', '中国移动.中国', 'ελληνικά.gr', 'пример.рф', 'example.com', 'a.b-c.d'].forEach(function (d) {
    t.equal(L.domainToAscii(d), url.domainToASCII(d), '域名与 url.domainToASCII 对拍 ' + d);
    t.equal(L.domainToUnicode(url.domainToASCII(d)), d, '域名 xn-- 解码还原 ' + d);
  });

  var pc = loadPunycode();
  if (pc) {
    var pcMismatch = 0;
    for (i = 0; i < 300; i++) {
      s = randomText(r, 15).replace(/[\s]/g, '');
      if (L.punycodeEncode(s) !== pc.encode(s)) pcMismatch++;
      if (L.punycodeDecode(pc.encode(s)) !== s) pcMismatch++;
    }
    t.equal(pcMismatch, 0, 'Punycode 与 node punycode 模块对拍 300 组');
  }
  t.throws(function () { L.punycodeDecode('ab!c'); }, /非法/, 'Punycode 非法字符报错');
  t.throws(function () { L.punycodeDecode('-9'); }, /不完整|非法/, 'Punycode 不完整输入报错');

  // ================= 摩斯密码 =================
  // ITU-R M.1677-1 码表抽查
  var itu = { A: '.-', B: '-...', E: '.', Q: '--.-', Y: '-.--', Z: '--..', '0': '-----', '5': '.....', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '@': '.--.-.', '/': '-..-.', '=': '-...-' };
  Object.keys(itu).forEach(function (ch) {
    t.equal(L.morseEncode(ch).value, itu[ch], '摩斯 ITU 码表 ' + ch);
    t.equal(L.morseDecode(itu[ch]).value, ch, '摩斯 ITU 解码 ' + ch);
  });
  t.equal(L.morseEncode('SOS').value, '... --- ...', '摩斯 SOS');
  t.equal(L.morseEncode('hi you').value, '.... .. / -.-- --- ..-', '摩斯 小写与默认单词分隔 /');
  t.equal(L.morseDecode('.... .. / -.-- --- ..-').value, 'HI YOU', '摩斯 解码多个单词');
  t.equal(L.morseDecode('···· ··').value, 'HI', '摩斯 解码中点符号');
  t.equal(L.morseEncode('ab cd', '|', ' || ').value, '.-|-... || -.-.|-..', '摩斯 自定义字符与单词分隔符');
  t.equal(L.morseDecode('.- -... || -.-. -..', ' || ').value, 'AB CD', '摩斯 解码自定义单词分隔符');
  var unk = L.morseEncode('a中b');
  t.equal(unk.value, '.- ? -...', '摩斯 未知字符用 ? 占位');
  t.deepEqual(unk.unknown, ['中'], '摩斯 报告未知字符');
  t.deepEqual(L.morseDecode('.- ........').unknown, ['........'], '摩斯 报告未知码');
  var morseRound = 0;
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?!/()&:;=+-_"$@\'';
  for (i = 0; i < 200; i++) {
    var words = [];
    for (var w = 0; w < 1 + Math.floor(r() * 4); w++) {
      var word = '';
      for (var c = 0; c < 1 + Math.floor(r() * 6); c++) word += alphabet.charAt(Math.floor(r() * alphabet.length));
      words.push(word);
    }
    s = words.join(' ');
    if (L.morseDecode(L.morseEncode(s).value).value !== s) morseRound++;
  }
  t.equal(morseRound, 0, '摩斯 全字符表往返 200 组');

  // ================= 类注释文本应按普通文本处理 =================
  COMMENT_LIKE.forEach(function (txt, k) {
    var name = '类注释文本 #' + (k + 1);
    t.equal(L.base64Encode(txt), Buffer.from(txt).toString('base64'), name + ' Base64 原样编码');
    t.equal(L.base64Decode(L.base64Encode(txt)), txt, name + ' Base64 往返');
    t.equal(L.base32Decode(L.base32Encode(txt)), txt, name + ' Base32 往返');
    t.equal(L.urlEncode(txt), encodeURIComponent(txt), name + ' URL 原样编码');
    t.equal(L.urlDecode(L.urlEncode(txt)), txt, name + ' URL 往返');
    t.equal(L.escapeDecode(L.escapeEncode(txt)), txt, name + ' Escape 往返');
    t.equal(L.unicodeDecode(L.unicodeEncode(txt, 'u')), txt, name + ' Unicode 往返');
  });
};
