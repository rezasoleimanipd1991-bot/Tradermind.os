import JSZip from 'jszip';
import { db } from '../db/database';
import { compressImage } from '../lib/imageCompression';
import { getHiddenAnalysisFields, getJournalAnalysisFieldLabels, getJournalAnalysisFieldLayouts } from './journalAnalysisFieldLabels';
import { journalSessionService } from './journalSessionService';
import { buildJournalReportParts, type ReportMedia } from './journalWordReportBuilder';

export interface JournalReportRange {
  /** ابتدای بازه (timestamp، شامل). */
  from?: number;
  /** انتهای بازه (timestamp، شامل). */
  to?: number;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * گزارش Word ژورنال: به‌ازای هر روز معاملاتی، جدول معاملات، تحلیل‌های چندبازه‌ای
 * همراه عکس، و معاملات به‌همراه تریگرشان (عکس تریگر بعد از جدول).
 */
export async function buildJournalWordReport(range: JournalReportRange = {}): Promise<{ blob: Blob; sessionCount: number }> {
  const allSessions = await db.journalSessions.toArray();
  const sessions = allSessions.filter(session =>
    (range.from == null || session.startTime >= range.from) && (range.to == null || session.startTime <= range.to));
  const sessionIds = sessions.map(session => session.id);

  await journalSessionService.hydrateAnalysisFieldConfig();
  const inRange = (timestamp: number) =>
    (range.from == null || timestamp >= range.from) && (range.to == null || timestamp <= range.to);
  const sessionIdSet = new Set(sessionIds);
  // همهٔ معاملات؛ مثل Excel: معاملهٔ وصل‌به‌سشن از روی سشنِ بازه، معاملهٔ بدون سشن از روی زمان ورود
  const allTrades = await db.trades.toArray();
  const trades = allTrades.filter(trade => (trade.journalSessionId ? sessionIdSet.has(trade.journalSessionId) : inRange(trade.openedAt)));
  const tradeIdSet = new Set(trades.map(trade => trade.id));
  const orphanIds = trades.filter(trade => !trade.journalSessionId).map(trade => trade.id);

  const [options, strategies, accounts, analyses, triggers, allTradeData, sessionMedia, orphanMedia] = await Promise.all([
    db.journalOptions.toArray(),
    db.strategies.toArray(),
    db.accounts.toArray(),
    db.journalSessionAnalyses.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalTriggerEvents.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalTradeData.toArray(),
    db.journalMedia.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalMedia.where('tradeId').anyOf(orphanIds).toArray(),
  ]);

  const tradeData = allTradeData.filter(item => tradeIdSet.has(item.tradeId));
  const mediaById = new Map([...sessionMedia, ...orphanMedia].map(record => [record.id, record]));
  const mediaRecords = [...mediaById.values()];

  // عکس‌ها یکی‌یکی به JPEG تبدیل می‌شوند (Word از WebP پشتیبانی نمی‌کند) تا حافظهٔ گوشی پر نشود.
  const media: ReportMedia[] = [];
  for (const record of mediaRecords.sort((a, b) => a.createdAt - b.createdAt)) {
    if (!record.mimeType.startsWith('image/') || (!record.analysisId && !record.triggerId && !record.tradeId)) continue;
    try {
      const converted = await compressImage(record.blob, { maxWidth: 1600, maxHeight: 1600, quality: 0.85, mimeType: 'image/jpeg' });
      media.push({
        id: record.id,
        analysisId: record.analysisId ?? null,
        triggerId: record.triggerId ?? null,
        tradeId: record.tradeId ?? null,
        image: {
          fileName: `${record.id}.jpg`,
          bytes: new Uint8Array(await converted.blob.arrayBuffer()),
          width: converted.width,
          height: converted.height,
        },
      });
    } catch {
      // تصویر نامعتبر یا ناخوانا؛ از گزارش حذف می‌شود و بقیهٔ گزارش ساخته می‌شود.
    }
  }

  const parts = buildJournalReportParts({
    sessions, options, strategies, accounts, analyses, triggers, trades, tradeData, media,
    labels: getJournalAnalysisFieldLabels(),
    hiddenFields: getHiddenAnalysisFields(),
    layouts: getJournalAnalysisFieldLayouts(),
    generatedAt: Date.now(),
  });

  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    // تصویرها از قبل فشرده‌اند؛ فقط XMLها DEFLATE می‌شوند.
    zip.file(path, content, { compression: typeof content === 'string' ? 'DEFLATE' : 'STORE' });
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
  return { blob, sessionCount: sessions.length };
}
