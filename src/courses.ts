import { commit, git, init, write } from './git.js';
import { getLab } from './labs.js';
import { roadmap } from './curriculum.js';

export interface Finding { pass: boolean; message: string }
export type ExerciseMode = 'state' | 'answer' | 'hybrid';
export interface Exercise {
  id: string;
  title: string;
  instructions: string;
  hints: readonly string[];
  solution: string;
  prerequisites?: readonly string[];
  concept?: string;
  expected?: string;
  question?: string;
  sourceUrl?: string;
  mode?: ExerciseMode;
  needsGit?: boolean;
  simulated?: boolean;
  setup(repo: string): Promise<void>;
  validate(repo: string): Promise<Finding[]>;
  evaluateAnswer?(repo: string, answer: string): Promise<Finding[]>;
}
export interface Course { id: string; title: string; exercises: readonly Exercise[] }

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

async function scenario(repo: string, track: string, lesson: string): Promise<void> {
  await init(repo);
  await write(repo, 'README.md', 'Bài tập Git offline\n');
  await commit(repo, 'Khởi tạo');
  if (track !== 'inspection' && track !== 'forensics') return;
  await git(repo, 'config', 'user.name', 'Lan');
  await write(repo, 'app.txt', 'dong dau\n');
  await commit(repo, 'Tạo ứng dụng');
  await git(repo, 'config', 'user.name', 'Minh');
  await write(repo, 'app.txt', 'dong dau\nTOKEN_DEMO\n');
  await commit(repo, 'Thêm chuỗi mẫu');
  await write(repo, 'app.txt', 'dong dau\nTOKEN_DEMO\nloi\n');
  await commit(repo, 'Thêm lỗi');
  if (lesson === 'file-history-renames') {
    await git(repo, 'mv', 'app.txt', 'app-renamed.txt');
    await commit(repo, 'Đổi tên tệp ứng dụng');
  }
  if (lesson === 'finding-leaked-secrets') {
    await write(repo, 'app.txt', 'dong dau\nloi\n');
    await commit(repo, 'Xóa chuỗi mẫu');
  }
  await git(repo, 'config', 'user.name', 'Git Training');
}

const simulated = new Set([
  'remote/pull-request-workflow', 'remote/fork-upstream', 'remote/ssh-keys', 'remote/personal-access-tokens',
  'remote/github-cli', 'remote/branch-protection', 'release-ops/tag-signing', 'release-ops/commit-signing',
  'daily-workflows/husky-lint-staged', 'daily-workflows/pre-commit-hooks', 'forensics/filter-repo-surgery',
]);

export const courses: readonly Course[] = roadmap.map(track => ({
  id: track.id,
  title: track.title,
  exercises: track.lessons.map(spec => {
    const lab = spec.lab ? getLab(spec.lab) : undefined;
    const answer = spec.answer;
    return {
      id: spec.slug,
      title: spec.title,
      concept: spec.concept,
      expected: lab ? `${lab.expected} Đồng thời trả lời câu hỏi kiến thức.` : 'Nêu đáp án ngắn và chính xác cho câu hỏi.',
      question: spec.question,
      sourceUrl: spec.sourceUrl,
      mode: lab ? 'hybrid' as const : 'answer' as const,
      needsGit: lab?.needsGit ?? true,
      simulated: simulated.has(`${track.id}/${spec.slug}`),
      instructions: lab ? `${lab.task} Sau đó trả lời: ${spec.question}` : `Khảo sát repository bài tập nếu cần, rồi trả lời: ${spec.question}`,
      hints: [spec.concept, lab?.hint ?? `Đáp án bắt đầu bằng “${answer.trim().charAt(0)}”.`],
      solution: lab ? `${lab.solution}\nĐáp án câu hỏi: ${answer.trim()}.` : `Đáp án: ${answer.trim()}. ${spec.concept}`,
      setup: lab ? lab.setup : async (repo: string) => scenario(repo, track.id, spec.slug),
      validate: lab ? lab.validate : async () => [],
      evaluateAnswer: async (_repo: string, submitted: string) => [{
        pass: answer.split('~').some(candidate => normalize(candidate) === normalize(submitted)),
        message: 'Hãy trả lời chính xác câu hỏi của bài học; dùng git-training hint nếu cần.',
      }],
    } satisfies Exercise;
  }),
}));

const registry = new Map<string, Course>(courses.map(course => [course.id, course]));

/** Đăng ký khóa học tin cậy trong tiến trình Node.js hiện tại. */
export function registerCourse(course: Course): void {
  const validId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);
  if (!validId(course.id) || !course.exercises.length || registry.has(course.id)) throw new Error('ID khóa học không hợp lệ hoặc đã tồn tại.');
  const ids = new Set<string>();
  for (const exercise of course.exercises) {
    if (!validId(exercise.id) || ids.has(exercise.id) || typeof exercise.setup !== 'function' || typeof exercise.validate !== 'function' || !exercise.hints.length) {
      throw new Error(`Bài học không hợp lệ hoặc trùng ID: ${exercise.id}`);
    }
    if (exercise.prerequisites?.some(id => !ids.has(id))) throw new Error(`Điều kiện tiên quyết phải đứng trước ${exercise.id}.`);
    ids.add(exercise.id);
  }
  registry.set(course.id, course);
}

export function allCourses(): readonly Course[] { return [...registry.values()]; }
export function getCourse(id: string): Course {
  const course = registry.get(id);
  if (!course) throw new Error(`Không có khóa học ${id}. Chọn một trong: ${allCourses().map(item => item.id).join(', ')}.`);
  return course;
}
export function getExercise(course: Course, id: string): Exercise {
  const exercise = course.exercises.find(item => item.id === id);
  if (!exercise) throw new Error(`Không có bài học ${id}.`);
  return exercise;
}
