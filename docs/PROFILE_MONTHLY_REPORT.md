# 个人主页（按月折叠活动明细）开发报告

**日期：** 2026年9月17日
**项目：** 邵小利志愿服务队 · 干事考勤系统
**范围：** 微信小程序端 + Next.js API（无数据库迁移）

## 一、需求

主人给出两张截图，提出三件事：

1. 任务详情页「已接取人员」里的**头像可点击**，点进去直接到该成员的个人主页；
2. 个人主页要能看到**他具体做了哪些活动**；
3. **把一个月的活动折叠在一起**，点那个板块才展开看该月明细；
4. **UI 层面要体现这个按钮可点击**（不能让人猜）。

## 二、结论与设计取向

本次**没有新增 Prisma 表、没有数据库迁移**。个人主页的活动明细本来就有数据源（`computeMemberMonthlyStats` 已能产出 `approvedTasks` 与 `meetingAbsences`），只是原来只查一个月、且接口限 ADMIN/MINISTER 访问。

两处关键设计判断：

| 判断 | 选择 | 理由 |
|---|---|---|
| 权限 | 放开为**任意登录成员可读** | 需求是「点同学头像就能看」，若仍限管理员，普通部员点了会 403。只暴露展示必需字段（姓名/角色/头像/活动名与积分），不含手机号、密码、`wxOpenId` |
| 查询方式 | 一次传 `months` 多月，前端本地折叠 | 按月折叠需要**多个月**的数据。若每次展开再请求，点一下要等一个来回。个人主页一次最多取 24 个月（活动量小，单次响应可接受） |

## 三、文件变更

| 文件 | 变更 |
|---|---|
| `src/app/api/admin/users/[id]/profile/route.ts` | 去掉 `hasRole(["ADMIN","MINISTER"])` 限制；新增 `months` / `from`+`to` 多月份查询；响应新增 `monthly[]` 并保留 `row` 兼容旧调用 |
| `miniprogram/utils/api.js` | 新增并导出 `getUserProfileMonths(userId, months)` |
| `miniprogram/pages/others/profile.js` | 接入多月接口；`buildItems()` 把任务/旷会/其它加减分合并排序；`monthGroups` 折叠状态；`onToggleMonth`、`onOpenTask` |
| `miniprogram/pages/others/profile.wxml` | 新增「活动记录」区：每月一行标题（月份 + 完成项数 + 积分）+ 可展开明细 |
| `miniprogram/pages/others/profile.wxss` | 折叠面板样式：箭头旋转动画、展开渐入、行按压态、负分红字 |
| `miniprogram/pages/tasks/detail.wxml` | 「已接取人员」两个分支的 `claimant-tag` 改为可点击（`catchtap`）；审核列表里的提交人也可点击 |
| `miniprogram/pages/tasks/detail.js` | 新增 `onOpenProfile()` |
| `miniprogram/pages/tasks/detail.wxss` | 头像加主色描边 + 尾部 `›` 箭头 + `hover-class` 按压反馈 |

## 四、接口设计

```
GET /api/admin/users/[id]/profile
```

**权限：** 任意登录成员（`readSessionCookie()` 非空即可）。

**月份参数（三选一，可并存时优先级：`months` > `from`+`to` > `month`）：**

| 参数 | 说明 |
|---|---|
| `month=YYYY-MM` | 单月（旧调用，兼容保留） |
| `months=YYYY-MM,YYYY-MM` | 多月，前端按此取最近 24 个月 |
| `from`+`to` | 连续区间，服务端展开成月份列表 |

**边界处理：**

- 未传 / 传空白串 / 区间为空 → **兜底当前月**，不再返回 400（旧客户端与「空串」场景都可能命中；早先的 `!months.length` 判断会把空白串误判为错误请求，本次已改为兜底）；
- 超过 `MAX_MONTHS = 24` → 400；
- 格式不匹配 `^\d{4}-\d{2}$` → 400 并指出是哪个值错了；
- 重复月份去重；
- `user.isActive === false` → 不查库，直接给空统计，避免下游判空。

**响应：**

```jsonc
{
  "user": { "id", "username", "displayName", "role", "avatarUrl", "profileBgUrl", "isActive" },
  "row": { /* 兼容旧字段：列表里最新一个有数据月份的统计 */ },
  "monthly": [ { "month": "2026-09", "...MemberMonthlyRow" } ]
}
```

