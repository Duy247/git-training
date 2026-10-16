# git-training

> **Dành cho cán bộ nhân viên MBBank.** Công cụ học tập do tác giả tự xây dựng cho CBNV MBBank; mọi người bên ngoài vẫn dùng tự do (mã nguồn mở, giấy phép MIT). Đây là công cụ do tác giả tự xây dựng, không phải sản phẩm chính thức của MB; màu sắc lấy cảm hứng từ nhận diện của MBBank.

`git-training` là công cụ luyện Git ngay trên máy. Mỗi bài có repository riêng; bạn dùng terminal thường rồi chạy `git-training check` để xem kết quả. Công cụ không cần quyền quản trị, không ghi lại lệnh bạn gõ và không cần mạng trong lúc học.

## Yêu cầu

- Node.js 22 trở lên và Git 2.28 trở lên trên `PATH`
- Windows, macOS hoặc Linux

## Bắt đầu

Gói đã có trên npm (`@duy247/git-training@0.1.0`). Cần Node.js 22 trở lên:

```sh
npx @duy247/git-training courses
npx @duy247/git-training start foundations
```

Trong bản mã nguồn, chạy `npm install`, `npm run build`, rồi `npm link` để lệnh `git-training` hoạt động từ mọi thư mục. Nếu không muốn link, dùng đường dẫn tuyệt đối đến `dist/cli.js` với `node` cho **mọi** lệnh. `start` in đường dẫn repository của bài đầu. Chuyển đến đó, thực hành rồi kiểm tra:

