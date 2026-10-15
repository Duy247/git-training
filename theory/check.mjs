#!/usr/bin/env node
// Kiểm tra nguồn lý thuyết: node theory/check.mjs [--no-mermaid] [--src <thư-mục>]
//  1. front matter hợp lệ (title, track, slug, order)
//  2. mỗi .md khớp một slug thật trong roadmap
//  3. không có ký tự bị cấm (emoji, ngoài BMP, dingbat U+2190-2BFF, U+2600-27BF, U+FE0F, U+200D)
//  4. mọi khối mermaid hiển thị được bằng mermaid vendor trong Chromium headless
// Thoát mã 1 nếu có lỗi. Cần Chrome/Chromium/Edge (biến môi trường CHROME để chỉ đường dẫn) cho bước 4.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { THEORY_DIR, SRC_DIR, loadRoadmap, parseFrontMatter, listMarkdown, relSrc, extractMermaid, BANNED_G, findChrome } from './lib.mjs';

const skipMermaid = process.argv.includes('--no-mermaid');
const srcIdx = process.argv.indexOf('--src');
const SRC = srcIdx >= 0 ? resolve(process.argv[srcIdx + 1]) : SRC_DIR;
const roadmap = loadRoadmap();
const keys = new Map();
roadmap.forEach(t => t.lessons.forEach((l, i) => keys.set(`${t.id}/${l.slug}`, i + 1)));
const errors = [];
const err = m => errors.push(m);
const files = listMarkdown(SRC);
const mermaidJobs = []; // { file, n, code }
let nMermaid = 0;

for (const file of files) {
  const rel = relSrc(file, SRC);
  const raw = readFileSync(file, 'utf8');
  const parts = rel.split('/');
  if (parts.length !== 2) { err(`${rel}: phải nằm ở theory/src/<track>/<slug>.md`); continue; }
  const key = `${parts[0]}/${parts[1].replace(/\.md$/i, '')}`;
  const order = keys.get(key);
  if (!order) err(`${rel}: không khớp slug nào trong roadmap (${key})`);
  const { data, body, error } = parseFrontMatter(raw, rel);
  if (error) err(error);
  else {
    if (!data.title || typeof data.title !== 'string') err(`${rel}: thiếu title`);
    if (data.track !== parts[0]) err(`${rel}: track "${data.track}" phải là "${parts[0]}"`);
    if (data.slug !== parts[1].replace(/\.md$/i, '')) err(`${rel}: slug "${data.slug}" phải là "${parts[1].replace(/\.md$/i, '')}"`);
    if (order && Number(data.order) !== order) err(`${rel}: order "${data.order}" phải là ${order} (vị trí trong track)`);
  }
  // ký tự bị cấm, báo dòng và mã
  raw.split(/\r?\n/).forEach((line, i) => {
    const hits = [...line.matchAll(BANNED_G)].map(m => 'U+' + m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    if (hits.length) err(`${rel}:${i + 1}: ký tự bị cấm ${[...new Set(hits)].join(', ')}`);
  });
  if (/^\s*#\s/.test(body) === false && !body.trim()) err(`${rel}: nội dung trống`);
  extractMermaid(body).forEach((code, i) => { mermaidJobs.push({ file: rel, n: i + 1, code }); nMermaid++; });
}

let mermaidNote = 'bỏ qua (--no-mermaid)';
if (!skipMermaid && mermaidJobs.length) {
  const chrome = findChrome();
  if (!chrome) { err('Không tìm thấy Chrome/Chromium/Edge để kiểm tra mermaid. Đặt biến CHROME=<đường dẫn> hoặc dùng --no-mermaid.'); mermaidNote = 'không chạy được'; }
  else {
    const tmp = join(THEORY_DIR, '.tmp');
    mkdirSync(tmp, { recursive: true });
    const page = join(tmp, 'mermaid-check.html');
    const jobs = JSON.stringify(mermaidJobs.map(j => j.code)).replace(/</g, '\\u003c');
    writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><div id="s"></div><pre id="out">PENDING</pre>
<script src="../assets/mermaid.min.js"></script>
<script>
const jobs = ${jobs};
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: true, flowchart: { htmlLabels: true } });
(async () => {
  const res = [];
  for (let i = 0; i < jobs.length; i++) {
    try {
      await mermaid.parse(jobs[i]);
      const r = await mermaid.render('m' + i, jobs[i], document.getElementById('s'));
      if (!r.svg || r.svg.indexOf('Syntax error') !== -1) res.push('Syntax error trong sơ đồ');
      else res.push(null);
    } catch (e) { res.push(String((e && e.message) || e).split('\\n').slice(0, 4).join(' | ')); }
  }
  document.getElementById('out').textContent = 'RESULT:' + JSON.stringify(res) + ':END';
})();
</script>`);
    const r = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
      '--virtual-time-budget=120000', '--dump-dom', pathToFileURL(page).href], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 240000 });
    const m = /RESULT:(\[[\s\S]*?\]):END/.exec(r.stdout || '');
    if (!m) err(`Chromium không trả kết quả mermaid (mã ${r.status}). ${String(r.stderr || '').slice(0, 300)}`);
    else {
      const res = JSON.parse(m[1]);
      res.forEach((msg, i) => { if (msg) err(`${mermaidJobs[i].file}: khối mermaid #${mermaidJobs[i].n}: ${msg}`); });
      mermaidNote = `${nMermaid} khối`;
    }
    rmSync(tmp, { recursive: true, force: true });
  }
} else if (!mermaidJobs.length) mermaidNote = '0 khối';

console.log(`Đã kiểm tra ${files.length} tệp .md; mermaid: ${mermaidNote}.`);
if (errors.length) {
  console.error(`\nCó ${errors.length} lỗi:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('OK, không có lỗi.');
