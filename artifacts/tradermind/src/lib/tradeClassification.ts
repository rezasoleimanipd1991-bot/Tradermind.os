import type { Trade } from '../db/database';
import { getTradingDateParts, getTradingTimeConfig, type TradingTimeConfig } from './tradingTime';

export type DetectedTradingSession = 'asia' | 'london' | 'overlap' | 'new-york' | 'other';

/**
 * Session windows are expressed in the selected trading clock, not in the
 * machine's local timezone. The overlap is intentionally checked before the
 * individual London/New York windows.
 */
export function detectTradingSession(
  openedAt: number,
  config: TradingTimeConfig = getTradingTimeConfig(),
): DetectedTradingSession {
  const { hour, minute } = getTradingDateParts(openedAt, config);
  const minutes = hour * 60 + minute;

  if (minutes < 8 * 60) return 'asia';
  if (minutes < 13 * 60) return 'london';
  if (minutes < 17 * 60) return 'overlap';
  if (minutes < 22 * 60) return 'new-york';
  return 'other';
}

function hasFinitePnl(trade: Pick<Trade, 'profitLoss'>): boolean {
  return typeof trade.profitLoss === 'number' && Number.isFinite(trade.profitLoss);
}

export function resultFromProfitLoss(profitLoss: number): Trade['result'] {
  if (profitLoss > 0) return 'win';
  if (profitLoss < 0) return 'loss';
  return 'breakeven';
}

/**
 * Derive fields that can be safely inferred from imported trade data.
 * A missing P&L remains an open trade unless there is another explicit close
 * signal (close time, exit price, or closed status).
 */
export function classifyTradeFields(
  trade: Pick<Trade, 'profitLoss' | 'closedAt' | 'exitPrice' | 'status' | 'result'>,
): Pick<Trade, 'status' | 'result'> {
  if (trade.status === 'cancelled' || trade.result === 'cancelled') {
    return { status: 'cancelled', result: 'cancelled' };
  }

  if (hasFinitePnl(trade)) {
    return {
      status: 'closed',
      result: resultFromProfitLoss(trade.profitLoss as number),
    };
  }

  const hasCloseSignal =
    trade.status === 'closed' ||
    trade.closedAt !== null ||
    trade.exitPrice !== null;

  if (hasCloseSignal) {
    return {
      status: 'closed',
      result: trade.result === 'open' ? 'breakeven' : trade.result,
    };
  }

  return { status: 'open', result: 'open' };
}

export function normalizeImportedTradeFields(
  trade: Partial<Trade>,
): Partial<Trade> {
  const fields = classifyTradeFields({
    profitLoss: trade.profitLoss ?? null,
    closedAt: trade.closedAt ?? null,
    exitPrice: trade.exitPrice ?? null,
    status: trade.status ?? 'open',
    result: trade.result ?? 'open',
  });

  return {
    ...fields,
    tradingSession:
      trade.tradingSession ||
      (typeof trade.openedAt === 'number' && Number.isFinite(trade.openedAt)
        ? detectTradingSession(trade.openedAt)
        : null),
  };
}
