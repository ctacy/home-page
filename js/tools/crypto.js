// AI Accept 2026-10-16 main v1
// 哈希与加密类工具：MD5 / SHA / HMAC / 文件哈希 / CRC / AES / 随机密码 / UUID / JWT。
// 哈希全部走 hash.js 纯 JS 实现（HTTP 下也可用）；仅 AES 依赖 crypto.subtle（需 HTTPS 安全上下文）。
(function (global) {
  'use strict';

  var Tools = global.Tools;
  var lib = Tools.lib;
  var H = lib.hash;

  // ---------- 纯函数（挂在 Tools.lib.crypto，便于单测） ----------
  function bytesToBinary(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return s;
  }

  function bytesToBase64(bytes) {
    return global.btoa(bytesToBinary(bytes));
  }

  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // 同时接受标准 Base64 与 Base64URL，忽略空白，自动补齐 '='
  function base64ToBytes(str) {
    var s = String(str).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (/[^A-Za-z0-9+/]/.test(s) || s.length % 4 === 1) throw new Error('不是合法的 Base64 字符串');
    while (s.length % 4) s += '=';
    var bin = global.atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function getCrypto() {
    var c = global.crypto;
    if (!c || typeof c.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全随机数（crypto.getRandomValues）');
    return c;
  }

  function randomBytes(n) {
    var out = new Uint8Array(n), c = getCrypto();
    for (var i = 0; i < n; i += 65536) c.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
    return out;
  }

  // [0, n) 均匀随机整数：拒绝采样消除取模偏差
  var randBuf = new Uint32Array(64), randPos = 64;
  function randomUint32() {
    if (randPos >= randBuf.length) {
      getCrypto().getRandomValues(randBuf);
      randPos = 0;
    }
    return randBuf[randPos++];
  }

  function randomInt(n) {
    if (!(n >= 1 && n <= 4294967296)) throw new Error('randomInt: 范围无效');
    var limit = Math.floor(4294967296 / n) * n, x;
    do { x = randomUint32(); } while (x >= limit);
    return x % n;
  }

  var PW_SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~'
  };
  var PW_AMBIGUOUS = '0O1lI';

  function passwordPools(opts) {
    var pools = [];
    var keys = ['upper', 'lower', 'digits', 'symbols'];
    for (var i = 0; i < keys.length; i++) {
      if (!opts[keys[i]]) continue;
      var set = PW_SETS[keys[i]];
      if (opts.excludeAmbiguous) {
        var f = '';
        for (var j = 0; j < set.length; j++) if (PW_AMBIGUOUS.indexOf(set[j]) < 0) f += set[j];
        set = f;
      }
      pools.push(set);
    }
    return pools;
  }

  // opts: { length, upper, lower, digits, symbols, excludeAmbiguous }；每个选中的字符类至少出现一次
  function generatePassword(opts) {
    var pools = passwordPools(opts);
    var length = opts.length | 0;
    if (!pools.length) throw new Error('请至少选择一种字符类型');
    if (length < pools.length) throw new Error('长度不能小于所选字符类型数（' + pools.length + '）');
    var all = pools.join('');
    var chars = [], i;
    for (i = 0; i < pools.length; i++) chars.push(pools[i].charAt(randomInt(pools[i].length)));
    for (i = pools.length; i < length; i++) chars.push(all.charAt(randomInt(all.length)));
    for (i = chars.length - 1; i > 0; i--) {
      var j = randomInt(i + 1), t = chars[i];
      chars[i] = chars[j];
      chars[j] = t;
    }
    return chars.join('');
  }

  function passwordEntropy(opts) {
    var n = passwordPools(opts).join('').length;
    return n ? Math.floor((opts.length | 0) * Math.log(n) / Math.LN2) : 0;
  }

  function uuidV4() {
    var b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40; // 版本 4
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 变体
    var h = lib.bytesToHex(b);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  var JWT_HMAC = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };

  function decodeSegment(seg, what) {
    var bytes, text;
    try {
      bytes = base64ToBytes(seg);
      text = lib.utf8Decode(bytes);
    } catch (e) {
      throw new Error(what + ' 不是合法的 Base64URL 编码');
    }
    var json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    return { text: text, json: json };
  }

  function jwtDecode(token) {
    var t = String(token).trim().replace(/^Authorization\s*:\s*/i, '').replace(/^Bearer\s+/i, '');
    // AI Accept 2026-10-17 main v1
    // 从代码、日志复制时常带引号与行尾注释：只取开头连续的 Base64URL 段（含 .），其余忽略
    t = t.replace(/^["'`]/, '');
    var lead = /^[A-Za-z0-9_\-=]+(?:\.[A-Za-z0-9_\-=]*)*/.exec(t);
    if (lead) t = lead[0];
    var parts = t.split('.');
    if (parts.length === 5) throw new Error('这是 JWE 加密令牌（5 段），没有密钥无法解码，此工具仅支持 JWS（3 段）');
    if (parts.length !== 3) throw new Error('JWT 应由「.」分隔的 3 段组成，当前为 ' + parts.length + ' 段');
    var header = decodeSegment(parts[0], 'Header');
    // AI Accept 2026-10-17 main v1
    if (!header.json || typeof header.json !== 'object' || Array.isArray(header.json)) throw new Error('Header 不是合法的 JSON 对象');
    var payload = decodeSegment(parts[1], 'Payload');
    return {
      header: header.json,
      payload: payload.json,
      payloadText: payload.text,
      signature: parts[2],
      signingInput: parts[0] + '.' + parts[1]
    };
  }

  // 仅支持 HS256/384/512；返回 true/false，不支持的算法抛错
  function jwtVerifyHmac(decoded, secretBytes) {
    var algo = JWT_HMAC[decoded.header.alg];
    if (!algo) throw new Error('不支持校验的算法：' + decoded.header.alg);
    var sig = H.hmac(algo, secretBytes, lib.utf8Encode(decoded.signingInput));
    return bytesToBase64Url(sig) === decoded.signature.replace(/=+$/, '');
  }

  function getSubtle() {
    var c = global.crypto;
    if (!c || !c.subtle || global.isSecureContext === false) return null;
    return c.subtle;
  }

  function aesRun(op, mode, keyBytes, ivBytes, dataBytes) {
    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('当前页面非 HTTPS 安全环境，浏览器禁用了 AES 接口，请通过 HTTPS 访问'));
    return subtle.importKey('raw', keyBytes, { name: mode }, false, [op]).then(function (key) {
      return subtle[op]({ name: mode, iv: ivBytes }, key, dataBytes);
    }).then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) + ' ' + u[i];
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatLocalTime(sec) {
    var d = new Date(sec * 1000);
    if (isNaN(d.getTime())) return '无效时间';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function hex16(n, width) {
    var s = n.toString(16).toUpperCase();
    while (s.length < width) s = '0' + s;
    return s;
  }

  lib.crypto = {
    bytesToBase64: bytesToBase64,
    bytesToBase64Url: bytesToBase64Url,
    base64ToBytes: base64ToBytes,
    randomBytes: randomBytes,
    randomInt: randomInt,
    passwordPools: passwordPools,
    generatePassword: generatePassword,
    passwordEntropy: passwordEntropy,
    uuidV4: uuidV4,
    jwtDecode: jwtDecode,
    jwtVerifyHmac: jwtVerifyHmac,
    aesEncrypt: function (mode, key, iv, data) { return aesRun('encrypt', mode, key, iv, data); },
    aesDecrypt: function (mode, key, iv, data) { return aesRun('decrypt', mode, key, iv, data); },
    hasSubtle: function () { return !!getSubtle(); },
    formatBytes: formatBytes
  };

  // ---------- 界面 ----------
  function listen(nodes, fn) {
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].addEventListener('input', fn);
      nodes[i].addEventListener('change', fn);
    }
  }

  // 按 'utf8' | 'hex' | 'base64' 把输入框文本转为字节
  function textToBytes(text, encoding) {
    if (encoding === 'hex') return lib.hexToBytes(text);
    if (encoding === 'base64') return base64ToBytes(text);
    return lib.utf8Encode(text);
  }

  function bytesToText(bytes, encoding, upper) {
    if (encoding === 'base64') return bytesToBase64(bytes);
    var h = lib.bytesToHex(bytes);
    return upper ? h.toUpperCase() : h;
  }

  var ENC_OUT = [{ value: 'hex', label: 'Hex（十六进制）' }, { value: 'base64', label: 'Base64' }];
  var ENC_KEY = [{ value: 'utf8', label: 'UTF-8 文本' }, { value: 'hex', label: 'Hex（十六进制）' }];

  Tools.register({
    id: 'md5',
    cat: 'crypto',
    name: 'MD5 哈希',
    desc: '计算文本的 MD5 摘要，同时给出 32 位与 16 位、大小写四种格式。',
    keywords: 'md5 hash 摘要 加密',
    render: function (root, ui) {
      var input = ui.textarea({ rows: 6, placeholder: '在此输入文本...', mono: false });
      var status = ui.status();
      var kv = ui.kv(status);
      function update() {
        status.clear();
        if (!input.value) return kv.set([]);
        var h = H.hex('md5', lib.utf8Encode(input.value));
        kv.set([
          { label: '32 位小写', value: h },
          { label: '32 位大写', value: h.toUpperCase() },
          { label: '16 位小写', value: h.slice(8, 24) },
          { label: '16 位大写', value: h.slice(8, 24).toUpperCase() }
        ]);
      }
      input.addEventListener('input', ui.debounce(update, 80));
      root.appendChild(ui.field('待计算文本（UTF-8）', input, 'MD5 已非密码学安全算法，仅适用于校验与去重，请勿用于密码存储。'));
      root.appendChild(kv.root);
      root.appendChild(ui.actions([ui.button('清空', function () { input.value = ''; update(); input.focus(); })]));
      root.appendChild(status);
    }
  });

  Tools.register({
    id: 'sha',
    cat: 'crypto',
    name: 'SHA 哈希',
    desc: '一次计算 SHA-1、SHA-224、SHA-256、SHA-384、SHA-512 摘要，支持 Hex 与 Base64 输出。',
    keywords: 'sha sha1 sha256 sha512 sha384 sha224 hash 摘要',
    render: function (root, ui) {
      var input = ui.textarea({ rows: 6, placeholder: '在此输入文本...', mono: false });
      var enc = ui.select(ENC_OUT, 'hex');
      var upper = ui.checkbox('Hex 大写', false);
      var status = ui.status();
      var kv = ui.kv(status);
      var algos = ['sha1', 'sha224', 'sha256', 'sha384', 'sha512'];
      function update() {
        status.clear();
        if (!input.value) return kv.set([]);
        var bytes = lib.utf8Encode(input.value), rows = [];
        for (var i = 0; i < algos.length; i++) {
          rows.push({ label: H.NAMES[algos[i]], value: bytesToText(H.digest(algos[i], bytes), enc.value, upper.input.checked) });
        }
        kv.set(rows);
      }
      input.addEventListener('input', ui.debounce(update, 120));
      listen([enc, upper.input], update);
      root.appendChild(ui.field('待计算文本（UTF-8）', input));
      root.appendChild(ui.inline([ui.field('输出格式', enc), upper.root]));
      root.appendChild(kv.root);
      root.appendChild(status);
    }
  });

  Tools.register({
    id: 'hmac',
    cat: 'crypto',
    name: 'HMAC 生成',
    desc: '基于密钥计算消息认证码，支持 HMAC-MD5 / SHA-1 / SHA-256 / SHA-384 / SHA-512。',
    keywords: 'hmac 签名 sha256 消息认证码 signature',
    render: function (root, ui) {
      var algo = ui.select([
        { value: 'md5', label: 'HMAC-MD5' }, { value: 'sha1', label: 'HMAC-SHA1' },
        { value: 'sha256', label: 'HMAC-SHA256' }, { value: 'sha384', label: 'HMAC-SHA384' },
        { value: 'sha512', label: 'HMAC-SHA512' }
      ], 'sha256');
      var key = ui.input({ placeholder: '密钥', mono: true });
      var keyEnc = ui.select(ENC_KEY, 'utf8');
      var msg = ui.textarea({ rows: 6, placeholder: '待签名的消息...', mono: false });
      var enc = ui.select(ENC_OUT, 'hex');
      var upper = ui.checkbox('Hex 大写', false);
      var status = ui.status();
      var kv = ui.kv(status);
      function update() {
        status.clear();
        if (!msg.value && !key.value) return kv.set([]);
        var keyBytes;
        try {
          keyBytes = textToBytes(key.value, keyEnc.value);
        } catch (e) {
          kv.set([]);
          return status.error('密钥格式错误：' + e.message);
        }
        var mac = H.hmac(algo.value, keyBytes, lib.utf8Encode(msg.value));
        kv.set([{ label: 'HMAC-' + H.NAMES[algo.value].replace('-', ''), value: bytesToText(mac, enc.value, upper.input.checked) }]);
      }
      listen([algo, key, keyEnc, msg, enc, upper.input], ui.debounce(update, 120));
      root.appendChild(ui.inline([ui.field('算法', algo), ui.field('密钥编码', keyEnc)]));
      root.appendChild(ui.field('密钥', key));
      root.appendChild(ui.field('消息（UTF-8）', msg));
      root.appendChild(ui.inline([ui.field('输出格式', enc), upper.root]));
      root.appendChild(kv.root);
      root.appendChild(status);
    }
  });

  Tools.register({
    id: 'file-hash',
    cat: 'crypto',
    name: '文件哈希',
    desc: '计算本地文件的 MD5、SHA-1、SHA-256 与 CRC32，用于校验下载完整性，文件不会上传。',
    keywords: 'file 文件 hash 校验 md5 sha256 crc32 checksum',
    render: function (root, ui) {
      var el = ui.el;
      var CHUNK = 4 * 1024 * 1024;
      var token = 0;
      var fileInput = el('input', { type: 'file', multiple: true, className: 'field-input' });
      var upper = ui.checkbox('Hex 大写', false);
      var status = ui.status();
      var results = el('div');
      var done = [];

      function renderRows(item) {
        var u = upper.input.checked, rows = [];
        for (var k = 0; k < item.values.length; k++) {
          rows.push({ label: item.values[k].label, value: u ? item.values[k].value.toUpperCase() : item.values[k].value });
        }
        item.kv.set(rows);
      }

      function hashFile(file, my, next) {
        var title = el('p', { className: 'field-label', text: file.name + ' · ' + formatBytes(file.size) });
        var prog = ui.status();
        var kv = ui.kv(status);
        results.appendChild(el('div', { className: 'field-group' }, [title, kv.root, prog]));
        var md5 = H.create('md5'), sha1 = H.create('sha1'), sha256 = H.create('sha256'), crc = H.crc32Create();
        var offset = 0, start = Date.now();
        function step() {
          if (my !== token) return;
          if (offset >= file.size) {
            var item = {
              kv: kv,
              values: [
                { label: 'MD5', value: lib.bytesToHex(md5.digest()) },
                { label: 'SHA-1', value: lib.bytesToHex(sha1.digest()) },
                { label: 'SHA-256', value: lib.bytesToHex(sha256.digest()) },
                { label: 'CRC32', value: hex16(crc.digest(), 8).toLowerCase() }
              ]
            };
            done.push(item);
            renderRows(item);
            prog.ok('完成，用时 ' + ((Date.now() - start) / 1000).toFixed(2) + ' 秒');
            return next();
          }
          ui.readFile(file.slice(offset, offset + CHUNK), 'arraybuffer', function (err, buf) {
            if (my !== token) return;
            if (err) {
              prog.error('读取失败：' + (err.message || err));
              return next();
            }
            var bytes = new Uint8Array(buf);
            md5.update(bytes);
            sha1.update(bytes);
            sha256.update(bytes);
            crc.update(bytes);
            offset += bytes.length;
            prog.info('计算中… ' + Math.floor(offset / file.size * 100) + '%');
            setTimeout(step, 0);
          });
        }
        prog.info(file.size ? '计算中… 0%' : '计算中…');
        step();
      }

      fileInput.addEventListener('change', function () {
        token += 1;
        var my = token, files = Array.prototype.slice.call(fileInput.files || []), idx = 0;
        results.textContent = '';
        done = [];
        status.clear();
        function next() {
          if (my !== token) return;
          if (idx >= files.length) {
            if (files.length > 1) status.ok('全部 ' + files.length + ' 个文件计算完成');
            return;
          }
          hashFile(files[idx++], my, next);
        }
        next();
      });
      upper.input.addEventListener('change', function () {
        for (var i = 0; i < done.length; i++) renderRows(done[i]);
      });

      root.appendChild(ui.field('选择文件', fileInput, '可多选；文件在浏览器本地按 4 MB 分块读取计算，不会上传到服务器。'));
      root.appendChild(upper.root);
      root.appendChild(results);
      root.appendChild(status);
      return function () { token += 1; };
    }
  });

  Tools.register({
    id: 'crc',
    cat: 'crypto',
    name: 'CRC 校验',
    desc: '计算 CRC-16（MODBUS / CCITT-FALSE / XMODEM / ARC）与 CRC-32 校验值，支持文本与 Hex 输入。',
    keywords: 'crc crc16 crc32 modbus ccitt 校验',
    render: function (root, ui) {
      var input = ui.textarea({ rows: 5, placeholder: '文本或 Hex，如 01 03 00 00 00 0A' });
      var mode = ui.select([{ value: 'utf8', label: '文本（UTF-8）' }, { value: 'hex', label: 'Hex（十六进制字节）' }], 'utf8');
      var variants = [];
      for (var v in H.CRC16_VARIANTS) variants.push({ value: v, label: H.CRC16_VARIANTS[v].name });
      var variant = ui.select(variants, 'modbus');
      var status = ui.status();
      var kv = ui.kv(status);
      function update() {
        status.clear();
        if (!input.value) return kv.set([]);
        var bytes;
        try {
          bytes = textToBytes(input.value, mode.value);
        } catch (e) {
          kv.set([]);
          return status.error(e.message);
        }
        var c16 = H.crc16(bytes, variant.value), c32 = H.crc32(bytes);
        var name = H.CRC16_VARIANTS[variant.value].name;
        kv.set([
          { label: name + '（Hex）', value: hex16(c16, 4) },
          { label: name + '（十进制）', value: c16 },
          { label: 'CRC-32（Hex）', value: hex16(c32, 8) },
          { label: 'CRC-32（十进制）', value: c32 }
        ]);
        status.info('共 ' + bytes.length + ' 字节');
      }
      listen([input, mode, variant], ui.debounce(update, 100));
      root.appendChild(ui.inline([ui.field('输入类型', mode), ui.field('CRC-16 变体', variant)]));
      root.appendChild(ui.field('输入', input, 'MODBUS 结果按寄存器习惯为高字节在前显示，报文中发送顺序为低字节在前。'));
      root.appendChild(kv.root);
      root.appendChild(status);
    }
  });

  Tools.register({
    id: 'aes',
    cat: 'crypto',
    name: 'AES 加解密',
    desc: 'AES-GCM / AES-CBC 对称加解密，支持 128/192/256 位密钥，基于浏览器原生 WebCrypto。',
    keywords: 'aes 加密 解密 gcm cbc 对称加密 encrypt decrypt',
    render: function (root, ui) {
      var status = ui.status();
      var notice = ui.status();
      var mode = ui.select([{ value: 'AES-GCM', label: 'AES-GCM（推荐）' }, { value: 'AES-CBC', label: 'AES-CBC（PKCS#7 填充）' }], 'AES-GCM');
      var keyEnc = ui.select([{ value: 'hex', label: 'Hex（十六进制）' }, { value: 'utf8', label: 'UTF-8 文本' }], 'hex');
      var key = ui.input({ placeholder: 'Hex：32 / 48 / 64 个字符；UTF-8：16 / 24 / 32 字节', mono: true });
      var iv = ui.input({ placeholder: 'Hex', mono: true });
      var cipherEnc = ui.select([{ value: 'base64', label: 'Base64' }, { value: 'hex', label: 'Hex（十六进制）' }], 'base64');
      var plain = ui.textarea({ rows: 7, placeholder: '明文（UTF-8）', mono: false });
      var cipher = ui.textarea({ rows: 7, placeholder: '密文' });
      var keyInfo = ui.el('p', { className: 'field-hint' });

      function ivLen() {
        return mode.value === 'AES-GCM' ? 12 : 16;
      }

      function newIv() {
        iv.value = lib.bytesToHex(randomBytes(ivLen()));
      }

      function readKey() {
        var bytes = textToBytes(key.value, keyEnc.value);
        if (bytes.length !== 16 && bytes.length !== 24 && bytes.length !== 32) {
          throw new Error('密钥长度为 ' + bytes.length + ' 字节，AES 需要 16 / 24 / 32 字节（128 / 192 / 256 位）');
        }
        return bytes;
      }

      function readIv() {
        var bytes = lib.hexToBytes(iv.value);
        if (bytes.length !== ivLen()) throw new Error(mode.value + ' 的 IV 需为 ' + ivLen() + ' 字节（' + ivLen() * 2 + ' 位 Hex），当前 ' + bytes.length + ' 字节');
        return bytes;
      }

      function updateKeyInfo() {
        try {
          keyInfo.textContent = key.value ? '密钥长度：' + readKey().length * 8 + ' 位' : '';
        } catch (e) {
          keyInfo.textContent = e.message;
        }
      }

      function explain(e, op) {
        var m = e && e.message ? e.message : String(e);
        if (e && e.name === 'OperationError' && op === 'decrypt') return '解密失败：密钥、IV、模式或密文不匹配' + (mode.value === 'AES-GCM' ? '（GCM 认证标签校验未通过，密文可能被篡改）' : '（CBC 填充校验失败）');
        if (e && (e.name === 'DataError' || e.name === 'NotSupportedError')) return '当前浏览器不支持该密钥长度（Chrome 等仅支持 128 / 256 位 AES 密钥）';
        return m;
      }

      function run(op) {
        status.clear();
        var k, v, data;
        try {
          k = readKey();
          v = readIv();
          if (op === 'encrypt') data = lib.utf8Encode(plain.value);
          else {
            if (!cipher.value.trim()) throw new Error('请输入密文');
            data = textToBytes(cipher.value.trim(), cipherEnc.value);
          }
        } catch (e) {
          return status.error(e.message);
        }
        lib.crypto[op === 'encrypt' ? 'aesEncrypt' : 'aesDecrypt'](mode.value, k, v, data).then(function (out) {
          if (op === 'encrypt') {
            cipher.value = bytesToText(out, cipherEnc.value, false);
            status.ok('加密完成，密文 ' + out.length + ' 字节');
          } else {
            try {
              plain.value = lib.utf8Decode(out);
              status.ok('解密完成');
            } catch (e) {
              plain.value = lib.bytesToHex(out);
              status.info('解密成功，但结果不是有效的 UTF-8 文本，已按 Hex 显示');
            }
          }
        }, function (e) {
          status.error(explain(e, op));
        });
      }

      var encBtn = ui.button('加密 →', function () { run('encrypt'); }, true);
      var decBtn = ui.button('← 解密', function () { run('decrypt'); });
      var keyBtn = ui.button('随机密钥（256 位）', function () {
        keyEnc.value = 'hex';
        key.value = lib.bytesToHex(randomBytes(32));
        updateKeyInfo();
      });
      var ivBtn = ui.button('随机 IV', newIv);

      mode.addEventListener('change', function () {
        var ok = false;
        try { ok = lib.hexToBytes(iv.value).length === ivLen(); } catch (e) { ok = false; }
        if (!ok) {
          newIv();
          status.info('已按 ' + mode.value + ' 要求重新生成 ' + ivLen() + ' 字节 IV');
        }
      });
      listen([key, keyEnc], updateKeyInfo);
      newIv();

      if (!lib.crypto.hasSubtle()) {
        notice.error('当前页面非 HTTPS 安全环境，浏览器禁用了 AES 接口，请通过 HTTPS 访问。');
        encBtn.disabled = true;
        decBtn.disabled = true;
        root.appendChild(notice);
      }

      root.appendChild(ui.inline([ui.field('模式', mode), ui.field('密钥编码', keyEnc), ui.field('密文编码', cipherEnc)]));
      var keyField = ui.field('密钥', key);
      keyField.appendChild(keyInfo);
      root.appendChild(keyField);
      root.appendChild(ui.field('IV（初始向量）', iv, 'GCM 使用 12 字节 IV，CBC 使用 16 字节 IV；同一密钥下每次加密都应使用新的随机 IV，解密时须使用相同的密钥与 IV。'));
      root.appendChild(ui.actions([keyBtn, ivBtn]));
      root.appendChild(ui.grid([ui.field('明文', plain), ui.field('密文', cipher, 'AES-GCM 密文末尾附带 16 字节认证标签（密文 = 加密数据 ‖ Tag，与 WebCrypto 一致）。')]));
      root.appendChild(ui.actions([encBtn, decBtn, ui.copyButton(cipher, status, '复制密文'), ui.copyButton(plain, status, '复制明文')]));
      root.appendChild(status);
    }
  });

  Tools.register({
    id: 'password',
    cat: 'crypto',
    name: '随机密码生成',
    desc: '基于浏览器安全随机数批量生成高强度密码，可自定义长度、字符类型并排除易混淆字符。',
    keywords: 'password 密码 随机 生成 强密码',
    render: function (root, ui) {
      var length = ui.input({ type: 'number', value: 16, min: 4, max: 128 });
      var count = ui.input({ type: 'number', value: 5, min: 1, max: 100 });
      var upper = ui.checkbox('大写字母 A-Z', true);
      var lower = ui.checkbox('小写字母 a-z', true);
      var digits = ui.checkbox('数字 0-9', true);
      var symbols = ui.checkbox('符号 !@#$…', true);
      var ambiguous = ui.checkbox('排除易混淆字符 0 O 1 l I', false);
      var out = ui.output({ rows: 8 });
      var status = ui.status();

      function opts() {
        return {
          length: Math.max(4, Math.min(128, parseInt(length.value, 10) || 16)),
          upper: upper.input.checked,
          lower: lower.input.checked,
          digits: digits.input.checked,
          symbols: symbols.input.checked,
          excludeAmbiguous: ambiguous.input.checked
        };
      }

      function generate() {
        var o = opts(), n = Math.max(1, Math.min(100, parseInt(count.value, 10) || 1)), list = [];
        try {
          for (var i = 0; i < n; i++) list.push(generatePassword(o));
        } catch (e) {
          out.value = '';
          return status.error(e.message);
        }
        out.value = list.join('\n');
        var bits = passwordEntropy(o);
        status.info('每个密码约 ' + bits + ' bits 熵（' + (bits >= 80 ? '强' : bits >= 60 ? '较强' : '偏弱，建议加长') + '），每类字符至少包含一个。');
      }

      listen([length, count, upper.input, lower.input, digits.input, symbols.input, ambiguous.input], ui.debounce(generate, 120));
      root.appendChild(ui.inline([ui.field('长度（4–128）', length), ui.field('数量（1–100）', count)]));
      root.appendChild(ui.inline([upper.root, lower.root, digits.root, symbols.root, ambiguous.root]));
      root.appendChild(ui.actions([ui.button('重新生成', generate, true), ui.copyButton(out, status, '复制全部')]));
      root.appendChild(ui.field('生成结果（每行一个）', out));
      root.appendChild(status);
      generate();
    }
  });

  Tools.register({
    id: 'uuid',
    cat: 'crypto',
    name: 'UUID / GUID 生成',
    desc: '批量生成 RFC 9562（原 RFC 4122）v4 UUID（GUID），支持大写、去连字符与花括号格式，并可生成随机 Token。',
    keywords: 'uuid guid 生成 token 随机 唯一标识',
    render: function (root, ui) {
      var count = ui.input({ type: 'number', value: 5, min: 1, max: 1000 });
      var upperCb = ui.checkbox('大写', false);
      var noDash = ui.checkbox('去掉连字符', false);
      var braces = ui.checkbox('花括号 {GUID}', false);
      var out = ui.output({ rows: 8 });
      var status = ui.status();

      var tokenLen = ui.input({ type: 'number', value: 32, min: 1, max: 1024 });
      var tokenEnc = ui.select([{ value: 'hex', label: 'Hex' }, { value: 'base64url', label: 'Base64URL' }, { value: 'base64', label: 'Base64' }], 'hex');
      var tokenOut = ui.input({ mono: true });
      tokenOut.readOnly = true;
      var tokenStatus = ui.status();

      function generate() {
        var n = Math.max(1, Math.min(1000, parseInt(count.value, 10) || 1)), list = [];
        for (var i = 0; i < n; i++) {
          var u = uuidV4();
          if (noDash.input.checked) u = u.replace(/-/g, '');
          if (upperCb.input.checked) u = u.toUpperCase();
          if (braces.input.checked) u = '{' + u + '}';
          list.push(u);
        }
        out.value = list.join('\n');
        status.info('已生成 ' + n + ' 个 v4 UUID');
      }

      function generateToken() {
        var n = Math.max(1, Math.min(1024, parseInt(tokenLen.value, 10) || 32));
        var b = randomBytes(n);
        tokenOut.value = tokenEnc.value === 'base64url' ? bytesToBase64Url(b) : tokenEnc.value === 'base64' ? bytesToBase64(b) : lib.bytesToHex(b);
        tokenStatus.info(n + ' 字节 = ' + n * 8 + ' 位随机数');
      }

      listen([count, upperCb.input, noDash.input, braces.input], ui.debounce(generate, 120));
      listen([tokenLen, tokenEnc], ui.debounce(generateToken, 120));

      root.appendChild(ui.inline([ui.field('数量（1–1000）', count), upperCb.root, noDash.root, braces.root]));
      root.appendChild(ui.actions([ui.button('重新生成', generate, true), ui.copyButton(out, status, '复制全部')]));
      root.appendChild(ui.field('UUID（每行一个）', out));
      root.appendChild(status);
      root.appendChild(ui.el('h2', { className: 'sub-title', text: '随机 Token' }));
      root.appendChild(ui.inline([ui.field('字节数（1–1024）', tokenLen), ui.field('编码', tokenEnc)]));
      root.appendChild(ui.field('Token', tokenOut, '可用于 API Key、会话标识、CSRF Token 等场景。'));
      root.appendChild(ui.actions([ui.button('重新生成', generateToken, true), ui.copyButton(tokenOut, tokenStatus, '复制 Token')]));
      root.appendChild(tokenStatus);
      generate();
      generateToken();
    }
  });

  Tools.register({
    id: 'jwt',
    cat: 'crypto',
    name: 'JWT 解码',
    desc: '解析 JSON Web Token 的 Header 与 Payload，换算过期时间，并可用密钥校验 HS256/384/512 签名。',
    keywords: 'jwt token 解码 json web token 签名 校验 bearer',
    render: function (root, ui) {
      var input = ui.textarea({ rows: 5, placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' });
      var secret = ui.input({ placeholder: '可选：HS256 / HS384 / HS512 的签名密钥', mono: true });
      var secretB64 = ui.checkbox('密钥为 Base64 编码', false);
      var headerOut = ui.output({ rows: 6 });
      var payloadOut = ui.output({ rows: 10 });
      var status = ui.status();
      var sigStatus = ui.status();
      var claims = ui.kv(status);
      var TIME_CLAIMS = [['exp', '过期时间'], ['nbf', '生效时间'], ['iat', '签发时间']];

      function update() {
        status.clear();
        sigStatus.clear();
        headerOut.value = '';
        payloadOut.value = '';
        claims.set([]);
        if (!input.value.trim()) return;
        var d;
        try {
          d = jwtDecode(input.value);
        } catch (e) {
          return status.error(e.message);
        }
        headerOut.value = JSON.stringify(d.header, null, 2);
        payloadOut.value = d.payload !== null ? JSON.stringify(d.payload, null, 2) : d.payloadText;

        var rows = [], now = Date.now() / 1000, p = d.payload || {};
        for (var i = 0; i < TIME_CLAIMS.length; i++) {
          var c = TIME_CLAIMS[i][0];
          if (typeof p[c] !== 'number') continue;
          var note = '';
          if (c === 'exp') note = p.exp < now ? ' · 已过期' : ' · 未过期';
          if (c === 'nbf' && p.nbf > now) note = ' · 尚未生效';
          rows.push({ label: c + '（' + TIME_CLAIMS[i][1] + '）', value: formatLocalTime(p[c]) + note });
        }
        claims.set(rows);

        var alg = d.header.alg;
        if (alg === 'none' || !d.signature) {
          sigStatus.error('alg 为 ' + (alg || '空') + '，令牌未签名，不可信任。');
        } else if (!JWT_HMAC[alg]) {
          sigStatus.info('算法 ' + alg + ' 为非对称签名，本工具仅解码、不校验签名。');
        } else if (!secret.value) {
          sigStatus.info('填写密钥后可校验 ' + alg + ' 签名。');
        } else {
          try {
            var keyBytes = secretB64.input.checked ? base64ToBytes(secret.value) : lib.utf8Encode(secret.value);
            if (jwtVerifyHmac(d, keyBytes)) sigStatus.ok('签名有效（' + alg + '）：令牌内容未被篡改。');
            else sigStatus.error('签名无效：密钥错误或令牌已被篡改。');
          } catch (e) {
            sigStatus.error('密钥格式错误：' + e.message);
          }
        }
      }

      listen([input, secret, secretB64.input], ui.debounce(update, 150));
      root.appendChild(ui.field('JWT（可带 Bearer 前缀）', input, '解码不等于验证：任何人都能解码 JWT，只有用正确密钥校验签名才能确认未被篡改。'));
      root.appendChild(ui.field('签名密钥', secret));
      root.appendChild(secretB64.root);
      root.appendChild(sigStatus);
      root.appendChild(ui.grid([ui.field('Header', headerOut), ui.field('Payload', payloadOut)]));
      root.appendChild(claims.root);
      root.appendChild(status);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
