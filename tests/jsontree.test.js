// AI Accept 2026-10-17 main v1
// JSON 树形视图 / JSONPath：期望值按 Stefan Goessner《JSONPath - XPath for JSON》规范手写得出，
// 不依赖工具当前输出。树的 DOM 渲染由 tests/smoke.html 覆盖。
module.exports = function (t, Tools) {
  var L = Tools.lib;

  function store() {
    return {
      store: {
        book: [
          { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
          { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
          { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
          { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 }
        ],
        bicycle: { color: 'red', price: 19.95 }
      }
    };
  }
  var S = store();
  var B = S.store.book;
  function vals(expr, data) { return L.jsonPath(data || S, expr).map(function (r) { return r.value; }); }
  function paths(expr, data) { return L.jsonPath(data || S, expr).map(function (r) { return r.path; }); }
  var AUTHORS = ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien'];

  // ---------- Goessner bookstore 示例 ----------
  t.deepEqual(vals('$.store.book[*].author'), AUTHORS, 'bookstore：$.store.book[*].author 所有作者');
  t.deepEqual(vals('$..author'), AUTHORS, 'bookstore：$..author 递归取作者');
  t.deepEqual(vals('$.store.*'), [B, S.store.bicycle], 'bookstore：$.store.* store 下所有成员');
  t.deepEqual(vals('$.store..price'), [8.95, 12.99, 8.99, 22.99, 19.95], 'bookstore：$.store..price 所有价格（文档顺序）');
  t.deepEqual(vals('$..book[2]'), [B[2]], 'bookstore：$..book[2] 第三本书');
  t.deepEqual(vals('$..book[-1]'), [B[3]], 'bookstore：$..book[-1] 最后一本书');
  t.deepEqual(vals('$..book[0,1]'), [B[0], B[1]], 'bookstore：$..book[0,1] 联合下标');
  t.deepEqual(vals('$..book[:2]'), [B[0], B[1]], 'bookstore：$..book[:2] 切片');
  t.deepEqual(vals('$..book[?(@.isbn)]'), [B[2], B[3]], 'bookstore：$..book[?(@.isbn)] 存在性过滤');
  t.deepEqual(vals('$..book[?(@.price<10)]'), [B[0], B[2]], 'bookstore：$..book[?(@.price<10)] 比较过滤');
  // $..* = store + book 数组 + 4 本书 + 书的 4+4+5+5 个字段 + bicycle + 其 2 个字段 = 27
  t.equal(L.jsonPath(S, '$..*').length, 27, 'bookstore：$..* 所有后代共 27 个');
  t.deepEqual(paths('$..book[2].title'), ['$.store.book[2].title'], 'bookstore：结果路径格式');
  t.deepEqual(vals('$'), [S], '仅 $ 返回根');
  t.deepEqual(vals('$.store.book.length'), [], '数组没有 length 属性（不暴露原型/内置属性）');

  // ---------- 特殊字符 key ----------
  var K = { 'cap-callback-name': null, "a'b": 1, 'x y': 2, '中文': 3, 'a.b': 4, 'a\\b': 5 };
  t.deepEqual(vals("$['cap-callback-name']", K), [null], "特殊 key：['cap-callback-name']");
  t.deepEqual(vals('$.cap-callback-name', K), [null], '特殊 key：点号写法允许连字符');
  t.deepEqual(vals("$['a\\'b']", K), [1], "特殊 key：单引号转义 ['a\\'b']");
  t.deepEqual(vals('$["x y"]', K), [2], '特殊 key：双引号与空格');
  t.deepEqual(vals('$.中文', K), [3], '特殊 key：中文点号写法');
  t.deepEqual(vals("$['a.b']", K), [4], '特殊 key：key 中含点号');
  t.deepEqual(vals("$['a\\'b','不存在','x y']", K), [1, 2], '特殊 key：联合 key，不存在的项被忽略');
  t.deepEqual(paths('$.*', K), ["$['cap-callback-name']", "$['a\\'b']", "$['x y']", "$['中文']", "$['a.b']", "$['a\\\\b']"], '路径生成：非法标识符用 [\'…\'] 并转义 \\ 与 \'');
  t.equal(L.jsonPathOf(['Headers', 'cap-callback-name']), "$.Headers['cap-callback-name']", 'jsonPathOf：连字符 key');
  t.equal(L.jsonPathOf(['Items', 0, 'Sku']), '$.Items[0].Sku', 'jsonPathOf：数组下标');
  t.equal(L.jsonPathOf(['_a$1', '1a']), "$._a$1['1a']", 'jsonPathOf：数字开头 key 加引号');
  t.equal(L.jsonPathOf([]), '$', 'jsonPathOf：根');
  // 生成的路径可再次查询回同一节点
  var round = { 'a-b': [{ "it's": { 'x y': 42 } }] };
  var p = L.jsonPath(round, '$..*').filter(function (r) { return r.value === 42; })[0].path;
  t.deepEqual(vals(p, round), [42], '路径往返：生成的路径可再查询回原节点（' + p + '）');

  // ---------- 下标与切片 ----------
  var A = { a: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
  t.deepEqual(vals('$.a[-10]', A), [0], '负下标：-10 为第一个');
  t.deepEqual(vals('$.a[-11]', A), [], '负下标越界返回空');
  t.deepEqual(vals('$.a[10]', A), [], '下标越界返回空');
  t.deepEqual(vals('$.a[0:5:2]', A), [0, 2, 4], '切片步长 2');
  t.deepEqual(vals('$.a[::-1]', A), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], '切片步长 -1 反序');
  t.deepEqual(vals('$.a[-3:]', A), [7, 8, 9], '切片负起点');
  t.deepEqual(vals('$.a[5:2:-1]', A), [5, 4, 3], '切片负步长区间');
  t.deepEqual(vals('$.a[8:100]', A), [8, 9], '切片终点越界截断');
  t.deepEqual(vals('$.a[3:1]', A), [], '切片空区间');
  t.deepEqual(vals('$.a[*]', A).length, 10, '[*] 数组全部元素');
  t.deepEqual(vals('$.a.*', A).length, 10, '.* 数组全部元素');

  // ---------- 过滤 ----------
  var F = {
    items: [
      { name: 'A', tag: 'x', price: 5, ok: true, meta: { level: 1 } },
      { name: 'B', tag: 'y', price: 15, ok: false, meta: { level: 2 } },
      { name: 'C', tag: 'x', price: 25, meta: { level: 3 } },
      { tag: 'z', price: null }
    ],
    limit: 20
  };
  function names(expr) { return vals(expr, F).map(function (x) { return x.name; }); }
  t.deepEqual(names("$.items[?(@.tag == 'x')]"), ['A', 'C'], "过滤：字符串相等 == 'x'");
  t.deepEqual(names('$.items[?(@.tag != "x")]'), ['B', undefined], '过滤：不等 !=（双引号）');
  t.deepEqual(names("$.items[?(@.tag == 'x' && @.price > 10)]"), ['C'], '过滤：&& 组合');
  t.deepEqual(names("$.items[?(@.tag == 'y' || @.price >= 25)]"), ['B', 'C'], '过滤：|| 组合');
  t.deepEqual(names('$.items[?(!@.name)]'), [undefined], '过滤：! 取反存在性');
  t.deepEqual(names('$.items[?(@.ok)]'), ['A', 'B'], '过滤：存在性——值为 false 也算存在');
  t.deepEqual(names('$.items[?(@.ok == false)]'), ['B'], '过滤：与 false 比较');
  t.deepEqual(names('$.items[?(@.price == null)]'), [undefined], '过滤：与 null 比较');
  t.deepEqual(names('$.items[?(@.meta.level <= 2)]'), ['A', 'B'], '过滤：嵌套路径 @.meta.level');
  t.deepEqual(names("$.items[?(@['tag'] == 'z')]"), [undefined], "过滤：@['key'] 写法");
  t.deepEqual(names('$.items[?(@.price < $.limit)]'), ['A', 'B'], '过滤：引用根节点 $.limit');
  t.deepEqual(names("$.items[?((@.tag == 'x' || @.tag == 'y') && !(@.price > 10))]"), ['A'], '过滤：括号分组');
  t.deepEqual(names("$.items[?(@.name < 'B')]"), ['A'], '过滤：字符串大小比较');
  t.deepEqual(names("$.items[?(@.price > '10')]"), [], '过滤：类型不同的大小比较为假');
  t.deepEqual(names('$.items[?(@.price === 5)]'), ['A'], '过滤：兼容 ===');
  t.deepEqual(names('$.items[?(@.price > 1e1)]'), ['B', 'C'], '过滤：科学计数法数字');

  // ---------- 语法错误 ----------
  t.throws(function () { L.jsonPath(S, ''); }, /请输入/, '错误：空表达式');
  t.throws(function () { L.jsonPath(S, 'store.book'); }, /须以 \$ 开头/, '错误：缺少 $');
  t.throws(function () { L.jsonPath(S, '$.'); }, /属性名/, '错误：. 后为空');
  t.throws(function () { L.jsonPath(S, '$['); }, /意外结束/, '错误：[ 未闭合');
  t.throws(function () { L.jsonPath(S, "$['abc]"); }, /结束引号/, '错误：字符串未闭合');
  t.throws(function () { L.jsonPath(S, '$.a[1:2:0]'); }, /步长不能为 0/, '错误：切片步长 0');
  t.throws(function () { L.jsonPath(S, '$..book[?(@.price <)]'); }, /JSONPath 语法错误/, '错误：比较缺右操作数');
  t.throws(function () { L.jsonPath(S, '$..book[?(@.price < 10]'); }, /应为「\)」/, '错误：过滤缺右括号');
  var e = t.throws(function () { L.jsonPath(S, '$.store#'); }, /第 8 个字符/, '错误：报告出错位置');
  t.ok(e && e.pos === 7, '错误对象带 pos 字段');

  // ---------- 注入尝试：不执行代码 ----------
  var hit = false;
  global.__jtProbe = function () { hit = true; };
  t.throws(function () { L.jsonPath(S, '$..book[?(constructor)]'); }, /不支持的标识符/, '注入：裸标识符 constructor 被拒绝');
  t.throws(function () { L.jsonPath(S, '$..book[?(@.a; alert(1))]'); }, /JSONPath 语法错误/, '注入：分号语句被拒绝');
  t.throws(function () { L.jsonPath(S, '$..book[?(__jtProbe())]'); }, /不支持的标识符/, '注入：函数调用被拒绝');
  t.throws(function () { L.jsonPath(S, "$..book[?(@.price < 10 || this.x)]"); }, /不支持的标识符/, '注入：this 被拒绝');
  t.ok(!hit, '注入：探针函数未被调用');
  delete global.__jtProbe;
  t.deepEqual(vals('$..book[?(@.constructor)]'), [], '注入：@.constructor 不访问原型属性');
  t.deepEqual(vals("$['__proto__']"), [], '注入：__proto__ 不暴露原型');
  t.deepEqual(vals('$..toString'), [], '注入：..toString 不命中原型方法');

  // ---------- 统计 ----------
  t.deepEqual(L.jsonTreeStats(S), { nodes: 28, depth: 4 }, '统计：bookstore 共 28 个节点、最大深度 4');
  t.deepEqual(L.jsonTreeStats(1), { nodes: 1, depth: 0 }, '统计：标量根');
  var deep = 0, cur = deep;
  for (var d = 0; d < 20000; d++) cur = [cur];
  var mid = 0;
  for (var d2 = 0; d2 < 2000; d2++) mid = [mid];
  t.equal(L.jsonTreeStats(cur).depth, 20000, '统计：两万层嵌套不爆栈');
  t.equal(L.jsonPath(mid, '$..*').length, 2000, '递归查询：两千层嵌套不爆栈');

  // ---------- 与 JSONC 配合 ----------
  var withComments = L.jsonParse('{\n  // 注释\n  "a": [1, 2] /* 尾 */\n}');
  t.deepEqual(vals('$.a[1]', withComments), [2], 'JSONC：带注释的 JSON 解析后可查询');
};
