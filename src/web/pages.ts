import type { ProgressView } from './service.js';

export const esc = (value: unknown): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export type Section = 'learn' | 'progress' | 'home';

/** Khung trang chung. Mọi tài nguyên đều cùng nguồn (không CDN) để chạy được khi không có mạng. */
export function layout(options: { title: string; section: Section; version: string; body: string; boot?: unknown; wide?: boolean; hasSession: boolean }): string {
  const link = (href: string, label: string, active: boolean) =>
    `<a href="${href}" class="inline-flex min-h-11 items-center px-1 text-base ${active ? 'font-semibold text-ink underline decoration-accent decoration-2 underline-offset-8' : 'text-muted hover:text-ink'}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${esc(options.title)} · Git Training</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23a8391a'/%3E%3Cpath d='M9 16.5l4.5 4.5L23 11' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/theory/assets/fonts.css">
<link rel="stylesheet" href="/static/app.css?v=${esc(options.version)}">
</head>
<body class="min-h-screen">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink">Chuyển đến nội dung</a>
<header class="border-b border-line">
  <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-2 sm:px-8">
    <a href="/" class="inline-flex min-h-11 items-center gap-2 text-lg font-semibold tracking-tight text-ink no-underline">
      <span aria-hidden="true" class="grid h-6 w-6 place-items-center rounded-sm bg-accent text-accent-ink"><svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg></span>
      Git Training
    </a>
    <nav aria-label="Điều hướng chính" class="flex items-center gap-5">
      ${options.hasSession ? link('/lesson', 'Bài học', options.section === 'learn') : ''}
      ${link('/progress', 'Tất cả bài', options.section === 'progress')}
    </nav>
  </div>
</header>
<main id="main" tabindex="-1" class="mx-auto ${options.wide ? 'max-w-7xl' : 'max-w-3xl'} px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
${options.body}
</main>
<footer class="border-t border-line">
  <p class="mx-auto max-w-7xl px-5 py-5 text-sm text-muted sm:px-8">Chạy ngay trên máy của bạn, không gửi dữ liệu đi đâu. Dừng bằng Ctrl+C trong cửa sổ terminal. Phiên bản ${esc(options.version)}.</p>
</footer>
<noscript><p class="mx-auto max-w-3xl px-5 pb-10 text-base">Trang này cần JavaScript để kiểm tra bài tự động. Hãy bật JavaScript trong trình duyệt, hoặc dùng <code>git-training --terminal</code>.</p></noscript>
<script type="application/json" id="boot">${json(options.boot ?? {})}</script>
<script src="/static/app.js?v=${esc(options.version)}" defer></script>
</body>
</html>`;
}

export function welcomePage(options: { version: string; current?: { course: string; position: number; total: number; title: string; done: number }; firstCourse: string; totalAll: number; doneAll: number }): string {
  const { current } = options;
  const body = `
<p class="eyebrow">Chào mừng bạn</p>
<h1 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Học Git bằng cách làm thật, ngay trên máy của bạn</h1>
<ol class="mt-8 space-y-4 text-lg">
  <li class="flex gap-4"><span class="mt-0.5 w-6 flex-none font-semibold text-accent">1.</span><span>Đọc một bài lý thuyết ngắn.</span></li>
  <li class="flex gap-4"><span class="mt-0.5 w-6 flex-none font-semibold text-accent">2.</span><span>Làm theo nhiệm vụ trong một thư mục bài tập. Bạn gõ lệnh Git ở cửa sổ terminal; trang này chỉ hướng dẫn và theo dõi.</span></li>
  <li class="flex gap-4"><span class="mt-0.5 w-6 flex-none font-semibold text-accent">3.</span><span>Khi làm xong, trang tự nhận ra và cho bạn sang bài tiếp theo. Không cần bấm nút kiểm tra.</span></li>
</ol>
<div class="mt-10 border-t border-line pt-8">
  ${current
    ? `<p class="text-base text-muted">Bạn đang học <strong class="font-semibold text-ink">${esc(current.course)}</strong>, bài ${current.position}/${current.total}: ${esc(current.title)}. Đã xong ${current.done} bài của chủ đề này.</p>`
    : `<p class="text-base text-muted">Bạn sẽ bắt đầu từ chủ đề đầu tiên. Tiến độ được lưu lại trên máy, lần sau mở lại là học tiếp.</p>`}
  <div class="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
    <button type="button" class="btn btn-primary" data-start data-course="${esc(options.firstCourse)}" id="start">${current ? 'Tiếp tục học' : 'Bắt đầu học'}</button>
    <a class="link text-base" href="/progress">Xem tất cả ${options.totalAll} bài${options.doneAll ? ` (đã xong ${options.doneAll})` : ''}</a>
  </div>
  <p id="start-error" class="mt-4 text-base text-ink" role="alert" hidden></p>
</div>`;
  return layout({ title: 'Chào mừng', section: 'home', version: options.version, body, boot: { page: 'welcome' }, hasSession: Boolean(current) });
}

