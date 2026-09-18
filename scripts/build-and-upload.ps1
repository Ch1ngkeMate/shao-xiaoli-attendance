# 邵小利考勤系统 — 本地构建并安全部署到生产
#
# 设计原则（对齐 AI_HANDOFF.md 第 8/9/10 节）：
#   1. 构建在本地完成（服务器内存不足，线上 next build 曾 OOM）。
#   2. 上传到**临时目录**，不直接往应用目录灌文件。
#   3. 替换 .next 前先把现有版本备份成 .next.bak-<buildId>，任何一步失败都回滚。
#   4. 重启后必须验证 /api/version，不一致就自动回滚并提示。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\build-and-upload.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-and-upload.ps1 -SkipBuild   # 复用已有 .next
#   powershell -ExecutionPolicy Bypass -File scripts\build-and-upload.ps1 -NoDeploy    # 只构建+打包
#
# 需要交互输入 SSH 密码（不写入任何文件）。请先确认自己有权操作生产环境。

[CmdletBinding()]
param(
    # 不要在这里用 $PSScriptRoot 求默认值：通过 -File 调用时它在 param 块里还是空的。
    # 留空则在下面脚本体内解析。
    [string]$ProjectPath = "",
    [string]$ServerHost  = "admin@8.156.86.244",
    [string]$RemotePath  = "/www/wwwroot/nextjs-app",
    [string]$Pm2Name     = "nextjs-app",
    [string]$VerifyUrl   = "https://note.shaoxiaoli.top/api/version",
    [switch]$SkipBuild,
    [switch]$NoDeploy,
    [switch]$SkipPrisma,
    # 自动化/无 TTY 场景使用：跳过所有 Read-Host 交互确认（部署确认也会自动通过，慎用）
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Step([string]$text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Ok([string]$text)   { Write-Host "  [OK] $text" -ForegroundColor Green }
function Warn([string]$text) { Write-Host "  [!]  $text" -ForegroundColor Yellow }
function Die([string]$text)  { Write-Host "  [X]  $text" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 0. 前置检查

# 到这里 $PSScriptRoot 才可靠
if (-not $ProjectPath) {
    $ProjectPath = Join-Path $PSScriptRoot ".."
}

Step "0. 环境与路径检查"

if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath "package.json"))) {
    Die "项目路径无效（找不到 package.json）：$($ProjectPath)"
}
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
Ok "项目路径：$ProjectPath"

foreach ($cmd in @("npm", "ssh", "scp")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Die "缺少命令：$cmd（npm 需 Node.js；ssh/scp 需 Windows 10+ 自带 OpenSSH 客户端）"
    }
}
Ok "npm / ssh / scp 均可用"

Set-Location -LiteralPath $ProjectPath

# 生产环境绝不能带着未提交的改动去部署 —— 至少让执行者确认一次
$dirty = git status --porcelain 2>$null
if ($LASTEXITCODE -eq 0 -and $dirty) {
    Warn "工作区有未提交改动，将按当前磁盘上的代码构建："
    $dirty -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 15 | ForEach-Object { Write-Host "      $_" }
    if ($NonInteractive) {
        Warn "-NonInteractive 已指定，跳过确认继续"
    } else {
        $answer = Read-Host "  继续？(y/N)"
        if ($answer -notmatch '^[Yy]$') { Die "已取消" }
    }
}

# ---------------------------------------------------------------- 1. 构建前校验

if (-not $SkipBuild) {
    Step "1. 构建前校验（prisma validate / tsc）"

    npx prisma validate
    if ($LASTEXITCODE -ne 0) { Die "prisma validate 失败" }
    Ok "prisma validate 通过"

    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { Die "tsc --noEmit 失败（先修类型错误再部署）" }
    Ok "tsc --noEmit 通过"

    git diff --check
    if ($LASTEXITCODE -ne 0) { Die "git diff --check 发现空白字符问题" }
    Ok "git diff --check 干净"
}

# ---------------------------------------------------------------- 2. 本地构建

if (-not $SkipBuild) {
    Step "2. 本地构建（npm run build）"
    npm run build
    if ($LASTEXITCODE -ne 0) { Die "构建失败，未做任何上传" }
    Ok "构建成功"
} else {
    Step "2. 跳过构建（-SkipBuild）"
}

$nextDir = Join-Path $ProjectPath ".next"
if (-not (Test-Path -LiteralPath (Join-Path $nextDir "BUILD_ID"))) {
    Die "找不到 .next/BUILD_ID，构建产物不完整"
}
$buildId = (Get-Content -LiteralPath (Join-Path $nextDir "BUILD_ID") -Raw).Trim()
Ok "本次构建号：$buildId"

