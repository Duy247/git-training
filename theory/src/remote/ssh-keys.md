---
title: Xác thực bằng khóa SSH
track: remote
slug: ssh-keys
order: 4
---

## Bạn sẽ học được gì

- Hiểu cặp khóa SSH gồm những gì và phần nào được phép chia sẻ.
- Biết các bước chuẩn để dùng SSH với một dịch vụ hosting Git.
- Đổi remote từ HTTPS sang SSH và chọn khóa cụ thể cho một repository.
- Tránh lỗi nghiêm trọng nhất: để lộ khóa riêng.

## Khái niệm

Khi push lên một dịch vụ như GitHub, server cần biết bạn là ai. Với địa chỉ HTTPS, bạn chứng minh bằng token (bài sau). Với địa chỉ SSH, bạn chứng minh bằng **cặp khóa**.

Cặp khóa SSH gồm hai tệp sinh ra cùng lúc:

- **Khóa riêng (private key)**, ví dụ `~/.ssh/id_ed25519`. Đây là bí mật. Ai có tệp này có thể đóng vai bạn. Nó chỉ nằm trên máy bạn, được bảo vệ thêm bằng passphrase nếu có thể.
- **Khóa công khai (public key)**, ví dụ `~/.ssh/id_ed25519.pub`. Đây là phần bạn **được phép chia sẻ**: dán vào trang cài đặt của dịch vụ để đăng ký. Biết khóa công khai không cho phép ai giả mạo bạn.

Cơ chế, nói gọn: khi kết nối, server gửi một thử thách; máy bạn dùng khóa riêng để ký; server dùng khóa công khai đã đăng ký để kiểm tra chữ ký. Khóa riêng không bao giờ rời khỏi máy.

Các bước thường gặp:

1. Sinh cặp khóa bằng `ssh-keygen`. Thuật toán `ed25519` được khuyến nghị rộng rãi hiện nay vì khóa ngắn và an toàn.
2. Nạp khóa riêng vào `ssh-agent` để không phải gõ passphrase mỗi lần.
3. Chép **nội dung tệp `.pub`** vào phần SSH keys trong cài đặt tài khoản trên dịch vụ.
4. Thử kết nối, rồi dùng địa chỉ SSH dạng `git@<host>:<chủ>/<repo>.git` cho remote.

Phần liên quan trực tiếp tới Git chỉ là **địa chỉ remote** và (khi cần) **lệnh ssh mà Git gọi**. Git không tự quản lý khóa; nó gọi chương trình `ssh` của hệ điều hành. Nếu bạn có nhiều khóa (ví dụ một cho công việc, một cho cá nhân), có thể chỉ định khóa cho từng repository bằng cấu hình `core.sshCommand`, hoặc dùng tệp `~/.ssh/config` với alias host.

**Phần mô phỏng trong ứng dụng.** Bài tập chạy offline, không có server SSH và không yêu cầu bạn tạo hay tải lên khóa thật. Môi trường dựng bài viết này cũng không có `ssh-keygen`, nên các lệnh `ssh-keygen`, `ssh-add`, `ssh -T` bên dưới chỉ được liệt kê để tham khảo, **không kèm output**. Các lệnh `git remote` và `git config` thì đã được chạy thật.

## Hình dung bằng sơ đồ

```mermaid
sequenceDiagram
  participant M as Máy bạn
  participant S as Dịch vụ Git
  M->>S: Đăng ký khóa công khai, một lần
  M->>S: git push qua SSH
  S-->>M: Thử thách ngẫu nhiên
  M->>S: Chữ ký bằng khóa riêng
  S->>S: Kiểm tra bằng khóa công khai
  S-->>M: Chấp nhận push
```

```mermaid
flowchart LR
  subgraph K["Cặp khóa"]
    P["Khóa riêng: giữ bí mật"]
    U["Khóa công khai: được chia sẻ"]
  end
  P -- "chỉ ở trên máy bạn" --> M["ssh-agent"]
  U -- "dán vào cài đặt tài khoản" --> S["Dịch vụ Git"]
```

## Lệnh cần biết

```bash
# Ngoài Git, chỉ tham khảo:
ssh-keygen -t ed25519 -C "email-cong-viec@example.invalid"   # sinh cặp khóa
ssh-add ~/.ssh/id_ed25519        # nạp khóa riêng vào agent
ssh -T git@github.com            # thử xác thực, không mở shell

# Phía Git:
git remote set-url origin git@github.com:<chủ>/<repo>.git   # chuyển remote sang SSH
git remote -v
git config core.sshCommand "ssh -i ~/.ssh/<khóa> -o IdentitiesOnly=yes"
```

