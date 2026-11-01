import { describe, expect, it } from 'vitest';
import type { Trade } from '../../db/database';
import {
  buildPnlCurves,
  buildReportTable,
  computeReportsCenterSummary,
  createReportsCenterIndex,
  DEFAULT_REPORT_FILTERS,
  filterReportTrades,
  REPORT_SECTION_DEFINITIONS,
  type ReportsCenterSource,
} from '../reportsCenterService';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const timeConfig = { mode: 'broker', brokerUtcOffsetMinutes: 0 } as const;

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    id: 't',
    symbol: 'EURUSD',
    direction: 'buy',
    status: 'closed',
    result: 'win',
    openedAt: NOW - 2 * DAY,
    closedAt: NOW - 2 * DAY + 3_600_000,
    profitLoss: null,
    ...overrides,
  } as unknown as Trade;
}

function makeSource(trades: Trade[]): ReportsCenterSource {
  return {
    trades,
    dailyJournals: [],
    strategies: [],
    accounts: [],
    boxes: [],
    journalSessions: [],
    journalOptions: [],
    journalSessionAnalyses: [],
    journalTriggerEvents: [],
    journalTradeData: [],
  };
}

describe('reportsCenterService — summary', () => {
  // مثال دستی: سود ناخالص ۱۰۰ با هزینه ۱۰+۵+۲ و یک زیان ۵۰
  const trades = [
    makeTrade({ id: 'a', profitLoss: 100, fees: 10, commission: 5, spread: 2, result: 'win' }),
    makeTrade({ id: 'b', profitLoss: -50, result: 'loss', openedAt: NOW - DAY, closedAt: NOW - DAY + 1000 }),
  ];
  const index = createReportsCenterIndex(makeSource(trades));
  const summary = computeReportsCenterSummary(trades, index);

  it('uses net P&L consistently (net 33, gross 50)', () => {
    expect(summary.currencies).toHaveLength(1);
    expect(summary.currencies[0].netPnl).toBe(33);
    expect(summary.currencies[0].grossPnl).toBe(50);
  });

  it('computes net profit factor 83/50 = 1.66', () => {
    expect(summary.currencies[0].profitFactor).toBe(1.66);
  });

  it('computes win rate on closed trades', () => {
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.winRate).toBe(50);
  });

  it('counts breakeven trades in the win-rate denominator', () => {
    const withBe = [...trades, makeTrade({ id: 'c', profitLoss: 0, result: 'breakeven' })];
    const s = computeReportsCenterSummary(withBe, createReportsCenterIndex(makeSource(withBe)));
    expect(s.breakeven).toBe(1);
    expect(s.winRate).toBeCloseTo(33.33, 2);
  });

  it('does not treat missing P&L as zero and does not count open trades', () => {
    const mixed = [
      ...trades,
      makeTrade({ id: 'd', profitLoss: null, result: 'win' }),
      makeTrade({ id: 'e', status: 'open', result: undefined as never, profitLoss: 999 }),
    ];
    const s = computeReportsCenterSummary(mixed, createReportsCenterIndex(makeSource(mixed)));
    expect(s.tradesWithoutPnl).toBe(1);
    expect(s.openTrades).toBe(1);
    expect(s.currencies[0].netPnl).toBe(33);
  });

  it('handles an empty dataset safely', () => {
    const s = computeReportsCenterSummary([], createReportsCenterIndex(makeSource([])));
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.currencies).toEqual([]);
  });

  it('computes max drawdown from realised net P&L ordered by close time', () => {
    const overlap = [
      // A باز می‌شود زودتر ولی دیرتر بسته می‌شود؛ ترتیب تحقق: B (-150) سپس A (+100)
      makeTrade({ id: 'A', profitLoss: 100, result: 'win', openedAt: NOW - 5 * DAY, closedAt: NOW - DAY }),
      makeTrade({ id: 'B', profitLoss: -150, result: 'loss', openedAt: NOW - 4 * DAY, closedAt: NOW - 3 * DAY }),
    ];
    const s = computeReportsCenterSummary(overlap, createReportsCenterIndex(makeSource(overlap)));
    expect(s.currencies[0].maxDrawdown).toBe(150);
    const curve = Object.values(buildPnlCurves(overlap, createReportsCenterIndex(makeSource(overlap))))[0];
    expect(curve.map(p => p.symbol)).toHaveLength(2);
    expect(curve.map(p => p.cumulativeNetPnl)).toEqual([-150, -50]);
  });
});

describe('reportsCenterService — filters', () => {
  const trades = [
    makeTrade({ id: '1', symbol: 'EURUSD', direction: 'buy', openedAt: NOW - 2 * DAY, profitLoss: 10 }),
    makeTrade({ id: '2', symbol: 'EURUSD', direction: 'sell', openedAt: NOW - 3 * DAY, profitLoss: -5, result: 'loss' }),
    makeTrade({ id: '3', symbol: 'XAUUSD', direction: 'buy', openedAt: NOW - 40 * DAY, profitLoss: 7 }),
    makeTrade({ id: '4', symbol: 'XAUUSD', direction: 'sell', openedAt: NOW - 1 * DAY, profitLoss: 3 }),
  ];
  const source = makeSource(trades);
  const index = createReportsCenterIndex(source);
  const run = (patch: Partial<typeof DEFAULT_REPORT_FILTERS>) =>
    filterReportTrades(source, index, { ...DEFAULT_REPORT_FILTERS, ...patch }, timeConfig, NOW).trades.map(t => t.id);

  it('all-time returns everything', () => {
    expect(run({ preset: 'all' })).toEqual(['1', '2', '3', '4']);
  });

  it('last 7 days excludes old trades', () => {
    expect(run({ preset: 'last7' })).toEqual(['1', '2', '4']);
  });

  it('combines symbol and direction filters', () => {
    expect(run({ preset: 'all', symbols: ['EURUSD'], directions: ['sell'] })).toEqual(['2']);
  });

  it('rejects an invalid custom range', () => {
    const result = filterReportTrades(
      source, index,
      { ...DEFAULT_REPORT_FILTERS, preset: 'custom', fromDate: '2026-10-10', toDate: '2026-10-01' },
      timeConfig, NOW,
    );
    expect(result.dateRange.valid).toBe(false);
    expect(result.trades).toEqual([]);
  });
});

describe('reportsCenterService — every section builds without throwing', () => {
  const trades = [
    makeTrade({ id: '1', profitLoss: 10, lesson: 'صبر کن' }),
    makeTrade({ id: '2', profitLoss: -5, result: 'loss', direction: 'sell' }),
  ];
  const source = makeSource(trades);
  const index = createReportsCenterIndex(source);

  for (const section of REPORT_SECTION_DEFINITIONS) {
    it(`section ${section.id}`, () => {
      const table = buildReportTable(section.id, trades, source, index, timeConfig);
      expect(table.title.length).toBeGreaterThan(0);
      expect(Array.isArray(table.rows)).toBe(true);
    });
  }
});
