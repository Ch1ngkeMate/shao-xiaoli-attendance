# 邵小利干事考勤系统：AI 开发交接说明

> 本文是后续开发者或 AI 的入口文档。最后核对：2026-09-06；代码基线：`main` 分支、提交 `dc00ebc`。环境变量、数据库内容、服务器进程和微信平台配置属于运行态信息，接手前必须重新核验，不能只依赖本文。

## 1. 目标、范围与边界

这是陕西中医药大学邵小利志愿服务队宣传部的内部考勤系统，包含：Web 管理端、微信小程序、Next.js API、MySQL/MariaDB 数据库和文件归档。

- Web：任务发布/接取/审核、会议与值班、请假、消息公告、月报、账号管理、成果档案。
- 小程序：使用同一 API，Bearer Token 登录；其源代码是 `miniprogram/`。
- 角色：`ADMIN`（全部管理）、`MINISTER`（业务管理）、`MEMBER`（普通部员）。
- 不要把「个人任务提交凭证」当成「公共成果」。前者用于审核，重新提交可能替换旧内容；公共成果是一任务一份、全员可查看的长期档案。

## 2. 技术与目录

| 层 | 当前实现 |
| --- | --- |
| Web/API | Next.js 16 App Router、React 19、TypeScript、Ant Design 6 |
| 数据 | Prisma 7 + MySQL/MariaDB |
| 认证 | `jose` JWT；Web 用 Cookie，小程序用 `Authorization: Bearer` |
| 小程序 | 原生 WXML/WXSS/JavaScript + Animal Island 主题组件 |
| 进程/代理 | PM2 + Nginx，应用监听本机 `127.0.0.1:3000` |

```text
src/app/                 页面与 Route Handlers（/api）
src/components/          Web 共用组件；导航以 AppShell 为准
src/lib/                 鉴权、Prisma、任务规则、上传、报表等业务逻辑
prisma/schema.prisma     唯一数据模型来源
prisma/migrations/       已提交的、不可重写的生产迁移
scripts/                 管理员初始化、环境检查、报表脚本
miniprogram/             微信小程序完整源码
docs/                    项目/交接文档
```

## 3. 本地开发与必经校验

前提：Node.js 20+、可用的 MySQL/MariaDB 实例。不要把真实 `.env`、数据库导出、上传材料或微信密钥提交进 Git。

```powershell
git clone https://github.com/Ch1ngkeMate/shao-xiaoli-attendance.git
cd "D:\develop\xiang_mu\shao-xiaoli-attendance"
Copy-Item .env.example .env
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

每次涉及 Web/API/Prisma 的改动至少执行：

```powershell
npx prisma generate
npx prisma validate
npx tsc --noEmit
npm run build
git diff --check
```

小程序改动至少执行：在微信开发者工具打开 `miniprogram/`，重新编译、查看 Console，并按受影响路径做模拟器和真机验证。小程序的上传、体验版、审核、发布必须由拥有微信公众平台权限的人手动完成。

## 4. 环境变量与密钥规则

模板见 `.env.example`；真实值只保留在本机安全密钥库或生产服务器环境中。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 必填；`mysql://` 或 `mariadb://` 连接串 |
| `AUTH_SECRET` | 必填；JWT 签名密钥，生产应为随机长值 |
| `SESSION_COOKIE_SECURE` | 生产 HTTPS 保持默认安全值；仅临时 HTTP 调试才设 `false` |
| `LOCAL_UPLOADS_DIR` | 推荐的服务器外持久化上传目录 |
| `BLOB_READ_WRITE_TOKEN` | 可选；配置后用 Vercel Blob 存储 |
| `WX_APPID` / `WX_SECRET` | 小程序登录；只在服务端 |
| `WX_TASK_TMPL_ID` / `WX_MEETING_TMPL_ID` | 微信订阅消息模板 |
| `CRON_SECRET` | 任务滞留通知的定时接口鉴权 |

提交前强制检查：`git diff --cached --name-only`。不得提交 `.env`、密码、Token、数据库、`node_modules`、`.next` 或用户上传的材料。

## 5. 数据、权限与成果档案规范

### Prisma 迁移

