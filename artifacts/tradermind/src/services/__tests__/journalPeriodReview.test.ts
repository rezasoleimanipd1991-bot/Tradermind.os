import { describe, expect, it } from 'vitest';
import type { JournalOption, JournalSession, JournalTradeData, Trade } from '../../db/database';
import { buildPeriodReview, resolveReviewRange } from '../journalPeriodReview';
import { buildPeriodReviewParts } from '../journalPeriodReviewWord';

const anchor = new Date(2026, 9, 11, 12, 0).getTime(); // 19 مهر ۱۴۰۵
const day = (d: number, h: number) => new Date(2026, 9, d, h).getTime();

describe('resolveReviewRange', () => {
  it('starts weeks on Saturday and steps back by whole weeks', () => {
    const week = resolveReviewRange('week', anchor, 0);
    expect(new Date(week.from).getDate()).toBe(10);
    expect(new Date(week.to).getDate()).toBe(16);
    expect(new Date(resolveReviewRange('week', anchor, -1).from).getDate()).toBe(3);
  });

  it('uses Jalali month boundaries', () => {
    const month = resolveReviewRange('month', anchor, 0);
    expect([new Date(month.from).getMonth(), new Date(month.from).getDate()]).toEqual([8, 23]);
    expect([new Date(month.to).getMonth(), new Date(month.to).getDate()]).toEqual([9, 22]);
    const next = resolveReviewRange('month', anchor, 1);
    expect([new Date(next.from).getMonth(), new Date(next.from).getDate()]).toEqual([9, 23]);
    const previous = resolveReviewRange('month', anchor, -1);
    expect([new Date(previous.from).getMonth(), new Date(previous.from).getDate()]).toEqual([7, 23]);
  });
});

function trade(id: string, sessionId: string, result: Trade['result'], pnl: number, r: number, extra: Partial<Trade> = {}): Trade {
  return { id, journalSessionId: sessionId, status: 'closed', result, profitLoss: pnl, rMultiple: r, symbol: 'EURUSD', openedAt: day(11, 10), ...extra } as unknown as Trade;
}

describe('buildPeriodReview', () => {
  const sessions = [
    { id: 's1', startTime: day(11, 9), sessionTypeOptionId: 'lon' },
    { id: 's2', startTime: day(12, 9), sessionTypeOptionId: 'ny' },
    { id: 's0', startTime: day(1, 9), sessionTypeOptionId: 'lon' },
  ] as unknown as JournalSession[];
  const trades = [
    trade('1', 's1', 'win', 50, 2, { liveMonitoring: JSON.stringify({ maxFavorableExcursion: 3, maxAdverseExcursion: -0.8 }) }),
    trade('2', 's1', 'win', 30, 1.5, { liveMonitoring: JSON.stringify({ maxFavorableExcursion: 2.4, maxAdverseExcursion: -0.9 }) }),
    trade('3', 's1', 'loss', -20, -1),
    ...['4', '5', '6', '7', '8'].map(id => trade(id, 's2', 'loss', -30, -1)),
    trade('0', 's0', 'win', 100, 3),
  ];
  const tradeData = trades.map(item => ({ tradeId: item.id, strategyCompliance: Number(item.id) >= 4 ? 'no' : 'yes', mistakeOptionIds: Number(item.id) >= 4 ? '["m1"]' : '[]' })) as unknown as JournalTradeData[];
  const options = [{ id: 'lon', label: 'لندن' }, { id: 'ny', label: 'نیویورک' }, { id: 'm1', label: 'ورود زودهنگام' }] as unknown as JournalOption[];
  const input = { sessions, trades, analyses: [], triggers: [], options, tradeData };

  it('only counts sessions and trades inside the period', () => {
    const review = buildPeriodReview(input, resolveReviewRange('week', anchor, 0));
    expect(review.sessionCount).toBe(2);
    expect(review.tradingDays).toBe(2);
    expect(review.overall.trades).toBe(8);
  });

  it('names best and worst only when there is a positive and a negative group with enough trades', () => {
    const review = buildPeriodReview(input, resolveReviewRange('week', anchor, 0));
    expect(review.bestSessionType?.label).toBe('لندن');
    expect(review.worstSessionType?.label).toBe('نیویورک');
    expect(review.bestWeekday).toBeNull();
  });

  it('derives mistakes, excursion facts, and review questions from the data', () => {
    const review = buildPeriodReview(input, resolveReviewRange('week', anchor, 0));
    expect(review.topMistakes[0]).toMatchObject({ label: 'ورود زودهنگام', trades: 5 });
    expect(review.excursion.givenBackWinners).toBe(2);
    expect(review.questions.length).toBeGreaterThanOrEqual(3);
    expect(review.planAdherence.offPlan.settled).toBe(5);
  });

  it('says so when the period has no settled trades and asks no questions', () => {
    const review = buildPeriodReview({ ...input, trades: [] }, resolveReviewRange('week', anchor, 0));
    expect(review.overall.settled).toBe(0);
    expect(review.observations).toHaveLength(1);
    expect(review.questions).toEqual([]);
  });

  it('renders a Word package', () => {
    const parts = buildPeriodReviewParts(buildPeriodReview(input, resolveReviewRange('week', anchor, 0)));
    expect(String(parts['word/document.xml'])).toContain('مرور هفتگی ژورنال');
    expect(String(parts['word/document.xml'])).toContain('ورود زودهنگام');
  });
});
