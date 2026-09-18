# 邵小利干事考勤系统：AI 开发交接说明

> 本文是后续开发者或 AI 的入口文档。最后核对：2026-09-17；代码基线：`main` 分支、提交 `dc00ebc`。环境变量、数据库内容、服务器进程和微信平台配置属于运行态信息，接手前必须重新核验，不能只依赖本文。
>
> ⚠️ **注意同名文件**：仓库里存在两份交接说明 —— 根目录本文（含第 13 节，最新）与 `docs/AI_HANDOFF.md`（只到第 12 节，已过时）。**以根目录本文为准**；`README.md` 末尾的链接指向的是 `docs/` 那份。更新交接内容时请改本文，避免两份继续分叉。
>
> 📌 **第 13 节是当前进度，接手必读。** 其中 13.2 已更新为「部署脚本已重写」，`scripts/build-and-upload.ps1` 现在可安全用于生产。
>
> 📌 **当前工作区有多个 Agent 的未提交改动**，不要用 `git reset --hard` / `git clean` / 整目录覆盖来「整理」。

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

## 13. 2026-09-17 当前进度（接手必读）

用户明确要求本次**只部署个人主页修复**，后续课程表、设置页、成果、值班等改动完成后再另行补上。当前工作区仍有多个 Agent 的未提交改动，接手时不要用 `git reset --hard`、`git clean` 或整目录覆盖来“整理”。

已完成并上线的范围：

- 仅将个人主页接口 `src/app/api/admin/users/[id]/profile/route.ts` 的多月份查询修复构建并部署；没有部署课程表、成果、值班或其它未完成功能。
- 生产构建号：`h3jogye1CgAct2ux3nqVL`；`/api/version` 在本机上游及两个公网域名均返回 HTTP 200。
- PM2 `nextjs-app` 已重启并保存；原生产构建保留在 `/www/wwwroot/nextjs-app/.next.bak-h3jogye1CgAct2ux3nqVL`，需要回滚时先确认目标再操作。
- 本次没有 Prisma schema 变化或数据库迁移；远程临时压缩包已清理。

尚未完成：

- 小程序端 `miniprogram/pages/others/profile.*` 的错误态修复、折叠面板和相关样式仍只在本地源码中；服务器部署不会自动更新微信小程序。需在微信开发者工具中重新编译、真机验证，再由有权限的负责人上传体验版/发布。
- 课程表导入、手动添加/修改、设置页自定义起始页等其它功能仍处于开发/报告阶段，不能随本次个人主页部署发布。
- 任何新的生产部署都必须先得到用户明确授权，并重新构建只包含目标范围的产物。

### 13.1 个人主页报错排查补充（2026-09-17 13:50 追加）

真机首测时截图同时出现「用户不存在」和 toast「缺少或无效的 month（格式 YYYY-MM）」，定位为**两个叠加问题**：

1. **部署时点问题**：报错文案来自旧构建。排查手法：**界面上的报错文案先在仓库里 `grep`**，搜不到就说明跑的不是当前代码。本机 `.next/BUILD_ID` 与线上构建号不同属正常（本地会重新构建）。
2. **真 bug（已修，待随小程序发布）**：`profile.js` 在接口报错时只写 `loadError`，**没有清空 `profileUser`**。WXML 是 `wx:if → wx:elif="{{loadError}}" → wx:elif="{{profileUser}}"` 链，残留的旧用户数据会被提前命中，导致**错误页显示上一个人的资料**（比报错更危险）。现已在失败分支复位 `profileUser` / `attendance` / `monthGroups` / `hasAnyRecord`，并新增 `onRetry()`。

对应测试：`scripts/test-profile-monthly.cjs`（22 项，含 400 错误态、缺 `user` 字段、重试恢复）、`scripts/test-profile-api-months.cjs`（13 项）、`scripts/check-wxml.cjs`（WXML 结构校验，21 文件）。

### 13.2 部署脚本已重写（2026-09-17 二次更新）

**原先两个脚本都与第 8 节的实时拓扑不一致，已于 2026-09-17 重写为安全版本。** 原问题记录如下（供追溯）：

| 脚本 | 原问题 |
| --- | --- |
| `scripts/build-and-upload.ps1` | ① `$projectPath` 是旧路径 `D:\develop\cursor Pro\shao-xiaoli-attendance`；② 用户写成 `root@shaoxiaoli.top`，第 8 节核实为 `admin@8.156.86.244`；③ 生产上执行 `rm -rf .next` 再解压，中途失败会直接 502 且无回滚 |
| `scripts/deploy-lite.sh` | PM2 名称默认 `attendance-app`，实际是 `nextjs-app`；依赖服务器 `git pull`，而第 7 节明确服务器工作区有历史脏改动，不可直接 pull |

#### 现在的 `scripts/build-and-upload.ps1`

本地一键构建 + 安全部署。参数：`-SkipBuild`（复用已有 `.next`）、`-NoDeploy`（只构建打包）、`-SkipPrisma`、`-NonInteractive`。

执行序列：

1. 前置检查：路径存在、`npm/ssh/scp` 可用、**工作区有未提交改动时必须人工确认**。
2. 构建前校验：`prisma validate` → `tsc --noEmit` → `git diff --check`，任一失败立即中止且不上传。
3. `npm run build`，随后强校验 `.next/BUILD_ID`、`routes-manifest.json`、`server/` 是否齐全。
4. 打包：**用 .NET `ZipFile` 而非 `Compress-Archive`**（后者进度条刷屏且慢），排除 `.next/dev` 与 `.next/cache`。
5. 打印目标服务器/目录/PM2 名/构建号/验收地址，**二次确认后才动生产**。
6. 上传到 `/tmp/sxl-deploy-<时间戳>/`，**不直接碰应用目录**。
7. 服务器端脚本（关键）：`cp -a .next .next.bak-<旧buildId>` → 解压到 `.next.new` 校验 `BUILD_ID` → `mv` 原子切换 → 失败自动回滚。任一步非零退出会打印手工回滚命令。
8. 可选 `prisma migrate deploy + generate`（`-SkipPrisma` 跳过）。
9. `pm2 restart --update-env && pm2 save`，等 4 秒后拉 `https://note.shaoxiaoli.top/api/version`，
   **比对 `buildId` 与本次构建号**；不一致则打印 `pm2 status / logs / ss -lntp / nginx -t` 排查序列并以非零退出。

> 踩过的坑：`$PSScriptRoot` **不能在 param 块的默认值里求值**——通过 `powershell -File` 调用时那里还是空的，会让 `Join-Path` 直接抛错。已改为脚本体内解析。

#### 现在的 `scripts/deploy-lite.sh`

**职责收窄为「用已上传的 zip 替换生产并重启」，已删除 `git pull` / `npm ci` / `prisma migrate deploy`。** 理由写在脚本头部：服务器工作区有历史脏改动不可 pull、服务器内存不足不适合构建、迁移不该每次部署都跑。

```bash
bash scripts/deploy-lite.sh /tmp/sxl-deploy-xxx/next.zip   # 部署
bash scripts/deploy-lite.sh --list                          # 列出所有构建备份
bash scripts/deploy-lite.sh --rollback                      # 回滚到最近一次备份
```

