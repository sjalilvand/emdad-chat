# دستیار هوشمند کمیته امداد (emdad-chat)

چت‌بات فارسی متصل به مدل‌های محلی **Ollama** — اجرا روی **پورت 8094**

## امکانات

1. جستجوی زنده در اینترنت (زنجیره Bing / DDG / Google / SearXNG)
2. تم شب و روز (تاریک / روشن)
3. ذخیره و حذف گفتگوها (تکی یا همه)
4. نمایش فرایند تفکر مدل (thinking)
5. جستجو و پاسخ از سایت emdad.ir
6. پاسخ از صفحه شفافیت `komiteemdad.emdad.ir/fa/shafaf`
7. پاسخ از آمار و عملکرد `komiteemdad.emdad.ir/node/63700`
8. پاسخ از میز خدمت `komiteemdad.emdad.ir/fa/soha`
9. پاسخ از **برنامه پنج‌ساله هفتم** (`data/Program7.txt`)
10. پاسخ از **دستورالعمل شناسایی و پذیرش** (`data/DastoorolAmal_Paziroosh.txt`)

مدل‌ها: `qwen3:8b` ، `qwen3:4b` ، `qwen2.5vl:3b` (انتخابی) + ارسال تصویر برای مدل دیداری.

## اجرای سریع روی سرور ویندوز (PowerShell)

پیش‌نیاز: Node.js 20+ ، Git ، Ollama با مدل‌های دانلودشده.

```powershell
# نصب کامل و اجرا (بار اول و هر بار به‌روزرسانی)
powershell -ExecutionPolicy Bypass -File deploy\setup-server.ps1
```

سپس مرورگر: **http://130.185.73.157:8094**

مدیریت سرویس:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\stop-server.ps1    # توقف
powershell -ExecutionPolicy Bypass -File deploy\start-server.ps1   # اجرای مجدد بدون build
```

## بارگذاری تغییرات در گیت‌هاب (از هر دستگاه)

```powershell
$env:GITHUB_TOKEN = "توکن-شما"     # یا دستی و امن وارد می‌شود
powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1 -Message "شرح تغییرات"
```

## ساختار

```
src/            کد برنامه (Next.js 16 + TypeScript + Tailwind + shadcn/ui, RTL)
data/           اسناد پایگاه دانش (برنامه هفتم + دستورالعمل پذیرش)
prisma/         شِمای دیتابیس SQLite (گفتگوها + کش صفحات امداد)
deploy/         اسکریپت‌های استقرار (PowerShell / bat / PM2)
scripts/        اسکریپت بارگذاری در گیت‌هاب
```

راهنمای کامل استقرار و عیب‌یابی: [`deploy/راهنمای-استقرار.md`](deploy/راهنمای-استقرار.md)
