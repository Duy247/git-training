# Viết khóa học với API

`registerCourse(course)` nhận đối tượng JavaScript hoặc TypeScript đáng tin cậy trong cùng tiến trình với `createSession`. CLI chỉ nạp các track đi kèm gói. Khi chạy ở tiến trình khác, hãy đăng ký lại khóa học tùy chỉnh trước khi mở phiên.

Khóa học có `id`, `title` và mảng `exercises` theo thứ tự. Mỗi bài cần `id`, `title`, `instructions`, `hints`, `solution`, `setup(repo)`, `validate(repo)`. Các trường `concept`, `expected`, `question`, `sourceUrl`, `mode`, `needsGit`, `simulated`, `evaluateAnswer(repo, answer)` và `prerequisites` là tùy chọn. `mode` có thể là `state`, `answer` hoặc `hybrid`. ID chỉ dùng chữ thường, số và dấu gạch ngang.

Bài đầu mở ngay. Bài sau mở khi bài trước và mọi điều kiện `prerequisites` đã đạt. `setup` tạo checkpoint mới; `validate` trả mảng kết quả `{ pass, message }`. Nếu dùng câu trả lời, `evaluateAnswer` cũng trả mảng kết quả như vậy. Bài đạt khi mọi điều kiện đều đúng.

```js
import { registerCourse, createSession, init, commit, write, read, status } from 'git-training';

registerCourse({
  id: 'khoa-thu',
  title: 'Khóa thử',
  exercises: [{
    id: 'tao-tep',
    title: 'Tạo tệp chưa theo dõi',
    concept: 'Tệp chưa theo dõi chưa nằm trong index.',
    instructions: 'Tạo hello.txt chứa chữ hello và chưa chạy git add.',
    expected: 'git status hiển thị hello.txt là untracked.',
    hints: ['Tạo tệp ngay trong repository bài tập.'],
    solution: 'Tạo hello.txt chứa hello; đừng chạy git add.',
    mode: 'state',
    async setup(repo) {
      await init(repo);
      await write(repo, 'README.md', 'Luyện tập\n');
      await commit(repo, 'Bắt đầu');
    },
    async validate(repo) {
      return [
        { pass: (await read(repo, 'hello.txt'))?.trim() === 'hello', message: 'hello.txt cần chứa hello.' },
        { pass: (await status(repo)).includes('?? hello.txt'), message: 'Hãy để hello.txt ở trạng thái untracked.' },
      ];
    },
  }],
});

const session = await createSession('khoa-thu');
console.log(session.dir);
```

Gói còn xuất `git(repo, ...args)`, `isAncestor` và `existsRef` để viết kiểm tra. `git` nhận từng đối số và có giới hạn thời gian. Không tạo shell command từ dữ liệu người học. Giữ fixture ổn định và chạy offline. Đặt bare repository phụ trong thư mục cha của repository bài để `open` có thể khôi phục trọn checkpoint. Mã khóa học tùy chỉnh chạy với quyền của tiến trình, vì vậy chỉ đăng ký module đáng tin cậy.
