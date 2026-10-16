import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { git, read, roadmap } from '../dist/index.js';
import { getLab } from '../dist/labs.js';
import { getCourse } from '../dist/courses.js';
import { fixtures } from '../dist/fixtures.js';

const exists = async file => { try { await access(file); return true; } catch { return false; } };
const lines = text => text.split('\n').filter(Boolean);

async function withRepo(key, action) {
  const [trackId, slug] = key.split('/');
  const exercise = getCourse(trackId).exercises.find(item => item.id === slug);
  assert.ok(exercise, key);
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-fixture-'));
  try {
    const repo = path.join(home, 'repo');
    await exercise.setup(repo);
    await action(repo, home, exercise);
  } finally { await rm(home, { recursive: true, force: true }); }
}

test('mọi bài chỉ trả lời đều mô tả trạng thái repo trong nhiệm vụ, không còn câu "khảo sát nếu cần"', () => {
  let answerOnly = 0;
  for (const track of roadmap) for (const lesson of track.lessons) {
    const key = `${track.id}/${lesson.slug}`;
    const exercise = getCourse(track.id).exercises.find(item => item.id === lesson.slug);
    if (lesson.lab) { assert.equal(fixtures[key], undefined, `${key} là bài thực hành, không cần fixture riêng`); continue; }
    answerOnly += 1;
    assert.ok(fixtures[key], `${key} thiếu fixture`);
    assert.ok(fixtures[key].note.length > 30 && fixtures[key].hint.length > 20, key);
    assert.ok(exercise.instructions.includes(fixtures[key].note), key);
    assert.ok(exercise.instructions.endsWith(lesson.question), key);
    assert.doesNotMatch(exercise.instructions, /nếu cần/, key);
    assert.equal(exercise.hints[1], fixtures[key].hint, key);
  }
  assert.equal(answerOnly, 48);
  assert.equal(Object.keys(fixtures).length, 48);
});

test('status-log-diff: repo có thay đổi chưa stage, đã stage, tệp mới và lịch sử để quan sát', async () => {
  await withRepo('foundations/status-log-diff', async repo => {
    const status = lines(await git(repo, 'status', '--porcelain=v1'));
    assert.deepEqual(status.sort(), [' M bai.txt', '?? moi.txt', 'M  README.md']);
    assert.match(await git(repo, 'diff'), /\+Dòng 3 mới sửa, chưa stage/);
    assert.match(await git(repo, 'diff', '--staged'), /\+Đã sửa và đã stage/);
    assert.equal(lines(await git(repo, 'log', '--oneline')).length, 3);
  });
  await withRepo('foundations/three-trees', async repo => {
    assert.notEqual(await git(repo, 'diff', '--staged', '--name-only'), '');
    assert.notEqual(await git(repo, 'diff', '--name-only'), '');
  });
});

test('fixture cho bài đối tượng, tệp, nhánh và ref có đúng trạng thái đã hứa', async () => {
  await withRepo('foundations/file-modes', async repo => {
    const stage = await git(repo, 'ls-files', '--stage');
    assert.match(stage, /^100755 \S+ 0\tchay\.sh$/m);
    assert.match(stage, /^100644 \S+ 0\tghi-chu\.txt$/m);
  });
  await withRepo('foundations/head-and-refs', async repo => {
    assert.equal(await git(repo, 'symbolic-ref', 'HEAD'), 'refs/heads/tinh-nang');
  });
  await withRepo('foundations/object-model', async repo => {
    assert.match(await git(repo, 'ls-tree', '-r', 'HEAD'), /src\/app\.txt/);
  });
  await withRepo('branching/listing-branches', async repo => {
    assert.deepEqual(lines(await git(repo, 'branch', '--format=%(refname:short)', '--merged')).sort(), ['da-merge', 'main']);
    assert.equal(await git(repo, 'branch', '--format=%(refname:short)', '--no-merged'), 'chua-merge');
  });
  await withRepo('undo/reflog', async repo => {
    assert.doesNotMatch(await git(repo, 'log', '--format=%s'), /Commit B/);
    assert.match(await git(repo, 'reflog', '--format=%gs'), /commit: Commit B/);
  });
  await withRepo('teamwork/reviewing-with-diff', async repo => {
    assert.match(await git(repo, 'diff', '--name-only', 'main..feature'), /main\.txt/);
    assert.equal(await git(repo, 'diff', '--name-only', 'main...feature'), 'feature.txt');
  });
  await withRepo('release-ops/semver', async repo => {
    assert.match(await git(repo, 'describe', '--tags'), /^v1\.2\.3-1-g/);
    assert.match(await git(repo, 'log', '-1', '--format=%s'), /^feat:/);
  });
});

