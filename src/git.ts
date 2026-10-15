import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 10_000;

export class GitError extends Error {
  constructor(message: string, public readonly stderr: string, public readonly code?: string) {
    super(message);
  }
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    const { stdout } = await execFileAsync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', ...args], {
      cwd, timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
      env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
    });
    return stdout.trimEnd();
  } catch (error) {
    const e = error as Error & { stderr?: string; code?: string };
    if (e.code === 'ENOENT') throw new GitError('Không tìm thấy Git trên PATH. Hãy cài Git và mở lại terminal.', e.stderr ?? '', e.code);
    throw new GitError(`Không thể chạy lệnh git ${args[0] ?? ''} trong bài tập. Hãy kiểm tra trạng thái repository rồi thử lại.`, e.stderr ?? '', e.code);
  }
}

export async function write(repo: string, relative: string, content: string): Promise<void> {
  const target = path.resolve(repo, relative);
  if (!target.startsWith(path.resolve(repo) + path.sep)) throw new Error('Tệp nằm ngoài repository bài tập.');
  await mkdir(path.dirname(target), { recursive: true });
  const actualParent = await realpath(path.dirname(target));
  const actualRepo = await realpath(repo);
  if (actualParent !== actualRepo && !actualParent.startsWith(actualRepo + path.sep)) throw new Error('Tệp nằm ngoài repository bài tập.');
  await writeFile(target, content, 'utf8');
}

export async function read(repo: string, relative: string): Promise<string | undefined> {
  try {
    const actualRepo = await realpath(repo);
    const actualTarget = await realpath(path.join(repo, relative));
    if (!actualTarget.startsWith(actualRepo + path.sep)) return undefined;
    return await readFile(actualTarget, 'utf8');
  }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}

export async function init(repo: string): Promise<void> {
  await mkdir(repo, { recursive: true });
  await git(repo, 'init', '-b', 'main');
  await git(repo, 'config', 'user.name', 'Git Training');
  await git(repo, 'config', 'user.email', 'git-training@example.invalid');
  await git(repo, 'config', 'commit.gpgsign', 'false');
  await git(repo, 'config', 'core.autocrlf', 'false');
}

export async function commit(repo: string, message: string): Promise<void> {
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '-m', message);
}

export async function existsRef(repo: string, ref: string): Promise<boolean> {
  try { await git(repo, 'rev-parse', '--verify', ref); return true; }
  catch { return false; }
}

export async function isAncestor(repo: string, ancestor: string, descendant: string): Promise<boolean> {
  try { await git(repo, 'merge-base', '--is-ancestor', ancestor, descendant); return true; }
  catch { return false; }
}

export async function status(repo: string): Promise<string> {
  return git(repo, 'status', '--porcelain=v1', '--untracked-files=all');
}
