# 微信小程序 UI / 交互校阅报告

| 项目 | 说明 |
|------|------|
| **校阅对象** | `miniprogram/` 目录（原生微信小程序） |
| **对照标准** | 已完成并上线的 **Web 移动端**（Next.js + Ant Design 6，`Grid.useBreakpoint()` 下 `isMobile` 布局） |
| **校阅日期** | 2026-05-24 |
| **设计基准色** | 主色 `#1677ff`（Ant Design 默认蓝）；页面底 `#f5f5f5`；卡片白底 + 浅灰描边 |

---

## 一、校阅说明

### 1.1 对照方法

- **视觉**：色彩、字号、圆角、间距、卡片形态、标签语义色是否与 Web 移动端正文/卡片一致。
- **信息架构**：Tab / 侧栏菜单、页面层级、管理人员入口是否与 Web `AppShell` 一致。
- **组件行为**：筛选、空状态、加载、弹窗、上传、角色可见性与 Web 同页面对齐。
- **交互细节**：点击反馈、未读提示、跳转目标、表单校验提示。

### 1.2 总体结论（UI 维度）

| 维度 | 符合度 | 摘要 |
|------|--------|------|
| 设计令牌（颜色/字号） | ★★★★☆ | `app.wxss` 已系统复刻 Ant Design 变量，页面级执行较一致 |
| 全局导航 | ★★★☆☆ | Tab 四栏与 Web 移动抽屉菜单大致对应，但 **Tab 图标缺失**、无消息角标 |
| 任务模块 | ★★★☆☆ | 卡片列表形态接近；**状态标签语义**与 Web `getTaskClaimVisibility` 不一致 |
| 消息模块 | ★★★☆☆ | 列表风格尚可；**类型图标/未读/公告发布**明显弱于 Web |
| 考勤（值班/会议/请假） | ★★★☆☆ | Tab 内嵌合理；**管理端能力**（排班编辑、发会议）缺失 |
| 个人主页 | ★★★★☆ | 封面+渐变与 Web 微信风大图 **高度一致**；考勤明细深度不足 |
| 设置 | ★★☆☆☆ | 仅保留账号/密码/上传，**无主题、无版本号、无背景预览** |
| 深色模式 | ☆☆☆☆☆ | Web 已支持浅/深/跟随系统；小程序 **未实现** |
| 无障碍与规范 | ★★☆☆☆ | 大量 emoji 作图标；部分硬编码色未走 CSS 变量 |

**综合**：小程序在「主色 + 卡片 + 个人封面」上较好地对齐了 Web；在「状态语义、管理端完整度、消息/公告、主题与导航细节」上仍有明显差距。下文按模块逐项列出。

---

## 二、设计系统对照（全局 UI）

### 2.1 已对齐项 ✅

| 令牌 / 组件 | Web 移动端 | 小程序 `app.wxss` | 说明 |
|-------------|------------|-------------------|------|
| 主色 | `token.colorPrimary` ≈ `#1677ff` | `--color-primary: #1677ff` | 一致 |
| 页面背景 | `colorBgLayout` `#f5f5f5` | `--color-bg-layout` | 一致 |
| 卡片 | `Card` 白底、圆角、浅边框 | `.card` 16rpx 圆角 + `#f0f0f0` 边框 | 一致 |
| 标签色板 | `Tag` green/blue/orange/red/… | `.tag-blue` … `.tag-volcano` | 色值与 Ant 预设基本一致 |
| 主按钮 | `Button type="primary"` | `.btn-primary` 高度 64rpx | 一致 |
| 危险按钮 | `Button danger` | `.btn-danger` | 一致 |
| 辅助文案 | `Typography.Text type="secondary"` | `.hint` + `--color-text-secondary` | 一致 |
| 导航栏 | 顶栏白底 + 底部分割线 | `app.json` `navigationBarBackgroundColor: #1677ff` | 小程序用 **整栏蓝色+白字**，Web 移动为 **白顶栏+黑字**（见 2.2） |

