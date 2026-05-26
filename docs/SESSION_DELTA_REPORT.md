# 邵小利考勤系统 — 开发变更报告

> **给下一个 AI 的同步文档**。涵盖本轮对话中的所有代码变更、设计决策、审查结论和待办事项。

---

## 一、本轮做了什么

### 1.1 小程序 UI 审查（三轮迭代）

对 `miniprogram/` 全部 14 个页面做了三轮 WXML/WXSS 审查，参照 `animal-island-vue` 三份官方文档（`AI_USAGE.md` + `SKILL.md` + `DESIGN_PROMPT.md`），逐步将 UI 从 3.0 → 7.5/10。

**审查报告（含完整历史）**：
```
D:\develop\cursor Pro\shao-xiaoli-attendance\docs\MINIPROGRAM_UI_REVIEW.md
```

### 1.2 GPS 例会签到功能（全新实现）

从数据库 → 后端 API → Web 前端 → 小程序，完整实现了 GPS 签到系统。

---

## 二、GPS 签到的所有变更

### 2.1 数据库

**`prisma/schema.prisma`** — Meeting 模型新增 4 个签到字段：

```prisma
model Meeting {
  // ... 原有字段 ...
  checkInPlace  String?    // 签到地点名称
  checkInLat    Float?      // 签到点纬度
  checkInLng    Float?      // 签到点经度
  checkInRadius Int?  @default(150)  // 允许半径（米）
  checkIns      MeetingCheckIn[]
}
```

**`prisma/schema.prisma`** — 新表 MeetingCheckIn：

```prisma
model MeetingCheckIn {
  id        String   @id @default(cuid())
  meetingId String
  meeting   Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  lat       Float?    // 签到 GPS 纬度
  lng       Float?    // 签到 GPS 经度
  createdAt DateTime @default(now())

  @@unique([meetingId, userId])
  @@index([meetingId, createdAt])
  @@index([userId])
}
```

**User 模型** 新增反向关系 `meetingCheckIns MeetingCheckIn[]`。

> ⚠️ **待执行**：运行 `npx prisma migrate dev --name gps-checkin && npx prisma generate`

### 2.2 后端 API

**新建 — `src/lib/geo.ts`**：
```ts
export function haversine(lat1, lng1, lat2, lng2): number  // 返回米
```

**新建 — `src/app/api/meetings/[id]/check-in/route.ts`**：
- `POST` — 干事签到：接收 `{ lat, lng }`，用 Haversine 校验是否在签到点半径内
- `GET` — 管理员查签到清单：返回 `{ checkIns, members, checkedInCount, totalMembers }`

**修改 — `src/app/api/meetings/route.ts`**：
- `CreateSchema` 扩展了 `checkInPlace`、`checkInLat`、`checkInLng`、`checkInRadius` 字段
- `create` 调用传入新字段

**重写 — `src/app/api/meetings/[id]/route.ts`**：
- GET 返回值增加了 `checkIns` 字段
- POST 从单一 `action: "end"` 扩展为 `discriminatedUnion("action", [EndSchema, UpdateCheckInSchema])`，新增 `action: "updateCheckIn"` 支持编辑签到配置

### 2.3 Web 前端

**`src/app/duty-and-meetings/page.tsx`** — 发布会议 Modal：
- 表单新增：签到地点名称（Input）、纬度/经度（两个 Input 横向排列）、允许半径（Input）
- `afterOpenChange` 初始化默认 `checkInRadius: 150`
- `onFinish` 提交时附带签到字段

**`src/app/duty-and-meetings/meetings/[id]/page.tsx`** — 会议详情页：
- 新增 `checkIns` state + `checkedInIds` useMemo
- 会议状态为 OPEN 时，每 30s 自动轮询 `GET /api/meetings/[id]` 刷新签到数据
- 新增签到统计卡片（仅当 `m.checkInPlace` 存在时显示）：已签到 N/M 人、绿色 Tag 列表、未签到列表（标注已准假）
- 签到卡片位于关会卡片**之前**

### 2.4 小程序

**`miniprogram/app.json`**：
```json
"pages": [..., "pages/meetings/checkin-list", ...],
"permission": { "scope.userLocation": { "desc": "用于例会签到时验证您是否在会议地点附近" } },
"requiredPrivateInfos": ["getLocation"]
```

**`miniprogram/utils/api.js`**：
```js
// 新增
checkInMeeting(meetingId, lat, lng)  → POST /api/meetings/:id/check-in
getCheckInList(meetingId)            → GET  /api/meetings/:id/check-in
```

**`miniprogram/pages/meetings/detail.js`** — 完全重写：
- `data` 新增 `checkIns`、`checkingIn`、`hasCheckedIn`、`isMEMBER`
- `loadDetail` 中解析 `res.checkIns`，将 userId 映射为 displayName，判断当前用户是否已签到
- 新增 `onCheckIn()`：调用 `wx.getLocation({ type: "gcj02" })`，权限拒绝时弹窗引导 `wx.openSetting()`
- 新增 `doCheckIn(lat, lng)`：调用 API，成功后 Toast 显示距离
- 新增 `onViewCheckInList()`：跳转 checkin-list 页

