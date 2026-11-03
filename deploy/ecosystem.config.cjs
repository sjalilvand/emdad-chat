// پیکربندی PM2 برای اجرای دائمی سرویس روی پورت 8094
// نصب: npm install -g pm2
// اجرا: pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'emdad-chat',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 8094',
      cwd: __dirname + '/..',
      env: {
        NODE_ENV: 'production',
        PORT: '8094',
        OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        DEFAULT_MODEL: 'qwen3:8b',
        EMDAD_CACHE_TTL_HOURS: '12',
      },
      max_memory_restart: '1G',
      autorestart: true,
    },
  ],
};
