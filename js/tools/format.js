// AI Accept 2026-10-16 main v1
// 格式化工具：SQL / XML / CSS 的美化与压缩（全部自写分词，不依赖第三方库）
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;

  function errText(e) {
    return e && e.message ? e.message : String(e);
  }

  function repeat(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  function indentUnit(v) {
    if (v === 'tab') return '\t';
    var n = parseInt(v, 10);
    return repeat(' ', n > 0 && n <= 8 ? n : 2);
  }

  // =====================================================================
  // SQL
  // =====================================================================

  // 分词：ws / comment(line|block) / string / ident(引号标识符) / word / number / op / punct
  lib.sqlTokenize = function (src) {
    var s = String(src);
    var tokens = [];
    var i = 0, n = s.length;

    function push(type, value) {
      tokens.push({ type: type, value: value });
    }

    function readQuoted(start, close) {
      // 返回结束位置（含闭合符）；成对闭合符表示转义（'' / "" / ]] / ``）
      var j = start + 1;
      while (j < n) {
        if (s.charAt(j) === close) {
          if (s.charAt(j + 1) === close) { j += 2; continue; }
          return j + 1;
        }
        // 反斜杠转义（MySQL 风格），只跳过下一个字符，不改内容
        if (s.charAt(j) === '\\' && close !== ']') { j += 2; continue; }
        j++;
      }
      throw new Error('引号未闭合：从第 ' + (start + 1) + ' 个字符开始的 ' + s.charAt(start) + ' 没有对应的 ' + close);
    }

    while (i < n) {
      var c = s.charAt(i);
      var c2 = s.charAt(i + 1);
      var j;

      if (/\s/.test(c)) {
        j = i + 1;
        while (j < n && /\s/.test(s.charAt(j))) j++;
        push('ws', s.slice(i, j));
        i = j;
      } else if (c === '-' && c2 === '-') {
        j = s.indexOf('\n', i);
        if (j < 0) j = n;
        push('line-comment', s.slice(i, j).replace(/\r$/, ''));
        i = j;
      } else if (c === '#' && (i === 0 || /\s/.test(s.charAt(i - 1))) && /[\s#!]/.test(c2 || ' ') ) {
        // MySQL 行注释 "# ..."（要求 # 后跟空白，避免误伤 SQL Server 的 #临时表）
        j = s.indexOf('\n', i);
        if (j < 0) j = n;
        push('line-comment', s.slice(i, j).replace(/\r$/, ''));
        i = j;
      } else if (c === '/' && c2 === '*') {
        // AI Accept 2026-10-17 main v1
        // 支持嵌套块注释（SQL Server / PostgreSQL）：/* 外 /* 内 */ 外 */ 整体为一个注释。
        // MySQL 不支持嵌套，但对它而言这种输入本就不合法，按嵌套处理不影响合法 SQL。
        var depth = 1;
        j = i + 2;
        while (j < n && depth > 0) {
          if (s.charAt(j) === '/' && s.charAt(j + 1) === '*') { depth++; j += 2; }
          else if (s.charAt(j) === '*' && s.charAt(j + 1) === '/') { depth--; j += 2; }
          else j++;
        }
        if (depth > 0) throw new Error('块注释未闭合：从第 ' + (i + 1) + ' 个字符开始的 /* 没有对应的 */');
        push('block-comment', s.slice(i, j));
        i = j;
      } else if (c === '\'') {
        j = readQuoted(i, '\'');
        push('string', s.slice(i, j));
        i = j;
      } else if (/[NnXxBbEe]/.test(c) && c2 === '\'' && (i === 0 || !/[\w@#$]/.test(s.charAt(i - 1)))) {
        // N'..' / X'..' / B'..' / E'..' 前缀字符串，前缀与引号之间不能插空格
        j = readQuoted(i + 1, '\'');
        push('string', s.slice(i, j));
        i = j;
      } else if (c === '"') {
        j = readQuoted(i, '"');
        push('ident', s.slice(i, j));
        i = j;
      } else if (c === '`') {
        j = readQuoted(i, '`');
        push('ident', s.slice(i, j));
        i = j;
      } else if (c === '[') {
        j = readQuoted(i, ']');
        push('ident', s.slice(i, j));
        i = j;
      } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2))) {
        var m = /^(0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
        push('number', m[0]);
        i += m[0].length;
      } else if (/[A-Za-z_@#$\u0080-\uffff]/.test(c)) {
        j = i + 1;
        while (j < n && /[\w@#$\u0080-\uffff]/.test(s.charAt(j))) j++;
        push('word', s.slice(i, j));
        i = j;
      } else if (c === '(' || c === ')' || c === ',' || c === ';' || c === '.') {
        push('punct', c);
        i++;
      } else {
        var three = s.substr(i, 3);
        var two = s.substr(i, 2);
        if (three === '->>' || three === '<=>') { push('op', three); i += 3; }
        else if (/^(<=|>=|<>|!=|\|\||::|:=|->|=>|<<|>>|\+=|-=|\*=|\/=)$/.test(two)) { push('op', two); i += 2; }
        else { push('op', c); i++; }
      }
    }
    return tokens;
  };

  var SQL_KEYWORDS = ('ADD ALL ALTER AND ANY APPLY AS ASC BEGIN BETWEEN BY CASE CAST CHECK COLUMN CONSTRAINT CREATE ' +
    'CROSS CURRENT_DATE CURRENT_TIMESTAMP DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END ESCAPE EXCEPT EXEC ' +
    'EXISTS FETCH FIRST FOREIGN FROM FULL GROUP HAVING IF ILIKE IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY ' +
    'LEFT LIKE LIMIT MERGE NEXT NOT NULL OFFSET ON ONLY OR ORDER OUTER OVER PARTITION PRIMARY PROCEDURE REFERENCES ' +
    'REPLACE RETURNING RIGHT ROWS ROW SELECT SET TABLE THEN TOP TRUNCATE UNION UNIQUE UPDATE USING VALUES VIEW WHEN ' +
    'WHERE WITH RECURSIVE TRUE FALSE').split(' ');
  var KW = {};
  for (var ki = 0; ki < SQL_KEYWORDS.length; ki++) KW[SQL_KEYWORDS[ki]] = true;

  var SQL_PHRASES = [
    ['LEFT', 'OUTER', 'JOIN'], ['RIGHT', 'OUTER', 'JOIN'], ['FULL', 'OUTER', 'JOIN'],
    ['GROUP', 'BY'], ['ORDER', 'BY'], ['PARTITION', 'BY'], ['INSERT', 'INTO'], ['DELETE', 'FROM'],
    ['UNION', 'ALL'], ['LEFT', 'JOIN'], ['RIGHT', 'JOIN'], ['FULL', 'JOIN'], ['INNER', 'JOIN'],
    ['CROSS', 'JOIN'], ['CROSS', 'APPLY'], ['OUTER', 'APPLY'], ['SELECT', 'DISTINCT'], ['MERGE', 'INTO'],
    ['WITH', 'RECURSIVE']
  ];

  // 主子句：另起一行，内容缩进一级
  var SQL_CLAUSE = {
    'SELECT': 1, 'SELECT DISTINCT': 1, 'FROM': 1, 'WHERE': 1, 'GROUP BY': 1, 'ORDER BY': 1, 'HAVING': 1,
    'LIMIT': 1, 'OFFSET': 1, 'INSERT INTO': 1, 'VALUES': 1, 'UPDATE': 1, 'SET': 1, 'DELETE FROM': 1,
    'DELETE': 1, 'WITH': 1, 'WITH RECURSIVE': 1, 'RETURNING': 1, 'MERGE INTO': 1, 'USING': 1, 'FETCH': 1
  };
  // 集合运算：独占一行
  var SQL_SETOP = { 'UNION': 1, 'UNION ALL': 1, 'INTERSECT': 1, 'EXCEPT': 1 };
  var SQL_JOIN = {
    'JOIN': 1, 'INNER JOIN': 1, 'LEFT JOIN': 1, 'LEFT OUTER JOIN': 1, 'RIGHT JOIN': 1, 'RIGHT OUTER JOIN': 1,
    'FULL JOIN': 1, 'FULL OUTER JOIN': 1, 'CROSS JOIN': 1, 'CROSS APPLY': 1, 'OUTER APPLY': 1
  };
  // 这些子句内顶层逗号换行
  var SQL_LIST_CLAUSE = {
    'SELECT': 1, 'SELECT DISTINCT': 1, 'GROUP BY': 1, 'ORDER BY': 1, 'SET': 1, 'VALUES': 1, 'FROM': 1,
    'WITH': 1, 'WITH RECURSIVE': 1, 'RETURNING': 1
  };

  // 合并多词关键字，丢弃空白；保留注释
  function sqlSignificant(tokens, upper) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'ws') continue;
      if (t.type === 'word') {
        var matched = null;
        for (var p = 0; p < SQL_PHRASES.length && !matched; p++) {
          var ph = SQL_PHRASES[p];
          if (t.value.toUpperCase() !== ph[0]) continue;
          var words = [t.value], k = i, ok = true;
          for (var w = 1; w < ph.length; w++) {
            k++;
            while (k < tokens.length && tokens[k].type === 'ws') k++;
            if (k >= tokens.length || tokens[k].type !== 'word' || tokens[k].value.toUpperCase() !== ph[w]) { ok = false; break; }
            words.push(tokens[k].value);
          }
          if (ok) matched = { words: words, end: k };
        }
        if (matched) {
          var val = upper ? matched.words.join(' ').toUpperCase() : matched.words.join(' ');
          out.push({ type: 'word', value: val, up: val.toUpperCase(), kw: true });
          i = matched.end;
          continue;
        }
        var up = t.value.toUpperCase();
        var isKw = !!KW[up];
        out.push({ type: 'word', value: upper && isKw ? up : t.value, up: up, kw: isKw });
        continue;
      }
      out.push({ type: t.type, value: t.value, up: t.value.toUpperCase(), kw: false });
    }
    return out;
  }

  lib.sqlFormat = function (src, opts) {
    opts = opts || {};
    var unit = indentUnit(opts.indent == null ? '2' : String(opts.indent));
    var toks = sqlSignificant(lib.sqlTokenize(src), opts.uppercase !== false);
    var out = '';
    var lineIndent = 0;
    var pending = null; // 下一个 token 前需要的换行缩进
    var prev = null, prevPrev = null;

    // 栈元素：{ sub: true, base, clause, inOn, openIndent } 为查询作用域；{ sub: false } 为普通括号
    var root = { sub: true, base: 0, clause: '', inOn: false, openIndent: 0 };
    var stack = [root];
    var caseDepth = 0;
    var betweenPending = false;

    function scope() {
      for (var i = stack.length - 1; i >= 0; i--) if (stack[i].sub) return stack[i];
      return root;
    }
    function atTop() {
      return stack[stack.length - 1].sub && caseDepth === 0;
    }
    function newline(ind) {
      out = out.replace(/[ \t]+$/, '');
      if (out.length) out += '\n';
      out += repeat(unit, ind);
      lineIndent = ind;
      pending = null;
    }
    function needSpace(t) {
      if (!prev) return false;
      if (/\n[ \t]*$/.test(out) || out === '') return false;
      var pv = prev.value;
      if (prev.type === 'punct' && (pv === '(' || pv === '.')) return false;
      if (t.type === 'punct' && (t.value === ')' || t.value === ',' || t.value === ';' || t.value === '.')) return false;
      if (t.type === 'punct' && t.value === '(') {
        // 函数调用 COUNT( 不加空格；关键字 IN ( / VALUES ( 加空格
        if ((prev.type === 'word' && !prev.kw) || prev.type === 'ident') return false;
        return true;
      }
      if (prev.type === 'op' && prev.value === '::') return false;
      if (t.type === 'op' && t.value === '::') return false;
      // 一元正负号：= -1 / (-1 / , -1
      if ((t.type === 'number' || t.type === 'word') && prev.type === 'op' && (pv === '-' || pv === '+')) {
        if (!prevPrev || prevPrev.type === 'op' || (prevPrev.type === 'punct' && prevPrev.value !== ')') || (prevPrev.type === 'word' && prevPrev.kw)) return false;
      }
      return true;
    }
    function emit(t) {
      if (pending != null) newline(pending);
      else if (needSpace(t)) out += ' ';
      out += t.value;
      prevPrev = prev;
      prev = t;
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      var sc = scope();
      var up = t.up;

      if (t.type === 'line-comment') {
        emit(t);
        pending = lineIndent;
        continue;
      }
      if (t.type === 'block-comment') {
        emit(t);
        continue;
      }

      if (t.type === 'word' && atTop()) {
        if (SQL_CLAUSE[up]) {
          newline(sc.base);
          emit(t);
          sc.clause = up;
          sc.inOn = false;
          pending = sc.base + 1;
          continue;
        }
        if (SQL_SETOP[up]) {
          newline(sc.base);
          emit(t);
          sc.clause = up;
          pending = sc.base;
          continue;
        }
        if (SQL_JOIN[up]) {
          newline(sc.base + 1);
          emit(t);
          sc.inOn = false;
          continue;
        }
        if (up === 'ON' && !sc.inOn && sc.clause === 'FROM') {
          newline(sc.base + 2);
          emit(t);
          sc.inOn = true;
          continue;
        }
        if ((up === 'AND' || up === 'OR') && !betweenPending) {
          newline(sc.inOn ? sc.base + 2 : sc.base + 1);
          emit(t);
          continue;
        }
      }

      if (t.type === 'word') {
        if (up === 'BETWEEN') betweenPending = true;
        else if (up === 'AND' && betweenPending) betweenPending = false;
        if (up === 'CASE') caseDepth++;
        else if (up === 'END' && caseDepth > 0) caseDepth--;
        emit(t);
        continue;
      }

      if (t.type === 'punct') {
        if (t.value === '(') {
          var next = toks[i + 1];
          var isSub = next && next.type === 'word' && (next.up === 'SELECT' || next.up === 'SELECT DISTINCT' || next.up === 'WITH');
          emit(t);
          if (isSub) {
            var openIndent = lineIndent;
            stack.push({ sub: true, base: openIndent + 1, clause: '', inOn: false, openIndent: openIndent, savedCase: caseDepth });
            caseDepth = 0;
          } else {
            stack.push({ sub: false });
          }
          continue;
        }
        if (t.value === ')') {
          var top = stack.length > 1 ? stack.pop() : null;
          if (top && top.sub) {
            caseDepth = top.savedCase || 0;
            newline(top.openIndent);
          }
          emit(t);
          continue;
        }
        if (t.value === ',') {
          emit(t);
          if (atTop() && SQL_LIST_CLAUSE[sc.clause]) pending = sc.base + 1;
          continue;
        }
        if (t.value === ';') {
          emit(t);
          stack = [root];
          root.clause = '';
          root.inOn = false;
          caseDepth = 0;
          betweenPending = false;
          out = out.replace(/[ \t]+$/, '') + '\n';
          pending = 0;
          continue;
        }
      }

      emit(t);
    }
    return out.replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, '');
  };

  lib.sqlMinify = function (src, opts) {
    opts = opts || {};
    var keepComments = !!opts.keepComments;
    var toks = lib.sqlTokenize(src);
    var out = '';
    var prev = null;
    var forceBreak = false;

    function wordy(ch) {
      return /[\w@#$\u0080-\uffff]/.test(ch);
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'ws') continue;
      if ((t.type === 'line-comment' || t.type === 'block-comment') && !keepComments) continue;
      if (prev) {
        if (forceBreak) out += '\n';
        else {
          var a = prev.value.charAt(prev.value.length - 1);
          var b = t.value.charAt(0);
          var sp = (wordy(a) && wordy(b)) ||
            (prev.type === 'op' && t.type === 'op') ||
            ((prev.type === 'string' || prev.type === 'ident') && (t.type === 'string' || t.type === 'ident' || wordy(b))) ||
            (wordy(a) && (t.type === 'string' || t.type === 'ident')) ||
            (prev.type === 'op' && prev.value === '-' && (b === '-')) ||
            (prev.type === 'op' && prev.value === '/' && b === '*') ||
            t.type === 'block-comment' || prev.type === 'block-comment' || t.type === 'line-comment' ||
            (prev.type === 'number' && b === '.') || (a === '.' && t.type === 'number');
          if (sp) out += ' ';
        }
      }
      forceBreak = t.type === 'line-comment';
      out += t.value;
      prev = t;
    }
    return out;
  };

  // =====================================================================
  // XML
  // =====================================================================

  // 分词：text / comment / cdata / pi / doctype / open / close / self
  lib.xmlTokenize = function (src) {
    var s = String(src);
    var n = s.length, i = 0;
    var tokens = [];

    function lineCol(pos) {
      var line = 1, col = 1;
      for (var k = 0; k < pos; k++) {
        if (s.charAt(k) === '\n') { line++; col = 1; } else col++;
      }
      return '第 ' + line + ' 行第 ' + col + ' 列';
    }
    function need(str, from, what, start) {
      var j = s.indexOf(str, from);
      if (j < 0) throw new Error(what + '未闭合（' + lineCol(start) + '）');
      return j + str.length;
    }

    while (i < n) {
      if (s.charAt(i) !== '<') {
        var j = s.indexOf('<', i);
        if (j < 0) j = n;
        tokens.push({ type: 'text', value: s.slice(i, j) });
        i = j;
        continue;
      }
      var end;
      if (s.substr(i, 4) === '<!--') {
        end = need('-->', i + 4, '注释', i);
        tokens.push({ type: 'comment', value: s.slice(i, end) });
      } else if (s.substr(i, 9) === '<![CDATA[') {
        end = need(']]>', i + 9, 'CDATA 段', i);
        tokens.push({ type: 'cdata', value: s.slice(i, end) });
      } else if (s.substr(i, 2) === '<?') {
        end = need('?>', i + 2, '处理指令', i);
        tokens.push({ type: 'pi', value: s.slice(i, end) });
      } else if (s.substr(i, 2) === '<!') {
        // DOCTYPE，可能含 [ 内部子集 ] 与引号
        var k = i + 2, depth = 0, q = '';
        while (k < n) {
          var ch = s.charAt(k);
          if (q) { if (ch === q) q = ''; }
          else if (ch === '"' || ch === '\'') q = ch;
          else if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '>' && depth <= 0) break;
          k++;
        }
        if (k >= n) throw new Error('声明未闭合（' + lineCol(i) + '）');
        tokens.push({ type: 'doctype', value: s.slice(i, k + 1) });
        end = k + 1;
      } else {
        // 标签：引号内的 > 不算结束
        var p = i + 1, quote = '';
        while (p < n) {
          var cc = s.charAt(p);
          if (quote) { if (cc === quote) quote = ''; }
          else if (cc === '"' || cc === '\'') quote = cc;
          else if (cc === '>') break;
          else if (cc === '<') throw new Error('标签内出现意外的 <（' + lineCol(p) + '）');
          p++;
        }
        if (p >= n) throw new Error('标签未闭合（' + lineCol(i) + '）');
        var raw = s.slice(i, p + 1);
        var type = raw.charAt(1) === '/' ? 'close' : (/\/\s*>$/.test(raw) ? 'self' : 'open');
        var nm = /^<\/?\s*([^\s/>]+)/.exec(raw);
        tokens.push({ type: type, value: normalizeTag(raw), name: nm ? nm[1] : '' });
        end = p + 1;
      }
      i = end;
    }
    return tokens;
  };

  // 标签内引号外的空白折叠为一个空格
  function normalizeTag(raw) {
    var out = '', quote = '';
    for (var i = 0; i < raw.length; i++) {
      var c = raw.charAt(i);
      if (quote) {
        out += c;
        if (c === quote) quote = '';
      } else if (c === '"' || c === '\'') {
        quote = c;
        out += c;
      } else if (/\s/.test(c)) {
        if (!/\s$/.test(out)) out += ' ';
      } else {
        out += c;
      }
    }
    return out.replace(/^<\s+/, '<').replace(/^<\/\s+/, '</').replace(/\s+>$/, '>').replace(/\s+\/>$/, ' />');
  }

  lib.xmlFormat = function (src, opts) {
    opts = opts || {};
    var unit = indentUnit(opts.indent == null ? '2' : String(opts.indent));
    var toks = lib.xmlTokenize(src);
    var lines = [];
    var depth = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'text') {
        var txt = t.value.trim();
        if (txt) lines.push(repeat(unit, depth) + txt);
        continue;
      }
      if (t.type === 'open') {
        var a = toks[i + 1], b = toks[i + 2];
        // <a></a>
        if (a && a.type === 'close') {
          lines.push(repeat(unit, depth) + t.value + a.value);
          i += 1;
          continue;
        }
        // 仅含单段短文本的元素保持单行
        if (a && b && (a.type === 'text' || a.type === 'cdata') && b.type === 'close') {
          var inner = a.type === 'text' ? a.value.trim() : a.value;
          if (inner.indexOf('\n') < 0 && inner.length <= 120) {
            lines.push(repeat(unit, depth) + t.value + inner + b.value);
            i += 2;
            continue;
          }
        }
        lines.push(repeat(unit, depth) + t.value);
        depth++;
        continue;
      }
      if (t.type === 'close') {
        depth = Math.max(0, depth - 1);
        lines.push(repeat(unit, depth) + t.value);
        continue;
      }
      lines.push(repeat(unit, depth) + t.value);
    }
    return lines.join('\n');
  };

  lib.xmlMinify = function (src, opts) {
    opts = opts || {};
    var toks = lib.xmlTokenize(src);
    var out = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'text') {
        out += t.value.trim();
        continue;
      }
      if (t.type === 'comment' && opts.removeComments) continue;
      out += t.value;
    }
    return out;
  };

  // =====================================================================
  // CSS
  // =====================================================================

  // 分词：string / comment / url / brace-open / brace-close / semi / text
  lib.cssTokenize = function (src) {
    var s = String(src);
    var n = s.length, i = 0;
    var tokens = [];
    var text = '';

    function flush() {
      if (text) tokens.push({ type: 'text', value: text });
      text = '';
    }
    function readString(start) {
      var q = s.charAt(start), j = start + 1;
      while (j < n) {
        var c = s.charAt(j);
        if (c === '\\') { j += 2; continue; }
        if (c === q) return j + 1;
        if (c === '\n') break;
        j++;
      }
      throw new Error('字符串未闭合：从第 ' + (start + 1) + ' 个字符开始');
    }

    while (i < n) {
      var c = s.charAt(i);
      if (c === '/' && s.charAt(i + 1) === '*') {
        var e = s.indexOf('*/', i + 2);
        if (e < 0) throw new Error('注释未闭合：从第 ' + (i + 1) + ' 个字符开始');
        flush();
        tokens.push({ type: 'comment', value: s.slice(i, e + 2) });
        i = e + 2;
      } else if (c === '/' && s.charAt(i + 1) === '/' && !/\S$/.test(text)) {
        // AI Accept 2026-10-17 main v1
        // SCSS / LESS 行注释：仅当 // 位于行首、空白或 { ; } 之后时识别，
        // url(//cdn...) 与字符串内的 // 已在其他分支处理，不会走到这里。
        // trailing 表示注释与前面的代码同处一行（需留在行尾，而不是另起一行）。
        var le = s.indexOf('\n', i);
        if (le < 0) le = n;
        var back = i - 1;
        while (back >= 0 && (s.charAt(back) === ' ' || s.charAt(back) === '\t')) back--;
        var trailing = back >= 0 && s.charAt(back) !== '\n' && s.charAt(back) !== '\r';
        flush();
        tokens.push({ type: 'comment', value: s.slice(i, le).replace(/\s+$/, ''), line: true, trailing: trailing });
        i = le;
      } else if (c === '"' || c === '\'') {
        var j = readString(i);
        flush();
        tokens.push({ type: 'string', value: s.slice(i, j) });
        i = j;
      } else if (/url\($/i.test(text + c) && (text.length < 3 || !/[\w-]$/.test(text.slice(0, -3)))) {
        // url( 原样保留到匹配的 )
        text = text.slice(0, -3);
        flush();
        var k = i + 1, q = '';
        while (k < n) {
          var ch = s.charAt(k);
          if (q) { if (ch === '\\') { k += 2; continue; } if (ch === q) q = ''; }
          else if (ch === '"' || ch === '\'') q = ch;
          else if (ch === ')') break;
          k++;
        }
        if (k >= n) throw new Error('url( 未闭合');
        tokens.push({ type: 'url', value: s.slice(i - 3, k + 1).replace(/^url\(\s*/i, 'url(').replace(/\s*\)$/, ')') });
        i = k + 1;
      } else if (c === '{') {
        flush(); tokens.push({ type: '{', value: '{' }); i++;
      } else if (c === '}') {
        flush(); tokens.push({ type: '}', value: '}' }); i++;
      } else if (c === ';') {
        flush(); tokens.push({ type: ';', value: ';' }); i++;
      } else {
        text += c;
        i++;
      }
    }
    flush();
    return tokens;
  };

  // 规整一段语句（parts 为 text / 原样片段）
  function cssJoin(parts, isDecl) {
    var out = '';
    var colonDone = !isDecl;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.type !== 'text') {
        out += p.value;
        continue;
      }
      var v = p.value.replace(/\s+/g, ' ');
      v = v.replace(/\s*,\s*/g, ', ').replace(/\s*!\s*important/gi, ' !important');
      if (!colonDone) {
        var ci = v.indexOf(':');
        if (ci >= 0) {
          v = v.slice(0, ci).replace(/\s+$/, '') + ': ' + v.slice(ci + 1).replace(/^\s+/, '');
          colonDone = true;
        }
      }
      out += v;
    }
    return out.replace(/^\s+|\s+$/g, '').replace(/,\s*$/, ',');
  }

  lib.cssFormat = function (src, opts) {
    opts = opts || {};
    var unit = indentUnit(opts.indent == null ? '2' : String(opts.indent));
    var toks = lib.cssTokenize(src);
    var lines = [];
    var depth = 0;
    var parts = [];

    function hasContent() {
      for (var i = 0; i < parts.length; i++) if (parts[i].type !== 'text' || /\S/.test(parts[i].value)) return true;
      return false;
    }
    function isAtRule() {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type !== 'text') return false;
        var v = parts[i].value.replace(/^\s+/, '');
        if (v) return v.charAt(0) === '@';
      }
      return false;
    }
    function pushLine(s) {
      lines.push(repeat(unit, depth) + s);
    }
    function flushDecl(addSemi) {
      if (!hasContent()) { parts = []; return; }
      var at = isAtRule();
      pushLine(cssJoin(parts, depth > 0 && !at) + (addSemi ? ';' : ''));
      parts = [];
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'comment') {
        // AI Accept 2026-10-17 main v1
        // // 行注释必须独占到行尾：行尾注释接在上一行后面；
        // 若前面有未结束的语句，把语句与注释一起输出，避免把下一条声明吞进注释
        if (t.line) {
          if (hasContent()) { pushLine(cssJoin(parts, depth > 0 && !isAtRule()) + ' ' + t.value); parts = []; }
          else {
            // 顶层 } 之后会补一个空行，行尾注释应接回 } 所在行
            var li = lines.length - 1;
            if (li > 0 && lines[li] === '') li--;
            if (t.trailing && li >= 0 && /\S/.test(lines[li])) lines[li] += ' ' + t.value;
            else { parts = []; pushLine(t.value); }
          }
          continue;
        }
        if (!hasContent()) { parts = []; pushLine(t.value); }
        else parts.push(t);
        continue;
      }
      if (t.type === '{') {
        pushLine(cssJoin(parts, false) + ' {');
        parts = [];
        depth++;
        continue;
      }
      if (t.type === ';') {
        flushDecl(true);
        continue;
      }
      if (t.type === '}') {
        flushDecl(true);
        depth = Math.max(0, depth - 1);
        pushLine('}');
        if (depth === 0) lines.push('');
        continue;
      }
      parts.push(t);
    }
    flushDecl(false);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  };

  lib.cssMinify = function (src, opts) {
    opts = opts || {};
    var toks = lib.cssTokenize(src);
    var raws = [];
    var buf = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'comment') {
        // /*! ... */ 视为版权注释，可选保留
        // // 行注释在单行输出中无法保留，一律去掉
        if (opts.keepImportant && !t.line && t.value.charAt(2) === '!') {
          raws.push(t.value);
          buf += '\ue000' + (raws.length - 1) + '\ue001';
        } else {
          buf += ' ';
        }
        continue;
      }
      if (t.type === 'string' || t.type === 'url') {
        raws.push(t.value);
        buf += '\ue000' + (raws.length - 1) + '\ue001';
        continue;
      }
      buf += t.value;
    }
    buf = buf.replace(/\s+/g, ' ')
      .replace(/\s*([{};,>~])\s*/g, '$1')
      .replace(/:\s+/g, ':')
      // AI Accept 2026-10-17 main v1
      // 去掉声明中属性名与冒号之间的空白（color : red → color:red）；
      // 仅当冒号后直到 ; 或 } 都没有 {，即确为声明而非选择器（a :hover{…} 的空格有语义）
      .replace(/([{;][-\w]+)\s+:(?=[^{};]*[;}])/g, '$1:')
      .replace(/\s*!\s*important/gi, '!important')
      .replace(/;+}/g, '}')
      .replace(/;;+/g, ';')
      .replace(/^\s+|\s+$/g, '');
    return buf.replace(/\ue000(\d+)\ue001/g, function (_, k) { return raws[+k]; });
  };

  // =====================================================================
  // 界面
  // =====================================================================

  function ioPanel(ui, placeholder) {
    var input = ui.textarea({ rows: 16, placeholder: placeholder });
    var output = ui.output({ rows: 16 });
    var status = ui.status();
    return {
      input: input,
      output: output,
      status: status,
      grid: ui.grid([ui.field('输入', input), ui.field('结果', output)])
    };
  }

  function indentSelect(ui) {
    return ui.select([{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }, { value: 'tab', label: 'Tab' }], '2');
  }

  function runner(p, fn, okMsg) {
    return function () {
      if (!p.input.value.trim()) {
        p.output.value = '';
        p.status.error('请先输入内容');
        return;
      }
      try {
        p.output.value = fn(p.input.value);
        p.status.ok(okMsg + '，共 ' + p.output.value.length + ' 个字符');
      } catch (e) {
        p.output.value = '';
        p.status.error(errText(e));
      }
    };
  }

  var SQL_DEMO = "-- 近 30 天活跃用户订单统计\nselect u.id, u.name, count(o.id) as order_count, sum(o.amount) total from users u left join orders o on o.user_id = u.id and o.status = 'paid' where u.created_at between '2026-01-01' and '2026-06-30' and u.id in (select user_id from logins where login_at > now() - interval '30 day') group by u.id, u.name having count(o.id) > 0 order by total desc limit 20;";

  Tools.register({
    id: 'sql-format',
    cat: 'format',
    name: 'SQL 格式化',
    desc: '按子句换行缩进美化 SQL，子查询分层缩进；也可压缩为单行，字符串与注释内容不受影响。',
    keywords: 'sql format beautify minify mysql sqlserver oracle 美化 压缩',
    render: function (root, ui) {
      var p = ioPanel(ui, '在此粘贴 SQL…');
      var indent = indentSelect(ui);
      var upper = ui.checkbox('关键字大写', true);
      var keep = ui.checkbox('压缩时保留注释', false);
      var fmt = runner(p, function (v) { return lib.sqlFormat(v, { indent: indent.value, uppercase: upper.input.checked }); }, '已格式化');
      var min = runner(p, function (v) { return lib.sqlMinify(v, { keepComments: keep.input.checked }); }, '已压缩');
      root.appendChild(ui.inline([ui.field('缩进', indent), upper.root, keep.root]));
      root.appendChild(p.grid);
      root.appendChild(ui.actions([
        ui.button('格式化', fmt, true),
        ui.button('压缩', min),
        ui.copyButton(p.output, p.status),
        ui.button('填入示例', function () { p.input.value = SQL_DEMO; fmt(); }),
        ui.button('清空', function () { p.input.value = ''; p.output.value = ''; p.status.clear(); p.input.focus(); })
      ]));
      root.appendChild(p.status);
    }
  });

  var XML_DEMO = '<?xml version="1.0" encoding="UTF-8"?><!-- 订单示例 --><order id="1001" note="a > b"><customer><name>张三</name><phone/></customer><items><item sku="A-01" qty="2">键盘</item><item sku="B-07" qty="1">鼠标</item></items><remark><![CDATA[请在 <工作日> 送达 & 电话联系]]></remark></order>';

  function xmlCheck(text) {
    if (typeof DOMParser === 'undefined') return '';
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var err = doc.getElementsByTagName('parsererror')[0];
    if (!err) return '';
    // Chrome 的 parsererror 内含 h3 标题等样板文字，取主体一行
    var div = err.getElementsByTagName('div')[0];
    var msg = (div ? div.textContent : err.textContent) || '';
    return msg.replace(/\s+/g, ' ').trim();
  }

  Tools.register({
    id: 'xml-format',
    cat: 'format',
    name: 'XML 格式化',
    desc: '美化或压缩 XML，保留注释、CDATA 与处理指令，并校验文档是否良构。',
    keywords: 'xml format beautify minify 美化 压缩 校验',
    render: function (root, ui) {
      var p = ioPanel(ui, '在此粘贴 XML…');
      var indent = indentSelect(ui);
      var rmc = ui.checkbox('压缩时去除注释', false);
      function wrap(fn, okMsg) {
        return function () {
          runner(p, fn, okMsg)();
          if (!p.output.value) return;
          var bad = xmlCheck(p.input.value);
          if (bad) p.status.error(okMsg + '，但文档不是良构 XML：' + bad);
        };
      }
      var fmt = wrap(function (v) { return lib.xmlFormat(v, { indent: indent.value }); }, '已格式化');
      var min = wrap(function (v) { return lib.xmlMinify(v, { removeComments: rmc.input.checked }); }, '已压缩');
      root.appendChild(ui.inline([ui.field('缩进', indent), rmc.root]));
      root.appendChild(p.grid);
      root.appendChild(ui.actions([
        ui.button('格式化', fmt, true),
        ui.button('压缩', min),
        ui.copyButton(p.output, p.status),
        ui.button('填入示例', function () { p.input.value = XML_DEMO; fmt(); }),
        ui.button('清空', function () { p.input.value = ''; p.output.value = ''; p.status.clear(); p.input.focus(); })
      ]));
      root.appendChild(p.status);
    }
  });

  var CSS_DEMO = '/* 按钮 */.btn,.btn-primary{color:#fff;background:url("img/bg.png") no-repeat;font-family:"Helvetica Neue",Arial}.nav a:hover>span{content:"a;b{c}";margin:0 auto!important}@media (max-width:640px){.btn{padding:8px 12px;width:calc(100% - 16px)}}';

  Tools.register({
    id: 'css-format',
    cat: 'format',
    name: 'CSS 格式化',
    desc: '美化或压缩 CSS，正确处理字符串、注释、url() 与 @media 嵌套。',
    keywords: 'css format beautify minify 美化 压缩 样式',
    render: function (root, ui) {
      var p = ioPanel(ui, '在此粘贴 CSS…');
      var indent = indentSelect(ui);
      var keep = ui.checkbox('压缩时保留 /*! */ 版权注释', true);
      var fmt = runner(p, function (v) { return lib.cssFormat(v, { indent: indent.value }); }, '已格式化');
      var min = runner(p, function (v) { return lib.cssMinify(v, { keepImportant: keep.input.checked }); }, '已压缩');
      root.appendChild(ui.inline([ui.field('缩进', indent), keep.root]));
      root.appendChild(p.grid);
      root.appendChild(ui.actions([
        ui.button('格式化', fmt, true),
        ui.button('压缩', min),
        ui.copyButton(p.output, p.status),
        ui.button('填入示例', function () { p.input.value = CSS_DEMO; fmt(); }),
        ui.button('清空', function () { p.input.value = ''; p.output.value = ''; p.status.clear(); p.input.focus(); })
      ]));
      root.appendChild(p.status);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