同样具备：备份 → 暂存解压 → 原子切换 → 重启 → 拉 `/api/version` 验收，失败提示回滚命令。`PM2_NAME` / `PROJECT_DIR` / `VERIFY_URL` 均可用环境变量覆盖，默认值已与第 8 节对齐。

> **正常路径用 PowerShell 那个脚本即可**；`deploy-lite.sh` 保留给没有 PowerShell 的环境和手工回滚。

#### 部署前仍需人工确认的事

- 服务器内存：本次流程在本地构建、只上传产物，不依赖服务器算力。
- 涉及 Prisma schema 变化时不要加 `-SkipPrisma`，且提交里必须包含对应 migration。
- 部署后按第 10 节做最小验收；小程序端改动**不会**随服务器部署生效。

### 13.3 补充修复：`✕` 移除接取与点头像的冒泡隔离（2026-09-17 晚）

头像跳转上线后复查 `miniprogram/pages/tasks/detail.*` 发现一处**权限相关的边界隐患**，已修：

- 「已接取人员」的标签 `.claimant-tag` 现在是可点击的（`catchtap="onOpenProfile"`），内层还嵌着管理员的移除按钮 `✕`。
- 两者虽然都写的 `catchtap`（正常不会冒泡），但渲染层实现/基础库版本差异下有互相干扰的风险。若 `✕` 的点击被外层接住，管理员点「移除成员」会先弹出**该成员的个人主页**——行为怪异，且在真机上很难复现归因。
- 修法（`detail.js` `onRemoveTap`）：进函数先校验事件源。`✕` 的 `e.currentTarget` 只有 `claim-id`；标签外层才带 `user-id`。因此 `if (!claimId || ds.userId) return;` 可直接挡掉串扰，无需依赖渲染层行为。

同批校验（全绿）：`test-profile-monthly.cjs` 22/22、`test-profile-api-months.cjs` 13/13、`check-wxml.cjs` 21 文件 0 错误。均为小程序源码改动，**需随下次小程序上传一起发布**，不影响服务器构建。

### 13.4 图片路径补全（fixUrl）与登录页错误处理（2026-09-17 追加）

真机反馈「图片/头像显示不出来、进不去」+ 登录页弹「请求失败 (500)」，定位为**两个独立问题**。

#### 问题一：`fixUrl` 静默返回死链（重要）

后端本地上传（无 `BLOB_READ_WRITE_TOKEN` 时）返回的是**相对路径** `/uploads/avatar/<uuid>.png`，小程序里必须补成完整 https 地址才能加载。旧实现：

```js
const app = getApp();
const base = app ? (app.globalData.apiBase || '') : '';   // ← 一旦拿不到就静默变 ''
return base + (url.startsWith('/') ? '' : '/') + url;      // ← 产出 '/uploads/...' 死链
```

问题在于**失败是静默的**：`getApp()` 不可用 / `globalData.apiBase` 缺失时，base 变成空串，函数照样返回一个「看起来像路径」的字符串，`<image>` 只是白屏，控制台不报错。同类隐式失败还有一处——`pages/settings/settings.js` 曾自己手写 `const fix = (u) => ...app.globalData.apiBase...` 重复实现，同样没有兜底。

修法（`miniprogram/utils/format.js`）：

1. 取 base 的优先级改为 **`app.globalData.apiBase` → `require('./config').getApiBase()` → 原样返回**，`getApp()` 调用包在 `try/catch` 里。
2. `pages/settings/settings.js` 两处手写拼接删除，统一调 `fixUrl`。
3. 补上 `pages/tasks/detail.js` 里**唯一漏掉的一处**：提交审核列表（管理员视图）的 `s.user.avatarUrl`。
4. `pages/settings/settings.js` 的 `uploadAvatar` 不再把 `res.url`（相对路径）直接写进 storage，改用 `PUT /api/me` 回传的 `user` 覆盖缓存，与 `/api/me` 返回结构保持一致。

> 排查口诀：**小程序的 `<image>` 白屏且控制台干净，先怀疑 URL 补全**，把最终 src 打出来看是不是 `/uploads/...` 这种相对路径。

#### 问题二：登录页「请求失败 (500)」

`request.js` 对非 2xx 一律 `reject(new Error(res.data.message || \`请求失败 (${statusCode})\`))`。后端 `bind-login` / `wx-login` 在 `code2session` 失败时会把**微信的英文 errmsg 原样透传**，所以真机上看到的就是无指导意义的 500 文案。

修法（`miniprogram/pages/login/login.*`）：

1. 新增 `friendlyError()`，把微信错误码翻译成可执行提示：`40029`→凭证无效请重新点击、`40163`→凭证已被使用稍后重试、`45011`→请求过于频繁、`40013`→AppID 与服务端不一致、`40125`/`未配置微信小程序`→密钥问题联系管理员、裸 `500`→服务端登录接口异常。
2. 新增 `errMsg` 状态 + 表单内 `.login-error` 区块：**toast 会截断长文案**，失败原因同时留一行在页面上。
3. `wx.login` 从 `await wx.login()` 改成显式包装 `fetchWxCode()`（带 `success`/`fail` 回调，兼容性更稳），并让 `wx.login` 自身的失败也进入统一处理。
4. **两个按钮都加 `loading` 期间 `disabled`，方法入口再判 `loading`**：连点会导致同一个 code 被用两次，微信必返 `40163`。
5. 顺手修掉登录页的**隐形图标坑**：旧写法给 `image.brand-logo` 单独设 `background: #fff`，而回落的 `.brand-logo-heart` 是白字 —— logo 图加载失败时会出现「白底白字」，什么都看不见。现拆成外层 `.brand-mark`（渐变底）+ 内层 `.brand-mark-img`，两种状态都可见。

对应测试：`scripts/test-fixurl-and-login.cjs`（29 项：fixUrl 降级链路、静态防回归、登录错误翻译/防连点/失败复位）。

> ⚠️ 仍未定位到「500」的服务端诱因。上面的改动让**失败原因变得可见**，但 500 本身需要看服务器日志才能确定是不是 `WX_APPID`/`WX_SECRET` 缺失或 AppSecret 过期。下次复现时请抓 `pm2 logs nextjs-app --lines 100`，搜 `bind-login` 或 `jscode2session`。

#### 2026-09-17 线上只读诊断补充

已从公网直接发送无效测试请求（不使用真实微信 code，不写数据库）：

- `POST /api/miniprogram/auth/bind-login`，仅传 `realName`：HTTP 500，正文为 `Internal Server Error`；
- `POST /api/miniprogram/auth/wx-login`，传 `invalid_test_code`：HTTP 500，正文为 `Internal Server Error`。

这与当前源码中“缺少参数返回 400、`code2session` 异常返回 502”的处理不一致。因此目前只能确认线上登录链路存在通用 500，**不能仅凭公网响应判断微信密钥是否缺失**；下一步必须在服务器上查看 `sudo pm2 logs nextjs-app --lines 100`，再决定是否需要检查生产 `.env`。本次没有执行 SSH 或修改服务器配置。

#### 本批校验（全绿）

| 脚本 | 结果 |
| --- | --- |
| `test-profile-monthly.cjs` | 22/22 |
| `test-profile-api-months.cjs` | 13/13 |
| `test-fixurl-and-login.cjs` | 29/29 |
| `check-wxml.cjs` | 21 文件 0 错误 |
| `git diff --check` | 干净 |

