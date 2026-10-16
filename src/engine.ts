import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { allCourses, getCourse, getExercise, type Finding } from './courses.js';
import { roadmap } from './curriculum.js';
import { git } from './git.js';

export interface Session {
  version: 2;
  id: string;
  courseId: string;
  currentExerciseId: string;
  completed: string[];
  attempts: Record<string, number>;
  hintsSeen: Record<string, number>;
  answers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  dir: string;
}
interface LegacySession { version: 1; id: string; courseId: string; completed: string[]; dir: string }
interface Profile {
  version: 2;
  active?: string;
  sessions: Record<string, string>;
  completed: Record<string, string[]>;
  migrated: Record<string, { courseId: string; completed: string[]; importedAt: string }>;
}
export interface SessionOptions { sessionDir?: string }
export interface CheckOptions extends SessionOptions {
  /** false: ghi nhận kết quả đạt nhưng không tăng số lần Check (dùng cho tự động kiểm tra nền). Mặc định true. */
  countAttempt?: boolean;
}
export interface CreateSessionOptions { workspaceDir?: string }
export interface ExerciseProgress { id: string; title: string; state: 'locked' | 'available' | 'complete'; attempts: number }
export interface TrackProgress { id: string; title: string; completed: number; total: number }
export interface CheckResult { passed: boolean; findings: Finding[]; nextExerciseId?: string; session: Session }
export interface InspectionResult { ready: boolean; findings: Finding[]; session: Session }
export interface MigrationResult { alreadyMigrated: boolean; credited: Record<string, string[]>; legacyCompleted: string[] }

const stateHome = () => path.resolve(process.env.GIT_TRAINING_HOME ?? path.join(homedir(), '.git-training'));
const workspaceHome = () => path.join(homedir(), 'git-training');
const marker = 'session.json';
const profilePath = () => path.join(stateHome(), 'profile.json');
const emptyProfile = (): Profile => ({ version: 2, sessions: {}, completed: {}, migrated: {} });

