// AI Accept 2026-10-17 main v1
// JSON 树形视图与 JSONPath 查询
//   - Tools.lib.jsonPath(value, expr) → [{ path, keys, value }]，自行解析表达式（含过滤），不使用 eval / new Function
//   - Tools.lib.jsonPathOf(keys) → '$.a[0][\'b-c\']'
//   - 树视图懒渲染：折叠节点首次展开时才创建子节点 DOM；大数组按 500 项分页
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;

  // ============================================================
  // 路径
  // ============================================================
  var IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  function quoteKey(k) {
    return "'" + String(k).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  // keys：字符串为对象 key，数字为数组下标
  lib.jsonPathOf = function (keys) {
    var s = '$';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof k === 'number') s += '[' + k + ']';
      else if (IDENT.test(k)) s += '.' + k;
      else s += '[' + quoteKey(k) + ']';
    }
    return s;
  };

  // ============================================================
  // JSONPath 解析
  // ============================================================
  function pathError(expr, pos, reason) {
    var e = new Error('JSONPath 语法错误（第 ' + (pos + 1) + ' 个字符）：' + reason);
    e.pos = pos;
    return e;
  }

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // 语法分析器：共享游标，供路径与过滤表达式使用
  function Parser(expr) {
    this.s = expr;
    this.i = 0;
  }
  Parser.prototype.peek = function (k) { return this.s.charAt(this.i + (k || 0)); };
  Parser.prototype.eof = function () { return this.i >= this.s.length; };
  Parser.prototype.ws = function () { while (/\s/.test(this.peek()) && !this.eof()) this.i++; };
  Parser.prototype.fail = function (reason, at) { throw pathError(this.s, at == null ? this.i : at, reason); };
  Parser.prototype.expect = function (ch) {
    this.ws();
    if (this.peek() !== ch) this.fail('此处应为「' + ch + '」' + (this.eof() ? '，表达式意外结束' : '，实际为「' + this.peek() + '」'));
    this.i++;
  };

  Parser.prototype.readString = function () {
    var q = this.peek(), start = this.i, out = '';
    this.i++;
    while (!this.eof()) {
      var c = this.peek();
      if (c === q) { this.i++; return out; }
      if (c === '\\') {
        var n = this.peek(1);
        this.i += 2;
        if (n === 'n') out += '\n';
        else if (n === 't') out += '\t';
        else if (n === 'r') out += '\r';
        else if (n === 'u') {
          var hex = this.s.substr(this.i, 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('非法的 \\u 转义', this.i - 2);
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 4;
        } else out += n;
        continue;
      }
      out += c;
      this.i++;
    }
    this.fail('字符串缺少结束引号', start);
  };

  Parser.prototype.readInt = function () {
    var m = /^-?\d+/.exec(this.s.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return parseInt(m[0], 10);
  };

  Parser.prototype.readName = function () {
    var m = /^[\w$\-\u0080-\uffff]+/.exec(this.s.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  };

  // [ ... ] 内部
  Parser.prototype.bracket = function () {
    this.ws();
    var c = this.peek();
    if (c === '*') { this.i++; this.expect(']'); return { type: 'wild' }; }
    if (c === '?') {
      this.i++;
      this.expect('(');
      var ast = this.filterOr();
      this.expect(')');
      this.expect(']');
      return { type: 'filter', ast: ast };
    }
    var items = [];
    for (;;) {
      this.ws();
      c = this.peek();
      if (c === '\'' || c === '"') {
        items.push({ name: this.readString() });
      } else {
        var at = this.i;
        var a = this.readInt();
        this.ws();
        if (this.peek() === ':') {
          if (items.length) this.fail('切片不能与其他选择器联合使用', at);
          this.i++;
          this.ws();
          var b = this.readInt(), step = null;
          this.ws();
          if (this.peek() === ':') { this.i++; this.ws(); step = this.readInt(); }
          if (step === 0) this.fail('切片步长不能为 0', at);
          this.expect(']');
          return { type: 'slice', start: a, end: b, step: step == null ? 1 : step };
        }
        if (a === null) this.fail(this.eof() ? '表达式意外结束' : '无法识别的选择器「' + c + '」');
        items.push({ index: a });
      }
      this.ws();
      if (this.peek() === ',') { this.i++; continue; }
      this.expect(']');
      return { type: 'union', items: items };
    }
  };

  // ---------- 过滤表达式：or → and → unary → cmp → operand ----------
  Parser.prototype.filterOr = function () {
    var left = this.filterAnd();
    for (;;) {
      this.ws();
      if (this.s.substr(this.i, 2) !== '||') return left;
      this.i += 2;
      left = { op: '||', a: left, b: this.filterAnd() };
    }
  };
  Parser.prototype.filterAnd = function () {
    var left = this.filterUnary();
    for (;;) {
      this.ws();
      if (this.s.substr(this.i, 2) !== '&&') return left;
      this.i += 2;
      left = { op: '&&', a: left, b: this.filterUnary() };
    }
  };
  Parser.prototype.filterUnary = function () {
    this.ws();
    if (this.peek() === '!' && this.peek(1) !== '=') { this.i++; return { op: '!', a: this.filterUnary() }; }
    return this.filterCmp();
  };
  var CMP = ['==', '!=', '<=', '>=', '<', '>'];
  Parser.prototype.filterCmp = function () {
    var left = this.operand();
    this.ws();
    for (var k = 0; k < CMP.length; k++) {
      if (this.s.substr(this.i, CMP[k].length) === CMP[k]) {
        this.i += CMP[k].length;
        // 兼容 === / !==
        if (this.peek() === '=' && (CMP[k] === '==' || CMP[k] === '!=')) this.i++;
        return { op: CMP[k], a: left, b: this.operand() };
      }
    }
    return { op: 'test', a: left };
  };
  Parser.prototype.operand = function () {
    this.ws();
    var c = this.peek(), at = this.i;
    if (c === '(') {
      this.i++;
      var e = this.filterOr();
      this.expect(')');
      return { op: 'group', a: e };
    }
    if (c === '@' || c === '$') {
      this.i++;
      var segs = [];
      for (;;) {
        if (this.peek() === '.' && this.peek(1) !== '.') {
          this.i++;
          var nm = this.readName();
          if (nm === null) this.fail('「.」后应为属性名');
          segs.push(nm);
        } else if (this.peek() === '[') {
          this.i++;
          this.ws();
          var q = this.peek();
          if (q === '\'' || q === '"') segs.push(this.readString());
          else {
            var idx = this.readInt();
            if (idx === null) this.fail('过滤表达式中的 [ ] 只支持字符串或整数下标');
            segs.push(idx);
          }
          this.expect(']');
        } else break;
      }
      return { op: 'path', root: c, segs: segs };
    }
    if (c === '\'' || c === '"') return { op: 'lit', v: this.readString() };
    var num = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (num) { this.i += num[0].length; return { op: 'lit', v: parseFloat(num[0]) }; }
    var word = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i));
    if (word) {
      this.i += word[0].length;
      if (word[0] === 'true') return { op: 'lit', v: true };
      if (word[0] === 'false') return { op: 'lit', v: false };
      if (word[0] === 'null') return { op: 'lit', v: null };
      this.fail('不支持的标识符「' + word[0] + '」（过滤表达式只允许 @ 路径、字符串、数字与 true/false/null）', at);
    }
    this.fail(this.eof() ? '过滤表达式意外结束' : '无法识别的字符「' + c + '」', at);
  };

  function parsePath(expr) {
    var p = new Parser(String(expr == null ? '' : expr).trim());
    if (!p.s) throw new Error('请输入 JSONPath 表达式，如 $.store.book[*].author');
    if (p.peek() !== '$') p.fail('表达式须以 $ 开头');
    p.i++;
    var segs = [];
    while (!p.eof()) {
      var c = p.peek(), recursive = false, at = p.i;
      if (c === '.' && p.peek(1) === '.') {
        recursive = true;
        p.i += 2;
        if (p.peek() === '[') { p.i++; segs.push({ recursive: true, sel: p.bracket() }); continue; }
      } else if (c === '.') {
        p.i++;
      } else if (c === '[') {
        p.i++;
        segs.push({ recursive: false, sel: p.bracket() });
        continue;
      } else if (/\s/.test(c)) {
        p.ws();
        continue;
      } else {
        p.fail('无法识别的字符「' + c + '」');
      }
      if (p.peek() === '*') { p.i++; segs.push({ recursive: recursive, sel: { type: 'wild' } }); continue; }
      var name = p.readName();
      if (name === null) p.fail(recursive ? '「..」后应为属性名、* 或 [ ]' : '「.」后应为属性名或 *', at);
      segs.push({ recursive: recursive, sel: { type: 'union', items: [{ name: name }] } });
    }
    return segs;
  }

  // ---------- 求值 ----------
  function getPath(root, current, node) {
    var v = node.root === '$' ? root : current;
    for (var i = 0; i < node.segs.length; i++) {
      var k = node.segs[i];
      if (typeof k === 'number') {
        if (!Array.isArray(v)) return undefined;
        var idx = k < 0 ? v.length + k : k;
        if (idx < 0 || idx >= v.length) return undefined;
        v = v[idx];
      } else {
        if (!isObj(v) || !Object.prototype.hasOwnProperty.call(v, k)) return undefined;
        v = v[k];
      }
    }
    return v;
  }

  function evalFilter(ast, root, cur) {
    switch (ast.op) {
      case '||': return truthy(evalFilter(ast.a, root, cur)) || truthy(evalFilter(ast.b, root, cur));
      case '&&': return truthy(evalFilter(ast.a, root, cur)) && truthy(evalFilter(ast.b, root, cur));
      case '!': return !truthy(evalFilter(ast.a, root, cur));
      case 'group': return truthy(evalFilter(ast.a, root, cur));
      case 'test':
        // 路径：存在即真（[?(@.isbn)]）；字面量按真值
        if (ast.a.op === 'path') return getPath(root, cur, ast.a) !== undefined;
        return truthy(evalFilter(ast.a, root, cur));
      case 'path': return getPath(root, cur, ast);
      case 'lit': return ast.v;
      default: return compare(ast.op, operandValue(ast.a, root, cur), operandValue(ast.b, root, cur));
    }
  }
  function operandValue(n, root, cur) {
    if (n.op === 'path') return getPath(root, cur, n);
    if (n.op === 'lit') return n.v;
    return evalFilter(n, root, cur);
  }
  function truthy(v) { return v !== undefined && v !== null && v !== false; }
  function compare(op, a, b) {
    if (op === '==' || op === '!=') {
      var eq;
      if (a === undefined || b === undefined) eq = a === b;
      else if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) eq = JSON.stringify(a) === JSON.stringify(b);
      else eq = a === b;
      return op === '==' ? eq : !eq;
    }
    var bothNum = typeof a === 'number' && typeof b === 'number';
    var bothStr = typeof a === 'string' && typeof b === 'string';
    if (!bothNum && !bothStr) return false;
    if (op === '<') return a < b;
    if (op === '<=') return a <= b;
    if (op === '>') return a > b;
    return a >= b;
  }

  function keysOf(node) {
    var keys = [];
    for (var x = node; x && x.parent; x = x.parent) keys.push(x.key);
    return keys.reverse();
  }

  function children(node) {
    var v = node.value, out = [];
    if (Array.isArray(v)) for (var i = 0; i < v.length; i++) out.push({ parent: node, key: i, value: v[i] });
    else if (isObj(v)) for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out.push({ parent: node, key: k, value: v[k] });
    return out;
  }

  // 自身及全部后代（迭代前序遍历，避免深层递归爆栈）
  function descendants(node) {
    var out = [], st = [node];
    while (st.length) {
      var x = st.pop();
      out.push(x);
      var ch = children(x);
      for (var i = ch.length - 1; i >= 0; i--) st.push(ch[i]);
    }
    return out;
  }

  function normIndex(i, len) { return i < 0 ? len + i : i; }

  function select(node, sel, root) {
    var v = node.value, out = [], i;
    if (sel.type === 'wild') return children(node);
    if (sel.type === 'union') {
      for (i = 0; i < sel.items.length; i++) {
        var it = sel.items[i];
        if (it.name != null) {
          if (isObj(v) && Object.prototype.hasOwnProperty.call(v, it.name)) out.push({ parent: node, key: it.name, value: v[it.name] });
        } else if (Array.isArray(v)) {
          var idx = normIndex(it.index, v.length);
          if (idx >= 0 && idx < v.length) out.push({ parent: node, key: idx, value: v[idx] });
        }
      }
      return out;
    }
    if (sel.type === 'slice') {
      if (!Array.isArray(v)) return out;
      var len = v.length, step = sel.step, start, end;
      if (step > 0) {
        start = sel.start == null ? 0 : normIndex(sel.start, len);
        end = sel.end == null ? len : normIndex(sel.end, len);
        start = Math.max(0, Math.min(len, start));
        end = Math.max(0, Math.min(len, end));
        for (i = start; i < end; i += step) out.push({ parent: node, key: i, value: v[i] });
      } else {
        start = sel.start == null ? len - 1 : normIndex(sel.start, len);
        end = sel.end == null ? -1 : normIndex(sel.end, len);
        start = Math.max(-1, Math.min(len - 1, start));
        end = Math.max(-1, Math.min(len - 1, end));
        for (i = start; i > end; i += step) out.push({ parent: node, key: i, value: v[i] });
      }
      return out;
    }
    if (sel.type === 'filter') {
      var ch = children(node);
      for (i = 0; i < ch.length; i++) if (truthy(evalFilter(sel.ast, root, ch[i].value))) out.push(ch[i]);
      return out;
    }
    return out;
  }
  var RESULT_LIMIT = 100000;

  lib.jsonPathParse = parsePath;

  lib.jsonPath = function (value, expr) {
    var segs = parsePath(expr);
    var nodes = [{ parent: null, value: value }];
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s], next = [];
      for (var n = 0; n < nodes.length; n++) {
        var cands = seg.recursive ? descendants(nodes[n]) : [nodes[n]];
        for (var c = 0; c < cands.length; c++) {
          var got = select(cands[c], seg.sel, value);
          for (var g = 0; g < got.length; g++) next.push(got[g]);
          if (next.length > RESULT_LIMIT) throw new Error('匹配结果超过 ' + RESULT_LIMIT + ' 个，请缩小查询范围');
        }
      }
      nodes = next;
    }
    return nodes.map(function (x) { var keys = keysOf(x); return { path: lib.jsonPathOf(keys), keys: keys, value: x.value }; });
  };

  // ============================================================
  // 统计与预览
  // ============================================================
  lib.jsonTreeStats = function (value) {
    var count = 0, depth = 0, st = [[value, 0]];
    while (st.length) {
      var x = st.pop();
      count++;
      if (x[1] > depth) depth = x[1];
      var v = x[0];
      if (Array.isArray(v)) for (var i = 0; i < v.length; i++) st.push([v[i], x[1] + 1]);
      else if (isObj(v)) for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) st.push([v[k], x[1] + 1]);
    }
    return { nodes: count, depth: depth };
  };

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function sizeOf(v) {
    if (Array.isArray(v)) return v.length;
    var n = 0;
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) n++;
    return n;
  }

  function preview(v, max) {
    var s = typeof v === 'string' ? JSON.stringify(v) : String(v);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function fullText(v) {
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  }

  // ============================================================
  // 树视图（DOM，仅在 render 中使用）
  // ============================================================
  var PAGE = 500;
  var EXPAND_ALL_LIMIT = 20000;
  var LOAD_LIMIT = 5000;

  function createTree(ui, onSelect) {
    var el = ui.el;
    var root = el('ul', { className: 'jt', role: 'tree', 'aria-label': 'JSON 树形视图' });
    var selected = null;
    var data = null;

    function setSelected(li, focus) {
      if (selected) { selected.setAttribute('aria-selected', 'false'); selected.tabIndex = -1; }
      selected = li;
      if (!li) return;
      li.setAttribute('aria-selected', 'true');
      li.tabIndex = 0;
      if (focus) li.focus();
      onSelect(li.__jt);
    }

    function makeNode(key, value, keys, level) {
      var t = typeOf(value);
      var container = t === 'object' || t === 'array';
      var li = el('li', { role: 'treeitem', 'aria-level': String(level + 1), 'aria-selected': 'false', tabindex: '-1' });
      li.__jt = { value: value, keys: keys, level: level, built: false, container: container, shown: 0, childMap: {} };
      var row = el('div', { className: 'jt-row' });
      row.style.setProperty('--depth', String(level));
      row.appendChild(el('span', { className: 'jt-toggle', 'aria-hidden': 'true' }));
      row.appendChild(el('span', { className: 'jt-key', text: key }));
      if (container) {
        var n = sizeOf(value);
        row.appendChild(el('span', { className: 'jt-sum' }, [el('span', { className: 'jt-brace', text: t === 'array' ? '[…] ' : '{…} ' }), n + ' 项']));
        li.setAttribute('aria-expanded', 'false');
        li.__jt.size = n;
      } else {
        row.appendChild(el('span', { className: 'jt-val jt-' + t, text: preview(value, 300) }));
      }
      li.appendChild(row);
      return li;
    }

    function childEntries(info) {
      var v = info.value;
      if (Array.isArray(v)) return null;
      var keys = [];
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) keys.push(k);
      return keys;
    }

    // 渲染下一页子节点（数组每页 500，对象一次全部——对象键过多时同样分页）
    function renderMore(li, upto) {
      var info = li.__jt, group = info.group;
      var v = info.value, isArr = Array.isArray(v);
      if (!isArr && !info.objKeys) info.objKeys = childEntries(info);
      var total = isArr ? v.length : info.objKeys.length;
      var target = Math.min(total, Math.max(upto == null ? 0 : upto + 1, info.shown + PAGE));
      if (info.moreBtn) { info.moreBtn.parentNode.removeChild(info.moreBtn); info.moreBtn = null; }
      var frag = document.createDocumentFragment();
      for (var i = info.shown; i < target; i++) {
        var key = isArr ? i : info.objKeys[i];
        var child = makeNode(isArr ? '[' + i + ']' : key, v[key], info.keys.concat(key), info.level + 1);
        info.childMap[key] = child;
        frag.appendChild(child);
      }
      info.shown = target;
      group.appendChild(frag);
      if (info.shown < total) {
        var rest = total - info.shown;
        var more = el('li', { className: 'jt-more', role: 'none' }, [
          ui.button('显示更多（剩余 ' + rest + ' 项）', function () { renderMore(li); })
        ]);
        more.firstChild.style.setProperty('--depth', String(info.level + 1));
        info.moreBtn = more;
        group.appendChild(more);
      }
    }

    function expand(li) {
      var info = li.__jt;
      if (!info.container) return;
      if (!info.built) {
        info.group = el('ul', { role: 'group' });
        li.appendChild(info.group);
        info.built = true;
        renderMore(li);
      }
      info.group.hidden = false;
      li.setAttribute('aria-expanded', 'true');
    }

    function collapse(li) {
      var info = li.__jt;
      if (!info.container || !info.built) { if (info.container) li.setAttribute('aria-expanded', 'false'); return; }
      info.group.hidden = true;
      li.setAttribute('aria-expanded', 'false');
    }

    function isExpanded(li) { return li.getAttribute('aria-expanded') === 'true'; }

    // 展开到第 depth 层（根为第 0 层）；返回已创建节点数，超过上限停止
    function expandTo(depth, budget) {
      budget = budget || EXPAND_ALL_LIMIT;
      if (!data) return 0;
      var created = 0, st = [data.rootLi];
      while (st.length) {
        var li = st.pop(), info = li.__jt;
        if (!info.container) continue;
        if (info.level < depth) {
          if (created > budget) return -created;
          var before = info.shown;
          expand(li);
          created += info.shown - before;
          for (var k in info.childMap) st.push(info.childMap[k]);
        } else if (info.built) {
          collapse(li);
          for (var k2 in info.childMap) st.push(info.childMap[k2]);
        }
      }
      return created;
    }

    // 逐级展开并定位到某路径；返回 li 或 null
    function reveal(keys) {
      var li = data.rootLi;
      for (var i = 0; i < keys.length; i++) {
        expand(li);
        var info = li.__jt, k = keys[i];
        if (!info.childMap[k]) {
          var pos = Array.isArray(info.value) ? k : (info.objKeys || childEntries(info)).indexOf(k);
          if (pos < 0) return null;
          renderMore(li, pos);
        }
        li = info.childMap[k];
        if (!li) return null;
      }
      return li;
    }

    function visibleItems() {
      var all = root.querySelectorAll('li[role="treeitem"]'), out = [];
      for (var i = 0; i < all.length; i++) if (!all[i].parentNode.closest('ul[hidden]') && !all[i].parentNode.hidden) out.push(all[i]);
      return out;
    }

    root.addEventListener('click', function (e) {
      var row = e.target.closest('.jt-row');
      if (!row) return;
      var li = row.parentNode;
      if (li.__jt.container && (e.target.classList.contains('jt-toggle') || selected === li)) {
        if (isExpanded(li)) collapse(li); else expand(li);
      }
      setSelected(li, true);
    });

    root.addEventListener('keydown', function (e) {
      var li = e.target.closest('li[role="treeitem"]');
      if (!li) return;
      var items, idx;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          items = visibleItems();
          idx = items.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1);
          if (idx >= 0 && idx < items.length) setSelected(items[idx], true);
          break;
        case 'ArrowRight':
          if (li.__jt.container && !isExpanded(li)) expand(li);
          else if (li.__jt.container && li.__jt.group.firstChild && li.__jt.group.firstChild.getAttribute('role') === 'treeitem') setSelected(li.__jt.group.firstChild, true);
          break;
        case 'ArrowLeft':
          if (li.__jt.container && isExpanded(li)) collapse(li);
          else {
            var parent = li.parentNode.closest('li[role="treeitem"]');
            if (parent) setSelected(parent, true);
          }
          break;
        case 'Home':
          items = visibleItems();
          if (items.length) setSelected(items[0], true);
          break;
        case 'End':
          items = visibleItems();
          if (items.length) setSelected(items[items.length - 1], true);
          break;
        case 'Enter':
        case ' ':
          if (li.__jt.container) { if (isExpanded(li)) collapse(li); else expand(li); }
          setSelected(li, true);
          break;
        default:
          return;
      }
      e.preventDefault();
    });

    var hits = [];
    function clearHits() {
      for (var i = 0; i < hits.length; i++) hits[i].classList.remove('is-hit');
      hits = [];
    }

    return {
      root: root,
      load: function (value, depth) {
        root.textContent = '';
        selected = null;
        hits = [];
        var rootLi = makeNode('$', value, [], 0);
        rootLi.tabIndex = 0;
        root.appendChild(rootLi);
        data = { value: value, rootLi: rootLi };
        // 首次加载节点预算较小：宽对象（某层有上千个 key）不会一次铺满数十万个节点
        return expandTo(depth == null ? 2 : depth, LOAD_LIMIT);
      },
      clear: function () { root.textContent = ''; data = null; selected = null; hits = []; },
      expandTo: expandTo,
      collapseAll: function () { if (data) expandTo(0); },
      reveal: reveal,
      select: function (li) { setSelected(li, false); if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' }); },
      highlight: function (keysList, limit) {
        clearHits();
        var shown = 0;
        for (var i = 0; i < keysList.length && shown < limit; i++) {
          var li = reveal(keysList[i]);
          if (li) { li.classList.add('is-hit'); hits.push(li); shown++; }
        }
        return shown;
      },
      clearHits: clearHits
    };
  }

  // ============================================================
  // 注册
  // ============================================================
  var DEMO = {
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

  var HIGHLIGHT_LIMIT = 200;
  var LIST_LIMIT = 500;

  Tools.register({
    id: 'json-tree',
    cat: 'json',
    name: 'JSON 树形视图',
    desc: '以可折叠的树浏览 JSON（支持注释），点击节点获取路径与值，并可用 JSONPath 查询与高亮匹配节点。',
    keywords: 'json tree view jsonpath 树形 查询 折叠 路径',
    render: function (root, ui) {
      var el = ui.el;
      var input = ui.textarea({ rows: 16, placeholder: '在此粘贴 JSON（可带 // 与 /* */ 注释）…' });
      var status = ui.status();
      var current = null;

      // 选中节点详情
      var detailPath = el('code', { className: 'jt-detail-path' });
      var detailValue = el('pre', { className: 'jt-detail-value' });
      var detailInfo = null;
      var detail = el('div', { className: 'jt-detail', hidden: 'hidden' }, [
        el('p', { className: 'field-label', text: '选中节点' }),
        detailPath,
        detailValue,
        ui.actions([
          ui.button('复制路径', function () { if (detailInfo) ui.copy(lib.jsonPathOf(detailInfo.keys), status); }),
          ui.button('复制值', function () { if (detailInfo) ui.copy(fullText(detailInfo.value), status); })
        ])
      ]);

      var tree = createTree(ui, function (info) {
        detailInfo = info;
        detail.hidden = false;
        detailPath.textContent = lib.jsonPathOf(info.keys);
        var txt = fullText(info.value);
        detailValue.textContent = txt.length > 20000 ? txt.slice(0, 20000) + '\n…（内容过长，已截断显示；「复制值」可复制完整内容）' : txt;
      });
      var treeBox = el('div', { className: 'jt-box' }, [tree.root]);

      var depthSel = ui.select([
        { value: '1', label: '展开到第 1 层' }, { value: '2', label: '展开到第 2 层' },
        { value: '3', label: '展开到第 3 层' }, { value: '5', label: '展开到第 5 层' }
      ], '2');

      // JSONPath
      var query = ui.input({ placeholder: '如 $.store.book[?(@.price < 10)].title', mono: true });
      var qStatus = ui.status();
      var results = el('ol', { className: 'jt-results' });
      var lastResults = [];

      function parse() {
        tree.clearHits && tree.clearHits();
        results.textContent = '';
        lastResults = [];
        qStatus.clear();
        detail.hidden = true;
        if (!input.value.trim()) { current = null; tree.clear(); status.clear(); return; }
        var t0 = Date.now();
        try {
          current = lib.jsonParse(input.value);
        } catch (e) {
          current = null;
          tree.clear();
          status.error(e && e.message ? e.message : String(e));
          return;
        }
        var loaded = tree.load(current, parseInt(depthSel.value, 10));
        var st = lib.jsonTreeStats(current);
        var n = 0;
        try { n = lib.jsonStripComments(input.value).count; } catch (e2) { n = 0; }
        status.ok('共 ' + st.nodes + ' 个节点，最大深度 ' + st.depth + '，用时 ' + (Date.now() - t0) + ' ms' + (n ? '（已忽略 ' + n + ' 处注释）' : '') +
          (loaded < 0 ? '；节点较多，初始只展开了部分层级，可逐级手动展开' : ''));
        if (query.value.trim()) runQuery();
      }

      function runQuery() {
        results.textContent = '';
        lastResults = [];
        tree.clearHits();
        if (current === null && !input.value.trim()) { qStatus.error('请先输入 JSON'); return; }
        if (current === null) { qStatus.error('JSON 解析失败，无法查询'); return; }
        if (!query.value.trim()) { qStatus.clear(); return; }
        var res;
        try {
          res = lib.jsonPath(current, query.value);
        } catch (e) {
          qStatus.error(e && e.message ? e.message : String(e));
          return;
        }
        lastResults = res;
        var shown = tree.highlight(res.map(function (r) { return r.keys; }), HIGHLIGHT_LIMIT);
        for (var i = 0; i < res.length && i < LIST_LIMIT; i++) {
          (function (r) {
            var item = el('li', null, [
              el('button', { type: 'button', className: 'jt-result' }, [
                el('code', { className: 'jt-result-path', text: r.path }),
                el('span', { className: 'jt-result-val', text: preview(typeof r.value === 'object' && r.value !== null ? JSON.stringify(r.value) : r.value, 160) })
              ])
            ]);
            item.firstChild.addEventListener('click', function () {
              var li = tree.reveal(r.keys);
              if (li) tree.select(li);
            });
            results.appendChild(item);
          })(res[i]);
        }
        if (!res.length) qStatus.info('没有匹配的节点');
        else qStatus.ok('共 ' + res.length + ' 个匹配' +
          (res.length > LIST_LIMIT ? '，列表显示前 ' + LIST_LIMIT + ' 个' : '') +
          (shown < res.length ? '，树中高亮前 ' + shown + ' 个' : ''));
      }

      input.addEventListener('input', ui.debounce(parse, 300));
      depthSel.addEventListener('change', function () {
        if (current === null) return;
        var r = tree.expandTo(parseInt(depthSel.value, 10));
        if (r < 0) status.info('节点过多，已停止在约 ' + (-r) + ' 个节点，可逐级手动展开');
      });
      query.addEventListener('keydown', function (e) { if (e.key === 'Enter') runQuery(); });
      query.addEventListener('input', ui.debounce(runQuery, 400));

      root.appendChild(ui.grid([
        ui.field('JSON', input),
        el('div', { className: 'field-group' }, [el('p', { className: 'field-label', text: '树形视图' }), treeBox])
      ]));
      root.appendChild(ui.inline([
        ui.field('展开层级', depthSel),
        ui.actions([
          ui.button('全部展开', function () {
            if (current === null) return;
            var r = tree.expandTo(Infinity);
            if (r < 0) status.info('节点过多，已展开约 ' + (-r) + ' 个节点后停止，避免页面卡顿；其余可逐级手动展开');
          }),
          ui.button('全部折叠', function () { tree.collapseAll(); }),
          ui.button('填入示例', function () { input.value = JSON.stringify(DEMO, null, 2); parse(); }),
          ui.button('清空', function () { input.value = ''; query.value = ''; parse(); input.focus(); })
        ])
      ]));
      root.appendChild(status);
      root.appendChild(detail);
      root.appendChild(el('h3', { className: 'sub-title', text: 'JSONPath 查询' }));
      root.appendChild(ui.field('表达式', query, '支持 $ . .. * [n] [-1] [a:b:c] [0,2] [\'key\'] 以及过滤 [?(@.price < 10 && @.isbn)]；回车执行。'));
      root.appendChild(ui.actions([
        ui.button('查询', runQuery, true),
        ui.button('复制全部结果（JSON）', function () {
          if (!lastResults.length) { qStatus.error('暂无查询结果'); return; }
          ui.copy(JSON.stringify(lastResults.map(function (r) { return { path: r.path, value: r.value }; }), null, 2), qStatus);
        })
      ]));
      root.appendChild(qStatus);
      root.appendChild(results);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
