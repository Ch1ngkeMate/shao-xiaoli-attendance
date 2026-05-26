# 小程序 UI 复审报告：animal-island-ui 动森主题实现评估

**项目**：邵小利志愿服务队干事考勤系统  
**审查日期**：2026-05-25  
**审查范围**：全部 14 个页面的 WXML/WXSS + 全局样式 + anisland-theme 主题系统  
**参照基准**：`animal-island-vue` 三份权威文档 → `AI_USAGE.md`（API）+ `SKILL.md`（像素级 CSS）+ `DESIGN_PROMPT.md`（色板速查）  
**审查结论**：配色/卡片已精准对齐官方规范；**卡片缺阴影** + **Modal 确认按钮应为黄色** + publish 页面破窗是当前最大差距，核心评分约 5/10

---

## 附录：官方设计规范辅助文件

本次审查使用的三份 animal-island-vue 官方权威文档（本地副本）：

| 文件 | 本地路径 | 用途 |
|------|---------|------|
| AI_USAGE.md | `C:\Users\95345\Downloads\AI_USAGE.md` | API 手册：每个组件的 props、类型、默认值、合法取值 |
| SKILL.md | `C:\Users\95345\Downloads\SKILL.md` | 像素级样式：设计 token、每组件精确 CSS（hex/px/keyframe） |
| DESIGN_PROMPT.md | `C:\Users\95345\Downloads\DESIGN_PROMPT.md` | 设计提示词：色板速查表、铁律清单、AI 生图 prompt |

> **给审阅 AI 的建议阅读顺序**：先读 `AI_USAGE.md` 了解组件 API 全貌 → 再读 `SKILL.md` 获取像素级 CSS 规格（尤其 §5 的 `:root` 模板和 §6 的 7 条设计铁律）→ `DESIGN_PROMPT.md` 末尾的"关键数值速查表"可作快速索引。

---

## 一、上次报告修复进度

| 原问题 | 状态 | 变更内容 |
|--------|:--:|------|
| #1 任务详情 API 数据不足 | ⚠️ | API 端未变，但 WXML 加入 WXS 客户端 `getVisLabel`/`getVisClass` 四态判断 |
| #2 会议关会功能缺失 | ✅ | `meetings/detail.js` 完整实现了关会选人 + `onToggleAbsent` + `onConfirmEnd` + 确认弹窗 |
| #5 图片 URL 补全碎片化 | ✅ | 新建 `utils/format.js`（`fixUrl`/`formatTime`/`formatDate`/`formatTimeRelative`）+ `utils/format.wxs` |
| #6 任务列表缺状态标签 | ✅ | `tasks.wxml` WXS 实现了四态 `getVisLabel`/`getVisClass`（可接取/名额已满/待处理/已结束） |
| #10 变量命名误导 | ✅ | `isAdmin` 已改为 `isAdminOrMinister` 或 `isAdmin` 赋值为 `isAdminOrMinister` |
| — 主题系统 | 新增 | `anisland-theme/theme.wxss` + `components.wxss` 完整 Design Token |
| — 考勤页 UI | 重构 | `duty.wxss` 全面重写（3D pill、leave paper 请假条纸面纹理、sheet 弹窗） |

---

## 二、动森 UI 核心特征 vs 当前实现

### 2.1 动物森友会 UI 的本质

ACNH NookPhone 界面的质感来自：

| 特征 | 说明 |
|------|------|
| **底色** | 暖米白/奶油色/浅驼色 — 模拟纸张/布料的本色 |
| **纹理** | **细密的织物/纸张肌理**（灯芯绒、亚麻、模造纸），无大面积纯色平面 |
| **文字** | 温暖棕色调（#6B4C3B ~ #4A3528），非冷调黑灰 |
| **圆角** | 大圆角（16-24px），略带有机不规则感 |
| **按钮** | 厚实 3D pill：底部 4-6px 深色"底座"阴影，按下时底座缩进 |
| **边框** | 不用纯色边框，靠 3D 阴影和底色对比区分层级 |
| **图标** | 手绘风格，线条粗细不均，手工感 |
| **字体** | 圆体/丸ゴシック，圆润可爱 |
| **间距** | 宽松透气，留白充分 |
| **点缀** | 叶片、果实、小动物、波浪线等自然元素 |

### 2.2 逐维度评分

| 维度 | 当前实现 | 动森标准 | 得分 |
|------|---------|---------|:--:|
| 背景色 | 奶油米白 `#f8f8f0` ✅ | 同 + 纹理层 | 6/10 |
| 背景纹理 | **完全缺失** — 全项目零 CSS 纹理 | 织物/纸张纹理遍布所有背景 | **1/10** |
| 主色调 | 薄荷青绿 `#19c8b9`（teal，偏冷） | 叶绿 `#6fba2c` 或暖陶土 `#d4a574` | 4/10 |
| 文字颜色 | 暖棕 `#794f27` / `#725d42` ✅ | 一致 | 8/10 |
| 3D 按钮 | `.btn-primary` `box-shadow: 0 10rpx 0 0 #bdaea0` ✅ | 一致 | 8/10 |
| 按钮圆角 | `border-radius: 100rpx` pill ✅ | 一致 | 9/10 |
| 字体 | `Nunito, 'Zen Maru Gothic'` → **小程序无法加载** | 系统圆体 | **3/10** |
| 图标 | Emoji（🍃📋📝📊） | 手绘风格自定义图标 | **2/10** |
| 卡片层级 | 无阴影，纯靠背景色区分 | 微阴影 + 底色差异 | 4/10 |
| 底部弹窗 | `border-radius: 64rpx 64rpx 0 0` ✅ | 更厚顶圆角 + 背景模糊 | 6/10 |
| 动效 | 基本 :active 反馈 | 弹性缓出、层级过渡 | 5/10 |

**总分：4.5/10**（Design Token 层）

---

## 三、"不够动森"的根因分析

### 根因 1：纹理完全缺失（最致命）

全项目没有一个 CSS 纹理。动森 UI 的核心记忆点是**"把 UI 画在布料/纸张上"**的触感：

- NookPhone 的背景是细帆布纹理
- 对话框是手工纸质感
- 卡片是亚麻布或灯芯绒

当前所有页面纯色平面 `background: var(--color-bg)`，无论颜色多接近，视觉上仍是"暖色扁平 App"而非"动森"。

**修复只需 5 行 CSS，三个可选方案**：

```css
/* 方案 A：细密点阵（模拟帆布/麻布）— 推荐全局 page */
page::before {
  content: '';
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image:
    radial-gradient(circle at 25% 25%, rgba(161, 140, 107, 0.06) 0.5px, transparent 0.5px),
    radial-gradient(circle at 75% 75%, rgba(161, 140, 107, 0.04) 0.5px, transparent 0.5px);
  background-size: 24rpx 24rpx, 20rpx 20rpx;
}

/* 方案 B：横纹纸（模拟和纸/便签纸）— 适合卡片内部 */
.card {
  background-color: var(--color-bg-content);
  background-image: repeating-linear-gradient(
    0deg, transparent, transparent 6rpx, rgba(161, 140, 107, 0.04) 6rpx, rgba(161, 140, 107, 0.04) 7rpx
  );
}

/* 方案 C：对角交叉（模拟亚麻布）— 适合大背景 */
page {
  background-color: #f8f8f0;
  background-image:
    repeating-linear-gradient(45deg, transparent, transparent 8rpx, rgba(181, 164, 125, 0.06) 8rpx, rgba(181, 164, 125, 0.06) 9rpx),
    repeating-linear-gradient(-45deg, transparent, transparent 8rpx, rgba(181, 164, 125, 0.06) 8rpx, rgba(181, 164, 125, 0.06) 9rpx);
}
```

