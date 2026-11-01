import type {
  Account,
  DailyJournal,
  JournalOption,
  JournalSession,
  JournalSessionAnalysis,
  JournalTradeData,
  JournalTriggerEvent,
  Strategy,
  Trade,
  TradingBox,
} from '../db/database';
import { getNetPnl, isClosed } from '../lib/tradeHelpers';
import { computeMetrics } from '../core/metrics/engine';
import {
  getTradingDateParts,
  getTradingDateRange,
  getTradingDayStart,
  getTradingMonthStart,
  getTradingTimestampForParts,
  type TradingTimeConfig,
} from '../lib/tradingTime';

export type ReportSectionId =
  | 'overview'
  | 'pnl'
  | 'risk'
  | 'statistics'
  | 'sessions'
  | 'time'
  | 'strategies'
  | 'setups'
  | 'mtf'
  | 'psychology'
  | 'execution'
  | 'mistakes'
  | 'lessons'
  | 'tags'
  | 'direction'
  | 'instruments';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'all'
  | 'custom';

export type FilterDimension =
  | 'statuses'
  | 'symbols'
  | 'directions'
  | 'strategies'
  | 'setups'
  | 'sessions'
  | 'timeframes'
  | 'psychology'
  | 'mistakes'
  | 'tags'
  | 'accounts'
  | 'boxes';

export interface ReportsCenterFilters {
  preset: DatePreset;
  fromDate: string;
  toDate: string;
  statuses: string[];
  symbols: string[];
  directions: string[];
  strategies: string[];
  setups: string[];
  sessions: string[];
  timeframes: string[];
  psychology: string[];
  mistakes: string[];
  tags: string[];
  accounts: string[];
  boxes: string[];
  minExecutionQuality: number | null;
  maxExecutionQuality: number | null;
  lessonQuery: string;
}

export interface ReportsCenterSource {
  trades: Trade[];
  dailyJournals: DailyJournal[];
  strategies: Strategy[];
  accounts: Account[];
  boxes: TradingBox[];
  journalSessions: JournalSession[];
  journalOptions: JournalOption[];
  journalSessionAnalyses: JournalSessionAnalysis[];
  journalTriggerEvents: JournalTriggerEvent[];
  journalTradeData: JournalTradeData[];
}

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface CurrencyMetric {
  currency: string;
  grossPnl: number;
  netPnl: number;
  averageWin: number | null;
  averageLoss: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  riskAmount: number | null;
}

export interface ReportsCenterSummary {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  cancelledTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  averageR: number | null;
  totalR: number | null;
  averageRiskPercent: number | null;
  currencies: CurrencyMetric[];
  tradesWithoutPnl: number;
}

export interface ReportRow {
  key: string;
  cells: Array<string | number | null>;
}

export interface ReportTableData {
  title: string;
  description: string;
  columns: string[];
  rows: ReportRow[];
  multiAttributed?: boolean;
}

export interface PnlCurvePoint {
  index: number;
  date: string;
  symbol: string;
  netPnl: number;
  cumulativeNetPnl: number;
}

export const REPORT_SECTION_DEFINITIONS: Array<{
  id: ReportSectionId;
  label: string;
  category: string;
}> = [
  { id: 'overview', label: 'نمای کلی و روند', category: 'نمای کلی' },
  { id: 'pnl', label: 'سود و زیان', category: 'سود و زیان' },
  { id: 'risk', label: 'ریسک و افت سرمایه', category: 'ریسک' },
  { id: 'statistics', label: 'آمار معاملات', category: 'آمار معاملات' },
  { id: 'sessions', label: 'سشن‌ها', category: 'زمان و سشن' },
  { id: 'time', label: 'روز و ساعت', category: 'زمان و سشن' },
  { id: 'strategies', label: 'استراتژی', category: 'استراتژی و ستاپ' },
  { id: 'setups', label: 'ستاپ و سناریو', category: 'استراتژی و ستاپ' },
  { id: 'mtf', label: 'چندتایم‌فریمی', category: 'تحلیل ژورنال' },
  { id: 'psychology', label: 'روان‌شناسی', category: 'رفتار و کیفیت' },
  { id: 'execution', label: 'کیفیت اجرا و پایبندی', category: 'رفتار و کیفیت' },
  { id: 'mistakes', label: 'اشتباهات', category: 'رفتار و کیفیت' },
  { id: 'lessons', label: 'درس‌های ثبت‌شده', category: 'رفتار و کیفیت' },
  { id: 'tags', label: 'برچسب‌ها', category: 'برچسب‌ها و جهت' },
  { id: 'direction', label: 'خرید در برابر فروش', category: 'برچسب‌ها و جهت' },
  { id: 'instruments', label: 'نماد و بازار', category: 'بازار' },
];