### 2.2 差异项 ⚠️

| 项目 | Web 移动端 | 小程序 | 建议 |
|------|------------|--------|------|
| **顶栏样式** | 白底 Header + 标题 + 头像 + 退出 | 系统导航栏 **蓝底白字**「邵小利考勤」 | 各页 `navigationBarBackgroundColor` 改为 `#ffffff`，`navigationBarTextStyle: black`，与 Web 统一；或保留品牌蓝但内页二级页用白顶栏 |
| **品牌区** | 侧栏/登录页有 `DeptLogo` +「干事考勤系统」「宣传部」 | 登录页仅文字标题，**无 Logo** | 登录页增加 `dept-logo` 图片与副标题「宣传部」 |
| **深色模式** | `ClientProviders` + `data-theme` + Ant `darkAlgorithm` | 无 | 短期可在设置说明「跟随系统暂未开放」；长期用 CSS 变量 + `prefers-color-scheme` 或手动切换 |
| **安全区 / 底部** | 内容区 `padding: 12px` | Tab 页 FAB `bottom: 120rpx` 已避让 Tab | 需真机核对 iPhone 底部安全区；必要时 `padding-bottom: env(safe-area-inset-bottom)` |
| **字体** | 系统栈 + Ant 默认 14px 正文 | 28rpx base（≈14px） | 一致；标题层级建议统一用 `--font-size-xl` / `--font-size-lg` |
| **阴影** | Card 轻阴影 | 全局 `--shadow` 定义了但 **卡片多仅用边框** | 可选：任务卡片加 `box-shadow: var(--shadow)` 贴近 Ant Card |

### 2.3 TabBar 专项（高优先级 UI 缺陷）

**Web 移动端**：侧栏/抽屉菜单 — 任务、会议与值班、消息（带未读红点）、个人主页、设置；管理人员另有发布任务、月报、部员考勤、账号管理。

**小程序**：底部 Tab — 任务 | 消息 | 考勤 | 我的。

| 对比项 | Web | 小程序 | 问题 |
|--------|-----|--------|------|
| Tab 图标 | Ant Icons | `images/tab-*.png` | **仓库内无 png 文件**，Tab 图标空白或报错 |
| 消息未读 | 侧栏 `Badge dot` + 事件刷新 | 仅页内标题「(N条未读)」 | **Tab 上无角标**，用户切走 Tab 后不易感知 |
| 「考勤」命名 | 「会议与值班」 | Tab 文案「考勤」 | 可接受缩写，但页内仍是值班/会议/请假，建议在 Tab 或首屏副标题写全 |
| 设置入口 | 独立菜单项 | 藏在「我的」内 | 符合小程序习惯，可保留 |
| 发布任务 | 菜单项 | 任务页 FAB `+` | 位置不同但可发现；**FAB 与 Tab 重叠风险**需真机看 |

**修改建议**：

1. 补全 8 张 Tab 图标（81×81，普通/选中态），或实现 `custom-tab-bar` 用字体图标。
2. `onShow` 消息页 / App `onLaunch` 时调用 `wx.setTabBarBadge({ index: 1, text: '3' })`（>99 显示 `99+`），已读清零 `removeTabBarBadge`。
3. FAB 距底：`calc(120rpx + env(safe-area-inset-bottom))`。

---

## 三、分页面 UI 校阅

### 3.1 登录页 `pages/login/login`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 布局 | 居中 Card，`min(420px,100%)` | 顶部 `.card` 贴边 | ★★★☆☆ |
| 品牌 | Logo + 标题 +「宣传部」 | 仅「首次使用请绑定」文案 | ★★☆☆☆ |
| 表单 | Ant `Form` + 标签 | 原生 `input` + 两个 `button` | ★★★☆☆ |
| 主按钮 | 单个「登录」 | 「微信授权并绑定」+「已绑定，直接登录」 | ★★★★☆（业务差异合理） |
| 背景 | `#f5f5f5` 全屏 | 继承 `page` 灰底 | ★★★★☆ |

