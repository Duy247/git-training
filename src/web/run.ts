import { openUrl } from './browser.js';
import { startDashboard, type DashboardHandle } from './server.js';
import { truthy } from '../theory.js';

export interface RunWebOptions {
  version: string;
  port?: number;
  /** true: không tự mở trình duyệt, chỉ in đường dẫn. */
  noOpen?: boolean;
  log?: (line: string) => void;
}

/** Số phút không hoạt động thì tự dừng; GIT_TRAINING_IDLE_MINUTES=0 để tắt. */
export function idleMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GIT_TRAINING_IDLE_MINUTES;
  if (raw === undefined || raw.trim() === '') return 120;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 120;
}

/** Chạy bảng học web cho đến khi người dùng nhấn Ctrl+C (hoặc quá thời gian không dùng). */
export async function runWeb(options: RunWebOptions): Promise<DashboardHandle> {
  const log = options.log ?? ((line: string) => console.log(line));
  let resolveStop!: () => void;
  const stopped = new Promise<void>(resolve => { resolveStop = resolve; });
  let handle: DashboardHandle;
  try {
    handle = await startDashboard({ version: options.version, port: options.port, idleMs: idleMinutes() * 60_000, onIdle: () => { log('\nĐã lâu không có ai dùng nên git-training tự dừng. Chạy lại git-training để tiếp tục học.'); resolveStop(); } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new Error(`Cổng ${options.port} đang được dùng. Hãy chọn cổng khác bằng --port hoặc bỏ --port để tự chọn.`);
    throw error;
  }
  log('Git Training đang chạy trên máy của bạn (chỉ mở được từ máy này).');
  log(`\n  ${handle.url}\n`);
  log('Giữ cửa sổ này mở trong lúc học. Nhấn Ctrl+C để dừng.');
  if (options.noOpen || truthy(process.env.GIT_TRAINING_NO_BROWSER)) log('Hãy mở đường dẫn trên bằng trình duyệt của bạn.');
  else {
    const result = await openUrl(handle.url);
    if (result.opened) log('Đã mở trình duyệt. Nếu chưa thấy, hãy sao chép đường dẫn ở trên vào trình duyệt.');
    else log('Chưa tự mở được trình duyệt. Hãy sao chép đường dẫn ở trên vào trình duyệt của bạn.');
  }
  log('Nếu lỡ đóng tab, chỉ cần mở lại đường dẫn trên. Dừng bằng Ctrl+C; tiến độ đã được lưu.');
  const onSignal = () => { log('\nĐang dừng git-training…'); resolveStop(); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  await stopped;
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  await handle.close();
  log('Đã dừng. Hẹn gặp lại!');
  return handle;
}
