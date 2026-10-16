import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdCommand, terminalHelp } from '../dist/web/shell.js';
import { urlCommands, openUrl } from '../dist/web/browser.js';
import { startDashboard, readTheoryFile, packageRoot } from '../dist/web/server.js';
import { Dashboard } from '../dist/web/service.js';
import { idleMinutes } from '../dist/web/run.js';
import { git } from '../dist/index.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Mỗi bài kiểm thử dùng thư mục nhà tạm riêng để không đụng tiến độ thật. */
async function withWeb(run, options = {}) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-web-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, GIT_TRAINING_HOME: process.env.GIT_TRAINING_HOME };
  process.env.HOME = home; process.env.USERPROFILE = home; process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  let handle;
  try {
    handle = await startDashboard({ version: '9.9.9-test', idleMs: 0, ...options });
    await run(handle, home);
  } finally {
    await handle?.close();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(home, { recursive: true, force: true });
  }
}

/** Gửi yêu cầu thô để kiểm soát cả tiêu đề Host và Origin. */
function raw(handle, { pathname = '/', method = 'GET', headers = {}, body, cookie = true } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const request = http.request({ host: '127.0.0.1', port: handle.port, path: pathname, method, headers: {
      ...(cookie ? { cookie: `${handle.cookieName}=${handle.token}` } : {}),
      ...(payload !== undefined && !('content-type' in headers) ? { 'content-type': 'application/json' } : {}),
      ...headers,
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); resolve({ status: response.statusCode, headers: response.headers, text, json: () => JSON.parse(text) }); });
    });
    request.on('error', reject);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}
const post = (handle, pathname, body = {}, headers = {}) => raw(handle, { pathname, method: 'POST', body, headers });

test('lệnh cd: có dấu nháy đúng theo hệ điều hành', () => {
  assert.equal(cdCommand('/home/an/git-training/x/repo', 'linux'), 'cd "/home/an/git-training/x/repo"');
  assert.equal(cdCommand('/Users/An Nguyen/git training/repo', 'darwin'), 'cd "/Users/An Nguyen/git training/repo"');
  assert.equal(cdCommand('/tmp/a$b/repo', 'linux'), "cd '/tmp/a$b/repo'");
  assert.equal(cdCommand("/tmp/it's/repo", 'linux'), 'cd "/tmp/it\'s/repo"');
  assert.equal(cdCommand("/tmp/it's $HOME/repo", 'linux'), "cd '/tmp/it'\\''s $HOME/repo'");
  assert.equal(cdCommand('/tmp/a"b', 'linux'), "cd '/tmp/a\"b'");
  assert.equal(cdCommand('C:\\Users\\An Nguyen\\git-training\\repo', 'win32'), 'cd "C:\\Users\\An Nguyen\\git-training\\repo"');
  assert.equal(cdCommand('C:\\Users\\An\\$x\\repo', 'win32'), "Set-Location -LiteralPath 'C:\\Users\\An\\$x\\repo'");
  assert.equal(cdCommand("C:\\Users\\O'Neil\\$x", 'win32'), "Set-Location -LiteralPath 'C:\\Users\\O''Neil\\$x'");
  for (const platform of ['win32', 'darwin', 'linux']) assert.ok(terminalHelp(platform).length > 20);
});

