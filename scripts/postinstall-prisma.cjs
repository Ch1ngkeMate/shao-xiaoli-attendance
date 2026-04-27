/**
 * npm postinstall：默认执行 prisma generate。
 * 小内存 VPS 上可与 npm ci 抢内存被 Kill，可先设 SKIP_PRISMA_GENERATE=1 装依赖，再单独运行 npx prisma generate。
 */
if (process.env.SKIP_PRISMA_GENERATE === "1" || process.env.SKIP_PRISMA_GENERATE === "true") {
  console.log("[postinstall] 已跳过 prisma generate（SKIP_PRISMA_GENERATE=1），请稍后执行: npx prisma generate");
  process.exit(0);
}

const path = require("node:path");
const { execSync } = require("node:child_process");
const root = path.join(__dirname, "..");
execSync("npx prisma generate", {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  shell: true,
});