---

### 根因 2：主色调偏离

`#19c8b9` 是 Google Material Design 的 **teal 300**，色相偏蓝偏冷。动森的主色属于**大地色系**：

| 场景 | 当前 | 建议 | 色值 |
|------|------|------|------|
| 主按钮/强调色 | 薄荷青绿 `#19c8b9` | 叶绿色 | `#6fba2c` |
| 主色悬停 | `#3dd4c6` | 亮叶绿 | `#8fd45a` |
| 主色按下 | `#11a89b` | 深叶绿 | `#5a9e1e` |
| 主色浅底 | `#e6f9f6`（白青） | 浅绿底 | `#eaf6e0` |

或改为**暖陶土色**（AC 对话框选择按钮的主色）：
- `#d4a574` → hover `#e0bc96` → active `#c08d5a`

因为 `#6fba2c` 已在 theme 中用作 `--color-success`，主色可选暖陶土避免冲突。

---

### 根因 3：部分页面完全未进入主题系统

`publish.wxss` / `settings.wxss` / `leave/apply.wxss` 三个文件大量硬编码非 AC 色值：

| 硬编码值 | 出现页面 | 问题 |
|---------|---------|------|
| `background: #fff` | publish, login, messages | 纯白，非暖米白 |
| `background: #f0f0f0` | publish | 冷灰，非暖调 |
| `background: #fafafa` | publish | 冷灰白 |
| `color: #333` | publish, meetings/detail | 纯黑，非暖棕 |
| `color: #666` | publish, meetings/detail | 深灰，非 `--color-text-secondary` |
| `color: #999` | publish | 浅灰，非 `--color-text-muted` |
| `border: 2rpx solid #e8e8e8` | leave/apply | 冷灰边框 |

---

## 四、逐页面视觉诊断

### 4.1 全局基础（`app.wxss` + `anisland-theme/`）

**做对的事**：
- Design Token 完整，CSS 变量命名规范（参考 `variables.less`）
- 3D pill 按钮主样式到位（`.btn-primary` / `.btn-danger` / `.btn-dashed` / `.btn-ghost` / `.btn-link`）
- `.tag` 系统 pill 标签语义色统一
- `.leaf-decor` 叶片装饰 + wiggle 动画
- `.footer-wave` 波浪底部分隔有创意
- `.card-app-*` NookPhone 13 色调色板已定义

**严重问题 — CSS 变量缺失**：

以下变量在 6+ 个页面 WXSS 中被引用，但**未在 `theme.wxss` 中定义**，导致回退到浏览器默认值：

| 缺失变量 | 引用文件 |
|---------|---------|
| `--color-border-secondary` | tasks.wxss, messages.wxss, detail.wxss |
| `--color-fill-alter` | tasks.wxss, detail.wxss |
| `--color-split` | tasks.wxss, detail.wxss, profile.wxss |
| `--color-bg-layout` | detail.wxss, settings.wxss |
| `--color-text-tertiary` | settings.wxss |
| `--border-radius`（应为 `--border-radius-base`） | messages.wxss, settings.wxss |

**建议补充到 `theme.wxss`**：
```css
--color-border-secondary: #d9cfb4;
--color-fill-alter: #f5efe0;
--color-split: #e8dfcc;
--color-bg-layout: #f0e8d8;
--color-text-tertiary: #b8a890;
```

---

### 4.2 登录页 `pages/login/`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| Logo `brand-logo` 为 teal 渐变纯色 | 中 | `linear-gradient(135deg, var(--color-primary), var(--color-primary-active))` — 缺纹理 |
| 背景无任何叶片/小动物装饰 | 中 | 应加 `leaf-decor` 或背景纹理 |
| 备用态 ♥️ 太简单 | 轻 | 建议用叶片 emoji 🌿 或部徽 |
| `btn-ghost` 硬编码 `background: #fff` | 轻 | 破坏主题一致性 |
| 两个按钮之间无视觉分隔 | 轻 | 与动森"透气宽松"的间距哲学不符 |

---

### 4.3 任务大厅 `pages/tasks/`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| 搜索栏为纯白 + 细边框（扁平风） | **高** | `background: #fff; border: 2rpx solid` — 应改为 `app.wxss .input` 3D pill |
| 筛选标签选中态为亮 teal | 高 | `background: var(--color-primary)` 视觉跳跃，建议用暖陶土或叶绿 |
| 任务卡片 `task-card` 无阴影 | 中 | 仅 `border` 无 `box-shadow`，层级不分明 |
| FAB 阴影偏蓝 | 中 | `box-shadow: rgba(22,119,255,0.3)` — 蓝色光晕与暖色主题冲突 |
| 顶部缺叶片装饰 | 轻 | 标题区应加 `leaf-decor` |
| 搜索栏和筛选区无视觉分组 | 轻 | 应加虚线分隔或浅色背景区分 |

---

### 4.4 任务详情 `pages/tasks/detail`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| 图片轮播 420rpx 过高 | 中 | 占屏幕 60%+，无图时不应占位 |
| 接取人标签用未定义 `--color-fill-alter` | 中 | 回退为透明/浏览器默认色 |
| 审核卡片 `border-radius: 12rpx` | 中 | 太小，应为 28-32rpx 与其他 pill 统一 |
| `.sheet-content` 为扁平色块 | 高 | 缺顶部圆角 3D 质感 |
| `.info-divider` 用实线 | 轻 | 应为虚线/波浪线更有动森味 |
| `.btn-danger-inline` 为方角 `border-radius: 8rpx` | 中 | 应为 pill |

---

### 4.5 发布任务 `pages/publish/`（动森味最淡）

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| 所有 `.form-group` 为 `background: #fff` | **严重** | 应改为 `var(--color-bg-content)` 奶油米白 + 3D 阴影 |
| 所有 `.form-label` 为 `color: #333` | **严重** | 应改为 `var(--color-text)` 暖棕 |
| 输入框 `background: var(--color-bg-secondary)` + `border-radius: 12rpx` | 高 | 应复用 `app.wxss .input` 3D pill |
| 积分选择器未应用 AC 按钮 | 高 | 当前仅用 `background/border-color` 高亮 |
| `.slot-picker-item` 为 `background: #f0f0f0` 冷灰 | 高 | 应改为暖色 + pill 圆角 |
| `.slot-add` 为 `background: #fafafa` 冷灰 | 高 | 应改为奶油色底 + 虚线边框 |
| `.share-tip-card` 为 `background: #fff` | 高 | 纯白扁平卡，应 3D + 暖色 |
| 分享按钮用微信绿 `#07c160` | 中 | 应使用动森主色 |

---

### 4.6 考勤页 `pages/duty/`（动森味最浓，5.7/10）

