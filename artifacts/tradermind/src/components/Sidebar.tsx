import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from "../store/useAppStore";
import {
  LayoutDashboard,
  GitMerge,
  ActivitySquare,
  Wallet,
  BookOpen,
  BarChart3,
  HardDrive,
  Settings,
  Menu,
  X,
  ChevronLeft,
  TrendingUp,
  Zap,
  UserCircle2,
  Brain,
  RotateCcw,
  FileInput,
  ShieldCheck,
  Search,
  Shield,
  Calculator,
  Camera,
  Lightbulb,
  HeartPulse,
  CreditCard,
  Box,
  Bell,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "../lib/utils";
import { DISPLAY_VERSION } from "../constants/version";
import { Button } from "./ui/button";
import { NAV_GROUPS, BOTTOM_ITEMS } from "../navigation/navConfig";


interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick?: () => void;
}


function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  onClick,
}: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium min-h-[44px]",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
      onClick={onClick}
    >
      <Icon className="h-5 w-5 shrink-0" />

      <span>{label}</span>

      {isActive && (
        <ChevronLeft className="h-4 w-4 ms-auto opacity-60" />
      )}
    </Link>
  );
}



function BottomNavItem({
  href,
  icon: Icon,
  label,
  isActive,
}: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center flex-1 h-full gap-1 min-w-0 transition-colors px-1",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          isActive && "scale-110"
        )}
      />

      <span className="text-[10px] font-medium leading-none truncate max-w-full">
        {label}
      </span>
    </Link>
  );
}




export function Sidebar() {

  const [location] = useLocation();

  // PART 8 / Prompt 3 — selector برای جلوگیری از re-render غیرضروری
  const { sidebarOpen, setSidebarOpen, appName } = useAppStore(
    useShallow(s => ({ sidebarOpen: s.sidebarOpen, setSidebarOpen: s.setSidebarOpen, appName: s.appName }))
  );

  // Drawer موبایل نباید از اجرای قبلی یا حالت پس‌زمینهٔ Android به صفحه
  // نشت کند. در دسکتاپ این state روی نمایش Sidebar اثری ندارد.
  useEffect(() => {
    setSidebarOpen(false);

    const closeWhenHidden = () => {
      if (document.hidden) setSidebarOpen(false);
    };
    document.addEventListener("visibilitychange", closeWhenHidden);
    return () => document.removeEventListener("visibilitychange", closeWhenHidden);
  }, [setSidebarOpen]);

  // تغییر مسیر از هر راهی (Back، deep link یا انتخاب آیتم) Drawer را می‌بندد.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location, setSidebarOpen]);



  const isActive = (href: string) =>
    href === "/"
      ? location === "/"
      : location.startsWith(href);




  return (
    <>
      {/* ── پوشش موبایل وقتی Sidebar باز است */}
      {sidebarOpen && (
        <div
          className="
            fixed
            left-0
            right-0
            bottom-0
            top-14
            bg-background/80
            backdrop-blur-sm
            z-40
            md:hidden
          "
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}



      {/* ── Sidebar دسکتاپ + Drawer موبایل */}
      <aside
        className={cn(
          "tradermind-mobile-drawer md:hidden fixed z-50 bg-sidebar border-l flex flex-col"
        )}
        style={{
          // Keep the drawer inside the visual viewport on Android WebView.
          // Explicit physical sides avoid RTL + transform rounding bugs.
          right: 0,
          left: "auto",
          // Layout reserves md:pr-64 (16rem) on desktop; keep both values
          // identical so the module menu never covers the content column.
          width: "min(16rem, 100vw)",
          maxWidth: "100vw",
          top: "56px",
          height: "calc(100dvh - 56px)",
        }}
        data-open={sidebarOpen ? "true" : "false"}
        dir="rtl"
      >


        {/* هدر Sidebar */}
        <div
          className="
            flex
            items-center
            justify-between
            px-4
            border-b
            shrink-0
          "
          style={{
            minHeight: "56px",
          }}
        >

          <div className="
            flex
            items-center
            gap-2
            font-semibold
            text-lg
            tracking-tight
          ">
            <div className="
              w-6
              h-6
              rounded
              bg-primary
              flex
              items-center
              justify-center
            ">
              <ActivitySquare
                className="
                  w-4
                  h-4
                  text-primary-foreground
                "
              />
            </div>

            {appName}
          </div>



          <Button
            variant="ghost"
            size="icon"
            className="
              md:hidden
              h-8
              w-8
            "
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>

        </div>





        {/* لیست ناوبری */}
        <div className="
          flex-1
          overflow-y-auto
          py-4
        ">

          {NAV_GROUPS.map((group, i) => (

            <div
              key={i}
              className="
                mb-6
                px-3
              "
            >

              <h4
                className="
                  mb-1.5
                  px-3
                  text-xs
                  font-semibold
                  text-muted-foreground
                  uppercase
                  tracking-wider
                "
              >
                {group.title}
              </h4>



              <div className="space-y-0.5">

                {group.items.map((item, j) => (

                  <NavItem
                    key={j}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    isActive={isActive(item.href)}
                    onClick={() =>
                      setSidebarOpen(false)
                    }
                  />

                ))}

              </div>


            </div>

          ))}

        </div>





        {/* نسخه برنامه */}
        <div
          className="
            p-4
            border-t
            shrink-0
          "
        >
          <p className="
            text-xs
            text-muted-foreground
            text-center
          ">
            TraderMind • {DISPLAY_VERSION}
          </p>
        </div>


      </aside>





      {/* ── نوار بالای موبایل */}
      <div
        className="
          md:hidden
          fixed
          top-0
          left-0
          right-0
          z-30
          tm-bar border-b
          flex
          items-center
          px-4
          gap-3
        "
        style={{
          height: "56px",
          paddingTop:
            "env(safe-area-inset-top)",
        }}
      >

        <span className="
          font-semibold
          flex-1
          text-base
        ">
          {appName}
        </span>



        <Link
          href="/search"
          aria-label="جست‌وجو"
          className="tm-icon-btn h-10 w-10"
        >
          <Search className="h-5 w-5" />
        </Link>

        <Button
          variant="ghost"
          size="icon"
          className="
            h-10
            w-10
          "
          aria-label="منو"
          onClick={() =>
            setSidebarOpen(true)
          }
        >
          <Menu className="h-5 w-5" />
        </Button>


      </div>







      {/* ── Bottom Navigation موبایل */}
      <nav
        className="
          md:hidden
          fixed
          bottom-0
          left-0
          right-0
          z-30
          tm-bar border-t
          flex
          items-stretch
        "
        style={{
          height:
            "calc(56px + env(safe-area-inset-bottom, 0px))",

          paddingBottom:
            "env(safe-area-inset-bottom, 0px)",
        }}
      >

        {BOTTOM_ITEMS.map((item, i) => (

          <BottomNavItem
            key={i}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={
              isActive(item.href)
            }
          />

        ))}


      </nav>


    </>
  );
}
