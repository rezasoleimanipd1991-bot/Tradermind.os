/**
 * engine.ts — موتور محاسباتی واحد برنامه
 *
 * قانون: هر عددی که از معاملات محاسبه می‌شود (نرخ برد، Profit Factor، Expectancy، میانگین R،
 * Drawdown، رشته‌ها، ...) فقط از اینجا می‌آید. هیچ سرویس/صفحه‌ای نباید فرمول را دوباره بنویسد؛
 * فقط `computeMetrics()` یا `computeMetricsBy()` را صدا بزند و خروجی را نمایش دهد.
 *
 * تعریف‌های ثابت (برای همه‌ی صفحه‌ها یکسان):
 *  - معامله‌ی «بسته‌شده»: status === 'closed' و دارای P/L یا برچسب نتیجه.
 *  - مبنای پولی: سود/زیان «خالص» = profitLoss − fees − commission − spread (getNetPnl).
 *  - برد/باخت/سربه‌سر: از علامت سود «خالص» تعیین می‌شود. فقط اگر P/L نباشد، برچسب result
 *    (win/partial-win/loss/partial-loss/breakeven) استفاده می‌شود. (پیش‌تر برچسب result از P/L «ناخالص»
 *    ساخته می‌شد و با مجموع خالص جور درنمی‌آمد.)
 *  - نرخ‌ها (winRate, lossRate) همیشه کسر ۰..۱ هستند؛ برای نمایش با `toPercent()` به ۰..۱۰۰ ببرید.
 *  - Expectancy = میانگین نتیجه‌ی هر معامله (پولی: netPnl/n ، R: میانگین R).
 *  - انحراف معیار: نمونه‌ای (n−1).
 *  - Drawdown: drawdown.ts (موجودی اولیه + سود خالص، قله‌ی همان لحظه).
 */
import type { Trade } from '../../db/database';
import { getNetPnl, isClosed, getOutcome, type Outcome } from '../../lib/tradeHelpers';
import { computeDrawdown, summarizeDrawdownEpisodes, type DrawdownEpisodeSummary, type DrawdownResult } from './drawdown';
import { mean, median, stdDev } from './mathStats';

/** کمتر از این تعداد معامله، نتایج آماری قابل‌اتکا نیست. */
export const MIN_RELIABLE_SAMPLE = 20;
const EPS = 1e-9;

export type { Outcome };
export { getOutcome };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ── ریاضیات پایه: mathStats.ts (تنها نسخه‌ی مجاز) ────────────────────────────
export { mean, median, stdDev };
export const toPercent = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : v * 100;

// ── طبقه‌بندی یک معامله: tradeHelpers.getOutcome (تنها تعریف) ───────────────
export const getR = (t: Trade): number | null => {
  if (isNum(t.rMultiple)) return t.rMultiple;
  const netPnl = getNetPnl(t);
  return isNum(netPnl) && isNum(t.riskAmount) && t.riskAmount > 0
    ? netPnl / t.riskAmount
    : null;
};
const closedTs = (t: Trade) => t.closedAt ?? t.openedAt;

// ── خروجی ───────────────────────────────────────────────────────────────────
export interface TradeMetrics {
  /** تعداد معاملات بسته‌شده‌ی قابل‌طبقه‌بندی */
  count: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  /** ۰..۱ */
  winRate: number | null;
  lossRate: number | null;

  // پولی (خالص)
  netPnl: number;
  grossProfit: number;
  grossLoss: number;          // مثبت
  profitFactor: number | null;
  avgWinPnl: number | null;
  avgLossPnl: number | null;  // منفی
  bestPnl: number | null;
  worstPnl: number | null;
  payoffRatio: number | null; // avgWin / |avgLoss|
  maxWinPnl: number | null;
  maxLossPnl: number | null;  // منفی
  expectancyPnl: number | null;

  // R
  rCount: number;
  totalR: number;
  avgR: number | null;
  medianR: number | null;
  stdDevR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;    // منفی
  maxWinR: number | null;
  maxLossR: number | null;
  bestR: number | null;
  worstR: number | null;
  expectancyR: number | null;
  profitFactorR: number | null;
  grossProfitR: number;
  grossLossR: number;
  sharpeR: number | null;
  sortinoR: number | null;
  kellyPct: number | null;

  // ریسک
  avgRiskPct: number | null;
  riskCV: number | null;      // انحراف معیار ÷ میانگین ریسک (کسر)

  // رشته‌ها
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number };

  /** بیشترین افت از قله‌ی R تجمعی (واحد R، بدون درصد)؛ null اگر R ثبت نشده */
  maxDrawdownR: number | null;
  drawdown: DrawdownResult;
  /** دوره‌های افت: حداقل/حداکثر/میانگین عمق، تعداد، پایین‌ترین موجودی */
  drawdownStats: DrawdownEpisodeSummary;
  sampleWarning: boolean;
}