全部为 `miniprogram/` 与 `scripts/` 改动，**不涉及服务器构建**，需随下次小程序上传一起发布。

### 13.5 🔴 线上登录 500 根因定位（2026-09-17，已解决）

> ⚠️ **本节第一版结论是错的**，已修正。保留纠错过程，因为「推断错在哪」本身有参考价值。
> 正确根因见 **13.7**。本节修正后的价值是：**这套响应特征分析法依然有效**（它能准确判定「崩溃发生在模块加载期」），
> 但它**无法区分是哪个模块、为什么崩** —— 那一步必须看服务器日志。

13.4 末尾停在「无法凭公网响应判断」。**进一步只读探测已把根因锁定**，结论如下。

#### 决定性证据

同时比较「响应头」和「路由健康度」，规律异常干净：

| 路径 | 是否在 middleware 公开白名单 | GET 探测结果 |
| --- | --- | --- |
| `/api/tasks`、`/api/announcements`、`/api/duty`、`/api/meetings`、`/api/outcomes`、`/api/users/assignable`、`/api/admin/users`、`/api/notifications`、`/api/leave` | ❌ 受保护 | **307**（middleware 跳转，**模块从未加载**） |
| `/api/auth/login` | ✅ `api/auth/` | **500** |
| `/api/miniprogram/auth/wx-login` | ✅ `api/miniprogram/auth/` | **500** |
| `/api/miniprogram/auth/bind-login` | ✅ `api/miniprogram/auth/` | **500** |
| `/api/definitely-not-exist` | ❌ | 307 |
| `/api/miniprogram/auth/not-exist` | ✅ | **404 HTML 正常页**（证明路由系统本身健康） |

**500 只出现在「同时在公开白名单 + import `@/lib/prisma`」的这三个接口上。**

补充两条关键观测：

1. **`{}` 空 body、`text/plain` body 也都是 500。** 若进入 handler，zod 校验必然返回我们写的 400 JSON。所以崩溃发生在**模块加载期，不是请求处理期**。
2. **`GET /api/miniprogram/auth/wx-login`（POST-only 接口）返回 500 而非 405。** Next 在模块加载失败时无法判定允许的方法，会直接 500 —— 这是「模块崩了」而非「路由不存在」的判定依据。

对照响应头，进一步区分：

| | 500 的登录接口 | 正常的 `/api/version` |
| --- | --- | --- |
| `Content-Type` | **`text/plain`** | `application/json` |
| `vary` | **无** | `rsc, next-router-state-tree, ...` |
| 正文 | 21 字节 `Internal Server Error` | JSON |

我们所有 route 都返回 `NextResponse.json()`，**必然带 `application/json`**。`text/plain` + 无 `vary` 说明这不是业务代码的返回值。

#### ~~根因~~（❌ 这一版结论是错的，见下方修正）

~~`src/lib/prisma.ts` 第 19 行是**模块顶层立即求值**：~~

```ts
export const prisma: PrismaClient = global.__prisma ?? createPrismaClient();
```

~~而 `createPrismaClient()` 在 `DATABASE_URL` 读不到时**直接 throw**。模块加载期抛异常 → **整个 route 模块注册失败** → Next 返回裸 `text/plain` 500。~~

**❌ 错在哪：** `DATABASE_URL` 一直是好的。服务器 `.env` 第一行就是完整正确的连接串。
拿服务器日志一看，真实报错是：

```
⨯ Error: Failed to load external module @prisma/client-2c3a283f134fdcb6/runtime/client:
  Error: Cannot find module '@prisma/client-2c3a283f134fdcb6/runtime/client'
```

崩溃发生在模块加载期这个**判断是对的**，但**崩的原因判断错了**。
真正原因是 `.next/node_modules/@prisma/client-<hash>` 在打包时被压成了空目录（详见 13.7）。

**教训（重要）：** `text/plain` 500 只能证明「有模块在加载期崩了」，**不能证明是哪个模块、为什么崩**。
环境变量缺失、依赖文件缺失、语法错误、native 模块加载失败……**产生的响应特征完全一样**。
我当时选了最符合自己既有假设的那一个当结论，还写进了文档 —— 这是典型的**用推断替代验证**。
正确做法：这类特征只能用来**缩小范围**（「不用查业务逻辑了，去看构建产物和模块加载」），
定论必须靠服务器日志。

#### 为什么整个系统看着还在跑

**因为绝大多数接口都被 middleware 的 307 挡住了，那条 import 链从来没被真正加载过。**

所以症状不会表现为「全站挂」，而恰恰是「**只有登录进不去**」——
因为只有这几个公开接口能穿透 middleware 走到模块加载那一步。这个伪装性极强的表象，是本次排查最耗时的部分。
（这条分析是对的，与根因无关，仍然成立。）

#### 纠错过程

`DATABASE_URL` 假设一直无法验证，因为**没有 SSH 访问权限**（公钥装不上，见 13.8）。
后来拿到服务器密码，在宝塔终端里跑：

```bash
cd /www/wwwroot/nextjs-app && grep -n 'DATABASE_URL' .env && pm2 logs nextjs-app --lines 50 --nostream
```

第一条输出 `1:DATABASE_URL="mysql://..."` —— **假设当场被推翻**；
第二条直接给出了 `Cannot find module '@prisma/client-<hash>/runtime/client'`。

**一条 `pm2 logs` 就解决了耗掉数小时的推断。** 这是本次最大的教训。

#### 顺带修掉的架构缺陷（保留）

虽然它不是本次 500 的原因，但 `lib/prisma.ts` 的「模块顶层立即 throw」确实是个定时炸弹：

- 失败点离症状太远（一个是 import，一个表现为接口 500），排查成本极高；
- 错误无法被任何 `try/catch` 捕获，**错误信息被 Next 吞掉**，只留下无信息的 `Internal Server Error`；
- 任何**不依赖数据库**的接口，只要与 prisma 同处一个 import 链就会一起挂。

已按「惰性初始化 + 可读错误」改造。详见 13.6。

---

### 13.5-补 🔧 真正的根因与修复（2026-09-17，已解决）

**本节是 13.5 的修正版，读这段就够了。**

#### 真凶：Windows 目录 Junction 在打包时被压成空目录

一句话：**`.next/node_modules/` 里塞的不是真实目录，而是 Windows 的 Junction，打包工具不跟随链接，只写了个空壳。**

完整链条：

1. **Next.js 16 把 external 依赖内联进 `.next/node_modules/`**，并给目录起哈希名：
   ```
   .next/node_modules/@prisma/client-2c3a283f134fdcb6   →  (Junction)  →  node_modules/@prisma/client
   ```
   `.next/server/chunks/` 里的 chunk 把 **`@prisma/client-2c3a283f134fdcb6` 这个哈希路径写死**了。

2. **`ZipFile.CreateFromDirectory` 不跟随 Junction**，只写入一个空目录条目。
   （`Copy-Item -Recurse` 同样不跟随 —— 这点后来验证脚本时又踩了一次。）

3. 传到 Linux 解压后：`.next/node_modules/@prisma/` **存在但是空的**：
   ```
   drwxr-xr-x 3 root root 4096 Sep 17 12:45 .
   drwxr-xr-x 2 root root 4096 Sep 17 12:40 @prisma      ← "2" 说明里头什么都没有
   ```

4. Next 启动 → 按写死的哈希路径加载 → `Cannot find module` → **import prisma 的所有 route 注册失败** → 裸 `text/plain` 500。

