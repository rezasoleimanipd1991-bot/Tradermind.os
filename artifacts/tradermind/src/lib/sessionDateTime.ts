/**
 * ابزارهای تاریخ و ساعت سشن معاملاتی
 *
 * - نمایش هم‌زمان تاریخ شمسی و میلادی همراه با نام روز هفته
 * - تشخیص خودکار نوع سشن (آسیا / لندن / همپوشانی / نیویورک) از روی ساعت شروع
 *
 * همهٔ توابع فقط به timestamp (میلی‌ثانیه، UTC) وابسته‌اند و ساعت محلی دستگاه
 * را برای نمایش به کار می‌برند؛ پس بدون وابستگی به React/Dexie قابل تست‌اند.
 */

export type SessionKind = 'asia' | 'london' | 'overlap' | 'newyork';

/**
 * بازه‌های سشن بر پایهٔ UTC (مطابق ساعت تابستانی لندن و نیویورک):
 *  - آسیا:       ۲۱:۰۰ تا ۰۷:۰۰
 *  - لندن:        ۰۷:۰۰ تا ۱۲:۰۰
 *  - همپوشانی:   ۱۲:۰۰ تا ۱۶:۰۰
 *  - نیویورک:    ۱۶:۰۰ تا ۲۱:۰۰
 */
export const SESSION_WINDOWS_UTC: ReadonlyArray<{ kind: SessionKind; startHour: number; endHour: number }> = [
  { kind: 'london', startHour: 7, endHour: 12 },
  { kind: 'overlap', startHour: 12, endHour: 16 },
  { kind: 'newyork', startHour: 16, endHour: 21 },
];

const SESSION_KIND_LABELS: Record<SessionKind, readonly string[]> = {
  asia: ['آسیا', 'Asia'],
  london: ['لندن', 'London'],
  overlap: ['همپوشانی لندن و نیویورک', 'London/New York Overlap'],
  newyork: ['نیویورک', 'New York'],
};

export function detectSessionKind(timestamp: number): SessionKind {
  const date = new Date(timestamp);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  for (const window of SESSION_WINDOWS_UTC) {
    if (hour >= window.startHour && hour < window.endHour) return window.kind;
  }
  return 'asia';
}

/** گزینهٔ «نوع سشن» متناظر با نوع تشخیص‌داده‌شده را بر اساس عنوانش پیدا می‌کند. */
export function findSessionTypeOptionId(
  options: ReadonlyArray<{ id: string; label: string }>,
  kind: SessionKind,
): string | null {
  const labels = SESSION_KIND_LABELS[kind].map(label => label.trim().toLocaleLowerCase());
  const match = options.find(option => labels.includes(option.label.trim().toLocaleLowerCase()));
  return match?.id ?? null;
}

export function sessionKindLabel(kind: SessionKind): string {
  return SESSION_KIND_LABELS[kind][0];
}

export interface SessionMoment {
  /** نام روز هفته به فارسی، مثل «دوشنبه». */
  weekday: string;
  /** تاریخ شمسی، مثل «۱۹ مهر ۱۴۰۵». */
  jalali: string;
  /** تاریخ میلادی، مثل «11 Oct 2026». */
  gregorian: string;
  /** ساعت ۲۴ساعته، مثل «۱۴:۳۰». */
  time: string;
}

const weekdayFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' });
const jalaliFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' });
const gregorianFormatter = new Intl.DateTimeFormat('en-GB-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function describeSessionMoment(timestamp: number): SessionMoment | null {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return {
    weekday: weekdayFormatter.format(date),
    jalali: jalaliFormatter.format(date),
    gregorian: gregorianFormatter.format(date),
    time: timeFormatter.format(date),
  };
}

/** «دوشنبه ۱۹ مهر ۱۴۰۵ — 11 Oct 2026 — ۱۴:۳۰» */
export function formatDualDateTime(timestamp: number): string {
  const moment = describeSessionMoment(timestamp);
  if (!moment) return '—';
  return `${moment.weekday} ${moment.jalali} — ${moment.gregorian} — ${moment.time}`;
}

/** کلید روزِ محلی (YYYY-MM-DD) برای گروه‌بندی سشن‌ها و معاملات هر روز. */
export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const jalaliShortFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' });
const gregorianShortFormatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory', { year: 'numeric', month: '2-digit', day: '2-digit' });

/** نمایش فشرده برای جدول‌ها: «۱۴۰۵/۰۷/۱۹ ۱۴:۳۰» و در خط بعد «2026-10-11». */
export function formatCompactMoment(timestamp: number | null | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return '—';
  const date = new Date(timestamp);
  return `${jalaliShortFormatter.format(date)} ${timeFormatter.format(date)}\n${gregorianShortFormatter.format(date)}`;
}
