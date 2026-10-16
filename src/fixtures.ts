import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commit, git, init, write } from './git.js';

/** Fixture cho bài chỉ trả lời: repo phải chứa sẵn trạng thái mà câu hỏi nhắc tới. */
export interface Fixture {
  /** Mô tả bằng tiếng Việt những gì có trong repo; hiện trong phần nhiệm vụ. */
  note: string;
  /** Gợi ý thứ hai: lệnh nên thử để tự quan sát, không nêu đáp án. */
  hint: string;
  setup(repo: string): Promise<void>;
}

const base = async (repo: string): Promise<void> => {
  await init(repo);
  await write(repo, 'README.md', 'Bài tập Git offline\n');
  await commit(repo, 'Khởi tạo');
};
const sibling = (repo: string, name: string): string => path.join(path.dirname(repo), name);
const bareOrigin = async (repo: string): Promise<string> => {
  const remote = sibling(repo, 'origin.git');
  await git(repo, 'init', '--bare', '-b', 'main', remote);
  await git(repo, 'remote', 'add', 'origin', remote);
  await git(repo, 'push', '-u', 'origin', 'main');
  return remote;
};
const identity = async (repo: string): Promise<void> => {
  await git(repo, 'config', 'user.name', 'Git Training');
  await git(repo, 'config', 'user.email', 'git-training@example.invalid');
  await git(repo, 'config', 'commit.gpgsign', 'false');
};

/** Lịch sử dùng cho nhóm điều tra: app.txt qua bốn commit của Lan và Minh. */
export async function history(repo: string, lesson: string): Promise<void> {
  await base(repo);
  await git(repo, 'config', 'user.name', 'Lan');
  await write(repo, 'app.txt', 'dong dau\n');
  await commit(repo, 'Tạo ứng dụng');
  await git(repo, 'config', 'user.name', 'Minh');
  await write(repo, 'app.txt', 'dong dau\nTOKEN_DEMO\n');
  await commit(repo, 'Thêm chuỗi mẫu');
  await write(repo, 'app.txt', 'dong dau\nTOKEN_DEMO\nloi\n');
  await commit(repo, 'Thêm lỗi');
  if (lesson === 'file-history-renames') {
    await git(repo, 'mv', 'app.txt', 'app-renamed.txt');
    await commit(repo, 'Đổi tên tệp ứng dụng');
  }
  if (lesson === 'finding-leaked-secrets') {
    await write(repo, 'app.txt', 'dong dau\nloi\n');
    await commit(repo, 'Xóa chuỗi mẫu');
  }
  await git(repo, 'config', 'user.name', 'Git Training');
}

/** Ba loại thay đổi cùng lúc: chưa stage, đã stage và chưa theo dõi. */
async function workingState(repo: string): Promise<void> {
  await base(repo);
  await write(repo, 'bai.txt', 'Dòng 1\nDòng 2\n');
  await commit(repo, 'Tạo bai.txt');
  await write(repo, 'cau-hinh.txt', 'mau=xanh\n');
  await commit(repo, 'Thêm cấu hình');
  await write(repo, 'bai.txt', 'Dòng 1\nDòng 2\nDòng 3 mới sửa, chưa stage\n');
  await write(repo, 'README.md', 'Bài tập Git offline\nĐã sửa và đã stage\n');
  await git(repo, 'add', 'README.md');
  await write(repo, 'moi.txt', 'Tệp mới, chưa được theo dõi\n');
}

/** Repo có thư mục con để xem blob, tree và commit. */
async function objectsRepo(repo: string): Promise<void> {
  await base(repo);
  await write(repo, 'src/app.txt', 'Mã nguồn\n');
  await write(repo, 'docs/huong-dan.txt', 'Hướng dẫn\n');
  await commit(repo, 'Thêm src và docs');
}

async function packedRepo(repo: string, extraLoose: boolean): Promise<void> {
  await objectsRepo(repo);
  await write(repo, 'src/them.txt', 'Thêm\n');
  await commit(repo, 'Thêm tệp thứ hai');
  await git(repo, 'repack', '-a', '-d', '-q');
  if (extraLoose) {
    await write(repo, 'moi.txt', 'Object rời mới\n');
    await commit(repo, 'Thêm object rời');
  }
}

