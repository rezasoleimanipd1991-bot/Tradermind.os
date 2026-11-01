/**
 * analytics.worker.ts — PART 6 / Prompt 3
 *
 * Web Worker برای محاسبات سنگین analytics روی thread جداگانه.
 * جلوگیری از freeze شدن UI هنگام محاسبه.
 *
 * ارتباط: postMessage → Worker → Result → React State
 */

import { Trade } from '../db/database';
import { isClosed } from '../lib/tradeHelpers';
import { getTradingDateParts } from '../lib/tradingTime';
import { computeMetrics, computeMetricsBy, getMetricExtremesBy, getR, mean as avg, median, stdDev } from '../core/metrics/engine';
import { computePnlCurve } from '../core/metrics/pnl';
import { computeRiskMetrics } from '../core/metrics/riskMetrics';
import type { TradingTimeConfig } from '../lib/tradingTime';

// ── Message Types ─────────────────────────────────────────────────────────────

export type WorkerRequest =
  | { type: 'COMPUTE_EDGE'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_PERFORMANCE'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_RISK'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_STATISTICS'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_ALL'; trades: Trade[]; timeConfig?: TradingTimeConfig };

export type WorkerResponse =
  | { type: 'EDGE_RESULT'; data: EdgeAnalyticsResult }
  | { type: 'PERFORMANCE_RESULT'; data: PerformanceResult }
  | { type: 'RISK_RESULT'; data: RiskResult }
  | { type: 'STATISTICS_RESULT'; data: StatisticsResult }
  | { type: 'ALL_RESULT'; data: { edge: EdgeAnalyticsResult; performance: PerformanceResult; risk: RiskResult; statistics: StatisticsResult } }
  | { type: 'ERROR'; message: string };

// ── Result Types ──────────────────────────────────────────────────────────────

export interface EdgeAnalyticsResult {
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgR: number | null;
  bestSymbol: string | null;
  bestSession: string | null;
  bestDayOfWeek: string | null;
  bySymbol: { symbol: string; winRate: number | null; count: number }[];
  bySession: { session: string; winRate: number | null; count: number }[];
}

export interface PerformanceResult {
  totalPnl: number;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
  pnlCurve: { index: number; cumulative: number }[];
}

export interface RiskResult {
  avgRisk: number | null;
  maxRisk: number | null;
  riskConsistency: number | null;
  kellyPct: number | null;
  sharpeRatio: number | null;
  rMultipleDistribution: { r: string; count: number }[];
}

export interface StatisticsResult {
  medianR: number | null;
  stdDevR: number | null;
  skewness: number | null;
  kurtosis: number | null;
  sampleSize: number;
  confidenceInterval: { lower: number; upper: number } | null;
}

// ── Computation Functions ─────────────────────────────────────────────────────