test('mở trình duyệt: lệnh theo hệ điều hành, không qua shell, tôn trọng GIT_TRAINING_NO_BROWSER', async () => {
  const url = 'http://127.0.0.1:4000/?t=abc';
  const win = urlCommands(url, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, isWsl: false });
  assert.equal(win[0].command, 'C:\\Windows\\System32\\rundll32.exe');
  assert.deepEqual(win[0].args, ['url.dll,FileProtocolHandler', url]);
  assert.equal(urlCommands(url, { platform: 'darwin', env: {}, isWsl: false })[0].command, 'open');
  assert.deepEqual(urlCommands(url, { platform: 'linux', env: {}, isWsl: false }).map(item => item.command), ['xdg-open']);
  assert.deepEqual(urlCommands(url, { platform: 'linux', env: {}, isWsl: true }).map(item => item.command), ['wslview', 'rundll32.exe', 'xdg-open']);
  const calls = [];
  const spawn = (command, args) => { calls.push([command, args]); const handlers = {}; return { once(event, fn) { handlers[event] = fn; if (event === 'exit') setImmediate(() => fn(0)); return this; }, unref() {} }; };
  assert.deepEqual(await openUrl(url, { env: { GIT_TRAINING_NO_BROWSER: '1' }, platform: 'darwin', spawn }), { opened: false, reason: 'env' });
  assert.equal(calls.length, 0);
  assert.equal((await openUrl(url, { env: {}, platform: 'darwin', isWsl: false, spawn })).opened, true);
  assert.deepEqual(calls[0], ['open', [url]]);
});

test('bảo mật: chỉ nghe trên 127.0.0.1; thiếu hoặc sai mã thì bị từ chối; mã đúng đặt cookie HttpOnly SameSite=Strict', async () => {
  await withWeb(async handle => {
    assert.equal(handle.server.address().address, '127.0.0.1');
    assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32,}$/);
    const none = await raw(handle, { cookie: false });
    assert.equal(none.status, 403);
    assert.match(none.text, /đường dẫn đầy đủ/);
    assert.equal((await raw(handle, { pathname: '/?t=sai', cookie: false })).status, 403);
    assert.equal((await raw(handle, { pathname: '/api/lesson', cookie: false })).status, 403);
    assert.equal((await raw(handle, { pathname: '/static/app.js', cookie: false })).status, 403);
    assert.equal((await raw(handle, { pathname: '/theory/foundations/repository-init.html', cookie: false })).status, 403);
    const good = await raw(handle, { pathname: `/?t=${handle.token}`, cookie: false });
    assert.equal(good.status, 302);
    assert.equal(good.headers.location, '/');
    const setCookie = String(good.headers['set-cookie']);
    assert.ok(setCookie.startsWith(`${handle.cookieName}=${handle.token}`));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.equal((await raw(handle)).status, 200);
  });
});

test('bảo mật: tiêu đề Host lạ (DNS rebinding) bị từ chối kể cả có cookie; localhost được chấp nhận', async () => {
  await withWeb(async handle => {
    for (const host of ['evil.example', `evil.example:${handle.port}`, '127.0.0.1', `127.0.0.1:${handle.port + 1}`, `192.168.1.5:${handle.port}`]) {
      const result = await raw(handle, { headers: { host } });
      assert.equal(result.status, 421, `Host ${JSON.stringify(host)}`);
    }
    assert.equal((await raw(handle, { headers: { host: `localhost:${handle.port}` } })).status, 200);
    assert.equal((await raw(handle, { headers: { host: `127.0.0.1:${handle.port}` } })).status, 200);
  });
});

