# ساخت نسخه‌های Android و Windows

## اجرای برنامه در وب

```sh
pnpm --filter @workspace/tradermind run dev
```

## ساخت APK اندروید برای نصب و آزمایش

روی دستگاه سازنده باید Java 21 و Android SDK نصب باشد و `ANDROID_HOME` یا
`ANDROID_SDK_ROOT` تنظیم شده باشد. سپس:

```sh
pnpm install --frozen-lockfile --filter @workspace/tradermind...
pnpm --filter @workspace/tradermind run build:android:debug
```

فایل خروجی:

```text
artifacts/tradermind/android/app/build/outputs/apk/debug/app-debug.apk
```

این APK با کلید debug خود Android امضا می‌شود و برای نصب و آزمایش است؛ نسخه
فروشگاهی محسوب نمی‌شود.

## ساخت نسخه Windows 64-bit

این دستور را روی Windows اجرا کنید:

```powershell
pnpm install --frozen-lockfile --filter @workspace/tradermind...
pnpm --filter @workspace/tradermind run build:windows:x64
```

خروجی‌ها در `artifacts/tradermind/dist/windows/` قرار می‌گیرند: نصب‌کننده‌ی
NSIS و نسخه‌ی portable برای معماری x64.

## ساخت خودکار با GitHub Actions

گردش‌کار `.github/workflows/build-native.yml` با push به `main`، tagهای `v*` یا
اجرای دستی شروع می‌شود. پس از پایان هر دو job، APK و فایل‌های Windows را از
بخش **Artifacts** همان اجرای workflow دانلود کنید. هنگام اجرای workflow روی
tag، همین فایل‌ها به GitHub Release نیز پیوست می‌شوند.

## همگام‌سازی گوشی، وب و ویندوز

نسخه‌ی ویندوز نسخه‌ی اصلی (مرکز) داده‌هاست. گوشی و نسخه‌ی وب هر کدام دیتابیس خودشان را دارند و
وقتی برنامه‌ی ویندوز باز است با آن همگام می‌شوند (دوطرفه: افزودن، ویرایش، حذف و تصاویر).

- برنامه‌ی ویندوز هنگام اجرا یک سرور کوچک روی پورت 47821 باز می‌کند (`desktop/syncHub.cjs`).
  داده‌ای جدا از دیتابیس خود برنامه نگه نمی‌دارد.
- تنظیمات ← «همگام‌سازی» در ویندوز، «کد اتصال» را نشان می‌دهد؛ آن را یک‌بار در تنظیمات گوشی بچسبانید.
- نسخه‌ی وب: در ویندوز دکمه‌ی «باز کردن نسخه‌ی وب در مرورگر» را بزنید (آدرس 127.0.0.1 باید باشد تا
  تایپ صوتی کار کند). اتصال خودکار انجام می‌شود.
- بیرون از خانه: روی کامپیوتر و گوشی Tailscale نصب کنید (رایگان).
- قانون ادغام: ویرایشِ جدیدتر برنده است (ساعت هر دو دستگاه باید درست باشد).
- قبل از اولین همگام‌سازی از هر دو طرف پشتیبان (Backup) بگیرید.
- «بازیابی پشتیبان» روی یک دستگاه و همگام‌سازی را هم‌زمان استفاده نکنید.

آزمایش‌ها: `pnpm --filter @workspace/tradermind run test` (پوشه‌ی `src/sync/__tests__`).
