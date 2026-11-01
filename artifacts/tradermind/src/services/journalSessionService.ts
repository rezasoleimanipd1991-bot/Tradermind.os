import { runAsRemote } from '../db/syncSupport';
import { stableOptionId } from '../db/defaultIds';
import { kvStore } from './storageService';
import { exportAnalysisFieldConfig, importAnalysisFieldConfig } from './journalAnalysisFieldLabels';
import {
  db,
  type Account,
  type JournalMedia,
  type JournalOption,
  type JournalSession,
  type JournalSessionAnalysis,
  type JournalSessionEvent,
  type JournalTradeData,
  type JournalTriggerEvent,
  type Strategy,
  type StrategyVersion,
  type Trade,
} from '../db/database';
import { isClosed } from '../lib/tradeHelpers';
import { isTradingBoxAvailableForAccount } from './tradingBoxService';
import { triggerAnalysisIds } from '../lib/triggerAnalysis';
import { computeMetrics, getR, toPercent } from '../core/metrics/engine';

export const JOURNAL_OPTION_CATEGORIES = [
  { id: 'timeframe', label: 'بازهٔ زمانی' },
  { id: 'entry_trigger', label: 'محرک ورود' },
  { id: 'exit_reason', label: 'دلیل خروج' },
  { id: 'entry_reason', label: 'دلیل ورود' },
  { id: 'psychology', label: 'حالت روانی' },
  { id: 'emotion', label: 'احساسات' },
  { id: 'strategy_rule', label: 'قانون استراتژی' },
  { id: 'checklist', label: 'چک‌لیست ورود' },
  { id: 'setup_type', label: 'نوع ستاپ' },
  { id: 'setup_grade', label: 'درجه ستاپ' },
  { id: 'market_condition', label: 'شرایط بازار' },
  { id: 'market', label: 'بازار' },
  { id: 'scenario_outcome', label: 'نتیجهٔ سناریو' },
  { id: 'liquidity_type', label: 'نوع نقدینگی' },
  { id: 'mistake', label: 'اشتباه' },
  { id: 'tag', label: 'برچسب' },
  { id: 'obstacle', label: 'مانع' },
  { id: 'trade_management', label: 'مدیریت معامله' },
  { id: 'session_type', label: 'نوع سشن' },
  { id: 'review_category', label: 'دسته‌بندی مرور' },
  { id: 'direction', label: 'جهت بازار' },
  { id: 'market_structure', label: 'ساختار بازار' },
  { id: 'session_event_type', label: 'رویداد بدون معامله' },
  { id: 'sco_type', label: 'نوع شکست ساختار (SCO)' },
  { id: 'fvg_type', label: 'نوع شکاف ارزش منصفانه (FVG)' },
  { id: 'forward_zone', label: 'نواحی پیش رو' },
] as const;

export type JournalOptionCategory = typeof JOURNAL_OPTION_CATEGORIES[number]['id'];

/** دسته‌های ساخته‌شده توسط کاربر به‌صورت یک رکورد ویژه در همین جدول گزینه‌ها ذخیره می‌شوند تا خودکار همگام شوند. */
export const CUSTOM_CATEGORY_RECORD = '__category__';
/** دسته‌های داخلی که کاربر «حذف» کرده است (برای همگام‌سازی، به‌صورت رکورد گزینه ذخیره می‌شوند؛ عنوان = شناسهٔ دسته). */
export const HIDDEN_CATEGORY_RECORD = '__hidden_category__';
const ANALYSIS_CONFIG_RECORD = '__config__';
const ANALYSIS_CONFIG_RECORD_ID = 'cfg-analysis-fields';
/** دسته‌هایی که کل ساختار سشن و تحلیل به آن‌ها وابسته است و حذفشان برنامه را از کار می‌اندازد. */
export const PROTECTED_CATEGORY_IDS: readonly string[] = ['timeframe', 'entry_trigger', 'session_event_type'];
/** هر دسته در کدام فرم‌ها استفاده می‌شود؛ دسته‌های بدون ورودی در هیچ فرمی دیده نمی‌شوند. */
export const CATEGORY_USAGE: Record<string, string> = {
  timeframe: 'تایم‌فریم تحلیل‌ها و تریگرها در سشن (ضروری)',
  entry_trigger: 'نوع تریگر در سشن و «تریگرهای ورود» در مرور معامله (ضروری)',
  exit_reason: 'مرور معامله: دلیل خروج',
  entry_reason: 'مرور معامله: دلیل ورود',
  psychology: 'حالت روانی قبل از سشن و روانشناسی قبل/حین/بعد در مرور معامله',
  emotion: 'در هیچ فرم ژورنالی استفاده نمی‌شود',
  strategy_rule: 'در هیچ فرمی استفاده نمی‌شود',
  checklist: 'مرور معامله: چک‌لیست ورود',
  setup_type: 'مرور معامله: نوع ستاپ',
  setup_grade: 'مرور معامله: درجه ستاپ',
  market_condition: 'در هیچ فرمی استفاده نمی‌شود',
  market: 'ساخت سشن: بازار',
  scenario_outcome: 'نتیجهٔ سناریو در تحلیل سشن و مرور معامله',
  liquidity_type: 'فقط به‌عنوان گزینهٔ پیش‌فرض فیلد چک‌باکسی تحلیل',
  mistake: 'مرور معامله: اشتباه‌ها و گزارش‌ها',
  tag: 'در هیچ فرمی استفاده نمی‌شود',
  obstacle: 'در هیچ فرمی استفاده نمی‌شود',
  trade_management: 'در هیچ فرمی استفاده نمی‌شود',
  session_type: 'ساخت سشن: نوع سشن',
  review_category: 'در هیچ فرمی استفاده نمی‌شود',
  direction: 'فیلد «جهت مورد انتظار» در تحلیل',
  market_structure: 'فقط برای نمایش سوابق قدیمی',
  session_event_type: 'رویداد بدون معامله در سشن (ضروری)',
  sco_type: 'مرور معامله: نوع SCO',
  fvg_type: 'مرور معامله: نوع FVG',
  forward_zone: 'فیلد چک‌باکسی «نواحی پیش رو» در تحلیل',
};
export interface JournalCategoryInfo { id: string; label: string; custom: boolean }

