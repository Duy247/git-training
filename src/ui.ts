import readline from 'node:readline';
import { openTheory, theoryMessage, theoryPagePath, detectWsl, truthy } from './theory.js';
import { openFolder, folderMessage, fileManagerName } from './explorer.js';
import { buildSteps, currentStep, findingsSignature, renderInfo, renderLesson, renderPanel, spinnerFrames, summarizeFindings, wrongAnswerNote, graphemes, type Rendered, type StepFlags, type StepId } from './guided.js';
import { createSession, getExerciseInfo, getHint, getProgress, getRoadmapProgress, getSession, getSolution, inspectExercise, listCourses, nextExercise, openExercise, saveAnswer, submitAnswer, checkExercise, type InspectionResult, type ExerciseProgress } from './engine.js';

type Page = 'tracks' | 'lesson' | 'lessons' | 'roadmap' | 'welcome' | 'menu' | 'help' | 'finish' | 'confirm';
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
export interface UIOptions {
  /** true: giữ giao diện đầy đủ cũ (nhiều phím tắt); mặc định dùng giao diện hướng dẫn từng bước. */
  classic?: boolean;
}
export async function runUI(options: UIOptions = {}): Promise<void> {
  const classic = options.classic === true;
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
  /** Phím của mục đang được tô sáng trong menu bài học (↑/↓ để di chuyển, Enter để chọn). */
  let menuKey = 'v';
  let hasTheory = false;
  /** Gợi ý hoặc lời giải hiển thị ngay trong nội dung để dài cũng cuộn được, không bị cắt ở thanh phím. */
  let panel: { title: string; text: string } | undefined;
  let animating = false;
  let skipEffect = false;
  try { sessionDir = (await getSession()).dir; page = classic ? 'lesson' : 'welcome'; } catch { if (!classic) page = 'welcome'; }

  /** Trang lý thuyết KHÔNG tự mở; người học nhấn V (hoặc Enter) để mở. */
  const openCurrentTheory = async (): Promise<string> => {
    const info = await getExerciseInfo({ sessionDir });
    const result = await openTheory(info.session.courseId, info.id, { reopen: true });
    return theoryMessage(result) ?? 'Bài này chưa có trang lý thuyết.';
  };
  const theoryHint = 'Nhấn V để đọc bài lý thuyết trước khi làm.';

  const menuItems = (): Array<{ key: string; label: string }> => [
    ...(hasTheory ? [{ key: 'v', label: 'Mở bài lý thuyết' }] : []),
    { key: 'c', label: 'Check (chấm bài)' }, { key: 'a', label: 'Nhập câu trả lời' },
    { key: 'e', label: `Mở thư mục (${fileManagerName(process.platform, detectWsl())})` },
    { key: 'h', label: 'Gợi ý' }, { key: 's', label: 'Lời giải' }, { key: 'n', label: 'Bài sau' },
    { key: 'l', label: 'Danh sách bài' }, { key: 'o', label: 'Mở bài theo mã' }, { key: 't', label: 'Chọn track' },
    { key: 'r', label: 'Roadmap' }, { key: 'q', label: 'Thoát' },
  ];
  const menuColumns = () => (process.stdout.columns || 80) >= 80 ? 2 : 1;
  const menuIndex = () => Math.max(0, menuItems().findIndex(item => item.key === menuKey));
  /** Cửa sổ thấp thì thu menu về một dòng để vẫn đọc được nội dung bài. */
  const menuCompact = () => Math.ceil(menuItems().length / menuColumns()) + 2 > (process.stdout.rows || 24) * 0.35;
  const moveMenu = (delta: number) => { const items = menuItems(); menuKey = items[(menuIndex() + delta + items.length) % items.length]!.key; };
  const moveMenuColumn = (direction: number) => {
    if (menuCompact()) { moveMenu(direction); return; }
    const items = menuItems(); const rows = Math.ceil(items.length / menuColumns());
    const target = menuIndex() + direction * rows;
    if (menuColumns() > 1 && target >= 0 && target < items.length) menuKey = items[target]!.key;
  };

  const refresh = async () => {
    if (!sessionDir || busy || closed || page !== 'lesson' || prompt) return;
    busy = true;
    try { inspection = await inspectExercise({ sessionDir }); }
    catch (error) { inspection = undefined; notice = (error as Error).message; }
    finally { busy = false; await draw(); }
  };

  const drawClassic = async () => {
    if (closed) return;
    const width = Math.max(32, process.stdout.columns || 80);
    const height = Math.max(12, process.stdout.rows || 24);
    const body: string[] = [];
    const controls: string[] = [];
    const add = (value = '') => body.push(...wrap(value, width - 2));
    const HL = '\u0001';
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
    let theoryBanner = '';
    hasTheory = false;
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
        hasTheory = Boolean(theoryPagePath(info.session.courseId, info.id));
        if (hasTheory) { theoryBanner = '▶ [V] MỞ BÀI LÝ THUYẾT: đọc trước khi làm bài ◀'; body.push(...wrap(theoryBanner, width - 2).map(line => HL + line)); }
        add(info.simulated ? 'Mô phỏng offline' : 'Thực hành Git');
        if (panel) section(panel.title, panel.text);
        section('Nhiệm vụ', info.instructions);
        section('Kết quả cần đạt', info.expected);
        if (info.question) section('Câu hỏi', info.question);
        add(); add(`PHẢN HỒI  •  số lần Check: ${current?.attempts ?? 0}`);
        if (inspection) {
          /** Câu trong finding mô tả điều cần làm nên chỉ hiện khi chưa đạt; mục đã đạt dùng câu xác nhận chung. */
          const shown = new Set<string>();
          for (const [index, finding] of inspection.findings.entries()) {
            const isAnswer = info.mode !== 'state' && index === inspection.findings.length - 1;
            const text = finding.pass ? (isAnswer ? 'Câu trả lời đã đúng.' : 'Phần thực hành Git đã đạt.') : finding.message.startsWith('Chưa có câu trả lời.') ? 'Chưa có câu trả lời. Nhấn A để nhập đáp án.' : finding.message;
            if (finding.pass && shown.has(text)) continue;
            shown.add(text);
            add(`  ${finding.pass ? '✓' : '·'} ${text}`);
          }
          if (current?.state === 'complete') add('  Bài này đã đạt. Chọn "Bài sau" (phím N) để tiếp tục.');
          else if (inspection.ready) add('  Sẵn sàng đạt — chọn Check (phím C) để ghi nhận kết quả.');
        } else add('  Đang đọc trạng thái bài học…');
        section('Repository', info.repo);
        add(process.platform === 'win32' ? '  PowerShell: Set-Location ~; Set-Location (git-training path)' : '  Shell: cd ~ && cd "$(git-training path)"');
        section('Kiến thức', info.concept);
        const items = menuItems();
        if (!items.some(item => item.key === menuKey)) menuKey = items[0]!.key;
        if (menuCompact()) {
          const index = items.findIndex(item => item.key === menuKey);
          const active = items[index]!;
          const text = `‹ ❯ [${active.key.toUpperCase()}] ${active.label}  (${index + 1}/${items.length}) ›`;
          controls.push(`\x1b[1;7m ${[...text].slice(0, width - 4).join('')} \x1b[0m\x1b[36m`);
          control(`Phím tắt: ${items.map(item => item.key.toUpperCase()).join(' ')}  •  ↑/↓ đổi mục, Enter xác nhận, PgUp/PgDn cuộn`);
        } else {
          const columns = menuColumns();
          const rows = Math.ceil(items.length / columns);
          const cell = Math.min(40, Math.floor((width - 2) / columns));
          for (let row = 0; row < rows; row++) {
            let line = '';
            for (let column = 0; column < columns; column++) {
              const item = items[column * rows + row];
              if (!item) continue;
              const active = item.key === menuKey;
              const text = `${active ? '❯' : ' '} [${item.key.toUpperCase()}] ${item.label}`;
              const clipped = [...text].slice(0, cell - 1).join('').padEnd(cell - 1) + ' ';
              line += active ? `\x1b[1;7m${clipped}\x1b[0m\x1b[36m` : item.key === 'v' ? `\x1b[1;38;5;16;48;5;220m${clipped}\x1b[0m\x1b[36m` : clipped;
            }
            controls.push(line);
          }
          control('↑/↓ chọn mục  •  Enter xác nhận  •  nhấn thẳng chữ trong [ ] cũng được  •  PgUp/PgDn cuộn');
        }
      }
    } catch (error) { add(`Lỗi: ${(error as Error).message}`); control('T: chọn track   Q: thoát'); }
    const promptLines = prompt ? wrap(prompt === 'answer' ? `Nhập đáp án: ${input}_` : `Nhập mã bài: ${input}_`, width - 2) : [];
    const tail = ['─'.repeat(Math.min(width - 2, 72)), ...controls, ...(notice ? wrap(`Thông báo: ${notice}`, width - 2) : []), ...promptLines, ...(prompt ? ['Enter: xác nhận   Esc: hủy'] : [])];
    const room = Math.max(0, height - tail.length - 1);
    scroll = Math.min(scroll, Math.max(0, body.length - room));
    const visibleBody = body.slice(scroll, scroll + room);
    if (scroll === 0 && visibleBody.length) visibleBody[0] = `\x1b[1;36m${visibleBody[0]}\x1b[0m`;
    /** Dòng đánh dấu HL (phím mở lý thuyết) in đậm, chữ đen trên nền vàng để người học không bỏ sót. */
    const paint = (line: string, plain: string): string => line.startsWith(HL) ? `\x1b[1;38;5;16;48;5;220m ${line.slice(1)} \x1b[0m` : `${plain}${line}\x1b[0m`;
    for (const [index, line] of visibleBody.entries()) if (line.startsWith(HL)) visibleBody[index] = paint(line, '');
    const visibleTail = tail.slice(-(height - 1)).map(line => paint(line, '\x1b[36m'));
    // Ghi đè từng dòng rồi xóa phần còn lại thay vì xóa cả màn hình, để bảng không nhấp nháy mỗi lần tự làm mới.
    const lines = [...visibleBody, ...visibleTail].map(line => `${line}\x1b[K`);
    process.stdout.write(`\x1b[?25${prompt ? 'h' : 'l'}\x1b[H${lines.join('\n')}\x1b[0m\x1b[J`);
  };

  const effectsEnabled = () => !('NO_COLOR' in process.env) && !truthy(process.env.GIT_TRAINING_NO_EFFECTS) && (process.stdout.columns || 80) >= 40 && (process.stdout.rows || 24) >= 12;
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  /** Pháo hoa cầu vồng khi đạt bài; nhấn phím bất kỳ để bỏ qua. */
  const celebrate = async (title: string, subtitle: string) => {
    if (!effectsEnabled() || closed) return;
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;
    const palette = [196, 202, 208, 214, 220, 226, 190, 154, 118, 82, 46, 48, 51, 45, 39, 33, 27, 57, 93, 129, 165, 201];
    const glyphs = ['*', '+', '.', 'o', '*'];
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: number; glyph: string };
    const sparks: Spark[] = [];
    const rockets = Array.from({ length: 7 }, (_, index) => ({
      x: Math.round(width * (0.15 + Math.random() * 0.7)), top: Math.round(height * (0.12 + Math.random() * 0.35)), start: index * 5 + Math.floor(Math.random() * 3), launched: false,
    }));
    animating = true; skipEffect = false;
    process.stdout.write('\x1b[?25l');
    try {
      for (let frame = 0; frame < 52 && !skipEffect && !closed; frame++) {
        const cells = new Map<string, string>();
        const put = (x: number, y: number, color: number, text: string, bold = false) => {
          const col = Math.round(x); const row = Math.round(y);
          if (col >= 1 && col <= width && row >= 1 && row <= height) cells.set(`${row};${col}`, `\x1b[${row};${col}H\x1b[${bold ? '1;' : ''}38;5;${color}m${text}`);
        };
        for (const rocket of rockets) {
          const age = frame - rocket.start;
          if (age < 0 || rocket.launched) continue;
          const duration = 6;
          if (age < duration) put(rocket.x, height - (height - rocket.top) * (age / duration), 255, '|');
          else {
            rocket.launched = true;
            const base = Math.floor(Math.random() * palette.length);
            for (let index = 0; index < 40; index++) {
              const angle = (index / 40) * Math.PI * 2; const speed = 0.7 + Math.random() * 1.1;
              sparks.push({ x: rocket.x, y: rocket.top, vx: Math.cos(angle) * speed * 2, vy: Math.sin(angle) * speed, life: 16 + Math.floor(Math.random() * 8), color: palette[(base + index) % palette.length]!, glyph: glyphs[index % glyphs.length]! });
            }
          }
        }
        for (const spark of sparks) {
          if (spark.life <= 0) continue;
          spark.x += spark.vx; spark.y += spark.vy; spark.vy += 0.07; spark.life--;
          put(spark.x, spark.y, spark.life < 4 ? 240 : spark.color, spark.life < 4 ? '.' : spark.glyph);
        }
        const row = Math.floor(height / 2);
        const startColumn = Math.max(1, Math.floor((width - [...title].length) / 2));
        [...title].forEach((character, index) => put(startColumn + index, row, palette[(index + frame) % palette.length]!, character, true));
        const subColumn = Math.max(1, Math.floor((width - [...subtitle].length) / 2));
        [...subtitle].forEach((character, index) => put(subColumn + index, row + 2, 250, character));
        process.stdout.write(`\x1b[H\x1b[2J${[...cells.values()].join('')}\x1b[0m`);
        await sleep(70);
      }
    } finally { animating = false; skipEffect = false; }
  };

  const act = async (input: string): Promise<'quit' | undefined> => {
    let key = input;
    const options = { sessionDir };
    // Thông báo của thao tác trước không còn đúng sau khi người học bấm phím mới (trừ khi chỉ di chuyển con trỏ/cuộn).
    if (!['up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end'].includes(key)) notice = '';
    if (page === 'lesson' && sessionDir) {
      if (key === 'up') { moveMenu(-1); return; }
      if (key === 'down') { moveMenu(1); return; }
      if (key === 'left') { moveMenuColumn(-1); return; }
      if (key === 'right') { moveMenuColumn(1); return; }
      if (key === 'return') key = menuKey;
      else if (menuItems().some(item => item.key === key)) menuKey = key;
      if (key === 'q') return 'quit';
    }
    if (key === 'home') { scroll = 0; return; }
    if (key === 'end') { scroll = Number.MAX_SAFE_INTEGER; return; }
    if (key === 'pagedown') { scroll += Math.max(3, (process.stdout.rows || 24) - 6); return; }
    if (key === 'pageup') { scroll = Math.max(0, scroll - Math.max(3, (process.stdout.rows || 24) - 6)); return; }
    const previousPage = page;
    if (page === 'tracks') {
      if (key === 'up' || key === 'k') selected = (selected - 1 + listCourses().length) % listCourses().length;
      if (key === 'down' || key === 'j') selected = (selected + 1) % listCourses().length;
      if (key === 'return') { const course = listCourses()[selected]; if (course) { const session = await createSession(course.id); sessionDir = session.dir; inspection = undefined; panel = undefined; menuKey = 'v'; page = 'lesson'; notice = `Đã mở track. ${theoryHint}`; await refresh(); } }
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
        else if (item) { await openExercise(item.id, options); inspection = undefined; panel = undefined; menuKey = 'v'; page = 'lesson'; notice = `Đã khôi phục checkpoint của ${item.id}. ${theoryHint}`; await refresh(); }
      }
      if (key === 'b') page = 'lesson';
    } else if (sessionDir) {
      if (key === 'c') {
        const currentId = (await getExerciseInfo(options)).id;
        const before = (await getProgress(options)).find(item => item.id === currentId)?.state;
        const outcome = await checkExercise(options);
        inspection = { ready: outcome.passed, findings: outcome.findings, session: outcome.session };
        if (outcome.passed) {
          notice = outcome.nextExerciseId ? 'Đã đạt! Nhấn Enter để sang bài tiếp theo.' : 'Đã hoàn thành cả track!';
          menuKey = outcome.nextExerciseId ? 'n' : 'l';
          if (before !== 'complete') { await celebrate(outcome.nextExerciseId ? '★  CHÚC MỪNG! BẠN ĐÃ ĐẠT BÀI  ★' : '★  HOÀN THÀNH TRACK!  ★', 'Nhấn phím bất kỳ để tiếp tục'); }
        } else notice = 'Chưa đạt; xem mục PHẢN HỒI để biết còn thiếu gì rồi thử lại.';
        scroll = 0;
      }
      if (key === 'a') { prompt = 'answer'; input = ''; }
      if (key === 'h') { const hint = await getHint(options); panel = { title: `Gợi ý ${hint.level}/${hint.total}`, text: hint.text }; notice = hint.level < hint.total ? 'Nhấn H lần nữa để xem gợi ý chi tiết hơn.' : 'Đây là gợi ý cuối cùng.'; scroll = 0; }
      if (key === 's') { panel = { title: 'Lời giải', text: await getSolution(options) }; notice = 'Lời giải hiện ở mục LỜI GIẢI trong nội dung.'; scroll = 0; }
      if (key === 'n') { const next = await nextExercise(options); notice = next ? `Đã mở ${next.session.currentExerciseId}. ${theoryHint}` : 'Đã hoàn thành track!'; inspection = undefined; panel = undefined; menuKey = hasTheory ? 'v' : 'c'; scroll = 0; await refresh(); }
      if (key === 'l') { selected = 0; page = 'lessons'; }
      if (key === 'v') notice = await openCurrentTheory();
      if (key === 'e') { const info = await getExerciseInfo(options); notice = folderMessage(await openFolder(info.repo), process.platform, detectWsl()); }
      if (key === 'o') { prompt = 'open'; input = ''; }
      if (key === 't') { selected = 0; page = 'tracks'; }
      if (key === 'r') page = 'roadmap';
    }
    if (page !== previousPage) scroll = 0;
    return undefined;
  };

  // ───────────────────────── Giao diện hướng dẫn (mặc định) ─────────────────────────
  type Info = Awaited<ReturnType<typeof getExerciseInfo>>;
  let cache: { info: Info; progress: ExerciseProgress[] } | undefined;
  let rendered: Rendered | undefined;
  let scrollManual: number | undefined;
  let spinnerIndex = 0;
  let liveStep: StepId | undefined;
  let livePollable = false;
  let lastSignature = '';
  let answerNote = '';
  let menuSel = 0;
  let menuBack: Page = 'welcome';
  let helpSel = 0;
  let helpConfirm = false;
  let panelKind: 'hint' | 'solution' | undefined;
  let skipReload = false;
  let noticeFromCheck = false;
  let pending = 0;
  let queue: Promise<void> = Promise.resolve();
  const flagsMap = new Map<string, StepFlags>();
  const wrongMap = new Map<string, number>();
  const useColor = () => !('NO_COLOR' in process.env);
  const courseTitle = (id: string) => listCourses().find(course => course.id === id)?.title ?? id;
  const folderLabel = () => fileManagerName(process.platform, detectWsl());

  const enqueue = (task: () => Promise<void>) => {
    pending++;
    queue = queue.then(task).catch(async error => { notice = (error as Error).message; try { await draw(); } catch { /* bỏ qua */ } }).finally(() => { pending--; });
  };

  const typingNow = () => !classic && page === 'lesson' && !panel && !prompt && liveStep === 'answer';

  const guidedMenuItems = (): Array<{ key: string; label: string }> => sessionDir ? [
    { key: 'b', label: 'Quay lại bài học' },
    { key: 'l', label: 'Danh sách bài' },
    { key: 'o', label: 'Mở bài theo mã' },
    { key: 't', label: 'Chọn chủ đề' },
    { key: 'r', label: 'Lộ trình' },
    { key: 'e', label: `Mở thư mục bài tập (${folderLabel()})` },
    { key: 'v', label: 'Mở bài lý thuyết' },
    { key: 'c', label: 'Kiểm tra lại ngay' },
    { key: 'h', label: 'Cần giúp? (gợi ý, lời giải)' },
    { key: 'k', label: 'Làm lại bài này từ đầu' },
    { key: 'q', label: 'Thoát' },
  ] : [
    { key: 'b', label: 'Quay lại' }, { key: 't', label: 'Chọn chủ đề' }, { key: 'r', label: 'Lộ trình' }, { key: 'q', label: 'Thoát' },
  ];

  const flagsFor = (info: Info, attempts: number): StepFlags => {
    const key = `${info.session.courseId}/${info.id}`;
    let flags = flagsMap.get(key);
    if (!flags) { const started = attempts > 0 || info.session.answers[info.id] !== undefined; flags = { theory: started, work: started }; flagsMap.set(key, flags); }
    return flags;
  };

  const lessonModel = async (reload: boolean) => {
    if (reload || !cache) { const info = await getExerciseInfo({ sessionDir }); cache = { info, progress: await getProgress({ sessionDir }) }; }
    const { info, progress } = cache;
    const current = progress.find(item => item.id === info.id);
    const complete = current?.state === 'complete';
    const flags = flagsFor(info, current?.attempts ?? 0);
    const hasQuestion = Boolean(info.question);
    const mode = info.mode as 'state' | 'answer' | 'hybrid';
    const answerSaved = info.session.answers[info.id] !== undefined;
    const summary = summarizeFindings(inspection?.findings, hasQuestion, mode, answerSaved);
    const hasTheory = Boolean(theoryPagePath(info.session.courseId, info.id));
    const steps = buildSteps({ hasTheory, mode, hasQuestion, flags, complete, gitPass: summary.gitPass, answerPass: summary.answerPass });
    liveStep = currentStep(steps);
    livePollable = mode !== 'answer' && !complete;
    const key = `${info.session.courseId}/${info.id}`;
    const index = progress.findIndex(item => item.id === info.id);
    return { info, progress, complete, flags, steps, summary, key, mode, hasQuestion, hasTheory, position: index + 1, hasNext: index >= 0 && index < progress.length - 1 };
  };

  const drawGuided = async (reload = true) => {
    if (closed) return;
    const width = Math.max(32, process.stdout.columns || 80);
    const height = Math.max(10, process.stdout.rows || 24);
    const options = { width, height, color: useColor(), scroll: scrollManual };
    let out: Rendered;
    try {
      if (prompt === 'open') {
        out = renderInfo({ title: 'Mở bài theo mã', lines: ['Gõ mã bài (xem trong "Danh sách bài"), rồi nhấn Enter.', '', `> ${input}\u2588`], footer: 'Enter = mở bài  •  Esc = hủy', notice }, options);
      } else if (page === 'welcome') {
        const lines = ['Học Git bằng cách làm thật, ngay trên máy của bạn.', '', 'Mỗi bài có vài bước đơn giản:', '  1. Đọc bài lý thuyết ngắn.', '  2. Làm bài trong một thư mục bài tập (gõ lệnh git ở cửa sổ terminal khác).', '  3. Màn hình này TỰ nhận khi bạn làm xong, rồi cho bạn sang bài tiếp theo.', ''];
        let footer = 'Enter = bắt đầu  •  M = menu  •  Q = thoát';
        if (sessionDir) {
          const info = await getExerciseInfo({ sessionDir });
          const progress = await getProgress({ sessionDir });
          const done = progress.filter(item => item.state === 'complete').length;
          const position = progress.findIndex(item => item.id === info.id) + 1;
          lines.push(`Bạn đang học: ${courseTitle(info.session.courseId)} — bài ${position}/${progress.length} (đã xong ${done} bài).`);
          footer = 'Enter = tiếp tục học  •  M = menu  •  Q = thoát';
        } else lines.push(`Bạn sẽ bắt đầu với chủ đề: ${listCourses()[0]?.title ?? ''}.`);
        out = renderInfo({ heading: 'GIT TRAINING', title: 'Chào mừng bạn!', lines, footer, notice }, options);
      } else if (page === 'finish') {
        const info = await getExerciseInfo({ sessionDir });
        const progress = await getProgress({ sessionDir });
        const roadmapTotal = await getRoadmapProgress();
        const all = roadmapTotal.reduce((sum, item) => sum + item.completed, 0);
        const every = roadmapTotal.reduce((sum, item) => sum + item.total, 0);
        out = renderInfo({ heading: 'GIT TRAINING', title: '★ CHÚC MỪNG! ★', lines: [`Bạn đã hoàn thành chủ đề "${courseTitle(info.session.courseId)}" (${progress.filter(item => item.state === 'complete').length}/${progress.length} bài).`, `Tiến độ toàn bộ lộ trình: ${all}/${every} bài.`, '', 'Nhấn Enter để chọn chủ đề tiếp theo.'], footer: 'Enter = chọn chủ đề tiếp theo  •  M = menu  •  Q = thoát', notice }, options);
      } else if (page === 'menu') {
        const items = guidedMenuItems();
        menuSel = Math.min(menuSel, items.length - 1);
        out = renderInfo({ title: 'Menu', items, index: menuSel, footer: '↑/↓ chọn  •  Enter = xác nhận  •  hoặc nhấn chữ trong [ ]  •  Esc = quay lại', notice }, options);
      } else if (page === 'help') {
        const info = await getExerciseInfo({ sessionDir });
        const seen = info.session.hintsSeen[info.id] ?? 0;
        const items = helpConfirm
          ? [{ label: 'Có, cho tôi xem lời giải' }, { label: 'Không, quay lại' }]
          : [{ label: `Xem gợi ý (đã xem ${seen})`, key: 'g' }, { label: 'Xem lời giải (nên thử gợi ý trước)', key: 's' }, { label: 'Quay lại bài', key: 'b' }];
        out = renderInfo({ title: 'Cần giúp?', lines: helpConfirm ? ['Lời giải sẽ cho bạn đáp án luôn, nên bạn sẽ bớt được phần thử thách. Xem lời giải thật chứ?'] : ['Gợi ý đi từng chút một; hãy thử gợi ý trước. Lời giải là lựa chọn cuối cùng.'], items, index: helpSel, footer: '↑/↓ chọn  •  Enter = xác nhận  •  Esc = quay lại', notice }, options);
      } else if (page === 'confirm') {
        out = renderInfo({ title: 'Làm lại bài này từ đầu?', lines: ['Thư mục bài tập của bài này sẽ được tạo lại như ban đầu; mọi thay đổi bạn đã làm trong thư mục đó sẽ mất. Tiến độ các bài đã đạt vẫn giữ nguyên.'], items: [{ label: 'Có, làm lại từ đầu' }, { label: 'Không, giữ nguyên' }], index: helpSel, footer: '↑/↓ chọn  •  Enter = xác nhận  •  Esc = quay lại', notice }, options);
      } else if (page === 'tracks') {
        const progress = await getRoadmapProgress();
        const items = listCourses().map(course => { const done = progress.find(item => item.id === course.id)?.completed ?? 0; return { label: `${done >= course.exercises ? '✓ ' : ''}${course.title} (${done}/${course.exercises} bài)` }; });
        selected = Math.min(selected, items.length - 1);
        out = renderInfo({ title: 'Chọn chủ đề', lines: ['Chọn một chủ đề rồi nhấn Enter.'], items, index: selected, footer: '↑/↓ chọn  •  Enter = bắt đầu / tiếp tục  •  Esc = quay lại  •  Q = thoát', notice }, options);
      } else if (page === 'roadmap') {
        const progress = await getRoadmapProgress();
        out = renderInfo({ title: 'Lộ trình học', lines: progress.map(item => `${item.completed}/${item.total} — ${item.title}`), footer: 'T = chọn chủ đề  •  Esc = quay lại  •  Q = thoát', notice }, options);
      } else if (page === 'lessons') {
        const lessons = await getProgress({ sessionDir });
        selected = Math.min(selected, Math.max(0, lessons.length - 1));
        out = renderInfo({ title: 'Danh sách bài trong chủ đề này', lines: ['✓ = đã xong,  → = sẵn sàng,  · = chưa mở'], items: lessons.map(item => ({ label: `${item.state === 'complete' ? '✓' : item.state === 'available' ? '→' : '·'} ${item.title}` })), index: selected, footer: '↑/↓ chọn  •  Enter = mở bài  •  Esc = quay lại', notice }, options);
      } else {
        const model = await lessonModel(reload);
        if (panel) {
          out = renderPanel(panel.title, panel.text, panelKind === 'hint' ? 'Enter/Esc = quay lại bài  •  H = gợi ý tiếp  •  PgUp/PgDn = cuộn' : 'Enter/Esc = quay lại bài  •  PgUp/PgDn = cuộn', options, notice);
        } else {
          const { info, summary } = model;
          const view = {
            courseTitle: courseTitle(info.session.courseId), position: model.position, total: model.progress.length, title: info.title, simulated: info.simulated,
            task: info.task, expected: model.mode === 'answer' ? '' : info.expected.replace(/\s*Đồng thời trả lời câu hỏi kiến thức\.?$/u, ''), question: info.question, repo: info.repo, steps: model.steps, complete: model.complete, hasNext: model.hasNext,
            typing: typingNow(), input, answerNote, waiting: livePollable && liveStep === 'check', spinner: spinnerFrames[spinnerIndex % spinnerFrames.length]!,
            missing: summary.missing, loading: !inspection, notice: notice || undefined, folderLabel: folderLabel(), platform: process.platform,
            helpHint: (wrongMap.get(model.key) ?? 0) >= 2,
          };
          out = renderLesson(view, options);
        }
      }
    } catch (error) {
      out = renderInfo({ title: 'Có lỗi xảy ra', lines: [(error as Error).message], footer: 'M = menu  •  Q = thoát' }, options);
    }
    rendered = out;
    scrollManual = scrollManual === undefined ? undefined : out.scroll;
    process.stdout.write(`\x1b[?25l\x1b[H${out.lines.map(line => `${line}\x1b[K`).join('\n')}\x1b[0m\x1b[J`);
  };
  const draw = async (reload = true) => { if (classic) await drawClassic(); else await drawGuided(reload); };

  /** Chỉ cập nhật ký tự quay của spinner, không vẽ lại cả màn hình. */
  const tickSpinner = () => {
    if (closed || animating || !rendered?.spinner || page !== 'lesson' || panel || prompt) return;
    spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    const { row, col } = rendered.spinner;
    process.stdout.write(`\x1b7\x1b[${row};${col}H${useColor() ? '\x1b[1;36m' : ''}${spinnerFrames[spinnerIndex]}\x1b[0m\x1b8`);
  };

  const finishPass = async (outcome: Awaited<ReturnType<typeof checkExercise>>, before: string | undefined) => {
    inspection = { ready: outcome.passed, findings: outcome.findings, session: outcome.session };
    cache = undefined; answerNote = ''; input = ''; scrollManual = undefined; notice = '';
    const finished = !outcome.nextExerciseId;
    if (before !== 'complete') await celebrate(finished ? '★  HOÀN THÀNH CHỦ ĐỀ!  ★' : '★  CHÚC MỪNG! BẠN ĐÃ ĐẠT BÀI  ★', 'Nhấn phím bất kỳ để tiếp tục');
    if (finished) page = 'finish';
  };

  /** Tự kiểm tra nền: chỉ đọc trạng thái (không tính lần thử); khi đạt thì ghi nhận kết quả mà không tăng số lần Check. */
  const poll = () => {
    if (classic || closed || animating || pending > 0 || page !== 'lesson' || !sessionDir || panel || prompt || !livePollable) return;
    if (liveStep === 'answer' && input.length > 0) return;
    enqueue(async () => {
      if (closed || page !== 'lesson' || panel || prompt || !livePollable || !sessionDir) return;
      if (liveStep === 'answer' && input.length > 0) return;
      let result: Awaited<ReturnType<typeof inspectExercise>>;
      try { result = await inspectExercise({ sessionDir }); }
      catch (error) {
        const message = (error as Error).message;
        const friendly = /đã mất|ngoài sandbox/.test(message) ? 'Thư mục bài tập bị mất hoặc bị đổi. Mở menu (Esc hoặc M) rồi chọn "Làm lại bài này từ đầu".' : message;
        if (notice !== friendly) { notice = friendly; await drawGuided(false); }
        return;
      }
      if (cache && result.session.currentExerciseId !== cache.info.id) { cache = undefined; await drawGuided(); return; }
      if (result.ready) {
        const outcome = await checkExercise({ sessionDir, countAttempt: false });
        await finishPass(outcome, 'auto');
        await drawGuided();
        return;
      }
      const signature = `${result.ready ? 1 : 0}|${findingsSignature(result.findings)}|${Object.keys(result.session.answers).length}`;
      if (signature !== lastSignature) { lastSignature = signature; inspection = result; cache = undefined; if (noticeFromCheck) { notice = ''; noticeFromCheck = false; } await drawGuided(); }
    });
  };

  const openTheoryGuided = async (flags?: StepFlags) => {
    const info = await getExerciseInfo({ sessionDir });
    const result = await openTheory(info.session.courseId, info.id, { reopen: true });
    notice = !result.path ? 'Bài này chưa có trang lý thuyết.' : result.opened ? 'Đã mở bài lý thuyết trong trình duyệt.' : `Không tự mở được trình duyệt. Hãy mở tệp này: ${result.path}`;
    if (flags) flags.theory = true;
  };
  const openFolderGuided = async (flags?: StepFlags) => { const info = await getExerciseInfo({ sessionDir }); const result = await openFolder(info.repo); notice = result.opened ? `Đã mở thư mục bài tập trong ${folderLabel()}.` : `Không tự mở được ${folderLabel()}. Hãy dùng lệnh cd ở bước này.`; if (flags) flags.work = true; };
  const startHelp = (confirm = false) => { helpSel = 0; helpConfirm = confirm; page = 'help'; };
  const startMenu = () => { menuBack = page === 'menu' ? menuBack : page; menuSel = 0; page = 'menu'; };
  const backFromList = () => { page = sessionDir ? 'lesson' : 'welcome'; };

  const showHint = async () => {
    const hint = await getHint({ sessionDir });
    panel = { title: hint.exhausted ? 'Gợi ý' : `Gợi ý ${hint.level}/${hint.total}`, text: hint.text };
    panelKind = 'hint'; page = 'lesson'; scrollManual = 0;
    notice = hint.exhausted ? 'Đã hết gợi ý. Cần nữa thì mở "Cần giúp?" rồi chọn lời giải.' : hint.level < hint.total ? 'Nhấn H để xem gợi ý chi tiết hơn.' : 'Đây là gợi ý cuối cùng.';
  };
  const showSolution = async () => { panel = { title: 'Lời giải', text: await getSolution({ sessionDir }) }; panelKind = 'solution'; page = 'lesson'; helpConfirm = false; scrollManual = 0; notice = 'Đọc xong nhấn Enter để quay lại bài và tự làm theo.'; };

  const manualCheck = async () => {
    const info = await getExerciseInfo({ sessionDir });
    const before = (await getProgress({ sessionDir })).find(item => item.id === info.id)?.state;
    if (info.question && info.session.answers[info.id] === undefined) { notice = 'Bạn chưa trả lời câu hỏi. Hãy gõ câu trả lời ở bước "Trả lời câu hỏi".'; return; }
    const outcome = await checkExercise({ sessionDir });
    inspection = { ready: outcome.passed, findings: outcome.findings, session: outcome.session }; cache = undefined;
    if (outcome.passed) await finishPass(outcome, before);
    else { notice = 'Chưa đạt — xem mục "Còn thiếu" rồi làm tiếp nhé.'; noticeFromCheck = true; }
  };

  const resetExercise = async () => {
    const info = await getExerciseInfo({ sessionDir });
    await openExercise(info.id, { sessionDir });
    flagsMap.set(`${info.session.courseId}/${info.id}`, { theory: true, work: false });
    wrongMap.delete(`${info.session.courseId}/${info.id}`);
    inspection = undefined; cache = undefined; panel = undefined; answerNote = ''; input = ''; lastSignature = ''; scrollManual = undefined;
    page = 'lesson'; await refresh();
    notice = 'Đã tạo lại thư mục bài tập như ban đầu.';
  };
  const goNext = async () => {
    const next = await nextExercise({ sessionDir });
    inspection = undefined; panel = undefined; cache = undefined; answerNote = ''; input = ''; scrollManual = undefined; lastSignature = '';
    if (!next) { page = 'finish'; return; }
    await refresh();
  };

  const submitTyped = async () => {
    const value = input.trim();
    if (!value) { answerNote = 'Hãy gõ câu trả lời rồi nhấn Enter.'; return; }
    const info = await getExerciseInfo({ sessionDir });
    const key = `${info.session.courseId}/${info.id}`;
    const before = (await getProgress({ sessionDir })).find(item => item.id === info.id)?.state;
    const outcome = await submitAnswer(value, { sessionDir });
    inspection = { ready: outcome.passed, findings: outcome.findings, session: outcome.session }; cache = undefined;
    // Trạng thái đúng/sai của đáp án lấy từ chính kết quả vừa chấm, không dùng kết quả cũ.
    if (outcome.findings.at(-1)?.pass) {
      wrongMap.delete(key); answerNote = ''; input = '';
      if (outcome.passed) await finishPass(outcome, before);
      else notice = 'Đáp án đúng! Giờ hãy hoàn thành phần thực hành trong thư mục bài tập; màn hình sẽ tự nhận.';
    } else {
      const tries = (wrongMap.get(key) ?? 0) + 1;
      wrongMap.set(key, tries); answerNote = wrongAnswerNote(tries, value); input = '';
    }
  };

  const scrollKeys = ['pageup', 'pagedown', 'home', 'end', 'up', 'down'];
  const scrollBy = (name: string) => {
    const page_ = Math.max(3, (process.stdout.rows || 24) - 6);
    const base = rendered?.scroll ?? 0; const max = rendered?.maxScroll ?? 0;
    const next = name === 'home' ? 0 : name === 'end' ? max : name === 'pageup' ? base - page_ : name === 'pagedown' ? base + page_ : name === 'up' ? base - 1 : base + 1;
    scrollManual = Math.min(max, Math.max(0, next));
  };

  const runMenuKey = async (key: string): Promise<'quit' | undefined> => {
    if (key === 'q') return 'quit';
    if (key === 'b') { page = menuBack === 'menu' ? 'welcome' : menuBack; if (!sessionDir && page !== 'welcome') page = 'welcome'; return; }
    if (key === 't') { selected = 0; page = 'tracks'; return; }
    if (key === 'r') { page = 'roadmap'; return; }
    if (!sessionDir) return;
    if (key === 'l') { selected = 0; page = 'lessons'; return; }
    if (key === 'o') { prompt = 'open'; input = ''; return; }
    page = 'lesson';
    if (key === 'e') await openFolderGuided((await lessonModel(false)).flags);
    else if (key === 'v') await openTheoryGuided((await lessonModel(false)).flags);
    else if (key === 'c') await manualCheck();
    else if (key === 'h') startHelp();
    else if (key === 'k') { helpSel = 1; page = 'confirm'; }
    return;
  };

  const guidedKey = async (character: string, key: readline.Key): Promise<'quit' | undefined> => {
    const name = key.name ?? character.toLowerCase();
    const scrolling = scrollKeys.includes(name);
    const pageBefore = page;
    const result = await guidedPage(character, key, name, scrolling);
    if (page !== pageBefore) scrollManual = undefined;
    return result;
  };
  const guidedPage = async (character: string, key: readline.Key, name: string, scrolling: boolean): Promise<'quit' | undefined> => {
    if (!scrolling) { notice = ''; noticeFromCheck = false; }
    if (scrolling && (page === 'welcome' || page === 'finish' || page === 'roadmap' || (page === 'help' && !['up', 'down'].includes(name)))) { scrollBy(name); return; }
    if (page === 'welcome') {
      if (name === 'q') return 'quit';
      if (name === 'm') { startMenu(); return; }
      if (name === 'return' || name === 'enter') {
        if (!sessionDir) { const first = listCourses()[0]; if (!first) return; sessionDir = (await createSession(first.id)).dir; }
        inspection = undefined; cache = undefined; page = 'lesson'; await refresh();
      }
      return;
    }
    if (page === 'finish') {
      if (name === 'q') return 'quit';
      if (name === 'm') { startMenu(); return; }
      if (name === 'return' || name === 'enter') { selected = 0; page = 'tracks'; }
      if (name === 'escape' || name === 'b') page = 'lesson';
      return;
    }
    if (page === 'menu') {
      const items = guidedMenuItems();
      if (name === 'up') menuSel = (menuSel - 1 + items.length) % items.length;
      else if (name === 'down') menuSel = (menuSel + 1) % items.length;
      else if (name === 'escape') return runMenuKey('b');
      else if (name === 'return' || name === 'enter') return runMenuKey(items[menuSel]!.key);
      else if (items.some(item => item.key === name)) return runMenuKey(name);
      return;
    }
    if (page === 'confirm') {
      if (name === 'up' || name === 'down') helpSel = 1 - helpSel;
      else if (name === 'escape' || name === 'n') page = 'lesson';
      else if (name === 'return' || name === 'enter' || name === 'y') {
        if (name === 'y' || helpSel === 0) await resetExercise(); else page = 'lesson';
      }
      return;
    }
    if (page === 'help') {
      const count = helpConfirm ? 2 : 3;
      if (name === 'up') helpSel = (helpSel - 1 + count) % count;
      else if (name === 'down') helpSel = (helpSel + 1) % count;
      else if (name === 'escape') { if (helpConfirm) { helpConfirm = false; helpSel = 1; } else page = 'lesson'; }
      else if (name === 'return' || name === 'enter' || (!helpConfirm && ['g', 's', 'b'].includes(name))) {
        const choice = name === 'return' || name === 'enter' ? helpSel : name === 'g' ? 0 : name === 's' ? 1 : 2;
        if (helpConfirm) { if (choice === 0) await showSolution(); else { helpConfirm = false; helpSel = 1; } }
        else if (choice === 0) await showHint();
        else if (choice === 1) { helpConfirm = true; helpSel = 1; }
        else page = 'lesson';
      } else if (helpConfirm && name === 'y') await showSolution();
      else if (helpConfirm && name === 'n') { helpConfirm = false; helpSel = 1; }
      return;
    }
    if (page === 'tracks' || page === 'lessons') {
      const total = page === 'tracks' ? listCourses().length : (await getProgress({ sessionDir })).length;
      if (name === 'escape' || name === 'b') { backFromList(); return; }
      if (name === 'q') return 'quit';
      if (name === 'up' || name === 'k') selected = (selected - 1 + total) % total;
      else if (name === 'down' || name === 'j') selected = (selected + 1) % total;
      else if (name === 'r' && page === 'tracks') page = 'roadmap';
      else if (name === 'return' || name === 'enter') {
        if (page === 'tracks') {
          const course = listCourses()[selected];
          if (course) { sessionDir = (await createSession(course.id)).dir; inspection = undefined; cache = undefined; panel = undefined; lastSignature = ''; page = 'lesson'; await refresh(); }
        } else {
          const item: ExerciseProgress | undefined = (await getProgress({ sessionDir }))[selected];
          if (item?.state === 'locked') notice = 'Bài này chưa mở khóa; hãy làm xong các bài trước.';
          else if (item) { await openExercise(item.id, { sessionDir }); inspection = undefined; cache = undefined; panel = undefined; answerNote = ''; input = ''; lastSignature = ''; page = 'lesson'; await refresh(); }
        }
      }
      return;
    }
    if (page === 'roadmap') {
      if (name === 'q') return 'quit';
      if (name === 't') { selected = 0; page = 'tracks'; }
      if (name === 'escape' || name === 'b') backFromList();
      return;
    }
    // Màn hình bài học
    if (!sessionDir) { page = 'welcome'; return; }
    if (panel) {
      if (name === 'return' || name === 'enter' || name === 'escape') { panel = undefined; panelKind = undefined; scrollManual = undefined; }
      else if (name === 'h' && panelKind === 'hint') await showHint();
      else if (scrolling) scrollBy(name);
      return;
    }
    let model: Awaited<ReturnType<typeof lessonModel>>;
    try { model = await lessonModel(false); }
    catch (error) { if (name === 'q') return 'quit'; if (name === 'm' || name === 'escape') { startMenu(); return; } throw error; }
    const flags = model.flags;
    if (liveStep === 'answer') {
      if (name === 'return' || name === 'enter') await submitTyped();
      else if (name === 'backspace') { input = graphemes(input).slice(0, -1).join(''); answerNote = ''; skipReload = true; }
      else if (name === 'tab') startHelp();
      else if (name === 'escape') startMenu();
      else if (name === 'pageup' || name === 'pagedown' || name === 'home' || name === 'end') scrollBy(name);
      else if (character && !key.ctrl && !key.meta && !/\p{C}/u.test(character)) { input += character; answerNote = ''; skipReload = true; }
      return;
    }
    if (scrolling && !['up', 'down'].includes(name)) { scrollBy(name); return; }
    if (name === 'up' || name === 'down') { scrollBy(name); return; }
    scrollManual = undefined;
    if (name === 'q') return 'quit';
    if (name === 'm') { startMenu(); return; }
    if (name === 'h') { startHelp(); return; }
    if (name === 's') { startHelp(true); return; }
    if (name === 'v') { await openTheoryGuided(flags); return; }
    if (name === 'e') { await openFolderGuided(flags); return; }
    if (name === 'c') { await manualCheck(); return; }
    if (name === 'l' || name === 'o' || name === 't' || name === 'r' || name === 'k') { await runMenuKey(name); return; }
    if (name === 'a' && model.hasQuestion) { flags.theory = true; flags.work = true; return; }
    if (name === 'n') { if (model.complete) await goNext(); else notice = 'Hãy làm xong bài này trước, rồi mới sang bài tiếp theo.'; return; }
    if (name === 'right' && (liveStep === 'theory' || liveStep === 'work')) { flags[liveStep] = true; return; }
    if (name === 'return' || name === 'enter') {
      if (model.complete) await goNext();
      else if (liveStep === 'theory') await openTheoryGuided(flags);
      else if (liveStep === 'work') await openFolderGuided(flags);
      else if (liveStep === 'check') await manualCheck();
    }
  };

  /** Xử lý ô nhập "mở bài theo mã" (dùng chung cho cả hai giao diện). */
  const promptKey = async (character: string, key: readline.Key) => {
    if (key.name === 'escape') { prompt = undefined; input = ''; }
    else if (key.name === 'backspace') input = graphemes(input).slice(0, -1).join('');
    else if (key.name === 'return') {
      const value = input.trim(); const kind = prompt; prompt = undefined; input = '';
      if (value && kind === 'answer') { await saveAnswer(value, { sessionDir }); notice = 'Đã lưu đáp án. Nhấn C khi sẵn sàng ghi nhận kết quả.'; await refresh(); }
      if (value && kind === 'open') { await openExercise(value, { sessionDir }); inspection = undefined; panel = undefined; cache = undefined; menuKey = 'v'; page = 'lesson'; notice = classic ? `Đã mở ${value}. ${theoryHint}` : ''; await refresh(); }
    } else if (character && !key.ctrl && !key.meta && !/\p{C}/u.test(character)) input += character;
  };

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write('\x1b[?1049h');
  const timer = classic ? setInterval(() => { void refresh(); }, 2000) : undefined;
  const pollTimer = classic ? undefined : setInterval(poll, 1500);
  const spinTimer = classic ? undefined : setInterval(tickSpinner, 200);
  const resize = () => { void draw(false); };
  let keyHandler: ((character: string, key: readline.Key) => void) | undefined;
  process.stdout.on('resize', resize);
  try {
    await draw();
    await new Promise<void>(resolve => {
      keyHandler = (character: string, key: readline.Key) => {
        if (key.ctrl && key.name === 'c') { skipEffect = true; resolve(); return; }
        if (animating) { skipEffect = true; return; }
        enqueue(async () => {
          if (key.ctrl && key.name === 'c') { resolve(); return; }
          skipReload = false;
          if (classic) {
            if (!prompt && key.name === 'q' && (page !== 'lesson' || !sessionDir)) { resolve(); return; }
            if (prompt) await promptKey(character, key);
            else if (await act(key.name ?? character.toLowerCase()) === 'quit') { resolve(); return; }
          } else if (prompt) await promptKey(character, key);
          else if (await guidedKey(character, key) === 'quit') { resolve(); return; }
          await draw(!skipReload);
        });
      };
      process.stdin.on('keypress', keyHandler);
    });
  } finally {
    closed = true; if (timer) clearInterval(timer); if (pollTimer) clearInterval(pollTimer); if (spinTimer) clearInterval(spinTimer);
    process.stdout.off('resize', resize);
    if (keyHandler) process.stdin.off('keypress', keyHandler);
    process.stdin.setRawMode(false); process.stdin.pause();
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  }
}
