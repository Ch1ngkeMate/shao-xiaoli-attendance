#!/bin/bash
# 轻量部署（跳过 build，适合内存不足的服务器）
# 前提：服务器已用 tsx/ts-node 直接运行开发模式，或 build 在本地完成上传

set -e

PROJECT_DIR="/www/wwwroot/nextjs-app"
BACKUP_DIR="/www/backup/nextjs-app-$(date +%Y%m%d-%H%M%S)"

echo "=== 1. 备份当前版本 ==="
mkdir -p "$BACKUP_DIR"
cp -r "$PROJECT_DIR"/* "$BACKUP_DIR"/ 2>/dev/null || true
echo "备份完成: $BACKUP_DIR"

echo "=== 2. 拉取最新代码 ==="
cd "$PROJECT_DIR"
git pull

echo "=== 3. 安装依赖（仅生产）==="
npm ci --only=production 2>/dev/null || npm install --production

echo "=== 4. 数据库迁移 ==="
npx prisma migrate deploy

echo "=== 5. 生成 Prisma Client ==="
npx prisma generate

echo "=== 6. 重启服务 ==="
pm2 restart nextjs-app

echo "=== 部署完成（代码已更新，需确保 .next 已构建）==="
