import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { db, type Trade } from '../db/database';
import { getNetPnl } from '../lib/tradeHelpers';
import { getTradingTimeConfig } from '../lib/tradingTime';
import { useAccountAnalyticsScope } from '../contexts/AccountAnalyticsContext';
import {
  buildPnlCurves,
  buildReportTable,
  computeReportsCenterSummary,
  createReportsCenterIndex,
  DEFAULT_REPORT_FILTERS,
  DEFAULT_REPORT_SECTIONS,
  filterReportTrades,
  formatReportNumber,
  getReportsDateRange,
  getReportFilterOptions,
  REPORT_SECTION_DEFINITIONS,
  type DatePreset,
  type FilterDimension,
  type ReportSectionId,
  type ReportsCenterFilters,
  type ReportsCenterSource,
} from '../services/reportsCenterService';
import {
  ActiveFilterChips,
  DatePresetSelect,
  FilterControls,
  ReportSectionChooser,
} from './reports-center/ReportsCenterControls';
import { ReportSection } from './reports-center/ReportSection';

const SAVED_VIEWS_KEY = 'tradermind-reports-center-views-v1';
const DATE_LABELS: Record<DatePreset, string> = {
  today: 'امروز',
  yesterday: 'دیروز',
  last7: '۷ روز گذشته',
  last30: '۳۰ روز گذشته',
  last90: '۹۰ روز گذشته',
  thisWeek: 'این هفته',
  thisMonth: 'این ماه',
  lastMonth: 'ماه گذشته',
  thisYear: 'امسال',
  all: 'تمام دوره',
  custom: 'بازهٔ دلخواه',
};

interface SavedReportView {
  id: string;
  name: string;
  filters: ReportsCenterFilters;
  sections: ReportSectionId[];
  collapsed: ReportSectionId[];
}

function safeParseViews(raw: string | null): SavedReportView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((view): view is SavedReportView => (
      Boolean(view) &&
      typeof view === 'object' &&
      typeof (view as SavedReportView).id === 'string' &&
      typeof (view as SavedReportView).name === 'string' &&
      Array.isArray((view as SavedReportView).sections) &&
      Array.isArray((view as SavedReportView).collapsed) &&
      Boolean((view as SavedReportView).filters)
    ));
  } catch {
    return [];
  }
}

function activeFilterSummary(filters: ReportsCenterFilters, options: ReturnType<typeof getReportFilterOptions>): string[] {
  const labels: string[] = [];
  if (filters.preset !== 'all') labels.push(`تاریخ: ${DATE_LABELS[filters.preset]}`);
  const dimensions: Array<{ key: FilterDimension; label: string }> = [
    { key: 'statuses', label: 'وضعیت' },
    { key: 'symbols', label: 'نماد' },
    { key: 'directions', label: 'جهت' },
    { key: 'strategies', label: 'استراتژی' },
    { key: 'setups', label: 'ستاپ' },
    { key: 'sessions', label: 'سشن' },
    { key: 'timeframes', label: 'تایم‌فریم' },
    { key: 'psychology', label: 'روان‌شناسی' },
    { key: 'mistakes', label: 'اشتباه' },
    { key: 'tags', label: 'برچسب' },
    { key: 'accounts', label: 'حساب' },
    { key: 'boxes', label: 'باکس' },
  ];
  for (const dimension of dimensions) {
    for (const value of filters[dimension.key]) {
      const label = options[dimension.key].find(item => item.value === value)?.label ?? value;
      labels.push(`${dimension.label}: ${label}`);
    }
  }
  if (filters.minExecutionQuality !== null) labels.push(`حداقل کیفیت اجرا: ${filters.minExecutionQuality}`);
  if (filters.maxExecutionQuality !== null) labels.push(`حداکثر کیفیت اجرا: ${filters.maxExecutionQuality}`);
  if (filters.lessonQuery.trim()) labels.push(`جست‌وجو: ${filters.lessonQuery.trim()}`);
  if (filters.preset === 'custom' && filters.fromDate && filters.toDate) {
    labels[0] = `تاریخ: ${filters.fromDate} تا ${filters.toDate}`;
  }
  return labels;
}

