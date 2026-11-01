import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  /** کنترل‌های گوشه‌ی هدر پنل (فیلتر، منو، ...) */
  action?: React.ReactNode;
  /** پنل داخلی: سطح عمیق‌تر برای کارت‌های درون یک پنل */
  inner?: boolean;
  /** فقط برای کارت‌های قابل کلیک؛ هاور ظریف ۲px (در لمس غیرفعال است) */
  interactive?: boolean;
  bodyClassName?: string;
}

export function Panel({
  title, action, inner = false, interactive = false, className, bodyClassName, children, ...rest
}: PanelProps) {
  return (
    <section
      data-interactive={interactive || undefined}
      className={cn(inner ? 'tm-panel-inner' : 'tm-panel', 'min-w-0', className)}
      {...rest}
    >
      {(title || action) && (
        <header className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-2">
          {title && <h3 className="text-sm font-semibold text-foreground ">{title}</h3>}
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn('relative px-4 pb-4', !title && !action && 'pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}
