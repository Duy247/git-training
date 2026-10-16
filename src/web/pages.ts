import type { ProgressView } from './service.js';

export const esc = (value: unknown): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export type Section = 'learn' | 'progress' | 'home' | 'about';

const brandNotice = 'Công cụ học tập do tác giả tự xây dựng cho CBNV MBBank, không phải sản phẩm hay kênh chính thức của MB. Logo MB là nhãn hiệu của MB.';

/** Khung trang chung. Mọi tài nguyên đều cùng nguồn (không CDN) để chạy được khi không có mạng. */
export function layout(options: { title: string; section: Section; version: string; body: string; boot?: unknown; wide?: boolean; hasSession: boolean }): string {
  const link = (href: string, label: string, active: boolean) =>
    `<a href="${href}" class="nav-link"${active ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${esc(options.title)} · Git Training</title>
<link rel="icon" type="image/png" href="/static/favicon.png">
<link rel="stylesheet" href="/theory/assets/fonts.css">
<link rel="stylesheet" href="/static/app.css?v=${esc(options.version)}">
</head>
<body class="min-h-screen">
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink">Chuyển đến nội dung</a>
<header class="brandbar">
  <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-0 px-4 py-2 sm:gap-x-6 sm:px-8">
    <a href="/" class="inline-flex min-h-11 items-center gap-2 text-base font-semibold tracking-tight sm:gap-3 sm:text-lg">
      <span class="logo-plate"><img src="/static/logo-mb.png" alt="MB" width="231" height="96"></span>
      <span>Git Training</span>
    </a>
    <nav aria-label="Điều hướng chính" class="flex items-center gap-1 sm:gap-5">
      ${options.hasSession ? link('/lesson', 'Bài học', options.section === 'learn') : ''}
      ${link('/progress', 'Tất cả bài', options.section === 'progress')}
    </nav>
  </div>
</header>
<main id="main" tabindex="-1" class="mx-auto ${options.wide ? 'max-w-7xl' : 'max-w-3xl'} px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
${options.body}
</main>
<footer class="border-t border-line">
  <div class="mx-auto max-w-7xl space-y-2 px-5 py-6 text-sm text-muted sm:px-8">
    <p>Dành cho cán bộ nhân viên MBBank; mọi người bên ngoài vẫn dùng tự do. <a class="link" href="/about"${options.section === 'about' ? ' aria-current="page"' : ''}>Tác giả: Văn Thành Duy</a></p>
    <p>${brandNotice}</p>
  </div>
</footer>
<noscript><p class="mx-auto max-w-3xl px-5 pb-10 text-base">Trang này cần JavaScript để kiểm tra bài tự động. Hãy bật JavaScript trong trình duyệt, hoặc dùng <code>git-training --terminal</code>.</p></noscript>
<script type="application/json" id="boot">${json(options.boot ?? {})}</script>
<script src="/static/app.js?v=${esc(options.version)}" defer></script>
</body>
</html>`;
}

const author = {
  name: 'Văn Thành Duy',
  headline: 'Automation Tester · Manual Tester · Coding Enthusiast',
  bio: 'Mình yêu công nghệ và vật lý, luôn tìm những bài toán mới để học, thử nghiệm và biến kiến thức thành tài liệu có thể áp dụng.',
};
const authorLinks: Array<[string, string]> = [
  ['Blog Ultimate QA', 'https://duyqa.blog'],
  ['Giới thiệu tác giả trên blog', 'https://duyqa.blog/about'],
  ['Mã nguồn git-training trên GitHub', 'https://github.com/Duy247/git-training'],
  ['GitHub: Duy247', 'https://github.com/Duy247'],
];
const authorSkills: Array<[string, string]> = [
  ['Kiểm thử', 'Manual Testing · Playwright · Robot Framework · Selenium · Appium · Karate'],
  ['Lập trình', 'Python · Java · JavaScript · C# · HTML · CSS · PHP'],
  ['Dữ liệu', 'SQL · Microsoft SQL Server · MySQL · Web Scraping · Beautiful Soup'],
];

