# 小程序项目代码变更报告

**日期：** 2026-05-06  
**项目：** 邵小利志愿服务队 · 干事考勤系统（shao-xiaoli-attendance）

---

## 变更概要

共 1 处修改，涉及 1 个文件。

---

## 变更详情

### 1. 全局添加 Ant Design 中文语言包

**文件：** `src/components/ClientProviders.tsx`

**问题：**
`ConfigProvider` 只配置了主题（`theme`），没有配置 `locale`。导致 Ant Design 组件内置文案默认为英文，例如：
- 表格分页："Items per page" → 应为"条/页"
- 弹窗按钮："OK" / "Cancel" → 应为"确定" / "取消"
- 空状态提示等其他组件文案

**修改内容：**
- 新增导入：`import zhCN from "antd/locale/zh_CN"`
- `ConfigProvider` 增加 `locale={zhCN}` 属性

**影响范围：** 全局生效。`ClientProviders` 包裹了根布局（`layout.tsx`），所有页面的 Ant Design 组件现在都显示中文。

---

## 相关小程序接口（参考）

项目中存在小程序相关 API 路由，本次未作修改：

| 路由 | 状态 |
|------|------|
| `src/app/api/miniprogram/auth/bind-login/route.ts` | 未变更 |
