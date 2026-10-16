import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openFolder, folderMessage, fileManagerName } from '../dist/index.js';
import { folderCommands, folderSkipReason } from '../dist/explorer.js';

/** Giả lập spawn: ghi lại lệnh; hành vi theo tên lệnh hoặc chung cho mọi lệnh. */
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
      else if (mode === 'one') child.emit('exit', 1);
      else if (mode === 'fail') child.emit('exit', 3);
    });
    return child;
  };
  return { spawn, calls };
}
const display = { DISPLAY: ':0' };
const dir = os.tmpdir();

test('tên trình quản lý tệp theo hệ điều hành', () => {
  assert.equal(fileManagerName('win32'), 'File Explorer');
  assert.equal(fileManagerName('darwin'), 'Finder');
  assert.equal(fileManagerName('linux'), 'trình quản lý tệp');
  assert.equal(fileManagerName('linux', true), 'File Explorer');
});

test('quy tắc bỏ qua việc mở thư mục', () => {
  const s = (env, platform = 'linux', isWsl = false) => folderSkipReason({ env, platform, isWsl });
  assert.equal(s(display), undefined);
  assert.equal(s({}, 'win32'), undefined);
  assert.equal(s({}, 'darwin'), undefined);
  assert.equal(s({}, 'linux', true), undefined);
  assert.equal(s({}), 'headless');
  assert.equal(s({ SSH_CONNECTION: '1 2 3 4' }), 'ssh');
  assert.equal(s({ ...display, GIT_TRAINING_NO_EXPLORER: '1' }), 'env');
  assert.equal(s({ ...display, GIT_TRAINING_NO_EXPLORER: '0' }), undefined);
  assert.equal(s({ ...display, NODE_ENV: 'test' }), 'test');
  // Mở thư mục là thao tác chủ động của người học, nên CI và --no-browser không chặn nó.
  assert.equal(s({ ...display, CI: 'true', GIT_TRAINING_NO_BROWSER: '1' }), undefined);
});

test('lệnh mở thư mục theo từng hệ điều hành', () => {
  const win = folderCommands('C:/Users/Việt Nam/a b&c/repo', { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, isWsl: false });
  assert.equal(win.length, 1);
  assert.equal(win[0].command, 'C:\\Windows\\explorer.exe');
  assert.deepEqual(win[0].args, ['C:\\Users\\Việt Nam\\a b&c\\repo']);
  assert.deepEqual(win[0].okExit, [0, 1]);
  assert.equal(folderCommands('C:\\x', { platform: 'win32', env: {}, isWsl: false })[0].command, 'explorer.exe');
  const mac = folderCommands('/Users/a/repo', { platform: 'darwin', env: {}, isWsl: false });
  assert.deepEqual(mac.map(c => [c.command, c.args]), [['open', ['/Users/a/repo']]]);
  const linux = folderCommands('/home/a/repo', { platform: 'linux', env: display, isWsl: false });
  assert.deepEqual(linux.map(c => c.command), ['xdg-open', 'gio']);
  assert.deepEqual(linux[1].args, ['open', '/home/a/repo']);
  const wsl = folderCommands('/home/a/repo', { platform: 'linux', env: {}, isWsl: true, toWindowsPath: () => '\\\\wsl$\\Ubuntu\\home\\a\\repo' });
  assert.deepEqual(wsl.map(c => c.command), ['explorer.exe', 'wslview', 'xdg-open']);
  assert.deepEqual(wsl[0].args, ['\\\\wsl$\\Ubuntu\\home\\a\\repo']);
  assert.deepEqual(wsl[0].okExit, [0, 1]);
  const wslNoPath = folderCommands('/home/a/repo', { platform: 'linux', env: {}, isWsl: true, toWindowsPath: () => undefined });
  assert.deepEqual(wslNoPath.map(c => c.command), ['wslview', 'xdg-open']);
});

test('openFolder: Windows coi mã thoát 1 của explorer.exe là đã mở', async () => {
  const { spawn, calls } = fakeSpawn('one');
  const result = await openFolder(dir, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, isWsl: false, spawn, waitMs: 50 });
  assert.equal(result.opened, true);
  assert.equal(result.path, path.resolve(dir));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'C:\\Windows\\explorer.exe');
});

test('openFolder: macOS dùng open; mã thoát khác 0 là lỗi', async () => {
  const ok = fakeSpawn('ok');
  assert.equal((await openFolder(dir, { platform: 'darwin', env: {}, isWsl: false, spawn: ok.spawn, waitMs: 50 })).opened, true);
  assert.equal(ok.calls[0].command, 'open');
  const bad = fakeSpawn('one');
  const result = await openFolder(dir, { platform: 'darwin', env: {}, isWsl: false, spawn: bad.spawn, waitMs: 50 });
  assert.equal(result.opened, false);
  assert.match(result.reason, /^launch-failed/);
});

test('openFolder: Linux thử xdg-open rồi gio khi thiếu xdg-open', async () => {
  const { spawn, calls } = fakeSpawn(command => command === 'xdg-open' ? 'enoent' : 'ok');
  const result = await openFolder(dir, { platform: 'linux', env: display, isWsl: false, spawn, waitMs: 50 });
  assert.equal(result.opened, true);
  assert.deepEqual(calls.map(c => c.command), ['xdg-open', 'gio']);
  const none = fakeSpawn('enoent');
  const failed = await openFolder(dir, { platform: 'linux', env: display, isWsl: false, spawn: none.spawn, waitMs: 50 });
  assert.equal(failed.opened, false);
  assert.match(folderMessage(failed, 'linux'), /Không mở được trình quản lý tệp\. Thư mục thực hành: /);
});

