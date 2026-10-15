# git-training

`git-training` là công cụ luyện Git ngay trên máy. Mỗi bài có repository riêng; bạn dùng terminal thường rồi chạy `git-training check` để xem kết quả. Công cụ không cần quyền quản trị, không ghi lại lệnh bạn gõ và không cần mạng trong lúc học.

## Yêu cầu

- Node.js 22 trở lên và Git 2.28 trở lên trên `PATH`
- Windows, macOS hoặc Linux

## Bắt đầu

Sau khi gói được phát hành:

```sh
npx @duy247/git-training courses
npx @duy247/git-training start foundations
```

Trong bản mã nguồn, chạy `npm install`, `npm run build`, rồi `npm link` để lệnh `git-training` hoạt động từ mọi thư mục. Nếu không muốn link, dùng đường dẫn tuyệt đối đến `dist/cli.js` với `node` cho **mọi** lệnh; `npx @duy247/git-training` chưa dùng được trước khi gói được phát hành. `start` in đường dẫn repository của bài đầu. Chuyển đến đó, thực hành rồi kiểm tra:

Chạy `git-training` không đối số để mở bảng học tiếng Việt. Trên Windows, bảng học mở trong cửa sổ Windows Terminal riêng khi có sẵn; nếu không, nó dùng terminal hiện tại. `git-training ui` luôn mở tại terminal hiện tại, còn `git-training ui --window` yêu cầu cửa sổ riêng trên Windows. Trong bảng học, chọn track bằng phím mũi tên và Enter. Mở một terminal khác để chạy Git trong repository bài tập. Bảng học cập nhật phản hồi khoảng mỗi hai giây; nhấn **C** để ghi nhận bài đạt. Nhấn **A** để nhập đáp án, **H** để xem gợi ý, **S** để xem lời giải, **N** để sang bài tiếp, **L** để chọn bài đã mở khóa, **O** để mở bài theo mã, **T** để đổi track, **R** để xem tiến độ và **Q** để thoát.

Các lệnh thường vẫn hoạt động độc lập với bảng học:

```sh
git status
git-training hint
git-training answer "đáp án của bạn"
git-training check
git-training next
```

Bài chỉ đạt khi cả điều kiện Git và câu trả lời đều đúng. Một số bài chỉ có câu hỏi. `solution` hiển thị lời giải nhưng không tự đánh dấu hoàn thành.

Sau `next`, dùng `git-training path` để lấy riêng đường dẫn repository mới. Trong Bash có thể chạy `cd "$(git-training path)"`; trong PowerShell dùng `Set-Location (git-training path)`. Khi lệnh Git mở editor, cách lưu và thoát phụ thuộc editor bạn đã cấu hình bằng `git config core.editor`.

## 11 track

| Track | Bài | Nội dung |
| --- | ---: | --- |
| `foundations` | 10 | Nền tảng repository, index, commit |
| `branching` | 10 | Nhánh, merge, rebase |
| `inspection` | 10 | Quan sát và truy lỗi |
| `undo` | 12 | Hoàn tác và cứu hộ |
| `remote` | 12 | Remote và cộng tác offline |
| `release-ops` | 10 | Phát hành và tag |
| `advanced` | 13 | Kỹ thuật nâng cao |
| `daily-workflows` | 12 | Công việc hằng ngày |
| `internals` | 11 | Cấu trúc bên trong Git |
| `teamwork` | 8 | Làm việc nhóm |
| `forensics` | 8 | Điều tra lịch sử |

