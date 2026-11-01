import {
  buildDocxParts, CONTENT_WIDTH, LABEL_FILL, paragraph, table, type TableCell,
} from '../lib/ooxml';
import type { BreakdownRow } from './journalBreakdownService';
import type { PeriodReview } from './journalPeriodReview';

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
const percent = (value: number | null) => (value == null ? '—' : `${Math.round(value)}٪`);
const average = (value: number | null) => (value == null ? '—' : `${signed(value)}R`);

function rowCells(row: BreakdownRow | null, title: string): TableCell[] {
  return row
    ? [{ text: title, bold: true, fill: LABEL_FILL }, { text: row.label }, { text: String(row.settled) }, { text: percent(row.winRate) }, { text: signed(row.netPnl) }]
    : [{ text: title, bold: true, fill: LABEL_FILL }, { text: '—' }, { text: '—' }, { text: '—' }, { text: '—' }];
}

/** فایل Word مرور هفتگی/ماهانه (بدون عکس؛ فقط خلاصه و جدول). */
export function buildPeriodReviewParts(review: PeriodReview): Record<string, string | Uint8Array> {
  const body: string[] = [];
  body.push(paragraph(`مرور ${review.range.kind === 'week' ? 'هفتگی' : 'ماهانه'} ژورنال`, { style: 'Heading1' }));
  body.push(paragraph(review.range.label, { bold: true }));
  body.push(paragraph(`بازهٔ میلادی: ${review.range.gregorianLabel}`));

  body.push(paragraph('خلاصهٔ دوره', { style: 'Heading2' }));
  const summary: TableCell[][] = [
    [{ text: 'تعداد سشن', bold: true, fill: LABEL_FILL }, { text: String(review.sessionCount) }],
    [{ text: 'روزهای معاملاتی', bold: true, fill: LABEL_FILL }, { text: String(review.tradingDays) }],
    [{ text: 'معاملات بسته‌شده', bold: true, fill: LABEL_FILL }, { text: String(review.overall.settled) }],
    [{ text: 'برد / باخت', bold: true, fill: LABEL_FILL }, { text: `${review.overall.wins} / ${review.overall.losses}` }],
    [{ text: 'نرخ برد', bold: true, fill: LABEL_FILL }, { text: percent(review.overall.winRate) }],
    [{ text: 'مجموع سود/زیان', bold: true, fill: LABEL_FILL }, { text: signed(review.overall.netPnl) }],
    [{ text: 'مجموع R', bold: true, fill: LABEL_FILL }, { text: `${signed(review.overall.totalR)}R` }],
    [{ text: 'میانگین R', bold: true, fill: LABEL_FILL }, { text: average(review.overall.averageR) }],
  ];
  if (review.previous && review.previous.settled > 0) summary.push([{ text: 'دورهٔ قبل', bold: true, fill: LABEL_FILL }, { text: `${review.previous.label}: ${signed(review.previous.netPnl)} · نرخ برد ${percent(review.previous.winRate)}` }]);
  body.push(table(summary, [3000, CONTENT_WIDTH - 3000], { fontSize: 20 }));

  body.push(paragraph('مشاهدات', { style: 'Heading2' }));
  if (review.observations.length === 0) body.push(paragraph('مشاهده‌ای برای این دوره وجود ندارد.'));
  for (const line of review.observations) body.push(paragraph(`• ${line}`));

  body.push(paragraph('پرسش‌هایی برای بازبینی', { style: 'Heading2' }));
  if (review.questions.length === 0) body.push(paragraph('نمونهٔ این دوره برای مطرح‌کردن پرسش کافی نیست یا الگوی نگران‌کننده‌ای دیده نشد.'));
  for (const line of review.questions) body.push(paragraph(`• ${line}`));
  body.push(paragraph('این پرسش‌ها فقط از روی داده‌های ثبت‌شده ساخته شده‌اند و توصیهٔ معاملاتی نیستند.', { size: 18, color: '6B7280' }));

  body.push(paragraph('بهترین و ضعیف‌ترین‌ها', { style: 'Heading2' }));
  const header: TableCell[] = [{ text: ' ' }, { text: 'مورد' }, { text: 'معاملات' }, { text: 'نرخ برد' }, { text: 'سود/زیان' }];
  body.push(table([
    header,
    rowCells(review.bestSessionType, 'بهترین سشن'), rowCells(review.worstSessionType, 'ضعیف‌ترین سشن'),
    rowCells(review.bestWeekday, 'بهترین روز'), rowCells(review.worstWeekday, 'ضعیف‌ترین روز'),
    rowCells(review.bestSymbol, 'بهترین نماد'), rowCells(review.worstSymbol, 'ضعیف‌ترین نماد'),
  ], [2000, 3000, 1500, 1500, CONTENT_WIDTH - 8000], { headerRows: 1, fontSize: 19 }));

  if (review.topMistakes.length) {
    body.push(paragraph('پرتکرارترین اشتباه‌ها', { style: 'Heading2' }));
    body.push(table([
      [{ text: 'اشتباه' }, { text: 'تعداد معامله' }, { text: 'سود/زیان' }],
      ...review.topMistakes.map(row => [{ text: row.label }, { text: String(row.trades) }, { text: signed(row.netPnl) }]),
    ], [CONTENT_WIDTH - 4200, 2000, 2200], { headerRows: 1, fontSize: 19 }));
  }

  body.push(paragraph('رعایت پلن و دقت سناریوها', { style: 'Heading2' }));
  const plan = review.planAdherence;
  body.push(table([
    [{ text: 'مورد' }, { text: 'معاملات بسته' }, { text: 'نرخ برد' }, { text: 'سود/زیان' }],
    [{ text: 'طبق پلن', bold: true, fill: LABEL_FILL }, { text: String(plan.onPlan.settled) }, { text: percent(plan.onPlan.winRate) }, { text: signed(plan.onPlan.netPnl) }],
    [{ text: 'خارج یا نیمه‌طبق پلن', bold: true, fill: LABEL_FILL }, { text: String(plan.offPlan.settled) }, { text: percent(plan.offPlan.winRate) }, { text: signed(plan.offPlan.netPnl) }],
    [{ text: 'بدون ثبت رعایت پلن', bold: true, fill: LABEL_FILL }, { text: String(plan.unrated.settled) }, { text: percent(plan.unrated.winRate) }, { text: signed(plan.unrated.netPnl) }],
  ], [CONTENT_WIDTH - 5400, 1800, 1800, 1800], { headerRows: 1, fontSize: 19 }));
  const scenario = review.scenario;
  body.push(paragraph(`سناریوها: ${scenario.recorded} نتیجهٔ ثبت‌شده — مطابق ${scenario.hit}، تا حدی ${scenario.partial}، باطل ${scenario.invalidated}، فعال‌نشده ${scenario.notTriggered}؛ دقت ${percent(scenario.accuracy)}.`, { before: 120 }));
  if (review.excursion.count > 0) {
    body.push(paragraph(`MFE/MAE: ${review.excursion.count} معامله دارای داده؛ میانگین MFE برندگان ${average(review.excursion.averageMfeWinners)}، میانگین MAE برندگان ${average(review.excursion.averageMaeWinners)}.`));
  }
  return buildDocxParts(body.join(''), []);
}
