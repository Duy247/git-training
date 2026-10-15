/** Bản đồ 116 chủ đề công khai tại gitflow.dev/learn, chụp ngày 2026-10-15. */
export interface LessonSpec {
  slug: string;
  title: string;
  concept: string;
  question: string;
  answer: string;
  lab?: string;
  sourceUrl: string;
}
export interface TrackSpec { id: string; title: string; lessons: LessonSpec[] }

function track(id: string, title: string, rows: string): TrackSpec {
  const lessons = rows.trim().split('\n').map((line, index) => {
    const [slug, lessonTitle, concept, question, answer, lab] = line.split('|').map(part => part?.trim() ?? '');
    if (!slug || !lessonTitle || !concept || !question || !answer) throw new Error(`Thiếu nội dung ${id}/${index + 1}`);
    return { slug, title: lessonTitle, concept, question, answer, lab: lab || undefined, sourceUrl: `https://www.gitflow.dev/learn/${id}/${slug}` };
  });
  return { id, title, lessons };
}

export const roadmap: readonly TrackSpec[] = [
  track('foundations', 'Nền tảng Git', `
repository-init|Khởi tạo kho Git|Repository lưu lịch sử và cấu hình trong thư mục .git; tệp làm việc vẫn ở bên ngoài.|Nhánh mặc định của bài thực hành cần tên gì?|main|init
stage-and-commit|Stage và commit|Index chọn chính xác nội dung đi vào snapshot kế tiếp; commit lưu snapshot đó.|Lệnh nào đưa tệp vào index trước khi commit?|git add|commit
status-log-diff|Quan sát trạng thái và lịch sử|status cho biết trạng thái, log cho biết commit, diff cho biết nội dung thay đổi.|Lệnh nào so sánh thay đổi chưa stage với index?|git diff|
gitignore|Quy tắc bỏ qua tệp|.gitignore áp dụng cho tệp chưa được theo dõi; tệp đã track cần bỏ khỏi index riêng.|Tệp quy tắc bỏ qua của Git tên gì?|.gitignore|ignore
configuration|Cấu hình Git|Git có cấu hình hệ thống, người dùng và repository; cấu hình gần repository được ưu tiên.|Tùy chọn nào chỉ đặt cấu hình trong repository hiện tại?|--local|config
three-trees|Ba vùng trạng thái|Working tree, index và HEAD là ba ảnh khác nhau của cùng dự án.|Vùng nào chứa nội dung đã chọn cho commit tiếp theo?|index|
object-model|Mô hình object|Blob chứa nội dung, tree ánh xạ đường dẫn và commit nối snapshot với lịch sử.|Object nào trực tiếp chứa byte của tệp?|blob|
head-and-refs|HEAD và ref biểu tượng|HEAD thường là symbolic ref đến nhánh; nhánh là tên trỏ đến commit.|Lệnh nào xem đích symbolic ref của HEAD?|git symbolic-ref|
commit-message-anatomy|Thông điệp commit rõ nghĩa|Subject ngắn gọn nói thay đổi gì; phần thân giải thích lý do khi cần.|Tiền tố Conventional Commits cho tính năng mới là gì?|feat:|message
file-modes|Quyền thực thi và symlink|Git lưu mode trong index; quyền thực thi và symlink khác với nội dung blob.|Mode Git nào biểu thị tệp thực thi thông thường?|100755|
`),
  track('branching', 'Nhánh và hợp nhất', `
create-and-switch|Tạo và chuyển nhánh|Nhánh mới là ref độc lập tại commit hiện tại; chuyển nhánh đổi HEAD.|Lệnh nào vừa tạo vừa chuyển sang nhánh mới?|git switch -c|branch
merge-strategies|Chiến lược merge|Fast-forward chỉ dời ref khi không phân kỳ; three-way tạo commit có nhiều cha.|Merge commit thông thường có bao nhiêu parent?|2|merge
rebase|Rebase để lịch sử thẳng|Rebase phát lại commit trên nền mới và tạo object ID mới.|Lệnh nào đưa nhánh hiện tại lên trên main?|git rebase main|rebase
divergent-branches|Nhánh đã phân kỳ|Hai nhánh phân kỳ khi mỗi bên có commit riêng sau tổ tiên chung.|Lệnh nào tìm tổ tiên chung gần nhất của hai nhánh?|git merge-base|merge
listing-branches|Liệt kê và lọc nhánh|Git có thể lọc nhánh đã merge, chưa merge và nhánh chứa commit.|Tùy chọn nào liệt kê nhánh đã merge vào HEAD?|--merged|
renaming-branches|Đổi tên nhánh|Đổi tên nhánh chỉ thay ref, không viết lại commit.|Tùy chọn git branch nào đổi tên nhánh?|--move|rename
branch-naming|Quy ước tên nhánh|Tên nhánh nhất quán giúp thấy mục đích và phạm vi thay đổi.|Tên nào phù hợp cho một tính năng: feature/login hay tmp1?|feature/login|branch
upstream-tracking|Nhánh upstream|Upstream gắn nhánh local với nhánh từ xa để push và pull có đích mặc định.|Tùy chọn push nào đặt upstream lần đầu?|--set-upstream|upstream
squash-merge|Gộp commit bằng squash merge|Squash gom nội dung của nhiều commit thành một commit trên nhánh đích, không giữ quan hệ merge.|Tùy chọn merge nào chuẩn bị nội dung gộp mà chưa commit?|--squash|squash
resolving-conflicts|Giải quyết xung đột merge|Khi hai nhánh sửa cùng vùng, người học phải chọn nội dung đúng rồi stage tệp đã sửa.|Sau khi sửa dấu xung đột, lệnh nào đánh dấu tệp đã giải quyết?|git add|conflict
`),
  track('inspection', 'Quan sát và truy lỗi', `
blame|Truy tác giả từng dòng|blame gắn mỗi dòng với commit gần nhất đã sửa dòng đó; kết quả cần đọc cùng bối cảnh.|Ai là tác giả của dòng chứa “loi” trong app.txt?|Minh|
grep-pickaxe|Tìm trong mã và lịch sử|grep tìm nội dung hiện tại; pickaxe tìm commit đã thêm hoặc xóa chuỗi.|Subject của commit đầu tiên thêm TOKEN_DEMO là gì?|Thêm chuỗi mẫu|
shortlog|Tổng hợp commit theo tác giả|shortlog nhóm commit theo người viết để xem đóng góp, không thay thế đánh giá chất lượng.|Ai tạo hai commit mới nhất trong fixture?|Minh|
bisect|Khoanh vùng commit gây lỗi|bisect dùng tìm kiếm nhị phân giữa mốc tốt và xấu để giảm số lần kiểm tra.|Subject của commit bắt đầu thêm dòng “loi” là gì?|Thêm lỗi|
log-filters|Lọc lịch sử nâng cao|Kết hợp điều kiện tác giả, ngày, thông điệp và đường dẫn để thu hẹp lịch sử.|Ai là tác giả commit “Thêm chuỗi mẫu”?|Minh|
inspecting-commits|Xem chi tiết commit|show hiển thị metadata và diff của một commit cụ thể.|Commit “Thêm lỗi” sửa tệp nào?|app.txt|
file-history-renames|Theo lịch sử qua đổi tên|log có thể theo một tệp dù tên đường dẫn đã đổi.|Tệp app-renamed.txt có tên gì trước khi đổi?|app.txt|
pickaxe-detail|Pickaxe chuyên sâu|-S phát hiện thay đổi số lần xuất hiện chuỗi; -G tìm dòng diff khớp biểu thức.|Subject của commit thêm TOKEN_DEMO là gì?|Thêm chuỗi mẫu|
diff-strategies|Các cách xem diff|--stat tóm tắt lượng thay đổi; --word-diff làm rõ thay đổi trong dòng.|Commit mới nhất thay đổi tệp nào?|app.txt|
range-diff|So sánh hai chuỗi commit|range-diff đối chiếu hai phiên bản của cùng chuỗi commit sau rebase.|Lệnh nào so sánh hai dải commit thay vì hai snapshot?|git range-diff|
`),
  track('undo', 'Hoàn tác và cứu hộ', `
revert-vs-reset|Revert và reset|revert thêm commit đảo ngược; reset dời ref và có thể ảnh hưởng index hoặc working tree.|Lệnh nào phù hợp để đảo thay đổi đã chia sẻ mà vẫn giữ lịch sử?|git revert|revert
reset-variations|Các kiểu reset|--soft giữ index; --mixed bỏ staging; --hard thay cả working tree.|Kiểu reset nào giữ nội dung trong index?|--soft|reset
clean-restore|Dọn tệp và khôi phục|restore trả tệp tracked về bản đã chọn; clean xóa tệp chưa được theo dõi.|Lệnh nào xóa tệp untracked sau khi xem trước bằng -n?|git clean -f|restore
reflog|Nhật ký di chuyển ref|reflog ghi các lần HEAD và ref đổi vị trí, giúp tìm commit tưởng đã mất.|Lệnh nào xem lịch sử di chuyển của HEAD?|git reflog|
amending-commits|Sửa commit cuối|amend tạo commit mới thay commit cuối; tránh sửa lịch sử đã chia sẻ.|Tùy chọn commit nào thay commit cuối?|--amend|amend
recovering-lost-commits|Cứu commit thất lạc|Commit còn trong reflog có thể được gắn lại bằng ref trước khi bị dọn rác.|Lệnh nào tìm object ID sau khi reset nhầm?|git reflog|recoverLost
fix-last-message|Sửa thông điệp cuối|Có thể sửa subject commit cuối mà không thay nội dung tệp.|Lệnh nào sửa message commit cuối mà không mở editor?|git commit --amend -m|fixMessage
resetting-single-file|Hoàn tác một tệp|restore với pathspec tác động đúng tệp được chọn, tránh làm mất các thay đổi khác.|Lệnh nào phục hồi một tệp từ HEAD?|git restore|restoreOne
detached-head|Cứu commit khi detached HEAD|Commit tạo ở detached HEAD cần nhánh giữ lại trước khi chuyển chỗ khác.|Lệnh nào tạo nhánh tại commit đang checkout?|git switch -c|detached
recovering-branches|Khôi phục nhánh đã xóa|Xóa nhánh không xóa ngay commit; reflog hoặc object ID giúp tạo lại ref.|Lệnh nào tạo lại tên nhánh tại object ID đã tìm được?|git branch|recoverBranch
stash-as-undo|Stash để tạm cất|Stash giữ thay đổi chưa commit trong ref riêng để chuyển việc tạm thời.|Lệnh nào cất thay đổi hiện tại?|git stash push|stash
hard-reset-to-origin|Đồng bộ cứng với origin|reset --hard origin/main loại bỏ commit và sửa đổi local; chỉ dùng trong sandbox bài tập.|Ref nào là mốc đích khi muốn khớp nhánh main từ origin?|origin/main|resetOrigin
`),
  track('remote', 'Remote và GitHub mô phỏng', `
remotes-push-pull|Remote, push và pull|Remote là tên gắn với địa chỉ repository; push gửi ref, pull fetch rồi tích hợp.|Lệnh nào gửi nhánh main lên origin?|git push origin main|remote
pull-request-workflow|Quy trình pull request|PR đề xuất thay đổi từ nhánh tính năng, sau đó có review và merge; bài tập dùng remote local.|Trước khi mở PR, nhánh tính năng cần được gửi bằng lệnh nào?|git push|remote
fork-upstream|Fork và upstream|Fork có origin riêng; upstream trỏ về dự án gốc để nhận cập nhật.|Tên remote thường đặt cho dự án gốc là gì?|upstream|addUpstream
ssh-keys|Xác thực bằng khóa SSH|Khóa công khai có thể chia sẻ; khóa riêng phải giữ bí mật và không commit.|Phần nào của cặp SSH được phép đưa lên dịch vụ?|public key|
personal-access-tokens|Token truy cập cá nhân|Token có quyền hạn và hạn dùng; bài mô phỏng không yêu cầu token thật.|Nơi an toàn để lưu token CI là gì?|secret|
multiple-remotes|Nhiều remote|Một repository có thể có origin, upstream và staging cho các luồng khác nhau.|Lệnh nào liệt kê tên và URL của các remote?|git remote -v|addUpstream
renaming-remotes|Đổi tên và xóa remote|Đổi tên remote giữ URL nhưng đổi cách tham chiếu; xóa remote bỏ cấu hình local.|Lệnh con nào đổi tên một remote?|git remote rename|renameRemote
prune-stale-branches|Dọn nhánh remote cũ|Prune xóa remote-tracking ref không còn trên remote, không xóa nhánh local.|Lệnh nào dọn ref đã biến mất khỏi origin?|git remote prune|prune
pushing-tags|Đẩy tag|Push nhánh không tự động gửi mọi tag; cần đẩy tag riêng hoặc dùng --tags.|Lệnh nào gửi tag v1.0.0 lên origin?|git push origin v1.0.0|pushTag
force-with-lease|Force push có kiểm tra|--force-with-lease từ chối ghi đè nếu remote đã đổi kể từ lần fetch của mình.|Tùy chọn nào bảo vệ khỏi ghi đè commit mới của đồng đội?|--force-with-lease|
github-cli|GitHub CLI cơ bản|gh có thể tạo và xem PR; trong bài offline ta chỉ chọn cú pháp, không gọi GitHub.|Lệnh gh nào tạo pull request?|gh pr create|
branch-protection|Quy tắc bảo vệ nhánh|Branch protection có thể yêu cầu review và kiểm tra CI trước merge; bài này là mô phỏng.|Điều kiện nào ngăn merge khi test chưa đạt?|required status checks|
`),
  track('release-ops', 'Phát hành và vận hành', `
tagging|Đánh dấu phiên bản|Tag đặt tên ổn định cho commit phát hành, độc lập với nhánh đang di chuyển.|Lệnh nào tạo annotated tag v1.0.0?|git tag -a|tag
file-operations|Thao tác tệp bằng Git|git mv và git rm cập nhật index cùng lúc với thao tác tệp.|Lệnh nào đổi tên tệp và stage kết quả?|git mv|fileop
stash-cherry-pick|Stash và cherry-pick|Stash cất việc dở; cherry-pick sao chép một commit sang nhánh hiện tại.|Lệnh nào sao chép commit từ nhánh khác?|git cherry-pick|stashCherry
semver|Quy tắc phiên bản ngữ nghĩa|MAJOR đổi khi phá tương thích; MINOR thêm tính năng tương thích; PATCH sửa lỗi tương thích.|Thêm tính năng tương thích từ 1.2.3 sẽ thành phiên bản nào?|1.3.0|
annotated-vs-lightweight-tags|Hai kiểu tag|Annotated tag là object riêng có thông điệp; lightweight tag chỉ là ref.|Kiểu tag nào lưu thông điệp và tác giả tag?|annotated|tag
tag-signing|Ký tag|Chữ ký tag giúp kiểm tra nguồn gốc khi có khóa tin cậy; bài offline không tạo khóa thật.|Tùy chọn git tag nào yêu cầu ký tag bằng khóa đã cấu hình?| -s|
release-branches|Nhánh phát hành|Release branch tách phần ổn định trước ngày phát hành để sửa lỗi mà không chặn tính năng mới.|Tiền tố tên nhánh nào phù hợp cho bản 2.0?|release/|releaseBranch
hotfix-branches|Nhánh sửa lỗi khẩn|Hotfix xuất phát từ bản đang phát hành, rồi cần hợp nhất ngược về nhánh phát triển.|Tiền tố tên nhánh nào phù hợp cho sửa lỗi production?|hotfix/|hotfix
changelog-generation|Tạo CHANGELOG|Lịch sử commit có cấu trúc giúp nhóm thay đổi thành ghi chú phát hành.|Tệp nào thường ghi thay đổi theo từng phiên bản?|CHANGELOG.md|changelog
commit-signing|Ký commit|Chữ ký xác thực người nắm khóa; tên và email trong commit tự chúng không chứng minh danh tính.|Lệnh log nào yêu cầu hiển thị chữ ký commit?|git log --show-signature|
`),
  track('advanced', 'Kỹ thuật Git nâng cao', `
interactive-rebase|Rebase tương tác|Rebase tương tác cho phép sửa, đổi thứ tự, squash hoặc bỏ commit chưa chia sẻ.|Tùy chọn nào mở danh sách thao tác rebase?| -i|squashHistory
worktrees|Nhiều worktree|Một repository có thể checkout nhiều nhánh trong các thư mục khác nhau.|Lệnh nào thêm worktree mới?|git worktree add|worktree
submodules|Repository con dạng submodule|Superproject lưu gitlink tới commit cụ thể của repository con; cần cập nhật con riêng.|Lệnh nào thêm một repository local làm submodule?|git submodule add|submodule
hooks-automation|Hook và tự động hóa|Hook chạy trong các thời điểm Git xác định; chỉ chạy mã đáng tin cậy từ sandbox.|Hook nào chạy trước khi tạo commit?|pre-commit|
reordering-commits|Đổi thứ tự commit|Đổi thứ tự bằng rebase tạo lại commit và có thể phát sinh xung đột.|Tác vụ nào trong rebase tương tác giữ commit nhưng đổi thứ tự dòng?|pick|reorder
squashing-autosquash|Squash và autosquash|Commit fixup có thể tự được đưa sát commit đích khi rebase --autosquash.|Tiền tố message nào đánh dấu commit sửa cho autosquash?|fixup!|squashHistory
splitting-commit|Tách một commit|Tách commit giúp mỗi thay đổi độc lập; thường dừng rebase, reset và commit từng phần.|Lệnh reset nào bỏ commit nhưng giữ nội dung staged?|git reset --soft|split
cherry-pick-series|Chép chuỗi commit|Có thể cherry-pick một dải commit, giữ thứ tự phụ thuộc.|Lệnh nào sao chép một commit sang nhánh hiện tại?|git cherry-pick|cherrySeries
git-notes|Ghi chú trên commit|Notes thêm metadata vào commit mà không đổi object ID của commit.|Lệnh nào xem ghi chú của HEAD?|git notes show|notes
sparse-checkout|Checkout thưa|Sparse checkout chỉ hiện một phần working tree, trong khi lịch sử vẫn đầy đủ.|Lệnh nào đặt tập đường dẫn cần hiện trong cone mode?|git sparse-checkout set|sparse
partial-clones|Clone thiếu blob|Partial clone giữ đồ thị commit và tải blob khi cần; một số remote local không hỗ trợ filter.|Bộ lọc nào bỏ qua blob lúc clone?|blob:none|
custom-refs|Ref tùy chỉnh|Ref ngoài heads và tags vẫn là tên trỏ đến object; công cụ có thể tạo namespace riêng.|Lệnh nào cập nhật một ref bằng object ID mới?|git update-ref|ref
octopus-merge|Merge nhiều nhánh|Octopus merge gộp nhiều nhánh trong một commit có hơn hai parent.|Merge main với ba nhánh khác tạo bao nhiêu parent?|4|octopus
`),
  track('daily-workflows', 'Quy trình hằng ngày', `
perfect-commit|Commit tập trung|Một commit nên phục vụ một mục đích rõ ràng, dễ review và dễ đảo ngược.|Lệnh nào stage từng phần thay đổi thay vì cả tệp?|git add -p|commit
trunk-based|Phát triển trên trunk|Nhánh ngắn được hợp nhất sớm để giảm phân kỳ dài ngày.|Nhánh trung tâm thường có tên gì trong bài tập?|main|branch
aliases|Alias tiết kiệm thao tác|Alias local giúp rút ngắn lệnh lặp lại mà không sửa cấu hình toàn máy.|Khóa cấu hình nào tạo alias st?|alias.st|alias
maintenance|Bảo trì repository|Git có lệnh kiểm tra tính toàn vẹn và tối ưu object, nên dùng sau khi hiểu phạm vi tác động.|Lệnh nào kiểm tra tính toàn vẹn object?|git fsck|
conventional-commits|Thông điệp commit có cấu trúc|Tiền tố type và dấu hai chấm giúp công cụ phân nhóm thay đổi.|Subject nào đúng dạng cho tính năng mới: feat: them hay update?|feat: them|message
pre-commit-hooks|Hook trước commit|Pre-commit hook có thể chặn commit lỗi; hook local không tự được chia sẻ khi clone.|Hook nào chạy trước khi Git ghi commit mới?|pre-commit|
husky-lint-staged|Husky và lint-staged mô phỏng|Husky quản lý hook trong dự án Node; lint-staged chỉ chạy công cụ trên tệp đã stage.|Công cụ nào chọn tệp staged cho linter?|lint-staged|
reviewing-pr-locally|Xem PR ở máy local|Fetch nhánh đề xuất rồi so sánh với main trước khi chạy kiểm thử.|Lệnh nào xem diff giữa main và nhánh feature?|git diff main...feature|fetch
backporting|Đưa sửa lỗi về bản cũ|Backport thường cherry-pick commit sửa lỗi sang nhánh release cũ rồi kiểm tra lại.|Lệnh nào chép riêng commit sửa lỗi?|git cherry-pick|cherry
long-running-features|Tính năng dài với cờ bật tắt|Feature flag cho phép merge phần chưa bật vào trunk mà không cần nhánh sống quá lâu.|Cơ chế nào giữ tính năng mới tắt ở production?|feature flag|flag
rebasing-long-lived|Cập nhật nhánh sống lâu|Rebase lên main mới giúp nhánh tính năng sớm giải quyết phân kỳ, nhưng viết lại commit local.|Lệnh nào đưa nhánh hiện tại lên main mới?|git rebase main|rebase
sync-forks|Đồng bộ fork|Fork nhận thay đổi từ upstream rồi tích hợp vào nhánh local trước khi push origin.|Lệnh nào tải thay đổi từ upstream mà chưa merge?|git fetch upstream|fetch
`),
  track('internals', 'Cấu trúc bên trong Git', `
git-directory|Thư mục .git|.git chứa object, ref, index và cấu hình; không nên chỉnh thủ công khi lệnh Git đủ dùng.|Tệp nào trong .git lưu staging index?|index|
object-database|Kho lưu trữ object|Git định danh object theo nội dung; cùng nội dung tạo cùng object ID trong cùng định dạng.|Thư mục nào dưới .git chứa object?|objects|
blobs-trees-commits|Đồ thị blob, tree, commit|Commit trỏ tree và parent; tree trỏ blob hoặc tree con tạo thành đồ thị có hướng.|Object nào ghi cây thư mục của snapshot?|tree|
refs-and-symbolic-refs|Ref và symbolic ref|Ref thông thường trỏ object ID; symbolic ref trỏ tên ref khác như HEAD.|Symbolic ref nào cho biết nhánh đang checkout?|HEAD|ref
index-format|Cấu trúc index|Index ghi đường dẫn, mode và object ID đã stage; Git cập nhật nó qua các lệnh add và restore.|Lệnh plumbing nào liệt kê bản ghi index?|git ls-files --stage|
packfiles|Tệp đóng gói packfile|Git nén nhiều object vào packfile để tiết kiệm chỗ, không đổi nghĩa object.|Phần mở rộng tệp chứa dữ liệu pack là gì?|.pack|
gc-internals|Dọn rác Git|git gc gom object và chỉ dọn object không còn được tham chiếu khi đủ điều kiện.|Lệnh nào chạy bảo trì gom object?|git gc|
reachability|Khả năng truy cập object|Object còn reachable từ ref hoặc reflog chưa bị xem là rác.|Tên nào giữ commit có thể truy cập qua nhánh?|ref|
loose-vs-packed|Object rời và đã đóng gói|Object rời và packed là hai cách lưu cùng dữ liệu; object ID không đổi.|Định dạng nào gom nhiều object trong một tệp?|packfile|
plumbing-vs-porcelain|Lệnh thấp và cao|Plumbing thao tác các thành phần nội bộ; porcelain hướng tới thao tác người dùng.|git cat-file thuộc lớp lệnh nào?|plumbing|
three-way-merge|Cơ chế merge ba phía|Git so sánh base, ours và theirs để ghép thay đổi hoặc báo xung đột.|Phiên bản chung trước khi hai nhánh tách ra gọi là gì?|merge base|merge
`),
  track('teamwork', 'Làm việc nhóm và review', `
reviewing-with-diff|Review bằng diff|Review tốt đối chiếu thay đổi với mục tiêu và kiểm tra cả dòng bị xóa.|Lệnh nào xem diff giữa main và feature theo merge base?|git diff main...feature|
pr-lifecycle|Vòng đời PR mô phỏng|PR đi từ đề xuất, review, sửa phản hồi đến merge; bài offline dùng nhánh local.|Bước nào cần trước merge khi nhóm yêu cầu người khác xem mã?|review|remote
reviewing-branches-locally|Xem nhánh người khác ở local|Fetch nhánh review rồi chạy thử trong sandbox thay vì chỉ đọc giao diện web.|Lệnh nào tải ref từ origin trước khi checkout?|git fetch origin|fetch
resolving-conflicts-team|Cùng giải quyết xung đột|Khi giải quyết xung đột, cần xác nhận ý định cả hai phía trước khi commit.|Sau khi sửa tệp xung đột, bước Git tiếp theo là gì?|git add|conflict
co-authoring|Ghi công đồng tác giả|Trailer Co-authored-by ghi người cùng viết trong phần thân commit, không thay author chính.|Trailer chuẩn để ghi đồng tác giả bắt đầu bằng gì?|Co-authored-by:|coauthor
pair-workflows|Làm việc cặp|Một người gõ, một người review; commit nên có thông điệp rõ và ghi nhận đóng góp phù hợp.|Trailer nào ghi nhận người cùng lập trình?|Co-authored-by:|coauthor
repo-onboarding|Giúp thành viên mới bắt đầu|README cần chỉ rõ cách cài, chạy test và quy ước nhánh để người mới tự làm được.|Tệp nào nên chứa hướng dẫn bắt đầu dự án?|README.md|docs
documentation-conventions|Quy ước tài liệu|Tài liệu nằm cùng mã và được review trong commit để không lệch hành vi.|Tệp nào thường giới thiệu mục tiêu và cách chạy dự án?|README.md|docs
`),
  track('forensics', 'Điều tra lịch sử', `
bisect-basics|Bisect cơ bản|Đánh dấu mốc tốt và xấu để Git đề xuất commit giữa khoảng cần kiểm tra.|Subject commit gây lỗi trong app.txt là gì?|Thêm lỗi|
bisect-automated|Bisect tự động|git bisect run gọi script kiểm tra: mã 0 là tốt, mã 1 đến 127 là xấu.|Subject commit đầu tiên thêm lỗi vào app.txt là gì?|Thêm lỗi|
pickaxe-string|Tìm chuỗi trong lịch sử|-S tìm commit làm đổi số lần xuất hiện một chuỗi cố định.|Subject commit thêm TOKEN_DEMO là gì?|Thêm chuỗi mẫu|
pickaxe-regex|Tìm regex trong diff|-G tìm các dòng diff khớp regex, khác cách đếm chuỗi của -S.|Subject commit thêm dòng “loi” là gì?|Thêm lỗi|
blame-deep|Blame nâng cao|blame có thể bỏ qua khoảng trắng và giới hạn dòng để bớt nhiễu khi điều tra.|Ai là tác giả dòng chứa “loi” trong app.txt?|Minh|
log-search-strategies|Chiến lược tìm bằng log|Kết hợp bộ lọc tác giả, đường dẫn và message để giảm ứng viên rồi xác minh bằng show.|Ai là tác giả commit “Thêm lỗi”?|Minh|
finding-leaked-secrets|Tìm lần lộ bí mật|Secret đã xóa ở HEAD vẫn có thể nằm trong commit cũ; cần tìm lần thêm đầu tiên.|Subject commit đầu tiên thêm TOKEN_DEMO là gì?|Thêm chuỗi mẫu|
filter-repo-surgery|Xử lý lịch sử lộ bí mật mô phỏng|Viết lại lịch sử đổi object ID; vẫn phải thu hồi secret và phối hợp các bản clone.|Sau khi phát hiện token thật đã lộ, hành động khẩn cấp trước tiên là gì?|thu hồi token|
`),
];

export const ROADMAP_LESSON_COUNT = 116;
