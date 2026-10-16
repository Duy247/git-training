/**
 * Giao diện hướng dẫn (Guided mode): logic thuần để dựng danh sách bước và vẽ màn hình.
 * Tách khỏi terminal để kiểm thử được ở nhiều cỡ cửa sổ.
 */

export type StepId = 'theory' | 'work' | 'answer' | 'check';
export interface StepFlags { theory: boolean; work: boolean }
export interface Finding { pass: boolean; message: string }
export interface StepInputs {
  hasTheory: boolean;
  mode: 'state' | 'answer' | 'hybrid';
  hasQuestion: boolean;
  flags: StepFlags;
  complete: boolean;
  gitPass: boolean;
  answerPass: boolean;
}
export interface Step { id: StepId; number: number; label: string; state: 'done' | 'current' | 'todo' }

const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });
/** Tách theo ký tự người dùng thấy (dấu tiếng Việt dạng tổ hợp vẫn tính là một ô). */
export const graphemes = (text: string): string[] => [...segmenter.segment(text)].map(part => part.segment);
export const cells = (text: string): number => graphemes(text).length;
const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
export const visibleWidth = (text: string): number => cells(stripAnsi(text));

/** Ngắt dòng theo từ, không vượt quá `width` ô; giữ thụt đầu dòng, dòng gạch đầu dòng/đánh số thụt tiếp theo cho thẳng hàng; từ quá dài bị cắt cứng. */
export function wrapText(text: string, width: number): string[] {
  const result: string[] = [];
  const limit = Math.max(4, width);
  const half = Math.floor(limit / 2);
  for (const paragraph of text.split('\n')) {
    const firstPrefix = /^ */.exec(paragraph)![0].slice(0, half);
    const bullet = /^( *(?:\d+\.|[-•·]) +)/.exec(paragraph)?.[1];
    const nextPrefix = bullet ? ' '.repeat(Math.min(bullet.length, half)) : firstPrefix;
    let prefix = firstPrefix;
    let line = '';
    let used = 0;
    const room = () => limit - prefix.length;
    const flush = () => { result.push(prefix + line); line = ''; used = 0; prefix = nextPrefix; };
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const wordCells = cells(word);
      if (line && used + 1 + wordCells > room()) flush();
      if (wordCells > room()) {
        if (line) flush();
        const parts = graphemes(word);
        while (parts.length > room()) { result.push(prefix + parts.splice(0, room()).join('')); prefix = nextPrefix; }
        line = parts.join(''); used = parts.length;
      } else { line += (line ? ' ' : '') + word; used += (used ? 1 : 0) + wordCells; }
    }
    result.push(line ? prefix + line : '');
  }
  return result;
}
/** Ngắt cứng theo ô, giữ nguyên khoảng trắng (dùng cho ô nhập). */
export function hardWrap(text: string, width: number): string[] {
  const parts = graphemes(text);
  const lines: string[] = [];
  const limit = Math.max(4, width);
  do { lines.push(parts.splice(0, limit).join('')); } while (parts.length);
  return lines;
}

export const stepLabels = {
  theory: 'Đọc bài lý thuyết (mở trong trình duyệt)',
  work: 'Làm bài trong thư mục bài tập',
  workLook: 'Xem thử trong thư mục bài tập',
  answer: 'Trả lời câu hỏi',
  check: 'Kiểm tra',
} as const;

/** Danh sách bước của một bài, suy ra từ trạng thái hiện tại; bước hiện tại là bước đầu tiên chưa xong. */
export function buildSteps(input: StepInputs): Step[] {
  const defs: Array<{ id: StepId; label: string; done: boolean }> = [];
  if (input.hasTheory) defs.push({ id: 'theory', label: stepLabels.theory, done: input.complete || input.flags.theory });
  const looksOnly = input.mode === 'answer';
  defs.push({ id: 'work', label: looksOnly ? stepLabels.workLook : stepLabels.work, done: input.complete || input.flags.work || (!looksOnly && input.gitPass) });
  if (input.hasQuestion) defs.push({ id: 'answer', label: stepLabels.answer, done: input.complete || input.answerPass });
  if (!looksOnly) defs.push({ id: 'check', label: stepLabels.check, done: input.complete });
  let currentFound = false;
  return defs.map((def, index) => {
    let state: Step['state'] = 'todo';
    if (def.done) state = 'done';
    else if (!currentFound) { state = 'current'; currentFound = true; }
    return { id: def.id, number: index + 1, label: def.label, state };
  });
}
export const currentStep = (steps: Step[]): StepId | undefined => steps.find(step => step.state === 'current')?.id;

