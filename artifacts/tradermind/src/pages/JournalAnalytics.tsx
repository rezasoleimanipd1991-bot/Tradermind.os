import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccountAnalyticsScope } from '../contexts/AccountAnalyticsContext';
import { BarChart3, Filter, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { Account, JournalOption, JournalSession, JournalSessionAnalysis, JournalTradeData, JournalTriggerEvent, StrategyVersion, Trade, TradingBox, Strategy } from '../db/database';
import { db } from '../db/database';
import { journalSessionService, parseJournalArray, type JournalAnalyticsFilters } from '../services/journalSessionService';
import { accountService } from '../services/accountService';
import { tradingBoxService } from '../services/tradingBoxService';
import { strategyService } from '../services/strategyService';
import { Button } from '../components/ui/button';
import { PeriodReviewCard } from '../components/journal/PeriodReviewCard';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { getNetPnl } from '../lib/tradeHelpers';
import {
  BREAKDOWN_DIMENSIONS,
  buildBreakdowns,
  buildPlanAdherence,
  buildScenarioAccuracy,
  type BreakdownDimension,
} from '../services/journalBreakdownService';

const MIN_RELIABLE_SAMPLE = 5;

const ALL = '__all__';

function localDayStart(date: string): number | undefined {
  if (!date) return undefined;
  const value = new Date(`${date}T00:00:00`);
  return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
}

function localDayEnd(date: string): number | undefined {
  if (!date) return undefined;
  const value = new Date(`${date}T23:59:59.999`);
  return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
}

function money(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export default function JournalAnalytics() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [boxes, setBoxes] = useState<TradingBox[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [versions, setVersions] = useState<StrategyVersion[]>([]);
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [options, setOptions] = useState<JournalOption[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loadedTrades, setTrades] = useState<Trade[]>([]);
  const { scopedTrades: trades } = useAccountAnalyticsScope(loadedTrades);
  const [metrics, setMetrics] = useState(() => journalSessionService.calculateMetrics([]));
  const [loading, setLoading] = useState(true);
  const [analyses, setAnalyses] = useState<JournalSessionAnalysis[]>([]);
  const [triggers, setTriggers] = useState<JournalTriggerEvent[]>([]);
  const [tradeData, setTradeData] = useState<JournalTradeData[]>([]);
  const [allOptions, setAllOptions] = useState<JournalOption[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
  const [dimension, setDimension] = useState<BreakdownDimension>('timeframe');

  const loadSources = useCallback(async () => {
    try {
      await journalSessionService.ensureDefaultOptions();
      const [allAccounts, allBoxes, allStrategies, allSessions, activeOptions, allVersions, allAnalyses, allTriggers, everyOption] = await Promise.all([
        accountService.getAll(),
        tradingBoxService.getAll(),
        strategyService.getAllStrategies(),
        journalSessionService.getSessions(),
        journalSessionService.getOptions(undefined, false),
        db.strategyVersions.toArray(),
        db.journalSessionAnalyses.toArray(),
        db.journalTriggerEvents.toArray(),
        journalSessionService.getOptions(undefined, true),
      ]);
      setAccounts(allAccounts);
      setBoxes(allBoxes);
      setStrategies(allStrategies);
      setVersions(allVersions);
      setSessions(allSessions);
      setOptions(activeOptions);
      setAnalyses(allAnalyses);
      setTriggers(allTriggers);
      setAllOptions(everyOption);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بارگذاری فیلترها ناموفق بود.');
    }
  }, []);

  const runQuery = useCallback(async (values: Record<string, string>) => {
    setLoading(true);
    try {
      const query: JournalAnalyticsFilters = {
        accountId: values.accountId || undefined,
        tradingBoxId: values.tradingBoxId || undefined,
        strategyId: values.strategyId || undefined,
        strategyVersionId: values.strategyVersionId || undefined,
        symbol: values.symbol || undefined,
        from: localDayStart(values.from),
        to: localDayEnd(values.to),
        sessionId: values.sessionId || undefined,
        timeframeOptionId: values.timeframeOptionId || undefined,
        entryTriggerOptionId: values.entryTriggerOptionId || undefined,
        exitReasonOptionId: values.exitReasonOptionId || undefined,
        psychologyOptionId: values.psychologyOptionId || undefined,
        mistakeOptionId: values.mistakeOptionId || undefined,
        setupGradeOptionId: values.setupGradeOptionId || undefined,
        scoTypeOptionId: values.scoTypeOptionId || undefined,
        fvgTypeOptionId: values.fvgTypeOptionId || undefined,
        minSetupQuality: values.minSetupQuality === '' ? undefined : Number(values.minSetupQuality),
        maxSetupQuality: values.maxSetupQuality === '' ? undefined : Number(values.maxSetupQuality),
        minExecutionQuality: values.minExecutionQuality === '' ? undefined : Number(values.minExecutionQuality),
        maxExecutionQuality: values.maxExecutionQuality === '' ? undefined : Number(values.maxExecutionQuality),
        strategyCompliance: values.strategyCompliance
          ? values.strategyCompliance as JournalAnalyticsFilters['strategyCompliance']
          : undefined,
      };
      const result = await journalSessionService.getAnalytics(query);
      setTrades(result.trades);
      setTradeData(result.tradeData);
      setMetrics(result.metrics);
      setAppliedFilters(values);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تحلیل معاملات ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
    void runQuery({});
  }, [loadSources, runQuery]);

  const setFilter = (key: string, value: string) => setFilters(current => ({ ...current, [key]: value === ALL ? '' : value }));
  const optionsFor = (category: string) => options.filter(option => option.category === category);
  const sessionTitle = (session: JournalSession) => {
    const symbolList = parseJournalArray(session.symbols);
    return `${symbolList.join(', ') || 'بدون نماد'} · ${new Date(session.startTime).toLocaleDateString()}`;
  };

  const selectField = (key: string, label: string, items: Array<{ id: string; label: string }>) => (
    <label key={key} className="space-y-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={filters[key] || ALL} onValueChange={value => setFilter(key, value)}>
        <SelectTrigger data-testid={`select-journal-filter-${key}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>همه</SelectItem>
          {items.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );

  const optionSelect = (key: string, category: string, label: string) =>
    selectField(key, label, optionsFor(category).map(option => ({ id: option.id, label: option.label })));

  const breakdowns = useMemo(
    () => buildBreakdowns({ trades, sessions, analyses, triggers, options: allOptions, tradeData }),
    [trades, sessions, analyses, triggers, allOptions, tradeData],
  );
  const adherence = useMemo(() => buildPlanAdherence(trades, tradeData), [trades, tradeData]);
  const scenarioRows = useMemo(() => {
    const from = localDayStart(appliedFilters.from ?? '');
    const to = localDayEnd(appliedFilters.to ?? '');
    const symbolQuery = (appliedFilters.symbol ?? '').toLowerCase();
    const sessionIds = new Set(sessions.filter(session =>
      (!appliedFilters.accountId || session.accountId === appliedFilters.accountId)
      && (!appliedFilters.tradingBoxId || session.tradingBoxId === appliedFilters.tradingBoxId)
      && (!appliedFilters.strategyId || session.strategyId === appliedFilters.strategyId)
      && (!appliedFilters.strategyVersionId || session.strategyVersionId === appliedFilters.strategyVersionId)
      && (!appliedFilters.sessionId || session.id === appliedFilters.sessionId)
      && (!symbolQuery || parseJournalArray(session.symbols).some(symbol => symbol.toLowerCase().includes(symbolQuery)))
      && (from == null || session.startTime >= from)
      && (to == null || session.startTime <= to),
    ).map(session => session.id));
    return buildScenarioAccuracy({ analyses, options: allOptions, sessionIds });
  }, [analyses, allOptions, sessions, appliedFilters]);
  const activeDimension = BREAKDOWN_DIMENSIONS.find(item => item.id === dimension) ?? BREAKDOWN_DIMENSIONS[0];
  const dimensionRows = breakdowns[dimension];
  const signed = (value: number, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  const tone = (value: number | null) => value == null || value === 0 ? '' : value > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300';

  const metricCards = [
    { label: 'تعداد معاملات', value: String(metrics.totalTrades) },
    { label: 'برد / باخت / سربه‌سر', value: `${metrics.wins} / ${metrics.losses} / ${metrics.breakeven}` },
    { label: 'نرخ برد', value: metrics.winRate == null ? '—' : `${metrics.winRate.toFixed(1)}%` },
    { label: 'سود خالص', value: money(metrics.netPnl) },
    { label: 'مجموع R', value: `${metrics.totalR >= 0 ? '+' : ''}${metrics.totalR.toFixed(2)}R` },
    { label: 'میانگین R', value: metrics.averageR == null ? '—' : `${metrics.averageR >= 0 ? '+' : ''}${metrics.averageR.toFixed(2)}R` },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 pb-10" dir="rtl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-journal-analytics-title">تحلیل ژورنال</h1>
          <p className="mt-1 text-sm text-muted-foreground">معاملات session-based را با گزینه‌های قابل تنظیم فیلتر کنید.</p>
        </div>
        <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
      </header>

      <PeriodReviewCard />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> فیلترها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selectField('accountId', 'حساب', accounts.filter(item => !item.isArchived).map(item => ({ id: item.id, label: item.name })))}
            {selectField('tradingBoxId', 'باکس', boxes.filter(item => item.status === 'active').map(item => ({ id: item.id, label: item.name })))}
            {selectField('strategyId', 'استراتژی', strategies.map(item => ({ id: item.id, label: item.name })))}
            {selectField('strategyVersionId', 'نسخه استراتژی', versions
              .filter(version => !filters.strategyId || version.strategyId === filters.strategyId)
              .map(version => ({
                id: version.id,
                label: `${version.strategyName} · v${version.versionNumber}`,
              })))}
            {selectField('sessionId', 'سشن', sessions.map(item => ({ id: item.id, label: sessionTitle(item) })))}
            {optionSelect('timeframeOptionId', 'timeframe', 'تایم‌فریم')}
            {optionSelect('entryTriggerOptionId', 'entry_trigger', 'تریگر ورود')}
            {optionSelect('exitReasonOptionId', 'exit_reason', 'دلیل خروج')}
            {optionSelect('psychologyOptionId', 'psychology', 'حالت روانی')}
            {optionSelect('mistakeOptionId', 'mistake', 'اشتباه')}
            {optionSelect('setupGradeOptionId', 'setup_grade', 'درجه ستاپ')}
            {optionSelect('scoTypeOptionId', 'sco_type', 'نوع SCO')}
            {optionSelect('fvgTypeOptionId', 'fvg_type', 'نوع FVG')}
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">رعایت استراتژی</span>
              <Select value={filters.strategyCompliance || ALL} onValueChange={value => setFilter('strategyCompliance', value)}>
                <SelectTrigger data-testid="select-journal-filter-compliance"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه</SelectItem>
                  <SelectItem value="yes">بله</SelectItem>
                  <SelectItem value="partially">تاحدی</SelectItem>
                  <SelectItem value="no">خیر</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">نماد</span>
              <Input data-testid="input-journal-filter-symbol" value={filters.symbol ?? ''} onChange={event => setFilter('symbol', event.target.value)} placeholder="جستجوی نماد" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">از تاریخ</span>
              <Input data-testid="input-journal-filter-from" type="date" value={filters.from ?? ''} onChange={event => setFilter('from', event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">تا تاریخ</span>
              <Input data-testid="input-journal-filter-to" type="date" value={filters.to ?? ''} onChange={event => setFilter('to', event.target.value)} />
            </label>
            {(['minSetupQuality', 'maxSetupQuality', 'minExecutionQuality', 'maxExecutionQuality'] as const).map(key => (
              <label key={key} className="space-y-1.5 text-sm">
                <span className="text-muted-foreground">{key.includes('Setup') ? 'کیفیت ستاپ' : 'کیفیت اجرا'} {key.startsWith('min') ? 'از' : 'تا'}</span>
                <Input
                  data-testid={`input-journal-filter-${key}`}
                  type="number" min="0" max="10" step="1"
                  value={filters[key] ?? ''}
                  onChange={event => setFilter(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="button-run-journal-filters" onClick={() => void runQuery(filters)}>اعمال فیلتر</Button>
            <Button data-testid="button-reset-journal-filters" variant="outline" className="gap-2" onClick={() => { setFilters({}); void runQuery({}); }}>
              <RotateCcw className="h-4 w-4" /> پاک‌کردن فیلترها
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="خلاصه عملکرد">
        {metricCards.map(metric => (
          <Card key={metric.label} data-testid={`card-journal-metric-${metric.label}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card data-testid="card-plan-adherence">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">کیفیت تصمیم، جدا از سود و زیان</CardTitle>
          <p className="text-xs text-muted-foreground">بر اساس «رعایت استراتژی» که در مرور هر معامله ثبت می‌کنید. معاملهٔ بد که سود داد، شانس است؛ معاملهٔ خوب که ضرر داد، بخشی از فرایند درست.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {adherence.onPlan.trades + adherence.offPlan.trades === 0
            ? <p className="py-4 text-center text-sm text-muted-foreground" data-testid="status-adherence-empty">برای دیدن این مقایسه، در مرور معاملات «رعایت استراتژی» را ثبت کنید.</p>
            : <>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { row: adherence.onPlan, testId: 'on-plan' },
                  { row: adherence.offPlan, testId: 'off-plan' },
                  { row: adherence.unrated, testId: 'unrated' },
                ].map(({ row, testId }) => (
                  <div key={testId} className="rounded-lg border p-3" data-testid={`adherence-${testId}`}>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{row.trades} معامله</p>
                    <p className="mt-1 text-xs text-muted-foreground">نرخ برد: {row.winRate == null ? '—' : `${row.winRate.toFixed(0)}٪`}</p>
                    <p className={`text-xs tabular-nums ${tone(row.averageR)}`} dir="ltr" style={{ textAlign: 'right' }}>میانگین R: {row.averageR == null ? '—' : `${signed(row.averageR)}R`}</p>
                    <p className={`text-xs tabular-nums ${tone(row.netPnl)}`} dir="ltr" style={{ textAlign: 'right' }}>سود خالص: {money(row.netPnl)}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-1 text-sm leading-6" data-testid="list-adherence-insights">
                {adherence.averageRAdvantage != null && <li>
                  معاملات طبق پلن به‌طور میانگین <span className={`font-semibold ${tone(adherence.averageRAdvantage)}`} dir="ltr">{signed(adherence.averageRAdvantage)}R</span> نسبت به معاملات خارج از پلن تفاوت دارند.
                </li>}
                {adherence.offPlanWins > 0 && <li>{adherence.offPlanWins} معاملهٔ خارج از پلن سود داده است؛ این سودها شانسی‌اند و نباید الگو شوند.</li>}
                {adherence.onPlanLosses > 0 && <li>{adherence.onPlanLosses} معاملهٔ طبق پلن ضرر داده است؛ این ضررها هزینهٔ عادی استراتژی‌اند.</li>}
              </ul>
            </>}
        </CardContent>
      </Card>

      <Card data-testid="card-journal-breakdown">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">آمار بر اساس فیلدهای تحلیل</CardTitle>
          <p className="text-xs text-muted-foreground">کدام تایم‌فریم، ناحیه، تریگر و سشن برای شما بهتر کار می‌کند؟ فقط معاملات نتیجهٔ فیلتر بالا حساب می‌شوند.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="بُعد آمار">
            {BREAKDOWN_DIMENSIONS.map(item => (
              <button key={item.id} type="button" role="tab" aria-selected={dimension === item.id} onClick={() => setDimension(item.id)}
                className={`rounded-full border px-3 py-1.5 text-xs ${dimension === item.id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                data-testid={`tab-breakdown-${item.id}`}>{item.label}</button>
            ))}
          </div>
          {activeDimension.hint && <p className="text-[11px] text-muted-foreground">{activeDimension.hint}</p>}
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">در حال محاسبه…</p>
            : dimensionRows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground" data-testid="status-breakdown-empty">معامله‌ای برای محاسبه نیست.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm" data-testid="table-journal-breakdown">
                  <thead><tr className="border-b text-right text-muted-foreground">
                    <th className="py-2">{activeDimension.label}</th><th>معاملات</th><th>نرخ برد</th><th>سود خالص</th><th>مجموع R</th><th>میانگین R</th>
                  </tr></thead>
                  <tbody>
                    {dimensionRows.map(row => (
                      <tr key={row.key} className="border-b last:border-0" data-testid={`row-breakdown-${row.key}`}>
                        <td className="py-2.5 font-medium">{row.label}{row.settled < MIN_RELIABLE_SAMPLE && <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">نمونهٔ کم</span>}</td>
                        <td className="tabular-nums">{row.trades}</td>
                        <td className="tabular-nums">{row.winRate == null ? '—' : `${row.winRate.toFixed(0)}٪`}</td>
                        <td className={`tabular-nums ${tone(row.netPnl)}`} dir="ltr">{money(row.netPnl)}</td>
                        <td className={`tabular-nums ${tone(row.totalR)}`} dir="ltr">{signed(row.totalR)}R</td>
                        <td className={`tabular-nums ${tone(row.averageR)}`} dir="ltr">{row.averageR == null ? '—' : `${signed(row.averageR)}R`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          <p className="text-[11px] text-muted-foreground">«نمونهٔ کم» یعنی کمتر از {MIN_RELIABLE_SAMPLE} معاملهٔ بسته؛ به این اعداد زیاد تکیه نکنید.</p>
        </CardContent>
      </Card>

      <Card data-testid="card-scenario-accuracy">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">دقت سناریوها به تفکیک تایم‌فریم</CardTitle>
          <p className="text-xs text-muted-foreground">دقت = (مطابق + نصفِ «تا حدی مطابق») ÷ همهٔ نتیجه‌های ثبت‌شده. نتیجهٔ سناریو را در صفحهٔ هر سشن ثبت کنید.</p>
        </CardHeader>
        <CardContent>
          {scenarioRows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground" data-testid="status-scenario-empty">هنوز تحلیلی ثبت نشده است.</p>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm" data-testid="table-scenario-accuracy">
                <thead><tr className="border-b text-right text-muted-foreground">
                  <th className="py-2">تایم‌فریم</th><th>تحلیل‌ها</th><th>نتیجه ثبت‌شده</th><th>مطابق</th><th>تا حدی</th><th>باطل</th><th>فعال‌نشده</th><th>دقت</th>
                </tr></thead>
                <tbody>
                  {scenarioRows.map(row => (
                    <tr key={row.timeframeOptionId} className="border-b last:border-0" data-testid={`row-scenario-${row.timeframeOptionId}`}>
                      <td className="py-2.5 font-medium">{row.label}{row.recorded > 0 && row.recorded < MIN_RELIABLE_SAMPLE && <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">نمونهٔ کم</span>}</td>
                      <td className="tabular-nums">{row.analyses}</td><td className="tabular-nums">{row.recorded}</td>
                      <td className="tabular-nums">{row.hit}</td><td className="tabular-nums">{row.partial}</td>
                      <td className="tabular-nums">{row.invalidated}</td><td className="tabular-nums">{row.notTriggered}</td>
                      <td className="font-semibold tabular-nums">{row.accuracy == null ? '—' : `${row.accuracy.toFixed(0)}٪`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">معاملات نتیجه فیلتر</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-journal-analytics-loading">در حال محاسبه…</p>
          ) : trades.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-journal-analytics-empty">معامله‌ای با این فیلترها پیدا نشد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b text-right text-muted-foreground">
                  <th className="py-2">نماد</th><th>جهت</th><th>نتیجه</th><th>سود/زیان خالص</th><th>R</th><th>تاریخ</th>
                </tr></thead>
                <tbody>
                  {trades.slice().sort((a, b) => b.openedAt - a.openedAt).map(trade => (
                    <tr key={trade.id} data-testid={`row-journal-analytics-trade-${trade.id}`} className="border-b last:border-0">
                      <td className="py-3 font-medium" dir="ltr">{trade.symbol || '—'}</td>
                      <td>{trade.direction === 'long' ? 'خرید' : 'فروش'}</td>
                      <td>{trade.result}</td>
                      <td dir="ltr">{getNetPnl(trade) == null ? '—' : money(getNetPnl(trade)!)}</td>
                      <td dir="ltr">{trade.rMultiple == null ? '—' : `${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple.toFixed(2)}R`}</td>
                      <td>{new Date(trade.openedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
