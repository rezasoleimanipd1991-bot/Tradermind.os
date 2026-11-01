import type { JournalOption, JournalSession, JournalSessionAnalysis, JournalTradeData, JournalTriggerEvent, Trade } from '../db/database';
import { isClosed, isLoss, isWin } from '../lib/tradeHelpers';
import { triggerAnalysisIds } from '../lib/triggerAnalysis';
import {
  classifyScenarioOutcome,
  scenarioAccuracy,
  type ScenarioAccuracyCounts,
} from '../lib/scenarioOutcome';
import { parseAnalysisFieldSelections } from './journalAnalysisFieldLabels';
import { computeMetrics, toPercent } from '../core/metrics/engine';
import { getTradingDateParts } from '../lib/tradingTime';

export type BreakdownDimension =
  | 'timeframe' | 'triggerTimeframe' | 'forwardZone' | 'triggerType' | 'sessionType' | 'weekday' | 'symbol'
  | 'strategyCompliance' | 'executionQuality' | 'setupGrade' | 'mistake';

export const BREAKDOWN_DIMENSIONS: ReadonlyArray<{ id: BreakdownDimension; label: string; hint?: string }> = [
  { id: 'timeframe', label: 'تایم‌فریم تحلیل', hint: 'یک معامله می‌تواند به چند تایم‌فریم مرتبط باشد و در چند ردیف بیاید.' },
  { id: 'triggerTimeframe', label: 'تایم‌فریم تریگر' },
  { id: 'forwardZone', label: 'نواحی پیش رو', hint: 'یک معامله می‌تواند چند ناحیه داشته باشد و در چند ردیف بیاید.' },
  { id: 'triggerType', label: 'نوع تریگر' },
  { id: 'sessionType', label: 'نوع سشن' },
  { id: 'weekday', label: 'روز هفته' },
  { id: 'symbol', label: 'نماد' },
  { id: 'strategyCompliance', label: 'رعایت پلن' },
  { id: 'executionQuality', label: 'کیفیت اجرا' },
  { id: 'setupGrade', label: 'درجه ستاپ' },
  { id: 'mistake', label: 'اشتباه‌ها', hint: 'یک معامله می‌تواند چند اشتباه داشته باشد و در چند ردیف بیاید.' },
];

export interface BreakdownRow {
  key: string;
  label: string;
  /** همهٔ معاملات منتسب به این ردیف (باز و بسته). */
  trades: number;
  /** معاملات بسته‌شده با نتیجهٔ مشخص؛ مبنای نرخ برد. */
  settled: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  totalR: number;
  averageR: number | null;
}

export interface BreakdownInput {
  trades: Trade[];
  sessions: JournalSession[];
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  options: JournalOption[];
  /** اطلاعات مرور هر معامله؛ برای بُعدهای رعایت پلن، کیفیت اجرا، درجه ستاپ و اشتباه‌ها لازم است. */
  tradeData?: JournalTradeData[];
}

export type BreakdownResult = Record<BreakdownDimension, BreakdownRow[]>;

const NONE_LABELS: Record<BreakdownDimension, string> = {
  timeframe: 'بدون تحلیل مرتبط',
  triggerTimeframe: 'بدون تریگر',
  forwardZone: 'بدون ناحیه',
  triggerType: 'بدون تریگر',
  sessionType: 'نامشخص',
  weekday: '—',
  symbol: '—',
  strategyCompliance: 'بدون ثبت',
  executionQuality: 'بدون ثبت',
  setupGrade: 'بدون ثبت',
  mistake: 'بدون اشتباهِ ثبت‌شده',
};

export const COMPLIANCE_LABELS = { yes: 'طبق پلن', partially: 'تا حدی طبق پلن', no: 'خارج از پلن' } as const;

/** کیفیت اجرا (۰ تا ۱۰) را به سه بازه تبدیل می‌کند. */
export function executionQualityBand(value: number | null | undefined): { key: string; label: string } {
  if (value == null) return { key: '__none__', label: NONE_LABELS.executionQuality };
  if (value >= 8) return { key: 'high', label: 'عالی (۸ تا ۱۰)' };
  if (value >= 5) return { key: 'mid', label: 'متوسط (۵ تا ۷)' };
  return { key: 'low', label: 'ضعیف (زیر ۵)' };
}

const SETTLED_RESULTS = new Set(['win', 'partial-win', 'loss', 'partial-loss', 'breakeven']);
const WEEKDAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function aggregate(key: string, label: string, trades: Trade[]): BreakdownRow {
  const settled = trades.filter(trade => isClosed(trade) && SETTLED_RESULTS.has(trade.result));
  const m = computeMetrics(settled); // موتور واحد: core/metrics/engine.ts
  return {
    key, label,
    trades: trades.length,
    settled: settled.length,
    wins: m.winCount, losses: m.lossCount,
    winRate: toPercent(m.winRate),
    netPnl: m.netPnl,
    totalR: m.totalR,
    averageR: m.avgR,
  };
}

