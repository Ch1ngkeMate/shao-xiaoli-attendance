# 邵小利志愿服务队 · 干事考勤系统 — 开发报告

| 项目 | 说明 |
|------|------|
| **项目名称** | `shao-xiaoli-attendance` |
| **中文名称** | 邵小利志愿服务队 · 干事考勤系统 |
| **当前版本** | `0.1.0`（package.json） |
| **报告日期** | 2026-05-24 |
| **代码仓库** | 本地路径 `D:\develop\cursor Pro\shao-xiaoli-attendance`，Git 分支 `main` |
| **远程仓库** | `https://github.com/Ch1ngkeMate/shao-xiaoli-attendance.git` |
| **部署形态** | 自建服务器（宝塔 + PM2 + MySQL），支持 Vercel Blob 图床；微信小程序备案后联调中 |

---

## 一、项目概述

本系统面向志愿服务队内部，用于 **任务发布与接取**、**完成凭证审核**、**值班与例会考勤**、**请假审批**、**站内消息与公告**、**月度积分报表** 等日常管理。主体为 **Web 应用（浏览器 / 手机浏览器）**；**微信小程序** 已具备与 Web 对等的页面骨架（任务、消息、值班、请假、发布、月报等），联调与真机验收仍在进行。

### 角色体系

| 角色 | 枚举值 | 说明 |
|------|--------|------|
| 管理员 | `ADMIN` | 账号管理、批量运维、全部管理功能 |
| 部长 | `MINISTER` | 发布任务、月报、部员考勤、审批请假、管理公告等 |
| 部员 | `MEMBER` | 接取任务、提交凭证、请假、查看个人考勤与消息 |

---

## 二、技术栈

### 2.1 前端（Web）

| 技术 | 版本（约） | 用途 |
|------|------------|------|
| **Next.js** | 16.2.4 | App Router、SSR/服务端组件、API Routes |
| **React** | 19.2.4 | UI 框架 |
| **TypeScript** | 5.x | 类型安全 |
| **Ant Design** | 6.3.6 | 组件库（表格、表单、上传、布局等） |
| **@ant-design/icons** | 6.1.1 | 图标 |
| **@ant-design/nextjs-registry** | 1.3.0 | Ant Design 与 Next.js 集成 |
| **antd-img-crop** | 4.30.0 | 头像/图片裁剪上传 |
| **dayjs** | 1.11.20 | 日期时间处理 |

### 2.2 后端与数据

| 技术 | 版本（约） | 用途 |
|------|------------|------|
| **Prisma** | 7.8.0 | ORM、数据库迁移 |
| **MySQL / MariaDB** | — | 主数据库（`@prisma/adapter-mariadb` + `mariadb` 驱动） |
| **bcryptjs** | 3.0.3 | 密码哈希 |
| **jose** | 6.2.2 | JWT 会话签发与校验（Cookie + Bearer） |
| **zod** | 4.3.6 | API 请求体验证 |

### 2.3 文件与报表

| 技术 | 用途 |
|------|------|
| **@vercel/blob** | 可选云图床（生产推荐或配 `LOCAL_UPLOADS_DIR`） |
| **exceljs** | 月报 / 考勤区间 Excel 导出 |
| **iconv-lite** | 导出编码处理 |

### 2.4 微信小程序

| 技术 | 用途 |
|------|------|
| 原生小程序（WXML / WXSS / JS） | 客户端骨架 |
| 微信 `wx.login` + 服务端 `jscode2session` | 登录与 openid 绑定 |

### 2.5 运维与工具

| 技术 | 用途 |
|------|------|
| **PM2** | 进程守护（`deploy.sh` 中 `pm2 restart`） |
| **Bash `deploy.sh`** | 服务器一键拉代码、装依赖、迁移、构建、重启 |
| **tsx** | 运行 TypeScript 脚本（初始化管理员、月报生成等） |
| **ESLint** | `eslint-config-next` 代码检查 |

