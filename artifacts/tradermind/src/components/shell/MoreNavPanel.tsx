import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutGrid } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { NAV_GROUPS } from '../../navigation/navConfig';
import { cn } from '../../lib/utils';

/** پنل «همه‌ی بخش‌ها»: همه‌ی ~۴۰ مسیر برنامه با همان گروه‌بندی قبلی. */
export function MoreNavPanel() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => setOpen(false), [location]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="tm-nav-item"
          data-active={open || undefined}
          aria-label="همه‌ی بخش‌ها"
          aria-expanded={open}
        >
          <LayoutGrid className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span>همه‌ی بخش‌ها</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="end"
        sideOffset={14}
        collisionPadding={12}
        dir="rtl"
        className="tm-panel tm-panel-solid w-[min(46rem,calc(100vw-18rem))] max-h-[min(34rem,calc(100dvh-2rem))] overflow-y-auto border-0 p-4"
      >
        <div className="relative grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="min-w-0">
              <h4 className="mb-1.5 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground">{group.title}</h4>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex min-h-[38px] items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors',
                        active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
