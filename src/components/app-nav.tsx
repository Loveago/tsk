"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FileBarChart,
  Receipt,
  BookOpen,
  Users,
  Settings,
  ClipboardList,
  ScrollText,
  Sun,
  Moon,
  Monitor,
  Send,
  User,
  Store,
  Ticket,
  FileWarning,
  FileSpreadsheet,
  CheckCircle2,
  ShieldCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Activity,
  Loader2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Renders a live record-count badge next to the label. */
  badge?: boolean;
  /** Hidden from the desktop tab bar (still reachable on mobile and by URL). */
  mobileOnly?: boolean;
};

/**
 * Plain-data variant of NavItem safe to pass from Server Components to Client
 * Components — icons are referenced by name and resolved client-side via
 * resolveNavIcon (component references cannot cross the RSC boundary).
 */
export type ExtraNavItem = {
  href: string;
  label: string;
  icon?: NavIconName;
  badge?: boolean;
  mobileOnly?: boolean;
};

/** Icons selectable by name for ExtraNavItem entries. */
const extraIconRegistry = {
  store: Store,
  user: User,
  package: Package,
  receipt: Receipt,
} satisfies Record<string, React.ComponentType<{ className?: string }>>;

export type NavIconName = keyof typeof extraIconRegistry;

export function resolveNavIcon(name: NavIconName | undefined): React.ComponentType<{
  className?: string;
}> {
  return (name && name in extraIconRegistry
    ? extraIconRegistry[name as NavIconName]
    : extraIconRegistry.store);
}

export const userNav: NavItem[] = [
  { href: "/dashboard/send", label: "Send Order", icon: Send },
  { href: "/dashboard/orders", label: "Sent Orders", icon: ClipboardList, badge: true },
  { href: "/dashboard/not-received", label: "My Not Received", icon: FileWarning },
  { href: "/dashboard/billing", label: "Billing", icon: Receipt },
  { href: "/dashboard/mtn-verification", label: "MTN Verification", icon: CheckCircle2 },
  { href: "/dashboard/api", label: "API", icon: BookOpen },
  { href: "/dashboard/packages", label: "Packages", icon: Package },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/profile", label: "Profile", icon: User, mobileOnly: true },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/order-api-logs", label: "Order API Logs", icon: Activity },
  { href: "/admin/mtn-verification", label: "MTN Verification", icon: ShieldCheck },
  { href: "/admin/exports", label: "Exports", icon: FileSpreadsheet },
  { href: "/admin/delivery-reports", label: "Not Received", icon: FileWarning },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/users/signup-codes", label: "Signup Codes", icon: Ticket },
  { href: "/admin/storefronts", label: "Storefronts", icon: Store },
  { href: "/admin/packages", label: "Packages", icon: Package },
  { href: "/admin/pricing", label: "Pricing", icon: Receipt },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/api", label: "API", icon: BookOpen },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

export function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted ? (resolvedTheme === "dark" || theme === "dark") : false;

  const toggle = () => {
    if (!mounted) return;
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Dark mode active — click for Light mode" : "Light mode active — click for Dark mode"}
      className={cn(
        "group relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full p-1 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        isDark
          ? "bg-slate-800 border border-indigo-500/40 shadow-inner"
          : "bg-amber-50/90 border border-amber-300/80 shadow-sm",
        className
      )}
    >
      {/* Background Icons */}
      <div className="flex w-full items-center justify-between px-0.5">
        <Sun className={cn("h-3.5 w-3.5 transition-opacity duration-200", isDark ? "opacity-30 text-amber-400" : "opacity-0")} />
        <Moon className={cn("h-3.5 w-3.5 transition-opacity duration-200", isDark ? "opacity-0" : "opacity-30 text-indigo-400")} />
      </div>

      {/* Sliding Knob */}
      <span
        className={cn(
          "absolute top-1 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-all duration-300 ease-out",
          isDark
            ? "translate-x-6 bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-indigo-600/40"
            : "translate-x-0 bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-900 shadow-amber-400/30"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-indigo-100" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-amber-950 fill-amber-950/20" />
        )}
      </span>
    </button>
  );
}

/** Total number of orders the signed-in user has sent (for the tab badge). */
export function useSentOrdersCount() {
  const [count, setCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/orders?pageSize=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d.total === "number") setCount(d.total);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return count;
}

export function TopTabs({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const count = useSentOrdersCount();
  const navRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  React.useEffect(() => {
    if (!pendingHref) return;
    const timer = setTimeout(() => setPendingHref(null), 8000);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  const checkScroll = React.useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setCanScrollLeft(canLeft);
    setCanScrollRight(canRight);
  }, []);

  React.useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    checkScroll();

    const ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [checkScroll, items]);

  // Scroll active tab into view when navigating
  React.useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
    checkScroll();
  }, [pathname, checkScroll]);

  // Translate vertical wheel scroll into horizontal scroll when hovering over tabs
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = navRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      checkScroll();
    }
  };

  const scroll = (direction: "left" | "right") => {
    const el = navRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -220 : 220, behavior: "smooth" });
    setTimeout(checkScroll, 250);
  };

  return (
    <div className={cn("relative flex items-center w-full min-w-0", className)}>
      {/* Left scroll chevron with gradient fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center pr-3 bg-gradient-to-r from-white via-white/95 to-transparent dark:from-[#0a1120] dark:via-[#0a1120]/95 dark:to-transparent">
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll navigation left"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Primary tabs scroll area */}
      <nav
        ref={navRef}
        onScroll={checkScroll}
        onWheel={onWheel}
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 xl:gap-1.5 overflow-x-auto scroll-smooth py-1"
        aria-label="Primary"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const isPending = pendingHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (active) return;
                if (pendingHref) {
                  e.preventDefault();
                  return;
                }
                setPendingHref(item.href);
              }}
              className={cn(
                "flex h-8 xl:h-8.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 xl:px-3 text-xs xl:text-[13px] font-semibold transition-all",
                active
                  ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/25"
                  : isPending
                  ? "bg-slate-200/80 text-slate-900 opacity-90 animate-pulse dark:bg-white/15 dark:text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              )}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              ) : (
                <item.icon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{item.label}</span>
              {item.badge && count != null && count > 0 && (
                <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#0a1120]">
                  {count > 999 ? `${Math.floor(count / 1000)}k` : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right scroll chevron with gradient fade */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center pl-3 bg-gradient-to-l from-white via-white/95 to-transparent dark:from-[#0a1120] dark:via-[#0a1120]/95 dark:to-transparent">
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll navigation right"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function MobileSelectNav({
  items,
  isAdminRole,
  currentIsAdmin,
  className,
}: {
  items: NavItem[];
  isAdminRole?: boolean;
  currentIsAdmin?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const current = items.find((i) => isActive(pathname, i.href))?.href ?? "";

  return (
    <div className={cn("relative", className)}>
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        aria-label="Navigate to page"
        className="h-10 w-full appearance-none rounded-xl border-2 border-brand-500/80 bg-white px-3 pr-9 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-brand-400/70 dark:bg-[#0d1526] dark:text-slate-100"
      >
        <optgroup label={currentIsAdmin ? "Admin Navigation" : "Dashboard Pages"}>
          {items.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </optgroup>
        {isAdminRole && (
          <optgroup label="Switch Portal">
            <option value={currentIsAdmin ? "/dashboard/send" : "/admin"}>
              {currentIsAdmin ? "⚡ Switch to User Dashboard →" : "🛡️ Open Admin Panel →"}
            </option>
          </optgroup>
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
    </div>
  );
}
