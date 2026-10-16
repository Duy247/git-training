import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { detectWsl, launch, truthy, wslWindowsPath, type OpenCommand, type SpawnLike } from './theory.js';

export interface OpenFolderOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  isWsl?: boolean;
  spawn?: SpawnLike;
  /** Chuyển đường dẫn WSL sang đường dẫn Windows (mặc định gọi wslpath -w). */
  toWindowsPath?: (dir: string) => string | undefined;
  /** Thời gian chờ tối đa để biết lệnh mở có lỗi ngay không. */
  waitMs?: number;
}
export interface OpenFolderResult { opened: boolean; reason?: string; path?: string }

/** Tên trình quản lý tệp gốc của hệ điều hành, dùng cho nhãn trong giao diện. */
export function fileManagerName(platform: NodeJS.Platform = process.platform, isWsl = false): string {
  if (platform === 'win32' || isWsl) return 'File Explorer';
  if (platform === 'darwin') return 'Finder';
  return 'trình quản lý tệp';
}

/** Lý do không thể mở thư mục trong trình quản lý tệp, hoặc undefined nếu có thể thử. */
export function folderSkipReason(options: { env: NodeJS.ProcessEnv; platform: NodeJS.Platform; isWsl: boolean }): string | undefined {
  const { env, platform } = options;
  if (truthy(env.GIT_TRAINING_NO_EXPLORER)) return 'env';
  if (env.NODE_ENV === 'test') return 'test';
  if (platform !== 'win32' && platform !== 'darwin' && !options.isWsl) {
    if (!(env.DISPLAY || env.WAYLAND_DISPLAY)) return env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT ? 'ssh' : 'headless';
  }
  return undefined;
}

/**
 * Chọn lệnh mở thư mục theo hệ điều hành, theo thứ tự thử.
 * Windows: explorer.exe <thư mục> (Explorer trả mã thoát 1 dù đã mở được, nên mã 1 được coi là thành công).
 * macOS: open. Linux: xdg-open, rồi gio open. WSL: explorer.exe với đường dẫn Windows, rồi wslview, rồi xdg-open.
 */
export function folderCommands(dir: string, options: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; isWsl: boolean; toWindowsPath?: (dir: string) => string | undefined }): Array<OpenCommand & { okExit: number[] }> {
  const base: SpawnOptions = { detached: true, stdio: 'ignore', windowsHide: false };
  const { platform, env } = options;
  if (platform === 'win32') {
    const system = env.SystemRoot || env.windir;
    const explorer = system ? `${system.replace(/[\\/]+$/, '')}\\explorer.exe` : 'explorer.exe';
    return [{ command: explorer, args: [path.win32.normalize(dir)], options: base, okExit: [0, 1] }];
  }
  if (platform === 'darwin') return [{ command: 'open', args: [dir], options: base, okExit: [0] }];
  const commands: Array<OpenCommand & { okExit: number[] }> = [];
  if (options.isWsl) {
    const windowsPath = options.toWindowsPath?.(dir);
    if (windowsPath) commands.push({ command: 'explorer.exe', args: [windowsPath], options: base, okExit: [0, 1] });
    commands.push({ command: 'wslview', args: [dir], options: base, okExit: [0] });
  }
  commands.push({ command: 'xdg-open', args: [dir], options: base, okExit: [0] });
  if (!options.isWsl) commands.push({ command: 'gio', args: ['open', dir], options: base, okExit: [0] });
  return commands;
}

/** Mở một thư mục trong trình quản lý tệp gốc của hệ điều hành. Không bao giờ throw. */
export async function openFolder(dir: string, options: OpenFolderOptions = {}): Promise<OpenFolderResult> {
  try {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const absolute = path.resolve(dir);
    let isDir = false;
    try { isDir = existsSync(absolute) && statSync(absolute).isDirectory(); } catch { /* không đọc được */ }
    if (!isDir) return { opened: false, reason: 'not-found', path: absolute };
    const isWsl = options.isWsl ?? detectWsl(env, platform);
    const skip = folderSkipReason({ env, platform, isWsl });
    if (skip) return { opened: false, reason: skip, path: absolute };
    const commands = folderCommands(absolute, { platform, env, isWsl, toWindowsPath: options.toWindowsPath ?? (isWsl ? wslWindowsPath : undefined) });
    let detail = '';
    for (const item of commands) {
      const { okExit, ...command } = item;
      const outcome = await launch(options.spawn ?? nodeSpawn, command, options.waitMs ?? 1200, okExit);
      if (outcome.ok) return { opened: true, path: absolute };
      detail = outcome.detail ?? detail;
    }
    return { opened: false, reason: `launch-failed${detail ? `: ${detail}` : ''}`, path: absolute };
  } catch (error) {
    return { opened: false, reason: `error: ${(error as Error).message}` };
  }
}

/** Dòng thông báo tiếng Việt cho kết quả mở thư mục. */
export function folderMessage(result: OpenFolderResult, platform: NodeJS.Platform = process.platform, isWsl = false): string {
  const name = fileManagerName(platform, isWsl);
  if (result.opened) return `Đã mở thư mục thực hành trong ${name}: ${result.path}`;
  if (result.reason === 'not-found') return `Thư mục thực hành chưa tồn tại: ${result.path}`;
  if (result.reason === 'headless' || result.reason === 'ssh') return `Không có giao diện đồ họa để mở ${name}. Thư mục thực hành: ${result.path}`;
  return `Không mở được ${name}. Thư mục thực hành: ${result.path ?? '(không rõ)'}`;
}
