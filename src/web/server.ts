import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCourses } from '../engine.js';
import { Dashboard, NoSessionError, UserError } from './service.js';
import { finishPage, lessonPage, plainPage, progressPage, welcomePage } from './pages.js';

/** Thư mục gốc của gói: dist/web/server.js nằm trong <gốc>/dist/web. */
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const staticFiles: Record<string, { file: string; type: string }> = {
  '/static/app.css': { file: 'web/app.css', type: 'text/css; charset=utf-8' },
  '/static/app.js': { file: 'web/app.js', type: 'text/javascript; charset=utf-8' },
};
const theoryTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2',
};
const theoryHidden = new Set(['src', 'examples', 'vendor']);
const maxBody = 16 * 1024;
const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

/** Kiểu chữ của trang lý thuyết khi nhúng: bỏ phần đầu trang (đã có tiêu đề bên ngoài) và dùng màu của bảng học. */
const embedStyle = `<style>
.site-header{display:none}
:root{--bg:#ffffff;--surface:#f6f5f1;--accent:#a8391a;--accent-contrast:#ffffff;--border:#d9d6cd;--note:#a8391a;--note-bg:#f3e4dd;--inline-code-bg:#efede6;--code-bg:#f6f5f1;--muted:#5a574f}
@media(prefers-color-scheme:dark){:root{--bg:#1d1d1a;--surface:#151513;--accent:#f19a72;--accent-contrast:#1d1d1a;--border:#34332e;--note:#f19a72;--note-bg:#35241c;--inline-code-bg:#2a2a25;--code-bg:#151513;--muted:#a9a69c}}
main{padding-top:1rem}
</style>`;

export interface DashboardOptions {
  /** Cổng; 0 hoặc bỏ trống: để hệ điều hành chọn cổng trống. */
  port?: number;
  /** Thời gian không có yêu cầu nào thì tự dừng (ms); 0 là không bao giờ. Mặc định 2 giờ. */
  idleMs?: number;
  version: string;
  token?: string;
  dashboard?: Dashboard;
  onIdle?: () => void;
}
export interface DashboardHandle {
  url: string; port: number; token: string; cookieName: string; server: Server; dashboard: Dashboard;
  close(): Promise<void>;
}

/** Trang lý thuyết dựng sơ đồ bằng Mermaid (cần unsafe-eval). Chỉ áp dụng cho tệp tĩnh đi kèm gói, không bao giờ cho trang bảng học. */
const theoryHeaders: Record<string, string> = { ...securityHeaders, 'Content-Security-Policy': securityHeaders['Content-Security-Policy']!.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'") };
const noStore = { 'Cache-Control': 'no-store' };
const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...noStore, ...securityHeaders });
  res.end(JSON.stringify(body));
};
const sendHtml = (res: ServerResponse, status: number, html: string) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...noStore, ...securityHeaders });
  res.end(html);
};
const redirect = (res: ServerResponse, location: string, headers: Record<string, string> = {}) => {
  res.writeHead(302, { Location: location, ...noStore, ...securityHeaders, ...headers });
  res.end();
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBody) throw new UserError('Yêu cầu quá lớn.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* rơi xuống lỗi bên dưới */ }
  throw new UserError('Yêu cầu không hợp lệ.');
}
const str = (value: unknown, max = 200): string | undefined => typeof value === 'string' && value.length <= max ? value : undefined;

