# 微信小程序联调指南（备案完成后）

## 1. 服务端环境变量

在服务器 `.env` 或宝塔环境变量中配置（与 `.env.example` 一致）：

- `WX_APPID` — 微信公众平台 → 开发 → 开发管理 → 开发设置
- `WX_SECRET` — 同上（勿泄露、勿提交 Git）

执行数据库迁移并部署：

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart attendance-app --update-env
```

本地自检：`npm run deploy:check`

## 2. 微信公众平台

1. **服务器域名**：`request 合法域名` 填你的 HTTPS 域名（须已备案且证书有效）
2. **AppID**：写入 `miniprogram/project.config.json` 的 `appid`
3. **开发管理**：添加开发者微信号，用真机预览

## 3. 小程序客户端

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开目录：`miniprogram/`
2. 修改 `miniprogram/utils/config.js` 中的 `API_BASE` 为你的 HTTPS 根地址
3. 首次打开走「姓名绑定」；之后可用「已绑定，直接登录」

## 4. API 说明

| 接口 | 说明 |
|------|------|
| `POST /api/miniprogram/auth/bind-login` | 首次：`code` + `realName`，返回 `{ token, user }` |
| `POST /api/miniprogram/auth/wx-login` | 已绑定：仅 `code`，返回 `{ token, user }` |
| 其它 `/api/*` | 请求头加 `Authorization: Bearer <token>` |

Web 端仍使用 Cookie；小程序使用 Bearer，后端 `readSessionCookie()` 已兼容两种方式。

## 5. 后续功能（待做）

按 Web 端能力逐步迁移小程序页面，建议优先级：

1. 任务列表 / 接取 / 提交凭证
2. 站内消息
3. 值班与会议请假
4. 个人考勤与公告
