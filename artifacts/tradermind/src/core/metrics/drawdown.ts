/**
 * drawdown.ts — تنها پیاده‌سازی مرجع Max Drawdown
 *
 * قانون: هیچ سرویس/صفحه‌ای نباید Max Drawdown را دوباره پیاده کند؛ فقط از این فایل استفاده کنید.
 *
 * تعریف:
 *   equity(t) = سرمایه‌ی اولیه‌ی حساب + مجموع سود/زیان «خالص» معاملات بسته‌شده تا لحظه‌ی t
 *   peak(t)   = بیشینه‌ی equity تا لحظه‌ی t (شامل سرمایه‌ی اولیه)
 *   DD مطلق   = peak(t) − equity(t)
 *   DD درصدی  = (peak(t) − equity(t)) / peak(t) × ۱۰۰   ← peak «همان لحظه»، نه peak نهایی
 *
 * اگر سرمایه‌ی اولیه معلوم نباشد، درصد معنی ندارد (مبنا «سود تجمعی» می‌شود و عددهای بزرگ و
 * گمراه‌کننده می‌دهد، مثلاً ۳۰$ ضرر پس از ۶۵$ سود = ۴۶٪)، بنابراین `percentage = null`
 * برمی‌گردد و فقط مقدار مطلق گزارش می‌شود.
 */
import type { Account, Trade } from '../../db/database';
import { getNetPnl, isClosed } from '../../lib/tradeHelpers';

export interface DrawdownResult {
  /** بزرگ‌ترین افت از قله تا کف، به واحد پول حساب */
  absolute: number;
  /** بزرگ‌ترین افت درصدی (۰..۱۰۰) نسبت به قله‌ی همان لحظه؛ null اگر سرمایه‌ی اولیه نامعلوم باشد */
  percentage: number | null;
  /** افت فعلی (از آخرین قله تا سرمایه‌ی فعلی) */
  currentAbsolute: number;
  currentPercentage: number | null;
  /** سرمایه‌ی اولیه‌ی استفاده‌شده (null = نامعلوم) */
  startBalance: number | null;
  tradeCount: number;
}

export interface DrawdownPoint {
  tradeId: string;
  timestamp: number;
  equity: number;
  peak: number;
  absolute: number;
  percentage: number | null;
}

export interface DrawdownSeries extends DrawdownResult {
  curve: DrawdownPoint[];
  maxAbsoluteStartAt: number | null;
  maxAbsoluteAt: number | null;
  maxAbsoluteRecoveryAt: number | null;
  maxPercentageStartAt: number | null;
  maxPercentageAt: number | null;
  maxPercentageRecoveryAt: number | null;
}

const closedTs = (t: Trade) => t.closedAt ?? t.openedAt;

