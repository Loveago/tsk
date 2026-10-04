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
  MessageSquare,
  Banknote,
  Wallet,
  Layers,
  Globe,
  PanelLeft,
  PanelTop,
  ChevronsLeft,
  ChevronsRight,
  X,
  Search,
  Check,
  Compass,
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
  wallet: Wallet,
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
  { href: "/dashboard/transactions", label: "Transactions", icon: Wallet },
  { href: "/dashboard/billing", label: "Billing", icon: Receipt },
  { href: "/dashboard/packages", label: "Packages", icon: Package },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/api", label: "API", icon: BookOpen },
  { href: "/dashboard/mtn-verification", label: "MTN Verification", icon: CheckCircle2 },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, badge: true },
  { href: "/admin/clickyfied-batches", label: "Clickyfied Batches", icon: Layers },
  { href: "/admin/order-api-logs", label: "Order API Logs", icon: Activity },
  { href: "/admin/mtn-verification", label: "MTN Verification", icon: ShieldCheck },
  { href: "/admin/exports", label: "Exports", icon: FileSpreadsheet },
  { href: "/admin/delivery-reports", label: "Not Received", icon: FileWarning, badge: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/wallets", label: "User Wallets", icon: Wallet },
  { href: "/admin/chat", label: "Support Chat", icon: MessageSquare },
  { href: "/admin/users/signup-codes", label: "Signup Codes", icon: Ticket },
  { href: "/admin/storefronts", label: "Storefronts", icon: Store, badge: true },
  { href: "/admin/custom-storefront", label: "data-deals Store", icon: Globe },
  { href: "/admin/storefronts/withdrawals", label: "Withdrawals", icon: Banknote, badge: true },
  { href: "/admin/packages", label: "Packages", icon: Package },
  { href: "/admin/pricing", label: "Pricing", icon: Receipt },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/api", label: "API", icon: BookOpen },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

export function isActive(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/admin" || href === "/admin/storefronts") return pathname === href;
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

export interface NavBadgeData {
  count: number;
  label?: string;
  variant?: "brand" | "warning" | "danger";
}

/** Hook to fetch and synchronize navigation badge counters for both admin and regular users. */
export function useNavBadges(admin?: boolean): Record<string, NavBadgeData> {
  const pathname = usePathname();
  const isAdmin = admin ?? pathname.startsWith("/admin");
  const [badges, setBadges] = React.useState<Record<string, NavBadgeData>>({});

  const refresh = React.useCallback(async () => {
    try {
      if (isAdmin) {
        const res = await fetch("/api/admin/nav-counts", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setBadges({
            "/admin/orders": {
              count: typeof data.pendingOrders === "number" ? data.pendingOrders : 0,
              label: "pending orders",
              variant: "warning",
            },
            "/admin/delivery-reports": {
              count: typeof data.underReviewReports === "number" ? data.underReviewReports : 0,
              label: "under review",
              variant: "danger",
            },
            "/admin/storefronts/withdrawals": {
              count: typeof data.pendingWithdrawals === "number" ? data.pendingWithdrawals : 0,
              label: "pending withdrawals",
              variant: "warning",
            },
            "/admin/storefronts": {
              count: typeof data.pendingWithdrawals === "number" ? data.pendingWithdrawals : 0,
              label: "pending withdrawals",
              variant: "warning",
            },
          });
        }
      } else {
        const res = await fetch("/api/orders?pageSize=1", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setBadges({
            "/dashboard/orders": {
              count: typeof data.total === "number" ? data.total : 0,
              label: "orders",
              variant: "brand",
            },
          });
        }
      }
    } catch {
      // ignore network errors
    }
  }, [isAdmin]);

  React.useEffect(() => {
    refresh();

    const interval = setInterval(refresh, 30000); // 30s background poll
    const onUpdate = () => refresh();

    window.addEventListener("nav-counts-update", onUpdate);
    window.addEventListener("focus", onUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("nav-counts-update", onUpdate);
      window.removeEventListener("focus", onUpdate);
    };
  }, [refresh]);

  return badges;
}

/** Legacy hook kept for backward compatibility */
export function useSentOrdersCount() {
  const badges = useNavBadges(false);
  return badges["/dashboard/orders"]?.count ?? null;
}

export function TopTabs({
  items,
  admin,
  className,
}: {
  items: NavItem[];
  admin?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const isAdmin = admin ?? pathname.startsWith("/admin");
  const badges = useNavBadges(isAdmin);
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
          const badge = badges[item.href];
          const hasCount = item.badge && badge && badge.count > 0;

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
              {hasCount && (
                <span
                  className={cn(
                    "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white shadow-xs transition-transform",
                    badge.variant === "danger"
                      ? "bg-rose-500 ring-2 ring-rose-300 dark:ring-rose-950 animate-pulse"
                      : badge.variant === "warning"
                      ? "bg-amber-500 ring-2 ring-amber-300 dark:ring-amber-950"
                      : "bg-violet-500 ring-2 ring-white dark:ring-[#0a1120]"
                  )}
                  title={`${badge.count} ${badge.label ?? ""}`}
                >
                  {badge.count > 999 ? `${Math.floor(badge.count / 1000)}k` : badge.count}
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

export function MobileAppNav({
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
  const badges = useNavBadges(currentIsAdmin);
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const quickTabsRef = React.useRef<HTMLDivElement>(null);

  // Close drawer and clear pending status when route changes
  React.useEffect(() => {
    setIsOpen(false);
    setSearchQuery("");
    setPendingHref(null);
  }, [pathname]);

  // Lock body scroll when mobile sheet is open
  React.useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Scroll active tab into view horizontally in the quick pill strip
  React.useEffect(() => {
    const container = quickTabsRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>('[aria-current="page"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [pathname]);

  const currentItem = items.find((i) => isActive(pathname, i.href)) ?? items[0];
  const CurrentIcon = currentItem?.icon ?? Compass;
  const currentBadge = currentItem ? badges[currentItem.href] : undefined;

  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, searchQuery]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Interactive Trigger Button — replaces the browser native select */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex h-10.5 flex-1 items-center gap-2.5 rounded-2xl border border-brand-500/35 bg-white/95 px-3 shadow-2xs backdrop-blur-xs transition-all hover:border-brand-500 hover:shadow-xs active:scale-[0.99] dark:border-brand-400/30 dark:bg-[#0d1526]/95"
          aria-label="Open page navigation menu"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600/15 to-violet-600/15 text-brand-600 transition-colors group-hover:from-brand-600/25 group-hover:to-violet-600/25 dark:bg-brand-400/15 dark:text-brand-300">
            <CurrentIcon className="h-4 w-4" />
          </div>

          <div className="flex flex-1 min-w-0 items-center gap-1.5 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Page:
            </span>
            <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
              {currentItem?.label ?? "Navigation"}
            </span>
            {currentBadge && currentBadge.count > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-extrabold text-white">
                {currentBadge.count > 999 ? `${Math.floor(currentBadge.count / 1000)}k` : currentBadge.count}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
            <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400">Browse All</span>
            <ChevronDown className="h-4 w-4 text-brand-600 transition-transform group-hover:translate-y-0.5 dark:text-brand-400" />
          </div>
        </button>
      </div>

      {/* Swipeable Quick-Access Navigation Pills */}
      <div
        ref={quickTabsRef}
        className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 touch-pan-x"
        aria-label="Quick Navigation"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const badge = badges[item.href];
          const hasCount = item.badge && badge && badge.count > 0;
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
                "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-all active:scale-95",
                active
                  ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-xs shadow-blue-600/30 font-bold"
                  : isPending
                  ? "bg-slate-200/80 text-slate-900 animate-pulse dark:bg-white/15 dark:text-white"
                  : "border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              )}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              ) : (
                <item.icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    active ? "text-white" : "text-slate-400 dark:text-slate-500"
                  )}
                />
              )}
              <span>{item.label}</span>
              {hasCount && (
                <span
                  className={cn(
                    "ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums",
                    active
                      ? "bg-white/25 text-white"
                      : badge.variant === "danger"
                      ? "bg-rose-500 text-white"
                      : badge.variant === "warning"
                      ? "bg-amber-500 text-white"
                      : "bg-violet-600 text-white"
                  )}
                >
                  {badge.count > 999 ? `${Math.floor(badge.count / 1000)}k` : badge.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Custom Bottom Sheet Navigation Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Bottom Sheet Modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
            className="relative z-50 flex max-h-[85vh] w-full flex-col rounded-t-[28px] border-t border-slate-200/80 bg-white shadow-2xl transition-all animate-in slide-in-from-bottom duration-300 dark:border-white/10 dark:bg-[#0c1322]"
          >
            {/* Grab Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 dark:border-white/5">
              <div>
                <div className="flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {currentIsAdmin ? "Admin Navigation" : "Dashboard Menu"}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {items.length} pages available
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close navigation"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 active:scale-95 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Filter */}
            {items.length > 5 && (
              <div className="px-5 pt-3 pb-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter pages…"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-brand-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label="Clear filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable Page List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 no-scrollbar overscroll-contain">
              {filteredItems.map((item) => {
                const active = isActive(pathname, item.href);
                const badge = badges[item.href];
                const hasCount = item.badge && badge && badge.count > 0;
                const isPending = pendingHref === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setPendingHref(item.href);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl p-2.5 transition-all active:scale-[0.98]",
                      active
                        ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/25 font-semibold"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        active
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400"
                      )}
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <item.icon className="h-4 w-4" />
                      )}
                    </div>

                    <span className="flex-1 truncate text-xs font-semibold">
                      {item.label}
                    </span>

                    {hasCount && (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold shadow-2xs tabular-nums",
                          active
                            ? "bg-white/25 text-white ring-1 ring-white/30 backdrop-blur-xs"
                            : badge.variant === "danger"
                            ? "bg-rose-500 text-white"
                            : badge.variant === "warning"
                            ? "bg-amber-500 text-white"
                            : "bg-violet-600 text-white"
                        )}
                      >
                        {badge.count > 9999
                          ? `${Math.floor(badge.count / 1000)}k`
                          : badge.count.toLocaleString()}
                      </span>
                    )}

                    {active && <Check className="h-4 w-4 shrink-0 text-white ml-1" />}
                  </Link>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No matching pages found for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>

            {/* Portal Switcher Footer (Staff) */}
            {isAdminRole && (
              <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                <Link
                  href={currentIsAdmin ? "/dashboard/send" : "/admin"}
                  onClick={() => setIsOpen(false)}
                  className="flex h-10.5 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-xs font-bold text-white shadow-sm transition hover:opacity-90 active:scale-98"
                >
                  <span>
                    {currentIsAdmin
                      ? "⚡ Switch to User Dashboard"
                      : "🛡️ Open Admin Panel"}
                  </span>
                  <span className="text-xs">↗</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Backward compatibility alias
export const MobileSelectNav = MobileAppNav;

export function NavStyleToggle({
  mode,
  onToggle,
  className,
}: {
  mode: "top" | "sidebar";
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/90 px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
        className
      )}
      title={mode === "sidebar" ? "Switch to Top Tabs navigation" : "Switch to Sidebar navigation"}
      aria-label={mode === "sidebar" ? "Switch to Top Tabs navigation" : "Switch to Sidebar navigation"}
    >
      {mode === "sidebar" ? (
        <>
          <PanelTop className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
          <span>Top Tabs</span>
        </>
      ) : (
        <>
          <PanelLeft className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
          <span>Sidebar Nav</span>
        </>
      )}
    </button>
  );
}

export function SidebarNav({
  items,
  admin,
  collapsed,
  onToggleCollapse,
  onSwitchToTopTabs,
  className,
}: {
  items: NavItem[];
  admin?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSwitchToTopTabs?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const isAdmin = admin ?? pathname.startsWith("/admin");
  const badges = useNavBadges(isAdmin);
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  React.useEffect(() => {
    if (!pendingHref) return;
    const timer = setTimeout(() => setPendingHref(null), 8000);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  return (
    <aside
      className={cn(
        "hidden sm:flex flex-col shrink-0 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto no-scrollbar border-r border-slate-200/70 bg-white/70 backdrop-blur-md dark:border-white/5 dark:bg-[#0a1120]/70 py-4 transition-all duration-200 ease-in-out z-30",
        collapsed ? "w-18 px-2" : "w-64 px-3.5",
        className
      )}
      aria-label="Sidebar navigation"
    >
      {/* Header: NAVIGATION label & Collapse Toggle */}
      <div
        className={cn(
          "mb-3 flex items-center pt-0.5 pb-2 border-b border-slate-200/60 dark:border-white/5",
          collapsed ? "justify-center" : "justify-between px-1.5"
        )}
      >
        {!collapsed && (
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Navigation
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100/70 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-200 hover:text-slate-900 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          title={collapsed ? "Expand sidebar (>>)" : "Collapse sidebar (<<)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Navigation items list */}
      <nav className="flex-1 space-y-1" aria-label="Sidebar">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const isPending = pendingHref === item.href;
          const badge = badges[item.href];
          const hasCount = item.badge && badge && badge.count > 0;

          if (collapsed) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={`${item.label}${hasCount ? ` (${badge.count.toLocaleString()})` : ""}`}
                onClick={(e) => {
                  if (active) return;
                  if (pendingHref) {
                    e.preventDefault();
                    return;
                  }
                  setPendingHref(item.href);
                }}
                className={cn(
                  "group relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150",
                  active
                    ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/25"
                    : isPending
                    ? "bg-slate-200/80 text-slate-900 opacity-90 animate-pulse dark:bg-white/15 dark:text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                )}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
                ) : (
                  <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                )}
                {hasCount && (
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-2xs tabular-nums ring-2 ring-white dark:ring-[#0a1120]",
                      badge.variant === "danger"
                        ? "bg-rose-500 animate-pulse"
                        : badge.variant === "warning"
                        ? "bg-amber-500"
                        : "bg-violet-600"
                    )}
                  >
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                )}
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={(e) => {
                if (active) return;
                if (pendingHref) {
                  e.preventDefault();
                  return;
                }
                setPendingHref(item.href);
              }}
              className={cn(
                "group flex h-9.5 items-center gap-2.5 rounded-xl px-3 text-xs font-semibold transition-all duration-150",
                active
                  ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/25"
                  : isPending
                  ? "bg-slate-200/80 text-slate-900 opacity-90 animate-pulse dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              )}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              ) : (
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                    active
                      ? "text-white"
                      : "text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white"
                  )}
                />
              )}
              <span className="truncate">{item.label}</span>
              {hasCount && (
                <span
                  className={cn(
                    "ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold shadow-2xs tabular-nums transition-transform",
                    active
                      ? "bg-white/25 text-white ring-1 ring-white/30 backdrop-blur-xs"
                      : badge.variant === "danger"
                      ? "bg-rose-500 text-white ring-2 ring-rose-300 dark:ring-rose-950 animate-pulse"
                      : badge.variant === "warning"
                      ? "bg-amber-500 text-white ring-2 ring-amber-300 dark:ring-amber-950"
                      : "bg-violet-600 text-white ring-2 ring-violet-200 dark:ring-violet-950"
                  )}
                  title={`${badge.count} ${badge.label ?? ""}`}
                >
                  {badge.count > 9999 ? `${Math.floor(badge.count / 1000)}k` : badge.count.toLocaleString()}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Optional switch to Top Tabs at bottom of expanded sidebar */}
      {!collapsed && onSwitchToTopTabs && (
        <div className="mt-auto pt-3 border-t border-slate-200/60 dark:border-white/5">
          <button
            type="button"
            onClick={onSwitchToTopTabs}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-2 text-[11px] font-medium text-slate-500 transition-all hover:border-brand-500/40 hover:bg-brand-50/50 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-brand-400/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
            title="Switch to Top Tabs view"
          >
            <PanelTop className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            <span>Switch to Top Tabs</span>
          </button>
        </div>
      )}
    </aside>
  );
}

