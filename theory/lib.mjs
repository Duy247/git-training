// Hàm dùng chung cho build.mjs và check.mjs (Node 22, không phụ thuộc gói ngoài).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const THEORY_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = dirname(THEORY_DIR);
export const SRC_DIR = join(THEORY_DIR, 'src');

/** Đọc roadmap trực tiếp từ src/curriculum.ts (không cần build dist/). */
export function loadRoadmap() {
  const text = readFileSync(join(REPO_DIR, 'src', 'curriculum.ts'), 'utf8');
  const re = /track\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*`([\s\S]*?)`\s*\)/g;
  const tracks = [];
  let m;
  while ((m = re.exec(text))) {
    const lessons = m[3].trim().split('\n').map(line => {
      const [slug, title, concept, question, answer] = line.split('|').map(s => s.trim());
      return { slug, title, concept, question, answer };
    });
    tracks.push({ id: m[1], title: m[2].replace(/\\'/g, "'"), lessons });
  }
  if (!tracks.length) throw new Error('Không đọc được roadmap từ src/curriculum.ts');
  return tracks;
}

/** Tách front matter YAML đơn giản: key: value (chuỗi, số, có thể bọc nháy). */
export function parseFrontMatter(raw, file = '') {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { data: null, body: text, error: `${file}: thiếu front matter (--- ... ---) ở đầu tệp` };
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) return { data: null, body: text, error: `${file}: dòng front matter không hợp lệ: "${line}"` };
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2)) v = v.slice(1, -1).replace(/\\"/g, '"');
    else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) v = v.slice(1, -1).replace(/''/g, "'");
    else if (/^-?\d+$/.test(v)) v = Number(v);
    data[kv[1]] = v;
  }
  return { data, body: text.slice(m[0].length), error: null };
}

/** Liệt kê mọi .md trong theory/src (đệ quy), trả về đường dẫn tuyệt đối đã sắp xếp. */
export function listMarkdown(dir = SRC_DIR) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listMarkdown(p));
    else if (name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}

export const relSrc = (file, base = SRC_DIR) => relative(base, file).split(sep).join('/');

/** Lấy các khối ```mermaid trong thân Markdown (kể cả khối dùng ~~~ hoặc nhiều backtick). */
export function extractMermaid(body) {
  const blocks = [];
  const re = /^(`{3,}|~{3,})[ \t]*mermaid[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm;
  let m;
  while ((m = re.exec(body))) blocks.push(m[2]);
  return blocks;
}

/** Ký tự bị cấm: emoji, ký tự ngoài BMP, dingbat, mũi tên/ký hiệu U+2190-2BFF, U+2600-27BF, U+FE0F, U+200D. */
export const BANNED_RE = /[\u{10000}-\u{10FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;
export const BANNED_G = /[\u{10000}-\u{10FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

export function findChrome() {
  const cands = [process.env.CHROME, process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return cands.find(p => existsSync(p)) ?? null;
}