`monthly` 已过滤掉 `computeMemberMonthlyStats` 返回 `null` 的月份。

## 五、前端折叠实现

### 数据整形

`buildItems(row)` 把三类记录统一成条目并**按时间倒序**：

| 来源 | type | 说明 |
|---|---|---|
| `row.approvedTasks` | `task` | 任务标题 + 积分 + 审核时间；**可点击跳任务详情** |
| `row.meetingAbsences` | `absence` | 形如「2026-08-20 会议旷会（八月例会）」，负分 |
| 其它加减分 | `adjust` | 见下 |

**「其它加减分」的重复计入坑（已规避）：** 后端的 `otherPoints` 是 `sumAdjustForUserInMonth` 的结果，**已经包含**会议旷会部分；而会议旷会又单独在 `meetingAbsences` 里列了一遍。若直接拿 `otherPoints` 再显示一条「其它加减分」，旷会扣分会显示两次。因此实现里做差：

```js
const meetingSum = (row.meetingAbsences || []).reduce((s, a) => s + (a.amount || 0), 0);
const otherOnly = (row.otherPoints || 0) - meetingSum;
if (otherOnly !== 0) { /* 才生成 adjust 条目 */ }
```

### 折叠行为

- **只保留有记录的月份**（`items.length > 0`），否则会渲染出一长串空面板；
- **默认展开最近一个有记录的月份**，其余折叠 —— 打开页面就能看到最近做了什么，不用先点一下；
- 标题行是**整行可点**（不是只有小箭头），并配 `hover-class` 按压变色；
- 箭头 `›` 折叠时指右、展开时旋转 90° 指向下（CSS `transform` + `transition`），展开的面板有 `translateY` 渐入动画；
- 月份标题格式为 `2026年9月`（不带前导零）。

### 空状态

- 完全没有记录 → 「最近还没有活动记录」；
- 某月无条目 → 该月不会出现在列表里（已被过滤），若强行展开则有「本月暂无活动记录」兜底。

## 六、可点击性的 UI 表达（对应需求第 4 条）

「已接取人员」的标签原本是纯展示样式，直接加 `bindtap` 用户看不出来。本次用**三重视觉提示**：

1. **头像描边**：`avatar-xs` 加 2rpx 主色（青绿）描边，让头像看着像可点的入口；
2. **尾部箭头**：标签右侧加 `›`，这是「可进入详情」最通用的符号；
3. **按压反馈**：`hover-class="claimant-tag-hover"` → 背景转为 `--color-primary-bg`、边框变主色、`transform: scale(0.96)`，点击时有明确的「按下去」手感。

审核列表里的提交人（`review-user-info`）同样处理，保持页面内交互一致。

### ★ 一个必须注意的细节：`catchtap` 而非 `bindtap`

标签内本来就有管理员的**移除按钮** `✕`（`onRemoveTap`）。如果把外层的头像跳转写成 `bindtap`，点 `✕` 时事件会冒泡到外层，**先跳转个人主页再弹移除确认**，两个动作打架。

因此：

- 外层标签用 `catchtap="onOpenProfile"`（阻止冒泡）；
- 内层 `✕` 也用 `catchtap="onRemoveTap"`（它自己要阻止冒泡到外层）。

两者都改 `catchtap` 后互不干扰：点头像只跳转，点 `✕` 只弹移除确认。

### 点自己的处理

`onOpenProfile` 里判断 `userId === 当前登录用户` 时只 toast「这是你本人」，不做跳转 —— 本人主页在「我的」里，重复开同一页没有意义。

## 七、验证

### 1. 页面逻辑测试（`scripts/test-profile-monthly.cjs`，18/18 通过）

用 Node 直接加载小程序页面对象（mock `wx` / `getApp` / `Page` / `utils/api` 桩），覆盖：

- `buildItems`：任务+旷会合并后**按时间倒序**（旷会时间更晚应排第一）；`otherPoints` 已含会议部分时**不重复生成**「其它加减分」；纯非会议加减分（`otherPoints=5`）单独成一条；
- `loadProfile`：空月份被过滤（3 个月入参 → 只剩 2 组）；月份标签为 `2026年9月`；**只有最近一组默认展开**；头像 URL 被 `fixUrl` 补成绝对地址；`hasAnyRecord` 正确；
- `onToggleMonth`：展开/折叠可来回切换；非法 index（`"x"`、缺字段）不抛错；
- `onOpenTask`：跳 `/pages/tasks/detail?id=t-1`；无 `taskId` 不跳转；
- `detail.onOpenProfile`：跳 `/pages/others/profile?id=u-2`；**点自己只 toast 不跳转**；无 `userId` 不报错；
- 无任何记录时 `hasAnyRecord=false` 且不崩。

