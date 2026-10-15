import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSession, getProgress, getRoadmapProgress, getExerciseInfo, checkExercise, submitAnswer, nextExercise, openExercise, getHint, getSolution, migrateLegacySession, getSession, listCourses, roadmap, registerCourse, getCourse, init, git, read, write } from '../dist/index.js';
import { getLab } from '../dist/labs.js';

test('116 chủ đề có nội dung tiếng Việt và ánh xạ nguồn duy nhất', () => {
  assert.deepEqual(roadmap.map(track => track.lessons.length), [10, 10, 10, 12, 12, 10, 13, 12, 11, 8, 8]);
  assert.equal(roadmap.reduce((sum, track) => sum + track.lessons.length, 0), 116);
  assert.equal(listCourses().length, 11);
  const urls = new Set();
  const ids = new Set();
  for (const track of roadmap) for (const lesson of track.lessons) {
    assert.match(lesson.sourceUrl, new RegExp(`^https://www\\.gitflow\\.dev/learn/${track.id}/`));
    assert.ok(!urls.has(lesson.sourceUrl), lesson.sourceUrl);
    urls.add(lesson.sourceUrl);
    const id = `${track.id}/${lesson.slug}`;
    assert.ok(!ids.has(id), id);
    ids.add(id);
    for (const text of [lesson.title, lesson.concept, lesson.question]) assert.match(text, /[À-ỹ]/u, `${track.id}/${lesson.slug} thiếu nội dung tiếng Việt`);
    assert.ok(lesson.answer.trim());
    const exercise = getCourse(track.id).exercises.find(item => item.id === lesson.slug);
    assert.equal(exercise.sourceUrl, lesson.sourceUrl);
    assert.ok(exercise.hints.length >= 2);
    for (const text of [exercise.concept, exercise.instructions, exercise.expected, ...exercise.hints, exercise.solution]) {
      assert.match(text, /[À-ỹ]/u, `${id} thiếu nội dung học bằng tiếng Việt`);
    }
  }
});

test('các cách làm Git hợp lệ khác nhau đều được chấm theo trạng thái', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-alternates-'));
  try {
    const commitLab = getLab('commit');
    const commitRepo = path.join(home, 'commit', 'repo');
    await commitLab.setup(commitRepo);
    await git(commitRepo, 'add', '--all');
    await git(commitRepo, 'commit', '-m', 'Một cách commit khác');
    assert.ok((await commitLab.validate(commitRepo)).every(item => item.pass));

    const branchLab = getLab('branch');
    const branchRepo = path.join(home, 'branch', 'repo');
    await branchLab.setup(branchRepo);
    await git(branchRepo, 'branch', 'feature/bai-hoc');
    await git(branchRepo, 'switch', 'feature/bai-hoc');
    assert.ok((await branchLab.validate(branchRepo)).every(item => item.pass));

    const restoreLab = getLab('restoreOne');
    const restoreRepo = path.join(home, 'restore', 'repo');
    await restoreLab.setup(restoreRepo);
    await git(restoreRepo, 'checkout', 'HEAD', '--', 'a.txt');
    assert.ok((await restoreLab.validate(restoreRepo)).every(item => item.pass));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('fixture điều tra chứa bằng chứng và metadata Git phải ở trong sandbox', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-sandbox-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    const inspection = getCourse('inspection');
    const renamedRepo = path.join(home, 'renamed', 'repo');
    await inspection.exercises.find(item => item.id === 'file-history-renames').setup(renamedRepo);
    assert.match(await git(renamedRepo, 'log', '--follow', '--format=%s', '--', 'app-renamed.txt'), /Đổi tên tệp ứng dụng/);
    assert.match(await git(renamedRepo, 'log', '--follow', '--format=%s', '--', 'app-renamed.txt'), /Tạo ứng dụng/);
    const secretRepo = path.join(home, 'secret', 'repo');
    await getCourse('forensics').exercises.find(item => item.id === 'finding-leaked-secrets').setup(secretRepo);
    assert.doesNotMatch(await git(secretRepo, 'show', 'HEAD:app.txt'), /TOKEN_DEMO/);
    assert.match(await git(secretRepo, 'log', '-S', 'TOKEN_DEMO', '--format=%s'), /Thêm chuỗi mẫu/);

    const session = await createSession('foundations', { workspaceDir: path.join(home, 'workspaces') });
    const info = await getExerciseInfo({ sessionDir: session.dir });
    await git(info.repo, 'init', '-b', 'main', '--separate-git-dir', path.join(home, 'outside.git'));
    await assert.rejects(checkExercise({ sessionDir: session.dir }), /ngoài sandbox/);
  } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
});

