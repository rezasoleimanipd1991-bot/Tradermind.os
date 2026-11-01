import { Link, useLocation } from 'wouter';
import { ActivitySquare } from 'lucide-react';
import { RAIL_ITEMS, isRailItemActive } from '../../navigation/navConfig';
import { MoreNavPanel } from './MoreNavPanel';
import { DISPLAY_VERSION } from '../../constants/version';
import { useAppStore } from '../../store/useAppStore';

/** ریل ناوبری دسکتاپ: شناور، باریک، راست‌چین (سمت راست صفحه). فقط ≥ md. */
export function NavRail() {
  const [location] = useLocation();
  const appName = useAppStore((s) => s.appName);

  return (
    <nav
      aria-label="ناوبری اصلی"
      dir="rtl"
      className="tm-panel tm-rail fixed z-40 hidden flex-col md:flex"
    >
      <Link href="/" className="relative mb-4 flex items-center gap-2.5 px-3 pt-4" aria-label={appName}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/40">
          <ActivitySquare className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-bold text-foreground">{appName}</span>
          <span className="block truncate text-[9px] tracking-wide text-muted-foreground" dir="ltr">Think · Plan · Trade · Grow</span>
        </span>
      </Link>

      <div className="relative flex flex-1 flex-col gap-1 px-2">
        {RAIL_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="tm-nav-item"
            data-active={isRailItemActive(item, location) || undefined}
            aria-current={isRailItemActive(item, location) ? 'page' : undefined}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
        <div className="my-1 h-px bg-border/60" />
        <MoreNavPanel />
      </div>

      <p className="relative px-3 py-3 text-center text-[11px] text-muted-foreground" dir="ltr">
        {DISPLAY_VERSION}
      </p>
    </nav>
  );
}