**亮点**：
- Tab 切换 pill 3D 阴影 + 位移动画（`transform: translateY(-2rpx)`）
- 值班表网格卡片阴影 + 虚线分隔（`border-top-style: dashed`）
- 请假条 `.leave-paper` 纸张纹理 + 双层边框 + 手写感排版 — **全项目最佳设计元素**
- 审批按钮 3D pill 规范
- Focus 黄色高亮符合动森

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| 值班表 tag 字号 18rpx 过小 | 高 | 几乎不可读，建议 ≥ 22rpx |
| 表头 `var(--color-primary-bg)` teal 浅底 | 中 | 改为 `#eaf6e0` 叶绿浅底更协调 |
| 值班删除按钮高饱和红 + 3D 阴影 | 中 | 动森倾向暖橙/陶土色示警 |
| `@keyframes` 与 components.wxss 重复 | 轻 | 应删除页面级重复，统一引用 |
| 会议/统计卡片无阴影 | 轻 | 仅 `.card` 基础样式，缺视觉层次 |
| 请假审批弹窗仅 ADMIN 可见 | 中 | 应为 ADMIN + MINISTER（代码中 `isAdmin` = `isAdminOrMinister`，变量名误导但行为正确） |

---

### 4.7 消息页 `pages/messages/`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| `var(--border-radius)` 应为 `var(--border-radius-base)` | 中 | 拼写错误，圆角回退 |
| `--color-border-secondary` 未定义 | 中 | 边框色回退 |
| FAB 阴影偏蓝 | 中 | 同任务页 |
| 公告发布用 `wx.showModal` 两次弹窗 | 高 | 体验差，应跳转独立发布页 |
| 未读态仅红点 + `background: rgba(0,0,0,0.02)` | 中 | 太微弱，应使用浅色填充整卡 |

---

### 4.8 个人中心 `pages/profile/`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| 封面空底色 `cover-bg-empty` 为 teal 渐变 | **高** | `linear-gradient(135deg, var(--color-primary)...)` — teal 与暖色系冲突 |
| 封面文字白色 + 硬 text-shadow | 中 | AC 倾向深色文字在浅色卡片上 |
| `--color-split` 未定义 | 中 | 菜单分割线回退 |
| 积分 `stat-num` 未用暖棕 | 轻 | |

---

### 4.9 设置页 `pages/settings/`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| `@import "../publish/publish.wxss"` 引入非 AC 样式 | 高 | 大量 `#fff`/`#333`/`#f0f0f0` 污染 |
| `--border-radius` 应为 `--border-radius-base` | 中 | |
| `--color-bg-layout` / `--color-text-tertiary` 未定义 | 中 | |
| 背景预览区纯灰 placeholder | 轻 | |

---

### 4.10 会议详情 `pages/meetings/`

| 问题 | 严重度 | 说明 |
|------|:--:|------|
| `color: #222` / `color: #666` 硬编码 | 中 | 应改为 theme 暖棕变量 |
| checkbox 未选中色 `color: #ccc` | 中 | 应改为暖灰或浅棕 |
| 关会检查列表无 3D 层次 | 轻 | 整体扁平 |

---

### 4.11 其他页面

| 页面 | 主要问题 |
|------|---------|
| `leave/apply` | 继承 `publish.wxss` 非 AC 样式；类别选项 `border: #e8e8e8` 冷灰 |
| `announcements/detail` | 正确使用 `var(--color-text)` ✅；图片轮播偏高 |
| `notifications/detail` | 基本无页面级样式，内容裸奔 |
| `others/profile` | 基本无页面级样式，与 profile 差距大 |
| `reports` | 日期 picker 色 `#1677ff`（旧 Ant Design 蓝），未迁移到 theme |

---

## 五、各页面动森味评分

| 页面 | 配色 | 纹理 | 按钮 | 装饰 | 层级 | 总分 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|
| 登录 | 4 | 1 | 6 | 2 | 3 | **3.2** |
| 任务大厅 | 5 | 1 | 4 | 3 | 4 | **3.4** |
| 任务详情 | 4 | 1 | 6 | 2 | 4 | **3.4** |
| **发布任务** | **2** | **1** | **3** | **1** | **2** | **1.8** |
| **考勤** | **7** | **2** | **8** | **6** | **7** | **6.0** |
| 消息 | 5 | 1 | 4 | 2 | 4 | **3.2** |
| 个人中心 | 5 | 1 | 4 | 2 | 4 | **3.2** |
| 设置 | 3 | 1 | 4 | 1 | 2 | **2.2** |
| 会议详情 | 4 | 1 | 5 | 2 | 3 | **3.0** |
| 请假申请 | 3 | 1 | 3 | 1 | 2 | **2.0** |

**加权平均：3.0 / 10（对照官方规范修正后约 4.5/10，见 §7-8）**

---

## 六、优先修复路线（基于官方 AI_USAGE.md 校准后）

### 第一优先级（与官方规范对齐）

| # | 任务 | 工作量 | 对应规范 |
|:--:|------|:--:|------|
| 1 | **为 `page` 添加 CSS 背景纹理** | 5 行 CSS | 官方组件自带纹理 → 小程序需手动弥补 |
| 2 | **重写 `publish.wxss`** — 硬编码色替换为 theme 变量；输入框改用 3D pill | 中 | AI_USAGE.md 规则 #20 |
| 3 | **补充缺失 CSS 变量**（`--color-border-secondary`、`--color-fill-alter`、`--color-split`） | 小 | 规则 #18 |
| 4 | **补充 Divider 体系**：至少加 `wave-yellow` 和 `line-teal` | 小 | §1.11 |
| 5 | **获取 `skill/SKILL.md`**：`npm install animal-island-vue` 后从 node_modules 提取 | 极小 | — |

### 第二优先级（增强氛围）

| # | 任务 | 工作量 | 对应规范 |
|:--:|------|:--:|------|
| 6 | 搜索栏改为 `app.wxss .input` 3D pill | 小 | §1.2 Input `shadow` |
| 7 | 全局 `.card` 增加柔和 `box-shadow`（层级阴影） | 小 | — |
| 8 | 登录页添加 `leaf-decor` + `leaf-bg` 背景装饰 | 小 | — |
| 9 | 补充 Footer tree 剪影样式 | 小 | §1.10 |
| 10 | 值班表 tag 字号 18 → 22rpx | 极小 | — |
| 11 | Tabs 添加 leaf wiggle 动画（模拟官方 `leafAnimation`） | 小 | §1.13 |

### 第三优先级（打磨完善）

| # | 任务 | 对应规范 |
|:--:|------|------|
| 12 | custom-tab-bar 替代默认 tabBar | — |
| 13 | 公告发布改为独立页面（对齐 Web `AnnouncementEditor`） | — |
| 14 | 10 种 Icon SVG → 小程序可用 `background-image` 实现 | §1.14 |
| 15 | 各页统一引用 `utils/format.wxs` 替代内联 WXS | — |
| 16 | settings 不再 `@import publish.wxss`，独立定义 | — |

---

## 七、对照官方 AI_USAGE.md 的校准分析

基于 `animal-island-vue` AI_USAGE.md（v0.1.0）的权威规范，对上文结论做以下修正和补充：

### 7.1 对上文结论的修正

**修正 1：主色 `#19c8b9` 不是错误，是官方规范**

AI_USAGE.md §1.16 Checkbox 明确写道：`Checked box fills with #19c8b9`。这说明 teal 就是官方设计系统的强调色。之前的"改为叶绿/暖陶土"建议**撤回**——当前主色已经与官方对齐。

