import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import type { PnlCurvePoint, ReportSectionId, ReportTableData } from '../../services/reportsCenterService';
import { formatReportNumber, getSectionDefinition } from '../../services/reportsCenterService';

function renderCell(value: string | number | null): string {
  return typeof value === 'number' ? formatReportNumber(value) : value ?? '—';
}

export function ReportDataTable({ table }: { table: ReportTableData }) {
  if (!table.rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="font-medium">برای این بخش دادهٔ قابل‌نمایشی ثبت نشده است.</p>
        <p className="mt-1 text-sm text-muted-foreground">فیلترها یا بازهٔ زمانی را تغییر دهید، یا داده‌های مرتبط را در ژورنال ثبت کنید.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-right text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95">
            <tr>
              {table.columns.map((column, index) => (
                <th key={`${column}-${index}`} scope="col" className="whitespace-nowrap border-b border-border px-3 py-2.5 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(row => (
              <tr key={row.key} className="odd:bg-background even:bg-muted/25">
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${index}`} className="max-w-[34rem] whitespace-normal border-b border-border/70 px-3 py-2 align-top last:border-b-0">
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.multiAttributed && (
        <p className="border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          یک معامله ممکن است در چند گروه مرتبط ظاهر شود؛ جمع ردیف‌ها لزوماً با تعداد یکتای معاملات برابر نیست.
        </p>
      )}
    </div>
  );
}

function PnlCurves({ curves }: { curves: Record<string, PnlCurvePoint[]> }) {
  const currencies = Object.entries(curves).filter(([, points]) => points.length > 0);
  if (!currencies.length) {
    return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">برای رسم منحنی، معاملهٔ بسته با سود یا زیان ثبت‌شده لازم است.</p>;
  }

  return (
    <div className="space-y-4">
      {currencies.map(([currency, points]) => (
        <div key={currency} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">منحنی P&L خالص — {currency}</h4>
            <span className="text-xs text-muted-foreground">{points.length} معاملهٔ بسته</span>
          </div>
          <div className="h-56 w-full" role="img" aria-label={`منحنی P&L خالص برای ${currency}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 12 }}>
                <defs>
                  <linearGradient id={`net-pnl-${currency.replace(/[^a-zA-Z0-9]/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="index" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} />
                <Tooltip
                  formatter={(value) => [formatReportNumber(Number(value)), 'سود/زیان تجمعی خالص']}
                  labelFormatter={label => `معاملهٔ ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeNetPnl"
                  stroke="hsl(var(--primary))"
                  fill={`url(#net-pnl-${currency.replace(/[^a-zA-Z0-9]/g, '-')})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportSection({
  id,
  table,
  curves,
  collapsed,
  position,
  count,
  onMove,
  onToggleCollapse,
  onRemove,
}: {
  id: ReportSectionId;
  table: ReportTableData;
  curves: Record<string, PnlCurvePoint[]>;
  collapsed: boolean;
  position: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onToggleCollapse: () => void;
  onRemove: () => void;
}) {
  const section = getSectionDefinition(id);
  return (
    <Card className="report-section overflow-hidden" data-report-section={id}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{section.label}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{table.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1" data-print-hidden>
          <span className="hidden px-1 text-xs text-muted-foreground sm:inline">{position + 1} از {count}</span>
          <button type="button" className="rounded-md p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onMove(-1)} disabled={position === 0} aria-label={`انتقال ${section.label} به بالا`} title="انتقال به بالا">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-md p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onMove(1)} disabled={position === count - 1} aria-label={`انتقال ${section.label} به پایین`} title="انتقال به پایین">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={onToggleCollapse} aria-expanded={!collapsed} aria-label={collapsed ? `بازکردن ${section.label}` : `جمع‌کردن ${section.label}`} title={collapsed ? 'بازکردن' : 'جمع‌کردن'}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} aria-label={`حذف ${section.label} از گزارش`} title="حذف بخش">
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="report-section-content space-y-4 p-4" data-collapsed={collapsed}>
        {id === 'pnl' && <PnlCurves curves={curves} />}
        <ReportDataTable table={table} />
      </CardContent>
    </Card>
  );
}
