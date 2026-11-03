<#
  بارگذاری (push) تغییرات پروژه در گیت‌هاب
  ------------------------------------------------------------
  مصرف:
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1 -Message "شرح تغییرات"

  توکن را از متغیر محیطی GITHUB_TOKEN می‌خواند؛ اگر تنظیم نشده باشد،
  به‌صورت امن (بدون نمایش) از شما پرسیده می‌شود. توکن در هیچ فایلی ذخیره نمی‌شود.
#>
param(
  [string]$Message = "update emdad-chat",
  [string]$Branch  = "main",
  [string]$Repo    = "sjalilvand/emdad-chat"
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[X] Git نصب نیست. نصب: winget install --id Git.Git -e" -ForegroundColor Red
  exit 1
}

# --- توکن ---
$token = $env:GITHUB_TOKEN
if (-not $token) {
  $secure = Read-Host "GitHub Personal Access Token (ورودی نامرئی)" -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
             [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if (-not $token) { Write-Host "[X] توکن وارد نشد." -ForegroundColor Red; exit 1 }

# --- تنظیم remote (بدون توکن؛ توکن فقط یک‌بار در دستور push استفاده می‌شود) ---
$hasOrigin = (git remote) | Select-String -SimpleMatch "origin" -Quiet
if (-not $hasOrigin) { git remote add origin "https://github.com/$Repo.git" }

# --- کامیت تغییرات ---
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "تغییری برای بارگذاری وجود ندارد." -ForegroundColor Yellow
} else {
  git commit -m $Message
}

# --- push با توکن (یک‌بار مصرف در URL؛ در config ذخیره نمی‌شود) ---
git push "https://$token@github.com/$Repo.git" $Branch
if ($LASTEXITCODE -eq 0) {
  Write-Host "[OK] بارگذاری انجام شد: https://github.com/$Repo" -ForegroundColor Green
} else {
  Write-Host "[X] بارگذاری ناموفق بود؛ اعتبار توکن یا دسترسی مخزن را بررسی کنید." -ForegroundColor Red
  exit 1
}