1. 同时改 `prisma/schema.prisma` 与新建迁移目录；绝不修改已经在线上执行的旧迁移。
2. 本地先 `npx prisma migrate dev --name <英文短名>`，审阅生成 SQL，再提交 schema 和 migration。
3. 上线仅执行 `npx prisma migrate deploy`，不要在生产执行 `migrate dev` 或 `db push`。
4. 迁移前备份数据库；迁移后用登录态验证真实功能，而不仅是命令成功。

### 成果档案（当前实现）

- `TaskSubmission` / `EvidenceImage`：个人审核凭证，权限与生命周期受提交/审核流程影响。
- `TaskOutcome`：每个任务最多一份公共成果；所有登录用户可以查看。
- `TaskOutcomeAsset`：归档附件，类型 `IMAGE`、`VIDEO`、`DOCUMENT`；单文件上限 50 MB，支持 JPG/PNG/WebP/GIF、MP4/WebM/MOV、PDF。
- 参与该任务者或 `ADMIN`/`MINISTER` 可上传；管理人员可编辑摘要和外链；普通用户只能删除自己上传的文件。
- 归档命名必须为 `姓名+活动名称+内容`，内容只能是 `微推`、`海报`、`视频`、`其他`；系统显示提交时间。对应校验与 API 在 `src/app/api/tasks/[id]/outcome/route.ts`。
- Web 总目录：`/outcomes` 与 `GET /api/outcomes`；小程序目录：`miniprogram/pages/outcomes/`，任务大厅入口在 `pages/tasks/tasks.wxml`。

## 6. Web 与小程序的对齐规范

### API 与权限

- 新功能必须先明确：谁可读、谁可写、谁可删，以及未登录/无权限时的返回行为。
- Web 通过 `readSessionCookie()` 鉴权；小程序使用同一函数兼容 Bearer。不要只在页面隐藏按钮而遗漏 API 权限检查。
- API 的错误应返回可读的 `{ message }`；小程序 `utils/request.js` 已统一处理 401（清 Session 回登录）和 403。
- 新增通用功能时，至少判断 Web 是否需要导航入口，以及小程序是否需要可发现入口；不要仅在某个详情页悄悄加功能。

### UI

- Web：复用 Ant Design 和 `src/components/AppShell.tsx`。新增主功能要加入左侧菜单；页面内容宽度遵循 AppShell 的 `maxWidth: 1100`，任务详情类内容应与主体卡片同宽，避免独立区块突宽。
- 小程序：保持 Animal Island 风格。全局样式入口是 `miniprogram/app.wxss`，可复用 `card`、`input`、`tag`、`empty` 等全局类与 `components/icon`、`components/divider`。不要将 Web 的 Ant Design CSS 直接移植到 WXSS。
- 小程序新增页必须同时添加 `.js`、`.json`、`.wxml`、`.wxss`，并在 `miniprogram/app.json` 的 `pages` 注册。若新增 tab，需一并准备普通/激活图标，并检查 `app.js` 中消息角标索引。
- 请求基址集中在 `miniprogram/utils/config.js`，当前为 `https://shaoxiaoli.top`。修改域名先验证 HTTPS、微信 request/uploadFile 合法域名和真机请求，不能只在开发者工具关闭校验。

## 7. Git、提交与 GitHub

- 远程仓库：`https://github.com/Ch1ngkeMate/shao-xiaoli-attendance.git`；主分支 `main`。
- 目前本机 GitHub 连接使用本地 Xray SOCKS 代理 `127.0.0.1:10808`。代理服务未启动时，先恢复代理，不要反复修改远程地址或泄露凭据。
- 提交只 `git add` 本次相关文件，保持提交信息：`feat:`、`fix:`、`docs:`、`chore:`。数据库结构提交必须包含 `schema.prisma` 和对应 migration。
- 推送前运行 `git status`、`git diff --check`；推送后确认 `git log -1 --oneline` 与 GitHub 一致。
- 生产服务器工作区曾存在历史脏改动；没有审计和备份前，不得执行 `git reset --hard`、`git clean` 或覆盖 `.env`。

## 8. 生产服务器与 SSH

生产站点：`https://note.shaoxiaoli.top`。应用目录、Nginx 和进程名已经过实际运行核对：

| 项 | 当前值 |
| --- | --- |
| 服务器 | `8.156.86.244` |
| SSH 用户 | `admin` |
| 应用目录 | `/www/wwwroot/nextjs-app` |
| PM2 进程 | `nextjs-app` |
| Next.js 上游 | `127.0.0.1:3000` |
| Nginx 配置 | `/etc/nginx/conf.d/nextjs.conf` |
| PM2 保存状态 | `/root/.pm2/dump.pm2` |