function escapeCsv(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(
  source: ReportsCenterSource,
  trades: Trade[],
  sections: ReportSectionId[],
  index: ReturnType<typeof createReportsCenterIndex>,
  timeConfig: ReturnType<typeof getTradingTimeConfig>,
  filters: ReportsCenterFilters,
  filterOptions: ReturnType<typeof getReportFilterOptions>,
): void {
  const output: unknown[][] = [
    ['TraderMind — مرکز گزارش‌ها'],
    ['بازه', DATE_LABELS[filters.preset]],
    ['فیلترهای فعال', activeFilterSummary(filters, filterOptions).join(' | ') || 'بدون فیلتر'],
    ['بخش‌ها', sections.map(id => REPORT_SECTION_DEFINITIONS.find(item => item.id === id)?.label ?? id).join(' | ')],
    [],
  ];
  for (const sectionId of sections) {
    const table = buildReportTable(sectionId, trades, source, index, timeConfig);
    output.push([table.title]);
    output.push(table.columns);
    table.rows.forEach(row => output.push(row.cells));
    output.push([]);
  }
  output.push(['معامله‌های فیلترشده']);
  output.push(['نماد', 'وضعیت', 'نتیجه', 'جهت', 'زمان بازشدن', 'زمان بسته‌شدن', 'P&L ناخالص', 'P&L خالص', 'R', 'درصد ریسک', 'مبلغ ریسک']);
  for (const trade of trades) {
    const session = trade.journalSessionId ? index.sessionsById.get(trade.journalSessionId) : undefined;
    const accountId = trade.accountId ?? session?.accountId;
    const currency = accountId ? index.accountsById.get(accountId)?.currency : null;
    output.push([
      trade.symbol,
      trade.status,
      trade.result,
      trade.direction,
      new Date(trade.openedAt).toISOString(),
      trade.closedAt ? new Date(trade.closedAt).toISOString() : '',
      trade.profitLoss,
      getNetPnl(trade) ?? '',
      trade.rMultiple,
      trade.riskPercentage,
      trade.riskAmount == null ? '' : `${trade.riskAmount} ${currency ?? 'ارز نامشخص'}`,
    ]);
  }
  const csv = `\uFEFF${output.map(row => row.map(escapeCsv).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tradermind-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function formatCurrencyMetrics(
  rows: Array<{ currency: string; value: number | null }>,
): string {
  if (!rows.length) return '—';
  return rows.map(row => `${formatReportNumber(row.value)} ${row.currency}`).join(' · ');
}

export default function ReportsCenter() {
  const [loadedSource, setSource] = useState<ReportsCenterSource | null>(null);
  const { scopedTrades } = useAccountAnalyticsScope(loadedSource?.trades ?? []);
  const source = useMemo(
    () => loadedSource ? { ...loadedSource, trades: scopedTrades } : null,
    [loadedSource, scopedTrades],
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportsCenterFilters>({ ...DEFAULT_REPORT_FILTERS });
  const [sections, setSections] = useState<ReportSectionId[]>([...DEFAULT_REPORT_SECTIONS]);
  const [collapsed, setCollapsed] = useState<ReportSectionId[]>([]);
  const [timeConfig] = useState(() => getTradingTimeConfig());
  const [savedViews, setSavedViews] = useState<SavedReportView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [viewName, setViewName] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [
        trades,
        dailyJournals,
        strategies,
        accounts,
        boxes,
        journalSessions,
        journalOptions,
        journalSessionAnalyses,
        journalTriggerEvents,
        journalTradeData,
      ] = await Promise.all([
        db.trades.toArray(),
        db.dailyJournals.toArray(),
        db.strategies.toArray(),
        db.accounts.toArray(),
        db.tradingBoxes.toArray(),
        db.journalSessions.toArray(),
        db.journalOptions.toArray(),
        db.journalSessionAnalyses.toArray(),
        db.journalTriggerEvents.toArray(),
        db.journalTradeData.toArray(),
      ]);
      setSource({
        trades,
        dailyJournals,
        strategies,
        accounts,
        boxes,
        journalSessions,
        journalOptions,
        journalSessionAnalyses,
        journalTriggerEvents,
        journalTradeData,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'خواندن داده‌های محلی ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    try {
      setSavedViews(safeParseViews(localStorage.getItem(SAVED_VIEWS_KEY)));
    } catch {
      setStorageError('خواندن نماهای ذخیره‌شده از حافظهٔ محلی ممکن نشد.');
    }
  }, [loadData]);

  const updateFilter = <K extends keyof ReportsCenterFilters>(
    key: K,
    value: ReportsCenterFilters[K],
  ) => setFilters(current => ({ ...current, [key]: value }));

  const index = useMemo(
    () => source ? createReportsCenterIndex(source) : null,
    [source],
  );
  const filterOptions = useMemo(
    () => source && index ? getReportFilterOptions(source, index) : null,
    [source, index],
  );
  const filtered = useMemo(
    () => source && index
      ? filterReportTrades(source, index, filters, timeConfig)
      : { trades: [] as Trade[], dateRange: { from: 0, to: 0, valid: true } },
    [source, index, filters, timeConfig],
  );
  const summary = useMemo(
    () => index ? computeReportsCenterSummary(filtered.trades, index) : null,
    [filtered.trades, index],
  );
  const pnlCurves = useMemo(
    () => index ? buildPnlCurves(filtered.trades, index) : {},
    [filtered.trades, index],
  );
  const reportTables = useMemo(() => {
    if (!source || !index) return new Map<ReportSectionId, ReturnType<typeof buildReportTable>>();
    return new Map(sections.map(id => [
      id,
      buildReportTable(id, filtered.trades, source, index, timeConfig),
    ]));
  }, [filtered.trades, index, sections, source, timeConfig]);

  const persistViews = (nextViews: SavedReportView[]) => {
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(nextViews));
      setSavedViews(nextViews);
      setStorageError(null);
    } catch {
      setStorageError('ذخیره در حافظهٔ محلی ناموفق بود؛ فضای مرورگر را بررسی کنید.');
    }
  };

  const currentViewSnapshot = (id: string, name: string): SavedReportView => ({
    id,
    name,
    filters: structuredClone(filters),
    sections: [...sections],
    collapsed: [...collapsed],
  });

  const createView = () => {
    const name = viewName.trim();
    if (!name) {
      setStorageError('برای ساخت نما، ابتدا نام آن را وارد کنید.');
      return;
    }
    const id = `view-${Date.now()}`;
    persistViews([...savedViews, currentViewSnapshot(id, name)]);
    setSelectedViewId(id);
  };

  const loadView = () => {
    const view = savedViews.find(item => item.id === selectedViewId);
    if (!view) return;
    setFilters({ ...DEFAULT_REPORT_FILTERS, ...view.filters });
    setSections(view.sections.filter(id => REPORT_SECTION_DEFINITIONS.some(section => section.id === id)));
    setCollapsed(view.collapsed.filter(id => REPORT_SECTION_DEFINITIONS.some(section => section.id === id)));
    setViewName(view.name);
  };

  const updateView = () => {
    const view = savedViews.find(item => item.id === selectedViewId);
    if (!view) return;
    persistViews(savedViews.map(item => item.id === view.id ? currentViewSnapshot(view.id, view.name) : item));
  };

  const renameView = () => {
    const name = viewName.trim();
    if (!selectedViewId || !name) {
      setStorageError('برای تغییر نام، یک نما را انتخاب و نام جدید را وارد کنید.');
      return;
    }
    persistViews(savedViews.map(view => view.id === selectedViewId ? { ...view, name } : view));
  };

  const deleteView = () => {
    if (!selectedViewId) return;
    persistViews(savedViews.filter(view => view.id !== selectedViewId));
    setSelectedViewId('');
    setViewName('');
  };

  const moveSection = (id: ReportSectionId, direction: -1 | 1) => {
    setSections(current => {
      const position = current.indexOf(id);
      const nextPosition = position + direction;
      if (position < 0 || nextPosition < 0 || nextPosition >= current.length) return current;
      const next = [...current];
      [next[position], next[nextPosition]] = [next[nextPosition], next[position]];
      return next;
    });
  };

  const setSectionSelection = (selected: ReportSectionId[]) => {
    setSections(current => {
      const selectedSet = new Set(selected);
      return [
        ...current.filter(id => selectedSet.has(id)),
        ...REPORT_SECTION_DEFINITIONS.map(item => item.id).filter(id => selectedSet.has(id) && !current.includes(id)),
      ];
    });
  };

  const dateRangeLabel = filters.preset === 'custom'
    ? filters.fromDate && filters.toDate ? `${filters.fromDate} تا ${filters.toDate}` : 'تاریخ را کامل کنید'
    : DATE_LABELS[filters.preset];

  const handleExport = () => {
    if (!source || !index) return;
    downloadCsv(source, filtered.trades, sections, index, timeConfig, filters, filterOptions!);
  };

  const numberMetrics = summary?.currencies ?? [];
  const averageWin = formatCurrencyMetrics(numberMetrics.map(item => ({ currency: item.currency, value: item.averageWin })));
  const averageLoss = formatCurrencyMetrics(numberMetrics.map(item => ({ currency: item.currency, value: item.averageLoss })));
  const profitFactor = numberMetrics.map(item => `${item.currency}: ${formatReportNumber(item.profitFactor)}`).join(' · ') || '—';
  const drawdown = formatCurrencyMetrics(numberMetrics.map(item => ({ currency: item.currency, value: item.maxDrawdown })));
  const riskAmount = formatCurrencyMetrics(numberMetrics.map(item => ({ currency: item.currency, value: item.riskAmount })));
  const netPnl = formatCurrencyMetrics(numberMetrics.map(item => ({ currency: item.currency, value: item.netPnl })));

  return (
    <main className="reports-center mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6" dir="rtl">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .reports-center, .reports-center * { visibility: visible !important; }
          .reports-center { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; padding: 0 !important; }
          [data-print-hidden] { display: none !important; }
          .report-section-content, .report-section-content[data-collapsed="true"] { display: block !important; }
          .report-section { break-inside: avoid; border-color: #999 !important; box-shadow: none !important; margin-bottom: 12px; }
          .report-section-content { overflow: visible !important; }
          .report-section-content table { min-width: 100% !important; }
          .report-section-content [class*="max-h-"] { max-height: none !important; overflow: visible !important; }
        }
      `}</style>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">تحلیل آفلاین، بر پایهٔ داده‌های محلی</p>
          <h1 className="mt-1 text-2xl font-bold">مرکز گزارش‌ها</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            یک مجموعه‌داده و فیلتر مشترک برای گزارش‌های معاملاتی. داده‌های معامله در این صفحه تغییر نمی‌کنند و به سرویس آنلاین فرستاده نمی‌شوند.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-print-hidden>
          <Button variant="outline" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters}>
            <SlidersHorizontal className="ml-2 h-4 w-4" />{showFilters ? 'جمع‌کردن فیلترها' : 'نمایش فیلترها'}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={!source || loading}>
            <Download className="ml-2 h-4 w-4" />خروجی CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!source || loading}>
            <Printer className="ml-2 h-4 w-4" />چاپ گزارش
          </Button>
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />به‌روزرسانی داده
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4" data-print-hidden aria-labelledby="saved-views-heading">
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="saved-views-heading" className="mb-2 font-semibold">نماهای ذخیره‌شده</h2>
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">نام نما</span>
            <input className="h-10 rounded-md border border-input bg-background px-3" value={viewName} onChange={event => setViewName(event.target.value)} placeholder="مثلاً مرور هفتگی" />
          </label>
          <Button variant="secondary" onClick={createView}><Save className="ml-2 h-4 w-4" />ذخیره به‌عنوان نمای جدید</Button>
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">انتخاب نمای ذخیره‌شده</span>
            <select className="h-10 rounded-md border border-input bg-background px-3" value={selectedViewId} onChange={event => {
              setSelectedViewId(event.target.value);
              setViewName(savedViews.find(view => view.id === event.target.value)?.name ?? '');
            }}>
              <option value="">انتخاب کنید</option>
              {savedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadView} disabled={!selectedViewId}>بارگذاری</Button>
            <Button variant="outline" onClick={updateView} disabled={!selectedViewId}>به‌روزرسانی نما</Button>
            <Button variant="outline" onClick={renameView} disabled={!selectedViewId}>تغییر نام</Button>
            <Button variant="outline" onClick={deleteView} disabled={!selectedViewId}>حذف</Button>
          </div>
        </div>
        {storageError && <p role="alert" className="mt-3 text-sm text-destructive">{storageError}</p>}
        <p className="mt-2 text-xs text-muted-foreground">نماها فقط فیلترها و ترتیب بخش‌ها را در همین مرورگر ذخیره می‌کنند؛ هیچ رکورد معامله‌ای داخل آن‌ها ذخیره نمی‌شود.</p>
      </section>

      {loading && (
        <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground" role="status">در حال خواندن داده‌های محلی…</CardContent></Card>
      )}
      {!loading && loadError && (
        <Card><CardContent className="space-y-3 p-6" role="alert">
          <p className="font-semibold">بارگذاری گزارش‌ها ناموفق بود.</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" onClick={() => void loadData()}>تلاش دوباره</Button>
        </CardContent></Card>
      )}

      {!loading && !loadError && source && index && filterOptions && summary && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="خلاصهٔ شاخص‌ها">
            <MetricCard label="کل معامله‌ها" value={formatReportNumber(summary.totalTrades, 0)} note={`${summary.closedTrades} بسته · ${summary.openTrades} باز · ${summary.cancelledTrades} لغوشده`} />
            <MetricCard label="برد / باخت / سربه‌سر" value={`${summary.wins} / ${summary.losses} / ${summary.breakeven}`} note="از معامله‌های بسته" />
            <MetricCard label="نرخ برد" value={summary.winRate === null ? '—' : `${formatReportNumber(summary.winRate)}٪`} note="بردها ÷ همهٔ معامله‌های بسته" />
            <MetricCard label="P&L خالص تحقق‌یافته" value={netPnl} note="پس از کسر هزینه‌ها؛ جداگانه بر حسب ارز حساب" />
            <MetricCard label="میانگین برد خالص" value={averageWin} note="معامله‌های بستهٔ برنده" />
            <MetricCard label="میانگین باخت خالص" value={averageLoss} note="معامله‌های بستهٔ بازنده" />
            <MetricCard label="Profit Factor خالص" value={profitFactor} note="سود خالص مثبت ÷ قدرمطلق زیان خالص" />
            <MetricCard label="میانگین R / مجموع R ثبت‌شده" value={`${formatReportNumber(summary.averageR)} / ${formatReportNumber(summary.totalR)}`} note="فقط R ثبت‌شده در معامله‌های بسته" />
            <MetricCard label="مجموع ریسک ثبت‌شده" value={riskAmount} note="مبالغ جداگانه بر حسب ارز حساب؛ فقط معامله‌های بسته" />
            <MetricCard label="حداکثر افت سرمایه" value={drawdown} note="از منحنی سود/زیان خالص تحقق‌یافته، جداگانه بر حسب ارز" />
          </section>

          {summary.tradesWithoutPnl > 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              P&L برای {summary.tradesWithoutPnl} معاملهٔ بسته ثبت نشده است؛ این معامله‌ها در مبالغ و نسبت‌های مالی محاسبه نشده‌اند.
            </p>
          )}

          {showFilters && (
            <FilterControls filters={filters} options={filterOptions} onChange={updateFilter} />
          )}
          <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="active-filters-heading">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="active-filters-heading" className="font-semibold">فیلترهای اعمال‌شده</h2>
                <p className="text-xs text-muted-foreground">{filtered.trades.length} از {source.trades.length} معامله مطابق است · مبنای تاریخ: زمان بازشدن</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFilters({ ...DEFAULT_REPORT_FILTERS, preset: 'all' })}>پاک‌کردن همهٔ فیلترها</Button>
            </div>
            <ActiveFilterChips filters={filters} options={filterOptions} onChange={updateFilter} dateLabel={dateRangeLabel} />
            {!filtered.dateRange.valid && <p role="alert" className="mt-2 text-sm text-destructive">بازهٔ سفارشی کامل یا معتبر نیست؛ تاریخ شروع باید پیش از تاریخ پایان باشد.</p>}
          </section>

          <ReportSectionChooser selected={sections} onChange={setSectionSelection} />

          {sections.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="font-medium">بخشی برای نمایش انتخاب نشده است.</p>
              <p className="mt-1 text-sm text-muted-foreground">از انتخاب‌گر بالا یک یا چند گزارش را اضافه کنید.</p>
            </CardContent></Card>
          ) : filtered.trades.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="font-medium">با فیلترهای فعلی معامله‌ای پیدا نشد.</p>
              <p className="mt-1 text-sm text-muted-foreground">بازه یا فیلترها را تغییر دهید؛ داده‌های ذخیره‌شده تغییری نکرده‌اند.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {sections.map((id, position) => {
                const table = reportTables.get(id);
                if (!table) return null;
                return (
                  <ReportSection
                    key={id}
                    id={id}
                    table={table}
                    curves={pnlCurves}
                    collapsed={collapsed.includes(id)}
                    position={position}
                    count={sections.length}
                    onMove={direction => moveSection(id, direction)}
                    onToggleCollapse={() => setCollapsed(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}
                    onRemove={() => setSections(current => current.filter(item => item !== id))}
                  />
                );
              })}
            </div>
          )}
          <section className="rounded-xl border border-border bg-card p-4" data-print-hidden aria-labelledby="legacy-reports-heading">
            <h2 id="legacy-reports-heading" className="font-semibold">گزارش‌های تخصصی قبلی</h2>
            <p className="mt-1 text-xs text-muted-foreground">این صفحه‌ها هنوز به‌طور کامل به مرکز منتقل نشده‌اند و بدون تغییر در دسترس‌اند.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { href: '/performance', label: 'داشبورد عملکرد' },
                { href: '/analytics/advanced', label: 'تحلیل پیشرفته' },
                { href: '/analytics/edge', label: 'کشف مزیت' },
                { href: '/journal/analytics', label: 'تحلیل ژورنال' },
                { href: '/journal/insights', label: 'نکات و یادداشت‌ها' },
                { href: '/reports/classic', label: 'گزارش کلاسیک' },
              ].map(item => (
                <Link key={item.href} href={item.href} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
          <footer className="border-t border-border pt-3 text-xs text-muted-foreground" data-print-hidden>
            گزارش آفلاین و فقط‌خواندنی است. اگر داده‌های مرتبط ثبت نشده باشند، شاخص نمایش داده نمی‌شود؛ سود/زیان معاملهٔ باز در مدل فعلی محاسبه نشده است.
          </footer>
        </>
      )}
    </main>
  );
}