**为什么 `npx prisma generate` 修不好：** 它输出到 `src/generated/prisma`（schema 里配的 `output`），
跟 `.next/node_modules/@prisma/client-<hash>` **是两个完全无关的位置**。哈希目录是**构建产物**，不是 npm 包，
只能靠重新构建 + 正确打包传上去。

#### 当时的应急处置（已执行）

```bash
cd /www/wwwroot/nextjs-app \
  && rm -rf .next/node_modules/@prisma/client-2c3a283f134fdcb6 \
  && cp -r node_modules/@prisma/client .next/node_modules/@prisma/client-2c3a283f134fdcb6 \
  && pm2 restart nextjs-app
```

验证：`POST /api/auth/login` 从 `500 | text/plain` 变成 `400 | application/json`（zod 正常返回），
小程序端登录同步恢复。

> 这只是**救火**。根子在打包方式，见下。

#### 根治：打包脚本改为「解引用 Junction」

`scripts/build-and-upload.ps1` 第 3 步已重写：

- **不再用 `ZipFile.CreateFromDirectory`**，改为手工递归遍历 + `CreateEntry` 逐文件写入；
- 遇到 `ReparsePoint`（Junction / 符号链接）时，**用 `$item.Target` 解析出真实路径，把目标内容递归写进去**（解引用）；
- zip 条目名用**显式相对路径**（不能用 `CreateEntryFromFile` 自动推路径，否则绝对路径会变成 zip 内目录名）；
- **打包后自检**：扫描 `.next/node_modules/**` 里形如 `*-<16位hex>` 的目录，若有空的就 `Die` 中止，**坏包绝不外传**。

**双保险：** 服务器端解压后、`mv` 切换**之前**再校验一次同样的条件，为空则 `exit 15` 并保留原 `.next`。
（万一脚本被改坏或有人手工打包，生产也不会被污染。）

#### 验证

新增 `scripts/test-zip-junction-deref.cjs`（6 项断言，全过），用 Node 复刻同一套遍历算法验证：

```
PASS  Next 目录存在且含 BUILD_ID
PASS  打包能解引用 @prisma/client-<hash>（核心）
PASS  原始 .next 里该目录确实是 Junction（证明这个坑真实存在）
PASS  解引用后条目数 > 未解引用时的目录条目数
PASS  排除 dev 与 cache（体积控制）
PASS  关键生产文件齐全（BUILD_ID / routes-manifest / server）

统计：1376 个文件，解引用 2 个链接，原始 148.97 MB
```

**解引用 2 个链接** —— 正是 `@prisma/client-*` 和 `@libsql/client-*`，之前两个都被压成了空壳。

#### 遗留的构建号不一致

线上 `h3jogye1CgAct2ux3nqVL` ≠ 本地 `.next/BUILD_ID` `7SSZg7yYab6tFUrxnQ9T_`。
说明线上那份 `.next` 是**更早某次手工部署的产物**，本地这份新构建从未上传成功。
下次用修好的脚本部署后应当对齐 —— **验收时务必确认 `/api/version` 的 buildId 与本地 `BUILD_ID` 一致**。

---

### 13.6 `lib/prisma.ts` 惰性初始化改造（2026-09-17 追加）

> **定位说明：** 本节改动**不是** 13.5 那次 500 的原因（原因见 13.5-补）。
> 它的价值是另一回事：让**配置类**错误不再表现为裸 500，而是可被捕获的可读错误。
> 但要注意它**治不了「依赖文件缺失」** —— 那属于构建产物问题，
> 模块根本加载不进来，惰性初始化也救不了。两类问题不要混为一谈。

**改动是纯防御性的，不改变任何业务行为**——`DATABASE_URL` 正常时，运行路径与改动前逐字节等价。

#### 改动前的形态

```ts
export const prisma: PrismaClient = global.__prisma ?? createPrismaClient();
```

模块顶层立即求值。`DATABASE_URL` 缺失 → `createPrismaClient()` throw → 模块加载失败。

#### 改动后的形态

```ts
export class DatabaseNotReadyError extends Error { ... }

function getOrCreatePrisma(): PrismaClient {
  if (global.__prisma) return global.__prisma;
  try {
    global.__prisma = buildPrismaClient();
    global.__prismaInitError = undefined;
  } catch (e) {
    global.__prismaInitError = e instanceof Error ? e : new Error(String(e));
    global.__prisma = createFailingProxy(global.__prismaInitError) as PrismaClient;
  }
  return global.__prisma;
}

export const prisma: PrismaClient = getOrCreatePrisma();
```

三点设计意图：

1. **构造失败不再抛**：错误记进 `global.__prismaInitError`，模块加载照常完成。构建、测试、以及任何不碰数据库的接口都不再被牵连。
2. **用 Proxy 占位保持调用形态**：`prisma.user.findMany()` 这种写法一个字都不用改，失败被推迟到「真正访问属性」的那一刻。
3. **错误信息可读且可捕获**：抛出的 `DatabaseNotReadyError` 直接写明「检查 .env 的 DATABASE_URL」，业务侧 `try/catch` 能正常接住并降级返回 JSON 而不是 500。

#### Proxy 的一个坑（踩过，记录备查）

第一版 `createFailingProxy` 是这样写的：

```ts
const thrower = () => { throw err; };
return new Proxy(thrower, { get: () => thrower, apply: thrower });
```

看起来「任何属性访问都返回 thrower」，但 `prisma.user` 拿到 `thrower` 后，`.findMany` 又被 `get` 陷阱接住、**又返回 `thrower` 本身**。结果 `prisma.user.findMany` 求值成功（拿到一个函数），throw 只在**调用时**才发生——而 `prisma.user.count` 这种没被调用、或被 `await` 之外的形态会静默通过，等于埋出新的「不报错但也不对」。

**正确写法是 `get` 陷阱直接 `throw err`**，同时只对 `then` / `constructor` / `Symbol.toStringTag` / `toString` / `inspect` 这几个「框架探测用」的属性返回安全值，避免 Promise 判定和 `util.inspect` 无限递归：

```ts
return new Proxy(Object.create(null), {
  get(_target, prop) {
    if (prop === "then" || prop === "constructor") return undefined;
    if (prop === Symbol.toStringTag) return "PrismaClient";
    if (prop === "toString") return () => `[DatabaseNotReady: ${err.message}]`;
    if (prop === "inspect" || prop === Symbol.for("nodejs.util.inspect.custom")) {
      return () => `[DatabaseNotReady: ${err.message}]`;
    }
    throw err;   // ← 关键
  },
  apply() { throw err; },
});
```

#### 回归测试

新增 `scripts/test-prisma-lazy-init.cjs`（7 项断言，全部通过）。脚本用 `new Module()` + `_compile()` 把 `.ts` 源码喂给 Node，因此自带一个**逐行状态机式的最小转译器** `transpile()`：

- 跳过 `import` 语句（由 shim 顶部注入 require）
- 整块跳过 `declare global { ... }`（按大括号配平，纯类型声明）
- 剥类型注解，保留对象字面量

转译器本身也踩了个顺序坑：**必须先剥 `?: Foo` 整体，再删可选标记 `foo?`**。反过来做的话 `options?: { cause? }` 会先变成 `options: { cause? }`，随后被类型规则误判成对象字面量而保留下来。现在规则顺序是：

