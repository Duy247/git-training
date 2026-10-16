#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { getCourse } from './courses.js';
import { runUI } from './ui.js';
import { runWeb } from './web/run.js';
import { openTheory, theoryMessage, theoryPagePath, detectWsl, truthy } from './theory.js';
import { openFolder, folderMessage } from './explorer.js';
import { checkExercise, createSession, getExerciseInfo, getHint, getProgress, getRoadmapProgress, getSession, getSolution, listCourses, migrateLegacySession, nextExercise, openExercise, submitAnswer } from './engine.js';

const usage = `git-training — luyện Git bằng repository riêng trên máy của bạn

Cách dùng:
  git-training courses                    Liệt kê 11 track
  git-training                             Mở bảng học trên trình duyệt (chạy ngay trên máy bạn, không cần mạng)
  git-training web [--port <số>] [--no-open]  Như trên; --no-open chỉ in đường dẫn, không tự mở trình duyệt
  git-training --terminal                  Dùng bảng học trong terminal (từng bước, Windows Terminal nếu có)
  git-training ui [--window]               Mở bảng học terminal tại đây hoặc cửa sổ mới
  git-training --classic                   Dùng bảng học terminal đầy đủ kiểu cũ (nhiều phím tắt)
  git-training --version                  Xem phiên bản
  git-training roadmap                    Xem tiến độ toàn bộ roadmap
  git-training start <track> [--dir <nơi-lưu>]
  git-training list                       Xem các bài trong track hiện tại
  git-training status                     Xem bài và thư mục thực hành
  git-training path                       Chỉ in đường dẫn repository hiện tại
  git-training folder                     Mở thư mục thực hành trong File Explorer / Finder / trình quản lý tệp
  git-training hint                       Mở gợi ý tiếp theo
  git-training solution                   Xem lời giải
  git-training answer [đáp-án]           Trả lời câu hỏi; bỏ trống để nhập tương tác
  git-training check                      Kiểm tra trạng thái Git và đáp án
  git-training next                       Mở bài tiếp theo sau khi đạt
  git-training open <mã-bài>              Khôi phục checkpoint bài đã mở khóa
  git-training theory                     MỞ BÀI LÝ THUYẾT của bài hiện tại trong trình duyệt (nên đọc trước khi làm)
  git-training migrate <thư-mục-phiên-cũ> Nhập tiến độ từ phiên v1

Lệnh Git được chạy trong terminal thường của bạn. 'open' tạo lại repository bài đó.
Bảng học trên trình duyệt hướng dẫn từng bước và TỰ kiểm tra bài thực hành; nó chỉ lắng nghe trên máy này (127.0.0.1). Đặt GIT_TRAINING_TERMINAL=1 hoặc dùng --terminal để học trong terminal; GIT_TRAINING_CLASSIC=1 hoặc --classic giữ bố cục terminal cũ.
Trang lý thuyết KHÔNG tự mở. Dùng git-training theory (hoặc phím V trong bảng học) để đọc trước khi làm bài.
Đặt GIT_TRAINING_NO_BROWSER=1 để lệnh theory chỉ in đường dẫn mà không mở trình duyệt.
`;

function show(info: Awaited<ReturnType<typeof getExerciseInfo>>): void {
  console.log(`\n${info.session.courseId} / ${info.id}: ${info.title}`);
  if (info.simulated) console.log('Mô phỏng offline: bài này không truy cập dịch vụ hoặc khóa thật.');
  if (info.concept) console.log(`Kiến thức: ${info.concept}`);
  console.log(`Nhiệm vụ: ${info.instructions}`);
  if (info.expected) console.log(`Kết quả cần đạt: ${info.expected}`);
  if (info.sourceUrl) console.log(`Chủ đề nguồn: ${info.sourceUrl}`);
  if (info.session.completed.length === getCourse(info.session.courseId).exercises.length) console.log('Track này đã hoàn thành; bạn có thể mở lại bài đã đạt để luyện tiếp.');
  console.log(`\nThư mục thực hành: ${info.repo}`);
  console.log(`Chuyển thư mục: cd "${info.repo}"`);
  console.log('Mở thư mục này trong trình quản lý tệp: git-training folder');
  if (info.mode !== 'state') console.log('Gửi câu trả lời bằng git-training answer "<đáp-án>".');
}
function report(result: Awaited<ReturnType<typeof checkExercise>>): void {
  const lesson = getCourse(result.session.courseId).exercises.find(item => item.id === result.session.currentExerciseId);
  if (!result.passed && lesson?.mode === 'hybrid') {
    if (result.findings[0]?.pass) console.log('✓ Phần thực hành Git đã đạt.');
    if (result.findings.at(-1)?.pass) console.log('✓ Câu trả lời đã đúng.');
  }
  for (const finding of result.findings) if (!finding.pass) console.log(`✗ ${finding.message}`);
  if (result.passed) console.log(result.nextExerciseId ? `Đạt! Chạy git-training next để mở ${result.nextExerciseId}.` : 'Đã hoàn thành track!');
  else { console.log('Chưa đạt. Hãy sửa trạng thái Git hoặc câu trả lời rồi thử lại.'); process.exitCode = 1; }
}
async function answerInput(parts: string[]): Promise<string> {
  if (parts.length) return parts.join(' ');
  if (!process.stdin.isTTY) throw new Error('Hãy truyền đáp án sau lệnh answer hoặc chạy trong terminal tương tác.');
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try { return await terminal.question('Đáp án: '); }
  finally { terminal.close(); }
}

