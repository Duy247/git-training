import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildSteps, currentStep, summarizeFindings, renderLesson, renderInfo, wrapText, shortPath, footerFor, wrongAnswerNote,
  createSession, getSession, getProgress, getExerciseInfo, inspectExercise, checkExercise, saveAnswer, submitAnswer, git,
} from '../dist/index.js';

const base = { hasTheory: true, mode: 'hybrid', hasQuestion: true, flags: { theory: false, work: false }, complete: false, gitPass: false, answerPass: false };
const states = steps => steps.map(step => `${step.id}:${step.state}`).join(' ');

test('các bước: bài thực hành có câu hỏi đi theo thứ tự lý thuyết, làm bài, trả lời, kiểm tra', () => {
  assert.equal(states(buildSteps(base)), 'theory:current work:todo answer:todo check:todo');
  assert.equal(states(buildSteps({ ...base, flags: { theory: true, work: false } })), 'theory:done work:current answer:todo check:todo');
  assert.equal(states(buildSteps({ ...base, flags: { theory: true, work: true } })), 'theory:done work:done answer:current check:todo');
  assert.equal(states(buildSteps({ ...base, flags: { theory: true, work: true }, answerPass: true })), 'theory:done work:done answer:done check:current');
  assert.equal(states(buildSteps({ ...base, flags: { theory: true, work: false }, gitPass: true })), 'theory:done work:done answer:current check:todo');
  const all = buildSteps({ ...base, complete: true });
  assert.equal(states(all), 'theory:done work:done answer:done check:done');
  assert.equal(currentStep(all), undefined);
  assert.deepEqual(buildSteps(base).map(step => step.number), [1, 2, 3, 4]);
});

test('các bước: bài chỉ trả lời không có bước Kiểm tra, bài không lý thuyết bỏ bước 1, bài không câu hỏi bỏ bước trả lời', () => {
  const answerOnly = buildSteps({ ...base, mode: 'answer' });
  assert.deepEqual(answerOnly.map(step => step.id), ['theory', 'work', 'answer']);
  assert.match(answerOnly[1].label, /Xem thử/);
  assert.deepEqual(buildSteps({ ...base, hasTheory: false }).map(step => step.id), ['work', 'answer', 'check']);
  assert.deepEqual(buildSteps({ ...base, mode: 'state', hasQuestion: false, hasTheory: false }).map(step => step.id), ['work', 'check']);
  assert.equal(currentStep(buildSteps({ ...base, mode: 'state', hasQuestion: false, hasTheory: false })), 'work');
});

test('phân tích kết quả chấm: phần Git và đáp án tách riêng, đáp án đúng không bị báo sai', () => {
  const findings = [{ pass: false, message: 'Hãy commit bai.txt.' }, { pass: true, message: 'Đáp án đúng.' }];
  const summary = summarizeFindings(findings, true, 'hybrid', true);
  assert.deepEqual({ gitPass: summary.gitPass, answerPass: summary.answerPass, missing: summary.missing }, { gitPass: false, answerPass: true, missing: ['Hãy commit bai.txt.'] });
  assert.equal(summarizeFindings([{ pass: true, message: 'Đáp án đúng.' }], true, 'answer', true).gitPass, true);
  assert.equal(summarizeFindings([{ pass: false, message: 'Chưa có câu trả lời.' }], true, 'answer', false).answerPass, false);
  assert.equal(summarizeFindings(undefined, true, 'hybrid', false).gitPass, false);
  assert.equal(summarizeFindings([{ pass: true, message: 'ok' }], false, 'state', false).gitPass, true);
});

const sample = (over = {}) => ({
  courseTitle: 'Nền tảng Git', position: 3, total: 10, title: 'Quan sát trạng thái và lịch sử', simulated: false,
  task: 'Trong repo có sẵn ba commit và ba loại thay đổi: bai.txt đã sửa nhưng chưa stage, README.md đã sửa và đã stage, moi.txt là tệp mới chưa được theo dõi. Hãy chạy lệnh Git để khảo sát repo.',
  expected: 'HEAD có bai.txt và có commit mới, working tree sạch.', question: 'Lệnh nào so sánh thay đổi chưa stage với index?',
  repo: '/home/người-học/git-training/0123456789abcdef/exercises/status-log-diff/repo',
  steps: buildSteps({ ...base, flags: { theory: true, work: true } }), complete: false, hasNext: true,
  typing: true, input: 'git diff', waiting: false, spinner: '⠋', missing: [], loading: false,
  folderLabel: 'File Explorer', platform: 'linux', helpHint: false, ...over,
});
const plain = text => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const widthOf = line => [...new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''))].length;