```js
.replace(/([A-Za-z_$][\w$]*)\?\s*:\s*[A-Za-z_$][\w$.]*(?:\s*<[^<>(){}]*>)?(?:\[\])?/g, "$1")  // 1) ?: T 一起消
.replace(/:\s*[A-Za-z_$][\w$.]*.../g, matchStrippable)                                          // 2) 普通 : T
.replace(/\s+as\s+[A-Za-z_$][\w$.]*(?:\s*<[^<>()]*>)?/g, "")                                    // 3) as T
.replace(/:\s*\{[^{}]*\}\s*(?=[,)=])/g, "")                                                     // 4) 兜底 : { ... }
.replace(/([A-Za-z_$][\w$]*)\?(?=\s*[,);{=])/g, "$1")                                           // 5) 裸 ?
```

测试覆盖：模块加载不抛异常 / 访问属性才抛且信息含 `DATABASE_URL` / 错误能被 try-catch / 正常时是真实例 / 正常时不抛 / 导出 `DatabaseNotReadyError` / 源码不再有脆弱顶层写法。

#### 与 13.5-补 的关系（重要，别混淆）

**13.5-补（构建产物缺陷）和 13.6（惰性初始化）是两个独立问题，本次 500 由前者引起。**

| | 13.5-补 | 13.6 |
| --- | --- | --- |
| 问题 | `.next` 里缺失依赖文件 | `lib/prisma.ts` 顶层立即 throw |
| 崩溃位置 | **模块加载期**（import 阶段） | **模块加载期**（顶层求值阶段） |
| 症状 | 裸 `text/plain` 500 | 裸 `text/plain` 500 ← **一样！** |
| 本次是否触发 | ✅ 是，就是它 | ❌ 否，`DATABASE_URL` 一直好着 |
| 惰性初始化能治吗 | ❌ **不能**。模块根本加载不进来，改内部逻辑无用 | ✅ 能 |
| 正确修法 | 修打包脚本（解引用 Junction）+ 部署校验 | ✅ 已完成 |

**注意上表第 3 行：两类问题的症状完全一样。**
这正是我当时判断错误的结构性原因 —— 特征相同，我先入为主选了符合假设的那个。
区分它们的唯一可靠手段是**看服务器日志里的具体报错**，不是看响应码和响应头。

- 13.5-补 = 「为什么线上登不上」（**已解决**，需要修打包脚本 + 重新部署）
- 13.6 = 「配置类错误下次能 5 分钟定位」（已完成，但与本次故障无关）

---

### 13.7 部署脚本缺陷与修复（2026-09-17 追加）

`scripts/build-and-upload.ps1` 打包段重写，详见 13.5-补「根治」小节。摘要：

| 项 | 旧 | 新 |
| --- | --- | --- |
| 打包方式 | `Copy-Item -Recurse` 到暂存目录 → `ZipFile.CreateFromDirectory` | 手工递归遍历 → `CreateEntry` 逐文件写入 |
| Junction 处理 | ❌ 不跟随，压成空目录 | ✅ 解析 `Target` 递归写入真实内容 |
| 本地自检 | 只查 `BUILD_ID` 是否存在 | 扫描 `node_modules/**/*-<16hex>`，有空目录即中止 |
| 服务器自检 | 只查 `BUILD_ID` | 切换前额外校验同一条件，失败 `exit 15` 保留原 `.next` |

新增回归测试 `scripts/test-zip-junction-deref.cjs`（6/6 通过）。

**踩坑记录：** PowerShell 5.1 下 `[System.IO.Compression.ZipArchiveMode]` 在 `Add-Type` 完成前**解析不到**，
会在脚本解析期就抛 `TypeNotFound`。修法是先写 `$zipModeCreate = [System.IO.Compression.ZipArchiveMode]::Create`，
并把加载逻辑改成 `LoadWithPartialName` 优先、`Add-Type` 兜底。

---

### 13.8 SSH 密钥登录未能接通（2026-09-17，未解决）

为了远程排查，生成了 ed25519 密钥对并尝试装到服务器，**失败了**：

| 项 | 状态 |
| --- | --- |
| 本机 `sshpass` / `plink` / `expect` | ❌ 均未安装（OpenSSH 不支持命令行传密码） |
| 密钥生成 | ✅ `C:\Users\95345\.ssh\shaoxiaoli_deploy`（指纹 `SHA256:DW71yXJE0qY9R0jjlX8H4HwwXwo9VwLL26Z1cducf4U`） |
| 公钥安装 | ✅ 已写入 `/home/admin/.ssh/authorized_keys`（1 行，内容正确） |
| 服务器权限 | ✅ `~` `700`、`~/.ssh` `700`、`authorized_keys` `600`，全对 |
| sshd 配置 | ✅ `AuthorizedKeysFile .ssh/authorized_keys`，`PubkeyAuthentication` 未关闭，无 `sshd_config.d` 覆盖 |
| 客户端私钥 ACL | ✅ 已用 `icacls` 收紧为仅当前用户可读 |
| **实际结果** | ❌ `Permission denied (publickey,...)`，客户端 `-v` 显示密钥**正常 offer 了**，服务器侧拒绝 |

**客户端所有能查的都排除了。** 剩下只有服务器侧原因，需要看认证日志才能定位：

```bash
sudo sshd -T | grep -iE 'authorizedkeysfile|pubkeyauthentication|strictmodes|allowusers'
sudo journalctl -u sshd -n 50 --no-pager | tail -30
sudo tail -n 50 /var/log/secure
```

**但这不是阻塞项** —— 用宝塔面板自带的「终端」可以完全替代，本次故障就是靠它修好的。

**另外：** `docs/AI_HANDOFF_PRIVATE.local.md` 里记录的 SSH 密码强度严重不足，
建议轮换为强密码并改用密钥登录。密钥通了之后可以关掉 `PasswordAuthentication`。

> 🔐 **本文件不再记录任何明文密码。** 需要凭据时请走系统密钥管理器 / SSH 私钥，
> 或由项目负责人通过安全渠道临时提供。详见 `docs/SSH_DEPLOY_KEY.md`。

详见 `docs/SSH_DEPLOY_KEY.md`。

---

### 13.9 本次未完成 / 需跟进（2026-09-17 收尾）

1. **重新部署使构建号对齐** —— 修好的打包脚本尚未实际跑过一次完整部署。
   线上仍是手工救火的产物（`h3jogye1CgAct2ux3nqVL`），本地新构建 `7SSZg7yYab6tFUrxnQ9T_` 尚未上传。
   下次部署后需确认 `/api/version` 的 buildId 与本地一致。
2. **SSH 密钥**（13.8）—— 非阻塞，可选跟进。
3. **服务器数据库密码曾在聊天中暴露**（明文已从本文件移除）—— 建议轮换，并同步更新
   `.env` 与 `docs/AI_HANDOFF_PRIVATE.local.md`。凭据只放在 `.env`（已 gitignore）与本机密钥库，
   任何文档、提交信息、截图里都不得出现。
4. **`.gitignore` 未覆盖 `docs/AI_HANDOFF_PRIVATE.local.md`** —— 需确认，避免密码被推到 GitHub。
5. **小程序端改动未发布** —— 本批 `miniprogram/` 改动（fixUrl、登录页错误处理等）需在
   微信开发者工具重新编译、真机验证后上传体验版。**服务器部署不会更新小程序。**

