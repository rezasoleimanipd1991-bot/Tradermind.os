/**
 * winRate.ts — نرخ برد (wrapper روی engine.ts؛ هیچ فرمول مستقلی در این فایل نیست)
 */

import { Trade } from '../../db/database';
import { getTradingDateParts } from '../../lib/tradingTime';
import { computeMetrics } from './engine';

export interface WinRateResult {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;  // 0-1
  lossRate: number | null; // 0-1
}

/** محاسبه نرخ برد/باخت */
export function computeWinRate(trades: Trade[]): WinRateResult {
  const m = computeMetrics(trades);
  return {
    total: m.count, wins: m.winCount, losses: m.lossCount, breakeven: m.breakEvenCount,
    winRate: m.winRate, lossRate: m.lossRate,
  };
}

/** Win Rate برای یک نماد خاص */
export function computeWinRateForSymbol(trades: Trade[], symbol: string): WinRateResult {
  return computeWinRate(trades.filter(t => t.symbol === symbol));
}

/** Win Rate برای یک استراتژی خاص */
export function computeWinRateForStrategy(trades: Trade[], strategyId: string): WinRateResult {
  return computeWinRate(trades.filter(t => t.strategyId === strategyId));
}

/** Win Rate به تفکیک روز هفته */
export function computeWinRateByDayOfWeek(trades: Trade[]): Array<{
  day: number;
  dayName: string;
  total: number;
  winRate: number | null;
}> {
  const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return DAYS.map((dayName, day) => {
    const r = computeWinRate(trades.filter(t => getTradingDateParts(t.openedAt).dayOfWeek === day));
    return { day, dayName, total: r.total, winRate: r.winRate };
  });
}

/** Win Rate در N معامله اخیر (برای نمایش روند) */
export function computeRecentWinRate(trades: Trade[], last = 5): number | null {
  const recent = trades
    .filter(t => t.status === 'closed')
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, last);
  return computeWinRate(recent).winRate;
}
