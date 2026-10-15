/* Trang lý thuyết git-training: nút sao chép, khởi tạo Mermaid, lọc chỉ mục. Không dùng mạng. */
(function () {
  'use strict';
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // Nút sao chép cho khối mã
  document.querySelectorAll('.code-block').forEach(function (block) {
    var code = block.querySelector('code');
    if (!code) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Sao chép';
    btn.setAttribute('aria-label', 'Sao chép nội dung khối mã');
    btn.addEventListener('click', function () {
      var text = code.textContent;
      var done = function (ok) {
        btn.textContent = ok ? 'Đã chép' : 'Không chép được';
        setTimeout(function () { btn.textContent = 'Sao chép'; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(text, done); });
      } else { fallback(text, done); }
    });
    block.appendChild(btn);
  });
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta); done(ok);
  }

  // Mermaid (bản vendor trong assets, chạy offline)
  var blocks = Array.prototype.slice.call(document.querySelectorAll('pre.mermaid'));
  if (blocks.length && window.mermaid) {
    blocks.forEach(function (el) { el.setAttribute('data-src', el.textContent); });
    var render = function () {
      blocks.forEach(function (el) {
        el.removeAttribute('data-processed');
        el.textContent = el.getAttribute('data-src');
      });
      window.mermaid.initialize({
        startOnLoad: false,
        theme: dark && dark.matches ? 'dark' : 'default',
        securityLevel: 'strict',
        htmlLabels: true,
        flowchart: { htmlLabels: true },
        fontFamily: "'Be Vietnam Pro','Segoe UI',Roboto,Arial,sans-serif"
      });
      return window.mermaid.run({ nodes: blocks, suppressErrors: true });
    };
    var fonts = document.fonts && document.fonts.load
      ? Promise.all([
          document.fonts.load('400 16px "Be Vietnam Pro"', 'Tiếng Việt ệ ử ơ đ'),
          document.fonts.load('700 16px "Be Vietnam Pro"', 'Tiếng Việt ệ ử ơ đ')
        ]).catch(function () {})
      : Promise.resolve();
    fonts.then(render).then(function () { document.documentElement.setAttribute('data-mermaid', 'done'); });
    if (dark && dark.addEventListener) dark.addEventListener('change', render);
  } else {
    document.documentElement.setAttribute('data-mermaid', 'none');
  }

  // Lọc chỉ mục
  var input = document.getElementById('search');
  if (input) {
    var norm = function (s) {
      return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    };
    var items = Array.prototype.slice.call(document.querySelectorAll('.lessons li'));
    var tracks = Array.prototype.slice.call(document.querySelectorAll('.track'));
    var empty = document.getElementById('empty');
    var count = document.getElementById('count');
    items.forEach(function (li) { li.setAttribute('data-n', norm(li.textContent + ' ' + (li.getAttribute('data-keys') || ''))); });
    input.addEventListener('input', function () {
      var terms = norm(input.value).split(/\s+/).filter(Boolean);
      var shown = 0;
      items.forEach(function (li) {
        var hay = li.getAttribute('data-n');
        var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; });
        li.hidden = !ok; if (ok) shown++;
      });
      tracks.forEach(function (t) { t.hidden = !t.querySelector('.lessons li:not([hidden])'); });
      if (empty) empty.hidden = shown !== 0;
      if (count) count.textContent = terms.length ? 'Hiển thị ' + shown + ' bài.' : '';
    });
  }
})();