### 2. 接口月份逻辑测试（`scripts/test-profile-api-months.cjs`，13/13 通过）

- `buildMonthRange`：同年区间、跨年区间（`2025-11..2026-02`）、单月区间；超限截断；
- 参数解析：`months` 逗号串去重、`months` 含空项（多余逗号）被过滤、空白串兜底当前月、未传参兜底当前月、非法格式 400、超 24 个月 400、单月 `month` 兼容、`from`+`to` 区间。

### 3. 项目规定的静态校验

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | ✅ schema is valid |
| `npx tsc --noEmit` | ✅ exit 0，无错误 |
| `npm run build` | ✅ exit 0（Next.js 构建通过，`/profile/[userId]` 与 `/api/admin/users/[id]/profile` 均在产物中） |
| WXML 结构校验（`scripts/check-wxml.cjs`） | ✅ 21 个文件、0 错误 |

> 其中 `scripts/check-wxml.cjs` 是本次新增的轻量校验器：检查标签闭合平衡、`{{ }}` 配对。**首版有误报**（把 `<wxs>`、`<picker>` 当成自闭合标签，而本项目里它们是成对书写的），修正 `SELF_CLOSING` 集合后全绿。

### 4. 仍需人工验收

小程序改动按 `AI_HANDOFF.md` §3 要求，**必须在微信开发者工具里重新编译并做真机验证**，本次未执行：

- 折叠面板的箭头旋转与渐入动画在真机上的实际观感；
- `hover-class` 按压态在手感上是否明确；
- 点头像跳转后在个人主页返回，任务详情页的接取列表状态是否正常保留；
- 管理员点 `✕` 确认不会误触发跳转（逻辑上已用 `catchtap` 隔离，但建议实操一次）。

## 八、真机首测反馈与修正（2026-09-17 下午）

主人真机点同学头像后，截图显示两个问题叠加：

```
用户不存在
缺少或无效的 month（格式 YYYY-MM）
```

### 症状一：线上跑的还是旧构建

`缺少或无效的 month（格式 YYYY-MM）` 这句话**在当前仓库里搜不到**（`grep` 全仓 0 命中）。这说明小程序请求的 `https://shaoxiaoli.top` **仍在运行改动前的旧构建**，旧版接口只认单月 `month` 参数，收到新的 `months` 参数就返回 400。

→ 服务器端个人主页 API 修复已于 **2026-09-17** 单独部署；课程表、成果等其它未完成改动没有随本次发布。小程序端 `profile.js` / WXML / WXSS 的错误态修复仍在本地，需在微信开发者工具中重新编译并上传小程序后才会生效。**这不是代码问题。**

### 症状二（真 bug）：接口报错被伪装成「用户不存在」

400 返回后 `res` 为空 → `res.user` 是 `undefined` → 页面落到 `wx:elif="{{!loading}}"` 分支，显示「用户不存在」。

但**「用户不存在」是 404 的语义**，把网络错误、权限错误、服务端错误全都说成「用户不存在」会把人带到完全错误的方向（本次就绕了一圈才发现是部署问题）。

已修正：

| 位置 | 修正 |
|---|---|
| `profile.js` 的 `data` | 新增 `loadError: ""` |
| `profile.js` `loadProfile` catch | 清空 `profileUser` / `attendance` / `monthGroups` / `hasAnyRecord`，写入 `loadError = err.message` |
| `profile.js` `loadProfile` 无 `user` 分支 | 同样置 `profileUser: null` 并给 `loadError` |
| `profile.js` | 新增 `onRetry()` |
| `profile.wxml` | `loading` 之后插入 `wx:elif="{{loadError}}"` 错误卡片：⚠️ + 「加载失败」+ 真实原因 + 「重新加载」按钮 |
| `profile.wxss` | 新增 `.empty-icon` / `.profile-error-msg` |

**关键点：失败时必须清空 `profileUser`。** 测试首版就抓出了这个 bug——只写 `loadError` 不清 `profileUser` 的话，旧用户数据还在，`wx:elif="{{profileUser}}"` 会先命中，错误卡片被挡住，页面显示的是**上一个人的数据**，比报错更危险。