### 2.6 架构示意

```
┌─────────────────┐     HTTPS      ┌──────────────────────────────┐
│  浏览器 Web UI   │ ◄────────────► │  Next.js 16 (App Router)      │
│  (Ant Design)   │   Cookie 会话   │  · 页面 SSR/RSC               │
└─────────────────┘                │  · /api/* Route Handlers       │
                                   └──────────────┬───────────────┘
┌─────────────────┐     Bearer      │              │
│  微信小程序       │ ◄───────────────┤              ▼
│  (miniprogram/) │                 │     Prisma → MySQL
└─────────────────┘                 │              │
                                    │     本地上传 / Vercel Blob
                                    └──────────────────────────────┘
         计划任务 ──POST──► /api/cron/task-stall-notify (CRON_SECRET)
```

---

## 三、目录结构（核心）

```
shao-xiaoli-attendance/
├── src/
│   ├── app/                 # 页面与 API（App Router）
│   ├── components/          # AppShell、ClientProviders、Logo 等
│   ├── generated/prisma/    # Prisma 生成客户端
│   └── lib/                 # 业务逻辑（鉴权、月报、通知、上传等）
├── prisma/
│   ├── schema.prisma        # 数据模型
│   └── migrations/          # 数据库迁移（7 个版本）
├── scripts/                 # 运维与数据脚本
├── miniprogram/             # 微信小程序客户端
├── docs/                    # 项目文档（本报告、小程序联调指南）
├── middleware.ts            # 路由鉴权（Cookie JWT）
├── deploy.sh                # 服务器一键部署
├── next.config.ts           # Next 配置（低内存构建、ngrok 等）
├── package.json
└── .env.example             # 环境变量模板
```

---

## 四、数据模型（Prisma）

| 模型 | 说明 |
|------|------|
| `User` | 用户；含 `wxOpenId` / `wxUnionId`（微信绑定）、头像、主页背景 |
| `Task` / `TaskTimeSlot` | 任务及多时间段；支持不计考勤标记、滞留通知时间 |
| `TaskImage` | 任务配图 |
| `TaskClaim` | 接取记录（支持按时段唯一接取） |
| `TaskSubmission` / `EvidenceImage` | 提交与凭证图 |
| `TaskReview` | 审核结果（通过/驳回） |
| `DutyAssignment` | 值班表（周一～五 × 五节课） |
| `Meeting` | 例会/会议 |
| `LeaveRequest` | 值班/会议请假及审批 |
| `AttendanceAdjust` | 月度考勤加减分（如旷会） |
| `Announcement` / `AnnouncementImage` | 公告与配图 |
| `AnnouncementPopupShown` | 公告每日弹窗展示记录 |
| `InAppMessage` | 站内消息（任务、请假、公告、会议等类型） |
| `MonthlyReport` | 月度统计快照（JSON） |

### 数据库迁移记录

| 迁移目录 | 内容 |
|----------|------|
| `20260426100000_init_mysql` | 初始化 MySQL 全表 |
| `20260426120000_task_claim_per_slot` | 按时段接取 |
| `20260427120000_task_stall_notified_at` | 任务滞留通知幂等字段 |
| `20260429001900_announcement_detail_popup` | 公告详情与弹窗 |
| `20260429124500_user_profile_bg_url` | 个人主页背景图 |
| `20260524120000_user_wechat_bind` | 微信 openid/unionid 绑定 |

---

## 五、功能清单

### 5.1 Web 端 — 已完成

#### 认证与会话

- [x] 账号密码登录（`/login` → `POST /api/auth/login`）
- [x] 退出登录（`POST /api/auth/logout`）
- [x] JWT 会话 Cookie（30 天，`AUTH_SECRET` 签名）
- [x] `middleware.ts` 保护页面路由；管理员区 `/admin/*`、管理区 `/publish`、`/reports`、`/attendance` 按角色拦截
- [x] HTTP 调试模式：`SESSION_COOKIE_SECURE=false` 时的提示与兼容
- [x] Ant Design 全局中文语言包（`zh_CN`）