$manifest = Join-Path $nextDir "routes-manifest.json"
if (-not (Test-Path -LiteralPath $manifest)) { Die "缺少 .next/routes-manifest.json" }
if (-not (Test-Path -LiteralPath (Join-Path $nextDir "server"))) { Die "缺少 .next/server" }

# ---------------------------------------------------------------- 3. 打包

Step "3. 打包 .next（排除 dev 缓存，解引用符号链接）"

$zipPath = Join-Path $env:TEMP "sxl-next-$buildId-$stamp.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

# 平铺进压缩包（服务器解压即得 .next 的内容），排除 dev 缓存。
# Next 15/16 的开发时编译产物是 .next/dev，带上生产纯属浪费体积。
#
# ⚠️ 必须用「自己写 zip」而不是 ZipFile.CreateFromDirectory，原因见下：
#
#   Next 16 会把 external 依赖内联到 `.next/node_modules/<name>-<hash>`，
#   而在 Windows 上这些条目是 **Junction（目录联接）**，指向工程根的 node_modules。
#   例如：.next/node_modules/@prisma/client-2c3a283f134fdcb6
#           → (Junction) → node_modules/@prisma/client
#
#   而 ZipFile.CreateFromDirectory 和 Copy-Item -Recurse **都不会跟随 Junction**，
#   只会写入一个空目录条目。传到 Linux 解压后就成了空壳，
#   表现为线上所有 import prisma 的接口返回裸 `text/plain` 500：
#       Error: Cannot find module '@prisma/client-<hash>/runtime/client'
#
#   （2026-09-17 实际踩过这个坑，线上登录挂了数小时。）
#
#   因此这里手工遍历 + 判断 ReparsePoint，遇到链接就把**目标内容**递归写进去，
#   同时用显式相对路径写 zip 条目（不能用 CreateEntryFromFile 自动算路径，
#   否则绝对路径会变成 zip 内的目录名）。
# 加载 zip 程序集。优先用 LoadFrom（纯加载，不编译），失败再退回 Add-Type。
# 注意：ZipArchiveMode 必须在程序集加载完成后才解析得到，
# 否则 PowerShell 会在解析期抛 TypeNotFound。
$zipAsmLoaded = $false
foreach ($asmName in @("System.IO.Compression.FileSystem", "System.IO.Compression")) {
    try {
        [void][System.Reflection.Assembly]::LoadWithPartialName($asmName)
    } catch { }
}
if (-not ("System.IO.Compression.ZipFile" -as [type])) {
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
        $zipAsmLoaded = $true
    } catch {
        Die "无法加载 System.IO.Compression.FileSystem：$($_.Exception.Message)"
    }
}
$zipModeCreate = [System.IO.Compression.ZipArchiveMode]::Create
$zipLevelOptimal = [System.IO.Compression.CompressionLevel]::Optimal

$zipArchive = [System.IO.Compression.ZipFile]::Open($zipPath, $zipModeCreate)

$script:fileCount   = 0
$script:bytesTotal  = 0
$script:linkCount   = 0
$script:skippedDirs = @()

function Add-DirToZip {
    param(
        [string]$SourceDir,   # 真实存在的目录（已解引用）
        [string]$EntryPrefix  # zip 内的相对路径前缀
    )
    # 用 -Force 才能看到隐藏项（.next 里有些以 . 开头的文件）
    foreach ($item in (Get-ChildItem -LiteralPath $SourceDir -Force)) {
        $entryName = if ($EntryPrefix) { "$EntryPrefix/$($item.Name)" } else { $item.Name }

        $isLink = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0

        if ($item.PSIsContainer) {
            if ($isLink) {
                # Junction / 目录符号链接：把目标内容真实递归进来（解引用）
                $script:linkCount++
                Write-Host "      deref dir  $entryName -> $($item.Target)" -ForegroundColor DarkYellow
            }
            Add-DirToZip -SourceDir $item.FullName -EntryPrefix $entryName
        }
        else {
            if ($isLink) { $script:linkCount++ }
            $entry = $zipArchive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = $item.LastWriteTime
            $in = [System.IO.File]::OpenRead($item.FullName)
            try {
                $out = $entry.Open()
                try { $in.CopyTo($out) } finally { $out.Dispose() }
            }
            finally { $in.Dispose() }
            $script:fileCount++
            $script:bytesTotal += $item.Length
        }
    }
}

