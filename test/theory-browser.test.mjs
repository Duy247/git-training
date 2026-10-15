import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { courses } from '../dist/index.js';
import { theoryPagePath, openTheory, theoryMessage, skipReason, openCommands, detectWsl } from '../dist/theory.js';

/** Giả lập spawn: ghi lại lệnh, không bao giờ chạy trình duyệt thật. */
function fakeSpawn(behavior = 'ok') {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    const mode = typeof behavior === 'function' ? behavior(command) : behavior;
    queueMicrotask(() => {
      if (mode === 'enoent') child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
      else if (mode === 'ok') child.emit('exit', 0);
      else if (mode === 'fail') child.emit('exit', 3);
    });
    return child;
  };
  return { spawn, calls };
}
const displayEnv = { DISPLAY: ':0' };

test('mọi bài trong roadmap đều có trang lý thuyết tồn tại', () => {
  let count = 0;
  for (const course of courses) for (const exercise of course.exercises) {
    const file = theoryPagePath(course.id, exercise.id);
    assert.ok(file, `thiếu trang cho ${course.id}/${exercise.id}`);
    assert.ok(path.isAbsolute(file));
    assert.ok(existsSync(file));
    assert.equal(file.endsWith(path.join('theory', course.id, `${exercise.id}.html`)), true);
    count++;
  }
  assert.equal(count, 116);
});

test('theoryPagePath từ chối id lạ hoặc đường dẫn thoát thư mục', () => {
  assert.equal(theoryPagePath('foundations', 'khong-ton-tai'), undefined);
  assert.equal(theoryPagePath('..', 'index'), undefined);
  assert.equal(theoryPagePath('foundations', '../index'), undefined);
  assert.equal(theoryPagePath('foundations/../branching', 'rebase'), undefined);
  assert.equal(theoryPagePath('', ''), undefined);
});

test('quy tắc bỏ qua việc mở trình duyệt', () => {
  const s = (env, platform = 'linux', extra = {}) => skipReason({ env, platform, isWsl: false, ...extra });
  assert.equal(s(displayEnv), undefined);
  assert.equal(s({ WAYLAND_DISPLAY: 'wayland-0' }), undefined);
  assert.equal(s(displayEnv, 'linux', { noBrowser: true }), 'flag');
  assert.equal(s({ ...displayEnv, GIT_TRAINING_NO_BROWSER: '1' }), 'env');
  assert.equal(s({ ...displayEnv, GIT_TRAINING_NO_BROWSER: 'true' }), 'env');
  assert.equal(s({ ...displayEnv, GIT_TRAINING_NO_BROWSER: '0' }), undefined);
  assert.equal(s({ ...displayEnv, CI: 'true' }), 'ci');
  assert.equal(s({ ...displayEnv, CI: '' }), undefined);
  assert.equal(s({ ...displayEnv, NODE_ENV: 'test' }), 'test');
  assert.equal(s({}), 'headless');
  assert.equal(s({ SSH_CONNECTION: '1 2 3 4' }), 'ssh');
  assert.equal(s({ SSH_TTY: '/dev/pts/0' }), 'ssh');
  assert.equal(s({ SSH_TTY: '/dev/pts/0', DISPLAY: 'localhost:10.0' }), undefined);
  // Windows, macOS và WSL không cần DISPLAY
  assert.equal(s({}, 'win32'), undefined);
  assert.equal(s({ SSH_CONNECTION: 'x' }, 'win32'), undefined);
  assert.equal(s({}, 'darwin'), undefined);
  assert.equal(s({}, 'linux', { isWsl: true }), undefined);
  assert.equal(s({ CI: '1' }, 'darwin'), 'ci');
});

test('phát hiện WSL', () => {
  assert.equal(detectWsl({ WSL_DISTRO_NAME: 'Ubuntu' }, 'linux'), true);
  assert.equal(detectWsl({ WSL_DISTRO_NAME: 'Ubuntu' }, 'win32'), false);
  assert.equal(detectWsl({}, 'darwin'), false);
});

test('chọn lệnh mở theo từng hệ điều hành', () => {
  const file = '/home/u/pkg/theory/foundations/repository-init.html';
  const l = openCommands(file, { platform: 'linux', env: {}, isWsl: false });
  assert.deepEqual(l.map(c => [c.command, c.args]), [['xdg-open', [file]]]);
  const m = openCommands(file, { platform: 'darwin', env: {}, isWsl: false });
  assert.deepEqual(m.map(c => [c.command, c.args]), [['open', [file]]]);
  const wsl = openCommands(file, { platform: 'linux', env: {}, isWsl: true, toWindowsPath: () => '\\\\wsl.localhost\\Ubuntu\\home\\u\\pkg\\theory\\a b&c.html' });
  assert.deepEqual(wsl.map(c => c.command), ['wslview', 'rundll32.exe', 'xdg-open']);
  assert.match(wsl[1].args[1], /^file:\/\/wsl\.localhost\/Ubuntu\/home\/u\/pkg\/theory\/a%20b&c\.html$/);
  for (const command of [...l, ...m, ...wsl]) {
    assert.equal(command.options.detached, true);
    assert.equal(command.options.stdio, 'ignore');
  }
});

