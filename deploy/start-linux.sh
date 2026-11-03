#!/usr/bin/env bash
# ============================================================
#  اجرای دستیار هوشمند کمیته امداد روی پورت 8094 (لینوکس)
#  پیش‌نیاز: Node.js 20+ و npm
# ============================================================
set -e
cd "$(dirname "$0")/.."

export PORT=8094
export NODE_ENV=production
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
export DEFAULT_MODEL="${DEFAULT_MODEL:-qwen3:8b}"
export EMDAD_CACHE_TTL_HOURS="${EMDAD_CACHE_TTL_HOURS:-12}"

echo "[1/4] نصب وابستگی‌ها..."
npm install

echo "[2/4] همگام‌سازی دیتابیس..."
npx prisma db push --accept-data-loss

echo "[3/4] ساخت نسخه تولید..."
npm run build:prod

echo "[4/4] اجرا روی پورت 8094 ..."
exec npx next start -p 8094
