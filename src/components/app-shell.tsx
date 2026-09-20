"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Lock, LogOut, MessageCircle, Signal, Wallet, Plus } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useToast } from "@/components/toast";
import {
  ThemeToggle,
  TopTabs,
  MobileSelectNav,
  adminNav,
  userNav,
  resolveNavIcon,
  type NavItem,
  type ExtraNavItem,
} from "@/components/app-nav";
import { formatGHS, type AuthUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SystemChatWidget } from "@/components/chat/system-chat-widget";

/** Seconds elapsed since the last user interaction (mouse, key, scroll, touch). */
function useIdleSeconds() {
  const [idle, setIdle] = React.useState(0);
  React.useEffect(() => {
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(
      () => setIdle(Math.floor((Date.now() - last) / 1000)),
      1000
    );
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
  }, []);
  return idle;
}

function IdleIndicator({ idle }: { idle: number }) {
  const active = idle < 5;
  return (
    <div
      className="hidden h-7 shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-500 md:flex dark:bg-white/5 dark:text-slate-400"
      title={active ? "You are active" : `Idle for ~${idle}s`}
    >
      <Signal
        className={cn(
          "h-3.5 w-3.5",
          active ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"
        )}
      />
      {active ? "Active" : `Idle ~${idle}s`}
    </div>
  );
}

/** Global announcement banner — slides in from the right, fades into the left and repeats */
function AnnouncementBar({ text }: { text: string }) {
  return (
    <div
      className="banner-container relative z-30 overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-700 py-2 border-b border-blue-400/20 shadow-sm"
      role="region"
      aria-label="Platform Announcement"
    >
      <div className="relative flex w-full overflow-hidden">
        <div className="animate-banner-slide py-0.5 text-xs sm:text-sm font-bold tracking-wide text-white">
          <span className="inline-flex items-center gap-2 px-6">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wider font-extrabold text-amber-300">
              Notice
            </span>
            <span>{text}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Avatar({ user, className }: { user: AuthUser; className?: string }) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-[10px] font-bold text-white",
        className
      )}
    >
      {initials}
    </span>
  );
}

function RoleBadge({ role, className }: { role: string; className?: string }) {
  const label = role.charAt(0) + role.slice(1).toLowerCase();
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400",
        className
      )}
    >
      {label}
    </span>
  );
}

