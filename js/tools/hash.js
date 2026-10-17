// AI Accept 2026-10-16 main v1
// 纯 JS 哈希算法库：MD5 / SHA-1 / SHA-224 / SHA-256 / SHA-384 / SHA-512 / HMAC / CRC-32 / CRC-16。
// 不依赖 crypto.subtle（HTTP 非安全上下文下不可用）与 BigInt；SHA-384/512 以 32 位高低位对实现。
// 接口（挂在 Tools.lib.hash）：
//   create(algo)            → { update(Uint8Array), digest() → Uint8Array }，支持分块增量计算
//   digest(algo, bytes)     → Uint8Array      hex(algo, bytes) → 小写十六进制
//   hmac(algo, key, msg)    → Uint8Array（key / msg 均为 Uint8Array）
//   crc32(bytes) → 无符号整数；crc32Create() → { update, digest() → 无符号整数 }
//   crc16(bytes, variant)   → 无符号整数，variant 见 CRC16_VARIANTS
// algo 取值：'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512'
(function (global) {
  'use strict';

  var Tools = global.Tools;

  // ---------- 常量 ----------
  var MD5_K = new Int32Array(64);
  for (var mi = 0; mi < 64; mi++) MD5_K[mi] = Math.floor(Math.abs(Math.sin(mi + 1)) * 4294967296) | 0;
  var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

  var K256 = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  // SHA-512 轮常量：每个 64 位常量拆成 [高 32 位, 低 32 位]
  var K512 = new Int32Array([
    0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
    0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
    0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
    0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
    0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
    0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
    0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
    0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
    0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
    0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
    0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
    0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
    0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
    0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
    0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
    0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
    0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
    0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
    0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
    0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
  ]);

  var IV = {
    md5: [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476],
    sha1: [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0],
    sha224: [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4],
    sha256: [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19],
    sha384: [0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939,
      0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4],
    sha512: [0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1,
      0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179]
  };

  function be32(b, o) {
    return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
  }

  function le32(b, o) {
    return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  }

  // ---------- 压缩函数：(state, bytes, offset) ----------
  var md5X = new Int32Array(16);
  function md5Block(H, b, o) {
    for (var i = 0; i < 16; i++) md5X[i] = le32(b, o + i * 4);
    var a = H[0], bb = H[1], c = H[2], d = H[3], f, g, t;
    for (i = 0; i < 64; i++) {
      if (i < 16) { f = (bb & c) | (~bb & d); g = i; }
      else if (i < 32) { f = (d & bb) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (bb | ~d); g = (7 * i) & 15; }
      t = (a + f + MD5_K[i] + md5X[g]) | 0;
      a = d; d = c; c = bb;
      bb = (bb + ((t << MD5_S[i]) | (t >>> (32 - MD5_S[i])))) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
  }

  var sha1W = new Int32Array(80);
  function sha1Block(H, b, o) {
    var W = sha1W, i, t;
    for (i = 0; i < 16; i++) W[i] = be32(b, o + i * 4);
    for (; i < 80; i++) {
      t = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
      W[i] = (t << 1) | (t >>> 31);
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f, k;
    for (i = 0; i < 80; i++) {
      if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      t = (((a << 5) | (a >>> 27)) + f + e + k + W[i]) | 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = t;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0;
  }

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  var sha256W = new Int32Array(64);
  function sha256Block(H, b, o) {
    var W = sha256W, i, s0, s1, t1, t2;
    for (i = 0; i < 16; i++) W[i] = be32(b, o + i * 4);
    for (; i < 64; i++) {
      s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) | 0;
      t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  // 64 位运算：值以 (hi, lo) 两个 32 位整数表示；结果写入 rH / rL
  var rH = 0, rL = 0;
  function rotr64(h, l, n) {
    if (n < 32) {
      rH = (h >>> n) | (l << (32 - n));
      rL = (l >>> n) | (h << (32 - n));
    } else {
      n -= 32;
      rH = (l >>> n) | (h << (32 - n));
      rL = (h >>> n) | (l << (32 - n));
    }
  }

  var sha512W = new Int32Array(160);
  function sha512Block(H, b, o) {
    var W = sha512W, i, j, xh, xl, s0h, s0l, s1h, s1l, lo;
    for (i = 0; i < 32; i++) W[i] = be32(b, o + i * 4);
    for (i = 16; i < 80; i++) {
      // σ0(W[i-15]) = ROTR1 ^ ROTR8 ^ SHR7
      xh = W[(i - 15) * 2]; xl = W[(i - 15) * 2 + 1];
      rotr64(xh, xl, 1); s0h = rH; s0l = rL;
      rotr64(xh, xl, 8); s0h ^= rH; s0l ^= rL;
      s0h ^= xh >>> 7; s0l ^= (xl >>> 7) | (xh << 25);
      // σ1(W[i-2]) = ROTR19 ^ ROTR61 ^ SHR6
      xh = W[(i - 2) * 2]; xl = W[(i - 2) * 2 + 1];
      rotr64(xh, xl, 19); s1h = rH; s1l = rL;
      rotr64(xh, xl, 61); s1h ^= rH; s1l ^= rL;
      s1h ^= xh >>> 6; s1l ^= (xl >>> 6) | (xh << 26);
      lo = (s1l >>> 0) + (W[(i - 7) * 2 + 1] >>> 0) + (s0l >>> 0) + (W[(i - 16) * 2 + 1] >>> 0);
      W[i * 2] = (s1h + W[(i - 7) * 2] + s0h + W[(i - 16) * 2] + Math.floor(lo / 4294967296)) | 0;
      W[i * 2 + 1] = lo | 0;
    }

    var ah = H[0], al = H[1], bh = H[2], bl = H[3], ch = H[4], cl = H[5], dh = H[6], dl = H[7];
    var eh = H[8], el = H[9], fh = H[10], fl = H[11], gh = H[12], gl = H[13], hh = H[14], hl = H[15];
    var S1h, S1l, chh, chl, S0h, S0l, mjh, mjl, t1h, t1l, t2h, t2l;
    for (i = 0; i < 80; i++) {
      j = i * 2;
      // Σ1(e) = ROTR14 ^ ROTR18 ^ ROTR41
      rotr64(eh, el, 14); S1h = rH; S1l = rL;
      rotr64(eh, el, 18); S1h ^= rH; S1l ^= rL;
      rotr64(eh, el, 41); S1h ^= rH; S1l ^= rL;
      chh = (eh & fh) ^ (~eh & gh); chl = (el & fl) ^ (~el & gl);
      lo = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[j + 1] >>> 0) + (W[j + 1] >>> 0);
      t1h = (hh + S1h + chh + K512[j] + W[j] + Math.floor(lo / 4294967296)) | 0;
      t1l = lo | 0;
      // Σ0(a) = ROTR28 ^ ROTR34 ^ ROTR39
      rotr64(ah, al, 28); S0h = rH; S0l = rL;
      rotr64(ah, al, 34); S0h ^= rH; S0l ^= rL;
      rotr64(ah, al, 39); S0h ^= rH; S0l ^= rL;
      mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch); mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      lo = (S0l >>> 0) + (mjl >>> 0);
      t2h = (S0h + mjh + Math.floor(lo / 4294967296)) | 0;
      t2l = lo | 0;

      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      lo = (dl >>> 0) + (t1l >>> 0);
      eh = (dh + t1h + Math.floor(lo / 4294967296)) | 0; el = lo | 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      lo = (t1l >>> 0) + (t2l >>> 0);
      ah = (t1h + t2h + Math.floor(lo / 4294967296)) | 0; al = lo | 0;
    }

    var v = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
    for (i = 0; i < 16; i += 2) {
      lo = (H[i + 1] >>> 0) + (v[i + 1] >>> 0);
      H[i] = (H[i] + v[i] + Math.floor(lo / 4294967296)) | 0;
      H[i + 1] = lo | 0;
    }
  }

  // ---------- 算法描述 ----------
  // block: 块字节数；lenBytes: 末尾长度字段字节数；littleEndian: MD5 为小端；out: 输出字节数
  var SPECS = {
    md5: { block: 64, lenBytes: 8, littleEndian: true, out: 16, compress: md5Block },
    sha1: { block: 64, lenBytes: 8, out: 20, compress: sha1Block },
    sha224: { block: 64, lenBytes: 8, out: 28, compress: sha256Block },
    sha256: { block: 64, lenBytes: 8, out: 32, compress: sha256Block },
    sha384: { block: 128, lenBytes: 16, out: 48, compress: sha512Block },
    sha512: { block: 128, lenBytes: 16, out: 64, compress: sha512Block }
  };

  function Hasher(algo) {
    var spec = SPECS[algo];
    if (!spec) throw new Error('不支持的哈希算法：' + algo);
    this.algo = algo;
    this.spec = spec;
    this.state = new Int32Array(IV[algo]);
    this.buf = new Uint8Array(spec.block);
    this.bufLen = 0;
    this.total = 0; // 已输入字节数（Number，安全到 2^53）
    this.done = false;
  }

  Hasher.prototype.update = function (data) {
    if (this.done) throw new Error('digest() 之后不能再 update()');
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    var spec = this.spec, block = spec.block, buf = this.buf, pos = 0, len = data.length;
    this.total += len;
    if (this.bufLen) {
      var need = block - this.bufLen;
      if (len < need) {
        buf.set(data, this.bufLen);
        this.bufLen += len;
        return this;
      }
      buf.set(data.subarray(0, need), this.bufLen);
      spec.compress(this.state, buf, 0);
      pos = need;
      this.bufLen = 0;
    }
    for (; pos + block <= len; pos += block) spec.compress(this.state, data, pos);
    if (pos < len) {
      buf.set(data.subarray(pos), 0);
      this.bufLen = len - pos;
    }
    return this;
  };

  Hasher.prototype.digest = function () {
    if (this.done) throw new Error('digest() 只能调用一次');
    var spec = this.spec, block = spec.block, total = this.total;
    var padLen = block - ((this.bufLen + 1 + spec.lenBytes) % block);
    if (padLen === block) padLen = 0;
    var pad = new Uint8Array(1 + padLen + spec.lenBytes);
    pad[0] = 0x80;
    // 位长度 = total * 8，拆为高低 32 位（避免超出 2^32 时位运算截断）
    var bitsHi = Math.floor(total / 0x20000000);
    var bitsLo = (total % 0x20000000) * 8;
    var e = pad.length, i;
    if (spec.littleEndian) {
      var p = 1 + padLen;
      for (i = 0; i < 4; i++) pad[p + i] = (bitsLo >>> (8 * i)) & 0xff;
      for (i = 0; i < 4; i++) pad[p + 4 + i] = (bitsHi >>> (8 * i)) & 0xff;
    } else {
      for (i = 0; i < 4; i++) pad[e - 1 - i] = (bitsLo >>> (8 * i)) & 0xff;
      for (i = 0; i < 4; i++) pad[e - 5 - i] = (bitsHi >>> (8 * i)) & 0xff;
    }
    var keepTotal = this.total;
    this.update(pad);
    this.total = keepTotal;
    this.done = true;

    var H = this.state, out = new Uint8Array(spec.out);
    for (i = 0; i < spec.out; i++) {
      var w = H[i >> 2];
      out[i] = spec.littleEndian ? (w >>> (8 * (i & 3))) & 0xff : (w >>> (24 - 8 * (i & 3))) & 0xff;
    }
    return out;
  };

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }

  function digest(algo, bytes) {
    return new Hasher(algo).update(bytes).digest();
  }

  function hmac(algo, key, msg) {
    var spec = SPECS[algo];
    if (!spec) throw new Error('不支持的哈希算法：' + algo);
    var B = spec.block;
    if (key.length > B) key = digest(algo, key);
    var k0 = new Uint8Array(B);
    k0.set(key);
    var ipad = new Uint8Array(B), opad = new Uint8Array(B);
    for (var i = 0; i < B; i++) {
      ipad[i] = k0[i] ^ 0x36;
      opad[i] = k0[i] ^ 0x5c;
    }
    var inner = new Hasher(algo).update(ipad).update(msg).digest();
    return new Hasher(algo).update(opad).update(inner).digest();
  }

  // ---------- CRC ----------
  var CRC32_TABLE = new Int32Array(256);
  for (var ci = 0; ci < 256; ci++) {
    var cv = ci;
    for (var ck = 0; ck < 8; ck++) cv = cv & 1 ? 0xedb88320 ^ (cv >>> 1) : cv >>> 1;
    CRC32_TABLE[ci] = cv;
  }

  // CRC-32（IEEE 802.3 / zlib）：多项式 0x04C11DB7（反射 0xEDB88320），初值与结果异或 0xFFFFFFFF
  function crc32Create() {
    var c = -1;
    return {
      update: function (bytes) {
        for (var i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        return this;
      },
      digest: function () {
        return (c ^ -1) >>> 0;
      }
    };
  }

  function crc32(bytes) {
    return crc32Create().update(bytes).digest();
  }

  // CRC-16 常见变体（参数取自 CRC RevEng 目录，check 为 "123456789" 的结果）
  var CRC16_VARIANTS = {
    modbus: { name: 'CRC-16/MODBUS', poly: 0x8005, init: 0xffff, refin: true, xorout: 0, check: 0x4b37 },
    'ccitt-false': { name: 'CRC-16/CCITT-FALSE', poly: 0x1021, init: 0xffff, refin: false, xorout: 0, check: 0x29b1 },
    xmodem: { name: 'CRC-16/XMODEM', poly: 0x1021, init: 0, refin: false, xorout: 0, check: 0x31c3 },
    arc: { name: 'CRC-16/ARC (IBM)', poly: 0x8005, init: 0, refin: true, xorout: 0, check: 0xbb3d }
  };

  function reflect16(v) {
    var r = 0;
    for (var i = 0; i < 16; i++) if (v & (1 << i)) r |= 1 << (15 - i);
    return r;
  }

  function crc16(bytes, variant) {
    var p = CRC16_VARIANTS[variant || 'modbus'];
    if (!p) throw new Error('未知的 CRC-16 变体：' + variant);
    var crc = p.init, i, k;
    if (p.refin) {
      var rp = reflect16(p.poly);
      for (i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ rp : crc >>> 1;
      }
    } else {
      for (i = 0; i < bytes.length; i++) {
        crc ^= bytes[i] << 8;
        for (k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ p.poly) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return (crc ^ p.xorout) & 0xffff;
  }

  var api = {
    ALGOS: ['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'],
    NAMES: { md5: 'MD5', sha1: 'SHA-1', sha224: 'SHA-224', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' },
    BLOCK_SIZE: { md5: 64, sha1: 64, sha224: 64, sha256: 64, sha384: 128, sha512: 128 },
    create: function (algo) { return new Hasher(algo); },
    digest: digest,
    hex: function (algo, bytes) { return toHex(digest(algo, bytes)); },
    hmac: hmac,
    crc32: crc32,
    crc32Create: crc32Create,
    crc16: crc16,
    CRC16_VARIANTS: CRC16_VARIANTS
  };

  if (Tools) Tools.lib.hash = api;
})(typeof window !== 'undefined' ? window : globalThis);
