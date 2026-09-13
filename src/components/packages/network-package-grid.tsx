"use client";

import * as React from "react";
import { Signal } from "lucide-react";
import { PriceMask } from "@/components/price-mask";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";
import { cn } from "@/lib/utils";
import { formatGHS } from "@/lib/types";

export interface Pkg {
  id: string;
  name: string;
  gbAmount: number;
  price: number | null;
}

export interface PackageGroup {
  network: string;
  packages: Pkg[];
}

const NETWORK_META: Record<
  string,
  { label: string; dot: string; icon: string; card: string; pill: string }
> = {
  MTN: {
    label: "MTN",
    dot: "bg-yellow-400",
    icon: "from-yellow-400 to-amber-500 text-yellow-950",
    card: "hover:border-yellow-400/70 dark:hover:border-yellow-400/40",
    pill: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  },
  TELECEL: {
    label: "Telecel",
    dot: "bg-red-500",
    icon: "from-red-500 to-rose-600 text-white",
    card: "hover:border-red-400/70 dark:hover:border-red-400/40",
    pill: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  AIRTELTIGO: {
    label: "AirtelTigo",
    dot: "bg-blue-500",
    icon: "from-blue-500 to-indigo-600 text-white",
    card: "hover:border-blue-400/70 dark:hover:border-blue-400/40",
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
};

function meta(network: string) {
  return (
    NETWORK_META[network] ?? {
      label: network,
      dot: "bg-slate-400",
      icon: "from-slate-400 to-slate-600 text-white",
      card: "",
      pill: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    }
  );
}

export function NetworkPackageGrid({ groups }: { groups: PackageGroup[] }) {
  const [active, setActive] = React.useState<string>("ALL");
  const allCount = groups.reduce((n, g) => n + g.packages.length, 0);
  const visible = active === "ALL" ? groups : groups.filter((g) => g.network === active);

  return (
    <div className="space-y-5">
      {/* Network filter pills */}
      <div className="w-full flex justify-center">
        <ScrollableTabs
          tabs={[
            { key: "ALL", label: "All Networks", badge: allCount },
            ...groups.map((g) => ({
              key: g.network,
              label: meta(g.network).label,
              badge: g.packages.length,
            })),
          ]}
          activeTab={active}
          onChange={setActive}
          className="max-w-xl mx-auto"
        />
      </div>

      {visible.map((group) => {
        const m = meta(group.network);
        return (
          <section
            key={group.network}
            className="rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/5 dark:bg-[#0d1526]"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-black",
                  m.icon
                )}
              >
                {m.label.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold">{m.label} Packages</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {group.packages.length} bundle{group.packages.length === 1 ? "" : "s"} available
                </p>
              </div>
              <span
                className={cn(
                  "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
                  m.pill
                )}
              >
                <Signal className="h-3 w-3" /> {m.label} network
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {group.packages.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "relative rounded-xl border border-slate-200/70 bg-slate-50/60 p-3.5 text-center transition-colors dark:border-white/5 dark:bg-white/[0.03]",
                    m.card
                  )}
                >
                  <span
                    className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
                    title="Available"
                  />
                  <p className="text-xl font-black tracking-tight">{p.gbAmount} GB</p>
                  <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {p.name}
                  </p>
                  <div className="mt-2.5 border-t border-dashed border-slate-200 pt-2.5 dark:border-white/10">
                    {p.price != null ? (
                      <div className="text-center">
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {formatGHS(p.price)}
                        </p>
                        <p className="text-[10px] text-slate-400">per bundle</p>
                      </div>
                    ) : (
                      <PriceMask label="per bundle" className="text-center" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {allCount === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          No packages available yet — please contact support.
        </p>
      )}
    </div>
  );
}

function FilterPill({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
        active
          ? "border-transparent bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/25"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-brand-400"
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-white" : dot)} />}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px]",
          active ? "bg-white/20" : "bg-slate-100 dark:bg-white/10"
        )}
      >
        {count}
      </span>
    </button>
  );
}