**修正 2：卡片色板 100% 对齐官方**

AI_USAGE.md §1.5 Card 定义的 13 个 `CardColor`：
```
default, app-pink, purple, app-blue, app-yellow, app-orange,
app-teal, app-green, app-red, lime-green, yellow-green, brown, warm-peach-pink
```

小程序 `app.wxss` 和 `theme.wxss` 中的 `.card-app-*` / `.anisland-card-color-*` 色值（`#f8a6b2`, `#b77dee`, `#889df0`, `#f7cd67`, `#e59266`, `#82d5bb`, `#8ac68a`, `#fc736d`, `#d1da49`, `#ecdf52`, `#9a835a`, `#e18c6f`）**与官方规范完全一致**。这是做得很准确的部分。

**修正 3：卡片默认色 `rgb(247,243,223)` + 文字 `#725d42` 对齐官方**

AI_USAGE.md 中 Card default = `rgb(247,243,223)` / `#725d42` text。小程序的 `--color-bg-content: rgb(247, 243, 223)` 和 `--color-text-body: #725d42` **精确匹配**。

**修正 4：3D 阴影"不可覆盖"**

AI_USAGE.md 第 20 条硬性规则：
> Never override the 3D bottom shadow on Button/Input/Switch — it is the core identity.

当前小程序的 `.btn-primary` 保留了完整的 3D shadow ✅。但 publish.wxss 中的输入框**破坏了这条规则**——用的是 `border-radius: 12rpx` 扁平样式而非 3D pill。这是违反官方规范的。

**修正 5：圆角系统不可归零**

AI_USAGE.md 第 19 条硬性规则：
> Never use `style="border-radius: 0"` or force sharp corners on any interactive element — it breaks the design language.

当前 publish.wxss 中 `.form-input-sm: border-radius: 8rpx`、`.slot-picker-item: border-radius: 8rpx` 偏小但不违规。settings.wxss 中的 `.bg-preview` 变量引用错误（`--border-radius` 不存在）导致回退是实际风险。

### 7.2 官方设计 token 命名规范对照

AI_USAGE.md §3 第 18 条：
> Design tokens (colors, radii, shadows) are exposed as CSS custom properties (`--color-animal-*`, `--spacing-animal-*`, `--radius-animal-*`, `--shadow-animal-*`).

| 官方前缀 | 小程序当前 | 对齐状态 |
|---------|-----------|:--:|
| `--color-animal-*` | `--color-*` | ⚠️ 前缀不同，但功能等价 |
| `--spacing-animal-*` | `--spacing-*` | ⚠️ 同上 |
| `--radius-animal-*` | `--border-radius-*` | ⚠️ 命名不同 |
| `--shadow-animal-*` | `--color-shadow-*` | ⚠️ 语义不同（官方可能是完整 shadow 值） |

虽然不是 Vue 项目不需要照搬命名，但官方 token 体系中还包括了 `--shadow-animal-*` 作为**完整 box-shadow 值**（而非只存颜色），这一点小程序可以借鉴——当前小程序的阴影颜色 + 阴影值的分离方式在不同组件间不够统一。

### 7.3 官方组件体系中缺失的部分

AI_USAGE.md 列出了 **19 个组件**，以下是小程序覆盖情况：

| 组件 | 小程序等效 | 覆盖 |
|------|----------|:--:|
| Button | `.btn-primary` / `.btn-danger` / `.btn-dashed` / `.btn-ghost` / `.btn-link` | ✅ 完整 |
| Input | `.input` 3D pill | ✅ 有，但 publish 页未使用 |
| Switch | 无 | ❌ |
| Modal | Sheet 弹窗 | ⚠️ 缺 typewriter 动画、缺 SVG blob clip-path |
| Card | `.card` + `.card-app-*` 13 色 | ✅ 完整 |
| Collapse | 无 | ❌ |
| Cursor | 无（移动端不需要） | — |
| Time | 无 | ❌ |
| Phone | 无（装饰性组件） | ❌ |
| Footer | `.footer-wave`（波浪）+ 缺 tree 剪影 | ⚠️ 部分 |
| Divider | `.divider-line`（实线）缺 wave-yellow 等 5 种 | ⚠️ 仅 1 种 |
| Typewriter | 无（Modal 内建依赖） | ❌ |
| Tabs | `.tab-bar` / `.tab-item` | ⚠️ 缺 `leafAnimation` |
| Icon | emoji 替代（非 10 种 SVG 图标） | ❌ 严重缺失 |
| Select | 原生 picker | ⚠️ |
| Checkbox | `☑`/`☐` 文本模拟 | ⚠️ 关会页使用 |
| CodeBlock | 无（不需要） | — |
| Loading | "加载中..." 文字 | ❌ 无动画 |
| Table | 无 | ❌ |

### 7.4 官方 Divider 体系（小程序严重缺失）

AI_USAGE.md §1.11：
```
type DividerType = 'line-brown' | 'line-teal' | 'line-white' | 'line-yellow' | 'wave-yellow';
```

小程序只有 `.divider-line`（`background: var(--color-text-disabled)`）一种样式。缺失了最具动森特色的 `wave-yellow`（波浪黄）分隔线。建议补充：

```css
.divider-wave-yellow {
  height: 24rpx;
  background: repeating-linear-gradient(
    90deg, transparent, transparent 16rpx, #f7cd67 16rpx, #f7cd67 24rpx
  );
  border-radius: 12rpx;
  opacity: 0.5;
}
```

### 7.5 官方 Footer 体系

AI_USAGE.md §1.10：
- `tree` — 森林剪影，60px 高（默认）
- `sea` — 海浪，80px 高

小程序 `.footer-wave` 实现的是波浪+`〰`字符，只有一种。可补充 tree 剪影 footer（CSS 伪元素 + gradient 模拟树冠轮廓）。

### 7.6 还需获取的关键文件

AI_USAGE.md §4 指出 npm 包内还包含以下未公开在 GitHub 的文件：

| 文件 | 重要性 | 说明 |
|------|:--:|------|
| `skill/SKILL.md` | **极高** | 每个组件的像素级 CSS 规格（Less 变量 + BEM + 关键帧） |
| `DESIGN_PROMPT.md` | 高 | v0 / Figma AI / MJ / DALL-E 生图提示词 |

这两个文件未包含在 AI_USAGE.md 中，但 `SKILL.md` 是**实现像素级还原**的必需品。建议通过 `npm install animal-island-vue` 后从 `node_modules/animal-island-vue/skill/SKILL.md` 获取，或直接从 GitHub 仓库读取。

---

## 八、SKILL.md 像素级对照（官方 CSS 规格 vs 小程序实现）

SKILL.md 是官方 Less 变量 + 每个组件的精确 CSS（hex/px/keyframe）。以下是关键差距：

### 8.1 7 条设计铁律合规检查