export interface FindingSummary { gitPass: boolean; answerPass: boolean; answerSaved: boolean; missing: string[] }
/** Tách kết quả chấm thành phần thực hành Git và phần đáp án (phần tử cuối nếu bài có câu hỏi). */
export function summarizeFindings(findings: readonly Finding[] | undefined, hasQuestion: boolean, mode: 'state' | 'answer' | 'hybrid', answerSaved: boolean): FindingSummary {
  if (!findings) return { gitPass: false, answerPass: false, answerSaved, missing: [] };
  const git = hasQuestion ? findings.slice(0, -1) : [...findings];
  const answer = hasQuestion ? findings.at(-1) : undefined;
  const gitPass = git.length ? git.every(item => item.pass) : mode === 'answer';
  return { gitPass, answerPass: Boolean(answer?.pass) && answerSaved, answerSaved, missing: git.filter(item => !item.pass).map(item => item.message) };
}
/** Chữ ký ngắn của một kết quả chấm; chỉ vẽ lại khi chữ ký đổi để màn hình không nhấp nháy. */
export const findingsSignature = (findings: readonly Finding[]): string => findings.map(item => `${item.pass ? 1 : 0}:${item.message}`).join('|');

export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Styles {
  bold(text: string): string; head(text: string): string; green(text: string): string; dim(text: string): string;
  hl(text: string): string; sel(text: string): string; warn(text: string): string;
}
export function makeStyles(color: boolean): Styles {
  const wrap = (open: string) => (text: string) => `\x1b[${open}m${text}\x1b[0m`;
  return color ? {
    bold: wrap('1'), head: wrap('1;36'), green: wrap('1;32'), dim: wrap('2'), warn: wrap('33'),
    hl: text => `\x1b[1;38;5;16;48;5;220m ${text} \x1b[0m`, sel: wrap('1;7'),
  } : {
    bold: wrap('1'), head: wrap('1'), green: wrap('1'), dim: text => text, warn: text => text,
    hl: text => `\x1b[1;7m ${text} \x1b[0m`, sel: wrap('1;7'),
  };
}

export interface RenderOptions { width: number; height: number; color: boolean; scroll?: number }
export interface Rendered {
  /** Đúng bằng chiều cao cửa sổ (hoặc ít hơn nếu nội dung ngắn), không dòng nào vượt chiều rộng. */
  lines: string[];
  spinner?: { row: number; col: number };
  scroll: number; maxScroll: number;
}
interface Pieces { body: string[]; focus: [number, number]; notice: string[]; footer: string[]; spinnerLine?: number; spinnerCol?: number }

function compose(pieces: Pieces, options: RenderOptions, style: Styles): Rendered {
  const { body, focus, notice, footer } = pieces;
  const width = options.width;
  const fixedTail = notice.length + footer.length + 1;
  const room = Math.max(1, options.height - fixedTail);
  const maxScroll = Math.max(0, body.length - room);
  let scroll: number;
  if (options.scroll !== undefined) scroll = Math.min(Math.max(0, options.scroll), maxScroll);
  else {
    scroll = Math.max(0, Math.min(maxScroll, focus[1] - room + 1));
    if (focus[0] < scroll) scroll = focus[0];
    scroll = Math.min(scroll, maxScroll);
  }
  const visible = body.slice(scroll, scroll + room);
  const hints = [scroll > 0 ? '▲ PgUp: xem phần trên' : '', scroll < maxScroll ? '▼ PgDn: xem tiếp' : ''].filter(Boolean).join('   ');
  const ruleWidth = Math.min(width - 2, 72);
  let rule = '─'.repeat(ruleWidth);
  if (hints && cells(hints) + 6 <= ruleWidth) rule = `── ${hints} ${'─'.repeat(Math.max(2, ruleWidth - cells(hints) - 4))}`;
  const lines = [...visible];
  while (lines.length < room && body.length <= room) lines.push('');
  lines.push(style.dim(rule), ...notice, ...footer);
  let spinner: Rendered['spinner'];
  if (pieces.spinnerLine !== undefined && pieces.spinnerLine >= scroll && pieces.spinnerLine < scroll + room) spinner = { row: pieces.spinnerLine - scroll + 1, col: pieces.spinnerCol ?? 1 };
  return { lines, spinner, scroll, maxScroll };
}

export interface LessonView {
  courseTitle: string; position: number; total: number; title: string; simulated: boolean;
  task: string; expected: string; question?: string; repo: string;
  steps: Step[]; complete: boolean; hasNext: boolean;
  typing: boolean; input: string; answerNote?: string;
  waiting: boolean; spinner: string; missing: string[]; loading: boolean;
  notice?: string; folderLabel: string; platform: NodeJS.Platform; helpHint: boolean;
}