test('fixture điều tra: tác giả, chuỗi mẫu, đổi tên và range-diff quan sát được bằng Git thật', async () => {
  await withRepo('inspection/blame', async repo => {
    assert.match(await git(repo, 'blame', 'app.txt'), /\(Minh .*\) loi$/m);
  });
  await withRepo('inspection/file-history-renames', async repo => {
    assert.match(await git(repo, 'log', '--follow', '--name-status', '--format=', '--', 'app-renamed.txt'), /R100\tapp\.txt\tapp-renamed\.txt/);
  });
  await withRepo('forensics/finding-leaked-secrets', async repo => {
    assert.doesNotMatch(await git(repo, 'show', 'HEAD:app.txt'), /TOKEN_DEMO/);
    assert.equal(lines(await git(repo, 'log', '-S', 'TOKEN_DEMO', '--reverse', '--format=%s'))[0], 'Thêm chuỗi mẫu');
  });
  await withRepo('inspection/range-diff', async repo => {
    const out = await git(repo, 'range-diff', 'main..topic-v1', 'main..topic-v2');
    assert.match(out, /Bước 1/);
    assert.match(out, /^\s*2:.*<.*Bước 2$/m);
    assert.match(out, /^-:.*>\s+2:.*Bước 2$/m);
  });
});

test('fixture hệ thống: remote, hook, pack, object mồ côi và reachability có đúng trạng thái đã hứa', async () => {
  await withRepo('remote/force-with-lease', async (repo, home) => {
    assert.ok(await exists(path.join(home, 'origin.git')));
    await assert.rejects(git(repo, 'push', '--force-with-lease'), /Không thể chạy lệnh git push/);
    const remoteSubjects = await git(repo, '--git-dir', path.join(home, 'origin.git'), 'log', 'main', '--format=%s');
    assert.match(remoteSubjects, /Commit của đồng đội/);
    assert.doesNotMatch(remoteSubjects, /Commit của tôi/);
  });
  await withRepo('advanced/hooks-automation', async repo => {
    assert.ok(await exists(path.join(repo, '.git', 'hooks', 'pre-commit.sample')));
  });
  await withRepo('daily-workflows/pre-commit-hooks', async repo => {
    assert.ok(await exists(path.join(repo, '.git', 'hooks', 'pre-commit.sample')));
  });
  await withRepo('advanced/partial-clones', async (repo, home) => {
    assert.equal(await git(repo, 'config', 'uploadpack.allowFilter'), 'true');
    const copy = path.join(home, 'ban-sao');
    await git(home, 'clone', '--quiet', '--no-checkout', '--filter=blob:none', `file://${repo.split(path.sep).join('/')}`, copy);
    assert.equal(await git(copy, 'config', 'remote.origin.partialclonefilter'), 'blob:none');
  });
  await withRepo('daily-workflows/maintenance', async repo => {
    const out = await git(repo, '-c', 'core.quotepath=false', 'fsck');
    assert.match(out, /dangling blob/);
  });
  await withRepo('internals/packfiles', async repo => {
    const files = await git(repo, 'count-objects', '-v');
    assert.match(files, /^packs: 1$/m);
    assert.match(files, /^count: 0$/m);
  });
  await withRepo('internals/loose-vs-packed', async repo => {
    const info = await git(repo, 'count-objects', '-v');
    assert.match(info, /^packs: 1$/m);
    assert.doesNotMatch(info, /^count: 0$/m);
  });
  await withRepo('internals/gc-internals', async repo => {
    assert.match(await git(repo, 'count-objects', '-v'), /^in-pack: 0$/m);
  });
  await withRepo('internals/reachability', async repo => {
    assert.match(await git(repo, 'branch', '--format=%(refname:short)'), /giu-lai/);
    assert.match(await git(repo, 'fsck', '--unreachable', '--no-reflogs'), /unreachable commit/);
    assert.doesNotMatch(await git(repo, 'log', '--all', '--format=%s'), /Mồ côi/);
  });
  await withRepo('internals/index-format', async repo => {
    assert.match(await git(repo, 'ls-files', '--stage'), /them-vao-index\.txt/);
    assert.match(await git(repo, 'status', '--porcelain=v1'), /^A  them-vao-index\.txt$/m);
  });
});

