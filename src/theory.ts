import { spawn as nodeSpawn, execFileSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Thư mục gốc của gói: dist/theory.js nằm trong <gốc>/dist nên gốc là thư mục cha. */
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Đường dẫn tuyệt đối tới trang lý thuyết của một bài; undefined nếu không có tệp. */
export function theoryPagePath(courseId: string, exerciseId: string, root: string = packageRoot): string | undefined {
  if (!safeId.test(courseId) || !safeId.test(exerciseId) || courseId.includes('..') || exerciseId.includes('..')) return undefined;
  const file = path.join(root, 'theory', courseId, `${exerciseId}.html`);
  return existsSync(file) ? file : undefined;
}

export interface OpenCommand { command: string; args: string[]; options: SpawnOptions }
export type SpawnLike = (command: string, args: string[], options: SpawnOptions) => ChildProcess;
export interface OpenTheoryOptions {
  /** Cờ --no-browser. */
  noBrowser?: boolean;
  /** Mở lại dù trang này đã được mở trong tiến trình hiện tại (dùng cho lệnh open do người học yêu cầu). */
  reopen?: boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  isWsl?: boolean;
  spawn?: SpawnLike;
  /** Chuyển đường dẫn WSL sang đường dẫn Windows (mặc định gọi wslpath -w). */
  toWindowsPath?: (file: string) => string | undefined;
  root?: string;
  /** Tập các trang đã mở trong tiến trình (mặc định dùng tập chung của module). */
  opened?: Set<string>;
  /** Thời gian chờ tối đa để biết lệnh mở có lỗi ngay không. */
  waitMs?: number;
}
export interface OpenTheoryResult { opened: boolean; reason?: string; path?: string }

const processOpened = new Set<string>();
export const truthy = (value: string | undefined): boolean => value !== undefined && !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());

export function detectWsl(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== 'linux') return false;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;
  try { return /microsoft|wsl/i.test(readFileSync('/proc/version', 'utf8')); } catch { return false; }
}

/** Trả về lý do bỏ qua việc tự mở trình duyệt, hoặc undefined nếu nên mở. */
export function skipReason(options: { noBrowser?: boolean; env: NodeJS.ProcessEnv; platform: NodeJS.Platform; isWsl: boolean }): string | undefined {
  const { env, platform } = options;
  if (options.noBrowser) return 'flag';
  if (truthy(env.GIT_TRAINING_NO_BROWSER)) return 'env';
  if (truthy(env.CI)) return 'ci';
  if (env.NODE_ENV === 'test') return 'test';
  if (platform !== 'win32' && platform !== 'darwin' && !options.isWsl) {
    const display = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
    if (!display) return env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT ? 'ssh' : 'headless';
  }
  return undefined;
}

/**
 * Chọn lệnh mở trình duyệt theo hệ điều hành, theo thứ tự thử.
 * Windows: rundll32 url.dll,FileProtocolHandler với file:// URL. Không qua cmd.exe nên ký tự &, khoảng trắng
 * hay chữ Việt trong đường dẫn không bị shell diễn giải (URL đã được mã hóa %xx, không chứa khoảng trắng hay dấu nháy).
 */
export function openCommands(file: string, options: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; isWsl: boolean; toWindowsPath?: (file: string) => string | undefined }): OpenCommand[] {
  const base: SpawnOptions = { detached: true, stdio: 'ignore', windowsHide: true };
  const { platform, env } = options;
  if (platform === 'win32') {
    const system = env.SystemRoot || env.windir;
    const rundll = system ? `${system.replace(/[\\/]+$/, '')}\\System32\\rundll32.exe` : 'rundll32.exe';
    return [{ command: rundll, args: ['url.dll,FileProtocolHandler', pathToFileURL(file, { windows: true }).href], options: base }];
  }
  if (platform === 'darwin') return [{ command: 'open', args: [file], options: base }];
  const commands: OpenCommand[] = [];
  if (options.isWsl) {
    commands.push({ command: 'wslview', args: [file], options: base });
    const windowsPath = options.toWindowsPath?.(file);
    if (windowsPath) commands.push({ command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', pathToFileURL(windowsPath, { windows: true }).href], options: base });
  }
  commands.push({ command: 'xdg-open', args: [file], options: base });
  return commands;
}

export function wslWindowsPath(file: string): string | undefined {
  try { return execFileSync('wslpath', ['-w', file], { encoding: 'utf8', timeout: 2000 }).trim() || undefined; } catch { return undefined; }
}

/** Chạy một lệnh mở; true nếu không lỗi ngay. Không bao giờ throw và không chờ trình duyệt đóng. */
export function launch(spawn: SpawnLike, item: OpenCommand, waitMs: number, okExitCodes: number[] = [0]): Promise<{ ok: boolean; missing: boolean; detail?: string }> {
  return new Promise(resolve => {
    let child: ChildProcess;
    let timer: NodeJS.Timeout | undefined;
    let done = false;
    const finish = (ok: boolean, missing: boolean, detail?: string) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ ok, missing, detail });
    };
    try { child = spawn(item.command, item.args, item.options); }
    catch (error) { finish(false, true, (error as Error).message); return; }
    child.once('error', error => finish(false, (error as NodeJS.ErrnoException).code === 'ENOENT', error.message));
    child.once('exit', code => finish(code === null || okExitCodes.includes(code), false, `mã thoát ${code}`));
    // Một số trình mở (xdg-open) chỉ trả về khi trình duyệt đóng; sau thời gian chờ coi như đã mở.
    timer = setTimeout(() => { child.unref?.(); finish(true, false); }, waitMs);
  });
}

/** Mở trang lý thuyết trong trình duyệt mặc định. Không bao giờ throw. */
export async function openTheory(courseId: string, exerciseId: string, options: OpenTheoryOptions = {}): Promise<OpenTheoryResult> {
  try {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const file = theoryPagePath(courseId, exerciseId, options.root);
    if (!file) return { opened: false, reason: 'no-page' };
    const isWsl = options.isWsl ?? detectWsl(env, platform);
    const skip = skipReason({ noBrowser: options.noBrowser, env, platform, isWsl });
    if (skip) return { opened: false, reason: skip, path: file };
    const seen = options.opened ?? processOpened;
    const key = `${courseId}/${exerciseId}`;
    if (!options.reopen && seen.has(key)) return { opened: false, reason: 'already-opened', path: file };
    const commands = openCommands(file, { platform, env, isWsl, toWindowsPath: options.toWindowsPath ?? (isWsl ? wslWindowsPath : undefined) });
    let detail = '';
    for (const item of commands) {
      const outcome = await launch(options.spawn ?? nodeSpawn, item, options.waitMs ?? 1200);
      if (outcome.ok) { seen.add(key); return { opened: true, path: file }; }
      detail = outcome.detail ?? detail;
    }
    return { opened: false, reason: `launch-failed${detail ? `: ${detail}` : ''}`, path: file };
  } catch (error) {
    return { opened: false, reason: `error: ${(error as Error).message}` };
  }
}

/** Dòng thông báo tiếng Việt; undefined nếu bài không có trang lý thuyết. */
export function theoryMessage(result: OpenTheoryResult): string | undefined {
  if (!result.path) return undefined;
  return result.opened ? `Đã mở bài lý thuyết trong trình duyệt: ${result.path}` : `Bài lý thuyết: ${result.path}`;
}