**`miniprogram/pages/meetings/detail.wxml`**：
- 新增「GPS 签到」卡片（仅 `meeting.checkInPlace && isMEMBER`）：签到按钮 / "已签到"绿标
- 新增「签到统计」卡片（仅 `meeting.checkInPlace && isAdminOrMinister`）：N/M 人数 + 已签到名单 + "查看清单"入口

**新建 — `miniprogram/pages/meetings/checkin-list.*`**（4 个文件）：
- `js`：双重 API 调用（getMeetingDetail + getCheckInList），权限校验，下拉刷新
- `wxml`：会议基本信息 + 已签到列表 + 未签到列表（标注已准假）
- `wxss`：基本布局样式
- `json`：`navigationBarTitleText: "签到清单"` + `enablePullDownRefresh: true`

---

## 三、小程序 UI 三轮审查的关键结论

### 3.1 三份官方参考文件

| 文件 | 本地路径 | 用途 |
|------|---------|------|
| AI_USAGE.md | `C:\Users\95345\Downloads\AI_USAGE.md` | 19 个组件的 API 手册（props、类型、默认值） |
| SKILL.md | `C:\Users\95345\Downloads\SKILL.md` | 像素级 CSS 规格（Less 变量、每组件精确 hex/px/keyframe） |
| DESIGN_PROMPT.md | `C:\Users\95345\Downloads\DESIGN_PROMPT.md` | 色板速查表、7 条设计铁律、AI 生图 prompt |

### 3.2 已对齐官方规范的部分（100% 精确）

- Button 主色/背景/阴影：`#794f27` / `#f8f8f0` / `0 5px 0 #bdaea0`
- Input 背景/边框/阴影/焦点：`rgb(247,243,223)` / `2.5px #c4b89e` / `0 3px 0 #d4c9b4` / `#ffcc00`
- Card 13 色调色板（NookPhone 配色）
- Design Token 全部色值
- 动效缓动/速度：`cubic-bezier(0.4,0,0.2,1)` / `0.25s`

### 3.3 本轮 UI 改进的结果

| 改进项 | 效果 |
|-------|------|
| 背景 CSS 纹理（帆布点阵）| `page::before` pseudo-element |
| 卡片 `box-shadow: 0 8rpx 20rpx rgba(107,92,67,0.42)` | 暖调卡片阴影 |
| 按钮 `:hover` 上浮 | `translateY(-2rpx)` |
| publish.wxss 完全重写 | 零硬编码色值 |
| Tabs 激活态官方 teal | `rgba(25,200,185,0.15)` + `color: #19c8b9` |
| `.btn-confirm-yellow` | 游戏黄色弹窗确认按钮 |
| 10 个 SVG 图标 | `miniprogram/assets/icons/` |
| 3 个全局组件 | `icon`、`divider`、`footer-sea`（`app.json` usingComponents） |
| Loading 动画 | 斜纹 + 叶片旋转 |
| CSS 变量补全 | 6 个缺失变量 |

### 3.4 剩余未完成事项

**P0 — 素材路径修正（影响运行）**：
- `components/divider/divider.wxml` 和 `components/footer-sea/footer-sea.wxml` 中图片路径多写了 `/miniprogram` 前缀，应为 `/assets/icons/...`
- `images/tab-*.png`（8 张 Tab 图标）未生成
- `assets/empty-*.png` 空状态插图引用但文件不存在

**P1 — 补完组件使用面**：
- 空状态 emoji 替换为 `<icon>` 组件
- `<footer-sea />` 推广到更多页面

**P2 — CSS 残余（3 行）**：
- FAB 阴影改为暖色 `rgba(107,92,67,0.35)`
- `filter-tag` 背景改为 `var(--color-bg-content)`
- checkbox 未选中态改为 `var(--color-text-disabled)`

### 3.5 设计铁律合规度

| # | 铁律 | 状态 |
|:--:|------|:--:|
| 1 | 大地棕文字 + 薄荷青绿主色 + 奶油米白背景，禁止纯黑/冷灰 | ✅ |
| 2 | 最小 12px 圆角，按钮/输入框 50px pill | ✅ |
| 3 | 可点击元素底部厚阴影 + hover 上浮 + active 下压 | ✅ |
| 4 | Nunito 圆体，按钮/标题 weight 600+ | ❌ 平台限制 |
| 5 | 过渡 0.15~0.35s，cubic-bezier(0.4,0,0.2,1) | ✅ |
| 6 | 输入框焦点黄 #ffcc00，按钮焦点青绿 #19c8b9 | ✅ |
| 7 | 禁止直角矩形、纯黑 #000、冷蓝、扁平无阴影 | ✅ |

---

## 四、完整文件变更索引

### 新建文件（7 个）

