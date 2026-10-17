// AI Accept 2026-10-17 main v1
// 注释场景回归测试：用户日常从代码、配置、日志、SQL 脚本里复制内容，常夹带注释。
// 原则：结构化输入（JSON / SQL / XML / CSS / 正则 / 时间戳 / 变量名 / JWT）应识别并正确处理注释；
//       「注释」本身是数据的场景（哈希、Base64、URL、Unicode 编解码）必须原样对待，不得擅自删除。
module.exports = function (t, Tools) {
  var L = Tools.lib;

  // ---------- SQL ----------
  var sqlHash = L.sqlFormat('SELECT a, b # 取两列\nFROM t # 用户表\nWHERE x = 1', {});
  t.ok(sqlHash.indexOf('b # 取两列\n') >= 0 && /\nFROM\n\s+t # 用户表\n/.test(sqlHash), 'SQL：MySQL # 行注释留在原行尾，不吞下一子句', sqlHash);
  t.equal(L.sqlMinify('SELECT a # 取两列\nFROM t', {}), 'SELECT a FROM t', 'SQL：压缩默认去掉 # 注释');
  var nested = L.sqlFormat('SELECT /* 外 /* 内 */ 外 */ a FROM t', {});
  t.ok(nested.indexOf('/* 外 /* 内 */ 外 */') >= 0 && nested.indexOf('* /') < 0, 'SQL：嵌套块注释整体保留（SQL Server / PostgreSQL）', nested);
  t.throws(function () { L.sqlFormat('SELECT /* 外 /* 内 */ a FROM t', {}); }, /未闭合/, 'SQL：嵌套块注释未闭合报错');
  t.ok(L.sqlFormat('SELECT /*+ INDEX(t idx) */ a FROM t', {}).indexOf('/*+ INDEX(t idx) */') >= 0, 'SQL：优化器提示 /*+ */ 原样保留');
  var kw = L.sqlFormat('SELECT a -- from where select\nFROM t', {});
  t.ok(/a -- from where select\nFROM/.test(kw), 'SQL：注释里的关键字不触发换行', kw);
  t.ok(L.sqlFormat('SELECT * INTO #tmp FROM t', {}).indexOf('#tmp') >= 0, 'SQL：SQL Server #临时表不被当成注释');
  t.equal(L.sqlMinify('SELECT a -- c\nFROM t', { keepComments: true }), 'SELECT a -- c\nFROM t', 'SQL：压缩保留行注释时注释后必须换行，否则吞掉后文');

  // ---------- CSS / SCSS / LESS ----------
  var scss = L.cssFormat('a {\n  color: red; // 主色\n  margin: 0;\n}\n// 结尾', {});
  t.ok(/color: red; \/\/ 主色\n\s+margin: 0;/.test(scss), 'SCSS：// 行尾注释留在原行，下一条声明不被吞进注释', scss);
  t.ok(/\/\/ 结尾$/.test(scss), 'SCSS：文末独立 // 注释保留', scss);
  t.equal(L.cssMinify('a {\n  color: red; // 主色\n  margin: 0;\n}', {}), 'a{color:red;margin:0}', 'SCSS：压缩去掉 // 注释，不吞后文');
  t.equal(L.cssMinify('a{color:red}//x\nb{margin:0}', { keepImportant: true }), 'a{color:red}b{margin:0}', 'SCSS：压缩保留 /*! */ 时也不保留 // 注释');
  var trail = L.cssFormat('a{color:red} // 行尾\nb{margin:0}', {});
  t.ok(/^}\s\/\/ 行尾$/m.test(trail) && /\nb {/.test(trail), 'SCSS：} 后的行尾注释接在 } 所在行', trail);
  var inDecl = L.cssFormat('a {\n  color: red // 没写分号\n  margin: 0;\n}', {});
  t.ok(/color: red \/\/ 没写分号\n\s+margin: 0;/.test(inDecl), 'SCSS：声明未写分号时，注释仍止于行尾', inDecl);
  t.equal(L.cssMinify('a{background:url(//cdn.x.com/a.png)}', {}), 'a{background:url(//cdn.x.com/a.png)}', 'CSS：url(//cdn) 中的 // 不是注释');
  t.equal(L.cssMinify('a{content:"// 不是注释"}', {}), 'a{content:"// 不是注释"}', 'CSS：字符串中的 // 不是注释');
  t.equal(L.cssMinify('a{font:12px/1.5 x}', {}), 'a{font:12px/1.5 x}', 'CSS：单斜杠简写不受影响');
  var block = L.cssFormat('a{color:red;/* 主色 */margin:0}', {});
  t.ok(/\/\* 主色 \*\/\n\s+margin: 0;/.test(block), 'CSS：块注释保留', block);

  // ---------- XML ----------
  var xml = L.xmlFormat('<a><!-- 名称 --><b>1</b><!-- a<b --></a>', {});
  t.ok(xml.indexOf('<!-- 名称 -->') >= 0 && xml.indexOf('<!-- a<b -->') >= 0, 'XML：注释（含 < 字符）原样保留', xml);
  t.equal(L.xmlMinify('<a><!-- c --><b/></a>', { removeComments: true }).indexOf('<!--'), -1, 'XML：压缩可去注释');

  // ---------- 时间戳与日期 ----------
  t.deepEqual(L.tsDetect('1760578200 // 秒'), { ms: 1760578200000, unit: 's' }, '时间戳：行尾 // 注释');
  t.deepEqual(L.tsDetect('1760578200000L'), { ms: 1760578200000, unit: 'ms' }, '时间戳：Java long 的 L 后缀');
  t.deepEqual(L.tsDetect('"1760578200", # 秒'), { ms: 1760578200000, unit: 's' }, '时间戳：引号、逗号与 # 注释');
  t.deepEqual(L.tsDetect('1760578200 /* 秒 */'), { ms: 1760578200000, unit: 's' }, '时间戳：块注释');
  t.deepEqual(L.tsDetect('-86400'), { ms: -86400000, unit: 's' }, '时间戳：负数不被当成 -- 注释');
  t.throws(function () { L.tsDetect('// 只有注释'); }, /请输入/, '时间戳：只有注释时提示输入');
  var base = L.parseDateTime('2026-10-16 09:30:00');
  t.equal(L.parseDateTime('2026-10-16 09:30:00 // 下单时间'), base, '日期：行尾 // 注释');
  t.equal(L.parseDateTime('"2026-10-16 09:30:00", -- 下单'), base, '日期：引号、逗号与 -- 注释');
  t.equal(L.parseDateTime('2026/10/16 09:30:00'), base, '日期：斜杠分隔不被当成注释');
  t.equal(L.parseDateTime('2026-10-16T01:30:00Z /* UTC */'), Date.parse('2026-10-16T01:30:00Z'), '日期：ISO 带块注释');

  // ---------- 正则 ----------
  t.deepEqual(L.parseRegexLiteral('/^\\d+$/g // 纯数字'), { source: '^\\d+$', flags: 'g' }, '正则：字面量带行尾注释');
  t.deepEqual(L.parseRegexLiteral('/a\\/b/i; /* 路径 */'), { source: 'a\\/b', flags: 'i' }, '正则：字面量带分号与块注释');
  t.deepEqual(L.parseRegexLiteral('/^https?:\\/\\//'), { source: '^https?:\\/\\/', flags: '' }, '正则：模式中转义的 // 不是注释');
  t.equal(L.parseRegexLiteral('^\\d+$'), null, '正则：非字面量返回 null');
  t.deepEqual(L.parseRegexLiteral('/[/]+/g // 斜杠'), { source: '[/]+', flags: 'g' }, '正则：字符类中的 / 不是结束符');
  t.deepEqual(L.parseRegexLiteral('/a/gi'), { source: 'a', flags: 'gi' }, '正则：普通字面量');

  // ---------- 变量命名转换 ----------
  t.equal(L.convertCase('user_name // 用户名', 'camel'), 'userName', '命名：行尾 // 注释不参与转换');
  t.equal(L.convertCase('order_id /* 订单 */', 'pascal'), 'OrderId', '命名：块注释不参与转换');
  t.equal(L.convertCase('api/v1/user_name', 'snake'), 'api_v1_user_name', '命名：单斜杠路径仍按分隔符处理');

  // ---------- JWT ----------
  var JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  var C = L.crypto;
  [JWT + ' // 测试令牌', '"' + JWT + '", // 带引号', 'Authorization: Bearer ' + JWT, 'Bearer ' + JWT + ' /* x */'].forEach(function (input, i) {
    var d = C.jwtDecode(input);
    t.equal(d.signingInput + '.' + d.signature, JWT, 'JWT：去掉注释、引号与请求头前缀 #' + (i + 1));
  });

  // ---------- CSV ----------
  t.deepEqual(L.csvToJson('# 导出于 2026-10-16\nname,age\n张三,30', ',', { skipComments: true }), [{ name: '张三', age: '30' }], 'CSV：勾选后跳过 # 注释行');
  t.deepEqual(L.csvToJson('id,tag\n1,#热门', ','), [{ id: '1', tag: '#热门' }], 'CSV：默认不跳过，非首列的 # 数据保留');

  // ---------- 「注释」即数据：必须原样处理 ----------
  var hashIn = 'SELECT 1 -- 注释也是内容';
  t.ok(L.hash.hex('md5', L.utf8Encode(hashIn)) !== L.hash.hex('md5', L.utf8Encode('SELECT 1')), '哈希：注释参与计算，不被删除');
  t.equal(L.base64Decode(L.base64Encode('a // b /* c */')), 'a // b /* c */', 'Base64：含注释样式的文本原样往返');
  t.deepEqual(Array.prototype.slice.call(L.base64ToBytes('//8=')), [255, 255], 'Base64：以 // 开头的合法数据不被当成注释');
  t.equal(L.urlDecode('a%3D1 // 参数', 'component'), 'a=1 // 参数', 'URL：注释样式文本原样保留');
  t.equal(L.unicodeDecode('"\\u4e2d" // 中'), '"中" // 中', 'Unicode：只解码转义，注释原样保留');
};
