#!/bin/bash
# 轻量部署（跳过 build，适合内存不足的服务器）
# 前提：服务器已用 tsx/ts-node 直接运行开发模式，或 build 在本地完成上传

set -e

# 项目目录（根据实际部署路径修改）
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="/tmp/attendance-backup-$(date +%Y%m%d-%H%M%S)"

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
pm2 restart "${PM2_NAME:-attendance-app}"

echo "=== 部署完成（代码已更新，需确保 .next 已构建）==="
