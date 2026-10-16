import { fixtures } from './fixtures.js';
import { getLab } from './labs.js';
import { roadmap } from './curriculum.js';

export interface Finding { pass: boolean; message: string }
export type ExerciseMode = 'state' | 'answer' | 'hybrid';
export interface Exercise {
  id: string;
  title: string;
  instructions: string;
  /** Nhiệm vụ không kèm câu hỏi; giao diện hướng dẫn chỉ hiện câu hỏi khi người học tới bước trả lời. */
  task?: string;
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
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .trim().replace(/(^|\s)(--?[A-Za-z][A-Za-z0-9-]*)/g, (_match, space: string, flag: string) =>
      `${space}${flag.replace(/[A-Z]/g, letter => `~${letter.toLowerCase()}`)}`)
    .toLocaleLowerCase().replace(/\s+/g, ' ');
}

function answerMatches(expected: string, submitted: string): boolean {
  const candidate = normalize(expected);
  const actual = normalize(submitted);
  if (actual === candidate) return true;
  if (candidate === 'feat:' && /^feat(?:\([^)]+\))?!?:?(?:\s.*)?$/.test(actual)) return true;
  if (/^(git|gh) /.test(candidate) && actual.startsWith(candidate + ' ')) return true;
  if (/[:!]$/.test(candidate) && candidate !== 'feat:' && actual.startsWith(candidate)) return true;
  if (candidate.startsWith('-') && actual.split(/\s+/).some(token => token === candidate || token.startsWith(candidate + '='))) return true;
  return false;
}

const answerVariants: Record<string, readonly string[]> = {
  'foundations/gitignore': ['gitignore'],
  'foundations/stage-and-commit': ['git add bai.txt', 'git add .', 'git add -A', 'git add --all'],
  'foundations/three-trees': ['staging area', 'staging', 'vùng staging', 'khu vực staging', 'vùng chờ', 'vùng chuẩn bị'],
  'foundations/object-model': ['blob object', 'đối tượng blob'],
  'foundations/head-and-refs': ['git symbolic-ref HEAD', 'git rev-parse --abbrev-ref HEAD', 'git branch --show-current'],
  'foundations/commit-message-anatomy': ['feat'],
  'branching/create-and-switch': ['git checkout -b', 'git switch --create'],
  'branching/renaming-branches': ['-m', 'git branch -m', 'git branch --move'],
  'branching/upstream-tracking': ['-u', 'git push -u', 'git push --set-upstream'],
  'undo/stash-as-undo': ['git stash'],
  'undo/clean-restore': ['git clean -fd', 'git clean -df', 'git clean -fdx', 'git clean -fx', 'git clean --force'],
  'undo/resetting-single-file': ['git checkout HEAD --', 'git checkout --'],
  'undo/detached-head': ['git checkout -b', 'git switch --create', 'git branch'],
  'remote/remotes-push-pull': ['git push -u origin main', 'git push --set-upstream origin main'],
  'remote/multiple-remotes': ['git remote --verbose'],
  'remote/prune-stale-branches': ['git remote prune origin', 'git fetch --prune origin', 'git fetch --prune'],
  'remote/pushing-tags': ['git push --tags', 'git push origin --tags', 'git push origin refs/tags/v1.0.0', 'git push origin tag v1.0.0'],
  'remote/ssh-keys': ['public', 'khóa công khai', '.pub', 'public key (.pub)'],
  'remote/personal-access-tokens': ['secrets', 'secret manager', 'github secrets', 'ci secret', 'ci secrets', 'repository secrets', 'github actions secrets', 'secret store', 'bí mật', 'biến bí mật', 'kho bí mật'],
  'remote/branch-protection': ['required status check', 'status checks', 'status check', 'required checks', 'kiểm tra trạng thái bắt buộc', 'kiểm tra bắt buộc'],
  'release-ops/tagging': ['git tag --annotate', 'git tag -am'],
  'release-ops/semver': ['v1.3.0'],
  'release-ops/tag-signing': ['--sign'],
  'release-ops/commit-signing': ['--show-signature'],
  'release-ops/release-branches': ['release/2.0', 'release'],
  'release-ops/hotfix-branches': ['hotfix/1.0.1', 'hotfix'],
  'release-ops/changelog-generation': ['changelog'],
  'advanced/interactive-rebase': ['--interactive', 'git rebase -i', 'git rebase --interactive'],
  'advanced/splitting-commit': ['mixed'],
  'advanced/hooks-automation': ['pre-commit hook', 'pre commit', 'precommit'],
  'advanced/partial-clones': ['--filter=blob:none', 'filter=blob:none'],
  'daily-workflows/perfect-commit': ['git add --patch'],
  'daily-workflows/aliases': ['git config alias.st', 'git config --local alias.st'],
  'daily-workflows/conventional-commits': ['feat:', 'feat'],
  'daily-workflows/pre-commit-hooks': ['pre-commit hook', 'pre commit', 'precommit'],
  'daily-workflows/husky-lint-staged': ['lint staged', 'lintstaged'],
  'daily-workflows/long-running-features': ['feature flags', 'feature toggle', 'feature toggles', 'feature switch', 'flag', 'cờ tính năng', 'cờ bật tắt'],
  'internals/git-directory': ['.git/index'],
  'internals/object-database': ['.git/objects'],
  'internals/blobs-trees-commits': ['tree object', 'đối tượng tree'],
  'internals/index-format': ['git ls-files -s', 'git ls-files --stage'],
  'internals/packfiles': ['pack', '*.pack'],
  'internals/gc-internals': ['git maintenance run'],
  'internals/reachability': ['branch', 'nhánh', 'refs', 'reference', 'branch ref', 'tên nhánh'],
  'internals/loose-vs-packed': ['pack', '.pack', 'pack file', 'tệp pack'],
  'internals/plumbing-vs-porcelain': ['lệnh plumbing', 'plumbing command', 'plumbing commands'],
  'internals/three-way-merge': ['common ancestor', 'tổ tiên chung', 'tổ tiên chung gần nhất', 'merge-base', 'base'],
  'teamwork/pr-lifecycle': ['code review', 'review code', 'reviewing', 'pr review', 'duyệt', 'phê duyệt', 'approval', 'approve'],
  'teamwork/co-authoring': ['Co-authored-by'],
  'teamwork/pair-workflows': ['Co-authored-by'],
  'teamwork/repo-onboarding': ['README'],
  'teamwork/documentation-conventions': ['CONTRIBUTING'],
  'forensics/filter-repo-surgery': ['revoke token', 'revoke', 'thu hồi', 'rotate token', 'rotate', 'xoay vòng token', 'vô hiệu hóa token', 'thu hồi khóa', 'đổi token', 'thu hồi và tạo token mới'],
};

