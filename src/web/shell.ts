/** Lệnh `cd` để dán vào terminal, có dấu nháy đúng theo hệ điều hành. */

/** Đường dẫn chứa ký tự mà dấu nháy kép của shell vẫn diễn giải. */
const posixSpecial = /["$`\\!]/;
const powershellSpecial = /[$`"]/;

export function cdCommand(dir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    // PowerShell và cmd đều hiểu cd "đường dẫn". Nếu có $ hoặc dấu huyền thì PowerShell sẽ diễn giải trong nháy kép, nên dùng nháy đơn.
    if (!powershellSpecial.test(dir)) return `cd "${dir}"`;
    return `Set-Location -LiteralPath '${dir.replaceAll("'", "''")}'`;
  }
  if (!posixSpecial.test(dir)) return `cd "${dir}"`;
  return `cd '${dir.replaceAll("'", `'\\''`)}'`;
}

/** Cách mở terminal, viết cho người mới (theo hệ điều hành của máy đang chạy git-training). */
export function terminalHelp(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return 'Nhấn phím Windows, gõ "PowerShell" hoặc "Terminal" rồi nhấn Enter. Một cửa sổ chữ trắng/đen sẽ hiện ra.';
  if (platform === 'darwin') return 'Nhấn Cmd + Dấu cách, gõ "Terminal" rồi nhấn Enter. Một cửa sổ chữ sẽ hiện ra.';
  return 'Mở ứng dụng "Terminal" của máy (thường nhấn Ctrl + Alt + T).';
}