**改进意见**：

- 增加与 Web 一致的 **Logo + 系统名 + 副标题** 区块（占屏高约 30%）。
- 输入框改用全局 `.input` 类（与 `app.wxss` 一致），避免 `login.wxss` 单独一套 `#eee` 边框。
- 已登录用户打开登录页时自动跳转任务 Tab（避免闪一下登录表单）。

---

### 3.2 任务大厅 `pages/tasks/tasks`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 搜索 | `Input.Search` + 筛选 Select（可见性/是否结束/排序） | 搜索框 + 横向 **5 个筛选 pill** | ★★★☆☆ |
| 列表形态 | 移动端 **表格单列**：标题行+状态 Tag+时间副行 | **卡片列表**：标题、描述、积分、时间、人数 | ★★★★☆（小程序卡片更适合触屏） |
| 状态 Tag | `getTaskClaimVisibility`：**可接取 / 名额已满 / 待处理 / 已结束**（颜色绿/橙/灰） | 仅 `OPEN→进行中`、`CLOSED→已结束` | ★★☆☆☆ **重大差异** |
| 标题展示 | 超长标题中间省略 `前两字…后两字` | 全文 `ellipsis` | ★★★☆☆ |
| 接取人 | 列表可带头像 peek（管理端） | 仅「已接取 N/M 人」+ 已满 tag | ★★★☆☆ |
| 发布入口 | 顶区按钮「发布任务」 | 右下 FAB `+` | ★★★★☆ |
| 空状态 | `Empty` 组件 | emoji 📋 + 文案 | ★★★☆☆ |
| 下拉刷新 | 浏览器刷新 | `enablePullDownRefresh` | ★★★★☆ |

**改进意见（UI/交互）**：

1. **状态 Tag 与 Web 对齐**：列表接口已含 `slotsOrTaskFull`、`allClaimantsApproved` 等字段时，前端应复刻四套文案与颜色（可在 wxs 中实现简化版 `getTaskClaimVisibility`）。
2. 增加 Web 已有的 **「是否已结束」「排序」** 筛选（可用第二行 pill 或底部 ActionSheet）。
3. 搜索框与筛选区间距统一为 `app.wxss` 的 `--spacing-md`。
4. 空状态改用 Ant 风格插图（或 SVG），减少 emoji 依赖。
5. 加载中：使用 **骨架屏**（3 条灰色卡片）替代纯文字「加载中...」。

---

### 3.3 任务详情 `pages/tasks/detail`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 顶图 | `Carousel` 多图 | `swiper` 高 420rpx | ★★★★☆ |
| 顶栏状态 | 大号 `Tag`（可接取/待处理等） | 「待处理/已结束」+ 积分 tag | ★★★☆☆ |
| 信息区 | `Descriptions` 两列标签 | 手写 `info-row` / `info-label` | ★★★★☆ |
| 接取人 | 分时段 + 头像 + 管理端移除 | 分时段 tag + 小头像 + ✕ 移除 | ★★★★☆ |
| 提交凭证 | `TaskActions` 内 Modal + Upload | 底部 **半屏 sheet** + 图片网格 | ★★★★☆（sheet 更符合移动端） |
| 审核 | 列表内联按钮 + 驳回原因 Modal | sheet 审核（部分）+ 内联通过/驳回 | ★★★☆☆（`submissionsForReview` 数据若未加载则 UI 不显示） |
| 关单 | 「收工」「提前结束」分按钮 + 确认 Modal | 同类文案 + sheet | ★★★★☆ |
| 图片预览 | 点击放大 | **未绑定** `previewImage` | ★★☆☆☆ |

**改进意见**：