async function json<T>(file: string): Promise<T> {
  let content: string;
  try { content = await readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw Object.assign(new Error(`Không tìm thấy dữ liệu học tại ${file}. Hãy chạy git-training start <track> để tạo phiên mới.`), { code: 'ENOENT' });
    throw error;
  }
  try { return JSON.parse(content) as T; }
  catch { throw new Error(`Dữ liệu học tại ${file} không phải JSON hợp lệ. Hãy khôi phục bản sao lưu hoặc tạo phiên mới.`); }
}
async function atomicJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(temporary, file);
}
async function loadProfile(): Promise<Profile> {
  try { const profile = await json<Profile>(profilePath()); if (profile.version !== 2) throw new Error('Phiên bản hồ sơ không được hỗ trợ.'); return profile; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyProfile(); throw error; }
}
async function saveProfile(profile: Profile): Promise<void> { await atomicJson(profilePath(), profile); }
async function legacyIndex(): Promise<string | undefined> {
  try { return (await json<{ active: string }>(path.join(stateHome(), 'index.json'))).active; } catch { return undefined; }
}
async function locateSessionDir(options: SessionOptions = {}): Promise<string> {
  if (options.sessionDir) return path.resolve(options.sessionDir);
  let cursor = path.resolve(process.cwd());
  while (true) {
    try { await readFile(path.join(cursor, marker)); return cursor; } catch { /* tìm thư mục cha */ }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const profile = await loadProfile();
  const active = profile.active ?? await legacyIndex();
  if (!active) throw new Error('Chưa có phiên học. Hãy chạy git-training start <track>.');
  try { await readFile(path.join(active, marker)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (profile.active === active) {
      profile.active = undefined;
      await saveProfile(profile);
    }
    throw new Error('Thư mục phiên học đã bị xóa hoặc di chuyển. Hãy chạy git-training start <track> để tạo phiên mới.');
  }
  return active;
}
function exerciseRoot(session: Session, exerciseId: string): string {
  const root = path.resolve(session.dir, 'exercises');
  const target = path.resolve(root, exerciseId);
  if (!target.startsWith(root + path.sep)) throw new Error('Đường dẫn bài học không hợp lệ.');
  return target;
}
function repoDir(session: Session, exerciseId: string): string { return path.join(exerciseRoot(session, exerciseId), 'repo'); }
function renderPaths(session: Session, exerciseId: string, value: string): string {
  const root = exerciseRoot(session, exerciseId);
  return value.replaceAll('{remote}', path.join(root, 'origin.git'))
    .replaceAll('{upstream}', path.join(root, 'upstream.git'))
    .replaceAll('{submodule}', path.join(root, 'module-source'));
}
async function save(session: Session): Promise<void> { session.updatedAt = new Date().toISOString(); await atomicJson(path.join(session.dir, marker), session); }
async function withSessionLock<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const lockPath = path.join(dir, '.session.lock');
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      try { return await action(); }
      finally { await handle.close(); await unlink(lockPath).catch(() => undefined); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try { if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) await unlink(lockPath); } catch { /* khóa vừa được giải phóng */ }
      if (Date.now() >= deadline) throw new Error('Phiên đang được lệnh khác sử dụng quá lâu. Hãy thử lại.');
      await wait(50);
    }
  }
}
function unlocked(session: Session, exerciseId: string): boolean {
  const exercises = getCourse(session.courseId).exercises;
  const index = exercises.findIndex(item => item.id === exerciseId);
  if (index < 0) return false;
  const prerequisites = [...(index > 0 ? [exercises[index - 1]!.id] : []), ...(exercises[index]!.prerequisites ?? [])];
  return prerequisites.every(id => session.completed.includes(id));
}
function mergeCompletion(session: Session, profile: Profile): void {
  for (const id of profile.completed[session.courseId] ?? []) if (!session.completed.includes(id)) session.completed.push(id);
}

/** Nhập một phiên v1 mà không sửa dữ liệu gốc; gọi nhiều lần vẫn cho cùng kết quả. */
export async function migrateLegacySession(sessionDir: string): Promise<MigrationResult> {
  const dir = path.resolve(sessionDir);
  const old = await json<LegacySession>(path.join(dir, marker));
  if (old.version !== 1 || old.dir !== dir || !['fundamentals', 'intermediate'].includes(old.courseId) || !Array.isArray(old.completed)) {
    throw new Error('Đây không phải phiên học cũ hợp lệ; dữ liệu chưa bị thay đổi.');
  }
  const profile = await loadProfile();
  const key = `${old.id}:${dir}`;
  const alreadyMigrated = key in profile.migrated;
  const credited: Record<string, string[]> = { foundations: [], branching: [] };
  const has = (id: string) => old.completed.includes(id);
  if (old.courseId === 'fundamentals') {
    if (has('staging') && has('commit')) credited.foundations!.push('stage-and-commit');
    if (has('branch')) credited.branching!.push('create-and-switch');
  }
  if (old.courseId === 'intermediate') {
    if (has('rebase')) credited.branching!.push('rebase');
    if (has('conflict')) credited.branching!.push('resolving-conflicts');
  }
  if (!alreadyMigrated) {
    for (const [track, ids] of Object.entries(credited)) {
      const current = new Set(profile.completed[track] ?? []);
      ids.forEach(id => current.add(id));
      profile.completed[track] = [...current];
    }
    profile.migrated[key] = { courseId: old.courseId, completed: [...old.completed], importedAt: new Date().toISOString() };
    await saveProfile(profile);
  }
  return { alreadyMigrated, credited, legacyCompleted: [...old.completed] };
}

