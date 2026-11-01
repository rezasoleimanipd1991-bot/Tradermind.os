import type { JournalTriggerEvent } from '../db/database';

/** همهٔ تحلیل‌های مرتبط با تریگر؛ داده‌های قدیمی فقط analysisEventId تکی دارند. */
export function triggerAnalysisIds(trigger: Pick<JournalTriggerEvent, 'analysisEventId' | 'analysisEventIds'>): string[] {
  const ids = trigger.analysisEventIds && trigger.analysisEventIds.length
    ? trigger.analysisEventIds
    : trigger.analysisEventId ? [trigger.analysisEventId] : [];
  return [...new Set(ids)];
}
