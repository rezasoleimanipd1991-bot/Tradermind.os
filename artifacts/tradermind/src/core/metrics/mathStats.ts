/**
 * mathStats.ts — ریاضیات آماری پایه (تنها پیاده‌سازی مجاز؛ بدون وابستگی به بقیه‌ی برنامه)
 * tradeHelpers (avg/median/stdDev) و engine.ts هر دو از همین‌جا می‌گیرند.
 */
export function mean(a: number[]): number | null {
  const values = a.filter(Number.isFinite);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export function median(a: number[]): number | null {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** انحراف معیار نمونه‌ای (n−1)؛ null اگر کمتر از ۲ داده باشد. */
export function stdDev(a: number[]): number | null {
  const values = a.filter(Number.isFinite);
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}
