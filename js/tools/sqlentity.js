// AI Accept 2026-10-17 main v1
// SQL 建表语句 → C# 实体：解析 CREATE TABLE（SQL Server 为主，兼容 MySQL），
// 列注释取自 MySQL COMMENT、SQL Server sp_addextendedproperty(MS_Description) 或列定义同行的 -- / /* */ 注释。
// 分词复用 format.js 的 Tools.lib.sqlTokenize（字符串、各类引号标识符、嵌套注释均已正确处理）。
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;

  // ============================================================
  // 词法辅助
  // ============================================================
  function upper(tok) {
    return tok && tok.type === 'word' ? tok.value.toUpperCase() : '';
  }

  // 去掉 [x] "x" `x` 的引号（成对闭合符视为转义）
  function unquote(tok) {
    var v = tok.value;
    if (tok.type !== 'ident') return v;
    var open = v.charAt(0), close = open === '[' ? ']' : open;
    return v.slice(1, -1).split(close + close).join(close);
  }

  // 字符串字面量取值：去 N / E 等前缀与引号，'' → '，MySQL 的 \' → '
  function strVal(tok) {
    var v = tok.value.replace(/^[A-Za-z]/, '');
    return v.slice(1, -1).replace(/''/g, '\'').replace(/\\(['"\\])/g, '$1');
  }

  function commentText(tok) {
    var v = tok.value;
    if (tok.type === 'block-comment') v = v.slice(2, -2);
    else v = v.replace(/^(--|#)/, '');
    return v.replace(/^\s*\*?\s*/, '').replace(/\s+$/, '');
  }

  // 有效记号（去掉空白与注释），保留在原始记号数组中的下标，用于回查同行注释
  function significant(tokens) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === 'ws' || t.type === 'line-comment' || t.type === 'block-comment') continue;
      out.push({ type: t.type, value: t.value, raw: i });
    }
    return out;
  }

  // 从下标 i 的 ( 开始，返回匹配 ) 的下标
  function matchParen(sig, i) {
    var depth = 0;
    for (var j = i; j < sig.length; j++) {
      if (sig[j].type !== 'punct') continue;
      if (sig[j].value === '(') depth++;
      else if (sig[j].value === ')') { depth--; if (depth === 0) return j; }
    }
    return -1;
  }

  var STATEMENT_START = { GO: 1, CREATE: 1, EXEC: 1, EXECUTE: 1, ALTER: 1, INSERT: 1, DROP: 1, USE: 1, SET: 1, DECLARE: 1, IF: 1, BEGIN: 1, PRINT: 1 };

  // ============================================================
  // 解析
  // ============================================================
  function parseItem(sig, a, b, tokens) {
    var first = sig[a];
    var kw = upper(first);
    // 表级约束 / 索引
    if (kw === 'CONSTRAINT' || kw === 'PRIMARY' || kw === 'KEY' || kw === 'INDEX' || kw === 'UNIQUE' ||
      kw === 'FOREIGN' || kw === 'CHECK' || kw === 'FULLTEXT' || kw === 'SPATIAL' || kw === 'PERIOD') {
      var pk = [];
      for (var k = a; k < b; k++) {
        if (upper(sig[k]) === 'PRIMARY' && upper(sig[k + 1]) === 'KEY') {
          var p = k + 2;
          while (p < b && !(sig[p].type === 'punct' && sig[p].value === '(')) p++;
          var end = p < b ? matchParen(sig, p) : -1;
          for (var q = p + 1; end > 0 && q < end; q++) {
            if ((sig[q].type === 'ident' || sig[q].type === 'word') && !/^(ASC|DESC)$/i.test(sig[q].value)) {
              // 跳过 MySQL 的前缀长度 col(10)
              pk.push(unquote(sig[q]));
              if (sig[q + 1] && sig[q + 1].value === '(') q = matchParen(sig, q + 1);
            }
          }
          break;
        }
      }
      return { constraint: true, pk: pk };
    }

    var col = {
      name: unquote(first),
      sqlType: '', length: null, scale: null, args: '',
      notNull: false, explicitNull: false, identity: false, pk: false,
      hasDefault: false, comment: null, inlineComment: null, unsigned: false
    };
    var i = a + 1;
    // 类型：可能被 [] 包裹（SSMS 生成脚本），可能是多词类型
    if (i < b && (sig[i].type === 'word' || sig[i].type === 'ident')) {
      var tname = unquote(sig[i]);
      i++;
      // 跨架构类型名 [sys].[nvarchar]
      while (i + 1 < b && sig[i].value === '.' && (sig[i + 1].type === 'word' || sig[i + 1].type === 'ident')) { tname = unquote(sig[i + 1]); i += 2; }
      var u = tname.toUpperCase();
      if ((u === 'DOUBLE' && upper(sig[i]) === 'PRECISION') || (u === 'CHARACTER' && upper(sig[i]) === 'VARYING') ||
        (u === 'NATIONAL' && /^(CHAR|CHARACTER|VARCHAR)$/.test(upper(sig[i])))) {
        tname += ' ' + sig[i].value; i++;
      }
      col.sqlType = tname.toLowerCase();
      if (i < b && sig[i].type === 'punct' && sig[i].value === '(') {
        var e = matchParen(sig, i);
        var parts = [];
        for (var z = i + 1; z < e; z++) parts.push(sig[z].value);
        col.args = parts.join('').replace(/\s+/g, '');
        var nums = col.args.split(',');
        if (/^\d+$/.test(nums[0])) col.length = +nums[0];
        if (nums[1] && /^\d+$/.test(nums[1])) col.scale = +nums[1];
        if (/^max$/i.test(nums[0])) col.length = 'max';
        i = e + 1;
      }
    }
    // 修饰与约束
    for (; i < b; i++) {
      var t = sig[i], w = upper(t);
      if (t.type === 'punct' && t.value === '(') { i = matchParen(sig, i); continue; }
      if (w === 'UNSIGNED') col.unsigned = true;
      else if (w === 'NOT' && upper(sig[i + 1]) === 'NULL') { col.notNull = true; i++; }
      else if (w === 'NULL') col.explicitNull = true;
      else if (w === 'IDENTITY' || w === 'AUTO_INCREMENT' || w === 'AUTOINCREMENT') col.identity = true;
      else if (w === 'PRIMARY' && upper(sig[i + 1]) === 'KEY') { col.pk = true; i++; }
      else if (w === 'CONSTRAINT') i++; // 列级约束名
      else if (w === 'COLLATE' || w === 'CHARACTER' || w === 'CHARSET') {
        if (w === 'CHARACTER' && upper(sig[i + 1]) === 'SET') i++;
        i++;
      } else if (w === 'ON' && upper(sig[i + 1]) === 'UPDATE') {
        i += 2;
        if (sig[i + 1] && sig[i + 1].value === '(') i = matchParen(sig, i + 1);
      } else if (w === 'DEFAULT') {
        col.hasDefault = true;
        // 跳过默认值表达式：括号整体 / 负号 + 数字 / 函数调用 / 单个记号
        var n = i + 1;
        if (n < b && sig[n].type === 'punct' && sig[n].value === '(') i = matchParen(sig, n);
        else {
          if (n < b && sig[n].type === 'op' && (sig[n].value === '-' || sig[n].value === '+')) n++;
          i = n;
          if (sig[i + 1] && sig[i + 1].type === 'punct' && sig[i + 1].value === '(') i = matchParen(sig, i + 1);
        }
      } else if (w === 'COMMENT') {
        var c = i + 1;
        if (sig[c] && sig[c].type === 'op' && sig[c].value === '=') c++;
        if (sig[c] && sig[c].type === 'string') { col.comment = strVal(sig[c]); i = c; }
      } else if (w === 'REFERENCES') {
        i++;
        while (i + 1 < b && sig[i + 1].value === '.') i += 2;
        if (sig[i + 1] && sig[i + 1].value === '(') i = matchParen(sig, i + 1);
      }
    }

    // 列定义同行的注释：从该列最后一个有效记号之后找，遇到换行即止（只跨越分隔逗号）
    var lastRaw = sig[b - 1].raw;
    for (var r = lastRaw + 1; r < tokens.length; r++) {
      var tk = tokens[r];
      if (tk.type === 'ws') { if (/\n/.test(tk.value)) break; continue; }
      if (tk.type === 'punct' && tk.value === ',') continue;
      if (tk.type === 'line-comment' || tk.type === 'block-comment') { col.inlineComment = commentText(tk); }
      break;
    }
    // 列定义内部的块注释（如 Name /* 名称 */ varchar(50)）
    if (col.inlineComment == null) {
      for (var x = sig[a].raw; x <= lastRaw; x++) {
        if (tokens[x].type === 'block-comment' || tokens[x].type === 'line-comment') { col.inlineComment = commentText(tokens[x]); break; }
      }
    }
    return col;
  }

  function readQualified(sig, i) {
    var parts = [];
    if (i >= sig.length || !(sig[i].type === 'word' || sig[i].type === 'ident')) return null;
    parts.push(unquote(sig[i]));
    i++;
    while (i + 1 < sig.length && sig[i].type === 'punct' && sig[i].value === '.' && (sig[i + 1].type === 'word' || sig[i + 1].type === 'ident')) {
      parts.push(unquote(sig[i + 1]));
      i += 2;
    }
    return { parts: parts, next: i };
  }

  // sp_addextendedproperty 参数：支持位置参数与 @name = value 形式
  var EP_ORDER = ['@name', '@value', '@level0type', '@level0name', '@level1type', '@level1name', '@level2type', '@level2name'];

  function parseExtendedProperty(sig, i) {
    var args = {}, pos = 0;
    for (; i < sig.length; i++) {
      var t = sig[i];
      if (t.type === 'punct' && t.value === ';') break;
      if (STATEMENT_START[upper(t)]) break;
      if (t.type === 'punct' && t.value === ',') continue;
      var key = null;
      if (t.type === 'word' && t.value.charAt(0) === '@' && sig[i + 1] && sig[i + 1].type === 'op' && sig[i + 1].value === '=') {
        key = t.value.toLowerCase();
        i += 2;
        t = sig[i];
        if (!t) break;
      } else {
        key = EP_ORDER[pos];
      }
      pos++;
      var val;
      if (t.type === 'string') val = strVal(t);
      else if (upper(t) === 'NULL') val = null;
      else val = t.value;
      if (key) args[key] = val;
    }
    return { args: args, next: i };
  }

  lib.sqlParseCreateTable = function (sql) {
    var tokens = lib.sqlTokenize(String(sql == null ? '' : sql));
    var sig = significant(tokens);
    var tables = [], props = [];
    var mysql = /`|\bENGINE\s*=|\bAUTO_INCREMENT\b/i.test(String(sql));

    for (var i = 0; i < sig.length; i++) {
      var w = upper(sig[i]);
      if (w === 'CREATE') {
        var j = i + 1;
        while (j < sig.length && j < i + 4 && upper(sig[j]) !== 'TABLE') j++;
        if (upper(sig[j]) !== 'TABLE') continue;
        j++;
        if (upper(sig[j]) === 'IF' && upper(sig[j + 1]) === 'NOT' && upper(sig[j + 2]) === 'EXISTS') j += 3;
        var q = readQualified(sig, j);
        if (!q) continue;
        j = q.next;
        if (!(sig[j] && sig[j].type === 'punct' && sig[j].value === '(')) continue;
        var close = matchParen(sig, j);
        if (close < 0) throw new Error('表 ' + q.parts.join('.') + ' 的括号未闭合');
        // 按顶层逗号拆分列与约束
        var items = [], start = j + 1, depth = 0;
        for (var k = j + 1; k <= close; k++) {
          var t = sig[k];
          if (t.type === 'punct' && t.value === '(') depth++;
          else if (t.type === 'punct' && t.value === ')' && k !== close) depth--;
          if ((k === close) || (depth === 0 && t.type === 'punct' && t.value === ',')) {
            if (k > start) items.push([start, k]);
            start = k + 1;
          }
        }
        var table = {
          name: q.parts[q.parts.length - 1],
          schema: q.parts.length > 1 ? q.parts[q.parts.length - 2] : null,
          columns: [], comment: null
        };
        var pkCols = [];
        for (var m = 0; m < items.length; m++) {
          var it = parseItem(sig, items[m][0], items[m][1], tokens);
          if (it.constraint) pkCols = pkCols.concat(it.pk);
          else table.columns.push(it);
        }
        for (var p = 0; p < pkCols.length; p++) {
          for (var c = 0; c < table.columns.length; c++) {
            if (table.columns[c].name.toLowerCase() === pkCols[p].toLowerCase()) table.columns[c].pk = true;
          }
        }
        // 表选项：MySQL COMMENT='…'；遇到下一条语句即止
        var o = close + 1;
        for (; o < sig.length; o++) {
          var ow = upper(sig[o]);
          if (sig[o].type === 'punct' && sig[o].value === ';') break;
          if (ow === 'SET' && upper(sig[o - 1]) === 'CHARACTER') continue; // DEFAULT CHARACTER SET utf8mb4
          if (STATEMENT_START[ow]) break;
          if (sig[o].type === 'punct' && sig[o].value === '(') { o = matchParen(sig, o); if (o < 0) break; continue; }
          if (ow === 'COMMENT') {
            var cc = o + 1;
            if (sig[cc] && sig[cc].type === 'op' && sig[cc].value === '=') cc++;
            if (sig[cc] && sig[cc].type === 'string') { table.comment = strVal(sig[cc]); o = cc; }
          }
        }
        tables.push(table);
        i = Math.max(i, o - 1);
      } else if (sig[i].type === 'word' && /(^|\.)sp_addextendedproperty$/i.test(sig[i].value)) {
        var ep = parseExtendedProperty(sig, i + 1);
        props.push(ep.args);
        i = ep.next - 1;
      } else if (sig[i].type === 'ident' && /^sp_addextendedproperty$/i.test(unquote(sig[i]))) {
        // [sp_addextendedproperty] 形式（极少见）
        var ep2 = parseExtendedProperty(sig, i + 1);
        props.push(ep2.args);
        i = ep2.next - 1;
      }
    }

    // 应用 MS_Description 扩展属性
    for (var x = 0; x < props.length; x++) {
      var a = props[x];
      if (!a['@name'] || String(a['@name']).toLowerCase() !== 'ms_description') continue;
      if (!a['@level1type'] || String(a['@level1type']).toUpperCase() !== 'TABLE') continue;
      var tn = String(a['@level1name'] || '').toLowerCase();
      for (var y = 0; y < tables.length; y++) {
        if (tables[y].name.toLowerCase() !== tn) continue;
        if (a['@level0name'] && tables[y].schema && String(a['@level0name']).toLowerCase() !== tables[y].schema.toLowerCase()) continue;
        if (a['@level2type'] && String(a['@level2type']).toUpperCase() === 'COLUMN') {
          var cn = String(a['@level2name'] || '').toLowerCase();
          for (var zz = 0; zz < tables[y].columns.length; zz++) {
            if (tables[y].columns[zz].name.toLowerCase() === cn) tables[y].columns[zz].comment = a['@value'];
          }
        } else if (!a['@level2type']) {
          tables[y].comment = a['@value'];
        }
      }
    }

    // 汇总：可空性、最终注释
    for (var ti = 0; ti < tables.length; ti++) {
      var cols = tables[ti].columns;
      for (var ci = 0; ci < cols.length; ci++) {
        var col = cols[ci];
        col.nullable = !(col.notNull || col.pk || col.identity);
        if (col.comment == null && col.inlineComment) col.comment = col.inlineComment;
        delete col.inlineComment;
        delete col.explicitNull;
      }
      tables[ti].dialect = mysql ? 'mysql' : 'sqlserver';
    }
    if (!tables.length) throw new Error('未找到 CREATE TABLE 语句，请粘贴完整的建表脚本（含列定义括号）');
    return tables;
  };

  // ============================================================
  // 类型映射与命名
  // ============================================================
  var VALUE_TYPES = { int: 1, long: 1, short: 1, byte: 1, sbyte: 1, ushort: 1, uint: 1, ulong: 1, bool: 1, decimal: 1, double: 1, float: 1, DateTime: 1, DateTimeOffset: 1, TimeSpan: 1, Guid: 1 };

  // 返回 C# 类型名；未知返回 null
  lib.sqlTypeToCSharp = function (col, dialect) {
    var t = col.sqlType;
    var mysql = dialect === 'mysql';
    switch (t) {
      case 'int': case 'integer': case 'mediumint': return 'int';
      case 'bigint': return 'long';
      case 'smallint': return 'short';
      case 'tinyint': return mysql && col.length === 1 ? 'bool' : 'byte';
      case 'bit': case 'bool': case 'boolean': return 'bool';
      case 'decimal': case 'numeric': case 'money': case 'smallmoney': case 'dec': return 'decimal';
      case 'float': return mysql ? 'float' : 'double';
      case 'double': case 'double precision': return 'double';
      case 'real': return 'float';
      case 'char': case 'varchar': case 'nchar': case 'nvarchar': case 'text': case 'ntext': case 'tinytext':
      case 'mediumtext': case 'longtext': case 'json': case 'xml': case 'enum': case 'set': case 'sysname':
      case 'character varying': case 'character': case 'national char': case 'national character': case 'national varchar':
        return 'string';
      case 'date': case 'datetime': case 'datetime2': case 'smalldatetime': return 'DateTime';
      case 'timestamp': return mysql ? 'DateTime' : 'byte[]';
      case 'rowversion': return 'byte[]';
      case 'datetimeoffset': return 'DateTimeOffset';
      case 'time': return 'TimeSpan';
      case 'year': return 'int';
      case 'uniqueidentifier': return 'Guid';
      case 'varbinary': case 'binary': case 'image': case 'blob': case 'tinyblob': case 'mediumblob': case 'longblob': return 'byte[]';
      case 'sql_variant': return 'object';
      default: return null;
    }
  };

  var CS_KEYWORDS = ('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double ' +
    'else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long ' +
    'namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof ' +
    'stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while').split(' ');
  var CSKW = {};
  for (var kk = 0; kk < CS_KEYWORDS.length; kk++) CSKW[CS_KEYWORDS[kk]] = true;

  function toPascal(name) {
    var words = String(name).split(/[^A-Za-z0-9\u0080-\uffff]+/);
    var out = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) w = w.charAt(0) + w.slice(1).toLowerCase();
      out += w.charAt(0).toUpperCase() + w.slice(1);
    }
    return out;
  }

  function safeIdent(name) {
    var s = String(name).replace(/[^A-Za-z0-9_\u0080-\uffff]/g, '_');
    if (!s) s = '_';
    if (/^[0-9]/.test(s)) s = '_' + s;
    if (CSKW[s]) s = '@' + s;
    return s;
  }

  function stripPrefix(name, prefixes) {
    for (var i = 0; i < prefixes.length; i++) {
      var p = prefixes[i];
      if (p && name.length > p.length && name.slice(0, p.length).toLowerCase() === p.toLowerCase()) return name.slice(p.length);
    }
    return name;
  }

  function xmlEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function summary(lines, indent, text) {
    var rows = String(text).split(/\r\n|\r|\n/);
    lines.push(indent + '/// <summary>');
    for (var i = 0; i < rows.length; i++) lines.push(indent + '/// ' + xmlEsc(rows[i].replace(/\s+$/, '')));
    lines.push(indent + '/// </summary>');
  }

  // opts：
  //   prefixes     去除的类名前缀（数组或逗号分隔字符串），缺省 T_,tb_,tbl_
  //   naming       'pascal'（缺省）| 'original'
  //   summary      生成 /// <summary>（缺省 true）
  //   tableAttr / columnAttr / keyAttr / identityAttr  缺省 true（Table / Column 仅在名称不同时输出）
  //   requiredAttr 缺省 false；lengthAttr 'none'（缺省）| 'StringLength' | 'MaxLength'
  //   nullableRef  启用可空引用类型（缺省 false）；namespace 命名空间（缺省无）
  // 返回 { code, tables, columns, commented }
  lib.sqlToCSharp = function (sql, opts) {
    opts = opts || {};
    var tables = lib.sqlParseCreateTable(sql);
    var prefixes = opts.prefixes == null ? ['T_', 'tb_', 'tbl_'] :
      (typeof opts.prefixes === 'string' ? opts.prefixes.split(/[,，\s]+/) : opts.prefixes);
    var naming = opts.naming === 'original' ? 'original' : 'pascal';
    var withSummary = opts.summary !== false;
    var tableAttr = opts.tableAttr !== false, columnAttr = opts.columnAttr !== false;
    var keyAttr = opts.keyAttr !== false, identityAttr = opts.identityAttr !== false;
    var requiredAttr = !!opts.requiredAttr;
    var lengthAttr = opts.lengthAttr === 'StringLength' || opts.lengthAttr === 'MaxLength' ? opts.lengthAttr : 'none';
    var nullableRef = !!opts.nullableRef;
    var ns = opts.namespace ? String(opts.namespace).trim() : '';

    var use = { system: false, annotations: false, schema: false };
    var body = [];
    var ind = ns ? '    ' : '';
    var columnCount = 0, commented = 0, usedClass = {};

    for (var t = 0; t < tables.length; t++) {
      var tb = tables[t];
      var base = stripPrefix(tb.name, prefixes);
      var cls = safeIdent(naming === 'pascal' ? (toPascal(base) || toPascal(tb.name) || 'Entity') : base);
      var cbase = cls, cn = 2;
      while (usedClass[cls]) cls = cbase + cn++;
      usedClass[cls] = true;

      if (body.length) body.push('');
      if (withSummary && tb.comment) summary(body, ind, tb.comment);
      if (tableAttr && cls !== tb.name) {
        use.schema = true;
        body.push(ind + '[Table(' + JSON.stringify(tb.name) + (tb.schema && tb.schema.toLowerCase() !== 'dbo' ? ', Schema = ' + JSON.stringify(tb.schema) : '') + ')]');
      }
      body.push(ind + 'public class ' + cls);
      body.push(ind + '{');
      var usedProp = {};
      for (var c = 0; c < tb.columns.length; c++) {
        var col = tb.columns[c];
        columnCount++;
        if (col.comment) commented++;
        var prop = safeIdent(naming === 'pascal' ? (toPascal(col.name) || col.name) : col.name);
        if (prop === cls) prop += 'Value';
        var pbase = prop, pn = 2;
        while (usedProp[prop]) prop = pbase + pn++;
        usedProp[prop] = true;

        var cs = lib.sqlTypeToCSharp(col, tb.dialect);
        var unknown = cs == null;
        if (unknown) cs = 'object';
        var isValue = !!VALUE_TYPES[cs];
        var type = cs;
        if (col.nullable && (isValue || (nullableRef && !isValue))) type += '?';
        if (/^(DateTime|DateTimeOffset|TimeSpan|Guid)$/.test(cs)) use.system = true;

        var pi = ind + '    ';
        if (c > 0) body.push('');
        if (withSummary && col.comment) summary(body, pi, col.comment);
        if (unknown) body.push(pi + '// TODO: 未识别的 SQL 类型 ' + col.sqlType + (col.args ? '(' + col.args + ')' : ''));
        if (keyAttr && col.pk) { use.annotations = true; body.push(pi + '[Key]'); }
        if (identityAttr && col.identity) { use.schema = true; body.push(pi + '[DatabaseGenerated(DatabaseGeneratedOption.Identity)]'); }
        if (requiredAttr && !col.nullable && !isValue && !col.pk) { use.annotations = true; body.push(pi + '[Required]'); }
        if (lengthAttr !== 'none' && typeof col.length === 'number' && (cs === 'string' || (cs === 'byte[]' && lengthAttr === 'MaxLength'))) {
          use.annotations = true;
          body.push(pi + '[' + lengthAttr + '(' + col.length + ')]');
        }
        if (columnAttr && prop.replace(/^@/, '') !== col.name) { use.schema = true; body.push(pi + '[Column(' + JSON.stringify(col.name) + ')]'); }
        var init = '';
        if (!col.nullable || !nullableRef) {
          if (cs === 'string' && !col.nullable) init = ' = string.Empty;';
          else if (cs === 'byte[]' && !col.nullable && nullableRef) init = ' = Array.Empty<byte>();';
        }
        if (init === ' = Array.Empty<byte>();') use.system = true;
        body.push(pi + 'public ' + type + ' ' + prop + ' { get; set; }' + init);
      }
      body.push(ind + '}');
    }

    var head = [];
    if (use.system) head.push('using System;');
    if (use.annotations) head.push('using System.ComponentModel.DataAnnotations;');
    if (use.schema) head.push('using System.ComponentModel.DataAnnotations.Schema;');
    var out = head.slice();
    if (head.length) out.push('');
    if (ns) {
      out.push('namespace ' + ns);
      out.push('{');
      out = out.concat(body);
      out.push('}');
    } else {
      out = out.concat(body);
    }
    return { code: out.join('\n'), tables: tables.length, columns: columnCount, commented: commented };
  };

  // ============================================================
  // 界面
  // ============================================================
  var DEMO_SQLSERVER = [
    'CREATE TABLE [dbo].[T_EPrescription] (',
    '    [Id] [uniqueidentifier] NOT NULL,',
    '    [PrescriptionNo] [nvarchar](32) NOT NULL,',
    '    [PatientName] [nvarchar](50) NULL,',
    '    [TotalAmount] [decimal](18, 2) NOT NULL CONSTRAINT [DF_EP_Amount] DEFAULT ((0)),',
    '    [ExtAuditStatus] [int] NOT NULL, -- 外部审核状态：0 待审 1 通过 2 驳回',
    '    [ExtAuditTime] [datetime2](7) NULL,',
    '    [IsDeleted] [bit] NOT NULL DEFAULT (0),',
    '    [CreatedAt] [datetime] NOT NULL DEFAULT (getdate()),',
    '    CONSTRAINT [PK_T_EPrescription] PRIMARY KEY CLUSTERED ([Id] ASC)',
    ') ON [PRIMARY]',
    'GO',
    'EXEC sp_addextendedproperty N\'MS_Description\', N\'电子处方\', N\'SCHEMA\', N\'dbo\', N\'TABLE\', N\'T_EPrescription\'',
    'GO',
    'EXEC sp_addextendedproperty @name = N\'MS_Description\', @value = N\'处方编号\', @level0type = N\'SCHEMA\', @level0name = N\'dbo\', @level1type = N\'TABLE\', @level1name = N\'T_EPrescription\', @level2type = N\'COLUMN\', @level2name = N\'PrescriptionNo\'',
    'GO',
    'EXEC sp_addextendedproperty N\'MS_Description\', N\'患者姓名\', N\'SCHEMA\', N\'dbo\', N\'TABLE\', N\'T_EPrescription\', N\'COLUMN\', N\'PatientName\'',
    'GO'
  ].join('\n');

  var DEMO_MYSQL = [
    'CREATE TABLE `tb_user` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT \'主键\',',
    '  `user_name` varchar(50) NOT NULL COMMENT \'用户名\',',
    '  `nick_name` varchar(50) DEFAULT NULL COMMENT \'昵称\',',
    '  `is_enabled` tinyint(1) NOT NULL DEFAULT \'1\' COMMENT \'是否启用\',',
    '  `balance` decimal(10,2) NOT NULL DEFAULT \'0.00\' COMMENT \'余额\',',
    '  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT \'创建时间\',',
    '  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT \'更新时间\',',
    '  PRIMARY KEY (`id`),',
    '  UNIQUE KEY `uk_user_name` (`user_name`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=\'用户表\';'
  ].join('\n');

  Tools.register({
    id: 'sql-csharp',
    cat: 'dev',
    name: 'SQL 建表转 C# 实体',
    desc: '将 SQL Server / MySQL 的 CREATE TABLE 脚本生成 C# 实体类，类型自动映射，列注释（COMMENT、MS_Description、行尾注释）转为 XML 文档注释。',
    keywords: 'sql create table c# csharp entity 实体 model sqlserver mysql 建表 ef 注释 summary',
    render: function (root, ui) {
      var input = ui.textarea({ rows: 16, placeholder: '在此粘贴 CREATE TABLE 脚本…' });
      var output = ui.output({ rows: 16 });
      var status = ui.status();

      var prefixes = ui.input({ value: 'T_,tb_,tbl_', placeholder: 'T_,tb_,tbl_' });
      var naming = ui.select([{ value: 'pascal', label: '转为 PascalCase' }, { value: 'original', label: '保留原名' }], 'pascal');
      var length = ui.select([{ value: 'none', label: '不生成长度特性' }, { value: 'StringLength', label: '[StringLength]' }, { value: 'MaxLength', label: '[MaxLength]' }], 'none');
      var ns = ui.input({ placeholder: '可选，如 MyApp.Models' });
      var cSummary = ui.checkbox('生成 /// <summary> 注释', true);
      var cTable = ui.checkbox('[Table] / [Column]', true);
      var cKey = ui.checkbox('[Key] / 自增', true);
      var cRequired = ui.checkbox('[Required]', false);
      var cNullable = ui.checkbox('可空引用类型（string?）', false);

      function run() {
        if (!input.value.trim()) { output.value = ''; status.clear(); return; }
        try {
          var r = lib.sqlToCSharp(input.value, {
            prefixes: prefixes.value,
            naming: naming.value,
            summary: cSummary.input.checked,
            tableAttr: cTable.input.checked,
            columnAttr: cTable.input.checked,
            keyAttr: cKey.input.checked,
            identityAttr: cKey.input.checked,
            requiredAttr: cRequired.input.checked,
            lengthAttr: length.value,
            nullableRef: cNullable.input.checked,
            namespace: ns.value
          });
          output.value = r.code;
          status.ok('已生成 ' + r.tables + ' 个实体类，共 ' + r.columns + ' 列，其中 ' + r.commented + ' 列带注释');
        } catch (e) {
          output.value = '';
          status.error(e && e.message ? e.message : String(e));
        }
      }

      var auto = ui.debounce(run, 300);
      input.addEventListener('input', auto);
      prefixes.addEventListener('input', auto);
      ns.addEventListener('input', auto);
      [naming, length].forEach(function (s) { s.addEventListener('change', run); });
      [cSummary, cTable, cKey, cRequired, cNullable].forEach(function (c) { c.input.addEventListener('change', run); });

      root.appendChild(ui.inline([
        ui.field('去除类名前缀', prefixes),
        ui.field('命名', naming),
        ui.field('长度特性', length),
        ui.field('命名空间', ns)
      ]));
      root.appendChild(ui.inline([cSummary.root, cTable.root, cKey.root, cRequired.root, cNullable.root]));
      root.appendChild(ui.grid([ui.field('CREATE TABLE 脚本', input), ui.field('C# 实体', output)]));
      root.appendChild(ui.actions([
        ui.button('生成', run, true),
        ui.copyButton(output, status),
        ui.button('SQL Server 示例', function () { input.value = DEMO_SQLSERVER; run(); }),
        ui.button('MySQL 示例', function () { input.value = DEMO_MYSQL; run(); }),
        ui.button('清空', function () { input.value = ''; run(); input.focus(); })
      ]));
      root.appendChild(status);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