1. 顶栏状态 Tag 同任务列表，使用 **四套语义色**。
2. 凭证图、任务轮播图支持 **点击全屏预览**（`wx.previewImage`）。
3. 提交 sheet：上传中显示 **进度/禁用确认按钮**；图片加 **失败重试** 态。
4. 审核区：与 Web 一致展示 **凭证缩略图**；驳回必填原因时红色提示。
5. sheet 遮罩：增加 **上滑动画**（`transition`）与拖拽关闭（可选），提升「原生感」。
6. 无图任务：轮播区不占 420rpx 空白，改为紧凑标题卡（与 Web 无图时一致）。

---

### 3.4 发布任务 `pages/publish/publish`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 表单 | Ant `Form` 分段、日期时间选择器 | 原生 input + `datetime` 选择 | ★★★☆☆ |
| 多时段 | 动态增减 `Form.List` | 手动添加时段列表 | ★★★☆☆ |
| 配图 | `Upload` 卡片列表 | 九宫格 + 上传 | ★★★★☆ |
| 校验提示 | 字段下红色错误文案 |  mostly Toast | ★★☆☆☆ |
| 必填时段 | Web 强制至少一段 | 小程序 **未强制**，易提交失败 | ★★☆☆☆（属交互，但表现为主按钮点击后 Toast） |

**改进意见**：

- 发布页顶加 **步骤提示**或「* 必填」标识，与 Web 表单 label 一致。
- 时段用 **两行 picker**（开始/结束）替代单个 `datetime-local` 字符串，避免格式歧义。
- 提交中：全屏 **loading 蒙层** + 禁用返回。

---

### 3.5 消息 `pages/messages/messages`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 管理端发公告 | 页顶 `AnnouncementEditor` 卡片（标题/正文/图/弹窗天数） | **双次 `showModal` 输入** | ★☆☆☆☆ **差距最大** |
| 说明文案 | 灰色说明 Card（消息类型说明） | 无 | ★★☆☆☆ |
| 列表项 | `Card` + 类型 `Tag`（公告/任务/请假…）+ 标题 + 摘要 + 「查看详情」 | 圆形 emoji 图标 + 标题 + 摘要 | ★★★☆☆ |
| 未读背景 | 未读项 `colorFillAlter` 浅灰底 | 仅 **红点**（且字段 `readAt` 错误应为 `read`） | ★★☆☆☆ |
| 全部已读 | 卡片右上角 Link 按钮 | 蓝色文字「全部已读」 | ★★★★☆ |
| 类型图标 | Ant `Tag` 颜色区分 | emoji 固定映射（且 **类型名与后端不一致**） | ★★☆☆☆ |

**改进意见**：

1. **公告发布 UI**：单独页面 `pages/announcements/publish`，字段对齐 Web `AnnouncementEditor`（标题、正文、多图、弹窗开关、天数）。
2. 列表项左侧改为 **彩色圆角 Tag**（公告/任务/会议/请假），与 Web `typeLabel` 一致，少用 emoji。
3. 未读：修正 `read` 字段；未读项整卡 **浅蓝/浅灰底**（`#fafafa` 或 `#e6f4ff`）。
4. 列表项右侧增加 **「查看详情 ›」** 链接样式（灰色小字）。
5. 顶部增加与 Web 相同的 **说明折叠 Panel**（可默认收起）。

---

### 3.6 消息/公告/通知详情页

| 页面 | Web | 小程序 | 符合度 |
|------|-----|--------|--------|
| 公告详情 | 独立页 + 图片 + 已读统计（管理端） | `announcements/detail` 基础展示 | ★★★☆☆ |
| 通知详情 | 消息详情 + 跳转按钮 | `notifications/detail` | ★★★☆☆ |

**改进意见**：公告详情管理端展示 **已读人数/列表**（与 Web `announcements/[id]` 一致）；正文支持 **富文本换行**；图片宽度 100% 圆角 8px。

---

