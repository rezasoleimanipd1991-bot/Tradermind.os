/**
 * dashboardOverview.ts — محاسبات خالص «نمای کلی» داشبورد (فاز ۳)
 *
 * مبنای P/L: سود/زیان خالص (getNetPnl) — همان مبنایی که نمودار و کارت‌های فعلی داشبورد
 * نمایش می‌دهند. هیچ عدد فرضی تولید نمی‌شود؛ وقتی داده کافی نیست مقدار null برمی‌گردد
 * و UI «—» نشان می‌دهد.
 */
import type { Trade } from '../db/database';
import { getNetPnl, isClosed } from '../lib/tradeHelpers';
import { getTradingDateKey } from '../lib/tradingTime';
import { computeMetrics, toPercent } from '../core/metrics/engine';

export interface EquityPoint {
  /** کلید روز معاملاتی YYYY-MM-DD */
  date: string;
  /** سرمایه‌ی تجمعی تا پایان آن معامله (P/L خالص) */
  equity: number;
  pnl: number;
  symbol: string;
}

export interface Distribution { wins: number; losses: number; breakeven: number; total: number }

export interface Ranked { key: string; label: string; pnl: number; count: number }

export interface OverviewKpis {
  totalTrades: number;
  closedTrades: number;
  /** 0..100 */
  winRate: number | null;
  profitFactor: number | null;
  /** درصد افت از اوج «سرمایه‌ی حساب» (۰ یا مثبت)؛ null اگر سرمایه‌ی اولیه‌ی حساب ثبت نشده باشد */
  maxDrawdownPct: number | null;
  maxDrawdownAbs: number;
  /** میانگین R هر معامله (بر پایه‌ی rMultiple ثبت‌شده) */
  expectancyR: number | null;
  totalPnl: number;
}

export interface Overview {
  kpis: OverviewKpis;
  equity: EquityPoint[];
  pnlSeries: EquityPoint[];
  distribution: Distribution;
  bestStrategy: Ranked | null;
  bestSymbol: Ranked | null;
  worstSymbol: Ranked | null;
}

const closedTs = (t: Trade) => t.closedAt ?? t.openedAt;

function rank(trades: Trade[], keyOf: (t: Trade) => string | null, labelOf: (k: string) => string): Ranked[] {
  const m = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    const k = keyOf(t);
    const p = getNetPnl(t);
    if (!k || p === null) continue;
    const cur = m.get(k) ?? { pnl: 0, count: 0 };
    cur.pnl += p;
    cur.count += 1;
    m.set(k, cur);
  }
  return [...m.entries()].map(([key, v]) => ({ key, label: labelOf(key), pnl: v.pnl, count: v.count }));
}

export interface OverviewOptions {
  /** سرمایه‌ی شروع بازه (سرمایه‌ی اولیه‌ی حساب + P/L پیش از بازه)؛ بدون آن درصد Drawdown محاسبه نمی‌شود. */
  startBalance?: number | null;
}

export function computeOverview(
  trades: Trade[],
  strategyName: (id: string) => string = (id) => id,
  opts: OverviewOptions = {},
): Overview {
  const closed = trades.filter(isClosed).sort((a, b) => closedTs(a) - closedTs(b));
  const withPnl = closed.filter((t) => getNetPnl(t) !== null);

  let eq = 0;
  const equity: EquityPoint[] = [];
  for (const t of withPnl) {
    const pnl = getNetPnl(t) as number;
    eq += pnl;
    equity.push({ date: getTradingDateKey(closedTs(t)), equity: +eq.toFixed(2), pnl: +pnl.toFixed(2), symbol: t.symbol });
  }

  // همه‌ی KPIها از موتور واحد (core/metrics/engine.ts)
  const m = computeMetrics(closed, { startBalance: opts.startBalance });
  const dd = m.drawdown;
  const { winCount: wins, lossCount: losses, breakEvenCount: breakeven } = m;

  const bySymbol = rank(withPnl, (t) => t.symbol || null, (k) => k).sort((a, b) => b.pnl - a.pnl);
  const byStrategy = rank(withPnl, (t) => t.strategyId, strategyName).sort((a, b) => b.pnl - a.pnl);

  return {
    kpis: {
      totalTrades: trades.length,
      closedTrades: closed.length,
      winRate: toPercent(m.winRate),
      profitFactor: m.profitFactor,
      maxDrawdownPct: dd.percentage,
      maxDrawdownAbs: dd.absolute,
      expectancyR: m.expectancyR,
      totalPnl: m.netPnl,
    },
    equity,
    pnlSeries: equity,
    distribution: { wins, losses, breakeven, total: m.count },
    bestStrategy: byStrategy.length && byStrategy[0].pnl > 0 ? byStrategy[0] : null,
    bestSymbol: bySymbol.length && bySymbol[0].pnl > 0 ? bySymbol[0] : null,
    worstSymbol: bySymbol.length && bySymbol[bySymbol.length - 1].pnl < 0 ? bySymbol[bySymbol.length - 1] : null,
  };
}
