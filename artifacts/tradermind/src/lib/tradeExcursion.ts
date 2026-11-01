import { defaultLiveMonitoring } from '../types/liveTrade';

/**
 * MFE/MAE دستی: کاربر بالاترین و پایین‌ترین قیمتی را که در طول معامله دیده وارد
 * می‌کند و برنامه آن را بر حسب R (نسبت به فاصلهٔ ورود تا حد ضرر) حساب می‌کند.
 * MFE همیشه ≥ ۰ و MAE همیشه ≤ ۰ است؛ همان قراردادی که مانیتورینگ زنده و
 * تب MAE/MFE در تحلیل لبه استفاده می‌کنند.
 */
export interface ExcursionInput {
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  highPrice: number | null;
  lowPrice: number | null;
}

export interface ExcursionResult {
  risk: number;
  mfeR: number | null;
  maeR: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** عدد را از ورودی متنی (با ارقام فارسی/عربی و جداکنندهٔ اعشاری فارسی) می‌خواند. */
export function parsePriceInput(text: string): number | null {
  const normalized = text
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٫,،]/g, '.')
    .replace(/\s+/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function computeExcursion(input: ExcursionInput): ExcursionResult | null {
  const risk = Math.abs(input.entryPrice - input.stopLoss);
  if (!Number.isFinite(risk) || risk === 0) return null;
  const { direction, entryPrice, highPrice, lowPrice } = input;
  let mfeR: number | null = null;
  let maeR: number | null = null;
  if (direction === 'long') {
    if (highPrice != null) mfeR = Math.max(0, (highPrice - entryPrice) / risk);
    if (lowPrice != null) maeR = Math.min(0, (lowPrice - entryPrice) / risk);
  } else {
    if (lowPrice != null) mfeR = Math.max(0, (entryPrice - lowPrice) / risk);
    if (highPrice != null) maeR = Math.min(0, (entryPrice - highPrice) / risk);
  }
  return { risk, mfeR: mfeR == null ? null : round2(mfeR), maeR: maeR == null ? null : round2(maeR) };
}

function parseObject(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** قیمت‌های دستیِ ثبت‌شده قبلی (اگر باشند). */
export function readManualExcursion(liveMonitoring: string | null | undefined): { highPrice: number | null; lowPrice: number | null } {
  const manual = parseObject(liveMonitoring)?.manualExcursion;
  const record = manual && typeof manual === 'object' ? manual as Record<string, unknown> : {};
  const pick = (key: string) => (typeof record[key] === 'number' && Number.isFinite(record[key] as number) ? record[key] as number : null);
  return { highPrice: pick('highPrice'), lowPrice: pick('lowPrice') };
}

/**
 * مقدار MFE/MAE را در liveMonitoring معامله ادغام می‌کند و بقیهٔ داده‌های
 * مانیتورینگ را دست‌نخورده می‌گذارد. با values = null مقدار دستی پاک می‌شود.
 */
export function mergeManualExcursion(
  liveMonitoring: string | null | undefined,
  values: { highPrice: number | null; lowPrice: number | null; mfeR: number | null; maeR: number | null } | null,
  now = Date.now(),
): string {
  const base = parseObject(liveMonitoring) ?? { ...defaultLiveMonitoring({ state: 'closed' }) };
  const next: Record<string, unknown> = { ...base, lastUpdatedAt: now };
  if (!values) {
    delete next.manualExcursion;
    next.maxFavorableExcursion = null;
    next.maxAdverseExcursion = null;
    return JSON.stringify(next);
  }
  next.maxFavorableExcursion = values.mfeR;
  next.maxAdverseExcursion = values.maeR;
  next.manualExcursion = { highPrice: values.highPrice, lowPrice: values.lowPrice, updatedAt: now };
  return JSON.stringify(next);
}

/** جمله‌های توصیفی دربارهٔ رابطهٔ اوج سود و نتیجهٔ نهایی؛ فقط واقعیت‌ها، نه توصیه. */
export function describeExcursion(result: ExcursionResult, finalR: number | null): string[] {
  const lines: string[] = [];
  const { mfeR, maeR } = result;
  if (mfeR != null && finalR != null) {
    if (finalR > 0 && mfeR - finalR >= 0.5) lines.push(`قیمت تا ${mfeR.toFixed(2)}R به نفع تو رفت و معامله با ${finalR.toFixed(2)}R بسته شد؛ ${(mfeR - finalR).toFixed(2)}R از اوج سود برنگشت.`);
    if (finalR <= 0 && mfeR >= 1) lines.push(`معامله زمانی تا ${mfeR.toFixed(2)}R در سود بود و با ${finalR.toFixed(2)}R بسته شد.`);
  }
  if (maeR != null && finalR != null && finalR > 0 && maeR <= -0.7) {
    lines.push(`قبل از سود، معامله تا ${maeR.toFixed(2)}R علیه تو رفت؛ یعنی به حد ضرر نزدیک شد.`);
  }
  return lines;
}
