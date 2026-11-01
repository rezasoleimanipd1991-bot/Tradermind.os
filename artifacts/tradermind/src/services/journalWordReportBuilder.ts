import type {
  Account, JournalOption, JournalSession, JournalSessionAnalysis, JournalTradeData, JournalTriggerEvent, Strategy, Trade,
} from '../db/database';
import { getNetPnl } from '../lib/tradeHelpers';
import { describeSessionMoment, formatCompactMoment, formatDualDateTime, localDayKey } from '../lib/sessionDateTime';
import { triggerAnalysisIds } from '../lib/triggerAnalysis';
import {
  buildDocxParts, CONTENT_WIDTH, imageParagraph, LABEL_FILL, paragraph, table,
  type DocxImagePart, type TableCell,
} from '../lib/ooxml';
import {
  parseAnalysisFieldSelections,
  type AnalysisFieldLayouts,
  type AnalysisFlexibleFieldKey,
  type JournalAnalysisFieldLabels,
} from './journalAnalysisFieldLabels';

/** تصویر آمادهٔ درج در Word (JPEG یا PNG). */
export interface ReportImage {
  fileName: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface ReportMedia {
  id: string;
  analysisId: string | null;
  triggerId: string | null;
  tradeId?: string | null;
  image: ReportImage;
}

export interface JournalReportInput {
  sessions: JournalSession[];
  options: JournalOption[];
  strategies: Strategy[];
  accounts: Account[];
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  trades: Trade[];
  /** داده‌های مرور هر معامله (روان‌شناسی، اشتباه‌ها، پایبندی). اختیاری. */
  tradeData?: JournalTradeData[];
  /** فیلدهای تحلیل که کاربر از فرم حذف کرده؛ فقط اگر مقدار قبلی داشته باشند در گزارش می‌آیند. */
  hiddenFields?: string[];
  media: ReportMedia[];
  labels: JournalAnalysisFieldLabels;
  layouts: AnalysisFieldLayouts;
  generatedAt: number;
}

const MAX_IMAGE_WIDTH_EMU = 5_940_000; // ۱۶٫۵ سانتی‌متر
const MAX_IMAGE_HEIGHT_EMU = 7_200_000; // ۲۰ سانتی‌متر

const DIRECTION_LABELS: Record<Trade['direction'], string> = { long: 'خرید', short: 'فروش' };
const RESULT_LABELS: Record<Trade['result'], string> = {
  win: 'سود', loss: 'زیان', breakeven: 'سر به سر', 'partial-win': 'سود جزئی',
  'partial-loss': 'زیان جزئی', open: 'باز', cancelled: 'لغوشده',
};
const TRIGGER_STATUS_LABELS: Record<JournalTriggerEvent['status'], string> = {
  pending: 'در انتظار', ignored: 'نادیده', invalid: 'نامعتبر', converted: 'متصل به معامله',
};

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6, useGrouping: false });
const pnlFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false });

