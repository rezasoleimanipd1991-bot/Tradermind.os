import type { Account, Trade } from '../db/database';
import { isClosed } from '../lib/tradeHelpers';
import { computeDrawdownSeries } from '../core/metrics/drawdown';

export interface AccountDrawdown {
  accountId: string;
  accountName: string;
  currency: string;
  maxDrawdownAbs: number;
  maxDrawdownPct: number | null;
}

/**
 * Computes peak-to-trough drawdown on each account's own equity curve.
 * `selectedTrades` controls which closed trades may establish the reported
 * maximum; allTrades still supplies the prior equity/high-water-mark history.
 */
export function computeAccountDrawdowns(
  allTrades: Trade[],
  accounts: Account[],
  selectedTrades: Trade[] = allTrades,
): AccountDrawdown[] {
  return accounts.flatMap(account => {
    const accountTrades = allTrades
      .filter(trade => trade.accountId === account.id && isClosed(trade))
      .sort((a, b) =>
        (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt)
        || a.openedAt - b.openedAt
        || a.id.localeCompare(b.id),
      );
    const selectedIds = new Set(
      selectedTrades
        .filter(trade => trade.accountId === account.id && isClosed(trade))
        .map(trade => trade.id),
    );

    if (!accountTrades.some(trade => selectedIds.has(trade.id))) return [];

    const drawdown = computeDrawdownSeries(accountTrades, {
      startBalance: account.initialBalance,
      selectedTradeIds: selectedIds,
    });

    return [{
      accountId: account.id,
      accountName: account.name,
      currency: account.currency,
      maxDrawdownAbs: drawdown.absolute,
      maxDrawdownPct: drawdown.percentage,
    }];
  });
}

export function getWorstAccountDrawdown(
  allTrades: Trade[],
  accounts: Account[],
  selectedTrades: Trade[] = allTrades,
): AccountDrawdown | null {
  return computeAccountDrawdowns(allTrades, accounts, selectedTrades)
    .filter(item => item.maxDrawdownPct !== null)
    .sort((a, b) => (b.maxDrawdownPct ?? 0) - (a.maxDrawdownPct ?? 0))[0] ?? null;
}
