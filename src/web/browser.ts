import { spawn as nodeSpawn } from 'node:child_process';
import { detectWsl, launch, skipReason, type OpenCommand, type SpawnLike } from '../theory.js';

export interface OpenUrlOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  isWsl?: boolean;
  spawn?: SpawnLike;
  waitMs?: number;
}
export interface OpenUrlResult { opened: boolean; reason?: string }

/** Lệnh mở một địa chỉ http theo hệ điều hành, theo thứ tự thử. Không qua shell nên ký tự đặc biệt trong URL vô hại. */
export function urlCommands(url: string, options: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; isWsl: boolean }): OpenCommand[] {
  const base = { detached: true, stdio: 'ignore' as const, windowsHide: true };
  const { platform, env } = options;
  if (platform === 'win32') {
    const system = env.SystemRoot || env.windir;
    const rundll = system ? `${system.replace(/[\\/]+$/, '')}\\System32\\rundll32.exe` : 'rundll32.exe';
    return [{ command: rundll, args: ['url.dll,FileProtocolHandler', url], options: base }];
  }
  if (platform === 'darwin') return [{ command: 'open', args: [url], options: base }];
  const commands: OpenCommand[] = [];
  if (options.isWsl) {
    commands.push({ command: 'wslview', args: [url], options: base });
    commands.push({ command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url], options: base });
  }
  commands.push({ command: 'xdg-open', args: [url], options: base });
  return commands;
}

/** Mở trang bảng học trong trình duyệt mặc định. Không bao giờ throw. */
export async function openUrl(url: string, options: OpenUrlOptions = {}): Promise<OpenUrlResult> {
  try {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const isWsl = options.isWsl ?? detectWsl(env, platform);
    const skip = skipReason({ env, platform, isWsl });
    if (skip) return { opened: false, reason: skip };
    let detail = '';
    for (const command of urlCommands(url, { platform, env, isWsl })) {
      const outcome = await launch(options.spawn ?? nodeSpawn, command, options.waitMs ?? 1500);
      if (outcome.ok) return { opened: true };
      detail = outcome.detail ?? detail;
    }
    return { opened: false, reason: `launch-failed${detail ? `: ${detail}` : ''}` };
  } catch (error) {
    return { opened: false, reason: `error: ${(error as Error).message}` };
  }
}
