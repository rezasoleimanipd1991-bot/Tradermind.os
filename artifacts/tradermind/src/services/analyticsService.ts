/**
 * analyticsService — لایه تحلیل داده (بدون وابستگی به UI یا Dexie)
 * تمام توابع pure هستند و قابل Unit Test.
 */
import { Trade, DailyJournal, Strategy } from '../db/database';
import { isWin, isLoss, isClosed, toDateStr } from '../lib/tradeHelpers';
import {
  getTradingDateParts,
  getTradingDayStart,
  getTradingMonthStart,
  getTradingTimestampForParts,
} from '../lib/tradingTime';
import { winRateOf, avgROf, computeMetrics, computeMetricsBy, rankMetricGroups, type TradeMetrics } from '../core/metrics/engine';
import { computePnlCurve } from '../core/metrics/pnl';

// ================================================================
// Types
// ================================================================

export type TimeRangeKey = 'today' | 'week' | 'month' | '3months' | 'year' | 'custom';

export interface TradeSummary {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  open: number;
  winRate: number;       // درصد از معاملات بسته
  totalPnl: number;
  avgR: number | null;
  avgRisk: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
}

export interface StrategyPerf {
  strategyId: string | null;
  strategyName: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgR: number | null;
  avgAdherence: number | null; // درصد ۰-۱۰۰
}

export interface DayOfWeekPerf {
  day: number;      // 0=یکشنبه, 6=شنبه
  dayName: string;
  total: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  avgR: number | null;
}

export interface EmotionPerf {
  emotion: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number | null;
}

export interface DailyStateGroup {
  total: number;
  wins: number;
  winRate: number;
  totalPnl: number;
}

export interface DailyStatePerf {
  highStress: DailyStateGroup;
  lowStress: DailyStateGroup;
  highEnergy: DailyStateGroup;
  lowEnergy: DailyStateGroup;
  highFocus: DailyStateGroup;
  lowFocus: DailyStateGroup;
}

export interface AdherencePerf {
  rating: 'fully' | 'mostly' | 'partially' | 'not' | 'unknown';
  label: string;
  total: number;
  wins: number;
  winRate: number;
  totalPnl: number;
  avgR: number | null;
}

export interface TimeSlotPerf {
  slot: string;
  slotStart: number;
  total: number;
  wins: number;
  winRate: number;
  totalPnl: number;
}

export interface BehaviorInsight {
  consecutiveLosses: number;
  consecutiveWins: number;
  afterLoss: { count: number; winRateAfterLoss: number };
  afterWin: { count: number; winRateAfterWin: number };
}

export interface InsightCard {
  text: string;
  type: 'positive' | 'negative' | 'neutral';
}

export interface PnlPoint {
  index: number;
  symbol: string;
  pnl: number;
  cumulative: number;
}

export interface AnalyticsData {
  summary: TradeSummary;
  pnlCurve: PnlPoint[];
  strategyPerf: StrategyPerf[];
  dayOfWeekPerf: DayOfWeekPerf[];
  emotionPerf: EmotionPerf[];
  dailyStatePerf: DailyStatePerf | null;
  adherencePerf: AdherencePerf[];
  timeSlotPerf: TimeSlotPerf[];
  behaviorInsight: BehaviorInsight;
  insights: InsightCard[];
}

// ================================================================
// Helpers
// ================================================================

const PERSIAN_DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
// ترتیب فارسی هفته: شنبه=6، یکشنبه=0، ...، جمعه=5
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

function calcWinRate(trades: Trade[]): number {
  const r = winRateOf(trades); // موتور واحد
  return r === null ? 0 : r * 100;
}

function calcAvgR(trades: Trade[]): number | null {
  return avgROf(trades); // موتور واحد
}

function calcTotalPnl(trades: Trade[]): number {
  return computeMetrics(trades).netPnl; // موتور واحد (سود خالص)
}

function parseEmotions(json: string): string[] {
  try { return JSON.parse(json) || []; } catch { return []; }
}

