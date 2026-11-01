/**
 * tradeRepository.ts — PART 2 / Prompt 3
 *
 * تمام دسترسی به db.trades از این Repository عبور می‌کند.
 * هدف: حذف full-table scan، استفاده از indexed queries، و pagination.
 */

import { db, Trade } from '../../db/database';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

export interface TradeFilters {
  status?: 'open' | 'closed' | 'cancelled';
  symbol?: string;
  strategyId?: string;
  fromDate?: number;   // timestamp ms
  toDate?: number;     // timestamp ms
}

const DEFAULT_PAGE_SIZE = 50;

// ── Query بهینه بر اساس فیلترها ──────────────────────────────────────────────

/**
 * دریافت معاملات با query بهینه — بدون full-table scan.
 * اولویت: openedAt index اگر dateRange داریم، در غیر این صورت status index.
 */
export async function getTrades(filters?: TradeFilters): Promise<Trade[]> {
  if (!filters || Object.keys(filters).length === 0) {
    // هنوز toArray لازم است — اما بهتر است از getPaginatedTrades استفاده شود
    return db.trades.toArray();
  }

  let collection = (() => {
    if (filters.fromDate !== undefined && filters.toDate !== undefined) {
      // از index openedAt استفاده می‌کنیم
      return db.trades.where('openedAt').between(filters.fromDate, filters.toDate, true, true);
    }
    if (filters.status) {
      return db.trades.where('status').equals(filters.status);
    }
    if (filters.symbol) {
      return db.trades.where('symbol').equals(filters.symbol);
    }
    if (filters.strategyId) {
      return db.trades.where('strategyId').equals(filters.strategyId);
    }
    return db.trades.toCollection();
  })();

  let results = await collection.toArray();

  // فیلترهای اضافی در حافظه (روی subset کوچک‌تر)
  if (filters.status && !filters.fromDate) {
    results = results.filter(t => t.status === filters.status);
  }
  if (filters.symbol && !filters.fromDate) {
    results = results.filter(t => t.symbol === filters.symbol);
  }
  if (filters.strategyId && !filters.fromDate) {
    results = results.filter(t => t.strategyId === filters.strategyId);
  }
  if (filters.fromDate !== undefined && filters.toDate !== undefined && filters.status) {
    results = results.filter(t => t.status === filters.status);
  }

  return results;
}

/** معاملات بازه زمانی — با openedAt index */
export async function getTradesByDateRange(from: number, to: number): Promise<Trade[]> {
  return db.trades.where('openedAt').between(from, to, true, true).toArray();
}

/** معاملات یک نماد — با symbol index */
export async function getTradesBySymbol(symbol: string): Promise<Trade[]> {
  return db.trades.where('symbol').equals(symbol).toArray();
}

/** معاملات یک استراتژی — با strategyId index */
export async function getTradesByStrategy(strategyId: string): Promise<Trade[]> {
  return db.trades.where('strategyId').equals(strategyId).toArray();
}

/** معاملات بسته — با status index */
export async function getClosedTrades(): Promise<Trade[]> {
  return db.trades.where('status').equals('closed').toArray();
}

/** شمارش معاملات — بدون بارگذاری همه داده */
export async function countTrades(status?: string): Promise<number> {
  if (status) {
    return db.trades.where('status').equals(status).count();
  }
  return db.trades.count();
}

// ── Pagination با cursor ──────────────────────────────────────────────────────

/**
 * Paginated trades با cursor (بهترین گزینه برای Dexie).
 * از offset-based استفاده می‌کند اما با .offset().limit() که Dexie بهینه می‌کند.
 */
export async function getPaginatedTrades(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  filters?: TradeFilters,
): Promise<PaginatedResult<Trade>> {
  const offset = (page - 1) * pageSize;

  // شمارش کل (بدون بارگذاری همه داده)
  let totalCollection = (() => {
    if (filters?.status) return db.trades.where('status').equals(filters.status);
    if (filters?.symbol) return db.trades.where('symbol').equals(filters.symbol);
    if (filters?.fromDate !== undefined && filters?.toDate !== undefined) {
      return db.trades.where('openedAt').between(filters.fromDate, filters.toDate, true, true);
    }
    return db.trades.toCollection();
  })();

  const total = await totalCollection.count();

  // دریافت صفحه با orderBy + offset + limit
  let itemCollection = (() => {
    if (filters?.status) return db.trades.where('status').equals(filters.status);
    if (filters?.symbol) return db.trades.where('symbol').equals(filters.symbol);
    if (filters?.fromDate !== undefined && filters?.toDate !== undefined) {
      return db.trades.where('openedAt').between(filters.fromDate, filters.toDate, true, true);
    }
    return db.trades.orderBy('openedAt');
  })();

  const items = await itemCollection
    .reverse()       // جدیدترین ابتدا
    .offset(offset)
    .limit(pageSize)
    .toArray();

  return {
    items,
    page,
    pageSize,
    total,
    hasNext: offset + items.length < total,
  };
}

/**
 * Cursor-based pagination (کارایی بهتر برای صفحات بعدی)
 * cursor = آخرین openedAt از صفحه قبل
 */
export async function getTradesAfterCursor(
  cursor: number | null,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<{ items: Trade[]; nextCursor: number | null }> {
  let collection = cursor !== null
    ? db.trades.where('openedAt').below(cursor).reverse()
    : db.trades.orderBy('openedAt').reverse();

  const items = await collection.limit(pageSize).toArray();
  const nextCursor = items.length === pageSize ? items[items.length - 1].openedAt : null;

  return { items, nextCursor };
}

/** دریافت معاملات اخیر برای Dashboard — بهینه */
export async function getRecentTrades(limit = 10): Promise<Trade[]> {
  return db.trades.orderBy('openedAt').reverse().limit(limit).toArray();
}

/** یک معامله با ID */
export async function getTradeById(id: string): Promise<Trade | undefined> {
  return db.trades.get(id);
}

/** تمام معاملات برای analytics — با orderBy برای حذف sort بعدی */
export async function getAllTradesForAnalytics(): Promise<Trade[]> {
  return db.trades.orderBy('openedAt').toArray();
}