### 3.7 考勤 Tab `pages/duty/duty`（会议与值班）

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 结构 | `Tabs`：值班表 / 会议 / 请假 /（管理）统计 | 顶部 **sticky Tab 条** 同结构 | ★★★★☆ |
| 值班表 | 可编辑表格（管理端添加/删除格子） | **只读** 5×5 网格 + 蓝色姓名 tag | ★★★☆☆（部员只读合理；管理端缺编辑 UI） |
| 会议列表 | `Table` / 卡片 + 发布会议按钮 | 卡片列表，无发布 | ★★★☆☆ |
| 请假 | 部员表单 + 管理端 `LeaveSlipModal` | 跳转 `leave/apply` + 点击审批 ActionSheet | ★★★☆☆ |
| 统计 | 部员考勤页独立；此处可跳转 | Tab 内简表 | ★★★☆☆ |

**改进意见**：

1. 值班表：管理端格子 **点击弹出** 添加/编辑（对齐 Web Modal）；部员仅读。
2. 会议 Tab：管理端右上角 **「发布会议」** 主按钮。
3. 请假列表：展示 **申请人头像**；待审批项左侧色条（橙色）。
4. Tab 条：增加 **滑动下划线动画**；字体 28rpx → 选中 30rpx 加粗（已部分实现）。
5. 值班表小屏：横向 **scroll-view** 包裹表格，避免 5 列挤压（字号 22rpx 过小难读）。

---

### 3.8 请假申请 `pages/leave/apply`

| 项目 | Web | 小程序 | 符合度 |
|------|-----|--------|--------|
| 表单 | `MemberLeaveForm` 分类、会议选择、原因 | 独立页表单 | 需对照字段完整度 ★★★☆☆ |

**改进意见**：表单项使用统一 `.form-group` / `.form-label`；提交按钮吸底固定（`submit-area` 与 publish 一致）。

---

### 3.9 个人主页 `pages/profile/profile`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 封面 | 高 220px、圆角 14、渐变遮罩、底左头像+姓名 | 高 440rpx、底圆角 28rpx、**视觉非常接近** | ★★★★★ |
| 无背景 | 透明底 + 头像区 | 蓝色渐变 `cover-bg-empty` | ★★★★☆ |
| 更换头像 | 封面区右侧 Button + 裁切 `ImgCrop` | 在 **设置页** 更换，不在封面 | ★★★☆☆ |
| 考勤摘要 | `Table` 六列 + 说明文案 + **月份选择器** | 四格数字 stat（参与/提交/完成/积分） | ★★★☆☆ |
| 明细 | 当月通过任务列表、旷会列表 | **无** | ★★☆☆☆ |
| 角色文案 | `username · 部员` | WXML 中 `roleLabel()` **无效** | ★☆☆☆☆ **Bug** |
| 统计字段 | `claimCount` | 误写 `claimedCount` | ★☆☆☆☆ **Bug** |

**改进意见**：

1. 修复 `roleText` 与 `claimCount` 绑定。
2. 考勤区增加 **月份 picker**（与 Web `DatePicker month` 一致）。
3. 增加折叠区块「当月完成任务」「例会旷会」（列表或简单卡片）。
4. 封面右下角可增加 **「更换头像」** 文字按钮（部员常用）。
5. 管理端入口「月报」已在菜单行 — 与 Web 一致。

---

### 3.10 他人主页 `pages/others/profile`

应对齐 Web `profile/[userId]` peek 模式：停用标签、只读考勤、无编辑按钮。

**改进意见**：封面角标 **「已停用」** 灰色 Tag；无数据时说明文案与 Web 一致。

---

### 3.11 设置 `pages/settings/settings`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 分区 | 账号 / 密码 / 主题 / 主页背景 / 版本号 | 头像、背景、账号、密码 | ★★☆☆☆ |
| 主题 | `Radio.Group` 浅色/深色/跟随系统 | **无** | ☆☆☆☆☆ |
| 背景 | 预览图 + 上传 + 清除 | 仅按钮「更换背景」 | ★★☆☆☆ |
| 头像裁切 | `antd-img-crop` | 无裁切，直接上传 | ★★★☆☆ |
| 版本 | 展示 `buildId` | **无** | ★★☆☆☆ |
| 布局 | 多张 `Card` 分组 | `form-page` 平铺 | ★★★☆☆ |