/** Tệp lý thuyết: chỉ phục vụ trang HTML, CSS, JS và phông nằm trong thư mục theory (không có src, examples, vendor). */
export async function readTheoryFile(root: string, urlPath: string): Promise<{ data: Buffer; type: string; isHtml: boolean } | undefined> {
  let relative: string;
  try { relative = decodeURIComponent(urlPath.replace(/^\/theory\//, '')); } catch { return undefined; }
  if (!relative || relative.includes('\0') || relative.includes('\\')) return undefined;
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.')) || theoryHidden.has(parts[0]!)) return undefined;
  const type = theoryTypes[path.extname(relative).toLowerCase()];
  if (!type) return undefined;
  const base = path.resolve(root, 'theory');
  const file = path.resolve(base, ...parts);
  if (!file.startsWith(base + path.sep)) return undefined;
  try {
    if (!(await stat(file)).isFile()) return undefined;
    return { data: await readFile(file), type, isHtml: type.startsWith('text/html') };
  } catch { return undefined; }
}

export async function startDashboard(options: DashboardOptions): Promise<DashboardHandle> {
  const dashboard = options.dashboard ?? new Dashboard();
  await dashboard.init();
  const token = options.token ?? randomBytes(24).toString('hex');
  const idleMs = options.idleMs ?? 2 * 60 * 60 * 1000;
  let lastRequest = Date.now();
  let port = 0;
  const cookieName = () => `gt_${port}`;
  const hostAllowed = (host: string | undefined) => host !== undefined && (host === `127.0.0.1:${port}` || host === `localhost:${port}`);
  const authed = (req: IncomingMessage) => { const value = readCookie(req.headers.cookie, cookieName()); return value !== undefined && safeEqual(value, token); };

  async function api(req: IncomingMessage, res: ServerResponse, route: string): Promise<void> {
    if (req.method !== 'POST' && !(req.method === 'GET' && route === '/api/lesson')) { sendJson(res, 405, { ok: false, error: 'Phương thức không được hỗ trợ.' }); return; }
    if (req.method === 'POST') {
      if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) { sendJson(res, 415, { ok: false, error: 'Yêu cầu không hợp lệ.' }); return; }
      const origin = req.headers.origin;
      if (origin !== undefined && origin !== `http://${req.headers.host}`) { sendJson(res, 403, { ok: false, error: 'Nguồn yêu cầu không hợp lệ.' }); return; }
      if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site']))) { sendJson(res, 403, { ok: false, error: 'Nguồn yêu cầu không hợp lệ.' }); return; }
    }
    const body = req.method === 'POST' ? await readJson(req) : {};
    switch (route) {
      case '/api/lesson': sendJson(res, 200, { ok: true, state: await dashboard.lessonState() }); return;
      case '/api/ping': sendJson(res, 200, { ok: true }); return;
      case '/api/poll': { const result = await dashboard.poll(); sendJson(res, 200, { ok: true, ...result }); return; }
      case '/api/check': sendJson(res, 200, { ok: true, ...await dashboard.check() }); return;
      case '/api/answer': sendJson(res, 200, { ok: true, ...await dashboard.answer(str(body.answer, 600) ?? '') }); return;
      case '/api/hint': sendJson(res, 200, { ok: true, hint: await dashboard.hint(), state: await dashboard.lessonState() }); return;
      case '/api/solution': {
        if (body.confirm !== true) throw new UserError('Hãy xác nhận trước khi xem lời giải.');
        sendJson(res, 200, { ok: true, solution: await dashboard.solution() }); return;
      }
      case '/api/flag': await dashboard.setFlag(str(body.step, 20) ?? ''); sendJson(res, 200, { ok: true, state: await dashboard.lessonState() }); return;
      case '/api/open-folder': sendJson(res, 200, { ok: true, ...await dashboard.openFolder() }); return;
      case '/api/next': sendJson(res, 200, { ok: true, ...await dashboard.next() }); return;
      case '/api/restart': await dashboard.restart(); sendJson(res, 200, { ok: true, state: await dashboard.lessonState() }); return;
      case '/api/open': {
        await dashboard.openLesson(str(body.course, 60), str(body.lesson, 80));
        sendJson(res, 200, { ok: true }); return;
      }
      default: sendJson(res, 404, { ok: false, error: 'Không tìm thấy.' });
    }
  }

  async function page(res: ServerResponse, route: string): Promise<void> {
    if (route === '/') {
      let current: Parameters<typeof welcomePage>[0]['current'];
      if (dashboard.hasSession()) {
        try { const state = await dashboard.lessonState(); current = { course: state.course.title, position: state.position, total: state.total, title: state.exercise.title, done: state.doneCount }; }
        catch (error) { if (!(error instanceof NoSessionError)) throw error; }
      }
      const progress = await dashboard.progress();
      sendHtml(res, 200, welcomePage({ version: options.version, current, firstCourse: current ? '' : listCourses()[0]!.id, totalAll: progress.totalAll, doneAll: progress.doneAll }));
      return;
    }
    if (route === '/progress') { sendHtml(res, 200, progressPage(await dashboard.progress(), { version: options.version, hasSession: dashboard.hasSession() })); return; }
    if (route === '/lesson') { if (!dashboard.hasSession()) { redirect(res, '/'); return; } sendHtml(res, 200, lessonPage({ version: options.version })); return; }
    if (route === '/finish') {
      if (!dashboard.hasSession()) { redirect(res, '/'); return; }
      const summary = await dashboard.summary();
      sendHtml(res, 200, finishPage({ version: options.version, ...summary })); return;
    }
    sendHtml(res, 404, plainPage('Không tìm thấy trang', 'Trang bạn mở không tồn tại. <a href="/">Về trang chính</a>.'));
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    lastRequest = Date.now();
    if (!hostAllowed(req.headers.host)) {
      res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders });
      res.end('Misdirected request');
      return;
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const route = url.pathname;
    const supplied = url.searchParams.get('t');
    if (route === '/' && supplied !== null && req.method === 'GET') {
      if (safeEqual(supplied, token)) { redirect(res, '/', { 'Set-Cookie': `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict` }); return; }
    }
    if (!authed(req)) {
      sendHtml(res, 403, plainPage('Cần mở đúng đường dẫn', 'Trang này chỉ mở được bằng đường dẫn đầy đủ mà <code>git-training</code> in ra trong cửa sổ terminal. Hãy sao chép lại đường dẫn đó, hoặc chạy lại <code>git-training</code>.'));
      return;
    }
    const asset = staticFiles[route];
    if (asset && req.method === 'GET') {
      const data = await readFile(path.join(packageRoot, asset.file));
      res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', ...securityHeaders });
      res.end(data);
      return;
    }
    if (route.startsWith('/theory/') && req.method === 'GET') {
      const file = await readTheoryFile(packageRoot, route);
      if (!file) { sendHtml(res, 404, plainPage('Không tìm thấy trang', 'Bài này chưa có trang lý thuyết.')); return; }
      let data: Buffer | string = file.data;
      if (file.isHtml && url.searchParams.get('embed') === '1') data = file.data.toString('utf8').replace('</head>', `${embedStyle}</head>`);
      res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-cache', ...theoryHeaders });
      res.end(data);
      return;
    }
    if (route.startsWith('/api/')) { await api(req, res, route); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendHtml(res, 405, plainPage('Không hỗ trợ', 'Phương thức này không được hỗ trợ.')); return; }
    await page(res, route);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(error => {
      if (res.headersSent) { res.end(); return; }
      const route = new URL(req.url ?? '/', 'http://localhost').pathname;
      const wantsJson = route.startsWith('/api/');
      if (error instanceof NoSessionError) { if (wantsJson) sendJson(res, 409, { ok: false, code: 'no-session', error: 'Chưa có phiên học.' }); else redirect(res, '/'); return; }
      const user = error instanceof UserError;
      const message = (error as Error).message || 'Có lỗi xảy ra.';
      if (wantsJson) sendJson(res, user ? 400 : 500, { ok: false, error: message });
      else sendHtml(res, 500, plainPage('Có lỗi xảy ra', `${message.replace(/[<>&]/g, '')}<br><a href="/">Về trang chính</a>`));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Chỉ lắng nghe trên 127.0.0.1: máy khác trong mạng không truy cập được.
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/?t=${token}`;

  let closing: Promise<void> | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  const close = () => closing ??= new Promise<void>(resolve => {
    if (idleTimer) clearInterval(idleTimer);
    server.close(() => resolve());
    server.closeAllConnections();
  });
  if (idleMs > 0) {
    idleTimer = setInterval(() => { if (Date.now() - lastRequest > idleMs) { options.onIdle?.(); void close(); } }, Math.min(60_000, Math.max(50, idleMs / 2)));
    idleTimer.unref();
  }
  return { url, port, token, cookieName: cookieName(), server, dashboard, close };
}
