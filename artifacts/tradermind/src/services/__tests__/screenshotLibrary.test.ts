import { beforeEach, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { db, type JournalMedia, type JournalSession, type Trade } from '../../db/database';
import {
  backfillScreenshotLibrary,
  getAllChartScreenshots,
  saveTradeScreenshotToLibrary,
} from '../screenshotIntelligenceService';
import type { TradeScreenshot } from '../../types/screenshot';

const imageDataUrl = 'data:image/png;base64,aGVsbG8=';

function legacyScreenshot(id: string): TradeScreenshot {
  return {
    id,
    label: `capture ${id}`,
    dataUrl: imageDataUrl,
    type: 'entry',
    linkedTo: null,
    timeframe: '1M',
    lifecyclePosition: 'entry',
    width: 1,
    height: 1,
    fileSize: 5,
    quality: null,
    extractedFeatures: [],
    fibonacci: null,
    analysisNotes: null,
    userAddedFeatures: [],
    annotations: [],
    createdAt: Date.now(),
  };
}

describe('Screenshot Intelligence library capture and backfill', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('adds trade captures to the independent library once', async () => {
    const trade = {
      id: 'trade-capture',
      symbol: 'EURUSD',
      direction: 'long',
      openedAt: Date.now(),
      screenshots: '[]',
      tradingSession: 'london',
    } as unknown as Trade;
    const screenshot = legacyScreenshot('capture-1');

    const first = await saveTradeScreenshotToLibrary(trade, screenshot);
    const second = await saveTradeScreenshotToLibrary(trade, screenshot);

    expect(first?.sourceTradeScreenshotId).toBe(screenshot.id);
    expect(second?.id).toBe(first?.id);
    expect(await db.chartScreenshots.count()).toBe(1);
    expect(await getAllChartScreenshots()).toEqual([
      expect.objectContaining({ tradeId: trade.id, symbol: 'EURUSD', screenshotType: 'entry' }),
    ]);
  });

  it('backfills old trade and session images into the library idempotently', async () => {
    const trade = {
      id: 'legacy-trade',
      symbol: 'XAUUSD',
      direction: 'short',
      openedAt: Date.now(),
      screenshots: JSON.stringify([legacyScreenshot('legacy-capture')]),
      tradingSession: 'new-york',
    } as unknown as Trade;
    const session = {
      id: 'session-1',
      symbols: '["XAUUSD"]',
      strategyId: 'strategy-1',
    } as unknown as JournalSession;
    const media = {
      id: 'session-image',
      sessionId: session.id,
      tradeId: null,
      mimeType: 'image/png',
      blob: new NodeBlob(['session image'], { type: 'image/png' }),
      fileName: 'session.png',
      caption: 'Before entry',
      createdAt: Date.now(),
    } as JournalMedia;
    await db.trades.add(trade);
    await db.journalSessions.add(session);
    await db.journalMedia.add(media);

    expect(await backfillScreenshotLibrary()).toEqual({ trades: 1, media: 1 });
    expect(await backfillScreenshotLibrary()).toEqual({ trades: 0, media: 0 });
    expect(await db.chartScreenshots.count()).toBe(2);
    expect(await getAllChartScreenshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceTradeScreenshotId: 'legacy-capture', symbol: 'XAUUSD' }),
      expect.objectContaining({ sourceMediaId: 'session-image', label: 'session.png', strategy: 'strategy-1' }),
    ]));
  });
});