export const DEFAULT_REPORT_SECTIONS: ReportSectionId[] = [
  'overview',
  'pnl',
  'risk',
  'statistics',
  'time',
  'sessions',
  'strategies',
  'setups',
  'mtf',
  'psychology',
  'execution',
  'mistakes',
  'lessons',
  'direction',
  'instruments',
];

export const DEFAULT_REPORT_FILTERS: ReportsCenterFilters = {
  preset: 'last30',
  fromDate: '',
  toDate: '',
  statuses: [],
  symbols: [],
  directions: [],
  strategies: [],
  setups: [],
  sessions: [],
  timeframes: [],
  psychology: [],
  mistakes: [],
  tags: [],
  accounts: [],
  boxes: [],
  minExecutionQuality: null,
  maxExecutionQuality: null,
  lessonQuery: '',
};

export interface ReportsCenterIndex {
  sessionsById: Map<string, JournalSession>;
  journalDataByTradeId: Map<string, JournalTradeData>;
  analysesBySessionId: Map<string, JournalSessionAnalysis[]>;
  triggersByTradeId: Map<string, JournalTriggerEvent[]>;
  triggersBySessionId: Map<string, JournalTriggerEvent[]>;
  optionsById: Map<string, JournalOption>;
  accountsById: Map<string, Account>;
  boxesById: Map<string, TradingBox>;
  strategiesById: Map<string, Strategy>;
}

export function createReportsCenterIndex(source: ReportsCenterSource): ReportsCenterIndex {
  const analysesBySessionId = new Map<string, JournalSessionAnalysis[]>();
  for (const analysis of source.journalSessionAnalyses) {
    const rows = analysesBySessionId.get(analysis.sessionId) ?? [];
    rows.push(analysis);
    analysesBySessionId.set(analysis.sessionId, rows);
  }

  const triggersByTradeId = new Map<string, JournalTriggerEvent[]>();
  const triggersBySessionId = new Map<string, JournalTriggerEvent[]>();
  for (const trigger of source.journalTriggerEvents) {
    if (trigger.linkedTradeId) {
      const tradeRows = triggersByTradeId.get(trigger.linkedTradeId) ?? [];
      tradeRows.push(trigger);
      triggersByTradeId.set(trigger.linkedTradeId, tradeRows);
    }
    const sessionRows = triggersBySessionId.get(trigger.sessionId) ?? [];
    sessionRows.push(trigger);
    triggersBySessionId.set(trigger.sessionId, sessionRows);
  }

  return {
    sessionsById: new Map(source.journalSessions.map(item => [item.id, item])),
    journalDataByTradeId: new Map(source.journalTradeData.map(item => [item.tradeId, item])),
    analysesBySessionId,
    triggersByTradeId,
    triggersBySessionId,
    optionsById: new Map(source.journalOptions.map(item => [item.id, item])),
    accountsById: new Map(source.accounts.map(item => [item.id, item])),
    boxesById: new Map(source.boxes.map(item => [item.id, item])),
    strategiesById: new Map(source.strategies.map(item => [item.id, item])),
  };
}

export function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

function parsePsychologyValues(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    const found = new Set<string>();
    const visit = (item: unknown, key = '') => {
      if (Array.isArray(item)) {
        if (key === 'optionIds') {
          item.forEach(value => {
            if (typeof value === 'string' && value) found.add(value);
          });
        } else {
          item.forEach(value => visit(value, key));
        }
      } else if (item && typeof item === 'object') {
        Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
      }
    };
    visit(parsed);
    return [...found];
  } catch {
    return [];
  }
}