export interface MetricsOptions {
  /** موجودی شروع بازه برای درصد Drawdown (نبودنش ⇒ درصد null) */
  startBalance?: number | null;
}

interface Row { t: Trade; o: Outcome; pnl: number | null; r: number | null }

export function computeMetrics(trades: Trade[], opts: MetricsOptions = {}): TradeMetrics {
  const rows: Row[] = [];
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const o = getOutcome(t);
    if (o === null) continue;
    const net = getNetPnl(t);
    rows.push({ t, o, pnl: net !== null && isNum(net) ? net : null, r: getR(t) });
  }

  const count = rows.length;
  const winCount = rows.filter(x => x.o === 'win').length;
  const lossCount = rows.filter(x => x.o === 'loss').length;
  const breakEvenCount = count - winCount - lossCount;

  // پولی
  const pnls = rows.filter(x => x.pnl !== null).map(x => x.pnl as number);
  const posPnl = pnls.filter(v => v > EPS);
  const negPnl = pnls.filter(v => v < -EPS);
  const grossProfit = posPnl.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(negPnl.reduce((s, v) => s + v, 0));
  const netPnl = pnls.reduce((s, v) => s + v, 0);
  const avgWinPnl = mean(posPnl);
  const avgLossPnl = mean(negPnl);

  // R
  const Rs = rows.filter(x => x.r !== null).map(x => x.r as number);
  const posR = Rs.filter(v => v > EPS);
  const negR = Rs.filter(v => v < -EPS);
  const grossProfitR = posR.reduce((s, v) => s + v, 0);
  const grossLossR = Math.abs(negR.reduce((s, v) => s + v, 0));
  const avgR = mean(Rs);
  const sdR = stdDev(Rs);
  const avgWinR = mean(posR);
  const avgLossR = mean(negR);
  const downsideDev = Rs.length ? Math.sqrt(Rs.reduce((s, v) => s + Math.min(v, 0) ** 2, 0) / Rs.length) : null;

  const winRate = rateFromCounts(winCount, count);
  const lossRate = rateFromCounts(lossCount, count);

  const rWins = posR.length;
  const rLosses = negR.length;
  const decisiveRCount = rWins + rLosses;
  const kellyPct = decisiveRCount > 0 && avgWinR !== null && avgWinR > 0 && avgLossR !== null && avgLossR < 0
    ? ((rWins / decisiveRCount) / Math.abs(avgLossR) - (rLosses / decisiveRCount) / avgWinR) * 100
    : null;

  // ریسک
  const risks = rows.map(x => x.t.riskPercentage).filter((value): value is number => isNum(value) && value > 0);
  const avgRiskPct = mean(risks);
  const sdRisk = stdDev(risks);

  // رشته‌ها (به ترتیب زمان بسته‌شدن)
  const ordered = [...rows].sort((a, b) =>
    closedTs(a.t) - closedTs(b.t) || a.t.openedAt - b.t.openedAt || a.t.id.localeCompare(b.t.id),
  );
  let maxWinStreak = 0, maxLossStreak = 0, run = 0, runType: 'win' | 'loss' | 'none' = 'none';
  for (const x of ordered) {
    if (x.o === 'win' || x.o === 'loss') {
      if (runType === x.o) run++; else { runType = x.o; run = 1; }
      if (x.o === 'win') maxWinStreak = Math.max(maxWinStreak, run);
      else maxLossStreak = Math.max(maxLossStreak, run);
    } else { runType = 'none'; run = 0; }
  }

  let cumR = 0, peakR = 0, ddR = 0;
  for (const x of ordered) {
    if (x.r === null) continue;
    cumR += x.r;
    if (cumR > peakR) peakR = cumR;
    ddR = Math.max(ddR, peakR - cumR);
  }

  return {
    count, winCount, lossCount, breakEvenCount, winRate, lossRate,
    netPnl, grossProfit, grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWinPnl, avgLossPnl,
    bestPnl: pnls.length ? pnls.reduce((best, value) => Math.max(best, value), -Infinity) : null,
    worstPnl: pnls.length ? pnls.reduce((worst, value) => Math.min(worst, value), Infinity) : null,
    payoffRatio: avgWinPnl !== null && avgLossPnl !== null && avgLossPnl < 0 ? avgWinPnl / Math.abs(avgLossPnl) : null,
    maxWinPnl: posPnl.length ? posPnl.reduce((best, value) => Math.max(best, value), -Infinity) : null,
    maxLossPnl: negPnl.length ? negPnl.reduce((worst, value) => Math.min(worst, value), Infinity) : null,
    expectancyPnl: pnls.length ? netPnl / pnls.length : null,

    rCount: Rs.length,
    totalR: Rs.reduce((s, v) => s + v, 0),
    avgR, medianR: median(Rs), stdDevR: sdR,
    avgWinR, avgLossR,
    maxWinR: posR.length ? posR.reduce((best, value) => Math.max(best, value), -Infinity) : null,
    maxLossR: negR.length ? negR.reduce((worst, value) => Math.min(worst, value), Infinity) : null,
    bestR: Rs.length ? Rs.reduce((best, value) => Math.max(best, value), -Infinity) : null,
    worstR: Rs.length ? Rs.reduce((worst, value) => Math.min(worst, value), Infinity) : null,
    expectancyR: avgR,
    profitFactorR: grossLossR > 0 ? grossProfitR / grossLossR : null,
    grossProfitR, grossLossR,
    sharpeR: avgR !== null && sdR !== null && sdR > 0 ? avgR / sdR : null,
    sortinoR: avgR !== null && downsideDev !== null && downsideDev > 0 ? avgR / downsideDev : null,
    kellyPct,

    avgRiskPct,
    riskCV: avgRiskPct && sdRisk !== null ? sdRisk / avgRiskPct : null,

    maxWinStreak, maxLossStreak,
    currentStreak: { type: runType, count: run },

    maxDrawdownR: Rs.length ? ddR : null,
    drawdown: computeDrawdown(trades, { startBalance: opts.startBalance }),
    drawdownStats: summarizeDrawdownEpisodes(trades, { startBalance: opts.startBalance }),
    sampleWarning: count < MIN_RELIABLE_SAMPLE,
  };
}

