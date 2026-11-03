@echo off
chcp 65001 >nul
rem ============================================================
rem  اجرای دستیار هوشمند کمیته امداد روی پورت 8094 (ویندوز)
rem  پیش‌نیاز: Node.js 20+ نصب شده باشد (https://nodejs.org)
rem ============================================================
cd /d "%~dp0.."

echo [1/4] تنظیم متغیرهای محیطی...
set PORT=8094
set NODE_ENV=production
set OLLAMA_BASE_URL=http://127.0.0.1:11434
set DEFAULT_MODEL=qwen3:8b
set EMDAD_CACHE_TTL_HOURS=12
rem مسیر دیتابیس - مسیر پروژه را بر اساس محل نصب اصلاح کنید
rem set DATABASE_URL=file:C:/emdad-chat/db/custom.db

echo [2/4] نصب وابستگی‌ها (فقط بار اول)...
if not exist "node_modules" call npm install

echo [3/4] همگام‌سازی دیتابیس...
call npx prisma db push --accept-data-loss

echo [4/4] ساخت و اجرا روی پورت 8094 ...
call npm run build:prod
call npx next start -p 8094

pause