test('fixture mô phỏng chỉ chứa tệp giả, không có khóa hay token thật', async () => {
  await withRepo('remote/ssh-keys', async repo => {
    assert.match(await read(repo, 'ssh-demo/id_demo'), /GIA LAP/);
    assert.match(await read(repo, 'ssh-demo/id_demo.pub'), /example\.invalid/);
  });
  await withRepo('remote/personal-access-tokens', async repo => {
    assert.match(await read(repo, '.github/workflows/ci.yml'), /\$\{\{ secrets\.CI_TOKEN \}\}/);
  });
  await withRepo('remote/branch-protection', async repo => {
    assert.match(await read(repo, '.github/branch-protection.json'), /required_status_checks/);
  });
  await withRepo('daily-workflows/husky-lint-staged', async repo => {
    assert.match(await read(repo, 'package.json'), /"lint-staged"/);
    assert.match(await read(repo, '.husky/pre-commit'), /lint-staged/);
    assert.equal(await git(repo, 'diff', '--staged', '--name-only'), 'src/index.js');
  });
  for (const key of ['release-ops/tag-signing', 'release-ops/commit-signing', 'remote/github-cli', 'forensics/filter-repo-surgery']) {
    const [trackId, slug] = key.split('/');
    const exercise = getCourse(trackId).exercises.find(item => item.id === slug);
    assert.equal(exercise.simulated, true, key);
    assert.match(exercise.instructions, /mô phỏng|Bài mô phỏng/i, `${key} phải nói rõ là mô phỏng`);
  }
});