| 文件 | 说明 |
|------|------|
| `src/lib/geo.ts` | Haversine 距离计算 |
| `src/app/api/meetings/[id]/check-in/route.ts` | 签到 API（POST + GET） |
| `miniprogram/pages/meetings/checkin-list.js` | 管理员签到清单页逻辑 |
| `miniprogram/pages/meetings/checkin-list.wxml` | 签到清单页模板 |
| `miniprogram/pages/meetings/checkin-list.wxss` | 签到清单页样式 |
| `miniprogram/pages/meetings/checkin-list.json` | 签到清单页配置 |
| `docs/MINIPROGRAM_UI_REVIEW.md` | 四轮审查完整报告 |
| `docs/MINIPROGRAM_CODE_REVIEW.md` | 初始代码审查报告 |

### 修改文件（11 个）

| 文件 | 变更摘要 |
|------|---------|
| `prisma/schema.prisma` | Meeting +4 字段，新建 MeetingCheckIn 表，User 加反向关系 |
| `src/app/api/meetings/route.ts` | CreateSchema 加签到字段，create 传入 |
| `src/app/api/meetings/[id]/route.ts` | 重写 POST（discriminatedUnion）；GET 返回 checkIns |
| `src/app/duty-and-meetings/page.tsx` | 发布会议 Modal 加签到表单 |
| `src/app/duty-and-meetings/meetings/[id]/page.tsx` | 签到统计面板 + 30s 轮询 |
| `miniprogram/app.json` | GPS 权限 + checkin-list 页面 + usingComponents |
| `miniprogram/utils/api.js` | 加 checkInMeeting + getCheckInList |
| `miniprogram/pages/meetings/detail.js` | 完全重写：GPS 签到 + checkIns 数据 + name lookup |
| `miniprogram/pages/meetings/detail.wxml` | 加签到卡片（部员）+ 签到统计卡片（管理员） |
| `miniprogram/pages/meetings/detail.wxss` | 补签到样式 |
| `miniprogram/app.wxss` | 背景纹理、Card shadow、Button hover、btn-confirm-yellow、leaf-spin、empty-img |
| `miniprogram/anisland-theme/theme.wxss` | 补 6 个 CSS 变量、`--border-radius` 别名 |
| `miniprogram/pages/publish/publish.wxss` | 完全重写为 AC 主题 |
| `miniprogram/pages/duty/duty.wxss` | Tab 激活态改官方 teal |
| `miniprogram/pages/tasks/tasks.wxss` | 搜索栏改 3D pill |
| `miniprogram/pages/leave/apply.wxss` | 删 @import，硬编码 → theme |
| `miniprogram/pages/settings/settings.wxss` | 删 @import，硬编码 → theme |
| `miniprogram/pages/login/login.wxss` | btn-ghost 背景改为 theme 变量 |
| `miniprogram/pages/meetings/detail.wxss` | 硬编码 → theme |
| `miniprogram/pages/others/profile.wxss` | 硬编码 → theme |

### 新增素材文件（15 个，位于 `miniprogram/assets/icons/`）

```
icon-camera.svg   icon-chat.svg        icon-critterpedia.svg
icon-design.svg   icon-diy.svg         icon-helicopter.svg
icon-map.svg      icon-miles.svg       icon-shopping.svg
icon-variant.svg  divider-line-brown.svg divider-line-teal.svg
divider-line-yellow.svg  wave-yellow.svg  footer-sea.svg
```

### 新增组件（3 个，位于 `miniprogram/components/`）

```
icon/icon.js + icon.wxml + icon.wxss + icon.json
divider/divider.js + divider.wxml + divider.wxss + divider.json
footer-sea/footer-sea.js + footer-sea.wxml + footer-sea.wxss + footer-sea.json
```

---

## 五、给下一个 AI 的操作清单

### 立即执行

1. **数据库迁移**：`npx prisma migrate dev --name gps-checkin && npx prisma generate`
2. **修复素材路径**：divider.wxml / footer-sea.wxml 中 `/miniprogram/assets/icons/` → `/assets/icons/`
3. **生成 Tab 图标**：8 张 81×81 PNG（暖棕/teal 双色），存到 `miniprogram/images/tab-*.png`
4. **生成空状态插图**：`miniprogram/assets/empty-*.png`（5 张）

### 低优先级

5. FAB 阴影改暖色（2 处）
6. filter-tag 背景改 `var(--color-bg-content)`
7. 空状态 emoji → `<icon>` 组件
8. `<footer-sea />` 推广到更多页面

### 参考文档速查

| 内容 | 路径 |
|------|------|
| UI 审查完整历史（4 轮） | `docs/MINIPROGRAM_UI_REVIEW.md` |
| 代码审查报告 | `docs/MINIPROGRAM_CODE_REVIEW.md` |
| 官方组件 API 手册 | `C:\Users\95345\Downloads\AI_USAGE.md` |
| 官方像素级 CSS 规格 | `C:\Users\95345\Downloads\SKILL.md` |
| 官方设计提示词+色板 | `C:\Users\95345\Downloads\DESIGN_PROMPT.md` |
| GPS 签到方案设计 | `C:\Users\95345\.workbuddy\plans\gps-checkin-plan.md` |