export function normalizeStartBalance(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** معاملات بسته‌شده‌ی دارای P/L، به ترتیب زمان بسته‌شدن (سود/زیان در لحظه‌ی بسته‌شدن محقق می‌شود). */
export function sortForEquity(trades: Trade[]): Trade[] {
  return trades
    .filter(t => {
      const pnl = getNetPnl(t);
      return isClosed(t) && pnl !== null && Number.isFinite(pnl);
    })
    .sort((a, b) => closedTs(a) - closedTs(b) || a.openedAt - b.openedAt || a.id.localeCompare(b.id));
}

export function computeDrawdownSeries(
  trades: Trade[],
  opts: { startBalance?: number | null; selectedTradeIds?: ReadonlySet<string> } = {},
): DrawdownSeries {
  const base = normalizeStartBalance(opts.startBalance);
  const sorted = sortForEquity(trades);

  let equity = base ?? 0;
  let peak = equity;
  let maxAbs = 0;
  let maxPct = 0;
  let maxAbsStartAt: number | null = null;
  let maxAbsAt: number | null = null;
  let maxAbsRecoveryAt: number | null = null;
  let maxPctStartAt: number | null = null;
  let maxPctAt: number | null = null;
  let maxPctRecoveryAt: number | null = null;
  let maxAbsPeak = 0;
  let maxPctPeak = 0;
  let drawdownStartAt: number | null = null;
  let currentAbs = 0;
  let currentPct: number | null = base === null ? null : 0;
  const curve: DrawdownPoint[] = [];

  for (const t of sorted) {
    const timestamp = closedTs(t);
    equity += getNetPnl(t) as number;
    const isUnderwater = equity < peak;
    if (isUnderwater && drawdownStartAt === null) drawdownStartAt = timestamp;
    const absolute = Math.max(0, peak - equity);
    const percentage = base !== null && peak > 0 ? (absolute / peak) * 100 : null;
    const selected = !opts.selectedTradeIds || opts.selectedTradeIds.has(t.id);

    if (selected) {
      currentAbs = absolute;
      currentPct = percentage;

      if (absolute > maxAbs) {
        maxAbs = absolute;
        maxAbsStartAt = drawdownStartAt ?? timestamp;
        maxAbsAt = timestamp;
        maxAbsRecoveryAt = null;
        maxAbsPeak = peak;
      }
      if (percentage !== null && percentage > maxPct) {
        maxPct = percentage;
        maxPctStartAt = drawdownStartAt ?? timestamp;
        maxPctAt = timestamp;
        maxPctRecoveryAt = null;
        maxPctPeak = peak;
      }
    }

    if (!isUnderwater) {
      if (maxAbsAt !== null && maxAbsRecoveryAt === null && equity >= maxAbsPeak) {
        maxAbsRecoveryAt = timestamp;
      }
      if (maxPctAt !== null && maxPctRecoveryAt === null && equity >= maxPctPeak) {
        maxPctRecoveryAt = timestamp;
      }
      if (equity > peak) peak = equity;
      drawdownStartAt = null;
    }

    curve.push({ tradeId: t.id, timestamp, equity, peak, absolute, percentage });
  }

  return {
    absolute: maxAbs,
    percentage: base !== null ? maxPct : null,
    currentAbsolute: currentAbs,
    currentPercentage: currentPct,
    startBalance: base,
    tradeCount: sorted.length,
    curve,
    maxAbsoluteStartAt: maxAbsStartAt,
    maxAbsoluteAt: maxAbsAt,
    maxAbsoluteRecoveryAt: maxAbsRecoveryAt,
    maxPercentageStartAt: maxPctStartAt,
    maxPercentageAt: maxPctAt,
    maxPercentageRecoveryAt: maxPctRecoveryAt,
  };
}

export function computeDrawdown(
  trades: Trade[],
  opts: { startBalance?: number | null } = {},
): DrawdownResult {
  const { absolute, percentage, currentAbsolute, currentPercentage, startBalance, tradeCount } =
    computeDrawdownSeries(trades, opts);
  return { absolute, percentage, currentAbsolute, currentPercentage, startBalance, tradeCount };
}

// ── دوره‌های افت (Drawdown episodes) ─────────────────────────────────────────
/** یک دوره‌ی افت: از اولین معامله‌ی زیر قله تا بازگشت به قله (یا تا امروز اگر هنوز بازنگشته). */
export interface DrawdownEpisode {
  startAt: number;
  troughAt: number;
  /** null = هنوز به قله‌ی قبلی برنگشته */
  recoveryAt: number | null;
  peak: number;
  trough: number;
  depthAbs: number;
  /** نسبت به قله‌ی همان دوره؛ null اگر سرمایه‌ی اولیه نامعلوم باشد */
  depthPct: number | null;
  tradeCount: number;
}

export interface DrawdownEpisodeSummary {
  episodeCount: number;
  /** کم‌عمق‌ترین دوره‌ی افت («حداقل افت») */
  minAbsolute: number | null;
  minPercentage: number | null;
  /** عمیق‌ترین دوره‌ی افت (همان Max Drawdown) */
  maxAbsolute: number | null;
  maxPercentage: number | null;
  avgAbsolute: number | null;
  /** پایین‌ترین سطح موجودی (سرمایه‌ی اولیه + سود خالص تجمعی)؛ بدون سرمایه‌ی اولیه = پایین‌ترین سود تجمعی */
  lowestEquity: number | null;
}

export function computeDrawdownEpisodes(
  trades: Trade[],
  opts: { startBalance?: number | null } = {},
): { episodes: DrawdownEpisode[]; lowestEquity: number | null } {
  const base = normalizeStartBalance(opts.startBalance);
  const sorted = sortForEquity(trades);
  const episodes: DrawdownEpisode[] = [];
  if (!sorted.length) return { episodes, lowestEquity: null };

  let equity = base ?? 0;
  let peak = equity;
  let lowest = equity;
  let open: { startAt: number; troughAt: number; peak: number; trough: number; tradeCount: number } | null = null;

  const close = (recoveryAt: number | null) => {
    if (!open) return;
    const depthAbs = open.peak - open.trough;
    episodes.push({
      ...open,
      recoveryAt,
      depthAbs,
      depthPct: base !== null && open.peak > 0 ? (depthAbs / open.peak) * 100 : null,
    });
    open = null;
  };

  for (const t of sorted) {
    const ts = closedTs(t);
    equity += getNetPnl(t) as number;
    if (equity < lowest) lowest = equity;

    if (equity < peak) {
      if (!open) open = { startAt: ts, troughAt: ts, peak, trough: equity, tradeCount: 0 };
      open.tradeCount++;
      if (equity < open.trough) { open.trough = equity; open.troughAt = ts; }
    } else {
      close(ts);
      peak = equity;
    }
  }
  close(null);
  return { episodes, lowestEquity: lowest };
}

export function summarizeDrawdownEpisodes(
  trades: Trade[],
  opts: { startBalance?: number | null } = {},
): DrawdownEpisodeSummary {
  const { episodes, lowestEquity } = computeDrawdownEpisodes(trades, opts);
  if (!episodes.length) {
    return {
      episodeCount: 0, minAbsolute: null, minPercentage: null, maxAbsolute: null, maxPercentage: null,
      avgAbsolute: null, lowestEquity,
    };
  }
  const abs = episodes.map(e => e.depthAbs);
  const pct = episodes.map(e => e.depthPct).filter((v): v is number => v !== null);
  return {
    episodeCount: episodes.length,
    minAbsolute: abs.reduce((a, b) => Math.min(a, b), Infinity),
    minPercentage: pct.length ? pct.reduce((a, b) => Math.min(a, b), Infinity) : null,
    maxAbsolute: abs.reduce((a, b) => Math.max(a, b), -Infinity),
    maxPercentage: pct.length ? pct.reduce((a, b) => Math.max(a, b), -Infinity) : null,
    avgAbsolute: abs.reduce((a, b) => a + b, 0) / abs.length,
    lowestEquity,
  };
}

/**
 * سرمایه‌ی شروع یک بازه = مجموع سرمایه‌ی اولیه‌ی حساب‌های مربوط
 *                        + P/L خالص همه‌ی معاملات بسته‌شده «پیش از اولین معامله‌ی بازه».
 *
 * اگر برای حداقل یکی از حساب‌های درگیر سرمایه‌ی اولیه ثبت نشده باشد، null برمی‌گرداند
 * (جمع ناقص، درصد را بزرگ‌نمایی می‌کند).
 */
export function resolveStartEquity(
  accounts: Account[],
  allTrades: Trade[],
  periodTrades: Trade[] = allTrades,
): number | null {
  const usedIds = new Set(allTrades.map(t => t.accountId).filter((id): id is string => !!id));
  if (!usedIds.size || allTrades.some(t => !t.accountId && getNetPnl(t) !== null)) return null;

  const relevant = [...usedIds].map(id => accounts.find(account => account.id === id));
  if (relevant.some((account): account is undefined => !account)) return null;
  const knownAccounts = relevant as Account[];
  if (new Set(knownAccounts.map(account => account.currency)).size > 1) return null;

  let base = 0;
  for (const a of knownAccounts) {
    const b = normalizeStartBalance(a.initialBalance);
    if (b === null) return null;
    base += b;
  }

  const firstTs = sortForEquity(periodTrades).map(closedTs)[0];
  if (firstTs === undefined) return base;

  const before = sortForEquity(allTrades)
    .filter(t => closedTs(t) < firstTs)
    .reduce((s, t) => s + (getNetPnl(t) as number), 0);
  return base + before;
}