function makeDailyStateGroup(ts: Trade[]): DailyStateGroup {
  const cl = ts.filter(isClosed);
  return {
    total: ts.length,
    wins: cl.filter(isWin).length,
    winRate: calcWinRate(ts),
    totalPnl: calcTotalPnl(ts),
  };
}

// ================================================================
// Date Range
// ================================================================

export function getDateRange(key: Exclude<TimeRangeKey, 'custom'>): { from: number; to: number } {
  const now = Date.now();
  const parts = getTradingDateParts(now);
  const todayStart = getTradingDayStart(now);
  const to = now;

  switch (key) {
    case 'today':
      return { from: todayStart, to };
    case 'week': {
      const sinceSaturday = (parts.dayOfWeek + 1) % 7;
      return {
        from: getTradingTimestampForParts(parts.year, parts.month, parts.day - sinceSaturday),
        to,
      };
    }
    case 'month':
      return { from: getTradingMonthStart(now), to };
    case '3months': {
      const targetMonth = new Date(Date.UTC(parts.year, parts.month - 3, 1));
      const lastTargetDay = new Date(Date.UTC(
        targetMonth.getUTCFullYear(),
        targetMonth.getUTCMonth() + 1,
        0,
      )).getUTCDate();
      return {
        from: getTradingTimestampForParts(
          targetMonth.getUTCFullYear(),
          targetMonth.getUTCMonth(),
          Math.min(parts.day, lastTargetDay),
        ),
        to,
      };
    }
    case 'year':
      return { from: getTradingTimestampForParts(parts.year, 0, 1), to };
    default:
      return { from: 0, to };
  }
}

export function filterTradesByRange(trades: Trade[], from: number, to: number): Trade[] {
  return trades.filter(t => t.openedAt >= from && t.openedAt <= to);
}

// ================================================================
// Main Computation
// ================================================================