Chạy `git-training` không đối số để mở **bảng học trên trình duyệt** (xem [Bảng học trên trình duyệt](#bảng-học-trên-trình-duyệt)). Công cụ mở một trang web chạy ngay trên máy bạn (không cần mạng): trang liệt kê các bước của bài, hiện bài lý thuyết ngay cạnh nhiệm vụ và **tự nhận** khi bạn làm xong trong thư mục bài tập. Giữ cửa sổ terminal đang chạy `git-training` mở trong lúc học, rồi mở một terminal khác để gõ lệnh Git. Muốn học hoàn toàn trong terminal, chạy `git-training --terminal` (hoặc đặt `GIT_TRAINING_TERMINAL=1`); `git-training --classic` giữ bố cục terminal đầy đủ kiểu cũ với nhiều phím tắt.

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
| Không đối số, hoặc `web [--port <số>] [--no-open]` | Mở bảng học trên trình duyệt (máy chủ cục bộ). `--no-open` chỉ in đường dẫn; `--port` chọn cổng (mặc định tự chọn cổng trống). Cần chạy trong terminal tương tác; `web` chạy được ở mọi nơi. |
| `--terminal` | Dùng bảng học trong terminal (chế độ hướng dẫn từng bước); trên Windows thử mở Windows Terminal riêng. Hoặc đặt `GIT_TRAINING_TERMINAL=1`. |
| `--classic` | Bảng học terminal kiểu cũ với đầy đủ menu và phím tắt (hoặc đặt `GIT_TRAINING_CLASSIC=1`). Dùng được cùng `ui`. |
| `ui [--window]` | Mở bảng học terminal tại terminal hiện tại hoặc cửa sổ mới trên Windows. |
| `start <track> [--dir <thư-mục>]` | Tạo phiên mới; mặc định trong `~/git-training`. Chỉ in đường dẫn trang lý thuyết, không tự mở. |
| `--version` | Xem phiên bản CLI. |
| `roadmap` | Xem tiến độ cả 11 track. |
| `list` | Xem bài đã đạt, sẵn sàng và chưa mở trong track hiện tại. |
| `status` | Xem khái niệm, nhiệm vụ, kết quả cần đạt và đường dẫn repository. |
| `path` | Chỉ in đường dẫn repository hiện tại. |
| `hint` | Mở gợi ý tiếp theo. |
| `solution` | Xem lời giải. |
| `answer [đáp-án]` | Gửi đáp án; bỏ đối số để nhập trong terminal tương tác. |
| `check` | Kiểm tra Git và đáp án, lưu lần thử, mở khóa bài tiếp theo nếu đạt. |
| `next` | Mở bài kế sau khi đạt. |
| `open <mã-bài>` | Mở lại bài đã mở khóa từ checkpoint. |
| `theory` | **Mở trang lý thuyết** của bài hiện tại trong trình duyệt (nên đọc trước khi làm). Trong bảng học: bước 1 (dòng vàng) hoặc nhấn **V**. |
| `folder` | Mở thư mục repository của bài hiện tại trong File Explorer, Finder hoặc trình quản lý tệp. Trong bảng học: phím **E**. |
| `migrate <thư-mục-phiên-cũ>` | Nhập tiến độ từ phiên bản hai track cũ. |

`open` tạo lại repository của chính bài đó từ checkpoint và giữ dấu hoàn thành. Dữ liệu phiên nằm ngoài repository bài tập. Từ thư mục phiên, CLI tự tìm phiên; ở nơi khác, CLI dùng phiên hoạt động gần nhất. Biến `GIT_TRAINING_HOME` đổi vị trí lưu chỉ mục và hồ sơ tiến độ. Nếu thư mục phiên bị xóa, `start <track>` tạo phiên mới; nếu chỉ repository bài bị xóa, dùng `open <mã-bài>` để khôi phục.

Bài về GitHub, credential, signing, branch protection, Husky và `git-filter-repo` được ghi rõ là **mô phỏng offline**. Chúng không đăng nhập dịch vụ, ký bằng khóa thật hay viết lại lịch sử thật. Bài remote dùng bare repository cục bộ.

## Bảng học trên trình duyệt

`git-training` (không đối số) khởi động một máy chủ HTTP nhỏ **chỉ trên máy bạn** và mở trình duyệt mặc định. Terminal in đường dẫn dạng `http://127.0.0.1:<cổng>/?t=<mã>`; giữ cửa sổ đó mở, nhấn **Ctrl+C** để dừng. Đóng tab trình duyệt không làm máy chủ dừng: mở lại đường dẫn là học tiếp. Nếu quá **2 giờ** không có yêu cầu nào (không còn tab nào mở), máy chủ tự dừng; đổi bằng `GIT_TRAINING_IDLE_MINUTES=<phút>` (`0` là không bao giờ tự dừng).

Các trang: **Chào mừng** (ba dòng hướng dẫn và nút *Tiếp tục học*), **Bài học**, **Tất cả bài** (mọi chủ đề và bài, không khóa bài nào, nhảy tới bài bất kỳ) **Hoàn thành chủ đề** và **Tác giả**. Trang bài học gồm:

1. **Đọc bài lý thuyết**: bài HTML có sẵn (`theory/…`) hiện ngay bên phải nhiệm vụ trên màn hình rộng; trên điện thoại/máy tính bảng, nút *Mở bài lý thuyết* mở toàn màn hình (đóng bằng *Quay lại bài* hoặc Esc). Có liên kết mở trong tab mới.
2. **Làm bài trong thư mục bài tập**: lệnh `cd "<đường dẫn>"` có nút **Chép lệnh** (dấu nháy đúng theo hệ điều hành), nút **Mở thư mục** (File Explorer, Finder hoặc `xdg-open`), và hướng dẫn mở terminal cho người mới. Trang **tự kiểm tra** thư mục bài mỗi ~1,5 giây và hiện *Còn thiếu* gì; khi đạt, bước chuyển xanh với một hiệu ứng nhỏ (CSS thuần, tắt khi hệ điều hành đặt "giảm chuyển động").
3. **Trả lời câu hỏi**: ô nhập thường, Enter để gửi. Sai thì có lời nhắn thân thiện; sau hai lần sai, trang gợi ý xem gợi ý.
4. **Kiểm tra**: tự động; nút *Kiểm tra lại* tính một lần thử. Bài chỉ trả lời (không có bước thực hành) được chấm ngay khi gửi đáp án.

*Cần giúp?* gồm **Gợi ý** (từng mức), **Lời giải** (có bước xác nhận) và **Làm lại bài này từ đầu**. Số lần thử chỉ tăng khi bạn gửi đáp án hoặc bấm *Kiểm tra lại*; tự kiểm tra nền không tính lần thử. Tiến độ dùng chung `session.json` với bảng học terminal và các lệnh `check`, `next`…, nên có thể đổi qua lại.

Giao diện: dải đầu trang màu xanh MB (bảng màu ước lượng theo nhận diện MB, không phải thông số chính thức), trang **Tác giả** (`/about`) và chân trang giới thiệu. Tailwind CSS đã dựng sẵn thành `web/app.css` (người dùng không cần cài Tailwind), phông Be Vietnam Pro và JetBrains Mono tự lưu, một màu nhấn, sáng/tối theo hệ thống, dùng được từ 360 px, thao tác bằng bàn phím, kết quả kiểm tra được đọc bằng `aria-live`. Không gọi CDN hay mạng ngoài.

**Bảo mật.** Máy chủ chỉ lắng nghe `127.0.0.1` nên máy khác trong mạng không truy cập được. Mã ngẫu nhiên trong đường dẫn được đổi lấy cookie `HttpOnly; SameSite=Strict`; mọi yêu cầu khác không có cookie đều bị từ chối. Tiêu đề `Host` lạ bị từ chối (chống DNS rebinding), yêu cầu ghi cần `Content-Type: application/json`, `Origin` cùng nguồn và không đến từ trang khác (`Sec-Fetch-Site`). Phản hồi có `Content-Security-Policy` chỉ cho tài nguyên cùng nguồn (trang lý thuyết cần thêm `unsafe-eval` cho Mermaid). Máy chủ chỉ phục vụ HTML/CSS/JS/phông trong `theory/` (không có `src`, `examples`, `vendor`) và các tệp tĩnh trong `web/` (CSS, JS). Máy chủ không chạy lệnh Git của người học; nó chỉ đọc trạng thái repository bài tập như lệnh `check`.

Biến môi trường: `GIT_TRAINING_NO_BROWSER=1` (không tự mở trình duyệt, chỉ in đường dẫn; cũng tự bỏ qua khi có `CI` hoặc Linux không có giao diện), `GIT_TRAINING_NO_EXPLORER=1` (tắt nút *Mở thư mục*), `GIT_TRAINING_IDLE_MINUTES`, `GIT_TRAINING_HOME` (nơi lưu tiến độ), `GIT_TRAINING_TERMINAL=1` (dùng bảng học terminal).

## Dùng bảng học trong terminal

**Chế độ hướng dẫn (mặc định)** chỉ có ba màn hình chính: chào mừng, bài học và hoàn thành. Màn hình bài học liệt kê các bước bằng tiếng Việt đơn giản, đánh dấu `✓` bước đã xong, `❯` bước tiếp theo, và chỉ mở rộng chi tiết của bước hiện tại:

1. **Đọc bài lý thuyết** (dòng vàng nổi bật): Enter mở trang trong trình duyệt.
2. **Làm bài trong thư mục bài tập**: Enter mở thư mục bằng File Explorer/Finder; hoặc mở một terminal mới và gõ `cd "$(git-training path)"` (PowerShell: `Set-Location (git-training path)`).
3. **Trả lời câu hỏi** (chỉ bài có câu hỏi): gõ thẳng đáp án rồi Enter. Sai thì có lời nhắn thân thiện; sau hai lần sai, bảng gợi ý nhấn **Tab** để xem gợi ý.
4. **Kiểm tra**: **tự động**. Khi bài thực hành Git chưa xong, màn hình hiện `Đang chờ bạn làm xong…` với một ký tự quay, tự đọc lại thư mục bài mỗi 1–2 giây; khi đạt, bước chuyển xanh, pháo hoa nổ và Enter sang bài tiếp theo. Bài chỉ trả lời được chấm ngay khi bạn nhấn Enter ở đáp án.

Thanh dưới cùng luôn có các phím chính: **Enter** tiếp tục, **H** cần giúp, **M** menu, **Q** thoát (khi đang gõ đáp án: **Tab** cần giúp, **Esc** menu, **Ctrl+C** thoát). Bước lý thuyết và bước làm bài có thể bỏ qua bằng **→**. **Cần giúp?** cho **Gợi ý** trước (từng mức); **Lời giải** nằm cuối và có bước xác nhận. **M** mở menu đầy đủ: Danh sách bài, Mở bài theo mã, Chọn chủ đề, Lộ trình, Mở thư mục bài tập, Mở bài lý thuyết, Kiểm tra lại ngay, Cần giúp, Làm lại bài này từ đầu (tạo lại thư mục bài, có xác nhận) và Thoát; các phím tắt chữ (`V`, `E`, `C`, `H`, `L`, `O`, `T`, `R`, `K`) vẫn dùng được ngoài lúc gõ đáp án. Số lần thử chỉ tăng khi bạn nhấn **Kiểm tra lại** hoặc gửi đáp án; việc tự kiểm tra nền không tính lần thử. Tiến độ lưu cùng định dạng với trước đây nên bài đã làm vẫn còn.

Hiệu ứng pháo hoa tắt bằng `GIT_TRAINING_NO_EFFECTS=1` hoặc `NO_COLOR` (khi `NO_COLOR` có, bảng cũng bỏ màu và chỉ dùng chữ đậm/đảo màu). Nhấn phím bất kỳ để bỏ qua pháo hoa. Bảng chạy được ở cửa sổ nhỏ (kể cả 60×20); nếu nội dung dài hơn cửa sổ, dùng **PgUp/PgDn** hoặc **↑/↓** để cuộn.

**Chế độ cổ điển** (`--classic`): một menu hai cột ở màn hình bài học; dùng **↑/↓** (hoặc **←/→**) rồi **Enter**, hoặc nhấn thẳng chữ trong `[ ]` (`V` lý thuyết, `C` check, `A` trả lời, `E` mở thư mục, `H` gợi ý, `S` lời giải, `N` bài sau, `L` danh sách, `O` mở theo mã, `T` track, `R` roadmap, `Q` thoát). Cửa sổ thấp hoặc hẹp thì menu thu thành một dòng. Gợi ý và lời giải hiện ngay trong nội dung (cuộn bằng PgUp/PgDn/Home/End). Bảng cập nhật phản hồi mỗi hai giây nhưng chỉ nhấn **C** mới ghi nhận bài đạt.

## Trang lý thuyết

Mỗi bài có một trang HTML tiếng Việt giải thích khái niệm trước khi làm (thư mục `theory/<track>/<mã-bài>.html`, chỉ mục ở `theory/index.html`). Trang **không tự mở**: trong bảng học có một dòng nổi bật (chữ đen trên nền vàng) `[V] MỞ BÀI LÝ THUYẾT`; nhấn **V** (hoặc Enter) để mở trong trình duyệt mặc định, hoặc chạy `git-training theory`. Nên đọc trang này trước khi làm bài.

- Windows: `rundll32 url.dll,FileProtocolHandler <file://…>` (không qua `cmd.exe`, nên khoảng trắng, chữ Việt hay `&` trong đường dẫn không gây lỗi). macOS: `open`. Linux: `xdg-open`. WSL: `wslview` nếu có, nếu không thì `rundll32.exe` với đường dẫn Windows.
- Đặt `GIT_TRAINING_NO_BROWSER=1` nếu chỉ muốn in đường dẫn mà không mở trình duyệt. Cờ `--no-browser` cũ vẫn được chấp nhận nhưng không còn tác dụng.
- Tự bỏ qua khi có biến `CI`, `NODE_ENV=test`, khi Linux không có `DISPLAY`/`WAYLAND_DISPLAY` (máy chủ không giao diện, SSH). Khi đó chỉ in đường dẫn.
- Chạy hoàn toàn offline: phông chữ Be Vietnam Pro, JetBrains Mono và Mermaid nằm trong `theory/assets/`, trang mở bằng `file://` và không cần mạng hay máy chủ. Gói npm có kèm các trang này.
- Viết hoặc sửa trang: sửa Markdown trong `theory/src/<track>/<mã-bài>.md` rồi chạy `node theory/build.mjs` để dựng lại HTML (xem `theory/README.md`). Thư mục `theory/src` và các tệp dựng không nằm trong gói npm.

## Mở thư mục bài thực hành

Mỗi bài tạo một repository mẫu. Trong bảng học, nhấn **E** (dòng `[E] Mở thư mục bài …`) hoặc chạy `git-training folder` để mở thư mục đó: Windows dùng `explorer.exe`, macOS dùng `open`, Linux dùng `xdg-open` rồi `gio open`, WSL mở File Explorer của Windows. Thư mục không tự mở; đặt `GIT_TRAINING_NO_EXPLORER=1` để tắt hẳn. Trên Linux không có giao diện (SSH) lệnh chỉ báo lý do.

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

`createSession(track, { workspaceDir? })` tạo phiên. Các hàm khác nhận `{ sessionDir? }`; nếu bỏ qua, chúng tìm phiên như CLI. `getRoadmapProgress()` trả tiến độ từng track. `checkExercise({ sessionDir?, countAttempt? })` với `countAttempt: false` ghi nhận kết quả đạt mà không tăng số lần Check (bảng học dùng cho việc tự kiểm tra nền); `getExerciseInfo()` có thêm `task` (nhiệm vụ không kèm câu hỏi). `registerCourse` đăng ký khóa học đáng tin cậy trong tiến trình hiện tại; xem [hướng dẫn viết khóa học](docs/course-authoring.md).

## Tác giả

**Văn Thành Duy**, Automation Tester · Manual Tester · Coding Enthusiast. Hiện là Chuyên viên Kiểm thử (Automation Tester) tại MBBank từ 03/2025. Blog: [duyqa.blog](https://duyqa.blog), giới thiệu đầy đủ: [duyqa.blog/about](https://duyqa.blog/about), GitHub: [Duy247](https://github.com/Duy247). Mọi góp ý và báo lỗi: [Issues](https://github.com/Duy247/git-training/issues).

## Phát triển

```sh
npm install
npm run build:css   # dựng web/app.css từ web-src/input.css bằng Tailwind (chỉ cần khi sửa giao diện web)
npm test
npm run pack:check
```

`web/app.css` được commit để `npm test` và người dùng không cần Tailwind; `prepublishOnly` luôn dựng lại CSS trước khi phát hành. Giao diện web nằm ở `src/web/` (máy chủ, trang) và `web/app.js` (JavaScript thuần).

Bộ kiểm thử chạy Git thật cho 116 bài. CI chạy trên Windows, macOS và Linux. Gói hiện tại trên npm là `@duy247/git-training@0.1.0`; phát hành bản mới bằng `npm version` rồi `npm publish`.
