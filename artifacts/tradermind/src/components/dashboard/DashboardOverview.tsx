import { useMemo } from 'react';
import { Link } from 'wouter';
import { Activity, BarChart3, Crown, Hash, Percent, ShieldAlert, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Panel, KpiCard, DataPlaceholder } from '../ds';
import { EquityAreaChart, DistributionDonut } from '../charts/TmCharts';
import { computeOverview, type Ranked } from '../../services/dashboardOverview';
import type { Trade } from '../../db/database';
import { cn } from '../../lib/utils';

export type OverviewRange = 'today' | 'week' | 'month' | 'year' | 'custom';
const RANGES: { key: OverviewRange; label: string }[] = [
  { key: 'today', label: 'امروز' },
  { key: 'week', label: 'این هفته' },
  { key: 'month', label: 'این ماه' },
  { key: 'year', label: 'امسال' },
  { key: 'custom', label: 'دلخواه' },
];

export interface OverviewPrev { winRate: number | null; profitFactor: number | null; closedCount: number }

interface Props {
  trades: Trade[];
  /** سرمایه‌ی شروع بازه؛ بدون آن درصد Drawdown نمایش داده نمی‌شود */
  startBalance?: number | null;
  strategyName: (id: string) => string;
  range: OverviewRange;
  onRangeChange: (r: OverviewRange) => void;
  prev?: OverviewPrev | null;
}

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num.format(Math.abs(v))}`;
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`;

function delta(cur: number | null, prev: number | null | undefined, unit: '%' | '') {
  if (cur === null || prev === null || prev === undefined) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.005) return null;
  return { value: `${num.format(Math.abs(+d.toFixed(unit === '%' ? 1 : 2)))}${unit}`, direction: d > 0 ? ('up' as const) : ('down' as const) };
}

function InsightCard({ icon: Icon, title, item, tone, emptyHint }: {
  icon: typeof Crown; title: string; item: Ranked | null; tone: 'positive' | 'negative'; emptyHint: string;
}) {
  return (
    <Panel className="min-w-0">
      <div className="relative flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
          tone === 'positive' ? 'bg-[hsl(var(--tm-positive)/0.12)] ring-[hsl(var(--tm-positive)/0.35)] tm-pos' : 'bg-[hsl(var(--tm-negative)/0.12)] ring-[hsl(var(--tm-negative)/0.35)] tm-neg')}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          {item ? (
            <>
              <p className="tm-num truncate text-sm font-semibold text-foreground" dir="auto">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.count} معامله</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{emptyHint}</p>
          )}
        </div>
        {item && (
          <span className={cn('tm-num text-base font-bold', item.pnl >= 0 ? 'tm-pos' : 'tm-neg')}>{signed(item.pnl)}</span>
        )}
      </div>
    </Panel>
  );
}

export function DashboardOverview({ trades, startBalance, strategyName, range, onRangeChange, prev }: Props) {
  const o = useMemo(() => computeOverview(trades, strategyName, { startBalance }), [trades, strategyName, startBalance]);
  const { kpis, distribution: d } = o;
  const hasEquity = o.equity.length >= 2;

  const rangeTabs = (
    <div role="tablist" aria-label="بازه‌ی زمانی" className="flex gap-1 rounded-xl bg-muted/40 p-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={range === r.key}
          onClick={() => onRangeChange(r.key)}
          className={cn('min-h-[28px] rounded-lg px-3 text-xs font-medium transition-colors',
            range === r.key ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground')}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <section aria-label="نمای کلی عملکرد" className="space-y-3" data-testid="dashboard-overview">
      {/* ردیف KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Win Rate" icon={Target} tone={kpis.winRate === null ? 'neutral' : kpis.winRate >= 50 ? 'positive' : 'negative'}
          value={kpis.winRate === null ? null : pct(kpis.winRate)}
          delta={delta(kpis.winRate, prev?.winRate, '%')}
        />
        <KpiCard
          label="Profit Factor" icon={BarChart3} tone={kpis.profitFactor === null ? 'neutral' : kpis.profitFactor >= 1 ? 'positive' : 'negative'}
          value={kpis.profitFactor === null ? null : kpis.profitFactor.toFixed(2)}
          delta={delta(kpis.profitFactor, prev?.profitFactor, '')}
        />
        <KpiCard
          label="Max Drawdown" icon={ShieldAlert} tone={kpis.maxDrawdownPct === null ? 'neutral' : 'negative'}
          value={kpis.maxDrawdownPct !== null
            ? `−${kpis.maxDrawdownPct.toFixed(1)}%`
            : kpis.maxDrawdownAbs > 0 ? `−${num.format(kpis.maxDrawdownAbs)}` : null}
          hint={kpis.maxDrawdownPct !== null && kpis.maxDrawdownAbs > 0
            ? num.format(kpis.maxDrawdownAbs)
            : kpis.maxDrawdownPct === null && kpis.maxDrawdownAbs > 0 ? 'برای درصد، موجودی اولیه‌ی حساب را ثبت کنید' : undefined}
        />
        <KpiCard
          label="Total Trades" icon={Hash} tone="info"
          value={kpis.totalTrades > 0 ? kpis.totalTrades : null}
          hint={kpis.totalTrades > 0 ? `${kpis.closedTrades} بسته` : undefined}
        />
        <KpiCard
          className="col-span-2 md:col-span-1"
          label="Expectancy" icon={Percent} tone={kpis.expectancyR === null ? 'neutral' : kpis.expectancyR >= 0 ? 'positive' : 'negative'}
          value={kpis.expectancyR === null ? null : signed(+kpis.expectancyR.toFixed(2)) + 'R'}
        />
      </div>

      {/* نمودار Equity + توزیع */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Panel title="منحنی سرمایه (Equity Curve)" action={rangeTabs} data-testid="equity-panel">
          {hasEquity ? (
            <EquityAreaChart data={o.equity} height={300} />
          ) : (
            <DataPlaceholder
              icon={Activity}
              minHeight={260}
              title="برای نمودار سرمایه حداقل ۲ معامله‌ی بسته لازم است"
              hint="پس از ثبت و بستن معاملات، منحنی سرمایه اینجا از داده‌های واقعی شما ساخته می‌شود."
              action={<Link href="/journal/trades/new" className="text-xs font-medium text-primary hover:underline">ثبت معامله</Link>}
            />
          )}
        </Panel>

        <Panel title="توزیع معاملات" data-testid="distribution-panel">
          {d.total > 0 ? (
            <DistributionDonut distribution={d} />
          ) : (
            <DataPlaceholder minHeight={260} title="هنوز معامله‌ی بسته‌ای وجود ندارد" hint="توزیع سود/ضرر پس از بسته‌شدن اولین معامله نمایش داده می‌شود." />
          )}
        </Panel>
      </div>

      {/* کارت‌های اطلاعات تکمیلی */}
      <div className="grid gap-3 md:grid-cols-3">
        <InsightCard icon={Crown} title="بهترین استراتژی" item={o.bestStrategy} tone="positive" emptyHint="هنوز استراتژی سودده‌ای ثبت نشده" />
        <InsightCard icon={TrendingUp} title="بیشترین سود (نماد)" item={o.bestSymbol} tone="positive" emptyHint="هنوز نماد سودده‌ای ثبت نشده" />
        <InsightCard icon={TrendingDown} title="بیشترین ضرر (نماد)" item={o.worstSymbol} tone="negative" emptyHint="نماد زیان‌دهی ثبت نشده" />
      </div>
    </section>
  );
}
