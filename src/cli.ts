#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { getCourse } from './courses.js';
import { checkExercise, createSession, getExerciseInfo, getHint, getProgress, getRoadmapProgress, getSession, getSolution, listCourses, migrateLegacySession, nextExercise, openExercise, submitAnswer } from './engine.js';

const usage = `git-training — luyện Git bằng repository riêng trên máy của bạn

Cách dùng:
  git-training courses                    Liệt kê 11 track
  git-training --version                  Xem phiên bản
  git-training roadmap                    Xem tiến độ toàn bộ roadmap
  git-training start <track> [--dir <nơi-lưu>]
  git-training list                       Xem các bài trong track hiện tại
  git-training status                     Xem bài và thư mục thực hành
  git-training path                       Chỉ in đường dẫn repository hiện tại
  git-training hint                       Mở gợi ý tiếp theo
  git-training solution                   Xem lời giải
  git-training answer [đáp-án]           Trả lời câu hỏi; bỏ trống để nhập tương tác
  git-training check                      Kiểm tra trạng thái Git và đáp án
  git-training next                       Mở bài tiếp theo sau khi đạt
  git-training open <mã-bài>              Khôi phục checkpoint bài đã mở khóa
  git-training migrate <thư-mục-phiên-cũ> Nhập tiến độ từ phiên v1

Lệnh Git được chạy trong terminal thường của bạn. 'open' tạo lại repository bài đó.
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
  const [command, argument, ...rest] = process.argv.slice(2);
  const noExtra = () => { if (argument !== undefined) throw new Error(`Lệnh ${command} không nhận đối số. Xem git-training help.`); };
  switch (command) {
    case undefined: case 'help': case '--help': case '-h': console.log(usage); break;
    case '--version': case 'version': {
      noExtra();
      const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
      console.log(manifest.version);
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
      show(await getExerciseInfo({ sessionDir: session.dir }));
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
      else show(await getExerciseInfo({ sessionDir: opened.session.dir }));
      break;
    }
    case 'open': {
      if (!argument) throw new Error('Hãy nhập mã bài. Xem git-training list.');
      if (rest.length) throw new Error('Lệnh open chỉ nhận một mã bài.');
      const opened = await openExercise(argument);
      show(await getExerciseInfo({ sessionDir: opened.session.dir }));
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