/** معاملات را بر اساس هر بُعدِ تحلیلی گروه‌بندی و آمار هر گروه را حساب می‌کند. */
export function buildBreakdowns(input: BreakdownInput): BreakdownResult {
  const optionLabel = new Map(input.options.map(option => [option.id, option.label]));
  const sessionById = new Map(input.sessions.map(session => [session.id, session]));
  const analysisById = new Map(input.analyses.map(analysis => [analysis.id, analysis]));
  const label = (id: string | null | undefined) => (id ? optionLabel.get(id) ?? 'گزینهٔ حذف‌شده' : undefined);

  const groups: Record<BreakdownDimension, Map<string, { label: string; trades: Trade[] }>> = {
    timeframe: new Map(), triggerTimeframe: new Map(), forwardZone: new Map(), triggerType: new Map(),
    sessionType: new Map(), weekday: new Map(), symbol: new Map(),
    strategyCompliance: new Map(), executionQuality: new Map(), setupGrade: new Map(), mistake: new Map(),
  };
  const dataByTradeId = new Map((input.tradeData ?? []).map(item => [item.tradeId, item]));
  const add = (dimension: BreakdownDimension, key: string, text: string, trade: Trade) => {
    const group = groups[dimension].get(key) ?? { label: text, trades: [] };
    if (!group.trades.includes(trade)) group.trades.push(trade);
    groups[dimension].set(key, group);
  };

  for (const trade of input.trades) {
    const trigger = input.triggers.find(item => item.linkedTradeId === trade.id)
      ?? input.triggers.find(item => item.id === trade.journalTriggerEventId);
    const analysisIds = trigger ? triggerAnalysisIds(trigger) : [];
    if (!analysisIds.length && trade.journalAnalysisEventId) analysisIds.push(trade.journalAnalysisEventId);
    const linkedAnalyses = analysisIds.map(id => analysisById.get(id)).filter((item): item is JournalSessionAnalysis => Boolean(item));
    const session = trade.journalSessionId ? sessionById.get(trade.journalSessionId) : undefined;

    const timeframes = new Set(linkedAnalyses.map(item => item.timeframeOptionId));
    if (timeframes.size === 0) add('timeframe', '__none__', NONE_LABELS.timeframe, trade);
    for (const id of timeframes) add('timeframe', id, label(id) ?? 'تایم‌فریم حذف‌شده', trade);

    if (trigger) add('triggerTimeframe', trigger.timeframeOptionId, label(trigger.timeframeOptionId) ?? 'تایم‌فریم حذف‌شده', trade);
    else add('triggerTimeframe', '__none__', NONE_LABELS.triggerTimeframe, trade);

    const zoneIds = new Set(linkedAnalyses.flatMap(item => parseAnalysisFieldSelections(item.fieldSelections).zones ?? []));
    if (zoneIds.size === 0) add('forwardZone', '__none__', NONE_LABELS.forwardZone, trade);
    for (const id of zoneIds) add('forwardZone', id, label(id) ?? 'ناحیهٔ حذف‌شده', trade);

    if (trigger?.triggerTypeOptionId) add('triggerType', trigger.triggerTypeOptionId, label(trigger.triggerTypeOptionId) ?? 'نوع حذف‌شده', trade);
    else add('triggerType', '__none__', NONE_LABELS.triggerType, trade);

    if (session?.sessionTypeOptionId) add('sessionType', session.sessionTypeOptionId, label(session.sessionTypeOptionId) ?? 'نوع حذف‌شده', trade);
    else add('sessionType', '__none__', NONE_LABELS.sessionType, trade);

    const weekday = getTradingDateParts(trade.openedAt).dayOfWeek;
    add('weekday', String(weekday), WEEKDAY_NAMES[weekday], trade);
    add('symbol', trade.symbol || '__none__', trade.symbol || NONE_LABELS.symbol, trade);

    const meta = dataByTradeId.get(trade.id);
    const compliance = meta?.strategyCompliance;
    if (compliance) add('strategyCompliance', compliance, COMPLIANCE_LABELS[compliance], trade);
    else add('strategyCompliance', '__none__', NONE_LABELS.strategyCompliance, trade);
    const band = executionQualityBand(meta?.executionQuality);
    add('executionQuality', band.key, band.label, trade);
    if (meta?.setupGradeOptionId) add('setupGrade', meta.setupGradeOptionId, label(meta.setupGradeOptionId) ?? 'درجهٔ حذف‌شده', trade);
    else add('setupGrade', '__none__', NONE_LABELS.setupGrade, trade);
    const mistakeIds = parseIdList(meta?.mistakeOptionIds);
    if (mistakeIds.length === 0) add('mistake', '__none__', NONE_LABELS.mistake, trade);
    for (const id of mistakeIds) add('mistake', id, label(id) ?? 'اشتباهِ حذف‌شده', trade);
  }

  const result = {} as BreakdownResult;
  for (const dimension of Object.keys(groups) as BreakdownDimension[]) {
    result[dimension] = [...groups[dimension].entries()]
      .map(([key, group]) => aggregate(key, group.label, group.trades))
      .sort((a, b) => b.trades - a.trades || a.label.localeCompare(b.label, 'fa'));
  }
  return result;
}

