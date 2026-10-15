---
title: Token truy cập cá nhân
track: remote
slug: personal-access-tokens
order: 5
---

## Bạn sẽ học được gì

- Hiểu personal access token (PAT) là gì và vì sao nó thay thế mật khẩu khi push qua HTTPS.
- Chọn phạm vi quyền và hạn dùng hợp lý cho một token.
- Biết Git lấy token từ đâu, và vì sao không nên nhét token vào URL remote.
- Lưu token cho CI ở chỗ an toàn.

## Khái niệm

Khi remote dùng địa chỉ HTTPS, mỗi lần push hay fetch repository private, server hỏi bạn là ai. Các dịch vụ lớn như GitHub không còn chấp nhận mật khẩu tài khoản cho thao tác Git; thay vào đó bạn dùng **personal access token**: một chuỗi bí mật do dịch vụ sinh ra, dùng ở chỗ mật khẩu.

Token tốt hơn mật khẩu ở ba điểm:

- **Phạm vi quyền (scope)**: token chỉ làm được những gì bạn cho phép, ví dụ chỉ đọc, hoặc chỉ ghi vào vài repository cụ thể. Một số dịch vụ có loại token "fine-grained" để giới hạn tới từng repository.
- **Hạn dùng**: bạn đặt ngày hết hạn; token tự vô hiệu sau đó.
- **Thu hồi riêng lẻ**: lộ một token thì thu hồi đúng token đó, không phải đổi mật khẩu tài khoản và không ảnh hưởng các token khác.

Nguyên tắc chọn: **quyền ít nhất cần thiết, hạn ngắn nhất chấp nhận được**, mỗi mục đích một token riêng.

Git lấy thông tin đăng nhập qua **credential helper**. Lần đầu, Git hỏi tên người dùng và mật khẩu; bạn dán token vào chỗ mật khẩu. Helper (ví dụ Git Credential Manager, keychain của macOS, `libsecret` trên Linux) lưu lại một cách an toàn để những lần sau không phải hỏi. Cấu hình bằng `credential.helper`.

Cách **không nên**: nhét token thẳng vào URL remote dạng `https://ten:<token>@host/...`. Token khi đó nằm dạng chữ thường trong `.git/config`, hiện ra mỗi khi chạy `git remote -v`, dễ bị chụp màn hình, dán vào log hay gửi trong tin nhắn hỏi đáp.

Với **CI** (hệ thống chạy test tự động), token không thuộc về máy cá nhân nào. Hãy lưu nó trong kho **secret** của hệ thống CI: giá trị được mã hóa, chỉ được đưa vào job dưới dạng biến môi trường lúc chạy, và thường bị che trong log. Không bao giờ ghi token vào tệp cấu hình pipeline trong repository.

**Phần mô phỏng trong ứng dụng.** Bài tập không cần và không dùng token thật. Mọi giá trị trong ví dụ dưới đây là chuỗi giả, địa chỉ dùng tên miền `example.invalid` không tồn tại.

## Hình dung bằng sơ đồ

```mermaid
sequenceDiagram
  participant G as Git
  participant H as Credential helper
  participant S as Dịch vụ Git
  G->>S: push qua HTTPS
  S-->>G: Yêu cầu xác thực
  G->>H: Có thông tin cho host này không?
  H-->>G: Tên người dùng và token đã lưu
  G->>S: Gửi lại kèm token
  S->>S: Kiểm tra scope và hạn dùng
  S-->>G: Chấp nhận hoặc từ chối
```

```mermaid
flowchart TD
  T["Cần lưu token"] --> Q{"Dùng ở đâu?"}
  Q -- "Máy cá nhân" --> H["Credential helper của hệ điều hành"]
  Q -- "Pipeline CI" --> S["Kho secret của CI"]
  Q -- "Trong URL hoặc tệp repo" --> X["Không bao giờ"]
```

## Lệnh cần biết

```bash
git config --global credential.helper <tên-helper>   # chọn helper lưu thông tin
git config --show-origin --get-all credential.helper # xem đang dùng helper nào
git remote -v                                        # kiểm tra URL có lộ token không
git remote set-url origin https://<host>/<repo>.git  # gỡ token khỏi URL
git config transfer.credentialsInUrl die             # chặn URL chứa thông tin đăng nhập
```