const DEFAULT_OPTIONS: Record<JournalOptionCategory, string[]> = {
  timeframe: ['1M', '5M', '15M', '30M', '1H', '4H', 'روزانه', 'هفتگی'],
  entry_trigger: ['شکار نقدینگی', 'SCO', 'کندل FVG', 'بازآزمایی ناحیه', 'بلاک سفارش'],
  exit_reason: ['حد سود', 'حد ضرر', 'خروج دستی', 'تغییر ساختار', 'جمع‌آوری نقدینگی', 'وضعیت روانی', 'کاهش ریسک', 'ابطال استراتژی'],
  entry_reason: ['ستاپ استراتژی', 'شکست', 'پولبک', 'جاروب نقدینگی', 'سفارشی'],
  psychology: ['آرامش', 'ترس', 'فومو', 'معاملهٔ انتقامی', 'تردید', 'طمع', 'اعتمادبه‌نفس بیش‌ازحد', 'بی‌صبری', 'فشار روانی', 'اضطراب'],
  emotion: ['آرامش', 'اعتمادبه‌نفس', 'تمرکز', 'ترس', 'اضطراب', 'کلافگی', 'طمع', 'بی‌صبری'],
  strategy_rule: [],
  checklist: ['جهت تایم‌فریم بالاتر تأیید شد', 'نقدینگی جمع‌آوری شد', 'تریگر تأیید شد', 'مومنتوم معتبر است', 'مانع مهمی وجود ندارد', 'ریسک معتبر است'],
  setup_type: ['ادامهٔ روند', 'بازگشت روند', 'شکست', 'پولبک', 'محدوده', 'جاروب نقدینگی'],
  setup_grade: ['A+', 'A', 'B', 'C', 'نامعتبر'],
  market_condition: ['رونددار', 'محدوده‌ای', 'نوسان زیاد', 'نوسان کم', 'خبر'],
  market: ['فارکس', 'رمزارز', 'سهام', 'شاخص‌ها', 'کالاها', 'قراردادهای آتی', 'سایر'],
  scenario_outcome: ['مطابق سناریو', 'تا حدی مطابق', 'باطل‌شده', 'فعال‌نشده', 'نامشخص'],
  liquidity_type: ['سقف‌های برابر', 'کف‌های برابر', 'سقف قبلی', 'کف قبلی', 'سقف/کف سشن'],
  mistake: ['ورود زودهنگام', 'ورود دیرهنگام', 'فومو', 'معاملهٔ انتقامی', 'نادیده‌گرفتن قانون', 'نادیده‌گرفتن مانع', 'حجم بیش‌ازحد', 'جابجایی حد ضرر', 'خروج زودهنگام'],
  tag: ['ستاپ A', 'نیازمند بازبینی'],
  obstacle: ['ناحیهٔ بازآزمایی', 'بلاک سفارش', 'شکاف ارزش منصفانه', 'رویداد خبری'],
  trade_management: ['جابجایی حد ضرر', 'بستن بخشی از معامله', 'افزودن به موقعیت', 'کاهش موقعیت', 'خروج دستی'],
  session_type: ['آسیا', 'لندن', 'همپوشانی لندن و نیویورک', 'نیویورک', 'سفارشی'],
  review_category: ['اجرا', 'ریسک', 'روان‌شناسی', 'زمینهٔ بازار', 'استراتژی'],
  direction: ['صعودی', 'نزولی', 'خنثی'],
  market_structure: ['روند صعودی', 'روند نزولی', 'محدوده', 'شکست', 'بازگشت'],
  session_event_type: ['ستاپ معتبر، بدون معامله', 'معاملهٔ ازدست‌رفته', 'ستاپ نامعتبر', 'ستاپ مشاهده‌شده'],
  sco_type: [],
  fvg_type: [],
  forward_zone: ['High مینور', 'Low مینور', 'High ماژور', 'Low ماژور', 'تمام سطوح دارای نقدینگی'],
};

const LATE_ADDED_OPTION_CATEGORIES: readonly JournalOptionCategory[] = ['forward_zone'];

const DEFAULT_OPTION_TRANSLATIONS: Record<string, string> = {
  'Daily': 'روزانه',
  'Weekly': 'هفتگی',
  'Liquidity Hunt': 'شکار نقدینگی',
  'FVG Candle': 'کندل FVG',
  'Mitigation': 'بازآزمایی ناحیه',
  'Order Block': 'بلاک سفارش',
  'TP': 'حد سود',
  'SL': 'حد ضرر',
  'Manual Exit': 'خروج دستی',
  'Structure Changed': 'تغییر ساختار',
  'Liquidity Taken': 'جمع‌آوری نقدینگی',
  'Psychology': 'وضعیت روانی',
  'Risk Reduction': 'کاهش ریسک',
  'Strategy Invalidated': 'ابطال استراتژی',
  'Strategy Setup': 'ستاپ استراتژی',
  'Breakout': 'شکست',
  'Pullback': 'پولبک',
  'Liquidity Sweep': 'جاروب نقدینگی',
  'Custom': 'سفارشی',
  'Calm': 'آرامش',
  'Fear': 'ترس',
  'FOMO': 'فومو',
  'Revenge': 'معاملهٔ انتقامی',
  'Hesitation': 'تردید',
  'Greed': 'طمع',
  'Overconfidence': 'اعتمادبه‌نفس بیش‌ازحد',
  'Impatience': 'بی‌صبری',
  'Stress': 'فشار روانی',
  'Anxiety': 'اضطراب',
  'Confident': 'اعتمادبه‌نفس',
  'Focused': 'تمرکز',
  'Fearful': 'ترس',
  'Anxious': 'اضطراب',
  'Frustrated': 'کلافگی',
  'Greedy': 'طمع',
  'Impatient': 'بی‌صبری',
  'HTF Direction Confirmed': 'جهت تایم‌فریم بالاتر تأیید شد',
  'Liquidity Swept': 'نقدینگی جمع‌آوری شد',
  'Trigger Confirmed': 'تریگر تأیید شد',
  'Momentum Valid': 'مومنتوم معتبر است',
  'No Major Obstacle': 'مانع مهمی وجود ندارد',
  'Risk Valid': 'ریسک معتبر است',
  'Continuation': 'ادامهٔ روند',
  'Reversal': 'بازگشت روند',
  'Range': 'محدوده',
  'Invalid': 'نامعتبر',
  'Trending': 'رونددار',
  'Ranging': 'محدوده‌ای',
  'High Volatility': 'نوسان زیاد',
  'Low Volatility': 'نوسان کم',
  'News': 'خبر',
  'Forex': 'فارکس',
  'Crypto': 'رمزارز',
  'Stocks': 'سهام',
  'Indices': 'شاخص‌ها',
  'Commodities': 'کالاها',
  'Futures': 'قراردادهای آتی',
  'Other': 'سایر',
  'Matched': 'مطابق سناریو',
  'Partially Matched': 'تا حدی مطابق',
  'Invalidated': 'باطل‌شده',
  'Not Triggered': 'فعال‌نشده',
  'Unclear': 'نامشخص',
  'Equal Highs': 'سقف‌های برابر',
  'Equal Lows': 'کف‌های برابر',
  'Previous High': 'سقف قبلی',
  'Previous Low': 'کف قبلی',
  'Session High/Low': 'سقف/کف سشن',
  'Early Entry': 'ورود زودهنگام',
  'Late Entry': 'ورود دیرهنگام',
  'Revenge Trade': 'معاملهٔ انتقامی',
  'Ignored Rule': 'نادیده‌گرفتن قانون',
  'Ignored Obstacle': 'نادیده‌گرفتن مانع',
  'Oversized Position': 'حجم بیش‌ازحد',
  'Moved SL': 'جابجایی حد ضرر',
  'Closed Early': 'خروج زودهنگام',
  'A Setup': 'ستاپ A',
  'Needs Review': 'نیازمند بازبینی',
  'Mitigation Wall': 'ناحیهٔ بازآزمایی',
  'Fair Value Gap': 'شکاف ارزش منصفانه',
  'News Event': 'رویداد خبری',
  'Moved Stop Loss': 'جابجایی حد ضرر',
  'Partial Close': 'بستن بخشی از معامله',
  'Added to Position': 'افزودن به موقعیت',
  'Reduced Position': 'کاهش موقعیت',
  'Asia': 'آسیا',
  'London': 'لندن',
  'London/New York Overlap': 'همپوشانی لندن و نیویورک',
  'New York': 'نیویورک',
  'Execution': 'اجرا',
  'Risk': 'ریسک',
  'Market Context': 'زمینهٔ بازار',
  'Strategy': 'استراتژی',
  'Bullish': 'صعودی',
  'Bearish': 'نزولی',
  'Neutral': 'خنثی',
  'Uptrend': 'روند صعودی',
  'Downtrend': 'روند نزولی',
  'Valid Setup — No Trade': 'ستاپ معتبر، بدون معامله',
  'Missed Trade': 'معاملهٔ ازدست‌رفته',
  'Invalid Setup': 'ستاپ نامعتبر',
  'Observed Setup': 'ستاپ مشاهده‌شده',
};

