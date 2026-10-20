// AI Accept 2026-10-16 main v1
// 开发辅助：Unix 时间戳 / 文本对比 / 正则测试 / 变量命名转换 / 带宽换算 / 数字大小写
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;

  function pad(n, w) {
    var s = String(Math.abs(n));
    while (s.length < (w || 2)) s = '0' + s;
    return (n < 0 ? '-' : '') + s;
  }

  // ============================================================
  // 1. 时间戳
  // ============================================================
  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var MAX_MS = 8.64e15; // ECMAScript Date 可表示范围

  // AI Accept 2026-10-17 main v1
  // 去掉从代码、日志、配置里复制来时夹带的注释：/* */ 任意位置；行注释标记须位于行首或空白之后
  // （避免误伤日期里的 / 与 -、URL 里的 //）。markers 为行注释标记列表，缺省 ['//']。
  lib.stripCodeComments = function (input, markers) {
    var s = String(input == null ? '' : input).replace(/\/\*[\s\S]*?\*\//g, ' ');
    markers = markers || ['//'];
    var alt = markers.map(function (m) { return m.replace(/[\/\-#]/g, '\\$&'); }).join('|');
    return s.replace(new RegExp('(^|[ \\t])(?:' + alt + ').*$', 'gm'), '$1');
  };

  // 粘贴的单个值：去注释、首尾引号、行尾 , ; 与空白
  function cleanValue(input) {
    return lib.stripCodeComments(input, ['//', '#', '--']).trim()
      .replace(/[,;]+$/, '').trim()
      .replace(/^(["'`])([\s\S]*)\1$/, '$2').trim();
  }
  lib.cleanValue = cleanValue;

  // 识别时间戳单位：返回 { ms, unit }，unit 为 's' | 'ms' | 'us' | 'ns'
  // 容忍行尾注释、引号与 Java / C# 的 L 后缀（1760578200000L）
  lib.tsDetect = function (input) {
    var s = cleanValue(input).replace(/^(-?\d+)[lL]$/, '$1');
    if (!s) throw new Error('请输入时间戳');
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('时间戳只能包含数字（可带负号与小数点）');
    var n = Number(s);
    var abs = Math.abs(n);
    var unit, ms;
    if (abs < 1e11) { unit = 's'; ms = n * 1000; }
    else if (abs < 1e14) { unit = 'ms'; ms = n; }
    else if (abs < 1e17) { unit = 'us'; ms = n / 1000; }
    else { unit = 'ns'; ms = n / 1e6; }
    ms = Math.round(ms);
    if (Math.abs(ms) > MAX_MS) throw new Error('时间戳超出可表示范围');
    return { ms: ms, unit: unit };
  };

  lib.tsUnitName = function (unit) {
    return { s: '秒（10 位）', ms: '毫秒（13 位）', us: '微秒（16 位）', ns: '纳秒（19 位）' }[unit] || unit;
  };

  lib.formatLocal = function (d, withMs) {
    var s = pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    return withMs ? s + '.' + pad(d.getMilliseconds(), 3) : s;
  };

  lib.formatUtc = function (d, withMs) {
    var s = pad(d.getUTCFullYear(), 4) + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
    return (withMs ? s + '.' + pad(d.getUTCMilliseconds(), 3) : s) + ' UTC';
  };

  lib.tzLabel = function (d) {
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    off = Math.abs(off);
    return 'UTC' + sign + pad(Math.floor(off / 60)) + ':' + pad(off % 60);
  };

  lib.tsInfo = function (ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) throw new Error('无效的时间');
    var withMs = ms % 1000 !== 0;
    return {
      seconds: Math.floor(ms / 1000),
      millis: ms,
      local: lib.formatLocal(d, withMs),
      utc: lib.formatUtc(d, withMs),
      iso: d.toISOString(),
      weekday: WEEKDAYS[d.getDay()],
      tz: lib.tzLabel(d)
    };
  };

  // 日期字符串 → 毫秒时间戳
  // 无时区：'YYYY-MM-DD[ HH:mm[:ss[.SSS]]]'（- / 分隔，空格或 T）按本地时区手动解析
  // 有时区：ISO 8601 带 Z 或 ±HH:mm
  lib.parseDateTime = function (input) {
    var s = cleanValue(input);
    if (!s) throw new Error('请输入日期时间');
    var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/.exec(s);
    if (m) {
      var y = +m[1], mo = +m[2], da = +m[3];
      var h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0, se = m[6] ? +m[6] : 0;
      var msPart = m[7] ? +(m[7] + '00').slice(0, 3) : 0;
      if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59 || se > 59) throw new Error('日期或时间超出范围');
      var d = new Date(2000, 0, 1, 0, 0, 0, 0);
      d.setFullYear(y, mo - 1, da);
      d.setHours(h, mi, se, msPart);
      if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) throw new Error('日期不存在（如 2 月 30 日）');
      if (d.getHours() !== h || d.getMinutes() !== mi) throw new Error('该本地时间不存在（可能处于夏令时切换）');
      return d.getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
      var t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
      if (isNaN(t)) throw new Error('无法解析的 ISO 8601 时间');
      return t;
    }
    throw new Error('无法识别的格式，请使用 YYYY-MM-DD HH:mm:ss 或 ISO 8601（如 2026-10-16T09:30:00+08:00）');
  };

  // ============================================================
  // 2. 文本对比（行级 LCS）
  // ============================================================
  var DIFF_LIMIT = 2.5e7;

  function splitLines(text) {
    if (text == null || text === '') return [];
    var lines = String(text).split(/\r\n|\r|\n/);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }
  lib.splitLines = splitLines;

  // 返回 { ops: [{ type: 'eq'|'add'|'del', text, oldNo, newNo }], added, removed }
  // opts: { ignoreWhitespace, ignoreCase }
  lib.diffLines = function (oldText, newText, opts) {
    opts = opts || {};
    var a = splitLines(oldText), b = splitLines(newText);
    function key(line) {
      var k = opts.ignoreWhitespace ? line.trim() : line;
      return opts.ignoreCase ? k.toLowerCase() : k;
    }
    // 行内容映射为整数 id，比较更快
    var ids = Object.create(null), next = 1;
    function idOf(line) {
      var k = key(line);
      if (!ids[k]) ids[k] = next++;
      return ids[k];
    }
    var ka = new Array(a.length), kb = new Array(b.length), i, j;
    for (i = 0; i < a.length; i++) ka[i] = idOf(a[i]);
    for (j = 0; j < b.length; j++) kb[j] = idOf(b[j]);

    // 剥离公共前后缀
    var pre = 0;
    while (pre < a.length && pre < b.length && ka[pre] === kb[pre]) pre++;
    var suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && ka[a.length - 1 - suf] === kb[b.length - 1 - suf]) suf++;

    var n = a.length - pre - suf, m = b.length - pre - suf;
    if (n * m > DIFF_LIMIT) {
      var err = new Error('差异部分过大（约 ' + n + ' × ' + m + ' 行），超出浏览器内对比上限，请缩小范围后重试');
      err.code = 'TOO_LARGE';
      throw err;
    }

    var ops = [];
    var added = 0, removed = 0;
    function push(type, ai, bj) {
      if (type === 'eq') ops.push({ type: 'eq', text: b[bj], oldNo: ai + 1, newNo: bj + 1 });
      else if (type === 'del') { ops.push({ type: 'del', text: a[ai], oldNo: ai + 1, newNo: null }); removed++; }
      else { ops.push({ type: 'add', text: b[bj], oldNo: null, newNo: bj + 1 }); added++; }
    }

    for (i = 0; i < pre; i++) push('eq', i, i);

    if (n > 0 && m > 0) {
      // 后缀 LCS：L[i][j] = a[i..] 与 b[j..] 的 LCS 长度，滚动两行；方向存 Uint8Array
      var dir = new Uint8Array(n * m);
      var below = new Uint32Array(m + 1), cur = new Uint32Array(m + 1), tmp;
      for (i = n - 1; i >= 0; i--) {
        cur[m] = 0;
        var ai = ka[pre + i];
        for (j = m - 1; j >= 0; j--) {
          if (ai === kb[pre + j]) { cur[j] = below[j + 1] + 1; dir[i * m + j] = 1; }
          else if (below[j] >= cur[j + 1]) { cur[j] = below[j]; dir[i * m + j] = 2; }
          else { cur[j] = cur[j + 1]; dir[i * m + j] = 3; }
        }
        tmp = below; below = cur; cur = tmp;
      }
      i = 0; j = 0;
      while (i < n && j < m) {
        var d = dir[i * m + j];
        if (d === 1) { push('eq', pre + i, pre + j); i++; j++; }
        else if (d === 2) { push('del', pre + i); i++; }
        else { push('add', null, pre + j); j++; }
      }
      for (; i < n; i++) push('del', pre + i);
      for (; j < m; j++) push('add', null, pre + j);
    } else {
      for (i = 0; i < n; i++) push('del', pre + i);
      for (j = 0; j < m; j++) push('add', null, pre + j);
    }

    for (i = 0; i < suf; i++) push('eq', a.length - suf + i, b.length - suf + i);
    return { ops: ops, added: added, removed: removed };
  };

  // 折叠远离差异的相同行：返回 ops 与 { type: 'skip', count } 的混合数组
  lib.diffHunks = function (ops, context) {
    var keep = new Uint8Array(ops.length), i, k;
    for (i = 0; i < ops.length; i++) {
      if (ops[i].type !== 'eq') {
        for (k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = 1;
      }
    }
    var out = [], skipped = 0;
    for (i = 0; i < ops.length; i++) {
      if (keep[i]) {
        if (skipped) { out.push({ type: 'skip', count: skipped }); skipped = 0; }
        out.push(ops[i]);
      } else skipped++;
    }
    if (skipped) out.push({ type: 'skip', count: skipped });
    return out;
  };

  // ============================================================
  // 3. 正则测试
  // ============================================================
  var MATCH_LIMIT = 1000;

  // 支持直接粘贴 /pattern/flags 字面量
  // AI Accept 2026-10-17 main v1
  // 也接受从代码复制来的形式：行尾带 ; 或 , 以及 // 行注释、/* */ 注释
  // 按 JS 词法定位结束的 /：跳过 \ 转义与 [...] 字符类，第一个未转义的 / 即结束
  lib.parseRegexLiteral = function (s) {
    s = String(s == null ? '' : s).trim();
    if (s.charAt(0) !== '/') return null;
    var i = 1, n = s.length, inClass = false;
    for (; i < n; i++) {
      var c = s.charAt(i);
      if (c === '\\') { i++; continue; }
      if (inClass) { if (c === ']') inClass = false; continue; }
      if (c === '[') inClass = true;
      else if (c === '/') break;
    }
    if (i >= n || i === 1) return null;
    var rest = /^([a-z]*)\s*[;,]?\s*(?:\/\/.*|\/\*[\s\S]*\*\/)?\s*$/.exec(s.slice(i + 1));
    return rest ? { source: s.slice(1, i), flags: rest[1] } : null;
  };

  lib.buildRegex = function (source, flags) {
    try {
      return new RegExp(source, flags);
    } catch (e) {
      throw new Error('正则语法错误：' + (e && e.message ? e.message : e));
    }
  };

  // 返回 { matches: [{ index, end, text, groups: [], named: {} | null }], truncated }
  lib.regexMatchAll = function (source, flags, text, limit) {
    limit = limit || MATCH_LIMIT;
    flags = flags || '';
    text = String(text == null ? '' : text);
    var re = lib.buildRegex(source, flags);
    var unicode = flags.indexOf('u') >= 0 || flags.indexOf('v') >= 0;
    var global = flags.indexOf('g') >= 0;
    var matches = [], truncated = false, m;

    function record(mm) {
      var groups = [];
      for (var g = 1; g < mm.length; g++) groups.push(mm[g]);
      var named = null;
      if (mm.groups) {
        named = {};
        for (var k in mm.groups) if (Object.prototype.hasOwnProperty.call(mm.groups, k)) named[k] = mm.groups[k];
      }
      matches.push({ index: mm.index, end: mm.index + mm[0].length, text: mm[0], groups: groups, named: named });
    }

    if (!global) {
      re.lastIndex = 0;
      m = re.exec(text);
      if (m) record(m);
      return { matches: matches, truncated: false };
    }

    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (matches.length >= limit) { truncated = true; break; }
      record(m);
      if (m[0] === '') {
        // 零宽匹配：手动推进，u 模式按码点推进，避免死循环与切开代理对
        var li = re.lastIndex;
        if (li >= text.length) break;
        var step = 1;
        if (unicode) {
          var c = text.charCodeAt(li);
          if (c >= 0xd800 && c <= 0xdbff && li + 1 < text.length) {
            var c2 = text.charCodeAt(li + 1);
            if (c2 >= 0xdc00 && c2 <= 0xdfff) step = 2;
          }
        }
        re.lastIndex = li + step;
      }
    }
    return { matches: matches, truncated: truncated };
  };

  lib.regexReplace = function (source, flags, text, replacement) {
    var re = lib.buildRegex(source, flags);
    return String(text == null ? '' : text).replace(re, replacement == null ? '' : replacement);
  };

  // ============================================================
  // 4. 变量命名转换
  // ============================================================
  lib.splitWords = function (input) {
    // AI Accept 2026-10-17 main v1
    // 从代码复制的名称常带注释（user_name // 用户名），注释不参与转换
    var s = lib.stripCodeComments(input).trim();
    if (!s) return [];
    s = s
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // XMLHttp → XML Http
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')      // getHTTP → get HTTP，Response2Code → Response2 Code
      .replace(/[\s_\-.\/\\:]+/g, ' ')
      .trim();
    if (!s) return [];
    var parts = s.split(' '), out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(parts[i].toLowerCase());
    return out;
  };

  function cap(w) {
    return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }

  lib.CASE_FORMATS = [
    { id: 'camel', label: 'camelCase' },
    { id: 'pascal', label: 'PascalCase' },
    { id: 'snake', label: 'snake_case' },
    { id: 'kebab', label: 'kebab-case' },
    { id: 'constant', label: 'CONSTANT_CASE' },
    { id: 'dot', label: 'dot.case' },
    { id: 'space', label: '空格分隔' },
    { id: 'title', label: 'Title Case' }
  ];

  lib.convertCase = function (input, format) {
    var w = lib.splitWords(input), i, out;
    switch (format) {
      case 'camel':
        out = w.slice(0, 1);
        for (i = 1; i < w.length; i++) out.push(cap(w[i]));
        return out.join('');
      case 'pascal': return w.map(cap).join('');
      case 'snake': return w.join('_');
      case 'kebab': return w.join('-');
      case 'constant': return w.join('_').toUpperCase();
      case 'dot': return w.join('.');
      case 'space': return w.join(' ');
      case 'title': return w.map(cap).join(' ');
      default: throw new Error('未知格式 ' + format);
    }
  };

  lib.convertCaseAll = function (input) {
    var res = {};
    for (var i = 0; i < lib.CASE_FORMATS.length; i++) res[lib.CASE_FORMATS[i].id] = lib.convertCase(input, lib.CASE_FORMATS[i].id);
    return res;
  };

  // ============================================================
  // 5. 带宽换算
  // ============================================================
  // factor：1 单位 = 多少 bit/s
  lib.BW_UNITS = [
    { id: 'bps', label: 'bps', factor: 1 },
    { id: 'Kbps', label: 'Kbps', factor: 1e3 },
    { id: 'Mbps', label: 'Mbps', factor: 1e6 },
    { id: 'Gbps', label: 'Gbps', factor: 1e9 },
    { id: 'B/s', label: 'B/s', factor: 8 },
    { id: 'KB/s', label: 'KB/s', factor: 8e3 },
    { id: 'MB/s', label: 'MB/s', factor: 8e6 },
    { id: 'GB/s', label: 'GB/s', factor: 8e9 },
    { id: 'KiB/s', label: 'KiB/s（1024）', factor: 8 * 1024 },
    { id: 'MiB/s', label: 'MiB/s（1024²）', factor: 8 * 1048576 },
    { id: 'GiB/s', label: 'GiB/s（1024³）', factor: 8 * 1073741824 }
  ];

  function bwUnit(id) {
    for (var i = 0; i < lib.BW_UNITS.length; i++) if (lib.BW_UNITS[i].id === id) return lib.BW_UNITS[i];
    throw new Error('未知单位 ' + id);
  }

  function toNumber(v, what) {
    var s = String(v == null ? '' : v).trim();
    if (!s || !/^\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) throw new Error('请输入有效的' + what + '（非负数字）');
    return Number(s);
  }

  // 返回 { bitsPerSec, values: { unitId: number } }
  lib.bwConvert = function (value, unitId) {
    var n = toNumber(value, '带宽数值');
    var bps = n * bwUnit(unitId).factor;
    var values = {};
    for (var i = 0; i < lib.BW_UNITS.length; i++) values[lib.BW_UNITS[i].id] = bps / lib.BW_UNITS[i].factor;
    return { bitsPerSec: bps, values: values };
  };

  var SIZE_POW = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };

  // 文件大小 + 带宽 → 秒；base 为 1024 或 1000
  lib.downloadSeconds = function (size, sizeUnit, base, bw, bwUnitId) {
    var s = toNumber(size, '文件大小');
    var b = toNumber(bw, '带宽数值');
    if (!(sizeUnit in SIZE_POW)) throw new Error('未知大小单位 ' + sizeUnit);
    if (base !== 1024 && base !== 1000) throw new Error('进制只能是 1024 或 1000');
    if (b <= 0) throw new Error('带宽必须大于 0');
    var bits = s * Math.pow(base, SIZE_POW[sizeUnit]) * 8;
    return bits / (b * bwUnit(bwUnitId).factor);
  };

  // 秒 → 'H:MM:SS'（小时可超过 24）
  lib.formatDuration = function (sec) {
    if (!isFinite(sec) || sec < 0) throw new Error('无效时长');
    if (sec < 1) return '0:00:00（约 ' + lib.fmtNum(sec) + ' 秒）';
    var t = Math.round(sec);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h + ':' + pad(m) + ':' + pad(s);
  };

  lib.fmtNum = function (n) {
    if (n === 0) return '0';
    var abs = Math.abs(n);
    if (abs >= 1e15 || abs < 1e-6) return n.toExponential(4);
    var s = n.toFixed(6).replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  };

  // AI Accept 2026-10-20 main v1
  // ============================================================
  // 6. 数字大小写（全程按字符串处理，16 位整数也不丢精度）
  // ============================================================
  var CN_DIGITS = { lower: '零一二三四五六七八九', upper: '零壹贰叁肆伍陆柒捌玖' };
  var CN_UNITS = { lower: ['', '十', '百', '千'], upper: ['', '拾', '佰', '仟'] };
  var CN_MAX_INT = 16; // 最大 9999万9999亿9999万9999

  // 解析阿拉伯数字：容忍千分位逗号、空格、全角数字、¥ / RMB 前缀与「元」后缀
  // 返回 { neg, ip: 整数部分（无前导零）, frac: 小数部分（原样） }
  lib.parseArabicNumber = function (input) {
    var s = cleanValue(input)
      .replace(/[０-９．－＋]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s,，_]/g, '')
      .replace(/^([+-]?)(?:[¥￥]|RMB)/i, '$1')
      .replace(/元$/, '');
    var m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!s || !m || !(m[2] || m[3])) throw new Error('请输入有效的数字，如 1234.56');
    var ip = m[2].replace(/^0+/, '') || '0', frac = m[3] || '';
    if (ip.length > CN_MAX_INT) throw new Error('整数部分最多 16 位（万亿级）');
    return { neg: m[1] === '-' && /[1-9]/.test(ip + frac), ip: ip, frac: frac };
  };

  // ≤4 位、无前导零的非零数字串：中间连续的 0 只读一个「零」，末尾的 0 不读
  function cnSection(s, d, u) {
    var out = '', zero = false;
    for (var i = 0; i < s.length; i++) {
      var n = +s.charAt(i);
      if (n === 0) { zero = true; continue; }
      if (zero) { out += d.charAt(0); zero = false; }
      out += d.charAt(n) + u[s.length - 1 - i];
    }
    return out;
  }

  // 无前导零的非零整数串：按 亿 / 万 递归拆分，低段以 0 开头时补「零」
  function cnInt(s, d, u) {
    var size = s.length > 8 ? 8 : s.length > 4 ? 4 : 0;
    if (!size) return cnSection(s, d, u);
    var lo = s.slice(s.length - size), loTrim = lo.replace(/^0+/, '');
    var out = cnInt(s.slice(0, s.length - size), d, u) + (size === 8 ? '亿' : '万');
    if (loTrim) out += (lo.charAt(0) === '0' ? d.charAt(0) : '') + cnInt(loTrim, d, u);
    return out;
  }

  // 数字 → 中文读法（小写：一千零五 / 大写：壹仟零伍），小数逐位读出
  lib.numberToChinese = function (input, upper) {
    var p = lib.parseArabicNumber(input), key = upper ? 'upper' : 'lower', d = CN_DIGITS[key];
    var out = p.ip === '0' ? d.charAt(0) : cnInt(p.ip, d, CN_UNITS[key]);
    if (!upper) out = out.replace(/^一十/, '十'); // 口语：十五、十万
    if (p.frac) {
      out += '点';
      for (var i = 0; i < p.frac.length; i++) out += d.charAt(+p.frac.charAt(i));
    }
    return (p.neg ? '负' : '') + out;
  };

  function incDigits(s) {
    var a = s.split(''), i = a.length - 1;
    while (i >= 0 && a[i] === '9') a[i--] = '0';
    if (i < 0) return '1' + a.join('');
    a[i] = String(+a[i] + 1);
    return a.join('');
  }

  // 人民币金额大写（依《支付结算办法》书写规定）：精确到分，超出部分四舍五入
  // 返回 { text, rounded }
  lib.rmbUpper = function (input) {
    var p = lib.parseArabicNumber(input);
    var digits = p.ip + (p.frac + '00').slice(0, 2);
    if (p.frac.length > 2 && +p.frac.charAt(2) >= 5) digits = incDigits(digits);
    var ip = digits.slice(0, -2).replace(/^0+/, '') || '0';
    var jiao = +digits.charAt(digits.length - 2), fen = +digits.charAt(digits.length - 1);
    if (ip.length > CN_MAX_INT) throw new Error('整数部分最多 16 位（万亿级）');
    var D = CN_DIGITS.upper, out = ip === '0' ? '' : cnInt(ip, D, CN_UNITS.upper) + '元';
    if (!jiao && !fen) {
      out = (out || '零元') + '整';
    } else {
      if (jiao) out += D.charAt(jiao) + '角';
      else if (out) out += '零'; // 角位为 0、分位不为 0：元后须写「零」
      out += fen ? D.charAt(fen) + '分' : '整';
    }
    var nonZero = ip !== '0' || jiao || fen;
    return { text: (p.neg && nonZero ? '负' : '') + out, rounded: p.frac.length > 2 && /[1-9]/.test(p.frac.slice(2)) };
  };

  var CN_DIGIT_MAP = {
    '零': 0, '〇': 0, '○': 0, '一': 1, '壹': 1, '二': 2, '贰': 2, '貳': 2, '两': 2, '兩': 2,
    '三': 3, '叁': 3, '參': 3, '四': 4, '肆': 4, '五': 5, '伍': 5, '六': 6, '陆': 6, '陸': 6,
    '七': 7, '柒': 7, '八': 8, '捌': 8, '九': 9, '玖': 9
  };
  var CN_UNIT_MAP = { '十': 10, '拾': 10, '百': 100, '佰': 100, '千': 1000, '仟': 1000 };

  function cnDigit(c) {
    if (!(c in CN_DIGIT_MAP)) throw new Error('无法识别的字符「' + c + '」');
    return CN_DIGIT_MAP[c];
  }

  // 万以内一段：「三百五」按口语视为 350，「三百零五」为 305
  function cnParseSection(s) {
    if (!s) throw new Error('数字不完整，单位前缺少数字');
    var total = 0, num = -1, last = 10000, zero = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c in CN_UNIT_MAP) {
        var u = CN_UNIT_MAP[c];
        if (u >= last) throw new Error('单位顺序有误：「' + c + '」');
        total += (num < 0 ? 1 : num) * u;
        last = u; num = -1; zero = false;
      } else {
        var v = cnDigit(c);
        if (v === 0) { zero = true; continue; }
        if (num >= 0) throw new Error('「' + s + '」中数字连续，缺少单位');
        num = v;
      }
    }
    if (num >= 0) total += !zero && last < 10000 ? num * last / 10 : num;
    return total;
  }

  // 亿以内（≤8 位）：shortUnit 为上一级单位的十分之一，用于「一万五」「一亿五」这类口语简写
  function cnParseWan(s, shortUnit) {
    if (shortUnit && s.length === 1 && CN_DIGIT_MAP[s]) return CN_DIGIT_MAP[s] * shortUnit;
    var parts = s.split(/[万萬]/);
    if (parts.length > 2) throw new Error('「万」出现多次，请检查');
    if (parts.length === 1) return cnParseSection(s);
    var lo = parts[1] ? cnParseWan(parts[1], 1000) : 0;
    return cnParseSection(parts[0]) * 10000 + lo;
  }

  function cnParseInt(s) {
    if (!/[十拾百佰千仟万萬亿億]/.test(s)) { // 无单位：逐位读（二〇二六 → 2026）
      var digits = '';
      for (var i = 0; i < s.length; i++) digits += cnDigit(s.charAt(i));
      return digits.replace(/^0+(?=\d)/, '');
    }
    var parts = s.split(/[亿億]/);
    if (parts.length > 2) throw new Error('暂不支持「亿亿」及以上');
    if (parts.length === 1) return String(cnParseWan(s));
    var hi = cnParseWan(parts[0]), lo = parts[1] ? cnParseWan(parts[1], 1e7) : 0;
    if (!hi) throw new Error('「亿」前缺少数字');
    var loStr = String(lo);
    return hi + '00000000'.slice(loStr.length) + loStr;
  }

  // 中文数字 / 大写金额 → 阿拉伯数字字符串（如 '-1234.56'）
  lib.chineseToNumber = function (input) {
    var s = cleanValue(input).replace(/\s+/g, '').replace(/^(?:人民币|RMB|[¥￥])/i, '');
    var neg = /^[负負-]/.test(s);
    if (neg) s = s.slice(1);
    if (!s) throw new Error('请输入中文数字，如 壹仟贰佰叁拾肆元伍角陆分');
    var frac = '', money = false, m;
    if ((m = /^(.*?)[点點](.*)$/.exec(s))) {
      s = m[1];
      for (var i = 0; i < m[2].length; i++) frac += cnDigit(m[2].charAt(i));
      if (!s) s = '零';
    } else {
      s = s.replace(/[整正]$/, '');
      var jiao = 0, fen = 0;
      if ((m = /(.)分$/.exec(s))) { fen = cnDigit(m[1]); s = s.slice(0, -2); money = true; }
      if ((m = /(.)[角毛]$/.exec(s))) { jiao = cnDigit(m[1]); s = s.slice(0, -2); money = true; }
      if (money) s = s.replace(/[零〇]$/, '');
      if (/[元圆圓块]$/.test(s)) { s = s.slice(0, -1); money = true; }
      if (money) {
        frac = (String(jiao) + fen).replace(/0+$/, '');
        if (!s) s = '零';
      }
      if (!s) throw new Error('请输入中文数字');
    }
    var ip = cnParseInt(s);
    var out = ip + (frac ? '.' + frac : '');
    return (neg && /[1-9]/.test(out) ? '-' : '') + out;
  };

  // 千分位：'-1234567.89' → '-1,234,567.89'
  lib.groupThousands = function (num) {
    var m = /^(-?)(\d+)(\.\d+)?$/.exec(String(num));
    if (!m) return String(num);
    return m[1] + m[2].replace(/\B(?=(\d{3})+$)/g, ',') + (m[3] || '');
  };

  // ============================================================
  // 界面
  // ============================================================

  // 固定行的键值表：rows 只建一次，update 只改文本，避免定时刷新时丢失焦点
  // values 可为字符串或字符串数组（多行逐行显示）
  function staticKv(ui, labels, status) {
    var el = ui.el;
    var root = el('dl', { className: 'kv' });
    var cells = [];
    for (var i = 0; i < labels.length; i++) {
      (function (idx) {
        var dd = el('dd', { className: 'kv-value' });
        cells.push(dd);
        root.appendChild(el('div', { className: 'kv-row' }, [
          el('dt', { className: 'kv-label', text: labels[idx] }),
          dd,
          ui.button('复制', function () { ui.copy(dd.getAttribute('data-copy') || dd.textContent, status); })
        ]));
      })(i);
    }
    return {
      root: root,
      update: function (values) {
        for (var i = 0; i < cells.length; i++) {
          var v = values[i];
          var dd = cells[i];
          if (Object.prototype.toString.call(v) === '[object Array]') {
            dd.textContent = '';
            for (var k = 0; k < v.length; k++) dd.appendChild(el('div', { text: v[k] }));
            dd.setAttribute('data-copy', v.join('\n'));
          } else {
            dd.textContent = v == null ? '' : String(v);
            dd.removeAttribute('data-copy');
          }
        }
      }
    };
  }

  function subTitle(ui, text) {
    return ui.el('h2', { className: 'sub-title', text: text });
  }

  // ---------- 1. Unix 时间戳 ----------
  Tools.register({
    id: 'timestamp',
    cat: 'dev',
    name: 'Unix 时间戳',
    desc: '时间戳与日期时间互转，自动识别秒、毫秒、微秒与纳秒，支持本地时区与 UTC。',
    keywords: 'timestamp unix time date epoch 时间戳 时间 日期 转换',
    render: function (root, ui) {
      var status = ui.status();

      // 当前时间
      var nowKv = staticKv(ui, ['当前秒级时间戳', '当前毫秒时间戳', '当前本地时间'], status);
      var paused = false;
      var pauseBtn = ui.button('暂停', function () {
        paused = !paused;
        pauseBtn.textContent = paused ? '继续' : '暂停';
        if (!paused) tick();
      });
      function tick() {
        if (paused) return;
        var now = Date.now();
        nowKv.update([Math.floor(now / 1000), now, lib.formatLocal(new Date(now)) + '（' + lib.tzLabel(new Date(now)) + '）']);
      }
      tick();
      var timer = setInterval(tick, 1000);

      // 时间戳 → 日期
      var tsInput = ui.input({ mono: true, value: String(Math.floor(Date.now() / 1000)), placeholder: '如 1760578200 或 1760578200000' });
      var tsKv = staticKv(ui, ['识别单位', '本地时间', 'UTC 时间', 'ISO 8601', '星期（本地）', '本地时区'], status);
      var tsMsg = ui.status();
      function runTs() {
        try {
          var r = lib.tsDetect(tsInput.value);
          var info = lib.tsInfo(r.ms);
          tsKv.update([lib.tsUnitName(r.unit), info.local, info.utc, info.iso, info.weekday, info.tz]);
          tsMsg.clear();
        } catch (e) {
          tsKv.update(['', '', '', '', '', '']);
          tsMsg.error(e.message);
        }
      }

      // 日期 → 时间戳
      var dtInput = ui.input({ mono: true, value: lib.formatLocal(new Date()), placeholder: 'YYYY-MM-DD HH:mm:ss 或 ISO 8601' });
      var dtKv = staticKv(ui, ['秒级时间戳', '毫秒时间戳', 'ISO 8601（UTC）'], status);
      var dtMsg = ui.status();
      function runDt() {
        try {
          var ms = lib.parseDateTime(dtInput.value);
          dtKv.update([Math.floor(ms / 1000), ms, new Date(ms).toISOString()]);
          dtMsg.clear();
        } catch (e) {
          dtKv.update(['', '', '']);
          dtMsg.error(e.message);
        }
      }

      tsInput.addEventListener('input', ui.debounce(runTs, 150));
      dtInput.addEventListener('input', ui.debounce(runDt, 150));
      runTs();
      runDt();

      root.appendChild(subTitle(ui, '当前时间'));
      root.appendChild(nowKv.root);
      root.appendChild(ui.actions([
        pauseBtn,
        ui.button('填入当前时间戳', function () { tsInput.value = String(Math.floor(Date.now() / 1000)); runTs(); })
      ]));

      root.appendChild(subTitle(ui, '时间戳 → 日期'));
      root.appendChild(ui.field('时间戳', tsInput, '按数值大小自动识别：10 位为秒，13 位为毫秒，16 位为微秒，19 位为纳秒。'));
      root.appendChild(tsMsg);
      root.appendChild(tsKv.root);

      root.appendChild(subTitle(ui, '日期 → 时间戳'));
      root.appendChild(ui.field('日期时间', dtInput, '不带时区时按本机时区（' + lib.tzLabel(new Date()) + '）解析；带 Z 或 ±HH:mm 时按指定时区解析。'));
      root.appendChild(dtMsg);
      root.appendChild(dtKv.root);
      root.appendChild(status);

      return function () { clearInterval(timer); };
    }
  });

  // ---------- 2. 文本对比 ----------
  var DIFF_DEMO_OLD = 'SELECT id, name\nFROM users\nWHERE status = 1\nORDER BY id;';
  var DIFF_DEMO_NEW = 'SELECT id, name, email\nFROM users\nWHERE status = 1\n  AND deleted = 0\nORDER BY id;';

  Tools.register({
    id: 'text-diff',
    cat: 'dev',
    name: '文本对比',
    desc: '按行比较两段文本的差异，支持忽略首尾空白与大小写，仅显示差异附近的上下文。',
    keywords: 'diff compare text 对比 比较 差异',
    render: function (root, ui) {
      var el = ui.el;
      var left = ui.textarea({ rows: 14, placeholder: '原始文本' });
      var right = ui.textarea({ rows: 14, placeholder: '修改后的文本' });
      var ws = ui.checkbox('忽略首尾空白', false);
      var ic = ui.checkbox('忽略大小写', false);
      var ctx = ui.checkbox('仅显示差异附近（上下文 3 行）', false);
      var status = ui.status();
      var pre = el('pre', { className: 'tool-pre', 'aria-label': '对比结果' });
      var lastText = '';

      function render(result) {
        pre.textContent = '';
        var items = ctx.input.checked ? lib.diffHunks(result.ops, 3) : result.ops;
        var maxNo = 1;
        for (var i = 0; i < result.ops.length; i++) {
          maxNo = Math.max(maxNo, result.ops[i].oldNo || 0, result.ops[i].newNo || 0);
        }
        var w = String(maxNo).length;
        function col(n) {
          var s = n == null ? '' : String(n);
          while (s.length < w) s = ' ' + s;
          return s;
        }
        var lines = [];
        for (i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.type === 'skip') {
            pre.appendChild(el('span', { text: col(null) + ' ' + col(null) + '   … 省略 ' + it.count + ' 行相同内容 …\n' }));
            continue;
          }
          var mark = it.type === 'add' ? '+' : it.type === 'del' ? '-' : ' ';
          var line = col(it.oldNo) + ' ' + col(it.newNo) + ' ' + mark + ' ' + it.text;
          lines.push(mark + ' ' + it.text);
          var tag = it.type === 'add' ? 'ins' : it.type === 'del' ? 'del' : 'span';
          pre.appendChild(el(tag, { text: line + '\n' }));
        }
        lastText = lines.join('\n');
      }

      function run() {
        if (!left.value && !right.value) {
          pre.textContent = '';
          lastText = '';
          status.clear();
          return;
        }
        try {
          var r = lib.diffLines(left.value, right.value, { ignoreWhitespace: ws.input.checked, ignoreCase: ic.input.checked });
          render(r);
          if (!r.added && !r.removed) status.ok('两段文本内容相同');
          else status.info('新增 ' + r.added + ' 行，删除 ' + r.removed + ' 行');
        } catch (e) {
          pre.textContent = '';
          lastText = '';
          status.error(e.message);
        }
      }

      var auto = ui.debounce(run, 400);
      left.addEventListener('input', auto);
      right.addEventListener('input', auto);
      ws.input.addEventListener('change', run);
      ic.input.addEventListener('change', run);
      ctx.input.addEventListener('change', run);

      root.appendChild(ui.grid([ui.field('原始文本', left), ui.field('修改后', right)]));
      root.appendChild(ui.inline([ws.root, ic.root, ctx.root]));
      root.appendChild(ui.actions([
        ui.button('对比', run, true),
        ui.button('交换左右', function () { var t = left.value; left.value = right.value; right.value = t; run(); }),
        ui.copyButton(function () { return lastText; }, status, '复制差异'),
        ui.button('填入示例', function () { left.value = DIFF_DEMO_OLD; right.value = DIFF_DEMO_NEW; run(); }),
        ui.button('清空', function () { left.value = ''; right.value = ''; run(); left.focus(); })
      ]));
      root.appendChild(status);
      root.appendChild(pre);
    }
  });

  // ---------- 3. 正则表达式测试 ----------
  Tools.register({
    id: 'regex',
    cat: 'dev',
    name: '正则表达式测试',
    desc: '实时高亮匹配结果，列出索引与捕获分组（含命名分组），并预览替换效果。',
    keywords: 'regex regexp regular expression 正则 匹配 替换',
    render: function (root, ui) {
      var el = ui.el;
      var pattern = ui.input({ mono: true, value: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', placeholder: '正则表达式，或直接粘贴 /pattern/flags' });
      var FLAGS = [
        { f: 'g', label: 'g 全局' },
        { f: 'i', label: 'i 忽略大小写' },
        { f: 'm', label: 'm 多行' },
        { f: 's', label: 's 点号匹配换行' },
        { f: 'u', label: 'u Unicode' },
        { f: 'y', label: 'y 粘连' }
      ];
      var boxes = {};
      var flagRoots = [];
      for (var i = 0; i < FLAGS.length; i++) {
        var cb = ui.checkbox(FLAGS[i].label, FLAGS[i].f === 'g');
        boxes[FLAGS[i].f] = cb.input;
        flagRoots.push(cb.root);
      }
      var text = ui.textarea({ rows: 8, mono: true, value: '发布于 2026-10-16，更新于 2026-10-18。', placeholder: '测试文本' });
      var replacement = ui.input({ mono: true, value: '$<day>/$<month>/$<year>', placeholder: '替换为，支持 $1、$<name>、$&' });
      var status = ui.status();
      var pre = el('pre', { className: 'tool-pre', 'aria-label': '匹配高亮' });
      var list = staticListHost();
      var replaced = ui.output({ rows: 6 });

      function staticListHost() {
        return el('dl', { className: 'kv' });
      }

      function currentFlags() {
        var f = '';
        for (var k = 0; k < FLAGS.length; k++) if (boxes[FLAGS[k].f].checked) f += FLAGS[k].f;
        return f;
      }

      function showGroups(m) {
        var parts = [];
        for (var g = 0; g < m.groups.length; g++) {
          parts.push('$' + (g + 1) + ' = ' + (m.groups[g] === undefined ? 'undefined' : JSON.stringify(m.groups[g])));
        }
        if (m.named) {
          for (var k in m.named) if (Object.prototype.hasOwnProperty.call(m.named, k)) {
            parts.push('<' + k + '> = ' + (m.named[k] === undefined ? 'undefined' : JSON.stringify(m.named[k])));
          }
        }
        return parts;
      }

      var LIST_MAX = 200;

      function run() {
        pre.textContent = '';
        list.textContent = '';
        replaced.value = '';
        var src = pattern.value, flags = currentFlags();
        if (!src) { status.clear(); return; }
        var lit = lib.parseRegexLiteral(src);
        if (lit) {
          src = lit.source;
          flags = lit.flags;
          for (var k = 0; k < FLAGS.length; k++) boxes[FLAGS[k].f].checked = flags.indexOf(FLAGS[k].f) >= 0;
        }
        var res;
        try {
          res = lib.regexMatchAll(src, flags, text.value, MATCH_LIMIT);
        } catch (e) {
          status.error(e.message);
          return;
        }
        var t = text.value, pos = 0, j;
        for (j = 0; j < res.matches.length; j++) {
          var m = res.matches[j];
          if (m.index < pos) continue;
          if (m.index > pos) pre.appendChild(document.createTextNode(t.slice(pos, m.index)));
          if (m.end > m.index) pre.appendChild(el('mark', { text: t.slice(m.index, m.end), title: '#' + (j + 1) }));
          pos = m.end;
        }
        if (pos < t.length) pre.appendChild(document.createTextNode(t.slice(pos)));

        for (j = 0; j < res.matches.length && j < LIST_MAX; j++) {
          var mm = res.matches[j];
          var dd = el('dd', { className: 'kv-value' }, [el('div', { text: JSON.stringify(mm.text) })]);
          var gp = showGroups(mm);
          for (var g = 0; g < gp.length; g++) dd.appendChild(el('div', { text: gp[g] }));
          (function (val) {
            list.appendChild(el('div', { className: 'kv-row' }, [
              el('dt', { className: 'kv-label', text: '#' + (j + 1) + ' · 索引 ' + mm.index + '–' + mm.end }),
              dd,
              ui.button('复制', function () { ui.copy(val, status); })
            ]));
          })(mm.text);
        }

        try {
          replaced.value = lib.regexReplace(src, flags, t, replacement.value);
        } catch (e) {
          replaced.value = '';
        }

        var n = res.matches.length;
        var zero = 0;
        for (j = 0; j < n; j++) if (res.matches[j].end === res.matches[j].index) zero++;
        var msg = n ? '共 ' + n + ' 处匹配' : '没有匹配';
        if (zero) msg += '（其中 ' + zero + ' 处为零宽匹配，不显示高亮）';
        if (res.truncated) msg += '，已达上限 ' + MATCH_LIMIT + '，其余未列出';
        if (n > LIST_MAX) msg += '；明细仅列出前 ' + LIST_MAX + ' 项';
        if (n) status.ok(msg);
        else status.info(msg);
      }

      var auto = ui.debounce(run, 200);
      pattern.addEventListener('input', auto);
      text.addEventListener('input', auto);
      replacement.addEventListener('input', auto);
      for (var f in boxes) if (Object.prototype.hasOwnProperty.call(boxes, f)) boxes[f].addEventListener('change', run);

      root.appendChild(ui.field('正则表达式', pattern));
      root.appendChild(ui.inline(flagRoots));
      root.appendChild(ui.field('测试文本', text));
      root.appendChild(status);
      root.appendChild(el('div', { className: 'field-group' }, [el('p', { className: 'field-label', text: '匹配高亮' }), pre]));
      root.appendChild(el('div', { className: 'field-group' }, [el('p', { className: 'field-label', text: '匹配明细' }), list]));
      root.appendChild(ui.field('替换为', replacement, '$1 为第 1 个分组，$<name> 为命名分组，$& 为整个匹配；未勾选 g 时只替换第一处。'));
      root.appendChild(ui.field('替换结果', replaced));
      root.appendChild(ui.actions([ui.copyButton(replaced, status, '复制替换结果')]));
      run();
    }
  });

  // ---------- 4. 变量命名转换 ----------
  Tools.register({
    id: 'case-convert',
    cat: 'dev',
    name: '变量命名转换',
    desc: '在 camelCase、PascalCase、snake_case、kebab-case、CONSTANT_CASE 等命名风格间互转，支持多行批量。',
    keywords: 'case camel pascal snake kebab constant 驼峰 下划线 命名 变量',
    render: function (root, ui) {
      var input = ui.textarea({ rows: 6, value: 'getHTTPResponse2Code\nXMLHttpRequest\nuser_name', placeholder: '每行一个名称，任意风格均可' });
      var status = ui.status();
      var labels = [];
      for (var i = 0; i < lib.CASE_FORMATS.length; i++) labels.push(lib.CASE_FORMATS[i].label);
      var kv = staticKv(ui, labels, status);

      function run() {
        var lines = input.value.split(/\r\n|\r|\n/);
        var names = [];
        for (var i = 0; i < lines.length; i++) if (lines[i].trim()) names.push(lines[i]);
        var values = [];
        for (var f = 0; f < lib.CASE_FORMATS.length; f++) {
          var col = [];
          for (var k = 0; k < names.length; k++) col.push(lib.convertCase(names[k], lib.CASE_FORMATS[f].id));
          values.push(col);
        }
        kv.update(values);
        if (names.length) status.info('共转换 ' + names.length + ' 个名称');
        else status.clear();
      }

      input.addEventListener('input', ui.debounce(run, 150));
      root.appendChild(ui.field('输入', input, '自动识别空格、- _ . 分隔与大小写边界，连续大写视为缩写（XMLHttp → xml http）。'));
      root.appendChild(ui.actions([ui.button('清空', function () { input.value = ''; run(); input.focus(); })]));
      root.appendChild(status);
      root.appendChild(kv.root);
      run();
    }
  });

  // ---------- 5. 带宽换算 ----------
  Tools.register({
    id: 'bandwidth',
    cat: 'dev',
    name: '带宽换算',
    desc: '在 Mbps、MB/s 等带宽单位间换算，并按文件大小估算理论下载耗时。',
    keywords: 'bandwidth mbps speed download 带宽 网速 下载 换算',
    render: function (root, ui) {
      var unitOpts = [];
      for (var i = 0; i < lib.BW_UNITS.length; i++) unitOpts.push({ value: lib.BW_UNITS[i].id, label: lib.BW_UNITS[i].label });

      // 单位换算
      var bwValue = ui.input({ type: 'text', mono: true, value: '100' });
      var bwUnitSel = ui.select(unitOpts, 'Mbps');
      var status = ui.status();
      var convLabels = [];
      for (i = 0; i < lib.BW_UNITS.length; i++) convLabels.push(lib.BW_UNITS[i].label);
      var convKv = staticKv(ui, convLabels, status);
      var convMsg = ui.status();

      function runConv() {
        try {
          var r = lib.bwConvert(bwValue.value, bwUnitSel.value);
          var vals = [];
          for (var k = 0; k < lib.BW_UNITS.length; k++) vals.push(lib.fmtNum(r.values[lib.BW_UNITS[k].id]) + ' ' + lib.BW_UNITS[k].id);
          convKv.update(vals);
          convMsg.clear();
        } catch (e) {
          convKv.update([]);
          convMsg.error(e.message);
        }
      }

      // 下载耗时
      var size = ui.input({ type: 'text', mono: true, value: '4' });
      var sizeUnit = ui.select(['B', 'KB', 'MB', 'GB', 'TB'], 'GB');
      var base = ui.select([{ value: '1024', label: '1024（Windows 显示）' }, { value: '1000', label: '1000（硬盘厂商标称）' }], '1024');
      var dlBw = ui.input({ type: 'text', mono: true, value: '100' });
      var dlUnit = ui.select(unitOpts, 'Mbps');
      var dlKv = staticKv(ui, ['理论耗时（时:分:秒）', '合计秒数', '传输速率'], status);
      var dlMsg = ui.status();

      function runDl() {
        try {
          var sec = lib.downloadSeconds(size.value, sizeUnit.value, parseInt(base.value, 10), dlBw.value, dlUnit.value);
          var mbs = lib.bwConvert(dlBw.value, dlUnit.value).values['MB/s'];
          dlKv.update([lib.formatDuration(sec), lib.fmtNum(sec) + ' 秒', lib.fmtNum(mbs) + ' MB/s']);
          dlMsg.clear();
        } catch (e) {
          dlKv.update([]);
          dlMsg.error(e.message);
        }
      }

      var a1 = ui.debounce(runConv, 120), a2 = ui.debounce(runDl, 120);
      bwValue.addEventListener('input', a1);
      bwUnitSel.addEventListener('change', runConv);
      size.addEventListener('input', a2);
      dlBw.addEventListener('input', a2);
      sizeUnit.addEventListener('change', runDl);
      base.addEventListener('change', runDl);
      dlUnit.addEventListener('change', runDl);

      root.appendChild(subTitle(ui, '单位换算'));
      root.appendChild(ui.inline([ui.field('数值', bwValue), ui.field('单位', bwUnitSel)]));
      root.appendChild(ui.el('p', { className: 'field-hint', text: '1 Byte = 8 bit。运营商带宽按十进制计算（1 Mbps = 1000 Kbps），100 Mbps 宽带理论峰值约 12.5 MB/s；KiB/MiB/GiB 为 1024 进制。' }));
      root.appendChild(convMsg);
      root.appendChild(convKv.root);

      root.appendChild(subTitle(ui, '下载耗时估算'));
      root.appendChild(ui.inline([ui.field('文件大小', size), ui.field('单位', sizeUnit), ui.field('大小进制', base)]));
      root.appendChild(ui.inline([ui.field('带宽', dlBw), ui.field('带宽单位', dlUnit)]));
      root.appendChild(ui.el('p', { className: 'field-hint', text: '按带宽满速计算的理论值；实际耗时受协议开销与网络波动影响，通常略长。' }));
      root.appendChild(dlMsg);
      root.appendChild(dlKv.root);
      root.appendChild(status);

      runConv();
      runDl();
    }
  });

  // AI Accept 2026-10-20 main v1
  // ---------- 6. 数字大小写 ----------
  Tools.register({
    id: 'num-cn',
    cat: 'dev',
    name: '数字大小写转换',
    desc: '阿拉伯数字与中文小写、大写、人民币金额大写互转，自动识别输入方向，16 位整数不丢精度。',
    keywords: 'number chinese rmb money upper 数字 大写 小写 金额 人民币 中文 财务 发票',
    render: function (root, ui) {
      var input = ui.input({ type: 'text', mono: true, value: '1234567.89', placeholder: '如 1234.56、¥10,005.50、壹万零伍元伍角、一亿五' });
      var status = ui.status();
      var kv = ui.kv(status);

      function run() {
        var raw = input.value;
        if (!raw.trim()) { kv.set([]); status.clear(); return; }
        try {
          var num, rows = [];
          if (/[0-9０-９]/.test(raw)) {
            num = raw;
          } else {
            num = lib.chineseToNumber(raw);
            rows.push({ label: '阿拉伯数字', value: num });
          }
          var p = lib.parseArabicNumber(num);
          var plain = (p.neg ? '-' : '') + p.ip + (p.frac ? '.' + p.frac : '');
          var rmb = lib.rmbUpper(num);
          rows.push(
            { label: '千分位', value: lib.groupThousands(plain) },
            { label: '中文小写', value: lib.numberToChinese(num, false) },
            { label: '中文大写', value: lib.numberToChinese(num, true) },
            { label: '人民币大写', value: rmb.text }
          );
          kv.set(rows);
          if (rmb.rounded) status.info('金额精确到分，分以下已四舍五入');
          else status.clear();
        } catch (e) {
          kv.set([]);
          status.error(e.message);
        }
      }

      input.addEventListener('input', ui.debounce(run, 150));
      root.appendChild(ui.field('输入', input, '输入阿拉伯数字转中文；输入中文数字（小写、大写或金额）转回阿拉伯数字。可带 ¥、千分位逗号与「元」。'));
      root.appendChild(ui.actions([ui.button('清空', function () { input.value = ''; run(); input.focus(); })]));
      root.appendChild(status);
      root.appendChild(kv.root);
      root.appendChild(ui.el('p', { className: 'field-hint', text: '人民币大写依《支付结算办法》书写：中间连续的 0 只写一个「零」，角位为 0 而分位不为 0 时元后写「零」，到元或角为止的金额后写「整」。' }));
      run();
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
