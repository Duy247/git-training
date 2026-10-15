import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession, getSession, getProgress, inspectExercise, saveAnswer, checkExercise, registerCourse, git } from '../dist/index.js';

test('kiểm tra trực tiếp không ghi số lần thử hoặc đánh dấu hoàn thành', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-ui-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try {
    const session = await createSession('foundations', { workspaceDir: path.join(home, 'workspaces') });
    const options = { sessionDir: session.dir };
    assert.equal((await inspectExercise(options)).ready, false);
    await git(path.join(session.dir, 'exercises', session.currentExerciseId, 'repo'), 'init', '-b', 'main');
    await saveAnswer('main', options);
    for (let i = 0; i < 3; i++) assert.equal((await inspectExercise(options)).ready, true);
    assert.equal((await getProgress(options))[0].attempts, 0);
    assert.deepEqual((await getSession(options)).completed, []);
    assert.equal((await checkExercise(options)).passed, true);
    assert.equal((await getProgress(options))[0].attempts, 1);
  } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
});

test('đáp án chỉ được lưu cho bài có câu hỏi và không tự Check', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-ui-answer-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  registerCourse({
    id: 'ui-api-test', title: 'Thử giao diện', exercises: [{
      id: 'quiz', title: 'Câu hỏi', instructions: 'Trả lời', hints: ['Gợi ý'], solution: 'đúng', mode: 'answer',
      needsGit: false, setup: async repo => { await mkdir(repo, { recursive: true }); }, validate: async () => [{ pass: true, message: 'Sẵn sàng' }],
      evaluateAnswer: async (_repo, answer) => [{ pass: answer === 'đúng', message: 'Câu trả lời chưa đúng.' }],
    }],
  });
  try {
    const session = await createSession('ui-api-test', { workspaceDir: path.join(home, 'workspaces') });
    const options = { sessionDir: session.dir };
    assert.equal((await inspectExercise(options)).ready, false);
    await saveAnswer('sai', options);
    assert.equal((await inspectExercise(options)).ready, false);
    await saveAnswer('đúng', options);
    assert.equal((await inspectExercise(options)).ready, true);
    assert.equal((await getProgress(options))[0].attempts, 0);
    assert.equal((await readFile(path.join(session.dir, 'session.json'), 'utf8')).includes('đúng'), true);
    assert.equal((await checkExercise(options)).passed, true);
  } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
});

test('lệnh trống trong môi trường không tương tác hiển thị hướng dẫn', () => {
  const result = spawnSync(process.execPath, ['bin/git-training.cjs'], { encoding: 'utf8', env: { ...process.env, GIT_TRAINING_NO_BROWSER: '1' } });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /git-training ui/);
});