| # | 铁律 | 小程序 | 合规 |
|:--:|------|------|:--:|
| 1 | 大地棕色文字 + 薄荷青绿主色 + 奶油米白背景，禁止纯黑/冷灰 | 全局对齐 ✅，publish 违规 ❌ | ⚠️ |
| 2 | 最小 12px 圆角；按钮/输入框 50px pill | 全局对齐 ✅，publish 输入框 12rpx ❌ | ⚠️ |
| 3 | 可点击元素底部厚阴影 + hover 上浮 + active 下压 | `.btn-primary` ✅，卡片**无阴影** ❌ | ⚠️ |
| 4 | Nunito 圆体，按钮/标题 weight 600+，不用细体 | 小程序**无法加载** Google Fonts ❌ | ❌ |
| 5 | 过渡 0.15~0.35s，cubic-bezier(0.4,0,0.2,1) | `--motion-*` 变量已定义 ✅ | ✅ |
| 6 | 输入框焦点黄色 #ffcc00，按钮焦点青绿 #19c8b9 | `.input:focus` 有黄色 ✅，按钮有 outline ✅ | ✅ |
| 7 | 禁止直角矩形、纯黑 #000、冷蓝、扁平无阴影 | publish 页面违规 ❌ | ⚠️ |

### 8.2 逐组件精确 CSS 对照

**Button**（SKILL.md §2）：

| 属性 | 官方 middle 值 | 小程序 `.btn-primary` | 匹配 |
|------|--------------|---------------------|:--:|
| height | 45px | 90rpx (≈45px) | ✅ |
| padding | 0 20px | 0 40rpx (≈20px) | ✅ |
| font-size | 14px | 28rpx (≈14px) | ✅ |
| border-radius | 50px | 100rpx (≈50px) | ✅ |
| color | **#794f27** | **#794f27** | ✅ |
| background | #f8f8f0 | #f8f8f0 | ✅ |
| box-shadow (default) | 0 5px 0 0 #bdaea0 | 0 10rpx 0 0 #bdaea0 (≈5px) | ✅ |
| box-shadow (active) | 0 1px 0 0 #bdaea0 | 0 2rpx 0 0 #bdaea0 | ✅ |
| hover transform | translateY(-1px) | 无（缺 hover 态） | ❌ |
| loading 斜纹 | repeating-linear-gradient -45deg | **未实现** | ❌ |

**Input**（SKILL.md §2）：

| 属性 | 官方 middle 值 | 小程序 `.input` | 匹配 |
|------|--------------|----------------|:--:|
| height | 40px | 80rpx (≈40px) | ✅ |
| font-size | 14px | 28rpx (≈14px) | ✅ |
| border-radius | 50px | 100rpx (≈50px) | ✅ |
| border | 2.5px solid #c4b89e | 5rpx solid var(--color-border-light) | ✅ |
| background | rgb(247, 243, 223) | rgb(247, 243, 223) | ✅ |
| color | #725d42 | #725d42 | ✅ |
| placeholder color | **#c4b89e** | var(--color-text-disabled) = #c4b89e | ✅ |
| box-shadow | 0 3px 0 0 #d4c9b4 | 0 6rpx 0 0 var(--color-shadow-input) | ✅ |
| focus border | **#ffcc00** | var(--color-focus-yellow) = #ffcc00 | ✅ |
| focus shadow | 0 3px 0 0 #e0b800, 0 0 0 3px rgba(255,204,0,0.15) | 0 6rpx 0 0 #e0b800, 0 0 0 6rpx rgba(255,204,0,0.15) | ✅ |
| prefix/suffix color | #a0936e | **未定义** | ❌ |
| error shadow | 0 3px 0 0 #c94444 | **未定义** | ❌ |

**Card**（SKILL.md §2）：

| 属性 | 官方 | 小程序 `.card` | 匹配 |
|------|------|---------------|:--:|
| border-radius | 20px | 40rpx (≈20px) | ✅ |
| background | rgb(247, 243, 223) | var(--color-bg-content) | ✅ |
| padding | 16px 24px | 32rpx 48rpx | ✅ |
| color | #725d42 | #725d42 | ✅ |
| font-weight | 500 | 500 | ✅ |
| **box-shadow** | **0 4px 10px rgba(107, 92, 67, 0.42)** | **无** | **❌ 严重** |
| hover | translateY(-4px) | translateY(-4rpx) | ✅ |

**Title Card**（官方有机形状）：
```css
/* 官方 */
border-radius: 40px 35px 45px 38px / 38px 45px 35px 40px;
background: #fdfdf5;
padding: 12px 32px;
font-weight: 600;
```
小程序 `.anisland-card-title` 用了 `border-radius: 80rpx 70rpx 90rpx 76rpx / 76rpx 90rpx 70rpx 80rpx`（rpx 翻倍），方向对但**实际值比官方大了一倍**（应为 40px 系列）。背景 `#fdfdf5` ✅。

**Tabs**（SKILL.md §2）：

| 属性 | 官方 | 小程序 `.tab-item.active` | 匹配 |
|------|------|--------------------------|:--:|
| 标签列表背景 | rgba(255,255,255,0.6) | 未实现 | ❌ |
| 激活背景 | rgba(25,200,185,0.15) | var(--color-bg-content) | ❌ |
| 激活颜色 | #19c8b9 | var(--color-text) | ❌ |
| 激活 font-weight | 600 | 600 | ✅ |
| 激活 shadow | 0 3px 0 0 #d4c9b4 | 0 6rpx 0 0 var(--color-shadow-input) | ✅ |
| 叶子动画 | leafWiggle 2s, ±10deg | leaf-wiggle 3s, ±8deg | ⚠️ |
| 内容区动画 | fadeIn 0.25s ease | anisland-fadeup 0.3s ease | ⚠️ |

**Modal 确认按钮**（SKILL.md §2）：

```
THIS IS A MAJOR FINDING:
官方 Modal footer 主按钮 = background: rgba(255, 204, 0, 1)  // 游戏黄色！
```

小程序所有弹窗的确认按钮用的都是 teal 系（`.btn-primary`），但官方 Modal 确认按钮使用的是 **游戏黄色 `#ffcc00`**，这是动森的经典交互色。只有在 Modal footer 中如此，普通页面按钮仍用 teal。

### 8.3 官方 `:root` 变量模板 vs 小程序对照

SKILL.md §5 提供了完整的 `:root` 自实现模板。关键差异：

| 官方变量名 | 官方值 | 小程序当前 |
|-----------|--------|-----------|
| `--animal-primary` | #19c8b9 | `--color-primary` ✅ 同值 |
| `--animal-text-body` | #725d42 | `--color-text-body` ✅ 同值 |
| `--animal-bg-content` | rgb(247, 243, 223) | `--color-bg-content` ✅ 同值 |
| `--animal-shadow-btn` | #bdaea0 | `--color-shadow-btn` ✅ 同值 |
| `--animal-shadow-input` | #d4c9b4 | `--color-shadow-input` ✅ 同值 |
| `--animal-radius-pill` | 50px | `--border-radius-pill: 50px` ✅ |
| `--animal-ease` | cubic-bezier(0.4,0,0.2,1) | `--motion-ease` ✅ 同值 |
| `--animal-focus-yellow` | #ffcc00 | `--color-focus-yellow` ✅ 同值 |

**建议**：将小程序 `theme.wxss` 变量名改为官方 `--animal-*` 前缀，方便后续对照维护。

### 8.4 Divider/Footer：官方是图片素材

SKILL.md 确认 Divider 和 Footer 是 **SVG/PNG/WEBP 图像**，不是纯 CSS：

- Divider 5 种：`url('./img/divider-line-brown.svg')` 等
- Footer sea：SVG `viewBox="0 0 1440 186"`，多色插画
- Footer tree：webp 森林剪影 `height: 60px`