function dateKey(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getReportsDateRange(
  preset: DatePreset,
  timeConfig: TradingTimeConfig,
  now = Date.now(),
  fromDate = '',
  toDate = '',
): { from: number; to: number; valid: boolean } {
  const today = getTradingDateParts(now, timeConfig);
  const todayStart = getTradingDayStart(now, timeConfig);
  const endOfToday = todayStart + (timeConfig.mode === 'device'
    ? new Date(today.year, today.month, today.day + 1).getTime() - todayStart
    : 86_400_000) - 1;
  const startFor = (offset: number) =>
    getTradingTimestampForParts(today.year, today.month, today.day + offset, timeConfig);

  switch (preset) {
    case 'today':
      return { from: todayStart, to: now, valid: true };
    case 'yesterday': {
      const previous = getTradingDateParts(startFor(-1), timeConfig);
      const range = getTradingDateRange(dateKey(previous), timeConfig);
      return { ...range, valid: Number.isFinite(range.from) && Number.isFinite(range.to) };
    }
    case 'last7':
      return { from: startFor(-6), to: now, valid: true };
    case 'last30':
      return { from: startFor(-29), to: now, valid: true };
    case 'last90':
      return { from: startFor(-89), to: now, valid: true };
    case 'thisWeek': {
      const sinceSaturday = today.dayOfWeek === 6 ? 0 : today.dayOfWeek + 1;
      return { from: startFor(-sinceSaturday), to: now, valid: true };
    }
    case 'thisMonth':
      return { from: getTradingMonthStart(now, timeConfig), to: now, valid: true };
    case 'lastMonth': {
      const firstThisMonth = getTradingMonthStart(now, timeConfig);
      const firstLastMonth = getTradingTimestampForParts(today.year, today.month - 1, 1, timeConfig);
      return { from: firstLastMonth, to: firstThisMonth - 1, valid: firstLastMonth <= firstThisMonth };
    }
    case 'thisYear':
      return { from: getTradingTimestampForParts(today.year, 0, 1, timeConfig), to: now, valid: true };
    case 'all':
      return { from: 0, to: Number.MAX_SAFE_INTEGER, valid: true };
    case 'custom': {
      if (!fromDate || !toDate || fromDate > toDate) {
        return { from: Number.NaN, to: Number.NaN, valid: false };
      }
      const from = getTradingDateRange(fromDate, timeConfig).from;
      const to = getTradingDateRange(toDate, timeConfig).to;
      return { from, to, valid: Number.isFinite(from) && Number.isFinite(to) && from <= to };
    }
    default:
      return { from: 0, to: endOfToday, valid: true };
  }
}

interface TradeDimensions {
  session: JournalSession | undefined;
  journalData: JournalTradeData | undefined;
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  optionValues: Map<FilterDimension, string[]>;
  labels: Map<FilterDimension, Map<string, string>>;
}

function humanize(value: string): string {
  return value
    .replace(/^__/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionLabel(index: ReportsCenterIndex, id: string | null | undefined): string | null {
  if (!id) return null;
  return index.optionsById.get(id)?.label ?? `گزینهٔ حذف‌شده (${id.slice(0, 8)})`;
}

function getDimensions(trade: Trade, index: ReportsCenterIndex): TradeDimensions {
  const sessionId = trade.journalSessionId ?? null;
  const session = sessionId ? index.sessionsById.get(sessionId) : undefined;
  const journalData = index.journalDataByTradeId.get(trade.id);
  const analyses = sessionId ? index.analysesBySessionId.get(sessionId) ?? [] : [];
  const triggers = [
    ...(index.triggersByTradeId.get(trade.id) ?? []),
    ...(sessionId ? index.triggersBySessionId.get(sessionId) ?? [] : []),
  ];

  const values = new Map<FilterDimension, string[]>();
  const labels = new Map<FilterDimension, Map<string, string>>();
  const set = (dimension: FilterDimension, pairs: Array<[string | null | undefined, string | null | undefined]>) => {
    const labelMap = new Map<string, string>();
    for (const [rawValue, rawLabel] of pairs) {
      if (rawValue) labelMap.set(rawValue, rawLabel || humanize(rawValue));
    }
    labels.set(dimension, labelMap);
    values.set(dimension, [...labelMap.keys()]);
  };

  const accountId = trade.accountId ?? session?.accountId ?? null;
  const boxId = trade.boxId ?? session?.tradingBoxId ?? null;
  const strategyId = trade.strategyId ?? session?.strategyId ?? null;
  const sessionTypeId = session?.sessionTypeOptionId ?? null;
  const sessionValue = trade.tradingSession || sessionTypeId || '__no_session__';
  const sessionLabel = sessionTypeId
    ? optionLabel(index, sessionTypeId)
    : (trade.tradingSession ? humanize(trade.tradingSession) : 'بدون سشن');
  const setups: Array<[string | null | undefined, string | null | undefined]> = [
    [trade.setupType, trade.setupType ? humanize(trade.setupType) : null],
    [journalData?.setupTypeOptionId, optionLabel(index, journalData?.setupTypeOptionId)],
    [journalData?.setupGradeOptionId, optionLabel(index, journalData?.setupGradeOptionId)],
  ];
  const timeframeIds = [
    ...analyses.map(item => item.timeframeOptionId),
    ...triggers.map(item => item.timeframeOptionId),
  ];
  const psychologyIds = [
    ...parseStringList(trade.emotions),
    ...parsePsychologyValues(journalData?.psychology),
  ];
  const mistakeIds = parseStringList(journalData?.mistakeOptionIds);

  set('statuses', [[trade.status, trade.status === 'open' ? 'باز' : trade.status === 'closed' ? 'بسته' : 'لغوشده']]);
  set('symbols', [[trade.symbol, trade.symbol]]);
  set('directions', [[trade.direction, trade.direction === 'long' ? 'خرید (Long)' : 'فروش (Short)']]);
  set('strategies', [[strategyId, strategyId ? index.strategiesById.get(strategyId)?.name ?? `استراتژی حذف‌شده (${strategyId.slice(0, 8)})` : null]]);
  set('setups', setups);
  set('sessions', [[sessionValue, sessionLabel]]);
  set('timeframes', timeframeIds.map(id => [id, optionLabel(index, id)]));
  set('psychology', psychologyIds.map(id => [id, optionLabel(index, id) ?? humanize(id)]));
  set('mistakes', mistakeIds.map(id => [id, optionLabel(index, id)]));
  set('tags', parseStringList(trade.tags).map(tag => [tag, tag]));
  set('accounts', [[accountId ?? '__no_account__', accountId ? index.accountsById.get(accountId)?.name ?? `حساب حذف‌شده (${accountId.slice(0, 8)})` : 'بدون حساب']]);
  set('boxes', [[boxId ?? '__no_box__', boxId ? index.boxesById.get(boxId)?.name ?? `باکس حذف‌شده (${boxId.slice(0, 8)})` : 'بدون باکس']]);

  return { session, journalData, analyses, triggers, optionValues: values, labels };
}

function selectedMatch(selected: string[], actual: string[]): boolean {
  return selected.length === 0 || selected.some(value => actual.includes(value));
}

export function filterReportTrades(
  source: ReportsCenterSource,
  index: ReportsCenterIndex,
  filters: ReportsCenterFilters,
  timeConfig: TradingTimeConfig,
  now = Date.now(),
): { trades: Trade[]; dateRange: { from: number; to: number; valid: boolean } } {
  const dateRange = getReportsDateRange(filters.preset, timeConfig, now, filters.fromDate, filters.toDate);
  if (!dateRange.valid) return { trades: [], dateRange };

  const query = filters.lessonQuery.trim().toLocaleLowerCase();
  const trades = source.trades.filter(trade => {
    if (trade.openedAt < dateRange.from || trade.openedAt > dateRange.to) return false;
    const dimension = getDimensions(trade, index);
    for (const key of [
      'statuses', 'symbols', 'directions', 'strategies', 'setups', 'sessions',
      'timeframes', 'psychology', 'mistakes', 'tags', 'accounts', 'boxes',
    ] as FilterDimension[]) {
      if (!selectedMatch(filters[key], dimension.optionValues.get(key) ?? [])) return false;
    }
    const quality = dimension.journalData?.executionQuality ?? null;
    if (filters.minExecutionQuality !== null && (quality === null || quality < filters.minExecutionQuality)) return false;
    if (filters.maxExecutionQuality !== null && (quality === null || quality > filters.maxExecutionQuality)) return false;
    if (query) {
      const searchText = [
        trade.lesson,
        trade.entryReason,
        trade.reasonForExit,
        trade.notes,
        ...dimension.analyses.map(item => item.scenario ?? ''),
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      if (!searchText.includes(query)) return false;
    }
    return true;
  });
  return { trades, dateRange };
}

export function getReportFilterOptions(
  source: ReportsCenterSource,
  index: ReportsCenterIndex,
): Record<FilterDimension, ReportFilterOption[]> {
  const optionValues = new Map<FilterDimension, Map<string, string>>();
  const keys: FilterDimension[] = [
    'statuses', 'symbols', 'directions', 'strategies', 'setups', 'sessions',
    'timeframes', 'psychology', 'mistakes', 'tags', 'accounts', 'boxes',
  ];
  keys.forEach(key => optionValues.set(key, new Map()));
  for (const trade of source.trades) {
    const dimension = getDimensions(trade, index);
    for (const key of keys) {
      const labelMap = dimension.labels.get(key);
      for (const [value, label] of labelMap ?? []) {
        optionValues.get(key)!.set(value, label);
      }
    }
  }
  return Object.fromEntries(keys.map(key => [
    key,
    [...(optionValues.get(key) ?? new Map())]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
  ])) as Record<FilterDimension, ReportFilterOption[]>;
}

function currencyFor(trade: Trade, index: ReportsCenterIndex): string {
  const session = trade.journalSessionId ? index.sessionsById.get(trade.journalSessionId) : undefined;
  const accountId = trade.accountId ?? session?.accountId;
  return accountId ? index.accountsById.get(accountId)?.currency || 'ارز نامشخص' : 'ارز نامشخص';
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeReportsCenterSummary(
  trades: Trade[],
  index: ReportsCenterIndex,
): ReportsCenterSummary {
  const closed = trades.filter(isClosed);
  // همه‌ی اعداد از موتور واحد (core/metrics/engine.ts)؛ پولی‌ها به‌تفکیک ارز
  const m = computeMetrics(closed);
  const recordsWithPnl = closed.filter(trade => getNetPnl(trade) !== null);
  const currencies = [...new Set(recordsWithPnl.map(trade => currencyFor(trade, index)))].sort((a, b) => a.localeCompare(b, 'fa'));

  const currencyMetrics = currencies.map(currency => {
    const currencyTrades = recordsWithPnl.filter(trade => currencyFor(trade, index) === currency);
    const cm = computeMetrics(currencyTrades);
    const grossValues = currencyTrades
      .map(trade => trade.profitLoss)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const riskValues = closed
      .filter(trade => currencyFor(trade, index) === currency && trade.riskAmount != null)
      .map(trade => trade.riskAmount as number);
    return {
      currency,
      grossPnl: round(grossValues.reduce((total, value) => total + value, 0)),
      netPnl: round(cm.netPnl),
      averageWin: cm.avgWinPnl === null ? null : round(cm.avgWinPnl),
      averageLoss: cm.avgLossPnl === null ? null : round(cm.avgLossPnl),
      profitFactor: cm.profitFactor === null ? null : round(cm.profitFactor),
      maxDrawdown: cm.count ? round(cm.drawdown.absolute) : null,
      riskAmount: riskValues.length ? round(riskValues.reduce((total, value) => total + value, 0)) : null,
    };
  });

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.filter(trade => trade.status === 'open').length,
    cancelledTrades: trades.filter(trade => trade.status === 'cancelled').length,
    wins: m.winCount,
    losses: m.lossCount,
    breakeven: m.breakEvenCount,
    winRate: m.winRate === null ? null : round(m.winRate * 100),
    averageR: m.avgR === null ? null : round(m.avgR),
    totalR: m.rCount ? round(m.totalR) : null,
    averageRiskPercent: m.avgRiskPct === null ? null : round(m.avgRiskPct),
    currencies: currencyMetrics,
    tradesWithoutPnl: closed.length - recordsWithPnl.length,
  };
}

function groupTrades(
  trades: Trade[],
  index: ReportsCenterIndex,
  getKeys: (trade: Trade, dimensions: TradeDimensions) => Array<[string, string]>,
): Array<{ key: string; label: string; trades: Trade[] }> {
  const groups = new Map<string, { label: string; trades: Trade[] }>();
  for (const trade of trades) {
    for (const [key, label] of getKeys(trade, getDimensions(trade, index))) {
      const group = groups.get(key) ?? { label, trades: [] };
      if (!group.trades.some(item => item.id === trade.id)) group.trades.push(trade);
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, trades: group.trades }))
    .sort((a, b) => b.trades.length - a.trades.length || a.label.localeCompare(b.label, 'fa'));
}

function groupStatsRow(
  group: { key: string; label: string; trades: Trade[] },
  index: ReportsCenterIndex,
): ReportRow {
  const closed = group.trades.filter(isClosed);
  const gm = computeMetrics(closed);
  const pnl = new Map<string, number>();
  for (const trade of closed) {
    const value = getNetPnl(trade);
    if (value !== null) {
      const currency = currencyFor(trade, index);
      pnl.set(currency, (pnl.get(currency) ?? 0) + value);
    }
  }
  const pnlText = [...pnl.entries()]
    .map(([currency, value]) => `${currency}: ${round(value)}`)
    .join(' / ') || '—';
  return {
    key: group.key,
    cells: [
      group.label,
      group.trades.length,
      closed.length,
      gm.winRate === null ? null : round(gm.winRate * 100),
      gm.avgR === null ? null : round(gm.avgR),
      pnlText,
    ],
  };
}

const STANDARD_COLUMNS = ['گروه', 'معامله', 'بسته', 'نرخ برد (%)', 'میانگین R', 'P&L خالص به تفکیک ارز'];

export function buildReportTable(
  sectionId: ReportSectionId,
  trades: Trade[],
  source: ReportsCenterSource,
  index: ReportsCenterIndex,
  timeConfig: TradingTimeConfig,
): ReportTableData {
  const summary = computeReportsCenterSummary(trades, index);
  const byKey = (dimension: FilterDimension) =>
    groupTrades(trades, index, (_trade, details) => (details.optionValues.get(dimension) ?? [])
      .map(value => [value, details.labels.get(dimension)?.get(value) ?? humanize(value)]));
  const rowsFor = (groups: ReturnType<typeof groupTrades>) => groups.map(group => groupStatsRow(group, index));

  switch (sectionId) {
    case 'overview': {
      const monthly = groupTrades(trades, index, trade => {
        const parts = getTradingDateParts(trade.openedAt, timeConfig);
        const key = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}`;
        return [[key, key]];
      });
      return {
        title: 'نمای کلی و روند',
        description: 'تعداد معامله‌ها و نسبت برد از معاملات بسته محاسبه می‌شود؛ یک معامله در هر ماه فقط یک بار می‌آید.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(monthly),
      };
    }
    case 'pnl': {
      const pnlRows = summary.currencies.map(currency => ({
        key: currency.currency,
        cells: [
          currency.currency,
          currency.grossPnl,
          currency.netPnl,
          currency.averageWin,
          currency.averageLoss,
          currency.profitFactor,
        ],
      }));
      return {
        title: 'سود و زیان',
        description: 'فقط معامله‌های بسته با P&L ثبت‌شده؛ ناخالص از profitLoss و خالص پس از کسر کارمزد، کمیسیون و اسپرد است.',
        columns: ['ارز حساب', 'P&L ناخالص', 'P&L خالص تحقق‌یافته', 'میانگین برد خالص', 'میانگین باخت خالص', 'Profit Factor خالص'],
        rows: pnlRows,
      };
    }
    case 'risk': {
      const riskRows = summary.currencies.map(currency => ({
        key: currency.currency,
        cells: [currency.currency, currency.riskAmount, currency.maxDrawdown],
      }));
      riskRows.push({
        key: '__percent__',
        cells: [
          'ریسک درصدی (میانگین معامله‌های بسته)',
          summary.averageRiskPercent,
          summary.averageRiskPercent === null ? 'بدون دادهٔ ثبت‌شده' : 'درصد',
        ],
      });
      return {
        title: 'ریسک و افت سرمایه',
        description: 'ریسک مبلغی و افت سرمایه به تفکیک ارز؛ افت سرمایه از منحنی P&L خالص تحقق‌یافته و با شروع از صفر محاسبه می‌شود.',
        columns: ['مبنای ارز / شاخص', 'ریسک ثبت‌شده (مبلغ/درصد)', 'حداکثر افت سرمایهٔ خالص'],
        rows: riskRows,
      };
    }
    case 'statistics': {
      const byStatus = groupTrades(trades, index, trade => [[
        trade.status,
        trade.status === 'open' ? 'باز' : trade.status === 'closed' ? 'بسته' : 'لغوشده',
      ]]);
      const byResult = groupTrades(trades, index, trade => [[trade.result, humanize(trade.result)]]);
      return {
        title: 'آمار معاملات',
        description: `کل ${summary.totalTrades}، بسته ${summary.closedTrades}، باز ${summary.openTrades}، لغوشده ${summary.cancelledTrades}؛ نرخ برد ${summary.wins} برد تقسیم بر تمام بسته‌ها (از جمله سربه‌سر) است.`,
        columns: STANDARD_COLUMNS,
        rows: [...rowsFor(byStatus), ...rowsFor(byResult)],
      };
    }
    case 'sessions':
      return {
        title: 'عملکرد بر اساس سشن',
        description: 'از سشن معامله یا نوع سشن ژورنال استفاده می‌شود؛ رکوردهای چندسشن در هر گروه یک‌بار شمرده می‌شوند.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('sessions')),
      };
    case 'time': {
      const weekdayLabels = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
      const weekdays = groupTrades(trades, index, trade => {
        const parts = getTradingDateParts(trade.openedAt, timeConfig);
        return [[`day-${parts.dayOfWeek}`, weekdayLabels[parts.dayOfWeek]]];
      });
      const hours = groupTrades(trades, index, trade => {
        const hour = getTradingDateParts(trade.openedAt, timeConfig).hour;
        const label = `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
        return [[`hour-${hour}`, label]];
      });
      const order = (groups: typeof weekdays) => groups.sort((a, b) => {
        const ai = Number(a.key.split('-').at(-1));
        const bi = Number(b.key.split('-').at(-1));
        return ai - bi;
      });
      return {
        title: 'عملکرد بر اساس زمان',
        description: `زمان بازشدن معامله با منطقهٔ زمانی معاملاتی فعلی گروه‌بندی شده است (${timeConfig.mode === 'broker' ? `کارگزار UTC${timeConfig.brokerUtcOffsetMinutes >= 0 ? '+' : ''}${timeConfig.brokerUtcOffsetMinutes / 60}` : 'دستگاه'}).`,
        columns: STANDARD_COLUMNS,
        rows: [...rowsFor(order(weekdays)), ...rowsFor(order(hours))],
      };
    }
    case 'strategies':
      return {
        title: 'عملکرد استراتژی',
        description: 'شناسهٔ استراتژی معامله یا سشن؛ «بدون استراتژی» دادهٔ خالی واقعی است.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('strategies')),
      };
    case 'setups':
      return {
        title: 'ستاپ و سناریو',
        description: 'ستاپ و درجهٔ ستاپ از معامله و دادهٔ ژورنال؛ سناریوهای نوشتاری بدون شناسهٔ استاندارد در جست‌وجوی درس/سناریو قابل فیلترند.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('setups')),
      };
    case 'mtf': {
      const groups = groupTrades(trades, index, (_trade, dimensions) => [
        ...new Set([
          ...dimensions.analyses.map(item => item.timeframeOptionId),
          ...dimensions.triggers.map(item => item.timeframeOptionId),
        ]),
      ].map(id => [id, optionLabel(index, id) ?? `تایم‌فریم حذف‌شده (${id.slice(0, 8)})`]));
      return {
        title: 'تحلیل چندتایم‌فریمی',
        description: 'معامله‌هایی که به چند تایم‌فریم ژورنال متصل‌اند در هر تایم‌فریم مرتبط نمایش داده می‌شوند؛ بنابراین جمع ردیف‌ها ممکن است از تعداد معامله‌ها بیشتر باشد.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(groups),
        multiAttributed: true,
      };
    }
    case 'psychology':
      return {
        title: 'روان‌شناسی و احساسات',
        description: 'احساس‌های ثبت‌شده در معامله و شناسه‌های روان‌شناسی ثبت‌شده در ژورنال؛ چندانتسابی.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('psychology')),
        multiAttributed: true,
      };
    case 'execution': {
      const qualityRows = groupTrades(trades, index, trade => {
        const value = index.journalDataByTradeId.get(trade.id)?.executionQuality;
        const band = value == null ? 'بدون ثبت' : value < 40 ? 'ضعیف (۰–۳۹)' : value < 70 ? 'متوسط (۴۰–۶۹)' : 'خوب (۷۰–۱۰۰)';
        return [[`execution-${band}`, band]];
      });
      const complianceRows = groupTrades(trades, index, trade => {
        const value = index.journalDataByTradeId.get(trade.id)?.strategyCompliance ?? 'بدون ثبت';
        return [[`compliance-${value}`, value === 'yes' ? 'مطابق پلن' : value === 'partially' ? 'تاحدی مطابق' : value === 'no' ? 'خلاف پلن' : 'بدون ثبت']];
      });
      const adherenceRows = groupTrades(trades, index, trade => {
        const value = trade.adherenceRating ?? 'unknown';
        const label = value === 'fully' ? 'کاملاً' : value === 'mostly' ? 'عمدتاً' : value === 'partially' ? 'تاحدی' : value === 'not' ? 'خیر' : 'بدون ثبت';
        return [[`adherence-${value}`, label]];
      });
      return {
        title: 'کیفیت اجرا و پایبندی',
        description: 'کیفیت اجرا از ۰ تا ۱۰۰ و پایبندی از امتیازهای ثبت‌شده؛ بخش‌های مختلف در ردیف‌های جداگانه‌اند.',
        columns: STANDARD_COLUMNS,
        rows: [...rowsFor(qualityRows), ...rowsFor(complianceRows), ...rowsFor(adherenceRows)],
      };
    }
    case 'mistakes':
      return {
        title: 'اشتباه‌های ثبت‌شده',
        description: 'بر پایهٔ شناسه‌های واقعی اشتباه در دادهٔ معاملهٔ ژورنال؛ چندانتسابی.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('mistakes')),
        multiAttributed: true,
      };
    case 'lessons': {
      const lessons = trades
        .filter(trade => Boolean(trade.lesson?.trim()))
        .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt))
        .map(trade => ({
          key: trade.id,
          cells: [
            trade.symbol,
            new Date(trade.openedAt).toLocaleDateString('fa-IR'),
            trade.lesson?.trim() ?? '',
            trade.status === 'closed' ? humanize(trade.result) : trade.status === 'open' ? 'باز' : 'لغوشده',
          ],
        }));
      return {
        title: 'درس‌های ثبت‌شده',
        description: 'فقط متن درس‌هایی که برای همین معامله ثبت شده‌اند؛ متن خالی با درس ساختگی جایگزین نمی‌شود.',
        columns: ['نماد', 'تاریخ بازشدن', 'درس ثبت‌شده', 'وضعیت / نتیجه'],
        rows: lessons,
      };
    }
    case 'tags':
      return {
        title: 'برچسب‌های معاملاتی',
        description: 'برچسب‌های ذخیره‌شده روی معامله؛ یک معامله با چند برچسب در هر برچسب یک‌بار شمرده می‌شود.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('tags')),
        multiAttributed: true,
      };
    case 'direction':
      return {
        title: 'خرید در برابر فروش',
        description: 'بر اساس جهت ثبت‌شده در معامله.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(byKey('directions')),
      };
    case 'instruments': {
      const groups = groupTrades(trades, index, trade => [[
        `${trade.market || 'بازار ثبت‌نشده'}::${trade.symbol || 'نماد ثبت‌نشده'}`,
        `${trade.symbol || 'نماد ثبت‌نشده'} — ${trade.market || 'بازار ثبت‌نشده'}`,
      ]]);
      return {
        title: 'نماد و بازار',
        description: 'گروه‌بندی بر اساس نماد و بازار همان‌طور که ثبت شده‌اند.',
        columns: STANDARD_COLUMNS,
        rows: rowsFor(groups),
      };
    }
  }
}

