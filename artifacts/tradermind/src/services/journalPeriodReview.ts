import type { JournalOption, JournalSession, JournalSessionAnalysis, JournalTradeData, JournalTriggerEvent, Trade } from '../db/database';
import { localDayKey } from '../lib/sessionDateTime';
import { getR } from '../core/metrics/engine';
import {
  aggregate, buildBreakdowns, buildPlanAdherence, buildScenarioAccuracy,
  type BreakdownRow, type PlanAdherenceSummary, type ScenarioAccuracyRow,
} from './journalBreakdownService';

export type ReviewPeriodKind = 'week' | 'month';

export interface ReviewRange {
  kind: ReviewPeriodKind;
  from: number;
  to: number;
  /** مثل «هفتهٔ ۱۹ مهر تا ۲۵ مهر ۱۴۰۵» یا «مهر ۱۴۰۵». */
  label: string;
  /** همان بازه به میلادی. */
  gregorianLabel: string;
}

/** حداقل معاملهٔ بسته‌شده برای اینکه یک ردیف در نتیجه‌گیری «بهترین/ضعیف‌ترین» شرکت کند. */
export const MIN_REVIEW_SAMPLE = 3;
/** حداقل نمونه برای اینکه یک ردیف منفی به‌عنوان «سؤال برای بازبینی» مطرح شود. */
export const MIN_QUESTION_SAMPLE = 5;

