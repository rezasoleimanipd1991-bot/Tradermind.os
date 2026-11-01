import { describe, it, expect } from 'vitest';
import { computeDrawdown, computeDrawdownSeries, resolveStartEquity } from '../../core/metrics/drawdown';
import { computeMaxDrawdown } from '../../core/metrics/pnl';
import { getPerformanceProfile } from '../performanceService';
import type { Account, Trade } from '../../db/database';

const T0 = Date.UTC(2026, 8, 1, 10);
let n = 0;
const mk = (p: Partial<Trade>): Trade => ({
  id: `t${n++}`, symbol: 'EURUSD', strategyId: 's1', accountId: 'a1', status: 'closed',
  result: (p.profitLoss ?? 0) >= 0 ? 'win' : 'loss',
  profitLoss: 100, rMultiple: 1, openedAt: T0 + n * 3600_000, closedAt: T0 + n * 3600_000 + 1800_000,
  fees: 0, commission: 0, spread: 0, ...p,
} as unknown as Trade);

const acc = (p: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'main', broker: '', currency: 'USD', initialBalance: 1000, currentBalance: null,
  color: '#000', isDefault: true, notes: null, createdAt: 0, updatedAt: 0, ...p,
} as Account);

// سناریوی گزارش‌شده: ۵ معامله، یک ضرر ۳۰$ و چهار سود با مجموع ۱۵۰$ (خالص ۱۲۰$)
const reported = () => [
  mk({ profitLoss: 65 }),
  mk({ profitLoss: -30 }),
  mk({ profitLoss: 40 }),
  mk({ profitLoss: 25 }),
  mk({ profitLoss: 20 }),
];

describe('computeDrawdown', () => {
  it('reported scenario: 30$ loss on a 1000$ account is ~2.8%, not 46%', () => {
    const r = computeDrawdown(reported(), { startBalance: 1000 });
    expect(r.absolute).toBe(30);
    expect(r.percentage).toBeCloseTo((30 / 1065) * 100, 5);
    expect(r.percentage!).toBeLessThan(5);
  });

  it('without start balance: % is null, absolute is still right', () => {
    const r = computeDrawdown(reported());
    expect(r.absolute).toBe(30);
    expect(r.percentage).toBeNull();
  });

  it('uses the peak at the moment of the drawdown, not the final peak', () => {
    const r = computeDrawdown([
      mk({ profitLoss: -100 }),
      mk({ profitLoss: 2000 }),
    ], { startBalance: 1000 });
    expect(r.absolute).toBe(100);
    expect(r.percentage).toBeCloseTo(10); // 100 / 1000 (قله‌ی آن لحظه)، نه 100 / 2900
  });

  it('a loss on the very first trade counts', () => {
    const r = computeDrawdown([mk({ profitLoss: -50 }), mk({ profitLoss: 10 })], { startBalance: 1000 });
    expect(r.absolute).toBe(50);
    expect(r.percentage).toBeCloseTo(5);
  });

  it('is net of fees/commission/spread and ordered by close time', () => {
    const a = mk({ profitLoss: 100, fees: 10, openedAt: 1, closedAt: 50 });
    const b = mk({ profitLoss: -100, openedAt: 2, closedAt: 20 });
    const r = computeDrawdown([a, b], { startBalance: 1000 });
    // ترتیب بسته‌شدن: b (−100) سپس a (+90 خالص) → افت ۱۰۰ از قله‌ی ۱۰۰۰
    expect(r.absolute).toBe(100);
    expect(r.percentage).toBeCloseTo(10);
  });

  it('ignores open trades and empty input', () => {
    expect(computeDrawdown([]).absolute).toBe(0);
    expect(computeDrawdown([mk({ status: 'open', profitLoss: -999 } as Partial<Trade>)], { startBalance: 1000 }).absolute).toBe(0);
  });

  it('current drawdown is measured from the latest peak', () => {
    const r = computeDrawdown([mk({ profitLoss: 100 }), mk({ profitLoss: -50 })], { startBalance: 1000 });
    expect(r.currentAbsolute).toBe(50);
    expect(r.currentPercentage).toBeCloseTo((50 / 1100) * 100);
  });

  it('period drawdown includes non-selected realized trades inside the range', () => {
    const [first, insideRange, last] = [
      mk({ id: 'range-first', profitLoss: 100 }),
      mk({ id: 'not-in-filter', profitLoss: -150 }),
      mk({ id: 'range-last', profitLoss: -50 }),
    ];
    const result = computeDrawdownSeries([first, insideRange, last], {
      startBalance: 1000,
      selectedTradeIds: new Set([first.id, last.id]),
    });
    expect(result.absolute).toBe(200);
    expect(result.percentage).toBeCloseTo((200 / 1100) * 100);
  });

  it('ignores non-finite realized P&L', () => {
    expect(computeDrawdown([mk({ profitLoss: Number.NaN })], { startBalance: 1000 }).tradeCount).toBe(0);
  });
});