export function progressPage(view: ProgressView, options: { version: string; hasSession: boolean }): string {
  const tracks = view.tracks.map(track => {
    const pct = Math.round((track.done / track.total) * 100);
    const open = track.active || (!view.activeCourse && track === view.tracks[0]);
    const lessons = track.lessons.map((lesson, index) => {
      const upNext = lesson.id === track.nextId;
      const state = lesson.done ? 'Đã xong' : lesson.current ? 'Đang học' : '';
      const action = lesson.current && !lesson.done ? 'Tiếp tục' : upNext ? (track.done ? 'Làm bài này' : 'Làm tiếp') : lesson.done ? 'Làm lại' : 'Mở bài';
      const primary = (lesson.current && !lesson.done) || (upNext && !track.lessons.some(item => item.current && !item.done));
      return `<li class="flex items-center gap-3 border-t border-line py-2">
        <span class="w-7 flex-none text-right text-sm tabular-nums text-muted">${index + 1}</span>
        <span class="grid h-5 w-5 flex-none place-items-center" aria-hidden="true">${lesson.done ? '<svg viewBox="0 0 16 16" class="h-5 w-5 text-ok" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>' : lesson.current ? '<span class="h-2.5 w-2.5 rounded-full bg-accent"></span>' : ''}</span>
        <span class="min-w-0 flex-1 text-base${lesson.done ? ' text-muted' : ''}">${esc(lesson.title)}${state ? ` <span class="ml-1 text-sm ${lesson.current ? 'font-semibold text-accent' : 'text-ok'}">${state}</span>` : ''}</span>
        <button type="button" class="btn btn-sm flex-none${primary ? ' btn-primary' : ''}" data-open data-course="${esc(track.id)}" data-lesson="${esc(lesson.id)}" aria-label="${action}: ${esc(lesson.title)}">${action}</button>
      </li>`;
    }).join('');
    return `<details class="group border-t border-line"${open ? ' open' : ''}>
      <summary class="flex min-h-14 list-none flex-wrap items-center gap-x-4 gap-y-1 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span class="inline-block w-3 flex-none text-muted transition-transform group-open:rotate-90" aria-hidden="true">&#9656;</span>
        <span class="min-w-0 flex-1 text-lg font-semibold">${esc(track.title)}</span>
        <span class="flex-none text-sm tabular-nums text-muted">${track.done}/${track.total} bài${track.done === track.total ? ' · Hoàn thành' : ''}</span>
        <span class="order-last h-1.5 w-full overflow-hidden rounded-sm bg-line sm:order-none sm:w-28" role="img" aria-label="Đã xong ${pct}%"><span class="block h-full bg-ok" style="width:${pct}%"></span></span>
      </summary>
      <div class="pb-5 pl-0 sm:pl-6">
        ${track.active ? '' : `<div class="mb-2"><button type="button" class="btn btn-sm" data-open data-course="${esc(track.id)}">${track.done > 0 ? 'Tiếp tục chủ đề này' : 'Bắt đầu chủ đề này'}</button></div>`}
        <ul>${lessons}</ul>
      </div>
    </details>`;
  }).join('');
  const body = `
<p class="eyebrow">Tiến độ</p>
<h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Tất cả bài học</h1>
<p class="mt-3 text-lg text-muted">Bạn đã xong <strong class="font-semibold text-ink">${view.doneAll}</strong> trong ${view.totalAll} bài. Không bài nào bị khóa: bạn có thể mở bất kỳ bài nào.</p>
<p class="mt-2 text-sm text-muted">Mở lại một bài sẽ tạo lại thư mục bài tập của riêng bài đó từ đầu. Các bài khác không bị ảnh hưởng.</p>
<p id="open-error" class="mt-4 text-base" role="alert" hidden></p>
<div class="mt-8 border-b border-line">${tracks}</div>`;
  return layout({ title: 'Tất cả bài', section: 'progress', version: options.version, body, boot: { page: 'progress' }, hasSession: options.hasSession });
}

export function lessonPage(options: { version: string }): string {
  const body = `<div id="app" aria-busy="true"><p class="text-muted">Đang tải bài học…</p></div>`;
  return layout({ title: 'Bài học', section: 'learn', version: options.version, body, boot: { page: 'lesson' }, wide: true, hasSession: true });
}

export function finishPage(options: { version: string; courseTitle: string; done: number; total: number; doneAll: number; totalAll: number }): string {
  const body = `
<div class="banner-ok enter">
  <div class="rule-grow mb-4 w-24" aria-hidden="true"></div>
  <p class="eyebrow !text-ok">Hoàn thành</p>
  <h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Bạn đã học xong chủ đề "${esc(options.courseTitle)}"</h1>
  <p class="mt-3 text-lg">${options.done}/${options.total} bài của chủ đề này. Toàn bộ lộ trình: ${options.doneAll}/${options.totalAll} bài.</p>
</div>
<div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
  <a class="btn btn-primary" href="/progress">Chọn chủ đề tiếp theo</a>
  <a class="link text-base" href="/lesson">Quay lại bài vừa học</a>
</div>`;
  return layout({ title: 'Hoàn thành chủ đề', section: 'learn', version: options.version, body, boot: { page: 'finish' }, hasSession: true });
}

/** Trang lỗi nhỏ, không cần tệp tĩnh (dùng cả khi chưa có cookie). */
export function plainPage(title: string, message: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title>
<style>body{margin:0;font:17px/1.65 'Segoe UI',system-ui,sans-serif;background:#f6f5f1;color:#1c1b18}main{max-width:36rem;margin:0 auto;padding:4rem 1.25rem}h1{font-size:1.5rem;line-height:1.3}code{background:#fff;border:1px solid #d9d6cd;border-radius:4px;padding:.1em .35em}@media(prefers-color-scheme:dark){body{background:#151513;color:#ebe9e2}code{background:#1d1d1a;border-color:#34332e}}</style></head>
<body><main><h1>${esc(title)}</h1><p>${message}</p></main></body></html>`;
}