test('màn hình bài học vừa mọi cỡ cửa sổ, không dòng nào vượt chiều rộng và luôn thấy bước hiện tại', () => {
  const variants = [
    sample(), sample({ typing: false, steps: buildSteps({ ...base, flags: { theory: true, work: true }, answerPass: true }), waiting: true, missing: ['Hãy commit bai.txt và giữ working tree sạch, rồi kiểm tra lại.'] }),
    sample({ complete: true, typing: false, steps: buildSteps({ ...base, complete: true }) }), sample({ steps: buildSteps(base), typing: false }),
    sample({ answerNote: '"abc" chưa đúng. Đừng lo, bạn thử lại nhé.', helpHint: true, notice: 'Một thông báo khá dài để kiểm tra việc ngắt dòng ở cửa sổ hẹp.' }),
  ];
  for (const [columns, rows] of [[120, 40], [80, 24], [60, 20], [40, 14], [32, 12]]) {
    for (const color of [true, false]) {
      for (const view of variants) {
        const out = renderLesson(view, { width: columns, height: rows, color });
        assert.ok(out.lines.length <= rows, `${columns}x${rows}: ${out.lines.length} dòng`);
        for (const line of out.lines) assert.ok(widthOf(line) <= columns - 1, `${columns}x${rows} quá rộng: ${JSON.stringify(line)}`);
        const text = out.lines.join('\n');
        assert.match(text, /Enter = /);
        const current = view.steps.find(step => step.state === 'current');
        if (current) assert.match(text, new RegExp(`❯ ${current.number}\\. `), `${columns}x${rows}: không thấy bước hiện tại`);
        if (view.complete) assert.match(text, /Đã đạt/);
        if (!color) assert.doesNotMatch(out.lines.join(''), /\x1b\[[0-9;]*(3[0-9]|4[0-9]|9[0-9])m|38;5/);
      }
    }
  }
});

test('màn hình bài học: chỉ bước hiện tại được mở rộng, câu hỏi chỉ hiện khi tới bước trả lời', () => {
  const early = plain(renderLesson(sample({ steps: buildSteps(base), typing: false }), { width: 100, height: 40, color: false }).lines.join('\n'));
  assert.doesNotMatch(early, /Câu hỏi:/);
  assert.match(early, /bài lý thuyết/);
  assert.match(early, /❯ 1\./);
  const atAnswer = plain(renderLesson(sample(), { width: 100, height: 40, color: false }).lines.join('\n'));
  assert.match(atAnswer, /Câu hỏi: Lệnh nào so sánh/);
  assert.match(atAnswer, /Trả lời: git diff█/);
  assert.doesNotMatch(atAnswer, /Nhấn ENTER để mở bài lý thuyết/);
});

test('bước chờ kiểm tra tự động có spinner và vị trí để chỉ cập nhật ô quay', () => {
  const view = sample({ typing: false, steps: buildSteps({ ...base, flags: { theory: true, work: true }, answerPass: true }), waiting: true });
  const out = renderLesson(view, { width: 80, height: 24, color: false });
  assert.ok(out.spinner);
  assert.match(out.lines[out.spinner.row - 1], /⠋ Đang chờ bạn làm xong/);
  assert.equal(out.lines[out.spinner.row - 1].indexOf('⠋'), out.spinner.col - 1);
});

test('wrapText đếm đúng dấu tiếng Việt dạng tổ hợp và giữ thụt đầu dòng danh sách', () => {
  const decomposed = 'Tiếng Việt có dấu'.normalize('NFD');
  assert.deepEqual(wrapText(decomposed, 8).map(line => line.normalize('NFC')), ['Tiếng', 'Việt có', 'dấu']);
  const lines = wrapText('  1. Làm bài trong một thư mục bài tập rất dài để phải xuống dòng', 30);
  assert.ok(lines.length > 1 && lines[1].startsWith('     '));
  assert.ok(wrapText('x'.repeat(100), 20).every(line => widthOf(line) <= 20));
});

test('shortPath rút gọn từ bên trái và chân dung lệnh theo hệ điều hành', () => {
  assert.equal(shortPath('/a/b/c', 20), '/a/b/c');
  assert.equal(shortPath('/rất/dài/dòng/exercises/status-log-diff/repo', 30), '…/status-log-diff/repo');
  assert.match(shortPath('C:\\Users\\An\\git-training\\x\\exercises\\bai\\repo', 25), /^….*repo$/);
  assert.match(footerFor({ typing: false, complete: false, hasNext: true }), /Enter = tiếp tục.*M = menu.*Q = thoát/);
  assert.match(footerFor({ typing: true, complete: false, hasNext: true }), /Enter = gửi.*Esc = menu/);
  assert.match(wrongAnswerNote(1, 'abc'), /"abc" chưa đúng/);
});

test('màn hình chung (menu) giữ mục được chọn trong vùng nhìn thấy ở cửa sổ thấp', () => {
  const items = Array.from({ length: 30 }, (_, index) => ({ label: `Bài ${index + 1}` }));
  const out = renderInfo({ title: 'Danh sách', items, index: 25, footer: 'Enter = mở' }, { width: 60, height: 12, color: false });
  assert.ok(out.lines.length <= 12);
  assert.match(out.lines.join('\n'), /❯ Bài 26/);
});

async function withHome(run) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'git-training-guided-'));
  process.env.GIT_TRAINING_HOME = path.join(home, 'state');
  try { await run(home); } finally { delete process.env.GIT_TRAINING_HOME; await rm(home, { recursive: true, force: true }); }
}

