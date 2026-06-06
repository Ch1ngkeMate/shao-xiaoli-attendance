#!/bin/bash
# 部署脚本 - 在服务器上执行
# 用法: cd <项目目录> && bash scripts/deploy.sh

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

echo "=== 3. 安装依赖 ==="
npm install

echo "=== 4. 数据库迁移 ==="
npm run db:deploy

echo "=== 5. 构建项目 ==="
npm run build

echo "=== 6. 重启服务 ==="
pm2 restart "${PM2_NAME:-attendance-app}"

echo "=== 部署完成 ==="
