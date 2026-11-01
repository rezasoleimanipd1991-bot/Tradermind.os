import { kvStore } from './storageService';

/**
 * عنوان پیش‌فرض فیلدهای «رویداد تحلیل» سشن.
 *
 * کلیدها نام فیلد در دیتابیس هستند. فیلدهای قدیمیِ جهت بازار، ساختار بازار و
 * زمینهٔ نقدینگی دیگر در فرم نمایش داده نمی‌شوند ولی برای نمایش سوابق قبلی
 * در این فهرست مانده‌اند.
 */
export const JOURNAL_ANALYSIS_FIELD_LABELS = {
  analysisText: 'مبدأ حرکت',
  marketContext: 'دلیل حرکت قیمت',
  momentumText: 'اندازه مومنتوم بازار',
  pricePositionText: 'موقعیت فعلی قیمت',
  directionLogicText: 'منطق جهت',
  directionOptionId: 'جهت بازار',
  marketStructureOptionId: 'ساختار بازار',
  expectedDirectionOptionId: 'جهت مورد انتظار',
  liquidityContextOptionIds: 'زمینهٔ نقدینگی',
  scenario: 'سناریوهای معاملاتی',
  triggerContext: 'شرایط فعال یا ابطال سناریو',
  zones: 'نواحی پیش رو',
  notes: 'یادداشت تحلیل',
  previousTradeId: 'معاملهٔ قبلی مرتبط',
  nextTradeId: 'معاملهٔ بعدی مرتبط',
  tags: 'برچسب‌های تحلیل',
} as const;

export type JournalAnalysisFieldKey = keyof typeof JOURNAL_ANALYSIS_FIELD_LABELS;
export type JournalAnalysisFieldLabels = Record<JournalAnalysisFieldKey, string>;

/**
 * عنوان‌های پیش‌فرضِ نسخه‌های قبلی. اگر کاربر پیش‌تر دکمهٔ «ذخیرهٔ عنوان‌ها» را
 * زده باشد، همین مقادیر در حافظه ثبت شده‌اند؛ آن‌ها را شخصی‌سازی نمی‌دانیم تا
 * عنوان‌های جدید جایگزین شوند.
 */
const LEGACY_DEFAULT_LABELS: Partial<Record<JournalAnalysisFieldKey, string>> = {
  analysisText: 'تحلیل بازار',
  marketContext: 'زمینهٔ بازار',
  scenario: 'سناریوی مورد انتظار',
  triggerContext: 'شرط فعال‌شدن یا لغو',
  zones: 'مناطق قیمت و سطوح',
};

export const JOURNAL_ANALYSIS_FIELD_LABELS_STORAGE_KEY = 'tradermind-journal-analysis-field-labels';
const STORAGE_KEY = JOURNAL_ANALYSIS_FIELD_LABELS_STORAGE_KEY.slice('tradermind-'.length);

export function getJournalAnalysisFieldLabels(): JournalAnalysisFieldLabels {
  const saved = kvStore.get<Partial<JournalAnalysisFieldLabels>>(STORAGE_KEY) ?? {};
  return Object.fromEntries(
    Object.entries(JOURNAL_ANALYSIS_FIELD_LABELS).map(([key, defaultLabel]) => {
      const typedKey = key as JournalAnalysisFieldKey;
      const value = saved[typedKey];
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (!trimmed || trimmed === LEGACY_DEFAULT_LABELS[typedKey]) return [key, defaultLabel];
      return [key, trimmed.slice(0, 100)];
    }),
  ) as JournalAnalysisFieldLabels;
}

export function saveJournalAnalysisFieldLabels(labels: JournalAnalysisFieldLabels): void {
  const normalized = Object.fromEntries(
    Object.entries(JOURNAL_ANALYSIS_FIELD_LABELS).map(([key, defaultLabel]) => {
      const value = labels[key as JournalAnalysisFieldKey]?.trim();
      return [key, value ? value.slice(0, 100) : defaultLabel];
    }),
  ) as JournalAnalysisFieldLabels;
  kvStore.set(STORAGE_KEY, normalized);
}

// ─────────────────────────────────────────────────────────────
// چیدمان فیلدها: نوع (کادر متنی / چک‌باکس) و اندازهٔ کادر
// ─────────────────────────────────────────────────────────────