test('bài thực hành nêu rõ vị trí repo bên cạnh, và main khác biệt để phân biệt .. với ...', async () => {
  assert.match(getLab('remote').task, /\{remote\}/);
  assert.match(getLab('addUpstream').task, /\{upstream\}/);
  assert.match(getLab('submodule').task, /\{submodule\}/);
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-review-'));
  try {
    const repo = path.join(home, 'repo');
    await getLab('reviewBranch').setup(repo);
    await git(repo, 'fetch', 'origin', 'feature');
    assert.match(await git(repo, 'diff', '--name-only', 'main..origin/feature'), /main\.txt/);
    assert.equal(await git(repo, 'diff', '--name-only', 'main...origin/feature'), 'feature.txt');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('đáp án tương đương hợp lý được nhận, đáp án sai vẫn bị từ chối', async () => {
  const accept = {
    'foundations/three-trees': ['index', 'staging area', 'Vùng staging'],
    'foundations/head-and-refs': ['git symbolic-ref HEAD', 'git symbolic-ref --short HEAD', 'git rev-parse --abbrev-ref HEAD'],
    'foundations/gitignore': ['.gitignore', 'gitignore'],
    'branching/create-and-switch': ['git switch -c', 'git switch -c moi', 'git checkout -b moi', 'git switch --create moi'],
    'undo/clean-restore': ['git clean -f', 'git clean -fd', 'git clean --force'],
    'undo/detached-head': ['git switch -c', 'git checkout -b moi'],
    'undo/resetting-single-file': ['git restore', 'git restore a.txt', 'git checkout HEAD -- a.txt'],
    'remote/remotes-push-pull': ['git push origin main', 'git push -u origin main', 'git push --set-upstream origin main'],
    'remote/multiple-remotes': ['git remote -v', 'git remote --verbose'],
    'remote/personal-access-tokens': ['secret', 'secrets', 'GitHub Secrets', 'CI secret'],
    'remote/ssh-keys': ['public key', 'khóa công khai', '.pub'],
    'remote/branch-protection': ['required status checks', 'required status check', 'status checks'],
    'remote/github-cli': ['gh pr create', 'gh pr create --fill', 'gh pr create --title "x"'],
    'release-ops/tag-signing': ['-s', '--sign', 'git tag -s v1'],
    'release-ops/commit-signing': ['git log --show-signature', 'git log --show-signature -3', '--show-signature'],
    'release-ops/semver': ['1.3.0', 'v1.3.0'],
    'release-ops/release-branches': ['release/', 'release', 'release/2.0'],
    'advanced/splitting-commit': ['--mixed', 'git reset --mixed HEAD~1', 'mixed'],
    'advanced/hooks-automation': ['pre-commit', 'pre-commit hook'],
    'daily-workflows/perfect-commit': ['git add -p', 'git add -p bai.txt', 'git add --patch'],
    'daily-workflows/conventional-commits': ['feat: them', 'feat: thêm', 'feat:', 'feat(ui): thêm nút'],
    'daily-workflows/long-running-features': ['feature flag', 'feature flags', 'feature toggle'],
    'internals/index-format': ['git ls-files --stage', 'git ls-files -s'],
    'internals/packfiles': ['.pack', 'pack'],
    'internals/gc-internals': ['git gc', 'git gc --aggressive', 'git maintenance run'],
    'internals/loose-vs-packed': ['packfile', 'pack'],
    'internals/reachability': ['ref', 'refs', 'branch'],
    'teamwork/co-authoring': ['Co-authored-by:', 'Co-authored-by: Lan Nguyen <lan@example.invalid>', 'Co-authored-by'],
    'teamwork/documentation-conventions': ['CONTRIBUTING.md', 'CONTRIBUTING'],
    'advanced/squashing-autosquash': ['fixup!', 'fixup! Thêm tính năng'],
    'forensics/filter-repo-surgery': ['thu hồi token', 'Thu hồi token', 'revoke token', 'thu hồi'],
  };
  const reject = {
    'daily-workflows/reviewing-pr-locally': ['git diff main..review/pr', 'git diff main review/pr'],
    'undo/clean-restore': ['git clean'],
    'advanced/splitting-commit': ['git reset --hard'],
    'remote/remotes-push-pull': ['git push origin develop'],
    'daily-workflows/conventional-commits': ['update', 'fix: them'],
    'internals/packfiles': ['.idx'],
    'remote/github-cli': ['gh issue create'],
  };
  for (const [key, answers] of Object.entries(accept)) {
    const [trackId, slug] = key.split('/');
    const exercise = getCourse(trackId).exercises.find(item => item.id === slug);
    for (const answer of answers) assert.equal((await exercise.evaluateAnswer('', answer))[0].pass, true, `${key}: ${answer}`);
  }
  for (const [key, answers] of Object.entries(reject)) {
    const [trackId, slug] = key.split('/');
    const exercise = getCourse(trackId).exercises.find(item => item.id === slug);
    for (const answer of answers) assert.equal((await exercise.evaluateAnswer('', answer))[0].pass, false, `${key}: ${answer}`);
  }
});