/** Tạo hoặc tiếp tục phiên chính của một track. */
export async function createSession(courseId: string, options: CreateSessionOptions = {}): Promise<Session> {
  const course = getCourse(courseId);
  const oldActive = await legacyIndex();
  if (oldActive) {
    try { await migrateLegacySession(oldActive); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const profile = await loadProfile();
  const previous = profile.sessions[courseId];
  if (previous) {
    try {
      const session = await getSession({ sessionDir: previous });
      profile.active = session.dir;
      await saveProfile(profile);
      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      delete profile.sessions[courseId];
      if (profile.active === previous) profile.active = undefined;
      await saveProfile(profile);
    }
  }
  const first = course.exercises[0];
  if (!first) throw new Error(`Track ${courseId} không có bài học.`);
  const version = await git(process.cwd(), '--version');
  const majorMinor = /git version (\d+)\.(\d+)/.exec(version);
  if (!majorMinor || Number(majorMinor[1]) < 2 || (Number(majorMinor[1]) === 2 && Number(majorMinor[2]) < 28)) throw new Error('Cần Git 2.28 trở lên để chạy bài học.');
  const id = randomUUID();
  const dir = path.resolve(options.workspaceDir ?? workspaceHome(), id);
  await mkdir(path.dirname(dir), { recursive: true });
  await mkdir(dir, { recursive: false });
  const now = new Date().toISOString();
  const session: Session = { version: 2, id, courseId, currentExerciseId: first.id, completed: [...(profile.completed[courseId] ?? [])], attempts: {}, hintsSeen: {}, answers: {}, createdAt: now, updatedAt: now, dir };
  await mkdir(exerciseRoot(session, first.id), { recursive: true });
  await first.setup(repoDir(session, first.id));
  await save(session);
  profile.sessions[courseId] = dir;
  profile.active = dir;
  await saveProfile(profile);
  return session;
}

/** Đọc phiên hiện tại từ thư mục, con trỏ hồ sơ hoặc đường dẫn truyền vào. */
export async function getSession(options: SessionOptions = {}): Promise<Session> {
  const dir = await locateSessionDir(options);
  const raw = await json<Session | LegacySession>(path.join(dir, marker));
  if (raw.version === 1) {
    await migrateLegacySession(dir);
    return createSession(raw.courseId === 'fundamentals' ? 'foundations' : 'branching');
  }
  if (raw.version !== 2 || raw.dir !== dir) throw new Error('Phiên học không hợp lệ hoặc đã bị chuyển vị trí.');
  getCourse(raw.courseId);
  mergeCompletion(raw, await loadProfile());
  return raw;
}

/** Mở checkpoint mới; kết quả đã đạt không bị xóa. */
export async function openExercise(exerciseId: string, options: SessionOptions = {}): Promise<{ session: Session; repo: string }> {
  const current = await getSession(options);
  return withSessionLock(current.dir, async () => {
    const session = await getSession({ sessionDir: current.dir });
    const exercise = getExercise(getCourse(session.courseId), exerciseId);
    if (!unlocked(session, exerciseId)) throw new Error(`Bài ${exerciseId} chưa mở khóa. Hãy hoàn thành bài trước.`);
    const root = exerciseRoot(session, exerciseId);
    try { if ((await lstat(root)).isSymbolicLink()) throw new Error('Checkpoint là liên kết tượng trưng không an toàn.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    await exercise.setup(repoDir(session, exerciseId));
    session.currentExerciseId = exerciseId;
    session.hintsSeen[exerciseId] = 0;
    delete session.answers[exerciseId];
    await save(session);
    return { session, repo: repoDir(session, exerciseId) };
  });
}

export async function getProgress(options: SessionOptions = {}): Promise<ExerciseProgress[]> {
  const session = await getSession(options);
  return getCourse(session.courseId).exercises.map(exercise => ({
    id: exercise.id, title: exercise.title,
    state: session.completed.includes(exercise.id) ? 'complete' : unlocked(session, exercise.id) ? 'available' : 'locked',
    attempts: session.attempts[exercise.id] ?? 0,
  }));
}
export async function getRoadmapProgress(): Promise<TrackProgress[]> {
  const profile = await loadProfile();
  return roadmap.map(track => ({ id: track.id, title: track.title, completed: track.lessons.filter(item => profile.completed[track.id]?.includes(item.slug)).length, total: track.lessons.length }));
}

/** Kiểm tra cả Git state lẫn câu trả lời nếu bài yêu cầu. */
export async function checkExercise(options: CheckOptions = {}): Promise<CheckResult> {
  const session = await getSession(options);
  return withSessionLock(session.dir, async () => checkExerciseUnlocked(await getSession({ sessionDir: session.dir }), options.countAttempt !== false));
}
async function checkExerciseUnlocked(session: Session, countAttempt = true): Promise<CheckResult> {
  const { findings, ready: passed } = await inspectExerciseForSession(session);
  const course = getCourse(session.courseId);
  const exercise = getExercise(course, session.currentExerciseId);
  if (countAttempt) session.attempts[exercise.id] = (session.attempts[exercise.id] ?? 0) + 1;
  if (passed && !session.completed.includes(exercise.id)) session.completed.push(exercise.id);
  await save(session);
  if (passed) {
    const profile = await loadProfile();
    const complete = new Set(profile.completed[session.courseId] ?? []);
    complete.add(exercise.id);
    profile.completed[session.courseId] = [...complete];
    await saveProfile(profile);
  }
  const nextExerciseId = course.exercises[course.exercises.findIndex(item => item.id === exercise.id) + 1]?.id;
  return { passed, findings, nextExerciseId: passed ? nextExerciseId : undefined, session };
}

/** Chấm thử trạng thái hiện tại mà không ghi lần thử hoặc đánh dấu hoàn thành. */
export async function inspectExercise(options: SessionOptions = {}): Promise<InspectionResult> {
  return inspectExerciseForSession(await getSession(options));
}
async function inspectExerciseForSession(session: Session): Promise<InspectionResult> {
  const course = getCourse(session.courseId);
  const exercise = getExercise(course, session.currentExerciseId);
  const repo = repoDir(session, exercise.id);
  let actualRepo: string;
  try { actualRepo = await realpath(repo); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Repository của bài ${exercise.id} đã mất. Chạy git-training open ${exercise.id} để tạo lại checkpoint.`);
    throw error;
  }
  const actualRoot = await realpath(exerciseRoot(session, exercise.id));
  const actualSession = await realpath(session.dir);
  if (!actualRoot.startsWith(actualSession + path.sep) || !actualRepo.startsWith(actualRoot + path.sep)) throw new Error('Repository nằm ngoài sandbox bài học.');
  let gitRoot: string | undefined;
  let gitDir: string | undefined;
  try {
    gitRoot = await realpath(await git(repo, 'rev-parse', '--show-toplevel'));
    gitDir = await realpath(await git(repo, 'rev-parse', '--absolute-git-dir'));
  } catch (error) {
    if (exercise.needsGit !== false || (error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
  }
  if (gitRoot && gitDir && (gitRoot !== actualRepo || !gitDir.startsWith(actualRoot + path.sep)) && (exercise.needsGit !== false || gitRoot === actualRepo)) throw new Error('Metadata Git nằm ngoài sandbox bài học.');
  const findings = await exercise.validate(repo);
  if (exercise.evaluateAnswer) {
    const answer = session.answers[exercise.id];
    findings.push(...(answer === undefined ? [{ pass: false, message: 'Chưa có câu trả lời. Hãy chạy git-training answer <đáp-án>.' }] : await exercise.evaluateAnswer(repo, answer)));
  }
  return { ready: findings.length > 0 && findings.every(finding => finding.pass), findings, session };
}

/** Lưu đáp án để bảng điều khiển chấm thử; không tạo lần thử. */
export async function saveAnswer(answer: string, options: SessionOptions = {}): Promise<void> {
  if (!answer.trim()) throw new Error('Câu trả lời không được để trống.');
  const current = await getSession(options);
  await withSessionLock(current.dir, async () => {
    const session = await getSession({ sessionDir: current.dir });
    const exercise = getExercise(getCourse(session.courseId), session.currentExerciseId);
    if (!exercise.evaluateAnswer) throw new Error('Bài này không yêu cầu câu trả lời.');
    session.answers[exercise.id] = answer;
    await save(session);
  });
}

/** Lưu đáp án rồi chấm toàn bộ bài, kể cả phần thực hành nếu có. */
export async function submitAnswer(answer: string, options: SessionOptions = {}): Promise<CheckResult> {
  const session = await getSession(options);
  if (!answer.trim()) throw new Error('Câu trả lời không được để trống.');
  return withSessionLock(session.dir, async () => {
    const latest = await getSession({ sessionDir: session.dir });
    const exercise = getExercise(getCourse(latest.courseId), latest.currentExerciseId);
    if (!exercise.evaluateAnswer) throw new Error('Bài này không yêu cầu câu trả lời. Hãy chạy git-training check.');
    latest.answers[exercise.id] = answer;
    return checkExerciseUnlocked(latest);
  });
}

export async function nextExercise(options: SessionOptions = {}): Promise<{ session: Session; repo: string } | undefined> {
  const session = await getSession(options);
  if (!session.completed.includes(session.currentExerciseId)) throw new Error('Hãy đạt bài hiện tại trước khi tiếp tục.');
  const exercises = getCourse(session.courseId).exercises;
  const next = exercises[exercises.findIndex(item => item.id === session.currentExerciseId) + 1];
  return next ? openExercise(next.id, { sessionDir: session.dir }) : undefined;
}

export async function getExerciseInfo(options: SessionOptions = {}): Promise<{ session: Session; repo: string; id: string; title: string; concept: string; instructions: string; task: string; expected: string; question?: string; mode: string; simulated: boolean; sourceUrl?: string }> {
  const session = await getSession(options);
  const exercise = getExercise(getCourse(session.courseId), session.currentExerciseId);
  return { session, repo: repoDir(session, exercise.id), id: exercise.id, title: exercise.title, concept: exercise.concept ?? '', instructions: renderPaths(session, exercise.id, exercise.instructions), task: renderPaths(session, exercise.id, exercise.task ?? exercise.instructions), expected: exercise.expected ?? '', question: exercise.question, mode: exercise.mode ?? 'state', simulated: exercise.simulated ?? false, sourceUrl: exercise.sourceUrl };
}
export async function getHint(options: SessionOptions = {}): Promise<{ text: string; level: number; total: number; exhausted: boolean }> {
  const current = await getSession(options);
  return withSessionLock(current.dir, async () => {
    const session = await getSession({ sessionDir: current.dir });
    const exercise = getExercise(getCourse(session.courseId), session.currentExerciseId);
    const exhausted = (session.hintsSeen[exercise.id] ?? 0) >= exercise.hints.length;
    const level = Math.min((session.hintsSeen[exercise.id] ?? 0) + 1, exercise.hints.length);
    if (!exhausted) {
      session.hintsSeen[exercise.id] = level;
      await save(session);
    }
    return { text: exhausted ? 'Đã xem hết gợi ý. Dùng git-training solution nếu cần lời giải.' : renderPaths(session, exercise.id, exercise.hints[level - 1] ?? 'Bài này chưa có gợi ý.'), level, total: exercise.hints.length, exhausted };
  });
}
export async function getSolution(options: SessionOptions = {}): Promise<string> {
  const session = await getSession(options);
  const exercise = getExercise(getCourse(session.courseId), session.currentExerciseId);
  return renderPaths(session, exercise.id, exercise.solution);
}
export function listCourses(): { id: string; title: string; exercises: number }[] {
  return allCourses().map(course => ({ id: course.id, title: course.title, exercises: course.exercises.length }));
}