export function localizeJournalOptionLabel(_category: string, label: string): string {
  return DEFAULT_OPTION_TRANSLATIONS[label] ?? label;
}

export interface CreateJournalSessionInput {
  accountId: string;
  tradingBoxId: string;
  strategyId: string;
  symbols: string[];
  marketOptionId?: string | null;
  startTime: number;
  sessionTypeOptionId?: string | null;
  notes?: string;
  tags?: string[];
  preTradePsychologyOptionIds?: string[];
}

export interface JournalSessionBundle {
  session: JournalSession;
  account?: Account;
  strategy?: Strategy;
  strategyVersion?: StrategyVersion;
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  trades: Trade[];
  tradeData: JournalTradeData[];
  events: JournalSessionEvent[];
  media: JournalMedia[];
  options: JournalOption[];
}

export type JournalSessionTimelineItem =
  | { id: string; kind: 'analysis'; timestamp: number; record: JournalSessionAnalysis }
  | { id: string; kind: 'trigger'; timestamp: number; record: JournalTriggerEvent }
  | { id: string; kind: 'trade'; timestamp: number; record: Trade }
  | { id: string; kind: 'event'; timestamp: number; record: JournalSessionEvent };

export interface JournalSessionMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  totalR: number;
  averageR: number | null;
  bestTradeId: string | null;
  worstTradeId: string | null;
}

export interface JournalAnalyticsFilters {
  accountId?: string;
  tradingBoxId?: string;
  strategyId?: string;
  strategyVersionId?: string;
  symbol?: string;
  from?: number;
  to?: number;
  sessionId?: string;
  timeframeOptionId?: string;
  entryTriggerOptionId?: string;
  exitReasonOptionId?: string;
  psychologyOptionId?: string;
  mistakeOptionId?: string;
  setupGradeOptionId?: string;
  scoTypeOptionId?: string;
  fvgTypeOptionId?: string;
  minSetupQuality?: number;
  maxSetupQuality?: number;
  minExecutionQuality?: number;
  maxExecutionQuality?: number;
  strategyCompliance?: JournalTradeData['strategyCompliance'];
}

function uid(): string {
  return crypto.randomUUID();
}

function parseArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function psychologyHasOption(value: string | undefined, optionId: string): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.includes(optionId);
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).some(phase =>
        phase && typeof phase === 'object'
        && Array.isArray((phase as { optionIds?: unknown }).optionIds)
        && ((phase as { optionIds: string[] }).optionIds).includes(optionId),
      );
    }
    return false;
  } catch {
    return false;
  }
}

/** گزینه‌ی پیش‌فرض: شناسه‌ی قطعی + updatedAt صفر تا هیچ‌وقت نسخه‌ی ویرایش‌شده را بازنویسی نکند */
function seedOption(category: string, label: string, sortOrder: number, now: number): JournalOption {
  return { ...optionRecord(category, label, sortOrder, now), id: stableOptionId(category, label), updatedAt: 0 } as JournalOption;
}

