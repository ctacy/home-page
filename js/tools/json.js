// AI Accept 2026-10-16 main v1
// JSON 工具：格式化 / 压缩转义 / 排序 / CSV / XML / YAML / C# / TypeScript
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;

  // ============================================================
  // 解析与错误定位
  // ============================================================
  function posToLineCol(text, pos) {
    var line = 1, col = 1;
    for (var i = 0; i < pos && i < text.length; i++) {
      if (text.charAt(i) === '\n') { line++; col = 1; } else col++;
    }
    return { line: line, col: col };
  }

  // 仅在 JSON.parse 失败后调用：按 RFC 8259 扫描，返回首个错误的 { pos, reason }。
  // 新版 V8 的报错不再带位置，故不依赖引擎消息。
  function locateJsonError(text) {
    var i = 0, n = text.length;
    function fail(reason) {
      var e = new Error(reason);
      e.pos = i;
      throw e;
    }
    function ws() {
      while (i < n) {
        var c = text.charAt(i);
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
        else break;
      }
    }
    function describe() {
      return i >= n ? '内容意外结束' : '意外的字符 ' + JSON.stringify(text.charAt(i));
    }
    function str() {
      i++;
      while (i < n) {
        var c = text.charAt(i);
        if (c === '"') { i++; return; }
        if (c === '\\') {
          var e = text.charAt(i + 1);
          if (e === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.substr(i + 2, 4))) { i += 2; fail('非法的 \\u 转义'); }
            i += 6;
          } else if ('"\\/bfnrt'.indexOf(e) >= 0 && e !== '') {
            i += 2;
          } else {
            i++;
            fail('非法的转义字符');
          }
          continue;
        }
        if (c < ' ') fail('字符串中不能包含未转义的控制字符（如换行）');
        i++;
      }
      fail('字符串缺少结束引号');
    }
    function num() {
      var m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m || !m[0] || m[0] === '-') fail('非法的数字');
      i += m[0].length;
    }
    function value() {
      ws();
      var c = text.charAt(i);
      if (c === '{') {
        i++; ws();
        if (text.charAt(i) === '}') { i++; return; }
        for (;;) {
          ws();
          if (text.charAt(i) !== '"') fail(text.charAt(i) === '}' ? '对象末尾多了逗号' : '对象的 key 必须是双引号字符串，' + describe());
          str(); ws();
          if (text.charAt(i) !== ':') fail('key 后缺少冒号，' + describe());
          i++;
          value(); ws();
          if (text.charAt(i) === ',') { i++; continue; }
          if (text.charAt(i) === '}') { i++; return; }
          fail('缺少逗号或右花括号，' + describe());
        }
      }
      if (c === '[') {
        i++; ws();
        if (text.charAt(i) === ']') { i++; return; }
        for (;;) {
          ws();
          if (text.charAt(i) === ']') fail('数组末尾多了逗号');
          value(); ws();
          if (text.charAt(i) === ',') { i++; continue; }
          if (text.charAt(i) === ']') { i++; return; }
          fail('缺少逗号或右方括号，' + describe());
        }
      }
      if (c === '"') return str();
      if (c === '-' || (c >= '0' && c <= '9')) return num();
      var words = ['true', 'false', 'null'];
      for (var w = 0; w < words.length; w++) {
        if (text.substr(i, words[w].length) === words[w]) { i += words[w].length; return; }
      }
      if (c === "'") fail('字符串必须使用双引号');
      fail(describe());
    }
    try {
      value(); ws();
      if (i < n) fail('JSON 结束后还有多余内容，' + describe());
    } catch (e) {
      return { pos: e.pos, reason: e.message };
    }
    return null;
  }

  // AI Accept 2026-10-17 main v1
  // JSONC：把字符串之外的 // 与 /* */ 注释替换为等长空白（换行保留），
  // 使后续解析报错的行列号仍对应原文。返回 { text, count }。
  // 性能：只在 " 与 / 处停下判断，普通内容整段切片复制（逐字符拼接处理 8MB 约 260ms）；
  // 不含 / 的输入（绝大多数标准 JSON）直接返回原文。
  lib.jsonStripComments = function (text) {
    text = String(text == null ? '' : text);
    if (text.indexOf('/') < 0) return { text: text, count: 0 };
    var parts = [], last = 0, count = 0, n = text.length;
    var special = /["\/]/g, inString = /["\\\n]/g, m;
    function blank(s) { return s.replace(/[^\n]/g, ' '); }
    while ((m = special.exec(text)) !== null) {
      var i = m.index;
      if (m[0] === '"') {
        // 跳过字符串：遇 \ 跳过下一字符；遇换行视为未闭合，交给解析器报错
        inString.lastIndex = i + 1;
        var s;
        while ((s = inString.exec(text)) !== null && s[0] === '\\') inString.lastIndex = s.index + 2;
        special.lastIndex = s ? s.index + 1 : n;
        continue;
      }
      var next = text.charAt(i + 1), end;
      if (next === '/') {
        end = text.indexOf('\n', i);
        if (end < 0) end = n;
      } else if (next === '*') {
        end = text.indexOf('*/', i + 2);
        if (end < 0) {
          var lc0 = posToLineCol(text, i);
          var err0 = new Error('第 ' + lc0.line + ' 行，第 ' + lc0.col + ' 列：块注释 /* 缺少结束的 */');
          err0.line = lc0.line; err0.col = lc0.col; err0.pos = i;
          throw err0;
        }
        end += 2;
      } else {
        continue; // 字符串外的单个 /，原样保留，交给解析器报错
      }
      parts.push(text.slice(last, i), blank(text.slice(i, end)));
      last = end;
      special.lastIndex = end;
      count++;
    }
    parts.push(text.slice(last));
    return { text: parts.join(''), count: count };
  };

  // 解析 JSON；失败抛 Error，带 line / col / reason。
  // 默认容忍 // 与 /* */ 注释（JSONC）；opts.strict 为 true 时按 RFC 8259 严格解析。
  lib.jsonParse = function (text, opts) {
    text = String(text == null ? '' : text);
    if (!text.trim()) throw new Error('输入为空');
    var strict = !!(opts && opts.strict);
    if (!strict) text = lib.jsonStripComments(text).text;
    if (!text.trim()) throw new Error('输入只有注释，没有 JSON 内容');
    try {
      return JSON.parse(text);
    } catch (e) {
      var loc = locateJsonError(text);
      var err = new Error('');
      if (loc) {
        var lc = posToLineCol(text, loc.pos);
        err.line = lc.line;
        err.col = lc.col;
        err.pos = loc.pos;
        err.reason = loc.reason;
        if (strict && text.charAt(loc.pos) === '/' && /[\/*]/.test(text.charAt(loc.pos + 1))) {
          err.reason = '标准 JSON 不支持注释（可勾选「允许注释」按 JSONC 解析）';
        }
        err.message = '第 ' + lc.line + ' 行，第 ' + lc.col + ' 列：' + err.reason;
      } else {
        err.reason = String(e && e.message || e);
        err.message = err.reason;
      }
      throw err;
    }
  };

  function indentOf(indent) {
    if (indent === 'tab' || indent === '\t') return '\t';
    var n = parseInt(indent, 10);
    return isNaN(n) ? 2 : n;
  }

  lib.jsonFormat = function (text, indent, opts) {
    return JSON.stringify(lib.jsonParse(text, opts), null, indentOf(indent == null ? 2 : indent));
  };

  // AI Accept 2026-10-17 main v1
  // JSONC 词法切分：{ type: 'punct'|'string'|'atom'|'comment', text, nlBefore }
  // nlBefore 表示与上一个记号之间是否隔着换行，用来区分「行尾注释」与「独占一行的注释」。
  function jsoncTokens(text) {
    var toks = [], i = 0, n = text.length, nl = false;
    while (i < n) {
      var c = text.charAt(i);
      if (c === '\n') { nl = true; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      var start = i;
      var type;
      if ('{}[],:'.indexOf(c) >= 0) {
        type = 'punct';
        i++;
      } else if (c === '"') {
        type = 'string';
        i++;
        while (i < n && text.charAt(i) !== '"') i += text.charAt(i) === '\\' ? 2 : 1;
        i++;
      } else if (c === '/' && text.charAt(i + 1) === '/') {
        type = 'comment';
        while (i < n && text.charAt(i) !== '\n') i++;
      } else if (c === '/' && text.charAt(i + 1) === '*') {
        type = 'comment';
        i = text.indexOf('*/', i + 2) + 2;
      } else {
        type = 'atom';
        while (i < n && !/[\s{}\[\],:"\/]/.test(text.charAt(i))) i++;
        if (i === start) i++;
      }
      toks.push({ type: type, text: text.slice(start, i).replace(/\s+$/, ''), nlBefore: nl });
      nl = false;
    }
    return toks;
  }

  // AI Accept 2026-10-17 main v1
  // 注释 → 字段路径映射，供代码生成输出文档注释。
  // 路径为 key 链，数组元素统一记为 '[]'；映射的键为 lib.jsonCommentPath(段数组)。
  // 归属：独占一行的注释（可连续多行）归给其后的 key；行尾注释归给该行所在的 key；
  //       行尾注释若紧跟同一行的 key（如 { /* c */ "a": 1 }）则归给该 key；无主注释忽略。
  lib.jsonCommentPath = function (segs) {
    return JSON.stringify(segs);
  };

  function cleanComment(raw) {
    if (raw.slice(0, 2) === '//') return raw.slice(2).trim();
    var body = raw.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
    var lines = body.split(/\r?\n/).map(function (l) { return l.trim().replace(/^\*\s?/, '').trim(); });
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.join('\n');
  }

  lib.jsonCommentMap = function (text) {
    var toks = jsoncTokens(String(text == null ? '' : text));
    var map = {};
    var stack = [];          // { kind: 'obj'|'arr', path, expectKey }
    var lastKeyPath = null;  // 当前行归属的 key 路径
    var pending = [];        // 等待归属给下一个 key 的注释
    function put(path, txt) {
      if (!path || !txt) return;
      var k = lib.jsonCommentPath(path);
      if (!map[k]) map[k] = txt;
    }
    function top() { return stack.length ? stack[stack.length - 1] : null; }
    function isKeyAt(idx) {
      var ctx = top(), tk = toks[idx];
      return !!(ctx && ctx.kind === 'obj' && ctx.expectKey && tk && tk.type === 'string');
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], ctx = top();
      if (t.type === 'comment') {
        var txt = cleanComment(t.text);
        var next = toks[i + 1];
        var trailing = i > 0 && !t.nlBefore;
        if (trailing && next && !next.nlBefore && next.type !== 'comment' && isKeyAt(i + 1)) {
          pending.push(txt);
        } else if (trailing) {
          var prev = toks[i - 1];
          // 原始值数组内部的行尾注释描述的是元素，不归属任何字段
          if (ctx && ctx.kind === 'arr' && !(prev.type === 'punct' && prev.text === '[')) continue;
          put(lastKeyPath, txt);
        } else {
          pending.push(txt);
        }
        continue;
      }
      if (t.type === 'string' && ctx && ctx.kind === 'obj' && ctx.expectKey) {
        var key;
        try { key = JSON.parse(t.text); } catch (e) { key = t.text; }
        lastKeyPath = ctx.path.concat([key]);
        ctx.expectKey = false;
        ctx.lastKey = key;
        if (pending.length) put(lastKeyPath, pending.join('\n'));
        pending = [];
        continue;
      }
      pending = [];
      if (t.type !== 'punct') continue;
      if (t.text === '{' || t.text === '[') {
        var path;
        if (!ctx) path = [];
        else if (ctx.kind === 'arr') path = ctx.path.concat(['[]']);
        else path = ctx.path.concat([ctx.lastKey]);
        stack.push({ kind: t.text === '{' ? 'obj' : 'arr', path: path, expectKey: t.text === '{' });
        if (ctx && ctx.kind === 'arr') lastKeyPath = null;
      } else if (t.text === '}' || t.text === ']') {
        var closed = stack.pop();
        var segs = closed ? closed.path : [];
        lastKeyPath = segs.length && segs[segs.length - 1] !== '[]' ? segs : null;
      } else if (t.text === ',') {
        if (ctx && ctx.kind === 'obj') ctx.expectKey = true;
      }
    }
    return map;
  };

  // 保留注释的格式化：先按 JSONC 校验（报错带原文行列号），再逐记号重排缩进。
  // 行尾注释留在原行尾，独占一行的注释保持独占一行。返回 { text, comments }。
  lib.jsonFormatKeepComments = function (text, indent) {
    text = String(text == null ? '' : text);
    lib.jsonParse(text);
    var ind = indentOf(indent == null ? 2 : indent);
    var unit = typeof ind === 'number' ? new Array(ind + 1).join(' ') : ind;
    var toks = jsoncTokens(text);
    var out = '', level = 0, needNl = false, comments = 0;
    function newline() { out += '\n' + new Array(level + 1).join(unit); }
    for (var k = 0; k < toks.length; k++) {
      var t = toks[k];
      var prev = k > 0 ? toks[k - 1] : null;
      if (t.type === 'comment') {
        comments++;
        if (prev && !t.nlBefore) out += ' ' + t.text;
        else {
          if (prev) newline();
          out += t.text;
        }
        needNl = true;
      } else if (t.text === '{' || t.text === '[') {
        if (needNl) newline();
        out += t.text;
        level++;
        needNl = true;
      } else if (t.text === '}' || t.text === ']') {
        level--;
        if (prev && (prev.text === '{' || prev.text === '[') && prev.type === 'punct') out += t.text;
        else { newline(); out += t.text; }
        needNl = false;
      } else if (t.text === ',' && t.type === 'punct') {
        out += ',';
        needNl = true;
      } else if (t.text === ':' && t.type === 'punct') {
        out += ': ';
        needNl = false;
      } else {
        if (needNl) newline();
        out += t.text;
        needNl = false;
      }
    }
    return { text: out, comments: comments };
  };

  lib.jsonMinify = function (text) {
    return JSON.stringify(lib.jsonParse(text));
  };

  // 把任意文本转义为 JSON 字符串字面量
  lib.jsonEscape = function (text) {
    return JSON.stringify(String(text == null ? '' : text));
  };

  // 把字符串字面量（带或不带外层引号）还原
  lib.jsonUnescape = function (text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) throw new Error('输入为空');
    var v;
    try {
      v = JSON.parse(t.charAt(0) === '"' ? t : '"' + t + '"');
    } catch (e) {
      throw new Error('不是合法的转义字符串：' + e.message);
    }
    if (typeof v !== 'string') throw new Error('输入不是字符串字面量');
    return v;
  };

  // ============================================================
  // 排序
  // ============================================================
  lib.jsonSort = function (value, order) {
    var desc = order === 'desc';
    function walk(v) {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        var keys = Object.keys(v).sort(function (a, b) {
          var r = a < b ? -1 : a > b ? 1 : 0;
          return desc ? -r : r;
        });
        var out = {};
        for (var i = 0; i < keys.length; i++) out[keys[i]] = walk(v[keys[i]]);
        return out;
      }
      return v;
    }
    return walk(value);
  };

  // ============================================================
  // CSV
  // ============================================================
  function csvCell(v, delim) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (s.indexOf(delim) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  lib.jsonToCsv = function (data, delim) {
    delim = delim || ',';
    if (!Array.isArray(data)) {
      if (data && typeof data === 'object') data = [data];
      else throw new Error('需要对象数组，例如 [{"a":1},{"a":2}]');
    }
    var headers = [], seen = {};
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('第 ' + (i + 1) + ' 项不是对象');
      for (var k in row) {
        if (Object.prototype.hasOwnProperty.call(row, k) && !seen[k]) {
          seen[k] = true;
          headers.push(k);
        }
      }
    }
    var lines = [headers.map(function (h) { return csvCell(h, delim); }).join(delim)];
    for (var r = 0; r < data.length; r++) {
      var cells = [];
      for (var h = 0; h < headers.length; h++) cells.push(csvCell(data[r][headers[h]], delim));
      lines.push(cells.join(delim));
    }
    return lines.join('\r\n');
  };

  // 返回二维数组
  lib.csvParse = function (text, delim) {
    delim = delim || ',';
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [], row = [], cell = '', inQ = false, i = 0, n = text.length, quotedCell = false;
    while (i < n) {
      var c = text.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '' && !quotedCell) { inQ = true; quotedCell = true; i++; continue; }
      if (c === delim) { row.push(cell); cell = ''; quotedCell = false; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = ''; quotedCell = false;
        if (c === '\r' && text.charAt(i + 1) === '\n') i++;
        i++; continue;
      }
      cell += c; i++;
    }
    if (inQ) throw new Error('CSV 引号未闭合');
    if (cell !== '' || quotedCell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };

  // AI Accept 2026-10-17 main v1
  // opts.skipComments：跳过首个字段以 # 开头的行（部分导出工具在文件头写 # 注释）。
  // CSV 标准没有注释语法，以 # 开头的数据也可能合法，因此默认关闭，由用户勾选开启。
  lib.csvToJson = function (text, delim, opts) {
    var rows = lib.csvParse(text, delim);
    if (opts && opts.skipComments) rows = rows.filter(function (row) { return !/^\s*#/.test(row[0] || ''); });
    if (!rows.length) throw new Error('输入为空');
    var headers = rows[0];
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      if (rows[r].length === 1 && rows[r][0] === '') continue; // 空行
      var obj = {};
      for (var h = 0; h < headers.length; h++) obj[headers[h]] = rows[r][h] === undefined ? '' : rows[r][h];
      out.push(obj);
    }
    return out;
  };

  // ============================================================
  // XML
  // ============================================================
  function xmlEscape(s, attr) {
    s = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (attr) s = s.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    return s;
  }

  function xmlName(k) {
    var n = String(k).replace(/[^A-Za-z0-9_.\-:\u00c0-\uffef]/g, '_');
    if (!n || /^[^A-Za-z_\u00c0-\uffef]/.test(n) || /^xml/i.test(n)) n = '_' + n;
    return n;
  }

  lib.jsonToXml = function (value, rootName) {
    var out = ['<?xml version="1.0" encoding="UTF-8"?>'];

    function scalar(v) {
      return v === null || v === undefined ? '' : xmlEscape(typeof v === 'object' ? JSON.stringify(v) : v);
    }

    function node(name, v, ind) {
      var pad = new Array(ind + 1).join('  ');
      name = xmlName(name);
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) node(name, v[i], ind);
        return;
      }
      if (v === null || v === undefined) { out.push(pad + '<' + name + '/>'); return; }
      if (typeof v !== 'object') { out.push(pad + '<' + name + '>' + scalar(v) + '</' + name + '>'); return; }
      var attrs = '', text = null, children = [];
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        if (k.charAt(0) === '@') attrs += ' ' + xmlName(k.slice(1)) + '="' + xmlEscape(v[k] == null ? '' : v[k], true) + '"';
        else if (k === '#text') text = v[k];
        else children.push(k);
      }
      if (!children.length) {
        if (text === null || text === undefined || text === '') out.push(pad + '<' + name + attrs + '/>');
        else out.push(pad + '<' + name + attrs + '>' + scalar(text) + '</' + name + '>');
        return;
      }
      out.push(pad + '<' + name + attrs + '>');
      if (text !== null && text !== undefined && text !== '') out.push(pad + '  ' + scalar(text));
      for (var c = 0; c < children.length; c++) node(children[c], v[children[c]], ind + 1);
      out.push(pad + '</' + name + '>');
    }

    var keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
    if (keys.length === 1 && keys[0].charAt(0) !== '@' && keys[0] !== '#text' && !Array.isArray(value[keys[0]])) {
      node(keys[0], value[keys[0]], 0);
    } else {
      node(rootName || 'root', value, 0);
    }
    return out.join('\n');
  };

  // 依赖 DOMParser（浏览器）
  lib.xmlToJson = function (text) {
    text = String(text == null ? '' : text).trim();
    if (!text) throw new Error('输入为空');
    if (typeof DOMParser === 'undefined') throw new Error('当前环境不支持 DOMParser');
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var errs = doc.getElementsByTagName('parsererror');
    if (errs.length) {
      // Chrome 的 parsererror 会夹带页面级套话，只保留错误本身
      var msg = (errs[0].textContent || '')
        .replace(/This page contains the following errors:/i, '')
        .replace(/Below is a rendering of the page up to the first error\.?/i, '')
        .replace(/\s+/g, ' ').trim();
      throw new Error('XML 解析失败：' + (msg || '格式不正确'));
    }

    function conv(elm) {
      var obj = {}, hasAttr = false, hasChild = false, text = '';
      for (var a = 0; a < elm.attributes.length; a++) {
        obj['@' + elm.attributes[a].name] = elm.attributes[a].value;
        hasAttr = true;
      }
      for (var i = 0; i < elm.childNodes.length; i++) {
        var ch = elm.childNodes[i];
        if (ch.nodeType === 1) {
          hasChild = true;
          var v = conv(ch);
          var key = ch.nodeName;
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // conv 只返回对象或字符串，已是数组即说明此前已合并
            if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
            obj[key].push(v);
          } else {
            obj[key] = v;
          }
        } else if (ch.nodeType === 3 || ch.nodeType === 4) {
          text += ch.nodeValue;
        }
      }
      text = text.trim();
      if (!hasAttr && !hasChild) return text;
      if (text) obj['#text'] = text;
      return obj;
    }

    var root = doc.documentElement;
    var out = {};
    out[root.nodeName] = conv(root);
    return out;
  };

  // ============================================================
  // YAML（单向：JSON → YAML）
  // ============================================================
  var YAML_RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
  var YAML_NUMLIKE = /^[-+]?(\.?\d[\d_]*\.?\d*([eE][-+]?\d+)?|0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\.inf|\.nan)$/i;

  function yamlNeedsQuote(s) {
    if (s === '') return true;
    if (YAML_RESERVED.test(s) || YAML_NUMLIKE.test(s)) return true;
    if (/^\s|\s$/.test(s)) return true;
    if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
    if (/: |:$| #|\t/.test(s)) return true;
    if (/[\u0000-\u001f\u007f\u0085\u00a0\u2028\u2029\ufeff]/.test(s)) return true;
    return false;
  }

  function yamlString(s) {
    return yamlNeedsQuote(s) ? JSON.stringify(s) : s;
  }

  function isCollection(v) {
    return v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
  }

  // 标量 → [行首文本, ...续行(已缩进)]
  function yamlScalarLines(v, ind) {
    if (v === null || v === undefined) return ['null'];
    if (typeof v === 'boolean') return [v ? 'true' : 'false'];
    if (typeof v === 'number') return [isFinite(v) ? String(v) : 'null'];
    if (Array.isArray(v)) return ['[]'];
    if (typeof v === 'object') return ['{}'];
    var s = String(v);
    // 多行字符串用块标量；首行以空格开头或含其他控制字符时退回双引号
    if (s.indexOf('\n') >= 0 && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(s) && !/^[ ]/.test(s)) {
      var trail = /\n*$/.exec(s)[0].length;
      var chomp = trail === 0 ? '|-' : trail === 1 ? '|' : '|+';
      // |- 无尾换行；| 保留一个；|+ 保留全部（多余的以空行体现）
      var body = trail ? s.slice(0, -1) : s;
      var pad = new Array(ind + 1).join(' ');
      var lines = body.split('\n');
      var out = [chomp];
      for (var i = 0; i < lines.length; i++) out.push(lines[i] === '' ? '' : pad + lines[i]);
      return out;
    }
    return [yamlString(s)];
  }

  function yamlBlock(v, ind) {
    var pad = new Array(ind + 1).join(' ');
    var lines = [], i, sub;
    if (Array.isArray(v)) {
      for (i = 0; i < v.length; i++) {
        if (isCollection(v[i])) {
          sub = yamlBlock(v[i], ind + 2);
          sub[0] = pad + '- ' + sub[0].slice(ind + 2);
          lines = lines.concat(sub);
        } else {
          sub = yamlScalarLines(v[i], ind + 2);
          lines.push(pad + '- ' + sub[0]);
          lines = lines.concat(sub.slice(1));
        }
      }
      return lines;
    }
    var keys = Object.keys(v);
    for (i = 0; i < keys.length; i++) {
      var k = yamlString(keys[i]);
      var val = v[keys[i]];
      if (isCollection(val)) {
        lines.push(pad + k + ':');
        lines = lines.concat(yamlBlock(val, ind + 2));
      } else {
        sub = yamlScalarLines(val, ind + 2);
        lines.push(pad + k + ': ' + sub[0]);
        lines = lines.concat(sub.slice(1));
      }
    }
    return lines;
  }

  lib.jsonToYaml = function (value) {
    if (!isCollection(value)) return yamlScalarLines(value, 2).join('\n');
    return yamlBlock(value, 0).join('\n');
  };

  // ============================================================
  // 类型推断模型（C# / TypeScript 共用）
  // ============================================================
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

  function classify(v) {
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    if (typeof v === 'number') return 'num';
    return typeof v; // boolean / string
  }

  // samples：同一位置上出现过的全部取值
  function infer(samples) {
    var hasNull = false, vals = [], i;
    for (i = 0; i < samples.length; i++) {
      if (samples[i] === null || samples[i] === undefined) hasNull = true;
      else vals.push(samples[i]);
    }
    if (!vals.length) return { k: 'null' };
    var kind = classify(vals[0]);
    for (i = 1; i < vals.length; i++) {
      if (classify(vals[i]) !== kind) return { k: 'any', nullable: hasNull };
    }
    var t;
    if (kind === 'boolean') t = { k: 'bool' };
    else if (kind === 'num') {
      var allInt = true, allInt32 = true;
      for (i = 0; i < vals.length; i++) {
        if (Math.floor(vals[i]) !== vals[i] || !isFinite(vals[i])) allInt = false;
        else if (vals[i] > 2147483647 || vals[i] < -2147483648) allInt32 = false;
        if (allInt && Math.abs(vals[i]) > 9007199254740991) allInt = false;
      }
      t = { k: !allInt ? 'double' : allInt32 ? 'int' : 'long' };
    } else if (kind === 'string') {
      var allDate = true;
      for (i = 0; i < vals.length; i++) if (!ISO_DATE.test(vals[i])) allDate = false;
      t = { k: 'string', date: allDate };
    } else if (kind === 'array') {
      var items = [];
      for (i = 0; i < vals.length; i++) items = items.concat(vals[i]);
      t = { k: 'array', of: items.length ? infer(items) : { k: 'any', empty: true } };
    } else {
      var order = [], seen = {}, per = {}, cnt = {};
      for (i = 0; i < vals.length; i++) {
        for (var key in vals[i]) {
          if (!Object.prototype.hasOwnProperty.call(vals[i], key)) continue;
          if (!seen[key]) { seen[key] = true; order.push(key); per[key] = []; cnt[key] = 0; }
          per[key].push(vals[i][key]);
          cnt[key]++;
        }
      }
      var fields = [];
      for (i = 0; i < order.length; i++) {
        fields.push({ name: order[i], type: infer(per[order[i]]), optional: cnt[order[i]] < vals.length });
      }
      t = { k: 'object', fields: fields };
    }
    t.nullable = hasNull;
    return t;
  }

  lib.jsonInferType = function (value) {
    return infer([value]);
  };

  function words(s) {
    return String(s)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[^A-Za-z0-9\u00c0-\uffef]+/)
      .filter(function (w) { return w; });
  }

  function pascal(s) {
    var w = words(s), out = '';
    for (var i = 0; i < w.length; i++) out += w[i].charAt(0).toUpperCase() + w[i].slice(1);
    if (!out) out = 'Item';
    if (/^[0-9]/.test(out)) out = '_' + out;
    return out;
  }

  function singular(name) {
    if (/ies$/i.test(name) && name.length > 4) return name.slice(0, -3) + 'y';
    if (/(ss|us|is)$/i.test(name)) return name;
    if (/s$/i.test(name) && name.length > 3) return name.slice(0, -1);
    return name + 'Item';
  }

  // 结构签名（不含名字），用于同构类去重
  function signature(t) {
    if (t.k === 'object') {
      return '{' + t.fields.map(function (f) {
        return f.name + (f.optional ? '?' : '') + ':' + signature(f.type);
      }).join(',') + '}' + (t.nullable ? '?' : '');
    }
    if (t.k === 'array') return '[' + signature(t.of) + ']' + (t.nullable ? '?' : '');
    return t.k + (t.date ? 'D' : '') + (t.nullable ? '?' : '');
  }

  // 为对象类型分配唯一类名；返回按出现顺序排列的 [{ name, type }]
  // AI Accept 2026-10-17 main v1
  // entry.paths 记录该类在 JSON 中出现的全部路径（同构去重的类会有多个），用于查找字段注释
  function collectClasses(root, rootName) {
    var classes = [], bySig = {}, used = {};
    function unique(base) {
      var n = base, i = 2;
      while (used[n]) n = base + i++;
      used[n] = true;
      return n;
    }
    function visit(t, hint, path) {
      if (t.k === 'array') { visit(t.of, singular(hint), path.concat(['[]'])); return; }
      if (t.k !== 'object') return;
      var sig = signature(t).replace(/\?$/, '');
      var entry = bySig[sig];
      if (entry) {
        t.className = entry.name;
        entry.paths.push(path);
      } else {
        t.className = unique(pascal(hint));
        entry = { name: t.className, type: t, paths: [path] };
        bySig[sig] = entry;
        classes.push(entry);
      }
      // 重复结构也继续下探，只为登记子类的路径；子类同构，不会新增类
      for (var i = 0; i < t.fields.length; i++) visit(t.fields[i].type, t.fields[i].name, path.concat([t.fields[i].name]));
    }
    visit(root, rootName, []);
    return classes;
  }

  // 按类的全部出现路径查字段注释，取第一个非空
  function fieldComment(comments, cls, fieldName) {
    if (!comments) return '';
    for (var i = 0; i < cls.paths.length; i++) {
      var c = comments[lib.jsonCommentPath(cls.paths[i].concat([fieldName]))];
      if (c) return c;
    }
    return '';
  }

  // ---------- C# ----------
  function csType(t) {
    var base, valueType = true;
    switch (t.k) {
      case 'null': return 'object?';
      case 'any': return t.nullable ? 'object?' : 'object';
      case 'bool': base = 'bool'; break;
      case 'int': base = 'int'; break;
      case 'long': base = 'long'; break;
      case 'double': base = 'double'; break;
      case 'string':
        if (t.date) base = 'DateTime';
        else { base = 'string'; valueType = false; }
        break;
      case 'array': base = 'List<' + csType(t.of) + '>'; valueType = false; break;
      case 'object': base = t.className; valueType = false; break;
      default: base = 'object'; valueType = false;
    }
    return base + (t.nullable ? '?' : '');
  }

  lib.jsonToCSharp = function (value, opts) {
    opts = opts || {};
    var rootName = pascal(opts.rootName || 'Root');
    var t = infer([value]);
    var wrapRoot = t.k !== 'object' && !(t.k === 'array' && t.of.k === 'object');
    if (wrapRoot) throw new Error('根节点需为对象或对象数组');
    var classes = collectClasses(t, rootName);
    var attrs = opts.attributes !== false;
    var documented = 0;
    var out = ['using System;', 'using System.Collections.Generic;'];
    if (attrs) out.push('using System.Text.Json.Serialization;');
    for (var c = 0; c < classes.length; c++) {
      var cls = classes[c];
      out.push('');
      out.push('public class ' + cls.name);
      out.push('{');
      var usedProps = {};
      for (var i = 0; i < cls.type.fields.length; i++) {
        var f = cls.type.fields[i];
        var prop = pascal(f.name);
        if (prop === cls.name) prop += 'Value';
        var base = prop, n = 2;
        while (usedProps[prop]) prop = base + n++;
        usedProps[prop] = true;
        if (i > 0) out.push('');
        // AI Accept 2026-10-17 main v1
        var doc = fieldComment(opts.comments, cls, f.name);
        if (doc) {
          documented++;
          out.push('    /// <summary>');
          doc.split('\n').forEach(function (line) {
            out.push('    /// ' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
          });
          out.push('    /// </summary>');
        }
        if (attrs) out.push('    [JsonPropertyName(' + JSON.stringify(f.name) + ')]');
        var type = csType(f.type);
        var init = '';
        if (type === 'string') init = ' = string.Empty;';
        else if (/^List<.*>$/.test(type)) init = ' = new();';
        else if (f.type.k === 'object' && !f.type.nullable) init = ' = new();';
        out.push('    public ' + type + ' ' + prop + ' { get; set; }' + init);
      }
      out.push('}');
    }
    opts.documented = documented;
    return out.join('\n');
  };

  // ---------- TypeScript ----------
  function tsType(t) {
    var base;
    switch (t.k) {
      case 'null': return 'null';
      case 'any': base = 'unknown'; break;
      case 'bool': base = 'boolean'; break;
      case 'int':
      case 'long':
      case 'double': base = 'number'; break;
      case 'string': base = 'string'; break;
      case 'array':
        var inner = tsType(t.of);
        base = (/[|&]/.test(inner) ? '(' + inner + ')' : inner) + '[]';
        break;
      case 'object': base = t.className; break;
      default: base = 'unknown';
    }
    return t.nullable && base !== 'unknown' ? base + ' | null' : base;
  }

  lib.jsonToTs = function (value, opts) {
    opts = opts || {};
    var rootName = pascal(opts.rootName || 'Root');
    var t = infer([value]);
    var classes = collectClasses(t, rootName);
    var documented = 0;
    var out = [];
    if (t.k !== 'object') out.push('export type ' + rootName + (classes.length && classes[0].name === rootName ? 'Type' : '') + ' = ' + tsType(t) + ';');
    for (var c = 0; c < classes.length; c++) {
      if (out.length) out.push('');
      out.push('export interface ' + classes[c].name + ' {');
      var fields = classes[c].type.fields;
      for (var i = 0; i < fields.length; i++) {
        var key = /^[A-Za-z_$][\w$]*$/.test(fields[i].name) ? fields[i].name : JSON.stringify(fields[i].name);
        // AI Accept 2026-10-17 main v1
        var doc = fieldComment(opts.comments, classes[c], fields[i].name);
        if (doc) {
          documented++;
          var lines = doc.replace(/\*\//g, '*\\/').split('\n');
          if (lines.length === 1) out.push('  /** ' + lines[0] + ' */');
          else {
            out.push('  /**');
            lines.forEach(function (line) { out.push('   * ' + line); });
            out.push('   */');
          }
        }
        out.push('  ' + key + (fields[i].optional ? '?' : '') + ': ' + tsType(fields[i].type) + ';');
      }
      out.push('}');
    }
    opts.documented = documented;
    return out.join('\n');
  };

  // ============================================================
  // 界面
  // ============================================================
  function errText(e) {
    return e && e.message ? e.message : String(e);
  }

  // 标准「输入 → 输出」双栏
  function ioPanel(ui, opts) {
    var input = ui.textarea({ rows: opts.rows || 16, placeholder: opts.placeholder || '在此粘贴 JSON…' });
    var output = ui.output({ rows: opts.rows || 16 });
    var status = ui.status();
    return {
      input: input,
      output: output,
      status: status,
      grid: ui.grid([ui.field(opts.inLabel || '输入', input), ui.field(opts.outLabel || '结果', output)])
    };
  }

  // AI Accept 2026-10-17 main v1
  // 输入含注释时在状态栏说明：这些工具按 JSONC 解析，注释不会出现在结果里
  function commentNote(text) {
    var n = 0;
    try { n = lib.jsonStripComments(text).count; } catch (e) { n = 0; }
    return n ? '（已忽略 ' + n + ' 处注释）' : '';
  }

  function sample(obj) {
    return JSON.stringify(obj, null, 2);
  }

  var DEMO = {
    id: 1001,
    name: '沈超',
    active: true,
    score: 98.5,
    createdAt: '2026-10-16T09:30:00Z',
    tags: ['全栈', '.NET'],
    address: { city: '成都', zip: '610000' },
    orders: [{ orderId: 'A001', amount: 199 }, { orderId: 'A002', amount: 88.8, remark: null }]
  };

  // 1. 格式化
  Tools.register({
    id: 'json-format',
    cat: 'json',
    name: 'JSON 格式化',
    desc: '校验并美化 JSON，支持带 // 与 /* */ 注释的 JSONC，解析失败时精确定位到行号与列号。',
    keywords: 'json jsonc format beautify validate 校验 美化 注释',
    render: function (root, ui) {
      var p = ioPanel(ui, { inLabel: '原始 JSON', outLabel: '格式化结果' });
      var indent = ui.select([{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }, { value: 'tab', label: 'Tab' }], '2');
      var allow = ui.checkbox('允许注释（JSONC）', true);
      var keep = ui.checkbox('保留注释', true);
      function run() {
        keep.input.disabled = !allow.input.checked;
        if (!p.input.value.trim()) { p.output.value = ''; p.status.clear(); return; }
        try {
          if (!allow.input.checked) {
            p.output.value = lib.jsonFormat(p.input.value, indent.value, { strict: true });
            p.status.ok('JSON 合法，共 ' + p.output.value.split('\n').length + ' 行');
            return;
          }
          var n = lib.jsonStripComments(p.input.value).count;
          if (n && keep.input.checked) {
            p.output.value = lib.jsonFormatKeepComments(p.input.value, indent.value).text;
            p.status.ok('JSONC 合法，共 ' + p.output.value.split('\n').length + ' 行，已保留 ' + n + ' 处注释（注释不属于标准 JSON，部分程序无法解析）');
          } else {
            p.output.value = lib.jsonFormat(p.input.value, indent.value);
            p.status.ok('JSON 合法，共 ' + p.output.value.split('\n').length + ' 行' + (n ? '，已移除 ' + n + ' 处注释' : ''));
          }
        } catch (e) {
          p.output.value = '';
          p.status.error(errText(e));
        }
      }
      var auto = ui.debounce(run, 250);
      p.input.addEventListener('input', auto);
      indent.addEventListener('change', run);
      allow.input.addEventListener('change', run);
      keep.input.addEventListener('change', run);
      root.appendChild(ui.inline([ui.field('缩进', indent), allow.root, keep.root]));
      root.appendChild(p.grid);
      root.appendChild(ui.actions([
        ui.button('格式化', run, true),
        ui.copyButton(p.output, p.status),
        ui.button('填入示例', function () { p.input.value = JSON.stringify(DEMO); run(); }),
        ui.button('清空', function () { p.input.value = ''; run(); p.input.focus(); })
      ]));
      root.appendChild(p.status);
    }
  });

  // 2. 压缩转义
  Tools.register({
    id: 'json-minify',
    cat: 'json',
    name: 'JSON 压缩转义',
    desc: '将 JSON 压缩为单行，或在 JSON 与转义字符串字面量之间互转。',
    keywords: 'json minify compress escape unescape 压缩 转义 去转义',
    render: function (root, ui) {
      var p = ioPanel(ui, { inLabel: '输入', outLabel: '结果' });
      function act(fn, okMsg, parsesJson) {
        return function () {
          try {
            p.output.value = fn(p.input.value);
            p.status.ok(okMsg + '，' + p.output.value.length + ' 个字符' + (parsesJson ? commentNote(p.input.value) : ''));
          } catch (e) {
            p.output.value = '';
            p.status.error(errText(e));
          }
        };
      }
      root.appendChild(p.grid);
      root.appendChild(ui.actions([
        ui.button('压缩', act(lib.jsonMinify, '已压缩', true), true),
        ui.button('压缩并转义', act(function (t) { return lib.jsonEscape(lib.jsonMinify(t)); }, '已转义', true)),
        ui.button('转义', act(lib.jsonEscape, '已转义')),
        ui.button('去转义', act(lib.jsonUnescape, '已还原')),
        ui.copyButton(p.output, p.status)
      ]));
      root.appendChild(p.status);
    }
  });

  // 3. 排序
  Tools.register({
    id: 'json-sort',
    cat: 'json',
    name: 'JSON 排序',
    desc: '按 key 名称对 JSON 递归排序，数组元素顺序保持不变。',
    keywords: 'json sort key 排序',
    render: function (root, ui) {
      var p = ioPanel(ui, { inLabel: '原始 JSON', outLabel: '排序结果' });
      var order = ui.select([{ value: 'asc', label: '升序 A → Z' }, { value: 'desc', label: '降序 Z → A' }], 'asc');
      var indent = ui.select([{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }, { value: '0', label: '压缩' }], '2');
      function run() {
        if (!p.input.value.trim()) { p.output.value = ''; p.status.clear(); return; }
        try {
          var n = parseInt(indent.value, 10);
          p.output.value = JSON.stringify(lib.jsonSort(lib.jsonParse(p.input.value), order.value), null, n || undefined);
          p.status.ok('已排序' + commentNote(p.input.value));
        } catch (e) {
          p.output.value = '';
          p.status.error(errText(e));
        }
      }
      p.input.addEventListener('input', ui.debounce(run, 250));
      order.addEventListener('change', run);
      indent.addEventListener('change', run);
      root.appendChild(ui.inline([ui.field('顺序', order), ui.field('输出', indent)]));
      root.appendChild(p.grid);
      root.appendChild(ui.actions([ui.button('排序', run, true), ui.copyButton(p.output, p.status)]));
      root.appendChild(p.status);
    }
  });

  // 4. CSV
  Tools.register({
    id: 'json-csv',
    cat: 'json',
    name: 'JSON ⇄ CSV',
    desc: '对象数组与 CSV 互转，正确处理引号、分隔符与字段内换行，可直接用 Excel 打开。',
    keywords: 'json csv excel 表格 转换',
    render: function (root, ui) {
      var left = ui.textarea({ rows: 16, placeholder: '[{"name":"张三","age":30}]' });
      var right = ui.textarea({ rows: 16, placeholder: 'name,age\n张三,30' });
      var delim = ui.select([{ value: ',', label: '逗号 ,' }, { value: '\t', label: '制表符 Tab' }, { value: ';', label: '分号 ;' }], ',');
      var status = ui.status();
      var skipHash = ui.checkbox('CSV 转 JSON 时跳过 # 开头的注释行', false);
      root.appendChild(ui.inline([ui.field('分隔符', delim), skipHash.root]));
      root.appendChild(ui.grid([ui.field('JSON', left), ui.field('CSV', right)]));
      root.appendChild(ui.actions([
        ui.button('JSON → CSV', function () {
          try {
            right.value = lib.jsonToCsv(lib.jsonParse(left.value), delim.value);
            status.ok('已转换为 CSV，共 ' + (right.value.split('\r\n').length - 1) + ' 行数据' + commentNote(left.value));
          } catch (e) { status.error(errText(e)); }
        }, true),
        ui.button('CSV → JSON', function () {
          try {
            var arr = lib.csvToJson(right.value, delim.value, { skipComments: skipHash.input.checked });
            left.value = JSON.stringify(arr, null, 2);
            status.ok('已转换为 JSON，共 ' + arr.length + ' 条记录');
          } catch (e) { status.error(errText(e)); }
        }),
        ui.copyButton(right, status, '复制 CSV'),
        ui.copyButton(left, status, '复制 JSON')
      ]));
      root.appendChild(status);
    }
  });

  // 5. XML
  Tools.register({
    id: 'json-xml',
    cat: 'json',
    name: 'XML ⇄ JSON',
    desc: 'XML 与 JSON 互转，属性以 @ 前缀表示，同名节点自动合并为数组。',
    keywords: 'xml json 转换',
    render: function (root, ui) {
      var xml = ui.textarea({ rows: 16, placeholder: '<user id="1"><name>张三</name></user>' });
      var json = ui.textarea({ rows: 16, placeholder: '{"user":{"@id":"1","name":"张三"}}' });
      var status = ui.status();
      root.appendChild(ui.grid([ui.field('XML', xml), ui.field('JSON', json)]));
      root.appendChild(ui.actions([
        ui.button('XML → JSON', function () {
          try {
            json.value = JSON.stringify(lib.xmlToJson(xml.value), null, 2);
            status.ok('已转换为 JSON');
          } catch (e) { status.error(errText(e)); }
        }, true),
        ui.button('JSON → XML', function () {
          try {
            xml.value = lib.jsonToXml(lib.jsonParse(json.value));
            status.ok('已转换为 XML' + commentNote(json.value));
          } catch (e) { status.error(errText(e)); }
        }),
        ui.copyButton(json, status, '复制 JSON'),
        ui.copyButton(xml, status, '复制 XML')
      ]));
      root.appendChild(status);
    }
  });

  // 6. YAML
  Tools.register({
    id: 'json-yaml',
    cat: 'json',
    name: 'JSON 转 YAML',
    desc: '将 JSON 转换为 YAML，自动为保留字、数字样式等易歧义字符串加引号。',
    keywords: 'json yaml yml 转换 配置',
    render: function (root, ui) {
      var p = ioPanel(ui, { inLabel: 'JSON', outLabel: 'YAML' });
      function run() {
        if (!p.input.value.trim()) { p.output.value = ''; p.status.clear(); return; }
        try {
          p.output.value = lib.jsonToYaml(lib.jsonParse(p.input.value));
          p.status.ok('已转换为 YAML' + commentNote(p.input.value));
        } catch (e) {
          p.output.value = '';
          p.status.error(errText(e));
        }
      }
      p.input.addEventListener('input', ui.debounce(run, 250));
      root.appendChild(p.grid);
      root.appendChild(ui.actions([
        ui.button('转换', run, true),
        ui.copyButton(p.output, p.status),
        ui.button('填入示例', function () { p.input.value = sample(DEMO); run(); })
      ]));
      root.appendChild(p.status);
    }
  });

  // 7/8. 代码生成（C# / TypeScript）
  function codegenTool(id, name, desc, keywords, gen, withAttr) {
    Tools.register({
      id: id,
      cat: 'json',
      name: name,
      desc: desc,
      keywords: keywords,
      render: function (root, ui) {
        var p = ioPanel(ui, { inLabel: 'JSON 样本', outLabel: '生成代码' });
        var rootName = ui.input({ value: 'Root', placeholder: 'Root' });
        var attr = withAttr ? ui.checkbox('添加 [JsonPropertyName] 特性', true) : null;
        // AI Accept 2026-10-17 main v1
        var docs = ui.checkbox('注释生成文档注释', true);
        function run() {
          if (!p.input.value.trim()) { p.output.value = ''; p.status.clear(); return; }
          try {
            var genOpts = {
              rootName: rootName.value.trim() || 'Root',
              attributes: attr ? attr.input.checked : undefined,
              comments: docs.input.checked ? lib.jsonCommentMap(p.input.value) : undefined
            };
            p.output.value = gen(lib.jsonParse(p.input.value), genOpts);
            p.status.ok('已生成' + (genOpts.documented ? '，已为 ' + genOpts.documented + ' 个字段生成注释' : commentNote(p.input.value)));
          } catch (e) {
            p.output.value = '';
            p.status.error(errText(e));
          }
        }
        var auto = ui.debounce(run, 300);
        p.input.addEventListener('input', auto);
        rootName.addEventListener('input', auto);
        if (attr) attr.input.addEventListener('change', run);
        docs.input.addEventListener('change', run);
        root.appendChild(ui.inline([ui.field('根类型名', rootName), attr ? attr.root : null, docs.root]));
        root.appendChild(p.grid);
        root.appendChild(ui.actions([
          ui.button('生成', run, true),
          ui.copyButton(p.output, p.status),
          ui.button('填入示例', function () { p.input.value = sample(DEMO); run(); })
        ]));
        root.appendChild(p.status);
      }
    });
  }

  codegenTool('json-csharp', 'JSON 转 C# 实体',
    '根据 JSON 样本生成 C# 实体类，自动推断 int/long/double/DateTime/List 等类型，兼容 System.Text.Json。',
    'json c# csharp .net class 实体 model', lib.jsonToCSharp, true);

  codegenTool('json-ts', 'JSON 转 TypeScript',
    '根据 JSON 样本生成 TypeScript 接口，合并数组中多个对象的字段并标注可选属性。',
    'json typescript ts interface 接口 类型', lib.jsonToTs, false);
})(typeof window !== 'undefined' ? window : globalThis);
