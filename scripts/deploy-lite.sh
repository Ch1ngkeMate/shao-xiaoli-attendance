#!/bin/bash
# 邵小利考勤系统 —— 服务器侧轻量部署（不构建，只切换已上传的构建产物）
#
# ⚠️ 这个脚本现在**只做"用已上传的 .next 替换生产并重启"**这一件事。
#
# 为什么砍掉了 git pull / npm ci / prisma migrate：
#   1. AI_HANDOFF.md 第 7 节明确记录：生产服务器工作区存在历史脏改动，
#      直接 `git pull` 会冲突甚至覆盖别人手上的东西。
#   2. 服务器内存不足，线上 `npm run build` 曾 OOM。构建统一在本地做。
#   3. 无脑跑 `prisma migrate deploy` 有风险：迁移必须是本次改动「确实带了
#      schema 变化」时才执行，而不是每次部署都顺手跑一遍。
#
# 正确用法：本地跑 `scripts/build-and-upload.ps1`，它会自行完成
#   上传 → 备份 → 切换 → 重启 → 验收。
#
# 本脚本仅用于**在没有 PowerShell 的环境里手工操作**，或排查时手动回滚。
#
# 用法：
#   bash scripts/deploy-lite.sh /tmp/sxl-deploy-xxx/next.zip
#   bash scripts/deploy-lite.sh --rollback              # 回滚到最近一次备份
#   bash scripts/deploy-lite.sh --list                  # 列出可用备份
#
# 需要 sudo 权限重启 PM2。

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/nextjs-app}"
PM2_NAME="${PM2_NAME:-nextjs-app}"
VERIFY_URL="${VERIFY_URL:-https://note.shaoxiaoli.top/api/version}"

log()  { printf '  [%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die()  { printf '  [X] %s\n' "$*" >&2; exit 1; }

[ -d "$PROJECT_DIR" ] || die "应用目录不存在：$PROJECT_DIR"
[ -f "$PROJECT_DIR/.next/BUILD_ID" ] || die "找不到 $PROJECT_DIR/.next/BUILD_ID"

cd "$PROJECT_DIR"

copy_dir() { cp -a "$1" "$2"; }

# ---------------------------------------------------------------- --list

if [ "${1:-}" = "--list" ]; then
  echo "=== $PROJECT_DIR 下的构建备份 ==="
  printf '  当前 .next       : %s\n' "$(cat .next/BUILD_ID 2>/dev/null || echo '??')"
  found=0
  for d in .next.bak-*; do
    [ -d "$d" ] || continue
    found=1
    printf '  %-40s BUILD_ID=%s\n' "$d" "$(cat "$d/BUILD_ID" 2>/dev/null || echo '??')"
  done
  [ "$found" = 1 ] || echo "  （没有备份）"
  exit 0
fi

# ---------------------------------------------------------------- --rollback

if [ "${1:-}" = "--rollback" ]; then
  LATEST="$(ls -1dt .next.bak-* 2>/dev/null | head -n1 || true)"
  [ -n "$LATEST" ] || die "没有可用的备份（.next.bak-*）"

  echo "=== 回滚 ==="
  log "当前构建：$(cat .next/BUILD_ID 2>/dev/null || echo '??')"
  log "目标备份：$LATEST → $(cat "$LATEST/BUILD_ID" 2>/dev/null || echo '??')"

  SAVED=".next.rollback-src-$(date +%Y%m%d-%H%M%S)"
  mv .next "$SAVED"
  if ! copy_dir "$LATEST" .next; then
    log "复制失败，恢复原目录"
    rm -rf .next
    mv "$SAVED" .next
    die "回滚失败，已恢复原状"
  fi
  rm -rf "$SAVED"

  sudo pm2 restart "$PM2_NAME" --update-env
  sudo pm2 save || true
  sleep 4
  log "线上构建号：$(curl -fsS "$VERIFY_URL" 2>/dev/null | grep -o '"buildId":"[^"]*"' || echo '验收请求失败')"
  echo "=== 回滚完成 ==="
  exit 0
fi

# ---------------------------------------------------------------- 正常部署

ZIP_PATH="${1:-}"
[ -n "$ZIP_PATH" ] || die "用法：bash scripts/deploy-lite.sh <已上传的 next.zip 路径>（或 --rollback / --list）"
[ -f "$ZIP_PATH" ] || die "压缩包不存在：$ZIP_PATH"

OLD_BUILD="$(cat .next/BUILD_ID 2>/dev/null || echo unknown)"
BACKUP_DIR=".next.bak-$OLD_BUILD"

echo "=== 1. 备份当前构建 ==="
log "当前构建号：$OLD_BUILD"
log "备份到：$BACKUP_DIR"
# 不用 rm -rf 直接抹掉可能存在的同名备份：先移到带时间戳的位置再删，避免删到"唯一那份能回滚的备份"
if [ -d "$BACKUP_DIR" ]; then
  STALE="$BACKUP_DIR.stale-$(date +%Y%m%d-%H%M%S)"
  log "已存在同名备份，先重命名保留：$STALE"
  mv "$BACKUP_DIR" "$STALE"
fi
copy_dir .next "$BACKUP_DIR" || die "备份失败，未做任何替换"
log "备份完成"

echo "=== 2. 解压新构建到临时目录 ==="
STAGE=".next.stage-$$"
rm -rf "$STAGE"; mkdir -p "$STAGE"
if ! unzip -q "$ZIP_PATH" -d "$STAGE"; then
  rm -rf "$STAGE"
  die "解压失败，原 .next 未改动"
fi

[ -f "$STAGE/BUILD_ID" ] || { rm -rf "$STAGE"; die "解压结果缺少 BUILD_ID"; }
NEW_BUILD="$(cat "$STAGE/BUILD_ID")"
log "新构建号：$NEW_BUILD"
if [ "$NEW_BUILD" = "$OLD_BUILD" ]; then
  log "警告：新旧构建号相同，确认你传的是新产物"
fi

echo "=== 3. 原子切换 ==="
SWAP=".next.old-$$"
if mv .next "$SWAP" && mv "$STAGE" .next; then
  rm -rf "$SWAP"
  log "切换完成"
else
  log "切换失败，尝试回滚"
  [ -d .next ] || mv "$SWAP" .next
  rm -rf "$STAGE"
  die "切换失败"
fi

echo "=== 4. 重启服务 ==="
sudo pm2 restart "$PM2_NAME" --update-env
sudo pm2 save || true
sleep 4

echo "=== 5. 验收 ==="
LIVE="$(curl -fsS "$VERIFY_URL" 2>/dev/null | grep -o '"buildId":"[^"]*"' || echo '')"
if echo "$LIVE" | grep -q "$NEW_BUILD"; then
  log "线上构建号匹配：$NEW_BUILD"
  echo "=== 部署完成 ==="
  echo "  备份保留在：$BACKUP_DIR（确认无问题后可手动 rm -rf）"
else
  printf '  [!] 验收未通过：%s\n' "${LIVE:-请求失败}"
  echo "  排查：sudo pm2 status / sudo pm2 logs $PM2_NAME --lines 100 / ss -lntp | grep 3000"
  echo "  回滚：bash $0 --rollback"
  exit 1
fi
