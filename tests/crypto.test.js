// AI Accept 2026-10-17 main v1
// 哈希与加密类（hash.js / crypto.js / 旧版 md5.js）单元测试。
// 期望值全部独立得出：node 内置 crypto / zlib、RFC 测试向量、CRC RevEng check 值，不抄工具自身输出。
'use strict';

var nodeCrypto = require('crypto');
var zlib = require('zlib');
var path = require('path');
var childProcess = require('child_process');

module.exports = function (t, Tools) {
  var L = Tools.lib;
  var H = L.hash;
  var C = L.crypto;
  var ALGOS = ['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'];

  function u8(buf) { return new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) : buf); }
  function utf8(s) { return u8(Buffer.from(s, 'utf8')); }
  function hexOf(bytes) { return Buffer.from(bytes).toString('hex'); }
  function nodeHash(algo, bytes) { return nodeCrypto.createHash(algo).update(Buffer.from(bytes)).digest('hex'); }
  function nodeHmac(algo, key, msg) { return nodeCrypto.createHmac(algo, Buffer.from(key)).update(Buffer.from(msg)).digest('hex'); }
  function hexBytes(h) { return u8(Buffer.from(h, 'hex')); }
  function repeatByte(b, n) { var a = new Uint8Array(n); a.fill(b); return a; }

  // 可复现的伪随机（测试数据用，不涉及安全）
  var seed = 20261017;
  function prng() { seed = (seed * 1103515245 + 12345) >>> 0; return seed; }
  function randBytes(n) { var a = new Uint8Array(n); for (var i = 0; i < n; i++) a[i] = prng() >>> 24; return a; }

  // ============================================================
  // 1. 标准向量
  // ============================================================
  var M448 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
  var M896 = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';
  var VECTORS = {
    md5: {
      '': 'd41d8cd98f00b204e9800998ecf8427e',
      abc: '900150983cd24fb0d6963f7d28e17f72'
    },
    sha1: {
      '': 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      abc: 'a9993e364706816aba3e25717850c26c9cd0d89d',
      m448: '84983e441c3bd26ebaae4aa1f95129e5e54670f1'
    },
    sha224: {
      '': 'd14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f',
      abc: '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7',
      m448: '75388b16512776cc5dba5da1fd890150b0c6455cb4f58b1952522525'
    },
    sha256: {
      '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      abc: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      m448: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    },
    sha384: {
      '': '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
      abc: 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
      m896: '09330c33f71147e83d192fc782cd1b4753111b173b3b05d22fa08086e3b0f712fcc7c71a557e2db966c3e9fa91746039'
    },
    sha512: {
      '': 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
      abc: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      m896: '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909'
    }
  };
  var MILLION_A = {
    md5: '7707d6ae4e027c70eea2a935c2296f21',
    sha1: '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    sha224: '20794655980c91d8bbb4c1ea97618a4bf03f42581948b2ee4ee7ad67',
    sha256: 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    sha384: '9d0e1809716474cb086e834e310a4a1ced149e9c00f248527972cec5704c2a5b07b8b3dc38ecc4ebae97ddd87f3d8985',
    sha512: 'e718483d0ce769644e2e42c7bc15b4638e1f98b13b2044285632a803afa973ebde0ff244877ea60a4cb0432ce577c31beb009c5c2c49aa2e4eadb217ad8cc09b'
  };
  var MSG = { '': '', abc: 'abc', m448: M448, m896: M896 };

  ALGOS.forEach(function (algo) {
    var v = VECTORS[algo];
    Object.keys(v).forEach(function (k) {
      t.equal(H.hex(algo, utf8(MSG[k])), v[k], algo + ' 标准向量 ' + (k || '空串'));
    });
    t.equal(H.hex(algo, repeatByte(0x61, 1000000)), MILLION_A[algo], algo + ' 百万个 a');
    // 向量本身与 node 一致（防止向量抄错）
    t.equal(nodeHash(algo, utf8('abc')), v.abc, algo + ' 向量自检（node）');
  });

  // ============================================================
  // 2. 与 node createHash 对拍：块边界 + 随机长度 + 中文
  // ============================================================
  var EDGE = [0, 1, 55, 56, 57, 63, 64, 65, 111, 112, 113, 119, 120, 127, 128, 129, 191, 192, 255, 256, 1000];
  ALGOS.forEach(function (algo) {
    var bad = [];
    EDGE.forEach(function (n) {
      var d = randBytes(n);
      if (H.hex(algo, d) !== nodeHash(algo, d)) bad.push(n);
    });
    t.ok(!bad.length, algo + ' 块边界长度与 node 一致', '不一致长度：' + bad.join(','));
  });

  (function () {
    var bad = [];
    for (var i = 0; i < 1200; i++) {
      var algo = ALGOS[i % ALGOS.length];
      var d = randBytes(prng() % 4097);
      if (H.hex(algo, d) !== nodeHash(algo, d)) bad.push(algo + ':' + d.length);
    }
    t.ok(!bad.length, '1200 组随机 0–4096 字节与 node 一致', bad.slice(0, 5).join(' '));
  })();

  ['中文测试', '沈超 · 全栈 🚀', 'ẞ\u0000￿', new Array(200).join('混合ASCII与中文')].forEach(function (s) {
    ALGOS.forEach(function (algo) {
      t.equal(H.hex(algo, L.utf8Encode(s)), nodeHash(algo, Buffer.from(s, 'utf8')), algo + ' UTF-8 文本：' + s.slice(0, 8));
    });
  });

  // ============================================================
  // 3. 增量计算与状态约束
  // ============================================================
  ALGOS.forEach(function (algo) {
    var data = randBytes(5000), bad = 0;
    for (var round = 0; round < 30; round++) {
      var h = H.create(algo), pos = 0;
      while (pos < data.length) {
        var step = round === 0 ? 1 : (prng() % 300);
        h.update(data.subarray(pos, pos + step));
        pos += step;
      }
      if (hexOf(h.digest()) !== nodeHash(algo, data)) bad++;
    }
    t.equal(bad, 0, algo + ' 任意分块增量结果与一次性一致（含逐字节）');
    var h2 = H.create(algo).update(utf8('x'));
    h2.digest();
    t.throws(function () { h2.update(utf8('y')); }, /digest/, algo + ' digest 后再 update 报错');
    t.throws(function () { h2.digest(); }, /digest/, algo + ' 重复 digest 报错');
  });
  t.throws(function () { H.create('sha3'); }, /不支持/, '不支持的算法报错');
  t.equal(H.hex('sha256', [97, 98, 99]), VECTORS.sha256.abc, '普通数组输入自动转为字节');

  // ============================================================
  // 4. 旧版 window.md5 与 hash.md5 一致
  // ============================================================
  t.ok(typeof global.md5 === 'function', '旧版 md5.js 已加载');
  ['', 'abc', '中文', '沈超 · emoji 🚀🎉', 'a\nb\tc', new Array(300).join('长文本')].forEach(function (s) {
    t.equal(global.md5(s), H.hex('md5', L.utf8Encode(s)), '旧版 md5 与新实现一致：' + JSON.stringify(s.slice(0, 10)));
    t.equal(global.md5(s), nodeHash('md5', Buffer.from(s, 'utf8')), '旧版 md5 与 node 一致：' + JSON.stringify(s.slice(0, 10)));
  });

  // ============================================================
  // 5. HMAC：RFC 2202 / RFC 4231 + 随机对拍
  // ============================================================
  function hm(algo, key, msg) { return hexOf(H.hmac(algo, key, msg)); }
  var RFC2202_MD5 = [
    [repeatByte(0x0b, 16), utf8('Hi There'), '9294727a3638bb1c13f48ef8158bfc9d'],
    [utf8('Jefe'), utf8('what do ya want for nothing?'), '750c783e6ab0b503eaa86e310a5db738'],
    [repeatByte(0xaa, 16), repeatByte(0xdd, 50), '56be34521d144c88dbb8c733f0e8b3f6'],
    [hexBytes('0102030405060708090a0b0c0d0e0f10111213141516171819'), repeatByte(0xcd, 50), '697eaf0aca3a3aea3a75164746ffaa79'],
    [repeatByte(0xaa, 80), utf8('Test Using Larger Than Block-Size Key - Hash Key First'), '6b1ab7fe4bd7bf8f0b62e6ce61b9d0cd'],
    [repeatByte(0xaa, 80), utf8('Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data'), '6f630fad67cda0ee1fb1f562db3aa53e']
  ];
  RFC2202_MD5.forEach(function (c, i) { t.equal(hm('md5', c[0], c[1]), c[2], 'HMAC-MD5 RFC 2202 用例 ' + (i + 1)); });
  var RFC2202_SHA1 = [
    [repeatByte(0x0b, 20), utf8('Hi There'), 'b617318655057264e28bc0b6fb378c8ef146be00'],
    [utf8('Jefe'), utf8('what do ya want for nothing?'), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79'],
    [repeatByte(0xaa, 20), repeatByte(0xdd, 50), '125d7342b9ac11cd91a39af48aa17b4f63f175d3'],
    [hexBytes('0102030405060708090a0b0c0d0e0f10111213141516171819'), repeatByte(0xcd, 50), '4c9007f4026250c6bc8414f9bf50c86c2d7235da'],
    [repeatByte(0xaa, 80), utf8('Test Using Larger Than Block-Size Key - Hash Key First'), 'aa4ae5e15272d00e95705637ce8a3b55ed402112'],
    [repeatByte(0xaa, 80), utf8('Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data'), 'e8e99d0f45237d786d6bbaa7965c7808bbff1a91']
  ];
  RFC2202_SHA1.forEach(function (c, i) { t.equal(hm('sha1', c[0], c[1]), c[2], 'HMAC-SHA1 RFC 2202 用例 ' + (i + 1)); });
  // RFC 2202 用例 5：截断到 96 位
  t.equal(hm('sha1', repeatByte(0x0c, 20), utf8('Test With Truncation')).slice(0, 24), '4c1a03424b55e07fe7f27be1', 'HMAC-SHA1 RFC 2202 截断用例');
  t.equal(hm('md5', repeatByte(0x0c, 16), utf8('Test With Truncation')).slice(0, 24), '56461ef2342edc00f9bab995', 'HMAC-MD5 RFC 2202 截断用例');

  var RFC4231 = [
    { key: repeatByte(0x0b, 20), data: utf8('Hi There'),
      sha224: '896fb1128abbdf196832107cd49df33f47b4b1169912ba4f53684b22',
      sha256: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
      sha384: 'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
      sha512: '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854' },
    { key: utf8('Jefe'), data: utf8('what do ya want for nothing?'),
      sha224: 'a30e01098bc6dbbf45690f3a7e9e6d0f8bbea2a39e6148008fd05e44',
      sha256: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
      sha384: 'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
      sha512: '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737' },
    { key: repeatByte(0xaa, 20), data: repeatByte(0xdd, 50),
      sha224: '7fb3cb3588c6c1f6ffa9694d7d6ad2649365b0c1f65d69d1ec8333ea',
      sha256: '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe',
      sha384: '88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b2a5ab39dc13814b94e3ab6e101a34f27',
      sha512: 'fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb' },
    { key: hexBytes('0102030405060708090a0b0c0d0e0f10111213141516171819'), data: repeatByte(0xcd, 50),
      sha224: '6c11506874013cac6a2abc1bb382627cec6a90d86efc012de7afec5a',
      sha256: '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
      sha384: '3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e6801dd23c4a7d679ccf8a386c674cffb',
      sha512: 'b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd' },
    { key: repeatByte(0xaa, 131), data: utf8('Test Using Larger Than Block-Size Key - Hash Key First'),
      sha224: '95e9a0db962095adaebe9b2d6f0dbce2d499f112f2d2b7273fa6870e',
      sha256: '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
      sha384: '4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952',
      sha512: '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598' },
    { key: repeatByte(0xaa, 131), data: utf8('This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.'),
      sha224: '3a854166ac5d9f023f54d517d0b39dbd946770db9c2b95c9f6f565d1',
      sha256: '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2',
      sha384: '6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5a678cc31e799176d3860e6110c46523e',
      sha512: 'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58' }
  ];
  RFC4231.forEach(function (c, i) {
    ['sha224', 'sha256', 'sha384', 'sha512'].forEach(function (algo) {
      t.equal(hm(algo, c.key, c.data), c[algo], 'HMAC-' + algo.toUpperCase() + ' RFC 4231 用例 ' + (i === 4 ? 6 : i === 5 ? 7 : i + 1));
    });
  });
  // RFC 4231 用例 5：截断到 128 位
  var tk = repeatByte(0x0c, 20), td = utf8('Test With Truncation');
  t.equal(hm('sha224', tk, td).slice(0, 32), '0e2aea68a90c8d37c988bcdb9fca6fa8', 'HMAC-SHA224 RFC 4231 截断用例');
  t.equal(hm('sha256', tk, td).slice(0, 32), 'a3b6167473100ee06e0c796c2955552b', 'HMAC-SHA256 RFC 4231 截断用例');
  t.equal(hm('sha384', tk, td).slice(0, 32), '3abf34c3503b2a23a46efc619baef897', 'HMAC-SHA384 RFC 4231 截断用例');
  t.equal(hm('sha512', tk, td).slice(0, 32), '415fad6271580a531d4179bc891d87a6', 'HMAC-SHA512 RFC 4231 截断用例');

  (function () {
    var bad = [];
    for (var i = 0; i < 600; i++) {
      var algo = ALGOS[i % ALGOS.length];
      var key = randBytes(prng() % 300), msg = randBytes(prng() % 2000);
      if (hm(algo, key, msg) !== nodeHmac(algo, key, msg)) bad.push(algo + ' key' + key.length + ' msg' + msg.length);
    }
    t.ok(!bad.length, 'HMAC 600 组随机密钥/消息与 node 一致（含空密钥、超块长密钥）', bad.slice(0, 5).join(' | '));
  })();

  // ============================================================
  // 6. CRC
  // ============================================================
  var CHECK = utf8('123456789');
  t.equal(H.crc32(CHECK), 0xcbf43926, 'CRC-32 check 值 cbf43926');
  t.equal(H.crc32(new Uint8Array(0)), 0, 'CRC-32 空输入为 0');
  if (typeof zlib.crc32 === 'function') {
    var crcBad = [];
    for (var ci = 0; ci < 300; ci++) {
      var cd = randBytes(prng() % 3000);
      if (H.crc32(cd) !== zlib.crc32(Buffer.from(cd))) crcBad.push(cd.length);
    }
    t.ok(!crcBad.length, 'CRC-32 300 组随机数据与 zlib.crc32 一致', crcBad.join(','));
    var inc = H.crc32Create(), big = randBytes(10000);
    for (var p = 0; p < big.length; p += 777) inc.update(big.subarray(p, p + 777));
    t.equal(inc.digest(), zlib.crc32(Buffer.from(big)), 'CRC-32 增量分块与 zlib 一致');
  } else {
    t.ok(true, 'node 无 zlib.crc32，跳过随机对拍');
  }
  t.equal(H.crc16(CHECK, 'modbus'), 0x4b37, 'CRC-16/MODBUS check 值 4b37');
  t.equal(H.crc16(CHECK, 'ccitt-false'), 0x29b1, 'CRC-16/CCITT-FALSE check 值 29b1');
  t.equal(H.crc16(CHECK, 'xmodem'), 0x31c3, 'CRC-16/XMODEM check 值 31c3');
  t.equal(H.crc16(CHECK, 'arc'), 0xbb3d, 'CRC-16/ARC check 值 bb3d');
  t.equal(H.crc16(CHECK), 0x4b37, 'CRC-16 默认变体为 MODBUS');
  // MODBUS 实际报文：01 03 00 00 00 0A → CRC C5CD（报文中低字节在前：CD C5）
  t.equal(H.crc16(hexBytes('01030000000a'), 'modbus'), 0xcdc5, 'CRC-16/MODBUS 读寄存器报文');
  t.throws(function () { H.crc16(CHECK, 'nope'); }, /未知/, 'CRC-16 未知变体报错');

  // ============================================================
  // 7. JWT
  // ============================================================
  var JWT_IO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  var dec = C.jwtDecode(JWT_IO);
  t.deepEqual(dec.header, { alg: 'HS256', typ: 'JWT' }, 'JWT 解码 Header');
  t.deepEqual(dec.payload, { sub: '1234567890', name: 'John Doe', iat: 1516239022 }, 'JWT 解码 Payload');
  t.equal(C.jwtVerifyHmac(dec, utf8('your-256-bit-secret')), true, 'jwt.io 默认 HS256 示例验签通过');
  t.equal(C.jwtVerifyHmac(dec, utf8('wrong-secret')), false, '错误密钥验签失败');
  var tampered = JWT_IO.slice(0, 40) + (JWT_IO.charAt(40) === 'A' ? 'B' : 'A') + JWT_IO.slice(41);
  var decT = null;
  try { decT = C.jwtDecode(tampered); } catch (e) { decT = null; }
  t.ok(!decT || C.jwtVerifyHmac(decT, utf8('your-256-bit-secret')) === false, '篡改 Payload 一个字符后验签失败');
  var sigT = JWT_IO.slice(0, -1) + (JWT_IO.slice(-1) === 'c' ? 'd' : 'c');
  t.equal(C.jwtVerifyHmac(C.jwtDecode(sigT), utf8('your-256-bit-secret')), false, '篡改签名一个字符后验签失败');
  t.equal(C.jwtDecode('Bearer ' + JWT_IO).payload.name, 'John Doe', '支持 Bearer 前缀');

  function b64url(obj) { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url'); }
  function signJwt(alg, nodeAlg, payload, secret) {
    var si = b64url({ alg: alg, typ: 'JWT' }) + '.' + b64url(payload);
    return si + '.' + nodeCrypto.createHmac(nodeAlg, secret).update(si).digest('base64url');
  }
  var now = 1792200000;
  var pl = { sub: 'u1', name: '沈超', iat: now, nbf: now + 60, exp: now + 3600 };
  [['HS256', 'sha256'], ['HS384', 'sha384'], ['HS512', 'sha512']].forEach(function (a) {
    var tok = signJwt(a[0], a[1], pl, 'secret-密钥');
    var d = C.jwtDecode(tok);
    t.equal(C.jwtVerifyHmac(d, utf8('secret-密钥')), true, a[0] + ' node 自签名后验签通过（含中文密钥与载荷）');
    t.equal(C.jwtVerifyHmac(d, utf8('secret-x')), false, a[0] + ' 错误密钥验签失败');
    t.deepEqual([d.payload.iat, d.payload.nbf, d.payload.exp], [now, now + 60, now + 3600], a[0] + ' 解析 iat / nbf / exp');
    t.equal(d.payload.name, '沈超', a[0] + ' Payload 中文正确解码');
  });
  var noneTok = b64url({ alg: 'none', typ: 'JWT' }) + '.' + b64url({ a: 1 }) + '.';
  var dn = C.jwtDecode(noneTok);
  t.equal(dn.header.alg, 'none', 'alg none 可解码');
  t.throws(function () { C.jwtVerifyHmac(dn, utf8('k')); }, /不支持/, 'alg none 不做 HMAC 校验（提示不支持）');
  var rsTok = b64url({ alg: 'RS256' }) + '.' + b64url({ a: 1 }) + '.sig';
  t.throws(function () { C.jwtVerifyHmac(C.jwtDecode(rsTok), utf8('k')); }, /不支持/, 'RS256 等非对称算法提示仅解码');
  t.throws(function () { C.jwtDecode('a.b.c.d.e'); }, /JWE/, 'JWE 5 段令牌给出提示');
  t.throws(function () { C.jwtDecode('a.b'); }, /3 段/, '段数不对报错');
  t.throws(function () { C.jwtDecode('!!!.' + b64url({ a: 1 }) + '.x'); }, /Base64URL/, 'Header 非法 Base64URL 报错');
  t.throws(function () { C.jwtDecode(Buffer.from('[1]').toString('base64url') + '.' + b64url({}) + '.x'); }, /Header/, 'Header 非对象报错');

  // ============================================================
  // 8. 随机：整数 / 密码 / UUID / Token
  // ============================================================
  t.throws(function () { C.randomInt(0); }, /范围/, 'randomInt(0) 报错');
  t.equal(C.randomInt(1), 0, 'randomInt(1) 恒为 0');
  (function () {
    var K = 7, N = 70000, cnt = [0, 0, 0, 0, 0, 0, 0], out = 0;
    for (var i = 0; i < N; i++) {
      var x = C.randomInt(K);
      if (x < 0 || x >= K || x !== Math.floor(x)) out++;
      else cnt[x]++;
    }
    var e = N / K, chi = 0;
    for (var j = 0; j < K; j++) chi += (cnt[j] - e) * (cnt[j] - e) / e;
    t.equal(out, 0, 'randomInt 结果在 [0, n) 且为整数');
    // df=6，p=0.0001 临界值约 27.86；用 35 避免偶发误报
    t.ok(chi < 35, 'randomInt(7) 7 万次卡方检验均匀（拒绝采样无取模偏差）', 'chi2=' + chi.toFixed(2) + ' counts=' + cnt.join(','));
    var big = 3000000000, okBig = true;
    for (var b = 0; b < 2000; b++) { var y = C.randomInt(big); if (y < 0 || y >= big) okBig = false; }
    t.ok(okBig, 'randomInt 大范围（30 亿）不越界');
  })();

  (function () {
    var opts = { length: 16, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false };
    var bad = [];
    for (var i = 0; i < 500; i++) {
      var pw = C.generatePassword(opts);
      if (pw.length !== 16 || !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) bad.push(pw);
    }
    t.ok(!bad.length, '500 个密码长度正确且四类字符各至少一个', bad.slice(0, 3).join(' '));

    var ex = { length: 64, upper: true, lower: true, digits: true, symbols: false, excludeAmbiguous: true }, amb = 0, sym = 0;
    for (var k = 0; k < 300; k++) {
      var p2 = C.generatePassword(ex);
      if (/[0O1lI]/.test(p2)) amb++;
      if (/[^A-Za-z0-9]/.test(p2)) sym++;
    }
    t.equal(amb, 0, '排除易混淆字符后不出现 0 O 1 l I');
    t.equal(sym, 0, '未选符号时不出现符号');

    var minLen = C.generatePassword({ length: 4, upper: true, lower: true, digits: true, symbols: true });
    t.equal(minLen.length, 4, '长度等于字符类型数时仍满足每类各一个');
    t.ok(/[A-Z]/.test(minLen) && /[a-z]/.test(minLen) && /[0-9]/.test(minLen) && /[^A-Za-z0-9]/.test(minLen), '最短长度四类齐全');
    t.equal(C.generatePassword({ length: 10, digits: true }).replace(/[0-9]/g, ''), '', '仅数字时只含数字');
    t.throws(function () { C.generatePassword({ length: 8 }); }, /至少选择/, '未选字符类型报错');
    t.throws(function () { C.generatePassword({ length: 2, upper: true, lower: true, digits: true }); }, /长度不能小于/, '长度小于类型数报错');

    // 字符分布：只选小写 26 个字母，长 100 的密码 400 个 → 每字母期望约 1538
    var freq = {}, total = 0;
    for (var q = 0; q < 400; q++) {
      var p3 = C.generatePassword({ length: 100, lower: true });
      for (var c = 0; c < p3.length; c++) { freq[p3[c]] = (freq[p3[c]] || 0) + 1; total++; }
    }
    var keys = Object.keys(freq), exp = total / 26, chi2 = 0;
    keys.forEach(function (ch) { chi2 += (freq[ch] - exp) * (freq[ch] - exp) / exp; });
    // df=25，p=0.0001 临界值约 59.0
    t.ok(keys.length === 26 && chi2 < 70, '密码字符分布均匀（26 字母卡方检验）', 'letters=' + keys.length + ' chi2=' + chi2.toFixed(1));

    var e1 = C.passwordEntropy({ length: 16, upper: true, lower: true, digits: true, symbols: false });
    t.equal(e1, Math.floor(16 * Math.log(62) / Math.LN2), '熵计算 = 长度 × log2(字符集大小)');
    t.equal(C.passwordEntropy({ length: 16 }), 0, '无字符集时熵为 0');
  })();

  (function () {
    var re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    var seen = {}, badFmt = 0, dup = 0;
    for (var i = 0; i < 10000; i++) {
      var u = C.uuidV4();
      if (!re.test(u)) badFmt++;
      if (seen[u]) dup++;
      seen[u] = 1;
    }
    t.equal(badFmt, 0, '1 万个 UUID 均符合 v4 格式（版本位 4、变体位 10xx）');
    t.equal(dup, 0, '1 万个 UUID 无重复');
    // 版本/变体之外的位应接近均匀：统计第 1 个十六进制位
    var first = {}, n = 0;
    Object.keys(seen).forEach(function (u) { first[u[0]] = (first[u[0]] || 0) + 1; n++; });
    t.equal(Object.keys(first).length, 16, 'UUID 随机位覆盖全部 16 个十六进制字符');
  })();

  [0, 1, 16, 32, 65536, 70000].forEach(function (n) {
    t.equal(C.randomBytes(n).length, n, 'randomBytes 返回 ' + n + ' 字节（含跨 65536 分段）');
  });
  (function () {
    var r = C.randomBytes(70000), zeros = 0;
    for (var i = 65530; i < 70000; i++) if (r[i] === 0) zeros++;
    t.ok(zeros < 200, 'randomBytes 超过 65536 的部分也被填充随机数', 'zeros=' + zeros);
  })();
  (function () {
    var b = C.randomBytes(32);
    var url = C.bytesToBase64Url(b);
    t.ok(/^[A-Za-z0-9_-]+$/.test(url), 'Token Base64URL 只含 URL 安全字符且无填充');
    t.equal(url, Buffer.from(b).toString('base64url'), 'Base64URL 编码与 node 一致');
    t.equal(L.bytesToHex(b).length, 64, '32 字节 Token 的 Hex 为 64 字符');
  })();

  // ============================================================
  // 9. Base64 / Hex 辅助函数
  // ============================================================
  for (var bl = 0; bl < 40; bl++) {
    var bb = randBytes(bl);
    var std = Buffer.from(bb).toString('base64');
    if (C.bytesToBase64(bb) !== std) t.ok(false, 'Base64 编码与 node 一致：长度 ' + bl);
    if (hexOf(C.base64ToBytes(std)) !== hexOf(bb)) t.ok(false, 'Base64 解码往返：长度 ' + bl);
    if (hexOf(C.base64ToBytes(Buffer.from(bb).toString('base64url'))) !== hexOf(bb)) t.ok(false, 'Base64URL 无填充解码：长度 ' + bl);
  }
  t.ok(true, 'Base64 / Base64URL 0–39 字节编解码往返与 node 一致');
  t.equal(hexOf(C.base64ToBytes(' Zm9v\nYmFy ')), '666f6f626172', 'Base64 解码忽略空白');
  t.throws(function () { C.base64ToBytes('Zm9v!'); }, /Base64/, 'Base64 非法字符报错');
  t.throws(function () { C.base64ToBytes('Z'); }, /Base64/, 'Base64 长度非法报错');
  t.equal(L.bytesToHex(hexBytes('00ff10ab')), '00ff10ab', 'bytesToHex 补零与小写');
  t.equal(hexOf(L.hexToBytes('00 FF 10 ab')), '00ff10ab', 'hexToBytes 忽略空白、大小写不敏感');
  t.throws(function () { L.hexToBytes('abc'); }, /十六进制/, 'Hex 奇数长度报错');
  t.throws(function () { L.hexToBytes('zz'); }, /十六进制/, 'Hex 非法字符报错');
  t.equal(C.formatBytes(1023), '1023 B', 'formatBytes 字节');
  t.equal(C.formatBytes(1536), '1.50 KB', 'formatBytes KB');
  t.equal(C.formatBytes(5 * 1024 * 1024 * 1024), '5.00 GB', 'formatBytes GB');

  // ============================================================
  // 10. AES（工具走异步 WebCrypto；run.js 同步执行，故在子进程中与 createCipheriv 对拍）
  // ============================================================
  (function () {
    var root = path.resolve(__dirname, '..');
    var script = [
      "global.window = global;",
      "var path = require('path'), nc = require('crypto');",
      "['js/tools/core.js', 'js/tools/hash.js', 'js/tools/crypto.js'].forEach(function (f) { require(path.join(" + JSON.stringify(root) + ", f)); });",
      "var C = Tools.lib.crypto, out = [];",
      "function rb(n) { return new Uint8Array(nc.randomBytes(n)); }",
      "var jobs = [];",
      "[16, 24, 32].forEach(function (kl) {",
      "  [['AES-GCM', 12, 'gcm'], ['AES-CBC', 16, 'cbc']].forEach(function (m) {",
      "    [0, 1, 15, 16, 17, 100].forEach(function (len) {",
      "      var key = rb(kl), iv = rb(m[1]), pt = rb(len), name = m[0] + '-' + (kl * 8) + ' len' + len;",
      "      var c = nc.createCipheriv('aes-' + (kl * 8) + '-' + m[2], key, iv);",
      "      var exp = Buffer.concat([c.update(pt), c.final()]);",
      "      if (m[2] === 'gcm') exp = Buffer.concat([exp, c.getAuthTag()]);",
      "      jobs.push(C.aesEncrypt(m[0], key, iv, pt).then(function (ct) {",
      "        var same = Buffer.from(ct).equals(exp);",
      "        return C.aesDecrypt(m[0], key, iv, ct).then(function (back) {",
      "          out.push([name + ' 加密与 node 一致', same]);",
      "          out.push([name + ' 解密还原', Buffer.from(back).equals(Buffer.from(pt))]);",
      "        });",
      "      }, function (e) { out.push([name + ' 加密出错：' + e.message, false]); }));",
      "    });",
      "  });",
      "});",
      "var k = rb(32), iv12 = rb(12), iv16 = rb(16), pt = rb(40);",
      "jobs.push(C.aesEncrypt('AES-GCM', k, iv12, pt).then(function (ct) {",
      "  ct[3] ^= 1;",
      "  return C.aesDecrypt('AES-GCM', k, iv12, ct).then(function () { out.push(['篡改 GCM 密文应解密失败', false]); }, function () { out.push(['篡改 GCM 密文解密失败', true]); });",
      "}));",
      "var cb = nc.createCipheriv('aes-256-cbc', k, iv16); cb.setAutoPadding(false);",
      "var badPad = Buffer.concat([cb.update(Buffer.alloc(16, 7).fill(0x11, 15)), cb.final()]);",
      "jobs.push(C.aesDecrypt('AES-CBC', k, iv16, new Uint8Array(badPad)).then(function () { out.push(['CBC 非法填充应报错', false]); }, function () { out.push(['CBC 非法填充报错', true]); }));",
      "jobs.push(C.aesDecrypt('AES-GCM', rb(32), iv12, new Uint8Array(nc.randomBytes(40))).then(function () { out.push(['错误密钥应解密失败', false]); }, function () { out.push(['错误密钥 GCM 解密失败', true]); }));",
      "Promise.all(jobs).then(function () { process.stdout.write(JSON.stringify(out)); });"
    ].join('\n');
    var r = childProcess.spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 60000 });
    var results = null;
    try { results = JSON.parse(r.stdout); } catch (e) { results = null; }
    t.ok(Array.isArray(results) && results.length > 0, 'AES 子进程正常完成', 'status=' + r.status + ' stderr=' + String(r.stderr).slice(0, 300));
    (results || []).forEach(function (x) { t.ok(x[1], 'AES ' + x[0]); });
  })();
};
