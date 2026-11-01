import { db } from '../db/database';
import type { JournalSession, Trade } from '../db/database';
import { getNetPnl } from '../lib/tradeHelpers';
import { describeSessionMoment } from '../lib/sessionDateTime';
import { triggerAnalysisIds } from '../lib/triggerAnalysis';
import { getHiddenAnalysisFields, getJournalAnalysisFieldLabels, parseAnalysisFieldSelections } from './journalAnalysisFieldLabels';
import { journalSessionService } from './journalSessionService';
import type { JournalReportRange } from './journalWordReport';

export type ReportCell = string | number | boolean | null | undefined;
export interface ReportSheet { name: string; rows: ReportCell[][] }

const DIRECTION: Record<string, string> = { long: 'خرید (Long)', short: 'فروش (Short)' };
const RESULT: Record<string, string> = {
  win: 'سود', loss: 'زیان', breakeven: 'سر به سر', 'partial-win': 'سود جزئی',
  'partial-loss': 'زیان جزئی', open: 'باز', cancelled: 'لغوشده',
};
const STATUS: Record<string, string> = { open: 'باز', closed: 'بسته', cancelled: 'لغوشده' };
const TRIGGER_STATUS: Record<string, string> = {
  pending: 'در انتظار', ignored: 'نادیده', invalid: 'نامعتبر', converted: 'متصل به معامله',
};
const SESSION_STATUS: Record<string, string> = { active: 'در جریان', completed: 'تکمیل‌شده', cancelled: 'لغوشده' };

function parseList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

const dateParts = (timestamp: number | null | undefined) => {
  if (timestamp == null) return { jalali: '', gregorian: '', time: '', weekday: '' };
  const moment = describeSessionMoment(timestamp);
  return moment ?? { jalali: '', gregorian: '', time: '', weekday: '' };
};

/**
 * ردیف‌های گزارش Excel (بدون عکس). این فایل گزارش است، نه پشتیبان.
 * همهٔ معاملات بازه را می‌آورد: معاملات سشنی همراه اطلاعات سشن و تریگر، و معاملات قدیمی بدون سشن.
 */
