import readline from 'node:readline';
import { openTheory } from './theory.js';
import { createSession, getExerciseInfo, getHint, getProgress, getRoadmapProgress, getSession, getSolution, inspectExercise, listCourses, nextExercise, openExercise, saveAnswer, checkExercise, type InspectionResult, type ExerciseProgress } from './engine.js';

type Page = 'tracks' | 'lesson' | 'lessons' | 'roadmap';
type Prompt = 'answer' | 'open' | undefined;

function wrap(text: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if (line && [...line, ' ', ...word].length > width) { result.push(line); line = ''; }
      if ([...word].length > width) {
        if (line) { result.push(line); line = ''; }
        const chars = [...word];
        while (chars.length > width) result.push(chars.splice(0, width).join(''));
        line = chars.join('');
      } else line += (line ? ' ' : '') + word;
    }
    result.push(line);
  }
  return result;
}

/** Bảng điều khiển tương tác; mọi thay đổi Git do người học thực hiện ở terminal riêng. */
export async function runUI(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Giao diện cần terminal tương tác. Xem git-training help để dùng lệnh thường.');
  let page: Page = 'tracks';
  let prompt: Prompt;
  let input = '';
  let selected = 0;
  let scroll = 0;
  let sessionDir: string | undefined;
  let notice = '';
  let inspection: InspectionResult | undefined;
  let busy = false;
  let closed = false;
  try { sessionDir = (await getSession()).dir; page = 'lesson'; } catch { /* chưa có phiên */ }

  /** Mở trang lý thuyết của bài hiện tại; trả về đoạn thông báo ngắn (đường dẫn luôn có để tự mở). */
  const theory = async (courseId: string, exerciseId: string, reopen: boolean): Promise<string> => {
    const result = await openTheory(courseId, exerciseId, { reopen });
    if (!result.path) return '';
    return result.opened ? ` Đã mở bài lý thuyết trong trình duyệt: ${result.path}` : ` Bài lý thuyết: ${result.path}`;
  };
  const theoryOfCurrent = async (reopen: boolean): Promise<string> => {
    try { const info = await getExerciseInfo({ sessionDir }); return await theory(info.session.courseId, info.id, reopen); } catch { return ''; }
  };

  const refresh = async () => {
    if (!sessionDir || busy || closed || page !== 'lesson' || prompt) return;
    busy = true;
    try { inspection = await inspectExercise({ sessionDir }); }
    catch (error) { inspection = undefined; notice = (error as Error).message; }
    finally { busy = false; await draw(); }
  };

  const draw = async () => {
    if (closed) return;
    const width = Math.max(32, process.stdout.columns || 80);
    const height = Math.max(12, process.stdout.rows || 24);
    const body: string[] = [];
    const controls: string[] = [];
    const add = (value = '') => body.push(...wrap(value, width - 2));
    const control = (value: string) => controls.push(...wrap(value, width - 2));
    const section = (label: string, value: string) => {
      add(); add(label.toLocaleUpperCase('vi'));
      for (const line of wrap(value, width - 4)) body.push(`  ${line}`);
    };
    const controlPair = (left: string, right: string) => {
      if (width < 52) control(`${left}   ${right}`);
      else controls.push(left.padEnd(27) + right);
    };
    add('GIT TRAINING  •  Luyện Git trên máy');
    add('─'.repeat(Math.min(width - 2, 72)));
    try {
      if (page === 'tracks') {
        add('Chọn track bằng ↑/↓ và Enter:'); add();
        const progress = await getRoadmapProgress();
        for (const [index, course] of listCourses().entries()) {
          const done = progress.find(item => item.id === course.id)?.completed ?? 0;
          add(`${index === selected ? '❯' : ' '} ${course.id} — ${course.title} (${done}/${course.exercises})`);
        }
        control('Enter: bắt đầu hoặc tiếp tục   R: roadmap   Q: thoát');
      } else if (page === 'roadmap') {
        add('Tiến độ toàn bộ roadmap'); add();
        for (const item of await getRoadmapProgress()) add(`${item.id}: ${item.completed}/${item.total} — ${item.title}`);
        control('T: chọn track   B: quay lại bài   Q: thoát');
      } else if (page === 'lessons') {
        add('Bài trong track hiện tại — ↑/↓ để chọn'); add();
        const lessons = await getProgress({ sessionDir });
        selected = Math.min(selected, Math.max(0, lessons.length - 1));
        for (const [index, item] of lessons.entries()) add(`${index === selected ? '❯' : ' '} ${item.state === 'complete' ? '✓' : item.state === 'available' ? '→' : '·'} ${item.id} — ${item.title}`);
        control('Enter: mở bài đã mở khóa (khôi phục checkpoint)   B: quay lại');
      } else if (sessionDir) {
        const info = await getExerciseInfo({ sessionDir });
        const progress = await getProgress({ sessionDir });
        const done = progress.filter(item => item.state === 'complete').length;
        const current = progress.find(item => item.id === info.id);
        add(`${info.session.courseId}  •  ${done}/${progress.length} bài  •  ${info.title}`);
        add(info.simulated ? 'Mô phỏng offline' : 'Thực hành Git');
        section('Nhiệm vụ', info.instructions);
        section('Kết quả cần đạt', info.expected);
        if (info.question) section('Câu hỏi', info.question);
        add(); add(`PHẢN HỒI  •  số lần Check: ${current?.attempts ?? 0}`);
        if (inspection) {
          for (const finding of inspection.findings) add(`  ${finding.pass ? '✓' : '·'} ${finding.message.startsWith('Chưa có câu trả lời.') ? 'Chưa có câu trả lời. Nhấn A để nhập đáp án.' : finding.message}`);
          if (inspection.ready) add('  Sẵn sàng đạt — nhấn C để ghi nhận kết quả.');
        } else add('  Đang đọc trạng thái bài học…');
        section('Repository', info.repo);
        add(process.platform === 'win32' ? '  PowerShell: Set-Location ~; Set-Location (git-training path)' : '  Shell: cd ~ && cd "$(git-training path)"');
        section('Kiến thức', info.concept);
        controlPair('[C] Check', '[A] Trả lời');
        controlPair('[H] Gợi ý', '[S] Lời giải');
        controlPair('[N] Bài sau', '[L] Danh sách bài');
        controlPair('[O] Mở bài', '[T] Chọn track');
        controlPair('[R] Roadmap', '[Q] Thoát');
        control('PgUp / PgDn: cuộn nội dung');
      }
    } catch (error) { add(`Lỗi: ${(error as Error).message}`); control('T: chọn track   Q: thoát'); }
    const tail = ['─'.repeat(Math.min(width - 2, 72)), ...controls, ...(notice ? wrap(`Thông báo: ${notice}`, width - 2) : []), ...(prompt ? wrap(prompt === 'answer' ? `Nhập đáp án: ${input}_` : `Nhập mã bài: ${input}_`, width - 2) : [])];
    const room = Math.max(0, height - tail.length - 1);
    scroll = Math.min(scroll, Math.max(0, body.length - room));
    const visibleBody = body.slice(scroll, scroll + room);
    if (scroll === 0 && visibleBody.length) visibleBody[0] = `\x1b[1;36m${visibleBody[0]}\x1b[0m`;
    const visibleTail = tail.slice(-(height - 1)).map(line => `\x1b[36m${line}\x1b[0m`);
    process.stdout.write(`\x1b[?25${prompt ? 'h' : 'l'}\x1b[H\x1b[2J${[...visibleBody, ...visibleTail].join('\n')}\x1b[0m`);
  };

  const act = async (key: string) => {
    const options = { sessionDir };
    if (key === 'pagedown') { scroll += Math.max(3, (process.stdout.rows || 24) - 6); return; }
    if (key === 'pageup') { scroll = Math.max(0, scroll - Math.max(3, (process.stdout.rows || 24) - 6)); return; }
    const previousPage = page;
    if (page === 'tracks') {
      if (key === 'up' || key === 'k') selected = (selected - 1 + listCourses().length) % listCourses().length;
      if (key === 'down' || key === 'j') selected = (selected + 1) % listCourses().length;
      if (key === 'return') { const course = listCourses()[selected]; if (course) { const session = await createSession(course.id); sessionDir = session.dir; inspection = undefined; page = 'lesson'; notice = (await theoryOfCurrent(false)).trim(); await refresh(); } }
      if (key === 'r') page = 'roadmap';
    } else if (page === 'roadmap') {
      if (key === 't') { selected = 0; page = 'tracks'; }
      if (key === 'b' && sessionDir) page = 'lesson';
    } else if (page === 'lessons') {
      const lessons = await getProgress(options);
      if (key === 'up' || key === 'k') selected = (selected - 1 + lessons.length) % lessons.length;
      if (key === 'down' || key === 'j') selected = (selected + 1) % lessons.length;
      if (key === 'return') {
        const item: ExerciseProgress | undefined = lessons[selected];
        if (item?.state === 'locked') notice = 'Bài này chưa mở khóa.';
        else if (item) { await openExercise(item.id, options); inspection = undefined; page = 'lesson'; notice = `Đã khôi phục checkpoint của ${item.id}.${await theoryOfCurrent(true)}`; await refresh(); }
      }
      if (key === 'b') page = 'lesson';
    } else if (sessionDir) {
      if (key === 'c') { const outcome = await checkExercise(options); inspection = { ready: outcome.passed, findings: outcome.findings, session: outcome.session }; notice = outcome.passed ? 'Đã đạt! Nhấn N để sang bài tiếp theo.' : 'Chưa đạt; xem phản hồi và thử tiếp.'; }
      if (key === 'a') { prompt = 'answer'; input = ''; }
      if (key === 'h') { const hint = await getHint(options); notice = `Gợi ý ${hint.level}/${hint.total}: ${hint.text}`; }
      if (key === 's') notice = `Lời giải: ${await getSolution(options)}`;
      if (key === 'n') { const next = await nextExercise(options); notice = next ? `Đã mở ${next.session.currentExerciseId}.${await theoryOfCurrent(false)}` : 'Đã hoàn thành track!'; inspection = undefined; scroll = 0; await refresh(); }
      if (key === 'l') { selected = 0; page = 'lessons'; }
      if (key === 'o') { prompt = 'open'; input = ''; }
      if (key === 't') { selected = 0; page = 'tracks'; }
      if (key === 'r') page = 'roadmap';
    }
    if (page !== previousPage) scroll = 0;
  };

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write('\x1b[?1049h');
  const timer = setInterval(() => { void refresh(); }, 2000);
  const resize = () => { void draw(); };
  let keyHandler: ((character: string, key: readline.Key) => void) | undefined;
  process.stdout.on('resize', resize);
  try {
    await draw();
    await new Promise<void>(resolve => {
      let queue = Promise.resolve();
      keyHandler = (character: string, key: readline.Key) => {
        queue = queue.then(async () => {
          if (key.ctrl && key.name === 'c' || !prompt && key.name === 'q') { resolve(); return; }
          if (prompt) {
            if (key.name === 'escape') { prompt = undefined; input = ''; }
            else if (key.name === 'backspace') input = [...input].slice(0, -1).join('');
            else if (key.name === 'return') {
              const value = input.trim(); const kind = prompt; prompt = undefined; input = '';
              if (value && kind === 'answer') { await saveAnswer(value, { sessionDir }); notice = 'Đã lưu đáp án. Nhấn C khi sẵn sàng ghi nhận kết quả.'; await refresh(); }
              if (value && kind === 'open') { await openExercise(value, { sessionDir }); inspection = undefined; page = 'lesson'; notice = (await theoryOfCurrent(true)).trim(); await refresh(); }
            } else if (character && !key.ctrl && !key.meta && !/\p{C}/u.test(character)) input += character;
          } else await act(key.name ?? character.toLowerCase());
          await draw();
        }).catch(async error => { notice = (error as Error).message; await draw(); });
      };
      process.stdin.on('keypress', keyHandler);
    });
  } finally {
    closed = true; clearInterval(timer); process.stdout.off('resize', resize);
    if (keyHandler) process.stdin.off('keypress', keyHandler);
    process.stdin.setRawMode(false); process.stdin.pause();
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  }
}
