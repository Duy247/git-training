#!/usr/bin/env node

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  process.stderr.write('git-training: Cần Node.js 22 trở lên. Hãy cập nhật Node.js rồi chạy lại.\n');
  process.exitCode = 1;
} else {
  import('../dist/cli.js').catch(error => {
    process.stderr.write(`git-training: ${error.message}\n`);
    process.exitCode = 1;
  });
}
