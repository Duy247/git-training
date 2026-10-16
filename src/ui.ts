import readline from 'node:readline';
import { openTheory, theoryMessage, theoryPagePath, detectWsl, truthy } from './theory.js';
import { openFolder, folderMessage, fileManagerName } from './explorer.js';
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
  /** Phím của mục đang được tô sáng trong menu bài học (↑/↓ để di chuyển, Enter để chọn). */
  let menuKey = 'v';
  let hasTheory = false;
  /** Gợi ý hoặc lời giải hiển thị ngay trong nội dung để dài cũng cuộn được, không bị cắt ở thanh phím. */
  let panel: { title: string; text: string } | undefined;
  let animating = false;
  let skipEffect = false;
  try { sessionDir = (await getSession()).dir; page = 'lesson'; } catch { /* chưa có phiên */ }

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

  const draw = async () => {
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
        if (animating) { skipEffect = true; return; }
        queue = queue.then(async () => {
          if (key.ctrl && key.name === 'c' || !prompt && key.name === 'q' && (page !== 'lesson' || !sessionDir)) { resolve(); return; }
          if (prompt) {
            if (key.name === 'escape') { prompt = undefined; input = ''; }
            else if (key.name === 'backspace') input = [...input].slice(0, -1).join('');
            else if (key.name === 'return') {
              const value = input.trim(); const kind = prompt; prompt = undefined; input = '';
              if (value && kind === 'answer') { await saveAnswer(value, { sessionDir }); notice = 'Đã lưu đáp án. Nhấn C khi sẵn sàng ghi nhận kết quả.'; await refresh(); }
              if (value && kind === 'open') { await openExercise(value, { sessionDir }); inspection = undefined; panel = undefined; menuKey = 'v'; page = 'lesson'; notice = `Đã mở ${value}. ${theoryHint}`; await refresh(); }
            } else if (character && !key.ctrl && !key.meta && !/\p{C}/u.test(character)) input += character;
          } else if (await act(key.name ?? character.toLowerCase()) === 'quit') { resolve(); return; }
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
