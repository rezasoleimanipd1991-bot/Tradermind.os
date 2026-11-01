import * as React from 'react';
import { Inbox, Loader2, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlaceholderKind = 'empty' | 'loading' | 'error' | 'disabled';

const DEFAULTS: Record<PlaceholderKind, { icon: LucideIcon; title: string }> = {
  empty: { icon: Inbox, title: 'هنوز داده‌ای ثبت نشده' },
  loading: { icon: Loader2, title: 'در حال بارگذاری…' },
  error: { icon: AlertTriangle, title: 'بارگذاری داده ناموفق بود' },
  disabled: { icon: Inbox, title: 'این بخش در دسترس نیست' },
};

export interface DataPlaceholderProps {
  kind?: PlaceholderKind;
  title?: string;
  hint?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  /** ارتفاع حداقلی تا چیدمان با ورود داده نپرد */
  minHeight?: number | string;
  className?: string;
}

/**
 * جای‌نگهدار عناصر بدون داده. هرگز عدد یا نمودار ساختگی نشان نمی‌دهد؛
 * فقط وضعیت (خالی / بارگذاری / خطا / غیرفعال) را با همان زبان بصری برنامه نمایش می‌دهد.
 */
export function DataPlaceholder({
  kind = 'empty', title, hint, icon, action, minHeight = 120, className,
}: DataPlaceholderProps) {
  const d = DEFAULTS[kind];
  const Icon = icon ?? d.icon;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-busy={kind === 'loading' || undefined}
      style={{ minHeight }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center',
        kind === 'disabled' && 'opacity-60',
        className,
      )}
    >
      <Icon
        className={cn(
          'h-6 w-6',
          kind === 'error' ? 'text-destructive' : 'text-muted-foreground',
          kind === 'loading' && 'animate-spin',
        )}
        aria-hidden
      />
      <p className="text-sm font-medium text-foreground">{title ?? d.title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}
