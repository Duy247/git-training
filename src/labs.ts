import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { commit, git, init, isAncestor, read, status, write } from './git.js';
import type { Finding } from './courses.js';

export interface Lab {
  task: string;
  expected: string;
  hint: string;
  solution: string;
  setup(repo: string): Promise<void>;
  validate(repo: string): Promise<Finding[]>;
  solve(repo: string): Promise<void>;
  needsGit?: boolean;
}

const result = (pass: boolean, message: string): Finding[] => [{ pass, message }];
const base = async (repo: string) => { await init(repo); await write(repo, 'README.md', 'Bài tập Git\n'); await commit(repo, 'Khởi tạo'); };
const tipFile = async (repo: string, file: string) => { try { return await git(repo, 'show', `HEAD:${file}`); } catch { return undefined; } };
const commits = async (repo: string) => Number(await git(repo, 'rev-list', '--count', 'HEAD'));
const clean = async (repo: string) => (await status(repo)) === '';
const parents = async (repo: string) => (await git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD')).split(' ').length - 1;
const remotePath = (repo: string) => path.join(path.dirname(repo), 'origin.git');
const bare = async (repo: string) => git(repo, 'init', '--bare', '-b', 'main', remotePath(repo));

export const labs: Record<string, Lab> = {
  init: {
    task: 'Khởi tạo thư mục bài tập thành repository với nhánh main.', expected: 'Thư mục có .git và nhánh mặc định main.',
    hint: 'Dùng git init -b main ngay trong thư mục bài tập.', solution: 'git init -b main', needsGit: false,
    setup: async repo => { await mkdir(repo, { recursive: true }); },
    validate: async repo => {
      try {
        const top = await realpath(await git(repo, 'rev-parse', '--show-toplevel'));
        const actual = await realpath(repo);
        return result((process.platform === 'win32' ? top.toLowerCase() === actual.toLowerCase() : top === actual) && await git(repo, 'symbolic-ref', '--short', 'HEAD') === 'main', 'Hãy khởi tạo Git ngay tại thư mục bài tập với nhánh main.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error;
        return result(false, 'Thư mục bài tập chưa là repository Git.');
      }
    },
    solve: async repo => { await git(repo, 'init', '-b', 'main'); },
  },
  stage: {
    task: 'Đưa bai.txt vào vùng staging nhưng chưa commit.', expected: 'bai.txt nằm trong index và chưa ở HEAD.',
    hint: 'Thử git add bai.txt rồi xem git status.', solution: 'git add bai.txt',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Nội dung bài tập\n'); },
    validate: async repo => result((await status(repo)).split('\n').includes('A  bai.txt'), 'Hãy stage bai.txt và chưa commit.'),
    solve: async repo => { await git(repo, 'add', 'bai.txt'); },
  },
  commit: {
    task: 'Stage và commit bai.txt, giữ working tree sạch.', expected: 'HEAD có bai.txt và có commit mới.',
    hint: 'Dùng git add rồi git commit -m với thông điệp rõ nghĩa.', solution: 'git add bai.txt && git commit -m "Thêm bài tập"',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Nội dung bài tập\n'); },
    validate: async repo => result((await tipFile(repo, 'bai.txt')) === 'Nội dung bài tập' && await commits(repo) === 2 && await clean(repo), 'Hãy commit bai.txt và giữ working tree sạch.'),
    solve: async repo => { await git(repo, 'add', 'bai.txt'); await git(repo, 'commit', '-m', 'Thêm bài tập'); },
  },
  ignore: {
    task: 'Tạo .gitignore để Git bỏ qua local.env nhưng vẫn theo dõi README.md.', expected: 'git check-ignore nhận local.env.',
    hint: 'Thêm chính xác local.env vào .gitignore.', solution: 'Ghi local.env vào .gitignore.',
    setup: async repo => { await base(repo); await write(repo, 'local.env', 'DEMO=1\n'); },
    validate: async repo => { let ignored = false; try { ignored = (await git(repo, 'check-ignore', 'local.env')) === 'local.env'; } catch { /* chưa bỏ qua */ } return result(ignored && (await read(repo, '.gitignore')) !== undefined && await tipFile(repo, 'README.md') !== undefined, 'Hãy tạo .gitignore bỏ qua local.env và giữ README.md được theo dõi.'); },
    solve: async repo => { await write(repo, '.gitignore', 'local.env\n'); },
  },
  config: {
    task: 'Đặt user.name riêng cho repository thành Hoc Vien Git.', expected: 'Cấu hình local có user.name mới.',
    hint: 'Đặt tên bằng git config --local user.name "Hoc Vien Git"', solution: 'git config --local user.name "Hoc Vien Git"',
    setup: base,
    validate: async repo => { let name = ''; try { name = await git(repo, 'config', '--local', 'user.name'); } catch { /* chưa có giá trị */ } return result(name === 'Hoc Vien Git', 'Hãy đặt user.name local thành Hoc Vien Git.'); },
    solve: async repo => { await git(repo, 'config', '--local', 'user.name', 'Hoc Vien Git'); },
  },
  branch: {
    task: 'Tạo và chuyển sang nhánh feature/bai-hoc.', expected: 'HEAD trỏ tới feature/bai-hoc.',
    hint: 'git switch -c tạo nhánh và chuyển sang ngay.', solution: 'git switch -c feature/bai-hoc',
    setup: base,
    validate: async repo => result((await git(repo, 'branch', '--show-current')) === 'feature/bai-hoc', 'Hãy chuyển sang nhánh feature/bai-hoc.'),
    solve: async repo => { await git(repo, 'switch', '-c', 'feature/bai-hoc'); },
  },
  rename: {
    task: 'Đổi tên nhánh feature/sai thành feature/dung mà vẫn giữ commit.', expected: 'Chỉ còn feature/dung tại commit cũ.',
    hint: 'Đứng trên nhánh rồi dùng git branch -m.', solution: 'git branch -m feature/dung',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'feature/sai'); await write(repo, 'doi-ten.txt', 'Giữ nội dung\n'); await commit(repo, 'Nhánh cần đổi'); },
    validate: async repo => { const names = await git(repo, 'branch', '--format=%(refname:short)'); return result((await git(repo, 'branch', '--show-current')) === 'feature/dung' && !names.split('\n').includes('feature/sai') && (await tipFile(repo, 'doi-ten.txt')) === 'Giữ nội dung', 'Hãy đổi tên nhánh mà không mất commit.'); },
    solve: async repo => { await git(repo, 'branch', '-m', 'feature/dung'); },
  },
  merge: {
    task: 'Hợp nhất nhánh feature vào main, giữ cả hai thay đổi.', expected: 'HEAD là merge commit có hai cha.',
    hint: 'Đang ở main; thử git merge feature.', solution: 'git merge feature',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'feature'); await write(repo, 'feature.txt', 'Tính năng\n'); await commit(repo, 'Thêm tính năng'); await git(repo, 'switch', 'main'); await write(repo, 'main.txt', 'Nhánh chính\n'); await commit(repo, 'Cập nhật nhánh chính'); },
    validate: async repo => result((await git(repo, 'branch', '--show-current')) === 'main' && await parents(repo) === 2 && await isAncestor(repo, 'feature', 'main') && await clean(repo), 'Hãy tạo merge commit trên main và giữ thay đổi của feature.'),
    solve: async repo => { await git(repo, 'merge', 'feature'); },
  },
  rebase: {
    task: 'Đưa commit của topic lên trên main bằng rebase.', expected: 'main là tổ tiên của topic và topic có một commit mới.',
    hint: 'Đang ở topic; chạy git rebase main.', solution: 'git rebase main',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'topic'); await write(repo, 'topic.txt', 'Nội dung topic\n'); await commit(repo, 'Topic'); await git(repo, 'switch', 'main'); await write(repo, 'main.txt', 'Nội dung main\n'); await commit(repo, 'Main mới'); await git(repo, 'switch', 'topic'); },
    validate: async repo => result((await git(repo, 'branch', '--show-current')) === 'topic' && await isAncestor(repo, 'main', 'topic') && Number(await git(repo, 'rev-list', '--count', 'main..topic')) === 1 && await clean(repo), 'Hãy rebase topic lên main, giữ một commit topic.'),
    solve: async repo => { await git(repo, 'rebase', 'main'); },
  },
  squash: {
    task: 'Gộp hai commit trên feature thành một commit mới trên main.', expected: 'main chỉ tiến thêm một commit và chứa hai tệp của feature.',
    hint: 'Dùng git merge --squash feature rồi commit.', solution: 'git merge --squash feature; git commit -m "Gộp tính năng"',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'feature'); await write(repo, 'a.txt', 'A\n'); await commit(repo, 'A'); await write(repo, 'b.txt', 'B\n'); await commit(repo, 'B'); await git(repo, 'switch', 'main'); },
    validate: async repo => result(await commits(repo) === 2 && await tipFile(repo, 'a.txt') === 'A' && await tipFile(repo, 'b.txt') === 'B' && !(await isAncestor(repo, 'feature', 'main')) && await clean(repo), 'Hãy đưa hai thay đổi vào một commit trên main.'),
    solve: async repo => { await git(repo, 'merge', '--squash', 'feature'); await git(repo, 'commit', '-m', 'Gộp tính năng'); },
  },
  conflict: {
    task: 'Giải quyết xung đột trong loi-chao.txt, giữ cả hai dòng rồi hoàn tất merge.', expected: 'Merge commit có hai cha, tệp không còn dấu xung đột.',
    hint: 'Sửa tệp, git add rồi git commit.', solution: 'Ghi hai dòng Main và Topic vào loi-chao.txt, rồi git add và git commit.',
    setup: async repo => { await base(repo); await write(repo, 'loi-chao.txt', 'Goc\n'); await commit(repo, 'Tạo lời chào'); await git(repo, 'switch', '-c', 'topic'); await write(repo, 'loi-chao.txt', 'Topic\n'); await commit(repo, 'Topic sửa'); await git(repo, 'switch', 'main'); await write(repo, 'loi-chao.txt', 'Main\n'); await commit(repo, 'Main sửa'); try { await git(repo, 'merge', 'topic'); } catch { /* xung đột dự kiến */ } },
    validate: async repo => { const lines = (await read(repo, 'loi-chao.txt') ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean); return result(lines.length === 2 && lines.includes('Main') && lines.includes('Topic') && await parents(repo) === 2 && await clean(repo), 'Hãy giữ cả hai dòng Main và Topic, bỏ dấu xung đột rồi hoàn tất merge commit.'); },
    solve: async repo => { await write(repo, 'loi-chao.txt', 'Main\nTopic\n'); await git(repo, 'add', 'loi-chao.txt'); await git(repo, 'commit', '-m', 'Giải quyết xung đột'); },
  },
  tag: {
    task: 'Tạo annotated tag v1.0.0 trỏ tới HEAD.', expected: 'Tag v1.0.0 tồn tại với loại object tag.',
    hint: 'Dùng git tag -a và cung cấp thông điệp.', solution: 'git tag -a v1.0.0 -m "Phiên bản 1.0.0"',
    setup: base,
    validate: async repo => { let kind = ''; try { kind = await git(repo, 'cat-file', '-t', 'refs/tags/v1.0.0'); } catch { /* chưa có */ } return result(kind === 'tag' && (await git(repo, 'rev-parse', 'v1.0.0^{}')) === await git(repo, 'rev-parse', 'HEAD'), 'Hãy tạo annotated tag v1.0.0 tại HEAD.'); },
    solve: async repo => { await git(repo, 'tag', '-a', 'v1.0.0', '-m', 'Phiên bản 1.0.0'); },
  },
  remote: {
    task: 'Repository bare origin.git đã có sẵn cạnh repo (đường dẫn {remote}). Hãy thêm nó làm remote origin rồi push main.', expected: 'refs/heads/main ở origin bằng main local.',
    hint: 'Đường dẫn origin là {remote}; dùng git remote add và git push.', solution: 'git remote add origin "{remote}"; git push -u origin main',
    setup: async repo => { await base(repo); await bare(repo); },
    validate: async repo => { let pushed = ''; try { pushed = await git(repo, '--git-dir', remotePath(repo), 'rev-parse', 'refs/heads/main'); } catch { /* chưa push */ } return result(pushed !== '' && pushed === await git(repo, 'rev-parse', 'main'), 'Hãy push main lên origin local.'); },
    solve: async repo => { await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', '-u', 'origin', 'main'); },
  },
  fetch: {
    task: 'Fetch commit mới từ origin mà không merge vào main.', expected: 'origin/main cập nhật, main vẫn ở commit cũ.',
    hint: 'git fetch origin chỉ cập nhật remote-tracking ref.', solution: 'git fetch origin',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', '-u', 'origin', 'main'); const pub = path.join(path.dirname(repo), 'publisher'); await git(repo, 'clone', remotePath(repo), pub); await git(pub, 'config', 'user.name', 'Git Training'); await git(pub, 'config', 'user.email', 'git-training@example.invalid'); await git(pub, 'config', 'commit.gpgsign', 'false'); await write(pub, 'moi.txt', 'Mới\n'); await commit(pub, 'Commit từ xa'); await git(pub, 'push', 'origin', 'main'); },
    validate: async repo => { const remoteHead = await git(repo, '--git-dir', remotePath(repo), 'rev-parse', 'refs/heads/main'); return result((await git(repo, 'rev-parse', 'refs/remotes/origin/main')) === remoteHead && (await tipFile(repo, 'moi.txt')) === undefined, 'Hãy fetch origin và chưa merge vào main.'); },
    solve: async repo => { await git(repo, 'fetch', 'origin'); },
  },
  reset: {
    task: 'Bỏ commit cuối bằng reset --soft để giữ thay đổi trong staging.', expected: 'Lịch sử giảm một commit, bai.txt còn staged.',
    hint: 'git reset --soft HEAD~1 không xóa index.', solution: 'git reset --soft HEAD~1',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Thay đổi\n'); await commit(repo, 'Commit cần bỏ'); },
    validate: async repo => result(await commits(repo) === 1 && (await status(repo)).split('\n').includes('A  bai.txt'), 'Hãy reset --soft commit cuối và giữ bai.txt staged.'),
    solve: async repo => { await git(repo, 'reset', '--soft', 'HEAD~1'); },
  },
  restore: {
    task: 'Khôi phục README.md và xóa tep-rac.txt chưa được theo dõi.', expected: 'Working tree sạch.',
    hint: 'Kết hợp git restore với git clean -f.', solution: 'git restore README.md; git clean -f',
    setup: async repo => { await base(repo); await write(repo, 'README.md', 'Sai\n'); await write(repo, 'tep-rac.txt', 'Rác\n'); },
    validate: async repo => result(await clean(repo), 'Hãy khôi phục README.md và xóa tệp rác.'),
    solve: async repo => { await git(repo, 'restore', 'README.md'); await git(repo, 'clean', '-f'); },
  },
  stash: {
    task: 'Cất thay đổi README.md vào stash để working tree sạch.', expected: 'Working tree sạch và có một stash.',
    hint: 'git stash push -m giúp đặt tên cho bản cất.', solution: 'git stash push -m "Tạm cất"',
    setup: async repo => { await base(repo); await write(repo, 'README.md', 'Đang sửa\n'); },
    validate: async repo => result(await clean(repo) && (await git(repo, 'stash', 'list')).includes('stash@{0}'), 'Hãy cất thay đổi bằng stash.'),
    solve: async repo => { await git(repo, 'stash', 'push', '-m', 'Tạm cất'); },
  },
  cherry: {
    task: 'Chép commit ở nhánh source sang main bằng cherry-pick.', expected: 'main có thay đổi của source nhưng không merge toàn nhánh.',
    hint: 'Đang ở main; chạy git cherry-pick source.', solution: 'git cherry-pick source',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'source'); await write(repo, 'source.txt', 'Nguồn\n'); await commit(repo, 'Thay đổi nguồn'); await git(repo, 'switch', 'main'); await write(repo, 'main.txt', 'Chính\n'); await commit(repo, 'Thay đổi chính'); },
    validate: async repo => result(await tipFile(repo, 'source.txt') === 'Nguồn' && await commits(repo) === 3 && !(await isAncestor(repo, 'source', 'main')) && await clean(repo), 'Hãy tạo commit sao chép thay đổi nguồn trên main.'),
    solve: async repo => { await git(repo, 'cherry-pick', 'source'); },
  },
  revert: {
    task: 'Đảo ngược commit xấu bằng một commit mới, không xóa lịch sử.', expected: 'Cấu hình trở lại safe và lịch sử có commit đảo.',
    hint: 'git revert HEAD tạo commit mới.', solution: 'git revert --no-edit HEAD',
    setup: async repo => { await base(repo); await write(repo, 'config.txt', 'safe\n'); await commit(repo, 'Cấu hình an toàn'); await write(repo, 'config.txt', 'broken\n'); await commit(repo, 'Cấu hình lỗi'); },
    validate: async repo => result(await tipFile(repo, 'config.txt') === 'safe' && await commits(repo) === 4 && await clean(repo), 'Hãy revert commit cuối để trả lại safe.'),
    solve: async repo => { await git(repo, 'revert', '--no-edit', 'HEAD'); },
  },
  fileop: {
    task: 'Đổi tên old.txt thành new.txt và commit thay đổi.', expected: 'HEAD có new.txt, không còn old.txt.',
    hint: 'git mv thực hiện đổi tên và stage.', solution: 'git mv old.txt new.txt; git commit -m "Đổi tên tệp"',
    setup: async repo => { await base(repo); await write(repo, 'old.txt', 'Giữ nội dung\n'); await commit(repo, 'Tệp cũ'); },
    validate: async repo => result(await tipFile(repo, 'new.txt') === 'Giữ nội dung' && await tipFile(repo, 'old.txt') === undefined && await clean(repo), 'Hãy đổi tên và commit tệp mới.'),
    solve: async repo => { await git(repo, 'mv', 'old.txt', 'new.txt'); await git(repo, 'commit', '-m', 'Đổi tên tệp'); },
  },
  message: {
    task: 'Commit bai.txt với subject Conventional Commits loại feat (có thể có scope hoặc !), dưới 73 ký tự.', expected: 'Commit mới có subject hợp lệ và working tree sạch.',
    hint: 'Ví dụ: git commit -m "feat: thêm bài tập".', solution: 'git add bai.txt; git commit -m "feat: thêm bài tập"',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Bài tập\n'); },
    validate: async repo => { const subject = await git(repo, 'log', '-1', '--format=%s'); return result(await commits(repo) === 2 && /^feat(?:\([^)]+\))?!?: .+$/.test(subject) && subject.length < 73 && await tipFile(repo, 'bai.txt') === 'Bài tập' && await clean(repo), 'Hãy commit bai.txt với subject feat hợp lệ, dưới 73 ký tự.'); },
    solve: async repo => { await git(repo, 'add', 'bai.txt'); await git(repo, 'commit', '-m', 'feat: thêm bài tập'); },
  },
  ref: {
    task: 'Tạo ref tùy chỉnh refs/lesson/checkpoint trỏ tới HEAD.', expected: 'Ref mới có cùng object ID với HEAD.',
    hint: 'git update-ref nhận tên ref đầy đủ.', solution: 'git update-ref refs/lesson/checkpoint HEAD',
    setup: base,
    validate: async repo => { let value = ''; try { value = await git(repo, 'rev-parse', '--verify', 'refs/lesson/checkpoint'); } catch { /* chưa có */ } return result(value !== '' && value === await git(repo, 'rev-parse', 'HEAD'), 'Hãy tạo refs/lesson/checkpoint tại HEAD.'); },
    solve: async repo => { await git(repo, 'update-ref', 'refs/lesson/checkpoint', 'HEAD'); },
  },
  notes: {
    task: 'Gắn ghi chú "Đã xem xét" vào commit HEAD bằng git notes.', expected: 'git notes show HEAD hiển thị ghi chú.',
    hint: 'git notes add -m dùng để tạo ghi chú.', solution: 'git notes add -m "Đã xem xét" HEAD',
    setup: base,
    validate: async repo => { let note = ''; try { note = await git(repo, 'notes', 'show', 'HEAD'); } catch { /* chưa có */ } return result(note === 'Đã xem xét', 'Hãy gắn ghi chú Đã xem xét vào HEAD.'); },
    solve: async repo => { await git(repo, 'notes', 'add', '-m', 'Đã xem xét', 'HEAD'); },
  },
  coauthor: {
    task: 'Commit bai.txt với trailer Co-authored-by: Lan Nguyen <lan@example.invalid>.', expected: 'Commit mới ghi đúng đồng tác giả trong phần thân.',
    hint: 'Dùng hai tùy chọn -m để tách subject và trailer bằng dòng trống.', solution: 'git add bai.txt; git commit -m "Thêm bài" -m "Co-authored-by: Lan Nguyen <lan@example.invalid>"',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Làm cùng nhau\n'); },
    validate: async repo => result(await commits(repo) === 2 && (await git(repo, 'log', '-1', '--format=%B')).includes('\n\nCo-authored-by: Lan Nguyen <lan@example.invalid>') && await clean(repo), 'Hãy commit với trailer Co-authored-by đúng định dạng.'),
    solve: async repo => { await git(repo, 'add', 'bai.txt'); await git(repo, 'commit', '-m', 'Thêm bài', '-m', 'Co-authored-by: Lan Nguyen <lan@example.invalid>'); },
  },
  alias: {
    task: 'Tạo alias local st cho lệnh status --short.', expected: 'Cấu hình alias.st chứa status --short.',
    hint: 'Tạo alias local bằng git config --local alias.st "status --short".', solution: 'git config --local alias.st "status --short"',
    setup: base,
    validate: async repo => { let value = ''; try { value = await git(repo, 'config', '--local', 'alias.st'); } catch { /* chưa có */ } return result(['status --short', 'status -s'].includes(value.trim()), 'Hãy cấu hình alias.st local cho status ngắn gọn.'); },
    solve: async repo => { await git(repo, 'config', '--local', 'alias.st', 'status --short'); },
  },
  worktree: {
    task: 'Tạo worktree ở thư mục song song them-nhanh cho nhánh feature.', expected: 'git worktree list có đường dẫn them-nhanh.',
    hint: 'Tạo worktree bằng git worktree add ../them-nhanh feature.', solution: 'git worktree add ../them-nhanh feature',
    setup: async repo => { await base(repo); await git(repo, 'branch', 'feature'); },
    validate: async repo => {
      const expected = await realpath(path.dirname(repo));
      const target = path.join(expected, 'them-nhanh');
      const entries = (await git(repo, 'worktree', 'list', '--porcelain')).split('\n').filter(line => line.startsWith('worktree '));
      for (const entry of entries) {
        try {
          const actual = await realpath(entry.slice(9));
          if ((process.platform === 'win32' ? actual.toLowerCase() === target.toLowerCase() : actual === target)) return result(true, 'Worktree them-nhanh đã được tạo.');
        } catch { /* worktree cũ không còn trên đĩa */ }
      }
      return result(false, 'Hãy tạo worktree them-nhanh trong sandbox.');
    },
    solve: async repo => { await git(repo, 'worktree', 'add', path.join(path.dirname(repo), 'them-nhanh'), 'feature'); },
  },
  octopus: {
    task: 'Merge ba nhánh a, b, c vào main trong một octopus merge.', expected: 'HEAD có bốn cha và đủ ba tệp.',
    hint: 'Dùng git merge a b c khi đang ở main.', solution: 'git merge a b c',
    setup: async repo => { await base(repo); for (const name of ['a', 'b', 'c']) { await git(repo, 'switch', '-c', name, 'main'); await write(repo, `${name}.txt`, `${name}\n`); await commit(repo, `Nhánh ${name}`); await git(repo, 'switch', 'main'); } await write(repo, 'main.txt', 'main\n'); await commit(repo, 'Main tiến thêm'); },
    validate: async repo => result(await parents(repo) === 4 && await tipFile(repo, 'a.txt') === 'a' && await tipFile(repo, 'b.txt') === 'b' && await tipFile(repo, 'c.txt') === 'c' && await clean(repo), 'Hãy tạo octopus merge với ba nhánh.'),
    solve: async repo => { await git(repo, 'merge', 'a', 'b', 'c'); },
  },
  amend: {
    task: 'Sửa commit cuối để bổ sung fix.txt mà không tạo commit thứ ba.', expected: 'HEAD mới chứa fix.txt và lịch sử vẫn có hai commit.',
    hint: 'Stage fix.txt rồi dùng git commit --amend --no-edit.', solution: 'git add fix.txt; git commit --amend --no-edit',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Bản đầu\n'); await commit(repo, 'Bài đầu'); await write(repo, 'fix.txt', 'Bổ sung\n'); },
    validate: async repo => result(await commits(repo) === 2 && await tipFile(repo, 'fix.txt') === 'Bổ sung' && await clean(repo), 'Hãy bổ sung fix.txt vào commit cuối bằng amend.'),
    solve: async repo => { await git(repo, 'add', 'fix.txt'); await git(repo, 'commit', '--amend', '--no-edit'); },
  },
  fixMessage: {
    task: 'Sửa subject commit cuối từ "Sai chinh ta" thành "Sửa chính tả" mà không thêm commit.', expected: 'HEAD có message mới và số commit không đổi.',
    hint: 'git commit --amend -m đổi message của commit cuối.', solution: 'git commit --amend -m "Sửa chính tả"',
    setup: async repo => { await base(repo); await write(repo, 'bai.txt', 'Nội dung\n'); await commit(repo, 'Sai chinh ta'); },
    validate: async repo => result(await commits(repo) === 2 && (await git(repo, 'log', '-1', '--format=%s')) === 'Sửa chính tả' && await clean(repo), 'Hãy sửa message của commit cuối, không tạo commit mới.'),
    solve: async repo => { await git(repo, 'commit', '--amend', '-m', 'Sửa chính tả'); },
  },
  recoverLost: {
    task: 'Tìm commit "Thất lạc" trong reflog và tạo nhánh recovered tại commit đó.', expected: 'recovered chứa lost.txt dù main đã reset.',
    hint: 'Xem git reflog; dùng git branch recovered <object-id>.', solution: 'Lấy hash của commit Thất lạc từ git reflog rồi chạy git branch recovered <hash>.',
    setup: async repo => { await base(repo); await write(repo, 'lost.txt', 'Cần cứu\n'); await commit(repo, 'Thất lạc'); await git(repo, 'reset', '--hard', 'HEAD~1'); },
    validate: async repo => { let content = ''; try { content = await git(repo, 'show', 'recovered:lost.txt'); } catch { /* chưa cứu */ } return result(content === 'Cần cứu' && (await git(repo, 'branch', '--show-current')) === 'main', 'Hãy tạo recovered tại commit thất lạc và ở lại main.'); },
    solve: async repo => { const row = (await git(repo, 'reflog', '--format=%H %s')).split('\n').find(line => line.includes('Thất lạc')); if (!row) throw new Error('Không tìm thấy commit trong reflog.'); await git(repo, 'branch', 'recovered', row.split(' ')[0]!); },
  },
  detached: {
    task: 'Giữ commit vừa tạo ở detached HEAD bằng cách tạo nhánh recovered.', expected: 'HEAD ở recovered và chứa detached.txt.',
    hint: 'git switch -c recovered tạo nhánh ngay tại HEAD.', solution: 'git switch -c recovered',
    setup: async repo => { await base(repo); await git(repo, 'checkout', '--detach', 'HEAD'); await write(repo, 'detached.txt', 'Đừng mất\n'); await commit(repo, 'Commit detached'); },
    validate: async repo => result((await git(repo, 'branch', '--show-current')) === 'recovered' && await tipFile(repo, 'detached.txt') === 'Đừng mất' && await clean(repo), 'Hãy tạo nhánh recovered giữ commit detached.'),
    solve: async repo => { await git(repo, 'switch', '-c', 'recovered'); },
  },
  recoverBranch: {
    task: 'Khôi phục nhánh feature đã xóa bằng commit còn trong reflog.', expected: 'feature lại trỏ tới commit chứa feature.txt.',
    hint: 'Tìm hash bằng git reflog --all, rồi git branch feature <hash>.', solution: 'Lấy hash commit Tính năng cũ từ reflog, rồi git branch feature <hash>.',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'feature'); await write(repo, 'feature.txt', 'Tính năng\n'); await commit(repo, 'Tính năng cũ'); await git(repo, 'switch', 'main'); await git(repo, 'branch', '-D', 'feature'); },
    validate: async repo => { let content = ''; try { content = await git(repo, 'show', 'feature:feature.txt'); } catch { /* chưa phục hồi */ } return result(content === 'Tính năng' && (await git(repo, 'branch', '--show-current')) === 'main', 'Hãy phục hồi nhánh feature mà không thay main.'); },
    solve: async repo => { const row = (await git(repo, 'reflog', '--all', '--format=%H %s')).split('\n').find(line => line.includes('Tính năng cũ')); if (!row) throw new Error('Không tìm thấy commit trong reflog.'); await git(repo, 'branch', 'feature', row.split(' ')[0]!); },
  },
  resetOrigin: {
    task: 'Đồng bộ cứng main local về origin/main; bỏ commit và sửa đổi local trong sandbox.', expected: 'HEAD bằng origin/main và working tree sạch.',
    hint: 'git reset --hard origin/main chỉ an toàn trong repository bài tập.', solution: 'git reset --hard origin/main',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', '-u', 'origin', 'main'); await write(repo, 'local.txt', 'Không giữ\n'); await commit(repo, 'Commit local'); await write(repo, 'README.md', 'Sửa dở\n'); },
    validate: async repo => result((await git(repo, 'rev-parse', 'HEAD')) === await git(repo, 'rev-parse', 'origin/main') && await clean(repo), 'Hãy đưa main về origin/main và dọn sửa đổi local.'),
    solve: async repo => { await git(repo, 'reset', '--hard', 'origin/main'); },
  },
  restoreOne: {
    task: 'Chỉ khôi phục a.txt từ HEAD; giữ thay đổi đang làm ở b.txt.', expected: 'a.txt như HEAD, b.txt vẫn được sửa.',
    hint: 'Chỉ truyền pathspec a.txt cho git restore.', solution: 'git restore a.txt',
    setup: async repo => { await base(repo); await write(repo, 'a.txt', 'A gốc\n'); await write(repo, 'b.txt', 'B gốc\n'); await commit(repo, 'Hai tệp'); await write(repo, 'a.txt', 'A sai\n'); await write(repo, 'b.txt', 'B đang làm\n'); },
    validate: async repo => result(await read(repo, 'a.txt') === 'A gốc\n' && await read(repo, 'b.txt') === 'B đang làm\n' && (await status(repo)).split('\n').includes(' M b.txt'), 'Hãy chỉ khôi phục a.txt, giữ b.txt đang sửa.'),
    solve: async repo => { await git(repo, 'restore', 'a.txt'); },
  },
  upstream: {
    task: 'Đẩy feature lên origin và đặt origin/feature làm upstream.', expected: 'feature@{upstream} là origin/feature.',
    hint: 'Dùng git push -u origin feature để đặt upstream.', solution: 'git push -u origin feature',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'switch', '-c', 'feature'); await write(repo, 'feature.txt', 'Tính năng\n'); await commit(repo, 'Tính năng'); },
    validate: async repo => { let upstream = ''; try { upstream = await git(repo, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', 'feature@{upstream}'); } catch { /* chưa đặt */ } return result(upstream === 'origin/feature', 'Hãy push feature và đặt upstream.'); },
    solve: async repo => { await git(repo, 'push', '-u', 'origin', 'feature'); },
  },
  addUpstream: {
    task: 'Repository upstream.git đã có sẵn cạnh repo (đường dẫn {upstream}). Hãy thêm remote upstream trỏ đến nó và giữ nguyên origin.', expected: 'Repository có cả origin và upstream riêng.',
    hint: 'Thêm remote bằng git remote add upstream "{upstream}".', solution: 'git remote add upstream "{upstream}"',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'init', '--bare', '-b', 'main', path.join(path.dirname(repo), 'upstream.git')); },
    validate: async repo => { let url = ''; try { url = await git(repo, 'remote', 'get-url', 'upstream'); } catch { /* chưa có */ } return result(url !== '' && path.resolve(repo, url) === path.join(path.dirname(repo), 'upstream.git') && (await git(repo, 'remote')).split('\n').includes('origin'), 'Hãy thêm upstream và giữ origin.'); },
    solve: async repo => { await git(repo, 'remote', 'add', 'upstream', path.join(path.dirname(repo), 'upstream.git')); },
  },
  renameRemote: {
    task: 'Đổi tên remote origin thành source mà giữ nguyên URL.', expected: 'source tồn tại và origin không còn.',
    hint: 'Đổi tên bằng git remote rename origin source.', solution: 'git remote rename origin source',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); },
    validate: async repo => { const names = (await git(repo, 'remote')).split('\n'); return result(names.includes('source') && !names.includes('origin') && (await git(repo, 'remote', 'get-url', 'source')) === remotePath(repo), 'Hãy đổi tên origin thành source và giữ URL.'); },
    solve: async repo => { await git(repo, 'remote', 'rename', 'origin', 'source'); },
  },
  pushTag: {
    task: 'Đẩy tag v1.0.0 đã tạo lên origin local.', expected: 'Remote có refs/tags/v1.0.0.',
    hint: 'Đẩy tag riêng bằng git push origin v1.0.0.', solution: 'git push origin v1.0.0',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', 'origin', 'main'); await git(repo, 'tag', 'v1.0.0'); },
    validate: async repo => { let remoteTag = ''; try { remoteTag = await git(repo, '--git-dir', remotePath(repo), 'rev-parse', 'refs/tags/v1.0.0'); } catch { /* chưa push */ } return result(remoteTag !== '' && remoteTag === await git(repo, 'rev-parse', 'refs/tags/v1.0.0'), 'Hãy đẩy tag v1.0.0 lên origin.'); },
    solve: async repo => { await git(repo, 'push', 'origin', 'v1.0.0'); },
  },
  prune: {
    task: 'Dọn remote-tracking ref origin/old đã bị xóa ở remote.', expected: 'origin/old biến mất sau khi prune.',
    hint: 'Dọn ref bằng git remote prune origin.', solution: 'git remote prune origin',
    setup: async repo => { await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', 'origin', 'main'); await git(repo, 'branch', 'old'); await git(repo, 'push', 'origin', 'old'); await git(repo, 'fetch', 'origin'); await git(repo, 'push', 'origin', '--delete', 'old'); await git(repo, 'update-ref', 'refs/remotes/origin/old', 'main'); },
    validate: async repo => { let exists = true; try { await git(repo, 'rev-parse', '--verify', 'refs/remotes/origin/old'); } catch { exists = false; } return result(!exists && (await git(repo, 'branch', '--list', 'old')).trim() !== '', 'Hãy prune origin/old nhưng giữ nhánh local old.'); },
    solve: async repo => { await git(repo, 'remote', 'prune', 'origin'); },
  },
  releaseBranch: {
    task: 'Tạo nhánh release/2.0 từ main, ghi “Đóng băng 2.0” vào release.txt rồi commit.', expected: 'HEAD ở release/2.0, main chưa có tệp release.txt.',
    hint: 'git switch -c release/2.0; tạo release.txt rồi commit.', solution: 'git switch -c release/2.0; ghi release.txt; git add release.txt; git commit -m "Chuẩn bị 2.0"',
    setup: base,
    validate: async repo => { let mainFile = ''; try { mainFile = await git(repo, 'show', 'main:release.txt'); } catch { /* main chưa có */ } return result((await git(repo, 'branch', '--show-current')) === 'release/2.0' && await tipFile(repo, 'release.txt') === 'Đóng băng 2.0' && mainFile === '' && await clean(repo), 'Hãy commit ghi chú trên release/2.0, giữ main nguyên.'); },
    solve: async repo => { await git(repo, 'switch', '-c', 'release/2.0'); await write(repo, 'release.txt', 'Đóng băng 2.0\n'); await commit(repo, 'Chuẩn bị 2.0'); },
  },
  hotfix: {
    task: 'Tạo hotfix/1.0.1 từ tag v1.0.0, ghi “Sửa production” vào fix.txt rồi commit.', expected: 'Nhánh hotfix có fix, còn main chưa có.',
    hint: 'Tạo nhánh từ tag bằng git switch -c hotfix/1.0.1 v1.0.0.', solution: 'git switch -c hotfix/1.0.1 v1.0.0; tạo fix.txt rồi commit.',
    setup: async repo => { await base(repo); await git(repo, 'tag', 'v1.0.0'); await write(repo, 'next.txt', 'Đang phát triển\n'); await commit(repo, 'Phiên bản kế'); },
    validate: async repo => { let mainFile = ''; try { mainFile = await git(repo, 'show', 'main:fix.txt'); } catch { /* main chưa có */ } return result((await git(repo, 'branch', '--show-current')) === 'hotfix/1.0.1' && await tipFile(repo, 'fix.txt') === 'Sửa production' && mainFile === '' && await isAncestor(repo, 'v1.0.0', 'HEAD') && await clean(repo), 'Hãy tạo hotfix từ tag cũ và commit fix riêng.'); },
    solve: async repo => { await git(repo, 'switch', '-c', 'hotfix/1.0.1', 'v1.0.0'); await write(repo, 'fix.txt', 'Sửa production\n'); await commit(repo, 'Sửa production'); },
  },
  changelog: {
    task: 'Tạo CHANGELOG.md nhắc đến hai commit tính năng và sửa lỗi, rồi commit tài liệu.', expected: 'HEAD chứa CHANGELOG.md với cả hai mục.',
    hint: 'Dùng git log để lấy subject, rồi viết hai mục trong CHANGELOG.md.', solution: 'Tạo CHANGELOG.md có “Thêm tính năng” và “Sửa lỗi”, sau đó commit.',
    setup: async repo => { await base(repo); await write(repo, 'feature.txt', 'Tính năng\n'); await commit(repo, 'Thêm tính năng'); await write(repo, 'fix.txt', 'Sửa lỗi\n'); await commit(repo, 'Sửa lỗi'); },
    validate: async repo => { const text = await tipFile(repo, 'CHANGELOG.md') ?? ''; return result(text.includes('Thêm tính năng') && text.includes('Sửa lỗi') && await commits(repo) === 4 && await clean(repo), 'Hãy ghi cả hai thay đổi vào CHANGELOG.md và commit.'); },
    solve: async repo => { await write(repo, 'CHANGELOG.md', '# Thay đổi\n- Thêm tính năng\n- Sửa lỗi\n'); await commit(repo, 'Viết CHANGELOG'); },
  },
  stashCherry: {
    task: 'Cất sửa đổi README.md, cherry-pick source, rồi lấy sửa đổi từ stash trở lại.', expected: 'HEAD có source.txt và README.md vẫn đang sửa.',
    hint: 'Lần lượt git stash push, git cherry-pick source, git stash pop.', solution: 'git stash push; git cherry-pick source; git stash pop',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'source'); await write(repo, 'source.txt', 'Nguồn\n'); await commit(repo, 'Thay đổi nguồn'); await git(repo, 'switch', 'main'); await write(repo, 'README.md', 'Đang làm dở\n'); },
    validate: async repo => result(await tipFile(repo, 'source.txt') === 'Nguồn' && await read(repo, 'README.md') === 'Đang làm dở\n' && (await status(repo)).split('\n').includes(' M README.md') && (await git(repo, 'stash', 'list')) === '', 'Hãy cherry-pick và khôi phục việc dở từ stash.'),
    solve: async repo => { await git(repo, 'stash', 'push'); await git(repo, 'cherry-pick', 'source'); await git(repo, 'stash', 'pop'); },
  },
  cherrySeries: {
    task: 'Chép cả hai commit riêng trên source sang main, giữ thứ tự.', expected: 'main có a.txt và b.txt trong hai commit mới.',
    hint: 'Dùng git cherry-pick main..source.', solution: 'git cherry-pick main..source',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'source'); await write(repo, 'a.txt', 'A\n'); await commit(repo, 'Nguồn A'); await write(repo, 'b.txt', 'B\n'); await commit(repo, 'Nguồn B'); await git(repo, 'switch', 'main'); await write(repo, 'main.txt', 'Main\n'); await commit(repo, 'Main riêng'); },
    validate: async repo => result(await commits(repo) === 4 && await tipFile(repo, 'a.txt') === 'A' && await tipFile(repo, 'b.txt') === 'B' && (await git(repo, 'log', '-2', '--format=%s')).split('\n').join(',') === 'Nguồn B,Nguồn A' && await clean(repo), 'Hãy chép cả hai commit đúng thứ tự lên main.'),
    solve: async repo => { await git(repo, 'cherry-pick', 'main..source'); },
  },
  split: {
    task: 'Tách commit cuối chứa a.txt và b.txt thành hai commit riêng, mỗi commit một tệp.', expected: 'HEAD có hai commit mới, mỗi commit đổi một tệp.',
    hint: 'git reset HEAD~1 giữ file trong working tree; stage và commit từng tệp.', solution: 'git reset HEAD~1; git add a.txt; git commit -m "A"; git add b.txt; git commit -m "B"',
    setup: async repo => { await base(repo); await write(repo, 'a.txt', 'A\n'); await write(repo, 'b.txt', 'B\n'); await commit(repo, 'Hai thay đổi lẫn nhau'); },
    validate: async repo => { const a = await git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD~1'); const b = await git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'); return result(await commits(repo) === 3 && new Set([a, b]).size === 2 && [a, b].every(file => ['a.txt', 'b.txt'].includes(file)) && await clean(repo), 'Hãy tách a.txt và b.txt thành hai commit riêng.'); },
    solve: async repo => { await git(repo, 'reset', 'HEAD~1'); await git(repo, 'add', 'a.txt'); await git(repo, 'commit', '-m', 'A'); await git(repo, 'add', 'b.txt'); await git(repo, 'commit', '-m', 'B'); },
  },
  reorder: {
    task: 'Đổi thứ tự hai commit A rồi B thành B rồi A trên nhánh topic.', expected: 'Hai commit mới theo thứ tự thời gian B trước A.',
    hint: 'git rebase -i HEAD~2 cho phép đổi thứ tự hai dòng pick.', solution: 'Dùng git rebase -i HEAD~2 và đổi thứ tự dòng B lên trước A.',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'topic'); await write(repo, 'a.txt', 'A\n'); await commit(repo, 'A'); await git(repo, 'update-ref', 'refs/lesson/a', 'HEAD'); await write(repo, 'b.txt', 'B\n'); await commit(repo, 'B'); await git(repo, 'update-ref', 'refs/lesson/b', 'HEAD'); },
    validate: async repo => result((await git(repo, 'log', '-2', '--format=%s')).split('\n').join(',') === 'A,B' && await tipFile(repo, 'a.txt') === 'A' && await tipFile(repo, 'b.txt') === 'B' && await clean(repo), 'Hãy đổi thứ tự để B là commit cũ hơn A.'),
    solve: async repo => { await git(repo, 'reset', '--hard', 'main'); await git(repo, 'cherry-pick', 'refs/lesson/b'); await git(repo, 'cherry-pick', 'refs/lesson/a'); },
  },
  squashHistory: {
    task: 'Gộp commit fixup! vào commit tính năng trước đó để topic chỉ còn một commit.', expected: 'topic có một commit sau main và giữ nội dung fix.',
    hint: 'git rebase -i --autosquash main sắp xếp commit fixup.', solution: 'Dùng git rebase -i --autosquash main rồi xác nhận danh sách thao tác.',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'topic'); await write(repo, 'bai.txt', 'Bản đầu\n'); await commit(repo, 'Thêm tính năng'); await write(repo, 'bai.txt', 'Bản đã sửa\n'); await commit(repo, 'fixup! Thêm tính năng'); },
    validate: async repo => result(Number(await git(repo, 'rev-list', '--count', 'main..topic')) === 1 && await tipFile(repo, 'bai.txt') === 'Bản đã sửa' && await clean(repo), 'Hãy gộp fixup thành một commit tính năng.'),
    solve: async repo => { await git(repo, 'reset', '--soft', 'main'); await git(repo, 'commit', '-m', 'Thêm tính năng'); },
  },
  docs: {
    task: 'Viết README.md có mục Cài đặt, Kiểm thử và Nhánh rồi commit.', expected: 'HEAD chứa hướng dẫn onboarding với ba mục.',
    hint: 'Viết ba heading trong README.md rồi commit thay đổi.', solution: 'Ghi các mục Cài đặt, Kiểm thử, Nhánh vào README.md và commit.',
    setup: base,
    validate: async repo => { const text = await tipFile(repo, 'README.md') ?? ''; return result(text.includes('Cài đặt') && text.includes('Kiểm thử') && text.includes('Nhánh') && await commits(repo) === 2 && await clean(repo), 'Hãy commit README.md với ba mục hướng dẫn.'); },
    solve: async repo => { await write(repo, 'README.md', '# Bắt đầu\n## Cài đặt\n## Kiểm thử\n## Nhánh\n'); await commit(repo, 'Viết hướng dẫn'); },
  },
  flag: {
    task: 'Ghi “Tính năng mới” vào feature.txt rồi commit; giữ cờ bật tính năng trong flags.json là false.', expected: 'main có mã tính năng và cờ vẫn tắt.',
    hint: 'Commit cả feature.txt và flags.json với enabled: false.', solution: 'Tạo feature.txt, giữ {"enabled":false} trong flags.json rồi commit.',
    setup: async repo => { await base(repo); await write(repo, 'flags.json', '{"enabled":false}\n'); await commit(repo, 'Thêm cờ'); },
    validate: async repo => result(await tipFile(repo, 'feature.txt') === 'Tính năng mới' && await tipFile(repo, 'flags.json') === '{"enabled":false}' && await clean(repo), 'Hãy commit tính năng nhưng giữ cờ enabled=false.'),
    solve: async repo => { await write(repo, 'feature.txt', 'Tính năng mới\n'); await commit(repo, 'Thêm tính năng sau cờ'); },
  },
  submodule: {
    task: 'Repository local module-source đã có sẵn cạnh repo (đường dẫn {submodule}). Hãy thêm nó làm submodule tại modules/sample và commit gitlink.',
    expected: 'HEAD có gitlink tại modules/sample, .gitmodules trỏ đến nguồn local trong sandbox.',
    hint: 'Dùng git -c protocol.file.allow=always submodule add "{submodule}" modules/sample rồi commit.',
    solution: 'git -c protocol.file.allow=always submodule add "{submodule}" modules/sample; git commit -m "Thêm submodule"',
    setup: async repo => {
      await base(repo);
      const source = path.join(path.dirname(repo), 'module-source');
      await init(source);
      await write(source, 'module.txt', 'Module local\n');
      await commit(source, 'Tạo module');
    },
    validate: async repo => {
      const source = path.join(path.dirname(repo), 'module-source');
      const entry = await git(repo, 'ls-tree', 'HEAD', 'modules/sample');
      let configured = '';
      try { configured = await git(repo, 'config', '--no-includes', '-f', '.gitmodules', '--get', 'submodule.modules/sample.url'); } catch { /* chưa có submodule */ }
      const submoduleFile = await read(repo, 'modules/sample/module.txt');
      return result(entry.startsWith('160000 commit ') && path.resolve(repo, configured) === source && submoduleFile === 'Module local\n' && await clean(repo), 'Hãy thêm submodule local và commit gitlink.');
    },
    solve: async repo => {
      await git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', path.join(path.dirname(repo), 'module-source'), 'modules/sample');
      await git(repo, 'commit', '-m', 'Thêm submodule');
    },
  },
  sparse: {
    task: 'Bật sparse-checkout cone mode và chỉ giữ thư mục docs trong working tree.',
    expected: 'docs/guide.txt còn hiện, src/app.txt được ẩn mà vẫn có trong HEAD.',
    hint: 'Dùng git sparse-checkout init --cone rồi git sparse-checkout set docs.',
    solution: 'git sparse-checkout init --cone; git sparse-checkout set docs',
    setup: async repo => { await base(repo); await write(repo, 'docs/guide.txt', 'Hướng dẫn\n'); await write(repo, 'src/app.txt', 'Mã nguồn\n'); await commit(repo, 'Thêm tài liệu và mã'); },
    validate: async repo => { let enabled = false; try { enabled = (await git(repo, 'config', '--bool', 'core.sparseCheckout')) === 'true'; } catch { /* chưa bật */ } return result(enabled && await read(repo, 'docs/guide.txt') === 'Hướng dẫn\n' && await read(repo, 'src/app.txt') === undefined && await tipFile(repo, 'src/app.txt') === 'Mã nguồn' && await clean(repo), 'Hãy để sparse-checkout chỉ hiển thị docs.'); },
    solve: async repo => { await git(repo, 'sparse-checkout', 'init', '--cone'); await git(repo, 'sparse-checkout', 'set', 'docs'); },
  },
  partialStage: {
    task: 'Trong bai.txt có thay đổi tính năng và dòng thử nghiệm. Chỉ commit dòng “Tính năng”; giữ dòng “Thử nghiệm” ngoài commit.',
    expected: 'HEAD có Tính năng nhưng không có Thử nghiệm; working tree vẫn giữ Thử nghiệm chưa stage.',
    hint: 'Dùng git add -p bai.txt để chọn đúng hunk trước khi commit.',
    solution: 'git add -p bai.txt; chọn hunk Tính năng, bỏ hunk Thử nghiệm; git commit -m "Thêm tính năng".',
    setup: async repo => {
      await base(repo);
      const lines = Array.from({ length: 24 }, (_, i) => `Dòng nền ${i + 1}`);
      await write(repo, 'bai.txt', lines.join('\n') + '\n');
      await commit(repo, 'Tệp nền');
      lines.splice(2, 0, 'Tính năng');
      lines.splice(22, 0, 'Thử nghiệm');
      await write(repo, 'bai.txt', lines.join('\n') + '\n');
    },
    validate: async repo => {
      const head = await tipFile(repo, 'bai.txt') ?? '';
      const working = await read(repo, 'bai.txt') ?? '';
      return result(await commits(repo) === 3 && head.includes('Tính năng') && !head.includes('Thử nghiệm') && working.includes('Tính năng') && working.includes('Thử nghiệm') && (await status(repo)).split('\n').includes(' M bai.txt'), 'Hãy chỉ commit phần Tính năng và giữ Thử nghiệm ngoài commit.');
    },
    solve: async repo => {
      const current = await read(repo, 'bai.txt') ?? '';
      await write(repo, 'bai.txt', current.replace('Thử nghiệm\n', ''));
      await git(repo, 'add', 'bai.txt');
      await write(repo, 'bai.txt', current);
      await git(repo, 'commit', '-m', 'Thêm tính năng');
    },
  },
  symbolicRef: {
    task: 'Tạo symbolic ref refs/lesson/current trỏ tới refs/heads/main.',
    expected: 'git symbolic-ref refs/lesson/current trả refs/heads/main.',
    hint: 'Dùng git symbolic-ref với hai tên ref.',
    solution: 'git symbolic-ref refs/lesson/current refs/heads/main',
    setup: base,
    validate: async repo => { let value = ''; try { value = await git(repo, 'symbolic-ref', 'refs/lesson/current'); } catch { /* chưa có */ } return result(value === 'refs/heads/main', 'Hãy tạo symbolic ref trỏ tới nhánh main.'); },
    solve: async repo => { await git(repo, 'symbolic-ref', 'refs/lesson/current', 'refs/heads/main'); },
  },
  mergeBase: {
    task: 'Hai nhánh main và topic đã phân kỳ. Tìm merge base rồi lưu object ID vào refs/lesson/base.',
    expected: 'refs/lesson/base trỏ đến tổ tiên chung gần nhất.',
    hint: 'Dùng git merge-base main topic rồi git update-ref refs/lesson/base <object-id>.',
    solution: 'git update-ref refs/lesson/base "$(git merge-base main topic)" (trong Bash); PowerShell: git update-ref refs/lesson/base (git merge-base main topic).',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'topic'); await write(repo, 'topic.txt', 'Topic\n'); await commit(repo, 'Topic'); await git(repo, 'switch', 'main'); await write(repo, 'main.txt', 'Main\n'); await commit(repo, 'Main'); },
    validate: async repo => { let baseRef = ''; try { baseRef = await git(repo, 'rev-parse', 'refs/lesson/base'); } catch { /* chưa có */ } return result(baseRef !== '' && baseRef === await git(repo, 'merge-base', 'main', 'topic') && await clean(repo), 'Hãy lưu đúng merge base vào refs/lesson/base.'); },
    solve: async repo => { await git(repo, 'update-ref', 'refs/lesson/base', await git(repo, 'merge-base', 'main', 'topic')); },
  },
  reviewBranch: {
    task: 'Origin local có nhánh feature (ở local bạn chưa có nhánh này; main đã tiến thêm một commit riêng). Hãy fetch feature rồi tạo nhánh review/pr tại commit đó; giữ main nguyên.',
    expected: 'review/pr trỏ tới origin/feature và main chưa nhận tính năng.',
    hint: 'Tải nhánh bằng git fetch origin feature rồi mở review/pr từ origin/feature.',
    solution: 'git fetch origin feature; git switch -c review/pr origin/feature; git diff main...review/pr',
    setup: async repo => {
      await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo));
      await git(repo, 'push', 'origin', 'main');
      await git(repo, 'switch', '-c', 'feature');
      await write(repo, 'feature.txt', 'Đề xuất\n');
      await commit(repo, 'Đề xuất');
      await git(repo, 'push', 'origin', 'feature');
      await git(repo, 'switch', 'main');
      await git(repo, 'branch', '-D', 'feature');
      await write(repo, 'main.txt', 'Main tiến thêm sau khi feature tách ra\n');
      await commit(repo, 'Main tiến thêm');
    },
    validate: async repo => { let review = ''; try { review = await git(repo, 'rev-parse', 'refs/heads/review/pr'); } catch { /* chưa có */ } return result(review !== '' && review === await git(repo, 'rev-parse', 'refs/remotes/origin/feature') && await tipFile(repo, 'feature.txt') === 'Đề xuất' && (await git(repo, 'rev-parse', 'main')) !== review && await clean(repo), 'Hãy fetch và mở nhánh review/pr mà không sửa main.'); },
    solve: async repo => { await git(repo, 'fetch', 'origin', 'feature'); await git(repo, 'switch', '-c', 'review/pr', 'origin/feature'); },
  },
  editHistory: {
    task: 'Sửa subject commit WIP trên topic thành “Cập nhật rõ nghĩa” mà giữ cả hai commit và nội dung.',
    expected: 'topic còn hai commit sau main, không còn subject WIP.',
    hint: 'Dùng git rebase -i main để chọn reword cho commit WIP.',
    solution: 'git rebase -i main; đổi pick của WIP thành reword rồi nhập subject “Cập nhật rõ nghĩa”.',
    setup: async repo => { await base(repo); await git(repo, 'switch', '-c', 'topic'); await write(repo, 'a.txt', 'A\n'); await commit(repo, 'A'); await write(repo, 'b.txt', 'B\n'); await commit(repo, 'WIP'); },
    validate: async repo => result((await git(repo, 'branch', '--show-current')) === 'topic' && Number(await git(repo, 'rev-list', '--count', 'main..topic')) === 2 && (await git(repo, 'log', '-1', '--format=%s')) === 'Cập nhật rõ nghĩa' && await tipFile(repo, 'a.txt') === 'A' && await tipFile(repo, 'b.txt') === 'B' && await clean(repo), 'Hãy sửa subject WIP và giữ hai commit trên topic.'),
    solve: async repo => { await git(repo, 'commit', '--amend', '-m', 'Cập nhật rõ nghĩa'); },
  },
  syncFork: {
    task: 'Fetch upstream/main mới, hợp nhất vào main local rồi push main lên origin local.',
    expected: 'main ở origin bằng main upstream và chứa commit cập nhật.',
    hint: 'Lần lượt dùng git fetch upstream, git merge upstream/main rồi git push origin main.',
    solution: 'git fetch upstream; git merge upstream/main; git push origin main',
    setup: async repo => {
      await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', 'origin', 'main');
      const upstream = path.join(path.dirname(repo), 'upstream.git');
      await git(repo, 'init', '--bare', '-b', 'main', upstream); await git(repo, 'remote', 'add', 'upstream', upstream); await git(repo, 'push', 'upstream', 'main');
      const publisher = path.join(path.dirname(repo), 'upstream-publisher');
      await git(repo, 'clone', upstream, publisher);
      await git(publisher, 'config', 'user.name', 'Git Training'); await git(publisher, 'config', 'user.email', 'git-training@example.invalid');
      await write(publisher, 'upstream.txt', 'Cập nhật\n'); await commit(publisher, 'Cập nhật upstream'); await git(publisher, 'push', 'origin', 'main');
    },
    validate: async repo => result((await git(repo, 'rev-parse', 'main')) === await git(repo, '--git-dir', remotePath(repo), 'rev-parse', 'main') && (await git(repo, 'rev-parse', 'main')) === await git(repo, '--git-dir', path.join(path.dirname(repo), 'upstream.git'), 'rev-parse', 'main') && await tipFile(repo, 'upstream.txt') === 'Cập nhật' && await clean(repo), 'Hãy đưa cập nhật upstream vào fork origin.'),
    solve: async repo => { await git(repo, 'fetch', 'upstream'); await git(repo, 'merge', 'upstream/main'); await git(repo, 'push', 'origin', 'main'); },
  },
  prFlow: {
    task: 'Mô phỏng PR offline: push feature lên origin, ghi ref refs/lesson/review-approved tại feature, merge --no-ff vào main rồi push main.',
    expected: 'origin/main là merge commit chứa feature; ref duyệt trỏ tới feature.',
    hint: 'Đặt ref duyệt bằng git update-ref rồi merge --no-ff feature trên main.',
    solution: 'git push origin feature; git update-ref refs/lesson/review-approved feature; git switch main; git merge --no-ff feature; git push origin main',
    setup: async repo => {
      await base(repo); await bare(repo); await git(repo, 'remote', 'add', 'origin', remotePath(repo)); await git(repo, 'push', 'origin', 'main');
      await git(repo, 'switch', '-c', 'feature'); await write(repo, 'feature.txt', 'Đề xuất\n'); await commit(repo, 'Đề xuất thay đổi');
    },
    validate: async repo => {
      let approved = ''; let remoteFeature = ''; let remoteMain = '';
      try { approved = await git(repo, 'rev-parse', 'refs/lesson/review-approved'); } catch { /* chưa duyệt */ }
      try { remoteFeature = await git(repo, '--git-dir', remotePath(repo), 'rev-parse', 'refs/heads/feature'); } catch { /* chưa push */ }
      try { remoteMain = await git(repo, '--git-dir', remotePath(repo), 'rev-parse', 'refs/heads/main'); } catch { /* chưa push */ }
      return result(approved !== '' && approved === remoteFeature && remoteMain === await git(repo, 'rev-parse', 'main') && await parents(repo) === 2 && await isAncestor(repo, 'feature', 'main') && await clean(repo), 'Hãy push feature, ghi ref duyệt, merge vào main rồi push main.');
    },
    solve: async repo => { await git(repo, 'push', 'origin', 'feature'); await git(repo, 'update-ref', 'refs/lesson/review-approved', 'feature'); await git(repo, 'switch', 'main'); await git(repo, 'merge', '--no-ff', '-m', 'Merge đề xuất', 'feature'); await git(repo, 'push', 'origin', 'main'); },
  },
  pairReview: {
    task: 'Commit pair.txt với trailer Co-authored-by: Lan Nguyen <lan@example.invalid> và Reviewed-by: Mai Tran <mai@example.invalid>.',
    expected: 'Commit ghi người cùng viết và người review.',
    hint: 'Dùng nhiều -m để tạo phần thân commit với hai trailer riêng.',
    solution: 'git add pair.txt; git commit -m "Làm việc cặp" -m "Co-authored-by: Lan Nguyen <lan@example.invalid>" -m "Reviewed-by: Mai Tran <mai@example.invalid>"',
    setup: async repo => { await base(repo); await write(repo, 'pair.txt', 'Làm việc cặp\n'); },
    validate: async repo => { const body = await git(repo, 'log', '-1', '--format=%B'); return result(await commits(repo) === 2 && await tipFile(repo, 'pair.txt') === 'Làm việc cặp' && body.includes('Co-authored-by: Lan Nguyen <lan@example.invalid>') && body.includes('Reviewed-by: Mai Tran <mai@example.invalid>') && await clean(repo), 'Hãy ghi cả đồng tác giả và người review trong commit.'); },
    solve: async repo => { await git(repo, 'add', 'pair.txt'); await git(repo, 'commit', '-m', 'Làm việc cặp', '-m', 'Co-authored-by: Lan Nguyen <lan@example.invalid>', '-m', 'Reviewed-by: Mai Tran <mai@example.invalid>'); },
  },
  conventions: {
    task: 'Tạo CONTRIBUTING.md với mục Quy ước nhánh, Review và Kiểm thử rồi commit.',
    expected: 'HEAD chứa tài liệu đóng góp với ba mục.',
    hint: 'Viết tài liệu trong CONTRIBUTING.md và kiểm tra diff trước khi commit.',
    solution: 'Tạo CONTRIBUTING.md gồm Quy ước nhánh, Review, Kiểm thử; git add CONTRIBUTING.md; git commit -m "Viết quy ước".',
    setup: base,
    validate: async repo => { const content = await tipFile(repo, 'CONTRIBUTING.md') ?? ''; return result(['Quy ước nhánh', 'Review', 'Kiểm thử'].every(part => content.includes(part)) && await commits(repo) === 2 && await clean(repo), 'Hãy commit CONTRIBUTING.md đủ ba mục.'); },
    solve: async repo => { await write(repo, 'CONTRIBUTING.md', '# Đóng góp\n## Quy ước nhánh\n## Review\n## Kiểm thử\n'); await commit(repo, 'Viết quy ước'); },
  },
};

export function getLab(id: string): Lab {
  const lab = labs[id];
  if (!lab) throw new Error(`Không có bài thực hành: ${id}`);
  return lab;
}
