"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, Lock, LogOut, MessageCircle, Signal } from "lucide-react";
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
import type { AuthUser } from "@/lib/types";
import { cn } from "@/lib/utils";

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

/** Scrolling announcement strip — mobile only, as per the reference design. */
function AnnouncementBar({ text }: { text: string }) {
  return (
    <div
      className="overflow-hidden bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 lg:hidden"
      aria-hidden
    >
      <div className="animate-marquee flex w-max whitespace-nowrap py-1.5 text-[11px] font-bold tracking-wide text-white">
        <span className="pr-10">{text}</span>
        <span className="pr-10">{text}</span>
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
}: {
  user: AuthUser;
  children: React.ReactNode;
  admin?: boolean;
  announcement?: string | null;
  /** Additional items (e.g. gated "My Storefront") appended to the base nav.
   *  Must be plain data — icon components can't cross the RSC boundary. */
  extraNavItems?: ExtraNavItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const idle = useIdleSeconds();
  // Resolve string icon names into actual components here, client-side.
  const resolvedExtras: NavItem[] = (extraNavItems ?? []).map((item) => ({
    ...item,
    icon: resolveNavIcon(item.icon),
  }));
  const items: NavItem[] = admin ? adminNav : [...userNav, ...resolvedExtras];
  const desktopItems = items.filter((i) => !i.mobileOnly);

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    toast("Signed out", "info");
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="app-bg flex min-h-screen flex-col">
      {announcement && <AnnouncementBar text={announcement} />}

      {/* Top header */}
      <header className="border-b border-slate-200/70 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-[#0a1120]/95">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2.5 px-4 sm:px-6">
          <Link href={admin ? "/admin" : "/dashboard/send"} className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-md shadow-blue-600/30">
              <Database className="h-4.5 w-4.5" />
            </span>
            <span className="text-base font-bold tracking-tight">Clickyfied</span>
          </Link>

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

          {(user.role === "ADMIN" || user.role === "MANAGER") && (
            <Link
              href={admin ? "/dashboard/send" : "/admin"}
              className="hidden h-7 shrink-0 items-center gap-1 rounded-full border border-brand-500/25 bg-brand-500/10 px-2.5 text-[11px] font-bold text-brand-600 transition hover:bg-brand-500/20 sm:flex dark:border-brand-400/30 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
              title={admin ? "Switch to User Dashboard view" : "Switch to Admin Panel"}
            >
              <span>{admin ? "User View" : "Admin Panel"}</span>
              <span className="text-[10px]">↗</span>
            </Link>
          )}

          <div className="flex-1" />

          <div className="flex items-center sm:hidden">
            <ThemeToggle />
          </div>

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

      {/* Mobile: user pill row + page select */}
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-3 sm:hidden">
        <div className="flex items-center gap-2">
          <Link
            href={admin ? "/admin/settings" : "/dashboard/profile"}
            title={admin ? "Account settings" : "My profile"}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-1.5 shadow-sm transition-shadow hover:ring-2 hover:ring-brand-500/30 dark:border-white/10 dark:bg-white/5"
          >
            <Avatar user={user} className="h-7 w-7" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{user.name}</span>
            <RoleBadge role={user.role} className="mr-1.5" />
          </Link>
          <button
            onClick={onLogout}
            aria-label="Sign out"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-red-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <MobileSelectNav items={items} className="pt-3" />
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 pb-20 sm:px-6 sm:py-6 sm:pb-24">{children}</main>

      <footer className="mt-4 border-t border-slate-200/70 py-4 text-center text-xs text-slate-400 dark:border-white/5">
        Clickyfied4u © 2026
      </footer>

      {/* Floating support chat — bottom left, as per the reference design */}
      <a
        href="https://wa.me/233000000000"
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with support on WhatsApp"
        className="fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-600/30 transition-transform hover:scale-105"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-[#060b16]" />
      </a>
    </div>
  );
}