export function footerFor(view: Pick<LessonView, 'typing' | 'complete' | 'hasNext'>): string {
  if (view.typing) return 'Enter = gửi  •  Tab = giúp  •  Esc = menu  •  Ctrl+C = thoát';
  return `Enter = ${view.complete ? (view.hasNext ? 'bài tiếp theo' : 'hoàn thành') : 'tiếp tục'}  •  H = cần giúp  •  M = menu  •  Q = thoát`;
}

/** Rút gọn đường dẫn dài từ bên trái ("…/tên-bài/repo") để vừa một dòng. */
export function shortPath(file: string, max: number): string {
  if (cells(file) <= max) return file;
  const sep = file.includes('\\') && !file.includes('/') ? '\\' : '/';
  const parts = file.split(/[\\/]/).filter(Boolean);
  let result = parts.at(-1) ?? file;
  for (let index = parts.length - 2; index >= 0; index--) {
    const candidate = `${parts[index]}${sep}${result}`;
    if (cells(`…${sep}${candidate}`) > max) break;
    result = candidate;
  }
  return `…${sep}${result}`;
}
export const shellCommand = (platform: NodeJS.Platform): string => platform === 'win32' ? 'Set-Location (git-training path)' : 'cd "$(git-training path)"';

/** Vẽ màn hình bài học ở chế độ hướng dẫn. */
export function renderLesson(view: LessonView, options: RenderOptions): Rendered {
  const style = makeStyles(options.color);
  const cw = Math.max(20, options.width - 2);
  const compact = options.height <= 24;
  const body: string[] = [];
  const add = (text: string, fn: (value: string) => string = value => value, indent = 0) => {
    for (const line of wrapText(text, cw - indent)) body.push(fn(' '.repeat(indent) + line));
  };
  add(`GIT TRAINING  •  ${view.courseTitle}  •  bài ${view.position}/${view.total}`, style.head);
  add(view.title + (view.simulated ? '  (mô phỏng offline)' : ''), style.bold);
  if (!compact) body.push('');
  add('NHIỆM VỤ', style.dim);
  add(view.task, undefined, 2);
  if (view.expected && !compact) { add('KẾT QUẢ CẦN ĐẠT', style.dim); add(view.expected, undefined, 2); }
  else if (view.expected) { add(`Cần đạt: ${view.expected}`, style.dim, 2); }
  body.push('');
  add('CÁC BƯỚC', style.dim);
  let focusStart = body.length;
  let focusEnd = body.length;
  let spinnerLine: number | undefined;
  let spinnerCol: number | undefined;
  for (const step of view.steps) {
    const mark = step.state === 'done' ? '✓' : step.state === 'current' ? '❯' : '·';
    const text = `${mark} ${step.number}. ${step.label}`;
    const start = body.length;
    if (step.state === 'current') {
      focusStart = body.length;
      add(text, style.bold);
      const detail = (value: string, fn?: (value: string) => string) => add(value, fn, 5);
      if (step.id === 'theory') {
        add('▶ Nhấn ENTER để mở bài lý thuyết (nên đọc trước) ◀', style.hl, 3);
        detail('(→ bỏ qua bước này)', style.dim);
      } else if (step.id === 'work') {
        detail(`Nhấn Enter để mở thư mục bài tập bằng ${view.folderLabel}.`);
        detail(`Hoặc mở một terminal MỚI và gõ: ${shellCommand(view.platform)}`);
        detail(`Thư mục: ${shortPath(view.repo, cw - 5 - 9)}`, style.dim);
        detail('(→ bỏ qua bước này)', style.dim);
      } else if (step.id === 'answer') {
        detail(`Câu hỏi: ${view.question ?? ''}`);
        const cursor = view.typing ? '\u2588' : '';
        const typed = hardWrap(`${view.input}${cursor}`, cw - 5 - 10);
        typed.forEach((part, index) => body.push(`${' '.repeat(5)}${index === 0 ? 'Trả lời: ' : '         '}${style.bold(part)}`));
        if (view.answerNote) detail(view.answerNote, style.warn);
        if (view.helpHint) detail('Bí rồi? Nhấn Tab để xem gợi ý.', style.warn);
      } else if (step.id === 'check') {
        if (view.waiting) {
          spinnerLine = body.length; spinnerCol = 6;
          const label = 'Đang chờ bạn làm xong… (tự động kiểm tra)';
          body.push(`${' '.repeat(5)}${view.spinner} ${cells(label) + 2 <= cw - 5 ? label : 'Đang chờ bạn làm xong…'}`);
        }
        detail(`Terminal mới, gõ: ${shellCommand(view.platform)}`, style.dim);
        if (view.missing.length) { detail('Còn thiếu:'); for (const item of view.missing.slice(0, 3)) add(`· ${item}`, undefined, 7); }
        detail('Enter = kiểm tra lại ngay.', style.dim);
      }
      focusEnd = body.length - 1;
    } else if (step.state === 'done' && step.id === 'work' && !view.complete) {
      add(text, style.green);
      add(`Thư mục: ${shortPath(view.repo, cw - 5 - 9)}`, style.dim, 5);
    } else add(text, step.state === 'done' ? style.green : style.dim);
    void start;
  }
  if (view.loading && !view.complete) { /* đang đọc trạng thái lần đầu */ }
  if (view.complete) {
    focusStart = body.length;
    body.push('');
    add(view.hasNext ? '★ Đã đạt! Nhấn Enter để sang bài tiếp theo.' : '★ Bạn đã hoàn thành chủ đề! Nhấn Enter để tiếp tục.', style.green, 1);
    focusEnd = body.length - 1;
  }
  const notice = view.notice ? wrapText(`▸ ${view.notice}`, cw).map(line => style.warn(line)) : [];
  const footer = wrapText(footerFor(view), cw).map(line => style.dim(line));
  return compose({ body, focus: [focusStart, focusEnd], notice, footer, spinnerLine, spinnerCol }, options, style);
}