#### 任务大厅（`/tasks`）

- [x] 任务列表、筛选、状态展示
- [x] 任务详情（`/tasks/[id]`）：多时间段、配图、接取人数
- [x] 接取任务（`POST /api/tasks/[id]/claim`），支持按时段接取
- [x] 取消接取（`POST /api/tasks/[id]/remove-claim`）
- [x] 提交完成凭证与图片（`POST /api/tasks/[id]/submit`）
- [x] 管理人员审核提交（`POST /api/submissions/[id]/review`）
- [x] 提前结束任务（`POST /api/tasks/[id]/close`），可标记不计入考勤
- [x] 任务自动关单、完成通知（`lib/task-auto-close.ts`、`in-app-notify`）
- [x] 任务滞留 12 小时提醒（`lib/task-stall-notify.ts` + 定时接口）

#### 发布任务（`/publish`，部长/管理员）

- [x] 多时间段、积分、人数上限、描述、配图上传
- [x] 创建任务（`POST /api/tasks`）

#### 会议与值班（`/duty-and-meetings`）

- [x] 值班表编辑（周一～五、五节课、多人、部门标签）
- [x] 会议发布、结束、详情页
- [x] 值班/会议请假申请（`POST /api/leave`）
- [x] 请假审批（`POST /api/leave/[id]/decide`）
- [x] 例会结束后的旷会考勤调整（`lib/meeting-end.ts`）

#### 消息与公告（`/messages`）

- [x] 站内消息列表、未读角标、标记已读
- [x] 消息详情页（`/messages/[id]`），支持任务/请假/会议/公告跳转
- [x] 发布公告（含图片）、编辑、删除
- [x] 公告详情（`/announcements/[id]`）、已读统计（管理人员）
- [x] 首页每日首次进入弹窗公告（`GET /api/announcements/popup`）
- [x] 旧公告升级以支持已读统计（`POST /api/announcements/upgrade`）

#### 个人主页（`/profile`）

- [x] 本人主页：头像、微信风大图背景、考勤摘要
- [x] 查看他人主页（`/profile/[userId]`）
- [x] 头像上传（`POST /api/upload/avatar`）
- [x] 主页背景跨设备同步（`profileBgUrl`）

#### 设置（`/settings`）

- [x] 修改登录账号、密码
- [x] 浅色 / 深色 / 跟随系统主题（localStorage + `ClientProviders`）
- [x] 主页背景图上传与清除
- [x] 构建版本号展示（`GET /api/version`）

#### 月报与考勤（部长/管理员）

- [x] 月报页（`/reports`）：按月统计接取/提交/通过/积分
- [x] 生成月报快照（`POST /api/reports/monthly/generate`）
- [x] 导出月报 Excel（`GET /api/reports/monthly/export`）
- [x] 自定义日期区间考勤导出（`GET /api/reports/attendance-range-export`）
- [x] 部员考勤页（`/attendance`）：积分排序、已通过任务明细、例会旷会记录

#### 账号管理（`/admin/users`，仅管理员）

- [x] 用户增删改查、启用/禁用
- [x] Excel 批量导入用户（`POST /api/admin/users/import`）
- [x] 单用户/全员重置密码
- [x] 批量删除会议、批量删除任务、重置测试任务数据
- [x] 管理员修改用户资料（`PATCH /api/admin/users/[id]/profile`）

#### 文件上传

- [x] 通用图片上传（`POST /api/upload`）
- [x] 凭证图上传（`POST /api/upload/evidence`）
- [x] Vercel Blob 或本地目录（`LOCAL_UPLOADS_DIR` + Nginx `/uploads/`）
- [x] 无 Nginx 时通过 `GET /uploads/[[...path]]` 回源读取

#### 部署与运维