describe('all call sites agree', () => {
  it('pnl.ts wrapper and performanceService use the same result', () => {
    const t = reported();
    const ref = computeDrawdown(t, { startBalance: 1000 });
    expect(computeMaxDrawdown(t, 1000).percentage).toBeCloseTo(ref.percentage!);
    const p = getPerformanceProfile(t, { startBalance: 1000 });
    expect(p.maxDrawdownPct).toBeCloseTo(ref.percentage!);
    expect(p.maxDrawdownAbs).toBe(ref.absolute);
  });
});

describe('resolveStartEquity', () => {
  it('sums account initial balances', () => {
    expect(resolveStartEquity([acc()], reported())).toBe(1000);
  });

  it('adds net P/L realised before the period start', () => {
    const all = reported();
    const period = all.slice(2); // از معامله‌ی سوم به بعد
    expect(resolveStartEquity([acc()], all, period)).toBe(1000 + 65 - 30);
  });

  it('returns null when an involved account has no initial balance', () => {
    expect(resolveStartEquity([acc({ initialBalance: null })], reported())).toBeNull();
    expect(resolveStartEquity([], reported())).toBeNull();
  });

  it('does not combine balances across currencies or assign unlinked trades', () => {
    const all = reported();
    expect(resolveStartEquity([acc(), acc({ id: 'a2', currency: 'EUR' })], [
      ...all,
      mk({ id: 'eur', accountId: 'a2' }),
    ])).toBeNull();
    expect(resolveStartEquity([acc()], [mk({ accountId: null })])).toBeNull();
  });
});

import { computeDrawdownEpisodes, summarizeDrawdownEpisodes } from '../../core/metrics/drawdown';
import { computeMetrics } from '../../core/metrics/engine';

describe('drawdown episodes (min / max / average)', () => {
  // equity: 1000 → 1100 → 1060 → 1100 (recovered) → 1050 → 1000 → 1120
  const seq = () => [100, -40, 40, -50, -50, 120].map(v => mk({ profitLoss: v, result: v > 0 ? 'win' : 'loss' }));

  it('finds two episodes with their own peaks and recovery', () => {
    const { episodes } = computeDrawdownEpisodes(seq(), { startBalance: 1000 });
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({ peak: 1100, trough: 1060, depthAbs: 40 });
    expect(episodes[0].recoveryAt).not.toBeNull();
    expect(episodes[1]).toMatchObject({ peak: 1100, trough: 1000, depthAbs: 100 });
    expect(episodes[1].depthPct).toBeCloseTo((100 / 1100) * 100);
  });

  it('min = shallowest episode, max = deepest (equals Max Drawdown), avg in between', () => {
    const s = summarizeDrawdownEpisodes(seq(), { startBalance: 1000 });
    expect(s.episodeCount).toBe(2);
    expect(s.minAbsolute).toBe(40);
    expect(s.maxAbsolute).toBe(100);
    expect(s.avgAbsolute).toBe(70);
    expect(s.lowestEquity).toBe(1000);
    const dd = computeMetrics(seq(), { startBalance: 1000 }).drawdown;
    expect(s.maxAbsolute).toBe(dd.absolute);
    expect(s.maxPercentage).toBeCloseTo(dd.percentage!);
  });

  it('an unrecovered final episode stays open', () => {
    const { episodes } = computeDrawdownEpisodes([mk({ profitLoss: 50 }), mk({ profitLoss: -20, result: 'loss' })], { startBalance: 1000 });
    expect(episodes).toHaveLength(1);
    expect(episodes[0].recoveryAt).toBeNull();
  });

  it('no losses → no episodes; percentages are null without a start balance', () => {
    expect(summarizeDrawdownEpisodes([mk({ profitLoss: 10 }), mk({ profitLoss: 5 })], { startBalance: 1000 }).episodeCount).toBe(0);
    expect(summarizeDrawdownEpisodes(seq()).minPercentage).toBeNull();
  });
});
