# 小程序代码审查报告

**项目**：邵小利志愿服务队干事考勤系统  
**审查日期**：2026-05-24  
**审查范围**：`miniprogram/` 全部代码（14 个页面、3 个工具模块）  
**参照基准**：`src/app/` 网页端（Next.js 16 + React 19）

---

## 一、项目概况

| 维度 | 网页端 | 小程序端 |
|------|--------|----------|
| 框架 | Next.js 16 App Router + React 19 | 原生微信小程序 |
| UI 库 | Ant Design 6 | 自定义 WXSS |
| 页面数 | 16 个路由页面 | 14 个页面 + 4 个 Tab |
| API 路由 | 35+ 个端点 | 共用同一后端 API |
| 认证 | Cookie (sxlat_session) | Storage token → Authorization: Bearer |
| 数据层 | Prisma 直连 + 服务端计算 | HTTP 请求 + 客户端计算 |

小程序 Tab 结构：**任务** → **消息** → **考勤** → **我的**

---

## 二、致命问题

### 2.1 任务详情 API 返回数据严重不足

**涉及文件**：
- `src/app/api/tasks/[id]/route.ts`（API 路由）
- `miniprogram/pages/tasks/detail.js`（小程序详情页）
- `src/app/tasks/[id]/page.tsx`（网页详情页——参照基准）

**问题描述**：

网页端任务详情页是服务端组件，在 Prisma 查询中直接 `include` 了 submissions、review、evidenceImages 等关联数据，并在服务端计算了以下关键字段传入客户端组件 `TaskDetailView`：

| 字段 | 用途 | 小程序是否可用 |
|------|------|:--:|
| `allClaimantsApproved` | 所有接取人是否均已提交且审核通过 | **否** |
| `slotsOrTaskFull` | 各时段/整单名额是否已满 | **否** |
| `canClaimMore` | 当前用户能否接取更多时段（含跨时段去重） | **否** |
| `mySubmission` | 当前用户的提交及审核状态 | **否** |
| `submissionsForReview` | 管理员视角的所有提交列表（含审核状态及凭证图） | **否** |
| `claimantsBySlot` | 按时段分组的接取人列表 | **否** |
| `claimedCountBySlot` | 每时段的已接人数 | **否** |
| `myClaimedSlotIds` | 当前用户接取了哪些时段 | **计算方式有限** |

而 API 路由 `GET /api/tasks/[id]` 仅返回：

```ts
// src/app/api/tasks/[id]/route.ts (全文)
const task = await prisma.task.findUnique({
  where: { id },
  include: {
    publisher: true,
    images: { orderBy: { sort: "asc" } },
    timeSlots: { orderBy: { sort: "asc" } },
    claims: {
      where: { status: "CLAIMED" },
      orderBy: { claimTime: "asc" },
      include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
    },
  },
});
return NextResponse.json({ task });
```

**实际后果**：

```javascript
// miniprogram/pages/tasks/detail.js:75-76
allClaimantsApproved: res.allClaimantsApproved || false,  // → 永远为 false
slotsOrTaskFull: res.slotsOrTaskFull || false,            // → 永远为 false
```

- `submissionsForReview` 在 `data` 中初始化为 `[]`，**从未被赋值** → 管理员审核面板（`detail.wxml:140-158`）永不渲染
- `mySubmission` 在 `data` 中初始化为 `null`，**从未被赋值** → 用户无法看到自己的提交状态和审核结果
- `allClaimantsApproved` 恒为 `false` → 关单/名额判断全部失效，任务永远显示为"可接取"
- 审核列表即使渲染出来，**没有展示凭证图片**，管理员无法审核提交内容

**严重程度**：**致命** — 任务详情页是小程序最核心的交互页面，上述字段缺失导致接取判断、提交状态、审核流程全线异常。

**修复方向**：增强 `GET /api/tasks/[id]` 路由，使其返回与网页端 `TaskDetailPage` 服务端组件同等级别的计算字段；或在客户端发起多次 API 调用自行计算。

---

### 2.2 会议"结束并记录旷会"功能完全缺失

**涉及文件**：
- `miniprogram/pages/meetings/detail.js` — 缺失功能
- `src/app/duty-and-meetings/meetings/[id]/page.tsx` — 网页基准
- `src/app/api/meetings/[id]/route.ts` — API 已就绪

**问题描述**：

网页端的会议详情页有完整的关会流程（`src/app/duty-and-meetings/meetings/[id]/page.tsx:134-171`）：
1. Checkbox 多选列表展示所有活跃部员
2. 已准假的部员自动标记为已准假并禁选
3. 部长/管理员勾选旷会人员
4. 点击"结束会议并记录考勤"
5. 调用 `POST /api/meetings/[id]` → 后端执行 `endMeetingWithAbsences()` 扣分