- [x] `deploy.sh` 一键部署（git pull → npm ci → migrate → build → pm2 restart）
- [x] 低内存构建开关 `NEXT_BUILD_LOW_MEM=1`
- [x] postinstall 可跳过 Prisma 生成（`SKIP_PRISMA_GENERATE=1`）
- [x] 部署环境自检 `npm run deploy:check`

---

### 5.2 微信小程序 — 已完成（已推送远程）

| 项 | 状态 |
|----|------|
| 数据库字段 `wxOpenId` / `wxUnionId` | ✅ 迁移已入库 |
| `POST /api/miniprogram/auth/bind-login` | ✅ 姓名 + code 首次绑定，返回 JWT |
| `POST /api/miniprogram/auth/wx-login` | ✅ 已绑定用户 code 登录 |
| API 鉴权 Bearer Token | ✅ `readSessionCookie()` 兼容 Cookie 与 `Authorization: Bearer` |
| middleware 放行 `/api/miniprogram/auth/*` | ✅（见提交 `ec776e4`） |
| 客户端页面 | ✅ 登录、首页/任务、消息、公告、通知、值班、会议、请假、发布、个人/他人主页、设置、月报等（`miniprogram/pages/`） |
| 联调文档 | ✅ `docs/MINIPROGRAM.md` |

---

### 5.3 未完成 / 待办

#### 微信小程序（上线与打磨）

- [ ] 生产环境配置真实 `WX_APPID`、`WX_SECRET` 并完成真机全链路验收
- [ ] 微信公众平台：request / uploadFile 合法域名（备案 HTTPS）
- [ ] 图片上传在真机上的稳定性（域名与白名单）
- [ ] 提交微信审核与正式版发布

#### 后端 / 运维

- [ ] 服务器 `.env` 与本地 `miniprogram/utils/config.js` 中 `API_BASE` 指向生产域名
- [ ] 推送后执行 `deploy.sh` 确保迁移与构建一致

#### 工程与质量

- [ ] 自动化测试（单元 / E2E）— 当前无测试套件
- [ ] `README.md` 仍为 create-next-app 模板，未改写为本项目说明
- [ ] `CRON_SECRET` 在服务器配置计划任务（任务滞留通知）
- [ ] 可选：将 middleware 升级为同时识别 API 的 Bearer（页面仍仅 Cookie）

#### 仓库内非核心业务文件（可忽略或另仓管理）

- `generate_ppt.py`、`create_ppt.py`、工商管理 PPT 相关 — 与考勤系统无关
- `scripts/image-bridge.py`、`scripts/xiumi_scraper.py` — 辅助工具，非运行时依赖
- `.agents/skills/` — Cursor Agent 技能配置

---

## 六、API 接口一览

### 6.1 公开 / 半公开

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | Web 登录 |
| POST | `/api/auth/logout` | 退出 |
| POST | `/api/miniprogram/auth/bind-login` | 小程序首次绑定 |
| POST | `/api/miniprogram/auth/wx-login` | 小程序已绑定登录 |
| GET | `/api/version` | 构建 ID（无需登录） |
| POST | `/api/cron/task-stall-notify` | 计划任务（需 `CRON_SECRET`） |

### 6.2 需登录（Cookie 或 Bearer）

| 分类 | 路径前缀 | 主要能力 |
|------|----------|----------|
| 当前用户 | `/api/me`、`/api/me/attendance` | 资料、密码、头像、背景、个人考勤 |
| 任务 | `/api/tasks`、`/api/tasks/[id]/*` | CRUD、接取、提交、关单 |
| 审核 | `/api/submissions/[id]/review` | 凭证审核 |
| 值班 | `/api/duty` | 值班表读写 |
| 会议 | `/api/meetings`、`/api/meetings/[id]` | 会议管理 |
| 请假 | `/api/leave`、`/api/leave/[id]/decide` | 申请与审批 |
| 消息 | `/api/notifications` | 站内信 |
| 公告 | `/api/announcements/*` | 公告 CRUD、弹窗、已读 |
| 报表 | `/api/reports/monthly/*`、`/api/reports/attendance-range-export` | 月报与导出 |
| 考勤 | `/api/attendance` | 部员月度考勤汇总 |
| 上传 | `/api/upload`、`/api/upload/avatar`、`/api/upload/evidence` | 图片 |
| 用户 | `/api/users/assignable` | 可指派用户列表 |
| 管理 | `/api/admin/*` | 用户、任务、会议批量运维 |