export function getCurrencyCodeForTrade(trade: Trade, index: ReportsCenterIndex): string {
  return currencyFor(trade, index);
}

export function buildPnlCurves(
  trades: Trade[],
  index: ReportsCenterIndex,
): Record<string, PnlCurvePoint[]> {
  const byCurrency = new Map<string, Trade[]>();
  for (const trade of trades) {
    if (!isClosed(trade) || getNetPnl(trade) === null) continue;
    const currency = currencyFor(trade, index);
    const rows = byCurrency.get(currency) ?? [];
    rows.push(trade);
    byCurrency.set(currency, rows);
  }
  return Object.fromEntries([...byCurrency.entries()].map(([currency, currencyTrades]) => {
    let cumulative = 0;
    const points = [...currencyTrades]
      .sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt))
      .map((trade, index) => {
        const netPnl = getNetPnl(trade) ?? 0;
        cumulative += netPnl;
        return {
          index: index + 1,
          date: new Date(trade.closedAt ?? trade.openedAt).toLocaleDateString('fa-IR'),
          symbol: trade.symbol,
          netPnl: round(netPnl),
          cumulativeNetPnl: round(cumulative),
        };
      });
    return [currency, points];
  }));
}

export function formatReportNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }).format(value);
}

export function getSectionDefinition(id: ReportSectionId) {
  return REPORT_SECTION_DEFINITIONS.find(section => section.id === id)!;
}
