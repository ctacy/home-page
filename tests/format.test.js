// AI Accept 2026-10-17 main v1
// 格式化工具（SQL / XML / CSS）单元测试。
// 排版细节有多种合理写法，故以「不变量」为主：注释/字符串/标识符原样保留、幂等、
// 美化后再压缩 == 直接压缩、去掉所有空白后与原文一致；仅对规则明确的布局写死期望。
'use strict';

module.exports = function (t, Tools) {
  var L = Tools.lib;

  function lines(s) { return s.split('\n'); }
  function has(s, line) { return lines(s).indexOf(line) >= 0; }
  function noWs(s) { return String(s).replace(/\s+/g, ''); }

  // ============================================================
  // SQL
  // ============================================================
  var q1 = "select a, count(*) as c, N'中文', 'it''s' from [dbo].[t] t inner join \"u\" u on t.id = u.id and u.x = 1 " +
    "where t.a between 1 and 2 and (b = 1 or c = 2) -- 行尾注释\n/* 块注释 */ group by a having count(*) > 1 order by a desc";
  var f1 = L.sqlFormat(q1);
  t.ok(f1.indexOf("'it''s'") >= 0, "SQL 美化：'' 转义的字符串原样保留", f1);
  t.ok(f1.indexOf("N'中文'") >= 0, "SQL 美化：N'' 前缀字符串完整保留", f1);
  t.ok(f1.indexOf('[dbo].[t]') >= 0 && f1.indexOf('"u"') >= 0, 'SQL 美化：[x] 与 "x" 标识符原样保留', f1);
  t.ok(f1.indexOf('-- 行尾注释') >= 0, 'SQL 美化：-- 行注释原样保留', f1);
  t.ok(f1.indexOf('/* 块注释 */') >= 0, 'SQL 美化：/* */ 块注释原样保留', f1);
  t.ok(/-- 行尾注释\n/.test(f1), 'SQL 美化：-- 注释之后必须换行，否则会吞掉后续语句', f1);
  t.ok(f1.indexOf('count(*)') >= 0, 'SQL 美化：函数括号不换行', f1);
  t.ok(has(f1, 'SELECT') && has(f1, 'FROM') && has(f1, 'WHERE') && has(f1, 'GROUP BY') && has(f1, 'HAVING') && has(f1, 'ORDER BY'), 'SQL 美化：主要子句各占一行', f1);
  t.ok(/\n {2}INNER JOIN "u" u\n {4}ON t\.id = u\.id\n {4}AND u\.x = 1/.test(f1), 'SQL 美化：JOIN 缩进，ON / AND 条件再缩进一级', f1);
  t.ok(f1.indexOf('BETWEEN 1 AND 2') >= 0, 'SQL 美化：BETWEEN … AND 保持同一行', f1);
  t.ok(f1.indexOf('(b = 1 OR c = 2)') >= 0, 'SQL 美化：普通括号内的 OR 不拆行', f1);
  t.equal(L.sqlFormat(f1), f1, 'SQL 美化：幂等');
  t.equal(L.sqlMinify(L.sqlFormat(q1, { uppercase: false })), L.sqlMinify(q1), 'SQL：美化（不改大小写）后再压缩 == 直接压缩');
  t.equal(noWs(L.sqlMinify(f1)).toLowerCase(), noWs(L.sqlMinify(q1)).toLowerCase(), 'SQL：美化（关键字大写）后再压缩，除大小写外与直接压缩一致');

  var f2 = L.sqlFormat('select * from (select id from t where x in (select y from z)) s union all select 1');
  var l2 = lines(f2);
  var innerSelect = l2.indexOf('    SELECT');
  t.ok(innerSelect > 0, 'SQL 美化：子查询 SELECT 缩进一级（4 空格）', f2);
  t.ok(l2.indexOf('        SELECT') > innerSelect, 'SQL 美化：嵌套子查询再缩进一级（8 空格）', f2);
  t.ok(has(f2, 'UNION ALL'), 'SQL 美化：UNION ALL 独占一行', f2);
  t.equal(L.sqlFormat(f2), f2, 'SQL 美化：子查询样例幂等');

  var f3 = L.sqlFormat("select case when a=1 then 'x' else 'y' end as v, `k` from t limit 10", { uppercase: false });
  t.ok(f3.indexOf("case when a = 1 then 'x' else 'y' end as v") >= 0, 'SQL 美化：CASE 表达式保持一行', f3);
  t.ok(f3.indexOf('`k`') >= 0, 'SQL 美化：反引号标识符原样保留', f3);
  t.ok(has(f3, 'select') && f3.indexOf('SELECT') < 0, 'SQL 美化：关闭关键字大写时保持原大小写', f3);
  t.ok(has(L.sqlFormat('select 1'), 'SELECT'), 'SQL 美化：默认关键字大写');
  t.ok(has(L.sqlFormat('select a from t', { indent: '4' }), '    a'), 'SQL 美化：4 空格缩进');

  var f4 = L.sqlFormat("insert into t (a,b) values (1,'x'); update t set a=1, b=2 where id=3; delete from t where id=1");
  t.ok(has(f4, 'INSERT INTO') && has(f4, 'VALUES') && has(f4, 'UPDATE') && has(f4, 'SET') && has(f4, 'DELETE FROM'), 'SQL 美化：INSERT / UPDATE / DELETE 子句换行', f4);
  t.ok(/;\n\nUPDATE/.test(f4) && /;\n\nDELETE FROM/.test(f4), 'SQL 美化：多条语句之间空一行', f4);
  t.ok(f4.indexOf("(1, 'x')") >= 0, 'SQL 美化：VALUES 列表逗号后补空格', f4);

  t.equal(L.sqlMinify("select a -- c1\n, b /* c2 */ from t where s = 'a  --  b'"), "select a,b from t where s='a  --  b'", 'SQL 压缩：默认去注释，字符串内的空白与 -- 不受影响');
  var mk = L.sqlMinify("select a -- c1\n, b /* c2 */ from t", { keepComments: true });
  t.ok(mk.indexOf('-- c1\n') >= 0 && mk.indexOf('/* c2 */') >= 0, 'SQL 压缩：保留注释开关，-- 注释后保留换行', mk);
  var m1 = L.sqlMinify(q1);
  t.equal(L.sqlMinify(m1), m1, 'SQL 压缩：幂等');
  t.ok(m1.indexOf('\n') < 0, 'SQL 压缩：去注释后结果为单行', m1);
  t.ok(L.sqlFormat('select #tmp.a from #tmp').indexOf('#tmp.a') >= 0, 'SQL 美化：#临时表 不被当作注释');
  t.throws(function () { L.sqlFormat("select 'abc"); }, /引号未闭合/, 'SQL：字符串未闭合报错');
  t.throws(function () { L.sqlFormat('select 1 /* x'); }, /块注释未闭合/, 'SQL：块注释未闭合报错');

  // ============================================================
  // XML
  // ============================================================
  var x1 = '<?xml version="1.0"?><!DOCTYPE note [<!ENTITY a "b">]><!-- 注释 --><r a="x > y"><b>t</b><e/><c><![CDATA[<x> & y]]></c><d><f>1</f></d></r>';
  var xf = L.xmlFormat(x1);
  t.equal(xf, [
    '<?xml version="1.0"?>',
    '<!DOCTYPE note [<!ENTITY a "b">]>',
    '<!-- 注释 -->',
    '<r a="x > y">',
    '  <b>t</b>',
    '  <e/>',
    '  <c><![CDATA[<x> & y]]></c>',
    '  <d>',
    '    <f>1</f>',
    '  </d>',
    '</r>'
  ].join('\n'), 'XML 美化：PI / DOCTYPE / 注释 / 属性含 > / 自闭合 / CDATA / 嵌套按层缩进');
  t.equal(L.xmlFormat(xf), xf, 'XML 美化：幂等');
  t.ok(has(L.xmlFormat('<r><d><f>1</f></d></r>', { indent: '4' }), '    <d>'), 'XML 美化：4 空格缩进');
  t.ok(L.xmlFormat('<r><!-- 多行\n注释 --><a/></r>').indexOf('<!-- 多行\n注释 -->') >= 0, 'XML 美化：多行注释内容原样保留');
  t.ok(L.xmlFormat('<r><![CDATA[ 保留 <空白> ]]></r>').indexOf('<![CDATA[ 保留 <空白> ]]>') >= 0, 'XML 美化：CDATA 内容（含空白与尖括号）原样保留');

  var xm = L.xmlMinify(xf);
  t.equal(xm, x1, 'XML 压缩：美化结果压缩后还原为原始单行');
  t.equal(L.xmlMinify(xm), xm, 'XML 压缩：幂等');
  t.equal(L.xmlMinify('<r>\n  <!-- c -->\n  <b>t</b>\n</r>'), '<r><!-- c --><b>t</b></r>', 'XML 压缩：默认保留注释');
  t.equal(L.xmlMinify('<r>\n  <!-- c -->\n  <b>t</b>\n</r>', { removeComments: true }), '<r><b>t</b></r>', 'XML 压缩：去注释开关');
  t.throws(function () { L.xmlFormat('<r a="x>'); }, /未闭合/, 'XML：标签未闭合报错');
  t.throws(function () { L.xmlFormat('<r><!-- 没有结束'); }, /未闭合/, 'XML：注释未闭合报错');
  t.throws(function () { L.xmlFormat('<r><![CDATA[ 没有结束'); }, /未闭合/, 'XML：CDATA 未闭合报错');
  // 说明：元素嵌套是否匹配（如 <r><b>）由浏览器内 DOMParser 校验，分词阶段不检查，见浏览器冒烟测试

  // ============================================================
  // CSS
  // ============================================================
  var c1 = '/* 头部注释 */ .a .b>c{color:red;background:url("x;y.png") no-repeat;content:"a{b}"}' +
    '@media (max-width:640px){.c{width:calc(100% - 16px)!important}}@supports (display:grid){.g{display:grid}}';
  var cf = L.cssFormat(c1);
  t.ok(has(cf, '/* 头部注释 */'), 'CSS 美化：注释原样保留', cf);
  t.ok(has(cf, '.a .b>c {'), 'CSS 美化：后代选择器的空格保留', cf);
  t.ok(has(cf, '  background: url("x;y.png") no-repeat;'), 'CSS 美化：url() 内的分号不被当作声明结束', cf);
  t.ok(has(cf, '  content: "a{b}";'), 'CSS 美化：字符串内的花括号不被当作代码块', cf);
  t.ok(has(cf, '  .c {') && has(cf, '    width: calc(100% - 16px) !important;'), 'CSS 美化：@media 内嵌套缩进，calc 空格与 !important 保留', cf);
  t.ok(has(cf, '  .g {') && has(cf, '    display: grid;'), 'CSS 美化：@supports 嵌套缩进', cf);
  t.equal(L.cssFormat(cf), cf, 'CSS 美化：幂等');

  var cm = L.cssMinify('/*! 版权 */ /* 普通 */ .a .b > c , d { color : red ; width: calc(100% - 2px) ; } @media (max-width: 640px) and (min-width: 1px) { a :hover { margin : 0 auto } }');
  t.equal(cm, '.a .b>c,d{color:red;width:calc(100% - 2px)}@media (max-width:640px) and (min-width:1px){a :hover{margin:0 auto}}',
    'CSS 压缩：去注释、去多余空白与末尾分号；保留 calc 运算符空格、and ( 空格与 a :hover 的语义空格');
  t.equal(L.cssMinify(cm), cm, 'CSS 压缩：幂等');
  t.equal(L.cssMinify('/*! 版权 */ /* 普通 */ a{b:c}', { keepImportant: true }), '/*! 版权 */ a{b:c}', 'CSS 压缩：/*! */ 版权注释可选保留');
  // url( "…" ) 括号内、引号外的空白按 CSS 规范无意义，可去掉；引号内必须原样
  t.equal(L.cssMinify('a{content:"x  ;  y";background:url( "a b.png" )}'), 'a{content:"x  ;  y";background:url("a b.png")}', 'CSS 压缩：字符串与 url() 引号内内容原样保留');
  t.equal(L.cssMinify('a{background:url(a;b.png)}'), 'a{background:url(a;b.png)}', 'CSS 压缩：无引号 url() 内的分号不被当作声明结束');
  t.equal(L.cssMinify(cf), L.cssMinify(c1), 'CSS：美化后再压缩 == 直接压缩');
  t.equal(L.cssMinify('a { --gap : 4px ; color : var(--gap) }'), 'a{--gap:4px;color:var(--gap)}', 'CSS 压缩：自定义属性的冒号前空白也去掉');
  t.throws(function () { L.cssFormat('a{content:"x}'); }, /未闭合/, 'CSS：字符串未闭合报错');
  t.throws(function () { L.cssFormat('a{color:red} /* 没有结束'); }, /未闭合/, 'CSS：注释未闭合报错');
};