Các track bắt đầu độc lập. Trong mỗi track, bài sau mở khóa khi bài trước đạt. `git-training roadmap` cho biết tiến độ chung. Danh sách chủ đề và liên kết nguồn bám theo [GitFlow roadmap](https://www.gitflow.dev/learn) ngày 15/10/2026; nội dung giảng dạy và bài tập được viết mới bằng tiếng Việt.

## Lệnh CLI

| Lệnh | Chức năng |
| --- | --- |
| `courses` | Liệt kê track. |
| Không đối số | Mở bảng học; trên Windows thử mở cửa sổ riêng. |
| `ui [--window]` | Mở bảng học tại terminal hiện tại hoặc cửa sổ mới trên Windows. |
| `start <track> [--dir <thư-mục>] [--no-browser]` | Tạo phiên mới; mặc định trong `~/git-training`. Mở trang lý thuyết của bài đang hiện. |
| `--version` | Xem phiên bản CLI. |
| `roadmap` | Xem tiến độ cả 11 track. |
| `list` | Xem bài đã đạt, sẵn sàng và chưa mở trong track hiện tại. |
| `status` | Xem khái niệm, nhiệm vụ, kết quả cần đạt và đường dẫn repository. |
| `path` | Chỉ in đường dẫn repository hiện tại. |
| `hint` | Mở gợi ý tiếp theo. |
| `solution` | Xem lời giải. |
| `answer [đáp-án]` | Gửi đáp án; bỏ đối số để nhập trong terminal tương tác. |
| `check` | Kiểm tra Git và đáp án, lưu lần thử, mở khóa bài tiếp theo nếu đạt. |
| `next [--no-browser]` | Mở bài kế sau khi đạt và mở trang lý thuyết của bài đó. |
| `open <mã-bài> [--no-browser]` | Mở lại bài đã mở khóa từ checkpoint và mở lại trang lý thuyết. |
| `migrate <thư-mục-phiên-cũ>` | Nhập tiến độ từ phiên bản hai track cũ. |

`open` tạo lại repository của chính bài đó từ checkpoint và giữ dấu hoàn thành. Dữ liệu phiên nằm ngoài repository bài tập. Từ thư mục phiên, CLI tự tìm phiên; ở nơi khác, CLI dùng phiên hoạt động gần nhất. Biến `GIT_TRAINING_HOME` đổi vị trí lưu chỉ mục và hồ sơ tiến độ. Nếu thư mục phiên bị xóa, `start <track>` tạo phiên mới; nếu chỉ repository bài bị xóa, dùng `open <mã-bài>` để khôi phục.

Bài về GitHub, credential, signing, branch protection, Husky và `git-filter-repo` được ghi rõ là **mô phỏng offline**. Chúng không đăng nhập dịch vụ, ký bằng khóa thật hay viết lại lịch sử thật. Bài remote dùng bare repository cục bộ.

## Trang lý thuyết

Mỗi bài có một trang HTML tiếng Việt giải thích khái niệm trước khi làm (thư mục `theory/<track>/<mã-bài>.html`, chỉ mục ở `theory/index.html`). Khi bạn **mở một bài** bằng `start`, `next`, `open` hoặc bằng bảng học (chọn track, **N**, **O**, hoặc Enter trong danh sách bài), trang của bài đó tự mở trong trình duyệt mặc định. Các lệnh `status`, `list`, `check`, `hint`, `answer`, `solution`... không mở trình duyệt. Mỗi lần mở bài, CLI luôn in một dòng `Bài lý thuyết: <đường dẫn>` (hoặc `Đã mở bài lý thuyết trong trình duyệt: <đường dẫn>`) để bạn tự mở khi cần.

- Windows: `rundll32 url.dll,FileProtocolHandler <file://…>` (không qua `cmd.exe`, nên khoảng trắng, chữ Việt hay `&` trong đường dẫn không gây lỗi). macOS: `open`. Linux: `xdg-open`. WSL: `wslview` nếu có, nếu không thì `rundll32.exe` với đường dẫn Windows.
- Tắt: thêm `--no-browser` cho `start`, `next` hoặc `open`, hoặc đặt biến môi trường `GIT_TRAINING_NO_BROWSER=1` (cũng áp dụng cho bảng học).
- Tự bỏ qua khi có biến `CI`, `NODE_ENV=test`, khi Linux không có `DISPLAY`/`WAYLAND_DISPLAY` (máy chủ không giao diện, SSH). Khi đó chỉ in đường dẫn.
- Chạy hoàn toàn offline: phông chữ Be Vietnam Pro, JetBrains Mono và Mermaid nằm trong `theory/assets/`, trang mở bằng `file://` và không cần mạng hay máy chủ. Gói npm có kèm các trang này.
- Một trang chỉ được mở một lần trong mỗi lần chạy (ví dụ trong bảng học); `open <mã-bài>` do bạn yêu cầu thì luôn mở lại.
- Viết hoặc sửa trang: sửa Markdown trong `theory/src/<track>/<mã-bài>.md` rồi chạy `node theory/build.mjs` để dựng lại HTML (xem `theory/README.md`). Thư mục `theory/src` và các tệp dựng không nằm trong gói npm.

## Chuyển tiến độ cũ

CLI tự nhận diện phiên cũ đang hoạt động. Với phiên ở nơi khác, chạy `git-training migrate <thư-mục-phiên-cũ>`. Việc nhập có thể chạy lại, giữ nguyên repository và tệp phiên cũ. Mọi bài đã đạt xuất hiện trong lịch sử luyện tập; chỉ các kỹ năng khớp chính xác được cộng vào bài mới: staging **cùng** commit, branch, rebase và conflict.

## Node.js API

Gói cung cấp ESM và type definitions:

```js
import {
  createSession, getExerciseInfo, getProgress, getRoadmapProgress,
  submitAnswer, checkExercise, openExercise, nextExercise,
  migrateLegacySession, registerCourse
} from '@duy247/git-training';

const session = await createSession('foundations');
const info = await getExerciseInfo({ sessionDir: session.dir });
console.log(info.concept, info.instructions, info.repo);

// Sau khi người học chạy git init -b main trong repository:
await submitAnswer('main', { sessionDir: session.dir });
const result = await checkExercise({ sessionDir: session.dir });
console.log(result.passed, result.findings);
```

`createSession(track, { workspaceDir? })` tạo phiên. Các hàm khác nhận `{ sessionDir? }`; nếu bỏ qua, chúng tìm phiên như CLI. `getRoadmapProgress()` trả tiến độ từng track. `registerCourse` đăng ký khóa học đáng tin cậy trong tiến trình hiện tại; xem [hướng dẫn viết khóa học](docs/course-authoring.md).

## Phát triển

```sh
npm install
npm test
npm run pack:check
```

Bộ kiểm thử chạy Git thật cho 116 bài. CI chạy trên Windows, macOS và Linux. Phát hành npm là bước riêng sau khi gói được duyệt và kiểm tra lại tên `@duy247/git-training` trên registry.
