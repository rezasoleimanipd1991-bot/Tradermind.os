import { describe, expect, it } from 'vitest';
import type { Account, Trade } from '../../db/database';
import { computeAccountDrawdowns, getWorstAccountDrawdown } from '../accountDrawdownService';
import { getDrawdownAnalysis } from '../riskService';

const start = Date.UTC(2026, 0, 1);

function trade(id: string, accountId: string, profitLoss: number, day: number): Trade {
  return {
    id,
    accountId,
    status: 'closed',
    result: profitLoss > 0 ? 'win' : profitLoss < 0 ? 'loss' : 'breakeven',
    profitLoss,
    fees: 0,
    commission: 0,
    spread: 0,
    openedAt: start + day * 86_400_000,
    closedAt: start + day * 86_400_000 + 3_600_000,
  } as Trade;
}

function account(id: string, initialBalance: number | null): Account {
  return {
    id,
    name: `Account ${id}`,
    broker: '',
    currency: 'USD',
    initialBalance,
    currentBalance: null,
    color: '#000000',
    isDefault: false,
    notes: null,
    createdAt: start,
    updatedAt: start,
  };
}

describe('account drawdown calculations', () => {
  it('measures drawdown against actual account equity, not cumulative profit', () => {
    const trades = [
      trade('a1', 'a', 130, 1),
      trade('a2', 'a', -30, 2),
      trade('a3', 'a', -30, 3),
      trade('a4', 'a', 25, 4),
      trade('a5', 'a', 25, 5),
    ];

    const [result] = computeAccountDrawdowns(trades, [account('a', 1000)]);
    expect(result.maxDrawdownAbs).toBe(60);
    expect(result.maxDrawdownPct).toBeCloseTo((60 / 1130) * 100);
  });

  it('keeps account equity curves separate', () => {
    const trades = [
      trade('a1', 'a', 130, 1),
      trade('a2', 'a', -60, 2),
      trade('b1', 'b', 500, 1),
      trade('b2', 'b', -10, 2),
    ];

    const results = computeAccountDrawdowns(trades, [account('a', 1000), account('b', 1000)]);
    expect(results.find(item => item.accountId === 'a')?.maxDrawdownAbs).toBe(60);
    expect(results.find(item => item.accountId === 'b')?.maxDrawdownAbs).toBe(10);
    expect(getWorstAccountDrawdown(trades, [account('a', 1000), account('b', 1000)])?.accountId).toBe('a');
  });

  it('does not invent a percentage when the starting balance is missing', () => {
    const trades = [trade('a1', 'a', 130, 1), trade('a2', 'a', -60, 2)];
    const [result] = computeAccountDrawdowns(trades, [account('a', null)]);

    expect(result.maxDrawdownAbs).toBe(60);
    expect(result.maxDrawdownPct).toBeNull();
    expect(getWorstAccountDrawdown(trades, [account('a', null)])).toBeNull();
  });

  it('uses prior account history to establish the high-water mark for a selected range', () => {
    const trades = [
      trade('a1', 'a', 130, 1),
      trade('a2', 'a', -30, 2),
      trade('a3', 'a', -30, 3),
      trade('a4', 'a', 25, 4),
      trade('a5', 'a', 25, 5),
    ];

    const [result] = computeAccountDrawdowns(trades, [account('a', 1000)], trades.slice(1, 3));
    expect(result.maxDrawdownAbs).toBe(60);
    expect(result.maxDrawdownPct).toBeCloseTo((60 / 1130) * 100);
  });

  it('does not invent a percentage when risk analysis has no starting balance', () => {
    const trades = [trade('a1', 'a', 130, 1), trade('a2', 'a', -60, 2)];
    const result = getDrawdownAnalysis(trades, null);

    expect(result.maxDrawdownPct).toBeNull();
    expect(result.currentDrawdownPct).toBeNull();
    expect(result.curve.every(point => point.drawdownPct === null)).toBe(true);
  });

  it('ties the recovery date to the deepest drawdown, not an earlier recovery', () => {
    const trades = [
      trade('peak', 'a', 100, 1),
      trade('first-loss', 'a', -40, 2),
      trade('first-recovery', 'a', 40, 3),
      trade('second-loss-a', 'a', -20, 4),
      trade('deepest-loss', 'a', -50, 5),
      trade('second-recovery', 'a', 70, 6),
    ];
    const result = getDrawdownAnalysis(trades, 1000);

    expect(result.maxDrawdownPct).toBeCloseTo((70 / 1100) * 100);
    expect(result.maxDrawdownDate).toBe(new Date(trades[4].closedAt!).toISOString().slice(0, 10));
    expect(result.recoveryDate).toBe(new Date(trades[5].closedAt!).toISOString().slice(0, 10));
    expect(result.recoveryDays).toBe(1);
  });
});