| Thuộc tính token | Lựa chọn an toàn |
| --- | --- |
| Scope | Chỉ những repository và quyền cần dùng |
| Hạn dùng | Ngắn, gia hạn khi cần |
| Nơi lưu trên máy | Credential helper |
| Nơi lưu cho CI | Secret của hệ thống CI |

## Ví dụ từng bước

Mình cố tình làm sai để thấy hậu quả, với token giả `TOKEN_GIA_LAP`:

```bash
git remote add origin "https://nguoi-dung:TOKEN_GIA_LAP@example.invalid/kiem-thu.git"
git remote -v
```

```text
origin	https://nguoi-dung:TOKEN_GIA_LAP@example.invalid/kiem-thu.git (fetch)
origin	https://nguoi-dung:TOKEN_GIA_LAP@example.invalid/kiem-thu.git (push)
```

Token hiện nguyên văn. Git có cấu hình `transfer.credentialsInUrl` để cảnh báo (`warn`) hoặc chặn (`die`) loại URL này:

```bash
git -c transfer.credentialsInUrl=die fetch origin
```

```text
fatal: URL 'https://nguoi-dung:<redacted>@example.invalid/kiem-thu.git' uses plaintext credentials
```

Git từ chối trước khi kết nối, và tự che token trong thông báo. Sửa lại URL cho sạch:

```bash
git remote set-url origin https://example.invalid/kiem-thu.git
git remote -v
```

```text
origin	https://example.invalid/kiem-thu.git (fetch)
origin	https://example.invalid/kiem-thu.git (push)
```

Kiểm tra helper đang dùng. Trong môi trường thử của mình chưa cấu hình helper nào, nên lệnh không in gì; trên máy bạn, kết quả thường cho biết tên helper và tệp cấu hình chứa nó:

```bash
git config --show-origin --get-all credential.helper
```

## Lỗi thường gặp

**Dùng mật khẩu tài khoản thay token.** Dịch vụ từ chối xác thực. Sinh token và dán vào chỗ mật khẩu.

> **Cẩn thận** Token đã xuất hiện trong commit, log CI, ảnh chụp màn hình hay tin nhắn thì coi như đã lộ. Thu hồi ngay trên dịch vụ rồi sinh token mới; chỉ xóa dấu vết là không đủ.

**Token quyền quá rộng, không hạn dùng.** Tiện lúc đầu, nhưng một lần lộ là mất kiểm soát mọi repository. Chia nhỏ theo mục đích.

**Ghi token vào tệp pipeline.** Tệp pipeline nằm trong repository, ai đọc được repository là thấy token. Dùng secret của CI.

> **Mẹo** Đặt `transfer.credentialsInUrl` thành `warn` hoặc `die` ở cấu hình global để Git nhắc bạn mỗi khi có ai đó (kể cả chính bạn) dán URL chứa token.

## Áp dụng trong công việc

Pipeline chạy test hồi quy hằng đêm cho cổng thanh toán trực tuyến cần clone một repository dữ liệu kiểm thử private. Bạn tạo một token chỉ có quyền đọc đúng repository đó, hạn 90 ngày, lưu vào secret của CI và tham chiếu qua biến môi trường. Lịch nhắc gia hạn được đặt trước ngày hết hạn một tuần.

## Chuẩn bị làm bài

Đây là bài câu hỏi và được mô phỏng, không cần token thật. Câu hỏi hỏi về nơi lưu token dành cho hệ thống CI. Hãy ôn lại vì sao token không nên nằm trong repository hay trong URL, và hệ thống CI cung cấp cơ chế nào để đưa giá trị bí mật vào job lúc chạy.

## Tóm tắt

- PAT thay mật khẩu khi dùng Git qua HTTPS, với scope và hạn dùng riêng.
- Quyền ít nhất, hạn ngắn, mỗi mục đích một token.
- Trên máy cá nhân, để credential helper lưu token.
- Không nhét token vào URL remote; `transfer.credentialsInUrl` giúp chặn.
- Token cho CI nằm trong secret của CI; token lộ thì thu hồi ngay.
