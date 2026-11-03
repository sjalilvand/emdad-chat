<#
  نصب یک‌باره «دستیار هوشمند کمیته امداد» روی سرور ویندوز - پورت 8094
  ------------------------------------------------------------
  کافی است این سه خط را در PowerShell اجرا کنید (مسیر فعلی مهم نیست):

    [Net.ServicePointManager]::SecurityProtocol = 'Tls12'
    Invoke-WebRequest "https://raw.githubusercontent.com/sjalilvand/emdad-chat/main/install.ps1" -OutFile "$env:TEMP\install-emdad.ps1" -UseBasicParsing
    powershell -ExecutionPolicy Bypass -File "$env:TEMP\install-emdad.ps1"

  این اسکریپت: کد را از گیت‌هاب (git یا ZIP) در C:\emdad-chat قرار می‌دهد
  و سپس deploy\setup-server.ps1 را اجرا می‌کند (نصب + ساخت + اجرا).
  اجرای دوباره = به‌روزرسانی کد + ساخت و اجرای مجدد.
#>
param(
  [string]$InstallDir = "C:\emdad-chat",
  [switch]$Foreground
)
$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

function Info($m){ Write-Host ("      " + $m) -ForegroundColor Cyan }
function Ok($m)  { Write-Host ("[OK] " + $m) -ForegroundColor Green }
function Fail($m){ Write-Host ("[X]  " + $m) -ForegroundColor Red; exit 1 }

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  نصب دستیار هوشمند کمیته امداد - پورت 8094" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

$hasGit  = Test-Path (Join-Path $InstallDir ".git")
$hasCode = Test-Path (Join-Path $InstallDir "package.json")

if (-not ($hasGit -or $hasCode)) {
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Info "دریافت کد با git..."
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    git clone https://github.com/sjalilvand/emdad-chat.git $InstallDir
    if ($LASTEXITCODE -ne 0) { Fail "git clone ناموفق بود؛ اتصال شبکه را بررسی کنید." }
    Ok "کد دریافت شد (git)."
  } else {
    Info "Git نصب نیست؛ دریافت فایل ZIP از گیت‌هاب..."
    $zip = Join-Path $env:TEMP "emdad-chat-main.zip"
    Invoke-WebRequest "https://github.com/sjalilvand/emdad-chat/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
    $tmp = Join-Path $env:TEMP ("emdad-extract-" + [guid]::NewGuid().ToString("N").Substring(0,6))
    Expand-Archive $zip -DestinationPath $tmp -Force
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    Move-Item (Join-Path $tmp "emdad-chat-main") $InstallDir
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Ok "کد دریافت شد (ZIP) در $InstallDir."
  }
} else {
  Ok "کد از قبل در $InstallDir موجود است."
}

Set-Location $InstallDir
Info "اجرای setup-server.ps1 (نصب وابستگی‌ها، دیتابیس، ساخت و اجرا)..."
if ($Foreground) {
  powershell -ExecutionPolicy Bypass -File "deploy\setup-server.ps1" -InstallDir $InstallDir -Foreground
} else {
  powershell -ExecutionPolicy Bypass -File "deploy\setup-server.ps1" -InstallDir $InstallDir
}
