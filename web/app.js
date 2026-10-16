/* Bảng học web của git-training: JavaScript thuần, không thư viện, không gọi mạng ngoài. */
(function () {
  'use strict';
  var boot = JSON.parse(document.getElementById('boot').textContent || '{}');
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var esc = function (value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /** Gọi máy chủ cục bộ. Không bao giờ throw: mất kết nối trả về { ok: false, offline: true }. */
  function api(path, body) {
    var options = { cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) { options.method = 'POST'; options.body = JSON.stringify(body); }
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return { ok: false, error: 'Phản hồi không hợp lệ.' }; }).then(function (data) {
        if (response.status === 409 && data.code === 'no-session') { location.href = '/'; }
        return data;
      });
    }, function () { return { ok: false, offline: true, error: 'Mất kết nối với git-training.' }; });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  // Giữ cho máy chủ biết còn có người dùng (để không tự dừng khi đang đọc ở trang tĩnh).
  setInterval(function () { if (!document.hidden) api('/api/ping', {}); }, 30000);

  function openLesson(course, lesson, errorBox) {
    return api('/api/open', { course: course || undefined, lesson: lesson || undefined }).then(function (result) {
      if (result.ok) { location.href = '/lesson'; return; }
      if (errorBox) { errorBox.textContent = result.error || 'Không mở được bài này.'; errorBox.hidden = false; }
    });
  }

  if (boot.page === 'welcome') {
    var start = $('#start');
    if (start) start.addEventListener('click', function () {
      var course = start.getAttribute('data-course');
      if (!course) { location.href = '/lesson'; return; }
      start.disabled = true;
      openLesson(course, '', $('#start-error')).then(function () { start.disabled = false; });
    });
  } else if (boot.page === 'progress') {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-open]');
      if (!button) return;
      button.disabled = true;
      openLesson(button.getAttribute('data-course'), button.getAttribute('data-lesson'), $('#open-error')).then(function () { button.disabled = false; });
    });
  } else if (boot.page === 'lesson') {
    initLesson();
  }

  /* ───────────────────────── Trang bài học ───────────────────────── */
  function initLesson() {
    var root = $('#app');
    var tickSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="tick" pathLength="22" d="M3 8.5l3.2 3.2L13 5"/></svg>';
    var state = null;
    var mountedId = null;
    var previousCurrent = null;
    var previousStates = {};
    var opened = {};
    var signatures = {};
    var timer = null;
    var offline = false;
    var theoryReturn = null;
    var polling = false;

    function load(after) {
      api('/api/lesson').then(function (result) {
        if (!result.ok) {
          root.setAttribute('aria-busy', 'false');
          root.innerHTML = '<div class="note" role="alert"><p class="font-semibold">Không mở được bài học.</p><p class="mt-1">' + esc(result.error || 'Hãy chạy lại git-training.') + '</p></div><p class="mt-6"><a class="link" href="/progress">Chọn một bài khác</a></p>';
          return;
        }
        update(result.state, {});
        schedule(0);
        if (after) after();
      }).catch(function (e) { console.error('LOAD ' + e.stack); });
    }

    /** Cho phép ngắt dòng sau dấu / hoặc \\ để đường dẫn dài không bị cắt giữa chữ. */
    function pathHtml(text) { return esc(text).replace(/([\/\\])/g, '$1<wbr>'); }

    function mount(s) {
      var ex = s.exercise;
      mountedId = s.course.id + '/' + ex.id;
      signatures = {}; previousStates = {}; previousCurrent = null; opened = {};
      var layout = ex.hasTheory ? 'lg:grid-cols-[minmax(0,29rem)_minmax(0,1fr)] lg:gap-12' : 'mx-auto max-w-3xl';
      root.setAttribute('aria-busy', 'false');
      root.innerHTML =
        '<div class="grid gap-10 ' + layout + '">' +
        '<div class="min-w-0">' +
          '<p class="eyebrow">' + esc(s.course.title) + ' · Bài ' + s.position + '/' + s.total + '</p>' +
          '<h1 class="mt-3 text-2xl font-semibold tracking-tight sm:text-[2rem] sm:leading-tight" id="lesson-title" tabindex="-1">' + esc(ex.title) + '</h1>' +
          (ex.simulated ? '<p class="mt-2 text-sm text-muted">Bài mô phỏng: không cần tài khoản hay mạng thật.</p>' : '') +
          '<section class="mt-6" aria-labelledby="task-h"><h2 id="task-h" class="label">Nhiệm vụ</h2>' +
            '<p class="mt-2 whitespace-pre-line text-lg">' + esc(ex.task) + '</p>' +
            (ex.expected ? '<h2 class="label mt-5">Kết quả cần đạt</h2><p class="mt-2">' + esc(ex.expected) + '</p>' : '') +
          '</section>' +
          '<div id="problem"></div><div id="banner" aria-live="polite"></div>' +
          '<div id="net" class="note mt-6" role="alert" hidden><p class="font-semibold">Mất kết nối với git-training.</p><p class="mt-1">Cửa sổ terminal đã dừng? Hãy chạy lại <code>git-training</code> rồi mở đường dẫn mới. Tiến độ đã lưu không bị mất.</p></div>' +
          '<section class="mt-8" aria-labelledby="steps-h">' +
            '<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h2 id="steps-h" class="text-xl font-semibold">Các bước</h2><p id="live" class="flex items-center gap-2 text-sm text-muted" hidden></p></div>' +
            '<ol class="steps mt-5" id="steps">' + s.steps.map(stepShell).join('') + '</ol>' +
          '</section>' +
          helpSection() +
        '</div>' +
        (ex.hasTheory ? theoryPanel(s) : '') +
        '</div>';
    }

    function stepShell(step) {
      return '<li class="step" id="step-' + step.id + '" data-step="' + step.id + '" data-state="todo">' +
        '<span class="marker" aria-hidden="true"></span>' +
        '<h3><button type="button" class="step-head" id="head-' + step.id + '" aria-expanded="false" aria-controls="body-' + step.id + '" data-act="toggle" data-step="' + step.id + '">' +
          '<span><span class="sr-only">Bước ' + step.number + ': </span>' + esc(step.label) + '</span><span class="step-note"></span></button></h3>' +
        '<div class="step-body" id="body-' + step.id + '" role="region" aria-labelledby="head-' + step.id + '" hidden></div></li>';
    }

    function helpSection() {
      return '<section class="mt-10 border-t border-line pt-6" aria-labelledby="help-h"><h2 id="help-h" class="text-xl font-semibold">Cần giúp?</h2>' +
        '<details id="hints" class="mt-3 border-b border-line pb-3"><summary class="flex min-h-11 items-center font-medium">Gợi ý&nbsp;<span id="hints-count" class="font-normal text-muted"></span></summary>' +
          '<div class="mt-2"><ol id="hints-list" class="list-decimal space-y-2 pl-6"></ol><p id="hints-empty" class="text-muted">Gợi ý đi từng chút một, không tiết lộ ngay đáp án.</p>' +
          '<div class="mt-3"><button type="button" class="btn btn-sm" data-act="hint" id="hint-btn">Xem gợi ý</button></div><p id="hint-msg" class="mt-2 text-sm text-muted" role="status"></p></div></details>' +
        '<details id="solution" class="border-b border-line pb-3"><summary class="flex min-h-11 items-center font-medium">Lời giải</summary>' +
          '<div class="mt-2"><p>Lời giải cho bạn đáp án luôn, nên bạn sẽ bớt được phần tự nghĩ. Hãy thử gợi ý trước nhé.</p>' +
          '<div class="mt-3" id="solution-ask"><button type="button" class="btn btn-sm" data-act="solution-ask">Tôi vẫn muốn xem lời giải</button></div>' +
          '<div class="note mt-3" id="solution-confirm" hidden><p>Bạn chắc chắn muốn xem lời giải chứ?</p><div class="mt-3 flex flex-wrap gap-3"><button type="button" class="btn btn-sm btn-primary" data-act="solution-yes">Có, hiện lời giải</button><button type="button" class="btn btn-sm" data-act="solution-no">Không, để mình tự làm</button></div></div>' +
          '<pre class="code mt-3 whitespace-pre-wrap" id="solution-text" tabindex="0" hidden></pre></div></details>' +
        '<details id="restart" class="pb-3"><summary class="flex min-h-11 items-center font-medium">Làm lại bài này từ đầu</summary>' +
          '<div class="mt-2"><p>Thư mục bài tập của bài này sẽ được tạo lại như ban đầu; mọi thay đổi bạn đã làm trong thư mục đó sẽ mất. Tiến độ các bài đã xong vẫn giữ nguyên.</p>' +
          '<div class="mt-3"><button type="button" class="btn btn-sm" data-act="restart">Có, làm lại từ đầu</button></div></div></details></section>';
    }

    function theoryPanel(s) {
      var url = s.exercise.theoryUrl;
      return '<aside id="theory" aria-label="Bài lý thuyết" class="theory hidden min-w-0 overflow-hidden rounded-md border border-line bg-surface lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-2rem)] lg:flex-col">' +
        '<div class="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2"><h2 class="text-base font-semibold">Bài lý thuyết</h2>' +
          '<div class="flex items-center gap-4"><a class="link text-sm" href="' + esc(url) + '" target="_blank" rel="noopener">Mở trong tab mới</a>' +
          '<button type="button" class="btn btn-sm lg:hidden" data-act="theory-close">Quay lại bài</button></div></div>' +
        '<iframe title="Nội dung bài lý thuyết: ' + esc(s.exercise.title) + '" src="' + esc(url) + '?embed=1" class="min-h-0 w-full flex-1 border-0 bg-surface" loading="lazy"></iframe></aside>';
    }

    /* ───── nội dung từng bước ───── */
    function bodyTheory(s, step) {
      var done = step.state === 'done';
      return '<p class="hidden lg:block">Bài lý thuyết nằm ở khung bên phải. ' + (done ? 'Bạn có thể đọc lại bất cứ lúc nào.' : 'Đọc xong thì bấm nút bên dưới.') + '</p>' +
        '<p class="lg:hidden">Bài lý thuyết ngắn giải thích khái niệm trước khi bạn làm bài.</p>' +
        '<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">' +
        '<button type="button" class="btn lg:hidden" data-act="theory-open">Mở bài lý thuyết</button>' +
        (done ? '' : '<button type="button" class="btn btn-primary" data-act="flag" data-step="theory">Tôi đã đọc xong</button>') +
        '</div>';
    }
    function bodyWork(s, step) {
      var look = s.exercise.mode === 'answer';
      var html = '<p>Mở một cửa sổ terminal <strong class="font-semibold">mới</strong> (đừng đóng cửa sổ đang chạy git-training), rồi dán lệnh này để vào thư mục bài tập:</p>' +
        '<code class="code mt-3 block" id="cd">' + pathHtml(s.cd) + '</code>' +
        '<div class="mt-2"><button type="button" class="btn btn-sm" data-act="copy" id="copy-btn"><span>Chép lệnh</span></button></div>' +
        '<p id="copy-msg" class="sr-only" role="status"></p>' +
        '<details class="mt-3"><summary class="inline-flex min-h-9 items-center link">Chưa biết mở terminal?</summary><p class="mt-2 text-muted">' + esc(s.terminalHelp) + '</p></details>' +
        '<p class="mt-4">Hoặc xem các tệp bằng ' + esc(s.fileManager) + ':</p>' +
        '<div class="mt-2 flex flex-wrap items-center gap-3"><button type="button" class="btn btn-sm" data-act="open-folder">Mở thư mục</button><span id="folder-msg" class="text-sm text-muted" role="status"></span></div>' +
        '<p class="mt-3 text-sm text-muted" style="overflow-wrap:anywhere">Thư mục: ' + pathHtml(s.repo) + '</p>';
      if (look) {
        html += '<p class="mt-4">Chạy các lệnh Git để xem repo (ví dụ <code>git status</code>, <code>git log</code>), rồi sang bước tiếp theo.</p>' +
          (step.state === 'done' ? '' : '<div class="mt-3"><button type="button" class="btn btn-primary" data-act="flag" data-step="work">Tôi đã xem xong</button></div>');
      } else if (!s.complete) {
        html += '<div class="mt-5 border-t border-line pt-4" aria-live="polite">' +
          (s.gitPass ? '<p class="font-medium text-ok">Phần thực hành đã đúng.</p>' :
            '<p class="flex items-center gap-2 font-medium"><span class="spinner" aria-hidden="true"></span>Đang chờ bạn làm xong…</p>' +
            (s.missing.length ? '<p class="mt-3 text-sm font-semibold text-muted">Còn thiếu</p><ul class="mt-1 list-disc space-y-1 pl-6">' + s.missing.slice(0, 4).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '')) +
          '</div>';
      }
      return html;
    }
    function bodyAnswer(s, step) {
      if (s.answerPass) return '<p>Đáp án của bạn: <strong class="font-semibold">' + esc(s.savedAnswer || '') + '</strong>. Đúng rồi.</p>';
      return '<form id="answer-form" novalidate><label for="answer" class="block text-lg font-medium">' + esc(s.exercise.question || '') + '</label>' +
        '<p id="answer-help" class="mt-1 text-sm text-muted">Gõ câu trả lời ngắn gọn rồi nhấn Enter.</p>' +
        '<div class="mt-3 flex flex-col gap-3 sm:flex-row"><input id="answer" name="answer" type="text" class="field sm:flex-1" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="answer-help answer-note" maxlength="500">' +
        '<button type="submit" class="btn btn-primary sm:flex-none" id="answer-btn">Gửi câu trả lời</button></div>' +
        '<div id="answer-note" class="mt-3" role="status" aria-live="polite"></div></form>';
    }
    function bodyCheck(s) {
      return '<p>Trang tự kiểm tra bài của bạn mỗi giây rưỡi. Khi cả phần thực hành và câu trả lời đều đúng, bài được ghi nhận ngay, bạn không cần bấm gì.</p>' +
        '<p class="mt-3">Muốn kiểm tra ngay? Bấm nút dưới đây (tính là một lần thử).</p>' +
        '<div class="mt-3 flex flex-wrap items-center gap-3"><button type="button" class="btn" data-act="check">Kiểm tra lại</button><span id="check-msg" class="text-sm" role="status" aria-live="polite"></span></div>';
    }
    var bodies = { theory: bodyTheory, work: bodyWork, answer: bodyAnswer, check: bodyCheck };
    var bodySig = {
      theory: function (s, st) { return st.state; },
      work: function (s, st) { return [st.state, s.gitPass, s.complete, s.cd, s.missing.join('|')].join('~'); },
      answer: function (s) { return String(s.answerPass); },
      check: function () { return 'x'; }
    };

    /* ───── cập nhật giao diện theo trạng thái ───── */
    function update(s, flags) {
      var key = s.course.id + '/' + s.exercise.id;
      if (key !== mountedId) mount(s);
      state = s;
      var current = s.currentStep || null;
      var advanced = current !== previousCurrent && previousCurrent !== null && current !== null;
      if (current !== previousCurrent) {
        if (previousCurrent) delete opened[previousCurrent];
        if (current) opened[current] = true;
        previousCurrent = current;
      }
      s.steps.forEach(function (step) {
        var li = $('#step-' + step.id);
        if (!li) return;
        var was = previousStates[step.id];
        li.setAttribute('data-state', step.state);
        if (step.state === 'current') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        $('.marker', li).innerHTML = step.state === 'done' ? tickSvg : String(step.number);
        $('.step-note', li).textContent = step.state === 'done' ? 'Đã xong' : step.state === 'current' ? 'Đang làm' : '';
        if (was && was !== 'done' && step.state === 'done') {
          li.classList.add('just-done');
          setTimeout(function () { li.classList.remove('just-done'); }, 1800);
        }
        previousStates[step.id] = step.state;
        var body = $('#body-' + step.id);
        var sig = bodySig[step.id](s, step);
        if (signatures[step.id] !== sig) { body.innerHTML = bodies[step.id](s, step); signatures[step.id] = sig; }
        var isOpen = Boolean(opened[step.id]);
        body.hidden = !isOpen;
        $('#head-' + step.id).setAttribute('aria-expanded', String(isOpen));
      });
      if (advanced) { var target = $('#step-' + current); if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' }); }
      renderBanner(s, flags);
      renderProblem(s);
      renderLive(s);
      renderHints(s);
      var net = $('#net'); if (net) net.hidden = !offline;
      var answerNote = $('#answer-note');
      if (answerNote && !answerNote.innerHTML && s.wrongTries >= 2 && !s.answerPass) answerNote.innerHTML = nudge();
    }

    function renderBanner(s, flags) {
      var box = $('#banner');
      var was = box.getAttribute('data-complete') === '1';
      if (!s.complete) { box.innerHTML = ''; box.removeAttribute('data-complete'); return; }
      if (was) return;
      var next = s.hasNext
        ? '<p class="mt-1">Bài tiếp theo: <strong class="font-semibold">' + esc(s.nextTitle) + '</strong></p>'
        : '<p class="mt-1">Đây là bài cuối của chủ đề này.</p>';
      box.setAttribute('data-complete', '1');
      box.innerHTML = '<div class="banner-ok' + (flags.justPassed ? ' enter' : '') + ' mt-8" role="status"><div class="rule-grow mb-3 w-24" aria-hidden="true"></div>' +
        '<p class="text-lg font-semibold">Bạn đã đạt bài này.</p>' + next +
        '<div class="mt-4"><button type="button" class="btn btn-primary" id="next-btn" data-act="next">' + (s.hasNext ? 'Sang bài tiếp theo' : 'Xem tổng kết chủ đề') + '</button></div></div>';
      if (flags.focusNext) { var button = $('#next-btn'); if (button) button.focus({ preventScroll: false }); }
    }
    function renderProblem(s) {
      var box = $('#problem');
      box.innerHTML = s.problem ? '<div class="note mt-6" role="alert"><p class="font-semibold">Có vấn đề với thư mục bài tập</p><p class="mt-1">' + esc(s.problem) + '</p></div>' : '';
    }
    function renderLive(s) {
      var live = $('#live');
      if (s.complete || !s.pollable || s.problem) { live.hidden = true; return; }
      live.hidden = false;
      live.innerHTML = offline ? '<span>Đang thử kết nối lại…</span>' : '<span class="spinner" aria-hidden="true"></span><span>Trang đang tự kiểm tra bài của bạn</span>';
    }
    function renderHints(s) {
      var list = $('#hints-list');
      var html = s.hintsSeen.map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('');
      if (list.innerHTML !== html) list.innerHTML = html;
      $('#hints-empty').hidden = s.hintsSeen.length > 0;
      $('#hints-count').textContent = '(đã xem ' + s.hintsSeen.length + '/' + s.hintsTotal + ')';
      var button = $('#hint-btn');
      var exhausted = s.hintsSeen.length >= s.hintsTotal;
      button.disabled = exhausted;
      button.textContent = s.hintsSeen.length ? (exhausted ? 'Đã xem hết gợi ý' : 'Xem gợi ý tiếp theo') : 'Xem gợi ý';
    }
    function nudge() {
      return '<p>Bí rồi à? Không sao. <button type="button" class="link" data-act="hint-open">Xem một gợi ý</button></p>';
    }

    /* ───── hành động ───── */
    function setBusy(button, busy) { if (button) button.disabled = busy; }

    root.addEventListener('click', function (event) {
      var target = event.target.closest('[data-act]');
      if (!target) return;
      var act = target.getAttribute('data-act');
      if (act === 'toggle') {
        var id = target.getAttribute('data-step');
        if (opened[id]) delete opened[id]; else opened[id] = true;
        var body = $('#body-' + id); body.hidden = !opened[id];
        target.setAttribute('aria-expanded', String(Boolean(opened[id])));
      } else if (act === 'flag') {
        setBusy(target, true);
        api('/api/flag', { step: target.getAttribute('data-step') }).then(function (r) { if (r.ok) update(r.state, {}); else setBusy(target, false); });
      } else if (act === 'copy') {
        copyText(state.cd).then(function (ok) {
          var label = $('span', target); label.textContent = ok ? 'Đã chép' : 'Chép không được';
          var msg = $('#copy-msg'); if (msg) msg.textContent = ok ? 'Đã chép lệnh vào bộ nhớ tạm.' : 'Không chép được; hãy bôi đen lệnh và nhấn Ctrl+C.';
          setTimeout(function () { label.textContent = 'Chép lệnh'; }, 2000);
        });
      } else if (act === 'open-folder') {
        setBusy(target, true);
        api('/api/open-folder', {}).then(function (r) {
          setBusy(target, false);
          var msg = $('#folder-msg'); if (msg) msg.textContent = r.ok ? r.message : (r.error || 'Không mở được thư mục.');
        });
      } else if (act === 'check') {
        setBusy(target, true);
        api('/api/check', {}).then(function (r) {
          setBusy(target, false);
          if (!r.ok) { var m = $('#check-msg'); if (m) m.textContent = r.error || 'Không kiểm tra được.'; return; }
          update(r.state, { justPassed: r.passed, focusNext: r.passed });
          var msg = $('#check-msg'); if (msg) msg.textContent = r.message;
        });
      } else if (act === 'next') {
        setBusy(target, true);
        api('/api/next', {}).then(function (r) {
          if (!r.ok) { setBusy(target, false); return; }
          if (r.finished) { location.href = '/finish'; return; }
          load(function () { window.scrollTo(0, 0); var h = $('#lesson-title'); if (h) h.focus({ preventScroll: true }); });
        });
      } else if (act === 'hint' || act === 'hint-open') {
        var details = $('#hints'); details.open = true;
        setBusy($('#hint-btn'), true);
        api('/api/hint', {}).then(function (r) {
          if (r.ok) { update(r.state, {}); var note = $('#answer-note'); if (note && act === 'hint-open') note.innerHTML = ''; var msg = $('#hint-msg'); if (msg) msg.textContent = r.hint.exhausted ? 'Đã hết gợi ý.' : ''; }
          else setBusy($('#hint-btn'), false);
        });
      } else if (act === 'solution-ask') {
        $('#solution-ask').hidden = true; $('#solution-confirm').hidden = false; $('[data-act=solution-yes]').focus();
      } else if (act === 'solution-no') {
        $('#solution-confirm').hidden = true; $('#solution-ask').hidden = false;
      } else if (act === 'solution-yes') {
        api('/api/solution', { confirm: true }).then(function (r) {
          if (!r.ok) return;
          $('#solution-confirm').hidden = true;
          var pre = $('#solution-text'); pre.textContent = r.solution; pre.hidden = false; pre.focus();
        });
      } else if (act === 'restart') {
        setBusy(target, true);
        api('/api/restart', {}).then(function (r) {
          setBusy(target, false);
          if (r.ok) { mountedId = null; update(r.state, {}); $('#restart').open = false; var h = $('#lesson-title'); if (h) h.focus(); }
        });
      } else if (act === 'theory-open') {
        var panel = $('#theory'); if (!panel) return;
        theoryReturn = target; panel.classList.add('theory-open'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
        document.body.classList.add('overflow-hidden');
        var close = $('[data-act=theory-close]', panel); if (close) close.focus();
      } else if (act === 'theory-close') {
        closeTheory();
      }
    });
    function closeTheory() {
      var panel = $('#theory'); if (!panel || !panel.classList.contains('theory-open')) return;
      panel.classList.remove('theory-open'); panel.removeAttribute('role'); panel.removeAttribute('aria-modal');
      document.body.classList.remove('overflow-hidden');
      if (theoryReturn && document.contains(theoryReturn)) theoryReturn.focus();
    }
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeTheory(); });

    root.addEventListener('submit', function (event) {
      if (event.target.id !== 'answer-form') return;
      event.preventDefault();
      var input = $('#answer'); var button = $('#answer-btn'); var note = $('#answer-note');
      var value = input.value.trim();
      if (!value) { note.innerHTML = '<p class="font-medium">Hãy gõ câu trả lời rồi nhấn Enter nhé.</p>'; input.focus(); return; }
      setBusy(button, true);
      api('/api/answer', { answer: value }).then(function (r) {
        setBusy(button, false);
        if (!r.ok) { note.innerHTML = '<p class="note">' + esc(r.error || 'Không gửi được câu trả lời.') + '</p>'; return; }
        update(r.state, { justPassed: r.passed, focusNext: r.passed });
        var fresh = $('#answer-note');
        if (!fresh) return;
        if (r.answerCorrect) fresh.innerHTML = '<p class="font-medium text-ok">' + esc(r.message) + '</p>';
        else {
          fresh.innerHTML = '<div class="note"><p>' + esc(r.message) + '</p>' + (r.state.wrongTries >= 2 ? '<p class="mt-2">' + nudge().replace(/^<p>|<\/p>$/g, '') + '</p>' : '') + '</div>';
          var field = $('#answer'); if (field) { field.focus(); field.select(); }
          if (fresh.scrollIntoView) fresh.scrollIntoView({ block: 'nearest' });
        }
      });
    });

    /* ───── tự kiểm tra ───── */
    function schedule(delay) {
      clearTimeout(timer);
      timer = setTimeout(tick, delay === undefined ? (document.hidden ? 5000 : 1500) : delay);
    }
    function tick() {
      if (polling) return;
      if (!state || !state.pollable || state.complete) { schedule(offline ? 3000 : 5000); if (offline) ping(); return; }
      polling = true;
      api('/api/poll', {}).then(function (r) {
        polling = false;
        if (r.offline) { offline = true; var net = $('#net'); if (net) net.hidden = false; renderLive(state); schedule(3000); return; }
        if (offline) { offline = false; var back = $('#net'); if (back) back.hidden = true; }
        if (r.ok) update(r.state, { justPassed: r.justPassed, focusNext: r.justPassed && !(document.activeElement && document.activeElement.matches && document.activeElement.matches('input, textarea')) });
        schedule();
      });
    }
    function ping() {
      api('/api/ping', {}).then(function (r) { if (r.ok) { offline = false; var net = $('#net'); if (net) net.hidden = true; load(); } });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(0); });

    load();
  }
})();