---

## 七、Web 页面路由

| 路径 | 权限 | 功能 |
|------|------|------|
| `/` | 登录用户 | 重定向至 `/tasks` |
| `/login` | 公开 | 登录 |
| `/tasks` | 全部 | 任务大厅 |
| `/tasks/[id]` | 全部 | 任务详情与操作 |
| `/duty-and-meetings` | 全部 | 值班与会议 |
| `/duty-and-meetings/meetings/[id]` | 全部 | 会议详情 |
| `/messages` | 全部 | 消息列表 |
| `/messages/[id]` | 全部 | 消息/公告详情 |
| `/announcements/[id]` | 全部 | 公告详情 |
| `/profile` | 全部 | 个人主页 |
| `/profile/[userId]` | 全部 | 他人主页 |
| `/settings` | 全部 | 设置 |
| `/publish` | 部长/管理员 | 发布任务 |
| `/reports` | 部长/管理员 | 月报 |
| `/attendance` | 部长/管理员 | 部员考勤 |
| `/admin/users` | 管理员 | 账号管理 |

---

## 八、内置脚本说明

### 8.1 `package.json` 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发服务器（默认 3000 端口） |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint 检查 |
| `npm run db:migrate` | 开发环境执行 `prisma migrate dev` |
| `npm run db:deploy` | 生产执行 `prisma migrate deploy` |
| `npm run db:studio` | 打开 Prisma Studio 数据浏览器 |
| `npm run init:admin` | 创建首个管理员（环境变量可指定账号密码） |
| `npm run report:generate -- --month=YYYY-MM` | 命令行生成指定月月报快照 |
| `npm run seed:report-demo` | 生成约 50 条测试任务数据（测月报用，可重复执行） |
| `npm run deploy:check` | 上线前环境变量与配置自检 |

`postinstall` 自动执行 `scripts/postinstall-prisma.cjs` → `prisma generate`（可用 `SKIP_PRISMA_GENERATE=1` 跳过）。

### 8.2 `scripts/` 目录脚本

| 文件 | 类型 | 说明 |
|------|------|------|
| `init-admin.ts` | TS | 初始化管理员账号 |
| `generate-monthly-report.ts` | TS | 按月生成 `MonthlyReport` 记录 |
| `seed-report-demo.ts` | TS | 灌入测试任务并完成审核，便于验证月报 |
| `check-deploy-env.ts` | TS | 检查 `AUTH_SECRET`、`DATABASE_URL`、Blob/本地上传、微信配置等 |
| `postinstall-prisma.cjs` | CJS | npm 安装后生成 Prisma Client |
| `image-bridge.py` | Python | ERNIE 图片描述桥接（Agent 用，非业务运行时） |
| `xiumi_scraper.py` | Python | 秀米相关爬虫工具（非业务运行时） |

### 8.3 根目录部署脚本

| 文件 | 说明 |
|------|------|
| `deploy.sh` | 服务器 Bash 一键部署：stash → pull → `npm ci` → `prisma migrate deploy` → `prisma generate` → `npm run build` → `pm2 restart`；支持 `PM2_NAME`、`NODE_HEAP_MB` 环境变量 |

---