export function AppShell({
  user,
  children,
  admin,
  announcement,
  extraNavItems,
  supportWhatsapp,
  supportPhone,
  supportTelegram,
  supportEmail,
  footerText,
  allowedNavHrefs,
}: {
  user: AuthUser;
  children: React.ReactNode;
  admin?: boolean;
  announcement?: string | null;
  /** Additional items (e.g. gated "My Storefront") appended to the base nav.
   *  Must be plain data — icon components can't cross the RSC boundary. */
  extraNavItems?: ExtraNavItem[];
  supportWhatsapp?: string;
  supportPhone?: string;
  supportTelegram?: string;
  supportEmail?: string;
  footerText?: string;
  allowedNavHrefs?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const idle = useIdleSeconds();
  // Resolve string icon names into actual components here, client-side.
  const resolvedExtras: NavItem[] = (extraNavItems ?? []).map((item) => ({
    ...item,
    icon: resolveNavIcon(item.icon),
  }));
  let userItems: NavItem[] = [];
  if (!admin) {
    const sendOrder = userNav.find((i) => i.href === "/dashboard/send");
    const sentOrders = userNav.find((i) => i.href === "/dashboard/orders");
    const notReceived = userNav.find((i) => i.href === "/dashboard/not-received");
    const billing = userNav.find((i) => i.href === "/dashboard/billing");
    const mtn = userNav.find((i) => i.href === "/dashboard/mtn-verification");
    const api = userNav.find((i) => i.href === "/dashboard/api");
    const others = userNav.filter(
      (i) =>
        ![
          "/dashboard/send",
          "/dashboard/orders",
          "/dashboard/not-received",
          "/dashboard/billing",
          "/dashboard/mtn-verification",
          "/dashboard/api",
        ].includes(i.href)
    );

    userItems = [
      sendOrder,
      sentOrders,
      notReceived,
      billing,
      ...resolvedExtras,
      mtn,
      api,
      ...others,
    ].filter(Boolean) as NavItem[];
  }
  const pathname = usePathname();
  const [balance, setBalance] = React.useState<number>(user.balance ?? 0);

  React.useEffect(() => {
    setBalance(user.balance ?? 0);
  }, [user.balance]);

  React.useEffect(() => {
    let isMounted = true;
    const refreshBalance = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.user && typeof data.user.balance === "number") {
            setBalance(data.user.balance);
          }
        }
      } catch {}
    };

    refreshBalance();

    const handleCustomUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ balance?: number }>;
      if (customEvent.detail && typeof customEvent.detail.balance === "number") {
        setBalance(customEvent.detail.balance);
      } else {
        refreshBalance();
      }
    };

    window.addEventListener("balance-update", handleCustomUpdate);
    window.addEventListener("focus", refreshBalance);

    return () => {
      isMounted = false;
      window.removeEventListener("balance-update", handleCustomUpdate);
      window.removeEventListener("focus", refreshBalance);
    };
  }, [pathname]);

  let adminItems = adminNav;
  if (admin && user.role === "SECRETARY" && allowedNavHrefs && allowedNavHrefs.length > 0) {
    adminItems = adminNav.filter((i) => allowedNavHrefs.includes(i.href) || i.href === "/admin");
  }
  const isSecretaryRestricted = Boolean(
    admin &&
      user.role === "SECRETARY" &&
      allowedNavHrefs &&
      allowedNavHrefs.length > 0 &&
      pathname !== "/admin" &&
      !allowedNavHrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`))
  );
  const items: NavItem[] = admin ? adminItems : userItems;
  const desktopItems = items.filter((i) => !i.mobileOnly);

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    toast("Signed out", "info");
    router.push("/login");
    router.refresh();
  };

  const isStaffRole = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "SECRETARY";

  return (
    <div className="app-bg flex min-h-screen flex-col">
      {announcement && <AnnouncementBar text={announcement} />}

      {/* Top header */}
      <header className="border-b border-slate-200/70 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-[#0a1120]/95">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2.5 px-4 sm:px-6">
          <BrandLogo href={admin ? "/admin" : "/dashboard/send"} size="sm" />

          <IdleIndicator idle={idle} />

          <div className="hidden items-center gap-1.5 sm:flex">
            <ThemeToggle />
            <button
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-7 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <Lock className="h-4 w-4" />
            </button>
          </div>

          {isStaffRole && (
            <Link
              href={admin ? "/dashboard/send" : "/admin"}
              className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-brand-500/25 bg-brand-500/10 px-2 text-[11px] font-bold text-brand-600 transition hover:bg-brand-500/20 sm:px-2.5 dark:border-brand-400/30 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
              title={admin ? "Switch to User Dashboard view" : "Switch to Admin Panel"}
            >
              <span>{admin ? "User View" : "Admin Panel"}</span>
              <span className="text-[10px]">↗</span>
            </Link>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
          </div>

          {/* Desktop Available Balance & Subtle Top Up (User Dashboard) */}
          {!admin && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50 px-1 py-1 text-xs dark:border-white/10 dark:bg-white/5">
              <Link
                href="/dashboard/billing"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
                title="View wallet & billing"
              >
                <Wallet className="h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-400" />
                <span className="font-bold tabular-nums text-slate-900 dark:text-white">{formatGHS(balance)}</span>
              </Link>
              <Link
                href="/dashboard/billing"
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-700 active:scale-95 dark:bg-brand-500 dark:hover:bg-brand-600"
                title="Top up wallet balance"
              >
                <Plus className="h-3 w-3 stroke-[2.5]" />
                <span>Top up</span>
              </Link>
            </div>
          )}

          <Link
            href={admin ? "/admin/settings" : "/dashboard/profile"}
            title={admin ? "Account settings" : "My profile"}
            className="hidden min-w-0 items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-2.5 transition-shadow hover:ring-2 hover:ring-brand-500/30 sm:flex dark:bg-white/5"
          >
            <Avatar user={user} className="h-7 w-7" />
            <span className="max-w-[160px] truncate text-sm font-semibold">{user.name}</span>
            <RoleBadge role={user.role} />
          </Link>
        </div>
      </header>

      {/* Desktop top-tab navigation (sticks to the top once the header scrolls away) */}
      <div className="hidden sm:block z-40 border-b border-slate-200/70 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-[#0a1120]/95 lg:sticky lg:top-0">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
          <TopTabs items={desktopItems} className="py-2" />
        </div>
      </div>

      {/* Mobile: user pill row + balance card + page select */}
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-3 sm:hidden">
        <div className="flex items-center gap-2">
          <Link
            href={admin ? "/admin/settings" : "/dashboard/profile"}
            title={admin ? "Account settings" : "My profile"}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-2 shadow-xs transition-shadow hover:ring-2 hover:ring-brand-500/30 dark:border-white/10 dark:bg-white/5"
          >
            <Avatar user={user} className="h-7 w-7 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{user.name}</span>
            <RoleBadge role={user.role} className="mr-1 shrink-0" />
          </Link>

          {isStaffRole && (
            <Link
              href={admin ? "/dashboard/send" : "/admin"}
              title={admin ? "Switch to User Dashboard" : "Switch to Admin Panel"}
              className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-brand-500/30 bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95"
            >
              <span>{admin ? "User" : "Admin"}</span>
              <span className="text-[11px]">↗</span>
            </Link>
          )}

          <button
            onClick={onLogout}
            aria-label="Sign out"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xs transition-colors hover:text-red-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile Balance & Top-up bar */}
        {!admin && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2 shadow-xs backdrop-blur dark:border-white/10 dark:bg-[#0f172a]/90">
            <Link
              href="/dashboard/billing"
              className="flex min-w-0 items-center gap-2.5 transition hover:opacity-80"
              title="View wallet & billing"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:bg-brand-400/15 dark:text-brand-300">
                <Wallet className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Available Balance
                </div>
                <div className="truncate text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatGHS(balance)}
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/billing"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 text-xs font-semibold text-brand-600 transition active:scale-95 hover:bg-brand-500/20 dark:border-brand-400/30 dark:bg-brand-500/15 dark:text-brand-300"
              title="Top up wallet"
            >
              <Plus className="h-3 w-3 stroke-[2.5]" />
              <span>Top up</span>
            </Link>
          </div>
        )}
        <MobileSelectNav
          items={items}
          isAdminRole={user.role === "ADMIN" || user.role === "MANAGER"}
          currentIsAdmin={admin}
          className="pt-3"
        />
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 pb-20 sm:px-6 sm:py-6 sm:pb-24">
        {isSecretaryRestricted ? (
          <div className="mx-auto my-16 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
            <Lock className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400" />
            <h2 className="mt-3 text-base font-bold text-amber-900 dark:text-amber-200">Page Access Restricted</h2>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Your account does not have access permissions for this section. Please contact the system administrator if you need access.
            </p>
            <Link
              href="/admin"
              className="mt-5 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-brand-700"
            >
              Return to Admin Overview
            </Link>
          </div>
        ) : (
          children
        )}
      </main>

      <footer className="mt-4 border-t border-slate-200/70 py-4 text-center text-xs text-slate-400 dark:border-white/5 space-y-2">
        <div>{footerText || "Tskconnect © 2026"}</div>
        <div className="flex justify-center gap-4 text-[11px]">
          {supportPhone && <span>Support: {supportPhone}</span>}
          {supportTelegram && <span>Telegram: {supportTelegram}</span>}
          {supportEmail && <span>Email: {supportEmail}</span>}
        </div>
      </footer>
      <SystemChatWidget user={user} />
    </div>
  );
}