function optionRecord(
  category: string,
  label: string,
  sortOrder: number,
  now: number,
  required = false,
): JournalOption {
  return {
    id: uid(),
    category,
    label,
    description: '',
    enabled: true,
    required,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

function tradeDirectionFromOption(option: JournalOption | undefined | null): Trade['direction'] | null {
  if (!option || option.category !== 'direction') return null;
  const label = localizeJournalOptionLabel(option.category, option.label).trim().toLocaleLowerCase();
  if (['صعودی', 'خرید', 'long', 'buy', 'bullish', 'up'].includes(label)) return 'long';
  if (['نزولی', 'فروش', 'short', 'sell', 'bearish', 'down'].includes(label)) return 'short';
  return null;
}

function blankJournalTradeData(tradeId: string, journalSessionId: string, now: number): JournalTradeData {
  const emptyPhase = { optionIds: [] as string[], intensity: 0 };
  return {
    id: tradeId,
    tradeId,
    journalSessionId,
    entryTriggerOptionIds: '[]',
    entryReasonOptionId: null,
    exitReasonOptionId: null,
    setupTypeOptionId: null,
    setupGradeOptionId: null,
    scoTypeOptionId: null,
    fvgTypeOptionId: null,
    scenarioOutcomeOptionId: null,
    checklistResults: '{}',
    psychology: JSON.stringify({ before: emptyPhase, during: emptyPhase, after: emptyPhase }),
    mistakeOptionIds: '[]',
    strategyCompliance: null,
    violatedRuleIds: '[]',
    setupQuality: null,
    executionQuality: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function createVersionSnapshot(strategyId: string): Promise<StrategyVersion> {
  const strategy = await db.strategies.get(strategyId);
  if (!strategy) throw new Error('استراتژی انتخاب‌شده پیدا نشد.');

  const phases = await db.phases.where('strategyId').equals(strategyId).sortBy('order');
  const phaseIds = phases.map(phase => phase.id);
  const steps = phaseIds.length
    ? await db.steps.where('phaseId').anyOf(phaseIds).toArray()
    : [];
  const phaseOrder = new Map(phases.map(phase => [phase.id, phase.order]));
  steps.sort((a, b) => (phaseOrder.get(a.phaseId) ?? 0) - (phaseOrder.get(b.phaseId) ?? 0) || a.order - b.order);
  const stepIds = steps.map(step => step.id);
  const rules = stepIds.length
    ? await db.rules.where('stepId').anyOf(stepIds).toArray()
    : [];
  const stepOrder = new Map(steps.map(step => [step.id, step.order]));
  rules.sort((a, b) => stepIds.indexOf(a.stepId) - stepIds.indexOf(b.stepId) || a.order - b.order || stepOrder.get(a.stepId)! - stepOrder.get(b.stepId)!);
  const priorVersions = await db.strategyVersions.where('strategyId').equals(strategyId).count();
  const now = Date.now();

  return {
    id: uid(),
    strategyId,
    versionNumber: `1.${priorVersions}`,
    strategyName: strategy.name,
    description: strategy.description,
    rulesSnapshot: JSON.stringify({ phases, steps, rules }),
    createdAt: now,
  };
}

export { triggerAnalysisIds };

async function assertAnalysesBelongToSession(analysisIds: string[], sessionId: string): Promise<void> {
  for (const analysisId of analysisIds) {
    const analysis = await db.journalSessionAnalyses.get(analysisId);
    if (!analysis || analysis.sessionId !== sessionId) throw new Error('تحلیل انتخاب‌شده به این سشن تعلق ندارد.');
  }
}

export const journalSessionService = {
  async ensureDefaultOptions(): Promise<void> {
    await db.transaction('rw', db.journalOptions, async () => {
      const now = Date.now();
      if (!(await db.journalOptions.count())) {
        const records = Object.entries(DEFAULT_OPTIONS).flatMap(([category, labels]) =>
          labels.map((label, index) => seedOption(category, label, index, now)),
        );
        if (records.length) await runAsRemote(() => db.journalOptions.bulkAdd(records));
        return;
      }
      // دسته‌هایی که بعد از ساخت دیتابیس به برنامه اضافه شده‌اند (مثل «نواحی پیش رو»)
      // برای کاربران قدیمی هم یک‌بار با گزینه‌های پیش‌فرض ساخته می‌شوند.
      for (const category of LATE_ADDED_OPTION_CATEGORIES) {
        if (kvStore.get<boolean>(`late-seeded-${category}`)) continue;
        if (await db.journalOptions.where('category').equals(category).count()) { kvStore.set(`late-seeded-${category}`, true); continue; }
        kvStore.set(`late-seeded-${category}`, true);
        const labels = DEFAULT_OPTIONS[category];
        if (labels.length) await runAsRemote(() => db.journalOptions.bulkAdd(labels.map((label, index) => seedOption(category, label, index, now))));
      }
    });
  },

  async getOptions(category?: string, includeDisabled = false): Promise<JournalOption[]> {
    await this.hydrateAnalysisFieldConfig();
    const records = category
      ? await db.journalOptions.where('category').equals(category).toArray()
      : await db.journalOptions.toArray();
    return records
      .filter(option => includeDisabled || option.enabled)
      .sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  },

  async createOption(data: Pick<JournalOption, 'category' | 'label'> & Partial<Pick<JournalOption, 'description' | 'required'>>): Promise<JournalOption> {
    const label = data.label.trim();
    if (!label) throw new Error('عنوان گزینه نمی‌تواند خالی باشد.');
    const siblings = await db.journalOptions.where('category').equals(data.category).toArray();
    if (siblings.some(item => item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error('این گزینه از قبل در همین دسته وجود دارد.');
    }
    const now = Date.now();
    const option = optionRecord(data.category, label, siblings.length ? Math.max(...siblings.map(item => item.sortOrder)) + 1 : 0, now, data.required ?? false);
    option.description = data.description?.trim() ?? '';
    await db.journalOptions.add(option);
    return option;
  },

  async updateOption(id: string, patch: Pick<JournalOption, 'label' | 'description'> & Partial<Pick<JournalOption, 'required'>>): Promise<void> {
    const label = patch.label.trim();
    if (!label) throw new Error('عنوان گزینه نمی‌تواند خالی باشد.');
    const existing = await db.journalOptions.get(id);
    if (!existing) throw new Error('گزینه پیدا نشد.');
    const siblings = await db.journalOptions.where('category').equals(existing.category).toArray();
    if (siblings.some(item => item.id !== id && item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error('این گزینه از قبل در همین دسته وجود دارد.');
    }
    await db.journalOptions.update(id, { ...patch, label, description: patch.description.trim(), updatedAt: Date.now() });
  },

  async getCustomCategories(): Promise<JournalCategoryInfo[]> {
    const records = await db.journalOptions.where('category').equals(CUSTOM_CATEGORY_RECORD).toArray();
    return records
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map(record => ({ id: record.id, label: record.label, custom: true }));
  },

  async createCategory(rawLabel: string): Promise<JournalCategoryInfo> {
    const label = rawLabel.trim();
    if (!label) throw new Error('نام دسته نمی‌تواند خالی باشد.');
    const existing = await this.getCustomCategories();
    const taken = [...JOURNAL_OPTION_CATEGORIES.map(item => item.label), ...existing.map(item => item.label)];
    if (taken.some(name => name.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) throw new Error('دسته‌ای با این نام از قبل وجود دارد.');
    const record = optionRecord(CUSTOM_CATEGORY_RECORD, label, existing.length, Date.now());
    await db.journalOptions.add(record);
    return { id: record.id, label, custom: true };
  },

  async renameCategory(id: string, rawLabel: string): Promise<void> {
    const label = rawLabel.trim();
    if (!label) throw new Error('نام دسته نمی‌تواند خالی باشد.');
    const record = await db.journalOptions.get(id);
    if (!record || record.category !== CUSTOM_CATEGORY_RECORD) throw new Error('دسته پیدا نشد.');
    const others = (await this.getCustomCategories()).filter(item => item.id !== id).map(item => item.label);
    const taken = [...JOURNAL_OPTION_CATEGORIES.map(item => item.label), ...others];
    if (taken.some(name => name.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) throw new Error('دسته‌ای با این نام از قبل وجود دارد.');
    await db.journalOptions.update(id, { label, updatedAt: Date.now() });
  },

  /** حذف یک دستهٔ شخصی همراه همهٔ گزینه‌هایش. دسته‌های داخلی برنامه حذف نمی‌شوند. */
  async deleteCategory(id: string): Promise<void> {
    const record = await db.journalOptions.get(id);
    if (!record || record.category !== CUSTOM_CATEGORY_RECORD) throw new Error('فقط دسته‌های ساخته‌شده توسط خودتان قابل حذف هستند.');
    const items = await db.journalOptions.where('category').equals(id).toArray();
    await db.transaction('rw', db.journalOptions, async () => {
      for (const item of items) await db.journalOptions.delete(item.id);
      await db.journalOptions.delete(id);
    });
  },

  /** عنوان، چیدمان و فیلدهای حذف‌شدهٔ تحلیل را در یک رکورد همگام‌شونده ذخیره می‌کند. */
  async saveAnalysisFieldConfig(): Promise<void> {
    const now = Date.now();
    await db.journalOptions.put({
      id: ANALYSIS_CONFIG_RECORD_ID, category: ANALYSIS_CONFIG_RECORD, label: 'analysis-field-config',
      description: exportAnalysisFieldConfig(), enabled: true, required: false, sortOrder: 0, createdAt: now, updatedAt: now,
    });
    kvStore.set('analysis-config-synced-at', now);
  },

  /** اگر دستگاه دیگری تنظیمات فیلدها را عوض کرده باشد، آن را روی این دستگاه اعمال می‌کند. */
  async hydrateAnalysisFieldConfig(): Promise<void> {
    const record = await db.journalOptions.get(ANALYSIS_CONFIG_RECORD_ID);
    if (!record) return;
    const syncedAt = kvStore.get<number>('analysis-config-synced-at') ?? 0;
    if (record.updatedAt <= syncedAt) return;
    importAnalysisFieldConfig(record.description);
    kvStore.set('analysis-config-synced-at', record.updatedAt);
  },

  async getHiddenCategoryIds(): Promise<string[]> {
    const records = await db.journalOptions.where('category').equals(HIDDEN_CATEGORY_RECORD).toArray();
    return [...new Set(records.map(record => record.label))];
  },

  /** حذف یک دستهٔ داخلی از فهرست و فرم‌ها. گزینه‌ها و سوابق دست‌نخورده می‌مانند و دسته قابل بازگردانی است. */
  async hideCategory(id: string): Promise<void> {
    if (PROTECTED_CATEGORY_IDS.includes(id)) throw new Error('این دسته برای کار سشن و تحلیل ضروری است و حذف نمی‌شود.');
    if (!JOURNAL_OPTION_CATEGORIES.some(category => category.id === id)) throw new Error('دسته پیدا نشد.');
    if ((await this.getHiddenCategoryIds()).includes(id)) return;
    await db.journalOptions.add(optionRecord(HIDDEN_CATEGORY_RECORD, id, 0, Date.now()));
  },

  async restoreCategory(id: string): Promise<void> {
    const records = await db.journalOptions.where('category').equals(HIDDEN_CATEGORY_RECORD).toArray();
    await db.transaction('rw', db.journalOptions, async () => {
      for (const record of records.filter(item => item.label === id)) await db.journalOptions.delete(record.id);
    });
  },

  /** حذف دائمی یک گزینه. رکوردهای قدیمی که به آن اشاره دارند، به‌جای عنوان «حذف‌شده» نشان می‌دهند. */
  async deleteOption(id: string): Promise<void> {
    const existing = await db.journalOptions.get(id);
    if (!existing) throw new Error('گزینه پیدا نشد.');
    if (LATE_ADDED_OPTION_CATEGORIES.includes(existing.category as JournalOptionCategory)) {
      kvStore.set(`late-seeded-${existing.category}`, true);
    }
    await db.journalOptions.delete(id);
  },

  /** حذف دائمی همهٔ گزینه‌های یک دسته. تعداد حذف‌شده‌ها را برمی‌گرداند. */
  async deleteCategoryOptions(category: string): Promise<number> {
    const items = await db.journalOptions.where('category').equals(category).toArray();
    if (LATE_ADDED_OPTION_CATEGORIES.includes(category as JournalOptionCategory)) kvStore.set(`late-seeded-${category}`, true);
    await db.transaction('rw', db.journalOptions, async () => {
      for (const item of items) await db.journalOptions.delete(item.id);
    });
    return items.length;
  },

  async setOptionEnabled(id: string, enabled: boolean): Promise<void> {
    if (!(await db.journalOptions.get(id))) throw new Error('گزینه پیدا نشد.');
    await db.journalOptions.update(id, { enabled, updatedAt: Date.now() });
  },

  async reorderOption(id: string, direction: -1 | 1): Promise<void> {
    const item = await db.journalOptions.get(id);
    if (!item) throw new Error('گزینه پیدا نشد.');
    const siblings = (await db.journalOptions.where('category').equals(item.category).toArray())
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex(sibling => sibling.id === id);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;
    const reordered = [...siblings];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    await db.transaction('rw', db.journalOptions, async () => {
      for (const [sortOrder, option] of reordered.entries()) {
        await db.journalOptions.update(option.id, { sortOrder, updatedAt: Date.now() });
      }
    });
  },

  async createSession(input: CreateJournalSessionInput): Promise<JournalSession> {
    const [account, box, strategy] = await Promise.all([
      db.accounts.get(input.accountId),
      db.tradingBoxes.get(input.tradingBoxId),
      db.strategies.get(input.strategyId),
    ]);
    if (!account || account.isArchived) throw new Error('حساب فعال و معتبری انتخاب نشده است.');
    if (!box || box.status !== 'active') throw new Error('باکس معاملاتی فعال و معتبری انتخاب نشده است.');
    if (!isTradingBoxAvailableForAccount(box, account)) throw new Error('این باکس برای حساب انتخاب‌شده مجاز نیست.');
    if (!strategy) throw new Error('استراتژی انتخاب‌شده پیدا نشد.');
    const symbols = [...new Set(input.symbols.map(value => value.trim().toUpperCase()).filter(Boolean))];
    if (symbols.length !== 1) throw new Error('هر سشن باید دقیقاً یک نماد داشته باشد.');
    if (input.marketOptionId) {
      const market = await db.journalOptions.get(input.marketOptionId);
      if (!market || market.category !== 'market' || !market.enabled) throw new Error('بازار معتبری انتخاب نشده است.');
    }
    const preTradePsychologyOptionIds = [...new Set(input.preTradePsychologyOptionIds ?? [])];
    for (const optionId of preTradePsychologyOptionIds) {
      const option = await db.journalOptions.get(optionId);
      if (!option || option.category !== 'psychology' || !option.enabled) throw new Error('یکی از گزینه‌های حالت روانی معتبر نیست.');
    }

    const version = await createVersionSnapshot(input.strategyId);
    const now = Date.now();
    const session: JournalSession = {
      id: uid(),
      accountId: input.accountId,
      tradingBoxId: input.tradingBoxId,
      strategyId: input.strategyId,
      strategyVersionId: version.id,
      symbols: JSON.stringify(symbols),
      marketOptionId: input.marketOptionId ?? null,
      startTime: input.startTime,
      endTime: null,
      status: 'active',
      sessionTypeOptionId: input.sessionTypeOptionId ?? null,
      notes: input.notes?.trim() ?? '',
      tags: JSON.stringify(input.tags ?? []),
      preTradePsychology: JSON.stringify(preTradePsychologyOptionIds),
      lessonsLearned: '',
      mistakesReview: '',
      psychologicalReview: '',
      strategyObservations: '',
      strategyChangeProposal: '',
      sessionQuality: null,
      finalReflection: '',
      createdAt: now,
      updatedAt: now,
    };

    await db.transaction('rw', db.strategyVersions, db.journalSessions, async () => {
      await db.strategyVersions.add(version);
      await db.journalSessions.add(session);
    });
    return session;
  },

  async getSessions(): Promise<JournalSession[]> {
    return db.journalSessions.orderBy('startTime').reverse().toArray();
  },

  async getSession(id: string): Promise<JournalSession | undefined> {
    return db.journalSessions.get(id);
  },

  async updateSession(id: string, patch: Partial<Omit<JournalSession, 'id' | 'createdAt' | 'strategyVersionId'>>): Promise<void> {
    const current = await db.journalSessions.get(id);
    if (!current) throw new Error('سشن پیدا نشد.');
    const nextStatus = patch.status ?? current.status;
    await db.journalSessions.update(id, {
      ...patch,
      endTime: nextStatus === 'active' ? null : (patch.endTime ?? current.endTime ?? Date.now()),
      updatedAt: Date.now(),
    });
  },

  async getBundle(id: string): Promise<JournalSessionBundle | undefined> {
    const session = await db.journalSessions.get(id);
    if (!session) return undefined;
    const [account, strategy, strategyVersion, analyses, triggers, trades, tradeData, events, media, options] = await Promise.all([
      db.accounts.get(session.accountId),
      db.strategies.get(session.strategyId),
      db.strategyVersions.get(session.strategyVersionId),
      db.journalSessionAnalyses.where('sessionId').equals(id).sortBy('createdAt'),
      db.journalTriggerEvents.where('sessionId').equals(id).sortBy('createdAt'),
      db.trades.where('journalSessionId').equals(id).toArray(),
      db.journalTradeData.where('journalSessionId').equals(id).toArray(),
      db.journalSessionEvents.where('sessionId').equals(id).sortBy('eventAt'),
      db.journalMedia.where('sessionId').equals(id).sortBy('createdAt'),
      this.getOptions(undefined, true),
    ]);
    return { session, account, strategy, strategyVersion, analyses, triggers, trades, tradeData, events, media, options };
  },

  async saveAnalysis(
    input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<JournalSessionAnalysis> {
    const [session, timeframe] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.timeframeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!timeframe || timeframe.category !== 'timeframe' || (!timeframe.enabled && !input.id)) {
      throw new Error('تایم‌فریم معتبر و فعالی انتخاب نشده است.');
    }
    const existing = input.id ? await db.journalSessionAnalyses.get(input.id) : undefined;
    if (input.id && (!existing || existing.sessionId !== input.sessionId)) throw new Error('رویداد تحلیل پیدا نشد.');
    for (const tradeId of [input.previousTradeId, input.nextTradeId]) {
      if (!tradeId) continue;
      const linkedTrade = await db.trades.get(tradeId);
      if (!linkedTrade || linkedTrade.journalSessionId !== input.sessionId) throw new Error('معاملهٔ پیوندشده به این سشن تعلق ندارد.');
    }
    if (input.scenarioOutcomeOptionId) {
      const outcome = await db.journalOptions.get(input.scenarioOutcomeOptionId);
      if (!outcome || outcome.category !== 'scenario_outcome') throw new Error('نتیجهٔ سناریوی انتخاب‌شده معتبر نیست.');
    }
    let now = Date.now();
    let createdAt = existing?.createdAt ?? now;
    if (!existing) {
      // ترتیب ساخت رویدادها همان ترتیب انتخاب تایم‌فریم‌هاست؛ پس زمان ساخت باید
      // حتی در یک میلی‌ثانیهٔ مشترک هم اکیداً صعودی باشد.
      const siblings = await db.journalSessionAnalyses.where('sessionId').equals(input.sessionId).toArray();
      const latest = siblings.reduce((max, item) => Math.max(max, item.createdAt), 0);
      if (latest >= now) now = latest + 1;
      createdAt = now;
    }
    const record: JournalSessionAnalysis = {
      ...input,
      id: existing?.id ?? uid(),
      createdAt,
      updatedAt: now,
      analysisText: input.analysisText ?? '',
      marketContext: input.marketContext ?? '',
      scenario: input.scenario ?? '',
      triggerContext: input.triggerContext ?? '',
      momentumText: input.momentumText ?? '',
      pricePositionText: input.pricePositionText ?? '',
      directionLogicText: input.directionLogicText ?? '',
      fieldSelections: input.fieldSelections ?? '{}',
      scenarioOutcomeOptionId: input.scenarioOutcomeOptionId ?? null,
      scenarioOutcomeNote: input.scenarioOutcomeNote ?? '',
      previousTradeId: input.previousTradeId ?? null,
      nextTradeId: input.nextTradeId ?? null,
    };
    await db.journalSessionAnalyses.put(record);
    return record;
  },

  async createAnalysisEvent(input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalSessionAnalysis> {
    return this.saveAnalysis(input);
  },

  async updateAnalysisEvent(id: string, input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalSessionAnalysis> {
    return this.saveAnalysis({ ...input, id });
  },

  async deleteAnalysisEvent(id: string): Promise<void> {
    const analysis = await db.journalSessionAnalyses.get(id);
    if (!analysis) return;
    await db.transaction('rw', db.journalSessionAnalyses, db.journalTriggerEvents, db.journalMedia, async () => {
      const sessionTriggers = await db.journalTriggerEvents.where('sessionId').equals(analysis.sessionId).toArray();
      for (const trigger of sessionTriggers) {
        const ids = triggerAnalysisIds(trigger);
        if (!ids.includes(id)) continue;
        const remaining = ids.filter(analysisId => analysisId !== id);
        await db.journalTriggerEvents.update(trigger.id, {
          analysisEventIds: remaining,
          analysisEventId: remaining[0] ?? null,
        });
      }
      await db.journalMedia.where('analysisId').equals(id).modify({ analysisId: null, category: 'session' });
      await db.journalSessionAnalyses.delete(id);
    });
  },

  async createTriggerEvent(
    input: Omit<JournalTriggerEvent, 'id' | 'createdAt' | 'updatedAt' | 'linkedTradeId' | 'status'> & {
      status?: JournalTriggerEvent['status'];
    },
  ): Promise<JournalTriggerEvent> {
    const [session, timeframe, triggerType, direction] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.timeframeOptionId),
      input.triggerTypeOptionId ? db.journalOptions.get(input.triggerTypeOptionId) : Promise.resolve(undefined),
      input.directionOptionId ? db.journalOptions.get(input.directionOptionId) : Promise.resolve(undefined),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!timeframe || timeframe.category !== 'timeframe' || !timeframe.enabled) throw new Error('تایم‌فریم معتبر و فعالی انتخاب نشده است.');
    const analysisEventIds = [...new Set([
      ...(input.analysisEventIds ?? []),
      ...(input.analysisEventId ? [input.analysisEventId] : []),
    ])];
    await assertAnalysesBelongToSession(analysisEventIds, session.id);
    if (input.triggerTypeOptionId && (!triggerType || triggerType.category !== 'entry_trigger' || !triggerType.enabled)) throw new Error('نوع تریگر معتبر نیست.');
    if (input.directionOptionId && (!direction || direction.category !== 'direction' || !direction.enabled)) throw new Error('جهت انتخاب‌شده معتبر نیست.');
    const now = Date.now();
    const event: JournalTriggerEvent = {
      ...input,
      analysisEventId: input.analysisEventId ?? analysisEventIds[0] ?? null,
      analysisEventIds,
      id: uid(),
      status: input.status ?? 'pending',
      linkedTradeId: null,
      linkedTradeDirection: null,
      linkedTradeEntryTriggerOptionId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.journalTriggerEvents.add(event);
    return event;
  },

  async updateTriggerEvent(
    id: string,
    patch: Partial<Pick<JournalTriggerEvent,
      | 'status'
      | 'confirmed'
      | 'notes'
      | 'timeframeOptionId'
      | 'analysisEventId'
      | 'analysisEventIds'
      | 'triggerTypeOptionId'
      | 'description'
      | 'marketMovement'
      | 'directionOptionId'
    >>,
  ): Promise<void> {
    const event = await db.journalTriggerEvents.get(id);
    if (!event) throw new Error('رویداد تریگر پیدا نشد.');
    if (event.linkedTradeId && patch.status && patch.status !== 'converted') {
      throw new Error('تریگرِ پیوندخورده به معامله را نمی‌توان به وضعیت دیگری تغییر داد.');
    }
    if ('timeframeOptionId' in patch) {
      const option = patch.timeframeOptionId ? await db.journalOptions.get(patch.timeframeOptionId) : undefined;
      if (!option || option.category !== 'timeframe') throw new Error('بازهٔ زمانی معتبر انتخاب نشده است.');
    }
    if ('analysisEventId' in patch && patch.analysisEventId) {
      const analysis = await db.journalSessionAnalyses.get(patch.analysisEventId);
      if (!analysis || analysis.sessionId !== event.sessionId) throw new Error('تحلیل انتخاب‌شده به این سشن تعلق ندارد.');
    }
    if ('analysisEventIds' in patch) {
      patch = { ...patch, analysisEventIds: [...new Set(patch.analysisEventIds ?? [])] };
      await assertAnalysesBelongToSession(patch.analysisEventIds ?? [], event.sessionId);
      patch.analysisEventId = patch.analysisEventIds?.[0] ?? null;
    }
    if ('triggerTypeOptionId' in patch && patch.triggerTypeOptionId) {
      const option = await db.journalOptions.get(patch.triggerTypeOptionId);
      if (!option || option.category !== 'entry_trigger') throw new Error('نوع تریگر معتبر انتخاب نشده است.');
    }
    if ('directionOptionId' in patch && patch.directionOptionId) {
      const option = await db.journalOptions.get(patch.directionOptionId);
      if (!option || option.category !== 'direction') throw new Error('جهت انتخاب‌شده معتبر نیست.');
    }
    const previousDirectionOption = event.directionOptionId
      ? await db.journalOptions.get(event.directionOptionId)
      : undefined;
    const nextDirectionOption = 'directionOptionId' in patch && patch.directionOptionId
      ? await db.journalOptions.get(patch.directionOptionId)
      : undefined;
    const now = Date.now();

    await db.transaction('rw', [db.journalTriggerEvents, db.trades, db.journalTradeData], async () => {
      const current = await db.journalTriggerEvents.get(id);
      if (!current) throw new Error('رویداد تریگر پیدا نشد.');
      if (current.linkedTradeId && patch.status && patch.status !== 'converted') {
        throw new Error('تریگرِ پیوندخورده به معامله را نمی‌توان به وضعیت دیگری تغییر داد.');
      }

      const eventPatch: Partial<JournalTriggerEvent> = { ...patch, updatedAt: now };
      if (current.linkedTradeId) {
        const trade = await db.trades.get(current.linkedTradeId);
        if (!trade) throw new Error('معاملهٔ پیوندخورده به تریگر پیدا نشد.');
        const tradePatch: Partial<Trade> = {};

        if ('analysisEventId' in patch || 'analysisEventIds' in patch) {
          tradePatch.journalAnalysisEventId = patch.analysisEventId ?? null;
        }

        if ('directionOptionId' in patch) {
          const previouslyAppliedDirection = current.linkedTradeDirection
            ?? tradeDirectionFromOption(previousDirectionOption);
          const nextDirection = tradeDirectionFromOption(nextDirectionOption);
          if (previouslyAppliedDirection && trade.direction === previouslyAppliedDirection) {
            if (nextDirection) {
              tradePatch.direction = nextDirection;
              eventPatch.linkedTradeDirection = nextDirection;
            } else {
              eventPatch.linkedTradeDirection = previouslyAppliedDirection;
            }
          } else {
            // A difference means the user chose a trade direction independently.
            eventPatch.linkedTradeDirection = null;
          }
        }

        if ('triggerTypeOptionId' in patch) {
          const previouslyAppliedOptionId = current.linkedTradeEntryTriggerOptionId
            ?? current.triggerTypeOptionId;
          const nextOptionId = patch.triggerTypeOptionId ?? null;
          const tradeData = await db.journalTradeData.where('tradeId').equals(trade.id).first();
          const selectedOptionIds = parseArray(tradeData?.entryTriggerOptionIds);
          let nextOptionIds = selectedOptionIds;
          let shouldWriteTradeData = false;
          let linkedTradeEntryTriggerOptionId: string | null = null;

          if (previouslyAppliedOptionId && selectedOptionIds.includes(previouslyAppliedOptionId)) {
            nextOptionIds = selectedOptionIds.filter(optionId => optionId !== previouslyAppliedOptionId);
            if (nextOptionId && !nextOptionIds.includes(nextOptionId)) nextOptionIds.push(nextOptionId);
            shouldWriteTradeData = true;
            linkedTradeEntryTriggerOptionId = nextOptionId && nextOptionIds.includes(nextOptionId)
              ? nextOptionId
              : null;
          } else if (!previouslyAppliedOptionId && nextOptionId) {
            nextOptionIds = selectedOptionIds.includes(nextOptionId)
              ? selectedOptionIds
              : [...selectedOptionIds, nextOptionId];
            shouldWriteTradeData = true;
            linkedTradeEntryTriggerOptionId = nextOptionId;
          }

          if (shouldWriteTradeData) {
            const nextTradeData = tradeData
              ? { ...tradeData, entryTriggerOptionIds: JSON.stringify(nextOptionIds), updatedAt: now }
              : blankJournalTradeData(trade.id, current.sessionId, now);
            if (!tradeData && nextOptionId) {
              nextTradeData.entryTriggerOptionIds = JSON.stringify(nextOptionIds);
            }
            await db.journalTradeData.put(nextTradeData);
          }
          eventPatch.linkedTradeEntryTriggerOptionId = linkedTradeEntryTriggerOptionId;
        }

        if (Object.keys(tradePatch).length) await db.trades.update(trade.id, tradePatch);
      }

      await db.journalTriggerEvents.update(id, eventPatch);
    });
  },

  async linkTriggerToTrade(
    triggerId: string,
    tradeId: string,
    options: { applyTriggerDirection?: boolean } = {},
  ): Promise<void> {
    await db.transaction('rw', [db.journalTriggerEvents, db.trades, db.journalTradeData, db.journalSessions, db.journalOptions], async () => {
      const [trigger, trade] = await Promise.all([
        db.journalTriggerEvents.get(triggerId),
        db.trades.get(tradeId),
      ]);
      if (!trigger || !trade) throw new Error('تریگر یا معامله پیدا نشد.');
      if (!trigger.confirmed) throw new Error('برای ثبت معامله، تریگر باید تأیید شده باشد.');
      if (trigger.linkedTradeId && trigger.linkedTradeId !== trade.id) throw new Error('این تریگر قبلاً به معاملهٔ دیگری وصل شده است.');
      if (trade.journalSessionId && trade.journalSessionId !== trigger.sessionId) throw new Error('معامله به سشن دیگری تعلق دارد.');
      const session = await db.journalSessions.get(trigger.sessionId);
      if (!session) throw new Error('سشن ژورنال برای اتصال معامله پیدا نشد.');

      const [directionOption, tradeData] = await Promise.all([
        trigger.directionOptionId ? db.journalOptions.get(trigger.directionOptionId) : Promise.resolve(undefined),
        db.journalTradeData.where('tradeId').equals(trade.id).first(),
      ]);
      const triggerDirection = tradeDirectionFromOption(directionOption);
      const tradePatch: Partial<Trade> = {
        journalSessionId: trigger.sessionId,
        journalTriggerEventId: trigger.id,
        journalAnalysisEventId: trigger.analysisEventId ?? triggerAnalysisIds(trigger)[0] ?? null,
        accountId: trade.accountId ?? session.accountId,
        boxId: trade.boxId ?? session.tradingBoxId,
        strategyId: trade.strategyId ?? session.strategyId,
        symbol: trade.symbol || parseArray(session.symbols)[0] || '',
      };
      if (options.applyTriggerDirection && triggerDirection) {
        tradePatch.direction = triggerDirection;
      }
      const linkedTradeDirection = options.applyTriggerDirection
        ? triggerDirection
        : (trade.direction === triggerDirection ? triggerDirection : null);

      await db.trades.update(trade.id, {
        ...tradePatch,
      });

      let linkedTradeEntryTriggerOptionId: string | null = null;
      if (trigger.triggerTypeOptionId) {
        const entryTriggerOptionIds = parseArray(tradeData?.entryTriggerOptionIds);
        if (!entryTriggerOptionIds.includes(trigger.triggerTypeOptionId)) {
          entryTriggerOptionIds.push(trigger.triggerTypeOptionId);
        }
        const now = Date.now();
        const nextTradeData = tradeData
          ? { ...tradeData, entryTriggerOptionIds: JSON.stringify(entryTriggerOptionIds), updatedAt: now }
          : blankJournalTradeData(trade.id, trigger.sessionId, now);
        nextTradeData.entryTriggerOptionIds = JSON.stringify(entryTriggerOptionIds);
        await db.journalTradeData.put(nextTradeData);
        linkedTradeEntryTriggerOptionId = trigger.triggerTypeOptionId;
      }

      await db.journalTriggerEvents.update(trigger.id, {
        linkedTradeId: trade.id,
        status: 'converted',
        linkedTradeDirection,
        linkedTradeEntryTriggerOptionId,
        updatedAt: Date.now(),
      });
    });
  },

  async getTimeline(sessionId: string): Promise<JournalSessionTimelineItem[]> {
    const bundle = await this.getBundle(sessionId);
    if (!bundle) return [];
    return [
      ...bundle.analyses.map(record => ({ id: record.id, kind: 'analysis' as const, timestamp: record.createdAt, record })),
      ...bundle.triggers.map(record => ({ id: record.id, kind: 'trigger' as const, timestamp: record.createdAt, record })),
      ...bundle.trades.map(record => ({ id: record.id, kind: 'trade' as const, timestamp: record.closedAt ?? record.openedAt, record })),
      ...bundle.events.map(record => ({ id: record.id, kind: 'event' as const, timestamp: record.eventAt, record })),
    ].sort((a, b) => a.timestamp - b.timestamp);
  },

  async saveTradeData(input: Omit<JournalTradeData, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalTradeData> {
    const trade = await db.trades.get(input.tradeId);
    const session = await db.journalSessions.get(input.journalSessionId);
    if (!trade || !session) throw new Error('معامله یا سشن پیدا نشد.');
    if (trade.journalSessionId !== session.id) throw new Error('معامله به این سشن متصل نیست.');
    const existing = await db.journalTradeData.where('tradeId').equals(input.tradeId).first();
    const now = Date.now();
    const record: JournalTradeData = {
      ...input,
      id: existing?.id ?? input.tradeId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.journalTradeData.put(record);
    return record;
  },

  async addEvent(input: Pick<JournalSessionEvent, 'sessionId' | 'typeOptionId' | 'notes' | 'eventAt'>): Promise<JournalSessionEvent> {
    const [session, option] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.typeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!option || option.category !== 'session_event_type' || !option.enabled) throw new Error('نوع رویداد معتبر انتخاب نشده است.');
    const now = Date.now();
    const event: JournalSessionEvent = { ...input, id: uid(), createdAt: now, updatedAt: now };
    await db.journalSessionEvents.add(event);
    return event;
  },

  async deleteEvent(id: string): Promise<void> {
    await db.journalSessionEvents.delete(id);
  },

  async saveMedia(input: {
    sessionId?: string | null;
    tradeId?: string | null;
    analysisId?: string | null;
    triggerId?: string | null;
    reviewId?: string | null;
    category: JournalMedia['category'];
    file: File;
    caption?: string;
  }): Promise<JournalMedia> {
    if (!input.file.size) throw new Error('فایل خالی است.');
    if (input.triggerId) {
      const trigger = await db.journalTriggerEvents.get(input.triggerId);
      if (!trigger || (input.sessionId && trigger.sessionId !== input.sessionId)) throw new Error('تریگر انتخاب‌شده معتبر نیست.');
    }
    const record: JournalMedia = {
      id: uid(),
      sessionId: input.sessionId ?? null,
      tradeId: input.tradeId ?? null,
      analysisId: input.analysisId ?? null,
      triggerId: input.triggerId ?? null,
      reviewId: input.reviewId ?? null,
      category: input.category,
      fileName: input.file.name,
      mimeType: input.file.type || 'application/octet-stream',
      blob: input.file.slice(0, input.file.size, input.file.type || 'application/octet-stream'),
      caption: input.caption?.trim() ?? '',
      createdAt: Date.now(),
    };
    if (!record.sessionId && !record.tradeId && !record.analysisId && !record.triggerId && !record.reviewId) {
      throw new Error('فایل باید به سشن، معامله، تحلیل، تریگر یا مرور وصل باشد.');
    }
    await db.journalMedia.add(record);
    return record;
  },

  async deleteMedia(id: string): Promise<void> {
    await db.journalMedia.delete(id);
  },

  async getSessionMetrics(sessionId: string): Promise<JournalSessionMetrics> {
    return this.calculateMetrics(await db.trades.where('journalSessionId').equals(sessionId).toArray());
  },

  calculateMetrics(trades: Trade[]): JournalSessionMetrics {
    const settled = trades.filter(trade =>
      isClosed(trade)
      && ['win', 'partial-win', 'loss', 'partial-loss', 'breakeven'].includes(trade.result),
    );
    const m = computeMetrics(settled); // موتور واحد: core/metrics/engine.ts
    const rTrades = settled.filter(trade => getR(trade) !== null);
    const byR = [...rTrades].sort((a, b) => (getR(a) ?? 0) - (getR(b) ?? 0));
    return {
      totalTrades: trades.length,
      wins: m.winCount,
      losses: m.lossCount,
      breakeven: m.breakEvenCount,
      winRate: toPercent(m.winRate),
      totalProfit: m.grossProfit,
      totalLoss: m.grossLoss,
      netPnl: m.netPnl,
      totalR: m.totalR,
      averageR: m.avgR,
      bestTradeId: byR[byR.length - 1]?.id ?? null,
      worstTradeId: byR[0]?.id ?? null,
    };
  },

  async getAnalytics(filters: JournalAnalyticsFilters = {}): Promise<{ trades: Trade[]; tradeData: JournalTradeData[]; metrics: JournalSessionMetrics }> {
    let trades = await db.trades.toArray();
    const [sessions, analyses, allMeta] = await Promise.all([
      db.journalSessions.toArray(),
      db.journalSessionAnalyses.toArray(),
      db.journalTradeData.toArray(),
    ]);
    const sessionById = new Map(sessions.map(session => [session.id, session]));
    const metaByTradeId = new Map(allMeta.map(meta => [meta.tradeId, meta]));
    const analysisBySession = new Map<string, JournalSessionAnalysis[]>();
    for (const analysis of analyses) {
      analysisBySession.set(analysis.sessionId, [...(analysisBySession.get(analysis.sessionId) ?? []), analysis]);
    }

    trades = trades.filter(trade => {
      const session = trade.journalSessionId ? sessionById.get(trade.journalSessionId) : undefined;
      const meta = metaByTradeId.get(trade.id);
      if (!session) return false;
      if (filters.accountId && session.accountId !== filters.accountId) return false;
      if (filters.tradingBoxId && session.tradingBoxId !== filters.tradingBoxId) return false;
      if (filters.strategyId && session.strategyId !== filters.strategyId) return false;
      if (filters.strategyVersionId && session.strategyVersionId !== filters.strategyVersionId) return false;
      if (filters.sessionId && session.id !== filters.sessionId) return false;
      if (filters.symbol && !parseArray(session.symbols).some(symbol => symbol.toLowerCase().includes(filters.symbol!.toLowerCase()))) return false;
      if (filters.from != null && trade.openedAt < filters.from) return false;
      if (filters.to != null && trade.openedAt > filters.to) return false;
      if (filters.entryTriggerOptionId && !parseArray(meta?.entryTriggerOptionIds).includes(filters.entryTriggerOptionId)) return false;
      if (filters.exitReasonOptionId && meta?.exitReasonOptionId !== filters.exitReasonOptionId) return false;
      if (filters.psychologyOptionId && !psychologyHasOption(meta?.psychology, filters.psychologyOptionId)) return false;
      if (filters.mistakeOptionId && !parseArray(meta?.mistakeOptionIds).includes(filters.mistakeOptionId)) return false;
      if (filters.setupGradeOptionId && meta?.setupGradeOptionId !== filters.setupGradeOptionId) return false;
      if (filters.scoTypeOptionId && meta?.scoTypeOptionId !== filters.scoTypeOptionId) return false;
      if (filters.fvgTypeOptionId && meta?.fvgTypeOptionId !== filters.fvgTypeOptionId) return false;
      if (filters.minSetupQuality != null && (meta?.setupQuality == null || meta.setupQuality < filters.minSetupQuality)) return false;
      if (filters.maxSetupQuality != null && (meta?.setupQuality == null || meta.setupQuality > filters.maxSetupQuality)) return false;
      if (filters.minExecutionQuality != null && (meta?.executionQuality == null || meta.executionQuality < filters.minExecutionQuality)) return false;
      if (filters.maxExecutionQuality != null && (meta?.executionQuality == null || meta.executionQuality > filters.maxExecutionQuality)) return false;
      if (filters.strategyCompliance && meta?.strategyCompliance !== filters.strategyCompliance) return false;
      if (filters.timeframeOptionId && !(analysisBySession.get(session.id) ?? []).some(item => item.timeframeOptionId === filters.timeframeOptionId)) return false;
      return true;
    });
    const tradeData = trades.map(trade => metaByTradeId.get(trade.id)).filter((item): item is JournalTradeData => Boolean(item));
    return { trades, tradeData, metrics: this.calculateMetrics(trades) };
  },
};

export function parseJournalArray(value: string | null | undefined): string[] {
  return parseArray(value);
}