test('mọi bài có thất bại ban đầu, đáp án sai, và cách giải đạt bằng Git thật', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-roadmap-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    for (const track of roadmap) {
      const session = await createSession(track.id, { workspaceDir: path.join(home, 'workspaces') });
      assert.equal((await getProgress({ sessionDir: session.dir }))[0].state, 'available');
      for (const [index, spec] of track.lessons.entries()) {
        const options = { sessionDir: session.dir };
        const info = await getExerciseInfo(options);
        assert.equal(info.id, spec.slug);
        assert.ok(info.concept && info.expected && info.instructions);
        assert.ok((await getHint(options)).text);
        assert.ok((await getSolution(options)).length > 8);
        const initial = await checkExercise(options);
        assert.equal(initial.passed, false, `${track.id}/${spec.slug} đạt ngay từ checkpoint`);
        const wrongAnswer = await submitAnswer('đáp án cố ý sai', options);
        assert.equal(wrongAnswer.passed, false, `${track.id}/${spec.slug} nhận đáp án sai`);
        if (spec.lab) {
          const answerBeforeGit = await submitAnswer(spec.answer, options);
          assert.equal(answerBeforeGit.passed, false, `${track.id}/${spec.slug} bỏ qua thực hành Git`);
          await getLab(spec.lab).solve(info.repo);
        }
        const passed = await submitAnswer(spec.answer, options);
        assert.equal(passed.passed, true, `${track.id}/${spec.slug}: ${JSON.stringify(passed.findings)}`);
        assert.equal((await getProgress(options))[index].state, 'complete');
        const next = await nextExercise(options);
        assert.equal(next?.session.currentExerciseId, track.lessons[index + 1]?.slug);
      }
      const saved = await createSession(track.id, { workspaceDir: path.join(home, 'unused') });
      assert.equal(saved.id, session.id, 'start lại phải tiếp tục phiên cũ');
      const opened = await openExercise(track.lessons[0].slug, { sessionDir: session.dir });
      assert.equal(opened.session.currentExerciseId, track.lessons[0].slug);
      assert.equal((await getProgress({ sessionDir: session.dir }))[0].state, 'complete');
      await write(opened.repo, 'tampered.txt', 'Tệp tạm\n');
      await openExercise(track.lessons[0].slug, { sessionDir: session.dir });
      assert.equal(await read(opened.repo, 'tampered.txt'), undefined, 'mở lại phải khôi phục checkpoint');
    }
    const overall = await getRoadmapProgress();
    assert.equal(overall.reduce((sum, track) => sum + track.completed, 0), 116);
  } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
});

test('nhập phiên v1 đúng một lần và chỉ ghi công bài tương đương', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-migration-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    const oldFundamentals = path.join(home, 'old-fundamentals');
    const oldIntermediate = path.join(home, 'old-intermediate');
    await mkdir(oldFundamentals);
    await mkdir(oldIntermediate);
    const oldA = { version: 1, id: 'old-a', courseId: 'fundamentals', completed: ['status', 'staging', 'commit', 'branch', 'merge'], dir: oldFundamentals };
    const oldB = { version: 1, id: 'old-b', courseId: 'intermediate', completed: ['remote', 'rebase', 'conflict', 'revert'], dir: oldIntermediate };
    await writeFile(path.join(oldFundamentals, 'session.json'), JSON.stringify(oldA));
    await writeFile(path.join(oldIntermediate, 'session.json'), JSON.stringify(oldB));
    const first = await migrateLegacySession(oldFundamentals);
    assert.deepEqual(first.credited.foundations, ['stage-and-commit']);
    assert.deepEqual(first.credited.branching, ['create-and-switch']);
    assert.equal((await migrateLegacySession(oldFundamentals)).alreadyMigrated, true);
    await migrateLegacySession(oldIntermediate);
    const foundations = await createSession('foundations', { workspaceDir: path.join(home, 'workspaces') });
    const branching = await createSession('branching', { workspaceDir: path.join(home, 'workspaces') });
    assert.equal((await getProgress({ sessionDir: foundations.dir })).find(item => item.id === 'stage-and-commit').state, 'complete');
    const branchProgress = await getProgress({ sessionDir: branching.dir });
    for (const id of ['create-and-switch', 'rebase', 'resolving-conflicts']) assert.equal(branchProgress.find(item => item.id === id).state, 'complete');
    assert.equal(branchProgress.find(item => item.id === 'merge-strategies').state, 'available');
    assert.equal((await getSession({ sessionDir: oldFundamentals })).id, foundations.id);
    assert.deepEqual(JSON.parse(await readFile(path.join(oldFundamentals, 'session.json'), 'utf8')), oldA, 'phiên cũ phải giữ nguyên');
  } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
});

test('tự nhận phiên cũ đang hoạt động và giữ API khóa học tùy chỉnh', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-compat-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    const oldDir = path.join(home, 'old');
    await mkdir(oldDir, { recursive: true });
    await mkdir(path.join(home, 'state'));
    const old = { version: 1, id: 'legacy-active', courseId: 'fundamentals', completed: ['staging', 'commit'], dir: oldDir };
    await writeFile(path.join(oldDir, 'session.json'), JSON.stringify(old));
    await writeFile(path.join(home, 'state', 'index.json'), JSON.stringify({ active: oldDir }));
    const resumed = await getSession();
    assert.equal(resumed.courseId, 'foundations');
    assert.equal((await getRoadmapProgress()).find(track => track.id === 'foundations').completed, 1);
    assert.deepEqual(JSON.parse(await readFile(path.join(oldDir, 'session.json'), 'utf8')), old);

    registerCourse({
      id: 'local-course',
      title: 'Khóa thử',
      exercises: [{
        id: 'file',
        title: 'Tạo tệp',
        instructions: 'Tạo tệp check.txt.',
        hints: ['Tạo tệp trong repository.'],
        solution: 'Tạo check.txt.',
        mode: 'state',
        async setup(repo) { await init(repo); },
        async validate(repo) { return [{ pass: await read(repo, 'check.txt') === 'đạt\n', message: 'check.txt cần chứa đạt.' }]; },
      }],
    });
    const custom = await createSession('local-course', { workspaceDir: path.join(home, 'workspaces') });
    assert.equal((await checkExercise({ sessionDir: custom.dir })).passed, false);
    await write(path.join(custom.dir, 'exercises', 'file', 'repo'), 'check.txt', 'đạt\n');
    assert.equal((await checkExercise({ sessionDir: custom.dir })).passed, true);
  } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
});
