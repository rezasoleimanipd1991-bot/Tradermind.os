import type { ElementType } from 'react';
import {
  LayoutDashboard, GitMerge, ActivitySquare, Wallet, BookOpen, BarChart3, HardDrive, Settings,
  TrendingUp, Zap, UserCircle2, Brain, RotateCcw, FileInput, ShieldCheck, Search, Shield,
  Calculator, Camera, Lightbulb, HeartPulse, CreditCard, Box, Bell, CalendarDays, SlidersHorizontal,
} from 'lucide-react';
import { t } from '../lib/i18n';

/**
 * تنها منبع حقیقت منوی برنامه. Drawer موبایل، ریل دسکتاپ و پنل «همه‌ی بخش‌ها»
 * همه از همین فهرست می‌خوانند تا هیچ مسیری در یک نمای ناوبری جا نماند.
 */
export interface NavLeaf { href: string; icon: ElementType; label: string }
export interface NavGroup { title: string; items: NavLeaf[] }

export const NAV_GROUPS: NavGroup[] = [

  {
    title: t.nav.main,
    items: [
      {
        href: "/",
        icon: LayoutDashboard,
        label: t.nav.dashboard,
      },
    ],
  },


  {
    title: t.nav.trading,
    items: [
      {
        href: "/strategies",
        icon: GitMerge,
        label: t.nav.strategies,
      },
      {
        href: "/analysis",
        icon: ActivitySquare,
        label: t.nav.analysis,
      },
    ],
  },



  {
    title: t.nav.journal,
    items: [
      {
        href: "/journal/trades",
        icon: Wallet,
        label: t.nav.trades,
      },
      {
        href: "/journal/sessions",
        icon: CalendarDays,
        label: "سشن‌های معاملاتی",
      },
      {
        href: "/journal/daily",
        icon: BookOpen,
        label: t.nav.dailyJournal,
      },
    ],
  },



  {
    title: t.nav.insights,
    items: [
      {
        href: "/knowledge",
        icon: Brain,
        label: "پایگاه دانش",
      },
      {
        href: "/screenshots",
        icon: Camera,
        label: "هوش اسکرین‌شات",
      },
      {
        href: "/replay",
        icon: RotateCcw,
        label: "ری‌پلی و شبیه‌سازی",
      },
      {
        href: "/profile",
        icon: UserCircle2,
        label: "پروفایل من",
      },
      {
        href: "/reports",
        icon: BarChart3,
        label: "مرکز گزارش‌ها",
      },
      {
        href: "/symbols",
        icon: TrendingUp,
        label: "نمادها",
      },
    ],
  },



  {
    title: "تحلیل عملکرد",
    items: [
      {
        href: "/analytics/psychology",
        icon: HeartPulse,
        label: "روانشناسی معامله‌گر",
      },
    ],
  },



  {
    title: "مدیریت ریسک",
    items: [
      {
        href: "/risk/management",
        icon: Shield,
        label: "داشبورد ریسک",
      },
      {
        href: "/risk/planner",
        icon: Calculator,
        label: "ماشین‌حساب ریسک",
      },
      {
        href: "/risk/profile",
        icon: ShieldCheck,
        label: "پروفایل ریسک",
      },
    ],
  },



  {
    title: "داده‌ها",
    items: [
      {
        href: "/search",
        icon: Search,
        label: "جستجوی جهانی",
      },
      {
        href: "/import",
        icon: FileInput,
        label: "وارد کردن داده",
      },
      {
        href: "/data-quality",
        icon: ShieldCheck,
        label: "کیفیت داده",
      },
    ],
  },



  {
    title: "مدیریت و پشتیبانی",
    items: [
      {
        href: "/accounts",
        icon: CreditCard,
        label: "حساب‌های معاملاتی",
      },
      {
        href: "/trading-boxes",
        icon: Box,
        label: "باکس‌های معاملاتی",
      },
      {
        href: "/journal/config",
        icon: SlidersHorizontal,
        label: "پیکربندی ژورنال",
      },
      {
        href: "/backup",
        icon: HardDrive,
        label: t.nav.backup,
      },
      {
        href: "/settings",
        icon: Settings,
        label: t.nav.settings,
      },
      {
        href: "/reminders",
        icon: Bell,
        label: "یادآورها",
      },
    ],
  },

];

export const BOTTOM_ITEMS: NavLeaf[] = [
  {
    href: "/",
    icon: LayoutDashboard,
    label: t.nav.dashboard,
  },
  {
    href: "/analysis",
    icon: ActivitySquare,
    label: "تحلیل",
  },
  {
    href: "/journal/daily",
    icon: BookOpen,
    label: "ژورنال",
  },
  {
    href: "/journal/trades",
    icon: Wallet,
    label: "معاملات",
  },
  {
    href: "/reports",
    icon: BarChart3,
    label: "گزارش‌ها",
  },
];

/** آیتم‌های اصلی ریل دسکتاپ (مطابق تصویر مرجع). match = پیشوندهایی که آیتم را فعال نشان می‌دهند. */
export interface RailItem extends NavLeaf { match: string[]; exact?: boolean }
export const RAIL_ITEMS: RailItem[] = [
  { href: '/', icon: LayoutDashboard, label: 'داشبورد', match: ['/'], exact: true },
  { href: '/journal/trades', icon: Wallet, label: 'ژورنال معاملاتی', match: ['/journal'] },
  { href: '/reports', icon: BarChart3, label: 'گزارش‌ها', match: ['/reports', '/performance', '/analytics/advanced', '/analytics/edge', '/journal/analytics', '/journal/insights'] },
  { href: '/risk/management', icon: ShieldCheck, label: 'مدیریت ریسک', match: ['/risk'] },
  { href: '/profile', icon: UserCircle2, label: 'پروفایل و آمار', match: ['/profile'] },
  { href: '/settings', icon: Settings, label: 'تنظیمات', match: ['/settings'] },
];

export function isRailItemActive(item: RailItem, location: string): boolean {
  if (item.exact) return location === item.href;
  return item.match.some((m) => location === m || location.startsWith(m + '/'));
}
