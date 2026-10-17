// AI Accept 2026-10-16 main v1
// 在线工具公共内核：注册表 + 纯函数库命名空间 + DOM 组件。
// 约定：
//   - 各分类文件只调用 Tools.register(def) 与挂载 Tools.lib.xxx 纯函数，载入时不得访问 document（便于 node 单测）。
//   - def = { id, cat, name, desc, keywords?, render: function (root, ui) { ...; return cleanupFn?; } }
//   - 用户输入一律通过 textContent / value 输出，禁止 innerHTML 拼接。
(function (global) {
  'use strict';

  var CATEGORIES = [
    { id: 'json', name: 'JSON 工具' },
    { id: 'format', name: '格式化' },
    { id: 'encode', name: '编码转换' },
    { id: 'crypto', name: '哈希与加密' },
    { id: 'dev', name: '开发辅助' }
  ];

  var registry = [];
  var byId = {};

  var Tools = {
    categories: CATEGORIES,
    list: registry,
    lib: {},
    register: function (def) {
      if (!def || !def.id || !def.cat || !def.name || typeof def.render !== 'function') {
        throw new Error('Tools.register: 缺少 id/cat/name/render');
      }
      if (byId[def.id]) throw new Error('Tools.register: id 重复 ' + def.id);
      var catOk = false;
      for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === def.cat) catOk = true;
      if (!catOk) throw new Error('Tools.register: 未知分类 ' + def.cat);
      byId[def.id] = def;
      registry.push(def);
    },
    get: function (id) {
      return byId[id] || null;
    }
  };

  // ---------- 文本 / 字节通用纯函数 ----------
  Tools.lib.utf8Encode = function (str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var bin = unescape(encodeURIComponent(str));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  Tools.lib.utf8Decode = function (bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(bin));
  };

  Tools.lib.bytesToHex = function (bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return hex;
  };

  Tools.lib.hexToBytes = function (hex) {
    hex = String(hex).replace(/\s+/g, '');
    if (hex.length % 2 || /[^0-9a-fA-F]/.test(hex)) throw new Error('不是合法的十六进制字符串');
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  };

  // ---------- DOM 组件（仅浏览器内调用） ----------
  var uid = 0;
  function nextId(prefix) {
    uid += 1;
    return (prefix || 'f') + '-' + uid;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null) continue;
        if (k === 'className') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'value') node.value = attrs[k];
        else if (k === 'checked' || k === 'readOnly' || k === 'disabled' || k === 'multiple') node[k] = !!attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null || c === false) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function fallbackCopy(text) {
    var ta = el('textarea', { value: text, readonly: 'readonly' });
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  var ui = {
    el: el,

    // 标签 + 控件；control 有 id 时 label 自动关联
    field: function (labelText, control, hint) {
      var id = control.id || nextId('f');
      control.id = id;
      return el('div', { className: 'field-group' }, [
        el('label', { className: 'field-label', 'for': id, text: labelText }),
        control,
        hint ? el('p', { className: 'field-hint', text: hint }) : null
      ]);
    },

    textarea: function (opts) {
      opts = opts || {};
      return el('textarea', {
        className: 'field-input' + (opts.mono === false ? '' : ' is-mono'),
        rows: opts.rows || 8,
        placeholder: opts.placeholder || '',
        value: opts.value || '',
        readOnly: opts.readonly,
        spellcheck: 'false',
        autocomplete: 'off'
      });
    },

    // 只读结果框（多行），便于全选复制
    output: function (opts) {
      opts = opts || {};
      return ui.textarea({ rows: opts.rows || 8, readonly: true, placeholder: opts.placeholder || '结果将显示在这里' });
    },

    input: function (opts) {
      opts = opts || {};
      return el('input', {
        className: 'field-input' + (opts.mono ? ' is-mono' : ''),
        type: opts.type || 'text',
        value: opts.value == null ? '' : String(opts.value),
        placeholder: opts.placeholder || '',
        min: opts.min, max: opts.max, step: opts.step,
        readOnly: opts.readonly,
        spellcheck: 'false',
        autocomplete: 'off'
      });
    },

    // options: ['a','b'] 或 [{ value, label }]
    select: function (options, value) {
      var s = el('select', { className: 'field-input' });
      for (var i = 0; i < options.length; i++) {
        var o = typeof options[i] === 'string' ? { value: options[i], label: options[i] } : options[i];
        s.appendChild(el('option', { value: o.value, text: o.label }));
      }
      if (value != null) s.value = value;
      return s;
    },

    // 返回 { root, input }
    checkbox: function (labelText, checked) {
      var input = el('input', { type: 'checkbox', checked: checked });
      return { root: el('label', { className: 'check' }, [input, el('span', { text: labelText })]), input: input };
    },

    button: function (text, onClick, primary) {
      var b = el('button', { type: 'button', className: 'btn' + (primary ? ' btn-primary' : ''), text: text });
      if (onClick) b.addEventListener('click', onClick);
      return b;
    },

    actions: function (nodes) {
      return el('div', { className: 'tool-actions' }, nodes);
    },

    // 一行并排的若干选项（select / checkbox / 小输入框）
    inline: function (nodes) {
      return el('div', { className: 'tool-inline' }, nodes);
    },

    // 两栏（≥900px），窄屏自动堆叠
    grid: function (nodes) {
      return el('div', { className: 'tool-grid' }, nodes);
    },

    status: function () {
      var p = el('p', { className: 'field-msg', role: 'status', 'aria-live': 'polite' });
      p.ok = function (t) { p.className = 'field-msg is-ok'; p.textContent = t || ''; };
      p.error = function (t) { p.className = 'field-msg is-error'; p.textContent = t || ''; };
      p.info = function (t) { p.className = 'field-msg'; p.textContent = t || ''; };
      p.clear = function () { p.className = 'field-msg'; p.textContent = ''; };
      return p;
    },

    copy: function (text, status) {
      if (!text) {
        if (status) status.error('暂无内容可复制');
        return;
      }
      function done(ok) {
        if (!status) return;
        if (ok) status.ok('已复制到剪贴板');
        else status.error('复制失败，请手动选择复制');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else {
        done(fallbackCopy(text));
      }
    },

    // getText: function 或 输入控件
    copyButton: function (getText, status, label) {
      return ui.button(label || '复制结果', function () {
        var t = typeof getText === 'function' ? getText() : getText.value;
        ui.copy(t, status);
      });
    },

    // 键值结果表：set([{ label, value }])，每行带复制
    kv: function (status) {
      var list = el('dl', { className: 'kv' });
      return {
        root: list,
        set: function (rows) {
          list.textContent = '';
          for (var i = 0; i < rows.length; i++) {
            (function (row) {
              var v = el('dd', { className: 'kv-value', text: row.value == null ? '' : String(row.value) });
              list.appendChild(el('div', { className: 'kv-row' }, [
                el('dt', { className: 'kv-label', text: row.label }),
                v,
                ui.button('复制', function () { ui.copy(v.textContent, status); })
              ]));
            })(rows[i]);
          }
        }
      };
    },

    debounce: function (fn, ms) {
      var t = null;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms == null ? 200 : ms);
      };
    },

    // as: 'text' | 'arraybuffer' | 'dataurl'
    readFile: function (file, as, cb) {
      var r = new FileReader();
      r.onload = function () { cb(null, r.result); };
      r.onerror = function () { cb(r.error || new Error('读取文件失败')); };
      if (as === 'arraybuffer') r.readAsArrayBuffer(file);
      else if (as === 'dataurl') r.readAsDataURL(file);
      else r.readAsText(file);
    }
  };

  Tools.ui = ui;
  global.Tools = Tools;
})(typeof window !== 'undefined' ? window : globalThis);