test('bảo mật: yêu cầu ghi cần JSON, Origin cùng nguồn và không đến từ trang khác', async () => {
  await withWeb(async handle => {
    const host = `127.0.0.1:${handle.port}`;
    assert.equal((await raw(handle, { pathname: '/api/open', method: 'POST', body: 'x=1', headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await raw(handle, { pathname: '/api/open', method: 'POST', body: 'x=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
    assert.equal((await post(handle, '/api/open', {}, { origin: 'http://evil.example' })).status, 403);
    assert.equal((await post(handle, '/api/open', {}, { origin: `http://localhost:${handle.port}` })).status, 403);
    assert.equal((await post(handle, '/api/open', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(handle, '/api/open', {}, { 'sec-fetch-site': 'same-site' })).status, 403);
    assert.equal((await post(handle, '/api/ping', {}, { origin: `http://${host}`, 'sec-fetch-site': 'same-origin' })).status, 200);
    assert.equal((await post(handle, '/api/ping', {})).status, 200);
    assert.equal((await raw(handle, { pathname: '/api/ping', method: 'POST', body: '{không phải json', headers: {} })).status, 400);
    assert.equal((await raw(handle, { pathname: '/api/ping', method: 'POST', body: 'x'.repeat(40000) })).status, 400);
    assert.equal((await raw(handle, { pathname: '/api/open', method: 'DELETE', headers: {} })).status, 405);
  });
});

test('tiêu đề an toàn và tệp tĩnh có sẵn trong gói, không gọi tài nguyên ngoài', async () => {
  await withWeb(async handle => {
    const page = await raw(handle);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'self'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.headers['cache-control'], 'no-store');
    const css = await raw(handle, { pathname: '/static/app.css' });
    const js = await raw(handle, { pathname: '/static/app.js' });
    assert.equal(css.status, 200); assert.match(css.headers['content-type'], /text\/css/);
    assert.equal(js.status, 200); assert.match(js.headers['content-type'], /javascript/);
    for (const html of [page.text, (await raw(handle, { pathname: '/progress' })).text]) {
      assert.doesNotMatch(html, /(?:src|href)="https?:\/\//, 'trang không được nạp tài nguyên từ mạng ngoài');
      assert.match(html, /\/theory\/assets\/fonts\.css/);
    }
    assert.doesNotMatch(css.text, /@import\s+url\(["']?https?:|url\(["']?https?:/);
    assert.doesNotMatch(js.text, /\bfetch\(['"]https?:|XMLHttpRequest|WebSocket|importScripts/);
    const fonts = await raw(handle, { pathname: '/theory/assets/fonts.css' });
    assert.equal(fonts.status, 200);
    const font = await raw(handle, { pathname: '/theory/assets/fonts/be-vietnam-pro-vietnamese-400-normal.woff2' });
    assert.equal(font.status, 200); assert.equal(font.headers['content-type'], 'font/woff2');
  });
});

test('trang lý thuyết nhúng: phục vụ đúng tệp, chèn kiểu nhúng, chặn đi ra ngoài thư mục và thư mục nguồn', async () => {
  await withWeb(async handle => {
    const plain = await raw(handle, { pathname: '/theory/foundations/repository-init.html' });
    assert.equal(plain.status, 200);
    assert.doesNotMatch(plain.text, /\.site-header\{display:none\}/);
    const embedded = await raw(handle, { pathname: '/theory/foundations/repository-init.html?embed=1' });
    assert.equal(embedded.status, 200);
    assert.match(embedded.text, /\.site-header\{display:none\}/);
    assert.match(embedded.headers['content-security-policy'], /script-src 'self' 'unsafe-eval'/);
    assert.doesNotMatch((await raw(handle)).headers['content-security-policy'], /unsafe-eval/);
    for (const bad of ['/theory/../package.json', '/theory/%2e%2e/package.json', '/theory/..%2fpackage.json', '/theory/foundations/../../package.json', '/theory/src/foundations/repository-init.md', '/theory/examples/x.html', '/theory/vendor/marked.esm.js', '/theory/build.mjs', '/theory/foundations/nope.html', '/theory/.git/config', '/theory/foundations%5C..%5C..%5Cpackage.json', '/theory/foundations/%00.html']) {
      const result = await raw(handle, { pathname: bad });
      assert.ok([404, 400].includes(result.status), `${bad} -> ${result.status}`);
      assert.doesNotMatch(result.text, /"name": "@duy247/);
    }
  });
  assert.equal(await readTheoryFile(root, '/theory/../package.json'), undefined);
  assert.ok(await readTheoryFile(root, '/theory/foundations/repository-init.html'));
});

test('trang: chào mừng, bài học cần phiên, tiến độ liệt kê 116 bài không khóa, hoàn thành', async () => {
  await withWeb(async handle => {
    const welcome = await raw(handle);
    assert.match(welcome.text, /Bắt đầu học/);
    assert.match(welcome.text, /Học Git bằng cách làm thật/);
    assert.match(welcome.text, /<html lang="vi">/);
    const noSession = await raw(handle, { pathname: '/lesson' });
    assert.equal(noSession.status, 302); assert.equal(noSession.headers.location, '/');
    assert.equal((await raw(handle, { pathname: '/finish' })).status, 302);
    const apiNo = await raw(handle, { pathname: '/api/lesson' });
    assert.equal(apiNo.status, 409); assert.equal(apiNo.json().code, 'no-session');
    const progress = await raw(handle, { pathname: '/progress' });
    assert.equal(progress.status, 200);
    assert.equal((progress.text.match(/data-lesson="/g) ?? []).length, 116);
    assert.equal((progress.text.match(/<details/g) ?? []).length, 11);
    assert.doesNotMatch(progress.text, /disabled|chưa mở khóa/);
    assert.match(progress.text, /Không bài nào bị khóa/);
    assert.equal((await raw(handle, { pathname: '/khong-co' })).status, 404);
    assert.equal((await post(handle, '/api/open', { course: 'foundations' })).status, 200);
    assert.match((await raw(handle)).text, /Tiếp tục học/);
    assert.equal((await raw(handle, { pathname: '/lesson' })).status, 200);
    assert.match((await raw(handle, { pathname: '/lesson' })).text, /id="app"/);
    assert.match((await raw(handle, { pathname: '/finish' })).text, /Bạn đã học xong chủ đề/);
  });
});

test('mở bài: mã chủ đề hoặc bài sai bị từ chối; nhảy tới bài chưa mở khóa được (không khóa bài)', async () => {
  await withWeb(async handle => {
    assert.equal((await post(handle, '/api/open', { course: 'khong-co' })).status, 500);
    assert.equal((await post(handle, '/api/open', { course: 'foundations', lesson: '../../x' })).status, 400);
    const jump = await post(handle, '/api/open', { course: 'foundations', lesson: 'status-log-diff' });
    assert.equal(jump.status, 200);
    const state = (await raw(handle, { pathname: '/api/lesson' })).json().state;
    assert.equal(state.exercise.id, 'status-log-diff');
    assert.equal(state.position, 3);
    assert.equal(state.course.id, 'foundations');
  });
});

test('bài thực hành: đáp án đúng không bao giờ báo "chưa phù hợp"; tự kiểm tra không tính lần thử; đạt thì ghi vào session.json dùng chung', async () => {
  await withWeb(async handle => {
    await post(handle, '/api/open', { course: 'foundations' });
    let state = (await raw(handle, { pathname: '/api/lesson' })).json().state;
    assert.equal(state.exercise.id, 'repository-init');
    assert.deepEqual(state.steps.map(step => `${step.id}:${step.state}`), ['theory:current', 'work:todo', 'answer:todo', 'check:todo']);
    assert.equal(state.cd, cdCommand(state.repo));
    assert.equal(state.exercise.theoryUrl, '/theory/foundations/repository-init.html');
    assert.ok(state.missing.length > 0);
    // đọc trạng thái nhiều lần: không tăng lần thử
    for (let i = 0; i < 3; i++) { const poll = (await post(handle, '/api/poll')).json(); assert.equal(poll.justPassed, false); assert.equal(poll.state.attempts, 0); }
    // trả lời sai: thông báo thân thiện, tính 1 lần thử
    const wrong = (await post(handle, '/api/answer', { answer: 'master' })).json();
    assert.equal(wrong.answerCorrect, false); assert.equal(wrong.passed, false);
    assert.match(wrong.message, /chưa đúng/); assert.equal(wrong.state.attempts, 1); assert.equal(wrong.state.wrongTries, 1);
    const wrong2 = (await post(handle, '/api/answer', { answer: 'trunk' })).json();
    assert.equal(wrong2.state.wrongTries, 2); assert.match(wrong2.message, /Đừng lo/);
    assert.equal((await post(handle, '/api/answer', { answer: '   ' })).status, 400);
    // đáp án đúng khi phần Git chưa xong
    const right = (await post(handle, '/api/answer', { answer: 'main' })).json();
    assert.equal(right.answerCorrect, true); assert.equal(right.passed, false);
    assert.doesNotMatch(right.message, /chưa phù hợp|chưa đúng/);
    assert.match(right.message, /Đáp án đúng/);
    assert.equal(right.state.answerPass, true); assert.equal(right.state.savedAnswer, 'main');
    assert.equal(right.state.wrongTries, 0);
    const attempts = right.state.attempts;
    // làm phần Git ở "terminal khác"; trang tự nhận mà không tăng lần thử
    await git(right.state.repo, 'init', '-b', 'main');
    const poll = (await post(handle, '/api/poll')).json();
    assert.equal(poll.justPassed, true); assert.equal(poll.state.complete, true);
    assert.equal(poll.state.attempts, attempts, 'tự kiểm tra không được tính lần thử');
    assert.deepEqual(poll.state.steps.map(step => step.state), ['done', 'done', 'done', 'done']);
    assert.equal(poll.state.hasNext, true); assert.equal(poll.state.nextTitle, 'Stage và commit');
    const again = (await post(handle, '/api/poll')).json();
    assert.equal(again.justPassed, false); assert.equal(again.state.complete, true);
    // định dạng session.json không đổi, terminal đọc được cùng tiến độ
    const session = JSON.parse(await readFile(path.join(path.dirname(path.dirname(path.dirname(right.state.repo))), 'session.json'), 'utf8'));
    assert.equal(session.version, 2); assert.deepEqual(session.completed, ['repository-init']); assert.equal(session.answers['repository-init'], 'main');
    // Bài tiếp theo
    const next = (await post(handle, '/api/next')).json();
    assert.equal(next.finished, false);
    assert.equal((await raw(handle, { pathname: '/api/lesson' })).json().state.exercise.id, 'stage-and-commit');
    assert.match((await raw(handle, { pathname: '/progress' })).text, /Đã xong/);
  });
});

test('"Kiểm tra lại" tính đúng một lần thử; chưa trả lời thì nhắc nhẹ nhàng', async () => {
  await withWeb(async handle => {
    await post(handle, '/api/open', { course: 'foundations' });
    const first = (await post(handle, '/api/check')).json();
    assert.equal(first.passed, false); assert.match(first.message, /chưa trả lời/); assert.equal(first.state.attempts, 0);
    await post(handle, '/api/answer', { answer: 'main' });
    const before = (await raw(handle, { pathname: '/api/lesson' })).json().state;
    const second = (await post(handle, '/api/check')).json();
    assert.equal(second.passed, false);
    assert.equal(second.state.attempts, before.attempts + 1);
    await git(before.repo, 'init', '-b', 'main');
    const third = (await post(handle, '/api/check')).json();
    assert.equal(third.passed, true); assert.equal(third.state.attempts, before.attempts + 2);
  });
});

test('bài chỉ trả lời (status-log-diff): 3 bước, đáp án sai rồi đúng, gợi ý và lời giải cần xác nhận', async () => {
  await withWeb(async handle => {
    await post(handle, '/api/open', { course: 'foundations', lesson: 'status-log-diff' });
    let state = (await raw(handle, { pathname: '/api/lesson' })).json().state;
    assert.equal(state.exercise.mode, 'answer');
    assert.deepEqual(state.steps.map(step => step.id), ['theory', 'work', 'answer']);
    assert.match(state.steps[1].label, /Xem thử/);
    assert.equal(state.pollable, false);
    assert.equal(state.exercise.expected, '');
    assert.equal((await post(handle, '/api/flag', { step: 'khac' })).status, 400);
    state = (await post(handle, '/api/flag', { step: 'theory' })).json().state;
    state = (await post(handle, '/api/flag', { step: 'work' })).json().state;
    assert.equal(state.currentStep, 'answer');
    const wrong = (await post(handle, '/api/answer', { answer: 'git status' })).json();
    assert.equal(wrong.answerCorrect, false); assert.doesNotMatch(wrong.message, /phù hợp/);
    assert.equal((await post(handle, '/api/solution', {})).status, 400);
    const solution = (await post(handle, '/api/solution', { confirm: true })).json();
    assert.match(solution.solution, /git diff/);
    const hint = (await post(handle, '/api/hint')).json();
    assert.equal(hint.hint.level, 1); assert.ok(hint.hint.text.length > 5); assert.equal(hint.state.hintsSeen.length, 1);
    const hint2 = (await post(handle, '/api/hint')).json();
    assert.equal(hint2.state.hintsSeen.length, 2);
    assert.equal((await post(handle, '/api/hint')).json().hint.exhausted, true);
    const right = (await post(handle, '/api/answer', { answer: 'git diff' })).json();
    assert.equal(right.answerCorrect, true); assert.equal(right.passed, true);
    assert.doesNotMatch(right.message, /chưa/);
    assert.equal(right.state.complete, true);
    assert.equal(right.state.attempts, 2);
  });
});

test('làm lại bài tạo lại thư mục bài tập và xóa đáp án đã lưu', async () => {
  await withWeb(async handle => {
    await post(handle, '/api/open', { course: 'foundations' });
    await post(handle, '/api/answer', { answer: 'main' });
    const state = (await raw(handle, { pathname: '/api/lesson' })).json().state;
    await git(state.repo, 'init', '-b', 'main');
    assert.ok(existsSync(path.join(state.repo, '.git')));
    const again = (await post(handle, '/api/restart')).json().state;
    assert.equal(again.answerSaved, false);
    assert.equal(existsSync(path.join(again.repo, '.git')), false);
  });
});

test('tự dừng khi không dùng quá thời gian quy định, và đóng sạch', async () => {
  let idle = false;
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-idle-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state'); process.env.HOME = home; process.env.USERPROFILE = home;
  try {
    const handle = await startDashboard({ version: 'x', idleMs: 120, onIdle: () => { idle = true; } });
    const closed = new Promise(resolve => handle.server.once('close', resolve));
    await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('không tự dừng')), 5000))]);
    assert.equal(idle, true);
  } finally { await rm(home, { recursive: true, force: true }); }
  assert.equal(idleMinutes({}), 120);
  assert.equal(idleMinutes({ GIT_TRAINING_IDLE_MINUTES: '0' }), 0);
  assert.equal(idleMinutes({ GIT_TRAINING_IDLE_MINUTES: '15' }), 15);
  assert.equal(idleMinutes({ GIT_TRAINING_IDLE_MINUTES: 'abc' }), 120);
});

test('Dashboard dùng được trực tiếp (không HTTP): tiến độ gộp mọi chủ đề', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-dash-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, GIT_TRAINING_HOME: process.env.GIT_TRAINING_HOME };
  process.env.HOME = home; process.env.USERPROFILE = home; process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    const dashboard = new Dashboard(); await dashboard.init();
    assert.equal(dashboard.hasSession(), false);
    const empty = await dashboard.progress();
    assert.equal(empty.tracks.length, 11); assert.equal(empty.totalAll, 116); assert.equal(empty.doneAll, 0);
    await dashboard.openLesson('branching');
    const view = await dashboard.progress();
    assert.equal(view.activeCourse, 'branching');
    assert.equal(view.tracks.find(track => track.id === 'branching').lessons.find(lesson => lesson.current).id, 'create-and-switch');
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(home, { recursive: true, force: true });
  }
});

test('gói phát hành: tệp web có trong files, nhỏ gọn, không cần Tailwind lúc chạy', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(manifest.files.includes('web'), 'files phải có web');
  assert.ok(manifest.files.includes('dist'));
  assert.equal(manifest.dependencies, undefined, 'không có dependency lúc chạy');
  assert.ok(manifest.devDependencies.tailwindcss && manifest.devDependencies['@tailwindcss/cli']);
  assert.match(manifest.scripts['build:css'], /tailwindcss .*web\/app\.css/);
  assert.match(manifest.scripts.prepublishOnly, /build:css/);
  for (const file of ['web/app.css', 'web/app.js', 'dist/web/server.js', 'theory/assets/fonts.css']) assert.ok(existsSync(path.join(root, file)), file);
  assert.ok(statSync(path.join(root, 'web/app.css')).size < 60 * 1024, 'CSS đã dựng phải nhỏ hơn 60 KB');
  assert.ok(statSync(path.join(root, 'web/app.js')).size < 60 * 1024, 'JS phải nhỏ hơn 60 KB');
  const css = readFileSync(path.join(root, 'web/app.css'), 'utf8');
  for (const needle of ['prefers-color-scheme:dark', 'prefers-reduced-motion', '.btn', '.step']) assert.ok(css.includes(needle), `CSS thiếu ${needle}`);
  assert.equal(packageRoot, root + path.sep);
});

test('CSS đã dựng chứa các lớp Tailwind mà trang dùng (không quên chạy npm run build:css)', () => {
  const css = readFileSync(path.join(root, 'web/app.css'), 'utf8');
  const sources = ['web/app.js', 'src/web/pages.ts'].map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
  const used = new Set();
  for (const match of sources.matchAll(/class(?:Name)?="([^"$`{}]+)"/g)) for (const token of match[1].split(/\s+/)) if (/^(?:[a-z-]+:)*(?:text|bg|border|mt|mb|px|py|pt|pb|gap|flex|grid|max-w|min-h|w|h|font|space-y|rounded|sr-only|underline)-?[\w./\[\]-]*$/.test(token)) used.add(token);
  const escape = value => value.replace(/[:./\[\]]/g, '\\$&');
  const missing = [...used].filter(token => !css.includes(escape(token)) && !css.includes(token));
  assert.deepEqual(missing, [], `Thiếu lớp trong web/app.css: ${missing.join(', ')}`);
});

test('CLI: git-training web --no-open in đường dẫn, phục vụ trang, dừng sạch', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-cli-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_TRAINING_HOME: path.join(home, 'state'), GIT_TRAINING_NO_BROWSER: '1' };
  const child = spawn(process.execPath, [path.join(root, 'bin', 'git-training.cjs'), 'web', '--no-open'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`không thấy đường dẫn: ${output}`)), 15000);
      const check = () => { const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]+/.exec(output); if (match) { clearTimeout(timer); resolve(match[0]); } else setTimeout(check, 50); };
      check();
    });
    assert.match(output, /Giữ cửa sổ này mở/);
    assert.match(output, /Ctrl\+C/);
    const origin = new URL(url).origin;
    const blocked = await fetch(`${origin}/`);
    assert.equal(blocked.status, 403);
    const first = await fetch(url, { redirect: 'manual' });
    assert.equal(first.status, 302);
    const cookie = first.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${origin}/`, { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Bắt đầu học/);
  } finally {
    child.kill(process.platform === 'win32' ? undefined : 'SIGINT');
    const result = await Promise.race([exited, new Promise(resolve => setTimeout(() => { child.kill('SIGKILL'); resolve({ code: 'timeout' }); }, 8000))]);
    if (process.platform !== 'win32') { assert.equal(result.code, 0, `phải thoát sạch khi nhận Ctrl+C: ${output}`); assert.match(output, /Đã dừng/); }
    await rm(home, { recursive: true, force: true });
  }
});

test('CLI: --terminal và --port sai được xử lý; không có TTY thì in hướng dẫn thay vì mở máy chủ', () => {
  const run = args => spawnSync(process.execPath, [path.join(root, 'bin', 'git-training.cjs'), ...args], { encoding: 'utf8', env: { ...process.env, GIT_TRAINING_NO_BROWSER: '1' }, timeout: 15000 });
  const terminal = run(['--terminal']);
  assert.equal(terminal.status, 0);
  assert.match(terminal.stdout, /git-training --terminal/);
  assert.match(terminal.stdout, /git-training web/);
  const bare = run([]);
  assert.equal(bare.status, 0);
  assert.match(bare.stdout, /trình duyệt/);
  const badPort = run(['web', '--port', 'abc']);
  assert.notEqual(badPort.status, 0);
  assert.match(badPort.stderr, /--port/);
});
