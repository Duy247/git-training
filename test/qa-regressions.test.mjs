import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkExercise, createSession, getCourse, getExerciseInfo, getSession, git, openExercise, submitAnswer, write } from '../dist/index.js';
import { getLab } from '../dist/labs.js';

async function withRepo(labId, action) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-qa-'));
  const repo = path.join(home, 'repo');
  try {
    const lab = getLab(labId);
    await lab.setup(repo);
    await action(repo, lab);
  } finally { await rm(home, { recursive: true, force: true }); }
}

test('câu trả lời tương đương được nhận, nhưng cờ Git phân biệt chữ hoa', async () => {
  const cases = [
    ['foundations', 'stage-and-commit', 'git add bai.txt'],
    ['foundations', 'stage-and-commit', 'git add -A'],
    ['foundations', 'head-and-refs', 'git symbolic-ref HEAD'],
    ['foundations', 'commit-message-anatomy', 'feat(core):'],
    ['branching', 'create-and-switch', 'git checkout -b feature/bai-hoc'],
    ['branching', 'renaming-branches', '-m'],
    ['branching', 'upstream-tracking', '-u'],
    ['undo', 'stash-as-undo', 'git stash'],
    ['remote', 'prune-stale-branches', 'git remote prune origin'],
    ['remote', 'prune-stale-branches', 'git fetch --prune'],
    ['remote', 'pushing-tags', 'git push --tags'],
    ['release-ops', 'semver', 'v1.3.0'],
    ['release-ops', 'release-branches', 'release/2.0'],
    ['advanced', 'interactive-rebase', 'git rebase -i'],
    ['advanced', 'partial-clones', '--filter=blob:none'],
    ['internals', 'git-directory', '.git/index'],
    ['internals', 'object-database', '.git/objects'],
    ['internals', 'reachability', 'branch'],
    ['internals', 'three-way-merge', 'common ancestor'],
    ['teamwork', 'co-authoring', 'Co-authored-by'],
  ];
  for (const [track, id, answer] of cases) {
    const lesson = getCourse(track).exercises.find(item => item.id === id);
    assert.ok((await lesson.evaluateAnswer('', answer)).every(finding => finding.pass), `${track}/${id}: ${answer}`);
  }
  const branch = getCourse('branching').exercises.find(item => item.id === 'create-and-switch');
  assert.equal((await branch.evaluateAnswer('', 'git switch -C'))[0].pass, false);
});

test('validator nhận các cách giải hợp lệ nêu trong báo cáo', async () => {
  await withRepo('ignore', async repo => {
    await write(repo, '.gitignore', 'local.env\n');
    await git(repo, 'add', '.gitignore');
    await git(repo, 'commit', '-m', 'Bỏ qua cấu hình local');
    assert.ok((await getLab('ignore').validate(repo)).every(finding => finding.pass));
  });
  await withRepo('conflict', async repo => {
    await write(repo, 'loi-chao.txt', 'Topic\r\nMain');
    await git(repo, 'add', 'loi-chao.txt');
    await git(repo, 'commit', '-m', 'Giải quyết');
    assert.ok((await getLab('conflict').validate(repo)).every(finding => finding.pass));
  });
  for (const subject of ['feat(core): thêm bài', 'feat!: thêm bài']) {
    await withRepo('message', async repo => {
      await git(repo, 'add', 'bai.txt');
      await git(repo, 'commit', '-m', subject);
      assert.ok((await getLab('message').validate(repo)).every(finding => finding.pass));
    });
  }
  await withRepo('split', async repo => {
    await git(repo, 'reset', 'HEAD~1');
    for (const file of ['b.txt', 'a.txt']) {
      await git(repo, 'add', file);
      await git(repo, 'commit', '-m', file);
    }
    assert.ok((await getLab('split').validate(repo)).every(finding => finding.pass));
  });
  await withRepo('alias', async repo => {
    await git(repo, 'config', '--local', 'alias.st', 'status -s');
    assert.ok((await getLab('alias').validate(repo)).every(finding => finding.pass));
  });
  await withRepo('config', async repo => {
    await git(repo, 'config', '--local', '--unset', 'user.name');
    assert.equal((await getLab('config').validate(repo))[0].pass, false);
  });
  await withRepo('submodule', async repo => {
    await git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '../module-source', 'modules/sample');
    await git(repo, 'commit', '-m', 'Thêm submodule');
    assert.ok((await getLab('submodule').validate(repo)).every(finding => finding.pass));
  });
});