### 验证

新增 5 条用例（总计 22 项，全过）：

- 接口 400 → 进入错误态、`loadError` 保留原始原因、`profileUser` 被清空（不残留旧用户）；
- 接口 400 → toast 真实原因，而不是「用户不存在」；
- 响应缺 `user` 字段 → 进入错误态；
- `onRetry` → 清空错误并重新加载成功。

### 待办

服务端 API 已完成单独部署；要在真机看到折叠面板和新的错误卡片，还需在微信开发者工具中编译、预览并上传当前小程序代码。发布后若头像仍打不开，再查目标成员 id 是否真实存在（那时「用户不存在」才是可信的 404）。

### ⚠️ 现有部署脚本不可直接用

顺手核对了两个脚本，**都不能照跑**，部署时请注意：

| 脚本 | 问题 |
|---|---|
| `scripts/build-and-upload.ps1` | ① `$projectPath` 写的是 `D:\develop\cursor Pro\shao-xiaoli-attendance`（**旧路径，与本机实际不符**）；② 用户写成 `root@shaoxiaoli.top`，而 `AI_HANDOFF.md` §8 核实的是 `admin@8.156.86.244`；③ 第 4 步在生产执行 `rm -rf .next` 后解压，**中途失败会导致线上 502**，没有回滚 |
| `scripts/deploy-lite.sh` | PM2 名称默认 `attendance-app`，实际是 `nextjs-app`；且依赖服务器 `git pull`（`AI_HANDOFF.md` §7 明确说服务器工作区有历史脏改动，不能直接 pull） |

本次改动**无数据库迁移**，因此服务器侧只需：更新 `.next` 构建产物 + `sudo pm2 restart nextjs-app --update-env` + `pm2 save`，**不需要 `prisma migrate deploy` / `prisma generate`**。

建议按 `AI_HANDOFF.md` §9 的手工流程做，并且：
- 先备份现有 `.next`（`cp -r .next .next.bak-$(date +%s)`）再替换，失败可回滚；
- 上传的产物要排除 `.next/dev`；
- 重启后按 §10 验收：`curl -fsS https://note.shaoxiaoli.top/api/version` 返回 200，再真机点头像确认折叠面板出现。

## 九、只部署个人主页服务端修复（2026-09-17）

本次严格按“只部署个人主页修复”执行：从 `HEAD` 的干净源码构建，只替换个人主页接口文件 `src/app/api/admin/users/[id]/profile/route.ts`，没有把课程表、成果、值班等其它未完成改动带到生产。

部署记录：

- 构建号：`h3jogye1CgAct2ux3nqVL`；
- 生产目录：`/www/wwwroot/nextjs-app/.next`；
- 原构建已保留为 `.next.bak-h3jogye1CgAct2ux3nqVL`，可回滚；
- PM2 `nextjs-app` 已重启并保持 `online`，已执行 `pm2 save`；
- `http://127.0.0.1:3000/api/version`、`https://shaoxiaoli.top/api/version`、`https://note.shaoxiaoli.top/api/version` 均返回 HTTP 200 和上述构建号；
- 本次无 Prisma schema 变化、无数据库迁移；临时上传包已清理。

注意：服务器发布不会自动更新微信小程序包；小程序端的错误态修复和折叠面板仍需在微信开发者工具中单独编译、真机验证和上传。

## 十、已知边界与后续可选项

- **一次最多 24 个月**（接口上限）。若以后要「查看全部历史」，需要改成分页或按需加载单月，而不是放宽这个上限——否则是让客户端一次拉全量。
- 月份选择用**自然月**，与现有月报口径一致；「最近的月份」从当前月开始倒推，因此新加入的成员前面会有若干空月份（已被过滤，不会显示空面板）。
- 活动明细目前只区分「任务 / 旷会 / 其它加减分」三类。若以后要显示**值班、请假**记录，需要在 `computeMemberMonthlyStats` 侧扩展字段（本次未动），前端 `buildItems` 再加分支即可。
- 接口路径仍在 `/api/admin/...` 下，但权限已不是「管理员专属」。路径名与语义现在有偏差，若以后要清理，可另开 `/api/users/[id]/profile` 并保留旧路径重定向；本次为控制改动面，未改路径。