### SSH 安全连接

在被授权的终端使用（不要把密码写进命令、文档或仓库）：

```bash
ssh admin@8.156.86.244
```

建议使用受保护的 SSH 私钥/系统密钥管理器，或由项目负责人通过安全渠道临时提供凭据。当前机器若仅有密码、没有私钥，`BatchMode` 验证会失败是预期行为。取得权限后优先执行：

```bash
hostname
cd /www/wwwroot/nextjs-app
pwd
sudo pm2 status
sudo nginx -t
curl -fsS http://127.0.0.1:3000/api/version
```

不要打印 `.env`、数据库连接串、JWT/微信密钥，也不要在 AI 对话中粘贴它们。

## 9. 标准生产部署（Web/API）

**GitHub 推送不等于已上线。** 小程序提交不触发服务器部署；纯小程序改动也不需要重启生产 Web。

服务器内存不足时线上 `next build` 曾 OOM，因此常用可靠流程是：本机完成构建，将源码和已构建的 `.next` 分别打包上传，服务器执行迁移、Prisma 生成并重启 PM2。不要上传 `.next/dev`。

```powershell
# 本机：先完成第 3 节校验和 git push；以下只表达原则，路径与压缩工具可按环境调整
npm run build
# 传输源码（排除 .env、node_modules、.next、uploads）与产物（排除 .next/dev）到服务器临时目录
```

```bash
# 服务器：确认备份与目录无误后
cd /www/wwwroot/nextjs-app
npx prisma migrate deploy
npx prisma generate
sudo pm2 restart nextjs-app --update-env
sudo pm2 save
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:3000/api/version
```

如果服务器内存允许，也可在服务器执行 `npm ci` 与 `npm run build`；低内存时可用 `NEXT_BUILD_LOW_MEM=1 npm run build`，但它会跳过构建期 TypeScript/ESLint 检查，因此必须先在本机运行相应校验。

成果上传上线时还须确认：Nginx server 块有 `client_max_body_size 50m;`，`LOCAL_UPLOADS_DIR` 位于项目目录外并有备份，且 `/uploads/` 的 Nginx alias 与实际目录一致。

## 10. 发布后验收与故障定位

最小验收序列：

1. `curl -fsS https://note.shaoxiaoli.top/api/version` 返回 200。
2. Web 登录、任务列表、角色管理入口和目标功能均可用。
3. 涉及数据库时确认 `prisma migrate deploy` 无待执行/失败迁移。
4. 涉及上传时测试一张图片和一份目标类型文件，再确认其他登录用户可访问应公开的材料。
5. 涉及小程序时：开发者工具重新编译、真机验证登录和请求；随后由负责人上传体验版/提交审核/发布。

出现 502 时按顺序检查：`sudo pm2 status` → `sudo pm2 logs nextjs-app --lines 100` → `ss -lntp | grep 3000` → `sudo nginx -t` → 上游 `curl` → 公网 `/api/version`。不要将本地 `.env` 错误直接断定为生产根因。

## 11. 已知运行与文档注意事项

- `docs/DEVELOPMENT_REPORT.md` 是较早的开发报告，其中的目录、迁移数量、`deploy.sh` 和 PM2 名称存在历史内容；运维以本文、第 8 节的实时核查和当前仓库文件为准。
- 仓库当前不存在 `deploy.sh`，不要照旧文档执行它。
- `next.config.ts` 的 `NEXT_BUILD_LOW_MEM` 会忽略构建期类型/ESLint 错误；只能作为服务器资源受限的补救，不能替代本机校验。
- 生产证书、DNS、服务器账号、微信合法域名和计划任务都可能变化；接手当天应重新检查，不要盲目复用历史状态。

## 12. 接手 AI 的工作流程

1. 先读本文、`README.md`、`prisma/schema.prisma`、目标页面/API 与相关迁移。
2. `git status` 先确认用户未提交修改；不要覆盖不属于本次任务的文件。
3. 设计前先写清角色权限、数据迁移、Web/小程序入口和上传影响。
4. 实现时保持 Web、小程序、API 和 Prisma 的字段/文案一致。
5. 执行相应校验，报告具体结果和未验证部分。
6. 经用户授权才部署服务器；经用户手动操作才发布小程序。

