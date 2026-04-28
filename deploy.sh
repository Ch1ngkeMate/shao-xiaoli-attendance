#!/usr/bin/env bash
set -euo pipefail

# 一键部署脚本（服务器上执行）
# 用法：
#   bash deploy.sh
#
# 可选环境变量：
#   PM2_NAME=nextjs-app
#   NODE_HEAP_MB=4096

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PM2_NAME="${PM2_NAME:-nextjs-app}"
NODE_HEAP_MB="${NODE_HEAP_MB:-4096}"

cd "$APP_DIR"

echo "== 1) git pull（要求工作区干净） =="
if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有改动，先 stash -u"
  git stash -u
fi
git pull

echo "== 2) 安装依赖（可复现） =="
if [ -f package-lock.json ]; then
  npm ci
else
  npm i
fi

echo "== 3) Prisma（必须） =="
npx prisma migrate deploy
npx prisma generate

echo "== 4) 构建 =="
export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
npm run build

echo "== 5) 重启 PM2 =="
pm2 restart "$PM2_NAME" --update-env

echo "== 6) 部署后自检（探针） =="
curl -s http://127.0.0.1:3000/api/version || true
curl -s http://127.0.0.1:3000/api/me || true

echo "== DONE =="

