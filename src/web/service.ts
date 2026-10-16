import { getCourse } from '../courses.js';
import { roadmap } from '../curriculum.js';
import { detectWsl } from '../theory.js';
import { theoryPagePath } from '../theory.js';
import { openFolder, fileManagerName } from '../explorer.js';
import { buildSteps, currentStep, summarizeFindings, wrongAnswerNote, type StepFlags, type StepId } from '../guided.js';
import { checkExercise, createSession, getCompletedByTrack, getExerciseInfo, getHint, getProgress, getSeenHints, getSession, getSolution, inspectExercise, listCourses, nextExercise, openExercise, submitAnswer, type InspectionResult, type Session } from '../engine.js';
import { cdCommand, terminalHelp } from './shell.js';

export class NoSessionError extends Error {}
export class UserError extends Error {}

export const stepTitles: Record<StepId, string> = {
  theory: 'Đọc bài lý thuyết',
  work: 'Làm bài trong thư mục bài tập',
  answer: 'Trả lời câu hỏi',
  check: 'Kiểm tra',
};
const lookTitle = 'Xem thử trong thư mục bài tập';

export interface LessonState {
  course: { id: string; title: string };
  position: number; total: number; doneCount: number;
  exercise: { id: string; title: string; simulated: boolean; task: string; expected: string; question?: string; mode: string; hasTheory: boolean; theoryUrl?: string };
  repo: string; cd: string; fileManager: string; terminalHelp: string; platform: NodeJS.Platform;
  steps: Array<{ id: StepId; number: number; label: string; state: 'done' | 'current' | 'todo' }>;
  currentStep?: StepId;
  complete: boolean; hasNext: boolean; nextTitle?: string; lastInTrack: boolean;
  pollable: boolean; gitPass: boolean; answerPass: boolean; answerSaved: boolean; savedAnswer?: string;
  missing: string[]; problem?: string;
  attempts: number; wrongTries: number; hintsSeen: string[]; hintsTotal: number;
}

export interface TrackView { id: string; title: string; done: number; total: number; lessons: Array<{ id: string; title: string; done: boolean; current: boolean }>; active: boolean; nextId?: string }
export interface ProgressView { tracks: TrackView[]; doneAll: number; totalAll: number; activeCourse?: string }

const stateKey = (session: Session, id = session.currentExerciseId) => `${session.courseId}/${id}`;

/** Logic của bảng học web; tách khỏi HTTP để kiểm thử trực tiếp. Dùng lại engine, không đổi định dạng session.json. */
export class Dashboard {
  sessionDir: string | undefined;
  private readonly flags = new Map<string, StepFlags>();
  private readonly wrong = new Map<string, number>();

  async init(): Promise<void> {
    try { this.sessionDir = (await getSession()).dir; } catch { this.sessionDir = undefined; }
  }

  private requireDir(): string {
    if (!this.sessionDir) throw new NoSessionError('Chưa có phiên học.');
    return this.sessionDir;
  }

  hasSession(): boolean { return Boolean(this.sessionDir); }

  /** Bắt đầu hoặc tiếp tục một chủ đề; nếu có mã bài thì mở bài đó (không khóa bài). */
  async openLesson(courseId?: string, exerciseId?: string): Promise<void> {
    const id = courseId ?? listCourses()[0]!.id;
    getCourse(id);
    const session = await createSession(id);
    this.sessionDir = session.dir;
    const course = getCourse(id);
    // Không chỉ định bài: nếu bài hiện tại đã đạt thì chuyển tới bài chưa đạt đầu tiên của chủ đề.
    const target = exerciseId ?? (session.completed.includes(session.currentExerciseId) ? course.exercises.find(item => !session.completed.includes(item.id))?.id : undefined);
    if (target && target !== session.currentExerciseId) {
      if (!course.exercises.some(item => item.id === target)) throw new UserError('Không có bài này.');
      await openExercise(target, { sessionDir: session.dir, ignoreLock: true });
      this.reset(id, target);
    }
  }

  private reset(courseId: string, exerciseId: string): void {
    this.flags.delete(`${courseId}/${exerciseId}`);
    this.wrong.delete(`${courseId}/${exerciseId}`);
  }

  async progress(): Promise<ProgressView> {
    const completed = await getCompletedByTrack();
    let active: { courseId: string; exerciseId: string } | undefined;
    if (this.sessionDir) { try { const session = await getSession({ sessionDir: this.sessionDir }); active = { courseId: session.courseId, exerciseId: session.currentExerciseId }; } catch { /* phiên cũ bị mất */ } }
    const tracks = roadmap.map(track => {
      const done = new Set(completed[track.id] ?? []);
      const lessons = track.lessons.map(item => ({ id: item.slug, title: item.title, done: done.has(item.slug), current: active?.courseId === track.id && active.exerciseId === item.slug }));
      return { id: track.id, title: track.title, done: lessons.filter(item => item.done).length, total: lessons.length, lessons, active: active?.courseId === track.id, nextId: lessons.find(item => !item.done)?.id };
    });
    return { tracks, doneAll: tracks.reduce((n, item) => n + item.done, 0), totalAll: tracks.reduce((n, item) => n + item.total, 0), activeCourse: active?.courseId };
  }