小程序无法使用这些素材（npm 包内图片在小程序中不可引用），需要**提取 SVG 内联到 WXML** 或**用 CSS 近似模拟**。

### 8.5 官方 Loading 动画

SKILL.md 定义的 Button loading 斜纹动画：
```css
background: #0ec4b6;
background-image: repeating-linear-gradient(
  -45deg, #0ec4b6, #0ec4b6 10px, #01b0a7 10px, #01b0a7 20px
);
background-size: 28.28px 28.28px;
animation: animal-btn-loading 1s linear infinite;
```

小程序**未实现**任何 loading 动画（仅用文字"加载中..."）。

---

## 九、对照官方规范的修正后评分

| 维度 | 原评分 | 修正后 | 修正理由 |
|------|:--:|:--:|------|
| 背景色 | 6 | **8** | `rgb(247,243,223)` / `#f8f8f0` 与官方精确匹配 |
| 背景纹理 | 1 | 1 | 仍完全缺失，官方组件自带纹理但小程序无法直接使用 |
| 主色调 | 4 | **8** | `#19c8b9` 是官方规范色，上轮结论有误 |
| 文字颜色 | 8 | 8 | `#794f27` / `#725d42` 与官方对齐 |
| 3D 按钮 | 8 | 8 | 阴影体系正确，publish 页违规需修正 |
| 卡片色板 | 不适用 | **10** | 13 色完全一致，最精准的对齐项 |
| 图标 | 2 | 2 | 官方有 10 种 SVG icon，小程序用 emoji |
| Divider 体系 | 不适用 | **2** | 官方 5 种，小程序仅 1 种 |
| Footer 体系 | 不适用 | **4** | 官方 2 种，小程序有 1 种波浪 |
| Tabs | 不适用 | **5** | 缺 leafAnimation |
| Modal | 不适用 | **4** | 缺 typewriter + blob clip-path |
| 全局 Token 命名 | 不适用 | **5** | 功能等价但命名体系不同 |

**修正后加权平均：约 4.5/10**（较原结论 3.0 上调，因配色/卡片已基本对齐官方标准）

---

## 十、总结（完整版——含 SKILL.md + DESIGN_PROMPT.md 对照）

### 已精准对齐官方规范的部分

| 组件/属性 | 官方值 | 小程序值 | 精确度 |
|----------|--------|---------|:--:|
| Button 主色/背景/阴影 | #794f27 / #f8f8f0 / 0 5px 0 #bdaea0 | 完全一致 | 100% |
| Input 背景/边框/阴影/焦点 | rgb(247,243,223) / 2.5px #c4b89e / 0 3px 0 #d4c9b4 / #ffcc00 | 完全一致 | 100% |
| Card 13 色调色板 | 13 种 NookPhone 配色 | 完全一致 | 100% |
| Design Token 色值 | 主色/文字/背景/状态色 | 完全一致 | 100% |
| 动效缓动/速度 | cubic-bezier(0.4,0,0.2,1) / 0.25s | 完全一致 | 100% |

### 三份文档确认的关键差距

| # | 差距 | 官方规范 | 严重度 |
|:--:|------|---------|:--:|
| 1 | **`.card` 无 box-shadow** | `0 4px 10px rgba(107,92,67,0.42)` | **严重** |
| 2 | **Modal 确认按钮应为黄色** | `background: rgba(255,204,0,1)` | **严重** |
| 3 | **publish 页面未用 3D pill** | 输入/按钮必须 50px pill + 底部阴影 | **严重** |
| 4 | **Tab 激活态未用 teal 高亮** | `background: rgba(25,200,185,0.15); color: #19c8b9` | 中等 |
| 5 | **Loading 斜纹动画未实现** | 45° 条纹 + 1s linear 循环 | 中等 |
| 6 | **Title Card 有机圆角偏大** | 40px 系列 → 小程序 80rpx 翻倍 | 中等 |
| 7 | **Button 缺 hover 上浮** | `translateY(-1px)` hover 态 | 轻微 |
| 8 | **字体不可加载** | Nunito Google Fonts → 小程序不支持 | 平台限制 |
| 9 | **Divider/Footer 缺图片素材** | SVG/PNG/WEBP 资源文件 | 平台限制 |
| 10 | **CSS 变量命名不一致** | 官方 `--animal-*` vs 小程序 `--color-*` | 轻微 |

### 7 条设计铁律合规总结

- ✅ 铁律 #5（动效）：完全合规
- ✅ 铁律 #6（焦点色）：完全合规
- ⚠️ 铁律 #1（颜色）：全局合规，publish 违规
- ⚠️ 铁律 #2（圆角）：全局合规，publish 违规
- ⚠️ 铁律 #3（3D 阴影）：按钮合规，**卡片缺失**，publish 违规
- ❌ 铁律 #4（字体）：小程序平台限制，无法加载 Google Fonts
- ⚠️ 铁律 #7（禁止扁平）：publish 页面多处违规

### 最高 ROI 修复（5 项，投入极小/收益极大）

1. **`.card` 加 `box-shadow: 0 4px 10px rgba(107, 92, 67, 0.42)`** — 全局 1 行 CSS
2. **按钮加 `hover` 态** `transform: translateY(-1px)` — 全局 3 行 CSS
3. **重写 `publish.wxss`** — 输入框改 3D pill + 色值替换为 theme 变量
4. **Tabs 激活态改为官方 teal 高亮** — duty.wxss 5 行
5. **Sheet 弹窗确认按钮用黄色** `background: #ffcc00; color: #725d42` — 关键视觉区分

修复这 5 项后，产品质感可从 **5/10 → 7/10**。

---

## 十一、第三轮审查（2026-05-25 修改后复审）

### 11.1 变更摘要

| 文件 | 变更内容 | 质量 |
|------|---------|:--:|
| `app.wxss` | + 背景纹理 `page::before`（帆布点阵）、+ `.card` box-shadow、+ Button `:hover` 上浮、+ `.btn-confirm-yellow` 类 | ✅✅✅ |
| `theme.wxss` | + 6 个缺失 CSS 变量、+ `--border-radius` 别名、字体变量改名 `--animal-font` | ✅✅ |
| `publish.wxss` | 完全重写：所有 `#fff/#333/#f0f0f0` 替为 theme 变量、输入框改 3D pill、所有组件加阴影、分享弹窗改 AC 风格 | ✅✅✅ |
| `duty.wxss` | Tab 激活态改官方 teal 高亮（`rgba(25,200,185,0.15)` + `color: #19c8b9`） | ✅✅ |

### 11.2 上次报告 TOP 5 修复对照

| # | 建议 | 状态 |
|:--:|------|:--:|
| 1 | `.card` 加 `box-shadow` | ✅ `0 8rpx 20rpx rgba(107,92,67,0.42)` |
| 2 | 按钮加 `:hover` 上浮 | ✅ `translateY(-2rpx)` + 阴影加深 |
| 3 | 重写 `publish.wxss` | ✅ 完全重写，零硬编码 |
| 4 | Tabs 改官方 teal 高亮 | ✅ 精确匹配 SKILL.md |
| 5 | Modal 确认按钮黄色 | ⚠️ `.btn-confirm-yellow` **已定义但 0 引用** |