const price = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? '—' : numberFormatter.format(value));
const pnlText = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${pnlFormatter.format(value)}`;
};

function parseIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T extends object>(value: string | null | undefined): T {
  if (!value) return {} as T;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
}

/** بدنهٔ XML سند و فهرست تصاویر را می‌سازد. */
export function buildJournalReportParts(input: JournalReportInput): Record<string, string | Uint8Array> {
  const optionLabel = new Map(input.options.map(option => [option.id, option.label]));
  const label = (id: string | null | undefined, fallback = '—') => {
    if (!id) return fallback;
    const found = optionLabel.get(id);
    if (found !== undefined) return found;
    return fallback && fallback !== '—' && fallback !== id ? fallback : 'گزینهٔ حذف‌شده';
  };
  const strategyName = new Map(input.strategies.map(item => [item.id, item.name]));
  const accountName = new Map(input.accounts.map(item => [item.id, item.name]));
  const tradeById = new Map(input.trades.map(trade => [trade.id, trade]));
  const dataByTrade = new Map((input.tradeData ?? []).map(item => [item.tradeId, item]));

  const images: DocxImagePart[] = [];
  let imageCounter = 0;
  const imageXml = (media: ReportMedia): string => {
    imageCounter += 1;
    const relationshipId = `rIdImg${imageCounter}`;
    const extension = media.image.fileName.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    images.push({ fileName: `image${imageCounter}.${extension}`, relationshipId, bytes: media.image.bytes });
    const widthEmu = media.image.width * 9525;
    const heightEmu = media.image.height * 9525;
    const scale = Math.min(1, MAX_IMAGE_WIDTH_EMU / widthEmu, MAX_IMAGE_HEIGHT_EMU / heightEmu);
    const cx = Math.max(1, Math.round(widthEmu * scale));
    const cy = Math.max(1, Math.round(heightEmu * scale));
    return imageParagraph(relationshipId, imageCounter, media.image.fileName, cx, cy);
  };
  const mediaFor = (target: { analysisId?: string; triggerId?: string; tradeId?: string }) => input.media.filter(item => {
    if (target.analysisId) return item.analysisId === target.analysisId;
    if (target.triggerId) return item.triggerId === target.triggerId;
    // عکس‌های مخصوص معامله (نه تحلیل و نه تریگر)
    return Boolean(target.tradeId) && item.tradeId === target.tradeId && !item.analysisId && !item.triggerId;
  });

  // ── گروه‌بندی سشن‌ها بر اساس روز ──
  const sessionsSorted = [...input.sessions].sort((a, b) => a.startTime - b.startTime);
  const days = new Map<string, JournalSession[]>();
  for (const session of sessionsSorted) {
    const key = localDayKey(session.startTime);
    days.set(key, [...(days.get(key) ?? []), session]);
  }
  // معاملاتی که به هیچ سشنی وصل نیستند هم باید در گزارش بیایند (مثل Excel)
  const knownSessionIds = new Set(input.sessions.map(session => session.id));
  const orphanDays = new Map<string, Trade[]>();
  for (const trade of input.trades) {
    if (trade.journalSessionId && knownSessionIds.has(trade.journalSessionId)) continue;
    const key = localDayKey(trade.openedAt);
    orphanDays.set(key, [...(orphanDays.get(key) ?? []), trade]);
  }
  const dayKeys = [...new Set([...days.keys(), ...orphanDays.keys()])].sort();

  const body: string[] = [];
  const rowsOf = (pairs: Array<[string, string]>): TableCell[][] =>
    pairs.filter(([, value]) => value && value !== '—').map(([name, value]) => [{ text: name, bold: true, fill: LABEL_FILL }, { text: value }]);
  const timeCell = (timestamp: number | null | undefined) => (timestamp == null ? '—' : formatCompactMoment(timestamp));
  const renderTrade = (trade: Trade, index: number, trigger: JournalTriggerEvent | undefined, triggerRows: TableCell[][]) => {
      body.push(paragraph(`معامله ${(index + 1).toLocaleString('fa-IR')} — ${trade.symbol} · ${DIRECTION_LABELS[trade.direction] ?? ''} · ${formatCompactMoment(trade.openedAt).replace('\n', ' ')}`, { style: 'Heading3', keepNext: true, before: 240 }));
      // ۱) تریگر ورود و توضیح آن
      body.push(paragraph('تریگر ورود', { bold: true, keepNext: true }));
      body.push(table(triggerRows, [2600, CONTENT_WIDTH - 2600], { fontSize: 20 }));

      // ۲) جدول معامله
      body.push(paragraph('جدول معامله', { bold: true, keepNext: true, before: 160 }));
      const widths = [1500, 1150, 1150, 1150, 1150, 1500, 1100, CONTENT_WIDTH - 8700];
      const head: TableCell[] = ['تاریخ و ساعت ورود', 'قیمت ورود', 'حد ضرر', 'حد سود', 'قیمت خروج', 'تاریخ و ساعت خروج', 'کمیسیون', 'سود/زیان خالص']
        .map(text => ({ text, bold: true, fill: LABEL_FILL }));
      const net = getNetPnl(trade);
      const valueRow: TableCell[] = [
        { text: timeCell(trade.openedAt) }, { text: price(trade.entryPrice) }, { text: price(trade.stopLoss) }, { text: price(trade.takeProfit) },
        { text: price(trade.exitPrice) }, { text: timeCell(trade.closedAt) }, { text: price(trade.commission) },
        { text: pnlText(net), bold: true, color: net == null ? undefined : net > 0 ? '15803D' : net < 0 ? 'B91C1C' : undefined },
      ];
      body.push(table([head, valueRow], widths, { fontSize: 18, headerRows: 1 }));
      body.push(paragraph(`نتیجهٔ معامله: ${RESULT_LABELS[trade.result] ?? '—'}`, { before: 60 }));

      // ۳) روان‌شناسی معامله و مرور پس از معامله
      const meta = dataByTrade.get(trade.id);
      const psychology = parseJsonObject<Partial<Record<'before' | 'during' | 'after', { optionIds?: string[] }>>>(meta?.psychology);
      const review = parseJsonObject<{ didWell?: string; didWrong?: string; learned?: string; wouldTakeAgain?: boolean | null; validSetup?: boolean | null }>(trade.review);
      const yesNo = (value: boolean | null | undefined) => (value === true ? 'بله' : value === false ? 'خیر' : '');
      const compliance = meta?.strategyCompliance === 'yes' ? 'بله' : meta?.strategyCompliance === 'partially' ? 'تا حدی' : meta?.strategyCompliance === 'no' ? 'خیر' : '';
      const joinLabels = (ids: string[] | undefined) => (ids ?? []).map(id => label(id)).join('، ');
      const psychologyPairs: Array<[string, string]> = [
        ['احساسات قبل از ورود', joinLabels(psychology.before?.optionIds)],
        ['احساسات حین معامله', joinLabels(psychology.during?.optionIds)],
        ['احساسات بعد از خروج', joinLabels(psychology.after?.optionIds)],
        ['احساسات ثبت‌شده', joinLabels(parseIds(trade.emotions))],
        ['توضیح احساسات', trade.emotionNotes?.trim() ?? ''],
        ['اشتباه‌ها', joinLabels(parseIds(meta?.mistakeOptionIds))],
        ['پایبندی به استراتژی', compliance],
        ['کیفیت ستاپ (۰ تا ۱۰)', meta?.setupQuality != null ? String(meta.setupQuality) : ''],
        ['کیفیت اجرا (۰ تا ۱۰)', meta?.executionQuality != null ? String(meta.executionQuality) : ''],
        ['چه کاری را خوب انجام دادم', review.didWell?.trim() ?? ''],
        ['چه کاری را اشتباه انجام دادم', review.didWrong?.trim() ?? ''],
        ['آنچه یاد گرفتم', review.learned?.trim() ?? ''],
        ['ستاپ معتبر بود؟', yesNo(review.validSetup)],
        ['دوباره همین معامله را می‌گرفتم؟', yesNo(review.wouldTakeAgain)],
        ['درس‌آموخته', trade.lesson?.trim() ?? ''],
        ['یادداشت معامله', trade.notes?.trim() ?? ''],
      ];
      body.push(paragraph('روان‌شناسی معامله و مرور پس از معامله', { bold: true, keepNext: true, before: 160 }));
      const psychologyRows = rowsOf(psychologyPairs);
      body.push(psychologyRows.length ? table(psychologyRows, [2600, CONTENT_WIDTH - 2600], { fontSize: 20 }) : paragraph('موردی ثبت نشده است.'));

      // ۴) عکس‌ها در انتهای هر معامله: اول عکس تریگر، بعد عکس‌های خود معامله
      const tradeImages = [
        ...(trigger ? mediaFor({ triggerId: trigger.id }) : []),
        ...mediaFor({ tradeId: trade.id }),
      ];
      if (tradeImages.length) {
        body.push(paragraph('تصاویر معامله', { bold: true, keepNext: true, before: 160 }));
        for (const media of tradeImages) body.push(imageXml(media));
      }
  };

  const generated = describeSessionMoment(input.generatedAt);
  body.push(paragraph('گزارش ژورنال معاملاتی TraderMind', { style: 'Heading1' }));
  body.push(paragraph(`تاریخ تهیه: ${generated ? `${generated.weekday} ${generated.jalali} — ${generated.gregorian} — ${generated.time}` : '—'}`));
  body.push(paragraph(`تعداد روزهای معاملاتی: ${dayKeys.length.toLocaleString('fa-IR')} | تعداد سشن‌ها: ${sessionsSorted.length.toLocaleString('fa-IR')}`));
  if (dayKeys.length === 0) body.push(paragraph('در بازهٔ انتخاب‌شده سشنی ثبت نشده است.', { bold: true }));

  let dayIndex = 0;
  for (const key of dayKeys) {
    const daySessions = days.get(key) ?? [];
    const orphans = [...(orphanDays.get(key) ?? [])].sort((a, b) => a.openedAt - b.openedAt);
    const moment = describeSessionMoment(daySessions[0]?.startTime ?? orphans[0].openedAt);
    const dayTrades = [
      ...daySessions.flatMap(session => input.trades.filter(trade => trade.journalSessionId === session.id)),
      ...orphans,
    ].sort((a, b) => a.openedAt - b.openedAt);
    const closedPnl = dayTrades.reduce((sum, trade) => sum + (trade.profitLoss ?? 0), 0);
    const wins = dayTrades.filter(trade => trade.result === 'win' || trade.result === 'partial-win').length;
    const losses = dayTrades.filter(trade => trade.result === 'loss' || trade.result === 'partial-loss').length;

    body.push(paragraph(`روز معاملاتی: ${moment?.weekday ?? ''} ${moment?.jalali ?? ''}`, { style: 'Heading1', pageBreakBefore: dayIndex > 0 }));
    body.push(paragraph(`تاریخ میلادی: ${moment?.gregorian ?? '—'}`));
    body.push(paragraph(`ساعت شروع معاملاتی (اولین سشن روز): ${daySessions.length ? moment?.time ?? '—' : '—'}`, { bold: true }));
    const firstTrade = dayTrades[0];
    body.push(paragraph(`تاریخ و ساعت اولین معامله: ${firstTrade ? formatDualDateTime(firstTrade.openedAt) : 'معامله‌ای ثبت نشده است'}`, { bold: true }));
    body.push(paragraph(`تعداد سشن: ${daySessions.length.toLocaleString('fa-IR')} | معاملات: ${dayTrades.length.toLocaleString('fa-IR')} | برد: ${wins.toLocaleString('fa-IR')} | باخت: ${losses.toLocaleString('fa-IR')} | مجموع سود/زیان: ${pnlText(closedPnl)}`));
    dayIndex += 1;

    for (const session of daySessions) {
      const sessionMoment = describeSessionMoment(session.startTime);
      let symbols: string[] = [];
      try { const parsed: unknown = JSON.parse(session.symbols); symbols = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []; } catch { symbols = []; }
      const heading = [
        `سشن ${symbols.join(' / ') || '—'}`,
        session.sessionTypeOptionId ? label(session.sessionTypeOptionId) : '',
        sessionMoment?.time ?? '',
      ].filter(Boolean).join(' · ');
      body.push(paragraph(heading, { style: 'Heading2', before: 360 }));
      const overview: Array<[string, string]> = [
        ['نماد', symbols.join(' / ')],
        ['نوع سشن', label(session.sessionTypeOptionId, '')],
        ['بازار', label(session.marketOptionId, '')],
        ['حساب', accountName.get(session.accountId) ?? ''],
        ['استراتژی', strategyName.get(session.strategyId) ?? ''],
        ['زمان شروع', sessionMoment ? `${sessionMoment.weekday} ${sessionMoment.jalali} — ${sessionMoment.gregorian} — ${sessionMoment.time}` : ''],
        ['زمان پایان', session.endTime ? formatCompactMoment(session.endTime).replace('\n', ' ') : ''],
        ['یادداشت زمینهٔ سشن', session.notes?.trim() ?? ''],
        ['روان‌شناسی پیش از معامله', session.preTradePsychology?.trim() ?? ''],
        ['درس‌های آموخته‌شده', session.lessonsLearned?.trim() ?? ''],
        ['مرور اشتباه‌ها', session.mistakesReview?.trim() ?? ''],
        ['مرور روان‌شناختی', session.psychologicalReview?.trim() ?? ''],
        ['مشاهدات استراتژی', session.strategyObservations?.trim() ?? ''],
        ['پیشنهاد تغییر استراتژی', session.strategyChangeProposal?.trim() ?? ''],
        ['بازتاب نهایی', session.finalReflection?.trim() ?? ''],
      ];
      body.push(paragraph('توضیحات کلی سشن', { style: 'Heading3', keepNext: true }));
      const overviewRows: TableCell[][] = overview.filter(([, value]) => value).map(([name, value]) => [{ text: name, bold: true, fill: LABEL_FILL }, { text: value }]);
      body.push(overviewRows.length ? table(overviewRows, [2600, CONTENT_WIDTH - 2600], { fontSize: 20 }) : paragraph('توضیحی برای این سشن ثبت نشده است.'));

      // ۲) تحلیل‌های چندبازه‌ای
      const analyses = input.analyses.filter(item => item.sessionId === session.id).sort((a, b) => a.createdAt - b.createdAt);
      body.push(paragraph('رویدادهای تحلیل چندبازه‌ای', { style: 'Heading3' }));
      if (analyses.length === 0) body.push(paragraph('تحلیلی ثبت نشده است.'));
      for (const analysis of analyses) {
        const selections = parseAnalysisFieldSelections(analysis.fieldSelections);
        const flexible = (key: AnalysisFlexibleFieldKey, text: string | undefined): string => {
          const layout = input.layouts[key];
          if (layout.kind === 'checkbox') {
            const selected = (selections[key] ?? []).map(id => label(id, 'گزینهٔ حذف‌شده')).join('، ');
            return [selected, text?.trim() ? `متن قبلی: ${text.trim()}` : ''].filter(Boolean).join('\n');
          }
          return text?.trim() ?? '';
        };
        const tradeSummary = (id: string | null | undefined) => {
          const trade = id ? tradeById.get(id) : undefined;
          return trade ? `${trade.symbol} · ${formatCompactMoment(trade.openedAt).replace('\n', ' ')}` : '';
        };
        const L = input.labels;
        const fields: Array<[string, string]> = [
          [L.analysisText, flexible('analysisText', analysis.analysisText)],
          [L.marketContext, flexible('marketContext', analysis.marketContext)],
          [L.momentumText, flexible('momentumText', analysis.momentumText)],
          [L.pricePositionText, flexible('pricePositionText', analysis.pricePositionText)],
          [L.expectedDirectionOptionId, label(analysis.expectedDirectionOptionId, '')],
          [L.directionLogicText, flexible('directionLogicText', analysis.directionLogicText)],
          [L.scenario, flexible('scenario', analysis.scenario)],
          [L.triggerContext, flexible('triggerContext', analysis.triggerContext)],
          [L.zones, flexible('zones', analysis.zones)],
          [L.notes, analysis.notes?.trim() ?? ''],
          ['نتیجهٔ سناریو', [label(analysis.scenarioOutcomeOptionId, ''), analysis.scenarioOutcomeNote?.trim() ?? ''].filter(Boolean).join('\n')],
          [L.previousTradeId, tradeSummary(analysis.previousTradeId)],
          [L.nextTradeId, tradeSummary(analysis.nextTradeId)],
          [L.tags, parseIds(analysis.tags).join('، ')],
        ];
        // مقادیر قدیمی (جهت بازار، ساختار بازار، زمینهٔ نقدینگی) فقط اگر قبلاً پر شده باشند.
        if (analysis.directionOptionId) fields.push([`${L.directionOptionId} (ثبت قبلی)`, label(analysis.directionOptionId)]);
        if (analysis.marketStructureOptionId) fields.push([`${L.marketStructureOptionId} (ثبت قبلی)`, label(analysis.marketStructureOptionId)]);
        const legacyLiquidity = parseIds(analysis.liquidityContextOptionIds);
        if (legacyLiquidity.length) fields.push([`${L.liquidityContextOptionIds} (ثبت قبلی)`, legacyLiquidity.map(id => label(id)).join('، ')]);

        const hiddenNames = new Set((input.hiddenFields ?? []).map(key => (L as unknown as Record<string, string>)[key]));
        for (let index = fields.length - 1; index >= 0; index -= 1) {
          if (hiddenNames.has(fields[index][0]) && !fields[index][1]) fields.splice(index, 1);
        }
        body.push(paragraph(`تایم‌فریم: ${label(analysis.timeframeOptionId, 'تایم‌فریم حذف‌شده')}`, { style: 'Heading3', keepNext: true }));
        const rows: TableCell[][] = fields.map(([name, value]) => [{ text: name, bold: true, fill: LABEL_FILL }, { text: value || '—' }]);
        body.push(table(rows, [2600, CONTENT_WIDTH - 2600], { fontSize: 20 }));
        for (const media of mediaFor({ analysisId: analysis.id })) body.push(imageXml(media));
      }

      // ۳) معاملات ثبت‌شده همراه تریگر
      const triggers = input.triggers.filter(item => item.sessionId === session.id).sort((a, b) => a.createdAt - b.createdAt);
      const sessionTrades = input.trades.filter(trade => trade.journalSessionId === session.id).sort((a, b) => a.openedAt - b.openedAt);
      const triggerOfTrade = (trade: Trade) => triggers.find(item => item.linkedTradeId === trade.id)
        ?? triggers.find(item => item.id === trade.journalTriggerEventId);
      const analysisTimeframe = new Map(analyses.map(item => [item.id, label(item.timeframeOptionId)]));
      const triggerPairs = (trigger: JournalTriggerEvent | undefined): Array<[string, string]> => {
        if (!trigger) return [['تریگر', 'برای این معامله تریگری ثبت نشده است.']];
        const related = triggerAnalysisIds(trigger).map(id => analysisTimeframe.get(id)).filter(Boolean).join('، ');
        return [
          ['تایم‌فریم تریگر', label(trigger.timeframeOptionId, '')],
          ['نوع تریگر', label(trigger.triggerTypeOptionId, '')],
          ['جهت تریگر', label(trigger.directionOptionId, '')],
          ['شرح تریگر', trigger.description?.trim() ?? ''],
          ['حرکت قیمت و واکنش بازار', trigger.marketMovement?.trim() ?? ''],
          ['یادداشت تریگر', trigger.notes?.trim() ?? ''],
          ['تحلیل‌های مرتبط', related],
          ['وضعیت تریگر', TRIGGER_STATUS_LABELS[trigger.status] ?? ''],
        ];
      };

      body.push(paragraph('معاملات و تریگر هر معامله', { style: 'Heading3', before: 240 }));
      if (sessionTrades.length === 0) body.push(paragraph('معامله‌ای در این سشن ثبت نشده است.'));
      sessionTrades.forEach((trade, index) => {
        const trigger = triggerOfTrade(trade);
        renderTrade(trade, index, trigger, rowsOf(triggerPairs(trigger)));
      });

      // تریگرهای بدون معامله: همان قالب، جدول و بعد عکس‌ها
      const linkedIds = new Set(sessionTrades.map(trade => triggerOfTrade(trade)?.id).filter(Boolean));
      const unlinked = triggers.filter(trigger => !linkedIds.has(trigger.id));
      unlinked.forEach((trigger, index) => {
        body.push(paragraph(`تریگر بدون معامله ${(index + 1).toLocaleString('fa-IR')} — ${formatCompactMoment(trigger.createdAt).replace('\n', ' ')}`, { style: 'Heading3', keepNext: true, before: 240 }));
        body.push(table(rowsOf(triggerPairs(trigger)), [2600, CONTENT_WIDTH - 2600], { fontSize: 20 }));
        for (const media of mediaFor({ triggerId: trigger.id })) body.push(imageXml(media));
      });
    }

    if (orphans.length) {
      body.push(paragraph('معاملات بدون سشن', { style: 'Heading2', before: 360 }));
      const noTrigger = rowsOf([['تریگر', 'برای این معامله تریگری ثبت نشده است.']]);
      orphans.forEach((trade, index) => renderTrade(trade, index, undefined, noTrigger));
    }
  }

  return buildDocxParts(body.join(''), images);
}