---

### 13.10 🔴 域名分工（务必记住，本轮踩过坑）

| 域名 | 用途 | 归属 |
| --- | --- | --- |
| **`www.shaoxiaoli.top`** | **考勤系统正式入口** | 本项目 |
| `note.shaoxiaoli.top` | **Obsidian 云端笔记同步**（宝塔 `note.conf`，`proxy_pass 127.0.0.1:9000`，对应进程 `fast-note-sync-`） | 非本项目 |

两个域名**都解析到 `8.156.86.244`**（同一台机），且在 `/etc/nginx/conf.d/nextjs.conf` 的
**同一个 `server` 块**里（`server_name note.shaoxiaoli.top www.shaoxiaoli.top;`），
所以两者都会命中该块的 `location ^~ /uploads/`。

**排查陷阱**：本轮误把 `note.shaoxiaoli.top` 当作考勤系统域名去测 `/uploads/`，
看到 `octet-stream` + `vary: rsc,...` 就判定「alias 没生效」——**结论是错的**，
那只是当时 probe 文件已删导致的 404 页，我误读了响应头。**先确认域名归属再下结论。**

---

### 13.11 ✅ 成果档案 `/uploads/` 访问链路已修通（2026-09-17，已解决）

**故障现象**：任务详情页「成果档案」上传的图片/视频/PDF 全部打不开（404）。
数据库 `TaskOutcome` = 0、`TaskOutcomeAsset` = 0（而 `User` = 40、`Task` = 4，系统在用）
→ **归档链路从上线起从未成功执行过一次**。

**根因**：文件写到 `/www/wwwdata/sxl-uploads/`（`LOCAL_UPLOADS_DIR` 指向，项目外目录），
但 `/uploads/...` 请求只查项目内 `public/uploads/`（为空）→ 404。
Next.js 静态资源查找根不认项目外目录，**必须由 Nginx 接管**。

**修复**（`/etc/nginx/conf.d/nextjs.conf`，HTTPS server 块内、`location /` **之前**）：

```nginx
# 本地上传文件（LOCAL_UPLOADS_DIR=/www/wwwdata/sxl-uploads）
# ^~ 前缀匹配，优先级高于 location /，否则会被 Next 的 catch-all 抢走
location ^~ /uploads/ {
    alias /www/wwwdata/sxl-uploads/;
    expires 30d;
    add_header Cache-Control "public";
    access_log off;
    try_files $uri =404;
}
```

**验证通过**（用 `www.shaoxiaoli.top` 测）：

```
HTTP/1.1 200 OK
Content-Type: text/plain           ← Nginx 按 mime.types 直发，非 octet-stream
Expires: Sat, 17 Oct 2026 ...      ← expires 30d 生效
Cache-Control: public
Accept-Ranges: bytes               ← 支持断点续传（大视频可拖进度条）
```

**判定要点**：走 Nginx 时 `Content-Type` 由 `mime.types` 决定；
走 Node 兜底路由（`src/app/uploads/[[...path]]/route.ts`）时会带
`vary: rsc, next-router-state-tree, ...`（Next 专属）+ `application/octet-stream`。
**这两个特征可用来判断请求到底被谁处理。**

**注意**：项目内 `src/app/uploads/[[...path]]/route.ts` 是一个**兜底路由**，
即使 Nginx 未配 alias 也能读盘返回文件（它读 `getLocalUploadsRoot()`）。
所以「图片能显示」**不等于** alias 生效——必须看响应头才能区分。

**副作用 / 待办**：
- `client_max_body_size 50m` 与业务层 50MB 限制重叠 —— Nginx 算整个请求体（含 multipart 开销），
  正好 50MB 的文件会被 Nginx 抢先返 **413**（英文错误页），而不是我们写的中文提示。
  **建议放宽到 `64m`**（尚未执行）。
- `.env` 中 `LOCAL_UPLOADS_DIR` **重复两行**（第 8、9 行），需清理（尚未执行）。
- **真机上传链路尚未验证** —— `TaskOutcomeAsset` 为 0 说明业务链路（前端 → API → zod →
  落盘 → 入库）从未跑通，可能还藏着别的 bug（50MB 限制、zod 校验、前端传参）。
  **必须用管理员账号实际传一次小图，看 `TaskOutcome` 是否变 1。**

---

## 13.12 课表 PDF 解析修复（2026-09-17，第五轮）

用户拿三份真实教务课表实测：**郭亦菲完全读不进去，高毅/陈亚楠有缺漏**。
文件：`miniprogram/utils/pdf-schedule.js`（纯算法解析，不依赖 OCR）。

### 教务 PDF 的技术指纹

| 特征 | 值 |
| --- | --- |
| 字体 | `BaseFont STSong-Light` |
| 编码 | `Encoding UniGB-UCS2-H`（双字节大端 = UTF-16BE 码位） |
| 字形 | `Subtype Type0` / `CIDFontType0` |
| **无 `/ToUnicode`** | UniGB-UCS2-H 可直接解出码位，**不依赖 ToUnicode 映射表** |
| 页面 | `/Rotate 90`（横版课表印在竖版纸上） |
| 生成器 | Java / OpenPDF、JasperReports 系 |

### 根因（三个缺陷叠加）

**① `extractContentStream` 只取最大的一条 stream → 表头整个丢失**

实测：内容流被拆成多条 stream，`stream 0` = 6994 字节（**含 7 个星期表头**），
`stream 1` = 8718 字节（正文）。旧实现取「最大的一条」→ 拿到 stream 1，
表头从没进过解析流程 → 直接报「没识别到星期表头」→ 郭亦菲「完全读不进去」。

修法：**全部拼接**。拼接后 `content len = 17143`，文字段 109 → **206**，7 个表头全部在位。

**② `isCourseNameLine` 太宽松 → 详情碎片被当课程名**

教务 PDF 把一格课程切成 **20+ 个 `Tj`**（每行只有 4-6 字），课程名行之后紧跟含
`(N-M节)` 的详情首行。旧规则只看「不含冒号/不含节次」，于是
`2027-1)-130008-01/教学班组` 这类碎片被判为课程名 → 一门课拆成十几条假记录
（曾出现高毅多出 40 条的极端情况）。

修法：**起点需二次确认** —— 课程名行之后 1-2 行内**必须**含节次标记或另一个课程名，才确认是真正的块起点。

**③ `locateColumn` 落空时兜底成「星期一」→ 星期一虚高、其余列缺课**

旧实现在候选列表里找「最后一个满足 `x >= left - 2`」的列，落空就返回第一列。
修法：改「**最近列中心**」，且等距时偏右（PDF 文字 x 是左对齐起点，压在边界上属右列），
并加 `1e-6` 浮点保护避免 `51.9 <= 51.925` 这类边界翻转。

### ⚠️ `/Rotate 90` 不影响内容流坐标语义（重要教训）

**我一开始推断「带 `/Rotate 90` 就要把 x/y 互换」，这个推断是错的。**

实测数据（郭亦菲课表，未做任何旋转换算）：

```
x=104.1 y=505.5  中医基础理论★        ← 星期一、第 1 行
x=104.1 y=493.5  (1-2节)3-5周,...     ← 同一格详情，y 递减
x=415.6 y=505.5  人体解剖学（一）★     ← 星期四、第 1 行
表头「星期一..星期日」x=133→756 递增、y=521 恒定
```