test('Windows: dùng rundll32 + file URL, không qua cmd.exe nên không cần escape ký tự đặc biệt', () => {
  const files = [
    'C:\\Users\\Duy\\AppData\\npm\\node_modules\\git-training\\theory\\foundations\\repository-init.html',
    'C:\\Users\\Nguyễn Văn Duy\\My Tools & Co\\git-training\\theory\\branching\\rebase.html',
    'D:\\Tài liệu\\100%\\a#b\\c^d(1)\\x.html',
    '\\\\server\\share\\git training\\theory\\undo\\reset.html',
  ];
  for (const file of files) {
    const [only, ...others] = openCommands(file, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, isWsl: false });
    assert.equal(others.length, 0);
    assert.equal(only.command, 'C:\\Windows\\System32\\rundll32.exe');
    assert.equal(only.args.length, 2);
    assert.equal(only.args[0], 'url.dll,FileProtocolHandler');
    const url = only.args[1];
    assert.match(url, /^file:\/\//);
    // Node chỉ thêm dấu nháy khi đối số có khoảng trắng hoặc dấu nháy; URL không có hai thứ đó.
    assert.doesNotMatch(url, /[\s"'`<>|^]/);
    assert.ok(!('shell' in only.options) || only.options.shell !== true);
    assert.equal(only.options.windowsVerbatimArguments, undefined);
    // Giải mã lại phải ra đúng đường dẫn gốc
    const decoded = decodeURIComponent(new URL(url).pathname);
    assert.ok(decoded.endsWith(file.split('\\').slice(-3).join('/')), decoded);
  }
  const ampersand = openCommands(files[1], { platform: 'win32', env: {}, isWsl: false })[0];
  assert.equal(ampersand.command, 'rundll32.exe');
  assert.match(ampersand.args[1], /My%20Tools%20&%20Co/);
  assert.match(ampersand.args[1], /Nguy%E1%BB%85n/);
  assert.match(openCommands(files[2], { platform: 'win32', env: {}, isWsl: false })[0].args[1], /100%25\/a%23b/);
});

test('openTheory: mở đúng tệp, ghi nhận, không mở lại trong cùng tiến trình trừ khi reopen', async () => {
  const { spawn, calls } = fakeSpawn('ok');
  const opened = new Set();
  const base = { env: displayEnv, platform: 'linux', isWsl: false, spawn, opened };
  const first = await openTheory('foundations', 'repository-init', base);
  assert.equal(first.opened, true);
  assert.equal(first.path, theoryPagePath('foundations', 'repository-init'));
  assert.deepEqual(calls.map(c => [c.command, c.args]), [['xdg-open', [first.path]]]);
  assert.match(theoryMessage(first), /^Đã mở bài lý thuyết trong trình duyệt: .*repository-init\.html$/);
  const again = await openTheory('foundations', 'repository-init', base);
  assert.deepEqual([again.opened, again.reason], [false, 'already-opened']);
  assert.equal(calls.length, 1);
  assert.match(theoryMessage(again), /^Bài lý thuyết: /);
  assert.equal((await openTheory('foundations', 'repository-init', { ...base, reopen: true })).opened, true);
  assert.equal(calls.length, 2);
  const other = await openTheory('branching', 'rebase', base);
  assert.equal(other.opened, true);
  assert.equal(calls.length, 3);
});

test('openTheory: bỏ qua có lý do, vẫn trả đường dẫn và không spawn', async () => {
  const { spawn, calls } = fakeSpawn('ok');
  const base = { platform: 'linux', isWsl: false, spawn, opened: new Set() };
  for (const [options, reason] of [
    [{ env: displayEnv, noBrowser: true }, 'flag'],
    [{ env: { ...displayEnv, GIT_TRAINING_NO_BROWSER: '1' } }, 'env'],
    [{ env: { ...displayEnv, CI: '1' } }, 'ci'],
    [{ env: {} }, 'headless'],
    [{ env: { SSH_CONNECTION: 'a b c d' } }, 'ssh'],
  ]) {
    const r = await openTheory('foundations', 'repository-init', { ...base, ...options });
    assert.deepEqual([r.opened, r.reason], [false, reason]);
    assert.equal(r.path, theoryPagePath('foundations', 'repository-init'));
    assert.match(theoryMessage(r), /^Bài lý thuyết: /);
  }
  assert.equal(calls.length, 0);
});

test('openTheory: bài không có trang thì im lặng; lỗi spawn không throw', async () => {
  const none = await openTheory('foundations', 'khong-co', { env: displayEnv, platform: 'linux', isWsl: false, spawn: fakeSpawn().spawn });
  assert.deepEqual(none, { opened: false, reason: 'no-page' });
  assert.equal(theoryMessage(none), undefined);
  const missing = await openTheory('foundations', 'repository-init', { env: displayEnv, platform: 'linux', isWsl: false, spawn: fakeSpawn('enoent').spawn, opened: new Set() });
  assert.equal(missing.opened, false);
  assert.match(missing.reason, /^launch-failed/);
  assert.match(theoryMessage(missing), /^Bài lý thuyết: /);
  const failing = await openTheory('foundations', 'repository-init', { env: displayEnv, platform: 'linux', isWsl: false, spawn: fakeSpawn('fail').spawn, opened: new Set() });
  assert.equal(failing.opened, false);
  const throwing = await openTheory('foundations', 'repository-init', { env: displayEnv, platform: 'linux', isWsl: false, spawn: () => { throw new Error('boom'); }, opened: new Set() });
  assert.equal(throwing.opened, false);
  // trình mở chạy lâu (xdg-open giữ tiến trình) vẫn tính là đã mở sau thời gian chờ ngắn
  const slow = await openTheory('foundations', 'repository-init', { env: displayEnv, platform: 'linux', isWsl: false, spawn: fakeSpawn('hang').spawn, opened: new Set(), waitMs: 20 });
  assert.equal(slow.opened, true);
});

test('WSL: wslview thiếu thì thử rundll32.exe với đường dẫn Windows', async () => {
  const { spawn, calls } = fakeSpawn(command => command === 'wslview' ? 'enoent' : 'ok');
  const result = await openTheory('foundations', 'repository-init', { env: {}, platform: 'linux', isWsl: true, spawn, opened: new Set(), toWindowsPath: () => '\\\\wsl.localhost\\Ubuntu\\x\\a b.html' });
  assert.equal(result.opened, true);
  assert.deepEqual(calls.map(c => c.command), ['wslview', 'rundll32.exe']);
});

test('CLI: --no-browser được chấp nhận ở mọi vị trí và không phá kiểm tra đối số', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-theory-'));
  const bin = path.join(home, 'bin');
  const log = path.join(home, 'opened.log');
  await mkdir(bin);
  await writeFile(path.join(bin, 'xdg-open'), `#!/bin/sh\necho "$@" >> "${log}"\n`);
  await chmod(path.join(bin, 'xdg-open'), 0o755);
  const run = (args, env = {}) => spawnSync(process.execPath, [path.resolve('bin', 'git-training.cjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TRAINING_HOME: path.join(home, 'state'), GIT_TRAINING_NO_BROWSER: '', CI: '', NODE_ENV: '', PATH: `${bin}:${process.env.PATH}`, DISPLAY: ':0', ...env },
  });
  try {
    const flagged = run(['start', '--no-browser', 'foundations', '--dir', path.join(home, 'w1')]);
    assert.equal(flagged.status, 0, flagged.stderr);
    assert.match(flagged.stdout, /Bài lý thuyết: .*repository-init\.html/);
    assert.equal(existsSync(log), false);
    const combos = run(['start', 'foundations', '--no-browser', '--dir', path.join(home, 'w2')]);
    assert.equal(combos.status, 0, combos.stderr);
    const trailing = run(['start', 'foundations', '--dir', path.join(home, 'w3'), '--no-browser']);
    assert.equal(trailing.status, 0, trailing.stderr);
    assert.equal(existsSync(log), false);
    assert.match(run(['status', '--no-browser']).stderr, /không nhận đối số/);
    assert.match(run(['open', 'a', 'b', '--no-browser']).stderr, /chỉ nhận một mã bài/);
    // status không mở trình duyệt, start mở đúng tệp
    assert.equal(run(['status']).status, 0);
    assert.equal(existsSync(log), false);
    const opened = run(['start', 'foundations']);
    assert.equal(opened.status, 0, opened.stderr);
    assert.match(opened.stdout, /Đã mở bài lý thuyết trong trình duyệt: .*repository-init\.html/);
    assert.equal((await readFile(log, 'utf8')).trim(), theoryPagePath('foundations', 'repository-init'));
    const headless = run(['status'], { DISPLAY: '' });
    assert.equal(headless.status, 0);
    const suppressed = run(['open', 'repository-init'], { GIT_TRAINING_NO_BROWSER: '1' });
    assert.match(suppressed.stdout, /Bài lý thuyết: /);
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
    const noDisplay = run(['open', 'repository-init'], { DISPLAY: '', WAYLAND_DISPLAY: '' });
    assert.match(noDisplay.stdout, /Bài lý thuyết: /);
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
  } finally { await rm(home, { recursive: true, force: true }); }
});