test('checkpoint thiếu được phục hồi; repository cha chưa được tính là bài init', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-recovery-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    await git(home, 'init', '-b', 'main');
    const session = await createSession('foundations', { workspaceDir: path.join(home, 'practice') });
    const options = { sessionDir: session.dir };
    const initial = await checkExercise(options);
    assert.equal(initial.passed, false);
    assert.match(initial.findings[0].message, /khởi tạo Git/);
    const info = await getExerciseInfo(options);
    await git(info.repo, 'init', '-b', 'main');
    assert.equal((await submitAnswer('main', options)).passed, true);
    await rm(info.repo, { recursive: true, force: true });
    await assert.rejects(checkExercise(options), /git-training open repository-init/);
    await openExercise('repository-init', options);
    await rm(session.dir, { recursive: true, force: true });
    await assert.rejects(getSession(options), /Không tìm thấy dữ liệu học/);
    const fresh = await createSession('foundations', { workspaceDir: path.join(home, 'practice') });
    assert.notEqual(fresh.id, session.id);
  } finally {
    delete process.env.GIT_TRAINING_HOME;
    await rm(home, { recursive: true, force: true });
  }
});

test('các lệnh check chạy đồng thời không làm mất số lần thử', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-concurrent-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    const session = await createSession('foundations', { workspaceDir: path.join(home, 'workspaces') });
    const options = { sessionDir: session.dir };
    await Promise.all(Array.from({ length: 12 }, () => checkExercise(options)));
    assert.equal((await getSession(options)).attempts['repository-init'], 12);
  } finally {
    delete process.env.GIT_TRAINING_HOME;
    await rm(home, { recursive: true, force: true });
  }
});

test('CLI giải thích Git bị thiếu và --dir không thay đổi phiên đang có', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-cli-'));
  const executable = path.resolve('bin', 'git-training.cjs');
  const state = path.join(home, 'state');
  const launch = (args, env = {}) => spawnSync(process.execPath, [executable, ...args], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env: { ...process.env, GIT_TRAINING_HOME: state, GIT_TRAINING_NO_BROWSER: '1', ...env },
  });
  try {
    const missing = launch(['start', 'foundations', '--dir', path.join(home, 'missing-git')], { PATH: '' });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Không tìm thấy Git/);
    const first = launch(['start', 'foundations', '--dir', path.join(home, 'a')]);
    assert.equal(first.status, 0, first.stderr);
    const second = launch(['start', 'foundations', '--dir', path.join(home, 'b')]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /--dir không đổi vị trí/);
    await assert.rejects(stat(path.join(home, 'b')), { code: 'ENOENT' });
    assert.equal(launch(['--version']).stdout.trim(), JSON.parse(await readFile(path.resolve('package.json'), 'utf8')).version);
    assert.match(launch(['courses', 'extra']).stderr, /không nhận đối số/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('đáp án đúng không kèm thông báo "chưa phù hợp"', async () => {
  const course = getCourse('foundations');
  const exercise = course.exercises.find(item => item.id === 'stage-and-commit');
  const answer = (await exercise.evaluateAnswer('', 'git add'))[0];
  assert.equal(answer.pass, true);
  assert.doesNotMatch(answer.message, /chưa phù hợp/);
  const wrong = (await exercise.evaluateAnswer('', 'git zzz'))[0];
  assert.equal(wrong.pass, false);
  assert.match(wrong.message, /chưa phù hợp/);
});
