import { describe, it, expect } from 'vitest';
import { computeMetrics, computeMetricsBy, getOutcome, stdDev, toPercent } from '../../core/metrics/engine';
import { computeWinRate, computeExpectancy, computeProfitFactor, computeRiskMetrics, computeTotalPnl } from '../../core/metrics';
import { calcBaseMetrics } from '../performanceService';
import { computeOverview } from '../dashboardOverview';
import { getQuickSummary } from '../analyticsEngine';
import { isWin, isLoss } from '../../lib/tradeHelpers';
import type { Trade } from '../../db/database';

const T0 = Date.UTC(2026, 8, 1, 10);
let n = 0;
const mk = (p: Partial<Trade>): Trade => ({
  id: `t${n++}`, symbol: 'EURUSD', strategyId: 's1', accountId: 'a1', status: 'closed', result: 'win',
  profitLoss: 100, rMultiple: 1, riskPercentage: 1,
  openedAt: T0 + n * 3_600_000, closedAt: T0 + n * 3_600_000 + 1_800_000,
  fees: 0, commission: 0, spread: 0, ...p,
} as unknown as Trade);

// سناریوی گزارش‌شده: +65 −30 +40 +25 +20 (خالص ۱۲۰$)
const reported = () => [65, -30, 40, 25, 20].map(v => mk({ profitLoss: v, rMultiple: v / 30, result: v > 0 ? 'win' : 'loss' }));

describe('computeMetrics — reported scenario', () => {
  const m = computeMetrics(reported(), { startBalance: 1000 });
  it('counts and rates', () => {
    expect([m.count, m.winCount, m.lossCount]).toEqual([5, 4, 1]);
    expect(m.winRate).toBeCloseTo(0.8);
  });
  it('money metrics (net)', () => {
    expect(m.netPnl).toBe(120);
    expect(m.grossProfit).toBe(150);
    expect(m.grossLoss).toBe(30);
    expect(m.profitFactor).toBeCloseTo(5);
    expect(m.avgWinPnl).toBeCloseTo(37.5);
    expect(m.avgLossPnl).toBe(-30);
    expect(m.payoffRatio).toBeCloseTo(1.25);
    expect(m.expectancyPnl).toBeCloseTo(24);
  });
  it('streaks and drawdown', () => {
    expect([m.maxWinStreak, m.maxLossStreak]).toEqual([3, 1]);
    expect(m.drawdown.percentage).toBeCloseTo((30 / 1065) * 100, 5);
  });
});

describe('classification is one rule: net P/L sign', () => {
  it('gross win eaten by costs is a loss everywhere', () => {
    const t = mk({ profitLoss: 5, commission: 8, result: 'win' });
    expect(getOutcome(t)).toBe('loss');
    expect(isLoss(t)).toBe(true);
    expect(isWin(t)).toBe(false);
    expect(computeMetrics([t]).lossCount).toBe(1);
  });
  it('falls back to result label only when P/L is missing', () => {
    expect(getOutcome(mk({ profitLoss: null, result: 'partial-win' }))).toBe('win');
    expect(getOutcome(mk({ profitLoss: null, result: 'open' }))).toBeNull();
  });
  it('ignores open trades and handles empty input', () => {
    const m = computeMetrics([mk({ status: 'open' })]);
    expect(m.count).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.profitFactor).toBeNull();
  });
});

describe('R metrics', () => {
  const t = [[200, 2], [-100, -1], [300, 3], [-150, -1.5]].map(([pnl, r]) =>
    mk({ profitLoss: pnl, rMultiple: r, result: pnl > 0 ? 'win' : 'loss' }));
  const m = computeMetrics(t);
  it('expectancy, averages, profit factor', () => {
    expect(m.expectancyR).toBeCloseTo(0.625);
    expect(m.avgWinR).toBeCloseTo(2.5);
    expect(m.avgLossR).toBeCloseTo(-1.25);
    expect(m.profitFactorR).toBeCloseTo(2);
    expect(m.totalR).toBeCloseTo(2.5);
  });
  it('uses sample standard deviation', () => {
    expect(stdDev([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(5 / 3));
    expect(stdDev([1, 2, Number.NaN])).toBeCloseTo(Math.sqrt(0.5));
    expect(m.sharpeR).toBeCloseTo(0.625 / (stdDev([2, -1, 3, -1.5]) as number));
  });
  it('R drawdown', () => {
    const d = computeMetrics([1, -2, -1, 3, -1].map(r => mk({ profitLoss: r * 10, rMultiple: r })));
    expect(d.maxDrawdownR).toBe(3);
    expect(d.maxLossStreak).toBe(2);
  });

  it('derives missing R from net P&L and uses the R sample for Kelly', () => {
    const rTrades = [
      mk({ profitLoss: 200, rMultiple: 2, result: 'win' }),
      mk({ profitLoss: -150, rMultiple: -1.5, result: 'loss' }),
      mk({ profitLoss: 100, rMultiple: null, riskAmount: null, result: 'win' }),
    ];
    const metrics = computeMetrics(rTrades);
    expect(metrics.kellyPct).toBeCloseTo((0.5 / 1.5 - 0.5 / 2) * 100);

    const derived = computeMetrics([
      mk({ profitLoss: 50, fees: 5, riskAmount: 100, rMultiple: null, result: 'win' }),
    ]);
    expect(derived.avgR).toBeCloseTo(0.45);
  });
});

describe('computeMetricsBy', () => {
  it('groups in first-seen order', () => {
    const g = computeMetricsBy([mk({ symbol: 'A' }), mk({ symbol: 'B', profitLoss: -5, result: 'loss' }), mk({ symbol: 'A' })], t => t.symbol);
    expect(g.map(x => [x.key, x.metrics.count])).toEqual([['A', 2], ['B', 1]]);
  });
  it('toPercent', () => {
    expect(toPercent(0.8)).toBe(80);
    expect(toPercent(null)).toBeNull();
  });
});

describe('every entry point returns the same numbers', () => {
  const t = reported();
  const m = computeMetrics(t, { startBalance: 1000 });
  it('core wrappers', () => {
    expect(computeWinRate(t).winRate).toBeCloseTo(m.winRate!);
    expect(computeExpectancy(t).expectancyPnl).toBeCloseTo(m.expectancyPnl!);
    expect(computeProfitFactor(t).profitFactor).toBeCloseTo(m.profitFactor!);
    expect(computeRiskMetrics(t).avgR).toBeCloseTo(m.avgR!);
    expect(computeTotalPnl(t)).toBe(m.netPnl);
  });
  it('performanceService.calcBaseMetrics', () => {
    const b = calcBaseMetrics(t);
    expect(b.winRate).toBeCloseTo(m.winRate!);
    expect(b.profitFactor).toBeCloseTo(m.profitFactor!);
    expect(b.totalPnL).toBe(m.netPnl);
    expect(b.expectancy).toBeCloseTo(m.expectancyR!);
  });
  it('dashboardOverview', () => {
    const o = computeOverview(t, id => id, { startBalance: 1000 });
    expect(o.kpis.winRate).toBeCloseTo(m.winRate! * 100);
    expect(o.kpis.profitFactor).toBeCloseTo(m.profitFactor!);
    expect(o.kpis.totalPnl).toBe(m.netPnl);
    expect(o.kpis.maxDrawdownPct).toBeCloseTo(m.drawdown.percentage!);
  });
  it('analyticsEngine.getQuickSummary', () => {
    const q = getQuickSummary(t);
    expect(q.winRate).toBeCloseTo(m.winRate!);
    expect(q.totalPnL).toBe(m.netPnl);
  });
});