export function rateFromCounts(part: number, total: number): number | null {
  return Number.isFinite(part) && Number.isFinite(total) && total > 0 ? part / total : null;
}

/** گروه‌بندی + محاسبه‌ی معیارها برای هر گروه (ترتیب اولین ظهور حفظ می‌شود). */
export function computeMetricsBy<K extends string | number>(
  trades: Trade[],
  keyFn: (t: Trade) => K | null | undefined,
  opts: MetricsOptions = {},
): Array<{ key: K; metrics: TradeMetrics }> {
  const groups = new Map<K, Trade[]>();
  for (const t of trades) {
    const k = keyFn(t);
    if (k === null || k === undefined) continue;
    const arr = groups.get(k);
    if (arr) arr.push(t); else groups.set(k, [t]);
  }
  return [...groups.entries()].map(([key, ts]) => ({ key, metrics: computeMetrics(ts, opts) }));
}

export type RankingMetric = 'avgR' | 'netPnl' | 'winRate';
export type MetricGroup<K extends string | number> = { key: K; metrics: TradeMetrics };

/** بهترین و ضعیف‌ترین گروه را با یک معیار مشترک و ترتیب قطعی برمی‌گرداند. */
export function rankMetricGroups<K extends string | number>(
  groups: MetricGroup<K>[],
  metric: RankingMetric,
  minSample = 1,
): { best: MetricGroup<K> | null; worst: MetricGroup<K> | null } {
  const eligible = groups.filter(({ metrics }) => {
    const sampleCount = metric === 'avgR' ? metrics.rCount : metrics.count;
    const value = metrics[metric];
    return sampleCount >= minSample
      && (metric !== 'netPnl' || metrics.expectancyPnl !== null)
      && typeof value === 'number'
      && Number.isFinite(value);
  });
  eligible.sort((a, b) => {
    const difference = b.metrics[metric]! - a.metrics[metric]!;
    return difference || String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
  });
  return {
    best: eligible[0] ?? null,
    worst: eligible[eligible.length - 1] ?? null,
  };
}

/** گروه‌بندی و رتبه‌بندی بهترین/ضعیف‌ترین در یک مرحله از همان موتور. */
export function getMetricExtremesBy<K extends string | number>(
  trades: Trade[],
  keyFn: (trade: Trade) => K | null | undefined,
  metric: RankingMetric,
  minSample = 1,
  opts: MetricsOptions = {},
): { best: MetricGroup<K> | null; worst: MetricGroup<K> | null } {
  return rankMetricGroups(computeMetricsBy(trades, keyFn, opts), metric, minSample);
}

// ── میان‌برهای پرکاربرد (همه روی computeMetrics) ──────────────────────────────
/** نرخ برد ۰..۱ ؛ null اگر معامله‌ی بسته‌شده‌ای نباشد */
export const winRateOf = (trades: Trade[]): number | null => computeMetrics(trades).winRate;
/** میانگین R معاملات بسته‌شده؛ null اگر R ثبت نشده باشد */
export const avgROf = (trades: Trade[]): number | null => computeMetrics(trades).avgR;