**内容流坐标本来就是按阅读方向绘制的** —— x 递增 = 星期从左到右，y 递减 = 节次从上到下。
`/Rotate` 只是让阅读器在竖版纸面上把横表转过来显示。

按 `/Rotate 90` 做换算后，x/y 互换会把**详情行翻到课程名上面**，切片顺序颠倒，反而全挂。
所以 `rotatePoint()` 现在是**恒等返回**，rotation 仅作诊断保留。

> **教训**：从「现象错乱」反推「我的换算错了」比按规范推断更可靠。
> 当时是看到「详情跑到课程名上面」才发现换算方向搞反了。

### 详情字段污染：碎片按字符块切开后重新粘连

这是**最难的一类**。同一行的文字被切成多条 `Tj`，拼接后出现：

```
...教师:张川,华永兰时:32/学分:2.0/...        ← `学时` 的 `时` 被吞进教师值
...教师:张:2.0川,华永兰/场地:操场/...        ← 学分 2.0 插进姓名中间
...教师:黄鹤师:霍丁鹏/场地:5501/...          ← 下一个姓名被当成字段名残片
...教师:石馨心学班组成/...                   ← `教学班组成` 只留下 `学班组成`
```

**裸正则（`教师[:：]\s*([^/]+)`）处理不了**：要么吃进 `时:32`，要么把值切成 `黄鹤`。

修法分两步：

1. **`splitFields(blob)`** —— 按「已知字段名 + 冒号」把文本切成有序 `{字段: 值}`，
   值只取到**下一个字段名出现之前**，借此天然截断抖动碎片。
2. **`cleanFieldValue(value, kind)`** —— 二次清洗：
   - 在字段名残片上截断（要同时列完整词**和**被切掉头部的残片，实测残片更常见）
   - 清掉夹在姓名间的数字残片 —— ⚠️ **必须在删冒号之后做**，
     `张:2.0川` 先变 `张2.0川` 才能被「汉字+数字+汉字」形态命中
   - 房间字段的课程号判据（`-130008-01`）**必须在剥前后缀之前**判，
     否则前导 `-` 被去掉后 `^\d{4}-` 类判据失效

### 周次提取的致命 bug

旧实现 `\)\s*([\d\-,周]+?)\s*\/` 在**整个 blob** 上跑，而 blob 开头是课程名 + 课程号：

```
中医基础理论★2027-1)-130008-01/教学班组(1-2节)3-5周,9-19周/...
                              ↑ 这个 `)` 先被命中 → weeks = "-130008-01"
```

修法：① 从 `(N-M节)` **之后**开始找（那里才是详情区）；
② 正则改成「数字+周」的宽松形态 `(\d+(?:-\d+)?周(?:,数字周)*)`，
因为 detail 区以 `3-5周` 直接开头、**没有前导 `)`**。

### 去重与幽灵记录

- **去重**：同一天同一时段同一门课只保留信息最全的一条。
  实测一门课的详情行会散到多行 y，分块后产出两条同名记录（一条只有课名+教师，
  另一条含周次教室）→ 例 `医古文 | 郑琛 | - | 5周` 与 `医古文 | 郑琛 | 5710 | 13-17周`。
  判重键 = `星期|起始节|结束节|课程名`，合并时**逐字段补空缺**（不是整条替换，避免丢已拿到的字段）。
- **幽灵记录**：课名不含任何中文（纯数字/字母/符号碎片，如班级号 `2607`）**且**四个详情字段全空 → 丢弃。
  ⚠️ **不能只看「字段全空」**：真实课程也可能因碎片抖动拿不到详情，那样会静默丢课（实测丢过 3 条）。

### 修复前后对比（真实 PDF 实测）

| PDF | 修复前 | 修复后 |
| --- | --- | --- |
| 郭亦菲 | **完全读不进去**（「没识别到星期表头」） | **12 条**，分布 `{1:5, 2:2, 3:1, 4:4}` |
| 高毅 | 缺漏 + 40 条假记录 | **14 条**，分布 `{1:3, 2:3, 3:1, 4:3, 5:3, 7:1}` |
| 陈亚楠 | 缺漏 | **16 条**，分布 `{1:2, 2:4, 3:3, 4:3, 5:3, 7:1}` |

学期名全部正确：`2026-2027学年第1学期`（新增 `pickSemesterLabel` 四级优先：
`学年+学期` → `学期` → `课表` → 兜底，不再取 y 最大的那条碎片）。

字段污染全部清除，实测样本：

```
周1 第3-4节 大学英语（一） | 石馨心 | 2405 | 3-5周,9-16周      ← 原 `石馨心学班组成`
周1 第9-10节 大学体育（一） | 张川,华永兰 | 操场 | 3周          ← 原 `张川,华永兰时:32`
周2 第1-2节 人体解剖学 | 史旋 | 5301 | 3-5周,9-17周            ← 原 `史旋100319-05`
周1 第11-12节 思想道德与法治 | 黄鹤师 | 5501 | 3-5周,9-10周,12周 ← 原 `黄鹤师:霍丁鹏`
```

### 测试

`scripts/test-pdf-schedule.cjs` —— **101 项通过，0 失败**（原 81 项，本轮新增 20 项字段清洗断言）。

- 1. `rotatePoint` 恒等行为 + `readPageRotation` + MediaBox 回退
- 1b. 内容流拼接（> 180 段文字、7 个表头在位）
- 2. `locateColumn` 列归属（含「两列正中偏右」「远在表外返回 0」）
- 3. 节次锚点（从左侧 `1..12` 栏抽 y 锚点）
- 3b. `cleanCourseName` / `isCourseNameLine` / `pickSemesterLabel`
- 3c. `splitFields` / `cleanFieldValue` / `parseCell`（本轮新增，8 教师 + 5 房间 + 4 parseCell）
- 4. 真实 PDF 端到端（三份，各 11 项）

诊断脚本（已建，可复用）：
- `scripts/probe-pdf-fragments.cjs <pdf> [weekday]` —— 按行打印原始文字碎片 + x/y 坐标
- `scripts/probe-fields.cjs` —— 单测 `splitFields` / `parseCell` 的输入输出

> **注意**：本模块改动**只在 `miniprogram/`**，需在**微信开发者工具重新编译上传**才生效 ——
> **服务器部署不更新小程序**。

---

## 13.13 课表解析迁移到服务端（2026-09-19，第六轮）

### 为什么换路线

前五轮都在 `miniprogram/utils/pdf-schedule.js` 里手写 PDF 解析。**本质是在小程序端
自己实现 PDF 引擎 + 文字布局引擎 + 表格识别**：自己解 FlateDecode、自己对 CMap 做
UniGB-UCS2-H 解码、自己拼多条内容流、自己处理 `/Rotate`、自己猜碎片属于哪一格。

结果是**每来一份新模板就复发一次**（漏课 / 幽灵记录 / 教师字段污染 / 单双周丢失），
而且是「测试全绿但真实使用出错」——因为测试覆盖的是已知模板，未知模板只能靠人眼发现。

**结论：不再把完整 PDF 解码与课表重建放在小程序端。**

### 现在的架构

```
小程序：选文件 → 上传 → 展示「识别预览」 → 用户确认 → 写入本地课表
服务端：PDF 文字抽取 + 课表重建 + 质量评分 → 统一 JSON
```