### 11.3 剩余问题

**（重要）btn-confirm-yellow 未使用**

`app.wxss:156-175` 完整实现了官方 Modal 确认按钮样式，但全项目 WXML 中零引用。以下 4 处弹窗确认应改用：

| 位置 | 当前 | 应改为 |
|------|------|--------|
| `meetings/detail.wxml:99` 确认结束会议 | `btn-danger` | `btn-confirm-yellow` |
| `tasks/detail.wxml:222` 提交凭证确认 | `btn-primary` | `btn-confirm-yellow` |
| `tasks/detail.wxml:237` 关单确认 | `btn-danger` | `btn-confirm-yellow` |
| `tasks/detail.wxml:254` 审核确认 | `btn-primary` | `btn-confirm-yellow` |

（危险操作如"确认驳回""确认删除"保留 `btn-danger` 正确 ✅）

**（中等）硬编码残留**

| 文件 | 残留 |
|------|------|
| `tasks.wxss:9` | 搜索栏 `background: #fff` — 应改 3D pill input |
| `tasks.wxss:72` | FAB 阴影 `rgba(22,119,255,0.3)` 蓝色光晕 — 应改暖色 |
| `messages.wxss:32` | FAB 同上 |
| `leave/apply.wxss:1-5` | `@import "../publish/publish.wxss"` + `border: #e8e8e8` + `color: #666` + `color: #333` |
| `settings.wxss:1` | `@import "../publish/publish.wxss"`（虽已无害但语义不对） |
| `meetings/detail.wxss:2` | `color: #666` — 应 `var(--color-text-secondary)` |
| `others/profile.wxss:2` | `background: #f0f0f0` — 应 `var(--color-bg-secondary)` |

**（轻微）登录页**

`login.wxss:41` `btn-ghost` 的 `background: #fff` 应改为 `var(--color-bg-content)`。

### 11.4 逐维度评分变化

| 维度 | 第一轮 | 第二轮（校准后）| 第三轮（当前） |
|------|:--:|:--:|:--:|
| 背景纹理 | 1 | 1 | **7** |
| 卡片阴影 | 4 | 4 | **9** |
| 按钮交互 | 5 | 5 | **7** |
| publish 页面 | 2 | 2 | **7** |
| Tabs | 5 | 5 | **9** |
| CSS 变量完整度 | 3 | 3 | **9** |
| 铁律 #1（颜色） | 5 | 5 | **7** |
| 铁律 #3（3D 阴影） | 5 | 5 | **7** |
| Modal 黄色按钮 | — | — | **4**（已定义未使用） |
| 全局一致性 | 4 | 5 | **7** |

**总评：第一轮 3.0 → 第二轮（校准）4.5 → 第三轮（当前）6.5/10**

### 11.5 冲刺 7.5/10 的 6 项收尾

| # | 任务 | 改动 |
|:--:|------|:--:|
| 1 | 4 处弹窗确认改用 `btn-confirm-yellow` | 改 4 行 WXML |
| 2 | 搜索栏改 3D pill input | 改 2 行 WXML + 2 行 WXSS |
| 3 | leave/apply 硬编码 + import 清理 | 6 行 CSS |
| 4 | FAB 阴影蓝→暖 | 改 2 处 WXSS |
| 5 | settings/meetings/others 硬编码改 theme 变量 | 4 行 CSS |
| 6 | login `btn-ghost` `#fff` → `var(--color-bg-content)` | 1 行 CSS |

**全部 6 项合计约 20 行，耗时 < 10 分钟。**

---

## 十二、视觉资产 TODO — 换模型后的执行计划

> **瓶颈分析**：纯文本模型已将 CSS 体系（配色/阴影/3D pill/纹理）对齐官方 SKILL.md，评分从 3.0 → 6.5/10。剩余差距全部是**具体视觉素材**（SVG 图标、插图、装饰图案），纯文本模型无法生成。本节为有生图/SVG 能力的模型编写。

### 12.1 CSS 收尾（当前模型即可，6 项 < 20 行）

| # | 文件 | 改什么 |
|:--:|------|------|
| 1 | `tasks/detail.wxml` `meetings/detail.wxml` | 4 处弹窗确认按钮 `btn-primary`/`btn-danger` → `btn-confirm-yellow` |
| 2 | `tasks/tasks.wxml` `tasks/tasks.wxss` | 搜索栏改用 `app.wxss .input` 3D pill |
| 3 | `tasks/tasks.wxss:72` `messages/messages.wxss:32` | FAB `box-shadow` 蓝 `rgba(22,119,255,0.3)` → 暖 `rgba(107,92,67,0.35)` |
| 4 | `leave/apply.wxss` | 删 `@import "../publish/publish.wxss"`；`#e8e8e8`/`#666`/`#333` → theme 变量 |
| 5 | `settings.wxss:1` | 删 `@import "../publish/publish.wxss"` |
| 6 | `meetings/detail.wxss:2` `others/profile.wxss:2` | `#666`/`#f0f0f0` → theme 变量 |

### 12.2 Button Loading 斜纹动画（纯 CSS，不需要素材）

```css
.btn-primary.loading {
  background: #0ec4b6;
  background-image: repeating-linear-gradient(
    -45deg, #0ec4b6, #0ec4b6 10px, #01b0a7 10px, #01b0a7 20px
  );
  background-size: 28.28px 28.28px;
  animation: animal-btn-loading 1s linear infinite;
}
@keyframes animal-btn-loading {
  0%   { background-position: 0 0; }
  100% { background-position: -28.28px 0; }
}
```

### 12.3 图标系统 — 10 个 SVG 图标（优先级：最高）

**当前状态**：全项目用 emoji（🍃📋📝📊💬👤📢）替代图标。  
**目标**：用官方 10 个 SVG 图标或等质量替代。

**提取路径**（先 `npm i animal-island-vue`）：
```
node_modules/animal-island-vue/src/components/Icon/img/
  icon-miles.svg       icon-camera.svg      icon-chat.svg
  icon-critterpedia.svg icon-design.svg      icon-diy.svg
  icon-helicopter.svg   icon-map.svg         icon-shopping.svg
  icon-variant.svg
```

**使用方式**（小程序）：
- 方案 A：SVG 内联到 WXML 的 `<image src="data:image/svg+xml,..." />`
- 方案 B：上传到 CDN，URL 引用
- 方案 C：注册为 `utils/icon.js` 模块

**映射表**（emoji → 官方 icon）：

| 当前 | 场景 | 替换为 |
|------|------|--------|
| 📋 | 任务空状态 | `icon-diy` 或 `icon-design` |
| 💬 | 消息空状态 | `icon-chat` |
| 📝 | 请假空状态 | `icon-design` |
| 📊 | 统计空状态 | `icon-miles` |
| 🍃 | 叶片装饰 | 保留（CSS 动画已实现） |
| 👤 | 头像占位 | `icon-camera`（或保留文字） |
| 📢 | 公告 FAB | `icon-chat` |
| + | 发布 FAB | `icon-design` 或 `icon-diy` |
| ❤️ | 登录 logo 备用 | `icon-miles` 或 `icon-helicopter` |

### 12.4 Footer 底部装饰（优先级：高）

**当前**：`.footer-wave` 是纯 CSS 渐变 + `〰` 字符。  
**目标**：官方 SVG/WEBP Footer。

