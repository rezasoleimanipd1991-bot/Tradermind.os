/**
 * profitFactor.ts — Profit Factor (wrapper روی engine.ts)
 *
 * Profit Factor = مجموع سودها / قدرمطلق مجموع ضررها (خالص). بالای ۱ سودده، بالای ۱.۵ خوب.
 */

import { Trade } from '../../db/database';
import { computeMetrics } from './engine';

export interface ProfitFactorResult {
  profitFactor: number | null;
  profitFactorR: number | null;   // بر اساس R
  totalWinPnl: number;
  totalLossPnl: number;
  totalWinR: number;
  totalLossR: number;
  grade: 'excellent' | 'good' | 'average' | 'poor' | 'insufficient';
}

export function computeProfitFactor(trades: Trade[]): ProfitFactorResult {
  const m = computeMetrics(trades);
  const pf = m.profitFactor;
  const grade: ProfitFactorResult['grade'] =
    pf === null ? 'insufficient' : pf >= 2 ? 'excellent' : pf >= 1.5 ? 'good' : pf >= 1 ? 'average' : 'poor';
  return {
    profitFactor: pf,
    profitFactorR: m.profitFactorR,
    totalWinPnl: m.grossProfit,
    totalLossPnl: m.grossLoss,
    totalWinR: m.grossProfitR,
    totalLossR: m.grossLossR,
    grade,
  };
}
