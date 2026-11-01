import { describe, it, expect } from 'vitest';
import { computeOverview } from '../dashboardOverview';
import type { Trade } from '../../db/database';

const T0 = Date.UTC(2026, 8, 1, 10);
let n = 0;
const mk = (p: Partial<Trade>): Trade => ({
  id: `t${n++}`, symbol: 'EURUSD', strategyId: 's1', status: 'closed', result: 'win',
  profitLoss: 100, rMultiple: 1, openedAt: T0 + n * 3600_000, closedAt: T0 + n * 3600_000 + 1800_000,
  fees: 0, commission: 0, spread: 0, ...p,
} as unknown as Trade);

describe('computeOverview', () => {
  it('returns nulls (never invented numbers) for no data', () => {
    const o = computeOverview([]);
    expect(o.kpis.winRate).toBeNull();
    expect(o.kpis.profitFactor).toBeNull();
    expect(o.kpis.maxDrawdownPct).toBeNull();
    expect(o.kpis.expectancyR).toBeNull();
    expect(o.equity).toEqual([]);
    expect(o.bestSymbol).toBeNull();
  });

  it('computes KPIs from net P/L', () => {
    const o = computeOverview([
      mk({ profitLoss: 200, rMultiple: 2 }),
      mk({ profitLoss: -100, rMultiple: -1, result: 'loss' }),
      mk({ profitLoss: 300, rMultiple: 3 }),
      mk({ profitLoss: -150, rMultiple: -1.5, result: 'loss' }),
    ]);
    expect(o.kpis.totalTrades).toBe(4);
    expect(o.kpis.winRate).toBe(50);
    expect(o.kpis.profitFactor).toBeCloseTo(500 / 250);
    expect(o.kpis.totalPnl).toBe(250);
    expect(o.kpis.expectancyR).toBeCloseTo(0.625);
    expect(o.distribution).toEqual({ wins: 2, losses: 2, breakeven: 0, total: 4 });
    expect(o.equity.map((p) => p.equity)).toEqual([200, 100, 400, 250]);
  });

  it('max drawdown % is relative to account equity (start balance + profit), not to cumulative profit', () => {
    const o = computeOverview([
      mk({ profitLoss: 400 }),
      mk({ profitLoss: -100, result: 'loss' }),
      mk({ profitLoss: -100, result: 'loss' }),
      mk({ profitLoss: 50 }),
    ], (id) => id, { startBalance: 1000 });
    expect(o.kpis.maxDrawdownAbs).toBe(200);
    expect(o.kpis.maxDrawdownPct).toBeCloseTo((200 / 1400) * 100);
  });

  it('without a start balance the % is null (never a misleading number) but the absolute value stays', () => {
    const o = computeOverview([
      mk({ profitLoss: 400 }),
      mk({ profitLoss: -100, result: 'loss' }),
      mk({ profitLoss: -100, result: 'loss' }),
    ]);
    expect(o.kpis.maxDrawdownAbs).toBe(200);
    expect(o.kpis.maxDrawdownPct).toBeNull();
  });

  it('subtracts fees/commission/spread (net basis)', () => {
    const o = computeOverview([mk({ profitLoss: 100, fees: 5, commission: 3, spread: 2 })]);
    expect(o.kpis.totalPnl).toBe(90);
  });

  it('ignores open trades in closed stats but counts them in total', () => {
    const o = computeOverview([mk({}), mk({ status: 'open', result: 'open', profitLoss: null, closedAt: null })]);
    expect(o.kpis.totalTrades).toBe(2);
    expect(o.kpis.closedTrades).toBe(1);
  });

  it('ranks best strategy and best/worst symbol only when they are truly profitable/losing', () => {
    const o = computeOverview(
      [
        mk({ symbol: 'EURUSD', strategyId: 'a', profitLoss: 300 }),
        mk({ symbol: 'XAUUSD', strategyId: 'b', profitLoss: -120, result: 'loss' }),
        mk({ symbol: 'XAUUSD', strategyId: 'b', profitLoss: -30, result: 'loss' }),
      ],
      (id) => (id === 'a' ? 'Supply & Demand' : id),
    );
    expect(o.bestStrategy?.label).toBe('Supply & Demand');
    expect(o.bestSymbol?.key).toBe('EURUSD');
    expect(o.worstSymbol).toMatchObject({ key: 'XAUUSD', pnl: -150, count: 2 });
    expect(computeOverview([mk({ profitLoss: -10, result: 'loss' })]).bestSymbol).toBeNull();
  });
});