## 九、环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | MySQL 连接串 |
| `AUTH_SECRET` | ✅ | JWT 会话签名密钥 |
| `WX_APPID` | 小程序 | 微信小程序 AppID |
| `WX_SECRET` | 小程序 | 微信小程序 AppSecret |
| `BLOB_READ_WRITE_TOKEN` | 可选 | Vercel Blob 图床 |
| `LOCAL_UPLOADS_DIR` | 可选 | 本地上传持久目录（推荐生产使用） |
| `SESSION_COOKIE_SECURE` | 可选 | `false` 时允许 HTTP 下调试 Cookie |
| `CRON_SECRET` | 可选 | 保护 `/api/cron/task-stall-notify` |
| `INIT_ADMIN_USERNAME` 等 | 可选 | `init:admin` 脚本用 |
| `NEXT_BUILD_LOW_MEM` | 可选 | `1` 时构建跳过 TS/ESLint 检查（小内存 VPS） |
| `SKIP_PRISMA_GENERATE` | 可选 | `1` 时 postinstall 跳过 prisma generate |
| `NODE_ENV` | 推荐 | `production` 用于生产 |

模板见项目根目录 `.env.example`。

---

## 十、仓库与交付状态

### 10.1 已推送远程（`origin/main`）

以下能力**已在 GitHub 远程仓库**（`origin/main`），服务器执行 `git pull` + `deploy.sh` 即可拉取：

| 类别 | 说明 |
|------|------|
| Web 全功能 | 任务、值班、会议、请假、公告、消息、月报、账号管理等 |
| 部署脚本 | `deploy.sh`、`npm run deploy:check`、低内存构建说明 |
| 小程序（后端 + 客户端） | `miniprogram/` 多页面、`/api/miniprogram/auth/*`、Bearer 鉴权、middleware 放行 |
| 数据库迁移 | 含 `20260524120000_user_wechat_bind` 等全部 `prisma/migrations/` |
| 文档 | `docs/MINIPROGRAM.md` 等 |

近期代表性提交（从新到旧）：

| 提交 | 说明 |
|------|------|
| `0282c52` | fix: 修复代码审查发现的 8 个问题 |
| `ec776e4` | feat: 微信小程序完整开发 + middleware 修复 |
| `0bc6b79` | chore(deploy): 降低 npm ci 被 kill 概率 |
| `5403bce` | feat(deploy): 增加一键部署脚本与默认透明封面 |

### 10.2 本地未推送 / 未提交（随开发变化，提交前请 `git status`）

常见**不应提交**或**可选提交**项：

| 类型 | 路径/文件 | 建议 |
|------|-----------|------|
| 敏感配置 | `.env`、`.env.local` | ❌ 永不提交（已在 `.gitignore`） |
| 依赖与构建产物 | `node_modules/`、`.next/` | ❌ 已忽略 |
| 本地上传 | `public/uploads/` | ❌ 已忽略 |
| 微信开发者私有配置 | `miniprogram/project.private.config.json` | ❌ 建议保持未跟踪（含本机调试项） |
| 无关作业文件 | `*.pptx`、`generate_ppt.py` 等 | ❌ 勿纳入考勤仓库 |
| Agent 技能 | `.agents/`、`skills-lock.json` | 可选，与业务无关 |
| 文档更新 | `docs/DEVELOPMENT_REPORT.md` | ✅ 建议提交 |

---

## 十一、代码推送与服务器部署

本节描述 **本地开发机 → GitHub → 生产服务器** 的完整流程。本项目采用 **单分支 `main` + 服务器手动拉取部署**（非 CI/CD 自动发布）。

### 11.1 流程总览

```
┌──────────────┐    git push     ┌─────────────────┐    git pull      ┌──────────────────┐
│  Windows 本机 │ ──────────────► │ GitHub origin   │ ───────────────► │ 阿里云/宝塔 VPS   │
│  改代码、自测  │                 │ /main           │   SSH 登录服务器  │ deploy.sh 构建重启 │
└──────────────┘                 └─────────────────┘                  └──────────────────┘
        │                                                                  │
        │ 勿提交 .env                                                       │ .env 仅在服务器配置
        └──────────────────────────────────────────────────────────────────┘
```

