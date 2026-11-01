import { Sidebar } from "./Sidebar";
import { NavRail } from "./shell/NavRail";
import { AppHeader } from "./shell/AppHeader";
import { useLocation } from "wouter";
import { AccountAnalyticsProvider, useAccountAnalyticsSettings } from "../contexts/AccountAnalyticsContext";
import { AccountAnalyticsOverview, AccountAnalyticsSelector, SelectedAccountSummary } from "./AccountAnalyticsScope";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const isAnalyticsRoute =
    location === "/" ||
    location.startsWith("/analytics/") ||
    location === "/performance" ||
    location === "/risk/management" ||
    location === "/risk/planner" ||
    location === "/profile" ||
    location.startsWith("/reports") ||
    location === "/journal/analytics" ||
    location === "/journal/insights" ||
    location.startsWith("/symbols");

  return (
    <AccountAnalyticsProvider>
      <LayoutContent isAnalyticsRoute={isAnalyticsRoute}>{children}</LayoutContent>
    </AccountAnalyticsProvider>
  );
}

function LayoutContent({ children, isAnalyticsRoute }: LayoutProps & { isAnalyticsRoute: boolean }) {
  const { separateView } = useAccountAnalyticsSettings();
  return (
    <div className="min-h-screen bg-background">
      {/* موبایل: نوار بالا + Drawer + Bottom Nav (در Sidebar) | دسکتاپ: ریل شناور + هدر */}
      <Sidebar />
      <NavRail />
      <main
        className="tm-main pt-14 md:pt-0 min-h-[100dvh] flex flex-col"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <div className="hidden md:block tm-header-slot">
          <AppHeader />
        </div>
        <div className="tradermind-page-shell flex-1 p-4 md:px-6 md:py-5 max-w-[96rem] mx-auto w-full space-y-4">
          {isAnalyticsRoute && <AccountAnalyticsSelector />}
          {isAnalyticsRoute && !separateView && <SelectedAccountSummary />}
          {isAnalyticsRoute && separateView
            ? <AccountAnalyticsOverview />
            : children}
        </div>
      </main>
    </div>
  );
}
