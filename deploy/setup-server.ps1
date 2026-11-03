<#
  نصب و اجرای «دستیار هوشمند کمیته امداد» روی سرور ویندوز - پورت 8094
  ------------------------------------------------------------
  اجرای سریع (PowerShell با دسترسی Administrator):
    powershell -ExecutionPolicy Bypass -File deploy\setup-server.ps1

  اجرای دوباره = به‌روزرسانی کد از گیت‌هاب + نصب + ساخت + اجرای مجدد.
  برای دیدن لاگ زنده در پیش‌زمینه:
    powershell -ExecutionPolicy Bypass -File deploy\setup-server.ps1 -Foreground
#>
param(
  [string]$InstallDir = "C:\emdad-chat",
  [string]$RepoUrl    = "https://github.com/sjalilvand/emdad-chat.git",
  [int]$Port          = 8094,
  [string]$Token      = $env:GITHUB_TOKEN,
  [switch]$Foreground
)
$ErrorActionPreference = "Stop"
function Info($m){ Write-Host ("      " + $m) -ForegroundColor Cyan }
function Ok($m)  { Write-Host ("[OK] " + $m) -ForegroundColor Green }
function Warn($m){ Write-Host ("[!]  " + $m) -ForegroundColor Yellow }
function Fail($m){ Write-Host ("[X]  " + $m) -ForegroundColor Red; exit 1 }

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  نصب دستیار هوشمند کمیته امداد - پورت $Port" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# ---------- ۱) پیش‌نیازها ----------
Info "1/9  بررسی پیش‌نیازها..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js یافت نشد. نسخه 20 یا بالاتر را از https://nodejs.org نصب کنید."
}
$nodeMajor = [int](((node -v) -replace '^v','') -split '\.')[0]
if ($nodeMajor -lt 20) { Fail "Node.js نسخه 20+ لازم است (فعلی: $(node -v))." }
Ok "Node.js $(node -v)"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "Git یافت نشد. نصب: winget install --id Git.Git -e"
}
Ok "Git آماده است."

# ---------- ۲) Ollama ----------
Info "2/9  بررسی Ollama..."
$ollamaOk = $false
try {
  $null = Invoke-RestMethod "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
  $ollamaOk = $true
  Ok "Ollama فعال است."
} catch {
  $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
  if (Test-Path $ollamaExe) {
    Warn "Ollama در حال اجرا نبود؛ تلاش برای راه‌اندازی..."
    Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep 5
    try {
      $null = Invoke-RestMethod "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
      $ollamaOk = $true
      Ok "Ollama راه‌اندازی شد."
    } catch { }
  }
  if (-not $ollamaOk) {
    Warn "Ollama در دسترس نیست؛ برنامه بالا می‌آید ولی تا اجرای Ollama پاسخ واقعی نمی‌دهد."
  }
}

# ---------- ۳) دریافت کد ----------
Info "3/9  دریافت/به‌روزرسانی کد از گیت‌هاب..."
$cloneUrl = if ($Token) { "https://$Token@github.com/sjalilvand/emdad-chat.git" } else { $RepoUrl }
if (Test-Path (Join-Path $InstallDir ".git")) {
  git -C $InstallDir pull --ff-only | Out-Null
  Ok "مخزن موجود به‌روزرسانی شد."
} elseif (Test-Path (Join-Path $InstallDir "package.json")) {
  Ok "کد از قبل در $InstallDir موجود است (نصب بدون گیت)؛ برای به‌روزرسانی، install.ps1 را دوباره اجرا کنید."
} elseif ((Test-Path $InstallDir) -and ((Get-ChildItem $InstallDir -Force | Measure-Object).Count -gt 0)) {
  Fail "پوشه $InstallDir وجود دارد ولی کد پروژه در آن نیست؛ پوشه را خالی کنید یا مسیر دیگری بدهید."
} else {
  git clone $cloneUrl $InstallDir
  if ($LASTEXITCODE -ne 0) { Fail "دریافت مخزن ناموفق بود (توکن/شبکه را بررسی کنید)." }
  if ($Token) { git -C $InstallDir remote set-url origin $RepoUrl }  # توکن در config ذخیره نماند
  Ok "کد در $InstallDir دریافت شد."
}
Set-Location $InstallDir