const simulated = new Set([
  'remote/pull-request-workflow', 'remote/fork-upstream', 'remote/ssh-keys', 'remote/personal-access-tokens',
  'remote/github-cli', 'remote/branch-protection', 'release-ops/tag-signing', 'release-ops/commit-signing',
  'daily-workflows/husky-lint-staged', 'daily-workflows/pre-commit-hooks', 'forensics/filter-repo-surgery',
  'teamwork/pr-lifecycle',
]);

export const courses: readonly Course[] = roadmap.map(track => ({
  id: track.id,
  title: track.title,
  exercises: track.lessons.map(spec => {
    const lab = spec.lab ? getLab(spec.lab) : undefined;
    const answer = spec.answer;
    const fixture = lab ? undefined : fixtures[`${track.id}/${spec.slug}`];
    if (!lab && !fixture) throw new Error(`Bài chỉ trả lời ${track.id}/${spec.slug} thiếu fixture mô tả trạng thái repo.`);
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
      task: lab ? lab.task : `${fixture!.note} Hãy chạy lệnh Git để khảo sát repo.`,
      instructions: lab ? `${lab.task} Sau đó trả lời: ${spec.question}` : `${fixture!.note} Hãy chạy lệnh Git để khảo sát repo, rồi trả lời: ${spec.question}`,
      hints: lab
        ? ['Quan sát trạng thái ban đầu bằng git status và so với kết quả cần đạt.', lab.hint]
        : [spec.concept, fixture!.hint],
      solution: lab ? `${lab.solution.replaceAll('; ', '\n').replaceAll(' && ', '\n')}\nĐáp án câu hỏi: ${answer.trim()}.` : `Đáp án: ${answer.trim()}. ${spec.concept}`,
      setup: lab ? lab.setup : fixture!.setup,
      validate: lab ? lab.validate : async () => [],
      evaluateAnswer: async (_repo: string, submitted: string) => {
        const pass = [...answer.split('~'), ...(answerVariants[`${track.id}/${spec.slug}`] ?? [])].some(candidate => answerMatches(candidate, submitted));
        return [{
          pass,
          message: pass ? 'Đáp án đúng.' : 'Đáp án chưa phù hợp. Hãy xem lại câu hỏi; cú pháp lệnh đầy đủ và dạng viết tắt tương đương đều được chấp nhận.',
        }];
      },
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