小程序 `meetings/detail.js` **完全没有此功能**：
- 只能查看会议基本信息（标题、时间、地点、状态）
- 只能查看与该会议相关的请假列表
- 有一个"请假"按钮跳转到请假申请页
- 尽管 `utils/api.js:100-102` 封装了 `endMeeting()` 函数，但**没有任何页面调用它**

**实际后果**：管理员/部长**必须**打开网页端才能关会。在小程序上看到会议无法结束，考勤数据无法录入。

**严重程度**：**致命** — 核心业务流程缺失，阻断管理操作。

**修复方向**：在 `meetings/detail.js` 中添加关会 UI，参照网页端的 Checkbox 多选逻辑，调用已有的 `api.endMeeting()`。

---

## 三、重要问题

### 3.1 发布任务不支持简单单时段模式

**涉及文件**：`miniprogram/pages/publish/publish.js`

**问题描述**：

网页端和 API 均支持两种创建模式：
- **多时段模式**：传入 `timeSlots` 数组（每段独立起止时间+人数上限）
- **单时段模式**：直接传入 `startTime` / `endTime`（`src/app/api/tasks/route.ts:26-31` 的 `superRefine` 逻辑）

小程序只能走多时段模式。`onLoad` 中虽然预填了默认时间（`tempSlotStartDate` / `tempSlotStartTime` 等），但用户**必须手动点击"添加时间段"按钮**才能将其加入 `timeSlots` 数组。

如果用户直接点提交：
- `timeSlots` = `[]`（空数组）
- `startTime` / `endTime` 未传入 body
- API 校验失败 → `"请设置时间段，或提供开始/结束时间"`（400）

**严重程度**：**重要** — 用户易误操作，用户体验差。

**修复方向**：提交时若 `timeSlots` 为空，自动将当前填写的日期时间作为 `startTime` / `endTime` 传入。

---

### 3.2 请假页面未校验用户的实际值班安排

**涉及文件**：
- `miniprogram/pages/leave/apply.js` — 小程序请假页
- `src/app/duty-and-meetings/page.tsx:149-162` — 网页基准
- `src/app/api/leave/route.ts:67-84` — 后端校验

**问题描述**：

网页端的值班请假只允许用户选择**自己实际被安排的值班时段**（`myDutySlotOptions`），来源是 `/api/duty` 的返回数据经 `myDutyAssignments` 过滤去重。

小程序 `leave/apply.js` 直接硬编码了 `WEEKDAYS[5] × PERIODS[5]` 的全量 picker，用户可以选择任何一个时段请假，即使那个时段根本没有安排自己。

后端已有校验（`src/app/api/leave/route.ts:67-84`），会返回 `"该时段不是您在值班表中的安排，无法请值班假"` 错误，但用户需要等到提交失败才知道。

**建议**：`onLoad` 时调用 `getDuty()` 获取用户自己的值班安排，动态生成可选项。

---

### 3.3 任务列表项缺少可接取状态视觉标签

**涉及文件**：
- `miniprogram/pages/tasks/tasks.js` + `tasks.wxml`
- `src/app/tasks/page.tsx` — 网页基准

**问题描述**：

网页端任务列表每行都显示彩色状态标签：
- 🟢 **可接取**（绿色）
- 🟠 **名额已满**（橙色）
- 🟡 **待处理**（金色）
- ⚪ **已结束**（灰色）

这是通过 `getTaskClaimVisibility()`（`src/lib/task-availability.ts`）结合 `status`、`endTime`、`headcountHint`、`claimedCount`、`allClaimantsApproved`、`slotsOrTaskFull` 综合判断的。

小程序列表只用了 API 的 `visibility` 筛选参数来过滤，但每个列表项**只显示了 `OPEN/CLOSED` 状态**（`STATUS_MAP`），没有展示可接取性标签。

虽然筛选器功能正常，但视觉上用户无法快速判断列表中每个任务的接取状态。

---

### 3.4 公告图片在小程序详情页不展示

**涉及文件**：
- `miniprogram/pages/announcements/detail.js`
- `src/app/api/announcements/[id]/route.ts`

**问题描述**：

后端公告详情 API 返回公告包含 `images` 数组（含 url 和 sort），但小程序 `announcements/detail.js` 拿到数据后直接 `setData({ announcement: res.announcement })`，没有对图片 URL 做相对路径补全。

如果公告图片的 URL 是相对路径（如 `/uploads/xxx.png`），在小程序中会无法加载。此外，公告的富文本 `body` 字段中可能包含图片引用，这些也未处理。

---

## 四、中等问题

### 4.1 图片 URL 补全逻辑碎片化

同一个相对路径→绝对路径的 URL 补全逻辑在至少 4 个文件中以不同形式出现：