| Tệp | Chia sẻ được | Ghi chú |
| --- | --- | --- |
| `id_ed25519` | Không bao giờ | Khóa riêng, quyền đọc chỉ cho bạn |
| `id_ed25519.pub` | Có | Dán vào trang cài đặt của dịch vụ |
| `~/.ssh/config` | Tùy | Chứa alias host, không chứa bí mật |

## Ví dụ từng bước

Repository đang dùng địa chỉ HTTPS. Mình chuyển sang SSH (địa chỉ minh họa, không kết nối thật):

```bash
git remote -v
git remote set-url origin git@github.com:vi-du/kiem-thu.git
git remote -v
```

```text
origin	https://github.com/vi-du/kiem-thu.git (fetch)
origin	https://github.com/vi-du/kiem-thu.git (push)
origin	git@github.com:vi-du/kiem-thu.git (fetch)
origin	git@github.com:vi-du/kiem-thu.git (push)
```

Chỉ định khóa công việc cho riêng repository này:

```bash
git config core.sshCommand "ssh -i ~/.ssh/id_ed25519_congviec -o IdentitiesOnly=yes"
git config --get core.sshCommand
```

```text
ssh -i ~/.ssh/id_ed25519_congviec -o IdentitiesOnly=yes
```

Một lớp bảo vệ: nếu vì lý do nào đó tệp khóa nằm trong thư mục dự án, `.gitignore` nên chặn khóa riêng nhưng không cần chặn khóa công khai. Kiểm tra bằng `check-ignore` (hai tệp rỗng tạo ra để thử):

```bash
git check-ignore -v k/id_ed25519 k/id_ed25519.pub
```

```text
.gitignore:3:id_*	k/id_ed25519
.gitignore:4:!id_*.pub	k/id_ed25519.pub
```

Dòng đầu: khóa riêng bị ignore bởi mẫu `id_*`. Dòng hai có dấu `!`: mẫu phủ định khớp, nghĩa là tệp `.pub` **không** bị ignore.

## Lỗi thường gặp

**Dán nhầm khóa riêng vào trang cài đặt.** Nội dung khóa riêng bắt đầu bằng dòng `-----BEGIN OPENSSH PRIVATE KEY-----`. Thấy dòng đó là dừng lại.

> **Cẩn thận** Không bao giờ commit khóa riêng, kể cả vào repository private. Nếu đã lỡ commit hay push, coi như khóa đã lộ: xóa khóa đó khỏi tài khoản và sinh khóa mới. Xóa commit thôi là không đủ.

**Vẫn bị hỏi mật khẩu sau khi thêm khóa.** Thường là remote vẫn dùng địa chỉ HTTPS. Kiểm tra `git remote -v`.

**Sai khóa khi có nhiều tài khoản.** SSH thử lần lượt các khóa trong agent; dịch vụ nhận khóa đầu tiên hợp lệ và coi bạn là tài khoản đó. `IdentitiesOnly=yes` kèm `-i` buộc dùng đúng khóa.

> **Mẹo** Đặt passphrase cho khóa riêng và dùng `ssh-agent`. Bạn chỉ gõ passphrase một lần mỗi phiên, còn tệp khóa bị lấy cắp cũng khó dùng.

## Áp dụng trong công việc

Công ty yêu cầu máy làm việc của nhóm QA ngân hàng dùng SSH với khóa riêng cho tài khoản công việc, tách khỏi tài khoản cá nhân. Bạn sinh một khóa ed25519 có passphrase, đăng ký khóa công khai vào tài khoản công việc, rồi cấu hình `core.sshCommand` trong các repository công việc. Khi nghỉ việc hay đổi máy, quản trị chỉ cần gỡ khóa công khai đó khỏi tài khoản.

## Chuẩn bị làm bài

Đây là bài câu hỏi và được mô phỏng, không cần tạo khóa thật. Câu hỏi xoay quanh việc phần nào của cặp khóa được phép đưa lên dịch vụ. Hãy ôn lại vai trò của từng tệp trong cặp khóa và điều gì xảy ra nếu tệp còn lại bị lộ.

## Tóm tắt

- Cặp khóa SSH gồm khóa riêng (bí mật) và khóa công khai (chia sẻ được).
- Server kiểm tra chữ ký bằng khóa công khai; khóa riêng không rời máy.
- Git chỉ cần địa chỉ remote dạng SSH; việc xác thực do chương trình `ssh` lo.
- `core.sshCommand` chọn khóa cụ thể cho từng repository.
- Khóa riêng lỡ lộ thì thu hồi và sinh khóa mới; xóa commit không đủ.
