// AI Accept 2026-07-14 main v1
// AI Accept 2026-10-16 main v1
(function () {
  'use strict';

  var STORAGE_KEY = 'theme-preference';
  var root = document.documentElement;
  var toggleBtn = document.getElementById('themeToggle');

  function getPreferredTheme() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (toggleBtn) {
      // 图标由 CSS 依 data-theme 切换，此处只同步无障碍状态
      toggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', theme === 'dark' ? '切换为浅色模式' : '切换为深色模式');
    }
  }

  var currentTheme = getPreferredTheme();
  applyTheme(currentTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, currentTheme);
      applyTheme(currentTheme);
    });
  }

  // 联系方式一键复制
  document.querySelectorAll('.contact-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var val = btn.getAttribute('data-val');
      if (!val) return;
      var orig = btn.textContent;
      navigator.clipboard.writeText(val).then(function () {
        btn.textContent = '已复制';
        setTimeout(function () { btn.textContent = orig; }, 1800);
      }, function () {
        // clipboard API 不可用时回退
        var ta = document.createElement('textarea');
        ta.value = val;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); btn.textContent = '已复制'; } catch (e) { btn.textContent = '请手动复制'; }
        document.body.removeChild(ta);
        setTimeout(function () { btn.textContent = orig; }, 1800);
      });
    });
  });

  // 版权年份动态更新
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // 从业年数按当前年份计算：[data-years-since="2010"] → 今年 - 2010（HTML 内的数字仅作无 JS 时的兜底）
  var thisYear = new Date().getFullYear();
  document.querySelectorAll('[data-years-since]').forEach(function (el) {
    var since = parseInt(el.getAttribute('data-years-since'), 10);
    if (since > 0 && thisYear > since) el.textContent = String(thisYear - since);
  });

  // 多域名备案号切换
  var beianEl = document.getElementById('beian-no');
  if (beianEl) {
    var host = window.location.hostname;
    var no = host.indexOf('shenchao.fun') >= 0 ? '蜀ICP备13002783号-3'
           : host.indexOf('shenchao.vip') >= 0 ? '蜀ICP备13002783号-4'
           : '蜀ICP备13002783号-1';
    beianEl.textContent = no;
  }

})();