const DAY_MS = 86_400_000;
const jalaliParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
const jalaliDay = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long' });
const jalaliMonthName = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long' });
const jalaliYear = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' });
const jalaliFull = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' });
const gregorianDay = new Intl.DateTimeFormat('en-GB-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function jalaliOf(date: Date): { year: number; month: number; day: number } {
  const parts = jalaliParts.formatToParts(date);
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** ابتدای ماه شمسیِ شامل این روز. */
function startOfJalaliMonth(date: Date): Date {
  return addLocalDays(date, -(jalaliOf(date).day - 1));
}

/** ابتدای ماه شمسی بعدی. */
function nextJalaliMonthStart(monthStart: Date): Date {
  const { month } = jalaliOf(monthStart);
  let cursor = addLocalDays(monthStart, 27);
  while (jalaliOf(cursor).month === month) cursor = addLocalDays(cursor, 1);
  return cursor;
}

/**
 * بازهٔ مرور: هفته از شنبه تا جمعه و ماه بر پایهٔ ماه شمسی.
 * offset = ۰ دورهٔ جاری، -۱ دورهٔ قبل و همین‌طور.
 */
export function resolveReviewRange(kind: ReviewPeriodKind, anchor: number, offset = 0): ReviewRange {
  let start: Date;
  let endExclusive: Date;
  if (kind === 'week') {
    const today = startOfLocalDay(anchor);
    const sinceSaturday = (today.getDay() + 1) % 7;
    start = addLocalDays(today, -sinceSaturday + offset * 7);
    endExclusive = addLocalDays(start, 7);
  } else {
    start = startOfJalaliMonth(startOfLocalDay(anchor));
    for (let step = 0; step < Math.abs(offset); step += 1) {
      start = offset < 0 ? startOfJalaliMonth(addLocalDays(start, -1)) : nextJalaliMonthStart(start);
    }
    endExclusive = nextJalaliMonthStart(start);
  }
  const last = addLocalDays(endExclusive, -1);
  const label = kind === 'week'
    ? `هفتهٔ ${jalaliDay.format(start)} تا ${jalaliFull.format(last)}`
    : `${jalaliMonthName.format(start)} ${jalaliYear.format(start)}`;
  return {
    kind, from: start.getTime(), to: endExclusive.getTime() - 1, label,
    gregorianLabel: `${gregorianDay.format(start)} – ${gregorianDay.format(last)}`,
  };
}

export interface ReviewInput {
  sessions: JournalSession[];
  trades: Trade[];
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  options: JournalOption[];
  tradeData: JournalTradeData[];
}

export interface ReviewScenarioSummary {
  recorded: number;
  hit: number;
  partial: number;
  invalidated: number;
  notTriggered: number;
  accuracy: number | null;
  lowest: ScenarioAccuracyRow | null;
}

export interface ReviewExcursionSummary {
  /** تعداد معاملاتی که MFE یا MAE دارند. */
  count: number;
  averageMfeWinners: number | null;
  averageMaeWinners: number | null;
  /** برندگانی که بیش از ۰٫۵R از اوج سود برگشتند. */
  givenBackWinners: number;
  /** بازندگانی که زمانی دست‌کم ۱R در سود بودند. */
  losersOnceAboveOneR: number;
}

export interface PeriodReview {
  range: ReviewRange;
  sessionCount: number;
  tradingDays: number;
  overall: BreakdownRow;
  previous: BreakdownRow | null;
  bestSessionType: BreakdownRow | null;
  worstSessionType: BreakdownRow | null;
  bestWeekday: BreakdownRow | null;
  worstWeekday: BreakdownRow | null;
  bestSymbol: BreakdownRow | null;
  worstSymbol: BreakdownRow | null;
  topMistakes: BreakdownRow[];
  planAdherence: PlanAdherenceSummary;
  scenario: ReviewScenarioSummary;
  excursion: ReviewExcursionSummary;
  /** واقعیت‌هایی که از داده‌های دوره درمی‌آیند. */
  observations: string[];
  /** پرسش‌هایی برای بازبینی؛ توصیه نیستند و فقط وقتی نمونه کافی باشد مطرح می‌شوند. */
  questions: string[];
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
const percent = (value: number | null) => (value == null ? '—' : `${Math.round(value)}٪`);
const count = (value: number) => value.toLocaleString('fa-IR');

function scope(input: ReviewInput, range: ReviewRange) {
  const sessions = input.sessions.filter(session => session.startTime >= range.from && session.startTime <= range.to);
  const sessionIds = new Set(sessions.map(session => session.id));
  const trades = input.trades.filter(trade => trade.journalSessionId && sessionIds.has(trade.journalSessionId));
  return { sessions, sessionIds, trades };
}

function pickExtremes(
  rows: BreakdownRow[],
  metric: 'netPnl' | 'averageR' = 'netPnl',
): { best: BreakdownRow | null; worst: BreakdownRow | null } {
  const value = (row: BreakdownRow) => metric === 'averageR' ? row.averageR : row.netPnl;
  const eligible = rows.filter(row =>
    row.settled >= MIN_REVIEW_SAMPLE
    && !row.key.startsWith('__')
    && value(row) !== null
    && Number.isFinite(value(row)),
  );
  // «بهترین» و «ضعیف‌ترین» فقط وقتی معنا دارند که دست‌کم دو گروه با نمونهٔ کافی قابل مقایسه باشند.
  if (eligible.length < 2) return { best: null, worst: null };
  const sorted = [...eligible].sort((a, b) => value(b)! - value(a)!);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return {
    best: value(best)! > 0 ? best : null,
    worst: value(worst)! < 0 ? worst : null,
  };
}

function summarizeExcursion(trades: Trade[]): ReviewExcursionSummary {
  const values = trades.map(trade => {
    let mfe: number | null = null;
    let mae: number | null = null;
    if (trade.liveMonitoring) {
      try {
        const parsed = JSON.parse(trade.liveMonitoring) as Record<string, unknown>;
        if (typeof parsed.maxFavorableExcursion === 'number') mfe = parsed.maxFavorableExcursion;
        if (typeof parsed.maxAdverseExcursion === 'number') mae = parsed.maxAdverseExcursion;
      } catch { /* داده‌ٔ ناخوانا نادیده گرفته می‌شود */ }
    }
    return { trade, mfe, mae };
  }).filter(item => item.mfe != null || item.mae != null);
  const winners = values.filter(item => item.trade.status === 'closed' && (item.trade.result === 'win' || item.trade.result === 'partial-win'));
  const losers = values.filter(item => item.trade.status === 'closed' && (item.trade.result === 'loss' || item.trade.result === 'partial-loss'));
  const mean = (items: Array<number | null>) => {
    const numbers = items.filter((item): item is number => item != null);
    return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : null;
  };
  return {
    count: values.length,
    averageMfeWinners: mean(winners.map(item => item.mfe)),
    averageMaeWinners: mean(winners.map(item => item.mae)),
    givenBackWinners: winners.filter(item => {
      const tradeR = getR(item.trade);
      return item.mfe != null && tradeR !== null && item.mfe - tradeR > 0.5;
    }).length,
    losersOnceAboveOneR: losers.filter(item => (item.mfe ?? 0) >= 1).length,
  };
}

/** مرور خودکار یک دورهٔ هفتگی/ماهانه؛ previousRange برای مقایسه با دورهٔ قبل است. */
export function buildPeriodReview(input: ReviewInput, range: ReviewRange, previousRange?: ReviewRange): PeriodReview {
  const current = scope(input, range);
  const tradeData = input.tradeData.filter(item => current.trades.some(trade => trade.id === item.tradeId));
  const breakdowns = buildBreakdowns({
    trades: current.trades, sessions: current.sessions, analyses: input.analyses, triggers: input.triggers, options: input.options, tradeData,
  });
  const overall = aggregate('overall', range.label, current.trades);
  const previous = previousRange ? aggregate('previous', previousRange.label, scope(input, previousRange).trades) : null;
  const sessionExtremes = pickExtremes(breakdowns.sessionType);
  const weekdayExtremes = pickExtremes(breakdowns.weekday, 'averageR');
  const symbolExtremes = pickExtremes(breakdowns.symbol);
  const topMistakes = breakdowns.mistake.filter(row => !row.key.startsWith('__')).slice(0, 3);
  const planAdherence = buildPlanAdherence(current.trades, tradeData);

  const accuracyRows = buildScenarioAccuracy({ analyses: input.analyses, options: input.options, sessionIds: current.sessionIds });
  const scenarioTotals = accuracyRows.reduce((sum, row) => ({
    hit: sum.hit + row.hit, partial: sum.partial + row.partial, invalidated: sum.invalidated + row.invalidated, notTriggered: sum.notTriggered + row.notTriggered,
  }), { hit: 0, partial: 0, invalidated: 0, notTriggered: 0 });
  const recorded = scenarioTotals.hit + scenarioTotals.partial + scenarioTotals.invalidated + scenarioTotals.notTriggered;
  const scenario: ReviewScenarioSummary = {
    recorded, ...scenarioTotals,
    accuracy: recorded ? ((scenarioTotals.hit + scenarioTotals.partial * 0.5) / recorded) * 100 : null,
    lowest: accuracyRows.filter(row => row.recorded >= MIN_REVIEW_SAMPLE && row.accuracy != null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0] ?? null,
  };
  const excursion = summarizeExcursion(current.trades);

  const observations: string[] = [];
  const questions: string[] = [];
  if (overall.settled === 0) {
    observations.push('در این دوره معاملهٔ بسته‌شده‌ای وجود ندارد.');
  } else {
    observations.push(`${count(overall.settled)} معاملهٔ بسته‌شده با نرخ برد ${percent(overall.winRate)} و مجموع سود/زیان ${signed(overall.netPnl)}.`);
    if (overall.settled < MIN_QUESTION_SAMPLE) observations.push('نمونهٔ این دوره کم است؛ نتیجه‌گیری از آن زود است.');
  }
  if (previous && previous.settled > 0 && overall.settled > 0) {
    const delta = overall.netPnl - previous.netPnl;
    observations.push(`نسبت به ${previousRange?.label}: مجموع سود/زیان ${delta >= 0 ? 'بیشتر' : 'کمتر'} به اندازهٔ ${signed(Math.abs(delta))} و نرخ برد از ${percent(previous.winRate)} به ${percent(overall.winRate)}.`);
  }
  if (sessionExtremes.best) observations.push(`بهترین نوع سشن: ${sessionExtremes.best.label} (${count(sessionExtremes.best.settled)} معامله، ${signed(sessionExtremes.best.netPnl)}).`);
  if (sessionExtremes.worst) observations.push(`ضعیف‌ترین نوع سشن: ${sessionExtremes.worst.label} (${count(sessionExtremes.worst.settled)} معامله، ${signed(sessionExtremes.worst.netPnl)}).`);
  if (weekdayExtremes.best) observations.push(`بهترین روز هفته بر پایه میانگین R: ${weekdayExtremes.best.label} (${weekdayExtremes.best.averageR!.toFixed(2)}R).`);
  if (weekdayExtremes.worst) observations.push(`ضعیف‌ترین روز هفته بر پایه میانگین R: ${weekdayExtremes.worst.label} (${weekdayExtremes.worst.averageR!.toFixed(2)}R).`);
  if (planAdherence.offPlan.settled > 0) {
    observations.push(`${count(planAdherence.offPlan.settled)} معاملهٔ خارج یا نیمه‌طبق پلن با مجموع ${signed(planAdherence.offPlan.netPnl)}، در برابر ${count(planAdherence.onPlan.settled)} معاملهٔ طبق پلن با مجموع ${signed(planAdherence.onPlan.netPnl)}.`);
  }
  if (planAdherence.offPlanWins > 0) observations.push(`${count(planAdherence.offPlanWins)} سود از معاملات خارج از پلن بوده است؛ این سودها نتیجهٔ رعایت پلن نیستند.`);
  if (topMistakes[0]) observations.push(`پرتکرارترین اشتباه: ${topMistakes[0].label} در ${count(topMistakes[0].trades)} معامله (مجموع ${signed(topMistakes[0].netPnl)}).`);
  if (scenario.recorded > 0) observations.push(`دقت سناریوها: ${percent(scenario.accuracy)} از ${count(scenario.recorded)} نتیجهٔ ثبت‌شده.`);
  if (excursion.givenBackWinners > 0) observations.push(`در ${count(excursion.givenBackWinners)} معاملهٔ برنده، بیش از ۰٫۵R از اوج سود برگشته است.`);
  if (excursion.losersOnceAboveOneR > 0) observations.push(`${count(excursion.losersOnceAboveOneR)} معاملهٔ بازنده زمانی دست‌کم ۱R در سود بوده است.`);

  if (sessionExtremes.worst && sessionExtremes.worst.settled >= MIN_QUESTION_SAMPLE && sessionExtremes.worst.netPnl < 0) {
    questions.push(`سشن «${sessionExtremes.worst.label}» با ${count(sessionExtremes.worst.settled)} معامله مجموع منفی داشت؛ آیا شرایط معامله در آن سشن باید سخت‌گیرانه‌تر شود؟`);
  }
  const topMistake = topMistakes[0];
  if (topMistake && topMistake.trades >= MIN_REVIEW_SAMPLE && topMistake.netPnl < 0) {
    questions.push(`اشتباه «${topMistake.label}» ${count(topMistake.trades)} بار تکرار شد و مجموعاً ضرر داشت؛ چه قاعدهٔ مشخصی جلوی تکرارش را می‌گیرد؟`);
  }
  if (excursion.givenBackWinners >= 2) questions.push('چند معاملهٔ برنده بخش بزرگی از اوج سود را پس دادند؛ آیا برای خروج یا جابه‌جایی حد ضرر قاعدهٔ مشخصی لازم است؟');
  if (excursion.count >= MIN_REVIEW_SAMPLE && excursion.averageMaeWinners != null && excursion.averageMaeWinners <= -0.7) {
    questions.push(`میانگین بیشترین حرکت علیه در معاملات برنده ${signed(excursion.averageMaeWinners)}R است؛ آیا نقطهٔ ورود یا حد ضرر قابل بهبود است؟`);
  }
  if (scenario.lowest && (scenario.lowest.accuracy ?? 100) < 50) {
    questions.push(`دقت سناریوهای تایم‌فریم «${scenario.lowest.label}» ${percent(scenario.lowest.accuracy)} است؛ آیا تحلیل آن تایم‌فریم باید وزن کمتری در تصمیم‌گیری داشته باشد؟`);
  }
  if (planAdherence.offPlanWins > 0 && planAdherence.offPlan.netPnl > planAdherence.onPlan.netPnl && planAdherence.onPlan.settled > 0) {
    questions.push('این دوره معاملات خارج از پلن نتیجهٔ بهتری داشتند؛ آیا پلن نیاز به بازبینی دارد یا این فقط شانس بود؟');
  }

  return {
    range,
    sessionCount: current.sessions.length,
    tradingDays: new Set(current.sessions.map(session => localDayKey(session.startTime))).size,
    overall, previous,
    bestSessionType: sessionExtremes.best, worstSessionType: sessionExtremes.worst,
    bestWeekday: weekdayExtremes.best, worstWeekday: weekdayExtremes.worst,
    bestSymbol: symbolExtremes.best, worstSymbol: symbolExtremes.worst,
    topMistakes, planAdherence, scenario, excursion, observations, questions,
  };
}
