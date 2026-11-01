/**
 * طبقه‌بندی «نتیجهٔ سناریو». گزینه‌ها در «پیکربندی ژورنال» قابل ویرایش‌اند؛ پس
 * طبقه‌بندی از روی عنوان گزینه انجام می‌شود و عنوان ناشناخته «نامشخص» حساب می‌شود.
 */
export type ScenarioOutcomeKind = 'hit' | 'partial' | 'invalidated' | 'not_triggered' | 'unknown';

export function classifyScenarioOutcome(label: string | null | undefined): ScenarioOutcomeKind {
  const text = (label ?? '').trim().toLocaleLowerCase();
  if (!text) return 'unknown';
  if (text.includes('تا حدی') || text.includes('partial')) return 'partial';
  if (text.includes('باطل') || text.includes('invalid')) return 'invalidated';
  if (text.includes('فعال‌نشده') || text.includes('فعال نشده') || text.includes('not triggered')) return 'not_triggered';
  if (text.includes('مطابق') || text.includes('hit') || text.includes('محقق')) return 'hit';
  return 'unknown';
}

export const SCENARIO_OUTCOME_TONE: Record<ScenarioOutcomeKind, string> = {
  hit: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  partial: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  invalidated: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  not_triggered: 'border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  unknown: 'border-border bg-muted/40 text-muted-foreground',
};

export interface ScenarioAccuracyCounts {
  hit: number;
  partial: number;
  invalidated: number;
  notTriggered: number;
}

/** دقت = (مطابق + نصفِ تا حدی مطابق) ÷ همهٔ نتایج ثبت‌شده؛ null اگر نتیجه‌ای ثبت نشده باشد. */
export function scenarioAccuracy(counts: ScenarioAccuracyCounts): number | null {
  const total = counts.hit + counts.partial + counts.invalidated + counts.notTriggered;
  if (total === 0) return null;
  return ((counts.hit + counts.partial * 0.5) / total) * 100;
}
