import { describe, expect, it } from 'vitest';
import type { Account, JournalOption, JournalSession, JournalSessionAnalysis, JournalTriggerEvent, Strategy, Trade } from '../../db/database';
import { DEFAULT_ANALYSIS_FIELD_LAYOUTS, JOURNAL_ANALYSIS_FIELD_LABELS } from '../journalAnalysisFieldLabels';
import { buildJournalReportParts } from '../journalWordReportBuilder';

const start = new Date(2026, 9, 11, 9, 30).getTime();
const image = { fileName: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), width: 1600, height: 900 };

function input() {
  return {
    generatedAt: start,
    sessions: [{ id: 's1', accountId: 'a1', strategyId: 'st1', symbols: '["EURUSD"]', startTime: start, sessionTypeOptionId: null, notes: '' }] as unknown as JournalSession[],
    options: [{ id: 'tf', label: '4H' }, { id: 'z1', label: 'High مینور' }] as unknown as JournalOption[],
    strategies: [{ id: 'st1', name: 'S' }] as unknown as Strategy[],
    accounts: [{ id: 'a1', name: 'Primary' }] as unknown as Account[],
    analyses: [{ id: 'an1', sessionId: 's1', timeframeOptionId: 'tf', createdAt: 1, analysisText: 'مبدأ ویژه', fieldSelections: '{"zones":["z1"]}', tags: '[]', liquidityContextOptionIds: '[]' }] as unknown as JournalSessionAnalysis[],
    triggers: [{ id: 'tg1', sessionId: 's1', timeframeOptionId: 'tf', analysisEventId: 'an1', analysisEventIds: ['an1'], description: 'شرح تریگر', marketMovement: '', notes: '', status: 'converted', linkedTradeId: 't1', createdAt: 2 }] as unknown as JournalTriggerEvent[],
    trades: [{ id: 't1', journalSessionId: 's1', symbol: 'EURUSD', direction: 'long', entryPrice: 1.0852, stopLoss: 1.083, takeProfit: 1.09, exitPrice: 1.0897, profitLoss: 37.5, result: 'win', openedAt: start + 3_600_000 }] as unknown as Trade[],
    media: [
      { id: 'm1', analysisId: 'an1', triggerId: null, image },
      { id: 'm2', analysisId: null, triggerId: 'tg1', image },
    ],
    labels: JOURNAL_ANALYSIS_FIELD_LABELS,
    layouts: DEFAULT_ANALYSIS_FIELD_LAYOUTS,
  };
}

describe('buildJournalReportParts', () => {
  it('creates a valid package with day header, tables and both images', () => {
    const parts = buildJournalReportParts(input());
    const xml = String(parts['word/document.xml']);
    expect(xml).toContain('روز معاملاتی');
    expect(xml).toContain('ساعت شروع معاملاتی');
    expect(xml).toContain('مبدأ ویژه');
    expect(xml).toContain('High مینور');
    expect(xml).toContain('شرح تریگر');
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(['word/media/image1.jpg', 'word/media/image2.jpg', '[Content_Types].xml']));
    expect(String(parts['word/_rels/document.xml.rels'])).toContain('rIdImg2');
  });

  it('puts the trigger image after the trades table, not inside it', () => {
    const xml = String(buildJournalReportParts(input())['word/document.xml']);
    const lastTableEnd = xml.lastIndexOf('</w:tbl>');
    expect(xml.indexOf('rIdImg2')).toBeGreaterThan(lastTableEnd);
  });

  it('puts each trade trigger table first and its images right beneath, then the next trade', () => {
    const base = input();
    const data = {
      ...base,
      triggers: [
        ...base.triggers,
        { id: 'tg2', sessionId: 's1', timeframeOptionId: 'tf', analysisEventId: null, analysisEventIds: [], description: 'تریگر دوم', marketMovement: '', notes: '', status: 'converted', linkedTradeId: 't2', createdAt: 3 },
      ] as unknown as JournalTriggerEvent[],
      trades: [
        ...base.trades,
        { id: 't2', journalSessionId: 's1', symbol: 'EURUSD', direction: 'short', entryPrice: 1.09, stopLoss: 1.1, takeProfit: 1.08, exitPrice: 1.08, profitLoss: 20, result: 'win', openedAt: start + 7_200_000 },
      ] as unknown as Trade[],
      media: [...base.media, { id: 'm3', analysisId: null, triggerId: 'tg2', image }],
    };
    const xml = String(buildJournalReportParts(data)['word/document.xml']);
    const firstTrigger = xml.indexOf('شرح تریگر');
    const firstTriggerImage = xml.indexOf('rIdImg2');
    const secondTrigger = xml.indexOf('تریگر دوم');
    const secondTriggerImage = xml.indexOf('rIdImg3');
    expect(firstTrigger).toBeLessThan(firstTriggerImage);
    expect(firstTriggerImage).toBeLessThan(secondTrigger);
    expect(secondTrigger).toBeLessThan(secondTriggerImage);
  });

  it('renders an empty report without throwing', () => {
    const empty = { ...input(), sessions: [], analyses: [], triggers: [], trades: [], media: [] };
    expect(String(buildJournalReportParts(empty)['word/document.xml'])).toContain('سشنی ثبت نشده');
  });

  it('writes first-trade time, the full trade table and per-trade psychology/review', () => {
    const base = input();
    const data = {
      ...base,
      trades: [{ ...base.trades[0], closedAt: start + 7_200_000, commission: 3, profitLoss: 40, review: JSON.stringify({ didWell: 'صبر کردم', didWrong: '', learned: 'درس', wouldTakeAgain: true, validSetup: true }) }] as unknown as Trade[],
      tradeData: [{ tradeId: 't1', journalSessionId: 's1', psychology: JSON.stringify({ before: { optionIds: ['tf'] } }), mistakeOptionIds: '[]', strategyCompliance: 'yes', setupQuality: 8, executionQuality: 7 }] as never,
    };
    const xml = String(buildJournalReportParts(data)['word/document.xml']);
    for (const text of ['تاریخ و ساعت اولین معامله', 'جدول معامله', 'قیمت ورود', 'حد ضرر', 'حد سود', 'قیمت خروج', 'کمیسیون', 'سود/زیان خالص', 'روان‌شناسی معامله و مرور پس از معامله', 'صبر کردم', 'تصاویر معامله']) {
      expect(xml).toContain(text);
    }
    expect(xml.indexOf('تصاویر معامله')).toBeGreaterThan(xml.indexOf('روان‌شناسی معامله و مرور پس از معامله'));
    expect(xml.indexOf('rIdImg2')).toBeGreaterThan(xml.indexOf('تصاویر معامله'));
  });

  it('includes trades that are not linked to any session, like the Excel report', () => {
    const base = input();
    const loose = { ...base.trades[0], id: 'loose-1', journalSessionId: null, journalTriggerEventId: null, symbol: 'LOOSEUSD', openedAt: start + 86_400_000 * 3 } as unknown as Trade;
    const xml = String(buildJournalReportParts({ ...base, trades: [...base.trades, loose] })['word/document.xml']);
    expect(xml).toContain('معاملات بدون سشن');
    expect(xml).toContain('LOOSEUSD');
  });
});