async function sampleHooks(repo: string): Promise<void> {
  await base(repo);
  const hooks = path.join(repo, '.git', 'hooks');
  await mkdir(hooks, { recursive: true });
  const samples: Record<string, string> = {
    'pre-commit.sample': '#!/bin/sh\n# Mẫu hook: chạy trước khi Git ghi commit; thoát khác 0 sẽ chặn commit.\nexit 0\n',
    'commit-msg.sample': '#!/bin/sh\n# Mẫu hook: kiểm tra thông điệp commit sau khi bạn nhập xong.\nexit 0\n',
    'pre-push.sample': '#!/bin/sh\n# Mẫu hook: chạy trước khi push.\nexit 0\n',
  };
  for (const [name, body] of Object.entries(samples)) await writeFile(path.join(hooks, name), body, { flag: 'wx' }).catch(() => undefined);
}

async function branchesFixture(repo: string): Promise<void> {
  await base(repo);
  await git(repo, 'switch', '-c', 'da-merge');
  await write(repo, 'a.txt', 'A\n');
  await commit(repo, 'Việc đã xong');
  await git(repo, 'switch', 'main');
  await git(repo, 'merge', 'da-merge');
  await git(repo, 'switch', '-c', 'chua-merge');
  await write(repo, 'b.txt', 'B\n');
  await commit(repo, 'Việc đang làm');
  await git(repo, 'switch', 'main');
}

async function diffBranches(repo: string): Promise<void> {
  await base(repo);
  await git(repo, 'switch', '-c', 'feature');
  await write(repo, 'feature.txt', 'Tính năng\n');
  await commit(repo, 'Thêm tính năng');
  await git(repo, 'switch', 'main');
  await write(repo, 'main.txt', 'Main tiến thêm\n');
  await commit(repo, 'Main tiến thêm');
}

async function rangeDiffRepo(repo: string): Promise<void> {
  await base(repo);
  await git(repo, 'switch', '-c', 'topic-v1');
  await write(repo, 'a.txt', 'A\n');
  await commit(repo, 'Bước 1');
  await write(repo, 'b.txt', 'B\n');
  await commit(repo, 'Bước 2');
  await git(repo, 'switch', 'main');
  await write(repo, 'main.txt', 'Main tiến thêm\n');
  await commit(repo, 'Main tiến thêm');
  await git(repo, 'switch', '-c', 'topic-v2', 'topic-v1');
  await git(repo, 'rebase', 'main');
  await write(repo, 'b.txt', 'B đã sửa sau review\n');
  await git(repo, 'commit', '-a', '--amend', '--no-edit');
  await git(repo, 'switch', 'main');
}

async function reflogRepo(repo: string): Promise<void> {
  await base(repo);
  await write(repo, 'a.txt', 'A\n');
  await commit(repo, 'Commit A');
  await write(repo, 'b.txt', 'B\n');
  await commit(repo, 'Commit B');
  await git(repo, 'reset', '--hard', 'HEAD~1');
  await git(repo, 'switch', '-c', 'nhanh-phu');
}

async function reachabilityRepo(repo: string): Promise<void> {
  await base(repo);
  await git(repo, 'switch', '-c', 'giu-lai');
  await write(repo, 'giu.txt', 'Được giữ bởi nhánh\n');
  await commit(repo, 'Được giữ');
  await git(repo, 'switch', 'main');
  await git(repo, 'switch', '--detach');
  await write(repo, 'mo-coi.txt', 'Không tên nào trỏ tới\n');
  await commit(repo, 'Mồ côi');
  await git(repo, 'switch', 'main');
  await git(repo, 'reflog', 'expire', '--expire=now', '--all');
}

async function danglingBlob(repo: string): Promise<void> {
  await objectsRepo(repo);
  const temp = path.join(repo, '.git', 'mo-coi.tmp');
  await writeFile(temp, 'Nội dung không thuộc commit nào\n', 'utf8');
  await git(repo, 'hash-object', '-w', temp);
  await rm(temp, { force: true });
}