export function computeAnalytics(
  trades: Trade[],
  allJournals: DailyJournal[],
  strategies: Strategy[],
): AnalyticsData {
  const strategyMap = new Map<string, string>(strategies.map(s => [s.id, s.name]));
  const closed = trades.filter(isClosed);
  const summaryMetrics = computeMetrics(trades);

  // ---- Summary ----
  const summary: TradeSummary = {
    total: trades.length,
    wins: summaryMetrics.winCount,
    losses: summaryMetrics.lossCount,
    breakeven: summaryMetrics.breakEvenCount,
    open: trades.filter(t => t.status === 'open').length,
    winRate: calcWinRate(trades),
    totalPnl: summaryMetrics.netPnl,
    avgR: summaryMetrics.avgR,
    avgRisk: summaryMetrics.avgRiskPct,
    bestTrade: summaryMetrics.bestPnl,
    worstTrade: summaryMetrics.worstPnl,
  };

  // ---- P/L Curve ----
  const pnlCurve: PnlPoint[] = computePnlCurve(closed).map(point => ({
    index: point.index,
    symbol: point.symbol,
    pnl: +point.pnl.toFixed(2),
    cumulative: +point.cumulative.toFixed(2),
  }));

  // ---- Strategy Performance ----
  const stratGroups = new Map<string | null, Trade[]>();
  trades.forEach(t => {
    const k = t.strategyId || null;
    if (!stratGroups.has(k)) stratGroups.set(k, []);
    stratGroups.get(k)!.push(t);
  });
  const strategyPerf: StrategyPerf[] = [];
  for (const [id, ts] of stratGroups) {
    const metrics = computeMetrics(ts);
    const cl2 = ts.filter(isClosed);
    const withScore = cl2.filter(t => t.adherenceScore != null);
    strategyPerf.push({
      strategyId: id,
      strategyName: id ? (strategyMap.get(id) || 'استراتژی ناشناخته') : 'بدون استراتژی',
      total: ts.length,
      wins: metrics.winCount,
      losses: metrics.lossCount,
      winRate: metrics.winRate === null ? 0 : metrics.winRate * 100,
      totalPnl: metrics.netPnl,
      avgR: metrics.avgR,
      avgAdherence: withScore.length ? withScore.reduce((s, t) => s + (t.adherenceScore || 0), 0) / withScore.length : null,
    });
  }
  strategyPerf.sort((a, b) => b.total - a.total);

  // ---- Day of Week ----
  const dayMetricGroups = computeMetricsBy(
    trades,
    trade => getTradingDateParts(trade.openedAt).dayOfWeek,
  );
  const dayOfWeekPerf: DayOfWeekPerf[] = dayMetricGroups
    .map(({ key, metrics }) => ({
      day: Number(key),
      dayName: PERSIAN_DAYS[Number(key)],
      total: metrics.count,
      wins: metrics.winCount,
      winRate: metrics.winRate === null ? 0 : metrics.winRate * 100,
      totalPnl: metrics.netPnl,
      avgR: metrics.avgR,
    }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day))
    .filter(d => d.total > 0);

  // ---- Emotion Performance ----
  const emotionGroups = new Map<string, Trade[]>();
  trades.forEach(t => {
    parseEmotions(t.emotions).forEach(e => {
      if (!emotionGroups.has(e)) emotionGroups.set(e, []);
      emotionGroups.get(e)!.push(t);
    });
  });
  const emotionPerf: EmotionPerf[] = [];
  for (const [emotion, ts] of emotionGroups) {
    const cl2 = ts.filter(isClosed);
    emotionPerf.push({
      emotion,
      total: ts.length,
      wins: cl2.filter(isWin).length,
      losses: cl2.filter(isLoss).length,
      winRate: calcWinRate(ts),
      avgR: calcAvgR(cl2),
    });
  }
  emotionPerf.sort((a, b) => b.total - a.total);

  // ---- Daily State Performance ----
  const journalByDate = new Map<string, DailyJournal>(allJournals.map(j => [j.date, j]));
  const tradePairs: { trade: Trade; journal: DailyJournal }[] = [];
  trades.forEach(t => {
    const j = journalByDate.get(toDateStr(t.openedAt));
    if (j) tradePairs.push({ trade: t, journal: j });
  });

  const dailyStatePerf: DailyStatePerf | null = tradePairs.length >= 5 ? {
    highStress: makeDailyStateGroup(tradePairs.filter(x => x.journal.stressLevel >= 7).map(x => x.trade)),
    lowStress:  makeDailyStateGroup(tradePairs.filter(x => x.journal.stressLevel <= 3).map(x => x.trade)),
    highEnergy: makeDailyStateGroup(tradePairs.filter(x => x.journal.energyLevel >= 7).map(x => x.trade)),
    lowEnergy:  makeDailyStateGroup(tradePairs.filter(x => x.journal.energyLevel <= 3).map(x => x.trade)),
    highFocus:  makeDailyStateGroup(tradePairs.filter(x => x.journal.focusLevel >= 7).map(x => x.trade)),
    lowFocus:   makeDailyStateGroup(tradePairs.filter(x => x.journal.focusLevel <= 3).map(x => x.trade)),
  } : null;

  // ---- Adherence Performance ----
  const ADHERE_LABELS: Record<string, string> = {
    fully: 'پایبندی کامل', mostly: 'پایبندی زیاد',
    partially: 'پایبندی متوسط', not: 'پایبندی کم', unknown: 'نامشخص',
  };
  const adherenceGroups = new Map<string, Trade[]>();
  trades.forEach(t => {
    const k = t.adherenceRating || 'unknown';
    if (!adherenceGroups.has(k)) adherenceGroups.set(k, []);
    adherenceGroups.get(k)!.push(t);
  });
  const adherencePerf: AdherencePerf[] = ['fully', 'mostly', 'partially', 'not', 'unknown']
    .filter(k => adherenceGroups.has(k))
    .map(k => {
      const ts = adherenceGroups.get(k)!;
      const cl2 = ts.filter(isClosed);
      return { rating: k as AdherencePerf['rating'], label: ADHERE_LABELS[k], total: ts.length, wins: cl2.filter(isWin).length, winRate: calcWinRate(ts), totalPnl: calcTotalPnl(ts), avgR: calcAvgR(cl2) };
    });

  // ---- Time Slot Performance ----
  const TIME_SLOTS = [
    { label: '۰۰–۰۶', start: 0 }, { label: '۰۶–۰۹', start: 6 },
    { label: '۰۹–۱۲', start: 9 }, { label: '۱۲–۱۵', start: 12 },
    { label: '۱۵–۱۸', start: 15 }, { label: '۱۸–۲۱', start: 18 },
    { label: '۲۱–۰۰', start: 21 },
  ];
  const slotGroups: Map<number, Trade[]> = new Map(TIME_SLOTS.map(s => [s.start, []]));
  trades.forEach(t => {
    const h = getTradingDateParts(t.openedAt).hour;
    const slot = [...TIME_SLOTS].reverse().find(s => h >= s.start)!;
    slotGroups.get(slot.start)!.push(t);
  });
  const timeSlotPerf: TimeSlotPerf[] = TIME_SLOTS
    .filter(s => (slotGroups.get(s.start)?.length || 0) > 0)
    .map(s => {
      const ts = slotGroups.get(s.start)!;
      const cl2 = ts.filter(isClosed);
      return { slot: s.label, slotStart: s.start, total: ts.length, wins: cl2.filter(isWin).length, winRate: calcWinRate(ts), totalPnl: calcTotalPnl(ts) };
    });

  // ---- Behavioral Patterns ----
  const sorted = [...closed].sort((a, b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt));
  let maxCL = 0, maxCW = 0, cL = 0, cW = 0;
  sorted.forEach(t => {
    if (isLoss(t)) { cL++; cW = 0; if (cL > maxCL) maxCL = cL; }
    else if (isWin(t)) { cW++; cL = 0; if (cW > maxCW) maxCW = cW; }
    else { cL = 0; cW = 0; }
  });
  let aLC = 0, aLW = 0, aWC = 0, aWW = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (isLoss(sorted[i - 1])) { aLC++; if (isWin(sorted[i])) aLW++; }
    if (isWin(sorted[i - 1]))  { aWC++; if (isWin(sorted[i])) aWW++; }
  }
  const behaviorInsight: BehaviorInsight = {
    consecutiveLosses: maxCL,
    consecutiveWins: maxCW,
    afterLoss: { count: aLC, winRateAfterLoss: aLC > 0 ? (aLW / aLC) * 100 : 0 },
    afterWin:  { count: aWC, winRateAfterWin:  aWC > 0 ? (aWW / aWC) * 100 : 0 },
  };

  // ---- Insights ----
  const insights = generateInsights({
    summary,
    adherencePerf,
    emotionPerf,
    dayOfWeekPerf,
    dayMetricGroups,
    dailyStatePerf,
    behaviorInsight,
  });

  return { summary, pnlCurve, strategyPerf, dayOfWeekPerf, emotionPerf, dailyStatePerf, adherencePerf, timeSlotPerf, behaviorInsight, insights };
}