/** Trang giới thiệu tác giả. Chỉ có liên kết ra ngoài (mở tab mới), không nạp tài nguyên nào từ mạng. */
export function aboutPage(options: { version: string; hasSession: boolean }): string {
  const skills = authorSkills.map(([label, items]) => `<div class="border-t border-line py-3 sm:flex sm:gap-6"><dt class="label w-28 flex-none sm:pt-1">${label}</dt><dd class="text-base">${items}</dd></div>`).join('');
  const links = authorLinks.map(([label, href]) => `<li><a class="link inline-flex min-h-11 items-center text-base" href="${href}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> (mở tab mới)</span></a><span class="ml-2 hidden text-sm text-muted sm:inline">${href.replace('https://', '')}</span></li>`).join('');
  const body = `
<p class="eyebrow">Tác giả</p>
<h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">${author.name}</h1>
<p class="mt-1 text-lg text-muted">${author.headline}</p>
<p class="mt-5 text-lg">${author.bio}</p>
<dl class="mt-8">
  <div class="border-t border-line py-3 sm:flex sm:gap-6"><dt class="label w-28 flex-none sm:pt-1">Hiện tại</dt><dd class="text-base"><strong class="font-semibold">MBBank · Chuyên viên Kiểm thử (Automation Tester)</strong><span class="block text-sm text-muted">03/2025 đến nay</span>Kiểm thử tự động cho mobile, web và API; tham gia phát triển và vận hành framework kiểm thử nội bộ; thực hiện kiểm thử hiệu năng khi có yêu cầu.</dd></div>
  <div class="border-t border-line py-3 sm:flex sm:gap-6"><dt class="label w-28 flex-none sm:pt-1">Trước đó</dt><dd class="text-base"><strong class="font-semibold">FPT Software · Fresher Automation Tester</strong><span class="block text-sm text-muted">10/2024 - 03/2025</span>Đào tạo ISTQB Foundation; Robot Framework, Playwright, Selenium, Appium, Karate; xây dựng giải pháp automation bằng Playwright Python cho dự án Hyundai AutoEver.</dd></div>
  ${skills}
  <div class="border-y border-line py-3 sm:flex sm:gap-6"><dt class="label w-28 flex-none sm:pt-1">Học vấn</dt><dd class="text-base"><strong class="font-semibold">Bauman Moscow State Technical University</strong><span class="block text-sm text-muted">2020 - 2024</span>Cử nhân Tự động hóa quy trình công nghệ và sản xuất (học bổng toàn phần theo hiệp định Nga - Việt).</dd></div>
</dl>
<h2 class="mt-8 text-lg font-semibold">Liên kết</h2>
<ul class="mt-1">${links}</ul>
<p class="mt-8 text-sm text-muted">${brandNotice}</p>
<p class="mt-6"><a class="link text-base" href="/">Về trang chính</a></p>`;
  return layout({ title: 'Tác giả', section: 'about', version: options.version, body, boot: { page: 'about' }, hasSession: options.hasSession });
}

export function welcomePage(options: { version: string; current?: { course: string; position: number; total: number; title: string; done: number }; firstCourse: string; totalAll: number; doneAll: number }): string {
  const { current } = options;
  const body = `
<p><span class="capsule">Dành cho cán bộ nhân viên MBBank</span></p>
<h1 class="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Học Git bằng cách làm thật, ngay trên máy của bạn</h1>
<p class="mt-4 text-base text-muted">Mọi người bên ngoài MBBank vẫn dùng được tự do: mã nguồn mở, miễn phí.</p>
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
</div>
<section class="card mt-12" aria-labelledby="author-title">
  <h2 id="author-title" class="eyebrow">Tác giả</h2>
  <p class="mt-1 text-lg font-semibold">${author.name}</p>
  <p class="text-base text-muted">${author.headline}</p>
  <p class="mt-2 text-base">${author.bio}</p>
  <p class="mt-3"><a class="link text-base" href="/about">Xem thêm về tác giả</a></p>
</section>`;
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

export function finishPage(options: { version: string; courseTitle: string; done: number; total: number; doneAll: number; totalAll: number; finished: boolean }): string {
  const remaining = options.total - options.done;
  const body = `
<div class="banner-ok enter">
  <div class="rule-grow mb-4 w-24" aria-hidden="true"></div>
  <p class="eyebrow !text-ok">${options.finished ? 'Hoàn thành' : 'Bài cuối của chủ đề'}</p>
  <h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">${options.finished ? `Bạn đã học xong chủ đề "${esc(options.courseTitle)}"` : `Bạn đã làm xong bài cuối của chủ đề "${esc(options.courseTitle)}"`}</h1>
  <p class="mt-3 text-lg">${options.done}/${options.total} bài của chủ đề này${options.finished ? '' : `; còn ${remaining} bài chưa làm`}. Toàn bộ lộ trình: ${options.doneAll}/${options.totalAll} bài.</p>
</div>
<div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
  <a class="btn btn-primary" href="/progress">${options.finished ? 'Chọn chủ đề tiếp theo' : 'Xem các bài còn lại'}</a>
  <a class="link text-base" href="/lesson">Quay lại bài vừa học</a>
</div>`;
  return layout({ title: options.finished ? 'Hoàn thành chủ đề' : 'Bài cuối của chủ đề', section: 'learn', version: options.version, body, boot: { page: 'finish' }, hasSession: true });
}

/** Trang lỗi nhỏ, không cần tệp tĩnh (dùng cả khi chưa có cookie). */
export function plainPage(title: string, message: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title>
<style>body{margin:0;font:17px/1.65 'Segoe UI',system-ui,sans-serif;background:#f6f7fb;color:#1c273b}main{max-width:36rem;margin:0 auto;padding:4rem 1.25rem}h1{font-size:1.5rem;line-height:1.3}code{background:#fff;border:1px solid #d8dcea;border-radius:4px;padding:.1em .35em}@media(prefers-color-scheme:dark){body{background:#0f1522;color:#eaeef7}code{background:#182033;border-color:#2b3650}}</style></head>
<body><main><h1>${esc(title)}</h1><p>${message}</p></main></body></html>`;
}