test('openFolder: WSL mở bằng explorer.exe với đường dẫn Windows', async () => {
  const { spawn, calls } = fakeSpawn('one');
  const result = await openFolder(dir, { platform: 'linux', env: {}, isWsl: true, toWindowsPath: () => '\\\\wsl$\\Ubuntu\\tmp', spawn, waitMs: 50 });
  assert.equal(result.opened, true);
  assert.equal(calls[0].command, 'explorer.exe');
  assert.deepEqual(calls[0].args, ['\\\\wsl$\\Ubuntu\\tmp']);
});

test('openFolder: không có giao diện, thiếu thư mục hoặc bị tắt thì không chạy lệnh nào', async () => {
  const { spawn, calls } = fakeSpawn('ok');
  const headless = await openFolder(dir, { platform: 'linux', env: {}, isWsl: false, spawn });
  assert.deepEqual([headless.opened, headless.reason], [false, 'headless']);
  assert.match(folderMessage(headless, 'linux'), /Không có giao diện đồ họa/);
  const missing = await openFolder(path.join(dir, 'khong-ton-tai-git-training'), { platform: 'win32', env: {}, isWsl: false, spawn });
  assert.deepEqual([missing.opened, missing.reason], [false, 'not-found']);
  assert.match(folderMessage(missing, 'win32'), /chưa tồn tại/);
  const off = await openFolder(dir, { platform: 'win32', env: { GIT_TRAINING_NO_EXPLORER: '1' }, isWsl: false, spawn });
  assert.equal(off.reason, 'env');
  const file = await openFolder(path.resolve('package.json'), { platform: 'win32', env: {}, isWsl: false, spawn });
  assert.equal(file.reason, 'not-found');
  assert.equal(calls.length, 0);
  assert.equal(folderMessage({ opened: true, path: '/x' }, 'win32'), 'Đã mở thư mục thực hành trong File Explorer: /x');
  assert.equal(folderMessage({ opened: true, path: '/x' }, 'darwin'), 'Đã mở thư mục thực hành trong Finder: /x');
});

test('openFolder không bao giờ throw khi spawn ném lỗi', async () => {
  const spawn = () => { throw new Error('boom'); };
  const result = await openFolder(dir, { platform: 'linux', env: display, isWsl: false, spawn, waitMs: 50 });
  assert.equal(result.opened, false);
});

function cliHarness(home, bin) {
  return (args, env = {}) => spawnSync(process.execPath, [path.resolve('bin', 'git-training.cjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TRAINING_HOME: path.join(home, 'state'), GIT_TRAINING_NO_BROWSER: '1', GIT_TRAINING_NO_EXPLORER: '', CI: '', NODE_ENV: '', PATH: `${bin}${path.delimiter}${process.env.PATH}`, DISPLAY: ':0', ...env },
  });
}

test('CLI: lệnh folder kiểm tra đối số, lỗi khi chưa có phiên và hiện gợi ý ở bài', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-folder-'));
  const bin = path.join(home, 'bin');
  await mkdir(bin);
  const run = cliHarness(home, bin);
  try {
    assert.match(run(['folder', 'extra']).stderr, /không nhận đối số/);
    assert.notEqual(run(['folder']).status, 0);
    const started = run(['start', 'foundations', '--dir', path.join(home, 'w1')]);
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, /git-training folder/);
    assert.match(run(['help']).stdout, /git-training folder/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

// Trình mở giả là script shell tên xdg-open nên chỉ chạy được trên Linux.
test('CLI: folder mở đúng thư mục thực hành bằng xdg-open giả (chỉ Linux)', { skip: process.platform !== 'linux' }, async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-folder-'));
  const bin = path.join(home, 'bin');
  const log = path.join(home, 'opened.log');
  await mkdir(bin);
  await writeFile(path.join(bin, 'xdg-open'), `#!/bin/sh\necho "$@" >> "${log}"\n`);
  await chmod(path.join(bin, 'xdg-open'), 0o755);
  const run = cliHarness(home, bin);
  try {
    assert.equal(run(['start', 'foundations', '--dir', path.join(home, 'w1')]).status, 0);
    const repo = run(['path']).stdout.trim();
    assert.ok(existsSync(repo));
    const opened = run(['folder']);
    assert.equal(opened.status, 0, opened.stderr);
    assert.match(opened.stdout, /Đã mở thư mục thực hành trong trình quản lý tệp: /);
    assert.equal((await readFile(log, 'utf8')).trim(), repo);
    const headless = run(['folder'], { DISPLAY: '', WAYLAND_DISPLAY: '' });
    assert.notEqual(headless.status, 0);
    assert.match(headless.stdout, /Không có giao diện đồ họa/);
    assert.match(headless.stdout, new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
    const off = run(['folder'], { GIT_TRAINING_NO_EXPLORER: '1' });
    assert.notEqual(off.status, 0);
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
  } finally { await rm(home, { recursive: true, force: true }); }
});
