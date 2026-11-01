import { describe, expect, it } from 'vitest';
import type { JournalOption, JournalSession, JournalSessionAnalysis, JournalTriggerEvent, Trade } from '../../db/database';
import type { JournalTradeData } from '../../db/database';
import { buildBreakdowns, buildPlanAdherence, buildScenarioAccuracy, executionQualityBand } from '../journalBreakdownService';

const options = [
  { id: 'tf4h', label: '4H' }, { id: 'tf15', label: '15M' },
  { id: 'z-high', label: 'High ماژور' }, { id: 'z-low', label: 'Low مینور' },
  { id: 'sco', label: 'SCO' }, { id: 'lon', label: 'لندن' },
  { id: 'o-hit', label: 'مطابق سناریو' }, { id: 'o-part', label: 'تا حدی مطابق' }, { id: 'o-inv', label: 'باطل‌شده' },
] as unknown as JournalOption[];

const day = new Date(2026, 9, 11, 10, 0).getTime();
const trade = (id: string, result: Trade['result'], profitLoss: number, rMultiple: number, triggerId?: string): Trade => ({
  id, journalSessionId: 's1', journalTriggerEventId: triggerId, symbol: 'EURUSD', status: 'closed', result, profitLoss, rMultiple, openedAt: day,
}) as unknown as Trade;

const sessions = [{ id: 's1', sessionTypeOptionId: 'lon' }] as unknown as JournalSession[];
const analyses = [
  { id: 'a1', sessionId: 's1', timeframeOptionId: 'tf4h', fieldSelections: '{"zones":["z-high","z-low"]}', scenarioOutcomeOptionId: 'o-hit' },
  { id: 'a2', sessionId: 's1', timeframeOptionId: 'tf15', fieldSelections: '{}', scenarioOutcomeOptionId: 'o-inv' },
  { id: 'a3', sessionId: 's1', timeframeOptionId: 'tf4h', fieldSelections: '{}', scenarioOutcomeOptionId: 'o-part' },
] as unknown as JournalSessionAnalysis[];
const triggers = [
  { id: 'tg1', sessionId: 's1', timeframeOptionId: 'tf15', triggerTypeOptionId: 'sco', analysisEventId: 'a1', analysisEventIds: ['a1', 'a2'], linkedTradeId: 't1' },
] as unknown as JournalTriggerEvent[];

describe('buildBreakdowns', () => {
  const trades = [trade('t1', 'win', 100, 2, 'tg1'), trade('t2', 'loss', -50, -1)];
  const result = buildBreakdowns({ trades, sessions, analyses, triggers, options });

  it('attributes a trade to every linked analysis timeframe', () => {
    const tf4h = result.timeframe.find(row => row.label === '4H');
    const tf15 = result.timeframe.find(row => row.label === '15M');
    const none = result.timeframe.find(row => row.key === '__none__');
    expect(tf4h).toMatchObject({ trades: 1, wins: 1, winRate: 100, netPnl: 100, averageR: 2 });
    expect(tf15?.trades).toBe(1);
    expect(none).toMatchObject({ trades: 1, losses: 1, winRate: 0, netPnl: -50 });
  });

  it('groups by forward zone, trigger type and session type', () => {
    expect(result.forwardZone.map(row => row.label)).toEqual(expect.arrayContaining(['High ماژور', 'Low مینور', 'بدون ناحیه']));
    expect(result.triggerType.find(row => row.label === 'SCO')?.trades).toBe(1);
    expect(result.sessionType.find(row => row.label === 'لندن')?.trades).toBe(2);
    expect(result.weekday).toHaveLength(1);
  });
});

describe('buildScenarioAccuracy', () => {
  it('computes accuracy per timeframe from recorded outcomes', () => {
    const rows = buildScenarioAccuracy({ analyses, options });
    const tf4h = rows.find(row => row.label === '4H');
    expect(tf4h).toMatchObject({ analyses: 2, recorded: 2, hit: 1, partial: 1, accuracy: 75 });
    expect(rows.find(row => row.label === '15M')).toMatchObject({ invalidated: 1, accuracy: 0 });
  });

  it('respects the session filter', () => {
    expect(buildScenarioAccuracy({ analyses, options, sessionIds: new Set(['other']) })).toEqual([]);
  });
});

describe('plan adherence', () => {
  const trades = [trade('t1', 'win', 100, 2), trade('t2', 'loss', -50, -1), trade('t3', 'win', 40, 1), trade('t4', 'loss', -30, -1)];
  const tradeData = [
    { tradeId: 't1', strategyCompliance: 'yes', executionQuality: 9, mistakeOptionIds: '[]' },
    { tradeId: 't2', strategyCompliance: 'yes', executionQuality: 6, mistakeOptionIds: '[]' },
    { tradeId: 't3', strategyCompliance: 'no', executionQuality: 3, mistakeOptionIds: '["m1"]' },
  ] as unknown as JournalTradeData[];

  it('separates on-plan and off-plan results', () => {
    const summary = buildPlanAdherence(trades, tradeData);
    expect(summary.onPlan).toMatchObject({ trades: 2, wins: 1, losses: 1, averageR: 0.5 });
    expect(summary.offPlan).toMatchObject({ trades: 1, wins: 1 });
    expect(summary.offPlanWins).toBe(1);
    expect(summary.onPlanLosses).toBe(1);
    expect(summary.unrated.trades).toBe(1);
    expect(summary.averageRAdvantage).toBeCloseTo(-0.5);
  });

  it('adds compliance, execution band and mistake dimensions', () => {
    const result = buildBreakdowns({ trades, sessions, analyses, triggers, options, tradeData });
    expect(result.strategyCompliance.find(row => row.label === 'طبق پلن')?.trades).toBe(2);
    expect(result.executionQuality.map(row => row.key)).toEqual(expect.arrayContaining(['high', 'mid', 'low', '__none__']));
    expect(executionQualityBand(8).key).toBe('high');
    expect(result.mistake.find(row => row.key === 'm1')?.trades).toBe(1);
  });
});