# ---------- ۴) وابستگی‌ها ----------
Info "4/9  نصب وابستگی‌ها (npm install)..."
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install ناموفق بود." }

# ---------- ۵) فایل .env ----------
Info "5/9  ساخت فایل .env..."
if (-not (Test-Path ".env")) {
  Copy-Item "deploy\.env.example" ".env"
  $dbLine = "DATABASE_URL=file:" + ($InstallDir -replace '\\','/') + "/db/custom.db"
  (Get-Content ".env") -replace '^DATABASE_URL=.*', $dbLine | Set-Content ".env" -Encoding UTF8
  Ok ".env ساخته شد (مسیر دیتابیس مطلق شد)."
} else {
  Ok ".env از قبل موجود است."
}

# ---------- ۶) دیتابیس ----------
Info "6/9  همگام‌سازی دیتابیس (prisma)..."
New-Item -ItemType Directory -Force -Path "db" | Out-Null
npx prisma db push --accept-data-loss
if ($LASTEXITCODE -ne 0) { Fail "prisma db push ناموفق بود." }

# ---------- ۷) ساخت ----------
Info "7/9  ساخت نسخه تولیدی (next build)..."
npm run build:prod
if ($LASTEXITCODE -ne 0) { Fail "ساخت پروژه ناموفق بود." }

# ---------- ۸) فایروال ----------
Info "8/9  باز کردن پورت $Port در فایروال..."
try {
  New-NetFirewallRule -DisplayName "EmdadChat-$Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction Stop | Out-Null
  Ok "قانون فایروال اضافه شد."
} catch {
  Warn "افزودن قانون فایروال ناموفق بود (Administrator هستید؟). پورت را دستی باز کنید."
}

# ---------- ۹) اجرا ----------
Info "9/9  اجرای سرویس روی پورت $Port..."
if ($Foreground) {
  $env:NODE_ENV = "production"
  npx next start -p $Port
} else {
  New-Item -ItemType Directory -Force -Path "logs" | Out-Null
  $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
  if ($pm2) {
    # حذف نمونه قبلی در صورت وجود؛ در اجرای اول «not found» طبیعی است
    # (با cmd اجرا می‌شود تا stderr به خطای توقف‌دهنده PS 5.1 تبدیل نشود)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    cmd /c "pm2 delete emdad-chat >nul 2>&1"
    $ErrorActionPreference = $prevEap
    pm2 start deploy/ecosystem.config.cjs
    cmd /c "pm2 save >nul 2>&1"
    Ok "سرویس با PM2 اجرا شد (لاگ: pm2 logs emdad-chat)."
  } else {
    Start-Process -FilePath "node" `
      -ArgumentList "node_modules\next\dist\bin\next","start","-p","$Port" `
      -WorkingDirectory $InstallDir -WindowStyle Hidden `
      -RedirectStandardOutput "logs\out.log" -RedirectStandardError "logs\err.log"
    Ok "سرویس در پس‌زمینه اجرا شد (توقف: deploy\stop-server.ps1)."
  }
  Start-Sleep 6
  try {
    $null = Invoke-WebRequest "http://127.0.0.1:$Port/api/models" -UseBasicParsing -TimeoutSec 15
    Ok "برنامه فعال است:  http://130.185.73.157:$Port"
  } catch {
    Warn "برنامه هنوز پاسخ نمی‌دهد؛ لاگ را ببینید: $InstallDir\logs\err.log"
  }
}
Write-Host "==============================================" -ForegroundColor Cyan