| 文件 | 变量名 | 实现 |
|------|--------|------|
| `pages/tasks/tasks.js:54` | `fixUrl` | `!url.startsWith('http') ? base + ...` |
| `pages/tasks/detail.js:43-45` | `fixUrl` | 同上 |
| `pages/profile/profile.js:35-39` | 内联 | 同上 |
| `pages/settings/settings.js:17` | `fix` | 同上 |

**`pages/others/profile.js` 甚至完全没有做 URL 补全**——查看他人主页时，若对方头像是相对路径，会直接裂图。

应抽取到 `utils/` 中作为公共函数。

---

### 4.2 时间格式化函数重复定义

`formatTime()` 和 `formatDate()` 在以下文件中各自定义：

`tasks/tasks.js`、`tasks/detail.js`（WXS 中）、`duty/duty.js`、`messages/messages.js`、`meetings/detail.js`、`notifications/detail.js`、`announcements/detail.js`

总共 **7 个页面**各有自己的实现，仅格式略有差异（有的显示 MM-DD HH:mm，有的显示年月日）。应抽到 `utils/` 中统一维护。

---

### 4.3 审核列表缺少凭证图片展示

**涉及文件**：`miniprogram/pages/tasks/detail.wxml:140-158`

网页端的审核区域会展示每条提交的凭证图片（evidence images）并支持点击放大预览。小程序 `detail.wxml` 的审核列表只显示了：
- 提交人姓名
- 审核状态标签
- 备注文本
- 驳回原因

**完全没有展示 evidence images**。管理员无法在小程序中查看部员提交的凭证图片，这意味着审核功能在小程序中**不可用**，必须切换到网页端才能查看凭证。

---

### 4.4 值班请假审批按钮权限控制偏宽

**涉及文件**：`miniprogram/pages/duty/duty.js:218-219`

```javascript
onLeaveTap(e) {
    if (!this.data.isAdmin) return;
```

`isAdmin` 的实际含义是 `isAdminOrMinister`（在第 59 行赋值 `isAdmin: isAdminOrMinister`）。功能行为正确，但变量命名 `isAdmin` 会误导后续维护者以为只有管理员能操作。

---

## 五、轻微问题

### 5.1 值班页缺少下拉刷新

`pages/tasks/tasks.js` 和 `pages/messages/messages.js` 均实现了 `onPullDownRefresh`，但 `pages/duty/duty.js` 没有。用户在值班/会议/请假 Tab 中无法通过下拉刷新数据。

### 5.2 登录页面 `onWxLogin` 的双重 finally

`pages/login/login.js:66-90` 中，`onWxLogin` 函数在 `try` 块中有提前 `return`，但 `finally` 块在 `return` 之后仍会执行。当前逻辑正确，但 `autoLogin` 失败路径（第 79 行 `return`）后的 `finally` 形同虚设，代码可读性可优化。

### 5.3 `api.js` 中 `getMyAttendance` 的参数传递方式

```javascript
// api.js:32-34
function getMyAttendance(month) {
  return request({ url: "/api/me/attendance", data: { month } });
}
```

`wx.request` 在默认 GET 方法下会将 `data` 序列化为 URL query string，因此 `{ month }` → `?month=2025-05`，后端 `url.searchParams.get("month")` 可以正确接收。当前工作正常，但显式以 GET 方式处理更清晰：

```javascript
return request({ url: `/api/me/attendance?month=${encodeURIComponent(month)}` });
```

### 5.4 `checkLogin()` 调用模式不统一

- 部分页面仅在 `onLoad` 中调用（如 `reports.js`）
- 部分页面在 `onLoad` + `onShow` 中都调用（如 `tasks.js`、`duty.js`）
- 小程序页面切换时 `onLoad` 必然触发，`onShow` 中重复检查是冗余的。`onShow` 应用于数据刷新而非登录检查。

---

## 六、WXML 模板质量

### 6.1 审核面板条件渲染永不触发

```xml
<!-- detail.wxml:140 -->
<view wx:if="{{isAdminOrMinister && submissionsForReview && submissionsForReview.length > 0}}">
```

`submissionsForReview` 在 JS 中初始化为 `[]`，从未被赋值 → 此区块**永不渲染**。与问题 2.1 关联。

### 6.2 时段接取按钮的满额判断过于简化

```xml
<!-- detail.wxml:121 -->
<button wx:if="{{!utils.inArray(myClaimedSlotIds, item.id) && (!item.limit || item.claimedCount < item.limit)}}">
```

这个判断仅检查 `claimedCount < limit`，未考虑任务级 `headcountHint` 全局上限和 `slotCanAccept` 的复杂逻辑（如 `slot.headcountHint === 0` 表示继承任务上限）。与网页端 `src/lib/slot-claim-availability.ts` 相比简化过度，但在大多数实际场景下工作正常。

