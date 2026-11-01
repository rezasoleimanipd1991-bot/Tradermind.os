import { describe, expect, it } from 'vitest';
import type { Account, Trade } from '../../db/database';
import { COMBINED_ACCOUNTS_ID, getCombinedScopeInfo, scopeTrades, sumInitialBalances } from '../accountScope';
import { computeMetrics } from '../../core/metrics/engine';

const T0 = Date.UTC(2026, 0, 1);
const acc = (id: string, currency: string, initialBalance: number | null): Account => ({
  id, name: id, broker: '', currency, initialBalance, currentBalance: null, color: '#000',
  isDefault: false, notes: null, createdAt: T0, updatedAt: T0,
} as Account);
let n = 0;
const tr = (accountId: string | null, profitLoss: number): Trade => ({
  id: `t${n++}`, accountId, status: 'closed', result: profitLoss >= 0 ? 'win' : 'loss', profitLoss,
  fees: 0, commission: 0, spread: 0, openedAt: T0 + n * 86_400_000, closedAt: T0 + n * 86_400_000 + 3_600_000,
} as unknown as Trade);

describe('combined scope rules', () => {
  const usd = [acc('a', 'USD', 1000), acc('b', 'USD', 500)];

  it('is allowed when every account shares one currency', () => {
    const info = getCombinedScopeInfo(usd, [tr('a', 10), tr('b', -5)]);
    expect(info).toMatchObject({ allowed: true, currency: 'USD', reason: null, warning: null });
  });

  it('is blocked for mixed currencies (money must never be summed across currencies)', () => {
    const info = getCombinedScopeInfo([acc('a', 'USD', 1000), acc('e', 'EUR', 1000)], [tr('a', 10), tr('e', -5)]);
    expect(info.allowed).toBe(false);
    expect(info.reason).toContain('ارز');
  });

  it('only counts currencies of accounts that actually have trades', () => {
    const info = getCombinedScopeInfo([acc('a', 'USD', 1000), acc('e', 'EUR', 1000)], [tr('a', 10)]);
    expect(info.allowed).toBe(true);
  });

  it('warns (does not block) about trades without a known account', () => {
    const info = getCombinedScopeInfo(usd, [tr('a', 10), tr(null, 5), tr('ghost', 1)]);
    expect(info.allowed).toBe(true);
    expect(info.warning).toContain('2');
  });

  it('empty data is allowed so pages show their own empty state', () => {
    expect(getCombinedScopeInfo([], []).allowed).toBe(true);
  });
});

describe('scopeTrades', () => {
  const usd = [acc('a', 'USD', 1000), acc('b', 'USD', 500)];
  const trades = [tr('a', 10), tr('b', -5), tr('a', 20)];
  const info = getCombinedScopeInfo(usd, trades);

  it('single account keeps only its trades', () => {
    expect(scopeTrades(trades, 'a', info)).toHaveLength(2);
    expect(scopeTrades(trades, 'b', info)).toHaveLength(1);
  });
  it('combined returns everything when allowed, nothing when blocked', () => {
    expect(scopeTrades(trades, COMBINED_ACCOUNTS_ID, info)).toHaveLength(3);
    expect(scopeTrades(trades, COMBINED_ACCOUNTS_ID, { ...info, allowed: false })).toEqual([]);
  });
  it('separate view (null) returns no merged list', () => {
    expect(scopeTrades(trades, null, info)).toEqual([]);
  });
});

describe('combined numbers equal the sum of the parts', () => {
  const accounts = [acc('a', 'USD', 1000), acc('b', 'USD', 500)];
  const trades = [tr('a', 100), tr('a', -40), tr('b', 30), tr('b', -10)];

  it('start balance is the sum of initial balances', () => {
    expect(sumInitialBalances(accounts, trades)).toBe(1500);
    expect(sumInitialBalances([acc('a', 'USD', 1000), acc('b', 'USD', null)], trades)).toBeNull();
  });

  it('net P/L adds up across accounts; per-account drawdown is NOT averaged into the combined one', () => {
    const ma = computeMetrics(trades.filter(t => t.accountId === 'a'), { startBalance: 1000 });
    const mb = computeMetrics(trades.filter(t => t.accountId === 'b'), { startBalance: 500 });
    const mc = computeMetrics(trades, { startBalance: 1500 });
    expect(mc.netPnl).toBeCloseTo(ma.netPnl + mb.netPnl);
    expect(mc.count).toBe(ma.count + mb.count);
    expect(mc.grossProfit).toBeCloseTo(ma.grossProfit + mb.grossProfit);
    expect(mc.grossLoss).toBeCloseTo(ma.grossLoss + mb.grossLoss);
  });
});