/** فیلدهایی که کاربر می‌تواند نوع و اندازهٔ آن‌ها را عوض کند. */
export const ANALYSIS_FLEXIBLE_FIELD_KEYS = [
  'analysisText',
  'marketContext',
  'momentumText',
  'pricePositionText',
  'directionLogicText',
  'scenario',
  'triggerContext',
  'zones',
] as const;

export type AnalysisFlexibleFieldKey = typeof ANALYSIS_FLEXIBLE_FIELD_KEYS[number];
export type AnalysisFieldKind = 'text' | 'checkbox';

export interface AnalysisFieldLayout {
  kind: AnalysisFieldKind;
  /** تعداد خط‌های اولیهٔ کادر متنی؛ کاربر بعداً با کشیدن گوشهٔ کادر هم می‌تواند تغییرش دهد. */
  rows: number;
  /** دستهٔ گزینه‌ها برای حالت چک‌باکس (از «پیکربندی ژورنال»). */
  optionCategory: string;
}

export type AnalysisFieldLayouts = Record<AnalysisFlexibleFieldKey, AnalysisFieldLayout>;

export const MIN_ANALYSIS_FIELD_ROWS = 2;
export const MAX_ANALYSIS_FIELD_ROWS = 30;
export const FORWARD_ZONE_OPTION_CATEGORY = 'forward_zone';

export const DEFAULT_ANALYSIS_FIELD_LAYOUTS: AnalysisFieldLayouts = {
  analysisText: { kind: 'text', rows: 6, optionCategory: 'liquidity_type' },
  marketContext: { kind: 'text', rows: 5, optionCategory: 'liquidity_type' },
  momentumText: { kind: 'text', rows: 3, optionCategory: 'liquidity_type' },
  pricePositionText: { kind: 'text', rows: 5, optionCategory: 'liquidity_type' },
  directionLogicText: { kind: 'text', rows: 5, optionCategory: 'liquidity_type' },
  scenario: { kind: 'text', rows: 5, optionCategory: 'liquidity_type' },
  triggerContext: { kind: 'text', rows: 5, optionCategory: 'liquidity_type' },
  zones: { kind: 'checkbox', rows: 3, optionCategory: FORWARD_ZONE_OPTION_CATEGORY },
};

export const JOURNAL_ANALYSIS_FIELD_LAYOUT_STORAGE_KEY = 'tradermind-journal-analysis-field-layout';
const LAYOUT_STORAGE_KEY = JOURNAL_ANALYSIS_FIELD_LAYOUT_STORAGE_KEY.slice('tradermind-'.length);

export function clampAnalysisFieldRows(value: unknown, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_ANALYSIS_FIELD_ROWS, Math.min(MAX_ANALYSIS_FIELD_ROWS, parsed));
}

function normalizeLayout(raw: unknown, fallback: AnalysisFieldLayout): AnalysisFieldLayout {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<AnalysisFieldLayout>;
  const category = typeof candidate.optionCategory === 'string' && candidate.optionCategory.trim()
    ? candidate.optionCategory.trim().slice(0, 60)
    : fallback.optionCategory;
  return {
    kind: candidate.kind === 'checkbox' || candidate.kind === 'text' ? candidate.kind : fallback.kind,
    rows: clampAnalysisFieldRows(candidate.rows, fallback.rows),
    optionCategory: category,
  };
}

export function getJournalAnalysisFieldLayouts(): AnalysisFieldLayouts {
  const saved = kvStore.get<Partial<Record<AnalysisFlexibleFieldKey, unknown>>>(LAYOUT_STORAGE_KEY) ?? {};
  return Object.fromEntries(
    ANALYSIS_FLEXIBLE_FIELD_KEYS.map(key => [key, normalizeLayout(saved[key], DEFAULT_ANALYSIS_FIELD_LAYOUTS[key])]),
  ) as AnalysisFieldLayouts;
}

export function saveJournalAnalysisFieldLayouts(layouts: AnalysisFieldLayouts): void {
  const normalized = Object.fromEntries(
    ANALYSIS_FLEXIBLE_FIELD_KEYS.map(key => [key, normalizeLayout(layouts[key], DEFAULT_ANALYSIS_FIELD_LAYOUTS[key])]),
  ) as AnalysisFieldLayouts;
  kvStore.set(LAYOUT_STORAGE_KEY, normalized);
}

