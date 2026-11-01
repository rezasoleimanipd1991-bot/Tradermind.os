/**
 * pnl.ts — محاسبات PnL (Profit & Loss)
 * PART 5 / Prompt 3 — Core Metrics Service
 *
 * قانون: هیچ سرویس دیگری نباید این فرمول‌ها را مجدداً پیاده کند.
 */

import { Trade } from '../../db/database';
import { getNetPnl } from '../../lib/tradeHelpers';
import { computeDrawdown, sortForEquity } from './drawdown';
import { computeMetrics } from './engine';

/** نقطه منحنی PnL */
export interface PnlPoint {
  index: number;
  tradeId: string;
  symbol: string;
  pnl: number;
  cumulative: number;
  date: number; // timestamp
}

/** منحنی PnL تجمعی (سود خالص، به ترتیب زمان بسته‌شدن) */
export function computePnlCurve(trades: Trade[]): PnlPoint[] {
  let cumulative = 0;
  return sortForEquity(trades).map((t, i) => {
    const pnl = getNetPnl(t) as number;
    cumulative += pnl;
    return {
      index: i + 1,
      tradeId: t.id,
      symbol: t.symbol,
      pnl,
      cumulative,
      date: t.closedAt ?? t.openedAt,
    };
  });
}

/** مجموع PnL خالص */
export function computeTotalPnl(trades: Trade[]): number {
  return computeMetrics(trades).netPnl;
}

/** بیشترین سود در یک معامله (خالص) */
export function computeMaxWin(trades: Trade[]): number | null {
  return computeMetrics(trades).maxWinPnl;
}

/** بیشترین ضرر در یک معامله (خالص، منفی) */
export function computeMaxLoss(trades: Trade[]): number | null {
  return computeMetrics(trades).maxLossPnl;
}

/**
 * حداکثر drawdown — wrapper روی پیاده‌سازی مرجع (drawdown.ts).
 * سود خالص، ترتیب closedAt، و درصد نسبت به قله‌ی همان لحظه (با لحاظ سرمایه‌ی اولیه).
 */
export function computeMaxDrawdown(
  trades: Trade[],
  startBalance?: number | null,
): { absolute: number; percentage: number | null } {
  const r = computeDrawdown(trades, { startBalance });
  return { absolute: r.absolute, percentage: r.percentage };
}

/** نسبت میانگین سود به میانگین ضرر (Payoff) */
export function computeRiskRewardRatio(trades: Trade[]): number | null {
  return computeMetrics(trades).payoffRatio;
}
