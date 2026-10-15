# git-training

`git-training` là công cụ luyện Git ngay trên máy. Mỗi bài có repository riêng; bạn dùng terminal thường rồi chạy `git-training check` để xem kết quả. Công cụ không cần quyền quản trị, không ghi lại lệnh bạn gõ và không cần mạng trong lúc học.

## Yêu cầu

- Node.js 22 trở lên và Git 2.28 trở lên trên `PATH`
- Windows, macOS hoặc Linux

## Bắt đầu

Sau khi gói được phát hành:

```sh
npx git-training courses
npx git-training start foundations
```

Trong bản mã nguồn, chạy `npm install`, `npm run build`, rồi dùng `node dist/cli.js` thay cho `npx git-training`. `start` in đường dẫn repository của bài đầu. Chuyển đến đó, thực hành rồi kiểm tra:

```sh
git status
git-training hint
git-training answer "đáp án của bạn"
git-training check
git-training next
```

Bài chỉ đạt khi cả điều kiện Git và câu trả lời đều đúng. Một số bài chỉ có câu hỏi. `solution` hiển thị lời giải nhưng không tự đánh dấu hoàn thành.

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
| `start <track> [--dir <thư-mục>]` | Tạo phiên mới; mặc định trong `~/git-training`. |
| `roadmap` | Xem tiến độ cả 11 track. |
| `list` | Xem bài đã đạt, sẵn sàng và chưa mở trong track hiện tại. |
| `status` | Xem khái niệm, nhiệm vụ, kết quả cần đạt và đường dẫn repository. |
| `hint` | Mở gợi ý tiếp theo. |
| `solution` | Xem lời giải. |
| `answer [đáp-án]` | Gửi đáp án; bỏ đối số để nhập trong terminal tương tác. |
| `check` | Kiểm tra Git và đáp án, lưu lần thử, mở khóa bài tiếp theo nếu đạt. |
| `next` | Mở bài kế sau khi đạt. |
| `open <mã-bài>` | Mở lại bài đã mở khóa từ checkpoint. |
| `migrate <thư-mục-phiên-cũ>` | Nhập tiến độ từ phiên bản hai track cũ. |

`open` tạo lại repository của chính bài đó từ checkpoint và giữ dấu hoàn thành. Dữ liệu phiên nằm ngoài repository bài tập. Từ thư mục phiên, CLI tự tìm phiên; ở nơi khác, CLI dùng phiên hoạt động gần nhất. Biến `GIT_TRAINING_HOME` đổi vị trí lưu chỉ mục và hồ sơ tiến độ.

Bài về GitHub, credential, signing, branch protection, Husky và `git-filter-repo` được ghi rõ là **mô phỏng offline**. Chúng không đăng nhập dịch vụ, ký bằng khóa thật hay viết lại lịch sử thật. Bài remote dùng bare repository cục bộ.

## Chuyển tiến độ cũ

CLI tự nhận diện phiên cũ đang hoạt động. Với phiên ở nơi khác, chạy `git-training migrate <thư-mục-phiên-cũ>`. Việc nhập có thể chạy lại, giữ nguyên repository và tệp phiên cũ. Mọi bài đã đạt xuất hiện trong lịch sử luyện tập; chỉ các kỹ năng khớp chính xác được cộng vào bài mới: staging **cùng** commit, branch, rebase và conflict.

## Node.js API

Gói cung cấp ESM và type definitions:

```js
import {
  createSession, getExerciseInfo, getProgress, getRoadmapProgress,
  submitAnswer, checkExercise, openExercise, nextExercise,
  migrateLegacySession, registerCourse
} from 'git-training';

const session = await createSession('foundations');
const info = await getExerciseInfo({ sessionDir: session.dir });
console.log(info.concept, info.instructions, info.repo);

// Sau khi người học thao tác trong repository:
await submitAnswer('git init', { sessionDir: session.dir });
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

Bộ kiểm thử chạy Git thật cho 116 bài. CI chạy trên Windows, macOS và Linux. Phát hành npm là bước riêng sau khi gói được duyệt và kiểm tra lại tên `git-training` trên registry.
