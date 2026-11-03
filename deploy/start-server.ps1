<#
  اجرای سریع سرویس بدون نصب/ساخت مجدد (مثلاً پس از ری‌استارت سرور)
  مصرف:  powershell -ExecutionPolicy Bypass -File deploy\start-server.ps1 [-Foreground]
#>
param(
  [string]$InstallDir = "C:\emdad-chat",
  [int]$Port = 8094,
  [switch]$Foreground
)
$ErrorActionPreference = "Stop"
Set-Location $InstallDir

if (-not (Test-Path ".next\BUILD_ID")) {
  Write-Host "[X] پروژه هنوز build نشده است؛ اول setup-server.ps1 را اجرا کنید." -ForegroundColor Red
  exit 1
}

if ($Foreground) {
  $env:NODE_ENV = "production"
  npx next start -p $Port
} else {
  New-Item -ItemType Directory -Force -Path "logs" | Out-Null
  $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
  if ($pm2) {
    pm2 start deploy/ecosystem.config.cjs
    Write-Host "[OK] سرویس با PM2 اجرا شد." -ForegroundColor Green
  } else {
    Start-Process -FilePath "node" `
      -ArgumentList "node_modules\next\dist\bin\next","start","-p","$Port" `
      -WorkingDirectory $InstallDir -WindowStyle Hidden `
      -RedirectStandardOutput "logs\out.log" -RedirectStandardError "logs\err.log"
    Write-Host "[OK] سرویس در پس‌زمینه اجرا شد: http://130.185.73.157:$Port" -ForegroundColor Green
  }
}
