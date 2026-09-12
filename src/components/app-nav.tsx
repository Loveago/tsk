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
  FileWarning,
  FileSpreadsheet,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  { href: "/dashboard/not-received", label: "Not Received", icon: FileWarning },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/packages", label: "Packages", icon: Package },
  { href: "/dashboard/billing", label: "Billing", icon: Receipt },
  { href: "/dashboard/api", label: "API", icon: BookOpen },
  { href: "/dashboard/profile", label: "Profile", icon: User, mobileOnly: true },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/exports", label: "Exports", icon: FileSpreadsheet },
  { href: "/admin/delivery-reports", label: "Not Received", icon: FileWarning },
  { href: "/admin/users", label: "Users", icon: Users },
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

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const resolved = mounted ? (theme ?? "system") : "system";
  const next = resolved === "light" ? "dark" : resolved === "dark" ? "system" : "light";
  const Icon = resolved === "light" ? Sun : resolved === "dark" ? Moon : Monitor;

  return (
    <button
      onClick={() => mounted && setTheme(next)}
      title={`Theme: ${resolved} — click for ${next}`}
      aria-label={`Switch theme (current: ${resolved})`}
      className="flex h-7 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm shadow-violet-600/30 transition-colors hover:bg-violet-500"
    >
      <Icon className="h-3.5 w-3.5" />
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
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 xl:h-8.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 xl:px-3 text-xs xl:text-[13px] font-semibold transition-all",
                active
                  ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/25"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
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

export function MobileSelectNav({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = items.find((i) => isActive(pathname, i.href))?.href ?? "";

  return (
    <div className={cn("relative", className)}>
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        aria-label="Navigate to page"
        className="h-10 w-full appearance-none rounded-lg border-2 border-brand-500 bg-white px-3 pr-9 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-[#0d1526] dark:text-slate-100"
      >
        {items.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
    </div>
  );
}
