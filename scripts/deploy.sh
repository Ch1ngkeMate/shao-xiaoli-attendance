#!/bin/bash
# 部署脚本 - 在服务器上执行
# 用法: cd /www/wwwroot/nextjs-app && bash scripts/deploy.sh

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

echo "=== 3. 安装依赖 ==="
npm install

echo "=== 4. 数据库迁移 ==="
npm run db:deploy

echo "=== 5. 构建项目 ==="
npm run build

echo "=== 6. 重启服务 ==="
pm2 restart nextjs-app

echo "=== 部署完成 ==="
