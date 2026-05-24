# 邵小利志愿服务队·干事考勤系统 — 项目优化报告

**日期**：2026年5月24日  
**项目**：shao-xiaoli-attendance  
**分支**：main

---

## 一、概览

本次会话对小程序端和 Web 后台进行了全面优化，主要方向为：**小程序功能对齐 Web 端**、**Bug 修复**、**微信生态集成（通知 + 转发分享）**，涉及 **30+ 个文件** 的修改。

---

## 二、Bug 修复

### 2.1 登录页 dept-logo.png 500 错误
- **问题**：小程序 `login.wxml` 引用了不存在的图片文件，导致控制台持续报错
- **修复**：优先从服务器加载 `dept-logo.png`，加载失败时使用蓝底白心兜底样式，与 Web 端 `DeptLogo` 组件三级回退策略完全对齐
- **文件**：`miniprogram/pages/login/login.wxml`、`login.wxss`、`login.js`

### 2.2 任务状态缺少"待处理"
- **问题**：WXS 中 `getVisLabel` 只处理 3 种状态（可接取/名额已满/已结束），缺少后端 `getTaskClaimVisibility` 中的"待处理"状态
- **触发条件**：任务截止时间已过，但有人已接取且尚未全部提交审批完成
- **修复**：WXS 函数增加 `endTime`/`claimedCount` 参数，补齐 4 态逻辑；筛选标签从"待提交"统一为"待处理"
- **文件**：`miniprogram/pages/tasks/tasks.wxml`、`tasks.js`、`detail.wxml`、`detail.js`

### 2.3 关单/收工时间限制
- **问题**：任务过了截止时间后，Web 和小程序均无法收工或提前结束
- **修复**：去除了 3 处时间限制
  - `src/app/api/tasks/[id]/close/route.ts`：删除后端时间校验
  - `src/app/api/tasks/[id]/remove-claim/route.ts`：删除截止时间校验
  - `src/app/tasks/[id]/task-detail-view.tsx`：前端按钮条件去掉 `!timeEnded`
- **效果**：无论任务过期多久，管理员始终可以收工、提前结束、移除接取人员

### 2.4 接取按钮无法显示
- **问题**：任务详情页时段显示"可接"但无接取按钮
- **根因**：`limit` 字段为 `null` 时，`claimedCount < null` 始终为 `false`
- **修复**：改为 `!item.limit || item.claimedCount < item.limit`
- **文件**：`miniprogram/pages/tasks/detail.wxml`

### 2.5 无上限被识别为 0 上限
- **问题**：未设人数上限的时段显示"已满"无法接取
- **根因**：`claimedCount >= null` 被 JavaScript 当作 `>= 0`，永远成立
- **修复**：条件改为 `item.limit && item.claimedCount >= item.limit`

### 2.6 发布任务时间选择器点不动
- **问题**：小程序不支持 `mode="datetime"`，仅支持 `date` + `time` 分开
- **修复**：拆为 4 个独立 picker（开始日期+时间 / 结束日期+时间），默认填充当前 ~ 24 小时后
- **文件**：`miniprogram/pages/publish/publish.wxml`、`publish.js`

### 2.7 值班表删除无反应
- **根因**：`loadDuty` 中 `{ id: a.id, ...a.user }` 导致 `a.user.id` 覆盖了分配的 `a.id`
- **修复**：改为 `{ aid: a.id, ...a.user }` 保留分配 ID
- **文件**：`miniprogram/pages/duty/duty.js`、`duty.wxml`

### 2.8 积分按钮显示异常
- **原始需求**：积分改为 1/2/3 三个按钮，横向排列
- **问题**：wxss flex 不生效，按钮垂直排列
- **修复**：改用内联 `style="display:flex;flex-direction:row"` 强制横向
- **文件**：`miniprogram/pages/publish/publish.wxml`、`publish.wxss`

---

## 三、功能还原（小程序对齐 Web 端）

### 3.1 请假审批弹窗
- Web 端有完整的请假条样式弹窗（纸质请假条 + 同意/驳回双阶段），小程序只有简陋的 `wx.showActionSheet`
- **还原内容**：
  - 纸质请假条展示（原因、时段/会议、请假人、日期）
  - 同意 / 驳回 / 关闭三个按钮
  - 驳回双阶段：填写原因 → 确认驳回 / 返回
- **文件**：`miniprogram/pages/duty/duty.js`、`duty.wxml`、`duty.wxss`

### 3.2 值班表编辑
- Web 端支持在每个格子添加/删除值班人员，小程序完全缺失
- **还原内容**：
  - 每格底部"加人"按钮（虚线样式）
  - 已安排人员旁"✕"删除按钮
  - 点击加人弹出面板：下拉选干事 + 可选填部门 → 确认添加
  - 课程表样式：固定格高 120rpx、竖线分割、表头淡蓝背景
