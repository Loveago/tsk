"use client";

import * as React from "react";
import Link from "next/link";
import { Spinner } from "@/components/shared";
import { formatGHS } from "@/lib/types";
import { ArrowRight } from "lucide-react";

interface NetworkStat {
  network: string;
  pending: number;
  pendingGb: number;
  pendingAmount: number;
  processing: number;
  failed: number;
  successToday: number;
  activeBatches: number;
}

export function NetworkStatsCards() {
  const [stats, setStats] = React.useState<NetworkStat[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/network-stats");
        const json = await res.json();
        if (res.ok) setStats(json.stats ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-100 bg-white py-10 dark:border-slate-800 dark:bg-slate-900">
        <Spinner className="h-5 w-5 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Network operations</h2>
        <Link
          href="/admin/exports"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Export Center <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.network}
            className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#0d1526]"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold tracking-wide">{s.network}</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10">
                {s.activeBatches} active
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{s.pending}</p>
                <p className="text-[11px] text-slate-500">pending</p>
              </div>
              <div>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{s.processing}</p>
                <p className="text-[11px] text-slate-500">processing</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{s.failed}</p>
                <p className="text-[11px] text-slate-500">failed</p>
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{s.successToday}</p>
                <p className="text-[11px] text-slate-500">today</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Queue value {s.pendingGb} GB · {formatGHS(s.pendingAmount)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}