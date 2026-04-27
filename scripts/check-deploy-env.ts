/**
 * 上线前自检：在服务器进入项目目录后执行 `npm run deploy:check`
 * 仅检查本机环境变量与构建相关项；无法在云端替你放行端口或配域名。
 */
import "dotenv/config";

function fail(msg: string): never {
  console.error(`\x1b[31m✖\x1b[0m ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function warn(msg: string) {
  console.log(`\x1b[33m!\x1b[0m ${msg}`);
}

const auth = process.env.AUTH_SECRET?.trim();
const db = process.env.DATABASE_URL?.trim();

if (!auth) fail("缺少 AUTH_SECRET（生产环境必须设置，且勿与开发环境共用弱密码）");
if (auth.length < 16) warn("AUTH_SECRET 建议至少 32 字符随机串（当前偏短）");
else ok("AUTH_SECRET 已设置");

if (!db) fail("缺少 DATABASE_URL");
else ok("DATABASE_URL 已设置");

if (!/^mysql:\/\//i.test(db) && !/^mariadb:\/\//i.test(db)) {
  warn("DATABASE_URL 应以 mysql:// 或 mariadb:// 开头（当前项目使用 MySQL / MariaDB）");
}

if (process.env.NODE_ENV === "production") {
  ok("NODE_ENV=production");
  const cookieSecure = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (cookieSecure === "false" || cookieSecure === "0") {
    warn("SESSION_COOKIE_SECURE=false：会话 Cookie 可在 HTTP 下使用（仅建议内网/IP 调试，对外请改回并启用 HTTPS）");
  } else {
    warn("生产环境默认会话 Cookie 为 Secure：仅用 HTTP（如 IP 访问）时浏览器不会保存登录态，请配置 HTTPS 或在调试阶段设置 SESSION_COOKIE_SECURE=false");
  }
} else {
  warn("当前非 production：上线请设置 NODE_ENV=production");
}

const localUploadsDir = process.env.LOCAL_UPLOADS_DIR?.trim();

if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
  ok("已配置 BLOB_READ_WRITE_TOKEN（使用 Blob 存储）");
} else if (localUploadsDir) {
  ok(`已设置 LOCAL_UPLOADS_DIR（本机持久目录）：${localUploadsDir}`);
  warn(
    "请在 Nginx 中为 /uploads/ 配置 alias 指向该目录（与 URL 子路径一致），例如：location /uploads/ { alias /你的绝对路径/; }（注意末尾斜杠与目录权限）",
  );
} else {
  warn("未配置 BLOB_READ_WRITE_TOKEN：将使用本地上传目录（请确保服务器磁盘与备份策略）");
  if (process.env.NODE_ENV === "production") {
    warn(
      "生产环境未配 Blob 且未设置 LOCAL_UPLOADS_DIR：默认写入项目内 public/uploads，整包覆盖部署易丢图；请设置 LOCAL_UPLOADS_DIR 指向项目外目录并配 Nginx alias，或改用 Blob",
    );
  }
}

console.log(
  "\n若服务器内存较小、next build 在「Running TypeScript」被 Kill：可执行 NEXT_BUILD_LOW_MEM=1 npm run build，或在本机/CI 构建后上传 .next（详见 next.config.ts 注释）。",
);
console.log("\n以下须你在阿里云 / 域名 / 宝塔控制台自行完成，脚本无法代操作：");
console.log("  · 安全组放行 TCP 80、443（及 SSH 22）");
console.log("  · 域名 A 记录指向服务器公网 IP");
console.log("  · 宝塔站点 + 反向代理到 Node 端口 + SSL 证书");
console.log("  · 在阿里云或宝塔开启定期快照 / 数据库备份\n");