export interface InfoView {
  heading?: string; title: string; lines?: string[]; items?: Array<{ label: string; key?: string }>; index?: number;
  footer: string; notice?: string; centerTitle?: boolean;
}
/** Màn hình chung: chào mừng, hoàn thành, menu, trợ giúp. */
export function renderInfo(view: InfoView, options: RenderOptions): Rendered {
  const style = makeStyles(options.color);
  const cw = Math.max(20, options.width - 2);
  const body: string[] = [];
  const add = (text: string, fn: (value: string) => string = value => value, indent = 0) => { for (const line of wrapText(text, cw - indent)) body.push(fn(' '.repeat(indent) + line)); };
  add(view.heading ?? 'GIT TRAINING  •  Luyện Git trên máy', style.head);
  add(view.title, style.bold);
  body.push('');
  for (const line of view.lines ?? []) { if (line === '') body.push(''); else add(line); }
  let focus = 0;
  if (view.items) {
    if (view.lines?.length) body.push('');
    const compactItems = options.height <= 18;
    for (const [index, item] of view.items.entries()) {
      const active = index === view.index;
      const text = `${active ? '❯' : ' '} ${item.key ? `[${item.key.toUpperCase()}] ` : ''}${item.label}`;
      const clipped = graphemes(text).slice(0, cw - 1).join('');
      if (active) focus = body.length;
      body.push(active ? style.sel(` ${clipped} `) : ` ${clipped}`);
    }
    void compactItems;
  }
  const notice = view.notice ? wrapText(`▸ ${view.notice}`, cw).map(line => style.warn(line)) : [];
  const footer = wrapText(view.footer, cw).map(line => style.dim(line));
  return compose({ body, focus: [focus, focus], notice, footer }, options, style);
}

/** Màn hình đọc gợi ý hoặc lời giải (cuộn được). */
export function renderPanel(title: string, text: string, footer: string, options: RenderOptions, notice?: string): Rendered {
  const style = makeStyles(options.color);
  const cw = Math.max(20, options.width - 2);
  const body: string[] = [];
  for (const line of wrapText('GIT TRAINING  •  Cần giúp?', cw)) body.push(style.head(line));
  for (const line of wrapText(title, cw)) body.push(style.bold(line));
  body.push('');
  for (const line of wrapText(text, cw - 2)) body.push(`  ${line}`);
  const noticeLines = notice ? wrapText(`▸ ${notice}`, cw).map(line => style.warn(line)) : [];
  return compose({ body, focus: [0, 0], notice: noticeLines, footer: wrapText(footer, cw).map(line => style.dim(line)) }, options, style);
}

/** Một dòng thân thiện khi trả lời sai (nêu lại câu người học vừa gõ, rút gọn nếu dài). */
export function wrongAnswerNote(tries: number, typed = ''): string {
  const shown = graphemes(typed).length > 30 ? `${graphemes(typed).slice(0, 29).join('')}…` : typed;
  const prefix = shown ? `"${shown}" chưa đúng` : 'Chưa đúng';
  return tries >= 2 ? `${prefix}. Đừng lo, bạn thử lại nhé.` : `${prefix}, bạn thử lại nhé. Đọc lại câu hỏi và gõ ngắn gọn.`;
}