test('tự kiểm tra nền: đọc trạng thái nhiều lần không tăng số lần thử; khi đạt ghi nhận hoàn thành mà không tính thêm lần thử', async () => {
  await withHome(async home => {
    const session = await createSession('foundations', { workspaceDir: path.join(home, 'ws') });
    const options = { sessionDir: session.dir };
    const id = session.currentExerciseId;
    const repo = path.join(session.dir, 'exercises', id, 'repo');
    await saveAnswer('main', options);
    for (let index = 0; index < 5; index++) assert.equal((await inspectExercise(options)).ready, false);
    await git(repo, 'init', '-b', 'main');
    for (let index = 0; index < 5; index++) assert.equal((await inspectExercise(options)).ready, true);
    assert.equal((await getProgress(options))[0].attempts, 0);
    const outcome = await checkExercise({ ...options, countAttempt: false });
    assert.equal(outcome.passed, true);
    const progress = await getProgress(options);
    assert.equal(progress[0].state, 'complete');
    assert.equal(progress[0].attempts, 0);
    assert.ok(outcome.nextExerciseId);
    // Kiểm tra thủ công vẫn tính một lần thử.
    await checkExercise(options);
    assert.equal((await getProgress(options))[0].attempts, 1);
  });
});

test('nộp đáp án sai tính một lần thử và đáp án đúng không bị báo chưa phù hợp', async () => {
  await withHome(async home => {
    const session = await createSession('foundations', { workspaceDir: path.join(home, 'ws') });
    const options = { sessionDir: session.dir };
    const repo = path.join(session.dir, 'exercises', session.currentExerciseId, 'repo');
    await git(repo, 'init', '-b', 'main');
    const wrong = await submitAnswer('xyz', options);
    assert.equal(wrong.passed, false);
    assert.equal(wrong.findings.at(-1).pass, false);
    const right = await submitAnswer('main', options);
    assert.equal(right.passed, true);
    assert.ok(right.findings.every(finding => finding.pass));
    assert.equal((await getProgress(options))[0].attempts, 2);
    assert.deepEqual((await getSession(options)).completed, ['repository-init']);
  });
});

test('thông tin bài có task không lẫn câu hỏi để giao diện hướng dẫn chỉ hiện câu hỏi ở bước trả lời', async () => {
  await withHome(async home => {
    const session = await createSession('foundations', { workspaceDir: path.join(home, 'ws') });
    const info = await getExerciseInfo({ sessionDir: session.dir });
    assert.ok(info.question);
    assert.ok(!info.task.includes(info.question));
    assert.ok(info.instructions.includes(info.question));
  });
});

test('cờ --classic và GIT_TRAINING_CLASSIC được nhận; không terminal thì vẫn in hướng dẫn', () => {
  for (const [args, env] of [[['--classic'], {}], [[], { GIT_TRAINING_CLASSIC: '1' }]]) {
    const result = spawnSync(process.execPath, ['bin/git-training.cjs', ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--classic/);
  }
  const help = spawnSync(process.execPath, ['bin/git-training.cjs', 'help'], { encoding: 'utf8' });
  assert.match(help.stdout, /từng bước/);
});

function hasScript() { return spawnSync('sh', ['-c', 'command -v script'], { encoding: 'utf8' }).status === 0; }
function drive(args, keys, env) {
  const script = `(sleep 1.5; ${keys.map(key => `printf '${key}'; sleep 0.7`).join('; ')}) | script -qec "stty cols 80 rows 24; node bin/git-training.cjs ${args}" /dev/null`;
  return spawnSync('sh', ['-c', script], { encoding: 'utf8', timeout: 20000, env: { ...process.env, TERM: 'xterm', GIT_TRAINING_NO_BROWSER: '1', GIT_TRAINING_NO_EXPLORER: '1', ...env } });
}

test('giao diện thật: mặc định là chế độ hướng dẫn, --classic giữ bố cục cũ, thoát sạch', { skip: !hasScript() }, async () => {
  await withHome(async home => {
    const env = { HOME: home, GIT_TRAINING_HOME: path.join(home, 'state') };
    delete env.NO_COLOR;
    const guided = drive('', ['\\r', '\\003'], env);
    assert.match(guided.stdout, /Chào mừng/);
    assert.match(guided.stdout, /CÁC BƯỚC/);
    assert.doesNotMatch(guided.stdout, /Check \(chấm bài\)/);
    assert.notEqual(guided.signal, 'SIGTERM', 'tiến trình phải tự thoát khi nhấn Ctrl+C');
    const classic = drive('--classic', ['\\r', '\\r', '\\003'], env);
    assert.match(classic.stdout, /Check \(chấm bài\)/);
    assert.doesNotMatch(classic.stdout, /Chào mừng/);
  });
});