// ─────────────────────────────────────────────────────────────
// انتخاب‌های چک‌باکسی هر فیلد (ذخیره‌شده به‌صورت JSON در رویداد تحلیل)
// ─────────────────────────────────────────────────────────────

export type AnalysisFieldSelections = Partial<Record<AnalysisFlexibleFieldKey, string[]>>;

export function parseAnalysisFieldSelections(value: string | null | undefined): AnalysisFieldSelections {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: AnalysisFieldSelections = {};
    for (const key of ANALYSIS_FLEXIBLE_FIELD_KEYS) {
      const entry = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(entry)) result[key] = entry.filter((item): item is string => typeof item === 'string');
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeAnalysisFieldSelections(selections: AnalysisFieldSelections): string {
  const clean: AnalysisFieldSelections = {};
  for (const key of ANALYSIS_FLEXIBLE_FIELD_KEYS) {
    const entry = selections[key];
    if (entry && entry.length) clean[key] = [...new Set(entry)];
  }
  return JSON.stringify(clean);
}

// ─────────────────────────────────────────────────────────────
// فیلدهای حذف‌شده از فرم تحلیل (داده‌های قبلی و گزارش‌ها دست‌نخورده می‌مانند)
// ─────────────────────────────────────────────────────────────

/** فیلدهایی که کاربر می‌تواند از فرم رویداد تحلیل حذف کند. */
export const HIDEABLE_ANALYSIS_FIELD_KEYS = [
  ...ANALYSIS_FLEXIBLE_FIELD_KEYS,
  'expectedDirectionOptionId', 'notes', 'previousTradeId', 'nextTradeId', 'tags',
] as const satisfies readonly JournalAnalysisFieldKey[];

export const JOURNAL_ANALYSIS_HIDDEN_FIELDS_STORAGE_KEY = 'tradermind-journal-analysis-hidden-fields';
const HIDDEN_STORAGE_KEY = JOURNAL_ANALYSIS_HIDDEN_FIELDS_STORAGE_KEY.slice('tradermind-'.length);

export function getHiddenAnalysisFields(): JournalAnalysisFieldKey[] {
  const saved = kvStore.get<unknown>(HIDDEN_STORAGE_KEY);
  if (!Array.isArray(saved)) return [];
  const allowed = new Set<string>(HIDEABLE_ANALYSIS_FIELD_KEYS);
  return saved.filter((item): item is JournalAnalysisFieldKey => typeof item === 'string' && allowed.has(item));
}

export function saveHiddenAnalysisFields(keys: readonly JournalAnalysisFieldKey[]): void {
  const allowed = new Set<string>(HIDEABLE_ANALYSIS_FIELD_KEYS);
  kvStore.set(HIDDEN_STORAGE_KEY, [...new Set(keys)].filter(key => allowed.has(key)));
}

// ─────────────────────────────────────────────────────────────
// تنظیمات فیلدها به‌صورت یک بستهٔ واحد برای همگام‌سازی بین دستگاه‌ها
// ─────────────────────────────────────────────────────────────

export function exportAnalysisFieldConfig(): string {
  return JSON.stringify({
    labels: getJournalAnalysisFieldLabels(),
    layouts: getJournalAnalysisFieldLayouts(),
    hidden: getHiddenAnalysisFields(),
  });
}

export function importAnalysisFieldConfig(json: string): void {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return;
    const config = parsed as { labels?: Partial<JournalAnalysisFieldLabels>; layouts?: Partial<AnalysisFieldLayouts>; hidden?: JournalAnalysisFieldKey[] };
    if (config.labels && typeof config.labels === 'object') saveJournalAnalysisFieldLabels({ ...getJournalAnalysisFieldLabels(), ...config.labels });
    if (config.layouts && typeof config.layouts === 'object') saveJournalAnalysisFieldLayouts({ ...getJournalAnalysisFieldLayouts(), ...config.layouts });
    if (Array.isArray(config.hidden)) saveHiddenAnalysisFields(config.hidden);
  } catch {
    // بستهٔ خراب نادیده گرفته می‌شود
  }
}
