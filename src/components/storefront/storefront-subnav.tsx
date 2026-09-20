"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Package, Settings, Wallet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SUBNAV_ITEMS = [
  { href: "/dashboard/storefront", label: "Overview", icon: Store, exact: true },
  { href: "/dashboard/storefront/products", label: "Products & Pricing", icon: Package },
  { href: "/dashboard/storefront/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/storefront/wallet", label: "Wallet & Payouts", icon: Wallet },
];

export function StorefrontSubnav() {
  const pathname = usePathname();
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
    <div className="border-b border-slate-200/80 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-[#0b1120]">
      <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto py-2">
        {SUBNAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isPending = pendingHref === item.href;
          const Icon = item.icon;

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
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all",
                active
                  ? "bg-violet-600 text-white shadow-xs"
                  : isPending
                  ? "bg-slate-200/80 text-slate-900 opacity-90 animate-pulse dark:bg-white/15 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              )}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