---

## 七、安全性审查

| 项目 | 状态 | 说明 |
|------|:--:|------|
| Token 存储 | ✅ | `wx.setStorageSync`，微信隔离沙箱，安全 |
| Token 过期处理 | ✅ | 401 → `clearSession()` + reLaunch 登录页 |
| 403 权限处理 | ✅ | Toast 提示"权限不足" |
| 请求签名 | ✅ | Bearer Token 经 `jose` JWT 验证 |
| 数据校验 | ✅ | 后端 Zod schema 校验，小程序仅做前端校验 |
| 上传安全 | ✅ | 文件上传使用专用 upload API，带 token |
| 敏感信息 | ✅ | 无敏感信息硬编码（wx openid 仅在服务端处理） |

---

## 八、功能完整性矩阵

| 业务模块 | 网页端 | 小程序端 | 差距 |
|----------|:------:|:--------:|:----:|
| 微信登录/绑定 | — | ✅ | — |
| 任务大厅（列表+筛选+搜索） | ✅ | ✅ | 缺状态标签 |
| 任务详情（接取/提交/审核/关单） | ✅ | ⚠️ | 审核缺凭证图，状态计算依赖缺失字段 |
| 发布任务 | ✅ | ⚠️ | 不支持单时段模式 |
| 值班表（5×5 网格+增删） | ✅ | ✅ | — |
| 会议列表+详情 | ✅ | ⚠️ | 无法关会 |
| 请假申请 | ✅ | ⚠️ | 未校验值班安排 |
| 请假审批 | ✅ | ✅ | — |
| 公告查看 | ✅ | ⚠️ | 图片可能不展示 |
| 公告发布 | ✅ | ✅ | — |
| 站内消息 | ✅ | ✅ | — |
| 月度考勤统计 | ✅ | ⚠️ | 藏在考勤 Tab 第 4 页 |
| 月报生成+导出 | ✅ | ✅ | — |
| 个人资料编辑 | ✅ | ✅ | — |
| 批量删除（任务/会议） | ✅ | ❌ | 未实现 |
| 用户管理（CRUD） | ✅ | ❌ | 未实现 |
| 头像/背景上传 | ✅ | ✅ | — |
| 下拉刷新 | ✅ | ⚠️ | 值班页缺失 |

---

## 九、修复优先级建议

| 序号 | 问题 | 严重度 | 涉及文件 | 预估工作量 |
|:----:|------|:------:|----------|:----------:|
| 1 | 增强 `GET /api/tasks/[id]` 返回完整计算字段 | **致命** | `src/app/api/tasks/[id]/route.ts` | 中 |
| 2 | 实现会议关会功能 | **致命** | `miniprogram/pages/meetings/detail.js` + `.wxml` | 中 |
| 3 | 审核列表展示凭证图片 | **重要** | `miniprogram/pages/tasks/detail.wxml` + `.js` | 小 |
| 4 | 发布页自动单时段回退 | **重要** | `miniprogram/pages/publish/publish.js` | 小 |
| 5 | 请假页动态加载值班安排 | **重要** | `miniprogram/pages/leave/apply.js` | 小 |
| 6 | 抽公共 `fixUrl` / `formatTime` 到 utils | 中 | 7+ 个页面文件 | 中 |
| 7 | 公告详情图片 URL 补全 | 中 | `pages/announcements/detail.js` | 小 |
| 8 | 值班页添加下拉刷新 | 轻微 | `pages/duty/duty.js` + `.json` | 极小 |
| 9 | 统一 `checkLogin()` 调用模式 | 轻微 | 多个页面 | 极小 |
| 10 | Others/profile.js 图片 URL 补全 | 轻微 | `pages/others/profile.js` | 极小 |

---

## 十、总结

小程序覆盖了考勤系统的**核心使用场景**（登录、任务浏览/接取/提交、值班查看、请假、消息），基本可用，但存在 **2 个致命缺陷**：

1. **任务详情 API 数据不足** — `allClaimantsApproved`、`slotsOrTaskFull`、`submissionsForReview`、`mySubmission` 全部缺失，导致详情页状态判断失效、审核面板永不渲染。修复此问题需后端 API 增强。

2. **会议关会功能缺失** — 这是网页端完整但小程序端完全未实现的最大功能缺口，直接影响管理员的日常操作闭环。

两个致命问题均涉及**后端 API 与小程序的数据契约不匹配**——API 路由返回的数据结构是为通用消费设计的"薄"数据，而网页端服务端组件凭借 Prisma 直连优势做了大量服务端计算。小程序作为纯客户端，无法弥补这一差距。

修复第一个致命问题后，任务详情页的核心交互（接取判断、提交查看、审核流程）将恢复正常。修复第二个致命问题后，小程序将覆盖管理员的全套操作流程。
