import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiTone = 'positive' | 'negative' | 'neutral' | 'info';

export interface KpiCardProps {
  label: string;
  /** null/undefined = داده‌ای وجود ندارد → «—» نشان داده می‌شود، نه عدد فرضی */
  value: React.ReactNode | null | undefined;
  tone?: KpiTone;
  icon?: LucideIcon;
  /** تغییر نسبت به دوره‌ی قبل؛ فقط وقتی داده‌ی معتبر دارید بدهید */
  delta?: { value: string; direction: 'up' | 'down' } | null;
  hint?: string;
  loading?: boolean;
  className?: string;
}

const TONE: Record<KpiTone, string> = {
  positive: 'tm-pos',
  negative: 'tm-neg',
  info: 'tm-info',
  neutral: 'text-foreground',
};

export function KpiCard({
  label, value, tone = 'neutral', icon: Icon, delta, hint, loading, className,
}: KpiCardProps) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={cn('tm-panel tm-kpi min-w-0 px-3.5 py-3', className)} data-kpi={label}>
      <div className="relative flex items-start justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground" dir="auto">{label}</span>
        {Icon && <Icon className={cn('h-5 w-5 shrink-0', tone === 'neutral' ? 'text-primary' : TONE[tone])} aria-hidden />}
      </div>
      <div className="relative mt-1.5">
        {loading ? (
          <div className="h-7 w-20 animate-pulse rounded-md bg-muted" aria-label="در حال بارگذاری" />
        ) : (
          <span className={cn('tm-num inline-block text-2xl font-bold leading-tight', empty ? 'text-muted-foreground' : TONE[tone])}>
            {empty ? '—' : value}
          </span>
        )}
      </div>
      {(delta || hint) && !loading && (
        <div className="relative mt-1 flex items-center gap-1 text-[11px]">
          {delta && (
            <span className={cn('tm-num inline-flex items-center gap-0.5', delta.direction === 'up' ? 'tm-pos' : 'tm-neg')}>
              {delta.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {delta.value}
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
