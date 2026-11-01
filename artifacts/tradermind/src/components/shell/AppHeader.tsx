import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, Moon, Search, Sparkles, Sun, UserCircle2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type ThemeMode } from '../../store/useAppStore';
import { setPendingSearch } from '../../lib/pendingSearch';
import { VoiceTypingButton } from '../ui/VoiceTypingButton';

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'neon', neon: 'light', system: 'light' };
const THEME_ICON = { light: Sun, dark: Moon, neon: Sparkles, system: Sun } as const;
const THEME_LABEL: Record<ThemeMode, string> = { light: 'روشن', dark: 'تاریک', neon: 'نئون ۳D', system: 'سیستم' };

/** هدر کم‌ارتفاع دسکتاپ: جست‌وجو، اعلان/یادآور، تغییر سریع تم و پروفایل. */
export function AppHeader() {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState('');
  const { theme, setTheme } = useAppStore(useShallow((s) => ({ theme: s.theme, setTheme: s.setTheme })));
  const ThemeIcon = THEME_ICON[theme];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setPendingSearch(q.trim());
    setLocation('/search');
    setQ('');
  };

  return (
    <header className="tm-panel tm-header hidden items-center gap-3 px-4 md:flex" dir="rtl">
      <form onSubmit={submit} role="search" className="relative flex-1">
        <div className="space-y-0.5">
          <div className="flex h-5 justify-end"><VoiceTypingButton /></div>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جست‌وجو در معاملات، یادداشت‌ها، تحلیل‌ها…"
              aria-label="جست‌وجو"
              className="tm-input h-9 w-full pr-9 pl-3 text-[13px]"
            />
          </div>
        </div>
      </form>
      <button
        type="button"
        onClick={() => setTheme(NEXT_THEME[theme])}
        className="tm-icon-btn"
        aria-label={`تغییر تم (فعلی: ${THEME_LABEL[theme]})`}
        title={`تم: ${THEME_LABEL[theme]}`}
      >
        <ThemeIcon className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <Link href="/reminders" className="tm-icon-btn" aria-label="یادآورها">
        <Bell className="h-[18px] w-[18px]" aria-hidden />
      </Link>
      <Link href="/profile" className="flex items-center gap-2 rounded-xl px-2 py-1 text-[13px] text-foreground hover:bg-muted/50" aria-label="پروفایل">
        <UserCircle2 className="h-7 w-7 text-primary" aria-hidden />
        <span className="hidden lg:inline">پروفایل</span>
      </Link>
    </header>
  );
}