**改进意见**：

1. 拆分为多张 **`.card` 分组**：「外观」「账号与安全」「关于」。
2. 背景区显示 **当前背景缩略图** + 清除按钮（对齐 Web）。
3. 底部「当前版本：xxxx」灰色小字。
4. 主题：若短期不做深色，显示 **禁用态 Radio + 说明「小程序版即将支持」**。

---

### 3.12 月报 `pages/reports/reports`

| 项目 | Web 移动端 | 小程序 | 符合度 |
|------|------------|--------|--------|
| 月份 | `DatePicker` | `picker mode="date" fields="month"` | ★★★★☆ |
| 数据展示 | `Table` 多列 | 卡片 + 三行 stat | ★★★☆☆ |
| 导出 Excel | 有导出按钮 | **无** | ★★☆☆☆（能力缺失，UI 上无入口） |
| 生成快照 | 「生成月报」按钮 | **无** | ★★☆☆☆ |

**改进意见**：管理端顶部工具栏：**生成** | **导出** 两按钮（与 Web `reports` 页一致）；表格列过多时用横向滚动 `scroll-view` 表格式列表。

---

### 3.13 会议详情 `pages/meetings/detail`

应对齐 Web `duty-and-meetings/meetings/[id]`：会议信息、结束会议、旷会勾选（管理端）。

**改进意见**：管理端结束会议用 **底部固定双按钮**；旷会部员用 **多选列表+头像**（而非纯 ID）。

---

## 四、全局交互与反馈（UI 相关）

| 项目 | Web 移动端 | 小程序 | 建议 |
|------|------------|--------|------|
| 加载失败 | `message.error` + 可重试 | 多数静默 | 列表页展示 **「加载失败，点击重试」** 居中文案 |
| 操作成功 | `message.success` | `showToast` | 已对齐 |
| 确认危险操作 | `Popconfirm` | `showModal` | 已对齐 |
| 每日公告弹窗 | `AppShell` 内 `Modal` 大图+正文 | **无** | 首页/任务 Tab `onShow` 拉 `/api/announcements/popup` 用 **自定义弹窗** 复刻 |
| 图片 URL | 自动同源 | 手动 `fixUrl` 分散 | 统一 `resolveMediaUrl` 避免重复逻辑 |
| 页面切换 | 无闪屏 | `navigateTo` 默认右滑 | 保持；登录用 `reLaunch` 合理 |

---

## 五、可访问性与视觉规范

| 问题 | 说明 | 建议 |
|------|------|------|
| emoji 作图标 | 消息、空状态、Tab 占位 | 逐步换 **SVG/PNG 图标库**（如 iconfont） |
| 对比度 | 部分 `.hint` 为 `#999` | 确保不低于 WCAG 4.5:1（可用 `#8c8c8c` 替代） |
| 点击热区 | 部分 tag、✕ 移除按钮偏小 | 最小热区 **88rpx×88rpx** |
| 硬编码色 | `messages.wxss`、`duty.wxss` 大量 `#fff` `#333` | 改为 `var(--color-*)` 便于日后深色模式 |
| 按钮默认样式 | 原生 `button` 带边框 | 全局 `button::after { border: none }` 去默认描边 |

---

## 六、功能与 UI 交叉问题（影响界面正确显示）

以下虽属逻辑/数据，但会直接导致 **UI 显示错误**，列入校阅报告：