// ================================================================
// Insights Generator
// ================================================================

function generateInsights(data: {
  summary: TradeSummary;
  adherencePerf: AdherencePerf[];
  emotionPerf: EmotionPerf[];
  dayOfWeekPerf: DayOfWeekPerf[];
  dayMetricGroups: Array<{ key: string | number; metrics: TradeMetrics }>;
  dailyStatePerf: DailyStatePerf | null;
  behaviorInsight: BehaviorInsight;
}): InsightCard[] {
  const insights: InsightCard[] = [];
  const { summary, adherencePerf, emotionPerf, dayOfWeekPerf, dayMetricGroups, dailyStatePerf, behaviorInsight } = data;

  if (summary.total < 5) {
    insights.push({ type: 'neutral', text: 'برای مشاهده الگوهای معنادار، به ثبت معاملات بیشتر نیاز است.' });
    return insights;
  }

  const wr = summary.winRate;

  // Adherence
  const fully = adherencePerf.find(a => a.rating === 'fully');
  const notA  = adherencePerf.find(a => a.rating === 'not');
  if (fully && fully.total >= 5) {
    insights.push({
      type: fully.winRate >= wr ? 'positive' : 'neutral',
      text: `در ${fully.total} معامله‌ای که با پایبندی کامل به استراتژی انجام شده، درصد برد ${fully.winRate.toFixed(0)}٪ ثبت شده است.`,
    });
  }
  if (fully && notA && fully.total >= 5 && notA.total >= 5 && Math.abs(fully.winRate - notA.winRate) >= 10) {
    insights.push({
      type: fully.winRate > notA.winRate ? 'positive' : 'negative',
      text: `تفاوت ${Math.abs(fully.winRate - notA.winRate).toFixed(0)} درصدی بین پایبندی کامل (${fully.winRate.toFixed(0)}٪) و پایبندی کم (${notA.winRate.toFixed(0)}٪) در داده‌های ثبت‌شده مشاهده شده است.`,
    });
  }

  // Emotions
  emotionPerf.filter(e => e.total >= 3 && e.winRate > wr + 15).slice(0, 1).forEach(e => {
    insights.push({ type: 'positive', text: `در معاملات دارای برچسب «${e.emotion}»، درصد برد ثبت‌شده (${e.winRate.toFixed(0)}٪) بالاتر از میانگین کلی (${wr.toFixed(0)}٪) بوده است.` });
  });
  emotionPerf.filter(e => e.total >= 3 && e.winRate < wr - 15).slice(0, 2).forEach(e => {
    insights.push({ type: 'negative', text: `در معاملات دارای برچسب «${e.emotion}»، درصد برد ثبت‌شده (${e.winRate.toFixed(0)}٪) پایین‌تر از میانگین کلی (${wr.toFixed(0)}٪) بوده است.` });
  });

  // Daily state
  if (dailyStatePerf) {
    const hs = dailyStatePerf.highStress; const ls = dailyStatePerf.lowStress;
    if (hs.total >= 5 && ls.total >= 5 && Math.abs(ls.winRate - hs.winRate) >= 10) {
      insights.push({ type: 'neutral', text: `در روزهای با استرس پایین، درصد برد ${ls.winRate.toFixed(0)}٪ در مقابل ${hs.winRate.toFixed(0)}٪ در روزهای با استرس بالا بوده است.` });
    }
  }

  // Best/worst day
  const reliableDays = dayMetricGroups.filter(group => group.metrics.rCount >= 3);
  const dayExtremes = rankMetricGroups(reliableDays, 'avgR', 3);
  if (reliableDays.length >= 3 && dayExtremes.best && dayExtremes.worst) {
    const best = dayOfWeekPerf.find(day => day.day === Number(dayExtremes.best!.key));
    const worst = dayOfWeekPerf.find(day => day.day === Number(dayExtremes.worst!.key));
    const bestR = dayExtremes.best.metrics.avgR;
    const worstR = dayExtremes.worst.metrics.avgR;
    if (best && worst && bestR !== null && worstR !== null && bestR - worstR >= 0.2) {
      insights.push({ type: 'neutral', text: `بر پایه میانگین R، بهترین عملکرد در روز ${best.dayName} (${bestR.toFixed(2)}R) و ضعیف‌ترین در روز ${worst.dayName} (${worstR.toFixed(2)}R) ثبت شده است.` });
    }
  }

  // Behavior
  if (behaviorInsight.consecutiveLosses >= 3) {
    insights.push({ type: 'neutral', text: `در داده‌های ثبت‌شده، حداکثر ${behaviorInsight.consecutiveLosses} معامله ضررده پشت سر هم مشاهده شده است.` });
  }
  if (behaviorInsight.afterLoss.count >= 5) {
    const r = behaviorInsight.afterLoss.winRateAfterLoss;
    insights.push({ type: r < wr - 10 ? 'negative' : 'neutral', text: `در داده‌های ثبت‌شده، درصد برد معامله بعد از یک ضرر ${r.toFixed(0)}٪ بوده است.` });
  }

  if (insights.length === 0) {
    insights.push({ type: 'neutral', text: 'برای مشاهده الگوهای معنادار، به داده‌های بیشتری نیاز است. به معامله‌گری ادامه دهید و ژورنال خود را کامل کنید.' });
  }

  return insights;
}