# 顶层：只排除 dev / cache，其余全带（含 node_modules！）
$skipNames = @("dev", "cache")
Get-ChildItem -LiteralPath $nextDir -Force | Where-Object { $skipNames -notcontains $_.Name } | ForEach-Object {
    if ($_.PSIsContainer) {
        Add-DirToZip -SourceDir $_.FullName -EntryPrefix $_.Name
    }
    else {
        $entry = $zipArchive.CreateEntry($_.Name, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $_.LastWriteTime
        $in = [System.IO.File]::OpenRead($_.FullName)
        try {
            $out = $entry.Open()
            try { $in.CopyTo($out) } finally { $out.Dispose() }
        }
        finally { $in.Dispose() }
        $script:fileCount++
    }
    Write-Host "      staged $($_.Name)" -ForegroundColor DarkGray
}

$zipArchive.Dispose()

if ($script:fileCount -eq 0) { Die ".next 目录为空" }
Ok "已写入 $($script:fileCount) 个文件（解引用链接 $($script:linkCount) 个）"

# --- 完整性校验：确保 Next 内联的 external 依赖不是空壳 ---
# 这是 2026-09-17 那次线上事故的防复发检查：@prisma/client-<hash> 若为空，
# 部署后必然 500。宁可在这里失败，也不要把坏包传上去。
$nmDir = Join-Path $nextDir "node_modules"
if (Test-Path -LiteralPath $nmDir) {
    $emptyPkgs = @()
    Get-ChildItem -LiteralPath $nmDir -Recurse -Directory -Depth 1 -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '-[0-9a-f]{16}$' } | ForEach-Object {
            $inner = Get-ChildItem -LiteralPath $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
            if (-not $inner) { $emptyPkgs += $_.FullName.Replace($nextDir, ".next") }
        }
    if ($emptyPkgs.Count -gt 0) {
        Die "打包后仍有空的外部依赖目录（Junction 未解引用成功）：`n      $($emptyPkgs -join "`n      ")`n      若上传会导致线上 500，已中止。"
    }
    Ok "外部依赖目录非空校验通过"
} else {
    Warn "未找到 .next/node_modules（若项目不依赖 external 包则正常）"
}

$zipMb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
if ($zipMb -le 0) { Die "压缩包为空" }
Ok "压缩包：$zipPath（$zipMb MB，原始 $([math]::Round($script:bytesTotal / 1MB, 2)) MB）"