| # | 问题 | UI 表现 |
|---|------|---------|
| 1 | TabBar 图标文件缺失 | Tab 栏图标空白 |
| 2 | 消息 `readAt` → 应为 `read` | 未读红点不显示 |
| 3 | 消息类型与 `taskId` 等字段不一致 | 点击消息无法跳转 |
| 4 | 个人页 `roleLabel()` 在 WXML 无效 | 角色行显示空白或异常 |
| 5 | `claimedCount` 字段名错误 | 「参与任务」永远为 0 |
| 6 | 任务列表状态仅 OPEN/CLOSED | 与 Web 四态 Tag 不一致，用户误判能否接取 |
| 7 | `submissionsForReview` 未在详情接口赋值 | 「待审核」区块永不出现 |

---

## 七、修改优先级建议（UI 向）

### P0 — 阻塞体验 / 与 Web 严重不符

1. 补全 TabBar 图标 + 消息 Tab 角标  
2. 修复个人页角色与考勤数字展示  
3. 修复消息未读与跳转（列表项 UI 才能正常工作）  
4. 任务列表/详情 **状态 Tag 四态** 与 Web 对齐  

### P1 — 主要视觉与流程对齐

5. 登录页品牌区（Logo + 宣传部）  
6. 消息页公告发布改为独立表单页（对齐 `AnnouncementEditor`）  
7. 设置页分组 + 背景预览 + 版本号  
8. 任务详情图片 `previewImage`  
9. 导航栏白底样式与 Web 统一  

### P2 — 体验打磨

10. 骨架屏、加载失败重试、sheet 动画  
11. 个人页月份选择 + 任务/旷会明细折叠  
12. 深色模式或设置内说明  
13. 去除 emoji 图标，统一 icon 资源  
14. 管理端值班编辑、会议发布入口  

### P3 — 长期

15. 月报导出/生成 UI  
16. custom-tab-bar 完全自定义  
17. 与 Web 一致的每日公告弹窗组件  

---

## 八、页面对照清单（速查）

| 小程序页面 | Web 对应路由 | UI 对齐优先级 |
|------------|--------------|---------------|
| `login/login` | `/login` | P1 |
| `tasks/tasks` | `/tasks` | P0 |
| `tasks/detail` | `/tasks/[id]` | P0 |
| `publish/publish` | `/publish` | P1 |
| `messages/messages` | `/messages` | P0 |
| `notifications/detail` | `/messages/[id]` | P1 |
| `announcements/detail` | `/announcements/[id]` | P1 |
| `duty/duty` | `/duty-and-meetings` | P1 |
| `meetings/detail` | `/duty-and-meetings/meetings/[id]` | P2 |
| `leave/apply` | 值班页内嵌表单 | P2 |
| `profile/profile` | `/profile` | P0 |
| `others/profile` | `/profile/[userId]` | P2 |
| `settings/settings` | `/settings` | P1 |
| `reports/reports` | `/reports` | P2 |

---

## 九、附录：Web 移动端关键 UI 文件索引

| 模块 | 文件路径 |
|------|----------|
| 壳层/导航/公告弹窗 | `src/components/AppShell.tsx` |
| 主题 | `src/components/ClientProviders.tsx` |
| 任务列表 | `src/app/tasks/page.tsx`（`isMobile` 列） |
| 任务详情 | `src/app/tasks/[id]/task-detail-view.tsx` |
| 消息 | `src/app/messages/page.tsx`、`announcement-editor.tsx` |
| 值班会议 | `src/app/duty-and-meetings/page.tsx` |
| 个人主页 | `src/app/profile/profile-view.tsx` |
| 设置 | `src/app/settings/page.tsx` |
| 状态语义 | `src/lib/task-availability.ts` |

## 十、附录：小程序 UI 文件索引

| 模块 | 路径 |
|------|------|
| 设计令牌 | `miniprogram/app.wxss` |
| Tab 配置 | `miniprogram/app.json` |
| 各页样式 | `miniprogram/pages/*/*.wxss` |
| 各页结构 | `miniprogram/pages/*/*.wxml` |

---

*本报告仅针对 UI/交互与视觉对齐；接口、鉴权、部署等问题见 `docs/DEVELOPMENT_REPORT.md` 与 `docs/MINIPROGRAM.md`。*
