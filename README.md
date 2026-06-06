# 干事考勤系统

陕西中医药大学邵小利志愿服务队·宣传部内部考勤管理系统。

## 功能

- **任务大厅** — 发布任务、干事接取、提交成果、审核打分
- **多时段任务** — 单个任务支持多个时间段，每段独立人数上限
- **会议与值班** — 会议签到（GPS）、值班排班（周一至周五 5 节课）
- **请假审批** — 值班请假 / 会议请假，管理端审批
- **月度考勤报表** — 自动汇总积分、支持快照归档、导出 Excel
- **账号管理** — 三级角色（管理员 / 部长 / 部员）、批量导入
- **消息通知** — 站内消息、微信小程序订阅推送
- **微信小程序端** — 干事在小程序接任务、查考勤

## 技术栈

| 类型 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript |
| UI | Ant Design 6 |
| 数据库 | MySQL (MariaDB) |
| ORM | Prisma 7 |
| 认证 | 自建 Session (jose) |
| 小程序 | 微信小程序 + 订阅消息 |

## 快速开始

### 环境要求

- Node.js 20+
- MySQL / MariaDB

### 安装

```bash
git clone https://github.com/Ch1ngkeMate/shao-xiaoli-attendance.git
cd shao-xiaoli-attendance
npm install
```

### 配置

复制 `.env.example` 为 `.env`，填写数据库连接等信息：

```bash
cp .env.example .env
```

### 初始化数据库

```bash
npx prisma migrate deploy
npx prisma generate
```

### 创建管理员

```bash
npm run init:admin
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## CLI 管理工具

项目附带 Python CLI 工具，可通过命令行或自然语言（配合 Claude Code）管理考勤系统。

### 安装

```bash
cd cli
pip install requests
```

### 使用

```python
from main import get_client

client = get_client()  # 自动使用管理员账号登录

# 查用户
from kaoqin.users import list_users, format_user_list
users = list_users(client)
print(format_user_list(users))

# 查考勤
from kaoqin.attendance import get_attendance, format_attendance_short
data = get_attendance(client)
print(format_attendance_short(data))

# 查任务
from kaoqin.tasks import list_tasks, format_task_list
tasks = list_tasks(client)
print(format_task_list(tasks))

# 导出月报 Excel
from kaoqin.reports import export_monthly_report
excel_bytes = export_monthly_report(client, "2026-06")
with open("月报-2026-06.xlsx", "wb") as f:
    f.write(excel_bytes)
```

### 模块功能

| 模块 | 功能 |
|------|------|
| `kaoqin.users` | 用户 CRUD、批量导入、重置密码 |
| `kaoqin.tasks` | 任务发布/查看/删除/关闭、提交审核 |
| `kaoqin.attendance` | 月度考勤统计、排名 |
| `kaoqin.reports` | 月报查看、快照生成、Excel 导出 |
| `kaoqin.meetings` | 会议管理、值班排班 |
| `kaoqin.leave` | 请假审批 |

详细使用方法见各模块源码注释。

## 项目结构

```
src/
├── app/                   # Next.js App Router 页面
│   ├── api/               # API 路由
│   │   ├── admin/         # 管理接口（用户/任务/会议管理）
│   │   ├── attendance/    # 考勤统计
│   │   ├── auth/          # 登录/登出
│   │   ├── duty/          # 值班管理
│   │   ├── leave/         # 请假审批
│   │   ├── meetings/      # 会议管理
│   │   ├── reports/       # 月报与导出
│   │   ├── tasks/         # 任务 CRUD
│   │   └── upload/        # 文件上传
│   ├── login/             # 登录页
│   ├── tasks/             # 任务大厅
│   ├── attendance/        # 考勤页面
│   ├── reports/           # 月报页面
│   └── ...
├── prisma/                # 数据库 Schema 与迁移
├── scripts/               # 工具脚本
├── cli/                   # Python CLI 管理工具
└── miniprogram/           # 微信小程序源码
```

## 部署

项目部署在阿里云 ECS，Nginx 反代 + Next.js 直接监听端口。

```bash
npm run build
npm start
```

## License

MIT