  private flagsFor(session: Session, attempts: number): StepFlags {
    const key = stateKey(session);
    let flags = this.flags.get(key);
    if (!flags) {
      const started = attempts > 0 || session.answers[session.currentExerciseId] !== undefined;
      flags = { theory: started, work: started };
      this.flags.set(key, flags);
    }
    return flags;
  }

  async setFlag(step: string): Promise<void> {
    if (step !== 'theory' && step !== 'work') throw new UserError('Bước không hợp lệ.');
    const dir = this.requireDir();
    const info = await getExerciseInfo({ sessionDir: dir });
    const progress = await getProgress({ sessionDir: dir });
    const flags = this.flagsFor(info.session, progress.find(item => item.id === info.id)?.attempts ?? 0);
    flags[step] = true;
  }

  /** Trạng thái đầy đủ của bài hiện tại. `inspected` cho phép dùng kết quả chấm đã có (sau khi submit/check). */
  async lessonState(inspected?: InspectionResult): Promise<LessonState> {
    const dir = this.requireDir();
    let info: Awaited<ReturnType<typeof getExerciseInfo>>;
    try { info = await getExerciseInfo({ sessionDir: dir }); }
    catch (error) { if (/Chưa có phiên|đã bị xóa|Không tìm thấy dữ liệu/.test((error as Error).message)) { this.sessionDir = undefined; throw new NoSessionError((error as Error).message); } throw error; }
    const progress = await getProgress({ sessionDir: dir });
    const index = progress.findIndex(item => item.id === info.id);
    const current = progress[index];
    const complete = current?.state === 'complete';
    const session = info.session;
    const hasQuestion = Boolean(info.question);
    const mode = info.mode as 'state' | 'answer' | 'hybrid';
    let inspection = inspected;
    let problem: string | undefined;
    if (!inspection) {
      try { inspection = await inspectExercise({ sessionDir: dir }); }
      catch (error) {
        const message = (error as Error).message;
        problem = /đã mất|ngoài sandbox/.test(message) ? 'Thư mục bài tập bị mất hoặc bị đổi. Dùng "Làm lại bài này từ đầu" để tạo lại.' : message;
      }
    }
    const answerSaved = session.answers[info.id] !== undefined;
    const summary = summarizeFindings(inspection?.findings, hasQuestion, mode, answerSaved);
    const hasTheory = Boolean(theoryPagePath(session.courseId, info.id));
    const flags = this.flagsFor(session, current?.attempts ?? 0);
    // Với bài thực hành, bước làm bài chỉ xong khi Git đúng (trang tự nhận), không do người học bấm.
    const stepFlags: StepFlags = { theory: flags.theory, work: mode === 'answer' ? flags.work : false };
    const steps = buildSteps({ hasTheory, mode, hasQuestion, flags: stepFlags, complete, gitPass: summary.gitPass, answerPass: summary.answerPass })
      .map(step => ({ ...step, label: step.id === 'work' && mode === 'answer' ? lookTitle : stepTitles[step.id] }));
    const key = stateKey(session);
    const seen = await getSeenHints({ sessionDir: dir });
    const next = progress[index + 1];
    return {
      course: { id: session.courseId, title: getCourse(session.courseId).title },
      position: index + 1, total: progress.length, doneCount: progress.filter(item => item.state === 'complete').length,
      exercise: {
        id: info.id, title: info.title, simulated: info.simulated, task: info.task,
        expected: mode === 'answer' ? '' : info.expected.replace(/\s*Đồng thời trả lời câu hỏi kiến thức\.?$/u, ''),
        question: info.question, mode, hasTheory, theoryUrl: hasTheory ? `/theory/${session.courseId}/${info.id}.html` : undefined,
      },
      repo: info.repo, cd: cdCommand(info.repo), fileManager: fileManagerName(process.platform, detectWsl()), terminalHelp: terminalHelp(), platform: process.platform,
      steps, currentStep: currentStep(steps), complete, hasNext: Boolean(next), nextTitle: next?.title, lastInTrack: index === progress.length - 1,
      pollable: mode !== 'answer' && !complete, gitPass: summary.gitPass, answerPass: summary.answerPass, answerSaved,
      savedAnswer: summary.answerPass ? session.answers[info.id] : undefined,
      missing: complete ? [] : summary.missing, problem,
      attempts: current?.attempts ?? 0, wrongTries: this.wrong.get(key) ?? 0, hintsSeen: seen.seen, hintsTotal: seen.total,
    };
  }