async function main(): Promise<void> {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) throw new Error('Cần Node.js 22 trở lên. Hãy cập nhật Node.js rồi chạy lại.');
  const argv = process.argv.slice(2);
  const classic = argv.includes('--classic') || truthy(process.env.GIT_TRAINING_CLASSIC);
  const terminalMode = classic || argv.includes('--terminal') || truthy(process.env.GIT_TRAINING_TERMINAL);
  const noOpen = argv.includes('--no-open');
  const portAt = argv.indexOf('--port');
  let port: number | undefined;
  if (portAt >= 0) {
    port = Number(argv[portAt + 1]);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Dùng --port <số từ 0 đến 65535>.');
  }
  const raw = argv.filter((part, index) => !['--classic', '--terminal', '--no-open'].includes(part) && part !== '--port' && !(portAt >= 0 && index === portAt + 1));
  const manifest = async () => JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const browserFlag = ['start', 'next', 'open'].includes(raw[0] ?? '');
  const [command, argument, ...rest] = browserFlag ? [raw[0]!, ...raw.slice(1).filter(part => part !== '--no-browser')] : raw;
  /** Chỉ nhắc người học có trang lý thuyết; không tự mở trình duyệt. */
  const theory = async (info: { session: { courseId: string }; id: string }) => {
    const page = theoryPagePath(info.session.courseId, info.id);
    if (page) console.log(`\nBài lý thuyết (nên đọc trước khi làm): git-training theory\n  ${page}`);
  };
  const launchWindow = async (): Promise<boolean> => {
    if (process.platform !== 'win32') return false;
    return new Promise(resolve => {
      const child = spawn('wt.exe', ['-w', 'new', 'nt', '--title', 'Git Training', process.execPath, process.argv[1]!, 'ui', ...(classic ? ['--classic'] : [])], { detached: true, stdio: 'ignore', windowsHide: false });
      let settled = false;
      const finish = (opened: boolean) => { if (!settled) { settled = true; resolve(opened); } };
      child.once('error', () => finish(false));
      child.once('exit', code => finish(code === 0));
      child.once('spawn', () => { child.unref(); setTimeout(() => finish(true), 800).unref(); });
    });
  };
  const noExtra = () => { if (argument !== undefined) throw new Error(`Lệnh ${command} không nhận đối số. Xem git-training help.`); };
  switch (command) {
    case undefined: {
      if (!process.stdin.isTTY || !process.stdout.isTTY) { console.log(usage); break; }
      if (!terminalMode) { await runWeb({ version: (await manifest()).version, port, noOpen }); break; }
      if (await launchWindow()) console.log('Đã mở Git Training trong Windows Terminal.');
      else await runUI({ classic });
      break;
    }
    case 'web': {
      if (argument !== undefined) throw new Error('Lệnh web không nhận đối số. Dùng --port <số> hoặc --no-open.');
      await runWeb({ version: (await manifest()).version, port, noOpen });
      break;
    }
    case 'ui': {
      if (argument !== undefined && argument !== '--window' || rest.length) throw new Error('Dùng git-training ui hoặc git-training ui --window.');
      if (argument === '--window' && await launchWindow()) console.log('Đã mở Git Training trong Windows Terminal.');
      else { if (argument === '--window') console.log('Không thể mở cửa sổ mới; dùng terminal hiện tại.'); await runUI({ classic }); }
      break;
    }
    case 'help': case '--help': case '-h': console.log(usage); break;
    case '--version': case 'version': {
      noExtra();
      console.log((await manifest()).version);
      break;
    }
    case 'courses':
      noExtra();
      for (const course of listCourses()) console.log(`${course.id.padEnd(18)} ${course.title} (${course.exercises} bài)`);
      break;
    case 'roadmap': {
      noExtra();
      const tracks = await getRoadmapProgress();
      for (const item of tracks) console.log(`${item.id.padEnd(18)} ${String(item.completed).padStart(2)}/${String(item.total).padStart(2)}  ${item.title}`);
      console.log(`Tổng: ${tracks.reduce((n, item) => n + item.completed, 0)}/${tracks.reduce((n, item) => n + item.total, 0)} bài.`);
      break;
    }
    case 'start': {
      if (!argument) throw new Error('Hãy nhập track. Xem git-training courses.');
      const dirFlag = rest.indexOf('--dir');
      if (rest.length && (dirFlag < 0 || rest.length !== 2 || !rest[dirFlag + 1])) throw new Error('Dùng --dir <nơi-lưu> để chọn thư mục.');
      const session = await createSession(argument, dirFlag >= 0 ? { workspaceDir: path.resolve(rest[dirFlag + 1]!) } : {});
      console.log(`Phiên ${session.id} ở ${session.dir}.`);
      if (dirFlag >= 0 && path.resolve(rest[dirFlag + 1]!) !== path.dirname(session.dir)) console.log('Track này đã có phiên; --dir không đổi vị trí phiên cũ.');
      const info = await getExerciseInfo({ sessionDir: session.dir });
      show(info);
      await theory(info);
      break;
    }
    case 'list': {
      noExtra();
      const session = await getSession();
      console.log(`${session.courseId} (${session.id})`);
      for (const item of await getProgress({ sessionDir: session.dir })) {
        const mark = item.state === 'complete' ? '✓' : item.state === 'available' ? '→' : '·';
        const label = item.state === 'complete' ? 'đã đạt' : item.state === 'available' ? 'sẵn sàng' : 'chưa mở';
        console.log(`${mark} ${item.id.padEnd(28)} ${item.title} [${label}]`);
      }
      break;
    }
    case 'status': noExtra(); show(await getExerciseInfo()); break;
    case 'path': noExtra(); console.log((await getExerciseInfo()).repo); break;
    case 'theory': {
      noExtra();
      const info = await getExerciseInfo();
      const result = await openTheory(info.session.courseId, info.id, { reopen: true });
      console.log(result.path ? theoryMessage(result) : 'Bài này chưa có trang lý thuyết.');
      if (!result.opened) process.exitCode = 1;
      break;
    }
    case 'folder': {
      noExtra();
      const result = await openFolder((await getExerciseInfo()).repo);
      console.log(folderMessage(result, process.platform, detectWsl()));
      if (!result.opened) process.exitCode = 1;
      break;
    }
    case 'hint': {
      noExtra();
      const hint = await getHint();
      console.log(hint.exhausted ? hint.text : `Gợi ý ${hint.level}/${hint.total}: ${hint.text}`);
      break;
    }
    case 'solution': noExtra(); console.log(await getSolution()); break;
    case 'answer': report(await submitAnswer(await answerInput([argument, ...rest].filter((part): part is string => part !== undefined)))); break;
    case 'check': noExtra(); report(await checkExercise()); break;
    case 'next': {
      noExtra();
      const opened = await nextExercise();
      if (!opened) console.log('Đã hoàn thành track!');
      else {
        const info = await getExerciseInfo({ sessionDir: opened.session.dir });
        show(info);
        await theory(info);
      }
      break;
    }
    case 'open': {
      if (!argument) throw new Error('Hãy nhập mã bài. Xem git-training list.');
      if (rest.length) throw new Error('Lệnh open chỉ nhận một mã bài.');
      const opened = await openExercise(argument);
      const info = await getExerciseInfo({ sessionDir: opened.session.dir });
      show(info);
      await theory(info);
      break;
    }
    case 'migrate': {
      if (!argument) throw new Error('Hãy nhập đường dẫn thư mục phiên cũ.');
      if (rest.length) throw new Error('Lệnh migrate chỉ nhận một đường dẫn.');
      const migrated = await migrateLegacySession(argument);
      console.log(migrated.alreadyMigrated ? 'Phiên này đã được nhập trước đó.' : 'Đã nhập tiến độ; dữ liệu cũ được giữ nguyên.');
      for (const [track, ids] of Object.entries(migrated.credited)) if (ids.length) console.log(`${track}: ${ids.join(', ')}`);
      console.log(`Lịch sử cũ: ${migrated.legacyCompleted.join(', ') || 'chưa có bài đạt'}.`);
      break;
    }
    default: throw new Error(`Không có lệnh ${command}. Xem git-training help.`);
  }
}

main().catch(error => { console.error(`git-training: ${(error as Error).message}`); process.exitCode = 1; });