async function forceLeaseRepo(repo: string): Promise<void> {
  await base(repo);
  const remote = await bareOrigin(repo);
  const mate = sibling(repo, 'dong-doi');
  await git(repo, 'clone', remote, mate);
  await identity(mate);
  await write(mate, 'dong-doi.txt', 'Việc của đồng đội\n');
  await commit(mate, 'Commit của đồng đội');
  await git(mate, 'push', 'origin', 'main');
  await write(repo, 'toi.txt', 'Việc của tôi\n');
  await commit(repo, 'Commit của tôi');
}

async function partialCloneRepo(repo: string): Promise<void> {
  await objectsRepo(repo);
  await git(repo, 'config', 'uploadpack.allowFilter', 'true');
  await git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
}

const fx = (note: string, hint: string, setup: (repo: string) => Promise<void>): Fixture => ({ note, hint, setup });
const inHistory = (lesson: string) => (repo: string) => history(repo, lesson);
const HISTORY_NOTE = 'Repo có tệp app.txt với lịch sử bốn commit do Lan và Minh tạo (kèm commit Khởi tạo).';

export const fixtures: Record<string, Fixture> = {
  'foundations/status-log-diff': fx(
    'Trong repo có sẵn ba commit và ba loại thay đổi: bai.txt đã sửa nhưng chưa stage, README.md đã sửa và đã stage, moi.txt là tệp mới chưa được theo dõi.',
    'Chạy git status để thấy từng loại thay đổi, rồi thử các lệnh xem nội dung thay đổi và so sánh kết quả giữa chúng.', workingState),
  'foundations/three-trees': fx(
    'Trong repo, bai.txt đã sửa nhưng chưa stage, README.md đã sửa và đã stage, moi.txt chưa được theo dõi.',
    'Chạy git status và git diff --staged để xem nội dung nào sẽ đi vào commit kế tiếp, rồi gọi tên vùng chứa nó.', workingState),
  'foundations/object-model': fx(
    'Repo có một commit chứa README.md và hai thư mục src, docs.',
    'Dùng git ls-tree -r HEAD để lấy ID của một tệp, rồi git cat-file -t <ID> để xem loại object.', objectsRepo),
  'foundations/head-and-refs': fx(
    'Repo đang đứng ở nhánh tinh-nang (không phải main) với một commit riêng.',
    'Xem nội dung tệp .git/HEAD, rồi dùng git help -a để tìm lệnh Git đọc symbolic ref.',
    async repo => { await base(repo); await git(repo, 'switch', '-c', 'tinh-nang'); await write(repo, 'tinh-nang.txt', 'Việc mới\n'); await commit(repo, 'Việc trên tinh-nang'); }),
  'foundations/file-modes': fx(
    'Repo có chay.sh (tệp thực thi) và ghi-chu.txt (tệp thường), cả hai đã commit.',
    'Dùng git ls-files --stage hoặc git ls-tree HEAD để xem mode của từng tệp rồi so sánh.',
    async repo => {
      await base(repo);
      await write(repo, 'chay.sh', '#!/bin/sh\necho xin chao\n');
      await write(repo, 'ghi-chu.txt', 'Tệp thường\n');
      await git(repo, 'add', 'chay.sh', 'ghi-chu.txt');
      await git(repo, 'update-index', '--chmod=+x', 'chay.sh');
      await git(repo, 'commit', '-m', 'Thêm tệp thực thi và tệp thường');
    }),
  'branching/listing-branches': fx(
    'Repo có hai nhánh ngoài main: da-merge (đã hợp nhất vào main) và chua-merge (còn commit chưa hợp nhất). Bạn đang ở main.',
    'Mở git branch -h để xem các tùy chọn lọc theo trạng thái merge, rồi thử và so sánh kết quả.', branchesFixture),
  'inspection/blame': fx(`${HISTORY_NOTE} Dòng “loi” nằm trong app.txt.`, 'Dùng git blame app.txt và đọc cột tên tác giả của đúng dòng.', inHistory('blame')),
  'inspection/grep-pickaxe': fx(`${HISTORY_NOTE} Chuỗi TOKEN_DEMO xuất hiện trong lịch sử của app.txt.`, 'Dùng git log -S TOKEN_DEMO để liệt kê commit làm đổi số lần chuỗi xuất hiện; chú ý thứ tự cũ đến mới.', inHistory('grep-pickaxe')),
  'inspection/shortlog': fx(`${HISTORY_NOTE} Hai commit mới nhất cùng một tác giả.`, 'Dùng git shortlog -sn HEAD hoặc git log --format="%an %s" để xem tác giả của từng commit.', inHistory('shortlog')),
  'inspection/bisect': fx(`${HISTORY_NOTE} Lỗi là dòng “loi” trong app.txt.`, 'Dùng git log -p app.txt hoặc git bisect với mốc tốt là commit Khởi tạo để tìm commit đầu tiên có dòng loi.', inHistory('bisect')),
  'inspection/log-filters': fx(`${HISTORY_NOTE}`, 'Dùng git log --format="%an | %s" hoặc git log --author=... để đối chiếu tác giả với từng commit.', inHistory('log-filters')),
  'inspection/inspecting-commits': fx(`${HISTORY_NOTE}`, 'Dùng git log để tìm commit “Thêm lỗi”, rồi git show --stat <commit> để xem tệp nó sửa.', inHistory('inspecting-commits')),
  'inspection/file-history-renames': fx('Repo có app-renamed.txt, tệp này vừa được đổi tên trong commit gần nhất; lịch sử cũ của nó nằm dưới tên khác.', 'Dùng git log --follow --name-status -- app-renamed.txt để thấy tên cũ.', inHistory('file-history-renames')),
  'inspection/pickaxe-detail': fx(`${HISTORY_NOTE} Chuỗi TOKEN_DEMO được thêm vào ở một commit.`, 'Dùng git log -S TOKEN_DEMO --format=%s, hoặc git log -G TOKEN_DEMO -p để xem dòng diff.', inHistory('pickaxe-detail')),
  'inspection/diff-strategies': fx(`${HISTORY_NOTE}`, 'Dùng git show --stat HEAD hoặc git diff HEAD~1 HEAD --name-only.', inHistory('diff-strategies')),
  'inspection/range-diff': fx(
    'Repo có hai phiên bản của cùng một chuỗi hai commit: topic-v1 và topic-v2 (bản sau đã rebase lên main mới và sửa commit “Bước 2”). Bạn đang ở main.',
    'Dùng git log --oneline --graph --all để thấy hai dải; tìm lệnh so sánh dải main..topic-v1 với main..topic-v2 trong git help.', rangeDiffRepo),
  'undo/reflog': fx(
    'Repo vừa trải qua vài thao tác: hai commit, một lần reset --hard lùi một commit rồi chuyển sang nhánh nhanh-phu. Commit B không còn trong git log nữa.',
    'So sánh git log với nhật ký mọi lần HEAD di chuyển để tìm commit B; dùng git help -a để tìm lệnh nhật ký đó.', reflogRepo),
  'remote/ssh-keys': fx(
    'Bài mô phỏng, không dùng khóa thật. Thư mục ssh-demo trong repo chứa hai tệp giả: id_demo và id_demo.pub (chưa được theo dõi).',
    'Đọc nội dung hai tệp trong ssh-demo để biết tệp nào được phép gửi cho dịch vụ như GitHub và tệp nào phải giữ kín.',
    async repo => {
      await base(repo);
      await write(repo, 'ssh-demo/id_demo', 'GIA LAP - khong phai khoa that.\nTep nay la phan BI MAT, chi nam tren may cua ban.\n');
      await write(repo, 'ssh-demo/id_demo.pub', 'ssh-demo-gia-lap AAAAGIALAP demo@example.invalid\nTep nay la phan co the dang ky len dich vu.\n');
    }),
  'remote/personal-access-tokens': fx(
    'Bài mô phỏng, không dùng token thật. Repo có .github/workflows/ci.yml; workflow này cần một token CI và đọc nó từ một nơi lưu riêng chứ không ghi thẳng vào tệp.',
    'Đọc ci.yml, tìm dòng gán giá trị cho token và xem nó lấy từ đâu.',
    async repo => {
      await base(repo);
      await write(repo, '.github/workflows/ci.yml', 'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ./kiem-thu.sh\n        env:\n          CI_TOKEN: ${{ secrets.CI_TOKEN }}\n');
      await commit(repo, 'Thêm workflow CI');
    }),
  'remote/force-with-lease': fx(
    'Repo có remote origin. Đồng đội đã push commit “Commit của đồng đội” lên origin/main mà bạn chưa fetch, còn bạn có commit “Commit của tôi” chưa push. Thử các cách push trong sandbox này thoải mái; mở lại bài sẽ đặt lại trạng thái.',
    'Thử git push, rồi thử các biến thể có thêm tùy chọn ép; xem git push -h để biết tùy chọn nào chỉ ghi đè khi remote chưa đổi so với lần fetch gần nhất.', forceLeaseRepo),
  'remote/github-cli': fx(
    'Bài mô phỏng: không cần cài hay đăng nhập gh. Repo đang ở nhánh tinh-nang với một commit sẵn sàng để mở pull request.',
    'Lệnh gh có nhóm con pr; nếu đã cài gh, chạy gh pr --help để xem lệnh con tạo PR.',
    async repo => { await base(repo); await git(repo, 'switch', '-c', 'tinh-nang'); await write(repo, 'tinh-nang.txt', 'Đề xuất\n'); await commit(repo, 'Thêm tính năng cần review'); }),
  'remote/branch-protection': fx(
    'Bài mô phỏng, không gọi GitHub. Tệp .github/branch-protection.json mô tả các quy tắc bảo vệ nhánh main.',
    'Đọc tệp JSON và tìm quy tắc nói về kiểm thử/CI phải đạt trước khi merge.',
    async repo => {
      await base(repo);
      await write(repo, '.github/branch-protection.json', '{\n  "branch": "main",\n  "required_status_checks": { "strict": true, "contexts": ["test"] },\n  "required_pull_request_reviews": { "required_approving_review_count": 1 },\n  "enforce_admins": true\n}\n');
      await commit(repo, 'Mô tả quy tắc bảo vệ nhánh');
    }),
  'release-ops/semver': fx(
    'Repo có tag v1.2.3 (bản đang phát hành) và một commit sau đó: “feat: thêm tùy chọn tương thích ngược”.',
    'Dùng git describe --tags, git tag và git log v1.2.3..HEAD --oneline, rồi áp dụng quy tắc MAJOR.MINOR.PATCH.',
    async repo => { await base(repo); await git(repo, 'tag', 'v1.2.3'); await write(repo, 'tuy-chon.txt', 'Tùy chọn mới, không phá vỡ API cũ\n'); await commit(repo, 'feat: thêm tùy chọn tương thích ngược'); }),
  'release-ops/tag-signing': fx(
    'Bài mô phỏng: không cần khóa GPG hay SSH thật. Repo chỉ có vài commit để bạn tra cứu cách dùng git tag.',
    'Chạy git tag -h hoặc git help tag và tìm dòng mô tả việc tạo tag đã ký.',
    async repo => { await base(repo); await write(repo, 'ghi-chu.txt', 'Chuẩn bị phát hành\n'); await commit(repo, 'Chuẩn bị phát hành'); }),
  'release-ops/commit-signing': fx(
    'Bài mô phỏng: không cần khóa thật. Repo có vài commit chưa ký; lệnh đúng vẫn chạy được và sẽ không hiện chữ ký nào, đó là kết quả bình thường.',
    'Chạy git log -h hoặc git help log, tìm tùy chọn nói về chữ ký (signature).',
    async repo => { await base(repo); await write(repo, 'ghi-chu.txt', 'Commit chưa ký\n'); await commit(repo, 'Thêm ghi chú'); }),
  'advanced/hooks-automation': fx(
    'Thư mục .git/hooks của repo có các hook mẫu đuôi .sample (chưa chạy vì chưa bỏ đuôi). Mỗi tên tệp cho biết thời điểm hook chạy.',
    'Liệt kê .git/hooks và đọc chú thích đầu mỗi tệp mẫu để biết nó chạy ở thời điểm nào.', sampleHooks),
  'advanced/partial-clones': fx(
    'Repo này đã bật cho phép clone có bộ lọc (uploadpack.allowFilter). Bạn có thể thử clone ra thư mục cạnh repo bằng URL file:// trỏ tới repo này (clone bằng đường dẫn thường sẽ bỏ qua bộ lọc).',
    'Xem git help clone, mục --filter, rồi thử clone ra ../ban-sao với thêm --no-checkout; sau đó git config remote.origin.partialclonefilter và git rev-list --objects --missing=print --all (dòng bắt đầu bằng dấu ?) cho thấy blob chưa tải.', partialCloneRepo),
  'daily-workflows/maintenance': fx(
    'Repo có vài commit và một object mồ côi (dangling blob) không thuộc commit nào; lệnh kiểm tra toàn vẹn sẽ báo nó, đó chưa phải lỗi hỏng dữ liệu.',
    'Tìm trong git help lệnh “verify the connectivity and validity of the objects”, rồi chạy thử.', danglingBlob),
  'daily-workflows/pre-commit-hooks': fx(
    'Bài mô phỏng, không chạy mã lạ. Thư mục .git/hooks có các hook mẫu .sample; hook cục bộ nằm trong .git nên không được chia sẻ khi clone.',
    'Liệt kê .git/hooks và đọc chú thích trong các tệp mẫu để tìm hook chạy trước khi ghi commit.', sampleHooks),
  'daily-workflows/husky-lint-staged': fx(
    'Bài mô phỏng, không cần Node hay npm. Repo có package.json (cấu hình công cụ lint cho tệp staged), .husky/pre-commit và một tệp đã stage src/index.js.',
    'Đọc package.json và .husky/pre-commit, tìm công cụ được gọi để chỉ lint các tệp đang staged.',
    async repo => {
      await base(repo);
      await write(repo, 'package.json', '{\n  "name": "mo-phong",\n  "scripts": { "lint": "eslint ." },\n  "devDependencies": { "husky": "^9.0.0", "lint-staged": "^15.0.0" },\n  "lint-staged": { "*.js": "eslint --fix" }\n}\n');
      await write(repo, '.husky/pre-commit', 'npx lint-staged\n');
      await commit(repo, 'Cấu hình husky');
      await write(repo, 'src/index.js', 'console.log("xin chao");\n');
      await git(repo, 'add', 'src/index.js');
    }),
  'internals/git-directory': fx('Repo có vài commit; thư mục .git là kho nội bộ của Git.', 'Liệt kê thư mục .git (ls .git hoặc dir .git) và nhận ra tệp nhị phân lưu vùng staging.', objectsRepo),
  'internals/object-database': fx('Repo có vài commit; mỗi object được lưu bên dưới .git.', 'Liệt kê .git rồi đi vào thư mục có các thư mục con tên hai ký tự hex.', objectsRepo),
  'internals/blobs-trees-commits': fx('Repo có một commit chứa README.md và hai thư mục src, docs.', 'Chạy git cat-file -p HEAD và xem dòng đầu: nó trỏ tới object nào.', objectsRepo),
  'internals/index-format': fx('Repo có các tệp đã commit và một tệp mới đã stage (them-vao-index.txt).', 'Tìm trong git help lệnh plumbing liệt kê tệp trong index, và tùy chọn hiện mode, object ID, số stage.',
    async repo => { await objectsRepo(repo); await write(repo, 'them-vao-index.txt', 'Mới stage\n'); await git(repo, 'add', 'them-vao-index.txt'); }),
  'internals/packfiles': fx('Object của repo đã được đóng gói vào một tệp pack nằm dưới .git/objects/pack.', 'Liệt kê .git/objects/pack và xem các tệp ở đó; chú ý tệp dữ liệu và tệp chỉ mục.', repo => packedRepo(repo, false)),
  'internals/gc-internals': fx('Repo có nhiều object rời chưa được gom (xem git count-objects -v).', 'Chạy git count-objects -v, tìm lệnh bảo trì gom object (git help), chạy rồi so sánh lại.', objectsRepo),
  'internals/reachability': fx(
    'Repo có nhánh giu-lai giữ commit “Được giữ”, cùng một commit “Mồ côi” không còn nhánh, tag hay reflog nào trỏ tới.',
    'So sánh git log --all với git fsck --unreachable; thử git branch --contains <commit> trên từng commit để thấy thứ giữ nó.', reachabilityRepo),
  'internals/loose-vs-packed': fx('Repo có hai nhóm object: phần lớn đã đóng gói, nhưng commit cuối còn là object rời.', 'Chạy git count-objects -v để so sánh số object rời với số object trong pack, rồi xem .git/objects.', repo => packedRepo(repo, true)),
  'internals/plumbing-vs-porcelain': fx('Repo có vài commit để bạn thử các lệnh nội bộ như git cat-file.', 'Chạy git cat-file -p HEAD, rồi đọc git help git ở phần phân loại lệnh “plumbing” và “porcelain”.', objectsRepo),
  'teamwork/reviewing-with-diff': fx(
    'Repo có nhánh feature tách từ main, nhưng main đã tiến thêm một commit sau đó (main.txt). Bạn đang ở main.',
    'So sánh git diff main..feature với git diff main...feature (hai chấm và ba chấm) rồi chọn dạng chỉ hiện thay đổi của feature từ điểm tách.', diffBranches),
  'forensics/bisect-basics': fx(`${HISTORY_NOTE} Lỗi là dòng “loi” trong app.txt.`, 'Dùng git bisect start / bad / good với commit Khởi tạo làm mốc tốt, hoặc git log -p app.txt.', inHistory('bisect-basics')),
  'forensics/bisect-automated': fx(`${HISTORY_NOTE} Một lệnh kiểm tra hợp lệ là: tệp app.txt không chứa dòng loi.`, 'Dùng git bisect start, đánh dấu HEAD là bad và commit Khởi tạo là good, rồi ở mỗi bước đọc app.txt xem còn dòng loi không (git bisect good hoặc bad). Kết thúc bằng git bisect reset.', inHistory('bisect-automated')),
  'forensics/pickaxe-string': fx(`${HISTORY_NOTE} Chuỗi TOKEN_DEMO xuất hiện trong app.txt.`, 'Dùng git log -S TOKEN_DEMO --format=%s.', inHistory('pickaxe-string')),
  'forensics/pickaxe-regex': fx(`${HISTORY_NOTE} Cần tìm dòng khớp “loi” trong diff.`, 'Dùng git log -G "^loi$" --format=%s.', inHistory('pickaxe-regex')),
  'forensics/blame-deep': fx(`${HISTORY_NOTE} Dòng “loi” nằm trong app.txt.`, 'Dùng git blame -L để chọn dòng cần xem rồi đọc tên tác giả.', inHistory('blame-deep')),
  'forensics/log-search-strategies': fx(`${HISTORY_NOTE}`, 'Dùng git log --format="%an | %s" hoặc git log --grep="Thêm lỗi" --format=%an.', inHistory('log-search-strategies')),
  'forensics/finding-leaked-secrets': fx(`${HISTORY_NOTE} Ở commit cuối chuỗi TOKEN_DEMO đã bị xóa khỏi app.txt nhưng vẫn còn trong lịch sử.`, 'Dùng git log -S TOKEN_DEMO --reverse --format=%s và lấy commit đầu tiên trong danh sách.', inHistory('finding-leaked-secrets')),
  'forensics/filter-repo-surgery': fx(
    `Bài mô phỏng, không chạy git filter-repo và không dùng token thật. ${HISTORY_NOTE} Hãy coi TOKEN_DEMO là một token THẬT đã bị đẩy lên remote công khai.`,
    'Nghĩ về thứ tự ưu tiên: viết lại lịch sử không làm token cũ hết hiệu lực nếu đã có người sao chép nó.', inHistory('filter-repo-surgery')),
};