  /** Tự kiểm tra nền: chỉ ghi nhận khi đạt, và không tăng số lần thử. */
  async poll(): Promise<{ state: LessonState; justPassed: boolean }> {
    const dir = this.requireDir();
    const before = await this.lessonState();
    if (before.complete || before.problem || !before.pollable) return { state: before, justPassed: false };
    const inspection = await inspectExercise({ sessionDir: dir });
    if (inspection.ready) {
      const outcome = await checkExercise({ sessionDir: dir, countAttempt: false });
      return { state: await this.lessonState({ ready: outcome.passed, findings: outcome.findings, session: outcome.session }), justPassed: outcome.passed };
    }
    return { state: await this.lessonState(inspection), justPassed: false };
  }

  /** Người học bấm "Kiểm tra lại": tính một lần thử. */
  async check(): Promise<{ state: LessonState; passed: boolean; message: string }> {
    const dir = this.requireDir();
    const info = await getExerciseInfo({ sessionDir: dir });
    if (info.question && info.session.answers[info.id] === undefined) {
      return { state: await this.lessonState(), passed: false, message: 'Bạn chưa trả lời câu hỏi. Hãy gõ câu trả lời ở bước "Trả lời câu hỏi" rồi gửi.' };
    }
    const before = (await getProgress({ sessionDir: dir })).find(item => item.id === info.id)?.state;
    const outcome = await checkExercise({ sessionDir: dir });
    const state = await this.lessonState({ ready: outcome.passed, findings: outcome.findings, session: outcome.session });
    const message = outcome.passed ? (before === 'complete' ? 'Bài này đã đạt từ trước.' : 'Đạt rồi!') : state.missing[0] ? 'Chưa đạt. Hãy xem mục "Còn thiếu" rồi làm tiếp nhé.' : 'Chưa đạt. Hãy xem lại nhiệm vụ rồi thử lại nhé.';
    return { state, passed: outcome.passed, message };
  }

  async answer(text: string): Promise<{ state: LessonState; answerCorrect: boolean; passed: boolean; message: string }> {
    const dir = this.requireDir();
    const value = text.trim();
    if (!value) throw new UserError('Hãy gõ câu trả lời rồi bấm Gửi.');
    if (value.length > 500) throw new UserError('Câu trả lời quá dài; hãy gõ ngắn gọn thôi.');
    const info = await getExerciseInfo({ sessionDir: dir });
    const key = stateKey(info.session);
    const outcome = await submitAnswer(value, { sessionDir: dir });
    // Đúng/sai của đáp án lấy từ chính kết quả vừa chấm (phần tử cuối), không từ kết quả cũ.
    const answerCorrect = Boolean(outcome.findings.at(-1)?.pass);
    let message: string;
    if (answerCorrect) {
      this.wrong.delete(key);
      message = outcome.passed ? 'Đúng rồi!' : 'Đáp án đúng. Giờ hãy làm phần thực hành trong thư mục bài tập; trang sẽ tự nhận khi bạn xong.';
    } else {
      const tries = (this.wrong.get(key) ?? 0) + 1;
      this.wrong.set(key, tries);
      message = wrongAnswerNote(tries, value);
    }
    const state = await this.lessonState({ ready: outcome.passed, findings: outcome.findings, session: outcome.session });
    return { state, answerCorrect, passed: outcome.passed, message };
  }

  async hint(): Promise<{ text: string; level: number; total: number; exhausted: boolean }> {
    return getHint({ sessionDir: this.requireDir() });
  }
  async solution(): Promise<string> { return getSolution({ sessionDir: this.requireDir() }); }

  async openFolder(): Promise<{ opened: boolean; message: string }> {
    const info = await getExerciseInfo({ sessionDir: this.requireDir() });
    const result = await openFolder(info.repo);
    const name = fileManagerName(process.platform, detectWsl());
    return { opened: result.opened, message: result.opened ? `Đã mở thư mục trong ${name}.` : `Không tự mở được ${name}. Hãy dán lệnh cd ở trên vào terminal.` };
  }

  async next(): Promise<{ finished: boolean }> {
    const dir = this.requireDir();
    const next = await nextExercise({ sessionDir: dir });
    if (!next) return { finished: true };
    this.reset(next.session.courseId, next.session.currentExerciseId);
    return { finished: false };
  }

  async restart(): Promise<void> {
    const dir = this.requireDir();
    const info = await getExerciseInfo({ sessionDir: dir });
    await openExercise(info.id, { sessionDir: dir, ignoreLock: true });
    this.reset(info.session.courseId, info.id);
    this.flags.set(stateKey(info.session), { theory: true, work: false });
  }

  async summary(): Promise<{ courseTitle: string; done: number; total: number; doneAll: number; totalAll: number; finished: boolean }> {
    const dir = this.requireDir();
    const info = await getExerciseInfo({ sessionDir: dir });
    const progress = await getProgress({ sessionDir: dir });
    const all = await this.progress();
    const done = progress.filter(item => item.state === 'complete').length;
    return { courseTitle: getCourse(info.session.courseId).title, done, total: progress.length, doneAll: all.doneAll, totalAll: all.totalAll, finished: done === progress.length };
  }
}