| 类型 | 素材路径 | 规格 |
|------|---------|------|
| sea | `.../img/footer-sea.svg` (viewBox 0 0 1440 186) | width 100%, height 80px, center/contain |
| tree | `.../img/footer-tree.webp` | width 100%, height 60px, bottom center/cover |

**CSS 降级**（素材不可用时）：
- `sea`：`repeating-linear-gradient` 多层海浪
- `tree`：`radial-gradient` + polygon clip-path 树冠剪影

### 12.5 Divider 分割线（优先级：中）

**当前**：仅 `.divider-line` 纯色条。  
**目标**：至少 `wave-yellow` + `line-brown`。

官方 5 种均为 12px 高 SVG/PNG：`divider-line-brown/teal/white/yellow.svg` + `wave-yellow.svg`。

CSS 降级 `wave-yellow`：
```css
.divider-wave-yellow {
  height: 24rpx;
  background: repeating-linear-gradient(
    90deg, transparent, transparent 16rpx, #f7cd67 16rpx, #f7cd67 24rpx
  );
  border-radius: 12rpx; opacity: 0.5;
}
```

### 12.6 TabBar 自定义图标（优先级：中）

**规格**：81×81px PNG，透明背景，线条风格，暖棕 `#725d42`（普通）/ 主色 `#19c8b9`（选中）。

| Tab | 建议图标 | 官方参考 |
|-----|---------|---------|
| 任务 | 设计图纸/工具 | `icon-diy` / `icon-design` |
| 消息 | 对话气泡 | `icon-chat` |
| 考勤 | 里程/成就 | `icon-miles` |
| 我的 | 相机/护照 | `icon-camera` / `icon-map` |

### 12.7 空状态/加载态插图（优先级：低）

- 加载中：NookPhone 叶片旋转动画（纯 CSS 可实现）
- 空列表：手绘风格小动物剪影 + 对话框
- 错误态：NookPhone 风格重试提示

### 12.8 执行顺序

```
Phase 1（纯 CSS，< 20 行，当前模型即可）
  ├── §12.1 全部 6 项收尾
  └── §12.2 Loading 斜纹动画

Phase 2（需要 SVG/生图能力，换模型后执行）
  ├── §12.3 10 个 SVG 图标 ⭐ 最高优先级
  ├── §12.4 Footer 底部装饰
  └── §12.5 Divider 分割线

Phase 3（锦上添花）
  ├── §12.6 TabBar 自定义图标
  └── §12.7 空状态/加载态插图
```

---

## 十三、第四轮审查（2026-05-25 第三次修改后）

### 13.1 变更摘要

| 类别 | 变更 | 状态 |
|------|------|:--:|
| btn-confirm-yellow | 4 处弹窗确认全部改用 | ✅ |
| 搜索栏 3D pill | tasks.wxml `class="input"` + WXSS 更新 | ✅ |
| @import 清理 | leave/apply, settings 全部删除 | ✅ |
| 硬编码清理 | `#e8e8e8`/`#666`/`#333`/`#f0f0f0`/`#222` → theme 变量 | ✅ |
| login btn-ghost | `#fff` → `var(--color-bg-content)` | ✅ |
| Loading 动画 | `.btn-primary.loading` 斜纹 + `.leaf-spin` 叶片旋转 | ✅ |
| **SVG 素材** | 10 个 icon + 4 个 divider + footer-sea.svg **已到位** | ✅ |
| **组件封装** | `icon`、`divider`、`footer-sea` 三个全局组件 + app.json 注册 | ✅ |
| TabBar 配色 | 同步为 AC 暖色 `#9f927d` / `#19c8b9` / `#f8f8f0` | ✅ |
| 组件使用 | icon 在 3 个页面、divider 在 4 个页面、footer-sea 在 1 个页面 | ⚠️ |
| 空状态插图 | 引用 `/assets/empty-*.png` 但**文件不存在** | ❌ |
| Tab 图标 | `images/tab-*.png` **仍未生成** | ❌ |
| FAB 阴影 | `rgba(22,119,255,0.3)` 蓝色光晕**未改** | ❌ |
| filter-tag | `background: #fff` **未改** | ❌ |

### 13.2 素材到位但绑定不完整

SVG 素材全部已就位（`miniprogram/assets/icons/`），但代码中引用有三类问题：

| 问题 | 影响 |
|------|------|
| divider/footer-sea 组件路径写 `/miniprogram/assets/icons/` | **路径错误**，小程序 root 是 `miniprogram/`，正确路径应为 `/assets/icons/` |
| `empty-*.png` 空状态插图引用但文件不存在 | 空状态 `<image>` 裂图 |
| `tab-*.png` TabBar 图标文件不存在 | Tab 图标空白 |

### 13.3 逐维度评分

| 维度 | 上轮 | 本轮 | 变化 |
|------|:--:|:--:|:--:|
| CSS 收尾（6 项）| 待做 | **9** | 全部完成 |
| btn-confirm-yellow | 4 | **9** | 4 处全部换上 |
| Loading 动画 | 2 | **7** | 斜纹 + 叶片旋转 |
| SVG 素材 | 0 | **8** | 10 icon + divider + footer |
| 组件封装 | 0 | **7** | icon/divider/footer 三组件 |
| 素材→代码绑定 | 0 | **4** | 部分使用，部分路径错误 |
| Tab 图标 | 0 | **2** | Tab color 已改，icon 未生成 |
| FAB 阴影残留 | 待做 | **0** | 未动 |

**总评：6.5 → 7.5/10**

### 13.4 冲刺 8.5/10 的剩余工作

**P0 — 修复素材路径（3 项，会影响运行）**

| # | 文件 | 问题 | 正确值 |
|:--:|------|------|--------|
| 1 | `divider/divider.wxml` `footer-sea/footer-sea.wxml` | `src="/miniprogram/assets/icons/..."`  | `src="/assets/icons/..."` |
| 2 | `images/tab-*.png` × 8 | 文件不存在 | 用 SVG icon 导出为 81×81 PNG |
| 3 | `assets/empty-*.png` × 5 | 引用但文件不存在 | AI 生图或 CSS 降级 |

**P1 — 补完组件使用面（让图标覆盖所有页面）**

| # | 场景 | 当前 | 改为 |
|:--:|------|------|------|
| 4 | 任务空状态 | emoji 📋 | `<icon name="design" size="80" />` 或保留空状态插图 |
| 5 | 消息空状态 | emoji 💬 | `<icon name="chat" size="80" />` |
| 6 | 请假空状态 | emoji 📝 | `<icon name="design" size="80" />` |
| 7 | 统计空状态 | emoji 📊 | `<icon name="miles" size="80" />` |
| 8 | 首页/各页底部 | 无 | 添加 `<footer-sea />` |

**P2 — CSS 残余（3 行）**

| # | 文件 | 内容 |
|:--:|------|------|
| 9 | `tasks.wxss:75` `messages.wxss:32` | FAB 阴影改 `rgba(107,92,67,0.35)` |
| 10 | `tasks.wxss:26` | filter-tag `background: #fff` → `var(--color-bg-content)` |
| 11 | `meetings/detail.wxss:18` | checkbox `color: #ccc` → `var(--color-text-disabled)` |

**全部 11 项，P0 修复 3 项路径问题即可上线，P1+P2 锦上添花。**
