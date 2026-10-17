// AI Accept 2026-10-16 main v1
// 编码转换类工具：Base64 / URL / Escape / Unicode / Base32 / Punycode / 摩斯密码
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;

  // ---------- 基础：码点 ----------
  function toCodePoints(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) {
          out.push((c - 0xD800) * 0x400 + (d - 0xDC00) + 0x10000);
          i++;
          continue;
        }
      }
      out.push(c);
    }
    return out;
  }

  function fromCodePoint(cp) {
    if (cp > 0x10FFFF || cp < 0) throw new Error('码点超出范围：' + cp);
    if (cp <= 0xFFFF) return String.fromCharCode(cp);
    cp -= 0x10000;
    return String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
  }

  function fromCodePoints(arr) {
    var s = '';
    for (var i = 0; i < arr.length; i++) s += fromCodePoint(arr[i]);
    return s;
  }

  lib.toCodePoints = toCodePoints;
  lib.fromCodePoints = fromCodePoints;

  // ---------- Base64 ----------
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  lib.bytesToBase64 = function (bytes, urlSafe) {
    var out = '';
    var i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64.charAt(n >> 18 & 63) + B64.charAt(n >> 12 & 63) + B64.charAt(n >> 6 & 63) + B64.charAt(n & 63);
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var a = bytes[i] << 16;
      out += B64.charAt(a >> 18 & 63) + B64.charAt(a >> 12 & 63) + '==';
    } else if (rest === 2) {
      var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64.charAt(b >> 18 & 63) + B64.charAt(b >> 12 & 63) + B64.charAt(b >> 6 & 63) + '=';
    }
    if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return out;
  };

  // 容忍空白、URL-safe 字符与缺失填充
  lib.base64ToBytes = function (str) {
    var s = String(str).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    s = s.replace(/=+$/, '');
    if (/[^A-Za-z0-9+\/]/.test(s)) throw new Error('包含非 Base64 字符');
    if (s.length % 4 === 1) throw new Error('Base64 长度不合法');
    var out = [];
    var buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      buf = (buf << 6) | B64.indexOf(s.charAt(i));
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 0xFF);
      }
    }
    return new Uint8Array(out);
  };

  lib.base64Encode = function (str, urlSafe) {
    return lib.bytesToBase64(lib.utf8Encode(str), urlSafe);
  };

  lib.base64Decode = function (str) {
    var bytes = lib.base64ToBytes(str);
    try {
      return lib.utf8Decode(bytes);
    } catch (e) {
      throw new Error('解码结果不是合法的 UTF-8 文本（可能是二进制数据）');
    }
  };

  // ---------- URL ----------
  lib.urlEncode = function (str, mode) {
    return mode === 'uri' ? encodeURI(str) : encodeURIComponent(str);
  };

  lib.urlDecode = function (str, mode) {
    try {
      return mode === 'uri' ? decodeURI(str) : decodeURIComponent(str);
    } catch (e) {
      var m = /%(?![0-9a-fA-F]{2})|%[0-9a-fA-F]{2}/.exec(str);
      throw new Error('包含非法的 % 编码序列' + (m ? '（位置 ' + (m.index + 1) + ' 附近）' : '') + '，请确认输入是否完整');
    }
  };

  lib.urlParse = function (str) {
    var u;
    try {
      u = new URL(String(str).trim());
    } catch (e) {
      throw new Error('不是合法的完整 URL（需包含协议，如 https://）');
    }
    var rows = [
      { label: '协议', value: u.protocol },
      { label: '主机', value: u.hostname },
      { label: '端口', value: u.port || '（默认）' },
      { label: '路径', value: u.pathname },
      { label: '查询串', value: u.search || '（无）' },
      { label: '锚点', value: u.hash || '（无）' }
    ];
    if (u.username) rows.splice(2, 0, { label: '用户名', value: u.username });
    u.searchParams.forEach(function (v, k) {
      rows.push({ label: '参数 ' + k, value: v });
    });
    return rows;
  };

  // ---------- Escape ----------
  lib.escapeEncode = function (str) {
    return escape(str);
  };

  lib.escapeDecode = function (str) {
    if (/%(?!u[0-9a-fA-F]{4}|[0-9a-fA-F]{2})/.test(str)) throw new Error('包含不完整的 %XX 或 %uXXXX 序列');
    return unescape(str);
  };

  // ---------- Unicode ----------
  function hex4(n) {
    var h = n.toString(16).toUpperCase();
    while (h.length < 4) h = '0' + h;
    return h;
  }

  // format: 'u' (\uXXXX，代理对拆分) | 'u-brace' (\u{XXXX}) | 'html-hex' (&#xXXXX;) | 'html-dec' (&#NNNN;)
  lib.unicodeEncode = function (str, format, nonAsciiOnly) {
    var cps = toCodePoints(str);
    var out = '';
    for (var i = 0; i < cps.length; i++) {
      var cp = cps[i];
      if (nonAsciiOnly && cp < 0x80) {
        out += String.fromCharCode(cp);
        continue;
      }
      if (format === 'u-brace') out += '\\u{' + cp.toString(16).toUpperCase() + '}';
      else if (format === 'html-hex') out += '&#x' + cp.toString(16).toUpperCase() + ';';
      else if (format === 'html-dec') out += '&#' + cp + ';';
      else {
        var s = fromCodePoint(cp);
        for (var j = 0; j < s.length; j++) out += '\\u' + hex4(s.charCodeAt(j));
      }
    }
    return out;
  };

  // 解析 \uXXXX（含代理对）、\u{X..}、&#xX..;、&#N..;，其余原样保留
  lib.unicodeDecode = function (str) {
    return String(str).replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|&#[xX]([0-9a-fA-F]{1,6});|&#([0-9]{1,7});/g, function (m, brace, u4, hx, dec) {
      if (brace) return fromCodePoint(parseInt(brace, 16));
      if (u4) return String.fromCharCode(parseInt(u4, 16));
      if (hx) return fromCodePoint(parseInt(hx, 16));
      return fromCodePoint(parseInt(dec, 10));
    });
  };

  // ---------- Base32 (RFC 4648) ----------
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  lib.bytesToBase32 = function (bytes, pad) {
    var out = '';
    var buf = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      buf = ((buf << 8) | bytes[i]) & 0xFFFF;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out += B32.charAt((buf >> bits) & 31);
      }
    }
    if (bits > 0) out += B32.charAt((buf << (5 - bits)) & 31);
    if (pad !== false) while (out.length % 8) out += '=';
    return out;
  };

  lib.base32ToBytes = function (str) {
    var s = String(str).replace(/\s+/g, '').toUpperCase().replace(/=+$/, '');
    if (/[^A-Z2-7]/.test(s)) throw new Error('包含非 Base32 字符（合法字符为 A–Z 与 2–7）');
    if ([1, 3, 6].indexOf(s.length % 8) >= 0) throw new Error('Base32 长度不合法');
    var out = [];
    var buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      buf = ((buf << 5) | B32.indexOf(s.charAt(i))) & 0xFFFF;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 0xFF);
      }
    }
    return new Uint8Array(out);
  };

  lib.base32Encode = function (str, pad) {
    return lib.bytesToBase32(lib.utf8Encode(str), pad);
  };

  lib.base32Decode = function (str) {
    var bytes = lib.base32ToBytes(str);
    try {
      return lib.utf8Decode(bytes);
    } catch (e) {
      throw new Error('解码结果不是合法的 UTF-8 文本（可能是二进制数据）');
    }
  };

  // ---------- Punycode (RFC 3492) ----------
  var PC = { base: 36, tMin: 1, tMax: 26, skew: 38, damp: 700, initialBias: 72, initialN: 128 };

  function adapt(delta, numPoints, firstTime) {
    var k = 0;
    delta = firstTime ? Math.floor(delta / PC.damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    for (; delta > ((PC.base - PC.tMin) * PC.tMax) >> 1; k += PC.base) {
      delta = Math.floor(delta / (PC.base - PC.tMin));
    }
    return Math.floor(k + (PC.base - PC.tMin + 1) * delta / (delta + PC.skew));
  }

  function digitToBasic(d) {
    return d + 22 + 75 * (d < 26 ? 1 : 0); // 0..25 → a..z, 26..35 → 0..9
  }

  function basicToDigit(cp) {
    if (cp >= 48 && cp <= 57) return cp - 22;
    if (cp >= 65 && cp <= 90) return cp - 65;
    if (cp >= 97 && cp <= 122) return cp - 97;
    return PC.base;
  }

  lib.punycodeEncode = function (input) {
    var cps = toCodePoints(input);
    var out = [];
    var i, n = PC.initialN, delta = 0, bias = PC.initialBias;
    for (i = 0; i < cps.length; i++) if (cps[i] < 0x80) out.push(String.fromCharCode(cps[i]));
    var basicLen = out.length;
    var h = basicLen;
    if (basicLen) out.push('-');
    while (h < cps.length) {
      var m = 0x7FFFFFFF;
      for (i = 0; i < cps.length; i++) if (cps[i] >= n && cps[i] < m) m = cps[i];
      if (m - n > Math.floor((0x7FFFFFFF - delta) / (h + 1))) throw new Error('Punycode 溢出');
      delta += (m - n) * (h + 1);
      n = m;
      for (i = 0; i < cps.length; i++) {
        var c = cps[i];
        if (c < n && ++delta > 0x7FFFFFFF) throw new Error('Punycode 溢出');
        if (c === n) {
          var q = delta;
          for (var k = PC.base; ; k += PC.base) {
            var t = k <= bias ? PC.tMin : (k >= bias + PC.tMax ? PC.tMax : k - bias);
            if (q < t) break;
            out.push(String.fromCharCode(digitToBasic(t + (q - t) % (PC.base - t))));
            q = Math.floor((q - t) / (PC.base - t));
          }
          out.push(String.fromCharCode(digitToBasic(q)));
          bias = adapt(delta, h + 1, h === basicLen);
          delta = 0;
          h++;
        }
      }
      delta++;
      n++;
    }
    return out.join('');
  };

  lib.punycodeDecode = function (input) {
    var out = [];
    var basic = input.lastIndexOf('-');
    if (basic < 0) basic = 0;
    var j;
    for (j = 0; j < basic; j++) {
      if (input.charCodeAt(j) >= 0x80) throw new Error('Punycode 基本码段含非 ASCII 字符');
      out.push(input.charCodeAt(j));
    }
    var n = PC.initialN, bias = PC.initialBias, i = 0;
    for (var idx = basic > 0 ? basic + 1 : 0; idx < input.length;) {
      var oldi = i, w = 1;
      for (var k = PC.base; ; k += PC.base) {
        if (idx >= input.length) throw new Error('Punycode 输入不完整');
        var digit = basicToDigit(input.charCodeAt(idx++));
        if (digit >= PC.base) throw new Error('Punycode 含非法字符');
        if (digit > Math.floor((0x7FFFFFFF - i) / w)) throw new Error('Punycode 溢出');
        i += digit * w;
        var t = k <= bias ? PC.tMin : (k >= bias + PC.tMax ? PC.tMax : k - bias);
        if (digit < t) break;
        w *= PC.base - t;
      }
      var len = out.length + 1;
      bias = adapt(i - oldi, len, oldi === 0);
      n += Math.floor(i / len);
      i %= len;
      out.splice(i++, 0, n);
    }
    return fromCodePoints(out);
  };

  // 整个域名：按 . / 。 分段，非 ASCII 段编码并加 xn-- 前缀
  lib.domainToAscii = function (domain) {
    var parts = String(domain).trim().split(/[.。．｡]/);
    for (var i = 0; i < parts.length; i++) {
      if (/[^\x00-\x7F]/.test(parts[i])) parts[i] = 'xn--' + lib.punycodeEncode(parts[i].toLowerCase());
    }
    return parts.join('.');
  };

  lib.domainToUnicode = function (domain) {
    var parts = String(domain).trim().split('.');
    for (var i = 0; i < parts.length; i++) {
      if (/^xn--/i.test(parts[i])) parts[i] = lib.punycodeDecode(parts[i].slice(4).toLowerCase());
    }
    return parts.join('.');
  };

  // ---------- 摩斯密码 ----------
  var MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
    K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
    U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
    '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '\'': '.----.', '!': '-.-.--', '/': '-..-.',
    '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
  };
  var MORSE_REV = {};
  for (var mk in MORSE) if (Object.prototype.hasOwnProperty.call(MORSE, mk)) MORSE_REV[MORSE[mk]] = mk;

  // 返回 { value, unknown: [未识别字符] }
  lib.morseEncode = function (text, charSep, wordSep) {
    charSep = charSep == null ? ' ' : charSep;
    wordSep = wordSep == null ? ' / ' : wordSep;
    var unknown = [];
    var words = String(text).trim().toUpperCase().split(/\s+/);
    var outWords = [];
    for (var w = 0; w < words.length; w++) {
      if (!words[w]) continue;
      var codes = [];
      var chars = toCodePoints(words[w]);
      for (var i = 0; i < chars.length; i++) {
        var ch = fromCodePoint(chars[i]);
        if (MORSE[ch]) codes.push(MORSE[ch]);
        else {
          if (unknown.indexOf(ch) < 0) unknown.push(ch);
          codes.push('?');
        }
      }
      outWords.push(codes.join(charSep));
    }
    return { value: outWords.join(wordSep), unknown: unknown };
  };

  lib.morseDecode = function (code, wordSep) {
    var unknown = [];
    var sep = wordSep && wordSep.trim() ? wordSep.trim() : '/';
    var normalized = String(code).replace(/[·•]/g, '.').replace(/[—–_]/g, '-');
    var words = normalized.trim().split(sep);
    var out = [];
    for (var w = 0; w < words.length; w++) {
      var syms = words[w].trim().split(/\s+/);
      var word = '';
      for (var i = 0; i < syms.length; i++) {
        if (!syms[i]) continue;
        if (MORSE_REV[syms[i]]) word += MORSE_REV[syms[i]];
        else {
          if (unknown.indexOf(syms[i]) < 0) unknown.push(syms[i]);
          word += '?';
        }
      }
      if (word) out.push(word);
    }
    return { value: out.join(' '), unknown: unknown };
  };

  // ---------- 界面 ----------
  // 通用「输入 → 编码/解码 → 输出」骨架
  function codecLayout(root, ui, opts) {
    var input = ui.textarea({ rows: opts.rows || 8, placeholder: opts.placeholder || '在此输入文本...' });
    var output = ui.output({ rows: opts.rows || 8 });
    var status = ui.status();

    function run(fn) {
      status.clear();
      try {
        output.value = input.value ? fn(input.value) : '';
      } catch (e) {
        output.value = '';
        status.error(e.message || String(e));
      }
    }

    var buttons = [ui.button(opts.encodeLabel || '编码', function () { run(opts.encode); }, true)];
    if (opts.decode) buttons.push(ui.button(opts.decodeLabel || '解码', function () { run(opts.decode); }));
    buttons.push(ui.button('↑ 结果填回输入', function () {
      input.value = output.value;
      output.value = '';
      status.clear();
      input.focus();
    }));
    buttons.push(ui.copyButton(output, status));
    buttons.push(ui.button('清空', function () {
      input.value = '';
      output.value = '';
      status.clear();
      input.focus();
    }));

    if (opts.options) root.appendChild(ui.inline(opts.options));
    root.appendChild(ui.grid([ui.field(opts.inputLabel || '输入', input), ui.field(opts.outputLabel || '结果', output)]));
    root.appendChild(ui.actions(buttons));
    root.appendChild(status);
    return { input: input, output: output, status: status };
  }

  var MAX_FILE = 10 * 1024 * 1024;

  Tools.register({
    id: 'base64',
    cat: 'encode',
    name: 'Base64 编解码',
    desc: 'UTF-8 文本与 Base64 互转，支持 URL-safe 格式，以及文件、图片转 Base64。',
    keywords: 'base64 编码 解码 图片 dataurl urlsafe',
    render: function (root, ui) {
      var urlSafe = ui.checkbox('URL-safe（- _ 替代 + /，去掉填充 =）', false);
      codecLayout(root, ui, {
        options: [urlSafe.root],
        encode: function (v) { return lib.base64Encode(v, urlSafe.input.checked); },
        decode: function (v) { return lib.base64Decode(v); }
      });

      // 文件 → Base64
      var fileInput = ui.el('input', { type: 'file', className: 'field-input' });
      var keepPrefix = ui.checkbox('保留 data: 前缀（可直接用于 img src / CSS）', true);
      var fileOut = ui.output({ rows: 6 });
      var fileStatus = ui.status();
      var preview = ui.el('img', { className: 'tool-preview', alt: '图片预览' });
      preview.hidden = true;
      var lastDataUrl = '';

      function renderFile() {
        if (!lastDataUrl) return;
        fileOut.value = keepPrefix.input.checked ? lastDataUrl : lastDataUrl.slice(lastDataUrl.indexOf(',') + 1);
      }

      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        fileStatus.clear();
        fileOut.value = '';
        lastDataUrl = '';
        preview.hidden = true;
        if (!f) return;
        if (f.size > MAX_FILE) {
          fileStatus.error('文件超过 10MB，为避免浏览器卡顿，请选择更小的文件');
          return;
        }
        ui.readFile(f, 'dataurl', function (err, result) {
          if (err) {
            fileStatus.error('读取失败：' + (err.message || err));
            return;
          }
          lastDataUrl = result;
          renderFile();
          if (/^image\//.test(f.type)) {
            preview.src = result;
            preview.hidden = false;
          }
          fileStatus.ok(f.name + ' · ' + f.size + ' 字节 → ' + fileOut.value.length + ' 字符');
        });
      });
      keepPrefix.input.addEventListener('change', renderFile);

      root.appendChild(ui.el('h2', { className: 'sub-title', text: '文件 / 图片 → Base64' }));
      root.appendChild(ui.field('选择文件（≤ 10MB）', fileInput));
      root.appendChild(ui.inline([keepPrefix.root]));
      root.appendChild(preview);
      root.appendChild(ui.field('Base64 结果', fileOut));
      root.appendChild(ui.actions([ui.copyButton(fileOut, fileStatus)]));
      root.appendChild(fileStatus);
    }
  });

  Tools.register({
    id: 'url-codec',
    cat: 'encode',
    name: 'URL 编解码',
    desc: 'URL 参数编码与解码（encodeURIComponent / encodeURI），并可解析 URL 各组成部分。',
    keywords: 'url encode decode urlencode 百分号 query 参数 解析',
    render: function (root, ui) {
      var mode = ui.select([
        { value: 'component', label: '组件模式 encodeURIComponent（编码参数值）' },
        { value: 'uri', label: '整体模式 encodeURI（保留 :/?&= 等）' }
      ], 'component');
      codecLayout(root, ui, {
        options: [ui.field('编码模式', mode)],
        encode: function (v) { return lib.urlEncode(v, mode.value); },
        decode: function (v) { return lib.urlDecode(v, mode.value); }
      });

      var urlInput = ui.input({ placeholder: 'https://example.com:8080/path?a=1&b=中文#top', mono: true });
      var parseStatus = ui.status();
      var kv = ui.kv(parseStatus);
      root.appendChild(ui.el('h2', { className: 'sub-title', text: '解析 URL' }));
      root.appendChild(ui.field('完整 URL', urlInput));
      root.appendChild(ui.actions([ui.button('解析', function () {
        parseStatus.clear();
        kv.set([]);
        if (!urlInput.value.trim()) return;
        try {
          kv.set(lib.urlParse(urlInput.value));
        } catch (e) {
          parseStatus.error(e.message);
        }
      }, true)]));
      root.appendChild(parseStatus);
      root.appendChild(kv.root);
    }
  });

  Tools.register({
    id: 'escape',
    cat: 'encode',
    name: 'Escape 编解码',
    desc: 'JavaScript escape / unescape 旧式编码（%XX 与 %uXXXX），常见于老系统与历史数据。',
    keywords: 'escape unescape %u 编码 解码',
    render: function (root, ui) {
      codecLayout(root, ui, {
        encodeLabel: 'Escape 编码',
        decodeLabel: 'Unescape 解码',
        encode: lib.escapeEncode,
        decode: lib.escapeDecode
      });
      root.appendChild(ui.el('p', { className: 'field-hint', text: '提示：escape 已被标准弃用，新代码请使用 URL 编解码（encodeURIComponent）。' }));
    }
  });

  Tools.register({
    id: 'unicode',
    cat: 'encode',
    name: 'Unicode 中文互转',
    desc: '中文与 \\uXXXX、\\u{…}、HTML 实体互转，正确处理 emoji 等代理对字符。',
    keywords: 'unicode 中文 转码 \\u native2ascii html 实体 emoji',
    render: function (root, ui) {
      var format = ui.select([
        { value: 'u', label: '\\uXXXX（Java / JSON / JS）' },
        { value: 'u-brace', label: '\\u{XXXX}（ES6）' },
        { value: 'html-hex', label: '&#xXXXX;（HTML 十六进制实体）' },
        { value: 'html-dec', label: '&#NNNN;（HTML 十进制实体）' }
      ], 'u');
      var nonAscii = ui.checkbox('仅转换非 ASCII 字符', true);
      codecLayout(root, ui, {
        options: [ui.field('输出格式', format), nonAscii.root],
        encodeLabel: '中文 → Unicode',
        decodeLabel: 'Unicode → 中文',
        encode: function (v) { return lib.unicodeEncode(v, format.value, nonAscii.input.checked); },
        decode: lib.unicodeDecode
      });
    }
  });

  Tools.register({
    id: 'base32',
    cat: 'encode',
    name: 'Base32 编解码',
    desc: 'RFC 4648 标准 Base32 编解码，支持带或不带 = 填充，常用于 TOTP 密钥。',
    keywords: 'base32 编码 解码 totp rfc4648',
    render: function (root, ui) {
      var pad = ui.checkbox('输出带 = 填充', true);
      codecLayout(root, ui, {
        options: [pad.root],
        encode: function (v) { return lib.base32Encode(v, pad.input.checked); },
        decode: lib.base32Decode
      });
    }
  });

  Tools.register({
    id: 'punycode',
    cat: 'encode',
    name: 'Punycode 编解码',
    desc: '中文等国际化域名与 xn-- 形式的 Punycode 互转（RFC 3492）。',
    keywords: 'punycode idn 中文域名 xn-- 国际化域名',
    render: function (root, ui) {
      var mode = ui.select([
        { value: 'domain', label: '整个域名（自动处理 xn-- 前缀）' },
        { value: 'raw', label: '单个标签（原始 Punycode）' }
      ], 'domain');
      function eachLine(fn) {
        return function (v) {
          return v.split(/\r?\n/).map(function (line) { return line.trim() ? fn(line.trim()) : ''; }).join('\n');
        };
      }
      codecLayout(root, ui, {
        rows: 6,
        placeholder: '中文.com（每行一个）',
        options: [ui.field('模式', mode)],
        encodeLabel: '转为 Punycode',
        decodeLabel: '转为中文',
        encode: eachLine(function (v) { return mode.value === 'raw' ? lib.punycodeEncode(v) : lib.domainToAscii(v); }),
        decode: eachLine(function (v) { return mode.value === 'raw' ? lib.punycodeDecode(v) : lib.domainToUnicode(v); })
      });
    }
  });

  Tools.register({
    id: 'morse',
    cat: 'encode',
    name: '摩斯密码',
    desc: '文本与摩斯电码互转，支持字母、数字与常用标点，分隔符可自定义。',
    keywords: 'morse 摩斯 电码 密码',
    render: function (root, ui) {
      var charSep = ui.input({ value: ' ', mono: true });
      var wordSep = ui.input({ value: ' / ', mono: true });
      var io;
      function withUnknown(res) {
        if (res.unknown.length) io.status.info('以下内容无法识别，已用 ? 代替：' + res.unknown.join(' '));
        return res.value;
      }
      io = codecLayout(root, ui, {
        rows: 6,
        placeholder: 'SOS HELLO 2026',
        options: [ui.field('字符分隔符', charSep), ui.field('单词分隔符', wordSep)],
        encodeLabel: '文本 → 摩斯',
        decodeLabel: '摩斯 → 文本',
        encode: function (v) { return withUnknown(lib.morseEncode(v, charSep.value || ' ', wordSep.value || ' / ')); },
        decode: function (v) { return withUnknown(lib.morseDecode(v, wordSep.value || '/')); }
      });
      root.appendChild(ui.el('p', { className: 'field-hint', text: '摩斯电码不区分大小写，中文等字符无标准编码。解码时字符间以空白分隔。' }));
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
