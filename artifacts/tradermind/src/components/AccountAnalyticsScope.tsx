import {
  useAccountAnalyticsSettings,
  type AccountAnalyticsSummary,
} from '../contexts/AccountAnalyticsContext';
import { COMBINED_ACCOUNTS_ID } from '../services/accountScope';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const ALL_ACCOUNTS_VALUE = '__all_accounts__';

export function AccountAnalyticsSelector() {
  const { accounts, selectedAccountId, setSelectedAccountId, combined } = useAccountAnalyticsSettings();
  const combinedBlocked = selectedAccountId === COMBINED_ACCOUNTS_ID && !combined.allowed;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">حساب تحلیل</p>
          <p className="text-xs text-muted-foreground">
            یک حساب را انتخاب کنید، یا همهٔ حساب‌ها را ترکیبی/جداگانه ببینید. حساب‌هایی با ارز متفاوت هرگز جمع نمی‌شوند.
          </p>
        </div>
        <Select
          value={selectedAccountId ?? ALL_ACCOUNTS_VALUE}
          onValueChange={value => setSelectedAccountId(value === ALL_ACCOUNTS_VALUE ? null : value)}
        >
          <SelectTrigger className="w-full sm:w-72" aria-label="انتخاب حساب برای تحلیل">
            <SelectValue placeholder="انتخاب حساب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COMBINED_ACCOUNTS_ID} disabled={!combined.allowed}>
              همهٔ حساب‌ها، ترکیبی{combined.currency ? ` · ${combined.currency}` : ''}
            </SelectItem>
            <SelectItem value={ALL_ACCOUNTS_VALUE}>همهٔ حساب‌ها، جداگانه</SelectItem>
            {accounts.map(account => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} · {account.currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(combinedBlocked || (!combined.allowed && combined.reason)) && (
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          نمای ترکیبی در دسترس نیست: {combined.reason} برای دیدن صفحه‌ها یک حساب مشخص را انتخاب کنید.
        </p>
      )}
      {combined.allowed && combined.warning && selectedAccountId === COMBINED_ACCOUNTS_ID && (
        <p role="note" className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {combined.warning}
        </p>
      )}
    </div>
  );
}

function money(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const signed = `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
  return currency ? `${signed} ${currency}` : signed;
}

function percent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}٪`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums break-words">{value}</p>
    </div>
  );
}

export function AccountCard({ summary }: { summary: AccountAnalyticsSummary }) {
  const { metrics } = summary;
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>{summary.accountName}</span>
          <span className="text-xs font-normal text-muted-foreground">{summary.currency ?? 'ارز نامشخص'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.count === 0 ? (
          <p className="text-sm text-muted-foreground">برای این حساب معاملهٔ بسته‌شده‌ای ثبت نشده است.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="معاملات بسته" value={String(metrics.count)} />
              <Metric label="سود خالص" value={money(metrics.netPnl, summary.currency)} />
              <Metric label="Profit Factor" value={metrics.profitFactor?.toFixed(2) ?? '—'} />
              <Metric label="نرخ برد" value={metrics.winRate === null ? '—' : `${(metrics.winRate * 100).toFixed(1)}٪`} />
              <Metric label="میانگین R" value={metrics.avgR === null ? '—' : `${metrics.avgR.toFixed(2)}R`} />
              <Metric label="حداکثر افت" value={percent(metrics.drawdown.percentage)} />
              <Metric label="افت مطلق" value={money(metrics.drawdown.absolute, summary.currency)} />
              <Metric label="حداقل افت (کم‌عمق‌ترین دوره)" value={metrics.drawdownStats.minPercentage !== null ? `${percent(metrics.drawdownStats.minPercentage)} · ${money(metrics.drawdownStats.minAbsolute, summary.currency)}` : money(metrics.drawdownStats.minAbsolute, summary.currency)} />
              <Metric label="تعداد دوره‌های افت" value={String(metrics.drawdownStats.episodeCount)} />
              <Metric label="پایین‌ترین موجودی" value={money(metrics.drawdownStats.lowestEquity, summary.currency)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="بهترین روز هفته با میانگین R" value={summary.bestDay ?? '—'} />
              <Metric label="ضعیف‌ترین روز هفته با میانگین R" value={summary.worstDay ?? '—'} />
              <Metric label="بهترین ساعت با میانگین R" value={summary.bestHour === null ? '—' : `${String(summary.bestHour).padStart(2, '0')}:00`} />
              <Metric label="ضعیف‌ترین ساعت با میانگین R" value={summary.worstHour === null ? '—' : `${String(summary.worstHour).padStart(2, '0')}:00`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 text-right font-medium">بازه</th>
                    <th className="py-2 text-right font-medium">بهترین سود خالص</th>
                    <th className="py-2 text-right font-medium">ضعیف‌ترین سود خالص</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.periods.map(period => (
                    <tr key={period.label} className="border-t border-border/60">
                      <td className="py-2">{period.label}</td>
                      <td className="py-2 tabular-nums">
                        {period.bestPeriod ? `${period.bestPeriod} · ${money(period.bestPnl, summary.currency)}` : '—'}
                      </td>
                      <td className="py-2 tabular-nums">
                        {period.worstPeriod ? `${period.worstPeriod} · ${money(period.worstPnl, summary.currency)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AccountAnalyticsOverview() {
  const { summaries, loading, error } = useAccountAnalyticsSettings();
  return (
    <section dir="rtl" className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">خلاصهٔ جداگانهٔ حساب‌ها</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هر کارت فقط داده‌های همان حساب را نشان می‌دهد؛ موجودی و سود حساب‌ها با هم ترکیب نمی‌شوند.
        </p>
      </div>
      {loading ? (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">در حال بارگذاری حساب‌ها و معاملات…</div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          بارگذاری اطلاعات حساب‌ها ناموفق بود: {error}
        </div>
      ) : summaries.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {summaries.map(summary => (
            <AccountCard key={summary.accountId ?? 'unassigned'} summary={summary} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
          هنوز حسابی ثبت نشده است.
        </div>
      )}
    </section>
  );
}

/** خلاصه‌ی بازشونده‌ی حساب انتخاب‌شده (یا ترکیبی) بالای صفحه‌های تحلیلی */
export function SelectedAccountSummary() {
  const { selectedSummary, loading } = useAccountAnalyticsSettings();
  if (loading || !selectedSummary) return null;
  return (
    <details className="group rounded-xl border border-border bg-card/40">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
        خلاصهٔ {selectedSummary.accountName}: بهترین/ضعیف‌ترین روز، هفته، ماه، سال و ساعت، و افت‌ها
      </summary>
      <div className="p-3 pt-0">
        <AccountCard summary={selectedSummary} />
      </div>
    </details>
  );
}