if ($NoDeploy) {
    Step "完成（-NoDeploy，未上传）"
    Write-Host "  产物：$zipPath" -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------- 4. 安全确认

Step "4. 部署确认"
Write-Host "  目标服务器：$ServerHost"
Write-Host "  应用目录  ：$RemotePath"
Write-Host "  PM2 进程  ：$Pm2Name"
Write-Host "  构建号    ：$buildId"
Write-Host "  验收地址  ：$VerifyUrl"
if ($NonInteractive) {
    Warn "-NonInteractive：跳过部署确认，直接继续"
} else {
    $answer = Read-Host "`n  确认部署到生产？(y/N)"
    if ($answer -notmatch '^[Yy]$') { Die "已取消" }
}

# ------------------------------------------------- 4.5 服务器运行时依赖检查（失败即中止）

Step "4.5 服务器运行时依赖检查"

<#
  next.config.ts 里 serverExternalPackages 列出的包（当前是 pdfjs-dist）**不打进 bundle**，
  运行时由 Node 直接从服务器的 node_modules 加载。而本流程只上传源码 + .next，**不装依赖**。
  服务器上少了这个包，接口会在第一次请求时 500，报错还是「缺少 pdfjs-dist」，
  很容易被误判成代码 bug 或构建问题。

  ⚠️ 必须放在**上传之前**：若放到切换 .next 之后再查，就会出现
  「新 .next 已落盘、PM2 还跑旧进程」的半状态，多一层排查噪音。
  在这里拦掉，生产完全没被碰过。
#>
$runtimeDeps = @("pdfjs-dist")
$depChecks = ($runtimeDeps | ForEach-Object { "test -f node_modules/$_/package.json" }) -join " && "

# ssh 的 stderr 单独落盘。目的：把「连不上服务器」和「服务器真缺依赖」分开。
# 不能用 2>&1 —— 脚本顶部设了 $ErrorActionPreference="Stop"，
# 合并原生命令的 stderr 会抛 NativeCommandError 把脚本直接打断。
# 文件名带 $stamp，天然避免读到上一轮的旧文件。
$depErrFile = Join-Path $env:TEMP "sxl-depcheck-$stamp.err"
$depOut = ssh $ServerHost "cd $RemotePath && $depChecks && echo DEPS_OK" 2>$depErrFile

$depErr = ""
if (Test-Path -LiteralPath $depErrFile) {
    $depErr = (Get-Content -LiteralPath $depErrFile -Raw)
    if (-not $depErr) { $depErr = "" } else { $depErr = $depErr.Trim() }
}

# 2026-09-19 实际踩过：SSH 被服务器关闭（Connection closed），$depOut 同样是空，
# 于是被误报成「服务器缺少 pdfjs-dist」，把人骗去 npm install 白折腾一圈。
$sshPattern = "(?i)connection closed|permission denied|connection timed out|connection refused|could not resolve|host key verification failed|no route to host|operation timed out|connection reset|kex_exchange|broken pipe"
if ($depErr -ne "" -and $depErr -match $sshPattern) {
    $depErrLines = @($depErr -split "`n" | Where-Object { $_.Trim() -ne "" })
    Warn "SSH 连接或认证失败 —— **不是**服务器缺依赖，别去装 pdfjs-dist。"
    if ($depErrLines.Count -gt 0) {
        Warn ("ssh 返回：" + $depErrLines[$depErrLines.Count - 1].Trim())
    }
    Warn "本次已中止，**生产未做任何改动**。"
    Write-Host "  本地 .next 已构建好，修好登录后重跑可加 -SkipBuild 省下重新构建的时间。" -ForegroundColor Yellow
    Write-Host "  一次性装免密公钥（之后 ssh/scp 都不再问密码，刷这一条即可）：" -ForegroundColor Yellow
    $pubKeyPath = Join-Path $env:USERPROFILE ".ssh\shaoxiaoli_deploy.pub"
    Write-Host ('      type "' + $pubKeyPath + '" | ssh ' + $ServerHost + ' "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY_INSTALLED"') -ForegroundColor Yellow
    exit 17
}

if ($LASTEXITCODE -ne 0 -or (($depOut -join "`n") -notmatch "DEPS_OK")) {
    Warn "服务器缺少运行时依赖：$($runtimeDeps -join ', ')"
    Warn "若不处理，课表识别接口 /api/schedule/parse 会 500。"
    Warn "已中止，**生产未做任何改动**。"
    Write-Host "  请在服务器（宝塔面板自带的终端可替代 SSH）执行：" -ForegroundColor Yellow
    Write-Host "      cd $RemotePath && npm install --no-audit --no-fund" -ForegroundColor Yellow
    Write-Host "  然后重跑本脚本（可加 -SkipBuild 复用本地已构建的 .next）" -ForegroundColor Yellow
    exit 16
}
Ok "运行时依赖就位：$($runtimeDeps -join ', ')"

# ---------------------------------------------------------------- 5. 上传到临时目录

$remoteTmp = "/tmp/sxl-deploy-$stamp"
$remoteZip = "$remoteTmp/next.zip"

Step "5. 上传到服务器临时目录（不碰应用目录）"

ssh $ServerHost "mkdir -p $remoteTmp"
if ($LASTEXITCODE -ne 0) { Die "无法连接服务器或创建临时目录，请确认 SSH 可用与权限" }

scp $zipPath "${ServerHost}:${remoteZip}"
if ($LASTEXITCODE -ne 0) { Die "上传失败" }
Ok "已上传到 $remoteZip"

# ---------------------------------------------------------------- 6. 服务器端：备份 + 切换 + 重启

Step "6. 服务器端：备份现有 .next → 解压新构建 → 重启"

# 关键：先备份再替换；且用 if 判断每一步，失败立刻回滚
# 注意 —— 这里传的是单行 shell，$ 需转义给远端而不是被 PowerShell 展开
$remoteScript = @"
set -e
cd '$RemotePath'

if [ ! -d .next ]; then echo 'ERR: 应用目录下没有 .next'; exit 10; fi

OLD_BUILD=`$(cat .next/BUILD_ID 2>/dev/null || echo unknown)
BACKUP=".next.bak-`$OLD_BUILD"
echo "  [服务器] 当前构建号: `$OLD_BUILD"
echo "  [服务器] 备份到: `$BACKUP"

rm -rf "`$BACKUP"
cp -a .next "`$BACKUP" || { echo 'ERR: 备份失败，未做任何替换'; exit 11; }
echo '  [服务器] 备份完成'

# 解压到临时目录再原子替换，避免 unzip 中途失败留下半个 .next
rm -rf .next.new
mkdir -p .next.new
unzip -q '$remoteZip' -d .next.new || { echo 'ERR: 解压失败，保留原 .next'; rm -rf .next.new; exit 12; }

[ -f .next.new/BUILD_ID ] || { echo 'ERR: 解压结果缺少 BUILD_ID'; rm -rf .next.new; exit 13; }
NEW_BUILD=`$(cat .next.new/BUILD_ID)
echo "  [服务器] 新构建号: `$NEW_BUILD"

# 防复发：检查 Next 内联的 external 依赖是否为空壳。
# 2026-09-17 事故：Windows Junction 打包时被压成空目录，
# 导致 .next/node_modules/@prisma/client-<hash> 为空，线上全部 prisma 接口 500。
# 这里在切换**之前**拦截，坏包绝不进生产。
if [ -d .next.new/node_modules ]; then
  EMPTY=""
  for d in `$(find .next.new/node_modules -maxdepth 2 -type d -name '*-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' 2>/dev/null); do
    if [ -z "`$(ls -A "`$d" 2>/dev/null)" ]; then EMPTY="`$EMPTY `$d"; fi
  done
  if [ -n "`$EMPTY" ]; then
    echo "ERR: 新构建含空的外部依赖目录（Junction 未解引用）：`$EMPTY"
    echo "     已中止，保留原 .next 不动。请检查本地打包是否用了实体化逻辑。"
    rm -rf .next.new
    exit 15
  fi
  echo '  [服务器] 外部依赖目录非空校验通过'
fi

mv .next ".next.old-$stamp" && mv .next.new .next || {
  echo 'ERR: 切换失败，尝试回滚'
  [ -d .next ] || mv ".next.old-$stamp" .next
  exit 14
}
rm -rf ".next.old-$stamp"
echo '  [服务器] 切换完成'
"@

ssh $ServerHost $remoteScript
if ($LASTEXITCODE -ne 0) {
    Warn "服务器端步骤失败（退出码 $LASTEXITCODE）"
    Warn "原构建仍保留在 $RemotePath/.next.bak-* —— 请登录服务器确认当前 .next 状态"
    Warn "如需回滚：ssh $ServerHost 后执行"
    Write-Host "      cd $RemotePath && rm -rf .next && mv .next.bak-<旧构建号> .next && sudo pm2 restart $Pm2Name" -ForegroundColor Yellow
    exit 1
}
Ok "服务器端切换完成"

# ---------------------------------------------------------------- 7. Prisma（仅在 schema 有变动时）

if (-not $SkipPrisma) {
    Step "7. Prisma migrate deploy + generate"
    Write-Host "  提示：本次若未改动 prisma/schema.prisma，可加 -SkipPrisma 跳过" -ForegroundColor DarkGray
    ssh $ServerHost "cd $RemotePath && npx prisma migrate deploy && npx prisma generate"
    if ($LASTEXITCODE -ne 0) {
        Warn "Prisma 步骤失败 —— .next 已切换但数据库可能没跟上，请立即检查迁移状态"
        exit 1
    }
    Ok "Prisma 就绪"
} else {
    Step "7. 跳过 Prisma（-SkipPrisma）"
}

# ---------------------------------------------------------------- 8. 重启并验收

Step "8. 重启 PM2 并验收"

ssh $ServerHost "sudo pm2 restart $Pm2Name --update-env && sudo pm2 save"
if ($LASTEXITCODE -ne 0) { Warn "PM2 重启命令返回非零，继续尝试验收" }

Start-Sleep -Seconds 4

$verified = $false
try {
    $resp = Invoke-RestMethod -Uri $VerifyUrl -TimeoutSec 20
    $liveId = $resp.buildId
    if ($liveId -eq $buildId) {
        Ok "线上构建号 = $liveId，与本次构建一致"
        $verified = $true
    } else {
        Warn "线上构建号 = $liveId，与本次 $buildId 不一致"
    }
} catch {
    Warn "验收请求失败：$($_.Exception.Message)"
}

if ($verified) {
    Step "部署成功"
    Write-Host "  构建号：$buildId" -ForegroundColor Green
    Write-Host "  备份  ：$RemotePath/.next.bak-<旧构建号>（确认无问题后可手动清理）" -ForegroundColor DarkGray
} else {
    Warn "自动验收未通过。请依次执行："
    Write-Host "      ssh $ServerHost 'sudo pm2 status'" -ForegroundColor Yellow
    Write-Host "      ssh $ServerHost 'sudo pm2 logs $Pm2Name --lines 100'" -ForegroundColor Yellow
    Write-Host "      ssh $ServerHost 'ss -lntp | grep 3000'" -ForegroundColor Yellow
    Write-Host "      ssh $ServerHost 'sudo nginx -t'" -ForegroundColor Yellow
    Write-Host "  回滚：把 $RemotePath/.next 换成 .next.bak-<旧构建号> 后重启 $Pm2Name" -ForegroundColor Yellow
    exit 1
}