### 11.2 前置条件（本机 Windows）

1. 已安装 **Git**、**Node.js**（与服务器大版本接近更佳）。
2. 已克隆仓库到本地，例如：
   ```powershell
   cd "D:\develop\cursor Pro\shao-xiaoli-attendance"
   ```
3. 已配置 GitHub 身份（二选一）：
   - **HTTPS**：个人访问令牌（PAT），`git push` 时作为密码；
   - **SSH**：`git@github.com:Ch1ngkeMate/shao-xiaoli-attendance.git` 并配置公钥。
4. 确认远程：
   ```powershell
   git remote -v
   # origin  https://github.com/Ch1ngkeMate/shao-xiaoli-attendance.git (fetch/push)
   ```

### 11.3 本地提交与推送到 GitHub

> PowerShell 中请用分号 `;` 串联命令，**不要**使用 Bash 的 `&&`。

**① 查看改动**

```powershell
cd "D:\develop\cursor Pro\shao-xiaoli-attendance"
git status
git diff
```

**② 只添加业务相关文件（推荐显式 add，避免误提交 PPT 等）**

```powershell
# 示例：提交文档与小程序样式修复
git add docs/DEVELOPMENT_REPORT.md
git add miniprogram/pages/leave/apply.wxss
git add miniprogram/pages/settings/settings.wxss
# 按需继续 git add 其它路径…
```

或一次性添加已跟踪文件的修改（不含未跟踪杂项）：

```powershell
git add -u
```

**③ 提交（commit message 风格与历史保持一致：`feat:` / `fix:` / `chore:` / `docs:`）**

```powershell
git commit -m "docs: 补充开发报告与代码推送说明"
```

**④ 推送到远程 `main`**

```powershell
git pull origin main
git push origin main
```

若 `git pull` 提示冲突，先解决冲突文件后再 `git add` → `git commit` → `git push`。

**⑤ 推送后核对**

```powershell
git log --oneline -3
git status
# 应显示：Your branch is up to date with 'origin/main'
```

### 11.4 切勿提交的内容（安全检查清单）

| 检查项 | 说明 |
|--------|------|
| `.env` | 含 `DATABASE_URL`、`AUTH_SECRET`、`WX_SECRET` 等，仅放服务器 |
| 真实 `WX_APPID` / Secret 写进 `miniprogram/utils/config.js` | 若含生产域名可提交；密钥只放服务器 `.env` |
| 数据库文件、上传图片 | `dev.db`、`public/uploads/` 已在 `.gitignore` |
| `node_modules`、`.next` | 由服务器 `npm ci` / `npm run build` 生成 |

推送前可执行：

```powershell
git diff --cached --name-only
```

确认列表中无 `.env`、无 `.pptx`、无 `__pycache__`。

### 11.5 服务器端：拉代码并部署

推送成功后，**SSH 登录生产服务器**，进入项目目录（路径以你宝塔实际为准，下文用占位 `/www/wwwroot/shao-xiaoli-attendance`）：

```bash
cd /www/wwwroot/shao-xiaoli-attendance

# 可选：查看当前版本
git log --oneline -1

# 一键部署（脚本内含 git pull、迁移、构建、PM2 重启）
bash deploy.sh
```

`deploy.sh` 会自动完成：

| 步骤 | 命令/行为 |
|------|-----------|
| 1 | 工作区有改动则 `git stash -u` |
| 2 | `git pull` 拉取 `origin` 最新代码 |
| 3 | `npm ci` 安装依赖（可用 `NODE_HEAP_MB` 调大 Node 内存） |
| 4 | `npx prisma migrate deploy` + `prisma generate` |
| 5 | `npm run build` |
| 6 | `pm2 restart nextjs-app`（名称可由环境变量 `PM2_NAME` 覆盖） |
| 7 | `curl` 探测 `/api/version`、`/api/me` |