| 层 | 文件 | 职责 |
| --- | --- | --- |
| PDF 引擎 | `src/lib/schedule-pdf/extract.ts` | **pdfjs-dist**（Firefox 内置引擎）抽文字 + 坐标；文字层检测 |
| 字段解析 | `src/lib/schedule-pdf/cell.ts` | 从原 `pdf-schedule.js` **逐字迁移**的已验证正则层 |
| 表格重建 | `src/lib/schedule-pdf/rebuild.ts` | 星期行定位 → 分块 → 去重 → 质量告警 |
| 编排 | `src/lib/schedule-pdf/index.ts` | 统一 JSON 输出 |
| API | `src/app/api/schedule/parse/route.ts` | 上传鉴权 + 分发 |

统一 JSON 结构：

```json
{
  "ok": true, "needsOcr": false, "confidence": 0.98,
  "courses": [], "warnings": [], "unmatchedCells": [],
  "semesterLabel": "...", "sourceLabel": "...", "engine": "pdfjs-dist@6.3.289",
  "stats": { "pageCount": 3, "charCount": 2887, "itemCount": 0, "courseCount": 19 },
  "notes": []
}
```

**除鉴权/表单错误外一律返回 200**，用 `ok` 区分结果 —— 因为小程序的请求封装在非 2xx
时只透出 message，会丢掉 `courses`/`warnings`，那样「识别预览」就没法展示细节了。

### 为什么用 pdfjs-dist 而不是 PyMuPDF

评估过 Python 方案（PyMuPDF `find_tables()`）。最终选 Node 侧 pdfjs-dist，原因：

1. **零部署成本**：项目已是 Next.js + PM2，服务器不需要再加 Python 运行时与 pip 依赖。
2. **能力等价**：pdf.js 是 Mozilla 维护的成熟引擎，字体 CMap / 压缩 / 多流 / 旋转全都处理好了。
3. **`find_tables()` 在本场景帮不上忙**：教务课表是「一格塞多门课」，表格线只能给出
   单元格边界，**格内切分仍要自己写**。既然如此，用 pdf.js 拿精确文字坐标就够了。
4. **实测已验证**：四份真实 PDF（三种生成器）中文全部正确解出。

若将来要支持扫描件 OCR，那一步再引入 Python（PaddleOCR PP-StructureV3）更合理 ——
OCR 确实是 Python 生态更强。

### 🔴 pdfjs-dist 的三个坑（必读）

1. **Node 的 fetch 不支持 `file://`**，而 pdf.js v6 在 Node 下用全局 fetch 取 cmaps →
   报 `Unable to load CMap data`，**中文会全部解不出来（item 数直接变 0）**。
   修法：注入 `CMapReaderFactory` / `StandardFontDataFactory`，改用 `fs` 读盘。
   见 `extract.ts`。
2. **`transform` 已包含内容流的 `cm` 变换** → `x = e`（节次方向）、`y = f`（星期方向），
   **不需要再做矩阵换算**（原手写版的 `applyMatrix` 可以不要了）。
   实测表头 y = 133 / 236.85 / 340.69 … 步长 103.85，与手写版行带逐个吻合。
3. **必须 `serverExternalPackages: ["pdfjs-dist"]`**（已加进 `next.config.ts`）：
   它是 ESM-only 且运行时要去 node_modules 读 `cmaps/`、`standard_fonts/` 资源，
   打包进 bundle 会让动态 import 与资源路径双双失效。

### 本地解析器仍然保留，但降级为离线兜底

`miniprogram/utils/pdf-schedule.js` **没有删**。它在「服务端不可用」（断网 / 未部署新版）
时兜底，结果同样要过人工确认框。不要再往里加功能 —— 新模板适配请改服务端。

### 小程序端流程变化

`miniprogram/pages/schedule/schedule.js`：

- `readScheduleFile` → PDF 走 `parsePdfViaServer()`；JSON 仍走本地读取
- `parsePdfViaServer()` → `api.parseSchedule()` 上传 → 失败自动 `parsePdfLocally()` 回退
- `openRecognizePreview()` → **识别预览弹层**，缺教师/缺教室/缺周次的课程高亮
- `onPreviewConfirm()` 才真正 `doImport()`；另弹一次「其他课程」（军事理论等）交代

**顺带修掉一个真 bug**：`miniprogram/utils/schedule.js` 的 `normalizeCourse` 原本不认
`parity` 字段，导致解析层好不容易保留的「单双周」在**写入时再次丢失**。
现在会把 `parity` 合回 `weeks` 文本（`11-13周(单)`），因为存储层只认 `weeks`。

### 部署要点（⚠️ 这次上线多两步）

1. **服务器要先 `npm install`** —— 新增了 `pdfjs-dist` 依赖。
   `next.config.ts` 的 `serverExternalPackages: ["pdfjs-dist"]` 表示它**不打进 bundle**，
   运行时由 Node 直接从服务器 `node_modules` 读取。漏装的表现是接口 500、
   报「服务端缺少 pdfjs-dist」（见 `src/lib/schedule-pdf/extract.ts` 的 `findPdfjsRoot()`）。
   **`scripts/build-and-upload.ps1` 已在「4.5 服务器运行时依赖检查」自动拦截**：
   检查不通过就直接 `exit 16` 中止，且发生在**上传之前**，生产不受任何影响。
   补救：在服务器执行 `cd /www/wwwroot/nextjs-app && npm install --no-audit --no-fund`，
   然后重跑脚本（可加 `-SkipBuild` 复用本地已构建的 `.next`）。
2. 之后正常 `npm run build` + PM2 重启（`serverExternalPackages` 需要重新构建才生效）。
3. **检查 Nginx `client_max_body_size`** —— 默认常为 1MB，课表 PDF 一般几百 KB 够用，
   但保险起见建议 ≥ 8MB。上传若报 413，改这里。
4. **小程序端要重新编译上传**（识别预览弹层是新 UI），服务器部署不更新小程序。
   注意 `/api/schedule/parse` 走的是 **`wx.uploadFile`**，要在微信公众平台
   「开发管理 → 开发设置 → 服务器域名」里加 **uploadFile 合法域名**
   （与 request 合法域名是两份独立名单，之前只用 `wx.request` 的话这一项可能是空的）。

### 测试

| 命令 | 覆盖 |
| --- | --- |
| `npm run test:schedule` | 本地解析器：结构 132 + 内容 404 + 周次语义 23 |
| `npm run test:schedule:server` | 服务端解析器，**复用同一份 404 项期望表** |
| `npm run test:schedule:api` | 端到端：真起 next dev，真发 HTTP 上传（13 项） |
| `npm run test:schedule:all` | 以上全部 |

服务端测试复用期望表的机制：`test-schedule-server.cjs` 先把解析结果 dump 成 JSON，
再带 `SCHEDULE_PARSE_JSON=<目录>` 重跑 `test-pdf-schedule-content.cjs` ——
**比对逻辑与阈值完全一致**，避免「本地一套标准、服务端另一套标准」的漂移。

当前状态：**本地 559 项 / 服务端 404 项 / API 13 项，全绿**。
四份真实课表（郭亦菲 19 / 高毅 23 / 陈亚楠 25 / 李奕然 13）在两个解析器上结果一致。


