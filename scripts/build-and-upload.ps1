# 本地构建并准备上传脚本
# 用法: 右键"使用 PowerShell 运行" 或直接粘贴到 PowerShell

$projectPath = "D:\develop\cursor Pro\shao-xiaoli-attendance"
$serverHost = "root@shaoxiaoli.top"
$remotePath = "/www/wwwroot/nextjs-app"

Write-Host "=== 1. 本地构建 ===" -ForegroundColor Green
cd "$projectPath"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "构建失败!" -ForegroundColor Red
    exit 1
}

Write-Host "=== 2. 压缩 .next 文件夹 ===" -ForegroundColor Green
$zipPath = "$env:TEMP\next-build.zip"
Compress-Archive -Path "$projectPath\.next\*" -DestinationPath $zipPath -Force

Write-Host "=== 3. 上传到服务器 ===" -ForegroundColor Green
scp "$zipPath" "${serverHost}:${remotePath}/"

Write-Host "=== 4. 服务器解压并重启 ===" -ForegroundColor Green
ssh $serverHost "cd $remotePath && rm -rf .next && unzip -q next-build.zip && pm2 restart nextjs-app"

Write-Host "=== 完成 ===" -ForegroundColor Green
