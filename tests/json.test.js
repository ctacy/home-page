// AI Accept 2026-10-17 main v1
// JSON 工具单元测试。期望值来自原生 JSON.parse / JSON.stringify 对拍、RFC 与手写确定结果。
// 说明：lib.xmlToJson 依赖浏览器 DOMParser，node 中不测，由浏览器冒烟测试覆盖。
'use strict';

module.exports = function (t, Tools) {
  var L = Tools.lib;

  // 可复现的伪随机数（mulberry32），便于失败时重放
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var x = Math.imul(seed ^ seed >>> 15, 1 | seed);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function randomValue(r, depth) {
    var x = r();
    if (depth > 3 || x < 0.35) {
      return pick(r, [0, 1, -7, 3.25, -1.5e-7, 2147483648, true, false, null, '', 'x', 'a//b', '/* q */', '中文', 'tab\t', 'q"uote', 'back\\slash', 'line\nbreak', '\u2028']);
    }
    var i, n = Math.floor(r() * 4);
    if (x < 0.65) {
      var a = [];
      for (i = 0; i < n; i++) a.push(randomValue(r, depth + 1));
      return a;
    }
    var o = {};
    for (i = 0; i < n; i++) o[pick(r, ['k', 'id', 'name', 'a b', '//', '中'] ) + i] = randomValue(r, depth + 1);
    return o;
  }
  function errOf(fn) {
    try { fn(); } catch (e) { return e; }
    return null;
  }

  // ============================================================
  // 1. 注释（JSONC）
  // ============================================================
  var sc = L.jsonStripComments('{"u":"http://a.com/x//y","p":"/* no */","q":"a\\"//b"} // tail');
  t.equal(sc.count, 1, '去注释：字符串内的 // 与 /* 不计为注释');
  t.deepEqual(JSON.parse(sc.text), { u: 'http://a.com/x//y', p: '/* no */', q: 'a"//b' }, '去注释：字符串内容（含转义引号）原样保留');

  var multi = '{\n  /* 第一行\n     第二行 */\n  "a": 1\n}';
  var sm = L.jsonStripComments(multi);
  t.equal(sm.count, 1, '去注释：跨行块注释计 1 处');
  t.equal(sm.text.length, multi.length, '去注释：替换为等长空白，长度不变');
  t.equal(sm.text.split('\n').length, multi.split('\n').length, '去注释：块注释内的换行保留，行号不偏移');
  t.equal(L.jsonStripComments('{"a":1}').count, 0, '去注释：无注释时计数为 0');
  t.equal(L.jsonStripComments('// a\n/* b */ {"x":1} // c\n// d').count, 4, '去注释：多处注释逐一计数');
  t.throws(function () { L.jsonStripComments('{"a":1} /* 没有结束'); }, /块注释/, '去注释：未闭合块注释报错');
  var eu = errOf(function () { L.jsonStripComments('{\n  "a": 1 /* x\n}'); });
  t.ok(eu && eu.line === 2 && eu.col === 10, '去注释：未闭合块注释报出原文行列号', eu && eu.message);

  // 用户反馈的真实样例：属性行尾的 //注释
  var user = [
    '{',
    '  "Headers": {',
    '    "cap-callback-name": null,//的',
    '    "cap-msg-id": "335322164322414771",',
    '    "cap-senttime": "10/16/2026 09:29:04"',
    '  },',
    '  "Value": {',
    '    "EPrescriptionId": "e890ed24-b351-4df9-a38a-2520af6298d7",',
    '    "ExtAuditStatus": 4,',
    '    "ExtAuditMind": ""',
    '  }',
    '}'
  ].join('\n');
  var userValue = {
    Headers: { 'cap-callback-name': null, 'cap-msg-id': '335322164322414771', 'cap-senttime': '10/16/2026 09:29:04' },
    Value: { EPrescriptionId: 'e890ed24-b351-4df9-a38a-2520af6298d7', ExtAuditStatus: 4, ExtAuditMind: '' }
  };
  t.deepEqual(L.jsonParse(user), userValue, '解析：默认容忍注释（用户样例）');
  var es = errOf(function () { L.jsonParse(user, { strict: true }); });
  t.ok(es && es.line === 3 && es.col === 31 && /注释/.test(es.message), '解析：strict 模式遇注释报错，指出行列并提示注释', es && es.message);
  t.throws(function () { L.jsonParse('// 只有注释\n/* 没有内容 */'); }, /只有注释/, '解析：输入只有注释时给出明确提示');
  t.throws(function () { L.jsonParse('   '); }, /输入为空/, '解析：空输入报错');

  // 含注释时，后续语法错误的行列号仍指向原文
  var eLine = errOf(function () { L.jsonParse('{\n  // 说明\n  /* 块\n  注释 */\n  "a": 1,\n  "b": ,\n}'); });
  t.ok(eLine && eLine.line === 6 && eLine.col === 8, '解析：注释之后的语法错误，行列号对应原文', eLine && eLine.message);

  // 保留注释的格式化
  var keepUser = L.jsonFormatKeepComments(user, 2);
  t.equal(keepUser.comments, 1, '保留注释格式化：注释计数');
  t.equal(keepUser.text.split('\n')[2], '    "cap-callback-name": null, //的', '保留注释格式化：行尾注释留在原行尾');
  t.deepEqual(L.jsonParse(keepUser.text), userValue, '保留注释格式化：结果再解析等于原值');
  t.equal(L.jsonFormatKeepComments(keepUser.text, 2).text, keepUser.text, '保留注释格式化：幂等');

  var rich = '/* 文件头 */\n{\n  // 独占一行\n  "a": 1, /* 行内块注释 */\n  "b": [1, 2 // 数组内\n  ],\n  "c": {},\n  "d": []\n}\n// 文件尾';
  var rk = L.jsonFormatKeepComments(rich, 2);
  var rkLines = rk.text.split('\n');
  t.equal(rk.comments, 5, '保留注释格式化：五种位置的注释全部保留');
  t.equal(rkLines[0], '/* 文件头 */', '保留注释格式化：文首注释在第一行');
  t.equal(rkLines[rkLines.length - 1], '// 文件尾', '保留注释格式化：文尾注释在最后一行');
  t.ok(rkLines.indexOf('  // 独占一行') >= 0, '保留注释格式化：独占一行的注释保持独占并按层级缩进', rk.text);
  t.ok(rkLines.indexOf('  "a": 1, /* 行内块注释 */') >= 0, '保留注释格式化：行尾块注释留在行尾', rk.text);
  t.ok(rkLines.indexOf('    2 // 数组内') >= 0, '保留注释格式化：数组元素后的注释留在该元素行尾', rk.text);
  t.ok(rkLines.indexOf('  "c": {},') >= 0 && rkLines.indexOf('  "d": []') >= 0, '保留注释格式化：空对象与空数组写成 {} []', rk.text);
  t.deepEqual(L.jsonParse(rk.text), L.jsonParse(rich), '保留注释格式化：复杂样例再解析等于原值');
  t.equal(L.jsonFormatKeepComments(rk.text, 2).text, rk.text, '保留注释格式化：复杂样例幂等');

  var plain = '{"a":[1,{"b":null,"s":"x//y"}],"c":"\\u4e2d","d":{},"e":[],"f":-0.5e3}';
  var pv = JSON.parse(plain);
  t.equal(L.jsonFormatKeepComments(plain, 2).text, JSON.stringify(pv, null, 2).replace('"中"', '"\\u4e2d"').replace('-500', '-0.5e3'),
    '保留注释格式化：无注释时与标准两空格缩进逐字一致（原样保留数字与转义写法）');
  var simple = '{"a":[1,{"b":null}],"c":"x","d":{},"e":[]}';
  var sv = JSON.parse(simple);
  t.equal(L.jsonFormatKeepComments(simple, 2).text, JSON.stringify(sv, null, 2), '保留注释格式化：无注释 · 2 空格 == JSON.stringify');
  t.equal(L.jsonFormatKeepComments(simple, '4').text, JSON.stringify(sv, null, 4), '保留注释格式化：无注释 · 4 空格 == JSON.stringify');
  t.equal(L.jsonFormatKeepComments(simple, 'tab').text, JSON.stringify(sv, null, '\t'), '保留注释格式化：无注释 · Tab == JSON.stringify');
  t.throws(function () { L.jsonFormatKeepComments('{"a":1,}'); }, /第 1 行/, '保留注释格式化：非法 JSON 先校验并报错');

  // 随机对拍：随机 JSON 随机插入注释
  var r1 = rng(20261017), fuzzBad = 0, fuzzMsg = '';
  for (var f = 0; f < 2500; f++) {
    var val = randomValue(r1, 0);
    var ind = pick(r1, [0, 1, 2, '\t']);
    var src = JSON.stringify(val, null, ind).split('\n').map(function (line) {
      var x = r1();
      if (x < 0.12) return line + ' // 行尾 ' + f;
      if (x < 0.2) return '/* 前置 */ ' + line;
      if (x < 0.26) return '// 独占\n' + line;
      if (x < 0.3) return line + ' /* 跨\n行 */';
      return line;
    }).join('\n');
    try {
      var parsed = L.jsonParse(src);
      var kept = L.jsonFormatKeepComments(src, pick(r1, [2, '4', 'tab'])).text;
      if (JSON.stringify(parsed) !== JSON.stringify(val)) throw new Error('jsonParse 结果不等于原值');
      if (JSON.stringify(L.jsonParse(kept)) !== JSON.stringify(val)) throw new Error('保留注释格式化后再解析不等于原值');
      if (L.jsonFormat(src, 2) !== JSON.stringify(val, null, 2)) throw new Error('去注释格式化 != JSON.stringify');
    } catch (e) {
      fuzzBad++;
      if (!fuzzMsg) fuzzMsg = e.message + '\n' + src;
    }
  }
  t.ok(fuzzBad === 0, '随机对拍：2500 组随机 JSON 插入注释后，解析与两种格式化结果均正确', fuzzBad + ' 组失败，首例：' + fuzzMsg);

  // 其余 JSON 工具：带注释输入与无注释输入结果一致
  var clean = '[{"id":1,"name":"张三","tags":["a","b"],"at":"2026-10-16T09:30:00Z"},{"id":2,"name":"李四","extra":null}]';
  var noisy = '// 列表\n[\n  {"id":1, /* 主键 */ "name":"张三", // 姓名\n   "tags":["a","b"], "at":"2026-10-16T09:30:00Z"},\n  /* 第二项 */ {"id":2,"name":"李四","extra":null}\n]';
  t.equal(L.jsonMinify(noisy), L.jsonMinify(clean), '带注释输入：压缩结果与无注释一致');
  t.equal(L.jsonMinify(noisy), JSON.stringify(JSON.parse(clean)), '带注释输入：压缩结果等于标准 JSON');
  t.deepEqual(L.jsonSort(L.jsonParse(noisy)), L.jsonSort(JSON.parse(clean)), '带注释输入：排序结果与无注释一致');
  t.equal(L.jsonToCsv(L.jsonParse(noisy)), L.jsonToCsv(JSON.parse(clean)), '带注释输入：转 CSV 结果与无注释一致');
  t.equal(L.jsonToXml(L.jsonParse(noisy)), L.jsonToXml(JSON.parse(clean)), '带注释输入：转 XML 结果与无注释一致');
  t.equal(L.jsonToYaml(L.jsonParse(noisy)), L.jsonToYaml(JSON.parse(clean)), '带注释输入：转 YAML 结果与无注释一致');
  t.equal(L.jsonToCSharp(L.jsonParse(noisy)), L.jsonToCSharp(JSON.parse(clean)), '带注释输入：生成 C# 结果与无注释一致');
  t.equal(L.jsonToTs(L.jsonParse(noisy)), L.jsonToTs(JSON.parse(clean)), '带注释输入：生成 TypeScript 结果与无注释一致');
  t.equal(L.jsonFormat(noisy, 2), JSON.stringify(JSON.parse(clean), null, 2), '带注释输入：去注释格式化 == 标准格式化');

  // ============================================================
  // 2. 解析报错定位
  // ============================================================
  function loc(src) {
    var e = errOf(function () { L.jsonParse(src, { strict: true }); });
    return e ? [e.line, e.col] : null;
  }
  t.deepEqual(loc('{"a":1,}'), [1, 8], '报错定位：对象尾逗号');
  t.ok(/逗号/.test((errOf(function () { L.jsonParse('{"a":1,}'); }) || {}).message), '报错定位：尾逗号的原因说明提到逗号');
  t.deepEqual(loc('[1,2,]'), [1, 6], '报错定位：数组尾逗号');
  t.deepEqual(loc("{'a':1}"), [1, 2], '报错定位：单引号 key');
  t.ok(/双引号/.test((errOf(function () { L.jsonParse("{'a':1}"); }) || {}).message), '报错定位：单引号的原因说明提到双引号');
  t.deepEqual(loc('{"a":"x\ny"}'), [1, 8], '报错定位：字符串内未转义换行');
  // 列号与 V8 一致：指向导致非法的那个字符（012 中的 1、\x 中的 x）
  t.deepEqual(loc('{"a":012}'), [1, 7], '报错定位：前导零');
  t.deepEqual(loc('{\n  "a" 1\n}'), [2, 7], '报错定位：缺少冒号（第 2 行）');
  t.deepEqual(loc('{"a":1} x'), [1, 9], '报错定位：JSON 结束后有多余内容');
  t.deepEqual(loc('{"a":tru}'), [1, 6], '报错定位：残缺的字面量');
  t.deepEqual(loc('{"a":"\\x"}'), [1, 8], '报错定位：非法转义 \\x');
  t.ok(loc('{"a":[1,2}') !== null, '报错定位：括号不匹配可报错');
  t.ok(loc('{"a":1') !== null, '报错定位：内容意外结束可报错');

  var r2 = rng(42), parseBad = 0, parseMsg = '';
  var mutChars = ['', ',', ':', '{', '}', '[', ']', '"', "'", '\n', '0', '01', '-', '.', 'e', 'tru', 'null', '\\', '\\u12', ' '];
  for (var m = 0; m < 6000; m++) {
    var base = JSON.stringify(randomValue(r2, 0), null, pick(r2, [0, 2]));
    var pos = Math.floor(r2() * (base.length + 1));
    var cut = r2() < 0.5 ? 1 : 0;
    var broken = base.slice(0, pos) + pick(r2, mutChars) + base.slice(pos + cut);
    var nativeOk = true;
    try { JSON.parse(broken); } catch (e1) { nativeOk = false; }
    var ours = errOf(function () { L.jsonParse(broken, { strict: true }); });
    var agree = nativeOk ? ours === null : (ours !== null && (ours.line > 0 || !broken.trim()));
    if (!agree) {
      parseBad++;
      if (!parseMsg) parseMsg = JSON.stringify(broken) + ' native=' + nativeOk + ' ours=' + (ours && ours.message);
    }
  }
  t.ok(parseBad === 0, '随机对拍：6000 组随机损坏 JSON，合法性判定与原生 JSON.parse 一致且报错带行号', parseBad + ' 组不一致，首例：' + parseMsg);

  // ============================================================
  // 3. 排序与转义
  // ============================================================
  var sorted = L.jsonSort({ b: 1, a: { d: [{ z: 1, y: 2 }, 3], c: 0 } });
  t.equal(JSON.stringify(sorted), '{"a":{"c":0,"d":[{"y":2,"z":1},3]},"b":1}', '排序：递归升序，数组内对象也排序');
  t.equal(JSON.stringify(L.jsonSort([3, 1, 2])), '[3,1,2]', '排序：数组元素顺序不变');
  t.equal(JSON.stringify(L.jsonSort({ a: 1, c: 3, b: 2 }, 'desc')), '{"c":3,"b":2,"a":1}', '排序：降序');
  t.equal(L.jsonSort(null), null, '排序：标量原样返回');

  var tricky = 'line1\nline2\t"q" \\ 中文 😀 \u0001 \u2028';
  t.equal(L.jsonEscape(tricky), JSON.stringify(tricky), '转义：与 JSON.stringify 一致');
  t.equal(L.jsonUnescape(L.jsonEscape(tricky)), tricky, '转义往返：带外层引号还原');
  // 不带外层引号时，工具会去掉粘贴内容的首尾空白（有意的容错），故样例不以空白开头或结尾
  var inner = 'a\n"q" \\ 中文 😀 \u0001 b';
  t.equal(L.jsonUnescape(L.jsonEscape(inner).slice(1, -1)), inner, '转义往返：不带外层引号也能还原');
  t.equal(L.jsonUnescape('\\u4e2d\\u6587'), '中文', '去转义：\\uXXXX 还原为中文');
  t.throws(function () { L.jsonUnescape('"\\q"'); }, /不是合法/, '去转义：非法转义报错');
  t.throws(function () { L.jsonUnescape(''); }, /为空/, '去转义：空输入报错');

  // ============================================================
  // 4. CSV（RFC 4180）
  // ============================================================
  t.equal(L.jsonToCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]), 'a,b\r\n1,x\r\n2,y', 'CSV：基本输出，行分隔为 CRLF');
  t.equal(L.jsonToCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }]), 'a,b,c\r\n"x,y","say ""hi""","l1\nl2"', 'CSV：逗号/引号/换行按 RFC 4180 加引号并双写引号');
  t.equal(L.jsonToCsv([{ a: 1 }, { b: 2 }, { a: 3, c: null }]), 'a,b,c\r\n1,,\r\n,2,\r\n3,,', 'CSV：表头取所有 key 并集，缺失与 null 为空');
  t.equal(L.jsonToCsv([{ o: { x: 1 }, arr: [1, 2] }]), 'o,arr\r\n"{""x"":1}","[1,2]"', 'CSV：嵌套对象与数组写成 JSON 字符串');
  t.equal(L.jsonToCsv([{ a: 'x;y', b: 'p,q' }], ';'), 'a;b\r\n"x;y";p,q', 'CSV：分号分隔时只有含分号的字段加引号');
  t.equal(L.jsonToCsv([{ a: 'x\ty', b: 1 }], '\t'), 'a\tb\r\n"x\ty"\t1', 'CSV：Tab 分隔');
  t.equal(L.jsonToCsv({ a: 1 }), 'a\r\n1', 'CSV：单个对象视为一行');
  t.throws(function () { L.jsonToCsv([1, 2]); }, /不是对象/, 'CSV：数组元素不是对象时报错');
  t.throws(function () { L.jsonToCsv('x'); }, /对象数组/, 'CSV：输入不是对象/数组时报错');

  t.deepEqual(L.csvParse('a,b\r\n"x,y","say ""hi"""\r\n"l1\r\nl2",z'), [['a', 'b'], ['x,y', 'say "hi"'], ['l1\r\nl2', 'z']], 'CSV 解析：引号字段、双写引号、字段内 CRLF');
  t.deepEqual(L.csvParse('a,b\n1,2\n'), [['a', 'b'], ['1', '2']], 'CSV 解析：末尾换行不产生空行');
  t.deepEqual(L.csvParse('\ufeffa\n1'), [['a'], ['1']], 'CSV 解析：去掉 UTF-8 BOM');
  t.deepEqual(L.csvParse('a;b\n1;2', ';'), [['a', 'b'], ['1', '2']], 'CSV 解析：分号分隔');
  t.deepEqual(L.csvParse('a,b\n,'), [['a', 'b'], ['', '']], 'CSV 解析：空字段');
  t.throws(function () { L.csvParse('a\n"未闭合'); }, /引号未闭合/, 'CSV 解析：引号未闭合报错');
  t.deepEqual(L.csvToJson('name,age\n张三,30\n\n李四,'), [{ name: '张三', age: '30' }, { name: '李四', age: '' }], 'CSV 转 JSON：跳过空行，缺失值为空串');

  var rows = [{ a: 'x,y', b: 'q"z', c: 'l1\nl2', d: ' 前后空格 ', e: '' }, { a: '1', b: '2', c: '3', d: '4', e: '5' }];
  ['\t', ',', ';'].forEach(function (d) {
    t.deepEqual(L.csvToJson(L.jsonToCsv(rows, d), d), rows, 'CSV 往返：分隔符 ' + JSON.stringify(d) + ' 下字符串值无损');
  });

  // ============================================================
  // 5. XML / YAML
  // ============================================================
  var xml = L.jsonToXml({ root: { '@a': 'x"y\'z<&>', t: 'a & b < c > d', n: null, list: [1, 2] } });
  t.ok(xml.indexOf('<?xml version="1.0" encoding="UTF-8"?>') === 0, 'JSON 转 XML：带 XML 声明');
  t.ok(xml.indexOf('a="x&quot;y&apos;z&lt;&amp;&gt;"') >= 0, 'JSON 转 XML：属性值转义 & < > " \'', xml);
  t.ok(xml.indexOf('<t>a &amp; b &lt; c &gt; d</t>') >= 0, 'JSON 转 XML：文本转义 & < >', xml);
  t.ok(xml.indexOf('<n/>') >= 0, 'JSON 转 XML：null 写成空元素', xml);
  t.ok(xml.indexOf('<list>1</list>') >= 0 && xml.indexOf('<list>2</list>') >= 0, 'JSON 转 XML：数组展开为同名元素', xml);
  t.ok(/<_1abc>/.test(L.jsonToXml({ '1abc': 1, x: 2 })), 'JSON 转 XML：数字开头的 key 改为合法元素名');

  function yamlOf(v) { return L.jsonToYaml({ k: v }); }
  ['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~', '123', '1.5', '0x1F', '1e3', ''].forEach(function (s) {
    t.equal(yamlOf(s), 'k: ' + JSON.stringify(s), 'YAML：易歧义字符串 ' + JSON.stringify(s) + ' 加引号');
  });
  [' lead', 'trail ', 'a: b', 'x #y', '- item', '#c', '@x', '*a', '&a', '!t', '{a}', '[1]'].forEach(function (s) {
    t.equal(yamlOf(s), 'k: ' + JSON.stringify(s), 'YAML：特殊字符串 ' + JSON.stringify(s) + ' 加引号');
  });
  t.equal(yamlOf('hello world'), 'k: hello world', 'YAML：普通字符串不加引号');
  t.equal(yamlOf('中文'), 'k: 中文', 'YAML：中文不加引号');
  t.equal(yamlOf(true), 'k: true', 'YAML：布尔值不加引号');
  t.equal(yamlOf(12), 'k: 12', 'YAML：数字不加引号');
  t.equal(yamlOf(null), 'k: null', 'YAML：null');
  t.equal(yamlOf('a\nb'), 'k: |-\n  a\n  b', 'YAML：多行字符串（无尾换行）用 |-');
  t.equal(yamlOf('a\nb\n'), 'k: |\n  a\n  b', 'YAML：多行字符串（一个尾换行）用 |');
  t.equal(L.jsonToYaml({ a: { b: [1, { c: 'x' }] }, e: [], f: {} }), 'a:\n  b:\n    - 1\n    - c: x\ne: []\nf: {}', 'YAML：嵌套对象与数组、空集合');

  // ============================================================
  // 6. C# / TypeScript 代码生成
  // ============================================================
  var cs = L.jsonToCSharp({
    user_name: 'x', age: 30, big: 3000000000, price: 9.5, ok: true,
    createdAt: '2026-10-16T09:30:00Z', none: null, tags: ['a'],
    address: { city: 'c' }, items: [{ id: 1 }, { id: 2, note: 'n' }]
  });
  t.ok(cs.indexOf('public class Root') >= 0, 'C#：默认根类名 Root');
  t.ok(cs.indexOf('public string UserName { get; set; } = string.Empty;') >= 0, 'C#：snake_case 转 PascalCase，字符串默认值', cs);
  t.ok(cs.indexOf('[JsonPropertyName("user_name")]') >= 0, 'C#：默认带 [JsonPropertyName] 保留原名', cs);
  t.ok(cs.indexOf('public int Age { get; set; }') >= 0, 'C#：整数推断为 int', cs);
  t.ok(cs.indexOf('public long Big { get; set; }') >= 0, 'C#：超出 int 范围推断为 long', cs);
  t.ok(cs.indexOf('public double Price { get; set; }') >= 0, 'C#：小数推断为 double', cs);
  t.ok(cs.indexOf('public bool Ok { get; set; }') >= 0, 'C#：布尔推断为 bool', cs);
  t.ok(cs.indexOf('public DateTime CreatedAt { get; set; }') >= 0, 'C#：ISO 8601 字符串推断为 DateTime', cs);
  t.ok(cs.indexOf('public object? None { get; set; }') >= 0, 'C#：只有 null 的字段推断为 object?', cs);
  t.ok(cs.indexOf('public List<string> Tags { get; set; } = new();') >= 0, 'C#：字符串数组推断为 List<string>', cs);
  t.ok(cs.indexOf('public Address Address { get; set; } = new();') >= 0 && cs.indexOf('public class Address') >= 0, 'C#：嵌套对象生成独立类', cs);
  t.ok(cs.indexOf('public List<Item> Items { get; set; } = new();') >= 0 && cs.indexOf('public class Item') >= 0, 'C#：对象数组生成单数类名 List<Item>', cs);
  t.ok(/public class Item\n\{[\s\S]*Id[\s\S]*Note[\s\S]*\}/.test(cs), 'C#：数组中多个对象的字段合并', cs);
  t.equal(L.jsonToCSharp({ a: 1 }, { attributes: false }).indexOf('JsonPropertyName'), -1, 'C#：关闭特性后不输出 [JsonPropertyName]');
  t.ok(L.jsonToCSharp({ a: 1 }, { rootName: 'order_info' }).indexOf('public class OrderInfo') >= 0, 'C#：根类名可配置并转 PascalCase');
  var dup = L.jsonToCSharp({ from: { x: 1 }, to: { x: 2 }, other: { y: 'a' } });
  t.ok(dup.indexOf('public From From') >= 0 && dup.indexOf('public From To') >= 0, 'C#：结构相同的类复用同一个类名', dup);
  var clash = L.jsonToCSharp({ a: { item: { x: 1 } }, b: { item: { y: 'z' } } });
  t.ok(clash.indexOf('public class Item') >= 0 && clash.indexOf('public class Item2') >= 0, 'C#：结构不同但同名的类自动编号去重', clash);
  t.throws(function () { L.jsonToCSharp([1, 2]); }, /对象/, 'C#：根节点为标量数组时报错');
  t.throws(function () { L.jsonToCSharp('x'); }, /对象/, 'C#：根节点为标量时报错');
  t.ok(L.jsonToCSharp([{ a: 1 }]).indexOf('public class RootItem') >= 0 || L.jsonToCSharp([{ a: 1 }]).indexOf('public class Root') >= 0, 'C#：根为对象数组时可生成');

  var ts = L.jsonToTs({ id: 1, 'user-name': 'x', list: [{ a: 1 }, { a: 2, b: 'x' }], n: null, mix: [1, 'a'] });
  t.ok(ts.indexOf('export interface Root {') >= 0, 'TS：生成根接口', ts);
  t.ok(ts.indexOf('  id: number;') >= 0, 'TS：数字为 number', ts);
  t.ok(ts.indexOf('  "user-name": string;') >= 0, 'TS：非法标识符 key 加引号', ts);
  t.ok(/export interface List\w* \{\n  a: number;\n  b\?: string;\n\}/.test(ts), 'TS：数组内对象合并字段，缺失字段标 ?', ts);
  t.ok(ts.indexOf('  n: null;') >= 0, 'TS：null 字段为 null 类型', ts);
  t.ok(ts.indexOf('  mix: unknown[];') >= 0, 'TS：混合类型数组为 unknown[]', ts);
  t.ok(L.jsonToTs({ a: 1 }, { rootName: 'my_dto' }).indexOf('export interface MyDto') >= 0, 'TS：根名可配置');

  // ============================================================
  // AI Accept 2026-10-17 main v1
  // 字段注释 → 文档注释（jsonCommentMap / C# summary / TS JSDoc）
  // ============================================================
  var P = L.jsonCommentPath;
  var DOCSRC = [
    '// 文首无主注释',
    '{',
    '  "Headers": {',
    '    "cap-callback-name": null,//的',
    '    "cap-msg-id": "335322164322414771", // 消息 ID',
    '    // 发送时间',
    '    "cap-senttime": "10/16/2026 09:29:04"',
    '  },',
    '  "Value": {',
    '    /* 审核状态：4=通过 */',
    '    "ExtAuditStatus": 4',
    '  },',
    '  "Items": [',
    '    { "Sku": "A01", // 商品编码',
    '      "Qty": 2 },',
    '    { "Sku": "B02", "Qty": 1, // 数量',
    '      "Note": "x" }',
    '  ],',
    '  // 第一行说明',
    '  // 第二行说明',
    '  "Multi": 1,',
    '  /*',
    '   * 块注释第一行',
    '   * 块注释第二行',
    '   */',
    '  "Block": true,',
    '  "Last": "z" // 最后一个字段无逗号',
    '  // 对象末尾无主注释',
    '}',
    '// 文末无主注释'
  ].join('\n');
  var cm = L.jsonCommentMap(DOCSRC);
  t.equal(cm[P(['Headers', 'cap-callback-name'])], '的', '注释归属：逗号后紧跟的行尾注释 null,//的');
  t.equal(cm[P(['Headers', 'cap-msg-id'])], '消息 ID', '注释归属：行尾 // 注释（key 含连字符）');
  t.equal(cm[P(['Headers', 'cap-senttime'])], '发送时间', '注释归属：独占一行的注释归给下一个 key');
  t.equal(cm[P(['Value', 'ExtAuditStatus'])], '审核状态：4=通过', '注释归属：独占一行的块注释');
  t.equal(cm[P(['Items', '[]', 'Sku'])], '商品编码', '注释归属：数组元素内的行尾注释，路径记为 []');
  t.equal(cm[P(['Items', '[]', 'Qty'])], '数量', '注释归属：第二个数组元素的注释合并到同一路径');
  t.equal(cm[P(['Multi'])], '第一行说明\n第二行说明', '注释归属：连续多行 // 注释合并为多行说明');
  t.equal(cm[P(['Block'])], '块注释第一行\n块注释第二行', '注释归属：多行块注释保留换行并去掉 * 装饰');
  t.equal(cm[P(['Last'])], '最后一个字段无逗号', '注释归属：最后一个字段（无逗号）的行尾注释');
  t.equal(Object.keys(cm).length, 9, '无主注释（文首 / 对象末尾 / 文末）全部被忽略', JSON.stringify(cm));
  t.equal(cm[P(['Items', '[]', 'Note'])], undefined, '没有注释的字段不出现在映射中');

  var inlineMap = L.jsonCommentMap('{ /* 行内前置 */ "a": 1, "b": { // 对象说明\n "c": [1, // 元素说明，不归属\n 2] } }');
  t.equal(inlineMap[P(['a'])], '行内前置', '注释归属：同一行紧跟 key 的块注释归给该 key');
  t.equal(inlineMap[P(['b'])], '对象说明', '注释归属：{ 之后的行尾注释归给持有该对象的 key');
  t.equal(Object.keys(inlineMap).length, 2, '注释归属：原始值数组内部的行尾注释不归属任何字段', JSON.stringify(inlineMap));
  t.equal(L.jsonCommentMap('[{"a":1 // 根数组\n}]')[P(['[]', 'a'])], '根数组', '注释归属：根为数组时路径以 [] 开头');
  t.equal(L.jsonCommentMap('{"a.b":1 // 点号\n}')[P(['a.b'])], '点号', '注释归属：key 含点号时路径不被拆开');

  var DOCVAL = L.jsonParse(DOCSRC);
  var csOpts = { comments: cm };
  var csDoc = L.jsonToCSharp(DOCVAL, csOpts);
  t.ok(csDoc.indexOf('    /// <summary>\n    /// 消息 ID\n    /// </summary>\n    [JsonPropertyName("cap-msg-id")]\n    public string CapMsgId') >= 0, 'C#：summary 位于特性与属性之上', csDoc);
  t.ok(csDoc.indexOf('    /// <summary>\n    /// 第一行说明\n    /// 第二行说明\n    /// </summary>') >= 0, 'C#：多行注释每行一个 ///', csDoc);
  t.ok(csDoc.indexOf('    /// 商品编码\n    /// </summary>\n    [JsonPropertyName("Sku")]') >= 0, 'C#：数组元素类的字段注释', csDoc);
  t.ok(csDoc.indexOf('    /// 数量\n') >= 0, 'C#：来自第二个数组元素的注释', csDoc);
  t.equal(csOpts.documented, 9, 'C#：统计生成注释的字段数');
  t.equal(L.jsonToCSharp(DOCVAL, { comments: cm, attributes: false }).indexOf('/// </summary>\n    public string CapMsgId') >= 0, true, 'C#：关闭特性时 summary 紧贴属性');
  t.equal(L.jsonToCSharp(DOCVAL), L.jsonToCSharp(L.jsonParse(L.jsonFormat(DOCSRC))), 'C#：不传 comments 时输出与无注释输入逐字相同');
  t.ok(L.jsonToCSharp(DOCVAL).indexOf('///') < 0, 'C#：不传 comments 时不输出文档注释');
  t.equal(L.jsonToCSharp(DOCVAL, { comments: {} }), L.jsonToCSharp(DOCVAL), 'C#：comments 为空映射时输出不变');
  t.ok(csDoc.indexOf('public int ExtAuditStatus { get; set; }') >= 0 && csDoc.indexOf('public bool Block { get; set; }') >= 0, 'C#：注释不影响类型推断', csDoc);
  var esc = L.jsonToCSharp(L.jsonParse('{"a":1}'), { comments: L.jsonCommentMap('{"a":1 // a < b && c > d\n}') });
  t.ok(esc.indexOf('    /// a &lt; b &amp;&amp; c &gt; d\n') >= 0, 'C#：注释文本做 XML 转义', esc);

  // 同构去重的类：两个不同路径的注释都能取到（取第一个非空）
  var dupSrc = '{\n "From": { "Id": 1 },\n "To": { "Id": 2 // 目标 ID\n }\n}';
  var dupCs = L.jsonToCSharp(L.jsonParse(dupSrc), { comments: L.jsonCommentMap(dupSrc) });
  t.ok((dupCs.match(/public class /g) || []).length === 2 && dupCs.indexOf('/// 目标 ID') >= 0, 'C#：同构去重类可取到其他路径上的注释', dupCs);
  var nestedDup = '{\n "A": { "P": { "X": 1 } },\n "B": { "P": { "X": 2 // 深层说明\n } }\n}';
  var nestedCs = L.jsonToCSharp(L.jsonParse(nestedDup), { comments: L.jsonCommentMap(nestedDup) });
  t.ok(nestedCs.indexOf('/// 深层说明') >= 0, 'C#：去重类的嵌套子类也能取到注释', nestedCs);
  t.equal(L.jsonToCSharp(L.jsonParse(nestedDup)), L.jsonToCSharp(JSON.parse(L.jsonFormat(nestedDup))), 'C#：去重路径登记不改变类结构');

  var tsOpts = { comments: cm };
  var tsDoc = L.jsonToTs(DOCVAL, tsOpts);
  t.ok(tsDoc.indexOf('  /** 消息 ID */\n  "cap-msg-id": string;') >= 0, 'TS：单行 JSDoc 位于字段之上（非法标识符 key 加引号）', tsDoc);
  t.ok(tsDoc.indexOf('  /**\n   * 块注释第一行\n   * 块注释第二行\n   */\n  Block: boolean;') >= 0, 'TS：多行 JSDoc', tsDoc);
  t.ok(tsDoc.indexOf('  /** 商品编码 */\n  Sku: string;') >= 0, 'TS：数组元素接口的字段注释', tsDoc);
  t.equal(tsOpts.documented, 9, 'TS：统计生成注释的字段数');
  t.equal(L.jsonToTs(DOCVAL), L.jsonToTs(JSON.parse(L.jsonFormat(DOCSRC))), 'TS：不传 comments 时输出与无注释输入逐字相同');
  t.ok(L.jsonToTs({ a: 1 }, { comments: (function () { var o = {}; o[P(['a'])] = '危险 */ 结束'; return o; })() }).indexOf('/** 危险 *\\/ 结束 */') >= 0, 'TS：注释中的 */ 转义为 *\\/');
};
