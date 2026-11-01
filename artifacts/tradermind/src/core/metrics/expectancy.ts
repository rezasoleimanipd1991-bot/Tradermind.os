/**
 * expectancy.ts — Expectancy (wrapper روی engine.ts)
 *
 * Expectancy = میانگین نتیجه‌ی هر معامله (R یا پولی خالص). مثبت یعنی سیستم سودده است.
 */

import { Trade } from '../../db/database';
import { computeMetrics } from './engine';

export interface ExpectancyResult {
  expectancy: number | null;        // بر حسب R
  expectancyPnl: number | null;     // بر حسب مقدار مالی (خالص)
  avgWinR: number | null;
  avgLossR: number | null;
  avgWinPnl: number | null;
  avgLossPnl: number | null;
  winRate: number | null;
  lossRate: number | null;
  sampleSize: number;
}

export function computeExpectancy(trades: Trade[]): ExpectancyResult {
  const m = computeMetrics(trades);
  return {
    expectancy: m.expectancyR,
    expectancyPnl: m.expectancyPnl,
    avgWinR: m.avgWinR,
    avgLossR: m.avgLossR,
    avgWinPnl: m.avgWinPnl,
    avgLossPnl: m.avgLossPnl,
    winRate: m.winRate,
    lossRate: m.lossRate,
    sampleSize: m.count,
  };
}
