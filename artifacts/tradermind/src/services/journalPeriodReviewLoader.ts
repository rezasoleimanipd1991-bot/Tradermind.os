import JSZip from 'jszip';
import { db } from '../db/database';
import {
  buildPeriodReview, resolveReviewRange, type PeriodReview, type ReviewPeriodKind,
} from './journalPeriodReview';
import { buildPeriodReviewParts } from './journalPeriodReviewWord';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** مرور خودکار دورهٔ هفتگی یا ماهانه را از دیتابیس می‌سازد. offset = ۰ دورهٔ جاری، -۱ دورهٔ قبل. */
export async function loadPeriodReview(kind: ReviewPeriodKind, offset = 0, now = Date.now()): Promise<PeriodReview> {
  const range = resolveReviewRange(kind, now, offset);
  const previousRange = resolveReviewRange(kind, now, offset - 1);
  const earliest = Math.min(range.from, previousRange.from);
  const sessions = (await db.journalSessions.where('startTime').between(earliest, range.to, true, true).toArray());
  const sessionIds = sessions.map(session => session.id);
  const [trades, analyses, triggers, options, tradeData] = await Promise.all([
    db.trades.where('journalSessionId').anyOf(sessionIds).toArray(),
    db.journalSessionAnalyses.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalTriggerEvents.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalOptions.toArray(),
    db.journalTradeData.where('journalSessionId').anyOf(sessionIds).toArray(),
  ]);
  return buildPeriodReview({ sessions, trades, analyses, triggers, options, tradeData }, range, previousRange);
}

export async function buildPeriodReviewWord(kind: ReviewPeriodKind, offset = 0): Promise<Blob> {
  const review = await loadPeriodReview(kind, offset);
  const zip = new JSZip();
  for (const [path, content] of Object.entries(buildPeriodReviewParts(review))) zip.file(path, content);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}