export interface ScenarioAccuracyRow extends ScenarioAccuracyCounts {
  timeframeOptionId: string;
  label: string;
  /** همهٔ تحلیل‌های این تایم‌فریم. */
  analyses: number;
  /** تحلیل‌هایی که نتیجهٔ سناریویشان ثبت شده است. */
  recorded: number;
  accuracy: number | null;
}

/** دقت سناریوها به تفکیک تایم‌فریم تحلیل. */
export function buildScenarioAccuracy(input: {
  analyses: JournalSessionAnalysis[];
  options: JournalOption[];
  /** اگر داده شود فقط تحلیل‌های همین سشن‌ها شمرده می‌شوند. */
  sessionIds?: ReadonlySet<string>;
}): ScenarioAccuracyRow[] {
  const optionLabel = new Map(input.options.map(option => [option.id, option.label]));
  const rows = new Map<string, ScenarioAccuracyRow>();
  for (const analysis of input.analyses) {
    if (input.sessionIds && !input.sessionIds.has(analysis.sessionId)) continue;
    const row = rows.get(analysis.timeframeOptionId) ?? {
      timeframeOptionId: analysis.timeframeOptionId,
      label: optionLabel.get(analysis.timeframeOptionId) ?? 'تایم‌فریم حذف‌شده',
      analyses: 0, recorded: 0, hit: 0, partial: 0, invalidated: 0, notTriggered: 0, accuracy: null,
    };
    row.analyses += 1;
    const kind = classifyScenarioOutcome(analysis.scenarioOutcomeOptionId ? optionLabel.get(analysis.scenarioOutcomeOptionId) : '');
    if (kind === 'hit') row.hit += 1;
    else if (kind === 'partial') row.partial += 1;
    else if (kind === 'invalidated') row.invalidated += 1;
    else if (kind === 'not_triggered') row.notTriggered += 1;
    row.recorded = row.hit + row.partial + row.invalidated + row.notTriggered;
    row.accuracy = scenarioAccuracy(row);
    rows.set(analysis.timeframeOptionId, row);
  }
  return [...rows.values()].sort((a, b) => b.recorded - a.recorded || b.analyses - a.analyses);
}

export interface PlanAdherenceSummary {
  onPlan: BreakdownRow;
  offPlan: BreakdownRow;
  unrated: BreakdownRow;
  /** معاملات خارج از پلن که سود دادند؛ سودِ شانسی که نباید تکرار شود. */
  offPlanWins: number;
  /** معاملات طبق پلن که ضرر دادند؛ ضررِ عادیِ فرایند درست. */
  onPlanLosses: number;
  /** اختلاف میانگین R: طبق پلن منهای خارج از پلن؛ null اگر یکی از دو طرف R نداشته باشد. */
  averageRAdvantage: number | null;
}

/** سود/زیان را از «کیفیت تصمیم» جدا می‌کند: معامله طبق پلن بود یا نه. */
export function buildPlanAdherence(trades: Trade[], tradeData: JournalTradeData[]): PlanAdherenceSummary {
  const dataByTradeId = new Map(tradeData.map(item => [item.tradeId, item]));
  const onPlanTrades = trades.filter(trade => dataByTradeId.get(trade.id)?.strategyCompliance === 'yes');
  const offPlanTrades = trades.filter(trade => {
    const value = dataByTradeId.get(trade.id)?.strategyCompliance;
    return value === 'no' || value === 'partially';
  });
  const unratedTrades = trades.filter(trade => !dataByTradeId.get(trade.id)?.strategyCompliance);
  const onPlan = aggregate('on', 'طبق پلن', onPlanTrades);
  const offPlan = aggregate('off', 'خارج از پلن', offPlanTrades);
  return {
    onPlan, offPlan,
    unrated: aggregate('none', 'بدون ثبت', unratedTrades),
    offPlanWins: offPlanTrades.filter(trade => isClosed(trade) && isWin(trade)).length,
    onPlanLosses: onPlanTrades.filter(trade => isClosed(trade) && isLoss(trade)).length,
    averageRAdvantage: onPlan.averageR != null && offPlan.averageR != null ? onPlan.averageR - offPlan.averageR : null,
  };
}
