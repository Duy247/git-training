#!/usr/bin/env node
// Dựng trang HTML lý thuyết: node theory/build.mjs
// Đọc theory/src/<track>/<slug>.md, ghi theory/<track>/<slug>.html và theory/index.html.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Marked } from './vendor/marked.esm.js';
import { THEORY_DIR, SRC_DIR, loadRoadmap, parseFrontMatter, listMarkdown, relSrc } from './lib.mjs';
import { resolve } from 'node:path';

// Tùy chọn kiểm thử: --src <thư-mục-md> --out <thư-mục-xuất> (out cần có assets/ cạnh nó)
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? resolve(argv[i + 1]) : null; };
const SRC = opt('--src') ?? SRC_DIR;
const OUT = opt('--out') ?? THEORY_DIR;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'muc';

const CALLOUTS = { 'Lưu ý': 'note', 'Mẹo': 'tip', 'Cẩn thận': 'warn' };
const MERMAID_VERSION = readVersion('assets/mermaid.version', 'không rõ');
function readVersion(rel, fallback) { try { return readFileSync(join(THEORY_DIR, rel), 'utf8').trim(); } catch { return fallback; } }

function renderMarkdown(body) {
  const toc = [];
  const used = new Set();
  let mermaidCount = 0;
  const marked = new Marked({
    gfm: true, breaks: false,
    renderer: {
      html({ text }) { return esc(text); },               // không cho HTML thô lọt vào trang
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (l === 'mermaid') { mermaidCount++; return `<pre class="mermaid">${esc(text)}</pre>\n`; }
        const label = l ? ` data-lang="${esc(l)}"` : '';
        return `<div class="code-block"${label}><pre><code${l ? ` class="language-${esc(l)}"` : ''}>${esc(text)}</code></pre></div>\n`;
      },
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const plain = html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        let id = slugify(plain), n = 2; const base = id;
        while (used.has(id)) id = `${base}-${n++}`;
        used.add(id);
        if (depth === 2) toc.push({ id, html });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const m = /^<p><strong>(Lưu ý|Mẹo|Cẩn thận):?<\/strong>:?[ \t]*(?:<br\s*\/?>)?\s*/.exec(inner);
        if (!m) return `<blockquote>\n${inner}</blockquote>\n`;
        const kind = CALLOUTS[m[1]];
        let rest = inner.slice(m[0].length);
        rest = rest.startsWith('</p>') ? rest.slice(4) : `<p>${rest}`;
        return `<aside class="callout ${kind}"><p class="callout-title">${m[1]}</p>\n${rest}</aside>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        if (/^\s*(javascript|data|vbscript):/i.test(href)) return text;
        const ext = /^https?:\/\//i.test(href) ? ' rel="noopener noreferrer"' : '';
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext}>${text}</a>`;
      },
    },
  });
  const html = marked.parse(body.replace(/^\s*# [^\n]*\n/, '')).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>'); // bỏ h1 đầu bài (tiêu đề đã nằm ở phần đầu trang)
  return { html, toc, mermaidCount };
}

const wordCount = body => (body.replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;

function pageShell({ title, root, bodyClass = '', header, main, mermaid, footerNote }) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${root}assets/fonts.css">
<link rel="stylesheet" href="${root}assets/theory.css">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<a class="skip-link" href="#noi-dung">Chuyển đến nội dung</a>
${header}
<main id="noi-dung" tabindex="-1">
<div class="wrap">
${main}
</div>
</main>
<footer class="site-footer"><div class="wrap">${footerNote}</div></footer>
${mermaid ? `<script src="${root}assets/mermaid.min.js"></script>\n` : ''}<script src="${root}assets/theory.js"></script>
</body>
</html>
`;
}

function main() {
  const roadmap = loadRoadmap();
  const flat = [];
  roadmap.forEach(t => t.lessons.forEach((l, i) => flat.push({ track: t, lesson: l, index: i, global: flat.length })));
  const byKey = new Map(flat.map(f => [`${f.track.id}/${f.lesson.slug}`, f]));
  const errors = [];
  const built = new Map();

  // 1) đọc và kiểm tra nguồn
  for (const file of listMarkdown(SRC)) {
    const rel = relSrc(file, SRC);
    const parts = rel.split('/');
    if (parts.length !== 2) { errors.push(`${rel}: phải nằm ở theory/src/<track>/<slug>.md`); continue; }
    const key = `${parts[0]}/${parts[1].replace(/\.md$/i, '')}`;
    const entry = byKey.get(key);
    if (!entry) { errors.push(`${rel}: không khớp bài nào trong roadmap (${key})`); continue; }
    const { data, body, error } = parseFrontMatter(readFileSync(file, 'utf8'), rel);
    if (error) { errors.push(error); continue; }
    if (!data.title || typeof data.title !== 'string') { errors.push(`${rel}: thiếu title trong front matter`); continue; }
    if (data.track !== undefined && data.track !== entry.track.id) errors.push(`${rel}: front matter track "${data.track}" khác thư mục "${entry.track.id}" (vẫn dựng trang)`);
    if (data.slug !== undefined && data.slug !== entry.lesson.slug) errors.push(`${rel}: front matter slug "${data.slug}" khác tên tệp "${entry.lesson.slug}" (vẫn dựng trang)`);
    if (data.order !== undefined && Number(data.order) !== entry.index + 1) errors.push(`${rel}: front matter order ${data.order} khác thứ tự trong roadmap ${entry.index + 1} (vẫn dựng trang)`);
    built.set(key, { entry, title: data.title.normalize('NFC'), body: body.normalize('NFC'), rel });
  }

  // 2) ghi từng trang
  let written = 0;
  for (const [key, page] of built) {
    const { entry, title, body, rel } = page;
    const { track, lesson, index, global } = entry;
    let r;
    try { r = renderMarkdown(body); } catch (e) { errors.push(`${rel}: lỗi chuyển Markdown: ${e.message}`); continue; }
    const root = '../';
    const prev = flat[global - 1], next = flat[global + 1];
    const link = (f, dir) => {
      if (!f) return `<span class="${dir} off"><small>${dir === 'prev' ? 'Bài trước' : 'Bài sau'}</small>Không có</span>`;
      const k = `${f.track.id}/${f.lesson.slug}`;
      const label = dir === 'prev' ? 'Bài trước' : 'Bài sau';
      const t = esc(built.get(k)?.title ?? f.lesson.title);
      const trackNote = f.track.id !== track.id ? ` (${esc(f.track.title)})` : '';
      if (!built.has(k)) return `<span class="${dir} off"><small>${label}</small>${t}${trackNote} - đang soạn</span>`;
      return `<a class="${dir}" href="${root}${f.track.id}/${f.lesson.slug}.html" rel="${dir}"><small>${label}</small>${t}${trackNote}</a>`;
    };
    const tocHtml = r.toc.length >= 2
      ? `<nav class="toc" aria-label="Mục lục"><p class="toc-title">Nội dung trang</p><ol>${r.toc.map(t => `<li><a href="#${t.id}">${t.html}</a></li>`).join('')}</ol></nav>\n` : '';
    const minutes = Math.max(1, Math.round(wordCount(body) / 180));
    const header = `<header class="site-header"><div class="wrap">
<p class="crumbs"><a href="${root}index.html">Mục lục bài học</a><span aria-hidden="true">/</span><span class="track-name">${esc(track.title)}</span><span class="badge" title="Vị trí bài trong track">Bài ${index + 1}/${track.lessons.length}</span></p>
<h1>${esc(title)}</h1>
<p class="meta">Track: ${esc(track.title)} &middot; Mã bài: <code>${esc(lesson.slug)}</code> &middot; Đọc khoảng ${minutes} phút</p>
</div></header>`;
    const ready = `<aside class="callout ready" aria-labelledby="san-sang"><p class="callout-title" id="san-sang">Sẵn sàng làm bài</p>
<p>Mở bài thực hành này trong git-training. Nếu chưa có phiên cho track này, bắt đầu track trước:</p>
<div class="code-block" data-lang="bash"><pre><code>git-training start ${esc(track.id)}</code></pre></div>
<p>Đến bài này (bài đã mở khóa) thì mở lại bằng mã bài, rồi kiểm tra kết quả:</p>
<div class="code-block" data-lang="bash"><pre><code>git-training open ${esc(lesson.slug)}
git-training check</code></pre></div>
<p>Bài đầu tiên của track mở sẵn ngay sau <code>start</code>. Bài sau mở khóa khi bài trước đạt.</p></aside>`;
    const mainHtml = `${tocHtml}<article class="content">\n${r.html}${ready}\n</article>
<nav class="pager" aria-label="Chuyển bài">${link(prev, 'prev')}${link(next, 'next')}</nav>
<p class="back"><a href="${root}index.html">Về mục lục tất cả bài học</a></p>`;
    const html = pageShell({
      title: `${title} - ${track.title} - git-training`, root, header, main: mainHtml, mermaid: r.mermaidCount > 0,
      footerNote: `git-training &middot; Lý thuyết tiếng Việt &middot; ${esc(track.title)}, bài ${index + 1}/${track.lessons.length}`,
    });
    const out = join(OUT, track.id, `${lesson.slug}.html`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    written++;
  }

  // 3) chỉ mục
  const total = flat.length;
  const trackHtml = roadmap.map(t => {
    const have = t.lessons.filter(l => built.has(`${t.id}/${l.slug}`)).length;
    const rows = t.lessons.map((l, i) => {
      const k = `${t.id}/${l.slug}`;
      const b = built.get(k);
      const num = `<span class="num">${i + 1}.</span>`;
      const keys = esc(`${l.slug} ${l.title} ${t.title} ${t.id}`);
      return b
        ? `<li data-keys="${keys}"><span>${num} <a class="title" href="${t.id}/${l.slug}.html">${esc(b.title)}</a></span><span class="status ok">Đã có trang lý thuyết</span></li>`
        : `<li class="pending" data-keys="${keys}"><span>${num} <span class="title">${esc(l.title)}</span></span><span class="status todo">Đang soạn</span></li>`;
    }).join('\n');
    return `<section class="track" id="${t.id}"><h2>${esc(t.title)}</h2><p class="track-meta">Track <code>${esc(t.id)}</code> &middot; ${have}/${t.lessons.length} trang đã có</p><ul class="lessons">\n${rows}\n</ul></section>`;
  }).join('\n');
  const indexMain = `<label class="search-label" for="search">Tìm bài học (không cần gõ dấu)</label>
<input class="search" id="search" type="search" placeholder="Ví dụ: rebase, nhánh, hoan tac" autocomplete="off">
<p class="summary">${built.size}/${total} bài đã có trang lý thuyết, ${total - built.size} bài đang soạn. <span id="count" aria-live="polite"></span></p>
<p id="empty" class="empty" hidden>Không có bài nào khớp từ khóa.</p>
${trackHtml}`;
  const indexHeader = `<header class="site-header"><div class="wrap"><p class="crumbs"><span class="track-name">git-training</span><span class="badge">${roadmap.length} track &middot; ${total} bài</span></p>
<h1>Lý thuyết Git trước khi thực hành</h1>
<p class="meta">Đọc trang lý thuyết của bài, rồi làm bài trong terminal bằng <code>git-training</code>. Các trang mở được trực tiếp bằng trình duyệt, không cần máy chủ hay mạng.</p></div></header>`;
  writeFileSync(join(OUT, 'index.html'), pageShell({
    title: 'Lý thuyết Git - git-training', root: '', header: indexHeader, main: indexMain, mermaid: false,
    footerNote: `Dựng bằng <code>node theory/build.mjs</code> &middot; Mermaid ${esc(MERMAID_VERSION)}`,
  }));

  console.log(`Đã dựng ${written} trang lý thuyết + index.html (${built.size}/${total} bài có nội dung).`);
  if (errors.length) {
    console.error(`\nCó ${errors.length} vấn đề:`);
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
}
main();
