/**
 * analyticsCacheService.ts — PART 4 / Prompt 3
 *
 * کش نتایج analytics برای جلوگیری از محاسبه مجدد.
 * Cache در حافظه (Map) نگه‌داری می‌شود و با هر تغییر در DB invalidate می‌شود.
 */

import { getAllTradesForAnalytics } from '../core/repositories/tradeRepository';
import { isClosed } from '../lib/tradeHelpers';
import { computeMetrics, computeMetricsBy } from '../core/metrics/engine';
import { getTradingDateKey } from '../lib/tradingTime';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DailyStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnl: number;
  totalR: number | null;
}

export interface SymbolStats {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
  avgR: number | null;
}

export interface SessionStats {
  session: string;
  trades: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
}

export interface CachedAnalytics {
  // آمار کلی
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winRate: number | null;
  lossRate: number | null;
  profitFactor: number | null;
  averageR: number | null;
  expectancy: number | null;
  totalPnl: number;
  // آمار تفکیکی
  dailyStats: DailyStats[];
  symbolStats: SymbolStats[];
  sessionStats: SessionStats[];
  // متا
  computedAt: number;
  tradeCount: number;   // برای تشخیص stale بودن
}

// ── Cache State ────────────────────────────────────────────────────────────────

let _cache: CachedAnalytics | null = null;
let _isComputing = false;
let _computePromise: Promise<CachedAnalytics> | null = null;

// ── Compute ────────────────────────────────────────────────────────────────────

async function computeAnalyticsCache(): Promise<CachedAnalytics> {
  const trades = await getAllTradesForAnalytics();
  const closed = trades.filter(isClosed);
  // همه‌ی آمار از موتور واحد (core/metrics/engine.ts): سود خالص، طبقه‌بندی برد/باخت از علامت سود خالص
  const m = computeMetrics(closed);
  const n = m.count;
  const { winRate, lossRate, profitFactor, expectancyR: expectancy, netPnl: totalPnl } = m;
  const averageR = m.avgR;

  const dailyStats: DailyStats[] = computeMetricsBy(closed, t => getTradingDateKey(t.closedAt ?? t.openedAt))
    .map(({ key, metrics: d }) => ({
      date: key,
      trades: d.count,
      wins: d.winCount,
      losses: d.lossCount,
      winRate: d.winRate,
      totalPnl: d.netPnl,
      totalR: d.rCount ? d.totalR : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const symbolStats: SymbolStats[] = computeMetricsBy(closed, t => t.symbol)
    .map(({ key, metrics: s }) => ({
      symbol: key, trades: s.count, wins: s.winCount, winRate: s.winRate, totalPnl: s.netPnl, avgR: s.avgR,
    }))
    .sort((a, b) => b.trades - a.trades);

  const sessionStats: SessionStats[] = computeMetricsBy(closed, t => t.tradingSession ?? 'unknown')
    .map(({ key, metrics: s }) => ({
      session: key, trades: s.count, wins: s.winCount, winRate: s.winRate, totalPnl: s.netPnl,
    }));

  return {
    totalTrades: trades.length,
    closedTrades: n,
    openTrades: trades.filter(t => t.status === 'open').length,
    winRate,
    lossRate,
    profitFactor,
    averageR,
    expectancy,
    totalPnl,
    dailyStats,
    symbolStats,
    sessionStats,
    computedAt: Date.now(),
    tradeCount: trades.length,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * دریافت analytics از cache.
 * اگر cache خالی باشد، محاسبه می‌کند.
 */
export async function getCachedAnalytics(): Promise<CachedAnalytics> {
  if (_cache) return _cache;

  // اگر درحال محاسبه است، منتظر می‌ماند
  if (_computePromise) return _computePromise;

  _isComputing = true;
  _computePromise = computeAnalyticsCache()
    .then(result => {
      _cache = result;
      _isComputing = false;
      _computePromise = null;
      return result;
    })
    .catch(err => {
      _isComputing = false;
      _computePromise = null;
      throw err;
    });

  return _computePromise;
}

/**
 * Invalidate cache — بعد از هر تغییر در DB فراخوانی شود:
 * - ایجاد معامله
 * - ویرایش معامله
 * - حذف معامله
 * - import
 * - restore backup
 */
export function invalidateAnalyticsCache(): void {
  _cache = null;
  _computePromise = null;
  _isComputing = false;
}

/** آیا cache فعال است؟ */
export function isCacheValid(): boolean {
  return _cache !== null;
}

/** زمان آخرین محاسبه */
export function getCacheAge(): number | null {
  return _cache ? Date.now() - _cache.computedAt : null;
}

/** دریافت آمار سریع بدون محاسبه کامل */
export function getQuickStats(): Pick<CachedAnalytics, 'totalTrades' | 'winRate' | 'totalPnl'> | null {
  if (!_cache) return null;
  return {
    totalTrades: _cache.totalTrades,
    winRate: _cache.winRate,
    totalPnl: _cache.totalPnl,
  };
}