**环境变量**仅在服务器配置（宝塔「环境变量」或项目根 `.env`），**不要**从 Git 拉取。首次或变更后建议：

```bash
npm run deploy:check
```

**小内存 VPS 构建被 Kill 时：**

```bash
NEXT_BUILD_LOW_MEM=1 npm run build
# 或在本机/CI 构建好 .next 再上传（见 next.config.ts 注释）
```

**`npm ci` 在 postinstall 阶段被 Kill：**

```bash
SKIP_PRISMA_GENERATE=1 npm ci --no-audit --fund=false --progress=false
npx prisma generate
npm run build
```

### 11.6 部署后验证

| 检查 | 方法 |
|------|------|
| 构建版本 | 浏览器打开站点 → 设置页查看 buildId，或访问 `https://你的域名/api/version` |
| 登录 | Web 账号密码登录；HTTPS 下 Cookie 正常 |
| 数据库迁移 | 部署日志中 `prisma migrate deploy` 无报错 |
| 小程序 | 微信开发者工具指向 `miniprogram/`，`config.js` 中 `API_BASE` 为生产 HTTPS 域名；真机测 bind-login / wx-login |

### 11.7 常见问题

| 现象 | 处理 |
|------|------|
| `git push` 被拒绝（non-fast-forward） | 先 `git pull origin main`，解决冲突后再 push |
| 服务器 `git pull` 失败（本地有修改） | `deploy.sh` 会 stash；或手动 `git stash` / `git reset --hard origin/main`（**硬重置会丢服务器上未提交的本地改**） |
| 推送成功但网站仍是旧版 | 确认 `pm2 restart` 成功；看 `/api/version` 的 `buildId` 是否变化 |
| 仅 HTTP、无法保持登录 | 生产设 `SESSION_COOKIE_SECURE=false` 仅作临时调试；正式应上 HTTPS |
| 小程序请求 401 / 跳登录页 | 确认 middleware 已放行 `/api/miniprogram/auth/`（提交 `ec776e4` 及之后） |

### 11.8 推荐提交分组（实践）

| 场景 | 建议 commit 范围 |
|------|------------------|
| 仅文档 | `docs/**` → `docs: …` |
| 小程序 UI | `miniprogram/**` → `fix(miniprogram): …` |
| 后端 API | `src/app/api/**`、`src/lib/**` → `feat(api): …` |
| 数据库结构 | `prisma/schema.prisma` + `prisma/migrations/**` → `feat(db): …`（部署后必须 migrate） |
| 部署相关 | `deploy.sh`、`scripts/check-deploy-env.ts` → `chore(deploy): …` |

一次推送可包含多个 commit；**含数据库迁移的提交**推送后务必在服务器跑 `deploy.sh`（或至少 `prisma migrate deploy`）。

---

## 十二、推荐后续路线图

1. **配置生产**：服务器 `WX_*`、HTTPS、`API_BASE`、微信合法域名。  
2. **真机验收**：小程序各页面与 Web API 联调（任务接取提交、请假、上传等）。  
3. **推送与部署**：按第十一章流程 push → 服务器 `deploy.sh`。  
4. **工程化**：改写项目 README、配置 `CRON_SECRET` 计划任务、按需补充测试。  
5. **小程序上线**：提审、发布正式版。

---

## 十三、相关文档

| 文档 | 路径 |
|------|------|
| 微信小程序联调指南 | `docs/MINIPROGRAM.md` |
| 本开发报告（含推送与部署） | `docs/DEVELOPMENT_REPORT.md` |
| 环境变量模板 | `.env.example` |
| 变更备忘（历史） | `CHANGES_REPORT.md` |
| 服务器一键部署脚本 | `deploy.sh`（项目根目录） |

---

*报告由开发过程整理生成，如有功能增减请同步更新本文档。*
