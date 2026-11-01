import { kvStore } from './storageService';

/**
 * پیش‌فرض‌های فرم «شروع سشن تازه».
 * هر مورد فقط وقتی ذخیره می‌شود که کاربر آن را «سنجاق» کرده باشد؛ سشن بعدی با
 * همان مقدار پر می‌شود تا هر بار از اول انتخاب نشود.
 */
export interface JournalSessionDefaults {
  accountId: string;
  tradingBoxId: string;
  strategyId: string;
  symbol: string;
}

export type JournalSessionDefaultKey = keyof JournalSessionDefaults;

export const JOURNAL_SESSION_DEFAULTS_STORAGE_KEY = 'tradermind-journal-session-defaults';
const STORAGE_KEY = JOURNAL_SESSION_DEFAULTS_STORAGE_KEY.slice('tradermind-'.length);
const KEYS: readonly JournalSessionDefaultKey[] = ['accountId', 'tradingBoxId', 'strategyId', 'symbol'];

export function getJournalSessionDefaults(): Partial<JournalSessionDefaults> {
  const saved = kvStore.get<Partial<Record<JournalSessionDefaultKey, unknown>>>(STORAGE_KEY);
  if (!saved || typeof saved !== 'object') return {};
  const result: Partial<JournalSessionDefaults> = {};
  for (const key of KEYS) {
    const value = saved[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, 120);
  }
  return result;
}

/** مقدار پیش‌فرض را ذخیره می‌کند؛ با مقدار خالی یا null، پیش‌فرض آن مورد برداشته می‌شود. */
export function setJournalSessionDefault(key: JournalSessionDefaultKey, value: string | null | undefined): void {
  const current = getJournalSessionDefaults();
  const trimmed = value?.trim();
  if (trimmed) current[key] = key === 'symbol' ? trimmed.toUpperCase() : trimmed;
  else delete current[key];
  kvStore.set(STORAGE_KEY, current);
}
