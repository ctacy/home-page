// AI Accept 2026-10-16 main v1
// 工具页路由：tools.html#<tool-id> 打开对应工具，无 hash 时显示全部工具索引。
(function () {
  'use strict';

  var Tools = window.Tools;
  var ui = Tools.ui;
  var el = ui.el;

  var menuRoot = document.getElementById('tools-menu-list');
  var searchInput = document.getElementById('tools-search');
  var searchResults = document.getElementById('tools-search-results');
  var viewRoot = document.getElementById('tool-view');
  var layout = document.getElementById('main');
  var baseTitle = '在线工具 · 沈超';
  var cleanup = null;
  var navLinks = {};
  var catButtons = {};
  var openPanel = null;

  function toolsOf(catId) {
    var out = [];
    for (var i = 0; i < Tools.list.length; i++) if (Tools.list[i].cat === catId) out.push(Tools.list[i]);
    return out;
  }

  function catName(catId) {
    for (var i = 0; i < Tools.categories.length; i++) if (Tools.categories[i].id === catId) return Tools.categories[i].name;
    return '';
  }

  // 与顶部菜单 / 索引页一致的分类编号
  function catNo(catId) {
    for (var i = 0; i < Tools.categories.length; i++) if (Tools.categories[i].id === catId) return pad2(i + 1);
    return '';
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // ---------- 顶部分类菜单 ----------
  function closePanel() {
    if (!openPanel) return;
    openPanel.btn.setAttribute('aria-expanded', 'false');
    openPanel.panel.hidden = true;
    openPanel = null;
  }

  function togglePanel(btn, panel) {
    var same = openPanel && openPanel.panel === panel;
    closePanel();
    closeSearch();
    if (same) return;
    btn.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    openPanel = { btn: btn, panel: panel };
  }

  function buildMenu() {
    menuRoot.textContent = '';
    for (var c = 0; c < Tools.categories.length; c++) {
      var cat = Tools.categories[c];
      var items = toolsOf(cat.id);
      if (!items.length) continue;
      var panelId = 'tools-panel-' + cat.id;
      var btn = el('button', { type: 'button', className: 'tools-menu-btn', 'aria-expanded': 'false', 'aria-controls': panelId }, [
        el('span', { className: 'nav-no', text: pad2(c + 1) }),
        cat.name
      ]);
      var panel = el('ul', { className: 'tools-panel', id: panelId, hidden: 'hidden' });
      for (var i = 0; i < items.length; i++) {
        var a = el('a', { href: '#' + items[i].id }, [
          el('span', { className: 'tools-panel-name', text: items[i].name }),
          el('span', { className: 'tools-panel-desc', text: items[i].desc || '' })
        ]);
        navLinks[items[i].id] = a;
        panel.appendChild(el('li', null, [a]));
      }
      (function (b, pn) {
        b.addEventListener('click', function (e) { e.stopPropagation(); togglePanel(b, pn); });
        pn.addEventListener('click', function (e) { if (e.target.closest('a')) closePanel(); });
      })(btn, panel);
      catButtons[cat.id] = btn;
      menuRoot.appendChild(el('li', { className: 'tools-menu-item' }, [btn, panel]));
    }
  }

  // ---------- 搜索 ----------
  function closeSearch() {
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
  }

  function runSearch() {
    var q = searchInput.value.trim().toLowerCase();
    searchResults.textContent = '';
    if (!q) { closeSearch(); return; }
    closePanel();
    var hits = 0;
    for (var i = 0; i < Tools.list.length; i++) {
      var t = Tools.list[i];
      var hay = (t.name + ' ' + (t.keywords || '') + ' ' + (t.desc || '') + ' ' + t.id).toLowerCase();
      if (hay.indexOf(q) < 0) continue;
      hits++;
      searchResults.appendChild(el('li', { role: 'option' }, [
        el('a', { href: '#' + t.id }, [
          el('span', { className: 'tools-panel-name', text: t.name }),
          el('span', { className: 'tools-panel-desc', text: catName(t.cat) })
        ])
      ]));
    }
    if (!hits) searchResults.appendChild(el('li', { className: 'tools-panel-empty', text: '没有匹配的工具' }));
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  // ---------- 视图 ----------
  function renderIndex() {
    layout.classList.remove('is-tool');
    document.title = baseTitle;
    viewRoot.textContent = '';
    viewRoot.appendChild(el('div', { className: 'section-head' }, [
      el('span', { className: 'kicker', text: '工具箱 · ' + Tools.categories.length + ' 类' }),
      el('span', { className: 'kicker', text: Tools.list.length + ' 个工具 · 纯前端' })
    ]));
    viewRoot.appendChild(el('h1', { className: 'section-title', id: 'tool-title', tabindex: '-1', text: '在线工具' }));
    viewRoot.appendChild(el('p', { className: 'section-sub', text: '全部在浏览器本地计算，输入内容不会上传到任何服务器。' }));

    for (var c = 0; c < Tools.categories.length; c++) {
      var cat = Tools.categories[c];
      var items = toolsOf(cat.id);
      if (!items.length) continue;
      var grid = el('ul', { className: 'tool-index' });
      for (var i = 0; i < items.length; i++) {
        grid.appendChild(el('li', null, [
          el('a', { className: 'tool-card', href: '#' + items[i].id }, [
            el('span', { className: 'tool-card-name', text: items[i].name }),
            el('span', { className: 'tool-card-desc', text: items[i].desc || '' })
          ])
        ]));
      }
      viewRoot.appendChild(el('section', { className: 'tool-index-group', 'aria-label': cat.name }, [
        el('h2', { className: 'sub-title' }, [el('span', { className: 'sec-no', text: pad2(c + 1) }), cat.name]),
        grid
      ]));
    }
  }

  function renderTool(def) {
    layout.classList.add('is-tool');
    document.title = def.name + ' · ' + baseTitle;
    viewRoot.textContent = '';
    // 工具页头部收紧，把纵向空间留给操作区
    viewRoot.appendChild(el('div', { className: 'tool-head' }, [
      el('h1', { className: 'tool-title', id: 'tool-title', tabindex: '-1', text: def.name }),
      def.desc ? el('p', { className: 'tool-desc', text: def.desc }) : null,
      el('span', { className: 'kicker tool-meta' }, [el('span', { className: 'sec-no', text: catNo(def.cat) }), catName(def.cat) + ' · 本地计算'])
    ]));
    var body = el('div', { className: 'tool-body' });
    viewRoot.appendChild(body);
    try {
      var ret = def.render(body, ui);
      if (typeof ret === 'function') cleanup = ret;
    } catch (e) {
      body.appendChild(el('p', { className: 'field-msg is-error', text: '工具加载失败：' + (e && e.message ? e.message : e) }));
    }
  }

  function route(focus) {
    if (cleanup) {
      try { cleanup(); } catch (e) { }
      cleanup = null;
    }
    var id = decodeURIComponent(location.hash.replace(/^#/, ''));
    var def = id ? Tools.get(id) : null;
    for (var k in navLinks) {
      if (k === id) navLinks[k].setAttribute('aria-current', 'page');
      else navLinks[k].removeAttribute('aria-current');
    }
    for (var c in catButtons) catButtons[c].classList.toggle('is-current', !!def && def.cat === c);
    closePanel();
    closeSearch();
    if (def) renderTool(def);
    else renderIndex();
    if (focus) {
      var t = document.getElementById('tool-title');
      if (t) t.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  buildMenu();
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', function () { if (searchInput.value.trim()) runSearch(); });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var first = searchResults.querySelector('a');
      if (first) { location.hash = first.getAttribute('href'); searchInput.blur(); }
    }
  });
  document.addEventListener('click', function (e) {
    if (openPanel && !openPanel.panel.contains(e.target)) closePanel();
    if (!searchResults.hidden && e.target !== searchInput && !searchResults.contains(e.target)) closeSearch();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (openPanel) { var b = openPanel.btn; closePanel(); b.focus(); }
    closeSearch();
  });
  window.addEventListener('hashchange', function () { route(true); });
  route(false);
})();