- **文件**：`miniprogram/utils/api.js`（新增 `addDuty`/`removeDuty`）、`duty.js`、`duty.wxml`、`duty.wxss`

### 3.3 一人接取多个时段
- **问题**：接了第 1 段后其他时段就看不到接取按钮
- **修复**：`hasClaimed` 布尔值改为 `myClaimedSlotIds` 数组，每个时段独立追踪"已接/已满/可接"
- **文件**：`miniprogram/pages/tasks/detail.js`、`detail.wxml`（新增 WXS `inArray` 辅助函数）

### 3.4 管理员移除接取人员
- **问题**：多时段任务移除报错"请指定 claimId"
- **修复**：传递 `claimId`（TaskClaim 记录 ID）替代 `userId`
- **文件**：`miniprogram/utils/api.js`（`removeClaim` 支持 claimId）、`detail.js`、`detail.wxml`

### 3.5 登录页 Logo 对齐
- 小程序端改为从服务器加载 `dept-logo.png`，失败时蓝底白心兜底
- **文件**：`miniprogram/pages/login/login.wxml`、`login.wxss`、`login.js`

### 3.6 登录流程优化
- 首次绑定后写入 `sxl_bound` 标记，下次自动静默登录，不再展示绑定界面
- 自动登录失败则回退到绑定界面
- **文件**：`miniprogram/pages/login/login.js`

---

## 四、微信生态集成

### 4.1 微信订阅消息通知
实现管理员发布任务/会议后自动推送到部员微信：

| 文件 | 说明 |
|------|------|
| `src/lib/wechat.ts` | 新增 `getAccessToken()` 全局缓存（7200s 自动刷新） |
| `src/lib/wechat-subscribe.ts` | **新建** — `notifyTaskPublished` / `notifyMeetingPublished` 批量发送 |
| `src/app/api/tasks/route.ts` | POST 创建任务后异步调用通知 |
| `src/app/api/meetings/route.ts` | POST 创建会议后异步调用通知 |

环境变量配置：
```
WX_TASK_TMPL_ID="ZgbaKQGSM6KlNtvv0RyRwhcFKLhhe7oBFcuvXaP_yDQ"
WX_MEETING_TMPL_ID="JgaEBpufJ3JJx-LJYXh-01PPTjVzEUL4JeIpCe-zTT4"
```

### 4.2 转发分享（替代订阅引导）
考虑到微信订阅消息为一次性权限，改为更实用的方案：
- **删除**：`login.js` 和 `app.js` 中的订阅引导代码
- **新增**：发布任务成功后弹窗"转发到群"（绿色按钮）
- **新增**：任务详情页 + 会议详情页支持 `onShareAppMessage`（右上角菜单转发）
- 点击"稍后"自动返回列表页，避免"没发布"的错觉
- **文件**：`miniprogram/pages/publish/publish.js`、`publish.wxml`、`publish.wxss`、`tasks/detail.js`、`meetings/detail.js`

---

## 五、小程序审核合规

### 5.1 组件按需注入
- 在 `app.json` 添加 `"lazyCodeLoading": "requiredComponents"` 满足审核要求
- **文件**：`miniprogram/app.json`

### 5.2 编译优化
- `project.config.json` 切换为 SWC 编译（`swc: true, disableSWC: false`），解决 Babel 编译错误
- **文件**：`miniprogram/project.config.json`

---

## 六、服务器运维

### 6.1 部署脚本
- 新建 `scripts/deploy.sh`，实现一键部署：备份 → 拉代码 → 装依赖 → 数据库迁移 → 构建 → 重启 PM2
- 项目服务器路径：`/www/wwwroot/nextjs-app`，PM2 进程名：`nextjs-app`

---

## 七、文件变更统计

| 类别 | 文件数 |
|------|--------|
| 小程序页面文件 | 18 |
| 小程序工具/配置 | 3 |
| Web 后端 API | 3 |
| Web 库文件 | 2 |
| Web 前端组件 | 2 |
| 其他 | 2 |
| **合计** | **30** |

---

## 八、待用户操作

1. 服务器执行部署：`cd /www/wwwroot/nextjs-app && git pull && bash scripts/deploy.sh`
2. 服务器环境变量确认已配置：`WX_APPID`、`WX_SECRET`、`WX_TASK_TMPL_ID`、`WX_MEETING_TMPL_ID`
3. 微信开发者工具重新编译上传小程序
4. （可选）准备 `public/dept-logo.png` 替换默认 Logo

---

*本报告由 WorkBuddy 自动生成。*