export async function buildJournalExcelSheets(range: JournalReportRange = {}): Promise<{ sheets: ReportSheet[]; tradeCount: number }> {
  const inRange = (timestamp: number) =>
    (range.from == null || timestamp >= range.from) && (range.to == null || timestamp <= range.to);

  const [allSessions, allTrades, options, strategies, accounts, boxes, analyses, triggers, tradeData] = await Promise.all([
    db.journalSessions.toArray(),
    db.trades.toArray(),
    db.journalOptions.toArray(),
    db.strategies.toArray(),
    db.accounts.toArray(),
    db.tradingBoxes.toArray(),
    db.journalSessionAnalyses.toArray(),
    db.journalTriggerEvents.toArray(),
    db.journalTradeData.toArray(),
  ]);

  const sessions = allSessions.filter(session => inRange(session.startTime)).sort((a, b) => a.startTime - b.startTime);
  const sessionById = new Map<string, JournalSession>(allSessions.map(session => [session.id, session]));
  const sessionIds = new Set(sessions.map(session => session.id));
  const trades = allTrades
    .filter(trade => (trade.journalSessionId ? sessionIds.has(trade.journalSessionId) : inRange(trade.openedAt)))
    .sort((a, b) => a.openedAt - b.openedAt);

  const optionLabel = new Map(options.map(option => [option.id, option.label]));
  const label = (id: string | null | undefined) => (id ? optionLabel.get(id) ?? 'گزینهٔ حذف‌شده' : '');
  const labels = (ids: string[]) => ids.map(id => optionLabel.get(id) ?? 'گزینهٔ حذف‌شده').join('، ');
  const strategyName = new Map(strategies.map(item => [item.id, item.name]));
  const accountName = new Map(accounts.map(item => [item.id, item.name]));
  const boxName = new Map(boxes.map(item => [item.id, item.name]));
  const dataByTrade = new Map(tradeData.map(item => [item.tradeId, item]));
  const triggerByTrade = (trade: Trade) =>
    triggers.find(item => item.linkedTradeId === trade.id) ?? triggers.find(item => item.id === trade.journalTriggerEventId);
  const analysisById = new Map(analyses.map(item => [item.id, item]));
  const symbolsOf = (session: JournalSession | undefined) => (session ? parseList(session.symbols).join(' / ') : '');
  await journalSessionService.hydrateAnalysisFieldConfig();
  const fieldLabels = getJournalAnalysisFieldLabels();
  const hiddenCategoryIds = await journalSessionService.getHiddenCategoryIds();

  // ── برگ معاملات ──
  const tradeRows: ReportCell[][] = [[
    'ردیف', 'تاریخ ورود (شمسی)', 'تاریخ ورود (میلادی)', 'روز هفته', 'ساعت ورود', 'تاریخ خروج (شمسی)', 'تاریخ خروج (میلادی)', 'ساعت خروج',
    'نماد', 'بازار', 'جهت', 'وضعیت', 'نتیجه',
    'قیمت ورود', 'حد ضرر', 'حد سود', 'قیمت خروج', 'حجم', 'ریسک ٪', 'مقدار ریسک', 'R', 'RR برنامه‌ریزی‌شده',
    'سود/زیان خام', 'کمیسیون', 'اسپرد', 'سایر هزینه‌ها', 'سود/زیان خالص',
    'حساب', 'باکس', 'استراتژی',
    'سشن معاملاتی', 'نوع سشن', 'تایم‌فریم تریگر', 'نوع تریگر', 'شرح تریگر', 'حرکت قیمت و واکنش بازار', 'یادداشت تریگر', 'تحلیل‌های مرتبط',
    'تریگر ورود', 'دلیل ورود', 'دلیل خروج', 'نوع ستاپ', 'درجهٔ ستاپ', 'نوع SCO', 'نوع FVG', 'نتیجهٔ سناریو',
    'احساسات (قبل)', 'احساسات (حین)', 'احساسات (بعد)', 'اشتباهات', 'پایبندی به استراتژی', 'کیفیت ستاپ', 'کیفیت اجرا',
    'برچسب‌ها', 'یادداشت', 'درس‌آموخته',
  ]];
  trades.forEach((trade, index) => {
    const session = trade.journalSessionId ? sessionById.get(trade.journalSessionId) : undefined;
    const trigger = triggerByTrade(trade);
    const meta = dataByTrade.get(trade.id);
    const open = dateParts(trade.openedAt);
    const close = dateParts(trade.closedAt);
    const psychology = parseJson<Partial<Record<'before' | 'during' | 'after', { optionIds?: string[] }>>>(meta?.psychology, {});
    const compliance = meta?.strategyCompliance === 'yes' ? 'بله' : meta?.strategyCompliance === 'partially' ? 'تا حدی' : meta?.strategyCompliance === 'no' ? 'خیر' : '';
    const related = trigger
      ? triggerAnalysisIds(trigger).map(id => analysisById.get(id)).filter(Boolean).map(item => label(item!.timeframeOptionId)).join('، ')
      : '';
    tradeRows.push([
      index + 1, open.jalali, open.gregorian, open.weekday, open.time, close.jalali, close.gregorian, close.time,
      trade.symbol, trade.market ?? '', DIRECTION[trade.direction] ?? trade.direction, STATUS[trade.status] ?? trade.status, RESULT[trade.result] ?? trade.result,
      trade.entryPrice, trade.stopLoss, trade.takeProfit, trade.exitPrice, trade.positionSize, trade.riskPercentage, trade.riskAmount, trade.rMultiple, trade.plannedRR,
      trade.profitLoss, trade.commission, trade.spread, trade.fees, getNetPnl(trade),
      trade.accountId ? accountName.get(trade.accountId) ?? '' : '', trade.boxId ? boxName.get(trade.boxId) ?? '' : '', trade.strategyId ? strategyName.get(trade.strategyId) ?? '' : '',
      session ? `${symbolsOf(session)} · ${dateParts(session.startTime).jalali} ${dateParts(session.startTime).time}` : 'بدون سشن (ثبت قدیمی)',
      label(session?.sessionTypeOptionId), trigger ? label(trigger.timeframeOptionId) : '', trigger ? label(trigger.triggerTypeOptionId) : '',
      trigger?.description ?? '', trigger?.marketMovement ?? '', trigger?.notes ?? '', related,
      labels(parseList(meta?.entryTriggerOptionIds)), meta?.entryReasonOptionId ? label(meta.entryReasonOptionId) : trade.entryReason ?? '',
      meta?.exitReasonOptionId ? label(meta.exitReasonOptionId) : trade.reasonForExit ?? '',
      meta?.setupTypeOptionId ? label(meta.setupTypeOptionId) : trade.setupType ?? '', label(meta?.setupGradeOptionId), label(meta?.scoTypeOptionId), label(meta?.fvgTypeOptionId), label(meta?.scenarioOutcomeOptionId),
      labels(psychology.before?.optionIds ?? []), labels(psychology.during?.optionIds ?? []), labels(psychology.after?.optionIds ?? []),
      labels(parseList(meta?.mistakeOptionIds)), compliance, meta?.setupQuality, meta?.executionQuality,
      parseList(trade.tags).join('، '), trade.notes ?? '', trade.lesson ?? '',
    ]);
  });

  // ── برگ سشن‌ها ──
  const sessionRows: ReportCell[][] = [[
    'تاریخ شروع (شمسی)', 'تاریخ شروع (میلادی)', 'ساعت شروع', 'ساعت پایان', 'نماد', 'نوع سشن', 'بازار', 'حساب', 'باکس', 'استراتژی', 'وضعیت',
    'تعداد معاملات', 'سود/زیان خالص', 'کیفیت سشن (۰ تا ۱۰)', 'یادداشت زمینه', 'روان‌شناسی پیش از معامله', 'درس‌های آموخته‌شده', 'مرور اشتباه‌ها',
    'مرور روان‌شناختی', 'مشاهدات استراتژی', 'پیشنهاد تغییر استراتژی', 'بازتاب نهایی',
  ]];
  for (const session of sessions) {
    const start = dateParts(session.startTime);
    const end = dateParts(session.endTime);
    const own = trades.filter(trade => trade.journalSessionId === session.id);
    const net = own.reduce((sum, trade) => sum + (getNetPnl(trade) ?? 0), 0);
    sessionRows.push([
      start.jalali, start.gregorian, start.time, end.time, symbolsOf(session), label(session.sessionTypeOptionId), label(session.marketOptionId),
      accountName.get(session.accountId) ?? '', boxName.get(session.tradingBoxId) ?? '', strategyName.get(session.strategyId) ?? '', SESSION_STATUS[session.status] ?? session.status,
      own.length, own.length ? Number(net.toFixed(2)) : '', session.sessionQuality, session.notes, session.preTradePsychology ?? '', session.lessonsLearned, session.mistakesReview,
      session.psychologicalReview, session.strategyObservations, session.strategyChangeProposal, session.finalReflection ?? '',
    ]);
  }

  // ── برگ تحلیل‌ها ──
  const L = fieldLabels;
  const analysisRows: ReportCell[][] = [[
    'تاریخ سشن', 'نماد', 'تایم‌فریم', L.analysisText, L.marketContext, L.momentumText, L.pricePositionText, L.directionLogicText,
    L.expectedDirectionOptionId, L.scenario, L.triggerContext, L.zones, L.notes, 'نتیجهٔ سناریو', 'توضیح نتیجهٔ سناریو', L.tags,
  ]];
  for (const analysis of analyses.filter(item => sessionIds.has(item.sessionId)).sort((a, b) => a.createdAt - b.createdAt)) {
    const session = sessionById.get(analysis.sessionId);
    const selections = parseAnalysisFieldSelections(analysis.fieldSelections);
    const withSelections = (key: keyof typeof selections, text: string | undefined) =>
      [(selections[key] ?? []).map(id => optionLabel.get(id) ?? 'گزینهٔ حذف‌شده').join('، '), text?.trim() ?? ''].filter(Boolean).join('\n');
    analysisRows.push([
      session ? `${dateParts(session.startTime).jalali} ${dateParts(session.startTime).time}` : '', symbolsOf(session), label(analysis.timeframeOptionId),
      withSelections('analysisText', analysis.analysisText), withSelections('marketContext', analysis.marketContext), withSelections('momentumText', analysis.momentumText),
      withSelections('pricePositionText', analysis.pricePositionText), withSelections('directionLogicText', analysis.directionLogicText),
      label(analysis.expectedDirectionOptionId), withSelections('scenario', analysis.scenario), withSelections('triggerContext', analysis.triggerContext),
      withSelections('zones', analysis.zones), analysis.notes ?? '', label(analysis.scenarioOutcomeOptionId), analysis.scenarioOutcomeNote ?? '',
      parseList(analysis.tags).join('، '),
    ]);
  }

  // ── برگ تریگرها ──
  const triggerRows: ReportCell[][] = [[
    'تاریخ سشن', 'نماد', 'زمان ثبت', 'تایم‌فریم', 'نوع تریگر', 'جهت', 'تأییدشده', 'وضعیت', 'شرح تریگر', 'حرکت قیمت و واکنش بازار', 'یادداشت', 'تحلیل‌های مرتبط', 'معامله متصل',
  ]];
  for (const trigger of triggers.filter(item => sessionIds.has(item.sessionId)).sort((a, b) => a.createdAt - b.createdAt)) {
    const session = sessionById.get(trigger.sessionId);
    const created = dateParts(trigger.createdAt);
    const linked = trigger.linkedTradeId ? allTrades.find(trade => trade.id === trigger.linkedTradeId) : undefined;
    triggerRows.push([
      session ? `${dateParts(session.startTime).jalali} ${dateParts(session.startTime).time}` : '', symbolsOf(session), `${created.jalali} ${created.time}`,
      label(trigger.timeframeOptionId), label(trigger.triggerTypeOptionId), label(trigger.directionOptionId), trigger.confirmed ? 'بله' : 'خیر', TRIGGER_STATUS[trigger.status] ?? trigger.status,
      trigger.description, trigger.marketMovement, trigger.notes,
      triggerAnalysisIds(trigger).map(id => analysisById.get(id)).filter(Boolean).map(item => label(item!.timeframeOptionId)).join('، '),
      linked ? `${linked.symbol} · ${dateParts(linked.openedAt).jalali} ${dateParts(linked.openedAt).time}` : '',
    ]);
  }

  // ستون‌های دسته‌ها/فیلدهای حذف‌شده فقط اگر داده‌ای داشته باشند در گزارش می‌مانند.
  const dropEmptyColumns = (rows: ReportCell[][], isHidden: (header: string) => boolean): ReportCell[][] => {
    const keep = rows[0].map((header, column) =>
      !isHidden(String(header)) || rows.slice(1).some(row => row[column] != null && String(row[column]).trim() !== ''));
    return rows.map(row => row.filter((_, column) => keep[column]));
  };
  const hiddenTradeHeaders = new Set<string>();
  const categoryHeaders: Record<string, string[]> = {
    entry_reason: ['دلیل ورود'], exit_reason: ['دلیل خروج'], setup_type: ['نوع ستاپ'], setup_grade: ['درجهٔ ستاپ'],
    sco_type: ['نوع SCO'], fvg_type: ['نوع FVG'], scenario_outcome: ['نتیجهٔ سناریو'], mistake: ['اشتباهات'],
    psychology: ['احساسات (قبل)', 'احساسات (حین)', 'احساسات (بعد)'], session_type: ['نوع سشن'],
  };
  for (const id of hiddenCategoryIds) for (const header of categoryHeaders[id] ?? []) hiddenTradeHeaders.add(header);
  const hiddenAnalysisHeaders = new Set(getHiddenAnalysisFields().map(key => fieldLabels[key]));

  return {
    tradeCount: trades.length,
    sheets: [
      { name: 'معاملات', rows: dropEmptyColumns(tradeRows, header => hiddenTradeHeaders.has(header)) },
      { name: 'سشن‌ها', rows: sessionRows },
      { name: 'تحلیل‌ها', rows: dropEmptyColumns(analysisRows, header => hiddenAnalysisHeaders.has(header)) },
      { name: 'تریگرها', rows: triggerRows },
    ],
  };
}