function computeEdge(trades: Trade[], timeConfig?: TradingTimeConfig): EdgeAnalyticsResult {
  const closed = trades.filter(isClosed);
  const m = computeMetrics(closed);

  const bySymbol = computeMetricsBy(closed, t => t.symbol)
    .map(({ key, metrics }) => ({ symbol: key, winRate: metrics.winRate, count: metrics.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  // بهترین نماد/سشن/روز با «یک معیار و یک تابع مشترک»: میانگین R، حداقل ۳ معامله‌ی دارای R، ترتیب قطعی
  const bestSymbol = getMetricExtremesBy(closed, t => t.symbol, 'avgR', 3).best?.key ?? null;

  const bySession = computeMetricsBy(closed, t => t.tradingSession ?? 'unknown')
    .map(({ key, metrics }) => ({ session: key, winRate: metrics.winRate, count: metrics.count }));
  const bestSession = getMetricExtremesBy(closed, t => t.tradingSession ?? 'unknown', 'avgR', 3).best?.key ?? null;

  // Best day of week
  const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const bestDayGroup = getMetricExtremesBy(
    closed,
    trade => getTradingDateParts(trade.openedAt, timeConfig).dayOfWeek,
    'avgR',
    3,
  ).best;
  const bestDayOfWeek = bestDayGroup ? DAYS[Number(bestDayGroup.key)] : null;

  return {
    winRate: m.winRate, expectancy: m.expectancyR, profitFactor: m.profitFactor, avgR: m.avgR,
    bestSymbol, bestSession, bestDayOfWeek, bySymbol, bySession,
  };
}

function computePerformance(trades: Trade[]): PerformanceResult {
  // همه‌ی اعداد از موتور واحد (سود خالص، ترتیب closedAt). Worker سرمایه‌ی اولیه ندارد؛
  // پس درصد Drawdown null است و فقط مقدار مطلق معتبر است.
  const m = computeMetrics(trades);
  return {
    totalPnl: m.netPnl,
    maxDrawdown: m.drawdown.absolute,
    maxDrawdownPct: m.drawdown.percentage,
    avgWin: m.avgWinPnl,
    avgLoss: m.avgLossPnl,
    largestWin: m.maxWinPnl,
    largestLoss: m.maxLossPnl,
    consecutiveWins: m.maxWinStreak,
    consecutiveLosses: m.maxLossStreak,
    pnlCurve: computePnlCurve(trades).map(p => ({ index: p.index, cumulative: p.cumulative })),
  };
}

function computeRisk(trades: Trade[]): RiskResult {
  const closed = trades.filter(isClosed);
  const risks = closed.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
  const r = computeRiskMetrics(trades);
  return {
    avgRisk: r.avgRiskPct,
    maxRisk: risks.length ? Math.max(...risks) : null,
    riskConsistency: r.riskConsistency,
    kellyPct: r.kellyPct,
    sharpeRatio: r.sharpeRatio,
    rMultipleDistribution: r.rMultipleDistribution,
  };
}

function computeStatistics(trades: Trade[]): StatisticsResult {
  const closed = trades.filter(isClosed);
  const Rs = closed.map(getR).filter((r): r is number => r !== null);
  const n = Rs.length;
  const m = avg(Rs);
  const sd = stdDev(Rs);
  const med = median(Rs);

  let skewness: number | null = null;
  let kurtosis: number | null = null;
  if (m !== null && sd !== null && sd > 0 && n >= 3) {
    skewness = Rs.reduce((s, v) => s + Math.pow((v - m) / sd, 3), 0) / n;
  }
  if (m !== null && sd !== null && sd > 0 && n >= 4) {
    kurtosis = Rs.reduce((s, v) => s + Math.pow((v - m) / sd, 4), 0) / n - 3;
  }

  // 95% CI
  let confidenceInterval: { lower: number; upper: number } | null = null;
  if (m !== null && sd !== null && n >= 5) {
    const se = sd / Math.sqrt(n);
    confidenceInterval = { lower: m - 1.96 * se, upper: m + 1.96 * se };
  }

  return { medianR: med, stdDevR: sd, skewness, kurtosis, sampleSize: n, confidenceInterval };
}

// ── Worker Message Handler ─────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const { type, trades } = event.data;
    switch (type) {
      case 'COMPUTE_EDGE':
        self.postMessage({ type: 'EDGE_RESULT', data: computeEdge(trades, event.data.timeConfig) } as WorkerResponse);
        break;
      case 'COMPUTE_PERFORMANCE':
        self.postMessage({ type: 'PERFORMANCE_RESULT', data: computePerformance(trades) } as WorkerResponse);
        break;
      case 'COMPUTE_RISK':
        self.postMessage({ type: 'RISK_RESULT', data: computeRisk(trades) } as WorkerResponse);
        break;
      case 'COMPUTE_STATISTICS':
        self.postMessage({ type: 'STATISTICS_RESULT', data: computeStatistics(trades) } as WorkerResponse);
        break;
      case 'COMPUTE_ALL':
        self.postMessage({
          type: 'ALL_RESULT',
          data: {
          edge: computeEdge(trades, event.data.timeConfig),
            performance: computePerformance(trades),
            risk: computeRisk(trades),
            statistics: computeStatistics(trades),
          },
        } as WorkerResponse);
        break;
      default:
        self.postMessage({ type: 'ERROR', message: `Unknown type: ${(event.data as any).type}` } as WorkerResponse);
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err instanceof Error ? err.message : String(err) } as WorkerResponse);
  }
};
