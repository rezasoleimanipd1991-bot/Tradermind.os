/**
 * riskMetrics.ts — معیارهای ریسک (wrapper روی engine.ts)
 */

import { Trade } from '../../db/database';
import { getR, computeMetrics } from './engine';
import { isClosed } from '../../lib/tradeHelpers';

export interface RiskMetricsResult {
  avgR: number | null;
  medianR: number | null;
  stdDevR: number | null;
  avgRiskPct: number | null;
  riskConsistency: number | null;   // CV٪ = stdDev/mean×100 (کمتر = بهتر)
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  kellyPct: number | null;          // Kelly Criterion
  rMultipleDistribution: { r: string; count: number }[];
}

export function computeRiskMetrics(trades: Trade[]): RiskMetricsResult {
  const m = computeMetrics(trades);

  // توزیع R-Multiple در bucket‌های ۰.۵
  const buckets = new Map<string, number>();
  for (const t of trades.filter(isClosed)) {
    const r = getR(t);
    if (r === null) continue;
    const bucket = (Math.round(r * 2) / 2).toFixed(1);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const rMultipleDistribution = [...buckets.entries()]
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
    .map(([r, count]) => ({ r, count }));

  return {
    avgR: m.avgR,
    medianR: m.medianR,
    stdDevR: m.stdDevR,
    avgRiskPct: m.avgRiskPct,
    riskConsistency: m.riskCV === null ? null : m.riskCV * 100,
    sharpeRatio: m.sharpeR,
    sortinoRatio: m.sortinoR,
    kellyPct: m.kellyPct,
    rMultipleDistribution,
  };
}
