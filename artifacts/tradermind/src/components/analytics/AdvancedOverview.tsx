import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Panel, DataPlaceholder } from '../ds';
import { EquityAreaChart, PnlBarChart, DistributionDonut, fmtSigned } from '../charts/TmCharts';
import { computeOverview } from '../../services/dashboardOverview';
import type { Trade } from '../../db/database';
import { cn } from '../../lib/utils';

/** بخش عریض صفحه‌ی تحلیل پیشرفته: Equity، سود/زیان هر معامله، توزیع نتایج، آمار کلیدی. */
export function AdvancedOverview({ trades, strategyName }: { trades: Trade[]; strategyName: (id: string) => string }) {
  const o = useMemo(() => computeOverview(trades, strategyName), [trades, strategyName]);
  const pnls = o.pnlSeries.map((p) => p.pnl);
  const wins = pnls.filter((v) => v > 0);
  const losses = pnls.filter((v) => v < 0);
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

  const stats: { label: string; value: number | null; money?: boolean }[] = [
    { label: 'میانگین سود', value: mean(wins), money: true },
    { label: 'میانگین ضرر', value: mean(losses), money: true },
    { label: 'بهترین معامله', value: pnls.length ? Math.max(...pnls) : null, money: true },
    { label: 'بدترین معامله', value: pnls.length ? Math.min(...pnls) : null, money: true },
    { label: 'سود/زیان کل', value: o.pnlSeries.length ? o.kpis.totalPnl : null, money: true },
  ];

  const empty = (min: number) => (
    <DataPlaceholder icon={Activity} minHeight={min} title="برای این نمودار حداقل ۲ معامله‌ی بسته لازم است"
      hint="فیلترها را تغییر دهید یا معاملات بیشتری ثبت کنید." />
  );

  return (
    <div className="space-y-3" data-testid="advanced-overview">
      <Panel title="منحنی سرمایه (Equity Curve)">
        {o.equity.length >= 2 ? <EquityAreaChart data={o.equity} height={300} /> : empty(260)}
      </Panel>
      <Panel title="سود/زیان معاملات">
        {o.pnlSeries.length >= 2 ? <PnlBarChart data={o.pnlSeries} height={220} /> : empty(200)}
      </Panel>
      <div className="grid gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Panel title="توزیع نتایج معاملات">
          {o.distribution.total > 0 ? <DistributionDonut distribution={o.distribution} size={160} /> : empty(220)}
        </Panel>
        <Panel title="آمار کلیدی">
          <dl className="divide-y divide-border/50">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2.5 text-sm">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className={cn('tm-num font-semibold', s.value === null ? 'text-muted-foreground' : s.value >= 0 ? 'tm-pos' : 'tm-neg')}>
                  {s.value === null ? '—' : fmtSigned(+s.value.toFixed(2))}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
